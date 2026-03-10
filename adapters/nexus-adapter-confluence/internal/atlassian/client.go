package atlassian

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const defaultTimeout = 30 * time.Second

type Client struct {
	baseURL    string
	email      string
	apiToken   string
	httpClient *http.Client
}

type StatusError struct {
	StatusCode   int
	Status       string
	Body         string
	RetryAfter   time.Duration
	RequestURL   string
	ResponseBody string
}

func (e *StatusError) Error() string {
	if strings.TrimSpace(e.Body) != "" {
		return fmt.Sprintf("%s: %s", e.Status, e.Body)
	}
	return e.Status
}

func NewClient(site, email, apiToken string) *Client {
	return &Client{
		baseURL:    normalizeBaseURL(site),
		email:      strings.TrimSpace(email),
		apiToken:   strings.TrimSpace(apiToken),
		httpClient: &http.Client{Timeout: defaultTimeout},
	}
}

func (c *Client) SetHTTPClient(client *http.Client) {
	if client != nil {
		c.httpClient = client
	}
}

func (c *Client) ListSpaces(ctx context.Context, limit int) ([]Space, error) {
	if limit <= 0 {
		limit = 250
	}

	var spaces []Space
	next := fmt.Sprintf("/wiki/api/v2/spaces?limit=%d", limit)
	for next != "" {
		var payload listSpacesResponse
		if err := c.getJSON(ctx, next, &payload); err != nil {
			return nil, err
		}
		spaces = append(spaces, payload.Results...)
		next = payload.Links.Next
	}
	return spaces, nil
}

func (c *Client) ListSpacePages(ctx context.Context, spaceID, sortBy string, limit int, cursor string) ([]Page, string, error) {
	if limit <= 0 {
		limit = 250
	}
	query := url.Values{}
	query.Set("space-id", strings.TrimSpace(spaceID))
	query.Set("limit", strconv.Itoa(limit))
	query.Set("body-format", "storage")
	if trimmed := strings.TrimSpace(sortBy); trimmed != "" {
		query.Set("sort", trimmed)
	}

	path := "/wiki/api/v2/pages?" + query.Encode()
	if trimmed := strings.TrimSpace(cursor); trimmed != "" {
		path = trimmed
	}

	var payload pagesResponse
	if err := c.getJSON(ctx, path, &payload); err != nil {
		return nil, "", err
	}
	return payload.Results, payload.Links.Next, nil
}

func (c *Client) GetPage(ctx context.Context, pageID string) (*Page, error) {
	var page Page
	if err := c.getJSON(ctx, fmt.Sprintf("/wiki/api/v2/pages/%s?body-format=storage", url.PathEscape(pageID)), &page); err != nil {
		return nil, err
	}
	return &page, nil
}

func (c *Client) GetPageVersions(ctx context.Context, pageID string) ([]PageVersion, error) {
	next := fmt.Sprintf("/wiki/api/v2/pages/%s/versions?limit=250&body-format=storage", url.PathEscape(pageID))
	var versions []PageVersion
	for next != "" {
		var payload versionsResponse
		if err := c.getJSON(ctx, next, &payload); err != nil {
			return nil, err
		}
		versions = append(versions, payload.Results...)
		next = payload.Links.Next
	}
	return versions, nil
}

func (c *Client) GetPageLabels(ctx context.Context, pageID string) ([]Label, error) {
	next := fmt.Sprintf("/wiki/api/v2/pages/%s/labels?limit=250", url.PathEscape(pageID))
	var labels []Label
	for next != "" {
		var payload labelsResponse
		if err := c.getJSON(ctx, next, &payload); err != nil {
			return nil, err
		}
		labels = append(labels, payload.Results...)
		next = payload.Links.Next
	}
	return labels, nil
}

