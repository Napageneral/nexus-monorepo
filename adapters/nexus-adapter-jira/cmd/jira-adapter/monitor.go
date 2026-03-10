package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

var jiraSearchFields = []string{
	"summary",
	"description",
	"status",
	"issuetype",
	"project",
	"updated",
	"created",
	"priority",
	"assignee",
	"reporter",
	"labels",
	"components",
	"parent",
	"comment",
	"customfield_10020",
	"customfield_10028",
	"resolution",
}

func monitor(ctx context.Context, connection string, _ nexadapter.EmitFunc) error {
	client, cfg, err := loadJiraClientFromRuntime()
	if err != nil {
		return err
	}

	connectionID := firstNonBlank(connection, cfg.ConnectionID)
	state := initialWatermarks(cfg)
	nexadapter.LogInfo("monitor starting for connection %q (%d projects)", connectionID, len(cfg.Projects))

	runOnce := func() error {
		for _, project := range cfg.Projects {
			since := state[project]
			stats, nextWatermark, err := syncProject(ctx, client, connectionID, project, since)
			if err != nil {
				return fmt.Errorf("sync project %s: %w", project, err)
			}
			if !nextWatermark.IsZero() {
				state[project] = nextWatermark
			}
			nexadapter.LogInfo(
				"project %s synced (%d issues, %d comments, %d changelog items, watermark=%s)",
				project,
				stats.Issues,
				stats.Comments,
				stats.ChangelogItems,
				state[project].UTC().Format(time.RFC3339Nano),
			)
		}
		return nil
	}

	if err := runOnce(); err != nil {
		return err
	}

	ticker := time.NewTicker(cfg.PollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			nexadapter.LogInfo("monitor stopped for connection %q", connectionID)
			return nil
		case <-ticker.C:
			if err := runOnce(); err != nil {
				nexadapter.LogError("monitor cycle failed: %v", err)
			}
		}
	}
}

func backfill(ctx context.Context, connection string, since time.Time, _ nexadapter.EmitFunc) error {
	client, cfg, err := loadJiraClientFromRuntime()
	if err != nil {
		return err
	}

	connectionID := firstNonBlank(connection, cfg.ConnectionID)
	nexadapter.LogInfo("backfill starting for connection %q since %s", connectionID, since.UTC().Format(time.RFC3339))

	totalIssues := 0
	for _, project := range cfg.Projects {
		stats, _, err := syncProject(ctx, client, connectionID, project, since)
		if err != nil {
			return fmt.Errorf("backfill project %s: %w", project, err)
		}
		totalIssues += stats.Issues
		nexadapter.LogInfo(
			"backfill project %s complete (%d issues, %d comments, %d changelog items)",
			project,
			stats.Issues,
			stats.Comments,
			stats.ChangelogItems,
		)
	}

	nexadapter.LogInfo("backfill completed (%d projects, %d issues total)", len(cfg.Projects), totalIssues)
	return nil
}

func initialWatermarks(cfg *jiraConnectionConfig) map[string]time.Time {
	state := make(map[string]time.Time, len(cfg.Projects))
	now := time.Now().UTC()
	for _, project := range cfg.Projects {
		if watermark, ok := cfg.Watermarks[project]; ok && !watermark.IsZero() {
			state[project] = watermark.UTC()
			continue
		}
		state[project] = now
	}
	return state
}

func syncProject(ctx context.Context, client *jiraClient, connectionID, project string, since time.Time) (projectSyncStats, time.Time, error) {
	stats := projectSyncStats{Project: project}

	jql := fmt.Sprintf(`project = "%s" AND updated >= "%s" ORDER BY updated ASC`, escapeJQLString(project), formatJQLTime(since, client.searchTimeZone(ctx)))
	issues, err := client.searchIssues(ctx, jql, jiraSearchFields, nil)
	if err != nil {
		return stats, time.Time{}, err
	}

	nextWatermark := since
	for _, issue := range issues {
		updatedAt, err := parseJiraTimestamp(issue.Fields.Updated)
		if err != nil {
			return stats, time.Time{}, fmt.Errorf("parse issue updated %s: %w", issue.Key, err)
		}
		if updatedAt.Before(since) {
			continue
		}

		if err := emitIssueFamily(ctx, client, connectionID, issue, since, &stats); err != nil {
			return stats, time.Time{}, err
		}

		stats.Issues++
		if updatedAt.After(nextWatermark) {
			nextWatermark = updatedAt
		}
	}

	if stats.Issues == 0 {
		return stats, since, nil
	}
	return stats, nextWatermark.Add(time.Millisecond), nil
}

func emitIssueFamily(ctx context.Context, client *jiraClient, connectionID string, issue jiraIssue, since time.Time, stats *projectSyncStats) error {
	issueRecord, err := buildIssueRecord(connectionID, client, issue)
	if err != nil {
		return fmt.Errorf("build issue record %s: %w", issue.Key, err)
	}
	if err := writeRecord(issueRecord); err != nil {
		return fmt.Errorf("emit issue record %s: %w", issue.Key, err)
	}

	comments, err := client.fetchAllComments(ctx, issue.Key, issue.Fields.Comment)
	if err != nil {
		return fmt.Errorf("fetch comments for %s: %w", issue.Key, err)
	}
	for _, comment := range comments {
		commentTime, err := parseJiraTimestamp(firstNonBlank(comment.Updated, comment.Created))
		if err != nil {
			return fmt.Errorf("parse comment timestamp %s/%s: %w", issue.Key, comment.ID, err)
		}
		if commentTime.Before(since) {
			continue
		}
		record, err := buildCommentRecord(connectionID, client, issue, comment)
		if err != nil {
			return fmt.Errorf("build comment record %s/%s: %w", issue.Key, comment.ID, err)
		}
		if err := writeRecord(record); err != nil {
			return fmt.Errorf("emit comment record %s/%s: %w", issue.Key, comment.ID, err)
		}
		stats.Comments++
	}

	expanded, err := client.getIssueWithExpand(ctx, issue.Key)
	if err != nil {
		return fmt.Errorf("fetch changelog for %s: %w", issue.Key, err)
	}
	if expanded.Changelog == nil {
		return nil
	}
	for _, history := range expanded.Changelog.Histories {
		historyTime, err := parseJiraTimestamp(history.Created)
		if err != nil {
			return fmt.Errorf("parse changelog timestamp %s/%s: %w", issue.Key, history.ID, err)
		}
		if historyTime.Before(since) {
			continue
		}
		for _, item := range history.Items {
			record, err := buildChangelogRecord(connectionID, client, issue, history, item)
			if err != nil {
				return fmt.Errorf("build changelog record %s/%s: %w", issue.Key, history.ID, err)
			}
			if err := writeRecord(record); err != nil {
				return fmt.Errorf("emit changelog record %s/%s: %w", issue.Key, history.ID, err)
			}
			stats.ChangelogItems++
		}
	}

	return nil
}

func formatJQLTime(value time.Time, loc *time.Location) string {
	if loc == nil {
		loc = time.UTC
	}
	return value.In(loc).Format("2006-01-02 15:04")
}

func escapeJQLString(value string) string {
	return strings.ReplaceAll(value, `"`, `\"`)
}
