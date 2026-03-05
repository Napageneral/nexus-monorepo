package tools

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/Napageneral/nexus/internal/config"
	gcatypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"
)

const (
	// defaultFetchTimeout is the default HTTP request timeout.
	defaultFetchTimeout = 30 * time.Second

	// maxResponseSize limits the response body to 512KB to prevent memory issues.
	maxResponseSize = 512 * 1024
)

// WebFetchTool fetches a URL and returns the content as text.
// It strips HTML tags to produce readable text output, respects timeouts,
// and limits response size.
type WebFetchTool struct {
	config *config.Config

	// httpClient can be overridden for testing.
	httpClient *http.Client
}

func (t *WebFetchTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        "web_fetch",
		Description: "Fetch the content of a URL and return it as text. HTML is stripped to produce readable output. Useful for reading web pages, APIs, and other HTTP resources.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"url": map[string]any{"type": "string", "description": "The URL to fetch"},
				"raw": map[string]any{"type": "boolean", "description": "If true, return raw content without HTML stripping (default: false)"},
			},
			"required": []string{"url"},
		},
	}
}

func (t *WebFetchTool) Execute(ctx context.Context, callID string, args map[string]any) (gcatypes.ToolResult, error) {
	urlStr, _ := args["url"].(string)
	if urlStr == "" {
		return errorResult("url parameter is required"), nil
	}

	// Validate URL scheme.
	if !strings.HasPrefix(urlStr, "http://") && !strings.HasPrefix(urlStr, "https://") {
		return errorResult("url must start with http:// or https://"), nil
	}

	raw, _ := args["raw"].(bool)

	client := t.getClient()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, urlStr, nil)
	if err != nil {
		return errorResult(fmt.Sprintf("failed to create request: %v", err)), nil
	}
	req.Header.Set("User-Agent", "NexusBot/1.0")
	req.Header.Set("Accept", "text/html, application/json, text/plain, */*")

	resp, err := client.Do(req)
	if err != nil {
		return errorResult(fmt.Sprintf("fetch failed: %v", err)), nil
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return errorResult(fmt.Sprintf("HTTP %d: %s", resp.StatusCode, resp.Status)), nil
	}

	// Read body with size limit.
	limited := io.LimitReader(resp.Body, maxResponseSize+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return errorResult(fmt.Sprintf("failed to read response: %v", err)), nil
	}

	truncated := false
	if len(body) > maxResponseSize {
		body = body[:maxResponseSize]
		truncated = true
	}

	content := string(body)

	// Strip HTML if content appears to be HTML and raw mode is not requested.
	contentType := resp.Header.Get("Content-Type")
	isHTML := strings.Contains(contentType, "text/html") || strings.HasPrefix(strings.TrimSpace(content), "<")
	if isHTML && !raw {
		content = stripHTML(content)
	}

	if truncated {
		content += "\n\n[Content truncated: response exceeded 512KB limit]"
	}

	result := gcatypes.ToolResult{
		Content: []gcatypes.ContentBlock{
			{Type: "text", Text: content},
		},
		Details: map[string]any{
			"status_code":  resp.StatusCode,
			"content_type": contentType,
			"url":          urlStr,
			"truncated":    truncated,
		},
	}
	return result, nil
}

// getClient returns the HTTP client, creating a default one if none is set.
func (t *WebFetchTool) getClient() *http.Client {
	if t.httpClient != nil {
		return t.httpClient
	}
	return &http.Client{
		Timeout: defaultFetchTimeout,
	}
}

// stripHTML removes HTML tags, scripts, styles, and normalizes whitespace.
func stripHTML(html string) string {
	// Remove script and style blocks.
	reScript := regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	html = reScript.ReplaceAllString(html, "")

	reStyle := regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	html = reStyle.ReplaceAllString(html, "")

	// Replace block-level tags with newlines.
	reBlock := regexp.MustCompile(`(?i)</(p|div|h[1-6]|li|tr|br|hr)[^>]*>`)
	html = reBlock.ReplaceAllString(html, "\n")
	reBR := regexp.MustCompile(`(?i)<br[^>]*/?>`)
	html = reBR.ReplaceAllString(html, "\n")

	// Remove all remaining HTML tags.
	reTag := regexp.MustCompile(`<[^>]+>`)
	html = reTag.ReplaceAllString(html, "")

	// Decode common HTML entities.
	html = strings.ReplaceAll(html, "&amp;", "&")
	html = strings.ReplaceAll(html, "&lt;", "<")
	html = strings.ReplaceAll(html, "&gt;", ">")
	html = strings.ReplaceAll(html, "&quot;", `"`)
	html = strings.ReplaceAll(html, "&#39;", "'")
	html = strings.ReplaceAll(html, "&nbsp;", " ")

	// Collapse multiple blank lines into two newlines.
	reBlank := regexp.MustCompile(`\n{3,}`)
	html = reBlank.ReplaceAllString(html, "\n\n")

	return strings.TrimSpace(html)
}
