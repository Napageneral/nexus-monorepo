package iam

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/Napageneral/nexus/internal/db"
	"github.com/Napageneral/nexus/internal/pipeline"
)

func setupTestStore(t *testing.T) (*GrantStore, *db.Ledgers, func()) {
	t.Helper()
	tmpDir := t.TempDir()
	ledgers, err := db.OpenLedgers(tmpDir)
	if err != nil {
		t.Fatalf("open ledgers: %v", err)
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	store := NewGrantStore(ledgers.Runtime, logger)

	return store, ledgers, func() { ledgers.Close() }
}

func TestGrantStoreCreation(t *testing.T) {
	store, _, cleanup := setupTestStore(t)
	defer cleanup()

	ctx := context.Background()
	if err := store.Initialize(ctx); err != nil {
		t.Fatalf("initialize: %v", err)
	}
}

func TestGrantCreateAndList(t *testing.T) {
	store, _, cleanup := setupTestStore(t)
	defer cleanup()

	ctx := context.Background()
	if err := store.Initialize(ctx); err != nil {
		t.Fatalf("initialize: %v", err)
	}

	// Create a grant.
	grant := Grant{
		ID:        "grant-1",
		EntityID:  "user-001",
		Operation: "memory.recall",
		Resource:  "memory.elements",
		Effect:    "allow",
	}

	if err := store.Create(ctx, grant); err != nil {
		t.Fatalf("create: %v", err)
	}

	// List grants for entity.
	grants, err := store.ListForEntity(ctx, "user-001")
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	if len(grants) != 1 {
		t.Fatalf("expected 1 grant, got %d", len(grants))
	}
	if grants[0].ID != "grant-1" {
		t.Fatalf("expected ID 'grant-1', got %q", grants[0].ID)
	}
	if grants[0].EntityID != "user-001" {
		t.Fatalf("expected entity 'user-001', got %q", grants[0].EntityID)
	}
	if grants[0].Effect != "allow" {
		t.Fatalf("expected effect 'allow', got %q", grants[0].Effect)
	}
}

func TestGrantRevoke(t *testing.T) {
	store, _, cleanup := setupTestStore(t)
	defer cleanup()

	ctx := context.Background()
	store.Initialize(ctx)

	// Create and then revoke.
	store.Create(ctx, Grant{
		ID:        "grant-2",
		EntityID:  "user-001",
		Operation: "memory.recall",
		Resource:  "*",
		Effect:    "allow",
	})

	if err := store.Revoke(ctx, "grant-2"); err != nil {
		t.Fatalf("revoke: %v", err)
	}

	// List should be empty.
	grants, err := store.ListForEntity(ctx, "user-001")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(grants) != 0 {
		t.Fatalf("expected 0 grants after revoke, got %d", len(grants))
	}

	// Revoking non-existent should error.
	if err := store.Revoke(ctx, "nonexistent"); err == nil {
		t.Fatal("expected error revoking non-existent grant")
	}
}

func TestGrantEvaluate(t *testing.T) {
	store, _, cleanup := setupTestStore(t)
	defer cleanup()

	ctx := context.Background()
	store.Initialize(ctx)

	// Create an allow grant.
	store.Create(ctx, Grant{
		ID:        "grant-allow",
		EntityID:  "user-001",
		Operation: "memory.recall",
		Resource:  "*",
		Effect:    "allow",
	})

	// Evaluate: should be allowed.
	decision, err := store.Evaluate(ctx, "user-001", "memory.recall", "memory.elements")
	if err != nil {
		t.Fatalf("evaluate: %v", err)
	}
	if !decision.Allowed {
		t.Fatalf("expected allowed, got denied: %s", decision.Reason)
	}
	if decision.MatchedGrant != "grant-allow" {
		t.Fatalf("expected matched grant 'grant-allow', got %q", decision.MatchedGrant)
	}

	// Evaluate for a different entity: should be denied (no matching grant).
	decision, err = store.Evaluate(ctx, "user-002", "memory.recall", "memory.elements")
	if err != nil {
		t.Fatalf("evaluate: %v", err)
	}
	if decision.Allowed {
		t.Fatal("expected denied for user-002, got allowed")
	}
}

func TestGrantEvaluateDeny(t *testing.T) {
	store, _, cleanup := setupTestStore(t)
	defer cleanup()

	ctx := context.Background()
	store.Initialize(ctx)

	// Create both allow and deny grants for the same entity/operation.
	store.Create(ctx, Grant{
		ID:        "grant-allow",
		EntityID:  "user-001",
		Operation: "memory.*",
		Resource:  "*",
		Effect:    "allow",
	})
	store.Create(ctx, Grant{
		ID:        "grant-deny",
		EntityID:  "user-001",
		Operation: "memory.delete",
		Resource:  "*",
		Effect:    "deny",
	})

	// memory.recall should be allowed.
	decision, err := store.Evaluate(ctx, "user-001", "memory.recall", "memory.elements")
	if err != nil {
		t.Fatalf("evaluate recall: %v", err)
	}
	if !decision.Allowed {
		t.Fatalf("expected allowed for memory.recall, got denied: %s", decision.Reason)
	}

	// memory.delete should be denied (deny overrides allow).
	decision, err = store.Evaluate(ctx, "user-001", "memory.delete", "memory.elements")
	if err != nil {
		t.Fatalf("evaluate delete: %v", err)
	}
	if decision.Allowed {
		t.Fatal("expected denied for memory.delete, got allowed")
	}
	if decision.MatchedGrant != "grant-deny" {
		t.Fatalf("expected matched grant 'grant-deny', got %q", decision.MatchedGrant)
	}
}

func TestGrantWildcardMatch(t *testing.T) {
	store, _, cleanup := setupTestStore(t)
	defer cleanup()

	ctx := context.Background()
	store.Initialize(ctx)

	// Create a wildcard allow grant.
	store.Create(ctx, Grant{
		ID:        "grant-wildcard",
		EntityID:  "admin-001",
		Operation: "memory.*",
		Resource:  "*",
		Effect:    "allow",
	})

	// Should match memory.recall.
	decision, _ := store.Evaluate(ctx, "admin-001", "memory.recall", "any-resource")
	if !decision.Allowed {
		t.Fatalf("expected memory.recall to match memory.*, got denied")
	}

	// Should match memory.retain.
	decision, _ = store.Evaluate(ctx, "admin-001", "memory.retain", "any-resource")
	if !decision.Allowed {
		t.Fatalf("expected memory.retain to match memory.*, got denied")
	}

	// Should NOT match event.ingest.
	decision, _ = store.Evaluate(ctx, "admin-001", "event.ingest", "any-resource")
	if decision.Allowed {
		t.Fatal("expected event.ingest to NOT match memory.*, got allowed")
	}
}

func TestGrantExpired(t *testing.T) {
	store, _, cleanup := setupTestStore(t)
	defer cleanup()

	ctx := context.Background()
	store.Initialize(ctx)

	// Create an expired grant.
	expired := time.Now().Add(-1 * time.Hour)
	store.Create(ctx, Grant{
		ID:        "grant-expired",
		EntityID:  "user-001",
		Operation: "memory.recall",
		Resource:  "*",
		Effect:    "allow",
		ExpiresAt: &expired,
	})

	// Should be denied because the grant is expired.
	decision, _ := store.Evaluate(ctx, "user-001", "memory.recall", "any-resource")
	if decision.Allowed {
		t.Fatal("expected denied for expired grant, got allowed")
	}
}

func TestPolicyEngineEvaluate(t *testing.T) {
	store, _, cleanup := setupTestStore(t)
	defer cleanup()

	ctx := context.Background()
	store.Initialize(ctx)

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	engine := NewPolicyEngine(store, logger)

	// Create a grant.
	store.Create(ctx, Grant{
		ID:        "grant-1",
		EntityID:  "user-001",
		Operation: "event.*",
		Resource:  "*",
		Effect:    "allow",
	})

	// Evaluate via policy engine.
	decision := engine.Evaluate(ctx, "user-001", "event.ingest", "events")
	if !decision.Allowed {
		t.Fatalf("expected allowed, got denied: %s", decision.Reason)
	}

	// Unknown entity should be denied.
	decision = engine.Evaluate(ctx, "unknown", "event.ingest", "events")
	if decision.Allowed {
		t.Fatal("expected denied for unknown entity")
	}
}

func TestAuditLog(t *testing.T) {
	tmpDir := t.TempDir()
	ledgers, err := db.OpenLedgers(tmpDir)
	if err != nil {
		t.Fatalf("open ledgers: %v", err)
	}
	defer ledgers.Close()

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	audit := NewAuditLogger(ledgers.Runtime, logger)

	ctx := context.Background()
	if err := audit.Initialize(ctx); err != nil {
		t.Fatalf("initialize: %v", err)
	}

	// Log some entries.
	audit.Log(ctx, AuditEntry{
		EntityID:  "user-001",
		Operation: "memory.recall",
		Resource:  "memory.elements",
		Action:    "allow",
		Details:   `{"reason":"test"}`,
	})
	audit.Log(ctx, AuditEntry{
		EntityID:  "user-002",
		Operation: "event.ingest",
		Resource:  "events",
		Action:    "deny",
		Details:   `{"reason":"no grant"}`,
	})

	// Query all.
	entries, err := audit.Query(ctx, AuditFilter{Limit: 10})
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}

	// Query by entity.
	entries, err = audit.Query(ctx, AuditFilter{EntityID: "user-001", Limit: 10})
	if err != nil {
		t.Fatalf("query by entity: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry for user-001, got %d", len(entries))
	}
	if entries[0].Action != "allow" {
		t.Fatalf("expected action 'allow', got %q", entries[0].Action)
	}
}

