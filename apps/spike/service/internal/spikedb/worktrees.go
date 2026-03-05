package spikedb

import (
	"context"
	"time"
)

// Worktree represents a worktree entry.
type Worktree struct {
	WorktreeID   string `json:"worktree_id"`
	RepoID       string `json:"repo_id"`
	RefName      string `json:"ref_name"`
	CommitSHA    string `json:"commit_sha"`
	WorktreePath string `json:"worktree_path"`
	Status       string `json:"status"`
	SizeBytes    int64  `json:"size_bytes"`
	LastAccessed int64  `json:"last_accessed"`
	CreatedAt    int64  `json:"created_at"`
}

// UpsertWorktree creates or updates a Worktree.
func (s *Store) UpsertWorktree(ctx context.Context, w Worktree) error {
	now := time.Now().Unix()
	if w.CreatedAt == 0 {
		w.CreatedAt = now
	}
	if w.LastAccessed == 0 {
		w.LastAccessed = now
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO worktrees (worktree_id, repo_id, ref_name, commit_sha, worktree_path, status, size_bytes, last_accessed, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(worktree_id) DO UPDATE SET
			repo_id=excluded.repo_id,
			ref_name=excluded.ref_name,
			commit_sha=excluded.commit_sha,
			worktree_path=excluded.worktree_path,
			status=excluded.status,
			size_bytes=excluded.size_bytes,
			last_accessed=excluded.last_accessed
	`, w.WorktreeID, w.RepoID, w.RefName, w.CommitSHA, w.WorktreePath, w.Status, w.SizeBytes, w.LastAccessed, w.CreatedAt)
	return err
}

// ListWorktrees returns all Worktree rows.
func (s *Store) ListWorktrees(ctx context.Context) ([]Worktree, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT worktree_id, repo_id, ref_name, commit_sha, worktree_path, status, size_bytes, last_accessed, created_at
		FROM worktrees ORDER BY last_accessed DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var worktrees []Worktree
	for rows.Next() {
		var w Worktree
		if err := rows.Scan(
			&w.WorktreeID, &w.RepoID, &w.RefName, &w.CommitSHA, &w.WorktreePath, &w.Status, &w.SizeBytes, &w.LastAccessed, &w.CreatedAt,
		); err != nil {
			return nil, err
		}
		worktrees = append(worktrees, w)
	}
	return worktrees, rows.Err()
}

