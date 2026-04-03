package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	core "github.com/nexus-project/github/internal/gitadapter"
)

const defaultGitHubHost = "https://api.github.com"

type GitHubProvider struct {
	HTTPClient         *http.Client
	lastUser           string
	lastRateRemaining  int
	lastRateRetryAfter int
}

func (p *GitHubProvider) ID() string { return "github" }

func (p *GitHubProvider) DisplayName() string { return "GitHub" }

func (p *GitHubProvider) ValidateCredentials(ctx context.Context, config core.AccountConfig) error {
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
		rateLimited := isGitHubRateLimitResponse(response)
		apiErr := apiErrorFromResponse(response)
		if rateLimited {
			if fallbackErr := p.validateCredentialsViaGraphQL(ctx, config); fallbackErr == nil {
				return nil
			}
		}
		return apiErr
	}

	var payload struct {
		Login string `json:"login"`
		Email string `json:"email"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return fmt.Errorf("decode github user: %w", err)
	}

	p.lastUser = strings.TrimSpace(payload.Email)
	if p.lastUser == "" {
		p.lastUser = strings.TrimSpace(payload.Login)
	}
	return nil
}

func (p *GitHubProvider) GetCurrentUser(ctx context.Context, config core.AccountConfig) (string, error) {
	if err := p.validateCredentialsViaGraphQL(ctx, config); err == nil {
		return strings.TrimSpace(p.lastUser), nil
	}

	username := strings.TrimSpace(config.Username)
	if username == "" {
		if workspace := strings.TrimSpace(config.Workspace); workspace != "" {
			username = strings.TrimSuffix(workspace, "#user")
		}
	}
	if username == "" {
		return "", fmt.Errorf("github current user unavailable: username is required when GraphQL viewer lookup is unavailable")
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, p.apiURL(config, fmt.Sprintf("/users/%s", url.PathEscape(username))), nil)
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
		Login string `json:"login"`
		Email string `json:"email"`
	}
	if err := decodeJSONResponse(response, &payload); err != nil {
		return "", fmt.Errorf("decode github public user: %w", err)
	}

	user := strings.TrimSpace(payload.Email)
	if user == "" {
		user = strings.TrimSpace(payload.Login)
	}
	if user == "" {
		return "", fmt.Errorf("github public user response did not include an identity")
	}
	p.lastUser = user
	return user, nil
}

func (p *GitHubProvider) validateCredentialsViaGraphQL(ctx context.Context, config core.AccountConfig) error {
	body := bytes.NewBufferString(`{"query":"query { viewer { login email } }"}`)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.apiURL(config, "/graphql"), body)
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

	p.captureRateLimit(response)
	if response.StatusCode != http.StatusOK {
		return apiErrorFromResponse(response)
	}

	var payload struct {
		Data struct {
			Viewer struct {
				Login string `json:"login"`
				Email string `json:"email"`
			} `json:"viewer"`
		} `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := decodeJSONResponse(response, &payload); err != nil {
		return fmt.Errorf("decode github graphql viewer: %w", err)
	}
	if len(payload.Errors) > 0 {
		return fmt.Errorf("github graphql viewer failed: %s", strings.TrimSpace(payload.Errors[0].Message))
	}

	p.lastUser = strings.TrimSpace(payload.Data.Viewer.Email)
	if p.lastUser == "" {
		p.lastUser = strings.TrimSpace(payload.Data.Viewer.Login)
	}
	if p.lastUser == "" {
		return fmt.Errorf("github graphql viewer response did not include a user identity")
	}
	return nil
}

func (p *GitHubProvider) DiscoverRepositoriesForSetup(ctx context.Context, config core.AccountConfig) ([]core.Repository, error) {
	nextURL := p.apiURL(config, "/user/repos?per_page=100")
	useWorkspaceListing := false
	if workspace := strings.TrimSpace(config.Workspace); workspace != "" {
		if strings.HasSuffix(workspace, "#user") {
			workspace = strings.TrimSuffix(workspace, "#user")
			nextURL = p.apiURL(config, fmt.Sprintf("/users/%s/repos?per_page=100", url.PathEscape(workspace)))
		} else {
			nextURL = p.apiURL(config, fmt.Sprintf("/orgs/%s/repos?per_page=100", url.PathEscape(workspace)))
			useWorkspaceListing = true
		}
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, nextURL, nil)
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
		if useWorkspaceListing && response.StatusCode == http.StatusNotFound {
			return p.DiscoverRepositoriesForSetup(ctx, core.AccountConfig{
				AccountID:     config.AccountID,
				Provider:      config.Provider,
				Host:          config.Host,
				Token:         config.Token,
				Username:      config.Username,
				Workspace:     userRepositoryWorkspaceFallback(config.Workspace),
				CredentialRef: config.CredentialRef,
			})
		}
		return nil, apiErrorFromResponse(response)
	}

	var payload []struct {
		ID            int64  `json:"id"`
		FullName      string `json:"full_name"`
		Name          string `json:"name"`
		CloneURL      string `json:"clone_url"`
		DefaultBranch string `json:"default_branch"`
		PushedAt      string `json:"pushed_at"`
	}
	if err := decodeJSONResponse(response, &payload); err != nil {
		return nil, err
	}

	repositories := make([]core.Repository, 0, len(payload))
	for _, repo := range payload {
		repositories = append(repositories, core.Repository{
			ID:              strconv.FormatInt(repo.ID, 10),
			FullName:        repo.FullName,
			Name:            repo.Name,
			RemoteURL:       canonicalRemoteURL(repo.CloneURL),
			DefaultBranch:   repo.DefaultBranch,
			PushedAt:        parseMillis(repo.PushedAt),
			TrackedBranches: []string{},
		})
	}
	return repositories, nil
}

