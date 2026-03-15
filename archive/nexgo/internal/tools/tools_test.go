//go:build fts5 || sqlite_fts5

package tools

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Napageneral/nexus/internal/config"
	"github.com/Napageneral/nexus/internal/db"
	gcatypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"
	_ "github.com/mattn/go-sqlite3"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// openTestMemoryDB creates a temporary SQLite database with the memory schema
// (including FTS5) and returns the connection. The database file is placed in
// a temporary directory that is cleaned up when the test completes.
func openTestMemoryDB(t *testing.T) *sql.DB {
	t.Helper()

	dir := t.TempDir()
	dbPath := filepath.Join(dir, "memory.db")
	dsn := dbPath + "?_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=ON"

	sqlDB, err := sql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { sqlDB.Close() })

	// Bootstrap the elements table schema (matches internal/db/schemas.go schemaMemory).
	const elementsSchema = `
CREATE TABLE IF NOT EXISTS elements (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'observation',
    subtype TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    source_event_id TEXT NOT NULL DEFAULT '',
    source_session_id TEXT NOT NULL DEFAULT '',
    confidence REAL NOT NULL DEFAULT 1.0,
    importance REAL NOT NULL DEFAULT 0.5,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at INTEGER,
    decay_rate REAL NOT NULL DEFAULT 0.01,
    entity_ids TEXT NOT NULL DEFAULT '[]',
    tags TEXT NOT NULL DEFAULT '[]',
    metadata TEXT NOT NULL DEFAULT '{}',
    superseded_by TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
);
CREATE INDEX IF NOT EXISTS idx_elements_type ON elements(type);
CREATE INDEX IF NOT EXISTS idx_elements_status ON elements(status);
CREATE INDEX IF NOT EXISTS idx_elements_importance ON elements(importance);
`

	if _, err := sqlDB.Exec(elementsSchema); err != nil {
		t.Fatalf("bootstrap elements schema: %v", err)
	}

	// Bootstrap FTS5 for full-text search.
	const ftsSchema = `
CREATE VIRTUAL TABLE IF NOT EXISTS elements_fts USING fts5(
    content,
    summary,
    content='elements',
    content_rowid='rowid',
    tokenize='porter'
);

CREATE TRIGGER IF NOT EXISTS elements_ai AFTER INSERT ON elements BEGIN
    INSERT INTO elements_fts(rowid, content, summary)
    VALUES (new.rowid, new.content, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS elements_ad AFTER DELETE ON elements BEGIN
    INSERT INTO elements_fts(elements_fts, rowid, content, summary)
    VALUES ('delete', old.rowid, old.content, old.summary);
END;

CREATE TRIGGER IF NOT EXISTS elements_au AFTER UPDATE ON elements BEGIN
    INSERT INTO elements_fts(elements_fts, rowid, content, summary)
    VALUES ('delete', old.rowid, old.content, old.summary);
    INSERT INTO elements_fts(rowid, content, summary)
    VALUES (new.rowid, new.content, new.summary);
END;
`

	if _, err := sqlDB.Exec(ftsSchema); err != nil {
		t.Fatalf("bootstrap FTS schema: %v", err)
	}

	return sqlDB
}

