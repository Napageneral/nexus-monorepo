package main

import (
	"database/sql"
	"fmt"
	"path/filepath"

	core "github.com/nexus-project/bitbucket/internal/gitadapter"
	_ "modernc.org/sqlite"
)

type Watermark = core.Watermark

type WatermarkStore interface {
	Get(source, name string) (*Watermark, error)
	Set(source, name string, valueInt int64, valueText string) error
	Delete(source, name string) error
	ListBySource(source string) ([]Watermark, error)
	Close() error
}

type SQLiteWatermarkStore struct {
	db *sql.DB
}

func OpenWatermarkStore(stateDir string) (*SQLiteWatermarkStore, error) {
	db, err := sql.Open("sqlite", filepath.Join(stateDir, "watermarks.db"))
	if err != nil {
		return nil, fmt.Errorf("open watermark db: %w", err)
	}

	store := &SQLiteWatermarkStore{db: db}
	if err := store.init(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *SQLiteWatermarkStore) init() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS watermarks (
	source     TEXT NOT NULL,
	name       TEXT NOT NULL,
	value_int  INTEGER,
	value_text TEXT,
	updated_ts INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
	PRIMARY KEY (source, name)
)`)
	if err != nil {
		return fmt.Errorf("init watermark db: %w", err)
	}
	return nil
}

func (s *SQLiteWatermarkStore) Get(source, name string) (*Watermark, error) {
	row := s.db.QueryRow(`SELECT source, name, COALESCE(value_int, 0), COALESCE(value_text, ''), updated_ts FROM watermarks WHERE source = ? AND name = ?`, source, name)

	var watermark Watermark
	if err := row.Scan(&watermark.Source, &watermark.Name, &watermark.ValueInt, &watermark.ValueText, &watermark.UpdatedTS); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get watermark: %w", err)
	}
	return &watermark, nil
}

func (s *SQLiteWatermarkStore) Set(source, name string, valueInt int64, valueText string) error {
	_, err := s.db.Exec(`
INSERT INTO watermarks (source, name, value_int, value_text, updated_ts)
VALUES (?, ?, ?, ?, strftime('%s', 'now'))
ON CONFLICT(source, name) DO UPDATE SET
  value_int = excluded.value_int,
  value_text = excluded.value_text,
  updated_ts = excluded.updated_ts
`, source, name, valueInt, valueText)
	if err != nil {
		return fmt.Errorf("set watermark: %w", err)
	}
	return nil
}

func (s *SQLiteWatermarkStore) Delete(source, name string) error {
	_, err := s.db.Exec(`DELETE FROM watermarks WHERE source = ? AND name = ?`, source, name)
	if err != nil {
		return fmt.Errorf("delete watermark: %w", err)
	}
	return nil
}

func (s *SQLiteWatermarkStore) ListBySource(source string) ([]Watermark, error) {
	rows, err := s.db.Query(`SELECT source, name, COALESCE(value_int, 0), COALESCE(value_text, ''), updated_ts FROM watermarks WHERE source = ? ORDER BY name`, source)
	if err != nil {
		return nil, fmt.Errorf("list watermarks: %w", err)
	}
	defer rows.Close()

	var watermarks []Watermark
	for rows.Next() {
		var watermark Watermark
		if err := rows.Scan(&watermark.Source, &watermark.Name, &watermark.ValueInt, &watermark.ValueText, &watermark.UpdatedTS); err != nil {
			return nil, fmt.Errorf("scan watermark: %w", err)
		}
		watermarks = append(watermarks, watermark)
	}
	return watermarks, rows.Err()
}

func (s *SQLiteWatermarkStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}