func userRepositoryWorkspaceFallback(workspace string) string {
	return strings.TrimSpace(workspace) + "#user"
}

func (p *GitHubProvider) ListRepositories(ctx context.Context, config core.AccountConfig) ([]core.Repository, error) {
	nextURL := p.apiURL(config, "/user/repos?per_page=100")
	useWorkspaceListing := false
	if workspace := strings.TrimSpace(config.Workspace); workspace != "" {
		if strings.HasSuffix(workspace, "#user") {
			workspace = strings.TrimSuffix(workspace, "#user")
			nextURL = p.apiURL(config, fmt.Sprintf("/users/%s/repos?per_page=100", url.PathEscape(workspace)))
		} else {
			nextURL = p.apiURL(config, fmt.Sprintf("/orgs/%s/repos?per_page=100", url.PathEscape(workspace)))
			useWorkspaceListing = true
		}
	}

	repositories := make([]core.Repository, 0)
	for nextURL != "" {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, nextURL, nil)
		if err != nil {
			return nil, err
		}
		p.authorize(request, config)

		response, err := p.client().Do(request)
		if err != nil {
			return nil, err
		}

		p.captureRateLimit(response)
		if response.StatusCode != http.StatusOK {
			if useWorkspaceListing && response.StatusCode == http.StatusNotFound {
				response.Body.Close()
				nextURL = p.apiURL(config, fmt.Sprintf("/users/%s/repos?per_page=100", url.PathEscape(strings.TrimSpace(config.Workspace))))
				useWorkspaceListing = false
				continue
			}
			err = apiErrorFromResponse(response)
			response.Body.Close()
			return nil, err
		}

		var payload []struct {
			ID            int64  `json:"id"`
			FullName      string `json:"full_name"`
			Name          string `json:"name"`
			CloneURL      string `json:"clone_url"`
			DefaultBranch string `json:"default_branch"`
		}
		if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
			response.Body.Close()
			return nil, fmt.Errorf("decode repositories: %w", err)
		}
		for _, repo := range payload {
			repositories = append(repositories, core.Repository{
				ID:              strconv.FormatInt(repo.ID, 10),
				FullName:        repo.FullName,
				Name:            repo.Name,
				RemoteURL:       canonicalRemoteURL(repo.CloneURL),
				DefaultBranch:   repo.DefaultBranch,
				TrackedBranches: []string{},
			})
		}

		nextURL = parseGitHubNextLink(response.Header.Get("Link"))
		response.Body.Close()
	}
	return repositories, nil
}

func (p *GitHubProvider) GetRepository(ctx context.Context, config core.AccountConfig, repo core.Repository) (*core.Repository, error) {
	owner, name := splitRepoFullName(repo.FullName)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, p.apiURL(config, fmt.Sprintf("/repos/%s/%s", url.PathEscape(owner), url.PathEscape(name))), nil)
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
		ID            int64  `json:"id"`
		FullName      string `json:"full_name"`
		Name          string `json:"name"`
		CloneURL      string `json:"clone_url"`
		DefaultBranch string `json:"default_branch"`
		PushedAt      string `json:"pushed_at"`
	}
	if err := decodeJSONResponse(response, &payload); err != nil {
		return nil, err
	}
	return &core.Repository{
		ID:              strconv.FormatInt(payload.ID, 10),
		FullName:        payload.FullName,
		Name:            payload.Name,
		RemoteURL:       canonicalRemoteURL(payload.CloneURL),
		DefaultBranch:   payload.DefaultBranch,
		PushedAt:        parseMillis(payload.PushedAt),
		TrackedBranches: append([]string(nil), repo.TrackedBranches...),
	}, nil
}