// insertTestElement inserts a memory element into the test database.
func insertTestElement(t *testing.T, sqlDB *sql.DB, id, elemType, content, summary string, importance float64) {
	t.Helper()
	const q = `INSERT INTO elements (id, type, content, summary, importance, status)
		VALUES (?, ?, ?, ?, ?, 'active')`
	if _, err := sqlDB.Exec(q, id, elemType, content, summary, importance); err != nil {
		t.Fatalf("insert test element: %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestBuildNexusTools
// ---------------------------------------------------------------------------

func TestBuildNexusTools(t *testing.T) {
	// With nil Ledgers, only non-memory tools should be returned.
	tools := BuildNexusTools(ToolContext{
		Config:   &config.Config{},
		StateDir: t.TempDir(),
	})

	// Should have: web_search, web_fetch, nexus_exec (no memory tools without DB).
	if len(tools) != 3 {
		t.Fatalf("expected 3 tools with nil Ledgers, got %d", len(tools))
	}

	names := make(map[string]bool)
	for _, tool := range tools {
		names[tool.Definition().Name] = true
	}
	for _, expected := range []string{"web_search", "web_fetch", "nexus_exec"} {
		if !names[expected] {
			t.Errorf("expected tool %q not found in build results", expected)
		}
	}
}

func TestBuildNexusToolsWithLedgers(t *testing.T) {
	// Open real ledgers to test full tool set.
	dir := t.TempDir()
	ledgers, err := db.OpenLedgers(dir)
	if err != nil {
		t.Fatalf("open ledgers: %v", err)
	}
	t.Cleanup(func() { ledgers.Close() })

	tools := BuildNexusTools(ToolContext{
		Ledgers:  ledgers,
		Config:   &config.Config{},
		StateDir: t.TempDir(),
	})

	// Should have: cortex_recall, cortex_remember, cortex_forget, web_search, web_fetch, nexus_exec.
	if len(tools) != 6 {
		t.Fatalf("expected 6 tools with Ledgers, got %d", len(tools))
	}

	names := make(map[string]bool)
	for _, tool := range tools {
		names[tool.Definition().Name] = true
	}
	for _, expected := range []string{"cortex_recall", "cortex_remember", "cortex_forget", "web_search", "web_fetch", "nexus_exec"} {
		if !names[expected] {
			t.Errorf("expected tool %q not found in build results", expected)
		}
	}
}

// ---------------------------------------------------------------------------
// TestCortexRecallTool
// ---------------------------------------------------------------------------

func TestCortexRecallTool(t *testing.T) {
	sqlDB := openTestMemoryDB(t)

	// Insert test data.
	insertTestElement(t, sqlDB, "elem-1", "fact", "Go is a compiled programming language", "Go language fact", 0.8)
	insertTestElement(t, sqlDB, "elem-2", "preference", "Tyler prefers dark mode", "UI preference", 0.6)
	insertTestElement(t, sqlDB, "elem-3", "observation", "The sky is blue on clear days", "Weather observation", 0.4)

	tool := &CortexRecallTool{db: sqlDB}

	ctx := context.Background()

	t.Run("search with results", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-1", map[string]any{
			"query": "programming language",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.IsError {
			t.Fatalf("unexpected tool error: %s", result.Content[0].Text)
		}
		if !strings.Contains(result.Content[0].Text, "Go is a compiled") {
			t.Errorf("expected result to contain Go fact, got: %s", result.Content[0].Text)
		}
	})

	t.Run("search with no results", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-2", map[string]any{
			"query": "xyznonexistent123",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.IsError {
			t.Fatalf("unexpected tool error: %s", result.Content[0].Text)
		}
		if !strings.Contains(result.Content[0].Text, "No memories found") {
			t.Errorf("expected no-results message, got: %s", result.Content[0].Text)
		}
	})

	t.Run("missing query", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-3", map[string]any{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for missing query")
		}
	})

	t.Run("limit parameter", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-4", map[string]any{
			"query": "the",
			"limit": float64(1),
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.IsError {
			t.Fatalf("unexpected tool error: %s", result.Content[0].Text)
		}
		if !strings.Contains(result.Content[0].Text, "1 memory element") {
			t.Errorf("expected 1 result with limit, got: %s", result.Content[0].Text)
		}
	})
}

// ---------------------------------------------------------------------------
// TestCortexRememberTool
// ---------------------------------------------------------------------------

