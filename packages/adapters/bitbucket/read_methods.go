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
	States        []string         `json:"states,omitempty"`
	PageLen       int              `json:"page_len,omitempty"`
	Page          int              `json:"page,omitempty"`
	Target        *gitMethodTarget `json:"target,omitempty"`
}

type gitRepositoriesListResult struct {
	Repositories []Repository `json:"repositories"`
}

type gitRepositoryGetResult struct {
	Repository Repository `json:"repository"`
}

type gitWorkspacesListResult struct {
	Workspaces []string `json:"workspaces"`
}

type gitBranchesListResult struct {
	Repository Repository `json:"repository"`
	Branches   []string   `json:"branches"`
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

type gitPullRequestsListResult struct {
	Repository   Repository    `json:"repository"`
	PullRequests []PullRequest `json:"pull_requests"`
	Next         string        `json:"next,omitempty"`
	Page         int           `json:"page,omitempty"`
	PageLen      int           `json:"page_len,omitempty"`
}

type gitPullRequestDiffGetResult struct {
	Repository    Repository `json:"repository"`
	PullRequestID string     `json:"pull_request_id"`
	Diff          string     `json:"diff"`
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

func bitbucketWorkspacesListMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "List workspaces accessible to the current Bitbucket connection.",
		Action:      "read",
		Params: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties":           map[string]any{},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"workspaces": map[string]any{
					"type":  "array",
					"items": map[string]any{"type": "string"},
				},
			},
			"required": []string{"workspaces"},
		},
		ConnectionRequired: connectionRequired,
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return adapter.ListWorkspacesMethod(ctx.Context, req)
		},
	}
}

func bitbucketRepositoriesListMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "List repositories accessible to the current Bitbucket connection.",
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

func bitbucketRepositoryGetMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "Read repository metadata for a Bitbucket repository.",
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

func bitbucketBranchesListMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "List branches for a Bitbucket repository.",
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

func bitbucketCommitsListMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "List commits for a Bitbucket repository.",
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

func bitbucketCommitDiffGetMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "Read the unified diff for a Bitbucket commit.",
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

func bitbucketPullRequestsListMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "List pull requests for a Bitbucket repository.",
		Action:      "read",
		Params: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties": map[string]any{
				"repository": map[string]any{"type": "string"},
				"space_id":   map[string]any{"type": "string"},
				"states": map[string]any{
					"type":  "array",
					"items": map[string]any{"type": "string"},
				},
				"page_len": map[string]any{"type": "integer", "minimum": 1},
				"page":     map[string]any{"type": "integer", "minimum": 1},
				"target":   map[string]any{"type": "object"},
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
				"next":     map[string]any{"type": "string"},
				"page":     map[string]any{"type": "integer"},
				"page_len": map[string]any{"type": "integer"},
			},
			"required": []string{"repository", "pull_requests"},
		},
		ConnectionRequired: connectionRequired,
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return adapter.ListPullRequestsMethod(ctx.Context, req)
		},
	}
}

func bitbucketPullRequestDiffGetMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "Read the unified diff for a Bitbucket pull request.",
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

func bitbucketPullRequestSourceArchiveGetMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "Read the source archive for a Bitbucket pull request head commit.",
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

func bitbucketPullRequestCommentsListMethod(adapter *GitAdapter, connectionRequired *bool) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.DeclaredMethod[struct{}]{
		Description: "List review comments for a Bitbucket pull request.",
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

func (a *GitAdapter) ListRepositoriesMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitRepositoriesListResult, error) {
	config, provider, err := loadReadMethodRuntime(req)
	if err != nil {
		return nil, err
	}
	repositories, err := retryDirectRead(ctx, config.AccountID, provider, "<connection>", "repositories", func() ([]Repository, error) {
		return provider.ListRepositories(ctx, config)
	})
	if err != nil {
		return nil, err
	}
	return &gitRepositoriesListResult{Repositories: repositories}, nil
}

func (a *GitAdapter) ListWorkspacesMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitWorkspacesListResult, error) {
	config, provider, err := loadReadMethodRuntime(req)
	if err != nil {
		return nil, err
	}
	workspaces, err := retryDirectRead(ctx, config.AccountID, provider, "<connection>", "workspaces", func() ([]string, error) {
		return provider.ListWorkspaces(ctx, config)
	})
	if err != nil {
		return nil, err
	}
	return &gitWorkspacesListResult{Workspaces: workspaces}, nil
}

func (a *GitAdapter) GetRepositoryMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitRepositoryGetResult, error) {
	config, provider, payload, err := loadReadMethodRepo(req)
	if err != nil {
		return nil, err
	}
	repo, _, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	detailed, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "repository", func() (*Repository, error) {
		return provider.GetRepository(ctx, config, repo)
	})
	if err != nil {
		return nil, err
	}
	return &gitRepositoryGetResult{Repository: *detailed}, nil
}

func (a *GitAdapter) ListBranchesMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitBranchesListResult, error) {
	config, provider, payload, err := loadReadMethodRepo(req)
	if err != nil {
		return nil, err
	}
	repo, _, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	branches, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "branches", func() ([]string, error) {
		return provider.ListBranches(ctx, config, repo)
	})
	if err != nil {
		return nil, err
	}
	return &gitBranchesListResult{Repository: repo, Branches: branches}, nil
}