func (p *GitHubProvider) ListBranches(ctx context.Context, config core.AccountConfig, repo core.Repository) ([]string, error) {
	owner, name := splitRepoFullName(repo.FullName)
	nextURL := p.apiURL(config, fmt.Sprintf("/repos/%s/%s/branches?per_page=100", url.PathEscape(owner), url.PathEscape(name)))
	branches := make([]string, 0)
	seen := make(map[string]struct{})
	for nextURL != "" {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, nextURL, nil)
		if err != nil {
			return nil, err
		}
		p.authorize(request, config)
		response, err := p.client().Do(request)
		if err != nil {
			return nil, err
		}
		p.captureRateLimit(response)
		if response.StatusCode != http.StatusOK {
			err = apiErrorFromResponse(response)
			response.Body.Close()
			return nil, err
		}
		var payload []struct {
			Name string `json:"name"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			response.Body.Close()
			return nil, err
		}
		for _, item := range payload {
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
		nextURL = parseGitHubNextLink(response.Header.Get("Link"))
		response.Body.Close()
	}
	return branches, nil
}

func (p *GitHubProvider) GetCommits(ctx context.Context, config core.AccountConfig, repo core.Repository, since time.Time) ([]core.Commit, error) {
	owner, name := splitRepoFullName(repo.FullName)
	var commits []core.Commit
	commitIndexBySHA := make(map[string]int)
	allBranches := []string(nil)
	if len(repo.TrackedBranches) == 0 {
		var err error
		allBranches, err = p.ListBranches(ctx, config, repo)
		if err != nil {
			return nil, err
		}
	}
	for _, branch := range branchRefs(repo, allBranches) {
		nextURL := p.apiURL(config, fmt.Sprintf("/repos/%s/%s/commits?per_page=100&sha=%s", url.PathEscape(owner), url.PathEscape(name), url.QueryEscape(branch)))
		if !since.IsZero() {
			nextURL += "&since=" + url.QueryEscape(time.UnixMilli(since.UnixMilli()).UTC().Format(time.RFC3339))
		}
		for nextURL != "" {
			request, err := http.NewRequestWithContext(ctx, http.MethodGet, nextURL, nil)
			if err != nil {
				return nil, err
			}
			p.authorize(request, config)
			response, err := p.client().Do(request)
			if err != nil {
				return nil, err
			}
			p.captureRateLimit(response)
			if response.StatusCode != http.StatusOK {
				err = apiErrorFromResponse(response)
				response.Body.Close()
				if isGitHubEmptyRepositoryAPIError(err) {
					return commits, nil
				}
				return nil, err
			}
			var payload []struct {
				SHA    string `json:"sha"`
				Commit struct {
					Message string `json:"message"`
					Author  struct {
						Name  string `json:"name"`
						Email string `json:"email"`
						Date  string `json:"date"`
					} `json:"author"`
				} `json:"commit"`
				Parents []struct {
					SHA string `json:"sha"`
				} `json:"parents"`
			}
			if err := decodeJSONResponse(response, &payload); err != nil {
				response.Body.Close()
				return nil, err
			}
			for _, item := range payload {
				ref := "refs/heads/" + branch
				if existingIndex, ok := commitIndexBySHA[item.SHA]; ok {
					commits[existingIndex].Refs = appendUniqueStrings(commits[existingIndex].Refs, ref)
					continue
				}
				parents := make([]string, 0, len(item.Parents))
				for _, parent := range item.Parents {
					parents = append(parents, parent.SHA)
				}
				commits = append(commits, core.Commit{
					SHA:         item.SHA,
					Message:     item.Commit.Message,
					AuthorEmail: item.Commit.Author.Email,
					AuthorName:  item.Commit.Author.Name,
					Timestamp:   parseMillis(item.Commit.Author.Date),
					Parents:     parents,
					Refs:        []string{ref},
					Repo:        repo,
				})
				commitIndexBySHA[item.SHA] = len(commits) - 1
			}
			nextURL = parseGitHubNextLink(response.Header.Get("Link"))
			response.Body.Close()
		}
	}
	return commits, nil
}

func (p *GitHubProvider) GetCommitDiff(ctx context.Context, config core.AccountConfig, repo core.Repository, sha string) ([]byte, error) {
	owner, name := splitRepoFullName(repo.FullName)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, p.apiURL(config, fmt.Sprintf("/repos/%s/%s/commits/%s", url.PathEscape(owner), url.PathEscape(name), url.PathEscape(sha))), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+config.Token)
	request.Header.Set("Accept", "application/vnd.github.diff")
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

func (p *GitHubProvider) GetPullRequests(ctx context.Context, config core.AccountConfig, repo core.Repository, since time.Time) ([]core.PullRequest, error) {
	owner, name := splitRepoFullName(repo.FullName)
	nextURL := p.apiURL(config, fmt.Sprintf("/repos/%s/%s/pulls?state=all&sort=updated&direction=desc&per_page=100", url.PathEscape(owner), url.PathEscape(name)))
	var prs []core.PullRequest
	for nextURL != "" {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, nextURL, nil)
		if err != nil {
			return nil, err
		}
		p.authorize(request, config)
		response, err := p.client().Do(request)
		if err != nil {
			return nil, err
		}
		p.captureRateLimit(response)
		if response.StatusCode != http.StatusOK {
			err = apiErrorFromResponse(response)
			response.Body.Close()
			return nil, err
		}
		var payload []struct {
			Number    int    `json:"number"`
			Title     string `json:"title"`
			Body      string `json:"body"`
			State     string `json:"state"`
			MergedAt  string `json:"merged_at"`
			CreatedAt string `json:"created_at"`
			UpdatedAt string `json:"updated_at"`
			User      struct {
				Login string `json:"login"`
			} `json:"user"`
			Head struct {
				Ref string `json:"ref"`
				SHA string `json:"sha"`
			} `json:"head"`
			Base struct {
				Ref string `json:"ref"`
			} `json:"base"`
			RequestedReviewers []struct {
				Login string `json:"login"`
			} `json:"requested_reviewers"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			response.Body.Close()
			return nil, err
		}
		stopPagination := false
		for _, item := range payload {
			updatedAt := parseMillis(item.UpdatedAt)
			if !since.IsZero() && updatedAt < since.UnixMilli() {
				stopPagination = true
				break
			}
			state := strings.ToLower(item.State)
			if strings.TrimSpace(item.MergedAt) != "" {
				state = "merged"
			}
			reviewers := make([]string, 0, len(item.RequestedReviewers))
			for _, reviewer := range item.RequestedReviewers {
				reviewers = append(reviewers, reviewer.Login)
			}
			prs = append(prs, core.PullRequest{
				ID:            strconv.Itoa(item.Number),
				Title:         item.Title,
				Description:   item.Body,
				State:         state,
				AuthorName:    item.User.Login,
				AuthorEmail:   item.User.Login,
				HeadCommitSHA: item.Head.SHA,
				SourceBranch:  item.Head.Ref,
				TargetBranch:  item.Base.Ref,
				Reviewers:     reviewers,
				CreatedAt:     parseMillis(item.CreatedAt),
				UpdatedAt:     updatedAt,
				Repo:          repo,
			})
		}
		if stopPagination {
			nextURL = ""
		} else {
			nextURL = parseGitHubNextLink(response.Header.Get("Link"))
		}
		response.Body.Close()
	}
	return prs, nil
}

