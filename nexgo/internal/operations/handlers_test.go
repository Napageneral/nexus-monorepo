package operations

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/Napageneral/nexus/internal/config"
	"github.com/Napageneral/nexus/internal/pipeline"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func makeOpRequest(operation string, payload any) *pipeline.NexusRequest {
	return pipeline.NewRequest(pipeline.NexusInput{
		Operation: operation,
		Routing: pipeline.Routing{
			Adapter:  "test",
			Platform: "test",
			Sender:   pipeline.RoutingParticipant{ID: "user-1", Name: "Alice"},
		},
		Payload: payload,
	})
}

// ---------------------------------------------------------------------------
// Config Handlers
// ---------------------------------------------------------------------------

func TestConfigSetAndPatch(t *testing.T) {
	cfg := config.Default()
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.json")

	h := NewConfigHandlers(cfg, configPath, slog.Default())
	ctx := context.Background()

	// Test config.get
	t.Run("config.get", func(t *testing.T) {
		result, err := h.HandleGet(ctx, makeOpRequest("config.get", nil))
		if err != nil {
			t.Fatalf("HandleGet: %v", err)
		}
		if result == nil {
			t.Fatal("expected non-nil result")
		}
		resultCfg, ok := result.(*config.Config)
		if !ok {
			t.Fatalf("expected *config.Config, got %T", result)
		}
		if resultCfg.Runtime.Port == 0 {
			t.Error("expected non-zero port in config")
		}
	})

	// Test config.set
	t.Run("config.set", func(t *testing.T) {
		newCfg := config.Default()
		newCfg.Runtime.Port = 9999
		result, err := h.HandleSet(ctx, makeOpRequest("config.set", newCfg))
		if err != nil {
			t.Fatalf("HandleSet: %v", err)
		}
		ack, ok := result.(map[string]any)
		if !ok {
			t.Fatalf("expected map result, got %T", result)
		}
		if ack["status"] != "updated" {
			t.Errorf("status = %v, want 'updated'", ack["status"])
		}
		if cfg.Runtime.Port != 9999 {
			t.Errorf("port = %d, want 9999", cfg.Runtime.Port)
		}

		// Verify file was saved.
		data, err := os.ReadFile(configPath)
		if err != nil {
			t.Fatalf("read config: %v", err)
		}
		var saved config.Config
		if err := json.Unmarshal(data, &saved); err != nil {
			t.Fatalf("unmarshal saved config: %v", err)
		}
		if saved.Runtime.Port != 9999 {
			t.Errorf("saved port = %d, want 9999", saved.Runtime.Port)
		}
	})

	// Test config.patch
	t.Run("config.patch", func(t *testing.T) {
		result, err := h.HandlePatch(ctx, makeOpRequest("config.patch", map[string]any{
			"logging": map[string]any{"level": "debug"},
		}))
		if err != nil {
			t.Fatalf("HandlePatch: %v", err)
		}
		ack, ok := result.(map[string]any)
		if !ok {
			t.Fatalf("expected map result, got %T", result)
		}
		if ack["status"] != "patched" {
			t.Errorf("status = %v, want 'patched'", ack["status"])
		}
	})
}

// ---------------------------------------------------------------------------
// Agent Handlers
// ---------------------------------------------------------------------------

func TestAgentHandlersRegister(t *testing.T) {
	h := NewAgentHandlers(nil, nil, slog.Default())
	reg := NewRegistry()
	h.Register(reg)

	ops := []string{"agents.list", "agents.create", "agents.update", "agents.delete"}
	for _, op := range ops {
		if !reg.Has(op) {
			t.Errorf("%s not registered", op)
		}
	}
}

