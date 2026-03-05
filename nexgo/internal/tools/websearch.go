package tools

import (
	"context"

	"github.com/Napageneral/nexus/internal/config"
	gcatypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"
)

// WebSearchTool searches the web using a configured search API.
// Currently a stub that returns an error explaining no API key is configured.
// In production, this would call Brave Search, Tavily, or a similar service.
type WebSearchTool struct {
	config *config.Config
}

func (t *WebSearchTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        "web_search",
		Description: "Search the web for current information. Returns relevant search results with titles, snippets, and URLs.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"query": map[string]any{"type": "string", "description": "The search query"},
				"limit": map[string]any{"type": "integer", "description": "Maximum number of results (default: 5)"},
			},
			"required": []string{"query"},
		},
	}
}

func (t *WebSearchTool) Execute(ctx context.Context, callID string, args map[string]any) (gcatypes.ToolResult, error) {
	query, _ := args["query"].(string)
	if query == "" {
		return errorResult("query parameter is required"), nil
	}

	// Stub: no search API configured yet.
	// In production, this would check t.config for a search API key and call
	// the appropriate provider (Brave Search, Tavily, SearXNG, etc.).
	return errorResult("Web search is not configured. No search API key found in configuration. " +
		"Configure a search provider (e.g., Brave Search, Tavily) in your Nexus config to enable this tool."), nil
}
