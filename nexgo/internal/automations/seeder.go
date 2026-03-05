package automations

import (
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"
	"log/slog"
	"time"
)

// AutomationRecord represents a persisted automation entry.
type AutomationRecord struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Hookpoint string    `json:"hookpoint"`
	Source    string    `json:"source"`
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"created_at"`
}

// Seeder manages automation persistence and first-boot seeding.
type Seeder struct {
	db     *sql.DB // runtime.db
	hooks  *HooksRuntime
	logger *slog.Logger
}

// NewSeeder creates a new Seeder.
func NewSeeder(db *sql.DB, hooks *HooksRuntime, logger *slog.Logger) *Seeder {
	if logger == nil {
		logger = slog.Default()
	}
	return &Seeder{
		db:     db,
		hooks:  hooks,
		logger: logger,
	}
}

// Initialize creates the seeder_automations table if it does not exist.
// This is separate from the runtime.db automations table to track seeded
// hook registrations.
func (s *Seeder) Initialize(ctx context.Context) error {
	ddl := `CREATE TABLE IF NOT EXISTS seeder_automations (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL DEFAULT '',
		hookpoint TEXT NOT NULL DEFAULT '',
		source TEXT NOT NULL DEFAULT '',
		enabled INTEGER NOT NULL DEFAULT 1,
		created_at INTEGER NOT NULL DEFAULT (unixepoch('now','subsec')*1000)
	);
	CREATE INDEX IF NOT EXISTS idx_seeder_automations_hookpoint ON seeder_automations(hookpoint);
	CREATE INDEX IF NOT EXISTS idx_seeder_automations_source ON seeder_automations(source);`

	_, err := s.db.ExecContext(ctx, ddl)
	if err != nil {
		return fmt.Errorf("seeder initialize: %w", err)
	}
	return nil
}

// Seed populates default automation records on first boot.
// If records already exist, it is a no-op.
func (s *Seeder) Seed(ctx context.Context) error {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM seeder_automations`).Scan(&count)
	if err != nil {
		return fmt.Errorf("seeder seed count: %w", err)
	}
	if count > 0 {
		s.logger.Debug("seeder: automations already seeded", "count", count)
		return nil
	}

	defaults := []struct {
		name      string
		hookpoint string
		source    string
	}{
		{"command-logger", "after.pipeline.execute", "bundled"},
		{"memory-retain", "after.agent.turn", "bundled"},
		{"memory-reader", "before.agent.run", "bundled"},
		{"boot-md", "on.startup", "bundled"},
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("seeder seed begin: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx,
		`INSERT INTO seeder_automations (id, name, hookpoint, source, enabled) VALUES (?, ?, ?, ?, 1)`)
	if err != nil {
		return fmt.Errorf("seeder seed prepare: %w", err)
	}
	defer stmt.Close()

	for _, d := range defaults {
		id := newSeederID()
		if _, err := stmt.ExecContext(ctx, id, d.name, d.hookpoint, d.source); err != nil {
			return fmt.Errorf("seeder seed insert %s: %w", d.name, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("seeder seed commit: %w", err)
	}

	s.logger.Info("seeder: default automations seeded", "count", len(defaults))
	return nil
}

// List returns all seeded automation records.
func (s *Seeder) List(ctx context.Context) ([]AutomationRecord, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, hookpoint, source, enabled, created_at FROM seeder_automations ORDER BY created_at`)
	if err != nil {
		return nil, fmt.Errorf("seeder list: %w", err)
	}
	defer rows.Close()

	var records []AutomationRecord
	for rows.Next() {
		var r AutomationRecord
		var enabled int
		var createdAtMS int64
		if err := rows.Scan(&r.ID, &r.Name, &r.Hookpoint, &r.Source, &enabled, &createdAtMS); err != nil {
			return nil, fmt.Errorf("seeder list scan: %w", err)
		}
		r.Enabled = enabled == 1
		r.CreatedAt = time.UnixMilli(createdAtMS)
		records = append(records, r)
	}
	return records, rows.Err()
}

// SetEnabled toggles the enabled state of a seeded automation.
func (s *Seeder) SetEnabled(ctx context.Context, id string, enabled bool) error {
	enabledInt := 0
	if enabled {
		enabledInt = 1
	}
	result, err := s.db.ExecContext(ctx,
		`UPDATE seeder_automations SET enabled = ? WHERE id = ?`, enabledInt, id)
	if err != nil {
		return fmt.Errorf("seeder set enabled: %w", err)
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("seeder set enabled: automation %q not found", id)
	}
	return nil
}

// newSeederID generates a random ID for seeder records.
func newSeederID() string {
	var buf [8]byte
	_, _ = rand.Read(buf[:])
	return fmt.Sprintf("auto-%x", buf)
}
