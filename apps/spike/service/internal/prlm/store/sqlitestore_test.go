package store

import (
	"context"
	"path/filepath"
	"sort"
	"testing"
	"time"

	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
	prlmtree "github.com/Napageneral/spike/internal/prlm/tree"
)

func TestSQLiteStoreRoundTrip(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, ".oracle.db")
	store, err := NewSQLiteStore(dbPath)
	if err != nil {
		t.Fatalf("new sqlite store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	tree := prlmtree.NewTree("tree-sqlite", dir, 8, []prlmnode.CorpusEntry{{Path: "pkg/a.go", Tokens: 2, Hash: "x"}})
	if err := store.SaveTree(context.Background(), tree); err != nil {
		t.Fatalf("save tree: %v", err)
	}

	loaded, err := store.LoadTree(context.Background(), tree.ID)
	if err != nil {
		t.Fatalf("load tree: %v", err)
	}
	if loaded.ID != tree.ID || loaded.RootID != tree.RootID {
		t.Fatalf("unexpected loaded tree: %#v", loaded)
	}

	// Clone isolation: mutations to loaded should not persist.
	loaded.RootPath = "/tmp/changed"
	reloaded, err := store.LoadTree(context.Background(), tree.ID)
	if err != nil {
		t.Fatalf("reload tree: %v", err)
	}
	if reloaded.RootPath != dir {
		t.Fatalf("expected clone isolation, got %q", reloaded.RootPath)
	}

	ids, err := store.ListTreeIDs(context.Background())
	if err != nil {
		t.Fatalf("list tree ids: %v", err)
	}
	if len(ids) != 1 || ids[0] != tree.ID {
		t.Fatalf("unexpected tree ids: %#v", ids)
	}

	if err := store.DeleteTree(context.Background(), tree.ID); err != nil {
		t.Fatalf("delete tree: %v", err)
	}
	if _, err := store.LoadTree(context.Background(), tree.ID); err == nil {
		t.Fatalf("expected tree not found after delete")
	}

	if err := store.CreateTree(context.Background(), prlmtree.NewTree("t2", dir, 4, nil)); err != nil {
		t.Fatalf("create tree: %v", err)
	}
	if _, err := store.LoadTree(context.Background(), "t2"); err != nil {
		t.Fatalf("load t2: %v", err)
	}
}

func TestSQLiteStore_MigrationsIdempotent(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, ".oracle.db")

	store, err := NewSQLiteStore(dbPath)
	if err != nil {
		t.Fatalf("new sqlite store: %v", err)
	}
	_ = store.Close()

	// Re-open should not fail (CREATE IF NOT EXISTS).
	store2, err := NewSQLiteStore(dbPath)
	if err != nil {
		t.Fatalf("reopen sqlite store: %v", err)
	}
	_ = store2.Close()
}

func TestSQLiteStore_DBAccessor(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, ".oracle.db")
	store, err := NewSQLiteStore(dbPath)
	if err != nil {
		t.Fatalf("new sqlite store: %v", err)
	}
	defer store.Close()
	if store.DB() == nil {
		t.Fatalf("expected non-nil db")
	}
	// Smoke query against schema created by migrations.
	if _, err := store.DB().ExecContext(context.Background(), "SELECT 1"); err != nil {
		t.Fatalf("select 1: %v", err)
	}
}

func TestSQLiteStore_AskRequestsTableExists(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, ".oracle.db")
	store, err := NewSQLiteStore(dbPath)
	if err != nil {
		t.Fatalf("new sqlite store: %v", err)
	}
	defer store.Close()

	var count int
	if err := store.DB().QueryRowContext(
		context.Background(),
		`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ask_requests'`,
	).Scan(&count); err != nil {
		t.Fatalf("lookup ask_requests table: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected ask_requests table to exist, count=%d", count)
	}
}

