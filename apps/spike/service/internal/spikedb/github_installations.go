package spikedb

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// GitHubInstallation represents a GitHub App installation entry.
type GitHubInstallation struct {
	InstallationID  int64  `json:"installation_id"`
	AccountLogin    string `json:"account_login"`
	AccountType     string `json:"account_type"`
	AppSlug         string `json:"app_slug"`
	PermissionsJSON string `json:"permissions_json"`
	Suspended       bool   `json:"suspended"`
	MetadataJSON    string `json:"metadata_json"`
	CreatedAt       int64  `json:"created_at"`
	UpdatedAt       int64  `json:"updated_at"`
}

// UpsertGitHubInstallation creates or updates a GitHubInstallation.
func (s *Store) UpsertGitHubInstallation(ctx context.Context, inst GitHubInstallation) error {
	now := time.Now().Unix()
	if inst.CreatedAt == 0 {
		inst.CreatedAt = now
	}
	inst.UpdatedAt = now
	suspended := 0
	if inst.Suspended {
		suspended = 1
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO github_installations (installation_id, account_login, account_type, app_slug, permissions_json, suspended, metadata_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(installation_id) DO UPDATE SET
			account_login=excluded.account_login,
			account_type=excluded.account_type,
			app_slug=excluded.app_slug,
			permissions_json=excluded.permissions_json,
			suspended=excluded.suspended,
			metadata_json=excluded.metadata_json,
			updated_at=excluded.updated_at
	`, inst.InstallationID, inst.AccountLogin, inst.AccountType, inst.AppSlug, inst.PermissionsJSON, suspended, inst.MetadataJSON, inst.CreatedAt, inst.UpdatedAt)
	return err
}

// GetGitHubInstallation retrieves a GitHubInstallation by ID.
func (s *Store) GetGitHubInstallation(ctx context.Context, installationID int64) (*GitHubInstallation, error) {
	var inst GitHubInstallation
	var suspended int
	err := s.db.QueryRowContext(ctx, `
		SELECT installation_id, account_login, account_type, app_slug, permissions_json, suspended, metadata_json, created_at, updated_at
		FROM github_installations WHERE installation_id = ?
	`, installationID).Scan(
		&inst.InstallationID, &inst.AccountLogin, &inst.AccountType, &inst.AppSlug, &inst.PermissionsJSON, &suspended, &inst.MetadataJSON, &inst.CreatedAt, &inst.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("installation not found: %d", installationID)
	}
	if err != nil {
		return nil, err
	}
	inst.Suspended = suspended != 0
	return &inst, nil
}

// ListGitHubInstallations returns all GitHubInstallation rows.
func (s *Store) ListGitHubInstallations(ctx context.Context) ([]GitHubInstallation, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT installation_id, account_login, account_type, app_slug, permissions_json, suspended, metadata_json, created_at, updated_at
		FROM github_installations ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var installations []GitHubInstallation
	for rows.Next() {
		var inst GitHubInstallation
		var suspended int
		if err := rows.Scan(
			&inst.InstallationID, &inst.AccountLogin, &inst.AccountType, &inst.AppSlug, &inst.PermissionsJSON, &suspended, &inst.MetadataJSON, &inst.CreatedAt, &inst.UpdatedAt,
		); err != nil {
			return nil, err
		}
		inst.Suspended = suspended != 0
		installations = append(installations, inst)
	}
	return installations, rows.Err()
}

// DeleteGitHubInstallation removes a GitHubInstallation by ID.
func (s *Store) DeleteGitHubInstallation(ctx context.Context, installationID int64) error {
	result, err := s.db.ExecContext(ctx, `
		DELETE FROM github_installations WHERE installation_id = ?
	`, installationID)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return fmt.Errorf("installation not found: %d", installationID)
	}
	return nil
}
