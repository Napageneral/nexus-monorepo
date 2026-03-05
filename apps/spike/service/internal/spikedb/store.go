package spikedb

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// Store manages the unified spike.db database.
type Store struct {
	db     *sql.DB
	dbPath string
}

// Open opens (or creates) spike.db at the given path and runs schema migrations.
func Open(dbPath string) (*Store, error) {
	dbPath = strings.TrimSpace(dbPath)
	if dbPath == "" {
		return nil, fmt.Errorf("spike db path is required")
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

	s := &Store{db: db, dbPath: dbPath}
	if err := s.migrate(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := s.seedDefaults(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

// DB returns the underlying *sql.DB for use by subsystems (control, broker, prlm).
func (s *Store) DB() *sql.DB {
	return s.db
}

// Close closes the database connection.
func (s *Store) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

// seedDefaults inserts the default AgentConfig if it doesn't exist.
func (s *Store) seedDefaults(ctx context.Context) error {
	now := time.Now().Unix()
	_, err := s.db.ExecContext(ctx, `
		INSERT OR IGNORE INTO agent_configs (config_id, display_name, capacity, max_children, max_parallel, hydrate_model, ask_model, created_at, updated_at)
		VALUES ('default', 'Default', 120000, 12, 4, '', '', ?, ?)
	`, now, now)
	return err
}