func TestCortexRememberTool(t *testing.T) {
	sqlDB := openTestMemoryDB(t)
	tool := &CortexRememberTool{db: sqlDB}
	ctx := context.Background()

	t.Run("store basic memory", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-1", map[string]any{
			"content": "Tyler's favorite color is blue",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.IsError {
			t.Fatalf("unexpected tool error: %s", result.Content[0].Text)
		}
		if !strings.Contains(result.Content[0].Text, "Memory stored successfully") {
			t.Errorf("expected success message, got: %s", result.Content[0].Text)
		}

		// Verify it's in the database.
		var count int
		err = sqlDB.QueryRow("SELECT COUNT(*) FROM elements WHERE content = ?", "Tyler's favorite color is blue").Scan(&count)
		if err != nil {
			t.Fatalf("query failed: %v", err)
		}
		if count != 1 {
			t.Errorf("expected 1 element in DB, got %d", count)
		}
	})

	t.Run("store with type and importance", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-2", map[string]any{
			"content":    "Always respond in a formal tone",
			"type":       "instruction",
			"importance": float64(0.9),
			"tags":       "style,tone",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.IsError {
			t.Fatalf("unexpected tool error: %s", result.Content[0].Text)
		}

		// Verify type and importance.
		var elemType string
		var importance float64
		var tags string
		err = sqlDB.QueryRow("SELECT type, importance, tags FROM elements WHERE content = ?", "Always respond in a formal tone").Scan(&elemType, &importance, &tags)
		if err != nil {
			t.Fatalf("query failed: %v", err)
		}
		if elemType != "instruction" {
			t.Errorf("expected type 'instruction', got %q", elemType)
		}
		if importance != 0.9 {
			t.Errorf("expected importance 0.9, got %f", importance)
		}
		if !strings.Contains(tags, "style") {
			t.Errorf("expected tags to contain 'style', got %q", tags)
		}
	})

	t.Run("missing content", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-3", map[string]any{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for missing content")
		}
	})
}

// ---------------------------------------------------------------------------
// TestCortexForgetTool
// ---------------------------------------------------------------------------

func TestCortexForgetTool(t *testing.T) {
	sqlDB := openTestMemoryDB(t)
	insertTestElement(t, sqlDB, "forget-1", "fact", "outdated info", "", 0.5)

	tool := &CortexForgetTool{db: sqlDB}
	ctx := context.Background()

	t.Run("forget existing element", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-1", map[string]any{
			"id": "forget-1",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.IsError {
			t.Fatalf("unexpected tool error: %s", result.Content[0].Text)
		}
		if !strings.Contains(result.Content[0].Text, "has been forgotten") {
			t.Errorf("expected forget confirmation, got: %s", result.Content[0].Text)
		}

		// Verify status is now 'deleted'.
		var status string
		err = sqlDB.QueryRow("SELECT status FROM elements WHERE id = ?", "forget-1").Scan(&status)
		if err != nil {
			t.Fatalf("query failed: %v", err)
		}
		if status != "deleted" {
			t.Errorf("expected status 'deleted', got %q", status)
		}
	})

	t.Run("forget nonexistent element", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-2", map[string]any{
			"id": "nonexistent-id",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for nonexistent element")
		}
	})

	t.Run("missing id", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-3", map[string]any{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for missing id")
		}
	})
}

// ---------------------------------------------------------------------------
// TestWebSearchTool
// ---------------------------------------------------------------------------

