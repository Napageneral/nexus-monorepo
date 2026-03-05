package tools

import (
	"context"

	gcatypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"
)

// BrowserTool is a stub for browser automation via an external endpoint.
type BrowserTool struct {
	endpoint string
}

// NewBrowserTool creates a BrowserTool pointed at the given endpoint.
func NewBrowserTool(endpoint string) *BrowserTool {
	return &BrowserTool{endpoint: endpoint}
}

// Definition returns the tool schema.
func (t *BrowserTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        "browser",
		Description: "Execute browser automation actions via an external browser control endpoint. Currently a stub.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"action": map[string]any{
					"type":        "string",
					"description": "Browser action to perform (e.g. 'navigate', 'screenshot', 'click')",
				},
				"url": map[string]any{
					"type":        "string",
					"description": "URL to navigate to (for navigate action)",
				},
				"selector": map[string]any{
					"type":        "string",
					"description": "CSS selector (for click action)",
				},
			},
			"required": []string{"action"},
		},
	}
}

// Execute is a stub that returns a not-available message.
func (t *BrowserTool) Execute(ctx context.Context, toolCallID string, args map[string]any) (gcatypes.ToolResult, error) {
	return gcatypes.ToolResult{
		Content: []gcatypes.ContentBlock{{Type: "text", Text: "Browser automation is not yet implemented. This tool will connect to an external browser control endpoint."}},
		IsError: true,
	}, nil
}
