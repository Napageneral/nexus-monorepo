package main

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

type shopifyRevisionStore struct {
	db *sql.DB
}

func openShopifyRevisionStore(connectionID string) (*shopifyRevisionStore, error) {
	stateDir, err := resolveShopifyAdapterStateDir()
	if err != nil {
		return nil, err
	}
	dbPath := filepath.Join(stateDir, "shopify", connectionID, "monitor-revisions.db")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o700); err != nil {
		return nil, fmt.Errorf("prepare Shopify revision db dir: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open Shopify revision db: %w", err)
	}

	store := &shopifyRevisionStore{db: db}
	if err := store.init(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *shopifyRevisionStore) init() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS monitor_revisions (
	family         TEXT NOT NULL,
	logical_row_id TEXT NOT NULL,
	revision_hash  TEXT NOT NULL,
	updated_ts     INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
	PRIMARY KEY (family, logical_row_id)
)`)
	if err != nil {
		return fmt.Errorf("init Shopify revision db: %w", err)
	}
	return nil
}

func (s *shopifyRevisionStore) IsDuplicateRevision(family shopifyMonitorFamily, logicalRowID string, revisionHash string) (bool, error) {
	if s == nil || s.db == nil {
		return false, nil
	}

	row := s.db.QueryRow(`SELECT revision_hash FROM monitor_revisions WHERE family = ? AND logical_row_id = ?`, strings.TrimSpace(string(family)), strings.TrimSpace(logicalRowID))
	var storedRevision string
	if err := row.Scan(&storedRevision); err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, fmt.Errorf("get Shopify monitor revision: %w", err)
	}
	return strings.TrimSpace(storedRevision) == strings.TrimSpace(revisionHash), nil
}

func (s *shopifyRevisionStore) PutRevision(family shopifyMonitorFamily, logicalRowID string, revisionHash string) error {
	if s == nil || s.db == nil {
		return nil
	}

	_, err := s.db.Exec(`
INSERT INTO monitor_revisions (family, logical_row_id, revision_hash, updated_ts)
VALUES (?, ?, ?, strftime('%s', 'now'))
ON CONFLICT(family, logical_row_id) DO UPDATE SET
	revision_hash = excluded.revision_hash,
	updated_ts = excluded.updated_ts
`, strings.TrimSpace(string(family)), strings.TrimSpace(logicalRowID), strings.TrimSpace(revisionHash))
	if err != nil {
		return fmt.Errorf("set Shopify monitor revision: %w", err)
	}
	return nil
}

func (s *shopifyRevisionStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}
