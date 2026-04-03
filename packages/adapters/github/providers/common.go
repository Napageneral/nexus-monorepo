package providers

import (
	"errors"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	core "github.com/nexus-project/github/internal/gitadapter"
)

func apiErrorFromResponse(response *http.Response) error {
	body, _ := io.ReadAll(response.Body)
	message := strings.TrimSpace(string(body))
	retryAfterMs := 0
	if isGitHubRateLimitResponse(response) {
		retryAfterMs = retryAfterMillisecondsFromRateLimitHeaders(response)
	}
	return &core.APIError{
		StatusCode:   response.StatusCode,
		Status:       response.Status,
		Message:      message,
		RetryAfterMs: retryAfterMs,
	}
}

func isGitHubRateLimitResponse(response *http.Response) bool {
	if response == nil {
		return false
	}
	if response.StatusCode == http.StatusTooManyRequests {
		return true
	}
	if response.StatusCode != http.StatusForbidden {
		return false
	}
	if strings.TrimSpace(response.Header.Get("Retry-After")) != "" {
		return true
	}
	if strings.TrimSpace(response.Header.Get("X-RateLimit-Remaining")) == "0" {
		return true
	}
	return false
}

func isGitHubEmptyRepositoryAPIError(err error) bool {
	var apiErr *core.APIError
	if !errors.As(err, &apiErr) {
		return false
	}
	if apiErr.StatusCode != http.StatusConflict {
		return false
	}
	message := strings.ToLower(apiErr.Message)
	return strings.Contains(message, "repository is empty")
}

func retryAfterMillisecondsFromRateLimitHeaders(response *http.Response) int {
	if response == nil {
		return 0
	}
	if raw := strings.TrimSpace(response.Header.Get("Retry-After")); raw != "" {
		if seconds, err := strconv.Atoi(raw); err == nil {
			return seconds * 1000
		}
	}
	if raw := strings.TrimSpace(response.Header.Get("X-RateLimit-Reset")); raw != "" {
		if resetUnix, err := strconv.ParseInt(raw, 10, 64); err == nil {
			resetTime := time.Unix(resetUnix, 0).UTC()
			if delay := time.Until(resetTime); delay > 0 {
				return int(delay / time.Millisecond)
			}
		}
	}
	return 0
}

func decodeJSONResponse(response *http.Response, target any) error {
	if err := json.NewDecoder(response.Body).Decode(target); err != nil {
		return fmt.Errorf("decode json response: %w", err)
	}
	return nil
}

func readTextResponse(response *http.Response) ([]byte, error) {
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, fmt.Errorf("read text response: %w", err)
	}
	return body, nil
}

func splitRepoFullName(fullName string) (string, string) {
	parts := strings.SplitN(strings.TrimSpace(fullName), "/", 2)
	if len(parts) != 2 {
		return strings.TrimSpace(fullName), strings.TrimSpace(fullName)
	}
	return parts[0], parts[1]
}

func splitGitLabRepoFullName(fullName string) (string, string) {
	parts := strings.Split(strings.TrimSpace(fullName), "/")
	if len(parts) < 2 {
		return strings.TrimSpace(fullName), strings.TrimSpace(fullName)
	}
	return strings.Join(parts[:len(parts)-1], "/"), parts[len(parts)-1]
}

func branchRefs(repo core.Repository, allBranches []string) []string {
	if len(repo.TrackedBranches) > 0 {
		return repo.TrackedBranches
	}
	if len(allBranches) > 0 {
		return allBranches
	}
	if strings.TrimSpace(repo.DefaultBranch) != "" {
		return []string{repo.DefaultBranch}
	}
	return []string{"main"}
}

func appendUniqueStrings(existing []string, values ...string) []string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		found := false
		for _, current := range existing {
			if strings.TrimSpace(current) == trimmed {
				found = true
				break
			}
		}
		if !found {
			existing = append(existing, trimmed)
		}
	}
	return existing
}

func parseAuthorRaw(raw string) (name string, email string) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", ""
	}
	start := strings.LastIndex(trimmed, "<")
	end := strings.LastIndex(trimmed, ">")
	if start >= 0 && end > start {
		name = strings.TrimSpace(trimmed[:start])
		email = strings.TrimSpace(trimmed[start+1 : end])
		return name, email
	}
	return trimmed, ""
}

func basicAuthHeader(username, password string) string {
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(username+":"+password))
}

func canonicalRemoteURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return trimmed
	}
	parsed.User = nil
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String()
}

func parseMillis(ts string) int64 {
	formats := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05 -0700 MST",
	}
	for _, format := range formats {
		if parsed, err := time.Parse(format, strings.TrimSpace(ts)); err == nil {
			return parsed.UnixMilli()
		}
	}
	return 0
}
