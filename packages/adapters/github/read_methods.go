package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

type gitReadPayload struct {
	Repository    string           `json:"repository,omitempty"`
	SpaceID       string           `json:"space_id,omitempty"`
	PullRequestID string           `json:"pull_request_id,omitempty"`
	SHA           string           `json:"sha,omitempty"`
	Target        *gitMethodTarget `json:"target,omitempty"`
}

type gitCurrentUserResult struct {
	Provider           string `json:"provider"`
	Host               string `json:"host,omitempty"`
	User               string `json:"user,omitempty"`
	RateLimitRemaining int    `json:"rate_limit_remaining,omitempty"`
	RetryAfterSeconds  int    `json:"retry_after_seconds,omitempty"`
}

type gitRepositoriesListResult struct {
	Repositories []Repository `json:"repositories"`
}

type gitRepositoryGetResult struct {
	Repository Repository `json:"repository"`
}

type gitBranchesListResult struct {
	Repository Repository `json:"repository"`
	Branches   []string   `json:"branches"`
}

type gitPullRequestsListResult struct {
	Repository   Repository    `json:"repository"`
	PullRequests []PullRequest `json:"pull_requests"`
}

type gitCommitsListResult struct {
	Repository Repository `json:"repository"`
	Commits    []Commit   `json:"commits"`
}

type gitCommitDiffGetResult struct {
	Repository Repository `json:"repository"`
	SHA        string     `json:"sha"`
	Diff       string     `json:"diff"`
}

type gitPullRequestGetResult struct {
	Repository  Repository  `json:"repository"`
	PullRequest PullRequest `json:"pull_request"`
}

type gitPullRequestDiffGetResult struct {
	Repository    Repository `json:"repository"`
	PullRequestID string     `json:"pull_request_id"`
	Diff          string     `json:"diff"`
}

type gitPullRequestFilesListResult struct {
	Repository    Repository        `json:"repository"`
	PullRequestID string            `json:"pull_request_id"`
	Files         []PullRequestFile `json:"files"`
}

type gitPullRequestReviewsListResult struct {
	Repository    Repository          `json:"repository"`
	PullRequestID string              `json:"pull_request_id"`
	Reviews       []PullRequestReview `json:"reviews"`
}

type gitPullRequestCommitsListResult struct {
	Repository    Repository `json:"repository"`
	PullRequestID string     `json:"pull_request_id"`
	Commits       []Commit   `json:"commits"`
}

type gitPullRequestSourceArchiveGetResult struct {
	Repository    Repository             `json:"repository"`
	PullRequestID string                 `json:"pull_request_id"`
	Attachment    *nexadapter.Attachment `json:"attachment,omitempty"`
}

type gitPullRequestCommentsListResult struct {
	Repository    Repository `json:"repository"`
	PullRequestID string     `json:"pull_request_id"`
	Comments      []Comment  `json:"comments"`
}

func githubUserMeMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "Read the authenticated GitHub account for the current connection.",
		Action:      "read",
		Params: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties":           map[string]any{},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"provider":             map[string]any{"type": "string"},
				"host":                 map[string]any{"type": "string"},
				"user":                 map[string]any{"type": "string"},
				"rate_limit_remaining": map[string]any{"type": "integer"},
				"retry_after_seconds":  map[string]any{"type": "integer"},
			},
			"required": []string{"provider"},
		},
		ConnectionRequired: connectionRequired,
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return adapter.GetCurrentUserMethod(ctx.Context, req)
		},
	}
}

func githubRepositoriesListMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "List repositories accessible to the current GitHub connection.",
		Action:      "read",
		Params: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties":           map[string]any{},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"repositories": map[string]any{
					"type":  "array",
					"items": map[string]any{"type": "object"},
				},
			},
			"required": []string{"repositories"},
		},
		ConnectionRequired: connectionRequired,
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return adapter.ListRepositoriesMethod(ctx.Context, req)
		},
	}
}

func githubBranchesListMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "List branches for a GitHub repository.",
		Action:      "read",
		Params: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties": map[string]any{
				"repository": map[string]any{"type": "string"},
				"space_id":   map[string]any{"type": "string"},
				"target":     map[string]any{"type": "object"},
			},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"repository": map[string]any{"type": "object"},
				"branches": map[string]any{
					"type":  "array",
					"items": map[string]any{"type": "string"},
				},
			},
			"required": []string{"repository", "branches"},
		},
		ConnectionRequired: connectionRequired,
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return adapter.ListBranchesMethod(ctx.Context, req)
		},
	}
}

func githubRepositoryGetMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "Read repository metadata for a GitHub repository.",
		Action:      "read",
		Params: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties": map[string]any{
				"repository": map[string]any{"type": "string"},
				"space_id":   map[string]any{"type": "string"},
				"target":     map[string]any{"type": "object"},
			},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"repository": map[string]any{"type": "object"},
			},
			"required": []string{"repository"},
		},
		ConnectionRequired: connectionRequired,
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return adapter.GetRepositoryMethod(ctx.Context, req)
		},
	}
}

func githubPullRequestsListMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "List pull requests for a GitHub repository.",
		Action:      "read",
		Params: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties": map[string]any{
				"repository": map[string]any{"type": "string"},
				"space_id":   map[string]any{"type": "string"},
				"target":     map[string]any{"type": "object"},
			},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"repository": map[string]any{"type": "object"},
				"pull_requests": map[string]any{
					"type":  "array",
					"items": map[string]any{"type": "object"},
				},
			},
			"required": []string{"repository", "pull_requests"},
		},
		ConnectionRequired: connectionRequired,
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return adapter.ListPullRequestsMethod(ctx.Context, req)
		},
	}
}

func githubCommitsListMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "List commits for a GitHub repository.",
		Action:      "read",
		Params: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties": map[string]any{
				"repository": map[string]any{"type": "string"},
				"space_id":   map[string]any{"type": "string"},
				"target":     map[string]any{"type": "object"},
			},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"repository": map[string]any{"type": "object"},
				"commits": map[string]any{
					"type":  "array",
					"items": map[string]any{"type": "object"},
				},
			},
			"required": []string{"repository", "commits"},
		},
		ConnectionRequired: connectionRequired,
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return adapter.ListCommitsMethod(ctx.Context, req)
		},
	}
}

func githubCommitDiffGetMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "Read the unified diff for a GitHub commit.",
		Action:      "read",
		Params: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties": map[string]any{
				"repository": map[string]any{"type": "string"},
				"space_id":   map[string]any{"type": "string"},
				"sha":        map[string]any{"type": "string"},
				"target":     map[string]any{"type": "object"},
			},
			"required": []string{"sha"},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"repository": map[string]any{"type": "object"},
				"sha":        map[string]any{"type": "string"},
				"diff":       map[string]any{"type": "string"},
			},
			"required": []string{"repository", "sha", "diff"},
		},
		ConnectionRequired: connectionRequired,
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return adapter.GetCommitDiffMethod(ctx.Context, req)
		},
	}
}

func githubPullRequestGetMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "Read pull request metadata for a GitHub repository.",
		Action:      "read",
		Params: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties": map[string]any{
				"repository":      map[string]any{"type": "string"},
				"space_id":        map[string]any{"type": "string"},
				"pull_request_id": map[string]any{"type": "string"},
				"target":          map[string]any{"type": "object"},
			},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"repository":   map[string]any{"type": "object"},
				"pull_request": map[string]any{"type": "object"},
			},
			"required": []string{"repository", "pull_request"},
		},
		ConnectionRequired: connectionRequired,
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return adapter.GetPullRequestMethod(ctx.Context, req)
		},
	}
}

func githubPullRequestDiffGetMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "Read the unified diff for a GitHub pull request.",
		Action:      "read",
		Params: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties": map[string]any{
				"repository":      map[string]any{"type": "string"},
				"space_id":        map[string]any{"type": "string"},
				"pull_request_id": map[string]any{"type": "string"},
				"target":          map[string]any{"type": "object"},
			},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"repository":      map[string]any{"type": "object"},
				"pull_request_id": map[string]any{"type": "string"},
				"diff":            map[string]any{"type": "string"},
			},
			"required": []string{"repository", "pull_request_id", "diff"},
		},
		ConnectionRequired: connectionRequired,
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return adapter.GetPullRequestDiffMethod(ctx.Context, req)
		},
	}
}

func githubPullRequestFilesListMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "List changed files for a GitHub pull request.",
		Action:      "read",
		Params: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties": map[string]any{
				"repository":      map[string]any{"type": "string"},
				"space_id":        map[string]any{"type": "string"},
				"pull_request_id": map[string]any{"type": "string"},
				"target":          map[string]any{"type": "object"},
			},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"repository":      map[string]any{"type": "object"},
				"pull_request_id": map[string]any{"type": "string"},
				"files": map[string]any{
					"type":  "array",
					"items": map[string]any{"type": "object"},
				},
			},
			"required": []string{"repository", "pull_request_id", "files"},
		},
		ConnectionRequired: connectionRequired,
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return adapter.ListPullRequestFilesMethod(ctx.Context, req)
		},
	}
}

func githubPullRequestReviewsListMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "List reviews for a GitHub pull request.",
		Action:      "read",
		Params: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties": map[string]any{
				"repository":      map[string]any{"type": "string"},
				"space_id":        map[string]any{"type": "string"},
				"pull_request_id": map[string]any{"type": "string"},
				"target":          map[string]any{"type": "object"},
			},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"repository":      map[string]any{"type": "object"},
				"pull_request_id": map[string]any{"type": "string"},
				"reviews": map[string]any{
					"type":  "array",
					"items": map[string]any{"type": "object"},
				},
			},
			"required": []string{"repository", "pull_request_id", "reviews"},
		},
		ConnectionRequired: connectionRequired,
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return adapter.ListPullRequestReviewsMethod(ctx.Context, req)
		},
	}
}

func githubPullRequestCommitsListMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "List commits for a GitHub pull request.",
		Action:      "read",
		Params: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties": map[string]any{
				"repository":      map[string]any{"type": "string"},
				"space_id":        map[string]any{"type": "string"},
				"pull_request_id": map[string]any{"type": "string"},
				"target":          map[string]any{"type": "object"},
			},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"repository":      map[string]any{"type": "object"},
				"pull_request_id": map[string]any{"type": "string"},
				"commits": map[string]any{
					"type":  "array",
					"items": map[string]any{"type": "object"},
				},
			},
			"required": []string{"repository", "pull_request_id", "commits"},
		},
		ConnectionRequired: connectionRequired,
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return adapter.ListPullRequestCommitsMethod(ctx.Context, req)
		},
	}
}

func githubPullRequestSourceArchiveGetMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "Read the source archive for a GitHub pull request head commit.",
		Action:      "read",
		Params: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties": map[string]any{
				"repository":      map[string]any{"type": "string"},
				"space_id":        map[string]any{"type": "string"},
				"pull_request_id": map[string]any{"type": "string"},
				"target":          map[string]any{"type": "object"},
			},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"repository":      map[string]any{"type": "object"},
				"pull_request_id": map[string]any{"type": "string"},
				"attachment":      map[string]any{"type": "object"},
			},
			"required": []string{"repository", "pull_request_id"},
		},
		ConnectionRequired: connectionRequired,
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return adapter.GetPullRequestSourceArchiveMethod(ctx.Context, req)
		},
	}
}

func githubPullRequestCommentsListMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "List review comments for a GitHub pull request.",
		Action:      "read",
		Params: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties": map[string]any{
				"repository":      map[string]any{"type": "string"},
				"space_id":        map[string]any{"type": "string"},
				"pull_request_id": map[string]any{"type": "string"},
				"target":          map[string]any{"type": "object"},
			},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"repository":      map[string]any{"type": "object"},
				"pull_request_id": map[string]any{"type": "string"},
				"comments": map[string]any{
					"type":  "array",
					"items": map[string]any{"type": "object"},
				},
			},
			"required": []string{"repository", "pull_request_id", "comments"},
		},
		ConnectionRequired: connectionRequired,
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return adapter.ListPullRequestCommentsMethod(ctx.Context, req)
		},
	}
}

func (a *GitAdapter) GetCurrentUserMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitCurrentUserResult, error) {
	config, provider, err := loadReadMethodRuntime(req)
	if err != nil {
		return nil, err
	}
	result := &gitCurrentUserResult{
		Provider: provider.ID(),
		Host:     strings.TrimSpace(config.Host),
	}
	if currentUserProvider, ok := provider.(interface {
		GetCurrentUser(context.Context, AccountConfig) (string, error)
	}); ok {
		user, err := currentUserProvider.GetCurrentUser(ctx, config)
		if err != nil {
			if _, ok := githubRateLimitAPIError(err); !ok {
				return nil, err
			}
			result.User = currentUserFallbackIdentity(config)
		} else {
			result.User = strings.TrimSpace(user)
		}
	} else {
		if _, err := retryDirectRead(ctx, config.AccountID, provider, strings.TrimSpace(config.Host), "current_user", func() (struct{}, error) {
			return struct{}{}, provider.ValidateCredentials(ctx, config)
		}); err != nil {
			return nil, err
		}
	}
	if report, ok := provider.(interface{ ValidationDetails() map[string]any }); ok {
		details := report.ValidationDetails()
		if result.User == "" {
			result.User = strings.TrimSpace(fmt.Sprint(details["user"]))
		}
		result.RateLimitRemaining = intValue(details["rate_limit_remaining"])
		result.RetryAfterSeconds = intValue(details["retry_after_seconds"])
	}
	if result.User == "" {
		result.User = currentUserFallbackIdentity(config)
	}
	return result, nil
}