func (p *GitHubProvider) GetPullRequest(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string) (*core.PullRequest, error) {
	owner, name := splitRepoFullName(repo.FullName)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, p.apiURL(config, fmt.Sprintf("/repos/%s/%s/pulls/%s", url.PathEscape(owner), url.PathEscape(name), url.PathEscape(prID))), nil)
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
		Number    int    `json:"number"`
		Title     string `json:"title"`
		Body      string `json:"body"`
		State     string `json:"state"`
		MergedAt  string `json:"merged_at"`
		CreatedAt string `json:"created_at"`
		UpdatedAt string `json:"updated_at"`
		User      struct {
			Login string `json:"login"`
		} `json:"user"`
		Head struct {
			Ref string `json:"ref"`
			SHA string `json:"sha"`
		} `json:"head"`
		Base struct {
			Ref string `json:"ref"`
		} `json:"base"`
		RequestedReviewers []struct {
			Login string `json:"login"`
		} `json:"requested_reviewers"`
	}
	if err := decodeJSONResponse(response, &payload); err != nil {
		return nil, err
	}
	state := strings.ToLower(payload.State)
	if strings.TrimSpace(payload.MergedAt) != "" {
		state = "merged"
	}
	reviewers := make([]string, 0, len(payload.RequestedReviewers))
	for _, reviewer := range payload.RequestedReviewers {
		reviewers = append(reviewers, reviewer.Login)
	}
	return &core.PullRequest{
		ID:            strconv.Itoa(payload.Number),
		Title:         payload.Title,
		Description:   payload.Body,
		State:         state,
		AuthorName:    payload.User.Login,
		AuthorEmail:   payload.User.Login,
		HeadCommitSHA: payload.Head.SHA,
		SourceBranch:  payload.Head.Ref,
		TargetBranch:  payload.Base.Ref,
		Reviewers:     reviewers,
		CreatedAt:     parseMillis(payload.CreatedAt),
		UpdatedAt:     parseMillis(payload.UpdatedAt),
		Repo:          repo,
	}, nil
}

func (p *GitHubProvider) GetPullRequestDiff(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string) ([]byte, error) {
	owner, name := splitRepoFullName(repo.FullName)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, p.apiURL(config, fmt.Sprintf("/repos/%s/%s/pulls/%s", url.PathEscape(owner), url.PathEscape(name), url.PathEscape(prID))), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+config.Token)
	request.Header.Set("Accept", "application/vnd.github.diff")
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

