package adapters

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/Napageneral/nexus/internal/config"
	"github.com/Napageneral/nexus/internal/db"
)

func TestProtocolMessageMarshal(t *testing.T) {
	msg := ProtocolMessage{
		ID:        "msg-001",
		Verb:      VerbSend,
		Payload:   map[string]string{"channel_id": "ch1", "content": "hello"},
		RequestID: "req-001",
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded ProtocolMessage
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if decoded.ID != msg.ID {
		t.Fatalf("expected ID %q, got %q", msg.ID, decoded.ID)
	}
	if decoded.Verb != msg.Verb {
		t.Fatalf("expected verb %q, got %q", msg.Verb, decoded.Verb)
	}
	if decoded.RequestID != msg.RequestID {
		t.Fatalf("expected request_id %q, got %q", msg.RequestID, decoded.RequestID)
	}

	// Payload roundtrips as map via JSON.
	payloadBytes, err := json.Marshal(decoded.Payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	var payload map[string]string
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	if payload["content"] != "hello" {
		t.Fatalf("expected payload content 'hello', got %q", payload["content"])
	}
}

func TestProtocolMessageMarshalEmpty(t *testing.T) {
	msg := ProtocolMessage{
		ID:   "msg-002",
		Verb: VerbHealth,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded ProtocolMessage
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if decoded.ID != "msg-002" {
		t.Fatalf("expected ID 'msg-002', got %q", decoded.ID)
	}
	if decoded.Verb != VerbHealth {
		t.Fatalf("expected verb 'health', got %q", decoded.Verb)
	}
	if decoded.Payload != nil {
		t.Fatalf("expected nil payload, got %v", decoded.Payload)
	}
}

func TestAdapterProcessCreation(t *testing.T) {
	proc := NewAdapterProcess("test-adapter", "/bin/echo", []string{"hello"})

	if proc.ID != "test-adapter" {
		t.Fatalf("expected ID 'test-adapter', got %q", proc.ID)
	}
	if proc.Status() != StatusStopped {
		t.Fatalf("expected status 'stopped', got %q", proc.Status())
	}
	if proc.binaryPath != "/bin/echo" {
		t.Fatalf("expected binary '/bin/echo', got %q", proc.binaryPath)
	}
	if len(proc.args) != 1 || proc.args[0] != "hello" {
		t.Fatalf("expected args [hello], got %v", proc.args)
	}
}

func TestManagerCreation(t *testing.T) {
	tmpDir := t.TempDir()
	ledgers, err := db.OpenLedgers(tmpDir)
	if err != nil {
		t.Fatalf("open ledgers: %v", err)
	}
	defer ledgers.Close()

	cfg := config.Default()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	mgr := NewManager(ledgers, cfg, logger)

	if mgr.Name() != "adapters" {
		t.Fatalf("expected name 'adapters', got %q", mgr.Name())
	}

	infos := mgr.List()
	if len(infos) != 0 {
		t.Fatalf("expected empty list, got %d", len(infos))
	}
}

func TestManagerStartStop(t *testing.T) {
	tmpDir := t.TempDir()
	ledgers, err := db.OpenLedgers(tmpDir)
	if err != nil {
		t.Fatalf("open ledgers: %v", err)
	}
	defer ledgers.Close()

	cfg := config.Default()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	mgr := NewManager(ledgers, cfg, logger)

	// Track events received.
	var received []ProtocolMessage
	mgr.SetEventHandler(func(adapterID string, msg ProtocolMessage) {
		received = append(received, msg)
	})

	ctx := context.Background()

	// Use cat as a simple adapter that reads stdin and echoes to stdout.
	// On macOS and Linux, "cat" will echo input lines back.
	err = mgr.Start(ctx, "echo-adapter", "/bin/cat", nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}

	// Check status.
	status, err := mgr.Status("echo-adapter")
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if status != StatusRunning {
		t.Fatalf("expected running, got %s", status)
	}

	// Starting same adapter again should fail.
	err = mgr.Start(ctx, "echo-adapter", "/bin/cat", nil)
	if err == nil {
		t.Fatal("expected error starting duplicate adapter")
	}

	// Stop the adapter.
	if err := mgr.Stop("echo-adapter"); err != nil {
		t.Fatalf("stop: %v", err)
	}

	// Status should now be not found.
	_, err = mgr.Status("echo-adapter")
	if err == nil {
		t.Fatal("expected error for stopped adapter")
	}
}

func TestManagerShutdown(t *testing.T) {
	tmpDir := t.TempDir()
	ledgers, err := db.OpenLedgers(tmpDir)
	if err != nil {
		t.Fatalf("open ledgers: %v", err)
	}
	defer ledgers.Close()

	cfg := config.Default()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	mgr := NewManager(ledgers, cfg, logger)
	ctx := context.Background()

	// Start two adapters.
	if err := mgr.Start(ctx, "a1", "/bin/cat", nil); err != nil {
		t.Fatalf("start a1: %v", err)
	}
	if err := mgr.Start(ctx, "a2", "/bin/cat", nil); err != nil {
		t.Fatalf("start a2: %v", err)
	}

	// Shutdown all.
	if err := mgr.Shutdown(ctx); err != nil {
		t.Fatalf("shutdown: %v", err)
	}

	// List should be empty.
	infos := mgr.List()
	if len(infos) != 0 {
		t.Fatalf("expected empty list after shutdown, got %d", len(infos))
	}
}

func TestDeduplicator(t *testing.T) {
	dedup := NewDeduplicator(100 * time.Millisecond)

	// First time should not be duplicate.
	if dedup.IsDuplicate("event-1") {
		t.Fatal("expected event-1 to not be duplicate on first see")
	}

	// Second time should be duplicate.
	if !dedup.IsDuplicate("event-1") {
		t.Fatal("expected event-1 to be duplicate on second see")
	}

	// Different event should not be duplicate.
	if dedup.IsDuplicate("event-2") {
		t.Fatal("expected event-2 to not be duplicate on first see")
	}

	// Wait for TTL to expire.
	time.Sleep(150 * time.Millisecond)

	// After TTL, should not be duplicate.
	if dedup.IsDuplicate("event-1") {
		t.Fatal("expected event-1 to not be duplicate after TTL")
	}

	// Test cleanup.
	dedup.IsDuplicate("event-3")
	time.Sleep(150 * time.Millisecond)
	dedup.Cleanup()

	// After cleanup, internal map should be empty for expired entries.
	dedup.mu.Lock()
	count := len(dedup.seen)
	dedup.mu.Unlock()
	// event-1 was re-added recently (150ms ago) and event-3 was added 150ms ago.
	// Both should be expired and cleaned.
	if count != 0 {
		t.Fatalf("expected 0 entries after cleanup, got %d", count)
	}
}

func TestValidateInbound(t *testing.T) {
	// Valid message.
	msg := ProtocolMessage{ID: "msg-1", Verb: VerbHealth}
	if err := ValidateInbound(msg); err != nil {
		t.Fatalf("expected valid, got: %v", err)
	}

	// Missing ID.
	if err := ValidateInbound(ProtocolMessage{Verb: VerbHealth}); err == nil {
		t.Fatal("expected error for missing ID")
	}

	// Missing verb.
	if err := ValidateInbound(ProtocolMessage{ID: "msg-2"}); err == nil {
		t.Fatal("expected error for missing verb")
	}

	// Unknown verb.
	if err := ValidateInbound(ProtocolMessage{ID: "msg-3", Verb: "unknown"}); err == nil {
		t.Fatal("expected error for unknown verb")
	}

	// All known verbs should be valid.
	for _, v := range []Verb{VerbInfo, VerbMonitor, VerbBackfill, VerbSend, VerbStream, VerbHealth, VerbAccounts} {
		if err := ValidateInbound(ProtocolMessage{ID: "v", Verb: v}); err != nil {
			t.Fatalf("expected verb %s to be valid, got: %v", v, err)
		}
	}
}
