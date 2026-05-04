package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	core "github.com/nexus-project/gitlab/internal/gitadapter"
)

const defaultGitLabHost = "https://gitlab.com/api/v4"

type GitLabProvider struct {
	HTTPClient        *http.Client
	lastUser          string
	lastRateRemaining int
}

func (p *GitLabProvider) ID() string { return "gitlab" }

func (p *GitLabProvider) DisplayName() string { return "GitLab" }

func (p *GitLabProvider) ValidateCredentials(ctx context.Context, config core.AccountConfig) error {
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
		Username string `json:"username"`
		Email    string `json:"email"`
	}
	if err := decodeJSONResponse(response, &payload); err != nil {
		return err
	}
	p.lastUser = firstNonBlank(payload.Email, payload.Username)
	return nil
}

func (p *GitLabProvider) ListRepositories(ctx context.Context, config core.AccountConfig) ([]core.Repository, error) {
	nextURL := p.apiURL(config, "/projects?membership=true&per_page=100")
	var repositories []core.Repository
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
			ID            int64  `json:"id"`
			Name          string `json:"name"`
			PathWithNS    string `json:"path_with_namespace"`
			HTTPURLToRepo string `json:"http_url_to_repo"`
			DefaultBranch string `json:"default_branch"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			response.Body.Close()
			return nil, err
		}
		for _, item := range payload {
			repositories = append(repositories, core.Repository{
				ID:              strconv.FormatInt(item.ID, 10),
				FullName:        item.PathWithNS,
				Name:            item.Name,
				RemoteURL:       canonicalRemoteURL(item.HTTPURLToRepo),
				DefaultBranch:   item.DefaultBranch,
				TrackedBranches: []string{},
			})
		}
		nextPage := strings.TrimSpace(response.Header.Get("X-Next-Page"))
		response.Body.Close()
		if nextPage == "" {
			nextURL = ""
		} else {
			nextURL = p.apiURL(config, "/projects?membership=true&per_page=100&page="+url.QueryEscape(nextPage))
		}
	}
	return repositories, nil
}

func (p *GitLabProvider) ListBranches(ctx context.Context, config core.AccountConfig, repo core.Repository) ([]string, error) {
	nextURL := p.apiURL(config, fmt.Sprintf("/projects/%s/repository/branches?per_page=100", url.PathEscape(repo.ID)))
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
		nextPage := strings.TrimSpace(response.Header.Get("X-Next-Page"))
		response.Body.Close()
		if nextPage == "" {
			nextURL = ""
		} else {
			nextURL = p.apiURL(config, fmt.Sprintf("/projects/%s/repository/branches?per_page=100&page=%s", url.PathEscape(repo.ID), url.QueryEscape(nextPage)))
		}
	}
	return branches, nil
}

func (p *GitLabProvider) GetCommits(ctx context.Context, config core.AccountConfig, repo core.Repository, since time.Time) ([]core.Commit, error) {
	projectID := url.PathEscape(repo.ID)
	var commits []core.Commit
	allBranches, err := p.ListBranches(ctx, config, repo)
	if err != nil {
		return nil, err
	}
	for _, branch := range branchRefs(repo, allBranches) {
		nextURL := p.apiURL(config, fmt.Sprintf("/projects/%s/repository/commits?per_page=100&ref_name=%s", projectID, url.QueryEscape(branch)))
		if !since.IsZero() {
			nextURL += "&since=" + url.QueryEscape(since.UTC().Format(time.RFC3339))
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
				return nil, err
			}
			var payload []struct {
				ID          string   `json:"id"`
				Title       string   `json:"title"`
				Message     string   `json:"message"`
				AuthorName  string   `json:"author_name"`
				AuthorEmail string   `json:"author_email"`
				CreatedAt   string   `json:"created_at"`
				ParentIDs   []string `json:"parent_ids"`
			}
			if err := decodeJSONResponse(response, &payload); err != nil {
				response.Body.Close()
				return nil, err
			}
			for _, item := range payload {
				ts := parseMillis(item.CreatedAt)
				commits = append(commits, core.Commit{
					SHA:         item.ID,
					Message:     firstNonBlank(item.Message, item.Title),
					AuthorEmail: item.AuthorEmail,
					AuthorName:  item.AuthorName,
					Timestamp:   ts,
					Parents:     item.ParentIDs,
					Refs:        []string{"refs/heads/" + branch},
					Repo:        repo,
				})
			}
			nextPage := strings.TrimSpace(response.Header.Get("X-Next-Page"))
			response.Body.Close()
			if nextPage == "" {
				nextURL = ""
			} else {
				nextURL = p.apiURL(config, fmt.Sprintf("/projects/%s/repository/commits?per_page=100&ref_name=%s&page=%s", projectID, url.QueryEscape(branch), url.QueryEscape(nextPage)))
			}
		}
	}
	return commits, nil
}

func (p *GitLabProvider) GetCommitDiff(ctx context.Context, config core.AccountConfig, repo core.Repository, sha string) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, p.apiURL(config, fmt.Sprintf("/projects/%s/repository/commits/%s/diff", url.PathEscape(repo.ID), url.PathEscape(sha))), nil)
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
	var payload []struct {
		Diff    string `json:"diff"`
		NewPath string `json:"new_path"`
	}
	if err := decodeJSONResponse(response, &payload); err != nil {
		return nil, err
	}
	var builder strings.Builder
	for _, item := range payload {
		builder.WriteString("--- " + item.NewPath + "\n")
		builder.WriteString("+++ " + item.NewPath + "\n")
		builder.WriteString(item.Diff)
		builder.WriteString("\n")
	}
	return []byte(builder.String()), nil
}

func (p *GitLabProvider) GetPullRequests(ctx context.Context, config core.AccountConfig, repo core.Repository, since time.Time) ([]core.PullRequest, error) {
	return p.getPullRequests(ctx, config, repo, "all", since)
}

func (p *GitLabProvider) GetOpenPullRequests(ctx context.Context, config core.AccountConfig, repo core.Repository) ([]core.PullRequest, error) {
	return p.getPullRequests(ctx, config, repo, "opened", time.Time{})
}

func (p *GitLabProvider) getPullRequests(ctx context.Context, config core.AccountConfig, repo core.Repository, state string, since time.Time) ([]core.PullRequest, error) {
	mergeRequestsURL := func(page string) string {
		query := url.Values{}
		query.Set("state", state)
		query.Set("order_by", "updated_at")
		query.Set("sort", "desc")
		query.Set("per_page", "100")
		if !since.IsZero() {
			query.Set("updated_after", since.UTC().Format(time.RFC3339))
		}
		if strings.TrimSpace(page) != "" {
			query.Set("page", page)
		}
		return p.apiURL(config, fmt.Sprintf("/projects/%s/merge_requests?%s", url.PathEscape(repo.ID), query.Encode()))
	}
	nextURL := mergeRequestsURL("")
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
			IID          int    `json:"iid"`
			Title        string `json:"title"`
			Description  string `json:"description"`
			State        string `json:"state"`
			CreatedAt    string `json:"created_at"`
			UpdatedAt    string `json:"updated_at"`
			SHA          string `json:"sha"`
			SourceBranch string `json:"source_branch"`
			TargetBranch string `json:"target_branch"`
			Author       struct {
				Username string `json:"username"`
				Name     string `json:"name"`
			} `json:"author"`
			Reviewers []struct {
				Name string `json:"name"`
			} `json:"reviewers"`
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
			reviewers := make([]string, 0, len(item.Reviewers))
			for _, reviewer := range item.Reviewers {
				reviewers = append(reviewers, reviewer.Name)
			}
			prs = append(prs, core.PullRequest{
				ID:            strconv.Itoa(item.IID),
				Title:         item.Title,
				Description:   item.Description,
				State:         normalizeGitLabPRState(item.State),
				AuthorEmail:   item.Author.Username,
				AuthorName:    firstNonBlank(item.Author.Name, item.Author.Username),
				HeadCommitSHA: item.SHA,
				SourceBranch:  item.SourceBranch,
				TargetBranch:  item.TargetBranch,
				Reviewers:     reviewers,
				CreatedAt:     parseMillis(item.CreatedAt),
				UpdatedAt:     updatedAt,
				Repo:          repo,
			})
		}
		nextPage := strings.TrimSpace(response.Header.Get("X-Next-Page"))
		response.Body.Close()
		if stopPagination || nextPage == "" {
			nextURL = ""
		} else {
			nextURL = mergeRequestsURL(nextPage)
		}
	}
	return prs, nil
}

func normalizeGitLabPRState(state string) string {
	switch strings.ToLower(strings.TrimSpace(state)) {
	case "opened", "open":
		return "open"
	default:
		return strings.ToLower(strings.TrimSpace(state))
	}
}

func (p *GitLabProvider) GetPullRequestDiff(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, p.apiURL(config, fmt.Sprintf("/projects/%s/merge_requests/%s/changes", url.PathEscape(repo.ID), url.PathEscape(prID))), nil)
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
	var payload struct {
		Changes []struct {
			Diff    string `json:"diff"`
			NewPath string `json:"new_path"`
		} `json:"changes"`
	}
	if err := decodeJSONResponse(response, &payload); err != nil {
		return nil, err
	}
	var builder strings.Builder
	for _, change := range payload.Changes {
		builder.WriteString("--- " + change.NewPath + "\n")
		builder.WriteString("+++ " + change.NewPath + "\n")
		builder.WriteString(change.Diff)
		builder.WriteString("\n")
	}
	return []byte(builder.String()), nil
}

func (p *GitLabProvider) GetPullRequestSourceArchive(ctx context.Context, config core.AccountConfig, repo core.Repository, pr core.PullRequest) (*core.SourceArchive, error) {
	sha := strings.TrimSpace(pr.HeadCommitSHA)
	if sha == "" {
		return nil, nil
	}
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		p.apiURL(config, fmt.Sprintf("/projects/%s/repository/archive.tar.gz?sha=%s", url.PathEscape(repo.ID), url.QueryEscape(sha))),
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
	body, err := readTextResponse(response)
	if err != nil {
		return nil, err
	}
	return &core.SourceArchive{
		Filename:      fmt.Sprintf("pr-%s-%s.tar.gz", pr.ID, sha),
		MIMEType:      "application/gzip",
		ArchiveFormat: "tar.gz",
		Data:          body,
	}, nil
}

func (p *GitLabProvider) GetPullRequestComments(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string, since time.Time) ([]core.Comment, error) {
	nextURL := p.apiURL(config, fmt.Sprintf("/projects/%s/merge_requests/%s/notes?sort=asc&order_by=created_at&per_page=100", url.PathEscape(repo.ID), url.PathEscape(prID)))
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
			Author    struct {
				Username string `json:"username"`
				Name     string `json:"name"`
			} `json:"author"`
			Position struct {
				NewPath string `json:"new_path"`
				NewLine int    `json:"new_line"`
				OldLine int    `json:"old_line"`
			} `json:"position"`
		}
		if err := decodeJSONResponse(response, &payload); err != nil {
			response.Body.Close()
			return nil, err
		}
		for _, item := range payload {
			createdAt := parseMillis(item.CreatedAt)
			if !since.IsZero() && createdAt < since.UnixMilli() {
				continue
			}
			line := item.Position.NewLine
			if line == 0 {
				line = item.Position.OldLine
			}
			comments = append(comments, core.Comment{
				ID:          strconv.Itoa(item.ID),
				Body:        item.Body,
				AuthorEmail: item.Author.Username,
				AuthorName:  firstNonBlank(item.Author.Name, item.Author.Username),
				CreatedAt:   createdAt,
				UpdatedAt:   parseMillis(item.UpdatedAt),
				PRID:        prID,
				Inline:      strings.TrimSpace(item.Position.NewPath) != "",
				FilePath:    item.Position.NewPath,
				Line:        line,
				Repo:        repo,
			})
		}
		nextPage := strings.TrimSpace(response.Header.Get("X-Next-Page"))
		response.Body.Close()
		if nextPage == "" {
			nextURL = ""
		} else {
			nextURL = p.apiURL(config, fmt.Sprintf("/projects/%s/merge_requests/%s/notes?sort=asc&order_by=created_at&per_page=100&page=%s", url.PathEscape(repo.ID), url.PathEscape(prID), url.QueryEscape(nextPage)))
		}
	}
	return comments, nil
}

func (p *GitLabProvider) CreatePullRequest(ctx context.Context, config core.AccountConfig, repo core.Repository, req core.CreatePRRequest) (*core.PullRequest, error) {
	raw, _ := json.Marshal(map[string]any{
		"title":         req.Title,
		"description":   req.Description,
		"source_branch": req.SourceBranch,
		"target_branch": req.TargetBranch,
	})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.apiURL(config, fmt.Sprintf("/projects/%s/merge_requests", url.PathEscape(repo.ID))), bytes.NewReader(raw))
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
		IID         int    `json:"iid"`
		Title       string `json:"title"`
		Description string `json:"description"`
	}
	if err := decodeJSONResponse(response, &created); err != nil {
		return nil, err
	}
	return &core.PullRequest{ID: strconv.Itoa(created.IID), Title: created.Title, Description: created.Description, Repo: repo}, nil
}

func (p *GitLabProvider) PostComment(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string, body string) (*core.Comment, error) {
	raw, _ := json.Marshal(map[string]any{"body": body})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.apiURL(config, fmt.Sprintf("/projects/%s/merge_requests/%s/notes", url.PathEscape(repo.ID), url.PathEscape(prID))), bytes.NewReader(raw))
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

func (p *GitLabProvider) MergePullRequest(ctx context.Context, config core.AccountConfig, repo core.Repository, prID string, _ core.MergeStrategy) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodPut, p.apiURL(config, fmt.Sprintf("/projects/%s/merge_requests/%s/merge", url.PathEscape(repo.ID), url.PathEscape(prID))), bytes.NewReader([]byte("{}")))
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

func (p *GitLabProvider) CreateBranch(ctx context.Context, config core.AccountConfig, repo core.Repository, branchName string, fromRef string) error {
	raw, _ := json.Marshal(map[string]any{"branch": branchName, "ref": fromRef})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.apiURL(config, fmt.Sprintf("/projects/%s/repository/branches", url.PathEscape(repo.ID))), bytes.NewReader(raw))
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

func (p *GitLabProvider) ValidationDetails() map[string]any {
	return map[string]any{"user": p.lastUser, "rate_limit_remaining": p.lastRateRemaining}
}

func (p *GitLabProvider) client() *http.Client {
	if p.HTTPClient != nil {
		return p.HTTPClient
	}
	return http.DefaultClient
}

func (p *GitLabProvider) apiURL(config core.AccountConfig, path string) string {
	host := strings.TrimSpace(config.Host)
	if host == "" {
		host = defaultGitLabHost
	}
	if !strings.Contains(host, "://") {
		host = "https://" + host
	}
	if !strings.Contains(host, "/api/v4") {
		host = strings.TrimRight(host, "/") + "/api/v4"
	}
	return strings.TrimRight(host, "/") + path
}

func (p *GitLabProvider) authorize(request *http.Request, config core.AccountConfig) {
	request.Header.Set("PRIVATE-TOKEN", config.Token)
	request.Header.Set("Accept", "application/json")
}

func (p *GitLabProvider) captureRateLimit(response *http.Response) {
	p.lastRateRemaining = 0
	if remaining := strings.TrimSpace(response.Header.Get("RateLimit-Remaining")); remaining != "" {
		if value, err := strconv.Atoi(remaining); err == nil {
			p.lastRateRemaining = value
		}
	}
}
