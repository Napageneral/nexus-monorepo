package main

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
	core "github.com/nexus-project/github/internal/gitadapter"
)

type monitorCycleResult struct {
	CooldownDuration time.Duration
	RateLimitedRepo  string
}

func runMonitorCycle(ctx context.Context, accountID string, provider Provider, config AccountConfig, store WatermarkStore, emit nexadapter.EmitFunc) (monitorCycleResult, error) {
	for _, repo := range config.Repositories {
		if err := syncRepository(ctx, accountID, provider, config, repo, store, emit); err != nil {
			if result, ok := rateLimitResult(config, repo, err); ok {
				nexadapter.LogInfo(
					"monitor rate limited for account=%s provider=%s repo=%s cooldown_ms=%d",
					accountID,
					provider.ID(),
					repo.FullName,
					result.CooldownDuration.Milliseconds(),
				)
				return result, nil
			}
			nexadapter.LogError("repo sync failed for %s: %v", repo.FullName, err)
			continue
		}
	}
	return monitorCycleResult{}, nil
}

func syncRepository(ctx context.Context, accountID string, provider Provider, config AccountConfig, repo Repository, store WatermarkStore, emit nexadapter.EmitFunc) error {
	commitsWatermarkName := repo.FullName + ":commits"
	commitSince, _ := readWatermarkTime(store, accountID, commitsWatermarkName)
	commitRepo := ingestCommitScopeRepository(repo)
	commits, err := provider.GetCommits(ctx, config, commitRepo, commitSince)
	if err != nil {
		return err
	}
	sort.Slice(commits, func(i, j int) bool { return commits[i].Timestamp < commits[j].Timestamp })
	var latestCommitTime int64
	var latestCommitSHA string
	for _, commit := range commits {
		diff, err := provider.GetCommitDiff(ctx, config, repo, commit.SHA)
		if err != nil {
			return err
		}
		emit(buildCommitEvent(accountID, provider, repo, commit, diff))
		if commit.Timestamp >= latestCommitTime {
			latestCommitTime = commit.Timestamp
			latestCommitSHA = commit.SHA
		}
	}
	if latestCommitTime > 0 {
		if err := store.Set(accountID, commitsWatermarkName, latestCommitTime, latestCommitSHA); err != nil {
			return err
		}
	}

	prWatermarkName := repo.FullName + ":pull_requests"
	prSince, _ := readWatermarkTime(store, accountID, prWatermarkName)
	prs, err := provider.GetPullRequests(ctx, config, repo, prSince)
	if err != nil {
		return err
	}
	sort.Slice(prs, func(i, j int) bool { return prs[i].UpdatedAt < prs[j].UpdatedAt })
	var latestPRTime int64
	for _, pr := range prs {
		diff, err := provider.GetPullRequestDiff(ctx, config, repo, pr.ID)
		if err != nil {
			return err
		}
		sourceArchive, err := provider.GetPullRequestSourceArchive(ctx, config, repo, pr)
		if err != nil {
			return err
		}
		archiveAttachment, err := persistPullRequestSourceArchive(adapterStateDir(), provider, repo, pr, sourceArchive)
		if err != nil {
			return err
		}
		emit(buildPullRequestEvent(accountID, provider, repo, pr, diff, archiveAttachment))
		if pr.UpdatedAt >= latestPRTime {
			latestPRTime = pr.UpdatedAt
		}

	}
	if latestPRTime > 0 {
		if err := store.Set(accountID, prWatermarkName, latestPRTime, ""); err != nil {
			return err
		}
	}

	openPRs, err := provider.GetPullRequests(ctx, config, repo, time.Time{})
	if err != nil {
		return err
	}
	commentPRs := mergePullRequests(prs, filterOpenPullRequests(openPRs))
	sort.Slice(commentPRs, func(i, j int) bool {
		if commentPRs[i].UpdatedAt == commentPRs[j].UpdatedAt {
			return commentPRs[i].ID < commentPRs[j].ID
		}
		return commentPRs[i].UpdatedAt < commentPRs[j].UpdatedAt
	})
	for _, pr := range commentPRs {
		commentWatermarkName := fmt.Sprintf("%s:pr/%s:comments", repo.FullName, pr.ID)
		commentSince, _ := readWatermarkTime(store, accountID, commentWatermarkName)
		if commentSince.IsZero() {
			commentSince = prSince
		}
		comments, err := provider.GetPullRequestComments(ctx, config, repo, pr.ID, commentSince)
		if err != nil {
			return err
		}
		sort.Slice(comments, func(i, j int) bool { return comments[i].CreatedAt < comments[j].CreatedAt })
		var latestCommentTime int64
		for _, comment := range comments {
			emit(buildCommentEvent(accountID, provider, repo, pr, comment))
			if comment.CreatedAt >= latestCommentTime {
				latestCommentTime = comment.CreatedAt
			}
		}
		if latestCommentTime > 0 {
			if err := store.Set(accountID, commentWatermarkName, latestCommentTime, ""); err != nil {
				return err
			}
		}
	}
	return nil
}

