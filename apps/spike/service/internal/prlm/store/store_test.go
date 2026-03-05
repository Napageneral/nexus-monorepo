package store

import (
	"context"
	"testing"

	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
	prlmtree "github.com/Napageneral/spike/internal/prlm/tree"
)

func TestMemStoreRoundTrip(t *testing.T) {
	store := NewMemStore()
	tree := prlmtree.NewTree("t1", "/tmp/repo", 10, []prlmnode.CorpusEntry{{Path: "a.go", Tokens: 3, Hash: "h"}})
	if err := store.CreateTree(context.Background(), tree); err != nil {
		t.Fatalf("create tree: %v", err)
	}
	loaded, err := store.LoadTree(context.Background(), "t1")
	if err != nil {
		t.Fatalf("load tree: %v", err)
	}
	loaded.RootPath = "/tmp/changed"
	reloaded, err := store.LoadTree(context.Background(), "t1")
	if err != nil {
		t.Fatalf("reload tree: %v", err)
	}
	if reloaded.RootPath != "/tmp/repo" {
		t.Fatalf("expected clone isolation, got %q", reloaded.RootPath)
	}
}
