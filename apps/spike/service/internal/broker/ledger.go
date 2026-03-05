package broker

import (
	"context"
	"database/sql"
	"fmt"
)

// EnsureLedgerSchema creates the broker ledger tables used by the Go port.
//
// The migration also detects and renames legacy table names that conflict with
// the nex-style schema (sessions/messages/session_events).
func EnsureLedgerSchema(ctx context.Context, db *sql.DB) error {
	if db == nil {
		return fmt.Errorf("nil db")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := migrateLegacyLedgerTables(ctx, tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	// Ensure newly indexed columns exist on pre-existing tables before index creation.
	if err := ensureLedgerColumns(ctx, tx); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("ledger migration failed: %w", err)
	}
	for _, stmt := range ledgerSchemaStatements {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("ledger migration failed: %w", err)
		}
	}
	if err := ensureLedgerColumns(ctx, tx); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("ledger migration failed: %w", err)
	}
	return tx.Commit()
}

func migrateLegacyLedgerTables(ctx context.Context, tx *sql.Tx) error {
	if err := renameLegacyTableIfNeeded(ctx, tx, "sessions", "agent_id", "legacy_runtime_sessions"); err != nil {
		return err
	}
	if err := renameLegacyTableIfNeeded(ctx, tx, "messages", "from_id", "agent_messages"); err != nil {
		return err
	}
	if err := renameLegacyTableIfNeeded(ctx, tx, "session_events", "agent_id", "legacy_runtime_session_events"); err != nil {
		return err
	}
	return nil
}

func renameLegacyTableIfNeeded(ctx context.Context, tx *sql.Tx, tableName string, discriminatorColumn string, targetName string) error {
	exists, err := tableExists(ctx, tx, tableName)
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}
	hasColumn, err := tableHasColumn(ctx, tx, tableName, discriminatorColumn)
	if err != nil {
		return err
	}
	if !hasColumn {
		// Already migrated/new schema.
		return nil
	}
	targetExists, err := tableExists(ctx, tx, targetName)
	if err != nil {
		return err
	}
	if targetExists {
		// Keep existing migrated table intact and move conflicting table out of the way.
		targetName = targetName + "_legacy"
		legacyExists, err := tableExists(ctx, tx, targetName)
		if err != nil {
			return err
		}
		if legacyExists {
			if _, err := tx.ExecContext(ctx, `DROP TABLE `+targetName); err != nil {
				return err
			}
		}
	}
	if _, err := tx.ExecContext(ctx, `ALTER TABLE `+tableName+` RENAME TO `+targetName); err != nil {
		return err
	}
	return nil
}

func tableExists(ctx context.Context, tx *sql.Tx, tableName string) (bool, error) {
	row := tx.QueryRowContext(
		ctx,
		`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?`,
		tableName,
	)
	var count int
	if err := row.Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

func tableHasColumn(ctx context.Context, tx *sql.Tx, tableName string, columnName string) (bool, error) {
	rows, err := tx.QueryContext(ctx, `PRAGMA table_info(`+tableName+`)`)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			cid      int
			name     string
			typeName string
			notNull  int
			defaultV sql.NullString
			pk       int
		)
		if err := rows.Scan(&cid, &name, &typeName, &notNull, &defaultV, &pk); err != nil {
			return false, err
		}
		if name == columnName {
			return true, nil
		}
	}
	if err := rows.Err(); err != nil {
		return false, err
	}
	return false, nil
}

func ensureLedgerColumns(ctx context.Context, tx *sql.Tx) error {
	if err := ensureColumnExists(ctx, tx, "turns", "effective_config_json", "TEXT"); err != nil {
		return err
	}
	if err := ensureColumnExists(ctx, tx, "session_import_requests", "request_hash", "TEXT"); err != nil {
		return err
	}
	// Ensure index_id column exists on core broker tables (unified spike.db).
	for _, table := range []string{"sessions", "turns", "messages", "tool_calls"} {
		if err := ensureColumnExists(ctx, tx, table, "index_id", "TEXT NOT NULL DEFAULT ''"); err != nil {
			return err
		}
	}
	for _, table := range []string{
		"sessions",
		"turns",
		"messages",
		"tool_calls",
		"compactions",
		"session_history",
	} {
		if err := ensureColumnExists(ctx, tx, table, "scope_key", "TEXT NOT NULL DEFAULT ''"); err != nil {
			return err
		}
		if err := ensureColumnExists(ctx, tx, table, "ref_name", "TEXT NOT NULL DEFAULT ''"); err != nil {
			return err
		}
		if err := ensureColumnExists(ctx, tx, table, "commit_sha", "TEXT NOT NULL DEFAULT ''"); err != nil {
			return err
		}
		if err := ensureColumnExists(ctx, tx, table, "tree_flavor", "TEXT NOT NULL DEFAULT ''"); err != nil {
			return err
		}
		if err := ensureColumnExists(ctx, tx, table, "tree_version_id", "TEXT NOT NULL DEFAULT ''"); err != nil {
			return err
		}
	}
	return nil
}

