package tree_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
	prlmstore "github.com/Napageneral/spike/internal/prlm/store"
	"github.com/Napageneral/spike/internal/prlm/testkit"
	prlmtree "github.com/Napageneral/spike/internal/prlm/tree"
)

func mustNodeStatusByPath(t *testing.T, st *prlmtree.Status, nodePath string) prlmtree.NodeStatus {
	t.Helper()
	for _, ns := range st.Nodes {
		if ns.Path == nodePath {
			return ns
		}
	}
	t.Fatalf("node status not found for path %q", nodePath)
	return prlmtree.NodeStatus{}
}

func mustNodeStatusByID(t *testing.T, st *prlmtree.Status, nodeID string) prlmtree.NodeStatus {
	t.Helper()
	for _, ns := range st.Nodes {
		if ns.ID == nodeID {
			return ns
		}
	}
	t.Fatalf("node status not found for id %q", nodeID)
	return prlmtree.NodeStatus{}
}

func mustOwnerNodeID(t *testing.T, tr *prlmtree.Tree, relPath string) string {
	t.Helper()
	for id, n := range tr.Nodes {
		if n == nil {
			continue
		}
		for _, p := range n.LocalPaths {
			if p == relPath {
				return id
			}
		}
	}
	t.Fatalf("owner node not found for path %q", relPath)
	return ""
}