func (c *Client) GetUser(ctx context.Context, userID string) (*User, error) {
	users, err := c.LookupUsers(ctx, []string{userID})
	if err != nil {
		return nil, err
	}
	if len(users) == 0 {
		return nil, &StatusError{StatusCode: http.StatusNotFound, Status: "404 Not Found", Body: "user not found"}
	}
	return &users[0], nil
}

func (c *Client) LookupUsers(ctx context.Context, userIDs []string) ([]User, error) {
	ids := make([]string, 0, len(userIDs))
	for _, id := range userIDs {
		if trimmed := strings.TrimSpace(id); trimmed != "" {
			ids = append(ids, trimmed)
		}
	}
	if len(ids) == 0 {
		return nil, nil
	}

	body := map[string]any{"accountIds": ids}
	var payload bulkUsersResponse
	if err := c.doJSON(ctx, http.MethodPost, "/wiki/api/v2/users-bulk", body, &payload); err != nil {
		return nil, err
	}
	return payload.Results, nil
}

func (c *Client) CreatePage(ctx context.Context, req CreatePageRequest) (*Page, error) {
	body := map[string]any{
		"spaceId": strings.TrimSpace(req.SpaceID),
		"status":  "current",
		"title":   strings.TrimSpace(req.Title),
		"body": map[string]any{
			"representation": "storage",
			"value":          req.BodyHTML,
		},
	}
	if trimmed := strings.TrimSpace(req.ParentID); trimmed != "" {
		body["parentId"] = trimmed
	}

	var page Page
	if err := c.doJSON(ctx, http.MethodPost, "/wiki/api/v2/pages", body, &page); err != nil {
		return nil, err
	}
	return &page, nil
}

func (c *Client) UpdatePage(ctx context.Context, pageID string, req UpdatePageRequest) (*Page, error) {
	body := map[string]any{
		"id":     strings.TrimSpace(pageID),
		"status": "current",
		"title":  strings.TrimSpace(req.Title),
		"version": map[string]any{
			"number":  req.VersionNumber,
			"message": req.VersionMessage,
		},
		"body": map[string]any{
			"representation": "storage",
			"value":          req.BodyHTML,
		},
	}

	var page Page
	if err := c.doJSON(ctx, http.MethodPut, fmt.Sprintf("/wiki/api/v2/pages/%s", url.PathEscape(pageID)), body, &page); err != nil {
		return nil, err
	}
	return &page, nil
}

func (c *Client) CreateFooterComment(ctx context.Context, pageID string, bodyHTML string) (*Comment, error) {
	body := map[string]any{
		"pageId": strings.TrimSpace(pageID),
		"body": map[string]any{
			"representation": "storage",
			"value":          bodyHTML,
		},
	}
	var comment Comment
	if err := c.doJSON(ctx, http.MethodPost, "/wiki/api/v2/footer-comments", body, &comment); err != nil {
		return nil, err
	}
	if comment.PageID == "" {
		comment.PageID = strings.TrimSpace(pageID)
	}
	return &comment, nil
}

func (c *Client) DeletePage(ctx context.Context, pageID string) error {
	return c.doJSON(ctx, http.MethodDelete, fmt.Sprintf("/wiki/api/v2/pages/%s", url.PathEscape(pageID)), nil, nil)
}

func (c *Client) DeleteFooterComment(ctx context.Context, commentID string) error {
	return c.doJSON(ctx, http.MethodDelete, fmt.Sprintf("/wiki/api/v2/footer-comments/%s", url.PathEscape(commentID)), nil, nil)
}

func (c *Client) SearchCQL(ctx context.Context, cql, expand string, start, limit int) ([]Page, int, int, int, error) {
	if limit <= 0 {
		limit = 250
	}

	query := url.Values{}
	query.Set("cql", cql)
	query.Set("limit", strconv.Itoa(limit))
	query.Set("start", strconv.Itoa(start))
	if trimmed := strings.TrimSpace(expand); trimmed != "" {
		query.Set("expand", trimmed)
	}

	var payload cqlSearchResult
	if err := c.getJSON(ctx, "/wiki/rest/api/content/search?"+query.Encode(), &payload); err != nil {
		return nil, 0, 0, 0, err
	}

	pages := make([]Page, 0, len(payload.Results))
	for _, result := range payload.Results {
		pages = append(pages, result.ToPage())
	}
	return pages, payload.Start, payload.Limit, payload.Total, nil
}

