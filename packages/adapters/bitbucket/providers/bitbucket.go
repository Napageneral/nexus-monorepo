package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	core "github.com/nexus-project/bitbucket/internal/gitadapter"
)

const defaultBitbucketHost = "https://api.bitbucket.org/2.0"
const pagedRequestRateLimitRetryBudget = 2

type BitbucketProvider struct {
	HTTPClient         *http.Client
	lastUser           string
	lastRateRemaining  int
	lastRateRetryAfter int
}

func (p *BitbucketProvider) ID() string { return "bitbucket" }

func (p *BitbucketProvider) DisplayName() string { return "Bitbucket" }

func (p *BitbucketProvider) ValidateCredentials(ctx context.Context, config core.AccountConfig) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, p.apiURL(config, "/user"), nil)
	if err != nil {
		return err
	}
	p.authorize(request, config)
	response, err := p.client().Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	p.captureRateLimit(response)
	if response.StatusCode != http.StatusOK {
		return apiErrorFromResponse(response)
	}
	var payload struct {
		Username    string `json:"username"`
		DisplayName string `json:"display_name"`
		AccountID   string `json:"account_id"`
	}
	if err := decodeJSONResponse(response, &payload); err != nil {
		return err
	}
	p.lastUser = firstNonBlank(payload.Username, payload.DisplayName, payload.AccountID)
	return nil
}

func (p *BitbucketProvider) ListRepositories(ctx context.Context, config core.AccountConfig) ([]core.Repository, error) {
	workspace := strings.TrimSpace(config.Workspace)
	if workspace != "" {
		return p.listRepositoriesForWorkspace(ctx, config, workspace)
	}

	workspaces, err := p.listAccessibleWorkspaces(ctx, config)
	if err != nil {
		return nil, err
	}
	repositories := make([]core.Repository, 0)
	seen := make(map[string]struct{})
	for _, workspace := range workspaces {
		workspaceRepositories, err := p.listRepositoriesForWorkspace(ctx, config, workspace)
		if err != nil {
			return nil, err
		}
		for _, repository := range workspaceRepositories {
			key := strings.TrimSpace(repository.FullName)
			if key == "" {
				key = strings.TrimSpace(repository.ID)
			}
			if key == "" {
				continue
			}
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			repositories = append(repositories, repository)
		}
	}
	sort.Slice(repositories, func(i, j int) bool {
		return repositories[i].FullName < repositories[j].FullName
	})
	return repositories, nil
}

func (p *BitbucketProvider) GetRepository(ctx context.Context, config core.AccountConfig, repo core.Repository) (*core.Repository, error) {
	fullName := strings.TrimSpace(repo.FullName)
	if fullName == "" {
		fullName = strings.TrimSpace(repo.ID)
	}
	if fullName == "" {
		return nil, fmt.Errorf("repository is required")
	}
	detailed, err := p.getRepositoryDetails(ctx, config, fullName)
	if err != nil {
		return nil, err
	}
	return &detailed, nil
}

func (p *BitbucketProvider) ListWorkspaces(ctx context.Context, config core.AccountConfig) ([]string, error) {
	return p.listAccessibleWorkspaces(ctx, config)
}

func (p *BitbucketProvider) DiscoverRepositoriesForSetup(ctx context.Context, config core.AccountConfig) ([]core.Repository, error) {
	workspace := strings.TrimSpace(config.Workspace)
	if workspace != "" {
		return p.listRepositorySummariesForWorkspace(ctx, config, workspace)
	}

	workspaces, err := p.listAccessibleWorkspaces(ctx, config)
	if err != nil {
		return nil, err
	}
	repositories := make([]core.Repository, 0)
	seen := make(map[string]struct{})
	for _, workspace := range workspaces {
		workspaceRepositories, err := p.listRepositorySummariesForWorkspace(ctx, config, workspace)
		if err != nil {
			return nil, err
		}
		for _, repository := range workspaceRepositories {
			key := strings.TrimSpace(repository.FullName)
			if key == "" {
				key = strings.TrimSpace(repository.ID)
			}
			if key == "" {
				continue
			}
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			repositories = append(repositories, repository)
		}
	}
	sort.Slice(repositories, func(i, j int) bool {
		return repositories[i].FullName < repositories[j].FullName
	})
	return repositories, nil
}

