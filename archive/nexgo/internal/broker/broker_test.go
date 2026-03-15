package broker

import (
	"context"
	"log/slog"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/Napageneral/nexus/internal/config"
	"github.com/Napageneral/nexus/internal/db"
	"github.com/Napageneral/nexus/internal/pipeline"
)

// ---------------------------------------------------------------------------
// Mock runner
// ---------------------------------------------------------------------------

type mockRunner struct {
	calls []RunRequest
	delay time.Duration
	mu    sync.Mutex
}

func (m *mockRunner) Run(_ context.Context, req RunRequest) (*RunResult, error) {
	m.mu.Lock()
	m.calls = append(m.calls, req)
	m.mu.Unlock()
	if m.delay > 0 {
		time.Sleep(m.delay)
	}
	return &RunResult{Response: "ok", SessionID: "test-session"}, nil
}

func (m *mockRunner) Abort(_ string) {}

func (m *mockRunner) getCalls() []RunRequest {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]RunRequest, len(m.calls))
	copy(out, m.calls)
	return out
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func testLedgers(t *testing.T) *db.Ledgers {
	t.Helper()
	dataDir := filepath.Join(t.TempDir(), "data")
	l, err := db.OpenLedgers(dataDir)
	if err != nil {
		t.Fatalf("OpenLedgers: %v", err)
	}
	t.Cleanup(func() { l.Close() })
	return l
}

func testConfig() *config.Config {
	return &config.Config{
		Agents: config.AgentsConfig{
			Defaults: config.AgentDefaults{
				Model: config.ModelSelection{Primary: "test-model"},
			},
			List: []config.AgentConfig{
				{ID: "default", Default: true},
			},
		},
	}
}