func currentUserFallbackIdentity(config AccountConfig) string {
	if username := strings.TrimSpace(config.Username); username != "" {
		return username
	}
	return strings.TrimSuffix(strings.TrimSpace(config.Workspace), "#user")
}

func (a *GitAdapter) ListRepositoriesMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitRepositoriesListResult, error) {
	config, provider, err := loadReadMethodRuntime(req)
	if err != nil {
		return nil, err
	}
	repositories, err := retryDirectRead(ctx, config.AccountID, provider, strings.TrimSpace(config.Host), "repositories_list", func() ([]Repository, error) {
		return provider.ListRepositories(ctx, config)
	})
	if err != nil {
		return nil, err
	}
	return &gitRepositoriesListResult{Repositories: repositories}, nil
}

func (a *GitAdapter) GetRepositoryMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitRepositoryGetResult, error) {
	config, provider, payload, err := loadReadMethodRepo(ctx, req)
	if err != nil {
		return nil, err
	}
	repo, _, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	detailed, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "repository_get", func() (*Repository, error) {
		return provider.GetRepository(ctx, config, repo)
	})
	if err != nil {
		return nil, err
	}
	if detailed == nil {
		return nil, fmt.Errorf("repository not found")
	}
	return &gitRepositoryGetResult{Repository: *detailed}, nil
}

func (a *GitAdapter) ListBranchesMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitBranchesListResult, error) {
	config, provider, payload, err := loadReadMethodRepo(ctx, req)
	if err != nil {
		return nil, err
	}
	repo, _, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	branches, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "branches_list", func() ([]string, error) {
		return provider.ListBranches(ctx, config, repo)
	})
	if err != nil {
		return nil, err
	}
	return &gitBranchesListResult{Repository: repo, Branches: branches}, nil
}

func (a *GitAdapter) ListPullRequestsMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitPullRequestsListResult, error) {
	config, provider, payload, err := loadReadMethodRepo(ctx, req)
	if err != nil {
		return nil, err
	}
	repo, _, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	pullRequests, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "pull_requests_list", func() ([]PullRequest, error) {
		return provider.GetPullRequests(ctx, config, repo, timeZero())
	})
	if err != nil {
		return nil, err
	}
	return &gitPullRequestsListResult{Repository: repo, PullRequests: pullRequests}, nil
}

func (a *GitAdapter) ListCommitsMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitCommitsListResult, error) {
	config, provider, payload, err := loadReadMethodRepo(ctx, req)
	if err != nil {
		return nil, err
	}
	repo, _, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	commits, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "commits_list", func() ([]Commit, error) {
		return provider.GetCommits(ctx, config, repo, timeZero())
	})
	if err != nil {
		return nil, err
	}
	return &gitCommitsListResult{Repository: repo, Commits: commits}, nil
}

func (a *GitAdapter) GetCommitDiffMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitCommitDiffGetResult, error) {
	config, provider, payload, err := loadReadMethodRepo(ctx, req)
	if err != nil {
		return nil, err
	}
	repo, _, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	sha := strings.TrimSpace(payload.SHA)
	if sha == "" {
		return nil, fmt.Errorf("github.commits.diff.get requires payload.sha")
	}
	diff, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "commit_diff", func() ([]byte, error) {
		return provider.GetCommitDiff(ctx, config, repo, sha)
	})
	if err != nil {
		return nil, err
	}
	return &gitCommitDiffGetResult{Repository: repo, SHA: sha, Diff: string(diff)}, nil
}