func (p *BitbucketProvider) listAccessibleWorkspaces(ctx context.Context, config core.AccountConfig) ([]string, error) {
	query := url.Values{}
	query.Set("pagelen", "100")
	initialURL := p.apiURL(config, "/user/workspaces?"+query.Encode())

	workspaces := make([]string, 0)
	seen := make(map[string]struct{})
	err := p.paginate(ctx, config, initialURL, func(response *http.Response) error {
		var payload struct {
			Values []struct {
				Workspace struct {
					Slug string `json:"slug"`
					Name string `json:"name"`
					UUID string `json:"uuid"`
				} `json:"workspace"`
			} `json:"values"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			return err
		}
		for _, item := range payload.Values {
			workspace := firstNonBlank(item.Workspace.Slug, item.Workspace.UUID)
			if workspace == "" {
				continue
			}
			if _, ok := seen[workspace]; ok {
				continue
			}
			seen[workspace] = struct{}{}
			workspaces = append(workspaces, workspace)
		}
		return nil
	})
	return workspaces, err
}

func (p *BitbucketProvider) listRepositoriesForWorkspace(ctx context.Context, config core.AccountConfig, workspace string) ([]core.Repository, error) {
	repositories, err := p.listPermittedRepositoriesForWorkspace(ctx, config, workspace)
	if err != nil {
		return nil, err
	}
	if len(repositories) > 0 {
		return repositories, nil
	}
	return p.listWorkspaceRepositoriesViaCatalog(ctx, config, workspace)
}

func (p *BitbucketProvider) listPermittedRepositoriesForWorkspace(ctx context.Context, config core.AccountConfig, workspace string) ([]core.Repository, error) {
	query := url.Values{}
	query.Set("pagelen", "100")
	query.Set("sort", "repository.name")
	initialURL := p.apiURL(config, fmt.Sprintf("/user/workspaces/%s/permissions/repositories?%s", url.PathEscape(workspace), query.Encode()))

	type repositoryPermission struct {
		Repository struct {
			FullName string `json:"full_name"`
			Name     string `json:"name"`
			Slug     string `json:"slug"`
			Links    struct {
				Clone []struct {
					Name string `json:"name"`
					Href string `json:"href"`
				} `json:"clone"`
			} `json:"links"`
			Workspace struct {
				Slug string `json:"slug"`
			} `json:"workspace"`
			Mainbranch struct {
				Name string `json:"name"`
			} `json:"mainbranch"`
		} `json:"repository"`
	}

	repositories := make([]core.Repository, 0)
	seen := make(map[string]struct{})
	err := p.paginate(ctx, config, initialURL, func(response *http.Response) error {
		var payload struct {
			Values []repositoryPermission `json:"values"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			return err
		}
		for _, permission := range payload.Values {
			fullName := strings.TrimSpace(permission.Repository.FullName)
			name := firstNonBlank(permission.Repository.Name, permission.Repository.Slug)
			if fullName == "" && name != "" {
				fullName = strings.Trim(workspace, "{}") + "/" + name
			}
			if fullName == "" {
				continue
			}
			if _, ok := seen[fullName]; ok {
				continue
			}
			seen[fullName] = struct{}{}
			remoteURL := bitbucketCloneURL(permission.Repository.Links.Clone)
			if remoteURL == "" {
				remoteURL = bitbucketRepositoryCloneURL(fullName)
			}
			repositories = append(repositories, core.Repository{
				ID:              fullName,
				FullName:        fullName,
				Name:            firstNonBlank(name, splitRepoName(fullName)),
				RemoteURL:       remoteURL,
				DefaultBranch:   firstNonBlank(permission.Repository.Mainbranch.Name, "main"),
				TrackedBranches: []string{},
			})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(repositories, func(i, j int) bool {
		return repositories[i].FullName < repositories[j].FullName
	})
	return repositories, nil
}

func (p *BitbucketProvider) listRepositorySummariesForWorkspace(ctx context.Context, config core.AccountConfig, workspace string) ([]core.Repository, error) {
	query := url.Values{}
	query.Set("pagelen", "100")
	query.Set("sort", "repository.name")
	initialURL := p.apiURL(config, fmt.Sprintf("/user/workspaces/%s/permissions/repositories?%s", url.PathEscape(workspace), query.Encode()))

	repositories := make([]core.Repository, 0)
	seen := make(map[string]struct{})
	err := p.paginate(ctx, config, initialURL, func(response *http.Response) error {
		var payload struct {
			Values []struct {
				Repository struct {
					FullName string `json:"full_name"`
					Name     string `json:"name"`
				} `json:"repository"`
			} `json:"values"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			return err
		}
		for _, item := range payload.Values {
			fullName := strings.TrimSpace(item.Repository.FullName)
			if fullName == "" {
				continue
			}
			if _, ok := seen[fullName]; ok {
				continue
			}
			seen[fullName] = struct{}{}
			name := strings.TrimSpace(item.Repository.Name)
			if name == "" {
				_, name = splitRepoFullName(fullName)
			}
			repositories = append(repositories, core.Repository{
				ID:              fullName,
				FullName:        fullName,
				Name:            name,
				RemoteURL:       fmt.Sprintf("https://bitbucket.org/%s.git", fullName),
				DefaultBranch:   "main",
				TrackedBranches: []string{},
			})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(repositories, func(i, j int) bool {
		return repositories[i].FullName < repositories[j].FullName
	})
	return repositories, nil
}

func splitRepoName(fullName string) string {
	_, name := splitRepoFullName(fullName)
	return name
}

func bitbucketRepositoryCloneURL(fullName string) string {
	workspace, name := splitRepoFullName(fullName)
	workspace = strings.TrimSpace(workspace)
	name = strings.TrimSpace(name)
	if workspace == "" || name == "" {
		return ""
	}
	return fmt.Sprintf("https://bitbucket.org/%s/%s.git", workspace, name)
}

func (p *BitbucketProvider) getRepositoryDetails(ctx context.Context, config core.AccountConfig, fullName string) (core.Repository, error) {
	workspace, name := splitRepoFullName(fullName)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, p.apiURL(config, fmt.Sprintf("/repositories/%s/%s", url.PathEscape(workspace), url.PathEscape(name))), nil)
	if err != nil {
		return core.Repository{}, err
	}
	p.authorize(request, config)
	response, err := p.client().Do(request)
	if err != nil {
		return core.Repository{}, err
	}
	defer response.Body.Close()
	p.captureRateLimit(response)
	if response.StatusCode != http.StatusOK {
		return core.Repository{}, apiErrorFromResponse(response)
	}
	var payload struct {
		FullName string `json:"full_name"`
		Name     string `json:"name"`
		Slug     string `json:"slug"`
		Links    struct {
			Clone []struct {
				Name string `json:"name"`
				Href string `json:"href"`
			} `json:"clone"`
		} `json:"links"`
		Workspace struct {
			Slug string `json:"slug"`
		} `json:"workspace"`
		Mainbranch struct {
			Name string `json:"name"`
		} `json:"mainbranch"`
	}
	if err := decodeJSONResponse(response, &payload); err != nil {
		return core.Repository{}, err
	}
	resolvedFullName := strings.TrimSpace(payload.FullName)
	if resolvedFullName == "" {
		resolvedFullName = strings.TrimSpace(fullName)
	}
	if resolvedFullName == "" && payload.Workspace.Slug != "" {
		resolvedFullName = payload.Workspace.Slug + "/" + firstNonBlank(payload.Slug, payload.Name)
	}
	return core.Repository{
		ID:              resolvedFullName,
		FullName:        resolvedFullName,
		Name:            firstNonBlank(payload.Name, payload.Slug),
		RemoteURL:       bitbucketCloneURL(payload.Links.Clone),
		DefaultBranch:   firstNonBlank(payload.Mainbranch.Name, "main"),
		TrackedBranches: []string{},
	}, nil
}

func (p *BitbucketProvider) listWorkspaceRepositoriesViaCatalog(ctx context.Context, config core.AccountConfig, workspace string) ([]core.Repository, error) {
	query := url.Values{}
	query.Set("role", "member")
	query.Set("pagelen", "100")
	initialURL := p.apiURL(config, fmt.Sprintf("/repositories/%s?%s", url.PathEscape(workspace), query.Encode()))

	var repositories []core.Repository
	err := p.paginate(ctx, config, initialURL, func(response *http.Response) error {
		var payload struct {
			Values []struct {
				FullName string `json:"full_name"`
				Name     string `json:"name"`
				Slug     string `json:"slug"`
				Links    struct {
					Clone []struct {
						Name string `json:"name"`
						Href string `json:"href"`
					} `json:"clone"`
				} `json:"links"`
				Workspace struct {
					Slug string `json:"slug"`
				} `json:"workspace"`
				Mainbranch struct {
					Name string `json:"name"`
				} `json:"mainbranch"`
			} `json:"values"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			return err
		}
		for _, item := range payload.Values {
			fullName := item.FullName
			if fullName == "" && item.Workspace.Slug != "" {
				fullName = item.Workspace.Slug + "/" + firstNonBlank(item.Slug, item.Name)
			} else if fullName == "" {
				fullName = strings.Trim(workspace, "{}") + "/" + firstNonBlank(item.Slug, item.Name)
			}
			repositories = append(repositories, core.Repository{
				ID:              fullName,
				FullName:        fullName,
				Name:            firstNonBlank(item.Name, item.Slug),
				RemoteURL:       bitbucketCloneURL(item.Links.Clone),
				DefaultBranch:   firstNonBlank(item.Mainbranch.Name, "main"),
				TrackedBranches: []string{},
			})
		}
		return nil
	})
	return repositories, err
}

func (p *BitbucketProvider) ListBranches(ctx context.Context, config core.AccountConfig, repo core.Repository) ([]string, error) {
	workspace, name := splitRepoFullName(repo.FullName)
	query := url.Values{}
	query.Set("sort", "name")
	query.Set("pagelen", "100")
	initialURL := p.apiURL(config, fmt.Sprintf("/repositories/%s/%s/refs/branches?%s", url.PathEscape(workspace), url.PathEscape(name), query.Encode()))

	branches := make([]string, 0)
	seen := make(map[string]struct{})
	err := p.paginate(ctx, config, initialURL, func(response *http.Response) error {
		var payload struct {
			Values []struct {
				Name string `json:"name"`
			} `json:"values"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			return err
		}
		for _, item := range payload.Values {
			name := strings.TrimSpace(item.Name)
			if name == "" {
				continue
			}
			if _, ok := seen[name]; ok {
				continue
			}
			seen[name] = struct{}{}
			branches = append(branches, name)
		}
		return nil
	})
	return branches, err
}

func (p *BitbucketProvider) GetCommits(ctx context.Context, config core.AccountConfig, repo core.Repository, since time.Time) ([]core.Commit, error) {
	workspace, name := splitRepoFullName(repo.FullName)
	var commits []core.Commit
	branches := append([]string(nil), repo.TrackedBranches...)
	var err error
	if len(branches) == 0 {
		if since.IsZero() && strings.TrimSpace(repo.DefaultBranch) != "" {
			branches = []string{strings.TrimSpace(repo.DefaultBranch)}
		} else if since.IsZero() {
			branches, err = p.ListBranches(ctx, config, repo)
		} else {
			branches, err = p.listBranchesUpdatedSince(ctx, config, repo, since)
		}
		if err != nil {
			return nil, err
		}
	}
	for _, branch := range branchRefs(repo, branches) {
		query := url.Values{}
		query.Set("include", branch)
		query.Set("pagelen", "100")
		if !since.IsZero() {
			query.Set("q", fmt.Sprintf(`date >= "%s"`, since.UTC().Format(time.RFC3339)))
		}
		initialURL := p.apiURL(config, fmt.Sprintf("/repositories/%s/%s/commits?%s", url.PathEscape(workspace), url.PathEscape(name), query.Encode()))
		err = p.paginate(ctx, config, initialURL, func(response *http.Response) error {
			var payload struct {
				Values []struct {
					Hash    string `json:"hash"`
					Message string `json:"message"`
					Date    string `json:"date"`
					Author  struct {
						Raw string `json:"raw"`
					} `json:"author"`
					Parents []struct {
						Hash string `json:"hash"`
					} `json:"parents"`
				} `json:"values"`
			}
			if err := decodeJSONResponse(response, &payload); err != nil {
				return err
			}
			for _, item := range payload.Values {
				ts := parseMillis(item.Date)
				if !since.IsZero() && ts < since.UnixMilli() {
					continue
				}
				authorName, authorEmail := parseAuthorRaw(item.Author.Raw)
				parents := make([]string, 0, len(item.Parents))
				for _, parent := range item.Parents {
					parents = append(parents, parent.Hash)
				}
				commits = append(commits, core.Commit{
					SHA:         item.Hash,
					Message:     item.Message,
					AuthorEmail: authorEmail,
					AuthorName:  authorName,
					Timestamp:   ts,
					Parents:     parents,
					Refs:        []string{"refs/heads/" + branch},
					Repo:        repo,
				})
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	return commits, nil
}

func (p *BitbucketProvider) listBranchesUpdatedSince(ctx context.Context, config core.AccountConfig, repo core.Repository, since time.Time) ([]string, error) {
	workspace, name := splitRepoFullName(repo.FullName)
	query := url.Values{}
	query.Set("sort", "-target.date")
	query.Set("pagelen", "100")
	initialURL := p.apiURL(config, fmt.Sprintf("/repositories/%s/%s/refs/branches?%s", url.PathEscape(workspace), url.PathEscape(name), query.Encode()))

	branches := make([]string, 0)
	seen := make(map[string]struct{})
	nextURL := initialURL
	for nextURL != "" {
		response, err := p.getPageWithRetry(ctx, config, nextURL)
		if err != nil {
			return nil, err
		}
		var payload struct {
			Next   string `json:"next"`
			Values []struct {
				Name   string `json:"name"`
				Target struct {
					Date string `json:"date"`
				} `json:"target"`
			} `json:"values"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			response.Body.Close()
			return nil, err
		}
		response.Body.Close()

		stop := false
		for _, item := range payload.Values {
			name := strings.TrimSpace(item.Name)
			if name == "" {
				continue
			}
			targetDate := parseMillis(item.Target.Date)
			if !since.IsZero() && targetDate > 0 && targetDate < since.UnixMilli() {
				stop = true
				continue
			}
			if _, ok := seen[name]; ok {
				continue
			}
			seen[name] = struct{}{}
			branches = append(branches, name)
		}
		if stop {
			break
		}
		nextURL = strings.TrimSpace(payload.Next)
	}
	return branches, nil
}

func (p *BitbucketProvider) GetCommitDiff(ctx context.Context, config core.AccountConfig, repo core.Repository, sha string) ([]byte, error) {
	workspace, name := splitRepoFullName(repo.FullName)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, p.apiURL(config, fmt.Sprintf("/repositories/%s/%s/diff/%s", url.PathEscape(workspace), url.PathEscape(name), url.PathEscape(sha))), nil)
	if err != nil {
		return nil, err
	}
	p.authorize(request, config)
	response, err := p.client().Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, apiErrorFromResponse(response)
	}
	return readTextResponse(response)
}

func (p *BitbucketProvider) GetPullRequests(ctx context.Context, config core.AccountConfig, repo core.Repository, since time.Time) ([]core.PullRequest, error) {
	workspace, name := splitRepoFullName(repo.FullName)
	query := url.Values{}
	query.Add("state", "OPEN")
	query.Add("state", "MERGED")
	query.Add("state", "DECLINED")
	query.Set("sort", "-updated_on")
	query.Set("pagelen", "50")
	if !since.IsZero() {
		query.Set("q", fmt.Sprintf(`updated_on >= "%s"`, since.UTC().Format(time.RFC3339)))
	}
	initialURL := p.apiURL(config, fmt.Sprintf("/repositories/%s/%s/pullrequests?%s", url.PathEscape(workspace), url.PathEscape(name), query.Encode()))
	var prs []core.PullRequest
	err := p.paginate(ctx, config, initialURL, func(response *http.Response) error {
		var payload struct {
			Values []struct {
				ID          int    `json:"id"`
				Title       string `json:"title"`
				Description string `json:"description"`
				State       string `json:"state"`
				CreatedOn   string `json:"created_on"`
				UpdatedOn   string `json:"updated_on"`
				Author      struct {
					DisplayName string `json:"display_name"`
				} `json:"author"`
				Source struct {
					Commit struct {
						Hash string `json:"hash"`
					} `json:"commit"`
					Branch struct {
						Name string `json:"name"`
					} `json:"branch"`
				} `json:"source"`
				Destination struct {
					Branch struct {
						Name string `json:"name"`
					} `json:"branch"`
				} `json:"destination"`
				Reviewers []struct {
					DisplayName string `json:"display_name"`
				} `json:"reviewers"`
			} `json:"values"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			return err
		}
		for _, item := range payload.Values {
			updatedAt := parseMillis(item.UpdatedOn)
			if !since.IsZero() && updatedAt < since.UnixMilli() {
				continue
			}
			headCommitSHA := strings.TrimSpace(item.Source.Commit.Hash)
			if bitbucketCommitHashLooksAbbreviated(headCommitSHA) {
				expanded, err := p.expandCommitHash(ctx, config, repo, headCommitSHA)
				if err != nil {
					return err
				}
				headCommitSHA = expanded
			}
			reviewers := make([]string, 0, len(item.Reviewers))
			for _, reviewer := range item.Reviewers {
				reviewers = append(reviewers, reviewer.DisplayName)
			}
			prs = append(prs, core.PullRequest{
				ID:            strconv.Itoa(item.ID),
				Title:         item.Title,
				Description:   item.Description,
				State:         normalizeBitbucketPRState(item.State),
				AuthorEmail:   item.Author.DisplayName,
				AuthorName:    item.Author.DisplayName,
				HeadCommitSHA: headCommitSHA,
				SourceBranch:  item.Source.Branch.Name,
				TargetBranch:  item.Destination.Branch.Name,
				Reviewers:     reviewers,
				CreatedAt:     parseMillis(item.CreatedOn),
				UpdatedAt:     updatedAt,
				Repo:          repo,
			})
		}
		return nil
	})
	return prs, err
}

func (p *BitbucketProvider) GetPullRequest(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string) (*core.PullRequest, error) {
	workspace, name := splitRepoFullName(repo.FullName)
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		p.apiURL(
			config,
			fmt.Sprintf(
				"/repositories/%s/%s/pullrequests/%s",
				url.PathEscape(workspace),
				url.PathEscape(name),
				url.PathEscape(strings.TrimSpace(prID)),
			),
		),
		nil,
	)
	if err != nil {
		return nil, err
	}
	p.authorize(request, config)
	response, err := p.client().Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	p.captureRateLimit(response)
	if response.StatusCode != http.StatusOK {
		return nil, apiErrorFromResponse(response)
	}
	var payload struct {
		ID          int    `json:"id"`
		Title       string `json:"title"`
		Description string `json:"description"`
		State       string `json:"state"`
		CreatedOn   string `json:"created_on"`
		UpdatedOn   string `json:"updated_on"`
		Author      struct {
			DisplayName string `json:"display_name"`
		} `json:"author"`
		Source struct {
			Commit struct {
				Hash string `json:"hash"`
			} `json:"commit"`
			Branch struct {
				Name string `json:"name"`
			} `json:"branch"`
		} `json:"source"`
		Destination struct {
			Branch struct {
				Name string `json:"name"`
			} `json:"branch"`
		} `json:"destination"`
		Reviewers []struct {
			DisplayName string `json:"display_name"`
		} `json:"reviewers"`
	}
	if err := decodeJSONResponse(response, &payload); err != nil {
		return nil, err
	}
	headCommitSHA := strings.TrimSpace(payload.Source.Commit.Hash)
	if bitbucketCommitHashLooksAbbreviated(headCommitSHA) {
		expanded, err := p.expandCommitHash(ctx, config, repo, headCommitSHA)
		if err != nil {
			return nil, err
		}
		headCommitSHA = expanded
	}
	reviewers := make([]string, 0, len(payload.Reviewers))
	for _, reviewer := range payload.Reviewers {
		reviewers = append(reviewers, reviewer.DisplayName)
	}
	return &core.PullRequest{
		ID:            strconv.Itoa(payload.ID),
		Title:         payload.Title,
		Description:   payload.Description,
		State:         normalizeBitbucketPRState(payload.State),
		AuthorEmail:   payload.Author.DisplayName,
		AuthorName:    payload.Author.DisplayName,
		HeadCommitSHA: headCommitSHA,
		SourceBranch:  payload.Source.Branch.Name,
		TargetBranch:  payload.Destination.Branch.Name,
		Reviewers:     reviewers,
		CreatedAt:     parseMillis(payload.CreatedOn),
		UpdatedAt:     parseMillis(payload.UpdatedOn),
		Repo:          repo,
	}, nil
}

func (p *BitbucketProvider) ListPullRequestsPage(ctx context.Context, config core.AccountConfig, repo core.Repository, opts core.PullRequestListOptions) (*core.PullRequestListPage, error) {
	workspace, name := splitRepoFullName(repo.FullName)
	states := opts.States
	if len(states) == 0 {
		states = []string{"OPEN"}
	}
	pageLen := opts.PageLen
	if pageLen <= 0 {
		pageLen = 10
	}
	if pageLen > 50 {
		pageLen = 50
	}
	pageNumber := opts.Page
	if pageNumber <= 0 {
		pageNumber = 1
	}
	query := url.Values{}
	for _, state := range states {
		query.Add("state", strings.ToUpper(strings.TrimSpace(state)))
	}
	query.Set("sort", "-updated_on")
	query.Set("pagelen", strconv.Itoa(pageLen))
	query.Set("page", strconv.Itoa(pageNumber))
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		p.apiURL(config, fmt.Sprintf("/repositories/%s/%s/pullrequests?%s", url.PathEscape(workspace), url.PathEscape(name), query.Encode())),
		nil,
	)
	if err != nil {
		return nil, err
	}
	p.authorize(request, config)
	response, err := p.client().Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	p.captureRateLimit(response)
	if response.StatusCode != http.StatusOK {
		return nil, apiErrorFromResponse(response)
	}
	var payload struct {
		Next    string `json:"next"`
		Page    int    `json:"page"`
		Pagelen int    `json:"pagelen"`
		Values  []struct {
			ID          int    `json:"id"`
			Title       string `json:"title"`
			Description string `json:"description"`
			State       string `json:"state"`
			CreatedOn   string `json:"created_on"`
			UpdatedOn   string `json:"updated_on"`
			Author      struct {
				DisplayName string `json:"display_name"`
			} `json:"author"`
			Source struct {
				Commit struct {
					Hash string `json:"hash"`
				} `json:"commit"`
				Branch struct {
					Name string `json:"name"`
				} `json:"branch"`
			} `json:"source"`
			Destination struct {
				Branch struct {
					Name string `json:"name"`
				} `json:"branch"`
			} `json:"destination"`
			Reviewers []struct {
				DisplayName string `json:"display_name"`
			} `json:"reviewers"`
		} `json:"values"`
	}
	if err := decodeJSONResponse(response, &payload); err != nil {
		return nil, err
	}
	pullRequests := make([]core.PullRequest, 0, len(payload.Values))
	for _, item := range payload.Values {
		reviewers := make([]string, 0, len(item.Reviewers))
		for _, reviewer := range item.Reviewers {
			reviewers = append(reviewers, reviewer.DisplayName)
		}
		pullRequests = append(pullRequests, core.PullRequest{
			ID:            strconv.Itoa(item.ID),
			Title:         item.Title,
			Description:   item.Description,
			State:         normalizeBitbucketPRState(item.State),
			AuthorEmail:   item.Author.DisplayName,
			AuthorName:    item.Author.DisplayName,
			HeadCommitSHA: strings.TrimSpace(item.Source.Commit.Hash),
			SourceBranch:  item.Source.Branch.Name,
			TargetBranch:  item.Destination.Branch.Name,
			Reviewers:     reviewers,
			CreatedAt:     parseMillis(item.CreatedOn),
			UpdatedAt:     parseMillis(item.UpdatedOn),
			Repo:          repo,
		})
	}
	return &core.PullRequestListPage{
		PullRequests: pullRequests,
		Next:         strings.TrimSpace(payload.Next),
		Page:         payload.Page,
		PageLen:      payload.Pagelen,
	}, nil
}

func (p *BitbucketProvider) expandCommitHash(ctx context.Context, config core.AccountConfig, repo core.Repository, hash string) (string, error) {
	workspace, name := splitRepoFullName(repo.FullName)
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		p.apiURL(
			config,
			fmt.Sprintf(
				"/repositories/%s/%s/commit/%s",
				url.PathEscape(workspace),
				url.PathEscape(name),
				url.PathEscape(hash),
			),
		),
		nil,
	)
	if err != nil {
		return "", err
	}
	p.authorize(request, config)
	response, err := p.client().Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	p.captureRateLimit(response)
	if response.StatusCode != http.StatusOK {
		return "", apiErrorFromResponse(response)
	}
	var payload struct {
		Hash string `json:"hash"`
	}
	if err := decodeJSONResponse(response, &payload); err != nil {
		return "", err
	}
	expanded := strings.TrimSpace(payload.Hash)
	if expanded == "" {
		return "", fmt.Errorf("bitbucket commit lookup returned empty hash for %s", hash)
	}
	return expanded, nil
}

func bitbucketCommitHashLooksAbbreviated(hash string) bool {
	trimmed := strings.TrimSpace(hash)
	return trimmed != "" && len(trimmed) < 40
}

func (p *BitbucketProvider) GetPullRequestDiff(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string) ([]byte, error) {
	workspace, name := splitRepoFullName(repo.FullName)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, p.apiURL(config, fmt.Sprintf("/repositories/%s/%s/pullrequests/%s/diff", url.PathEscape(workspace), url.PathEscape(name), url.PathEscape(prID))), nil)
	if err != nil {
		return nil, err
	}
	p.authorize(request, config)
	response, err := p.client().Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, apiErrorFromResponse(response)
	}
	return readTextResponse(response)
}

func (p *BitbucketProvider) GetPullRequestSourceArchive(ctx context.Context, config core.AccountConfig, repo core.Repository, pr core.PullRequest) (*core.SourceArchive, error) {
	workspace, name := splitRepoFullName(repo.FullName)
	sha := strings.TrimSpace(pr.HeadCommitSHA)
	if sha == "" {
		return nil, nil
	}
	publicBase := strings.TrimSpace(repo.RemoteURL)
	if publicBase == "" {
		publicBase = fmt.Sprintf("https://bitbucket.org/%s/%s.git", workspace, name)
	}
	parsed, err := url.Parse(publicBase)
	if err != nil || strings.TrimSpace(parsed.Scheme) == "" || strings.TrimSpace(parsed.Host) == "" {
		publicBase = fmt.Sprintf("https://bitbucket.org/%s/%s.git", workspace, name)
		parsed, _ = url.Parse(publicBase)
	}
	archiveURL := fmt.Sprintf("%s://%s/%s/%s/get/%s.zip", parsed.Scheme, parsed.Host, url.PathEscape(workspace), url.PathEscape(name), url.PathEscape(sha))
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, archiveURL, nil)
	if err != nil {
		return nil, err
	}
	p.authorize(request, config)
	response, err := p.client().Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	p.captureRateLimit(response)
	if response.StatusCode != http.StatusOK {
		return nil, apiErrorFromResponse(response)
	}

	tempFile, err := os.CreateTemp("", "bitbucket-source-archive-*.zip")
	if err != nil {
		return nil, fmt.Errorf("create temp source archive: %w", err)
	}
	if _, err := io.Copy(tempFile, response.Body); err != nil {
		_ = tempFile.Close()
		_ = os.Remove(tempFile.Name())
		return nil, fmt.Errorf("stream source archive: %w", err)
	}
	if err := tempFile.Close(); err != nil {
		_ = os.Remove(tempFile.Name())
		return nil, fmt.Errorf("close temp source archive: %w", err)
	}
	return &core.SourceArchive{
		Filename:      fmt.Sprintf("pr-%s-%s.zip", pr.ID, sha),
		MIMEType:      "application/zip",
		ArchiveFormat: "zip",
		LocalPath:     tempFile.Name(),
	}, nil
}

func (p *BitbucketProvider) GetPullRequestComments(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string, since time.Time) ([]core.Comment, error) {
	workspace, name := splitRepoFullName(repo.FullName)
	query := url.Values{}
	query.Set("sort", "-created_on")
	query.Set("pagelen", "50")
	initialURL := p.apiURL(config, fmt.Sprintf("/repositories/%s/%s/pullrequests/%s/comments?%s", url.PathEscape(workspace), url.PathEscape(name), url.PathEscape(prID), query.Encode()))
	var comments []core.Comment
	nextURL := initialURL
	for nextURL != "" {
		response, err := p.getPageWithRetry(ctx, config, nextURL)
		if err != nil {
			return nil, err
		}

		var payload struct {
			Next   string `json:"next"`
			Values []struct {
				ID        int    `json:"id"`
				CreatedOn string `json:"created_on"`
				UpdatedOn string `json:"updated_on"`
				Content   struct {
					Raw string `json:"raw"`
				} `json:"content"`
				User struct {
					DisplayName string `json:"display_name"`
				} `json:"user"`
				Inline struct {
					Path string `json:"path"`
					From int    `json:"from"`
					To   int    `json:"to"`
				} `json:"inline"`
			} `json:"values"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			response.Body.Close()
			return nil, err
		}
		response.Body.Close()

		stop := false
		for _, item := range payload.Values {
			createdAt := parseMillis(item.CreatedOn)
			if !since.IsZero() && createdAt < since.UnixMilli() {
				stop = true
				continue
			}
			line := item.Inline.To
			if line == 0 {
				line = item.Inline.From
			}
			comments = append(comments, core.Comment{
				ID:          strconv.Itoa(item.ID),
				Body:        item.Content.Raw,
				AuthorEmail: item.User.DisplayName,
				AuthorName:  item.User.DisplayName,
				CreatedAt:   createdAt,
				UpdatedAt:   parseMillis(item.UpdatedOn),
				PRID:        prID,
				Inline:      strings.TrimSpace(item.Inline.Path) != "",
				FilePath:    item.Inline.Path,
				Line:        line,
				Repo:        repo,
			})
		}
		if stop {
			break
		}
		nextURL = strings.TrimSpace(payload.Next)
	}
	return comments, nil
}

func (p *BitbucketProvider) CreatePullRequest(ctx context.Context, config core.AccountConfig, repo core.Repository, req core.CreatePRRequest) (*core.PullRequest, error) {
	workspace, name := splitRepoFullName(repo.FullName)
	reviewers := make([]map[string]string, 0, len(req.Reviewers))
	for _, reviewer := range req.Reviewers {
		reviewers = append(reviewers, map[string]string{"username": reviewer})
	}
	raw, _ := json.Marshal(map[string]any{
		"title":       req.Title,
		"description": req.Description,
		"source":      map[string]any{"branch": map[string]string{"name": req.SourceBranch}},
		"destination": map[string]any{"branch": map[string]string{"name": req.TargetBranch}},
		"reviewers":   reviewers,
	})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.apiURL(config, fmt.Sprintf("/repositories/%s/%s/pullrequests", url.PathEscape(workspace), url.PathEscape(name))), bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	p.authorize(request, config)
	request.Header.Set("Content-Type", "application/json")
	response, err := p.client().Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated && response.StatusCode != http.StatusOK {
		return nil, apiErrorFromResponse(response)
	}
	var created struct {
		ID          int    `json:"id"`
		Title       string `json:"title"`
		Description string `json:"description"`
	}
	if err := decodeJSONResponse(response, &created); err != nil {
		return nil, err
	}
	return &core.PullRequest{ID: strconv.Itoa(created.ID), Title: created.Title, Description: created.Description, Repo: repo}, nil
}

func (p *BitbucketProvider) PostComment(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string, body string) (*core.Comment, error) {
	workspace, name := splitRepoFullName(repo.FullName)
	raw, _ := json.Marshal(map[string]any{"content": map[string]string{"raw": body}})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.apiURL(config, fmt.Sprintf("/repositories/%s/%s/pullrequests/%s/comments", url.PathEscape(workspace), url.PathEscape(name), url.PathEscape(prID))), bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	p.authorize(request, config)
	request.Header.Set("Content-Type", "application/json")
	response, err := p.client().Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated && response.StatusCode != http.StatusOK {
		return nil, apiErrorFromResponse(response)
	}
	var created struct {
		ID      int `json:"id"`
		Content struct {
			Raw string `json:"raw"`
		} `json:"content"`
	}
	if err := decodeJSONResponse(response, &created); err != nil {
		return nil, err
	}
	return &core.Comment{ID: strconv.Itoa(created.ID), Body: created.Content.Raw, PRID: prID, Repo: repo}, nil
}

func (p *BitbucketProvider) MergePullRequest(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string, strategy core.MergeStrategy) error {
	workspace, name := splitRepoFullName(repo.FullName)
	raw, _ := json.Marshal(map[string]any{"merge_strategy": string(strategy)})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.apiURL(config, fmt.Sprintf("/repositories/%s/%s/pullrequests/%s/merge", url.PathEscape(workspace), url.PathEscape(name), url.PathEscape(prID))), bytes.NewReader(raw))
	if err != nil {
		return err
	}
	p.authorize(request, config)
	request.Header.Set("Content-Type", "application/json")
	response, err := p.client().Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusCreated {
		return apiErrorFromResponse(response)
	}
	return nil
}

func (p *BitbucketProvider) CreateBranch(ctx context.Context, config core.AccountConfig, repo core.Repository, branchName string, fromRef string) error {
	workspace, name := splitRepoFullName(repo.FullName)
	raw, _ := json.Marshal(map[string]any{
		"name": branchName,
		"target": map[string]string{
			"hash": fromRef,
		},
	})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.apiURL(config, fmt.Sprintf("/repositories/%s/%s/refs/branches", url.PathEscape(workspace), url.PathEscape(name))), bytes.NewReader(raw))
	if err != nil {
		return err
	}
	p.authorize(request, config)
	request.Header.Set("Content-Type", "application/json")
	response, err := p.client().Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated && response.StatusCode != http.StatusOK {
		return apiErrorFromResponse(response)
	}
	return nil
}

func (p *BitbucketProvider) paginate(ctx context.Context, config core.AccountConfig, initialURL string, handler func(response *http.Response) error) error {
	nextURL := initialURL
	for nextURL != "" {
		response, err := p.getPageWithRetry(ctx, config, nextURL)
		if err != nil {
			return err
		}
		var envelope struct {
			Next string `json:"next"`
		}
		body, err := readTextResponse(response)
		if err != nil {
			response.Body.Close()
			return err
		}
		response.Body.Close()
		response.Body = ioNopCloser(bytes.NewReader(body))
		if err := handler(response); err != nil {
			return err
		}
		_ = json.Unmarshal(body, &envelope)
		nextURL = strings.TrimSpace(envelope.Next)
	}
	return nil
}

func (p *BitbucketProvider) getPageWithRetry(ctx context.Context, config core.AccountConfig, requestURL string) (*http.Response, error) {
	consecutiveRateLimits := 0
	for {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
		if err != nil {
			return nil, err
		}
		p.authorize(request, config)
		response, err := p.client().Do(request)
		if err != nil {
			return nil, err
		}
		p.captureRateLimit(response)
		if response.StatusCode == http.StatusOK {
			return response, nil
		}

		err = apiErrorFromResponse(response)
		response.Body.Close()

		var apiErr *core.APIError
		if !errors.As(err, &apiErr) || apiErr.StatusCode != http.StatusTooManyRequests {
			return nil, err
		}

		consecutiveRateLimits++
		cooldown := pageRateLimitCooldown(apiErr, consecutiveRateLimits)
		fmt.Fprintf(
			os.Stderr,
			"[INFO] paged request rate limited url=%s cooldown_ms=%d retry=%d\n",
			requestURL,
			cooldown.Milliseconds(),
			consecutiveRateLimits,
		)
		if consecutiveRateLimits >= pagedRequestRateLimitRetryBudget {
			return nil, apiErr
		}
		if err := waitForPageRateLimitCooldown(ctx, cooldown); err != nil {
			return nil, err
		}
	}
}

func pageRateLimitCooldown(apiErr *core.APIError, consecutiveRateLimits int) time.Duration {
	if apiErr != nil && apiErr.RetryAfterMs > 0 {
		return time.Duration(apiErr.RetryAfterMs) * time.Millisecond
	}
	if consecutiveRateLimits < 1 {
		consecutiveRateLimits = 1
	}
	cooldown := time.Duration(consecutiveRateLimits) * time.Minute
	if cooldown > 10*time.Minute {
		cooldown = 10 * time.Minute
	}
	return cooldown
}

func waitForPageRateLimitCooldown(ctx context.Context, duration time.Duration) error {
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

func (p *BitbucketProvider) ValidationDetails() map[string]any {
	return map[string]any{
		"user":                 p.lastUser,
		"rate_limit_remaining": p.lastRateRemaining,
	}
}

func (p *BitbucketProvider) client() *http.Client {
	if p.HTTPClient != nil {
		return p.HTTPClient
	}
	return http.DefaultClient
}

func (p *BitbucketProvider) apiURL(config core.AccountConfig, path string) string {
	host := strings.TrimSpace(config.Host)
	if host == "" {
		host = defaultBitbucketHost
	}
	if !strings.Contains(host, "://") {
		host = "https://" + host
	}
	parsed, err := url.Parse(host)
	if err == nil {
		switch strings.TrimRight(parsed.Path, "/") {
		case "":
			parsed.Path = "/2.0"
			host = parsed.String()
		case "/2.0":
			host = parsed.String()
		}
	}
	return strings.TrimRight(host, "/") + path
}

func (p *BitbucketProvider) authorize(request *http.Request, config core.AccountConfig) {
	if strings.TrimSpace(config.Username) != "" {
		request.Header.Set("Authorization", basicAuthHeader(config.Username, config.Token))
	} else {
		request.Header.Set("Authorization", "Bearer "+config.Token)
	}
	request.Header.Set("Accept", "application/json")
}

func (p *BitbucketProvider) captureRateLimit(response *http.Response) {
	p.lastRateRemaining = 0
	p.lastRateRetryAfter = 0
	if remaining := strings.TrimSpace(response.Header.Get("X-RateLimit-Remaining")); remaining != "" {
		if value, err := strconv.Atoi(remaining); err == nil {
			p.lastRateRemaining = value
		}
	}
	if retryAfter := strings.TrimSpace(response.Header.Get("Retry-After")); retryAfter != "" {
		if value, err := strconv.Atoi(retryAfter); err == nil {
			p.lastRateRetryAfter = value
		}
	}
}

func normalizeBitbucketPRState(raw string) string {
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case "OPEN":
		return "open"
	case "MERGED":
		return "merged"
	case "DECLINED":
		return "declined"
	case "CLOSED":
		return "closed"
	default:
		return strings.ToLower(strings.TrimSpace(raw))
	}
}

func bitbucketCloneURL(clones []struct {
	Name string `json:"name"`
	Href string `json:"href"`
}) string {
	for _, clone := range clones {
		if strings.EqualFold(strings.TrimSpace(clone.Name), "https") && strings.TrimSpace(clone.Href) != "" {
			return canonicalRemoteURL(clone.Href)
		}
	}
	for _, clone := range clones {
		if strings.TrimSpace(clone.Href) != "" {
			return canonicalRemoteURL(clone.Href)
		}
	}
	return ""
}

type nopReadCloser struct {
	*bytes.Reader
}

func (n nopReadCloser) Close() error { return nil }

func ioNopCloser(reader *bytes.Reader) nopReadCloser {
	return nopReadCloser{Reader: reader}
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
