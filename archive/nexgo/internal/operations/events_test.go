package operations

import (
	"context"
	"log/slog"
	"path/filepath"
	"testing"
	"time"

	"github.com/Napageneral/nexus/internal/db"
	"github.com/Napageneral/nexus/internal/pipeline"
)

// ---------------------------------------------------------------------------
// Mock broker
// ---------------------------------------------------------------------------

type mockBroker struct {
	events []*pipeline.NexusRequest
}

func (m *mockBroker) HandleEvent(_ context.Context, req *pipeline.NexusRequest) error {
	m.events = append(m.events, req)
	return nil
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

func makeIngestRequest(content string) *pipeline.NexusRequest {
	return pipeline.NewRequest(pipeline.NexusInput{
		Operation: "event.ingest",
		Routing: pipeline.Routing{
			Adapter:       "test-adapter",
			Platform:      "test",
			ContainerID:   "chan-1",
			ContainerKind: pipeline.ContainerDirect,
			Sender:        pipeline.RoutingParticipant{ID: "user-1", Name: "Alice"},
			Receiver:      pipeline.RoutingParticipant{ID: "default", Name: "nexus"},
		},
		Payload: &pipeline.EventPayload{
			ID:          "evt-test-1",
			Content:     content,
			ContentType: pipeline.ContentText,
			Timestamp:   time.Now().UnixMilli(),
		},
	})
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestEventIngestBasic(t *testing.T) {
	ledgers := testLedgers(t)
	broker := &mockBroker{}
	logger := slog.Default()

	h := NewEventHandlers(ledgers, broker, logger)
	if h == nil {
		t.Fatal("NewEventHandlers returned nil")
	}

	ctx := context.Background()
	req := makeIngestRequest("hello from test")

	result, err := h.HandleIngest(ctx, req)
	if err != nil {
		t.Fatalf("HandleIngest: %v", err)
	}

	// Verify acknowledgement.
	ack, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("result type = %T, want map[string]any", result)
	}
	if ack["status"] != "accepted" {
		t.Errorf("status = %v, want 'accepted'", ack["status"])
	}

	// Verify broker was called.
	if len(broker.events) != 1 {
		t.Fatalf("broker received %d events, want 1", len(broker.events))
	}
}

func TestEventIngestPersistence(t *testing.T) {
	ledgers := testLedgers(t)
	broker := &mockBroker{}
	logger := slog.Default()

	h := NewEventHandlers(ledgers, broker, logger)
	ctx := context.Background()

	req := makeIngestRequest("persisted content")
	if _, err := h.HandleIngest(ctx, req); err != nil {
		t.Fatalf("HandleIngest: %v", err)
	}

	// Verify the event was stored in events.db.
	var id, content, senderID, adapterID string
	err := ledgers.Events.QueryRowContext(ctx,
		`SELECT id, content, sender_id, adapter_id FROM events WHERE id = ?`,
		"evt-test-1",
	).Scan(&id, &content, &senderID, &adapterID)
	if err != nil {
		t.Fatalf("query event: %v", err)
	}
	if content != "persisted content" {
		t.Errorf("content = %q, want 'persisted content'", content)
	}
	if senderID != "user-1" {
		t.Errorf("sender_id = %q, want 'user-1'", senderID)
	}
	if adapterID != "test-adapter" {
		t.Errorf("adapter_id = %q, want 'test-adapter'", adapterID)
	}
}

func TestEventIngestNilBroker(t *testing.T) {
	ledgers := testLedgers(t)
	logger := slog.Default()

	h := NewEventHandlers(ledgers, nil, logger)
	ctx := context.Background()

	req := makeIngestRequest("no broker")
	result, err := h.HandleIngest(ctx, req)
	if err != nil {
		t.Fatalf("HandleIngest with nil broker: %v", err)
	}

	ack, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("result type = %T, want map[string]any", result)
	}
	if ack["status"] != "accepted" {
		t.Errorf("status = %v, want 'accepted'", ack["status"])
	}
}

func TestEventIngestMapPayload(t *testing.T) {
	ledgers := testLedgers(t)
	broker := &mockBroker{}
	logger := slog.Default()

	h := NewEventHandlers(ledgers, broker, logger)
	ctx := context.Background()

	req := pipeline.NewRequest(pipeline.NexusInput{
		Operation: "event.ingest",
		Routing: pipeline.Routing{
			Adapter:     "test-adapter",
			Platform:    "test",
			ContainerID: "chan-1",
			Sender:      pipeline.RoutingParticipant{ID: "user-1", Name: "Alice"},
			Receiver:    pipeline.RoutingParticipant{ID: "default", Name: "nexus"},
		},
		Payload: map[string]any{
			"id":      "evt-map-1",
			"content": "map payload",
		},
	})

	result, err := h.HandleIngest(ctx, req)
	if err != nil {
		t.Fatalf("HandleIngest: %v", err)
	}

	ack, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("result type = %T, want map[string]any", result)
	}
	if ack["status"] != "accepted" {
		t.Errorf("status = %v, want 'accepted'", ack["status"])
	}

	// Verify it was stored.
	var content string
	err = ledgers.Events.QueryRowContext(ctx,
		`SELECT content FROM events WHERE id = ?`,
		"evt-map-1",
	).Scan(&content)
	if err != nil {
		t.Fatalf("query event: %v", err)
	}
	if content != "map payload" {
		t.Errorf("content = %q, want 'map payload'", content)
	}
}

func TestEventHandlersRegister(t *testing.T) {
	ledgers := testLedgers(t)
	broker := &mockBroker{}
	logger := slog.Default()

	h := NewEventHandlers(ledgers, broker, logger)
	reg := NewRegistry()
	h.Register(reg)

	if !reg.Has("event.ingest") {
		t.Error("event.ingest not registered")
	}
}