func (p *GitHubProvider) GetPullRequestFiles(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string) ([]core.PullRequestFile, error) {
	owner, name := splitRepoFullName(repo.FullName)
	nextURL := p.apiURL(config, fmt.Sprintf("/repos/%s/%s/pulls/%s/files?per_page=100", url.PathEscape(owner), url.PathEscape(name), url.PathEscape(prID)))
	files := make([]core.PullRequestFile, 0)
	for nextURL != "" {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, nextURL, nil)
		if err != nil {
			return nil, err
		}
		p.authorize(request, config)
		response, err := p.client().Do(request)
		if err != nil {
			return nil, err
		}
		p.captureRateLimit(response)
		if response.StatusCode != http.StatusOK {
			err = apiErrorFromResponse(response)
			response.Body.Close()
			return nil, err
		}
		var payload []struct {
			Filename  string `json:"filename"`
			Status    string `json:"status"`
			Additions int    `json:"additions"`
			Deletions int    `json:"deletions"`
			Changes   int    `json:"changes"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			response.Body.Close()
			return nil, err
		}
		for _, item := range payload {
			files = append(files, core.PullRequestFile{
				Path:      item.Filename,
				Status:    item.Status,
				Additions: item.Additions,
				Deletions: item.Deletions,
				Changes:   item.Changes,
			})
		}
		nextURL = parseGitHubNextLink(response.Header.Get("Link"))
		response.Body.Close()
	}
	return files, nil
}

func (p *GitHubProvider) GetPullRequestReviews(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string) ([]core.PullRequestReview, error) {
	owner, name := splitRepoFullName(repo.FullName)
	nextURL := p.apiURL(config, fmt.Sprintf("/repos/%s/%s/pulls/%s/reviews?per_page=100", url.PathEscape(owner), url.PathEscape(name), url.PathEscape(prID)))
	reviews := make([]core.PullRequestReview, 0)
	for nextURL != "" {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, nextURL, nil)
		if err != nil {
			return nil, err
		}
		p.authorize(request, config)
		response, err := p.client().Do(request)
		if err != nil {
			return nil, err
		}
		p.captureRateLimit(response)
		if response.StatusCode != http.StatusOK {
			err = apiErrorFromResponse(response)
			response.Body.Close()
			return nil, err
		}
		var payload []struct {
			ID          int    `json:"id"`
			Body        string `json:"body"`
			State       string `json:"state"`
			SubmittedAt string `json:"submitted_at"`
			User        struct {
				Login string `json:"login"`
			} `json:"user"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			response.Body.Close()
			return nil, err
		}
		for _, item := range payload {
			reviews = append(reviews, core.PullRequestReview{
				ID:          strconv.Itoa(item.ID),
				State:       strings.ToLower(item.State),
				Body:        item.Body,
				AuthorEmail: item.User.Login,
				AuthorName:  item.User.Login,
				SubmittedAt: parseMillis(item.SubmittedAt),
			})
		}
		nextURL = parseGitHubNextLink(response.Header.Get("Link"))
		response.Body.Close()
	}
	return reviews, nil
}

