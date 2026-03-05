package tree_test

import (
	"context"
	"testing"

	prlmstore "github.com/Napageneral/spike/internal/prlm/store"
	"github.com/Napageneral/spike/internal/prlm/testkit"
	prlmtree "github.com/Napageneral/spike/internal/prlm/tree"
)

func TestOracleInitStatusAskRequiresRuntime(t *testing.T) {
	root := t.TempDir()
	if err := testkit.WriteCorpus(root, map[string]string{
		"a.go":    "one two three four five",
		"b/b.go":  "alpha beta gamma delta",
		"b/c.txt": "this is a third file",
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

	// Force a partition so we have at least 2 nodes.
	_, err = oracle.Init(context.Background(), "t1", root, 3)
	if err != nil {
		t.Fatalf("init: %v", err)
	}

	status, err := oracle.Status(context.Background(), "t1")
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if status.NodeCount < 1 {
		t.Fatalf("expected node count >= 1, got %d", status.NodeCount)
	}

	// Ask requires a real LLM runtime; no deterministic fallback path exists.
	_, err = oracle.Ask(context.Background(), "t1", "Where is the code?")
	if err == nil {
		t.Fatalf("expected ask to fail without a runtime")
	}
}
