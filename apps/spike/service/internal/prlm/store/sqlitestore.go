package store

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
	prlmtree "github.com/Napageneral/spike/internal/prlm/tree"

	_ "modernc.org/sqlite"
)

// SQLiteStore persists PRLM state into a single SQLite database file.
//
// It implements prlm/tree.Store for the Tree blob. Other subsystems (broker,
// sessions, history) also use the same database via DB().
type SQLiteStore struct {
	db     *sql.DB
	dbPath string
	shared bool // true when using a caller-owned DB handle (OpenWithDB)
}

func NewSQLiteStore(dbPath string) (*SQLiteStore, error) {
	dbPath = strings.TrimSpace(dbPath)
	if dbPath == "" {
		return nil, fmt.Errorf("dbPath is required")
	}
	if !filepath.IsAbs(dbPath) {
		abs, err := filepath.Abs(dbPath)
		if err != nil {
			return nil, err
		}
		dbPath = abs
	}
	// Ensure parent dir exists (scope root typically already exists).
	if dir := filepath.Dir(dbPath); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, err
		}
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	// Keep a single SQLite connection for this process. The broker and tree
	// now write concurrently to the same DB, and pooled multi-connection writes
	// can still produce SQLITE_BUSY under load.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Conservative PRAGMAs: WAL mode for concurrency + busy timeout to avoid spurious failures.
	if _, err := db.ExecContext(ctx, "PRAGMA journal_mode=WAL;"); err != nil {
		_ = db.Close()
		return nil, err
	}
	if _, err := db.ExecContext(ctx, "PRAGMA busy_timeout=5000;"); err != nil {
		_ = db.Close()
		return nil, err
	}
	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys=ON;"); err != nil {
		_ = db.Close()
		return nil, err
	}

	if err := RunMigrations(ctx, db); err != nil {
		_ = db.Close()
		return nil, err
	}

	return &SQLiteStore{db: db, dbPath: dbPath}, nil
}

// OpenWithDB creates a SQLiteStore backed by an existing *sql.DB handle.
// The caller retains ownership of db and is responsible for closing it;
// calling Close on the returned store is a no-op.
//
// Schema migrations are NOT run — the caller (e.g. spikedb.Store) is
// responsible for ensuring all required tables already exist.
func OpenWithDB(db *sql.DB) (*SQLiteStore, error) {
	if db == nil {
		return nil, fmt.Errorf("nil db")
	}
	return &SQLiteStore{db: db, shared: true}, nil
}

func (s *SQLiteStore) DB() *sql.DB {
	if s == nil {
		return nil
	}
	return s.db
}

func (s *SQLiteStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	// When using a shared/caller-owned DB, don't close it — the caller
	// manages the lifecycle.
	if s.shared {
		return nil
	}
	return s.db.Close()
}

func (s *SQLiteStore) CreateTree(ctx context.Context, tree *prlmtree.Tree) error {
	return s.SaveTree(ctx, tree)
}