func (a *GitAdapter) GetPullRequestMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitPullRequestGetResult, error) {
	config, provider, payload, err := loadReadMethodRepo(ctx, req)
	if err != nil {
		return nil, err
	}
	repo, prID, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(prID) == "" {
		return nil, fmt.Errorf("github.pull_requests.get requires payload.pull_request_id or target.channel.thread_id")
	}
	pullRequest, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "pull_request_get", func() (*PullRequest, error) {
		return provider.GetPullRequest(ctx, config, repo, prID)
	})
	if err != nil {
		return nil, err
	}
	if pullRequest == nil {
		return nil, fmt.Errorf("pull request not found")
	}
	return &gitPullRequestGetResult{Repository: repo, PullRequest: *pullRequest}, nil
}

func (a *GitAdapter) GetPullRequestDiffMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitPullRequestDiffGetResult, error) {
	config, provider, payload, err := loadReadMethodRepo(ctx, req)
	if err != nil {
		return nil, err
	}
	repo, prID, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(prID) == "" {
		return nil, fmt.Errorf("github.pull_requests.diff.get requires payload.pull_request_id or target.channel.thread_id")
	}
	diff, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "pull_request_diff", func() ([]byte, error) {
		return provider.GetPullRequestDiff(ctx, config, repo, prID)
	})
	if err != nil {
		return nil, err
	}
	return &gitPullRequestDiffGetResult{Repository: repo, PullRequestID: prID, Diff: string(diff)}, nil
}

func (a *GitAdapter) ListPullRequestFilesMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitPullRequestFilesListResult, error) {
	config, provider, payload, err := loadReadMethodRepo(ctx, req)
	if err != nil {
		return nil, err
	}
	repo, prID, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(prID) == "" {
		return nil, fmt.Errorf("github.pull_requests.files.list requires payload.pull_request_id or target.channel.thread_id")
	}
	files, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "pull_request_files", func() ([]PullRequestFile, error) {
		return provider.GetPullRequestFiles(ctx, config, repo, prID)
	})
	if err != nil {
		return nil, err
	}
	return &gitPullRequestFilesListResult{Repository: repo, PullRequestID: prID, Files: files}, nil
}

func (a *GitAdapter) ListPullRequestReviewsMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitPullRequestReviewsListResult, error) {
	config, provider, payload, err := loadReadMethodRepo(ctx, req)
	if err != nil {
		return nil, err
	}
	repo, prID, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(prID) == "" {
		return nil, fmt.Errorf("github.pull_requests.reviews.list requires payload.pull_request_id or target.channel.thread_id")
	}
	reviews, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "pull_request_reviews", func() ([]PullRequestReview, error) {
		return provider.GetPullRequestReviews(ctx, config, repo, prID)
	})
	if err != nil {
		return nil, err
	}
	return &gitPullRequestReviewsListResult{Repository: repo, PullRequestID: prID, Reviews: reviews}, nil
}

func (a *GitAdapter) ListPullRequestCommitsMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitPullRequestCommitsListResult, error) {
	config, provider, payload, err := loadReadMethodRepo(ctx, req)
	if err != nil {
		return nil, err
	}
	repo, prID, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(prID) == "" {
		return nil, fmt.Errorf("github.pull_requests.commits.list requires payload.pull_request_id or target.channel.thread_id")
	}
	commits, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "pull_request_commits", func() ([]Commit, error) {
		return provider.GetPullRequestCommits(ctx, config, repo, prID)
	})
	if err != nil {
		return nil, err
	}
	return &gitPullRequestCommitsListResult{Repository: repo, PullRequestID: prID, Commits: commits}, nil
}

func (a *GitAdapter) GetPullRequestSourceArchiveMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitPullRequestSourceArchiveGetResult, error) {
	config, provider, payload, err := loadReadMethodRepo(ctx, req)
	if err != nil {
		return nil, err
	}
	repo, prID, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(prID) == "" {
		return nil, fmt.Errorf("github.pull_requests.source_archive.get requires payload.pull_request_id or target.channel.thread_id")
	}
	pullRequest, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "pull_request_source_archive", func() (*PullRequest, error) {
		return provider.GetPullRequest(ctx, config, repo, prID)
	})
	if err != nil {
		return nil, err
	}
	if pullRequest == nil {
		return nil, fmt.Errorf("pull request not found")
	}
	archive, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "pull_request_source_archive", func() (*SourceArchive, error) {
		return provider.GetPullRequestSourceArchive(ctx, config, repo, *pullRequest)
	})
	if err != nil {
		return nil, err
	}
	attachment, err := persistPullRequestSourceArchive(adapterStateDir(), provider, repo, *pullRequest, archive)
	if err != nil {
		return nil, err
	}
	if attachment == nil {
		return nil, fmt.Errorf("source archive not available")
	}
	return &gitPullRequestSourceArchiveGetResult{
		Repository:    repo,
		PullRequestID: prID,
		Attachment:    attachment,
	}, nil
}

