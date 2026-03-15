package operations

import (
	"context"
	"testing"

	"github.com/Napageneral/nexus/internal/pipeline"
)

func TestRegistryRegisterAndResolve(t *testing.T) {
	r := NewRegistry()

	r.Register(OperationDef{
		Operation: "health",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "runtime.health",
		Handler: func(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
			return map[string]string{"status": "ok"}, nil
		},
	})

	def, err := r.Resolve("health")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if def.Operation != "health" {
		t.Fatalf("expected operation 'health', got %q", def.Operation)
	}
	if def.Kind != KindControl {
		t.Fatalf("expected kind 'control', got %q", def.Kind)
	}
	if def.Handler == nil {
		t.Fatal("expected handler to be set")
	}
}

func TestRegistryResolveNotFound(t *testing.T) {
	r := NewRegistry()

	_, err := r.Resolve("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent operation")
	}
}

func TestRegistryHas(t *testing.T) {
	r := NewRegistry()
	r.Register(OperationDef{Operation: "health", Kind: KindControl, Action: ActionRead, Resource: "runtime.health"})

	if !r.Has("health") {
		t.Fatal("expected Has('health') to be true")
	}
	if r.Has("nonexistent") {
		t.Fatal("expected Has('nonexistent') to be false")
	}
}

func TestRegistryList(t *testing.T) {
	r := NewRegistry()
	r.Register(OperationDef{Operation: "health", Kind: KindControl, Action: ActionRead, Resource: "runtime.health"})
	r.Register(OperationDef{Operation: "config.get", Kind: KindControl, Action: ActionRead, Resource: "config"})
	r.Register(OperationDef{Operation: "agents.list", Kind: KindControl, Action: ActionRead, Resource: "agents"})

	names := r.List()
	if len(names) != 3 {
		t.Fatalf("expected 3 operations, got %d", len(names))
	}
	// Should be sorted
	if names[0] != "agents.list" {
		t.Fatalf("expected first to be 'agents.list', got %q", names[0])
	}
	if names[1] != "config.get" {
		t.Fatalf("expected second to be 'config.get', got %q", names[1])
	}
	if names[2] != "health" {
		t.Fatalf("expected third to be 'health', got %q", names[2])
	}
}

func TestRegistryDynamic(t *testing.T) {
	r := NewRegistry()
	r.Register(OperationDef{Operation: "health", Kind: KindControl, Action: ActionRead, Resource: "runtime.health"})

	r.RegisterDynamic(OperationDef{
		Operation: "myapp.method1",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "apps.myapp",
	})

	if !r.Has("myapp.method1") {
		t.Fatal("expected dynamic operation to be found")
	}

	// Static takes priority over dynamic
	r.RegisterDynamic(OperationDef{
		Operation: "health",
		Kind:      KindControl,
		Action:    ActionWrite,
		Resource:  "dynamic.health",
	})

	def, err := r.Resolve("health")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if def.Resource != "runtime.health" {
		t.Fatalf("expected static definition (runtime.health), got %q", def.Resource)
	}

	// Unregister dynamic
	r.UnregisterDynamic([]string{"myapp.method1"})
	if r.Has("myapp.method1") {
		t.Fatal("expected dynamic operation to be removed")
	}
}

func TestRegistryCount(t *testing.T) {
	r := NewRegistry()
	r.Register(OperationDef{Operation: "a"})
	r.Register(OperationDef{Operation: "b"})
	r.RegisterDynamic(OperationDef{Operation: "c"})

	if r.Count() != 3 {
		t.Fatalf("expected count 3, got %d", r.Count())
	}
}

func TestStaticTaxonomyRegistration(t *testing.T) {
	r := NewRegistry()
	RegisterStaticTaxonomy(r)

	// Should have all operations from the taxonomy
	count := r.Count()
	if count < 100 {
		t.Fatalf("expected at least 100 operations from taxonomy, got %d", count)
	}

	// Spot check some critical operations
	critical := []string{
		"health", "status", "connect", "config.get", "config.set",
		"event.ingest", "event.backfill",
		"agents.list", "agents.create",
		"sessions.list", "sessions.delete",
		"delivery.send", "delivery.stream",
		"clock.schedule.create", "clock.schedule.list",
		"work.items.list", "work.items.create",
		"memory.review.search",
		"acl.requests.list", "acl.requests.approve",
		"device.pair.approve",
		"browser.request",
	}
	for _, op := range critical {
		if !r.Has(op) {
			t.Errorf("expected taxonomy to include %q", op)
		}
	}

	// Verify event.ingest has correct metadata
	def, err := r.Resolve("event.ingest")
	if err != nil {
		t.Fatalf("unexpected error resolving event.ingest: %v", err)
	}
	if def.Kind != KindEvent {
		t.Fatalf("expected event.ingest kind 'event', got %q", def.Kind)
	}
	if def.Action != ActionWrite {
		t.Fatalf("expected event.ingest action 'write', got %q", def.Action)
	}
	if len(def.Surfaces) != 4 {
		t.Fatalf("expected event.ingest to have 4 surfaces, got %d", len(def.Surfaces))
	}
}