func (s *SQLiteStore) SaveTree(ctx context.Context, tree *prlmtree.Tree) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("nil store db")
	}
	if tree == nil {
		return fmt.Errorf("nil tree")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	// 1. UPSERT the trees row (data kept as empty JSON for compat).
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO trees (id, root_path, root_id, data, created_at, updated_at)
		VALUES (?, ?, ?, '{}', ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			root_path=excluded.root_path,
			root_id=excluded.root_id,
			data='{}',
			updated_at=excluded.updated_at;
	`, tree.ID, tree.RootPath, tree.RootID, now, now); err != nil {
		return fmt.Errorf("upsert trees: %w", err)
	}

	// 2. Clear existing relational rows for this tree.
	for _, table := range []string{"agent_nodes", "agent_node_files", "agent_node_bundles", "corpus_entries"} {
		if _, err := tx.ExecContext(ctx, `DELETE FROM `+table+` WHERE index_id = ?`, tree.ID); err != nil {
			return fmt.Errorf("delete %s: %w", table, err)
		}
	}

	// 3. Insert nodes.
	if len(tree.Nodes) > 0 {
		nodeStmt, err := tx.PrepareContext(ctx, `
			INSERT INTO agent_nodes (index_id, node_id, parent_id, path, capacity, status, staleness, last_operated, error)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
		if err != nil {
			return fmt.Errorf("prepare agent_nodes: %w", err)
		}
		defer nodeStmt.Close()

		fileStmt, err := tx.PrepareContext(ctx, `
			INSERT INTO agent_node_files (index_id, node_id, file_path)
			VALUES (?, ?, ?)`)
		if err != nil {
			return fmt.Errorf("prepare agent_node_files: %w", err)
		}
		defer fileStmt.Close()

		bundleStmt, err := tx.PrepareContext(ctx, `
			INSERT INTO agent_node_bundles (index_id, node_id, member_path)
			VALUES (?, ?, ?)`)
		if err != nil {
			return fmt.Errorf("prepare agent_node_bundles: %w", err)
		}
		defer bundleStmt.Close()

		for _, node := range tree.Nodes {
			var lastOp *int64
			if !node.LastOperatedAt.IsZero() {
				unix := node.LastOperatedAt.Unix()
				lastOp = &unix
			}
			if _, err := nodeStmt.ExecContext(ctx,
				tree.ID, node.ID, node.ParentID, node.Path, node.Capacity,
				string(node.Status), string(node.StalenessState), lastOp, node.Error,
			); err != nil {
				return fmt.Errorf("insert node %s: %w", node.ID, err)
			}

			for _, fp := range node.LocalPaths {
				if _, err := fileStmt.ExecContext(ctx, tree.ID, node.ID, fp); err != nil {
					return fmt.Errorf("insert node_file %s/%s: %w", node.ID, fp, err)
				}
			}

			for _, member := range node.BundleMembers {
				if _, err := bundleStmt.ExecContext(ctx, tree.ID, node.ID, member); err != nil {
					return fmt.Errorf("insert node_bundle %s/%s: %w", node.ID, member, err)
				}
			}
		}
	}

	// 4. Insert corpus entries (Content is NOT stored).
	if len(tree.Index) > 0 {
		ceStmt, err := tx.PrepareContext(ctx, `
			INSERT INTO corpus_entries (index_id, file_path, tokens, hash)
			VALUES (?, ?, ?, ?)`)
		if err != nil {
			return fmt.Errorf("prepare corpus_entries: %w", err)
		}
		defer ceStmt.Close()

		for _, entry := range tree.Index {
			if _, err := ceStmt.ExecContext(ctx, tree.ID, entry.Path, entry.Tokens, entry.Hash); err != nil {
				return fmt.Errorf("insert corpus_entry %s: %w", entry.Path, err)
			}
		}
	}

	return tx.Commit()
}

