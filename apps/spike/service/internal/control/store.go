package control

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

// Job represents one control-plane sync/hydrate lifecycle row.
type Job struct {
	ID          string    `json:"id"`
	TreeID      string    `json:"tree_id"`
	JobType     string    `json:"job_type"`
	Status      string    `json:"status"`
	RequestJSON string    `json:"request_json"`
	ResultJSON  string    `json:"result_json"`
	Error       string    `json:"error"`
	CreatedAt   time.Time `json:"created_at"`
	StartedAt   time.Time `json:"started_at,omitempty"`
	CompletedAt time.Time `json:"completed_at,omitempty"`
}

// JobFilter constrains ListJobs queries.
type JobFilter struct {
	TreeID string
	Status string
	Limit  int
}

// Store persists control-plane jobs in SQLite.
type Store struct {
	db     *sql.DB
	shared bool // true when using a shared DB (don't close on Close())
}

// OpenWithDB creates a Store using an existing database connection.
// It runs migrations (IF NOT EXISTS, idempotent) but does NOT configure
// pragmas or close the DB — the caller owns the connection lifecycle.
func OpenWithDB(db *sql.DB) (*Store, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := runMigrations(ctx, db); err != nil {
		return nil, err
	}
	return &Store{db: db, shared: true}, nil
}

