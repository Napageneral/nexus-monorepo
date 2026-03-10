package spikedb

import (
	"context"
	"database/sql"
	"fmt"
)

const schemaVersion = 4

func (s *Store) migrate(ctx context.Context) error {
	// Create schema_version table first
	if _, err := s.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_version (
			version INTEGER NOT NULL,
			applied_at INTEGER NOT NULL
		);
	`); err != nil {
		return fmt.Errorf("create schema_version: %w", err)
	}

	current, err := currentSchemaVersion(ctx, s.db)
	if err != nil {
		return err
	}
	if current >= schemaVersion {
		return nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, stmt := range schemaStatements {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("schema migration failed: %w\nStatement: %s", err, stmt)
		}
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO schema_version (version, applied_at) VALUES (?, strftime('%s','now'))`,
		schemaVersion); err != nil {
		return fmt.Errorf("record schema version: %w", err)
	}

	return tx.Commit()
}

func currentSchemaVersion(ctx context.Context, db *sql.DB) (int, error) {
	var v int
	err := db.QueryRowContext(ctx, `SELECT COALESCE(MAX(version), 0) FROM schema_version`).Scan(&v)
	if err != nil {
		return 0, nil // table might not exist yet on very first run
	}
	return v, nil
}

var schemaStatements = []string{
	// ── Agent Configs ──────────────────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS agent_configs (
		config_id      TEXT PRIMARY KEY,
		display_name   TEXT NOT NULL DEFAULT '',
		capacity       INTEGER NOT NULL DEFAULT 120000,
		max_children   INTEGER NOT NULL DEFAULT 12,
		max_parallel   INTEGER NOT NULL DEFAULT 4,
		hydrate_model  TEXT NOT NULL DEFAULT '',
		ask_model      TEXT NOT NULL DEFAULT '',
		created_at     INTEGER NOT NULL,
		updated_at     INTEGER NOT NULL
	);`,

	// ── GitHub Installations ───────────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS github_installations (
		installation_id INTEGER PRIMARY KEY,
		account_login   TEXT NOT NULL,
		account_type    TEXT NOT NULL,
		app_slug        TEXT NOT NULL,
		permissions_json TEXT NOT NULL DEFAULT '{}',
		suspended       INTEGER NOT NULL DEFAULT 0,
		metadata_json   TEXT NOT NULL DEFAULT '{}',
		created_at      INTEGER NOT NULL,
		updated_at      INTEGER NOT NULL
	);`,

	// ── Git Mirrors ────────────────────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS git_mirrors (
		mirror_id      TEXT PRIMARY KEY,
		remote_url     TEXT NOT NULL UNIQUE,
		mirror_path    TEXT NOT NULL,
		status         TEXT NOT NULL DEFAULT 'pending',
		last_fetched   INTEGER,
		last_error     TEXT NOT NULL DEFAULT '',
		size_bytes     INTEGER NOT NULL DEFAULT 0,
		ref_count      INTEGER NOT NULL DEFAULT 0,
		created_at     INTEGER NOT NULL,
		updated_at     INTEGER NOT NULL
	);`,

	// ── Repositories (control store compat schema) ─────────────────────────
	`CREATE TABLE IF NOT EXISTS repositories (
		repo_id        TEXT PRIMARY KEY,
		remote_url     TEXT NOT NULL,
		created_at     INTEGER NOT NULL,
		updated_at     INTEGER NOT NULL
	);`,

	// ── Repo Refs ──────────────────────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS repo_refs (
		repo_id        TEXT NOT NULL,
		ref_name       TEXT NOT NULL,
		commit_sha     TEXT NOT NULL,
		updated_at     INTEGER NOT NULL,
		PRIMARY KEY (repo_id, ref_name),
		FOREIGN KEY (repo_id) REFERENCES repositories(repo_id) ON DELETE CASCADE
	);`,
	`CREATE INDEX IF NOT EXISTS idx_repo_refs_commit ON repo_refs(commit_sha);`,

	// ── Tree Versions (control store compat — will be superseded by agent_indexes) ──
	`CREATE TABLE IF NOT EXISTS tree_versions (
		id           TEXT PRIMARY KEY,
		tree_id      TEXT NOT NULL,
		repo_id      TEXT NOT NULL,
		ref_name     TEXT NOT NULL,
		commit_sha   TEXT NOT NULL,
		root_path    TEXT NOT NULL,
		status       TEXT NOT NULL,
		last_error   TEXT NOT NULL DEFAULT '',
		created_at   INTEGER NOT NULL,
		updated_at   INTEGER NOT NULL,
		UNIQUE (tree_id, repo_id, ref_name, commit_sha),
		FOREIGN KEY (repo_id) REFERENCES repositories(repo_id) ON DELETE CASCADE
	);`,
	`CREATE INDEX IF NOT EXISTS idx_tree_versions_repo_ref_updated ON tree_versions(repo_id, ref_name, updated_at DESC);`,
	`CREATE INDEX IF NOT EXISTS idx_tree_versions_tree_updated ON tree_versions(tree_id, updated_at DESC);`,

	// ── GitHub Connector Bindings (control store compat — will be superseded by github_installations) ──
	`CREATE TABLE IF NOT EXISTS github_connector_bindings (
		tree_id       TEXT PRIMARY KEY,
		service       TEXT NOT NULL,
		account       TEXT NOT NULL,
		auth_id       TEXT NOT NULL DEFAULT 'custom',
		metadata_json TEXT NOT NULL DEFAULT '{}',
		updated_at    INTEGER NOT NULL
	);`,
	`CREATE INDEX IF NOT EXISTS idx_github_connector_bindings_updated ON github_connector_bindings(updated_at DESC);`,

	// ── Worktrees ──────────────────────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS worktrees (
		worktree_id    TEXT PRIMARY KEY,
		repo_id        TEXT NOT NULL,
		ref_name       TEXT NOT NULL DEFAULT '',
		commit_sha     TEXT NOT NULL,
		worktree_path  TEXT NOT NULL,
		status         TEXT NOT NULL DEFAULT 'pending',
		size_bytes     INTEGER NOT NULL DEFAULT 0,
		last_accessed  INTEGER NOT NULL,
		created_at     INTEGER NOT NULL,
		UNIQUE (repo_id, commit_sha),
		FOREIGN KEY (repo_id) REFERENCES repositories(repo_id) ON DELETE CASCADE
	);`,

	// ── Agent Indexes ──────────────────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS agent_indexes (
		index_id          TEXT PRIMARY KEY,
		display_name      TEXT NOT NULL DEFAULT '',
		config_id         TEXT NOT NULL DEFAULT 'default',
		worktree_id       TEXT NOT NULL DEFAULT '',
		source_path       TEXT NOT NULL DEFAULT '',
		root_node_id      TEXT NOT NULL DEFAULT '',
		status            TEXT NOT NULL DEFAULT 'pending',
		node_count        INTEGER NOT NULL DEFAULT 0,
		clean_count       INTEGER NOT NULL DEFAULT 0,
		total_tokens      INTEGER NOT NULL DEFAULT 0,
		total_files       INTEGER NOT NULL DEFAULT 0,
		last_error        TEXT NOT NULL DEFAULT '',
		previous_index_id TEXT,
		created_at        INTEGER NOT NULL,
		updated_at        INTEGER NOT NULL,
		FOREIGN KEY (config_id) REFERENCES agent_configs(config_id)
	);`,

	// ── PRLM Trees ───────────────────────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS trees (
		id          TEXT PRIMARY KEY,
		root_path   TEXT NOT NULL,
		root_id     TEXT NOT NULL,
		data        BLOB NOT NULL,
		created_at  TEXT NOT NULL,
		updated_at  TEXT NOT NULL
	);`,

	// ── PRLM History ──────────────────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS history (
		key        TEXT PRIMARY KEY,
		data       TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,

	// ── Agent Nodes (PRLM Tree Structure) ──────────────────────────────────
	`CREATE TABLE IF NOT EXISTS agent_nodes (
		index_id       TEXT NOT NULL,
		node_id        TEXT NOT NULL,
		parent_id      TEXT NOT NULL DEFAULT '',
		path           TEXT NOT NULL,
		capacity       INTEGER NOT NULL,
		status         TEXT NOT NULL DEFAULT 'created',
		staleness      TEXT NOT NULL DEFAULT 'clean',
		last_operated  INTEGER,
		error          TEXT NOT NULL DEFAULT '',
		PRIMARY KEY (index_id, node_id),
		FOREIGN KEY (index_id) REFERENCES agent_indexes(index_id) ON DELETE CASCADE
	);`,
	`CREATE INDEX IF NOT EXISTS idx_agent_nodes_parent ON agent_nodes(index_id, parent_id);`,
	`CREATE INDEX IF NOT EXISTS idx_agent_nodes_status ON agent_nodes(index_id, status);`,

	// ── Agent Node Files ───────────────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS agent_node_files (
		index_id       TEXT NOT NULL,
		node_id        TEXT NOT NULL,
		file_path      TEXT NOT NULL,
		PRIMARY KEY (index_id, node_id, file_path),
		FOREIGN KEY (index_id, node_id) REFERENCES agent_nodes(index_id, node_id) ON DELETE CASCADE
	);`,

	// ── Agent Node Bundles ─────────────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS agent_node_bundles (
		index_id       TEXT NOT NULL,
		node_id        TEXT NOT NULL,
		member_path    TEXT NOT NULL,
		PRIMARY KEY (index_id, node_id, member_path),
		FOREIGN KEY (index_id, node_id) REFERENCES agent_nodes(index_id, node_id) ON DELETE CASCADE
	);`,

	// ── Corpus Entries ─────────────────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS corpus_entries (
		index_id       TEXT NOT NULL,
		file_path      TEXT NOT NULL,
		tokens         INTEGER NOT NULL,
		hash           TEXT NOT NULL,
		PRIMARY KEY (index_id, file_path),
		FOREIGN KEY (index_id) REFERENCES agent_indexes(index_id) ON DELETE CASCADE
	);`,
	`CREATE INDEX IF NOT EXISTS idx_corpus_entries_hash ON corpus_entries(index_id, hash);`,

	// ── Ask Requests (PRLM store compat — uses tree_id for now) ───────────
	`CREATE TABLE IF NOT EXISTS ask_requests (
		request_id      TEXT PRIMARY KEY,
		tree_id         TEXT NOT NULL,
		scope_key       TEXT NOT NULL DEFAULT '',
		ref_name        TEXT NOT NULL DEFAULT '',
		commit_sha      TEXT NOT NULL DEFAULT '',
		tree_flavor     TEXT NOT NULL DEFAULT '',
		tree_version_id TEXT NOT NULL DEFAULT '',
		query_text      TEXT NOT NULL,
		status          TEXT NOT NULL,
		root_turn_id    TEXT NOT NULL DEFAULT '',
		answer_preview  TEXT NOT NULL DEFAULT '',
		error_code      TEXT NOT NULL DEFAULT '',
		error_message   TEXT NOT NULL DEFAULT '',
		created_at      INTEGER NOT NULL,
		completed_at    INTEGER
	);`,
	`CREATE INDEX IF NOT EXISTS idx_ask_requests_tree_created ON ask_requests(tree_id, created_at DESC);`,
	`CREATE INDEX IF NOT EXISTS idx_ask_requests_scope_created ON ask_requests(scope_key, created_at DESC);`,
	`CREATE INDEX IF NOT EXISTS idx_ask_requests_status_created ON ask_requests(status, created_at DESC);`,
	`CREATE TABLE IF NOT EXISTS ask_request_executions (
		request_id         TEXT NOT NULL,
		node_id            TEXT NOT NULL,
		phase              TEXT NOT NULL,
		attempt            INTEGER NOT NULL,
		origin             TEXT NOT NULL DEFAULT '',
		status             TEXT NOT NULL DEFAULT '',
		execution_backend  TEXT NOT NULL DEFAULT '',
		session_key        TEXT NOT NULL DEFAULT '',
		run_id             TEXT NOT NULL DEFAULT '',
		working_dir        TEXT NOT NULL DEFAULT '',
		answer_preview     TEXT NOT NULL DEFAULT '',
		error_message      TEXT NOT NULL DEFAULT '',
		started_at         INTEGER NOT NULL,
		completed_at       INTEGER NOT NULL,
		PRIMARY KEY (request_id, node_id, phase, attempt),
		FOREIGN KEY (request_id) REFERENCES ask_requests(request_id) ON DELETE CASCADE
	);`,
	`CREATE INDEX IF NOT EXISTS idx_ask_request_executions_request_started ON ask_request_executions(request_id, started_at DESC);`,

	// ── Jobs (control store compat — uses tree_id for now) ─────────────────
	`CREATE TABLE IF NOT EXISTS jobs (
		id             TEXT PRIMARY KEY,
		tree_id        TEXT NOT NULL,
		job_type       TEXT NOT NULL,
		status         TEXT NOT NULL,
		request_json   TEXT NOT NULL DEFAULT '{}',
		result_json    TEXT NOT NULL DEFAULT '{}',
		error          TEXT NOT NULL DEFAULT '',
		created_at     INTEGER NOT NULL,
		started_at     INTEGER,
		completed_at   INTEGER
	);`,
	`CREATE INDEX IF NOT EXISTS idx_jobs_tree_created ON jobs(tree_id, created_at DESC);`,
	`CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at DESC);`,

	// ── Webhook Deliveries ─────────────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS webhook_deliveries (
		delivery_id    TEXT PRIMARY KEY,
		event          TEXT NOT NULL,
		tree_id        TEXT NOT NULL DEFAULT '',
		payload_hash   TEXT NOT NULL,
		status         TEXT NOT NULL,
		job_ids_json   TEXT NOT NULL DEFAULT '[]',
		error          TEXT NOT NULL DEFAULT '',
		created_at     INTEGER NOT NULL,
		updated_at     INTEGER NOT NULL
	);`,
	`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);`,

	// ── Code Intelligence Snapshots ────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS code_snapshots (
		snapshot_id     TEXT PRIMARY KEY,
		repo_id         TEXT NOT NULL DEFAULT '',
		commit_sha      TEXT NOT NULL DEFAULT '',
		root_path       TEXT NOT NULL,
		status          TEXT NOT NULL DEFAULT 'pending',
		index_version   INTEGER NOT NULL DEFAULT 1,
		file_count      INTEGER NOT NULL DEFAULT 0,
		chunk_count     INTEGER NOT NULL DEFAULT 0,
		symbol_count    INTEGER NOT NULL DEFAULT 0,
		last_error      TEXT NOT NULL DEFAULT '',
		created_at      INTEGER NOT NULL,
		updated_at      INTEGER NOT NULL
	);`,
	`CREATE INDEX IF NOT EXISTS idx_code_snapshots_repo_commit ON code_snapshots(repo_id, commit_sha, updated_at DESC);`,

	// ── Code Intelligence Files ────────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS code_files (
		snapshot_id      TEXT NOT NULL,
		file_path        TEXT NOT NULL,
		language         TEXT NOT NULL DEFAULT '',
		classification   TEXT NOT NULL DEFAULT 'unknown',
		size_bytes       INTEGER NOT NULL DEFAULT 0,
		tokens           INTEGER NOT NULL DEFAULT 0,
		hash             TEXT NOT NULL DEFAULT '',
		parse_status     TEXT NOT NULL DEFAULT 'pending',
		chunk_count      INTEGER NOT NULL DEFAULT 0,
		symbol_count     INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY (snapshot_id, file_path),
		FOREIGN KEY (snapshot_id) REFERENCES code_snapshots(snapshot_id) ON DELETE CASCADE
	);`,
	`CREATE INDEX IF NOT EXISTS idx_code_files_snapshot_language ON code_files(snapshot_id, language);`,
	`CREATE INDEX IF NOT EXISTS idx_code_files_snapshot_classification ON code_files(snapshot_id, classification);`,

	// ── Code Intelligence Chunks ───────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS code_chunks (
		snapshot_id      TEXT NOT NULL,
		chunk_id         TEXT NOT NULL,
		file_path        TEXT NOT NULL,
		language         TEXT NOT NULL DEFAULT '',
		kind             TEXT NOT NULL DEFAULT 'file',
		name             TEXT NOT NULL DEFAULT '',
		start_line       INTEGER NOT NULL DEFAULT 1,
		end_line         INTEGER NOT NULL DEFAULT 1,
		content          TEXT NOT NULL DEFAULT '',
		context_json     TEXT NOT NULL DEFAULT '{}',
		PRIMARY KEY (snapshot_id, chunk_id),
		FOREIGN KEY (snapshot_id, file_path) REFERENCES code_files(snapshot_id, file_path) ON DELETE CASCADE
	);`,
	`CREATE INDEX IF NOT EXISTS idx_code_chunks_snapshot_file ON code_chunks(snapshot_id, file_path, start_line);`,
	`CREATE INDEX IF NOT EXISTS idx_code_chunks_snapshot_name ON code_chunks(snapshot_id, name);`,
	`CREATE VIRTUAL TABLE IF NOT EXISTS code_chunks_fts USING fts5(
		content,
		name,
		file_path,
		content='code_chunks',
		content_rowid='rowid'
	);`,
	`CREATE TRIGGER IF NOT EXISTS code_chunks_fts_insert AFTER INSERT ON code_chunks BEGIN
		INSERT INTO code_chunks_fts(rowid, content, name, file_path) VALUES (new.rowid, new.content, new.name, new.file_path);
	END;`,
	`CREATE TRIGGER IF NOT EXISTS code_chunks_fts_update AFTER UPDATE OF content, name, file_path ON code_chunks BEGIN
		UPDATE code_chunks_fts SET content = new.content, name = new.name, file_path = new.file_path WHERE rowid = new.rowid;
	END;`,
	`CREATE TRIGGER IF NOT EXISTS code_chunks_fts_delete AFTER DELETE ON code_chunks BEGIN
		DELETE FROM code_chunks_fts WHERE rowid = old.rowid;
	END;`,

	// ── Code Intelligence Symbols ──────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS code_symbols (
		snapshot_id      TEXT NOT NULL,
		symbol_id        TEXT NOT NULL,
		name             TEXT NOT NULL,
		qualified_name   TEXT NOT NULL DEFAULT '',
		kind             TEXT NOT NULL DEFAULT '',
		language         TEXT NOT NULL DEFAULT '',
		file_path        TEXT NOT NULL,
		start_line       INTEGER NOT NULL DEFAULT 1,
		end_line         INTEGER NOT NULL DEFAULT 1,
		chunk_id         TEXT NOT NULL DEFAULT '',
		PRIMARY KEY (snapshot_id, symbol_id),
		FOREIGN KEY (snapshot_id, chunk_id) REFERENCES code_chunks(snapshot_id, chunk_id) ON DELETE CASCADE
	);`,
	`CREATE INDEX IF NOT EXISTS idx_code_symbols_snapshot_name ON code_symbols(snapshot_id, name);`,
	`CREATE INDEX IF NOT EXISTS idx_code_symbols_snapshot_qualified ON code_symbols(snapshot_id, qualified_name);`,
	`CREATE INDEX IF NOT EXISTS idx_code_symbols_snapshot_file ON code_symbols(snapshot_id, file_path);`,

	// ── Code Intelligence Imports ──────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS code_imports (
		snapshot_id      TEXT NOT NULL,
		file_path        TEXT NOT NULL,
		language         TEXT NOT NULL DEFAULT '',
		import_path      TEXT NOT NULL,
		import_kind      TEXT NOT NULL DEFAULT 'import',
		PRIMARY KEY (snapshot_id, file_path, import_path),
		FOREIGN KEY (snapshot_id, file_path) REFERENCES code_files(snapshot_id, file_path) ON DELETE CASCADE
	);`,
	`CREATE INDEX IF NOT EXISTS idx_code_imports_snapshot_target ON code_imports(snapshot_id, import_path);`,

	// ── Code Intelligence Capabilities ─────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS code_capabilities (
		snapshot_id      TEXT NOT NULL,
		language         TEXT NOT NULL DEFAULT '',
		capability       TEXT NOT NULL,
		status           TEXT NOT NULL DEFAULT 'unsupported',
		backend          TEXT NOT NULL DEFAULT '',
		details_json     TEXT NOT NULL DEFAULT '{}',
		PRIMARY KEY (snapshot_id, language, capability),
		FOREIGN KEY (snapshot_id) REFERENCES code_snapshots(snapshot_id) ON DELETE CASCADE
	);`,
	`CREATE INDEX IF NOT EXISTS idx_code_capabilities_snapshot_status ON code_capabilities(snapshot_id, status);`,

	// ── Code Intelligence References ───────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS code_references (
		snapshot_id      TEXT NOT NULL,
		symbol_name      TEXT NOT NULL,
		language         TEXT NOT NULL DEFAULT '',
		file_path        TEXT NOT NULL,
		chunk_id         TEXT NOT NULL DEFAULT '',
		start_line       INTEGER NOT NULL DEFAULT 1,
		end_line         INTEGER NOT NULL DEFAULT 1,
		reference_kind   TEXT NOT NULL DEFAULT 'identifier',
		symbol_id        TEXT NOT NULL DEFAULT '',
		qualified_name   TEXT NOT NULL DEFAULT '',
		PRIMARY KEY (snapshot_id, symbol_name, file_path, start_line, end_line, reference_kind),
		FOREIGN KEY (snapshot_id, chunk_id) REFERENCES code_chunks(snapshot_id, chunk_id) ON DELETE CASCADE
	);`,
	`CREATE INDEX IF NOT EXISTS idx_code_references_snapshot_symbol ON code_references(snapshot_id, symbol_name);`,
	`CREATE INDEX IF NOT EXISTS idx_code_references_snapshot_symbol_id ON code_references(snapshot_id, symbol_id);`,
	`CREATE INDEX IF NOT EXISTS idx_code_references_snapshot_file ON code_references(snapshot_id, file_path, start_line);`,

	// ── Code Intelligence Calls ────────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS code_calls (
		snapshot_id              TEXT NOT NULL,
		language                 TEXT NOT NULL DEFAULT '',
		caller_symbol_id         TEXT NOT NULL DEFAULT '',
		caller_name              TEXT NOT NULL DEFAULT '',
		caller_qualified_name    TEXT NOT NULL DEFAULT '',
		caller_file_path         TEXT NOT NULL,
		caller_chunk_id          TEXT NOT NULL DEFAULT '',
		callee_symbol_id         TEXT NOT NULL DEFAULT '',
		callee_name              TEXT NOT NULL,
		callee_qualified_name    TEXT NOT NULL DEFAULT '',
		line                     INTEGER NOT NULL DEFAULT 1,
		call_kind                TEXT NOT NULL DEFAULT 'call',
		PRIMARY KEY (snapshot_id, caller_file_path, caller_chunk_id, callee_name, line, call_kind),
		FOREIGN KEY (snapshot_id, caller_chunk_id) REFERENCES code_chunks(snapshot_id, chunk_id) ON DELETE CASCADE
	);`,
	`CREATE INDEX IF NOT EXISTS idx_code_calls_snapshot_callee_name ON code_calls(snapshot_id, callee_name);`,
	`CREATE INDEX IF NOT EXISTS idx_code_calls_snapshot_callee_id ON code_calls(snapshot_id, callee_symbol_id);`,
	`CREATE INDEX IF NOT EXISTS idx_code_calls_snapshot_caller_id ON code_calls(snapshot_id, caller_symbol_id);`,

	// Broker-managed tables (threads, sessions, compactions, agents, etc.)
	// are NOT defined here — the broker's own ledger migration creates them
	// via broker.EnsureLedgerSchema() when BrokerForTree() is called.
}