func TestOracleStatus_ContentStaleOnFileEdit(t *testing.T) {
	root := t.TempDir()
	if err := testkit.WriteCorpus(root, map[string]string{
		"a/one.txt":   "one two three",
		"a/two.txt":   "four five six",
		"b/three.txt": "alpha beta gamma",
		"root.txt":    "top level file",
	}); err != nil {
		t.Fatalf("write corpus: %v", err)
	}

	store := prlmstore.NewMemStore()
	oracle, err := prlmtree.NewOracleTree(store, prlmtree.OracleTreeOptions{
		MaxParallel: 2,
	})
	if err != nil {
		t.Fatalf("new oracle tree: %v", err)
	}
	tr, err := oracle.Init(context.Background(), "t-stale-content", root, 3)
	if err != nil {
		t.Fatalf("init: %v", err)
	}
	ownerID := mustOwnerNodeID(t, tr, "a/one.txt")

	// Edit an existing file: shape unchanged, content changed.
	if err := os.WriteFile(filepath.Join(root, "a", "one.txt"), []byte("ONE TWO THREE CHANGED"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	st, err := oracle.Status(context.Background(), "t-stale-content")
	if err != nil {
		t.Fatalf("status: %v", err)
	}

	owner := mustNodeStatusByID(t, st, ownerID)
	if owner.Staleness != prlmnode.StalenessContent {
		t.Fatalf("expected owner %q to be %q, got %q", owner.ID, prlmnode.StalenessContent, owner.Staleness)
	}
}

func TestOracleStatus_StructuralStaleOnFileAdd(t *testing.T) {
	root := t.TempDir()
	if err := testkit.WriteCorpus(root, map[string]string{
		"a/one.txt":   "one two three",
		"a/two.txt":   "four five six",
		"b/three.txt": "alpha beta gamma",
	}); err != nil {
		t.Fatalf("write corpus: %v", err)
	}

	store := prlmstore.NewMemStore()
	oracle, err := prlmtree.NewOracleTree(store, prlmtree.OracleTreeOptions{
		MaxParallel: 2,
	})
	if err != nil {
		t.Fatalf("new oracle tree: %v", err)
	}
	if _, err := oracle.Init(context.Background(), "t-stale-add", root, 3); err != nil {
		t.Fatalf("init: %v", err)
	}

	// Add a new file under an existing directory: shape changed.
	if err := os.WriteFile(filepath.Join(root, "a", "new.txt"), []byte("brand new file"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	st, err := oracle.Status(context.Background(), "t-stale-add")
	if err != nil {
		t.Fatalf("status: %v", err)
	}

	rootStatus := mustNodeStatusByID(t, st, "root")
	if rootStatus.Staleness != prlmnode.StalenessStructural {
		t.Fatalf("expected root to be %q, got %q", prlmnode.StalenessStructural, rootStatus.Staleness)
	}
}

func TestOracleStatus_StructuralStaleOnFileRemove(t *testing.T) {
	root := t.TempDir()
	if err := testkit.WriteCorpus(root, map[string]string{
		"a/one.txt":   "one two three",
		"a/two.txt":   "four five six",
		"b/three.txt": "alpha beta gamma",
	}); err != nil {
		t.Fatalf("write corpus: %v", err)
	}

	store := prlmstore.NewMemStore()
	oracle, err := prlmtree.NewOracleTree(store, prlmtree.OracleTreeOptions{
		MaxParallel: 2,
	})
	if err != nil {
		t.Fatalf("new oracle tree: %v", err)
	}
	tr, err := oracle.Init(context.Background(), "t-stale-remove", root, 3)
	if err != nil {
		t.Fatalf("init: %v", err)
	}
	ownerID := mustOwnerNodeID(t, tr, "a/two.txt")

	// Remove a previously indexed file: shape changed.
	if err := os.Remove(filepath.Join(root, "a", "two.txt")); err != nil {
		t.Fatalf("remove file: %v", err)
	}

	st, err := oracle.Status(context.Background(), "t-stale-remove")
	if err != nil {
		t.Fatalf("status: %v", err)
	}

	owner := mustNodeStatusByID(t, st, ownerID)
	if owner.Staleness != prlmnode.StalenessStructural {
		t.Fatalf("expected owner %q to be %q, got %q", owner.ID, prlmnode.StalenessStructural, owner.Staleness)
	}
}

func TestOracleSync_RepartitionsAndOwnsNewIndexEntries(t *testing.T) {
	ctx := context.Background()

	root := t.TempDir()
	if err := testkit.WriteCorpus(root, map[string]string{
		"a/one.txt": "one two three",
		"a/two.txt": "four five six",
	}); err != nil {
		t.Fatalf("write corpus: %v", err)
	}

	store := prlmstore.NewMemStore()
	oracle, err := prlmtree.NewOracleTree(store, prlmtree.OracleTreeOptions{
		MaxParallel: 2,
	})
	if err != nil {
		t.Fatalf("new oracle tree: %v", err)
	}
	if _, err := oracle.Init(ctx, "t-sync-repartition", root, 3); err != nil {
		t.Fatalf("init: %v", err)
	}

	// Introduce a structural change that should cause a re-partition at root.
	if err := os.MkdirAll(filepath.Join(root, "c"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "c", "four.txt"), []byte("hello from c"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	report, err := oracle.Sync(ctx, "t-sync-repartition")
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	if len(report.RepartitionedNodeIDs) == 0 {
		t.Fatalf("expected at least one repartitioned node id")
	}

	tr, err := store.LoadTree(ctx, "t-sync-repartition")
	if err != nil {
		t.Fatalf("load tree: %v", err)
	}
	if !tr.SingleRootInvariant() {
		t.Fatalf("single root invariant failed after sync")
	}
	if !tr.IsAcyclic() {
		t.Fatalf("acyclic invariant failed after sync")
	}
	if !tr.ValidateOwnershipDisjoint() {
		t.Fatalf("ownership disjoint invariant failed after sync")
	}

	// Ensure the tree structure reflects the new directory and that every index entry is owned.
	hasC := false
	owners := map[string]string{}
	for _, n := range tr.Nodes {
		if n == nil {
			continue
		}
		if n.Path == "c" {
			hasC = true
		}
		for _, p := range n.LocalPaths {
			if prev, ok := owners[p]; ok && prev != n.ID {
				t.Fatalf("duplicate owner for %q: %q and %q", p, prev, n.ID)
			}
			owners[p] = n.ID
		}
	}
	if !hasC {
		t.Fatalf("expected a node with path %q to exist after sync", "c")
	}
	for p := range tr.Index {
		if _, ok := owners[p]; !ok {
			t.Fatalf("unowned index path after sync: %q", p)
		}
	}
	for p := range owners {
		if _, ok := tr.Index[p]; !ok {
			t.Fatalf("node owns path missing from index after sync: %q", p)
		}
	}
}
