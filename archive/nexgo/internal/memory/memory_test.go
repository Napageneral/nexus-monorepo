package memory

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Napageneral/nexus/internal/config"
	"github.com/Napageneral/nexus/internal/db"
)

func setupTestManager(t *testing.T) (*Manager, func()) {
	t.Helper()
	tmpDir := t.TempDir()
	ledgers, err := db.OpenLedgers(tmpDir)
	if err != nil {
		t.Fatalf("open ledgers: %v", err)
	}

	cfg := &config.MemoryConfig{Backend: "builtin"}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	mgr := NewManager(ledgers, cfg, logger)
	return mgr, func() { ledgers.Close() }
}

func TestMemoryManagerCreation(t *testing.T) {
	mgr, cleanup := setupTestManager(t)
	defer cleanup()

	ctx := context.Background()
	if err := mgr.Initialize(ctx); err != nil {
		t.Fatalf("initialize: %v", err)
	}
}

func TestMemoryRecallFTS(t *testing.T) {
	if !db.FTSEnabled() {
		t.Skip("FTS5 not enabled")
	}

	mgr, cleanup := setupTestManager(t)
	defer cleanup()

	ctx := context.Background()
	if err := mgr.Initialize(ctx); err != nil {
		t.Fatalf("initialize: %v", err)
	}

	// Insert some elements.
	elements := []MemoryElement{
		{Type: "fact", Content: "Go is a statically typed language", Source: "test", Importance: 0.8, Tags: "[]"},
		{Type: "fact", Content: "Python is dynamically typed", Source: "test", Importance: 0.7, Tags: "[]"},
		{Type: "fact", Content: "Rust has a borrow checker", Source: "test", Importance: 0.9, Tags: "[]"},
	}
	for _, elem := range elements {
		if err := mgr.RetainElement(ctx, elem); err != nil {
			t.Fatalf("retain: %v", err)
		}
	}

	// Search for "typed" using FTS5.
	result, err := mgr.Recall(ctx, RecallRequest{Query: "typed", Limit: 10})
	if err != nil {
		t.Fatalf("recall: %v", err)
	}

	if result.Strategy != "fts5" {
		t.Fatalf("expected strategy 'fts5', got %q", result.Strategy)
	}
	if len(result.Elements) < 1 {
		t.Fatal("expected at least 1 result for 'typed'")
	}

	// Verify the results contain relevant content.
	found := false
	for _, elem := range result.Elements {
		if elem.Content == "Go is a statically typed language" || elem.Content == "Python is dynamically typed" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected to find elements containing 'typed'")
	}
}

func TestMemoryRecallLike(t *testing.T) {
	mgr, cleanup := setupTestManager(t)
	defer cleanup()

	ctx := context.Background()
	if err := mgr.Initialize(ctx); err != nil {
		t.Fatalf("initialize: %v", err)
	}

	// Insert elements.
	elements := []MemoryElement{
		{Type: "fact", Content: "The capital of France is Paris", Source: "test", Importance: 0.8, Tags: "[]"},
		{Type: "fact", Content: "Berlin is the capital of Germany", Source: "test", Importance: 0.7, Tags: "[]"},
		{Type: "fact", Content: "Tokyo is in Japan", Source: "test", Importance: 0.6, Tags: "[]"},
	}
	for _, elem := range elements {
		if err := mgr.RetainElement(ctx, elem); err != nil {
			t.Fatalf("retain: %v", err)
		}
	}

	// Use the LIKE fallback directly by calling recallByLike.
	result, err := mgr.recallByLike(ctx, RecallRequest{Query: "capital", Limit: 10})
	if err != nil {
		t.Fatalf("recall like: %v", err)
	}

	if result.Strategy != "like" {
		t.Fatalf("expected strategy 'like', got %q", result.Strategy)
	}
	if len(result.Elements) != 2 {
		t.Fatalf("expected 2 results for 'capital', got %d", len(result.Elements))
	}
}

