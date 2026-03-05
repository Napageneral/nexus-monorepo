package automations

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
}

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "runtime.db")
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=ON")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestHooksRuntimeCreation(t *testing.T) {
	h := NewHooksRuntime(testLogger())
	if h == nil {
		t.Fatal("NewHooksRuntime returned nil")
	}
	if h.Count() != 0 {
		t.Errorf("Count() = %d, want 0", h.Count())
	}
	list := h.List()
	if len(list) != 0 {
		t.Errorf("List() has %d entries, want 0", len(list))
	}
}

func TestHooksRegisterAndFire(t *testing.T) {
	h := NewHooksRuntime(testLogger())

	var called atomic.Int32
	handler := func(_ context.Context, data HookData) error {
		called.Add(1)
		if data.Hookpoint != "test.hook" {
			t.Errorf("hookpoint = %q, want test.hook", data.Hookpoint)
		}
		return nil
	}

	id := h.Register("test.hook", "test-handler", "bundled", handler)
	if id == "" {
		t.Fatal("Register returned empty ID")
	}

	ctx := context.Background()
	err := h.Fire(ctx, "test.hook", HookData{})
	if err != nil {
		t.Fatalf("Fire: %v", err)
	}
	if called.Load() != 1 {
		t.Errorf("handler called %d times, want 1", called.Load())
	}

	// Firing a hookpoint with no handlers should be a no-op.
	err = h.Fire(ctx, "nonexistent", HookData{})
	if err != nil {
		t.Fatalf("Fire nonexistent: %v", err)
	}
}

func TestHooksMultipleHandlers(t *testing.T) {
	h := NewHooksRuntime(testLogger())

	var order []string
	makeHandler := func(name string) HookHandler {
		return func(_ context.Context, _ HookData) error {
			order = append(order, name)
			return nil
		}
	}

	h.Register("multi.hook", "first", "bundled", makeHandler("first"))
	h.Register("multi.hook", "second", "bundled", makeHandler("second"))
	h.Register("multi.hook", "third", "bundled", makeHandler("third"))

	ctx := context.Background()
	err := h.Fire(ctx, "multi.hook", HookData{})
	if err != nil {
		t.Fatalf("Fire: %v", err)
	}

	if len(order) != 3 {
		t.Fatalf("got %d calls, want 3", len(order))
	}
	if order[0] != "first" || order[1] != "second" || order[2] != "third" {
		t.Errorf("call order = %v, want [first second third]", order)
	}

	// Verify List returns correct names.
	list := h.List()
	names := list["multi.hook"]
	if len(names) != 3 {
		t.Fatalf("List multi.hook has %d names, want 3", len(names))
	}
}

func TestHooksFireReturnsFirstError(t *testing.T) {
	h := NewHooksRuntime(testLogger())

	errFirst := errors.New("first error")
	h.Register("err.hook", "fail-first", "bundled", func(_ context.Context, _ HookData) error {
		return errFirst
	})
	h.Register("err.hook", "succeed", "bundled", func(_ context.Context, _ HookData) error {
		return nil
	})

	err := h.Fire(context.Background(), "err.hook", HookData{})
	if err == nil {
		t.Fatal("expected error from Fire")
	}
	if !errors.Is(err, errFirst) {
		t.Errorf("got error %v, want %v", err, errFirst)
	}
}

func TestHooksUnregister(t *testing.T) {
	h := NewHooksRuntime(testLogger())

	var called atomic.Int32
	handler := func(_ context.Context, _ HookData) error {
		called.Add(1)
		return nil
	}

	id := h.Register("unsub.hook", "removable", "bundled", handler)
	if h.Count() != 1 {
		t.Fatalf("Count() = %d, want 1", h.Count())
	}

	h.Unregister(id)
	if h.Count() != 0 {
		t.Fatalf("Count() after unregister = %d, want 0", h.Count())
	}

	// Fire should not call the handler after unregister.
	ctx := context.Background()
	_ = h.Fire(ctx, "unsub.hook", HookData{})
	if called.Load() != 0 {
		t.Errorf("handler called %d times after unregister, want 0", called.Load())
	}
}