func (a *GitAdapter) ListCommitsMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitCommitsListResult, error) {
	config, provider, payload, err := loadReadMethodRepo(req)
	if err != nil {
		return nil, err
	}
	repo, _, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	commits, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "commits", func() ([]Commit, error) {
		return provider.GetCommits(ctx, config, repo, time.Time{})
	})
	if err != nil {
		return nil, err
	}
	return &gitCommitsListResult{Repository: repo, Commits: commits}, nil
}

func (a *GitAdapter) GetCommitDiffMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitCommitDiffGetResult, error) {
	config, provider, payload, err := loadReadMethodRepo(req)
	if err != nil {
		return nil, err
	}
	repo, _, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	sha := strings.TrimSpace(payload.SHA)
	if sha == "" {
		return nil, fmt.Errorf("bitbucket.commits.diff.get requires payload.sha")
	}
	diff, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "commit_diff", func() ([]byte, error) {
		return provider.GetCommitDiff(ctx, config, repo, sha)
	})
	if err != nil {
		return nil, err
	}
	return &gitCommitDiffGetResult{Repository: repo, SHA: sha, Diff: string(diff)}, nil
}

func (a *GitAdapter) ListPullRequestsMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitPullRequestsListResult, error) {
	config, provider, payload, err := loadReadMethodRepo(req)
	if err != nil {
		return nil, err
	}
	repo, _, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	pageLen := payload.PageLen
	if pageLen <= 0 {
		pageLen = 10
	}
	pageNumber := payload.Page
	if pageNumber <= 0 {
		pageNumber = 1
	}
	options := PullRequestListOptions{
		States:  normalizedPullRequestStates(payload.States),
		PageLen: pageLen,
		Page:    pageNumber,
	}
	page, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "pull_requests", func() (*PullRequestListPage, error) {
		return provider.ListPullRequestsPage(ctx, config, repo, options)
	})
	if err != nil {
		return nil, err
	}
	return &gitPullRequestsListResult{
		Repository:   repo,
		PullRequests: page.PullRequests,
		Next:         page.Next,
		Page:         page.Page,
		PageLen:      page.PageLen,
	}, nil
}

func (a *GitAdapter) GetPullRequestDiffMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitPullRequestDiffGetResult, error) {
	config, provider, payload, err := loadReadMethodRepo(req)
	if err != nil {
		return nil, err
	}
	repo, prID, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(prID) == "" {
		return nil, fmt.Errorf("bitbucket.pull_requests.diff.get requires payload.pull_request_id or target.channel.thread_id")
	}
	diff, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "pull_request_diff", func() ([]byte, error) {
		return provider.GetPullRequestDiff(ctx, config, repo, prID)
	})
	if err != nil {
		return nil, err
	}
	return &gitPullRequestDiffGetResult{Repository: repo, PullRequestID: prID, Diff: string(diff)}, nil
}

func (a *GitAdapter) GetPullRequestSourceArchiveMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitPullRequestSourceArchiveGetResult, error) {
	config, provider, payload, err := loadReadMethodRepo(req)
	if err != nil {
		return nil, err
	}
	repo, prID, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(prID) == "" {
		return nil, fmt.Errorf("bitbucket.pull_requests.source_archive.get requires payload.pull_request_id or target.channel.thread_id")
	}
	pullRequest, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "pull_request_get", func() (*PullRequest, error) {
		return provider.GetPullRequest(ctx, config, repo, prID)
	})
	if err != nil {
		return nil, err
	}
	if pullRequest == nil {
		return nil, fmt.Errorf("pull request %s not found", prID)
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
	config, provider, payload, err := loadReadMethodRepo(req)
	if err != nil {
		return nil, err
	}
	repo, prID, err := resolveReadRepository(ctx, config, provider, payload)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(prID) == "" {
		return nil, fmt.Errorf("bitbucket.pull_requests.comments.list requires payload.pull_request_id or target.channel.thread_id")
	}
	comments, err := retryDirectRead(ctx, config.AccountID, provider, repo.FullName, "pull_request_comments", func() ([]Comment, error) {
		return provider.GetPullRequestComments(ctx, config, repo, prID, time.Time{})
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

func loadReadMethodRepo(req nexadapter.AdapterMethodRequest) (AccountConfig, Provider, gitReadPayload, error) {
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
	scope := strings.Trim(strings.TrimSpace(spaceID)+"/"+strings.TrimSpace(repoName), "/")
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
	if err != nil {
		return Repository{}, "", err
	}
	return repo, prID, nil
}

func normalizedPullRequestStates(input []string) []string {
	if len(input) == 0 {
		return []string{"OPEN"}
	}
	states := make([]string, 0, len(input))
	seen := make(map[string]struct{}, len(input))
	for _, raw := range input {
		state := strings.ToUpper(strings.TrimSpace(raw))
		if state == "" {
			continue
		}
		if _, ok := seen[state]; ok {
			continue
		}
		seen[state] = struct{}{}
		states = append(states, state)
	}
	if len(states) == 0 {
		return []string{"OPEN"}
	}
	return states
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
