package db

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

// testLedgers opens ledgers in a temp directory and registers cleanup.
func testLedgers(t *testing.T) *Ledgers {
	t.Helper()
	dataDir := filepath.Join(t.TempDir(), "data")
	l, err := OpenLedgers(dataDir)
	if err != nil {
		t.Fatalf("OpenLedgers: %v", err)
	}
	t.Cleanup(func() { l.Close() })
	return l
}

// ledgerDB returns the *sql.DB for a given ledger name.
func ledgerDB(l *Ledgers, name string) *sql.DB {
	switch name {
	case "events":
		return l.Events
	case "agents":
		return l.Agents
	case "identity":
		return l.Identity
	case "memory":
		return l.Memory
	case "embeddings":
		return l.Embeddings
	case "runtime":
		return l.Runtime
	case "work":
		return l.Work
	default:
		return nil
	}
}

func TestOpenLedgers(t *testing.T) {
	l := testLedgers(t)

	// All 7 database handles should be non-nil.
	if l.Events == nil {
		t.Error("Events db is nil")
	}
	if l.Agents == nil {
		t.Error("Agents db is nil")
	}
	if l.Identity == nil {
		t.Error("Identity db is nil")
	}
	if l.Memory == nil {
		t.Error("Memory db is nil")
	}
	if l.Embeddings == nil {
		t.Error("Embeddings db is nil")
	}
	if l.Runtime == nil {
		t.Error("Runtime db is nil")
	}
	if l.Work == nil {
		t.Error("Work db is nil")
	}
}

func TestHealthCheck(t *testing.T) {
	l := testLedgers(t)
	health := l.HealthCheck()

	expected := []string{"events", "agents", "identity", "memory", "embeddings", "runtime", "work"}
	for _, name := range expected {
		status, ok := health[name]
		if !ok {
			t.Errorf("health check missing key %q", name)
			continue
		}
		if status != "ok" {
			t.Errorf("health check %s = %q, want ok", name, status)
		}
	}
}

func TestClose(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	l, err := OpenLedgers(dataDir)
	if err != nil {
		t.Fatalf("OpenLedgers: %v", err)
	}
	if err := l.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	// After close, health check should report "closed" for all.
	health := l.HealthCheck()
	for name, status := range health {
		if status != "closed" {
			t.Errorf("after close: %s = %q, want closed", name, status)
		}
	}
}

func TestSchemaTablesExist(t *testing.T) {
	l := testLedgers(t)

	// For each database, run "SELECT count(*) FROM <table>" to verify it exists.
	tableChecks := []struct {
		dbName string
		table  string
	}{
		// events.db
		{"events", "events"},
		{"events", "attachments"},
		{"events", "attachment_interpretations"},
		// agents.db
		{"agents", "sessions"},
		{"agents", "turns"},
		{"agents", "messages"},
		{"agents", "tool_calls"},
		{"agents", "compactions"},
		{"agents", "artifacts"},
		// identity.db
		{"identity", "entities"},
		{"identity", "contacts"},
		{"identity", "entity_tags"},
		{"identity", "entity_links"},
		{"identity", "contact_participants"},
		// memory.db
		{"memory", "elements"},
		{"memory", "element_entities"},
		{"memory", "element_links"},
		{"memory", "sets"},
		{"memory", "set_members"},
		{"memory", "jobs"},
		{"memory", "processing_log"},
		{"memory", "review_queue"},
		// embeddings.db
		{"embeddings", "embeddings"},
		// runtime.db
		{"runtime", "pipeline_requests"},
		{"runtime", "automations"},
		{"runtime", "grants"},
		{"runtime", "audit_log"},
		{"runtime", "adapter_state"},
		{"runtime", "import_jobs"},
		{"runtime", "hooks"},
		{"runtime", "clock_schedules"},
		{"runtime", "kv"},
		// work.db
		{"work", "work_items"},
		{"work", "sequences"},
		{"work", "workflows"},
		{"work", "campaigns"},
		{"work", "dependencies"},
	}

	for _, tc := range tableChecks {
		t.Run(tc.dbName+"/"+tc.table, func(t *testing.T) {
			db := ledgerDB(l, tc.dbName)
			if db == nil {
				t.Fatalf("no db for %s", tc.dbName)
			}

			var count int
			err := db.QueryRow("SELECT count(*) FROM " + tc.table).Scan(&count)
			if err != nil {
				t.Fatalf("table %s.%s does not exist: %v", tc.dbName, tc.table, err)
			}
		})
	}
}