func TestBundledAutomationsRegister(t *testing.T) {
	h := NewHooksRuntime(testLogger())
	b := NewBundledAutomations(h, testLogger())
	b.RegisterAll()

	if h.Count() != 4 {
		t.Fatalf("Count() = %d, want 4", h.Count())
	}

	list := h.List()

	expectedHooks := map[string]string{
		"after.pipeline.execute": "command-logger",
		"after.agent.turn":       "memory-retain",
		"before.agent.run":       "memory-reader",
		"on.startup":             "boot-md",
	}

	for hookpoint, expectedName := range expectedHooks {
		names, ok := list[hookpoint]
		if !ok {
			t.Errorf("hookpoint %q not found in list", hookpoint)
			continue
		}
		found := false
		for _, name := range names {
			if name == expectedName {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("hookpoint %q: expected handler %q, got %v", hookpoint, expectedName, names)
		}
	}

	// Verify all bundled hooks can fire without error.
	ctx := context.Background()
	for hookpoint := range expectedHooks {
		if err := h.Fire(ctx, hookpoint, HookData{}); err != nil {
			t.Errorf("Fire %q: %v", hookpoint, err)
		}
	}
}

func TestSeederInitialize(t *testing.T) {
	db := testDB(t)
	h := NewHooksRuntime(testLogger())
	s := NewSeeder(db, h, testLogger())

	ctx := context.Background()
	if err := s.Initialize(ctx); err != nil {
		t.Fatalf("Initialize: %v", err)
	}

	// Verify table exists by querying it.
	var count int
	err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM seeder_automations`).Scan(&count)
	if err != nil {
		t.Fatalf("query seeder_automations: %v", err)
	}
	if count != 0 {
		t.Errorf("initial count = %d, want 0", count)
	}

	// Initialize should be idempotent.
	if err := s.Initialize(ctx); err != nil {
		t.Fatalf("Initialize (second call): %v", err)
	}
}

func TestSeederSeed(t *testing.T) {
	db := testDB(t)
	h := NewHooksRuntime(testLogger())
	s := NewSeeder(db, h, testLogger())

	ctx := context.Background()
	if err := s.Initialize(ctx); err != nil {
		t.Fatalf("Initialize: %v", err)
	}
	if err := s.Seed(ctx); err != nil {
		t.Fatalf("Seed: %v", err)
	}

	records, err := s.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(records) != 4 {
		t.Fatalf("got %d records, want 4", len(records))
	}

	// Verify the seeded records.
	expectedNames := map[string]bool{
		"command-logger": false,
		"memory-retain":  false,
		"memory-reader":  false,
		"boot-md":        false,
	}
	for _, r := range records {
		if _, ok := expectedNames[r.Name]; !ok {
			t.Errorf("unexpected record name: %q", r.Name)
		} else {
			expectedNames[r.Name] = true
		}
		if !r.Enabled {
			t.Errorf("record %q is disabled, want enabled", r.Name)
		}
		if r.ID == "" {
			t.Errorf("record %q has empty ID", r.Name)
		}
	}
	for name, found := range expectedNames {
		if !found {
			t.Errorf("expected record %q not found", name)
		}
	}

	// Seed again should be a no-op (records already exist).
	if err := s.Seed(ctx); err != nil {
		t.Fatalf("Seed (second call): %v", err)
	}
	records2, _ := s.List(ctx)
	if len(records2) != 4 {
		t.Errorf("after second seed: got %d records, want 4", len(records2))
	}
}

func TestSeederSetEnabled(t *testing.T) {
	db := testDB(t)
	h := NewHooksRuntime(testLogger())
	s := NewSeeder(db, h, testLogger())

	ctx := context.Background()
	if err := s.Initialize(ctx); err != nil {
		t.Fatalf("Initialize: %v", err)
	}
	if err := s.Seed(ctx); err != nil {
		t.Fatalf("Seed: %v", err)
	}

	records, _ := s.List(ctx)
	if len(records) == 0 {
		t.Fatal("no records to toggle")
	}

	targetID := records[0].ID

	// Disable.
	if err := s.SetEnabled(ctx, targetID, false); err != nil {
		t.Fatalf("SetEnabled(false): %v", err)
	}
	records, _ = s.List(ctx)
	for _, r := range records {
		if r.ID == targetID && r.Enabled {
			t.Error("record should be disabled after SetEnabled(false)")
		}
	}

	// Re-enable.
	if err := s.SetEnabled(ctx, targetID, true); err != nil {
		t.Fatalf("SetEnabled(true): %v", err)
	}
	records, _ = s.List(ctx)
	for _, r := range records {
		if r.ID == targetID && !r.Enabled {
			t.Error("record should be enabled after SetEnabled(true)")
		}
	}

	// Non-existent ID should return an error.
	err := s.SetEnabled(ctx, "nonexistent-id", true)
	if err == nil {
		t.Error("expected error for non-existent ID")
	}
}
