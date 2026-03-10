package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	jiraHTTPTimeout        = 30 * time.Second
	jiraSearchPageSize     = 100
	jiraProjectPageSize    = 100
	jiraCommentsPageSize   = 100
	defaultRetryAfter      = 2 * time.Second
	defaultRateLimitBurst  = 10
	defaultRateLimitRefill = 10
)

type jiraClient struct {
	site        string
	siteURL     string
	cloudID     string
	apiBaseURL  string
	email       string
	apiToken    string
	httpClient  *http.Client
	rateLimiter *rateLimiter
	timeZone    *time.Location
}

type rateLimiter struct {
	mu         sync.Mutex
	tokens     float64
	maxTokens  float64
	refillRate float64
	lastRefill time.Time
}

func newRateLimiter(maxTokens, refillRate float64) *rateLimiter {
	return &rateLimiter{
		tokens:     maxTokens,
		maxTokens:  maxTokens,
		refillRate: refillRate,
		lastRefill: time.Now(),
	}
}

func (r *rateLimiter) wait(ctx context.Context) error {
	for {
		r.mu.Lock()
		now := time.Now()
		elapsed := now.Sub(r.lastRefill).Seconds()
		if elapsed > 0 {
			r.tokens = math.Min(r.maxTokens, r.tokens+elapsed*r.refillRate)
			r.lastRefill = now
		}
		if r.tokens >= 1 {
			r.tokens--
			r.mu.Unlock()
			return nil
		}
		needed := (1 - r.tokens) / r.refillRate
		r.mu.Unlock()

		wait := time.Duration(needed * float64(time.Second))
		if wait <= 0 {
			wait = 50 * time.Millisecond
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(wait):
		}
	}
}

func newJiraClient(site, email, apiToken string) (*jiraClient, error) {
	normalizedSite := normalizeSite(site)
	if normalizedSite == "" || strings.TrimSpace(email) == "" || strings.TrimSpace(apiToken) == "" {
		return nil, fmt.Errorf("site, email, and api_token are required")
	}

	httpClient := &http.Client{Timeout: jiraHTTPTimeout}
	siteURL := fmt.Sprintf("https://%s.atlassian.net", normalizedSite)

	ctx, cancel := context.WithTimeout(context.Background(), jiraHTTPTimeout)
	defer cancel()

	cloudID, err := discoverCloudID(ctx, httpClient, siteURL)
	if err != nil {
		return nil, err
	}

	return &jiraClient{
		site:        normalizedSite,
		siteURL:     siteURL,
		cloudID:     cloudID,
		apiBaseURL:  fmt.Sprintf("https://api.atlassian.com/ex/jira/%s", cloudID),
		email:       strings.TrimSpace(email),
		apiToken:    strings.TrimSpace(apiToken),
		httpClient:  httpClient,
		rateLimiter: newRateLimiter(defaultRateLimitBurst, defaultRateLimitRefill),
	}, nil
}

func discoverCloudID(ctx context.Context, httpClient *http.Client, siteURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(siteURL, "/")+"/_edge/tenant_info", nil)
	if err != nil {
		return "", fmt.Errorf("build tenant info request: %w", err)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("discover cloud id: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", decodeResponseError(resp, "discover cloud id")
	}

	var tenant jiraTenantInfo
	if err := json.NewDecoder(resp.Body).Decode(&tenant); err != nil {
		return "", fmt.Errorf("decode tenant info: %w", err)
	}
	if strings.TrimSpace(tenant.CloudID) == "" {
		return "", fmt.Errorf("tenant info missing cloudId")
	}
	return tenant.CloudID, nil
}

func (c *jiraClient) getMyself(ctx context.Context) (*jiraUser, error) {
	var user jiraUser
	if err := c.apiRequest(ctx, http.MethodGet, "/rest/api/3/myself", nil, &user); err != nil {
		return nil, err
	}
	return &user, nil
}

func (c *jiraClient) searchTimeZone(ctx context.Context) *time.Location {
	if c.timeZone != nil {
		return c.timeZone
	}

	user, err := c.getMyself(ctx)
	if err != nil {
		c.timeZone = time.UTC
		return c.timeZone
	}
	if loc, err := loadJiraTimeZone(user.TimeZone); err == nil {
		c.timeZone = loc
		return c.timeZone
	}
	c.timeZone = time.UTC
	return c.timeZone
}

func loadJiraTimeZone(name string) (*time.Location, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return time.UTC, nil
	}
	loc, err := time.LoadLocation(trimmed)
	if err != nil {
		return nil, fmt.Errorf("load jira timezone %q: %w", trimmed, err)
	}
	return loc, nil
}

