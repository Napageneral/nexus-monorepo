package spikedb

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"
)

// MirrorID returns a deterministic mirror ID for a remote URL.
func MirrorID(remoteURL string) string {
	sum := sha256.Sum256([]byte(remoteURL))
	return hex.EncodeToString(sum[:8])
}

// Mirror represents a git mirror entry.
type Mirror struct {
	MirrorID    string  `json:"mirror_id"`
	RemoteURL   string  `json:"remote_url"`
	MirrorPath  string  `json:"mirror_path"`
	Status      string  `json:"status"`
	LastFetched *int64  `json:"last_fetched,omitempty"`
	LastError   string  `json:"last_error"`
	SizeBytes   int64   `json:"size_bytes"`
	RefCount    int     `json:"ref_count"`
	CreatedAt   int64   `json:"created_at"`
	UpdatedAt   int64   `json:"updated_at"`
}

// UpsertMirror creates or updates a Mirror.
func (s *Store) UpsertMirror(ctx context.Context, m Mirror) error {
	now := time.Now().Unix()
	if m.CreatedAt == 0 {
		m.CreatedAt = now
	}
	m.UpdatedAt = now
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO git_mirrors (mirror_id, remote_url, mirror_path, status, last_fetched, last_error, size_bytes, ref_count, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(mirror_id) DO UPDATE SET
			remote_url=excluded.remote_url,
			mirror_path=excluded.mirror_path,
			status=excluded.status,
			last_fetched=excluded.last_fetched,
			last_error=excluded.last_error,
			size_bytes=excluded.size_bytes,
			ref_count=excluded.ref_count,
			updated_at=excluded.updated_at
	`, m.MirrorID, m.RemoteURL, m.MirrorPath, m.Status, m.LastFetched, m.LastError, m.SizeBytes, m.RefCount, m.CreatedAt, m.UpdatedAt)
	return err
}

// ListMirrors returns all Mirror rows.
func (s *Store) ListMirrors(ctx context.Context) ([]Mirror, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT mirror_id, remote_url, mirror_path, status, last_fetched, last_error, size_bytes, ref_count, created_at, updated_at
		FROM git_mirrors ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var mirrors []Mirror
	for rows.Next() {
		var m Mirror
		if err := rows.Scan(
			&m.MirrorID, &m.RemoteURL, &m.MirrorPath, &m.Status, &m.LastFetched, &m.LastError, &m.SizeBytes, &m.RefCount, &m.CreatedAt, &m.UpdatedAt,
		); err != nil {
			return nil, err
		}
		mirrors = append(mirrors, m)
	}
	return mirrors, rows.Err()
}

// IncrementMirrorRefCount increments or decrements the ref_count for a mirror.
func (s *Store) IncrementMirrorRefCount(ctx context.Context, mirrorID string, delta int) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE git_mirrors SET ref_count = ref_count + ?, updated_at = ?
		WHERE mirror_id = ?
	`, delta, time.Now().Unix(), mirrorID)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return fmt.Errorf("mirror not found: %s", mirrorID)
	}
	return nil
}