func TestAgentHandlersList(t *testing.T) {
	h := NewAgentHandlers(nil, nil, slog.Default())
	ctx := context.Background()

	result, err := h.HandleList(ctx, makeOpRequest("agents.list", nil))
	if err != nil {
		t.Fatalf("HandleList: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}
	if _, ok := m["agents"]; !ok {
		t.Fatal("expected 'agents' key in result")
	}
}

// ---------------------------------------------------------------------------
// Session Handlers
// ---------------------------------------------------------------------------

func TestSessionHandlersRegister(t *testing.T) {
	h := NewSessionHandlers(nil, slog.Default())
	reg := NewRegistry()
	h.Register(reg)

	ops := []string{"sessions.list", "sessions.resolve", "sessions.patch", "sessions.delete"}
	for _, op := range ops {
		if !reg.Has(op) {
			t.Errorf("%s not registered", op)
		}
	}
}

func TestSessionHandlersList(t *testing.T) {
	h := NewSessionHandlers(nil, slog.Default())
	ctx := context.Background()

	result, err := h.HandleList(ctx, makeOpRequest("sessions.list", nil))
	if err != nil {
		t.Fatalf("HandleList: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}
	if _, ok := m["sessions"]; !ok {
		t.Error("expected 'sessions' key in result")
	}
}

// ---------------------------------------------------------------------------
// Chat Handlers
// ---------------------------------------------------------------------------

func TestChatHandlersRegister(t *testing.T) {
	broker := &mockBroker{}
	h := NewChatHandlers(broker, nil, slog.Default())
	reg := NewRegistry()
	h.Register(reg)

	// Note: ChatHandlers registers event.ingest, chat.abort, chat.history
	ops := []string{"event.ingest", "chat.abort", "chat.history"}
	for _, op := range ops {
		if !reg.Has(op) {
			t.Errorf("%s not registered", op)
		}
	}
}

func TestChatHandlersAbort(t *testing.T) {
	h := NewChatHandlers(nil, nil, slog.Default())
	ctx := context.Background()

	result, err := h.HandleAbort(ctx, makeOpRequest("chat.abort", map[string]any{
		"session_key": "test-session",
	}))
	if err != nil {
		t.Fatalf("HandleAbort: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}
	if m["status"] != "abort_requested" {
		t.Errorf("status = %v, want 'abort_requested'", m["status"])
	}
}

// ---------------------------------------------------------------------------
// Work Handlers
// ---------------------------------------------------------------------------

func TestWorkHandlersRegister(t *testing.T) {
	h := NewWorkHandlers(nil, slog.Default())
	reg := NewRegistry()
	h.Register(reg)

	ops := []string{"work.items.list", "work.items.create", "work.items.get", "work.workflows.list", "work.workflows.create"}
	for _, op := range ops {
		if !reg.Has(op) {
			t.Errorf("%s not registered", op)
		}
	}
}

func TestWorkHandlersList(t *testing.T) {
	h := NewWorkHandlers(nil, slog.Default())
	ctx := context.Background()

	result, err := h.HandleItemsList(ctx, makeOpRequest("work.items.list", nil))
	if err != nil {
		t.Fatalf("HandleItemsList: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}
	if _, ok := m["items"]; !ok {
		t.Error("expected 'items' key in result")
	}
}

// ---------------------------------------------------------------------------
// Clock Handlers
// ---------------------------------------------------------------------------

func TestClockHandlersRegister(t *testing.T) {
	h := NewClockHandlers(nil, slog.Default())
	reg := NewRegistry()
	h.Register(reg)

	ops := []string{"clock.schedule.list", "clock.schedule.create", "clock.schedule.remove", "clock.schedule.run"}
	for _, op := range ops {
		if !reg.Has(op) {
			t.Errorf("%s not registered", op)
		}
	}
}

func TestClockHandlersList(t *testing.T) {
	h := NewClockHandlers(nil, slog.Default())
	ctx := context.Background()

	result, err := h.HandleList(ctx, makeOpRequest("clock.schedule.list", nil))
	if err != nil {
		t.Fatalf("HandleList: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}
	if _, ok := m["schedules"]; !ok {
		t.Error("expected 'schedules' key in result")
	}
}

// ---------------------------------------------------------------------------
// System Handlers
// ---------------------------------------------------------------------------

func TestSystemInfoHandler(t *testing.T) {
	cfg := config.Default()
	h := NewSystemHandlers(cfg, slog.Default())
	reg := NewRegistry()
	h.Register(reg)

	// Verify registration
	ops := []string{"health", "status", "skills.status", "logs.tail"}
	for _, op := range ops {
		if !reg.Has(op) {
			t.Errorf("%s not registered", op)
		}
	}

	ctx := context.Background()

	// Test health handler.
	t.Run("health", func(t *testing.T) {
		result, err := h.HandleHealth(ctx, makeOpRequest("health", nil))
		if err != nil {
			t.Fatalf("HandleHealth: %v", err)
		}
		m, ok := result.(map[string]any)
		if !ok {
			t.Fatalf("expected map result, got %T", result)
		}
		if m["status"] != "ok" {
			t.Errorf("status = %v, want 'ok'", m["status"])
		}
		if m["version"] != "dev" {
			t.Errorf("version = %v, want 'dev'", m["version"])
		}
	})

	// Test status handler.
	t.Run("status", func(t *testing.T) {
		result, err := h.HandleStatus(ctx, makeOpRequest("status", nil))
		if err != nil {
			t.Fatalf("HandleStatus: %v", err)
		}
		m, ok := result.(map[string]any)
		if !ok {
			t.Fatalf("expected map result, got %T", result)
		}
		if m["status"] != "running" {
			t.Errorf("status = %v, want 'running'", m["status"])
		}
		if m["go_version"] == nil {
			t.Error("expected go_version in status")
		}
	})

	// Test skills.status handler.
	t.Run("skills.status", func(t *testing.T) {
		result, err := h.HandleSkillsList(ctx, makeOpRequest("skills.status", nil))
		if err != nil {
			t.Fatalf("HandleSkillsList: %v", err)
		}
		m, ok := result.(map[string]any)
		if !ok {
			t.Fatalf("expected map result, got %T", result)
		}
		if _, ok := m["skills"]; !ok {
			t.Error("expected 'skills' key in result")
		}
	})
}

// ---------------------------------------------------------------------------
// Model Handlers
// ---------------------------------------------------------------------------

func TestModelHandlersRegister(t *testing.T) {
	h := NewModelHandlers(nil, slog.Default())
	reg := NewRegistry()
	h.Register(reg)

	if !reg.Has("models.list") {
		t.Error("models.list not registered")
	}
}

func TestModelHandlersList(t *testing.T) {
	h := NewModelHandlers(nil, slog.Default())
	ctx := context.Background()

	result, err := h.HandleList(ctx, makeOpRequest("models.list", nil))
	if err != nil {
		t.Fatalf("HandleList: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}
	if _, ok := m["models"]; !ok {
		t.Error("expected 'models' key in result")
	}
}

// ---------------------------------------------------------------------------
// Delivery Handlers
// ---------------------------------------------------------------------------

func TestDeliveryHandlersRegister(t *testing.T) {
	h := NewDeliveryHandlers(nil, slog.Default())
	reg := NewRegistry()
	h.Register(reg)

	ops := []string{"delivery.send", "delivery.stream"}
	for _, op := range ops {
		if !reg.Has(op) {
			t.Errorf("%s not registered", op)
		}
	}
}

// ---------------------------------------------------------------------------
// Memory Handlers
// ---------------------------------------------------------------------------

func TestMemoryHandlersRegister(t *testing.T) {
	h := NewMemoryHandlers(nil, slog.Default())
	reg := NewRegistry()
	h.Register(reg)

	ops := []string{"memory.review.runs.list", "memory.review.search", "memory.review.quality.summary"}
	for _, op := range ops {
		if !reg.Has(op) {
			t.Errorf("%s not registered", op)
		}
	}
}

// ---------------------------------------------------------------------------
// Adapter Handlers
// ---------------------------------------------------------------------------

func TestAdapterHandlersRegister(t *testing.T) {
	h := NewAdapterHandlers(nil, slog.Default())
	reg := NewRegistry()
	h.Register(reg)

	ops := []string{"adapter.info", "adapter.health", "adapter.connections.list"}
	for _, op := range ops {
		if !reg.Has(op) {
			t.Errorf("%s not registered", op)
		}
	}
}
