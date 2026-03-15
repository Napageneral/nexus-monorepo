package db

import (
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

// PipelineRequestRow represents a row in the pipeline_requests table.
type PipelineRequestRow struct {
	ID          string
	Operation   string
	Status      string
	SenderID    string
	ReceiverID  string
	AdapterID   string
	Payload     string // JSON
	Result      string // JSON
	Error       string
	Stages      string // JSON array
	DurationMS  int64
	CreatedAt   int64
	CompletedAt *int64
}

// ContactRow represents a row in the contacts table.
type ContactRow struct {
	ID          string
	EntityID    string
	AdapterID   string
	Platform    string
	PlatformID  string
	DisplayName string
}

// EntityRow represents a row in the entities table.
type EntityRow struct {
	ID         string
	Name       string
	Type       string
	Normalized string
	IsUser     bool
}

// AdapterStateRow represents a row in the adapter_state table.
type AdapterStateRow struct {
	AdapterID       string
	Status          string
	Config          string
	Metadata        string
	LastHeartbeatAt *int64
	ConnectedAt     *int64
}

// ---------------------------------------------------------------------------
// Pipeline requests (runtime.db)
// ---------------------------------------------------------------------------

// InsertPipelineRequest persists a pipeline request trace to runtime.db.
func (l *Ledgers) InsertPipelineRequest(ctx context.Context, req PipelineRequestRow) error {
	const q = `INSERT INTO pipeline_requests
		(id, operation, status, sender_id, receiver_id, adapter_id,
		 payload, result, error, stages, duration_ms, created_at, completed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := l.Runtime.ExecContext(ctx, q,
		req.ID, req.Operation, req.Status,
		req.SenderID, req.ReceiverID, req.AdapterID,
		req.Payload, req.Result, req.Error, req.Stages,
		req.DurationMS, req.CreatedAt, req.CompletedAt,
	)
	return err
}

// ---------------------------------------------------------------------------
// Contact / entity resolution (identity.db)
// ---------------------------------------------------------------------------

// ResolveContactByPlatformID looks up a contact by adapter+platform+platformID.
// Returns nil, nil if no matching row is found.
func (l *Ledgers) ResolveContactByPlatformID(ctx context.Context, adapterID, platform, platformID string) (*ContactRow, error) {
	const q = `SELECT id, entity_id, adapter_id, platform, platform_id, display_name
		FROM contacts
		WHERE adapter_id = ? AND platform = ? AND platform_id = ?
		LIMIT 1`

	row := l.Identity.QueryRowContext(ctx, q, adapterID, platform, platformID)
	var c ContactRow
	err := row.Scan(&c.ID, &c.EntityID, &c.AdapterID, &c.Platform, &c.PlatformID, &c.DisplayName)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// GetEntityByID retrieves an entity by its ID. Returns nil, nil if not found.
func (l *Ledgers) GetEntityByID(ctx context.Context, entityID string) (*EntityRow, error) {
	const q = `SELECT id, name, type, normalized, is_user
		FROM entities
		WHERE id = ?`

	row := l.Identity.QueryRowContext(ctx, q, entityID)
	var e EntityRow
	var isUser int
	err := row.Scan(&e.ID, &e.Name, &e.Type, &e.Normalized, &isUser)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	e.IsUser = isUser != 0
	return &e, nil
}

// AutoCreateEntity creates a new entity and contact if they don't exist.
// If a contact already exists for the given adapter+platform+platformID,
// the existing entity ID is returned. Otherwise a new entity and contact
// are created and the new entity ID is returned.
func (l *Ledgers) AutoCreateEntity(ctx context.Context, name, entityType, adapterID, platform, platformID string) (string, error) {
	// Check for existing contact first.
	existing, err := l.ResolveContactByPlatformID(ctx, adapterID, platform, platformID)
	if err != nil {
		return "", fmt.Errorf("resolve contact: %w", err)
	}
	if existing != nil {
		return existing.EntityID, nil
	}

	now := time.Now().UnixMilli()
	entityID := newUUID()
	contactID := newUUID()
	normalized := strings.ToLower(strings.TrimSpace(name))

	// Insert entity.
	const entityQ = `INSERT INTO entities (id, name, type, normalized, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)`
	if _, err := l.Identity.ExecContext(ctx, entityQ, entityID, name, entityType, normalized, now, now); err != nil {
		return "", fmt.Errorf("insert entity: %w", err)
	}

	// Insert contact.
	const contactQ = `INSERT INTO contacts (id, entity_id, adapter_id, platform, platform_id, display_name, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	if _, err := l.Identity.ExecContext(ctx, contactQ, contactID, entityID, adapterID, platform, platformID, name, now, now); err != nil {
		return "", fmt.Errorf("insert contact: %w", err)
	}

	return entityID, nil
}

// ---------------------------------------------------------------------------
// Adapter state (runtime.db)
// ---------------------------------------------------------------------------

// ListAdapterState returns all adapter state rows.
func (l *Ledgers) ListAdapterState(ctx context.Context) ([]AdapterStateRow, error) {
	const q = `SELECT adapter_id, status, config, metadata, last_heartbeat_at, connected_at
		FROM adapter_state`

	rows, err := l.Runtime.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []AdapterStateRow
	for rows.Next() {
		var s AdapterStateRow
		if err := rows.Scan(&s.AdapterID, &s.Status, &s.Config, &s.Metadata, &s.LastHeartbeatAt, &s.ConnectedAt); err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	return result, rows.Err()
}

// UpsertAdapterState inserts or updates adapter state.
func (l *Ledgers) UpsertAdapterState(ctx context.Context, state AdapterStateRow) error {
	const q = `INSERT INTO adapter_state (adapter_id, status, config, metadata, last_heartbeat_at, connected_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(adapter_id) DO UPDATE SET
			status = excluded.status,
			config = excluded.config,
			metadata = excluded.metadata,
			last_heartbeat_at = excluded.last_heartbeat_at,
			connected_at = excluded.connected_at,
			updated_at = excluded.updated_at`

	now := time.Now().UnixMilli()
	_, err := l.Runtime.ExecContext(ctx, q,
		state.AdapterID, state.Status, state.Config, state.Metadata,
		state.LastHeartbeatAt, state.ConnectedAt, now,
	)
	return err
}

// ---------------------------------------------------------------------------
// UUID helper (same pattern as pipeline/request.go)
// ---------------------------------------------------------------------------

// newUUID generates a random UUID v4.
func newUUID() string {
	var buf [16]byte
	_, _ = rand.Read(buf[:])
	buf[6] = (buf[6] & 0x0f) | 0x40 // version 4
	buf[8] = (buf[8] & 0x3f) | 0x80 // variant 2
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		buf[0:4], buf[4:6], buf[6:8], buf[8:10], buf[10:16])
}
