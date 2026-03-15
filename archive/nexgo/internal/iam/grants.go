// Package iam implements access control for Nexus using a grant-based
// authorization model with deny-override evaluation.
package iam

import (
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"
	"log/slog"
	"time"
)

// Grant represents a single access grant or denial for an entity.
type Grant struct {
	ID         string     `json:"id"`
	EntityID   string     `json:"entity_id"`
	Operation  string     `json:"operation"`  // pattern like "memory.*" or "event.ingest"
	Resource   string     `json:"resource"`   // pattern like "memory.elements" or "*"
	Effect     string     `json:"effect"`     // "allow" or "deny"
	Conditions string     `json:"conditions"` // JSON conditions
	CreatedAt  time.Time  `json:"created_at"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
}

// AccessDecision captures the result of evaluating access for a request.
type AccessDecision struct {
	Allowed      bool   `json:"allowed"`
	Reason       string `json:"reason"`
	MatchedGrant string `json:"matched_grant,omitempty"`
}

// GrantStore manages access grants in the runtime database.
type GrantStore struct {
	db     *sql.DB // runtime.db
	logger *slog.Logger
}

// NewGrantStore creates a new GrantStore.
func NewGrantStore(db *sql.DB, logger *slog.Logger) *GrantStore {
	return &GrantStore{
		db:     db,
		logger: logger,
	}
}

// Initialize ensures the grants table exists.
// The table is already created by db.OpenLedgers (runtime schema), but this
// method can be used to add any additional indexes or migrations.
func (s *GrantStore) Initialize(ctx context.Context) error {
	// The grants table is created in the runtime schema by db.OpenLedgers.
	// We add the operation column if it does not exist (for forward compatibility).
	// SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we check first.
	var count int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM pragma_table_info('grants') WHERE name = 'operation'`,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("check grants schema: %w", err)
	}
	if count == 0 {
		// The existing schema uses 'action' and 'resource'. We will use those columns.
		// 'action' maps to our 'operation' field. This is fine.
	}
	return nil
}

// Create inserts a new grant into the store.
func (s *GrantStore) Create(ctx context.Context, grant Grant) error {
	if grant.ID == "" {
		grant.ID = newUUID()
	}
	if grant.Conditions == "" {
		grant.Conditions = "{}"
	}

	now := time.Now().UnixMilli()
	var expiresAt *int64
	if grant.ExpiresAt != nil {
		ms := grant.ExpiresAt.UnixMilli()
		expiresAt = &ms
	}

	const q = `INSERT INTO grants (id, entity_id, resource, action, effect, conditions, expires_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := s.db.ExecContext(ctx, q,
		grant.ID, grant.EntityID, grant.Resource, grant.Operation,
		grant.Effect, grant.Conditions, expiresAt, now,
	)
	if err != nil {
		return fmt.Errorf("insert grant: %w", err)
	}
	return nil
}

// Revoke removes a grant by ID.
func (s *GrantStore) Revoke(ctx context.Context, grantID string) error {
	result, err := s.db.ExecContext(ctx, "DELETE FROM grants WHERE id = ?", grantID)
	if err != nil {
		return fmt.Errorf("revoke grant: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if affected == 0 {
		return fmt.Errorf("grant %s not found", grantID)
	}
	return nil
}

// ListForEntity returns all grants for a given entity.
func (s *GrantStore) ListForEntity(ctx context.Context, entityID string) ([]Grant, error) {
	const q = `SELECT id, entity_id, resource, action, effect, conditions, created_at, expires_at
		FROM grants WHERE entity_id = ? ORDER BY created_at ASC`

	rows, err := s.db.QueryContext(ctx, q, entityID)
	if err != nil {
		return nil, fmt.Errorf("list grants: %w", err)
	}
	defer rows.Close()

	return scanGrants(rows)
}

// Evaluate checks if an entity has access to perform the given operation on the resource.
// Uses deny-override: if any deny grant matches, access is denied regardless of allow grants.
func (s *GrantStore) Evaluate(ctx context.Context, entityID, operation, resource string) (*AccessDecision, error) {
	// Get all grants for the entity (including wildcard entity "*").
	const q = `SELECT id, entity_id, resource, action, effect, conditions, created_at, expires_at
		FROM grants WHERE entity_id IN (?, '*') ORDER BY created_at ASC`

	rows, err := s.db.QueryContext(ctx, q, entityID)
	if err != nil {
		return nil, fmt.Errorf("evaluate grants: %w", err)
	}
	defer rows.Close()

	grants, err := scanGrants(rows)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	var matchedAllow *Grant
	var matchedDeny *Grant

	for i := range grants {
		g := &grants[i]

		// Skip expired grants.
		if g.ExpiresAt != nil && g.ExpiresAt.Before(now) {
			continue
		}

		// Check if operation matches.
		if !matchPattern(g.Operation, operation) {
			continue
		}

		// Check if resource matches.
		if !matchPattern(g.Resource, resource) {
			continue
		}

		// Record the match.
		if g.Effect == "deny" && matchedDeny == nil {
			matchedDeny = g
		} else if g.Effect == "allow" && matchedAllow == nil {
			matchedAllow = g
		}
	}

	// Deny-override: deny wins over allow.
	if matchedDeny != nil {
		return &AccessDecision{
			Allowed:      false,
			Reason:       "denied by grant",
			MatchedGrant: matchedDeny.ID,
		}, nil
	}

	if matchedAllow != nil {
		return &AccessDecision{
			Allowed:      true,
			Reason:       "allowed by grant",
			MatchedGrant: matchedAllow.ID,
		}, nil
	}

	// No matching grants: default deny.
	return &AccessDecision{
		Allowed: false,
		Reason:  "no matching grant",
	}, nil
}

// matchPattern checks if a pattern matches a value.
// Supports wildcard patterns like "memory.*" matching "memory.recall".
func matchPattern(pattern, value string) bool {
	if pattern == "*" {
		return true
	}
	if pattern == value {
		return true
	}

	// Check wildcard suffix: "memory.*" matches "memory.recall", "memory.retain", etc.
	if len(pattern) > 1 && pattern[len(pattern)-1] == '*' {
		prefix := pattern[:len(pattern)-1] // "memory."
		if len(value) >= len(prefix) && value[:len(prefix)] == prefix {
			return true
		}
	}

	return false
}

// scanGrants scans rows into Grant slices.
func scanGrants(rows *sql.Rows) ([]Grant, error) {
	var grants []Grant
	for rows.Next() {
		var g Grant
		var createdAtMS int64
		var expiresAtMS *int64

		if err := rows.Scan(
			&g.ID, &g.EntityID, &g.Resource, &g.Operation,
			&g.Effect, &g.Conditions, &createdAtMS, &expiresAtMS,
		); err != nil {
			return nil, fmt.Errorf("scan grant: %w", err)
		}

		g.CreatedAt = time.UnixMilli(createdAtMS)
		if expiresAtMS != nil {
			t := time.UnixMilli(*expiresAtMS)
			g.ExpiresAt = &t
		}

		grants = append(grants, g)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}
	return grants, nil
}

// newUUID generates a random UUID v4.
func newUUID() string {
	var buf [16]byte
	_, _ = rand.Read(buf[:])
	buf[6] = (buf[6] & 0x0f) | 0x40 // version 4
	buf[8] = (buf[8] & 0x3f) | 0x80 // variant 2
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		buf[0:4], buf[4:6], buf[6:8], buf[8:10], buf[10:16])
}