func (s *SQLiteStore) LoadTree(ctx context.Context, treeID string) (*prlmtree.Tree, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("nil store db")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	treeID = strings.TrimSpace(treeID)
	if treeID == "" {
		return nil, fmt.Errorf("treeID is required")
	}

	// 1. Load the tree header.
	var tree prlmtree.Tree
	var createdStr, updatedStr string
	err := s.db.QueryRowContext(ctx,
		`SELECT id, root_path, root_id, created_at, updated_at FROM trees WHERE id=?`, treeID,
	).Scan(&tree.ID, &tree.RootPath, &tree.RootID, &createdStr, &updatedStr)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, prlmtree.ErrTreeNotFound
		}
		return nil, err
	}
	if t, err := time.Parse(time.RFC3339Nano, createdStr); err == nil {
		tree.CreatedAt = t
	}
	if t, err := time.Parse(time.RFC3339Nano, updatedStr); err == nil {
		tree.UpdatedAt = t
	}

	// 2. Load nodes.
	tree.Nodes = make(map[string]*prlmnode.Node)
	nodeRows, err := s.db.QueryContext(ctx,
		`SELECT node_id, parent_id, path, capacity, status, staleness, last_operated, error
		 FROM agent_nodes WHERE index_id = ?`, treeID)
	if err != nil {
		return nil, fmt.Errorf("query agent_nodes: %w", err)
	}
	defer nodeRows.Close()

	for nodeRows.Next() {
		var n prlmnode.Node
		var status, staleness string
		var lastOp sql.NullInt64
		if err := nodeRows.Scan(&n.ID, &n.ParentID, &n.Path, &n.Capacity, &status, &staleness, &lastOp, &n.Error); err != nil {
			return nil, fmt.Errorf("scan agent_nodes: %w", err)
		}
		n.Status = prlmnode.NodeStatus(status)
		n.StalenessState = prlmnode.StalenessKind(staleness)
		if lastOp.Valid {
			n.LastOperatedAt = time.Unix(lastOp.Int64, 0).UTC()
		}
		tree.Nodes[n.ID] = &n
	}
	if err := nodeRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate agent_nodes: %w", err)
	}

	// 3. Load node files (LocalPaths).
	fileRows, err := s.db.QueryContext(ctx,
		`SELECT node_id, file_path FROM agent_node_files WHERE index_id = ?`, treeID)
	if err != nil {
		return nil, fmt.Errorf("query agent_node_files: %w", err)
	}
	defer fileRows.Close()

	for fileRows.Next() {
		var nodeID, filePath string
		if err := fileRows.Scan(&nodeID, &filePath); err != nil {
			return nil, fmt.Errorf("scan agent_node_files: %w", err)
		}
		if n, ok := tree.Nodes[nodeID]; ok {
			n.LocalPaths = append(n.LocalPaths, filePath)
		}
	}
	if err := fileRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate agent_node_files: %w", err)
	}

	// 4. Load bundle members.
	bundleRows, err := s.db.QueryContext(ctx,
		`SELECT node_id, member_path FROM agent_node_bundles WHERE index_id = ?`, treeID)
	if err != nil {
		return nil, fmt.Errorf("query agent_node_bundles: %w", err)
	}
	defer bundleRows.Close()

	for bundleRows.Next() {
		var nodeID, memberPath string
		if err := bundleRows.Scan(&nodeID, &memberPath); err != nil {
			return nil, fmt.Errorf("scan agent_node_bundles: %w", err)
		}
		if n, ok := tree.Nodes[nodeID]; ok {
			n.BundleMembers = append(n.BundleMembers, memberPath)
		}
	}
	if err := bundleRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate agent_node_bundles: %w", err)
	}

	// 5. Derive ChildIDs from parent_id relationships.
	for _, n := range tree.Nodes {
		if n.ParentID != "" {
			if parent, ok := tree.Nodes[n.ParentID]; ok {
				parent.ChildIDs = append(parent.ChildIDs, n.ID)
			}
		}
	}

	// 6. Load corpus entries (Content is empty — read from filesystem on demand).
	tree.Index = make(map[string]prlmnode.CorpusEntry)
	ceRows, err := s.db.QueryContext(ctx,
		`SELECT file_path, tokens, hash FROM corpus_entries WHERE index_id = ?`, treeID)
	if err != nil {
		return nil, fmt.Errorf("query corpus_entries: %w", err)
	}
	defer ceRows.Close()

	for ceRows.Next() {
		var entry prlmnode.CorpusEntry
		if err := ceRows.Scan(&entry.Path, &entry.Tokens, &entry.Hash); err != nil {
			return nil, fmt.Errorf("scan corpus_entries: %w", err)
		}
		tree.Index[entry.Path] = entry
	}
	if err := ceRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate corpus_entries: %w", err)
	}

	// 7. Normalize and return.
	tree.Normalize()
	return &tree, nil
}

func (s *SQLiteStore) ListTreeIDs(ctx context.Context) ([]string, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("nil store db")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	rows, err := s.db.QueryContext(ctx, `SELECT id FROM trees ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		id = strings.TrimSpace(id)
		if id != "" {
			ids = append(ids, id)
		}
	}
	return ids, rows.Err()
}

func (s *SQLiteStore) DeleteTree(ctx context.Context, treeID string) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("nil store db")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	treeID = strings.TrimSpace(treeID)
	if treeID == "" {
		return nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	for _, table := range []string{"agent_nodes", "agent_node_files", "agent_node_bundles", "corpus_entries", "trees"} {
		col := "index_id"
		if table == "trees" {
			col = "id"
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM `+table+` WHERE `+col+` = ?`, treeID); err != nil {
			return fmt.Errorf("delete %s: %w", table, err)
		}
	}
	return tx.Commit()
}