func filterOpenPullRequests(prs []PullRequest) []PullRequest {
	filtered := make([]PullRequest, 0, len(prs))
	for _, pr := range prs {
		if pr.State == "open" {
			filtered = append(filtered, pr)
		}
	}
	return filtered
}

func mergePullRequests(groups ...[]PullRequest) []PullRequest {
	merged := make([]PullRequest, 0)
	seen := make(map[string]bool)
	for _, group := range groups {
		for _, pr := range group {
			if seen[pr.ID] {
				continue
			}
			seen[pr.ID] = true
			merged = append(merged, pr)
		}
	}
	return merged
}

func readWatermarkTime(store WatermarkStore, source, name string) (time.Time, error) {
	watermark, err := store.Get(source, name)
	if err != nil || watermark == nil || watermark.ValueInt == 0 {
		return time.Time{}, err
	}
	return time.UnixMilli(watermark.ValueInt).Add(time.Millisecond), nil
}

func rateLimitResult(config AccountConfig, repo Repository, err error) (monitorCycleResult, bool) {
	apiErr, ok := githubRateLimitAPIError(err)
	if !ok {
		return monitorCycleResult{}, false
	}
	return monitorCycleResult{
		CooldownDuration: rateLimitCooldownDuration(config, apiErr),
		RateLimitedRepo:  repo.FullName,
	}, true
}

func rateLimitCooldownDuration(config AccountConfig, apiErr *core.APIError) time.Duration {
	if apiErr != nil && apiErr.RetryAfterMs > 0 {
		return time.Duration(apiErr.RetryAfterMs) * time.Millisecond
	}
	if config.PollIntervalSeconds > 0 {
		return time.Duration(config.PollIntervalSeconds) * time.Second
	}
	return 60 * time.Second
}

func waitForMonitorCooldown(ctx context.Context, duration time.Duration) error {
	if duration <= 0 {
		return nil
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func monitorLoop(ctx context.Context, accountID string, provider Provider, config AccountConfig, emit nexadapter.EmitFunc) error {
	store, err := OpenWatermarkStore(adapterStateDir())
	if err != nil {
		return err
	}
	defer store.Close()

	interval := time.Duration(config.PollIntervalSeconds) * time.Second
	if interval <= 0 {
		interval = 60 * time.Second
	}

	if result, err := runMonitorCycle(ctx, accountID, provider, config, store, emit); err != nil {
		nexadapter.LogError("initial monitor cycle failed: %v", err)
	} else if err := waitForMonitorCooldown(ctx, result.CooldownDuration); err != nil && !errors.Is(err, context.Canceled) {
		return err
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			result, err := runMonitorCycle(ctx, accountID, provider, config, store, emit)
			if err != nil {
				nexadapter.LogError("monitor cycle failed: %v", err)
				continue
			}
			if err := waitForMonitorCooldown(ctx, result.CooldownDuration); err != nil {
				if errors.Is(err, context.Canceled) {
					return nil
				}
				return err
			}
		}
	}
}