func (a *GitAdapter) ListPullRequestCommentsMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitPullRequestCommentsListResult, error) {
	config, provider, payload, err := loadReadMethodRepo(ctx, req)
	if err != nil {
		return nil, err
	}
	repo, prID, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(prID) == "" {
		return nil, fmt.Errorf("github.pull_requests.comments.list requires payload.pull_request_id or target.channel.thread_id")
	}
	comments, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "pull_request_comments", func() ([]Comment, error) {
		return provider.GetPullRequestComments(ctx, config, repo, prID, timeZero())
	})
	if err != nil {
		return nil, err
	}
	return &gitPullRequestCommentsListResult{Repository: repo, PullRequestID: prID, Comments: comments}, nil
}

func loadReadMethodRuntime(req nexadapter.AdapterMethodRequest) (AccountConfig, Provider, error) {
	accountID, err := nexadapter.RequireConnection(strings.TrimSpace(req.ConnectionID))
	if err != nil {
		return AccountConfig{}, nil, err
	}
	return loadRuntimeAccount(accountID)
}

func loadReadMethodRepo(ctx context.Context, req nexadapter.AdapterMethodRequest) (AccountConfig, Provider, gitReadPayload, error) {
	config, provider, err := loadReadMethodRuntime(req)
	if err != nil {
		return AccountConfig{}, nil, gitReadPayload{}, err
	}
	payload, err := readGitReadPayload(req)
	if err != nil {
		return AccountConfig{}, nil, gitReadPayload{}, err
	}
	return config, provider, payload, nil
}

func readGitReadPayload(req nexadapter.AdapterMethodRequest) (gitReadPayload, error) {
	payload := req.Payload
	if payload == nil {
		payload = map[string]any{}
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return gitReadPayload{}, err
	}
	var parsed gitReadPayload
	if err := json.Unmarshal(encoded, &parsed); err != nil {
		return gitReadPayload{}, err
	}
	return parsed, nil
}

func resolveReadRepository(ctx context.Context, config AccountConfig, provider Provider, payload gitReadPayload) (Repository, string, error) {
	repoName := strings.TrimSpace(payload.Repository)
	spaceID := strings.TrimSpace(payload.SpaceID)
	prID := strings.TrimSpace(payload.PullRequestID)
	if payload.Target != nil {
		if repoName == "" {
			repoName = strings.TrimSpace(payload.Target.Channel.ContainerID)
		}
		if spaceID == "" {
			spaceID = strings.TrimSpace(payload.Target.Channel.SpaceID)
		}
		if prID == "" {
			parsedPRID, err := parseTargetThreadPRID(payload.Target.Channel.ThreadID)
			if err != nil {
				return Repository{}, "", err
			}
			prID = parsedPRID
		}
	}
	if repoName == "" {
		return Repository{}, "", fmt.Errorf("repository is required")
	}
	scope := strings.Trim(strings.TrimSpace(spaceID)+"/"+repoName, "/")
	if scope == "" {
		scope = repoName
	}
	if len(config.Repositories) > 0 {
		repo, err := findTrackedRepo(config.Repositories, repoName, spaceID)
		if err == nil {
			return repo, prID, nil
		}
	}
	repositories, err := retryDirectRead(ctx, config.AccountID, provider, scope, "resolve_repository", func() ([]Repository, error) {
		return provider.ListRepositories(ctx, config)
	})
	if err != nil {
		return Repository{}, "", err
	}
	repo, err := findTrackedRepo(repositories, repoName, spaceID)
	if err == nil {
		return repo, prID, nil
	}
	resolved, getErr := retryDirectRead(ctx, config.AccountID, provider, scope, "resolve_repository_get", func() (*Repository, error) {
		return provider.GetRepository(ctx, config, Repository{
			FullName: scope,
			Name:     repoName,
		})
	})
	if getErr != nil {
		return Repository{}, "", err
	}
	return *resolved, prID, nil
}

func intValue(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(typed))
		if err == nil {
			return parsed
		}
	}
	return 0
}

func timeZero() time.Time {
	return time.Time{}
}
