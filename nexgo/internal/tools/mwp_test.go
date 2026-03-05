//go:build fts5 || sqlite_fts5

package tools

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Mock dispatcher and registry
// ---------------------------------------------------------------------------

type mockSubAgentRegistry struct {
	agents map[string]*SubAgentStatus
	mu     sync.RWMutex
}

func newMockRegistry() *mockSubAgentRegistry {
	return &mockSubAgentRegistry{agents: make(map[string]*SubAgentStatus)}
}

func (r *mockSubAgentRegistry) GetStatus(id string) (*SubAgentStatus, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	s, ok := r.agents[id]
	if !ok {
		return nil, fmt.Errorf("sub-agent %s not found", id)
	}
	cp := *s
	return &cp, nil
}

func (r *mockSubAgentRegistry) ListForSession(sessionKey string) []*SubAgentStatus {
	r.mu.RLock()
	defer r.mu.RUnlock()
	// Return all agents for simplicity.
	var result []*SubAgentStatus
	for _, s := range r.agents {
		cp := *s
		result = append(result, &cp)
	}
	return result
}

func (r *mockSubAgentRegistry) set(id, status, result string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.agents[id] = &SubAgentStatus{ID: id, Status: status, Result: result}
}

type mockDispatcher struct {
	registry *mockSubAgentRegistry
	calls    []dispatchCall
	mu       sync.Mutex
}

type dispatchCall struct {
	parentSession string
	agentID       string
	prompt        string
}

func newMockDispatcher() *mockDispatcher {
	return &mockDispatcher{registry: newMockRegistry()}
}

func (d *mockDispatcher) DispatchToSubAgent(ctx context.Context, parentSession, agentID, prompt string) (string, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.calls = append(d.calls, dispatchCall{parentSession, agentID, prompt})
	id := fmt.Sprintf("sa-mock-%d", len(d.calls))
	d.registry.set(id, "running", "")
	// Simulate completion in background.
	go func() {
		time.Sleep(50 * time.Millisecond)
		d.registry.set(id, "completed", "sub-agent result")
	}()
	return id, nil
}

func (d *mockDispatcher) SubAgentRegistry() SubAgentRegistryReader {
	return d.registry
}

// ---------------------------------------------------------------------------
// TestMWPAgentSend
// ---------------------------------------------------------------------------

func TestMWPAgentSend(t *testing.T) {
	dispatcher := newMockDispatcher()
	tool := NewAgentSendTool(dispatcher, "test-session")

	ctx := context.Background()

	t.Run("dispatch success", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-1", map[string]any{
			"agent_id": "helper",
			"prompt":   "do the thing",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.IsError {
			t.Fatalf("unexpected tool error: %s", result.Content[0].Text)
		}
		if !strings.Contains(result.Content[0].Text, "Sub-agent dispatched") {
			t.Errorf("expected dispatch confirmation, got: %s", result.Content[0].Text)
		}

		dispatcher.mu.Lock()
		if len(dispatcher.calls) == 0 {
			t.Fatal("expected dispatcher to be called")
		}
		call := dispatcher.calls[len(dispatcher.calls)-1]
		dispatcher.mu.Unlock()

		if call.agentID != "helper" {
			t.Errorf("agentID = %q, want 'helper'", call.agentID)
		}
		if call.prompt != "do the thing" {
			t.Errorf("prompt = %q, want 'do the thing'", call.prompt)
		}
	})

	t.Run("missing agent_id", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-2", map[string]any{
			"prompt": "do stuff",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for missing agent_id")
		}
	})

	t.Run("missing prompt", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-3", map[string]any{
			"agent_id": "helper",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for missing prompt")
		}
	})

	t.Run("nil broker", func(t *testing.T) {
		nilTool := NewAgentSendTool(nil, "sess")
		result, err := nilTool.Execute(ctx, "call-4", map[string]any{
			"agent_id": "x",
			"prompt":   "y",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for nil broker")
		}
	})
}

// ---------------------------------------------------------------------------
// TestMWPAgentStatus
// ---------------------------------------------------------------------------

func TestMWPAgentStatus(t *testing.T) {
	reg := newMockRegistry()
	reg.set("sa-test-1", "completed", "all done")

	tool := NewAgentStatusTool(reg)
	ctx := context.Background()

	t.Run("existing agent", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-1", map[string]any{
			"sub_agent_id": "sa-test-1",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.IsError {
			t.Fatalf("unexpected tool error: %s", result.Content[0].Text)
		}
		if !strings.Contains(result.Content[0].Text, "completed") {
			t.Errorf("expected status to contain 'completed', got: %s", result.Content[0].Text)
		}
		if !strings.Contains(result.Content[0].Text, "all done") {
			t.Errorf("expected result to contain 'all done', got: %s", result.Content[0].Text)
		}
	})

	t.Run("nonexistent agent", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-2", map[string]any{
			"sub_agent_id": "nonexistent",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for nonexistent agent")
		}
	})

	t.Run("missing sub_agent_id", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-3", map[string]any{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for missing sub_agent_id")
		}
	})

	t.Run("nil registry", func(t *testing.T) {
		nilTool := NewAgentStatusTool(nil)
		result, err := nilTool.Execute(ctx, "call-4", map[string]any{
			"sub_agent_id": "x",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for nil registry")
		}
	})
}

// ---------------------------------------------------------------------------
// TestMWPWaitForAgent
// ---------------------------------------------------------------------------

func TestMWPWaitForAgent(t *testing.T) {
	reg := newMockRegistry()
	tool := NewWaitForAgentTool(reg)
	ctx := context.Background()

	t.Run("wait for completed agent", func(t *testing.T) {
		// Set agent as already completed.
		reg.set("sa-done", "completed", "finished work")

		result, err := tool.Execute(ctx, "call-1", map[string]any{
			"sub_agent_id": "sa-done",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.IsError {
			t.Fatalf("unexpected tool error: %s", result.Content[0].Text)
		}
		if !strings.Contains(result.Content[0].Text, "completed") {
			t.Errorf("expected 'completed' in result, got: %s", result.Content[0].Text)
		}
	})

	t.Run("wait for running agent that completes", func(t *testing.T) {
		reg.set("sa-running", "running", "")

		// Complete the agent in background.
		go func() {
			time.Sleep(300 * time.Millisecond)
			reg.set("sa-running", "completed", "done later")
		}()

		result, err := tool.Execute(ctx, "call-2", map[string]any{
			"sub_agent_id": "sa-running",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.IsError {
			t.Fatalf("unexpected tool error: %s", result.Content[0].Text)
		}
		if !strings.Contains(result.Content[0].Text, "done later") {
			t.Errorf("expected 'done later' in result, got: %s", result.Content[0].Text)
		}
	})

	t.Run("wait for failed agent", func(t *testing.T) {
		reg.set("sa-fail", "failed", "something went wrong")

		result, err := tool.Execute(ctx, "call-3", map[string]any{
			"sub_agent_id": "sa-fail",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error result for failed agent")
		}
		if !strings.Contains(result.Content[0].Text, "something went wrong") {
			t.Errorf("expected failure message, got: %s", result.Content[0].Text)
		}
	})

	t.Run("context cancelled", func(t *testing.T) {
		reg.set("sa-slow", "running", "")

		cancelCtx, cancel := context.WithCancel(ctx)
		cancel() // Cancel immediately.

		result, err := tool.Execute(cancelCtx, "call-4", map[string]any{
			"sub_agent_id": "sa-slow",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error result for cancelled context")
		}
	})

	t.Run("missing sub_agent_id", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-5", map[string]any{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for missing sub_agent_id")
		}
	})
}
