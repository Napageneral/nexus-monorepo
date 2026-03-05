package tools

import (
	"context"
	"fmt"
	"strings"
	"time"

	gcatypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"
)

// ---------------------------------------------------------------------------
// Interfaces to avoid circular imports with broker
// ---------------------------------------------------------------------------

// SubAgentDispatcher dispatches work to sub-agents.
type SubAgentDispatcher interface {
	DispatchToSubAgent(ctx context.Context, parentSession, agentID, prompt string) (string, error)
	SubAgentRegistry() SubAgentRegistryReader
}

// SubAgentRegistryReader reads sub-agent state.
type SubAgentRegistryReader interface {
	GetStatus(id string) (*SubAgentStatus, error)
	ListForSession(sessionKey string) []*SubAgentStatus
}

// SubAgentStatus is the tool-layer view of sub-agent state.
type SubAgentStatus struct {
	ID     string
	Status string
	Result string
}

// ---------------------------------------------------------------------------
// AgentSendTool - dispatch work to a sub-agent
// ---------------------------------------------------------------------------

// AgentSendTool dispatches work to a sub-agent and returns the sub-agent ID.
type AgentSendTool struct {
	broker     SubAgentDispatcher
	sessionKey string
}

// NewAgentSendTool creates an AgentSendTool.
func NewAgentSendTool(broker SubAgentDispatcher, sessionKey string) *AgentSendTool {
	return &AgentSendTool{broker: broker, sessionKey: sessionKey}
}

// Definition returns the tool schema.
func (t *AgentSendTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        "agent_send",
		Description: "Dispatch a task to a sub-agent. Returns a sub-agent ID that can be used to check status.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"agent_id": map[string]any{
					"type":        "string",
					"description": "ID of the agent to dispatch to",
				},
				"prompt": map[string]any{
					"type":        "string",
					"description": "The task or instruction for the sub-agent",
				},
			},
			"required": []string{"agent_id", "prompt"},
		},
	}
}

// Execute dispatches to a sub-agent.
func (t *AgentSendTool) Execute(ctx context.Context, toolCallID string, args map[string]any) (gcatypes.ToolResult, error) {
	agentID, _ := args["agent_id"].(string)
	prompt, _ := args["prompt"].(string)

	if agentID == "" {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "agent_id is required"}},
			IsError: true,
		}, nil
	}
	if prompt == "" {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "prompt is required"}},
			IsError: true,
		}, nil
	}

	if t.broker == nil {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "sub-agent dispatch is not available"}},
			IsError: true,
		}, nil
	}

	id, err := t.broker.DispatchToSubAgent(ctx, t.sessionKey, agentID, prompt)
	if err != nil {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("Failed to dispatch sub-agent: %v", err)}},
			IsError: true,
		}, nil
	}

	return gcatypes.ToolResult{
		Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("Sub-agent dispatched. ID: %s", id)}},
		Details: map[string]any{"sub_agent_id": id},
	}, nil
}

// ---------------------------------------------------------------------------
// AgentStatusTool - check sub-agent status
// ---------------------------------------------------------------------------

// AgentStatusTool checks the status of a sub-agent.
type AgentStatusTool struct {
	registry SubAgentRegistryReader
}

// NewAgentStatusTool creates an AgentStatusTool.
func NewAgentStatusTool(registry SubAgentRegistryReader) *AgentStatusTool {
	return &AgentStatusTool{registry: registry}
}

// Definition returns the tool schema.
func (t *AgentStatusTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        "agent_status",
		Description: "Check the status and result of a sub-agent by its ID.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"sub_agent_id": map[string]any{
					"type":        "string",
					"description": "The sub-agent ID returned by agent_send",
				},
			},
			"required": []string{"sub_agent_id"},
		},
	}
}

// Execute checks sub-agent status.
func (t *AgentStatusTool) Execute(ctx context.Context, toolCallID string, args map[string]any) (gcatypes.ToolResult, error) {
	id, _ := args["sub_agent_id"].(string)
	if id == "" {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "sub_agent_id is required"}},
			IsError: true,
		}, nil
	}

	if t.registry == nil {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "sub-agent registry is not available"}},
			IsError: true,
		}, nil
	}

	status, err := t.registry.GetStatus(id)
	if err != nil {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("Sub-agent not found: %v", err)}},
			IsError: true,
		}, nil
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "Sub-agent %s\nStatus: %s\n", status.ID, status.Status)
	if status.Result != "" {
		fmt.Fprintf(&sb, "Result: %s\n", status.Result)
	}

	return gcatypes.ToolResult{
		Content: []gcatypes.ContentBlock{{Type: "text", Text: sb.String()}},
		Details: map[string]any{
			"sub_agent_id": status.ID,
			"status":       status.Status,
		},
	}, nil
}

// ---------------------------------------------------------------------------
// WaitForAgentTool - block until sub-agent completes
// ---------------------------------------------------------------------------

// WaitForAgentTool polls until a sub-agent reaches a terminal state.
type WaitForAgentTool struct {
	registry SubAgentRegistryReader
}

// NewWaitForAgentTool creates a WaitForAgentTool.
func NewWaitForAgentTool(registry SubAgentRegistryReader) *WaitForAgentTool {
	return &WaitForAgentTool{registry: registry}
}

// Definition returns the tool schema.
func (t *WaitForAgentTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        "agent_wait",
		Description: "Wait for a sub-agent to complete, then return its result. Times out after 60 seconds.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"sub_agent_id": map[string]any{
					"type":        "string",
					"description": "The sub-agent ID to wait for",
				},
			},
			"required": []string{"sub_agent_id"},
		},
	}
}

// Execute waits for the sub-agent to complete.
func (t *WaitForAgentTool) Execute(ctx context.Context, toolCallID string, args map[string]any) (gcatypes.ToolResult, error) {
	id, _ := args["sub_agent_id"].(string)
	if id == "" {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "sub_agent_id is required"}},
			IsError: true,
		}, nil
	}

	if t.registry == nil {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "sub-agent registry is not available"}},
			IsError: true,
		}, nil
	}

	timeout := time.After(60 * time.Second)
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return gcatypes.ToolResult{
				Content: []gcatypes.ContentBlock{{Type: "text", Text: "context cancelled while waiting for sub-agent"}},
				IsError: true,
			}, nil
		case <-timeout:
			return gcatypes.ToolResult{
				Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("Timeout waiting for sub-agent %s", id)}},
				IsError: true,
			}, nil
		case <-ticker.C:
			status, err := t.registry.GetStatus(id)
			if err != nil {
				return gcatypes.ToolResult{
					Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("Sub-agent not found: %v", err)}},
					IsError: true,
				}, nil
			}

			if status.Status == "completed" || status.Status == "failed" {
				isErr := status.Status == "failed"
				return gcatypes.ToolResult{
					Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("Sub-agent %s %s.\nResult: %s", id, status.Status, status.Result)}},
					IsError: isErr,
					Details: map[string]any{
						"sub_agent_id": id,
						"status":       status.Status,
					},
				}, nil
			}
		}
	}
}
