package tools

import (
	"context"
	"fmt"

	gcatypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"
)

// DeliveryRequest describes a message to be sent through an adapter.
type DeliveryRequest struct {
	ChannelID string
	Content   string
	ReplyTo   string
	ThreadID  string
}

// MessageTool sends messages through adapters.
type MessageTool struct {
	deliveryFn func(adapterID string, req DeliveryRequest) error
}

// NewMessageTool creates a MessageTool with the given delivery function.
func NewMessageTool(deliveryFn func(adapterID string, req DeliveryRequest) error) *MessageTool {
	return &MessageTool{deliveryFn: deliveryFn}
}

// Definition returns the tool schema.
func (t *MessageTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        "message_send",
		Description: "Send a message through an adapter to a channel. Used for proactive outbound messaging.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"adapter_id": map[string]any{
					"type":        "string",
					"description": "The adapter to send through (e.g. 'discord', 'slack')",
				},
				"channel_id": map[string]any{
					"type":        "string",
					"description": "Target channel ID",
				},
				"content": map[string]any{
					"type":        "string",
					"description": "Message content to send",
				},
				"reply_to": map[string]any{
					"type":        "string",
					"description": "Message ID to reply to (optional)",
				},
				"thread_id": map[string]any{
					"type":        "string",
					"description": "Thread ID for threaded replies (optional)",
				},
			},
			"required": []string{"adapter_id", "channel_id", "content"},
		},
	}
}

// Execute sends a message.
func (t *MessageTool) Execute(ctx context.Context, toolCallID string, args map[string]any) (gcatypes.ToolResult, error) {
	adapterID, _ := args["adapter_id"].(string)
	channelID, _ := args["channel_id"].(string)
	content, _ := args["content"].(string)
	replyTo, _ := args["reply_to"].(string)
	threadID, _ := args["thread_id"].(string)

	if adapterID == "" {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "adapter_id is required"}},
			IsError: true,
		}, nil
	}
	if channelID == "" {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "channel_id is required"}},
			IsError: true,
		}, nil
	}
	if content == "" {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "content is required"}},
			IsError: true,
		}, nil
	}

	if t.deliveryFn == nil {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "message delivery is not configured"}},
			IsError: true,
		}, nil
	}

	err := t.deliveryFn(adapterID, DeliveryRequest{
		ChannelID: channelID,
		Content:   content,
		ReplyTo:   replyTo,
		ThreadID:  threadID,
	})
	if err != nil {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("Failed to send message: %v", err)}},
			IsError: true,
		}, nil
	}

	return gcatypes.ToolResult{
		Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("Message sent to %s/%s", adapterID, channelID)}},
	}, nil
}