func makeRequest(content string) *pipeline.NexusRequest {
	return pipeline.NewRequest(pipeline.NexusInput{
		Operation: "event.ingest",
		Routing: pipeline.Routing{
			Adapter:     "test",
			Platform:    "test",
			ContainerID: "chan-1",
			Sender:      pipeline.RoutingParticipant{ID: "user-1", Name: "Alice"},
			Receiver:    pipeline.RoutingParticipant{ID: "default", Name: "nexus"},
		},
		Payload: &pipeline.EventPayload{
			ID:          "evt-1",
			Content:     content,
			ContentType: pipeline.ContentText,
			Timestamp:   time.Now().UnixMilli(),
		},
	})
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestBrokerCreation(t *testing.T) {
	runner := &mockRunner{}
	ledgers := testLedgers(t)
	cfg := testConfig()
	logger := slog.Default()

	b := NewBroker(runner, ledgers, cfg, logger)
	if b == nil {
		t.Fatal("NewBroker returned nil")
	}
	if b.ActiveSessions() != 0 {
		t.Errorf("ActiveSessions = %d, want 0", b.ActiveSessions())
	}
}

func TestBrokerCreationNilLogger(t *testing.T) {
	runner := &mockRunner{}
	ledgers := testLedgers(t)
	cfg := testConfig()

	b := NewBroker(runner, ledgers, cfg, nil)
	if b == nil {
		t.Fatal("NewBroker with nil logger returned nil")
	}
}

func TestBrokerSessionResolution(t *testing.T) {
	runner := &mockRunner{}
	ledgers := testLedgers(t)
	cfg := testConfig()

	b := NewBroker(runner, ledgers, cfg, slog.Default())

	req := makeRequest("hello")
	key := b.resolveSessionKey(req)

	want := "default:chan-1:user-1"
	if key != want {
		t.Errorf("resolveSessionKey = %q, want %q", key, want)
	}
}

func TestBrokerSessionResolutionDefaults(t *testing.T) {
	runner := &mockRunner{}
	ledgers := testLedgers(t)
	cfg := testConfig()

	b := NewBroker(runner, ledgers, cfg, slog.Default())

	// Request with empty container and sender IDs.
	req := pipeline.NewRequest(pipeline.NexusInput{
		Operation: "event.ingest",
		Routing: pipeline.Routing{
			Adapter:  "test",
			Platform: "test",
			Receiver: pipeline.RoutingParticipant{ID: "default"},
		},
		Payload: &pipeline.EventPayload{Content: "hi"},
	})

	key := b.resolveSessionKey(req)
	want := "default:default:unknown"
	if key != want {
		t.Errorf("resolveSessionKey = %q, want %q", key, want)
	}
}

func TestBrokerHandleEvent(t *testing.T) {
	runner := &mockRunner{}
	ledgers := testLedgers(t)
	cfg := testConfig()

	b := NewBroker(runner, ledgers, cfg, slog.Default())
	ctx := context.Background()

	req := makeRequest("hello world")
	err := b.HandleEvent(ctx, req)
	if err != nil {
		t.Fatalf("HandleEvent: %v", err)
	}

	// Give the goroutine time to run.
	time.Sleep(100 * time.Millisecond)

	calls := runner.getCalls()
	if len(calls) != 1 {
		t.Fatalf("expected 1 runner call, got %d", len(calls))
	}
	if calls[0].Prompt != "hello world" {
		t.Errorf("prompt = %q, want 'hello world'", calls[0].Prompt)
	}
	if calls[0].AgentID != "default" {
		t.Errorf("agentID = %q, want 'default'", calls[0].AgentID)
	}
	if calls[0].Model != "test-model" {
		t.Errorf("model = %q, want 'test-model'", calls[0].Model)
	}
}

func TestBrokerHandleEventEmptyPrompt(t *testing.T) {
	runner := &mockRunner{}
	ledgers := testLedgers(t)
	cfg := testConfig()

	b := NewBroker(runner, ledgers, cfg, slog.Default())
	ctx := context.Background()

	req := makeRequest("")
	err := b.HandleEvent(ctx, req)
	if err != nil {
		t.Fatalf("HandleEvent: %v", err)
	}

	time.Sleep(50 * time.Millisecond)

	calls := runner.getCalls()
	if len(calls) != 0 {
		t.Errorf("expected 0 runner calls for empty prompt, got %d", len(calls))
	}
}

func TestBrokerMessageQueue(t *testing.T) {
	// Use a runner that takes some time so we can queue behind it.
	runner := &mockRunner{delay: 200 * time.Millisecond}
	ledgers := testLedgers(t)
	cfg := testConfig()

	b := NewBroker(runner, ledgers, cfg, slog.Default())
	ctx := context.Background()

	// First message starts the agent.
	req1 := makeRequest("first")
	if err := b.HandleEvent(ctx, req1); err != nil {
		t.Fatalf("HandleEvent first: %v", err)
	}

	// Small delay to ensure goroutine has started.
	time.Sleep(20 * time.Millisecond)

	// Second message should be queued since agent is running.
	req2 := makeRequest("second")
	if err := b.HandleEvent(ctx, req2); err != nil {
		t.Fatalf("HandleEvent second: %v", err)
	}

	// Wait for both to complete.
	time.Sleep(600 * time.Millisecond)

	calls := runner.getCalls()
	if len(calls) != 2 {
		t.Fatalf("expected 2 runner calls, got %d", len(calls))
	}
	if calls[0].Prompt != "first" {
		t.Errorf("first call prompt = %q, want 'first'", calls[0].Prompt)
	}
	if calls[1].Prompt != "second" {
		t.Errorf("second call prompt = %q, want 'second'", calls[1].Prompt)
	}
}

func TestBrokerSessionCount(t *testing.T) {
	runner := &mockRunner{}
	ledgers := testLedgers(t)
	cfg := testConfig()

	b := NewBroker(runner, ledgers, cfg, slog.Default())
	ctx := context.Background()

	// Send events to two different sessions.
	req1 := makeRequest("hello")
	if err := b.HandleEvent(ctx, req1); err != nil {
		t.Fatalf("HandleEvent: %v", err)
	}

	req2 := pipeline.NewRequest(pipeline.NexusInput{
		Operation: "event.ingest",
		Routing: pipeline.Routing{
			Adapter:     "test",
			Platform:    "test",
			ContainerID: "chan-2",
			Sender:      pipeline.RoutingParticipant{ID: "user-2"},
			Receiver:    pipeline.RoutingParticipant{ID: "default"},
		},
		Payload: &pipeline.EventPayload{
			Content:   "hi",
			Timestamp: time.Now().UnixMilli(),
		},
	})
	if err := b.HandleEvent(ctx, req2); err != nil {
		t.Fatalf("HandleEvent: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	if b.ActiveSessions() != 2 {
		t.Errorf("ActiveSessions = %d, want 2", b.ActiveSessions())
	}
}

func TestBrokerMapPayload(t *testing.T) {
	runner := &mockRunner{}
	ledgers := testLedgers(t)
	cfg := testConfig()

	b := NewBroker(runner, ledgers, cfg, slog.Default())
	ctx := context.Background()

	// Use a map payload instead of EventPayload.
	req := pipeline.NewRequest(pipeline.NexusInput{
		Operation: "event.ingest",
		Routing: pipeline.Routing{
			Adapter:     "test",
			Platform:    "test",
			ContainerID: "chan-1",
			Sender:      pipeline.RoutingParticipant{ID: "user-1"},
			Receiver:    pipeline.RoutingParticipant{ID: "default"},
		},
		Payload: map[string]any{"content": "from map"},
	})

	if err := b.HandleEvent(ctx, req); err != nil {
		t.Fatalf("HandleEvent: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	calls := runner.getCalls()
	if len(calls) != 1 {
		t.Fatalf("expected 1 runner call, got %d", len(calls))
	}
	if calls[0].Prompt != "from map" {
		t.Errorf("prompt = %q, want 'from map'", calls[0].Prompt)
	}
}

func TestMultiAgentPlaceholder(t *testing.T) {
	// Stub for future Phase 3 multi-agent routing.
	// For now, verify that different receiver IDs map to different agent sessions.
	runner := &mockRunner{}
	ledgers := testLedgers(t)
	cfg := testConfig()

	b := NewBroker(runner, ledgers, cfg, slog.Default())
	ctx := context.Background()

	req1 := pipeline.NewRequest(pipeline.NexusInput{
		Operation: "event.ingest",
		Routing: pipeline.Routing{
			Adapter:     "test",
			Platform:    "test",
			ContainerID: "chan-1",
			Sender:      pipeline.RoutingParticipant{ID: "user-1"},
			Receiver:    pipeline.RoutingParticipant{ID: "agent-a"},
		},
		Payload: &pipeline.EventPayload{Content: "hello a", Timestamp: time.Now().UnixMilli()},
	})

	req2 := pipeline.NewRequest(pipeline.NexusInput{
		Operation: "event.ingest",
		Routing: pipeline.Routing{
			Adapter:     "test",
			Platform:    "test",
			ContainerID: "chan-1",
			Sender:      pipeline.RoutingParticipant{ID: "user-1"},
			Receiver:    pipeline.RoutingParticipant{ID: "agent-b"},
		},
		Payload: &pipeline.EventPayload{Content: "hello b", Timestamp: time.Now().UnixMilli()},
	})

	if err := b.HandleEvent(ctx, req1); err != nil {
		t.Fatalf("HandleEvent agent-a: %v", err)
	}
	if err := b.HandleEvent(ctx, req2); err != nil {
		t.Fatalf("HandleEvent agent-b: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	calls := runner.getCalls()
	if len(calls) != 2 {
		t.Fatalf("expected 2 runner calls, got %d", len(calls))
	}

	agents := map[string]bool{}
	for _, c := range calls {
		agents[c.AgentID] = true
	}
	if !agents["agent-a"] || !agents["agent-b"] {
		t.Errorf("expected both agent-a and agent-b, got %v", agents)
	}
}