func (c *jiraClient) getProjects(ctx context.Context) ([]jiraProject, error) {
	var projects []jiraProject
	startAt := 0
	for {
		query := url.Values{}
		query.Set("startAt", fmt.Sprintf("%d", startAt))
		query.Set("maxResults", fmt.Sprintf("%d", jiraProjectPageSize))

		var page jiraProjectSearchResponse
		if err := c.apiRequest(ctx, http.MethodGet, "/rest/api/3/project/search?"+query.Encode(), nil, &page); err != nil {
			return nil, err
		}

		projects = append(projects, page.Values...)
		if page.IsLast || len(page.Values) == 0 || startAt+len(page.Values) >= page.Total {
			break
		}
		startAt += len(page.Values)
	}
	return projects, nil
}

func (c *jiraClient) searchIssues(ctx context.Context, jql string, fields []string, expand []string) ([]jiraIssue, error) {
	var issues []jiraIssue
	nextPageToken := ""
	for {
		page, err := c.searchIssuesPage(ctx, jql, fields, expand, nextPageToken)
		if err != nil {
			return nil, err
		}
		issues = append(issues, page.Issues...)
		if page.IsLast || strings.TrimSpace(page.NextPageToken) == "" {
			break
		}
		nextPageToken = page.NextPageToken
	}
	return issues, nil
}

func (c *jiraClient) searchIssuesPage(ctx context.Context, jql string, fields []string, expand []string, nextPageToken string) (*jiraSearchResponse, error) {
	query := url.Values{}
	query.Set("jql", jql)
	query.Set("maxResults", fmt.Sprintf("%d", jiraSearchPageSize))
	if len(fields) > 0 {
		query.Set("fields", strings.Join(fields, ","))
	}
	if len(expand) > 0 {
		query.Set("expand", strings.Join(expand, ","))
	}
	if strings.TrimSpace(nextPageToken) != "" {
		query.Set("nextPageToken", nextPageToken)
	}

	var page jiraSearchResponse
	if err := c.apiRequest(ctx, http.MethodGet, "/rest/api/3/search/jql?"+query.Encode(), nil, &page); err != nil {
		return nil, err
	}
	return &page, nil
}

func (c *jiraClient) getIssueWithExpand(ctx context.Context, issueKey string) (*jiraIssue, error) {
	query := url.Values{}
	query.Set("expand", "changelog,names")

	var issue jiraIssue
	path := fmt.Sprintf("/rest/api/3/issue/%s?%s", url.PathEscape(issueKey), query.Encode())
	if err := c.apiRequest(ctx, http.MethodGet, path, nil, &issue); err != nil {
		return nil, err
	}
	return &issue, nil
}

func (c *jiraClient) getCommentsPage(ctx context.Context, issueKey string, startAt int) (*jiraCommentPage, error) {
	query := url.Values{}
	query.Set("startAt", fmt.Sprintf("%d", startAt))
	query.Set("maxResults", fmt.Sprintf("%d", jiraCommentsPageSize))

	var page jiraCommentPage
	path := fmt.Sprintf("/rest/api/3/issue/%s/comment?%s", url.PathEscape(issueKey), query.Encode())
	if err := c.apiRequest(ctx, http.MethodGet, path, nil, &page); err != nil {
		return nil, err
	}
	return &page, nil
}

func (c *jiraClient) fetchAllComments(ctx context.Context, issueKey string, inline jiraCommentPage) ([]jiraComment, error) {
	comments := append([]jiraComment(nil), inline.Comments...)
	if inline.Total <= len(inline.Comments) || inline.Total <= inline.MaxResults {
		return comments, nil
	}

	startAt := inline.StartAt + len(inline.Comments)
	for startAt < inline.Total {
		page, err := c.getCommentsPage(ctx, issueKey, startAt)
		if err != nil {
			return nil, err
		}
		comments = append(comments, page.Comments...)
		if len(page.Comments) == 0 {
			break
		}
		startAt += len(page.Comments)
	}
	return comments, nil
}

func (c *jiraClient) getTransitions(ctx context.Context, issueKey string) ([]jiraTransition, error) {
	var resp jiraTransitionsResponse
	path := fmt.Sprintf("/rest/api/3/issue/%s/transitions", url.PathEscape(issueKey))
	if err := c.apiRequest(ctx, http.MethodGet, path, nil, &resp); err != nil {
		return nil, err
	}
	return resp.Transitions, nil
}