func TestInsertAndSelectEvents(t *testing.T) {
	l := testLedgers(t)
	ctx := context.Background()
	now := time.Now().UnixMilli()

	_, err := l.Events.ExecContext(ctx,
		`INSERT INTO events (id, adapter_id, timestamp) VALUES (?, ?, ?)`,
		"evt-1", "adapter-1", now)
	if err != nil {
		t.Fatalf("insert event: %v", err)
	}

	var id, adapterID string
	err = l.Events.QueryRowContext(ctx, `SELECT id, adapter_id FROM events WHERE id = ?`, "evt-1").Scan(&id, &adapterID)
	if err != nil {
		t.Fatalf("select event: %v", err)
	}
	if id != "evt-1" || adapterID != "adapter-1" {
		t.Errorf("got id=%q adapter_id=%q, want evt-1, adapter-1", id, adapterID)
	}
}

func TestInsertAndSelectSessions(t *testing.T) {
	l := testLedgers(t)
	ctx := context.Background()

	_, err := l.Agents.ExecContext(ctx,
		`INSERT INTO sessions (id, session_key) VALUES (?, ?)`,
		"sess-1", "key-1")
	if err != nil {
		t.Fatalf("insert session: %v", err)
	}

	var id, key string
	err = l.Agents.QueryRowContext(ctx, `SELECT id, session_key FROM sessions WHERE id = ?`, "sess-1").Scan(&id, &key)
	if err != nil {
		t.Fatalf("select session: %v", err)
	}
	if id != "sess-1" || key != "key-1" {
		t.Errorf("got id=%q key=%q, want sess-1, key-1", id, key)
	}
}

func TestInsertAndSelectEntities(t *testing.T) {
	l := testLedgers(t)
	ctx := context.Background()

	_, err := l.Identity.ExecContext(ctx,
		`INSERT INTO entities (id, name, type, normalized) VALUES (?, ?, ?, ?)`,
		"ent-1", "Alice", "person", "alice")
	if err != nil {
		t.Fatalf("insert entity: %v", err)
	}

	entity, err := l.GetEntityByID(ctx, "ent-1")
	if err != nil {
		t.Fatalf("GetEntityByID: %v", err)
	}
	if entity == nil {
		t.Fatal("entity is nil")
	}
	if entity.Name != "Alice" {
		t.Errorf("entity.Name = %q, want Alice", entity.Name)
	}
}

func TestInsertAndSelectElements(t *testing.T) {
	l := testLedgers(t)
	ctx := context.Background()

	_, err := l.Memory.ExecContext(ctx,
		`INSERT INTO elements (id, type, content) VALUES (?, ?, ?)`,
		"elem-1", "observation", "something happened")
	if err != nil {
		t.Fatalf("insert element: %v", err)
	}

	var id, typ, content string
	err = l.Memory.QueryRowContext(ctx, `SELECT id, type, content FROM elements WHERE id = ?`, "elem-1").Scan(&id, &typ, &content)
	if err != nil {
		t.Fatalf("select element: %v", err)
	}
	if content != "something happened" {
		t.Errorf("content = %q, want 'something happened'", content)
	}
}

func TestInsertAndSelectPipelineRequests(t *testing.T) {
	l := testLedgers(t)
	ctx := context.Background()
	now := time.Now().UnixMilli()

	err := l.InsertPipelineRequest(ctx, PipelineRequestRow{
		ID:        "pr-1",
		Operation: "inbound.message",
		Status:    "processing",
		SenderID:  "sender-1",
		Payload:   "{}",
		Result:    "{}",
		Stages:    "[]",
		CreatedAt: now,
	})
	if err != nil {
		t.Fatalf("InsertPipelineRequest: %v", err)
	}

	var id, op string
	err = l.Runtime.QueryRowContext(ctx, `SELECT id, operation FROM pipeline_requests WHERE id = ?`, "pr-1").Scan(&id, &op)
	if err != nil {
		t.Fatalf("select pipeline_request: %v", err)
	}
	if op != "inbound.message" {
		t.Errorf("operation = %q, want inbound.message", op)
	}
}

func TestInsertAndSelectWorkItems(t *testing.T) {
	l := testLedgers(t)
	ctx := context.Background()

	_, err := l.Work.ExecContext(ctx,
		`INSERT INTO work_items (id, type, title) VALUES (?, ?, ?)`,
		"wi-1", "task", "do something")
	if err != nil {
		t.Fatalf("insert work_item: %v", err)
	}

	var id, title string
	err = l.Work.QueryRowContext(ctx, `SELECT id, title FROM work_items WHERE id = ?`, "wi-1").Scan(&id, &title)
	if err != nil {
		t.Fatalf("select work_item: %v", err)
	}
	if title != "do something" {
		t.Errorf("title = %q, want 'do something'", title)
	}
}

