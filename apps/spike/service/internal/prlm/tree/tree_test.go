package tree

import (
	"testing"

	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
)

func TestTreeInvariants(t *testing.T) {
	entries := []prlmnode.CorpusEntry{
		{Path: "a/one.go", Tokens: 10, Hash: "h1"},
		{Path: "b/two.go", Tokens: 12, Hash: "h2"},
	}
	tree := NewTree("t1", "/tmp/repo", 20, entries)
	root := tree.MustNode(tree.RootID)
	root.LocalPaths = []string{"a/one.go", "b/two.go"}
	child := prlmnode.NewNode("root.c1", "a", []string{"a/one.go"}, 20)
	child.ParentID = root.ID
	if err := tree.AddNode(child); err != nil {
		t.Fatalf("add node: %v", err)
	}
	root.LocalPaths = []string{"b/two.go"}

	if !tree.SingleRootInvariant() {
		t.Fatalf("single root invariant failed")
	}
	if !tree.IsAcyclic() {
		t.Fatalf("acyclic invariant failed")
	}
	if !tree.ValidateOwnershipDisjoint() {
		t.Fatalf("ownership invariant failed")
	}
}

func TestDomainUsesChildInterfacesOnly(t *testing.T) {
	entries := []prlmnode.CorpusEntry{
		{Path: "src/root.go", Tokens: 8, Hash: "h1"},
		{Path: "src/child.go", Tokens: 7, Hash: "h2"},
	}
	tree := NewTree("t2", "/tmp/repo", 10, entries)
	root := tree.MustNode(tree.RootID)
	root.LocalPaths = []string{"src/root.go"}

	child := prlmnode.NewNode("root.c1", "src", []string{"src/child.go"}, 10)
	child.ParentID = root.ID
	if err := tree.AddNode(child); err != nil {
		t.Fatalf("add child: %v", err)
	}

	d := tree.DomainView(root.ID)
	if len(d.Local) != 1 || d.Local[0].Path != "src/root.go" {
		t.Fatalf("unexpected local entries: %+v", d.Local)
	}
	if len(d.Children) != 1 {
		t.Fatalf("expected one child context, got %d", len(d.Children))
	}
	if d.Children[0].NodeID != child.ID {
		t.Fatalf("expected child node id %q, got %q", child.ID, d.Children[0].NodeID)
	}
	for _, e := range d.Local {
		if e.Path == "src/child.go" {
			t.Fatalf("domain leaked child raw corpus into parent local corpus")
		}
	}
}
