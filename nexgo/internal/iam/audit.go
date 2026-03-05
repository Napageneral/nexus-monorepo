package iam

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"
)

// AuditEntry represents a single entry in the audit log.
type AuditEntry struct {
	ID        string    `json:"id"`
	EntityID  string    `json:"entity_id"`
	Operation string    `json:"operation"`
	Resource  string    `json:"resource"`
	Action    string    `json:"action"` // "allow", "deny", "grant_create", "grant_revoke"
	Details   string    `json:"details"`
	CreatedAt time.Time `json:"created_at"`
}

// AuditFilter constrains audit log queries.
type AuditFilter struct {
	EntityID  string
	Operation string
	After     time.Time
	Limit     int
}

// AuditLogger records access control decisions and grant changes.
type AuditLogger struct {
	db     *sql.DB // runtime.db
	logger *slog.Logger
}

// NewAuditLogger creates a new AuditLogger.
func NewAuditLogger(db *sql.DB, logger *slog.Logger) *AuditLogger {
	return &AuditLogger{
		db:     db,
		logger: logger,
	}
}

// Initialize ensures the audit_log table exists.
// The table is already created by db.OpenLedgers (runtime schema).
func (a *AuditLogger) Initialize(ctx context.Context) error {
	// Verify the table exists by querying it.
	_, err := a.db.ExecContext(ctx, "SELECT 1 FROM audit_log LIMIT 0")
	if err != nil {
		return fmt.Errorf("verify audit_log table: %w", err)
	}
	return nil
}

// Log records an audit entry.
func (a *AuditLogger) Log(ctx context.Context, entry AuditEntry) error {
	if entry.ID == "" {
		entry.ID = newUUID()
	}
	if entry.Details == "" {
		entry.Details = "{}"
	}

	now := time.Now().UnixMilli()

	const q = `INSERT INTO audit_log (id, entity_id, operation, resource, decision, details, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`

	_, err := a.db.ExecContext(ctx, q,
		entry.ID, entry.EntityID, entry.Operation, entry.Resource,
		entry.Action, entry.Details, now,
	)
	if err != nil {
		return fmt.Errorf("insert audit entry: %w", err)
	}
	return nil
}

// Query retrieves audit entries matching the filter.
func (a *AuditLogger) Query(ctx context.Context, filter AuditFilter) ([]AuditEntry, error) {
	query := "SELECT id, entity_id, operation, resource, decision, details, created_at FROM audit_log WHERE 1=1"
	var args []any

	if filter.EntityID != "" {
		query += " AND entity_id = ?"
		args = append(args, filter.EntityID)
	}
	if filter.Operation != "" {
		query += " AND operation = ?"
		args = append(args, filter.Operation)
	}
	if !filter.After.IsZero() {
		query += " AND created_at >= ?"
		args = append(args, filter.After.UnixMilli())
	}

	query += " ORDER BY created_at DESC"

	limit := filter.Limit
	if limit <= 0 {
		limit = 100
	}
	query += " LIMIT ?"
	args = append(args, limit)

	rows, err := a.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query audit log: %w", err)
	}
	defer rows.Close()

	var entries []AuditEntry
	for rows.Next() {
		var e AuditEntry
		var createdAtMS int64
		if err := rows.Scan(&e.ID, &e.EntityID, &e.Operation, &e.Resource, &e.Action, &e.Details, &createdAtMS); err != nil {
			return nil, fmt.Errorf("scan audit entry: %w", err)
		}
		e.CreatedAt = time.UnixMilli(createdAtMS)
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}
	return entries, nil
}
