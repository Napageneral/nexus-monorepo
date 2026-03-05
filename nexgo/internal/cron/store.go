// Package cron implements the Nexus clock/cron service for scheduled operations.
package cron

import (
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"
	"log/slog"
	"time"
)

// Schedule represents a persisted cron schedule entry.
type Schedule struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Expression string     `json:"expression"`  // cron expression or interval
	Operation  string     `json:"operation"`    // operation to fire
	Payload    string     `json:"payload"`      // JSON payload
	AgentID    string     `json:"agent_id"`     // target agent
	Enabled    bool       `json:"enabled"`
	LastRun    *time.Time `json:"last_run,omitempty"`
	NextRun    *time.Time `json:"next_run,omitempty"`
	RunCount   int        `json:"run_count"`
	CreatedAt  time.Time  `json:"created_at"`
}

// Store persists schedules in runtime.db.
type Store struct {
	db     *sql.DB
	logger *slog.Logger
}

// NewStore creates a new schedule store.
func NewStore(db *sql.DB, logger *slog.Logger) *Store {
	if logger == nil {
		logger = slog.Default()
	}
	return &Store{
		db:     db,
		logger: logger,
	}
}

// Initialize creates the cron_schedules table if it does not exist.
func (s *Store) Initialize(ctx context.Context) error {
	ddl := `CREATE TABLE IF NOT EXISTS cron_schedules (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL DEFAULT '',
		expression TEXT NOT NULL DEFAULT '',
		operation TEXT NOT NULL DEFAULT '',
		payload TEXT NOT NULL DEFAULT '{}',
		agent_id TEXT NOT NULL DEFAULT '',
		enabled INTEGER NOT NULL DEFAULT 1,
		last_run_at INTEGER,
		next_run_at INTEGER,
		run_count INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
	);
	CREATE INDEX IF NOT EXISTS idx_cron_schedules_enabled ON cron_schedules(enabled);
	CREATE INDEX IF NOT EXISTS idx_cron_schedules_next_run ON cron_schedules(next_run_at);`

	_, err := s.db.ExecContext(ctx, ddl)
	if err != nil {
		return fmt.Errorf("cron store initialize: %w", err)
	}
	return nil
}

// Create inserts a new schedule. If ID is empty, one is generated.
func (s *Store) Create(ctx context.Context, sched Schedule) error {
	if sched.ID == "" {
		sched.ID = newScheduleID()
	}
	enabled := 0
	if sched.Enabled {
		enabled = 1
	}

	var lastRunAt, nextRunAt *int64
	if sched.LastRun != nil {
		ms := sched.LastRun.UnixMilli()
		lastRunAt = &ms
	}
	if sched.NextRun != nil {
		ms := sched.NextRun.UnixMilli()
		nextRunAt = &ms
	}

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO cron_schedules (id, name, expression, operation, payload, agent_id, enabled, last_run_at, next_run_at, run_count)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		sched.ID, sched.Name, sched.Expression, sched.Operation,
		sched.Payload, sched.AgentID, enabled, lastRunAt, nextRunAt, sched.RunCount)
	if err != nil {
		return fmt.Errorf("cron store create: %w", err)
	}
	return nil
}

