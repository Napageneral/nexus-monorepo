package spikedb

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

func TestOpenCreatesDB(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "spike.db")
	store, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer store.Close()

	// Verify WAL mode
	var journalMode string
	if err := store.DB().QueryRow("PRAGMA journal_mode").Scan(&journalMode); err != nil {
		t.Fatalf("PRAGMA journal_mode: %v", err)
	}
	if journalMode != "wal" {
		t.Fatalf("expected WAL mode, got %q", journalMode)
	}
}

func TestSchemaVersionTracked(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(filepath.Join(dir, "spike.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer store.Close()

	var version int
	if err := store.DB().QueryRow("SELECT MAX(version) FROM schema_version").Scan(&version); err != nil {
		t.Fatalf("query schema_version: %v", err)
	}
	if version != schemaVersion {
		t.Fatalf("expected schema version %d, got %d", schemaVersion, version)
	}
}

func TestDefaultAgentConfigSeeded(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(filepath.Join(dir, "spike.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer store.Close()

	cfg, err := store.GetDefaultConfig(context.Background())
	if err != nil {
		t.Fatalf("GetDefaultConfig: %v", err)
	}
	if cfg.ConfigID != "default" {
		t.Fatalf("expected config_id='default', got %q", cfg.ConfigID)
	}
	if cfg.Capacity != 120000 || cfg.MaxChildren != 12 || cfg.MaxParallel != 4 {
		t.Fatalf("unexpected defaults: capacity=%d, max_children=%d, max_parallel=%d",
			cfg.Capacity, cfg.MaxChildren, cfg.MaxParallel)
	}
}

func TestAllControlPlaneTablesExist(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(filepath.Join(dir, "spike.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer store.Close()

	requiredTables := []string{
		"schema_version",
		"agent_configs",
		"github_installations",
		"git_mirrors",
		"repositories",
		"repo_refs",
		"tree_versions",
		"github_connector_bindings",
		"worktrees",
		"agent_indexes",
		"trees",
		"history",
		"agent_nodes",
		"agent_node_files",
		"agent_node_bundles",
		"corpus_entries",
		"code_snapshots",
		"code_files",
		"code_chunks",
		"code_chunks_fts",
		"code_symbols",
		"code_imports",
		"code_capabilities",
		"code_references",
		"code_calls",
		"ask_requests",
		"ask_request_executions",
		"jobs",
		"webhook_deliveries",
		// Broker-managed tables (threads, sessions, compactions, agents, etc.)
		// are created by the broker's own ledger migration, not by spikedb.
	}

	for _, table := range requiredTables {
		var name string
		err := store.DB().QueryRow(
			"SELECT name FROM sqlite_master WHERE type='table' AND name=?", table,
		).Scan(&name)
		if err == sql.ErrNoRows {
			t.Errorf("table %q does not exist", table)
		} else if err != nil {
			t.Errorf("check table %q: %v", table, err)
		}
	}
}

func TestUpsertConfig(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(filepath.Join(dir, "spike.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer store.Close()

	ctx := context.Background()
	err = store.UpsertConfig(ctx, AgentConfig{
		ConfigID:    "custom",
		DisplayName: "Custom Config",
		Capacity:    60000,
		MaxChildren: 8,
		MaxParallel: 2,
	})
	if err != nil {
		t.Fatalf("UpsertConfig: %v", err)
	}

	cfg, err := store.GetConfig(ctx, "custom")
	if err != nil {
		t.Fatalf("GetConfig: %v", err)
	}
	if cfg.Capacity != 60000 || cfg.MaxChildren != 8 || cfg.MaxParallel != 2 {
		t.Fatalf("unexpected values: %+v", cfg)
	}

	configs, err := store.ListConfigs(ctx)
	if err != nil {
		t.Fatalf("ListConfigs: %v", err)
	}
	if len(configs) != 2 { // default + custom
		t.Fatalf("expected 2 configs, got %d", len(configs))
	}
}

func TestIdempotentOpen(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "spike.db")

	// Open twice — should not fail
	store1, err := Open(dbPath)
	if err != nil {
		t.Fatalf("first Open: %v", err)
	}
	store1.Close()

	store2, err := Open(dbPath)
	if err != nil {
		t.Fatalf("second Open: %v", err)
	}
	defer store2.Close()

	// Default config should still be there
	cfg, err := store2.GetDefaultConfig(context.Background())
	if err != nil {
		t.Fatalf("GetDefaultConfig after reopen: %v", err)
	}
	if cfg.ConfigID != "default" {
		t.Fatalf("expected default config after reopen")
	}
}