func TestInsertAndSelectEmbeddings(t *testing.T) {
	l := testLedgers(t)
	ctx := context.Background()

	_, err := l.Embeddings.ExecContext(ctx,
		`INSERT INTO embeddings (id, source_type, source_id, model, dimensions) VALUES (?, ?, ?, ?, ?)`,
		"emb-1", "element", "elem-1", "text-embedding-3-small", 1536)
	if err != nil {
		t.Fatalf("insert embedding: %v", err)
	}

	var id, model string
	var dims int
	err = l.Embeddings.QueryRowContext(ctx, `SELECT id, model, dimensions FROM embeddings WHERE id = ?`, "emb-1").Scan(&id, &model, &dims)
	if err != nil {
		t.Fatalf("select embedding: %v", err)
	}
	if model != "text-embedding-3-small" || dims != 1536 {
		t.Errorf("got model=%q dims=%d, want text-embedding-3-small, 1536", model, dims)
	}
}

func TestAutoCreateEntity(t *testing.T) {
	l := testLedgers(t)
	ctx := context.Background()

	// First call should create new entity + contact.
	entityID, err := l.AutoCreateEntity(ctx, "Bob", "person", "discord", "discord", "bob-123")
	if err != nil {
		t.Fatalf("AutoCreateEntity: %v", err)
	}
	if entityID == "" {
		t.Fatal("entityID is empty")
	}

	// Second call with same platform ID should return the same entity.
	entityID2, err := l.AutoCreateEntity(ctx, "Bob", "person", "discord", "discord", "bob-123")
	if err != nil {
		t.Fatalf("AutoCreateEntity second call: %v", err)
	}
	if entityID2 != entityID {
		t.Errorf("second call returned %q, want %q", entityID2, entityID)
	}

	// Verify the entity exists.
	entity, err := l.GetEntityByID(ctx, entityID)
	if err != nil {
		t.Fatalf("GetEntityByID: %v", err)
	}
	if entity == nil {
		t.Fatal("entity not found")
	}
	if entity.Name != "Bob" {
		t.Errorf("entity.Name = %q, want Bob", entity.Name)
	}
	if entity.Normalized != "bob" {
		t.Errorf("entity.Normalized = %q, want bob", entity.Normalized)
	}
}

func TestResolveContactByPlatformID(t *testing.T) {
	l := testLedgers(t)
	ctx := context.Background()

	// Should return nil when no contact exists.
	c, err := l.ResolveContactByPlatformID(ctx, "slack", "slack", "U999")
	if err != nil {
		t.Fatalf("ResolveContactByPlatformID: %v", err)
	}
	if c != nil {
		t.Fatal("expected nil contact, got non-nil")
	}

	// Create an entity+contact and look it up.
	entityID, _ := l.AutoCreateEntity(ctx, "Eve", "person", "slack", "slack", "U123")

	c, err = l.ResolveContactByPlatformID(ctx, "slack", "slack", "U123")
	if err != nil {
		t.Fatalf("ResolveContactByPlatformID: %v", err)
	}
	if c == nil {
		t.Fatal("expected contact, got nil")
	}
	if c.EntityID != entityID {
		t.Errorf("contact.EntityID = %q, want %q", c.EntityID, entityID)
	}
	if c.DisplayName != "Eve" {
		t.Errorf("contact.DisplayName = %q, want Eve", c.DisplayName)
	}
}

func TestAdapterState(t *testing.T) {
	l := testLedgers(t)
	ctx := context.Background()

	// List should return empty initially.
	states, err := l.ListAdapterState(ctx)
	if err != nil {
		t.Fatalf("ListAdapterState: %v", err)
	}
	if len(states) != 0 {
		t.Fatalf("expected 0 adapter states, got %d", len(states))
	}

	// Upsert a state.
	now := time.Now().UnixMilli()
	err = l.UpsertAdapterState(ctx, AdapterStateRow{
		AdapterID:   "discord-1",
		Status:      "connected",
		Config:      "{}",
		Metadata:    "{}",
		ConnectedAt: &now,
	})
	if err != nil {
		t.Fatalf("UpsertAdapterState: %v", err)
	}

	// List should now have 1 entry.
	states, err = l.ListAdapterState(ctx)
	if err != nil {
		t.Fatalf("ListAdapterState: %v", err)
	}
	if len(states) != 1 {
		t.Fatalf("expected 1 adapter state, got %d", len(states))
	}
	if states[0].Status != "connected" {
		t.Errorf("status = %q, want connected", states[0].Status)
	}

	// Upsert again (update).
	err = l.UpsertAdapterState(ctx, AdapterStateRow{
		AdapterID: "discord-1",
		Status:    "disconnected",
		Config:    "{}",
		Metadata:  "{}",
	})
	if err != nil {
		t.Fatalf("UpsertAdapterState update: %v", err)
	}

	states, err = l.ListAdapterState(ctx)
	if err != nil {
		t.Fatalf("ListAdapterState: %v", err)
	}
	if len(states) != 1 {
		t.Fatalf("expected 1 adapter state after upsert, got %d", len(states))
	}
	if states[0].Status != "disconnected" {
		t.Errorf("status after upsert = %q, want disconnected", states[0].Status)
	}
}
