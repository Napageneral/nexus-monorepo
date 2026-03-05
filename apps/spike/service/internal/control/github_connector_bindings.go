package control

import (
	"fmt"
	"strings"
	"time"
)

// GitHubConnectorBinding links one served tree to a tenant-scoped GitHub connector account.
type GitHubConnectorBinding struct {
	TreeID       string    `json:"tree_id"`
	Service      string    `json:"service"`
	Account      string    `json:"account"`
	AuthID       string    `json:"auth_id"`
	MetadataJSON string    `json:"metadata_json"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// GitHubConnectorBindingInput is the upsert payload for GitHub connector binding.
type GitHubConnectorBindingInput struct {
	TreeID   string
	Service  string
	Account  string
	AuthID   string
	Metadata any
}

func (s *Store) UpsertGitHubConnectorBinding(
	input GitHubConnectorBindingInput,
) (*GitHubConnectorBinding, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	input.TreeID = strings.TrimSpace(input.TreeID)
	input.Service = strings.ToLower(strings.TrimSpace(input.Service))
	input.Account = strings.ToLower(strings.TrimSpace(input.Account))
	input.AuthID = strings.ToLower(strings.TrimSpace(input.AuthID))
	if input.TreeID == "" {
		return nil, fmt.Errorf("tree_id is required")
	}
	if input.Service == "" {
		input.Service = "github"
	}
	if input.Account == "" {
		return nil, fmt.Errorf("account is required")
	}
	if input.AuthID == "" {
		input.AuthID = "custom"
	}

	now := time.Now().UTC().UnixMilli()
	_, err := s.db.Exec(`
		INSERT INTO github_connector_bindings (tree_id, service, account, auth_id, metadata_json, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(tree_id) DO UPDATE SET
			service = excluded.service,
			account = excluded.account,
			auth_id = excluded.auth_id,
			metadata_json = excluded.metadata_json,
			updated_at = excluded.updated_at
	`, input.TreeID, input.Service, input.Account, input.AuthID, mustJSON(input.Metadata, "{}"), now)
	if err != nil {
		return nil, err
	}
	return s.GetGitHubConnectorBinding(input.TreeID)
}

func (s *Store) GetGitHubConnectorBinding(treeID string) (*GitHubConnectorBinding, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	treeID = strings.TrimSpace(treeID)
	if treeID == "" {
		return nil, fmt.Errorf("tree_id is required")
	}
	row := s.db.QueryRow(`
		SELECT tree_id, service, account, auth_id, metadata_json, updated_at
		FROM github_connector_bindings
		WHERE tree_id = ?
	`, treeID)
	return scanGitHubConnectorBinding(row)
}

func (s *Store) RemoveGitHubConnectorBinding(treeID string) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("control store is not configured")
	}
	treeID = strings.TrimSpace(treeID)
	if treeID == "" {
		return fmt.Errorf("tree_id is required")
	}
	_, err := s.db.Exec(`DELETE FROM github_connector_bindings WHERE tree_id = ?`, treeID)
	return err
}

func scanGitHubConnectorBinding(scanner interface{ Scan(dest ...any) error }) (*GitHubConnectorBinding, error) {
	var (
		binding   GitHubConnectorBinding
		updatedAt int64
	)
	if err := scanner.Scan(
		&binding.TreeID,
		&binding.Service,
		&binding.Account,
		&binding.AuthID,
		&binding.MetadataJSON,
		&updatedAt,
	); err != nil {
		return nil, err
	}
	binding.UpdatedAt = fromUnixMilli(updatedAt)
	if binding.Service == "" {
		binding.Service = "github"
	}
	if binding.AuthID == "" {
		binding.AuthID = "custom"
	}
	return &binding, nil
}
