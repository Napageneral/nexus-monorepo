package main

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
	_ "modernc.org/sqlite"
)

const shopifyAdapterStateDirEnv = "NEXUS_ADAPTER_STATE_DIR"

type shopifySnapshotFingerprintStore struct {
	db *sql.DB
}

func openShopifySnapshotFingerprintStore(connectionID string) (*shopifySnapshotFingerprintStore, error) {
	stateDir := strings.TrimSpace(os.Getenv(shopifyAdapterStateDirEnv))
	if stateDir == "" {
		return nil, errors.New("missing adapter state dir (expected $NEXUS_ADAPTER_STATE_DIR)")
	}
	dbPath := filepath.Join(stateDir, "shopify", connectionID, "monitor-revisions.db")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o700); err != nil {
		return nil, fmt.Errorf("prepare Shopify snapshot fingerprint db dir: %w", err)
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open Shopify snapshot fingerprint db: %w", err)
	}
	store := &shopifySnapshotFingerprintStore{db: db}
	if err := store.init(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *shopifySnapshotFingerprintStore) init() error {
	if _, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS snapshot_fingerprints (
	family              TEXT NOT NULL,
	logical_row_id      TEXT NOT NULL,
	snapshot_fingerprint TEXT NOT NULL,
	updated_ts          INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
	PRIMARY KEY (family, logical_row_id)
)`); err != nil {
		return fmt.Errorf("init Shopify snapshot fingerprint db: %w", err)
	}
	// Preserve checkpoints written by the pre-Record monitor without keeping
	// its target terminology in the active table or adapter payload.
	if _, err := s.db.Exec(`
INSERT OR IGNORE INTO snapshot_fingerprints (family, logical_row_id, snapshot_fingerprint, updated_ts)
SELECT family, logical_row_id, revision_hash, updated_ts
FROM monitor_revisions
WHERE EXISTS (
	SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'monitor_revisions'
)`); err != nil && !strings.Contains(err.Error(), "no such table") {
		return fmt.Errorf("migrate Shopify snapshot fingerprints: %w", err)
	}
	return nil
}

func (s *shopifySnapshotFingerprintStore) isDuplicate(family, logicalRowID, fingerprint string) (bool, error) {
	if s == nil || s.db == nil {
		return false, nil
	}
	row := s.db.QueryRow(
		`SELECT snapshot_fingerprint FROM snapshot_fingerprints WHERE family = ? AND logical_row_id = ?`,
		strings.TrimSpace(family),
		strings.TrimSpace(logicalRowID),
	)
	var stored string
	if err := row.Scan(&stored); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("get Shopify snapshot fingerprint: %w", err)
	}
	return strings.TrimSpace(stored) == strings.TrimSpace(fingerprint), nil
}

func (s *shopifySnapshotFingerprintStore) put(family, logicalRowID, fingerprint string) error {
	if s == nil || s.db == nil {
		return nil
	}
	_, err := s.db.Exec(`
INSERT INTO snapshot_fingerprints (family, logical_row_id, snapshot_fingerprint, updated_ts)
VALUES (?, ?, ?, strftime('%s', 'now'))
ON CONFLICT(family, logical_row_id) DO UPDATE SET
	snapshot_fingerprint = excluded.snapshot_fingerprint,
	updated_ts = excluded.updated_ts
`, strings.TrimSpace(family), strings.TrimSpace(logicalRowID), strings.TrimSpace(fingerprint))
	if err != nil {
		return fmt.Errorf("set Shopify snapshot fingerprint: %w", err)
	}
	return nil
}

func (s *shopifySnapshotFingerprintStore) close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func shopifySnapshotCheckpointKeys(record nexadapter.AdapterInboundRecord) (string, string, string) {
	if record.Payload.Metadata == nil {
		return "", "", ""
	}
	family, _ := record.Payload.Metadata["family"].(string)
	logicalRowID, _ := record.Payload.Metadata["logical_row_id"].(string)
	fingerprint, _ := record.Payload.Metadata["snapshot_fingerprint_sha256"].(string)
	return strings.TrimSpace(family), strings.TrimSpace(logicalRowID), strings.TrimSpace(fingerprint)
}