// Open opens (or creates) a control DB and runs migrations.
func Open(dbPath string) (*Store, error) {
	dbPath = strings.TrimSpace(dbPath)
	if dbPath == "" {
		return nil, fmt.Errorf("control db path is required")
	}
	if !filepath.IsAbs(dbPath) {
		abs, err := filepath.Abs(dbPath)
		if err != nil {
			return nil, err
		}
		dbPath = abs
	}
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := db.ExecContext(ctx, "PRAGMA journal_mode=WAL;"); err != nil {
		_ = db.Close()
		return nil, err
	}
	if _, err := db.ExecContext(ctx, "PRAGMA busy_timeout=5000;"); err != nil {
		_ = db.Close()
		return nil, err
	}
	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys=ON;"); err != nil {
		_ = db.Close()
		return nil, err
	}

	if err := runMigrations(ctx, db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func runMigrations(ctx context.Context, db *sql.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS jobs (
			id            TEXT PRIMARY KEY,
			tree_id       TEXT NOT NULL,
			job_type      TEXT NOT NULL,
			status        TEXT NOT NULL,
			request_json  TEXT NOT NULL DEFAULT '{}',
			result_json   TEXT NOT NULL DEFAULT '{}',
			error         TEXT NOT NULL DEFAULT '',
			created_at    INTEGER NOT NULL,
			started_at    INTEGER,
			completed_at  INTEGER
		);`,
		`CREATE INDEX IF NOT EXISTS idx_jobs_tree_created ON jobs(tree_id, created_at DESC);`,
		`CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at DESC);`,
		`CREATE TABLE IF NOT EXISTS repositories (
			repo_id      TEXT PRIMARY KEY,
			remote_url   TEXT NOT NULL,
			created_at   INTEGER NOT NULL,
			updated_at   INTEGER NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS repo_refs (
			repo_id      TEXT NOT NULL,
			ref_name     TEXT NOT NULL,
			commit_sha   TEXT NOT NULL,
			updated_at   INTEGER NOT NULL,
			PRIMARY KEY (repo_id, ref_name),
			FOREIGN KEY (repo_id) REFERENCES repositories(repo_id) ON DELETE CASCADE
		);`,
		`CREATE INDEX IF NOT EXISTS idx_repo_refs_commit ON repo_refs(commit_sha, updated_at DESC);`,
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
		`CREATE TABLE IF NOT EXISTS github_connector_bindings (
			tree_id       TEXT PRIMARY KEY,
			service       TEXT NOT NULL,
			account       TEXT NOT NULL,
			auth_id       TEXT NOT NULL DEFAULT 'custom',
			metadata_json TEXT NOT NULL DEFAULT '{}',
			updated_at    INTEGER NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_github_connector_bindings_updated ON github_connector_bindings(updated_at DESC);`,
		`CREATE TABLE IF NOT EXISTS webhook_deliveries (
			delivery_id   TEXT PRIMARY KEY,
			event         TEXT NOT NULL,
			tree_id       TEXT NOT NULL,
			payload_hash  TEXT NOT NULL,
			status        TEXT NOT NULL,
			job_ids_json  TEXT NOT NULL DEFAULT '[]',
			error         TEXT NOT NULL DEFAULT '',
			created_at    INTEGER NOT NULL,
			updated_at    INTEGER NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);`,
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	for _, stmt := range stmts {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("control migration failed: %w", err)
		}
	}
	return tx.Commit()
}

func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	if s.shared {
		return nil // caller owns the DB lifecycle
	}
	return s.db.Close()
}

func (s *Store) CreateJob(treeID string, jobType string, request any) (*Job, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	treeID = strings.TrimSpace(treeID)
	jobType = strings.TrimSpace(jobType)
	if treeID == "" {
		return nil, fmt.Errorf("tree_id is required")
	}
	if jobType == "" {
		return nil, fmt.Errorf("job_type is required")
	}
	now := time.Now().UTC()
	requestJSON := mustJSON(request, "{}")
	id := "job-" + uuid.NewString()
	_, err := s.db.Exec(`
		INSERT INTO jobs (id, tree_id, job_type, status, request_json, result_json, error, created_at, started_at, completed_at)
		VALUES (?, ?, ?, 'queued', ?, '{}', '', ?, NULL, NULL)
	`, id, treeID, jobType, requestJSON, now.UnixMilli())
	if err != nil {
		return nil, err
	}
	return s.GetJob(id)
}

func (s *Store) StartJob(id string) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("control store is not configured")
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("job id is required")
	}
	_, err := s.db.Exec(`
		UPDATE jobs
		SET status = 'running', started_at = ?, error = ''
		WHERE id = ?
	`, time.Now().UTC().UnixMilli(), id)
	return err
}

func (s *Store) CompleteJob(id string, result any) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("control store is not configured")
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("job id is required")
	}
	_, err := s.db.Exec(`
		UPDATE jobs
		SET status = 'completed', result_json = ?, completed_at = ?, error = ''
		WHERE id = ?
	`, mustJSON(result, "{}"), time.Now().UTC().UnixMilli(), id)
	return err
}

func (s *Store) FailJob(id string, errMsg string) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("control store is not configured")
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("job id is required")
	}
	_, err := s.db.Exec(`
		UPDATE jobs
		SET status = 'failed', error = ?, completed_at = ?
		WHERE id = ?
	`, strings.TrimSpace(errMsg), time.Now().UTC().UnixMilli(), id)
	return err
}

func (s *Store) GetJob(id string) (*Job, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, fmt.Errorf("job id is required")
	}
	row := s.db.QueryRow(`
		SELECT id, tree_id, job_type, status, request_json, result_json, error, created_at, started_at, completed_at
		FROM jobs
		WHERE id = ?
	`, id)
	return scanJob(row)
}

func (s *Store) ListJobs(filter JobFilter) ([]*Job, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	where := make([]string, 0, 2)
	args := make([]any, 0, 3)
	if v := strings.TrimSpace(filter.TreeID); v != "" {
		where = append(where, "tree_id = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(filter.Status); v != "" {
		where = append(where, "status = ?")
		args = append(args, v)
	}
	q := `SELECT id, tree_id, job_type, status, request_json, result_json, error, created_at, started_at, completed_at FROM jobs`
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	q += " ORDER BY created_at DESC LIMIT ?"
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	args = append(args, limit)

	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]*Job, 0)
	for rows.Next() {
		job, err := scanJob(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, job)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func scanJob(scanner interface{ Scan(dest ...any) error }) (*Job, error) {
	var (
		job         Job
		createdAt   int64
		startedAt   sql.NullInt64
		completedAt sql.NullInt64
	)
	if err := scanner.Scan(
		&job.ID,
		&job.TreeID,
		&job.JobType,
		&job.Status,
		&job.RequestJSON,
		&job.ResultJSON,
		&job.Error,
		&createdAt,
		&startedAt,
		&completedAt,
	); err != nil {
		return nil, err
	}
	job.CreatedAt = fromUnixMilli(createdAt)
	if startedAt.Valid {
		job.StartedAt = fromUnixMilli(startedAt.Int64)
	}
	if completedAt.Valid {
		job.CompletedAt = fromUnixMilli(completedAt.Int64)
	}
	return &job, nil
}

func mustJSON(v any, fallback string) string {
	if v == nil {
		return fallback
	}
	raw, err := json.Marshal(v)
	if err != nil {
		return fallback
	}
	out := strings.TrimSpace(string(raw))
	if out == "" {
		return fallback
	}
	return out
}

func fromUnixMilli(ms int64) time.Time {
	if ms <= 0 {
		return time.Time{}
	}
	return time.UnixMilli(ms).UTC()
}
