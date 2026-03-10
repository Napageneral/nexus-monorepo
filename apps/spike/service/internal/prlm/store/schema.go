package store

import (
	"context"
	"database/sql"
	"fmt"
)

// RunMigrations ensures the PRLM Oracle SQLite schema exists.
//
// This schema is intentionally "blob-first": the PRLM Tree is stored as a JSON
// blob in the trees table. Other subsystems (broker, sessions, history)
// also persist into the same database so PRLM can avoid writing a large
// .intent/state/ directory tree.
func RunMigrations(ctx context.Context, db *sql.DB) error {
	if db == nil {
		return fmt.Errorf("nil db")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	stmts := []string{
		`CREATE TABLE IF NOT EXISTS trees (
			id          TEXT PRIMARY KEY,
			root_path   TEXT NOT NULL,
			root_id     TEXT NOT NULL,
			data        BLOB NOT NULL,
			created_at  TEXT NOT NULL,
			updated_at  TEXT NOT NULL
		);`,

		// ── Relational PRLM tree tables ──────────────────────────
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
			PRIMARY KEY (index_id, node_id)
		);`,
		`CREATE INDEX IF NOT EXISTS idx_agent_nodes_parent ON agent_nodes(index_id, parent_id);`,
		`CREATE INDEX IF NOT EXISTS idx_agent_nodes_status ON agent_nodes(index_id, status);`,

		`CREATE TABLE IF NOT EXISTS agent_node_files (
			index_id   TEXT NOT NULL,
			node_id    TEXT NOT NULL,
			file_path  TEXT NOT NULL,
			PRIMARY KEY (index_id, node_id, file_path)
		);`,

		`CREATE TABLE IF NOT EXISTS agent_node_bundles (
			index_id    TEXT NOT NULL,
			node_id     TEXT NOT NULL,
			member_path TEXT NOT NULL,
			PRIMARY KEY (index_id, node_id, member_path)
		);`,

		`CREATE TABLE IF NOT EXISTS corpus_entries (
			index_id   TEXT NOT NULL,
			file_path  TEXT NOT NULL,
			tokens     INTEGER NOT NULL,
			hash       TEXT NOT NULL,
			PRIMARY KEY (index_id, file_path)
		);`,
		`CREATE INDEX IF NOT EXISTS idx_corpus_entries_hash ON corpus_entries(index_id, hash);`,

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

		`CREATE TABLE IF NOT EXISTS history (
			key        TEXT PRIMARY KEY,
			data       TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,

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
			request_id        TEXT NOT NULL,
			node_id           TEXT NOT NULL,
			phase             TEXT NOT NULL,
			attempt           INTEGER NOT NULL,
			origin            TEXT NOT NULL DEFAULT '',
			status            TEXT NOT NULL DEFAULT '',
			execution_backend TEXT NOT NULL DEFAULT '',
			session_key       TEXT NOT NULL DEFAULT '',
			run_id            TEXT NOT NULL DEFAULT '',
			working_dir       TEXT NOT NULL DEFAULT '',
			answer_preview    TEXT NOT NULL DEFAULT '',
			error_message     TEXT NOT NULL DEFAULT '',
			started_at        INTEGER NOT NULL,
			completed_at      INTEGER NOT NULL,
			PRIMARY KEY (request_id, node_id, phase, attempt)
		);`,
		`CREATE INDEX IF NOT EXISTS idx_ask_request_executions_request_started ON ask_request_executions(request_id, started_at DESC);`,
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	for _, stmt := range stmts {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("sqlite migration failed: %w", err)
		}
	}
	return tx.Commit()
}