func TestWebSearchTool(t *testing.T) {
	tool := &WebSearchTool{config: &config.Config{}}
	ctx := context.Background()

	result, err := tool.Execute(ctx, "call-1", map[string]any{
		"query": "test search",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.IsError {
		t.Error("expected error result from stub web search")
	}
	if !strings.Contains(result.Content[0].Text, "not configured") {
		t.Errorf("expected 'not configured' message, got: %s", result.Content[0].Text)
	}
}

// ---------------------------------------------------------------------------
// TestWebFetchTool
// ---------------------------------------------------------------------------

func TestWebFetchTool(t *testing.T) {
	t.Run("fetch plain text", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/plain")
			fmt.Fprint(w, "Hello, Nexus!")
		}))
		defer srv.Close()

		tool := &WebFetchTool{
			config:     &config.Config{},
			httpClient: srv.Client(),
		}
		ctx := context.Background()

		result, err := tool.Execute(ctx, "call-1", map[string]any{
			"url": srv.URL,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.IsError {
			t.Fatalf("unexpected tool error: %s", result.Content[0].Text)
		}
		if result.Content[0].Text != "Hello, Nexus!" {
			t.Errorf("expected 'Hello, Nexus!', got: %q", result.Content[0].Text)
		}
	})

	t.Run("fetch and strip HTML", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			fmt.Fprint(w, "<html><body><h1>Title</h1><p>Content here</p></body></html>")
		}))
		defer srv.Close()

		tool := &WebFetchTool{
			config:     &config.Config{},
			httpClient: srv.Client(),
		}
		ctx := context.Background()

		result, err := tool.Execute(ctx, "call-2", map[string]any{
			"url": srv.URL,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.IsError {
			t.Fatalf("unexpected tool error: %s", result.Content[0].Text)
		}
		// Should not contain HTML tags.
		if strings.Contains(result.Content[0].Text, "<h1>") {
			t.Error("HTML tags should be stripped")
		}
		if !strings.Contains(result.Content[0].Text, "Title") {
			t.Error("expected stripped content to contain 'Title'")
		}
		if !strings.Contains(result.Content[0].Text, "Content here") {
			t.Error("expected stripped content to contain 'Content here'")
		}
	})

	t.Run("fetch with raw mode", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			fmt.Fprint(w, "<p>raw</p>")
		}))
		defer srv.Close()

		tool := &WebFetchTool{
			config:     &config.Config{},
			httpClient: srv.Client(),
		}
		ctx := context.Background()

		result, err := tool.Execute(ctx, "call-3", map[string]any{
			"url": srv.URL,
			"raw": true,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.Contains(result.Content[0].Text, "<p>raw</p>") {
			t.Errorf("raw mode should preserve HTML, got: %q", result.Content[0].Text)
		}
	})

	t.Run("fetch 404", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
		}))
		defer srv.Close()

		tool := &WebFetchTool{
			config:     &config.Config{},
			httpClient: srv.Client(),
		}
		ctx := context.Background()

		result, err := tool.Execute(ctx, "call-4", map[string]any{
			"url": srv.URL,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error result for 404")
		}
	})

	t.Run("missing url", func(t *testing.T) {
		tool := &WebFetchTool{config: &config.Config{}}
		ctx := context.Background()

		result, err := tool.Execute(ctx, "call-5", map[string]any{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for missing url")
		}
	})

	t.Run("invalid scheme", func(t *testing.T) {
		tool := &WebFetchTool{config: &config.Config{}}
		ctx := context.Background()

		result, err := tool.Execute(ctx, "call-6", map[string]any{
			"url": "ftp://example.com",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for ftp:// scheme")
		}
	})
}

// ---------------------------------------------------------------------------
// TestExecTool
// ---------------------------------------------------------------------------

func TestExecTool(t *testing.T) {
	stateDir := t.TempDir()

	tool := &ExecTool{
		stateDir: stateDir,
		config:   &config.Config{},
	}
	ctx := context.Background()

	t.Run("echo command", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-1", map[string]any{
			"command": "echo hello world",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.IsError {
			t.Fatalf("unexpected tool error: %s", result.Content[0].Text)
		}
		if !strings.Contains(result.Content[0].Text, "hello world") {
			t.Errorf("expected 'hello world' in output, got: %q", result.Content[0].Text)
		}
		if result.Details["exit_code"] != 0 {
			t.Errorf("expected exit code 0, got: %v", result.Details["exit_code"])
		}
	})

	t.Run("ls command", func(t *testing.T) {
		// Create a test file in the state directory.
		testFile := filepath.Join(stateDir, "testfile.txt")
		if err := os.WriteFile(testFile, []byte("test"), 0o644); err != nil {
			t.Fatalf("create test file: %v", err)
		}

		result, err := tool.Execute(ctx, "call-2", map[string]any{
			"command": "ls",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.IsError {
			t.Fatalf("unexpected tool error: %s", result.Content[0].Text)
		}
		if !strings.Contains(result.Content[0].Text, "testfile.txt") {
			t.Errorf("expected 'testfile.txt' in ls output, got: %q", result.Content[0].Text)
		}
	})

	t.Run("failing command", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-3", map[string]any{
			"command": "exit 42",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error result for failing command")
		}
		if result.Details["exit_code"] != 42 {
			t.Errorf("expected exit code 42, got: %v", result.Details["exit_code"])
		}
	})

	t.Run("path outside workspace", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-4", map[string]any{
			"command": "echo test",
			"workdir": "/tmp",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for path outside workspace")
		}
		if !strings.Contains(result.Content[0].Text, "not allowed") {
			t.Errorf("expected path-not-allowed message, got: %s", result.Content[0].Text)
		}
	})

	t.Run("missing command", func(t *testing.T) {
		result, err := tool.Execute(ctx, "call-5", map[string]any{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for missing command")
		}
	})

	t.Run("no sandbox allows all paths", func(t *testing.T) {
		unsandboxedTool := &ExecTool{
			stateDir: "", // no sandbox
			config:   &config.Config{},
		}
		result, err := unsandboxedTool.Execute(ctx, "call-6", map[string]any{
			"command": "echo free",
			"workdir": "/tmp",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.IsError {
			t.Errorf("expected success with no sandbox, got error: %s", result.Content[0].Text)
		}
	})
}

// ---------------------------------------------------------------------------
// TestToolRegistration
// ---------------------------------------------------------------------------

func TestToolRegistration(t *testing.T) {
	// Verify all tools implement ToolExecutor interface.
	sqlDB := openTestMemoryDB(t)

	var executors []gcatypes.ToolExecutor
	executors = append(executors,
		&CortexRecallTool{db: sqlDB},
		&CortexRememberTool{db: sqlDB},
		&CortexForgetTool{db: sqlDB},
		&WebSearchTool{config: &config.Config{}},
		&WebFetchTool{config: &config.Config{}},
		&ExecTool{stateDir: t.TempDir(), config: &config.Config{}},
	)

	expectedNames := []string{
		"cortex_recall",
		"cortex_remember",
		"cortex_forget",
		"web_search",
		"web_fetch",
		"nexus_exec",
	}

	if len(executors) != len(expectedNames) {
		t.Fatalf("expected %d executors, got %d", len(expectedNames), len(executors))
	}

	for i, executor := range executors {
		def := executor.Definition()

		// Verify the tool name matches.
		if def.Name != expectedNames[i] {
			t.Errorf("tool %d: expected name %q, got %q", i, expectedNames[i], def.Name)
		}

		// Verify description is not empty.
		if def.Description == "" {
			t.Errorf("tool %q: description should not be empty", def.Name)
		}

		// Verify parameters are defined.
		if def.Parameters == nil {
			t.Errorf("tool %q: parameters should not be nil", def.Name)
		}
	}
}

// ---------------------------------------------------------------------------
// TestMessageTool
// ---------------------------------------------------------------------------

func TestMessageTool(t *testing.T) {
	ctx := context.Background()

	t.Run("send message", func(t *testing.T) {
		var sentAdapter string
		var sentReq DeliveryRequest
		tool := NewMessageTool(func(adapterID string, req DeliveryRequest) error {
			sentAdapter = adapterID
			sentReq = req
			return nil
		})

		result, err := tool.Execute(ctx, "call-1", map[string]any{
			"adapter_id": "discord",
			"channel_id": "chan-123",
			"content":    "hello world",
			"reply_to":   "msg-456",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.IsError {
			t.Fatalf("unexpected tool error: %s", result.Content[0].Text)
		}
		if sentAdapter != "discord" {
			t.Errorf("adapter = %q, want 'discord'", sentAdapter)
		}
		if sentReq.ChannelID != "chan-123" {
			t.Errorf("channel = %q, want 'chan-123'", sentReq.ChannelID)
		}
		if sentReq.Content != "hello world" {
			t.Errorf("content = %q, want 'hello world'", sentReq.Content)
		}
		if sentReq.ReplyTo != "msg-456" {
			t.Errorf("reply_to = %q, want 'msg-456'", sentReq.ReplyTo)
		}
	})

	t.Run("delivery error", func(t *testing.T) {
		tool := NewMessageTool(func(adapterID string, req DeliveryRequest) error {
			return fmt.Errorf("adapter offline")
		})

		result, err := tool.Execute(ctx, "call-2", map[string]any{
			"adapter_id": "slack",
			"channel_id": "ch-1",
			"content":    "test",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for delivery failure")
		}
		if !strings.Contains(result.Content[0].Text, "adapter offline") {
			t.Errorf("expected error message, got: %s", result.Content[0].Text)
		}
	})

	t.Run("nil delivery function", func(t *testing.T) {
		tool := NewMessageTool(nil)
		result, err := tool.Execute(ctx, "call-3", map[string]any{
			"adapter_id": "x",
			"channel_id": "y",
			"content":    "z",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for nil delivery function")
		}
	})

	t.Run("missing required fields", func(t *testing.T) {
		tool := NewMessageTool(nil)

		result, err := tool.Execute(ctx, "call-4", map[string]any{
			"channel_id": "y",
			"content":    "z",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.IsError {
			t.Error("expected error for missing adapter_id")
		}
	})
}

// ---------------------------------------------------------------------------
// TestRuntimeStatusTool
// ---------------------------------------------------------------------------

func TestRuntimeStatusTool(t *testing.T) {
	tool := NewRuntimeStatusTool()
	ctx := context.Background()

	result, err := tool.Execute(ctx, "call-1", map[string]any{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.IsError {
		t.Fatalf("unexpected tool error: %s", result.Content[0].Text)
	}
	if !strings.Contains(result.Content[0].Text, "Runtime Status") {
		t.Errorf("expected runtime status output, got: %s", result.Content[0].Text)
	}
	if !strings.Contains(result.Content[0].Text, "Go version") {
		t.Errorf("expected Go version in output, got: %s", result.Content[0].Text)
	}
	if result.Details == nil || result.Details["goroutines"] == nil {
		t.Error("expected goroutines in details")
	}
}

// ---------------------------------------------------------------------------
// TestBrowserToolStub
// ---------------------------------------------------------------------------

func TestBrowserToolStub(t *testing.T) {
	tool := NewBrowserTool("http://localhost:18791")
	ctx := context.Background()

	result, err := tool.Execute(ctx, "call-1", map[string]any{
		"action": "navigate",
		"url":    "https://example.com",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.IsError {
		t.Error("expected error from browser stub")
	}
	if !strings.Contains(result.Content[0].Text, "not yet implemented") {
		t.Errorf("expected not-implemented message, got: %s", result.Content[0].Text)
	}
}

// ---------------------------------------------------------------------------
// TestCanvasToolStub
// ---------------------------------------------------------------------------

func TestCanvasToolStub(t *testing.T) {
	tool := NewCanvasTool()
	ctx := context.Background()

	result, err := tool.Execute(ctx, "call-1", map[string]any{
		"type":    "card",
		"content": "test content",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.IsError {
		t.Error("expected error from canvas stub")
	}
	if !strings.Contains(result.Content[0].Text, "not yet implemented") {
		t.Errorf("expected not-implemented message, got: %s", result.Content[0].Text)
	}
}

// ---------------------------------------------------------------------------
// TestNewToolsRegistration - verify all new tools implement ToolExecutor
// ---------------------------------------------------------------------------

func TestNewToolsRegistration(t *testing.T) {
	var executors []gcatypes.ToolExecutor
	executors = append(executors,
		NewAgentSendTool(nil, "test"),
		NewAgentStatusTool(nil),
		NewWaitForAgentTool(nil),
		NewMessageTool(nil),
		NewSessionListTool(nil),
		NewSessionHistoryTool(nil),
		NewRuntimeStatusTool(),
		NewCronScheduleTool(nil),
		NewBrowserTool(""),
		NewCanvasTool(),
	)

	expectedNames := []string{
		"agent_send",
		"agent_status",
		"agent_wait",
		"message_send",
		"session_list",
		"session_history",
		"runtime_status",
		"cron_schedule",
		"browser",
		"canvas",
	}

	if len(executors) != len(expectedNames) {
		t.Fatalf("expected %d executors, got %d", len(expectedNames), len(executors))
	}

	for i, executor := range executors {
		def := executor.Definition()
		if def.Name != expectedNames[i] {
			t.Errorf("tool %d: expected name %q, got %q", i, expectedNames[i], def.Name)
		}
		if def.Description == "" {
			t.Errorf("tool %q: description should not be empty", def.Name)
		}
		if def.Parameters == nil {
			t.Errorf("tool %q: parameters should not be nil", def.Name)
		}
	}
}
