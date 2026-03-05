package control

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
)

// Repository tracks one logical source repository in control DB.
type Repository struct {
	RepoID    string    `json:"repo_id"`
	RemoteURL string    `json:"remote_url"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// RepoRef tracks the latest commit observed for a repository ref.
type RepoRef struct {
	RepoID    string    `json:"repo_id"`
	RefName   string    `json:"ref_name"`
	CommitSHA string    `json:"commit_sha"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TreeVersion records one immutable tree flavor at a specific commit.
type TreeVersion struct {
	ID        string    `json:"id"`
	TreeID    string    `json:"tree_id"`
	RepoID    string    `json:"repo_id"`
	RefName   string    `json:"ref_name"`
	CommitSHA string    `json:"commit_sha"`
	RootPath  string    `json:"root_path"`
	Status    string    `json:"status"`
	LastError string    `json:"last_error"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TreeVersionInput is the required identity + state for EnsureTreeVersion.
type TreeVersionInput struct {
	TreeID    string
	RepoID    string
	RefName   string
	CommitSHA string
	RootPath  string
	Status    string
}

// TreeVersionFilter constrains ListTreeVersions queries.
type TreeVersionFilter struct {
	TreeID    string
	RepoID    string
	RefName   string
	CommitSHA string
	Status    string
	Limit     int
}

// RepositoryFilter constrains ListRepositories queries.
type RepositoryFilter struct {
	RepoID string
	Limit  int
}

// RepoRefFilter constrains ListRepoRefs queries.
type RepoRefFilter struct {
	RepoID    string
	RefName   string
	CommitSHA string
	Limit     int
}

func (s *Store) UpsertRepository(repoID string, remoteURL string) (*Repository, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	repoID = strings.TrimSpace(repoID)
	remoteURL = strings.TrimSpace(remoteURL)
	if repoID == "" {
		return nil, fmt.Errorf("repo_id is required")
	}
	if remoteURL == "" {
		return nil, fmt.Errorf("remote_url is required")
	}
	now := time.Now().UTC().UnixMilli()
	_, err := s.db.Exec(`
		INSERT INTO repositories (repo_id, remote_url, created_at, updated_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(repo_id) DO UPDATE SET
			remote_url = excluded.remote_url,
			updated_at = excluded.updated_at
	`, repoID, remoteURL, now, now)
	if err != nil {
		return nil, err
	}
	row := s.db.QueryRow(`
		SELECT repo_id, remote_url, created_at, updated_at
		FROM repositories
		WHERE repo_id = ?
	`, repoID)
	return scanRepository(row)
}

func (s *Store) GetRepository(repoID string) (*Repository, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	repoID = strings.TrimSpace(repoID)
	if repoID == "" {
		return nil, fmt.Errorf("repo_id is required")
	}
	row := s.db.QueryRow(`
		SELECT repo_id, remote_url, created_at, updated_at
		FROM repositories
		WHERE repo_id = ?
	`, repoID)
	return scanRepository(row)
}

func (s *Store) ListRepositories(filter RepositoryFilter) ([]*Repository, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	where := make([]string, 0, 1)
	args := make([]any, 0, 2)
	if v := strings.TrimSpace(filter.RepoID); v != "" {
		where = append(where, "repo_id = ?")
		args = append(args, v)
	}
	q := `
		SELECT repo_id, remote_url, created_at, updated_at
		FROM repositories
	`
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	q += " ORDER BY updated_at DESC LIMIT ?"
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	args = append(args, limit)
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]*Repository, 0)
	for rows.Next() {
		repo, err := scanRepository(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, repo)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Store) UpsertRepoRef(repoID string, refName string, commitSHA string) (*RepoRef, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	repoID = strings.TrimSpace(repoID)
	refName = strings.TrimSpace(refName)
	commitSHA = strings.TrimSpace(strings.ToLower(commitSHA))
	if repoID == "" {
		return nil, fmt.Errorf("repo_id is required")
	}
	if refName == "" {
		return nil, fmt.Errorf("ref_name is required")
	}
	if commitSHA == "" {
		return nil, fmt.Errorf("commit_sha is required")
	}
	now := time.Now().UTC().UnixMilli()
	_, err := s.db.Exec(`
		INSERT INTO repo_refs (repo_id, ref_name, commit_sha, updated_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(repo_id, ref_name) DO UPDATE SET
			commit_sha = excluded.commit_sha,
			updated_at = excluded.updated_at
	`, repoID, refName, commitSHA, now)
	if err != nil {
		return nil, err
	}
	row := s.db.QueryRow(`
		SELECT repo_id, ref_name, commit_sha, updated_at
		FROM repo_refs
		WHERE repo_id = ? AND ref_name = ?
	`, repoID, refName)
	return scanRepoRef(row)
}

func (s *Store) GetRepoRef(repoID string, refName string) (*RepoRef, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	repoID = strings.TrimSpace(repoID)
	refName = strings.TrimSpace(refName)
	if repoID == "" {
		return nil, fmt.Errorf("repo_id is required")
	}
	if refName == "" {
		return nil, fmt.Errorf("ref_name is required")
	}
	row := s.db.QueryRow(`
		SELECT repo_id, ref_name, commit_sha, updated_at
		FROM repo_refs
		WHERE repo_id = ? AND ref_name = ?
	`, repoID, refName)
	return scanRepoRef(row)
}

func (s *Store) ListRepoRefs(filter RepoRefFilter) ([]*RepoRef, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	where := make([]string, 0, 3)
	args := make([]any, 0, 4)
	if v := strings.TrimSpace(filter.RepoID); v != "" {
		where = append(where, "repo_id = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(filter.RefName); v != "" {
		where = append(where, "ref_name = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(strings.ToLower(filter.CommitSHA)); v != "" {
		where = append(where, "commit_sha = ?")
		args = append(args, v)
	}
	q := `
		SELECT repo_id, ref_name, commit_sha, updated_at
		FROM repo_refs
	`
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	q += " ORDER BY updated_at DESC LIMIT ?"
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	args = append(args, limit)
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]*RepoRef, 0)
	for rows.Next() {
		ref, err := scanRepoRef(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, ref)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Store) EnsureTreeVersion(input TreeVersionInput) (*TreeVersion, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	input.TreeID = strings.TrimSpace(input.TreeID)
	input.RepoID = strings.TrimSpace(input.RepoID)
	input.RefName = strings.TrimSpace(input.RefName)
	input.CommitSHA = strings.TrimSpace(strings.ToLower(input.CommitSHA))
	input.RootPath = strings.TrimSpace(input.RootPath)
	input.Status = strings.TrimSpace(strings.ToLower(input.Status))
	if input.TreeID == "" {
		return nil, fmt.Errorf("tree_id is required")
	}
	if input.RepoID == "" {
		return nil, fmt.Errorf("repo_id is required")
	}
	if input.RefName == "" {
		return nil, fmt.Errorf("ref_name is required")
	}
	if input.CommitSHA == "" {
		return nil, fmt.Errorf("commit_sha is required")
	}
	if input.RootPath == "" {
		return nil, fmt.Errorf("root_path is required")
	}
	if input.Status == "" {
		input.Status = "running"
	}

	now := time.Now().UTC().UnixMilli()
	id := stableTreeVersionID(input.TreeID, input.RepoID, input.RefName, input.CommitSHA)
	_, err := s.db.Exec(`
		INSERT INTO tree_versions (
			id, tree_id, repo_id, ref_name, commit_sha, root_path, status, last_error, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?)
		ON CONFLICT(tree_id, repo_id, ref_name, commit_sha) DO UPDATE SET
			root_path = excluded.root_path,
			status = excluded.status,
			last_error = '',
			updated_at = excluded.updated_at
	`, id, input.TreeID, input.RepoID, input.RefName, input.CommitSHA, input.RootPath, input.Status, now, now)
	if err != nil {
		return nil, err
	}
	row := s.db.QueryRow(`
		SELECT id, tree_id, repo_id, ref_name, commit_sha, root_path, status, last_error, created_at, updated_at
		FROM tree_versions
		WHERE tree_id = ? AND repo_id = ? AND ref_name = ? AND commit_sha = ?
	`, input.TreeID, input.RepoID, input.RefName, input.CommitSHA)
	return scanTreeVersion(row)
}

func (s *Store) GetTreeVersion(id string) (*TreeVersion, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, fmt.Errorf("tree_version id is required")
	}
	row := s.db.QueryRow(`
		SELECT id, tree_id, repo_id, ref_name, commit_sha, root_path, status, last_error, created_at, updated_at
		FROM tree_versions
		WHERE id = ?
	`, id)
	return scanTreeVersion(row)
}

func (s *Store) SetTreeVersionStatus(id string, status string, lastError string) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("control store is not configured")
	}
	id = strings.TrimSpace(id)
	status = strings.TrimSpace(strings.ToLower(status))
	lastError = strings.TrimSpace(lastError)
	if id == "" {
		return fmt.Errorf("tree_version id is required")
	}
	if status == "" {
		return fmt.Errorf("tree_version status is required")
	}
	_, err := s.db.Exec(`
		UPDATE tree_versions
		SET status = ?, last_error = ?, updated_at = ?
		WHERE id = ?
	`, status, lastError, time.Now().UTC().UnixMilli(), id)
	return err
}

func (s *Store) ListTreeVersions(filter TreeVersionFilter) ([]*TreeVersion, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	where := make([]string, 0, 5)
	args := make([]any, 0, 6)
	if v := strings.TrimSpace(filter.TreeID); v != "" {
		where = append(where, "tree_id = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(filter.RepoID); v != "" {
		where = append(where, "repo_id = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(filter.RefName); v != "" {
		where = append(where, "ref_name = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(strings.ToLower(filter.CommitSHA)); v != "" {
		where = append(where, "commit_sha = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(strings.ToLower(filter.Status)); v != "" {
		where = append(where, "status = ?")
		args = append(args, v)
	}
	q := `
		SELECT id, tree_id, repo_id, ref_name, commit_sha, root_path, status, last_error, created_at, updated_at
		FROM tree_versions
	`
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	q += " ORDER BY updated_at DESC LIMIT ?"
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	args = append(args, limit)
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]*TreeVersion, 0)
	for rows.Next() {
		tv, err := scanTreeVersion(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, tv)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func stableTreeVersionID(treeID string, repoID string, refName string, commitSHA string) string {
	payload := strings.ToLower(strings.TrimSpace(treeID)) + "|" +
		strings.ToLower(strings.TrimSpace(repoID)) + "|" +
		strings.TrimSpace(refName) + "|" +
		strings.ToLower(strings.TrimSpace(commitSHA))
	sum := sha1.Sum([]byte(payload))
	return "tv-" + hex.EncodeToString(sum[:])[:24]
}

func scanRepository(scanner interface{ Scan(dest ...any) error }) (*Repository, error) {
	var (
		repo      Repository
		createdAt int64
		updatedAt int64
	)
	if err := scanner.Scan(&repo.RepoID, &repo.RemoteURL, &createdAt, &updatedAt); err != nil {
		return nil, err
	}
	repo.CreatedAt = fromUnixMilli(createdAt)
	repo.UpdatedAt = fromUnixMilli(updatedAt)
	return &repo, nil
}

func scanRepoRef(scanner interface{ Scan(dest ...any) error }) (*RepoRef, error) {
	var (
		ref       RepoRef
		updatedAt int64
	)
	if err := scanner.Scan(&ref.RepoID, &ref.RefName, &ref.CommitSHA, &updatedAt); err != nil {
		return nil, err
	}
	ref.UpdatedAt = fromUnixMilli(updatedAt)
	return &ref, nil
}

func scanTreeVersion(scanner interface{ Scan(dest ...any) error }) (*TreeVersion, error) {
	var (
		tv        TreeVersion
		createdAt int64
		updatedAt int64
	)
	if err := scanner.Scan(
		&tv.ID,
		&tv.TreeID,
		&tv.RepoID,
		&tv.RefName,
		&tv.CommitSHA,
		&tv.RootPath,
		&tv.Status,
		&tv.LastError,
		&createdAt,
		&updatedAt,
	); err != nil {
		return nil, err
	}
	tv.CreatedAt = fromUnixMilli(createdAt)
	tv.UpdatedAt = fromUnixMilli(updatedAt)
	return &tv, nil
}
