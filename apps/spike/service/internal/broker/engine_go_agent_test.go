package broker

import (
	"context"
	"strings"
	"testing"

	gosession "github.com/badlogic/pi-mono/go-coding-agent/pkg/session"
	gotypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"
)

func TestCollectToolCallsFromEntries_Completed(t *testing.T) {
	entries := []gosession.Entry{
		{
			Type: "message",
			Message: &gotypes.Message{
				Role: gotypes.RoleAssistant,
				Content: []gotypes.ContentBlock{
					{
						Type:      "toolCall",
						ID:        "call_1",
						Name:      "read",
						Arguments: map[string]any{"path": "README.md"},
					},
				},
			},
		},
		{
			Type: "message",
			Message: &gotypes.Message{
				Role:       gotypes.RoleTool,
				ToolCallID: "call_1",
				ToolName:   "read",
				Content: []gotypes.ContentBlock{
					{Type: "text", Text: "ok"},
				},
			},
		},
	}

	calls := collectToolCallsFromEntries(entries)
	if len(calls) != 1 {
		t.Fatalf("expected 1 tool call snapshot, got %d", len(calls))
	}
	if calls[0].ID != "call_1" || calls[0].ToolName != "read" || calls[0].Status != "completed" {
		t.Fatalf("unexpected tool call snapshot: %#v", calls[0])
	}
	if !strings.Contains(calls[0].ParamsJSON, `"path":"README.md"`) {
		t.Fatalf("expected params_json to include path, got %s", calls[0].ParamsJSON)
	}
	if !strings.Contains(calls[0].ResultJSON, `"toolCallId":"call_1"`) {
		t.Fatalf("expected result_json to include tool call id, got %s", calls[0].ResultJSON)
	}
}

func TestCollectToolCallsFromEntries_FailedMatchesByName(t *testing.T) {
	entries := []gosession.Entry{
		{
			Type: "message",
			Message: &gotypes.Message{
				Role: gotypes.RoleAssistant,
				Content: []gotypes.ContentBlock{
					{
						Type:      "toolCall",
						Name:      "grep",
						Arguments: map[string]any{"pattern": "TODO"},
					},
				},
			},
		},
		{
			Type: "message",
			Message: &gotypes.Message{
				Role:     gotypes.RoleTool,
				ToolName: "grep",
				IsError:  true,
				Content: []gotypes.ContentBlock{
					{Type: "text", Text: "tool failed"},
				},
			},
		},
	}

	calls := collectToolCallsFromEntries(entries)
	if len(calls) != 1 {
		t.Fatalf("expected 1 tool call snapshot, got %d", len(calls))
	}
	if calls[0].ToolName != "grep" || calls[0].Status != "failed" {
		t.Fatalf("unexpected failed tool call snapshot: %#v", calls[0])
	}
	if !strings.Contains(calls[0].Error, "tool failed") {
		t.Fatalf("expected error text in snapshot, got %q", calls[0].Error)
	}
}

func TestGoAgentHandle_SetThinkingLevelCompactAndEvents(t *testing.T) {
	sm := gosession.NewInMemory(".")
	if _, err := sm.AppendMessage(gotypes.TextMessage(gotypes.RoleUser, "please summarize this")); err != nil {
		t.Fatalf("append user message: %v", err)
	}
	if _, err := sm.AppendMessage(gotypes.TextMessage(gotypes.RoleAssistant, "sure, here is a detailed response")); err != nil {
		t.Fatalf("append assistant message: %v", err)
	}

	handle := &goAgentHandle{
		session:    sm,
		thinkLevel: "medium",
		listeners:  map[int]func(AgentEvent){},
	}

	eventCount := 0
	unsub := handle.OnEvent(func(event AgentEvent) {
		eventCount++
	})
	if err := handle.SetThinkingLevel(context.Background(), "high"); err != nil {
		t.Fatalf("set thinking level: %v", err)
	}
	if handle.thinkLevel != "high" {
		t.Fatalf("expected think level high, got %s", handle.thinkLevel)
	}

	compaction, err := handle.Compact(context.Background(), "")
	if err != nil {
		t.Fatalf("compact: %v", err)
	}
	if strings.TrimSpace(compaction.Summary) == "" {
		t.Fatalf("expected non-empty compaction summary")
	}
	if compaction.TokensAfter <= 0 {
		t.Fatalf("expected positive tokens after compaction, got %d", compaction.TokensAfter)
	}

	unsub()
	handle.emitEvent(AgentEvent{Type: "assistant", Data: map[string]interface{}{"text": "after unsubscribe"}})
	if eventCount < 2 {
		t.Fatalf("expected at least two events before unsubscribe, got %d", eventCount)
	}
}
