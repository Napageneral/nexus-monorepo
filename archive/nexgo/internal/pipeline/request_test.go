package pipeline

import (
	"testing"
)

func TestNexusRequestFields(t *testing.T) {
	input := NexusInput{
		Operation: "health",
		Routing: Routing{
			Adapter:  "test",
			Platform: "test",
			Sender:   RoutingParticipant{ID: "user1", Name: "Test User"},
			Receiver: RoutingParticipant{ID: "runtime"},
		},
		Payload: map[string]any{"key": "value"},
	}

	req := NewRequest(input)

	if req.RequestID == "" {
		t.Fatal("expected request ID to be set")
	}
	if req.CreatedAt == 0 {
		t.Fatal("expected created_at to be set")
	}
	if req.Operation != "health" {
		t.Fatalf("expected operation 'health', got %q", req.Operation)
	}
	if req.Routing.Adapter != "test" {
		t.Fatalf("expected adapter 'test', got %q", req.Routing.Adapter)
	}
	if req.Routing.Sender.ID != "user1" {
		t.Fatalf("expected sender ID 'user1', got %q", req.Routing.Sender.ID)
	}
	if req.Status != StatusProcessing {
		t.Fatalf("expected status 'processing', got %q", req.Status)
	}
	if len(req.Stages) != 0 {
		t.Fatalf("expected empty stages, got %d", len(req.Stages))
	}
}

func TestNexusRequestAppendStageTrace(t *testing.T) {
	req := NewRequest(NexusInput{Operation: "test"})

	req.AppendStageTrace(StageTrace{
		Stage:      "acceptRequest",
		StartedAt:  1000,
		DurationMS: 5,
	})
	req.AppendStageTrace(StageTrace{
		Stage:      "resolvePrincipals",
		StartedAt:  1005,
		DurationMS: 10,
	})

	if len(req.Stages) != 2 {
		t.Fatalf("expected 2 stages, got %d", len(req.Stages))
	}
	if req.Stages[0].Stage != "acceptRequest" {
		t.Fatalf("expected first stage 'acceptRequest', got %q", req.Stages[0].Stage)
	}
	if req.Stages[1].Stage != "resolvePrincipals" {
		t.Fatalf("expected second stage 'resolvePrincipals', got %q", req.Stages[1].Stage)
	}
}

func TestNewUUID(t *testing.T) {
	id1 := newUUID()
	id2 := newUUID()

	if id1 == "" {
		t.Fatal("expected non-empty UUID")
	}
	if id1 == id2 {
		t.Fatal("expected unique UUIDs")
	}
	// UUID v4 format: 8-4-4-4-12
	if len(id1) != 36 {
		t.Fatalf("expected UUID length 36, got %d: %s", len(id1), id1)
	}
}

func TestEntityFields(t *testing.T) {
	e := Entity{
		ID:       "ent-1",
		Name:     "Tyler",
		Type:     "human",
		IsUser:   true,
		Tags:     []string{"owner"},
		CreatedAt: 1709000000000,
	}

	if e.ID != "ent-1" {
		t.Fatalf("expected ID 'ent-1', got %q", e.ID)
	}
	if !e.IsUser {
		t.Fatal("expected IsUser to be true")
	}
	if len(e.Tags) != 1 || e.Tags[0] != "owner" {
		t.Fatalf("expected tags [owner], got %v", e.Tags)
	}
}