func TestMemoryRecallEntityFilter(t *testing.T) {
	mgr, cleanup := setupTestManager(t)
	defer cleanup()

	ctx := context.Background()
	if err := mgr.Initialize(ctx); err != nil {
		t.Fatalf("initialize: %v", err)
	}

	// Insert elements with entity associations.
	elem1 := MemoryElement{Type: "fact", Content: "Tyler likes Go programming", Source: "test", Importance: 0.8, Tags: "[]"}
	elem2 := MemoryElement{Type: "fact", Content: "Alice prefers Python", Source: "test", Importance: 0.7, Tags: "[]"}

	if err := mgr.RetainElement(ctx, elem1); err != nil {
		t.Fatalf("retain elem1: %v", err)
	}
	if err := mgr.RetainElement(ctx, elem2); err != nil {
		t.Fatalf("retain elem2: %v", err)
	}

	// Get the element IDs.
	rows, err := mgr.ledgers.Memory.QueryContext(ctx, "SELECT id, content FROM elements WHERE status = 'active'")
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	var elem1ID, elem2ID string
	for rows.Next() {
		var id, content string
		rows.Scan(&id, &content)
		if content == "Tyler likes Go programming" {
			elem1ID = id
		} else if content == "Alice prefers Python" {
			elem2ID = id
		}
	}
	rows.Close()

	// Associate entities.
	_, err = mgr.ledgers.Memory.ExecContext(ctx,
		"INSERT INTO element_entities (element_id, entity_id, role) VALUES (?, ?, 'subject')",
		elem1ID, "tyler-001",
	)
	if err != nil {
		t.Fatalf("insert entity association: %v", err)
	}
	_, err = mgr.ledgers.Memory.ExecContext(ctx,
		"INSERT INTO element_entities (element_id, entity_id, role) VALUES (?, ?, 'subject')",
		elem2ID, "alice-001",
	)
	if err != nil {
		t.Fatalf("insert entity association: %v", err)
	}

	// Recall by entity.
	result, err := mgr.Recall(ctx, RecallRequest{EntityIDs: []string{"tyler-001"}, Limit: 10})
	if err != nil {
		t.Fatalf("recall: %v", err)
	}

	if result.Strategy != "entity" {
		t.Fatalf("expected strategy 'entity', got %q", result.Strategy)
	}
	if len(result.Elements) != 1 {
		t.Fatalf("expected 1 result for tyler, got %d", len(result.Elements))
	}
	if result.Elements[0].Content != "Tyler likes Go programming" {
		t.Fatalf("unexpected content: %q", result.Elements[0].Content)
	}
}

func TestMemoryRecallTemporalRange(t *testing.T) {
	mgr, cleanup := setupTestManager(t)
	defer cleanup()

	ctx := context.Background()
	if err := mgr.Initialize(ctx); err != nil {
		t.Fatalf("initialize: %v", err)
	}

	// Insert elements with different created_at times.
	now := time.Now()

	// Insert an old element (manually set created_at).
	oldID := newUUID()
	oldTime := now.Add(-48 * time.Hour).UnixMilli()
	_, err := mgr.ledgers.Memory.ExecContext(ctx,
		`INSERT INTO elements (id, type, content, source, importance, tags, status, created_at, updated_at, access_count)
		VALUES (?, 'fact', 'Old fact', 'test', 0.5, '[]', 'active', ?, ?, 0)`,
		oldID, oldTime, oldTime,
	)
	if err != nil {
		t.Fatalf("insert old: %v", err)
	}

	// Insert a recent element.
	if err := mgr.RetainElement(ctx, MemoryElement{
		Type: "fact", Content: "Recent fact", Source: "test", Importance: 0.5, Tags: "[]",
	}); err != nil {
		t.Fatalf("retain recent: %v", err)
	}

	// Recall only recent elements (last 24 hours).
	result, err := mgr.Recall(ctx, RecallRequest{
		TimeRange: &TimeRange{After: now.Add(-24 * time.Hour)},
		Limit:     10,
	})
	if err != nil {
		t.Fatalf("recall: %v", err)
	}

	if result.Strategy != "temporal" {
		t.Fatalf("expected strategy 'temporal', got %q", result.Strategy)
	}
	if len(result.Elements) != 1 {
		t.Fatalf("expected 1 recent result, got %d", len(result.Elements))
	}
	if result.Elements[0].Content != "Recent fact" {
		t.Fatalf("unexpected content: %q", result.Elements[0].Content)
	}
}

func TestMemoryRetainFromTurn(t *testing.T) {
	mgr, cleanup := setupTestManager(t)
	defer cleanup()

	ctx := context.Background()
	if err := mgr.Initialize(ctx); err != nil {
		t.Fatalf("initialize: %v", err)
	}

	turn := TurnData{
		SessionKey: "session-001",
		AgentID:    "default",
		UserPrompt: "Tell me about Go",
		Response:   "Go is a compiled language created by Google. It has excellent concurrency support.",
		ToolCalls: []ToolCallData{
			{
				Name:   "read_file",
				Args:   map[string]any{"path": "/tmp/test.go"},
				Result: "package main\n\nfunc main() {\n\tfmt.Println(\"hello\")\n}",
			},
		},
	}

	if err := mgr.RetainFromTurn(ctx, turn); err != nil {
		t.Fatalf("retain from turn: %v", err)
	}

	// Check that elements were created.
	status := mgr.GetStatus()
	if status.ElementCount == 0 {
		t.Fatal("expected at least 1 element after retain from turn")
	}
}