func ensureColumnExists(ctx context.Context, tx *sql.Tx, tableName string, columnName string, columnType string) error {
	exists, err := tableExists(ctx, tx, tableName)
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}
	hasColumn, err := tableHasColumn(ctx, tx, tableName, columnName)
	if err != nil {
		return err
	}
	if hasColumn {
		return nil
	}
	_, err = tx.ExecContext(ctx, `ALTER TABLE `+tableName+` ADD COLUMN `+columnName+` `+columnType)
	return err
}

var ledgerSchemaStatements = []string{
	// Legacy agent registry (kept for backward compatibility with older callers).
	`CREATE TABLE IF NOT EXISTS agents (
		id          TEXT PRIMARY KEY,
		role        TEXT NOT NULL DEFAULT '',
		scope       TEXT NOT NULL DEFAULT '',
		parent_id   TEXT NOT NULL DEFAULT '',
		child_ids   TEXT NOT NULL DEFAULT '[]',
		status      TEXT NOT NULL DEFAULT 'created',
		error       TEXT NOT NULL DEFAULT '',
		result      TEXT NOT NULL DEFAULT '{}',
		metadata    TEXT NOT NULL DEFAULT '{}',
		created_at  TEXT NOT NULL DEFAULT '',
		started_at  TEXT NOT NULL DEFAULT '',
		finished_at TEXT NOT NULL DEFAULT '',
		last_seen   TEXT NOT NULL DEFAULT ''
	);`,

	`CREATE TABLE IF NOT EXISTS agent_messages (
		id          TEXT PRIMARY KEY,
		from_id     TEXT NOT NULL,
		to_id       TEXT NOT NULL,
		type        TEXT NOT NULL,
		payload     TEXT NOT NULL DEFAULT '{}',
		timestamp   TEXT NOT NULL,
		delivered   INTEGER NOT NULL DEFAULT 0,
		FOREIGN KEY (to_id) REFERENCES agents(id)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_agent_messages_to ON agent_messages(to_id, delivered);`,

	// Nex-style broker ledger.
	`CREATE TABLE IF NOT EXISTS turns (
		id TEXT PRIMARY KEY,
		parent_turn_id TEXT,
		turn_type TEXT NOT NULL DEFAULT 'normal',
		status TEXT NOT NULL DEFAULT 'pending',
		started_at INTEGER NOT NULL,
		completed_at INTEGER,
		model TEXT,
		provider TEXT,
		role TEXT NOT NULL DEFAULT 'unified',
		toolset_name TEXT,
		tools_available TEXT,
		permissions_granted TEXT,
		permissions_used TEXT,
		effective_config_json TEXT,
		input_tokens INTEGER,
		output_tokens INTEGER,
		cached_input_tokens INTEGER,
		cache_write_tokens INTEGER,
		reasoning_tokens INTEGER,
		total_tokens INTEGER,
		query_message_ids TEXT,
		response_message_id TEXT,
		has_children INTEGER DEFAULT 0,
		tool_call_count INTEGER DEFAULT 0,
		source_event_id TEXT,
		workspace_path TEXT,
		scope_key TEXT NOT NULL DEFAULT '',
		ref_name TEXT NOT NULL DEFAULT '',
		commit_sha TEXT NOT NULL DEFAULT '',
		tree_flavor TEXT NOT NULL DEFAULT '',
		tree_version_id TEXT NOT NULL DEFAULT '',
		FOREIGN KEY (parent_turn_id) REFERENCES turns(id)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_turns_parent ON turns(parent_turn_id);`,
	`CREATE INDEX IF NOT EXISTS idx_turns_type ON turns(turn_type);`,
	`CREATE INDEX IF NOT EXISTS idx_turns_status ON turns(status);`,
	`CREATE INDEX IF NOT EXISTS idx_turns_started ON turns(started_at DESC);`,
	`CREATE INDEX IF NOT EXISTS idx_turns_has_children ON turns(has_children);`,
	`CREATE INDEX IF NOT EXISTS idx_turns_role ON turns(role);`,
	`CREATE INDEX IF NOT EXISTS idx_turns_source_event ON turns(source_event_id);`,
	`CREATE INDEX IF NOT EXISTS idx_turns_scope_started ON turns(scope_key, started_at DESC);`,
	`CREATE INDEX IF NOT EXISTS idx_turns_scope_tree_version ON turns(scope_key, tree_version_id, started_at DESC);`,

	`CREATE TABLE IF NOT EXISTS threads (
		turn_id TEXT PRIMARY KEY,
		ancestry TEXT,
		total_tokens INTEGER,
		depth INTEGER,
		persona_id TEXT,
		system_prompt_hash TEXT,
		thread_key TEXT UNIQUE,
		FOREIGN KEY (turn_id) REFERENCES turns(id)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_threads_key ON threads(thread_key);`,
	`CREATE INDEX IF NOT EXISTS idx_threads_persona ON threads(persona_id);`,

	`CREATE TABLE IF NOT EXISTS sessions (
		label TEXT PRIMARY KEY,
		thread_id TEXT,
		persona_id TEXT NOT NULL,
		is_subagent INTEGER DEFAULT 0,
		parent_session_label TEXT,
		parent_turn_id TEXT,
		spawn_tool_call_id TEXT,
		task_description TEXT,
		task_status TEXT,
		routing_key TEXT,
		origin TEXT,
		origin_session_id TEXT,
		scope_key TEXT NOT NULL DEFAULT '',
		ref_name TEXT NOT NULL DEFAULT '',
		commit_sha TEXT NOT NULL DEFAULT '',
		tree_flavor TEXT NOT NULL DEFAULT '',
		tree_version_id TEXT NOT NULL DEFAULT '',
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		status TEXT NOT NULL DEFAULT 'active',
		FOREIGN KEY (thread_id) REFERENCES threads(turn_id),
		FOREIGN KEY (parent_turn_id) REFERENCES turns(id)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_sessions_persona ON sessions(persona_id);`,
	`CREATE INDEX IF NOT EXISTS idx_sessions_routing ON sessions(routing_key);`,
	`CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);`,
	`CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_label);`,
	`CREATE INDEX IF NOT EXISTS idx_sessions_origin ON sessions(origin);`,
	`CREATE INDEX IF NOT EXISTS idx_sessions_scope_updated ON sessions(scope_key, updated_at DESC);`,
	`CREATE INDEX IF NOT EXISTS idx_sessions_scope_ref_updated ON sessions(scope_key, ref_name, updated_at DESC);`,
	`CREATE INDEX IF NOT EXISTS idx_sessions_scope_tree_version_updated ON sessions(scope_key, tree_version_id, updated_at DESC);`,

	`CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		turn_id TEXT NOT NULL,
		role TEXT NOT NULL,
		content TEXT,
		source TEXT,
		sequence INTEGER NOT NULL,
		created_at INTEGER NOT NULL,
		thinking TEXT,
		context_json TEXT,
		metadata_json TEXT,
		scope_key TEXT NOT NULL DEFAULT '',
		ref_name TEXT NOT NULL DEFAULT '',
		commit_sha TEXT NOT NULL DEFAULT '',
		tree_flavor TEXT NOT NULL DEFAULT '',
		tree_version_id TEXT NOT NULL DEFAULT '',
		FOREIGN KEY (turn_id) REFERENCES turns(id)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_messages_turn ON messages(turn_id, sequence);`,
	`CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);`,
	`CREATE INDEX IF NOT EXISTS idx_messages_scope_created ON messages(scope_key, created_at DESC);`,

	`CREATE TABLE IF NOT EXISTS tool_calls (
		id TEXT PRIMARY KEY,
		turn_id TEXT NOT NULL,
		message_id TEXT,
		tool_name TEXT NOT NULL,
		tool_number INTEGER,
		params_json TEXT NOT NULL,
		result_json TEXT,
		error TEXT,
		status TEXT NOT NULL DEFAULT 'pending',
		spawned_session_label TEXT,
		started_at INTEGER NOT NULL,
		completed_at INTEGER,
		sequence INTEGER NOT NULL,
		scope_key TEXT NOT NULL DEFAULT '',
		ref_name TEXT NOT NULL DEFAULT '',
		commit_sha TEXT NOT NULL DEFAULT '',
		tree_flavor TEXT NOT NULL DEFAULT '',
		tree_version_id TEXT NOT NULL DEFAULT '',
		FOREIGN KEY (turn_id) REFERENCES turns(id),
		FOREIGN KEY (message_id) REFERENCES messages(id)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_tool_calls_turn ON tool_calls(turn_id, sequence);`,
	`CREATE INDEX IF NOT EXISTS idx_tool_calls_tool ON tool_calls(tool_name);`,
	`CREATE INDEX IF NOT EXISTS idx_tool_calls_message ON tool_calls(message_id);`,
	`CREATE INDEX IF NOT EXISTS idx_tool_calls_spawned ON tool_calls(spawned_session_label);`,
	`CREATE INDEX IF NOT EXISTS idx_tool_calls_scope_started ON tool_calls(scope_key, started_at DESC);`,

	`CREATE TABLE IF NOT EXISTS compactions (
		turn_id TEXT PRIMARY KEY,
		summary TEXT NOT NULL,
		summarized_through_turn_id TEXT NOT NULL,
		first_kept_turn_id TEXT,
		turns_summarized INTEGER,
		compaction_type TEXT NOT NULL DEFAULT 'summary',
		model TEXT NOT NULL,
		provider TEXT,
		tokens_before INTEGER,
		tokens_after INTEGER,
		summary_tokens INTEGER,
		summarization_input_tokens INTEGER,
		summarization_output_tokens INTEGER,
		duration_ms INTEGER,
		trigger TEXT,
		metadata_json TEXT,
		scope_key TEXT NOT NULL DEFAULT '',
		ref_name TEXT NOT NULL DEFAULT '',
		commit_sha TEXT NOT NULL DEFAULT '',
		tree_flavor TEXT NOT NULL DEFAULT '',
		tree_version_id TEXT NOT NULL DEFAULT '',
		FOREIGN KEY (turn_id) REFERENCES turns(id),
		FOREIGN KEY (summarized_through_turn_id) REFERENCES turns(id),
		FOREIGN KEY (first_kept_turn_id) REFERENCES turns(id)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_compactions_scope_turn ON compactions(scope_key, turn_id);`,

	`CREATE TABLE IF NOT EXISTS session_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_label TEXT NOT NULL,
		thread_id TEXT NOT NULL,
		changed_at INTEGER NOT NULL,
		scope_key TEXT NOT NULL DEFAULT '',
		ref_name TEXT NOT NULL DEFAULT '',
		commit_sha TEXT NOT NULL DEFAULT '',
		tree_flavor TEXT NOT NULL DEFAULT '',
		tree_version_id TEXT NOT NULL DEFAULT '',
		FOREIGN KEY (session_label) REFERENCES sessions(label),
		FOREIGN KEY (thread_id) REFERENCES threads(turn_id)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_session_history_label ON session_history(session_label, changed_at DESC);`,
	`CREATE INDEX IF NOT EXISTS idx_session_history_thread ON session_history(thread_id);`,
	`CREATE INDEX IF NOT EXISTS idx_session_history_scope_changed ON session_history(scope_key, changed_at DESC);`,

	// Hard cutover parity with nex: alias indirection removed.
	`DROP TABLE IF EXISTS session_aliases;`,

	`CREATE TABLE IF NOT EXISTS session_continuity_transfers (
		id TEXT PRIMARY KEY,
		source_session_key TEXT NOT NULL,
		target_session_key TEXT NOT NULL,
		reason TEXT NOT NULL,
		summary_turn_id TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);`,
	`CREATE INDEX IF NOT EXISTS idx_session_continuity_transfers_source ON session_continuity_transfers(source_session_key, created_at DESC);`,
	`CREATE INDEX IF NOT EXISTS idx_session_continuity_transfers_target ON session_continuity_transfers(target_session_key, created_at DESC);`,

	`CREATE TABLE IF NOT EXISTS session_imports (
		source TEXT NOT NULL,
		source_provider TEXT NOT NULL,
		source_session_id TEXT NOT NULL,
		source_session_fingerprint TEXT NOT NULL,
		session_label TEXT NOT NULL,
		imported_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		last_run_id TEXT,
		PRIMARY KEY (source, source_provider, source_session_id),
		FOREIGN KEY (session_label) REFERENCES sessions(label)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_session_imports_label ON session_imports(session_label);`,
	`CREATE INDEX IF NOT EXISTS idx_session_imports_updated ON session_imports(updated_at DESC);`,

	`CREATE TABLE IF NOT EXISTS session_import_requests (
		idempotency_key TEXT PRIMARY KEY,
		source TEXT NOT NULL,
		mode TEXT NOT NULL,
		run_id TEXT NOT NULL,
		request_hash TEXT,
		response_json TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);`,
	`CREATE INDEX IF NOT EXISTS idx_session_import_requests_created ON session_import_requests(created_at DESC);`,

	`CREATE TABLE IF NOT EXISTS session_import_chunk_parts (
		source TEXT NOT NULL,
		upload_id TEXT NOT NULL,
		chunk_index INTEGER NOT NULL,
		chunk_total INTEGER NOT NULL,
		mode TEXT NOT NULL,
		run_id TEXT NOT NULL,
		persona_id TEXT,
		idempotency_key TEXT NOT NULL,
		source_provider TEXT NOT NULL,
		source_session_id TEXT NOT NULL,
		source_session_fingerprint TEXT NOT NULL,
		encoding TEXT NOT NULL,
		payload TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		PRIMARY KEY (source, upload_id, chunk_index)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_session_import_chunk_parts_upload ON session_import_chunk_parts(source, upload_id, chunk_index);`,
	`CREATE INDEX IF NOT EXISTS idx_session_import_chunk_parts_created ON session_import_chunk_parts(created_at DESC);`,

	`CREATE TABLE IF NOT EXISTS queue_items (
		id TEXT PRIMARY KEY,
		session_label TEXT NOT NULL,
		message_json TEXT NOT NULL,
		mode TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'queued',
		enqueued_at INTEGER NOT NULL,
		started_at INTEGER,
		completed_at INTEGER,
		error TEXT,
		FOREIGN KEY (session_label) REFERENCES sessions(label)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_queue_items_session_status ON queue_items(session_label, status, enqueued_at);`,
	`CREATE INDEX IF NOT EXISTS idx_queue_items_status_enqueued ON queue_items(status, enqueued_at);`,

	`CREATE TABLE IF NOT EXISTS message_files (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		message_id TEXT NOT NULL,
		kind TEXT NOT NULL,
		file_path TEXT NOT NULL,
		line_start INTEGER,
		line_end INTEGER,
		FOREIGN KEY (message_id) REFERENCES messages(id),
		UNIQUE(message_id, kind, file_path, line_start)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_message_files_message ON message_files(message_id);`,
	`CREATE INDEX IF NOT EXISTS idx_message_files_path ON message_files(file_path);`,

	`CREATE TABLE IF NOT EXISTS message_lints (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		message_id TEXT NOT NULL,
		file_path TEXT,
		message TEXT,
		lint_source TEXT,
		start_line INTEGER,
		start_col INTEGER,
		end_line INTEGER,
		end_col INTEGER,
		severity TEXT,
		FOREIGN KEY (message_id) REFERENCES messages(id)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_message_lints_message ON message_lints(message_id);`,

	`CREATE TABLE IF NOT EXISTS message_codeblocks (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		message_id TEXT NOT NULL,
		idx INTEGER NOT NULL,
		language TEXT,
		content TEXT NOT NULL,
		file_path TEXT,
		line_start INTEGER,
		line_end INTEGER,
		FOREIGN KEY (message_id) REFERENCES messages(id),
		UNIQUE(message_id, idx)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_message_codeblocks_message ON message_codeblocks(message_id);`,

	`CREATE TABLE IF NOT EXISTS artifacts (
		id TEXT PRIMARY KEY,
		kind TEXT NOT NULL,
		storage TEXT NOT NULL DEFAULT 'fs',
		created_at INTEGER NOT NULL,
		bytes INTEGER NOT NULL,
		sha256 TEXT,
		host_path TEXT NOT NULL,
		agent_path TEXT NOT NULL,
		relative_path TEXT,
		content_type TEXT,
		encoding TEXT,
		metadata_json TEXT
	);`,
	`CREATE INDEX IF NOT EXISTS idx_artifacts_kind_created ON artifacts(kind, created_at DESC);`,
	`CREATE INDEX IF NOT EXISTS idx_artifacts_created ON artifacts(created_at DESC);`,

	`CREATE TABLE IF NOT EXISTS tool_call_artifacts (
		tool_call_id TEXT NOT NULL,
		artifact_id TEXT NOT NULL,
		kind TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		PRIMARY KEY (tool_call_id, artifact_id),
		FOREIGN KEY (tool_call_id) REFERENCES tool_calls(id),
		FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_tool_call_artifacts_tool ON tool_call_artifacts(tool_call_id, created_at DESC);`,
	`CREATE INDEX IF NOT EXISTS idx_tool_call_artifacts_artifact ON tool_call_artifacts(artifact_id, created_at DESC);`,

	`CREATE TABLE IF NOT EXISTS checkpoints (
		name TEXT PRIMARY KEY,
		session_label TEXT NOT NULL,
		entry_id TEXT,
		session_file TEXT,
		captured_at INTEGER NOT NULL,
		metadata_json TEXT,
		FOREIGN KEY (session_label) REFERENCES sessions(label)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_label);`,
}