func (c *Client) getJSON(ctx context.Context, path string, out any) error {
	resp, err := c.do(ctx, http.MethodGet, path, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return json.NewDecoder(resp.Body).Decode(out)
}

func (c *Client) doJSON(ctx context.Context, method, path string, payload any, out any) error {
	var body io.Reader
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(raw)
	}

	resp, err := c.do(ctx, method, path, body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if out == nil {
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func (c *Client) do(ctx context.Context, method, path string, body io.Reader) (*http.Response, error) {
	requestURL := resolveURL(c.baseURL, path)

	for attempt := 0; attempt < 3; attempt++ {
		var requestBody io.Reader
		if seeker, ok := body.(io.ReadSeeker); ok {
			_, _ = seeker.Seek(0, io.SeekStart)
			requestBody = seeker
		} else {
			requestBody = body
		}

		req, err := http.NewRequestWithContext(ctx, method, requestURL, requestBody)
		if err != nil {
			return nil, err
		}

		req.Header.Set("Accept", "application/json")
		req.Header.Set("Content-Type", "application/json")
		req.SetBasicAuth(c.email, c.apiToken)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return nil, err
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			retryAfter := retryAfterDuration(resp.Header.Get("Retry-After"))
			_ = resp.Body.Close()
			if attempt < 2 {
				nexadapter.LogInfo("confluence rate limited on %s %s; retrying in %s", method, requestURL, retryAfter)
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				case <-time.After(retryAfter):
					continue
				}
			}
			return nil, &StatusError{
				StatusCode: http.StatusTooManyRequests,
				Status:     resp.Status,
				RetryAfter: retryAfter,
				RequestURL: requestURL,
			}
		}

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return resp, nil
		}

		raw, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		return nil, &StatusError{
			StatusCode:   resp.StatusCode,
			Status:       resp.Status,
			Body:         strings.TrimSpace(string(raw)),
			RetryAfter:   retryAfterDuration(resp.Header.Get("Retry-After")),
			RequestURL:   requestURL,
			ResponseBody: strings.TrimSpace(string(raw)),
		}
	}

	return nil, &StatusError{
		StatusCode: http.StatusTooManyRequests,
		Status:     "429 Too Many Requests",
		RequestURL: requestURL,
	}
}

func normalizeBaseURL(site string) string {
	trimmed := strings.TrimSpace(site)
	if strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
		return strings.TrimSuffix(trimmed, "/")
	}
	trimmed = strings.TrimSuffix(trimmed, "/")
	trimmed = strings.TrimSuffix(trimmed, ".atlassian.net")
	return "https://" + trimmed + ".atlassian.net"
}

func resolveURL(baseURL, path string) string {
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}
	if strings.HasPrefix(path, "/") {
		return strings.TrimSuffix(baseURL, "/") + path
	}

	base, err := url.Parse(strings.TrimSuffix(baseURL, "/") + "/")
	if err != nil {
		return strings.TrimSuffix(baseURL, "/") + "/" + strings.TrimPrefix(path, "/")
	}
	ref, err := url.Parse(path)
	if err != nil {
		return strings.TrimSuffix(baseURL, "/") + "/" + strings.TrimPrefix(path, "/")
	}
	return base.ResolveReference(ref).String()
}

func retryAfterDuration(raw string) time.Duration {
	if seconds, err := strconv.Atoi(strings.TrimSpace(raw)); err == nil {
		if seconds <= 0 {
			return time.Second
		}
		return time.Duration(seconds) * time.Second
	}
	return time.Second
}