func (p *GitHubProvider) GetPullRequestCommits(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string) ([]core.Commit, error) {
	owner, name := splitRepoFullName(repo.FullName)
	nextURL := p.apiURL(config, fmt.Sprintf("/repos/%s/%s/pulls/%s/commits?per_page=100", url.PathEscape(owner), url.PathEscape(name), url.PathEscape(prID)))
	commits := make([]core.Commit, 0)
	for nextURL != "" {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, nextURL, nil)
		if err != nil {
			return nil, err
		}
		p.authorize(request, config)
		response, err := p.client().Do(request)
		if err != nil {
			return nil, err
		}
		p.captureRateLimit(response)
		if response.StatusCode != http.StatusOK {
			err = apiErrorFromResponse(response)
			response.Body.Close()
			return nil, err
		}
		var payload []struct {
			SHA    string `json:"sha"`
			Commit struct {
				Message string `json:"message"`
				Author  struct {
					Name  string `json:"name"`
					Email string `json:"email"`
					Date  string `json:"date"`
				} `json:"author"`
			} `json:"commit"`
			Parents []struct {
				SHA string `json:"sha"`
			} `json:"parents"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			response.Body.Close()
			return nil, err
		}
		for _, item := range payload {
			parents := make([]string, 0, len(item.Parents))
			for _, parent := range item.Parents {
				parents = append(parents, parent.SHA)
			}
			commits = append(commits, core.Commit{
				SHA:         item.SHA,
				Message:     item.Commit.Message,
				AuthorEmail: item.Commit.Author.Email,
				AuthorName:  item.Commit.Author.Name,
				Timestamp:   parseMillis(item.Commit.Author.Date),
				Parents:     parents,
				Refs:        []string{"pull_request:" + strings.TrimSpace(prID)},
				Repo:        repo,
			})
		}
		nextURL = parseGitHubNextLink(response.Header.Get("Link"))
		response.Body.Close()
	}
	return commits, nil
}

func (p *GitHubProvider) GetPullRequestSourceArchive(ctx context.Context, config core.AccountConfig, repo core.Repository, pr core.PullRequest) (*core.SourceArchive, error) {
	owner, name := splitRepoFullName(repo.FullName)
	sha := strings.TrimSpace(pr.HeadCommitSHA)
	if sha == "" {
		return nil, nil
	}
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		p.apiURL(config, fmt.Sprintf("/repos/%s/%s/tarball/%s", url.PathEscape(owner), url.PathEscape(name), url.PathEscape(sha))),
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

	tempFile, err := os.CreateTemp("", "github-source-archive-*.tar.gz")
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
		Filename:      fmt.Sprintf("pr-%s-%s.tar.gz", pr.ID, sha),
		MIMEType:      "application/gzip",
		ArchiveFormat: "tar.gz",
		LocalPath:     tempFile.Name(),
	}, nil
}

func (p *GitHubProvider) GetPullRequestComments(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string, since time.Time) ([]core.Comment, error) {
	reviewComments, err := p.getPullRequestReviewComments(ctx, config, repo, prID, since)
	if err != nil {
		return nil, err
	}
	issueComments, err := p.getPullRequestIssueComments(ctx, config, repo, prID, since)
	if err != nil {
		return nil, err
	}
	comments := append(reviewComments, issueComments...)
	sort.Slice(comments, func(i, j int) bool {
		if comments[i].CreatedAt == comments[j].CreatedAt {
			return comments[i].ID < comments[j].ID
		}
		return comments[i].CreatedAt < comments[j].CreatedAt
	})
	return comments, nil
}

func (p *GitHubProvider) getPullRequestReviewComments(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string, since time.Time) ([]core.Comment, error) {
	owner, name := splitRepoFullName(repo.FullName)
	nextURL := p.apiURL(config, fmt.Sprintf("/repos/%s/%s/pulls/%s/comments?per_page=100", url.PathEscape(owner), url.PathEscape(name), url.PathEscape(prID)))
	if !since.IsZero() {
		nextURL += "&since=" + url.QueryEscape(since.UTC().Format(time.RFC3339))
	}
	var comments []core.Comment
	for nextURL != "" {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, nextURL, nil)
		if err != nil {
			return nil, err
		}
		p.authorize(request, config)
		response, err := p.client().Do(request)
		if err != nil {
			return nil, err
		}
		p.captureRateLimit(response)
		if response.StatusCode != http.StatusOK {
			err = apiErrorFromResponse(response)
			response.Body.Close()
			return nil, err
		}
		var payload []struct {
			ID        int    `json:"id"`
			Body      string `json:"body"`
			CreatedAt string `json:"created_at"`
			UpdatedAt string `json:"updated_at"`
			Path      string `json:"path"`
			Line      int    `json:"line"`
			User      struct {
				Login string `json:"login"`
			} `json:"user"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			response.Body.Close()
			return nil, err
		}
		for _, item := range payload {
			comments = append(comments, core.Comment{
				ID:          strconv.Itoa(item.ID),
				Body:        item.Body,
				AuthorEmail: item.User.Login,
				AuthorName:  item.User.Login,
				CreatedAt:   parseMillis(item.CreatedAt),
				UpdatedAt:   parseMillis(item.UpdatedAt),
				PRID:        prID,
				Inline:      strings.TrimSpace(item.Path) != "",
				FilePath:    item.Path,
				Line:        item.Line,
				Repo:        repo,
			})
		}
		nextURL = parseGitHubNextLink(response.Header.Get("Link"))
		response.Body.Close()
	}
	return comments, nil
}