func TestMemoryRetainElement(t *testing.T) {
	mgr, cleanup := setupTestManager(t)
	defer cleanup()

	ctx := context.Background()
	if err := mgr.Initialize(ctx); err != nil {
		t.Fatalf("initialize: %v", err)
	}

	elem := MemoryElement{
		Type:       "fact",
		Content:    "The sky is blue",
		Source:     "manual",
		Importance: 0.9,
		Tags:       `["color", "nature"]`,
	}

	if err := mgr.RetainElement(ctx, elem); err != nil {
		t.Fatalf("retain element: %v", err)
	}

	// Verify the element was stored.
	var count int
	err := mgr.ledgers.Memory.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM elements WHERE content = ?", "The sky is blue",
	).Scan(&count)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 element, got %d", count)
	}
}

func TestMemorySyncFiles(t *testing.T) {
	mgr, cleanup := setupTestManager(t)
	defer cleanup()

	ctx := context.Background()
	if err := mgr.Initialize(ctx); err != nil {
		t.Fatalf("initialize: %v", err)
	}

	// Create temp directory with .md files.
	tmpDir := t.TempDir()

	// File with frontmatter.
	content1 := `---
title: Test Note
---
This is a test note about programming.`
	os.WriteFile(filepath.Join(tmpDir, "note1.md"), []byte(content1), 0644)

	// File without frontmatter.
	content2 := `Just a simple memory note.`
	os.WriteFile(filepath.Join(tmpDir, "note2.md"), []byte(content2), 0644)

	// Non-md file (should be skipped).
	os.WriteFile(filepath.Join(tmpDir, "readme.txt"), []byte("skip me"), 0644)

	// Sync.
	if err := mgr.SyncMemoryFiles(ctx, tmpDir); err != nil {
		t.Fatalf("sync: %v", err)
	}

	// Check that 2 elements were created.
	status := mgr.GetStatus()
	if status.ElementCount != 2 {
		t.Fatalf("expected 2 elements, got %d", status.ElementCount)
	}

	// Sync again -- should skip existing files.
	if err := mgr.SyncMemoryFiles(ctx, tmpDir); err != nil {
		t.Fatalf("sync again: %v", err)
	}

	status = mgr.GetStatus()
	if status.ElementCount != 2 {
		t.Fatalf("expected 2 elements after re-sync, got %d", status.ElementCount)
	}
}

func TestMemoryConsolidate(t *testing.T) {
	mgr, cleanup := setupTestManager(t)
	defer cleanup()

	ctx := context.Background()
	if err := mgr.Initialize(ctx); err != nil {
		t.Fatalf("initialize: %v", err)
	}

	// Insert duplicate elements.
	for i := 0; i < 3; i++ {
		if err := mgr.RetainElement(ctx, MemoryElement{
			Type:       "fact",
			Content:    "Duplicate fact",
			Source:     "test",
			Importance: float64(i) * 0.3,
			Tags:       "[]",
		}); err != nil {
			t.Fatalf("retain %d: %v", i, err)
		}
	}

	// Insert a unique element.
	if err := mgr.RetainElement(ctx, MemoryElement{
		Type:       "fact",
		Content:    "Unique fact",
		Source:     "test",
		Importance: 0.5,
		Tags:       "[]",
	}); err != nil {
		t.Fatalf("retain unique: %v", err)
	}

	// Consolidate.
	result, err := mgr.Consolidate(ctx)
	if err != nil {
		t.Fatalf("consolidate: %v", err)
	}

	if result.Merged != 1 {
		t.Fatalf("expected 1 merged group, got %d", result.Merged)
	}
	if result.Removed != 2 {
		t.Fatalf("expected 2 removed, got %d", result.Removed)
	}

	// Check that only 2 active elements remain.
	status := mgr.GetStatus()
	if status.ElementCount != 2 {
		t.Fatalf("expected 2 active elements, got %d", status.ElementCount)
	}
}

func TestMemoryStatus(t *testing.T) {
	mgr, cleanup := setupTestManager(t)
	defer cleanup()

	ctx := context.Background()
	if err := mgr.Initialize(ctx); err != nil {
		t.Fatalf("initialize: %v", err)
	}

	// Initial status should show zero counts.
	status := mgr.GetStatus()
	if status.ElementCount != 0 {
		t.Fatalf("expected 0 elements, got %d", status.ElementCount)
	}
	if status.FTSEnabled != db.FTSEnabled() {
		t.Fatalf("expected FTSEnabled=%v, got %v", db.FTSEnabled(), status.FTSEnabled)
	}

	// Add some elements.
	for i := 0; i < 5; i++ {
		mgr.RetainElement(ctx, MemoryElement{
			Type:       "fact",
			Content:    "Fact number " + string(rune('0'+i)),
			Source:     "test",
			Importance: 0.5,
			Tags:       "[]",
		})
	}

	status = mgr.GetStatus()
	if status.ElementCount != 5 {
		t.Fatalf("expected 5 elements, got %d", status.ElementCount)
	}
}
