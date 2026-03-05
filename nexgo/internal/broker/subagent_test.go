package broker

import (
	"context"
	"log/slog"
	"testing"
	"time"
)

func TestSubAgentRegistration(t *testing.T) {
	reg := NewSubAgentRegistry()

	// Register a new sub-agent.
	err := reg.Register("sa-1", "parent-session", "agent-alpha")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	// Verify it exists with pending status.
	state, err := reg.GetStatus("sa-1")
	if err != nil {
		t.Fatalf("GetStatus: %v", err)
	}
	if state.ID != "sa-1" {
		t.Errorf("ID = %q, want 'sa-1'", state.ID)
	}
	if state.ParentSession != "parent-session" {
		t.Errorf("ParentSession = %q, want 'parent-session'", state.ParentSession)
	}
	if state.AgentID != "agent-alpha" {
		t.Errorf("AgentID = %q, want 'agent-alpha'", state.AgentID)
	}
	if state.Status != "pending" {
		t.Errorf("Status = %q, want 'pending'", state.Status)
	}

	// Duplicate registration should fail.
	err = reg.Register("sa-1", "other-session", "agent-beta")
	if err == nil {
		t.Error("expected error on duplicate registration")
	}
}

func TestSubAgentStatus(t *testing.T) {
	reg := NewSubAgentRegistry()

	// GetStatus for non-existent agent should return error.
	_, err := reg.GetStatus("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent sub-agent")
	}

	// Register, then set result.
	if err := reg.Register("sa-2", "parent-1", "agent-a"); err != nil {
		t.Fatalf("Register: %v", err)
	}

	if err := reg.SetResult("sa-2", "done!", "completed"); err != nil {
		t.Fatalf("SetResult: %v", err)
	}

	state, err := reg.GetStatus("sa-2")
	if err != nil {
		t.Fatalf("GetStatus: %v", err)
	}
	if state.Status != "completed" {
		t.Errorf("Status = %q, want 'completed'", state.Status)
	}
	if state.Result != "done!" {
		t.Errorf("Result = %q, want 'done!'", state.Result)
	}
	if state.CompletedAt == nil {
		t.Error("CompletedAt should be set after SetResult")
	}

	// SetResult on nonexistent agent should fail.
	if err := reg.SetResult("nonexistent", "x", "failed"); err == nil {
		t.Error("expected error for nonexistent sub-agent SetResult")
	}
}

func TestSubAgentListForSession(t *testing.T) {
	reg := NewSubAgentRegistry()

	// Register agents across multiple parent sessions.
	_ = reg.Register("sa-a1", "session-A", "agent-1")
	_ = reg.Register("sa-a2", "session-A", "agent-2")
	_ = reg.Register("sa-b1", "session-B", "agent-1")

	list := reg.ListForSession("session-A")
	if len(list) != 2 {
		t.Fatalf("ListForSession(session-A) = %d items, want 2", len(list))
	}

	ids := map[string]bool{}
	for _, s := range list {
		ids[s.ID] = true
	}
	if !ids["sa-a1"] || !ids["sa-a2"] {
		t.Errorf("expected sa-a1 and sa-a2, got %v", ids)
	}

	// Empty result for unknown session.
	list = reg.ListForSession("session-C")
	if len(list) != 0 {
		t.Errorf("ListForSession(session-C) = %d items, want 0", len(list))
	}
}

func TestMultiAgentDispatch(t *testing.T) {
	runner := &mockRunner{}
	ledgers := testLedgers(t)
	cfg := testConfig()

	b := NewBroker(runner, ledgers, cfg, slog.Default())
	ctx := context.Background()

	// Verify the sub-agent registry is initialized.
	if b.SubAgentRegistry() == nil {
		t.Fatal("SubAgentRegistry() returned nil")
	}

	// Dispatch a sub-agent.
	id, err := b.DispatchToSubAgent(ctx, "parent-session-1", "helper-agent", "do something")
	if err != nil {
		t.Fatalf("DispatchToSubAgent: %v", err)
	}
	if id == "" {
		t.Fatal("expected non-empty sub-agent ID")
	}

	// Wait for the goroutine to complete.
	time.Sleep(200 * time.Millisecond)

	// Verify the sub-agent was registered and completed.
	state, err := b.SubAgentRegistry().GetStatus(id)
	if err != nil {
		t.Fatalf("GetStatus: %v", err)
	}
	if state.Status != "completed" {
		t.Errorf("Status = %q, want 'completed'", state.Status)
	}
	if state.Result != "ok" {
		t.Errorf("Result = %q, want 'ok'", state.Result)
	}
	if state.AgentID != "helper-agent" {
		t.Errorf("AgentID = %q, want 'helper-agent'", state.AgentID)
	}

	// Verify the runner was called with expected parameters.
	calls := runner.getCalls()
	if len(calls) != 1 {
		t.Fatalf("expected 1 runner call, got %d", len(calls))
	}
	if calls[0].Prompt != "do something" {
		t.Errorf("prompt = %q, want 'do something'", calls[0].Prompt)
	}
	if calls[0].AgentID != "helper-agent" {
		t.Errorf("agentID = %q, want 'helper-agent'", calls[0].AgentID)
	}

	// Sub-agent should be listed under its parent session.
	list := b.SubAgentRegistry().ListForSession("parent-session-1")
	if len(list) != 1 {
		t.Fatalf("expected 1 sub-agent for session, got %d", len(list))
	}
}