func TestIAMEvaluator(t *testing.T) {
	tmpDir := t.TempDir()
	ledgers, err := db.OpenLedgers(tmpDir)
	if err != nil {
		t.Fatalf("open ledgers: %v", err)
	}
	defer ledgers.Close()

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	store := NewGrantStore(ledgers.Runtime, logger)
	store.Initialize(context.Background())

	audit := NewAuditLogger(ledgers.Runtime, logger)
	audit.Initialize(context.Background())

	engine := NewPolicyEngine(store, logger)
	evaluator := NewStrictIAMEvaluator(engine, audit)

	ctx := context.Background()

	// Create a grant for the sender entity.
	store.Create(ctx, Grant{
		ID:        "grant-user",
		EntityID:  "user-123",
		Operation: "health",
		Resource:  "*",
		Effect:    "allow",
	})

	// Create a pipeline request.
	req := pipeline.NewRequest(pipeline.NexusInput{
		Operation: "health",
		Routing: pipeline.Routing{
			Adapter: "test",
			Sender:  pipeline.RoutingParticipant{ID: "user-123", Name: "Test User"},
		},
	})
	req.Principals = &pipeline.Principals{
		Sender: &pipeline.Entity{ID: "user-123", Name: "Test User", Type: "person"},
	}

	// Evaluate.
	decision, err := evaluator.Evaluate(ctx, req)
	if err != nil {
		t.Fatalf("evaluate: %v", err)
	}
	if decision.Decision != "allow" {
		t.Fatalf("expected 'allow', got %q", decision.Decision)
	}

	// Request from unknown user should be denied.
	req2 := pipeline.NewRequest(pipeline.NexusInput{
		Operation: "health",
		Routing: pipeline.Routing{
			Adapter: "test",
			Sender:  pipeline.RoutingParticipant{ID: "unknown", Name: "Unknown"},
		},
	})
	req2.Principals = &pipeline.Principals{
		Sender: &pipeline.Entity{ID: "unknown", Name: "Unknown", Type: "person"},
	}

	decision2, err := evaluator.Evaluate(ctx, req2)
	if err != nil {
		t.Fatalf("evaluate: %v", err)
	}
	if decision2.Decision != "deny" {
		t.Fatalf("expected 'deny', got %q", decision2.Decision)
	}
}

