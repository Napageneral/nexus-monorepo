package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	core "github.com/nexus-project/github/internal/gitadapter"
	providerimpl "github.com/nexus-project/github/providers"
)

type AccountConfig = core.AccountConfig
type AccountsFile = core.AccountsFile
type Repository = core.Repository
type Commit = core.Commit
type PullRequest = core.PullRequest
type PullRequestFile = core.PullRequestFile
type PullRequestReview = core.PullRequestReview
type Comment = core.Comment
type CreatePRRequest = core.CreatePRRequest
type MergeStrategy = core.MergeStrategy
type SourceArchive = core.SourceArchive

type Provider interface {
	ID() string
	DisplayName() string
	ValidateCredentials(ctx context.Context, config AccountConfig) error
	GetCurrentUser(ctx context.Context, config AccountConfig) (string, error)
	DiscoverRepositoriesForSetup(ctx context.Context, config AccountConfig) ([]Repository, error)
	ListRepositories(ctx context.Context, config AccountConfig) ([]Repository, error)
	GetRepository(ctx context.Context, config AccountConfig, repo Repository) (*Repository, error)
	ListBranches(ctx context.Context, config AccountConfig, repo Repository) ([]string, error)
	GetCommits(ctx context.Context, config AccountConfig, repo Repository, since time.Time) ([]Commit, error)
	GetCommitDiff(ctx context.Context, config AccountConfig, repo Repository, sha string) ([]byte, error)
	GetPullRequests(ctx context.Context, config AccountConfig, repo Repository, since time.Time) ([]PullRequest, error)
	GetPullRequest(ctx context.Context, config AccountConfig, repo Repository, prID string) (*PullRequest, error)
	GetPullRequestDiff(ctx context.Context, config AccountConfig, repo Repository, prID string) ([]byte, error)
	GetPullRequestFiles(ctx context.Context, config AccountConfig, repo Repository, prID string) ([]PullRequestFile, error)
	GetPullRequestReviews(ctx context.Context, config AccountConfig, repo Repository, prID string) ([]PullRequestReview, error)
	GetPullRequestCommits(ctx context.Context, config AccountConfig, repo Repository, prID string) ([]Commit, error)
	GetPullRequestSourceArchive(ctx context.Context, config AccountConfig, repo Repository, pr PullRequest) (*SourceArchive, error)
	GetPullRequestComments(ctx context.Context, config AccountConfig, repo Repository, prID string, since time.Time) ([]Comment, error)
	CreatePullRequest(ctx context.Context, config AccountConfig, repo Repository, req CreatePRRequest) (*PullRequest, error)
	PostComment(ctx context.Context, config AccountConfig, repo Repository, prID string, body string) (*Comment, error)
	MergePullRequest(ctx context.Context, config AccountConfig, repo Repository, prID string, strategy MergeStrategy) error
	CreateBranch(ctx context.Context, config AccountConfig, repo Repository, branchName string, fromRef string) error
}

var providers = map[string]func() Provider{
	platformID: func() Provider { return &providerimpl.GitHubProvider{} },
}

func GetProvider(id string) (Provider, error) {
	key := platformID
	if trimmed := strings.TrimSpace(id); trimmed != "" {
		key = trimmed
	}
	factory, ok := providers[key]
	if !ok {
		return nil, fmt.Errorf("%w: %s", core.ErrUnknownProvider, id)
	}
	return factory(), nil
}
