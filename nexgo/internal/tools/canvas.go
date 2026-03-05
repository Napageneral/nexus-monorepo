package tools

import (
	"context"

	gcatypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"
)

// CanvasTool is a stub for generating structured UI content (canvas cards).
type CanvasTool struct{}

// NewCanvasTool creates a CanvasTool.
func NewCanvasTool() *CanvasTool {
	return &CanvasTool{}
}

// Definition returns the tool schema.
func (t *CanvasTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        "canvas",
		Description: "Generate structured UI content for rich display. Currently a stub.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"type": map[string]any{
					"type":        "string",
					"description": "Canvas type (e.g. 'card', 'table', 'chart')",
				},
				"title": map[string]any{
					"type":        "string",
					"description": "Title for the canvas element",
				},
				"content": map[string]any{
					"type":        "string",
					"description": "Content payload (JSON or markdown)",
				},
			},
			"required": []string{"type", "content"},
		},
	}
}

// Execute is a stub that returns a not-available message.
func (t *CanvasTool) Execute(ctx context.Context, toolCallID string, args map[string]any) (gcatypes.ToolResult, error) {
	return gcatypes.ToolResult{
		Content: []gcatypes.ContentBlock{{Type: "text", Text: "Canvas rendering is not yet implemented. This tool will generate structured UI content."}},
		IsError: true,
	}, nil
}