func TestResolveAccess(t *testing.T) {
	tmpDir := t.TempDir()
	ledgers, err := db.OpenLedgers(tmpDir)
	if err != nil {
		t.Fatalf("open ledgers: %v", err)
	}
	defer ledgers.Close()

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	store := NewGrantStore(ledgers.Runtime, logger)
	store.Initialize(context.Background())

	audit := NewAuditLogger(ledgers.Runtime, logger)
	audit.Initialize(context.Background())

	engine := NewPolicyEngine(store, logger)
	evaluator := NewStrictIAMEvaluator(engine, audit)

	ctx := context.Background()

	// Create grants.
	store.Create(ctx, Grant{
		ID:        "g1",
		EntityID:  "user-001",
		Operation: "health",
		Resource:  "*",
		Effect:    "allow",
	})

	// Create a mock operation resolver.
	resolver := &testResolver{ops: map[string]pipeline.OperationHandlerInfo{
		"health": {
			Operation: "health",
			Kind:      "control",
			Action:    "read",
			Resource:  "system.health",
			Handler: func(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
				return map[string]string{"status": "ok"}, nil
			},
		},
	}}

	// Create the pipeline with the IAM evaluator.
	p := pipeline.NewPipeline(resolver,
		pipeline.WithAccessEvaluator(evaluator),
		pipeline.WithLogger(logger),
	)

	// Request from an allowed user.
	req := pipeline.NewRequest(pipeline.NexusInput{
		Operation: "health",
		Routing: pipeline.Routing{
			Adapter: "test",
			Sender:  pipeline.RoutingParticipant{ID: "user-001", Name: "User"},
		},
	})

	result, err := p.Execute(ctx, req)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.Status != pipeline.StatusCompleted {
		t.Fatalf("expected completed, got %s (error: %s)", result.Status, result.Error)
	}

	// Request from a denied user.
	req2 := pipeline.NewRequest(pipeline.NexusInput{
		Operation: "health",
		Routing: pipeline.Routing{
			Adapter: "test",
			Sender:  pipeline.RoutingParticipant{ID: "user-002", Name: "Unknown"},
		},
	})

	result2, err := p.Execute(ctx, req2)
	if err == nil {
		t.Fatal("expected error for denied user")
	}
	if result2.Status != pipeline.StatusDenied {
		t.Fatalf("expected denied, got %s", result2.Status)
	}
}

// testResolver implements pipeline.OperationResolver for testing.
type testResolver struct {
	ops map[string]pipeline.OperationHandlerInfo
}

func (r *testResolver) Resolve(operation string) (pipeline.OperationHandlerInfo, error) {
	info, ok := r.ops[operation]
	if !ok {
		return pipeline.OperationHandlerInfo{}, fmt.Errorf("operation not found: %s", operation)
	}
	return info, nil
}

func (r *testResolver) Has(operation string) bool {
	_, ok := r.ops[operation]
	return ok
}
