package spikedb

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// AgentIndex represents an agent_indexes table row.
type AgentIndex struct {
	IndexID         string  `json:"index_id"`
	DisplayName     string  `json:"display_name"`
	ConfigID        string  `json:"config_id"`
	WorktreeID      string  `json:"worktree_id"`
	SourcePath      string  `json:"source_path"`
	RootNodeID      string  `json:"root_node_id"`
	Status          string  `json:"status"`
	NodeCount       int     `json:"node_count"`
	CleanCount      int     `json:"clean_count"`
	TotalTokens     int     `json:"total_tokens"`
	TotalFiles      int     `json:"total_files"`
	LastError       string  `json:"last_error"`
	PreviousIndexID *string `json:"previous_index_id,omitempty"`
	CreatedAt       int64   `json:"created_at"`
	UpdatedAt       int64   `json:"updated_at"`
}

// UpsertAgentIndex creates or updates an AgentIndex.
func (s *Store) UpsertAgentIndex(ctx context.Context, idx AgentIndex) error {
	now := time.Now().Unix()
	if idx.CreatedAt == 0 {
		idx.CreatedAt = now
	}
	idx.UpdatedAt = now
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO agent_indexes (index_id, display_name, config_id, worktree_id, source_path, root_node_id, status, node_count, clean_count, total_tokens, total_files, last_error, previous_index_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(index_id) DO UPDATE SET
			display_name=excluded.display_name,
			config_id=excluded.config_id,
			worktree_id=excluded.worktree_id,
			source_path=excluded.source_path,
			root_node_id=excluded.root_node_id,
			status=excluded.status,
			node_count=excluded.node_count,
			clean_count=excluded.clean_count,
			total_tokens=excluded.total_tokens,
			total_files=excluded.total_files,
			last_error=excluded.last_error,
			previous_index_id=excluded.previous_index_id,
			updated_at=excluded.updated_at
	`, idx.IndexID, idx.DisplayName, idx.ConfigID, idx.WorktreeID, idx.SourcePath, idx.RootNodeID, idx.Status, idx.NodeCount, idx.CleanCount, idx.TotalTokens, idx.TotalFiles, idx.LastError, idx.PreviousIndexID, idx.CreatedAt, idx.UpdatedAt)
	return err
}

// GetAgentIndex retrieves an AgentIndex by ID.
func (s *Store) GetAgentIndex(ctx context.Context, indexID string) (*AgentIndex, error) {
	var idx AgentIndex
	err := s.db.QueryRowContext(ctx, `
		SELECT index_id, display_name, config_id, worktree_id, source_path, root_node_id, status, node_count, clean_count, total_tokens, total_files, last_error, previous_index_id, created_at, updated_at
		FROM agent_indexes WHERE index_id = ?
	`, indexID).Scan(
		&idx.IndexID, &idx.DisplayName, &idx.ConfigID, &idx.WorktreeID, &idx.SourcePath, &idx.RootNodeID, &idx.Status, &idx.NodeCount, &idx.CleanCount, &idx.TotalTokens, &idx.TotalFiles, &idx.LastError, &idx.PreviousIndexID, &idx.CreatedAt, &idx.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("agent index not found: %s", indexID)
	}
	if err != nil {
		return nil, err
	}
	return &idx, nil
}

// ListAgentIndexes returns all AgentIndex rows.
func (s *Store) ListAgentIndexes(ctx context.Context) ([]AgentIndex, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT index_id, display_name, config_id, worktree_id, source_path, root_node_id, status, node_count, clean_count, total_tokens, total_files, last_error, previous_index_id, created_at, updated_at
		FROM agent_indexes ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var indexes []AgentIndex
	for rows.Next() {
		var idx AgentIndex
		if err := rows.Scan(
			&idx.IndexID, &idx.DisplayName, &idx.ConfigID, &idx.WorktreeID, &idx.SourcePath, &idx.RootNodeID, &idx.Status, &idx.NodeCount, &idx.CleanCount, &idx.TotalTokens, &idx.TotalFiles, &idx.LastError, &idx.PreviousIndexID, &idx.CreatedAt, &idx.UpdatedAt,
		); err != nil {
			return nil, err
		}
		indexes = append(indexes, idx)
	}
	return indexes, rows.Err()
}

// DeleteAgentIndex deletes an AgentIndex and cascades to related tables.
func (s *Store) DeleteAgentIndex(ctx context.Context, indexID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Cascade delete from related tables
	if _, err := tx.ExecContext(ctx, `DELETE FROM corpus_entries WHERE index_id = ?`, indexID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM agent_node_bundles WHERE index_id = ?`, indexID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM agent_node_files WHERE index_id = ?`, indexID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM agent_nodes WHERE index_id = ?`, indexID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM agent_indexes WHERE index_id = ?`, indexID); err != nil {
		return err
	}

	return tx.Commit()
}

// UpdateAgentIndexStatus updates the status and last_error fields.
func (s *Store) UpdateAgentIndexStatus(ctx context.Context, indexID, status string, lastError string) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE agent_indexes SET status = ?, last_error = ?, updated_at = ?
		WHERE index_id = ?
	`, status, lastError, time.Now().Unix(), indexID)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return fmt.Errorf("agent index not found: %s", indexID)
	}
	return nil
}