func (p *GitHubProvider) getPullRequestIssueComments(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string, since time.Time) ([]core.Comment, error) {
	owner, name := splitRepoFullName(repo.FullName)
	nextURL := p.apiURL(config, fmt.Sprintf("/repos/%s/%s/issues/%s/comments?per_page=100", url.PathEscape(owner), url.PathEscape(name), url.PathEscape(prID)))
	if !since.IsZero() {
		nextURL += "&since=" + url.QueryEscape(since.UTC().Format(time.RFC3339))
	}
	var comments []core.Comment
	for nextURL != "" {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, nextURL, nil)
		if err != nil {
			return nil, err
		}
		p.authorize(request, config)
		response, err := p.client().Do(request)
		if err != nil {
			return nil, err
		}
		p.captureRateLimit(response)
		if response.StatusCode != http.StatusOK {
			err = apiErrorFromResponse(response)
			response.Body.Close()
			return nil, err
		}
		var payload []struct {
			ID        int    `json:"id"`
			Body      string `json:"body"`
			CreatedAt string `json:"created_at"`
			UpdatedAt string `json:"updated_at"`
			User      struct {
				Login string `json:"login"`
			} `json:"user"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			response.Body.Close()
			return nil, err
		}
		for _, item := range payload {
			comments = append(comments, core.Comment{
				ID:          strconv.Itoa(item.ID),
				Body:        item.Body,
				AuthorEmail: item.User.Login,
				AuthorName:  item.User.Login,
				CreatedAt:   parseMillis(item.CreatedAt),
				UpdatedAt:   parseMillis(item.UpdatedAt),
				PRID:        prID,
				Inline:      false,
				Repo:        repo,
			})
		}
		nextURL = parseGitHubNextLink(response.Header.Get("Link"))
		response.Body.Close()
	}
	return comments, nil
}

func (p *GitHubProvider) CreatePullRequest(ctx context.Context, config core.AccountConfig, repo core.Repository, req core.CreatePRRequest) (*core.PullRequest, error) {
	owner, name := splitRepoFullName(repo.FullName)
	payload := map[string]any{
		"title": req.Title,
		"body":  req.Description,
		"head":  req.SourceBranch,
		"base":  req.TargetBranch,
	}
	raw, _ := json.Marshal(payload)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.apiURL(config, fmt.Sprintf("/repos/%s/%s/pulls", url.PathEscape(owner), url.PathEscape(name))), bytes.NewReader(raw))
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
		Number int    `json:"number"`
		Title  string `json:"title"`
		Body   string `json:"body"`
	}
	if err := decodeJSONResponse(response, &created); err != nil {
		return nil, err
	}
	return &core.PullRequest{ID: strconv.Itoa(created.Number), Title: created.Title, Description: created.Body, Repo: repo}, nil
}

func (p *GitHubProvider) PostComment(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string, body string) (*core.Comment, error) {
	owner, name := splitRepoFullName(repo.FullName)
	raw, _ := json.Marshal(map[string]any{"body": body})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.apiURL(config, fmt.Sprintf("/repos/%s/%s/issues/%s/comments", url.PathEscape(owner), url.PathEscape(name), url.PathEscape(prID))), bytes.NewReader(raw))
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
		ID   int    `json:"id"`
		Body string `json:"body"`
	}
	if err := decodeJSONResponse(response, &created); err != nil {
		return nil, err
	}
	return &core.Comment{ID: strconv.Itoa(created.ID), Body: created.Body, PRID: prID, Repo: repo}, nil
}

func (p *GitHubProvider) MergePullRequest(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string, strategy core.MergeStrategy) error {
	owner, name := splitRepoFullName(repo.FullName)
	raw, _ := json.Marshal(map[string]any{"merge_method": strategy})
	request, err := http.NewRequestWithContext(ctx, http.MethodPut, p.apiURL(config, fmt.Sprintf("/repos/%s/%s/pulls/%s/merge", url.PathEscape(owner), url.PathEscape(name), url.PathEscape(prID))), bytes.NewReader(raw))
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

func (p *GitHubProvider) CreateBranch(ctx context.Context, config core.AccountConfig, repo core.Repository, branchName string, fromRef string) error {
	owner, name := splitRepoFullName(repo.FullName)
	sourceSHA, err := p.resolveBranchSourceSHA(ctx, config, repo, owner, name, fromRef)
	if err != nil {
		return err
	}
	raw, _ := json.Marshal(map[string]any{
		"ref": "refs/heads/" + branchName,
		"sha": sourceSHA,
	})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.apiURL(config, fmt.Sprintf("/repos/%s/%s/git/refs", url.PathEscape(owner), url.PathEscape(name))), bytes.NewReader(raw))
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

func (p *GitHubProvider) resolveBranchSourceSHA(ctx context.Context, config core.AccountConfig, repo core.Repository, owner string, name string, fromRef string) (string, error) {
	ref := strings.TrimSpace(fromRef)
	if ref == "" {
		ref = strings.TrimSpace(repo.DefaultBranch)
	}
	if ref == "" {
		return "", fmt.Errorf("branch source ref is required")
	}
	if isFullGitSHA(ref) {
		return ref, nil
	}
	if sha, found, err := p.lookupGitRefSHA(ctx, config, owner, name, "heads", ref); err != nil {
		return "", err
	} else if found {
		return sha, nil
	}
	if sha, found, err := p.lookupGitRefSHA(ctx, config, owner, name, "tags", ref); err != nil {
		return "", err
	} else if found {
		return sha, nil
	}
	if sha, found, err := p.lookupCommitSHA(ctx, config, owner, name, ref); err != nil {
		return "", err
	} else if found {
		return sha, nil
	}
	return "", fmt.Errorf("resolve branch source ref %q: not found", ref)
}

func (p *GitHubProvider) lookupGitRefSHA(ctx context.Context, config core.AccountConfig, owner string, name string, namespace string, ref string) (string, bool, error) {
	refPath := fmt.Sprintf("%s/%s", namespace, strings.TrimSpace(ref))
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, p.apiURL(config, fmt.Sprintf("/repos/%s/%s/git/ref/%s", url.PathEscape(owner), url.PathEscape(name), url.PathEscape(refPath))), nil)
	if err != nil {
		return "", false, err
	}
	p.authorize(request, config)
	response, err := p.client().Do(request)
	if err != nil {
		return "", false, err
	}
	defer response.Body.Close()
	p.captureRateLimit(response)
	if response.StatusCode == http.StatusNotFound {
		return "", false, nil
	}
	if response.StatusCode != http.StatusOK {
		return "", false, apiErrorFromResponse(response)
	}
	var payload struct {
		Object struct {
			SHA string `json:"sha"`
		} `json:"object"`
	}
	if err := decodeJSONResponse(response, &payload); err != nil {
		return "", false, err
	}
	return strings.TrimSpace(payload.Object.SHA), strings.TrimSpace(payload.Object.SHA) != "", nil
}

func (p *GitHubProvider) lookupCommitSHA(ctx context.Context, config core.AccountConfig, owner string, name string, ref string) (string, bool, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, p.apiURL(config, fmt.Sprintf("/repos/%s/%s/commits/%s", url.PathEscape(owner), url.PathEscape(name), url.PathEscape(strings.TrimSpace(ref)))), nil)
	if err != nil {
		return "", false, err
	}
	p.authorize(request, config)
	response, err := p.client().Do(request)
	if err != nil {
		return "", false, err
	}
	defer response.Body.Close()
	p.captureRateLimit(response)
	if response.StatusCode == http.StatusNotFound {
		return "", false, nil
	}
	if response.StatusCode != http.StatusOK {
		return "", false, apiErrorFromResponse(response)
	}
	var payload struct {
		SHA string `json:"sha"`
	}
	if err := decodeJSONResponse(response, &payload); err != nil {
		return "", false, err
	}
	return strings.TrimSpace(payload.SHA), strings.TrimSpace(payload.SHA) != "", nil
}

func isFullGitSHA(value string) bool {
	if len(value) != 40 {
		return false
	}
	for _, r := range value {
		switch {
		case r >= '0' && r <= '9':
		case r >= 'a' && r <= 'f':
		case r >= 'A' && r <= 'F':
		default:
			return false
		}
	}
	return true
}

func (p *GitHubProvider) ValidationDetails() map[string]any {
	details := map[string]any{
		"user":                 p.lastUser,
		"rate_limit_remaining": p.lastRateRemaining,
	}
	if p.lastRateRetryAfter > 0 {
		details["retry_after_seconds"] = p.lastRateRetryAfter
	}
	return details
}

func (p *GitHubProvider) client() *http.Client {
	if p.HTTPClient != nil {
		return p.HTTPClient
	}
	return http.DefaultClient
}

func (p *GitHubProvider) apiURL(config core.AccountConfig, path string) string {
	host := strings.TrimSpace(config.Host)
	if host == "" {
		host = defaultGitHubHost
	}
	if !strings.Contains(host, "://") {
		host = "https://" + host
	}
	return strings.TrimRight(host, "/") + path
}

func (p *GitHubProvider) authorize(request *http.Request, config core.AccountConfig) {
	request.Header.Set("Authorization", "Bearer "+config.Token)
	request.Header.Set("Accept", "application/vnd.github+json")
}

func (p *GitHubProvider) captureRateLimit(response *http.Response) {
	p.lastRateRemaining = 0
	p.lastRateRetryAfter = 0
	if remaining := strings.TrimSpace(response.Header.Get("X-RateLimit-Remaining")); remaining != "" {
		if value, err := strconv.Atoi(remaining); err == nil {
			p.lastRateRemaining = value
		}
	}
	if isGitHubRateLimitResponse(response) {
		if retryAfterMs := retryAfterMillisecondsFromRateLimitHeaders(response); retryAfterMs > 0 {
			p.lastRateRetryAfter = int((retryAfterMs + 999) / 1000)
		}
	}
}

func parseGitHubNextLink(header string) string {
	if strings.TrimSpace(header) == "" {
		return ""
	}
	for _, part := range strings.Split(header, ",") {
		section := strings.TrimSpace(part)
		if !strings.Contains(section, `rel="next"`) {
			continue
		}
		start := strings.Index(section, "<")
		end := strings.Index(section, ">")
		if start >= 0 && end > start {
			return section[start+1 : end]
		}
	}
	return ""
}