// Get retrieves a schedule by ID.
func (s *Store) Get(ctx context.Context, id string) (*Schedule, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, name, expression, operation, payload, agent_id, enabled, last_run_at, next_run_at, run_count, created_at
		 FROM cron_schedules WHERE id = ?`, id)

	sched, err := scanSchedule(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("cron store get: %w", err)
	}
	return sched, nil
}

// List returns all schedules ordered by creation time.
func (s *Store) List(ctx context.Context) ([]Schedule, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, expression, operation, payload, agent_id, enabled, last_run_at, next_run_at, run_count, created_at
		 FROM cron_schedules ORDER BY created_at`)
	if err != nil {
		return nil, fmt.Errorf("cron store list: %w", err)
	}
	defer rows.Close()

	var schedules []Schedule
	for rows.Next() {
		var sched Schedule
		var enabled int
		var lastRunAt, nextRunAt sql.NullInt64
		var createdAtMS int64

		if err := rows.Scan(&sched.ID, &sched.Name, &sched.Expression, &sched.Operation,
			&sched.Payload, &sched.AgentID, &enabled, &lastRunAt, &nextRunAt,
			&sched.RunCount, &createdAtMS); err != nil {
			return nil, fmt.Errorf("cron store list scan: %w", err)
		}
		sched.Enabled = enabled == 1
		sched.CreatedAt = time.UnixMilli(createdAtMS)
		if lastRunAt.Valid {
			t := time.UnixMilli(lastRunAt.Int64)
			sched.LastRun = &t
		}
		if nextRunAt.Valid {
			t := time.UnixMilli(nextRunAt.Int64)
			sched.NextRun = &t
		}
		schedules = append(schedules, sched)
	}
	return schedules, rows.Err()
}

// Update replaces all fields of an existing schedule.
func (s *Store) Update(ctx context.Context, sched Schedule) error {
	enabled := 0
	if sched.Enabled {
		enabled = 1
	}

	var lastRunAt, nextRunAt *int64
	if sched.LastRun != nil {
		ms := sched.LastRun.UnixMilli()
		lastRunAt = &ms
	}
	if sched.NextRun != nil {
		ms := sched.NextRun.UnixMilli()
		nextRunAt = &ms
	}

	result, err := s.db.ExecContext(ctx,
		`UPDATE cron_schedules SET name=?, expression=?, operation=?, payload=?, agent_id=?, enabled=?, last_run_at=?, next_run_at=?, run_count=?
		 WHERE id = ?`,
		sched.Name, sched.Expression, sched.Operation, sched.Payload,
		sched.AgentID, enabled, lastRunAt, nextRunAt, sched.RunCount, sched.ID)
	if err != nil {
		return fmt.Errorf("cron store update: %w", err)
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("cron store update: schedule %q not found", sched.ID)
	}
	return nil
}

// Delete removes a schedule by ID.
func (s *Store) Delete(ctx context.Context, id string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM cron_schedules WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("cron store delete: %w", err)
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("cron store delete: schedule %q not found", id)
	}
	return nil
}

// MarkRun records that a schedule was just executed and sets its next run time.
func (s *Store) MarkRun(ctx context.Context, id string, nextRun time.Time) error {
	nowMS := time.Now().UnixMilli()
	nextRunMS := nextRun.UnixMilli()
	result, err := s.db.ExecContext(ctx,
		`UPDATE cron_schedules SET last_run_at = ?, next_run_at = ?, run_count = run_count + 1 WHERE id = ?`,
		nowMS, nextRunMS, id)
	if err != nil {
		return fmt.Errorf("cron store mark run: %w", err)
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("cron store mark run: schedule %q not found", id)
	}
	return nil
}

// scanSchedule scans a single row into a Schedule.
func scanSchedule(row *sql.Row) (*Schedule, error) {
	var sched Schedule
	var enabled int
	var lastRunAt, nextRunAt sql.NullInt64
	var createdAtMS int64

	if err := row.Scan(&sched.ID, &sched.Name, &sched.Expression, &sched.Operation,
		&sched.Payload, &sched.AgentID, &enabled, &lastRunAt, &nextRunAt,
		&sched.RunCount, &createdAtMS); err != nil {
		return nil, err
	}
	sched.Enabled = enabled == 1
	sched.CreatedAt = time.UnixMilli(createdAtMS)
	if lastRunAt.Valid {
		t := time.UnixMilli(lastRunAt.Int64)
		sched.LastRun = &t
	}
	if nextRunAt.Valid {
		t := time.UnixMilli(nextRunAt.Int64)
		sched.NextRun = &t
	}
	return &sched, nil
}

// newScheduleID generates a random schedule ID.
func newScheduleID() string {
	var buf [8]byte
	_, _ = rand.Read(buf[:])
	return fmt.Sprintf("sched-%x", buf)
}
