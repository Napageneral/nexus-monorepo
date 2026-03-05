package broker

import (
	"database/sql"
	"fmt"
	"strings"
)

func (b *Broker) saveCheckpoint(cp CheckpointWrite) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if strings.TrimSpace(cp.Name) == "" {
		return fmt.Errorf("checkpoint name is required")
	}
	if strings.TrimSpace(cp.SessionLabel) == "" {
		return fmt.Errorf("checkpoint session label is required")
	}
	if cp.CapturedAt <= 0 {
		cp.CapturedAt = nowUnixMilli()
	}
	_, err := db.Exec(`
		INSERT INTO checkpoints (name, session_label, entry_id, captured_at, metadata_json)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(name) DO UPDATE SET
			session_label=excluded.session_label,
			entry_id=excluded.entry_id,
			captured_at=excluded.captured_at,
			metadata_json=excluded.metadata_json
	`,
		cp.Name,
		cp.SessionLabel,
		nullIfBlank(cp.EntryID),
		cp.CapturedAt,
		nullIfBlank(cp.MetadataJSON),
	)
	return err
}

func (b *Broker) getCheckpoint(name string) (*Checkpoint, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("checkpoint name is required")
	}
	row := db.QueryRow(`
		SELECT name, session_label, entry_id, captured_at, metadata_json
		FROM checkpoints WHERE name = ?
	`, name)
	var (
		cp           Checkpoint
		entryID      sql.NullString
		capturedAt   int64
		metadataJSON sql.NullString
	)
	if err := row.Scan(&cp.Name, &cp.SessionLabel, &entryID, &capturedAt, &metadataJSON); err != nil {
		return nil, err
	}
	cp.EntryID = nullString(entryID)
	cp.CapturedAt = fromUnixMilli(capturedAt)
	cp.MetadataJSON = nullString(metadataJSON)
	return &cp, nil
}