// TestSQLiteStore_RelationalRoundTrip verifies that SaveTree writes relational
// tables and LoadTree reconstructs the tree faithfully, including nodes,
// local-path assignments, bundle members, corpus entries, and parent-child
// relationships derived from parent_id.
func TestSQLiteStore_RelationalRoundTrip(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, ".oracle.db")
	s, err := NewSQLiteStore(dbPath)
	if err != nil {
		t.Fatalf("new sqlite store: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })

	ctx := context.Background()

	// Build a tree with:
	//   root -> child1, child2
	//   child1 -> grandchild
	// Each node has local paths, some have bundle members.
	opTime := time.Date(2025, 6, 15, 10, 30, 0, 0, time.UTC)

	root := &prlmnode.Node{
		ID:             "root",
		Path:           ".",
		LocalPaths:     []string{"README.md", "go.mod"},
		Capacity:       100,
		Status:         prlmnode.NodeStatusReady,
		StalenessState: prlmnode.StalenessClean,
	}
	child1 := &prlmnode.Node{
		ID:             "child1",
		ParentID:       "root",
		Path:           "pkg/",
		LocalPaths:     []string{"pkg/a.go", "pkg/b.go"},
		Capacity:       50,
		Status:         prlmnode.NodeStatusOperating,
		StalenessState: prlmnode.StalenessContent,
		LastOperatedAt: opTime,
		Error:          "partial failure",
		BundleMembers:  []string{"pkg/a.go", "pkg/b.go"},
	}
	child2 := &prlmnode.Node{
		ID:             "child2",
		ParentID:       "root",
		Path:           "cmd/",
		LocalPaths:     []string{"cmd/main.go"},
		Capacity:       30,
		Status:         prlmnode.NodeStatusCreated,
		StalenessState: prlmnode.StalenessClean,
	}
	grandchild := &prlmnode.Node{
		ID:             "grandchild",
		ParentID:       "child1",
		Path:           "pkg/sub/",
		LocalPaths:     []string{"pkg/sub/c.go"},
		Capacity:       20,
		Status:         prlmnode.NodeStatusReady,
		StalenessState: prlmnode.StalenessStructural,
		BundleMembers:  []string{"pkg/sub/c.go", "pkg/sub/d.go"},
	}

	tree := &prlmtree.Tree{
		ID:       "relational-test",
		RootPath: "/tmp/myrepo",
		RootID:   "root",
		Nodes: map[string]*prlmnode.Node{
			"root":       root,
			"child1":     child1,
			"child2":     child2,
			"grandchild": grandchild,
		},
		Index: map[string]prlmnode.CorpusEntry{
			"README.md":    {Path: "README.md", Tokens: 10, Hash: "h1", Content: "should not persist"},
			"go.mod":       {Path: "go.mod", Tokens: 5, Hash: "h2"},
			"pkg/a.go":     {Path: "pkg/a.go", Tokens: 100, Hash: "h3"},
			"pkg/b.go":     {Path: "pkg/b.go", Tokens: 80, Hash: "h4"},
			"cmd/main.go":  {Path: "cmd/main.go", Tokens: 60, Hash: "h5"},
			"pkg/sub/c.go": {Path: "pkg/sub/c.go", Tokens: 40, Hash: "h6"},
		},
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}

	// Set ChildIDs on the original tree (they get derived on load, but we need them for comparison).
	root.ChildIDs = []string{"child1", "child2"}
	child1.ChildIDs = []string{"grandchild"}

	// Save
	if err := s.SaveTree(ctx, tree); err != nil {
		t.Fatalf("SaveTree: %v", err)
	}

	// Load
	loaded, err := s.LoadTree(ctx, "relational-test")
	if err != nil {
		t.Fatalf("LoadTree: %v", err)
	}

	// -- Verify node count --
	if len(loaded.Nodes) != 4 {
		t.Fatalf("expected 4 nodes, got %d", len(loaded.Nodes))
	}

	// -- Verify tree header --
	if loaded.ID != tree.ID {
		t.Errorf("ID: want %q, got %q", tree.ID, loaded.ID)
	}
	if loaded.RootPath != tree.RootPath {
		t.Errorf("RootPath: want %q, got %q", tree.RootPath, loaded.RootPath)
	}
	if loaded.RootID != tree.RootID {
		t.Errorf("RootID: want %q, got %q", tree.RootID, loaded.RootID)
	}

	// -- Verify each node --
	for _, wantNode := range []*prlmnode.Node{root, child1, child2, grandchild} {
		got, ok := loaded.Nodes[wantNode.ID]
		if !ok {
			t.Fatalf("missing node %q", wantNode.ID)
		}
		if got.ParentID != wantNode.ParentID {
			t.Errorf("node %s ParentID: want %q, got %q", wantNode.ID, wantNode.ParentID, got.ParentID)
		}
		if got.Path != wantNode.Path {
			t.Errorf("node %s Path: want %q, got %q", wantNode.ID, wantNode.Path, got.Path)
		}
		if got.Capacity != wantNode.Capacity {
			t.Errorf("node %s Capacity: want %d, got %d", wantNode.ID, wantNode.Capacity, got.Capacity)
		}
		if got.Status != wantNode.Status {
			t.Errorf("node %s Status: want %q, got %q", wantNode.ID, wantNode.Status, got.Status)
		}
		if got.StalenessState != wantNode.StalenessState {
			t.Errorf("node %s StalenessState: want %q, got %q", wantNode.ID, wantNode.StalenessState, got.StalenessState)
		}
		if got.Error != wantNode.Error {
			t.Errorf("node %s Error: want %q, got %q", wantNode.ID, wantNode.Error, got.Error)
		}

		// LocalPaths (order may differ)
		gotPaths := append([]string(nil), got.LocalPaths...)
		wantPaths := append([]string(nil), wantNode.LocalPaths...)
		sort.Strings(gotPaths)
		sort.Strings(wantPaths)
		if len(gotPaths) != len(wantPaths) {
			t.Errorf("node %s LocalPaths count: want %d, got %d", wantNode.ID, len(wantPaths), len(gotPaths))
		} else {
			for i := range gotPaths {
				if gotPaths[i] != wantPaths[i] {
					t.Errorf("node %s LocalPaths[%d]: want %q, got %q", wantNode.ID, i, wantPaths[i], gotPaths[i])
				}
			}
		}

		// BundleMembers (order may differ)
		gotBundles := append([]string(nil), got.BundleMembers...)
		wantBundles := append([]string(nil), wantNode.BundleMembers...)
		sort.Strings(gotBundles)
		sort.Strings(wantBundles)
		if len(gotBundles) != len(wantBundles) {
			t.Errorf("node %s BundleMembers count: want %d, got %d", wantNode.ID, len(wantBundles), len(gotBundles))
		} else {
			for i := range gotBundles {
				if gotBundles[i] != wantBundles[i] {
					t.Errorf("node %s BundleMembers[%d]: want %q, got %q", wantNode.ID, i, wantBundles[i], gotBundles[i])
				}
			}
		}

		// ChildIDs (derived from parent_id, order may differ)
		gotChildren := append([]string(nil), got.ChildIDs...)
		wantChildren := append([]string(nil), wantNode.ChildIDs...)
		sort.Strings(gotChildren)
		sort.Strings(wantChildren)
		if len(gotChildren) != len(wantChildren) {
			t.Errorf("node %s ChildIDs count: want %d, got %d", wantNode.ID, len(wantChildren), len(gotChildren))
		} else {
			for i := range gotChildren {
				if gotChildren[i] != wantChildren[i] {
					t.Errorf("node %s ChildIDs[%d]: want %q, got %q", wantNode.ID, i, wantChildren[i], gotChildren[i])
				}
			}
		}
	}

	// -- Verify LastOperatedAt round-trip (unix second precision) --
	loadedChild1 := loaded.Nodes["child1"]
	if loadedChild1.LastOperatedAt.Unix() != opTime.Unix() {
		t.Errorf("child1 LastOperatedAt: want %v, got %v", opTime, loadedChild1.LastOperatedAt)
	}

	// -- Verify corpus entries (Content must be empty) --
	if len(loaded.Index) != len(tree.Index) {
		t.Fatalf("corpus entries: want %d, got %d", len(tree.Index), len(loaded.Index))
	}
	for path, want := range tree.Index {
		got, ok := loaded.Index[path]
		if !ok {
			t.Fatalf("missing corpus entry %q", path)
		}
		if got.Tokens != want.Tokens {
			t.Errorf("corpus %s Tokens: want %d, got %d", path, want.Tokens, got.Tokens)
		}
		if got.Hash != want.Hash {
			t.Errorf("corpus %s Hash: want %q, got %q", path, want.Hash, got.Hash)
		}
		if got.Content != "" {
			t.Errorf("corpus %s Content: expected empty, got %q", path, got.Content)
		}
	}

	// -- Verify idempotent save (overwrite should not duplicate rows) --
	if err := s.SaveTree(ctx, tree); err != nil {
		t.Fatalf("second SaveTree: %v", err)
	}
	reloaded, err := s.LoadTree(ctx, "relational-test")
	if err != nil {
		t.Fatalf("reload after second save: %v", err)
	}
	if len(reloaded.Nodes) != 4 {
		t.Errorf("after idempotent save: expected 4 nodes, got %d", len(reloaded.Nodes))
	}
	if len(reloaded.Index) != 6 {
		t.Errorf("after idempotent save: expected 6 corpus entries, got %d", len(reloaded.Index))
	}

	// -- Verify delete cascades relational tables --
	if err := s.DeleteTree(ctx, "relational-test"); err != nil {
		t.Fatalf("DeleteTree: %v", err)
	}
	if _, err := s.LoadTree(ctx, "relational-test"); err == nil {
		t.Fatal("expected tree not found after delete")
	}
	// Verify relational rows are gone.
	for _, tbl := range []string{"agent_nodes", "agent_node_files", "agent_node_bundles", "corpus_entries"} {
		var cnt int
		if err := s.DB().QueryRowContext(ctx, `SELECT COUNT(*) FROM `+tbl+` WHERE index_id = ?`, "relational-test").Scan(&cnt); err != nil {
			t.Fatalf("count %s: %v", tbl, err)
		}
		if cnt != 0 {
			t.Errorf("expected 0 rows in %s after delete, got %d", tbl, cnt)
		}
	}
}