func (c *jiraClient) createIssue(ctx context.Context, payload map[string]any) (*jiraCreateIssueResponse, error) {
	var resp jiraCreateIssueResponse
	if err := c.apiJSONRequest(ctx, http.MethodPost, "/rest/api/3/issue", payload, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (c *jiraClient) addComment(ctx context.Context, issueKey string, payload map[string]any) (*jiraCreateCommentResponse, error) {
	var resp jiraCreateCommentResponse
	path := fmt.Sprintf("/rest/api/3/issue/%s/comment", url.PathEscape(issueKey))
	if err := c.apiJSONRequest(ctx, http.MethodPost, path, payload, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (c *jiraClient) executeTransition(ctx context.Context, issueKey string, payload map[string]any) error {
	path := fmt.Sprintf("/rest/api/3/issue/%s/transitions", url.PathEscape(issueKey))
	return c.apiJSONRequest(ctx, http.MethodPost, path, payload, nil)
}

func (c *jiraClient) updateIssue(ctx context.Context, issueKey string, payload map[string]any) error {
	path := fmt.Sprintf("/rest/api/3/issue/%s", url.PathEscape(issueKey))
	return c.apiJSONRequest(ctx, http.MethodPut, path, payload, nil)
}

func (c *jiraClient) apiJSONRequest(ctx context.Context, method, path string, payload any, out any) error {
	var body io.Reader
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			return fmt.Errorf("marshal jira request: %w", err)
		}
		body = bytes.NewReader(raw)
	}
	return c.apiRequest(ctx, method, path, body, out)
}

func (c *jiraClient) apiRequest(ctx context.Context, method, path string, body io.Reader, out any) error {
	statuses := map[int]struct{}{
		http.StatusOK:        {},
		http.StatusCreated:   {},
		http.StatusNoContent: {},
	}

	var bodyBytes []byte
	if body != nil {
		raw, err := io.ReadAll(body)
		if err != nil {
			return fmt.Errorf("read request body: %w", err)
		}
		bodyBytes = raw
	}

	for attempt := 0; attempt < 4; attempt++ {
		if err := c.rateLimiter.wait(ctx); err != nil {
			return err
		}

		reqBody := io.Reader(nil)
		if bodyBytes != nil {
			reqBody = bytes.NewReader(bodyBytes)
		}

		req, err := http.NewRequestWithContext(ctx, method, c.apiBaseURL+path, reqBody)
		if err != nil {
			return fmt.Errorf("build jira request: %w", err)
		}
		req.SetBasicAuth(c.email, c.apiToken)
		req.Header.Set("Accept", "application/json")
		if bodyBytes != nil {
			req.Header.Set("Content-Type", "application/json")
		}

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return fmt.Errorf("jira request %s %s: %w", method, path, err)
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			retryAfter := retryAfterDuration(resp.Header)
			resp.Body.Close()
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(retryAfter):
				continue
			}
		}

		defer resp.Body.Close()
		if _, ok := statuses[resp.StatusCode]; !ok {
			return decodeResponseError(resp, fmt.Sprintf("%s %s", method, path))
		}

		if out == nil || resp.StatusCode == http.StatusNoContent {
			io.Copy(io.Discard, resp.Body)
			return nil
		}
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return fmt.Errorf("decode jira response %s %s: %w", method, path, err)
		}
		return nil
	}

	return &jiraAPIError{
		StatusCode: http.StatusTooManyRequests,
		Message:    "jira request retried too many times after 429 responses",
	}
}

func decodeResponseError(resp *http.Response, action string) error {
	body, _ := io.ReadAll(resp.Body)

	var apiErr jiraAPIErrorResponse
	if err := json.Unmarshal(body, &apiErr); err == nil {
		parts := make([]string, 0, len(apiErr.ErrorMessages)+len(apiErr.Errors))
		parts = append(parts, apiErr.ErrorMessages...)
		for key, value := range apiErr.Errors {
			if strings.TrimSpace(value) == "" {
				continue
			}
			parts = append(parts, fmt.Sprintf("%s: %s", key, value))
		}
		if len(parts) > 0 {
			return &jiraAPIError{
				StatusCode: resp.StatusCode,
				Message:    fmt.Sprintf("%s: %s: %s", action, resp.Status, strings.Join(parts, "; ")),
				Headers:    resp.Header.Clone(),
			}
		}
	}

	message := strings.TrimSpace(string(body))
	if message == "" {
		message = resp.Status
	}
	return &jiraAPIError{
		StatusCode: resp.StatusCode,
		Message:    fmt.Sprintf("%s: %s", action, message),
		Headers:    resp.Header.Clone(),
	}
}

func retryAfterDuration(headers http.Header) time.Duration {
	value := strings.TrimSpace(headers.Get("Retry-After"))
	if value == "" {
		return defaultRetryAfter
	}
	if seconds, err := time.ParseDuration(value + "s"); err == nil {
		return seconds
	}
	if t, err := http.ParseTime(value); err == nil {
		d := time.Until(t)
		if d > 0 {
			return d
		}
	}
	return defaultRetryAfter
}

func normalizeSite(site string) string {
	trimmed := strings.TrimSpace(site)
	trimmed = strings.TrimPrefix(trimmed, "https://")
	trimmed = strings.TrimPrefix(trimmed, "http://")
	trimmed = strings.TrimSuffix(trimmed, "/")
	trimmed = strings.TrimSuffix(trimmed, ".atlassian.net")
	return trimmed
}
