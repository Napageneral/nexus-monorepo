package etl

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// Watermark represents a sync progress marker
type Watermark struct {
	Source    string
	Name      string
	ValueInt  sql.NullInt64
	ValueText sql.NullString
	UpdatedTS int64
}

// GetWatermark retrieves a watermark from the warehouse DB
func GetWatermark(db *sql.DB, source, name string) (*Watermark, error) {
	query := `
		SELECT source, name, value_int, value_text, updated_ts
		FROM watermarks
		WHERE source = ? AND name = ?
	`

	var wm Watermark
	err := db.QueryRow(query, source, name).Scan(
		&wm.Source,
		&wm.Name,
		&wm.ValueInt,
		&wm.ValueText,
		&wm.UpdatedTS,
	)

	if err == sql.ErrNoRows {
		// No watermark exists yet
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get watermark: %w", err)
	}

	return &wm, nil
}

// SetWatermark upserts a watermark in the warehouse DB
func SetWatermark(db *sql.DB, source, name string, valueInt *int64, valueText *string) error {
	now := time.Now().Unix()

	query := `
		INSERT INTO watermarks (source, name, value_int, value_text, updated_ts)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(source, name) DO UPDATE SET
			value_int = excluded.value_int,
			value_text = excluded.value_text,
			updated_ts = excluded.updated_ts
	`

	args := []interface{}{source, name}

	if valueInt != nil {
		args = append(args, *valueInt)
	} else {
		args = append(args, nil)
	}

	if valueText != nil {
		args = append(args, *valueText)
	} else {
		args = append(args, nil)
	}

	args = append(args, now)

	_, err := db.Exec(query, args...)
	if err != nil {
		return fmt.Errorf("failed to set watermark: %w", err)
	}

	return nil
}

// GetWatermarkInt returns an integer watermark or zero when absent.
func GetWatermarkInt(db *sql.DB, source, name string) (int64, error) {
	wm, err := GetWatermark(db, source, name)
	if err != nil {
		return 0, err
	}
	if wm == nil || !wm.ValueInt.Valid {
		return 0, nil
	}
	return wm.ValueInt.Int64, nil
}

// GetOrSeedWatermarkInt returns the persisted integer watermark or seeds it
// with the provided default when missing.
func GetOrSeedWatermarkInt(db *sql.DB, source, name string, seed int64) (int64, error) {
	wm, err := GetWatermark(db, source, name)
	if err != nil {
		return 0, err
	}
	if wm != nil && wm.ValueInt.Valid {
		return wm.ValueInt.Int64, nil
	}
	if err := SetWatermark(db, source, name, &seed, nil); err != nil {
		return 0, err
	}
	return seed, nil
}
