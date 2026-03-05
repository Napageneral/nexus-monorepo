package tree

import (
	"fmt"
	"testing"

	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
)

func TestRoutingTerms_SplitsAndFilters(t *testing.T) {
	terms := routingTerms("How does internal/prlm-tree route_children work in oracle.go?")

	assertHas := func(s string) {
		t.Helper()
		for _, term := range terms {
			if term == s {
				return
			}
		}
		t.Fatalf("expected routing terms to include %q, got: %v", s, terms)
	}
	assertNotHas := func(s string) {
		t.Helper()
		for _, term := range terms {
			if term == s {
				t.Fatalf("expected routing terms NOT to include %q, got: %v", s, terms)
			}
		}
	}

	assertNotHas("how")
	assertNotHas("does")
	assertHas("internal/prlm-tree")
	assertHas("internal")
	assertHas("prlm")
	assertHas("tree")
	assertHas("route_children")
	assertHas("route")
	assertHas("children")
	assertHas("oracle.go")
	assertHas("oracle")
}

func TestRouteChildren_PrefersLeafNameMatch(t *testing.T) {
	entries := []prlmnode.CorpusEntry{
		{Path: "broker/agent.go", Tokens: 50, Hash: "h1"},
		{Path: "runtime/client.go", Tokens: 5, Hash: "h2"},
		{Path: "docs/readme.md", Tokens: 1, Hash: "h3"},
	}
	tr := NewTree("t-route-leaf", "/tmp/repo", 999, entries)
	root := tr.MustNode(tr.RootID)
	root.LocalPaths = nil

	brokerNode := prlmnode.NewNode("root.c1", "broker", []string{"broker/agent.go"}, 999)
	brokerNode.ParentID = root.ID
	if err := tr.AddNode(brokerNode); err != nil {
		t.Fatalf("add broker child: %v", err)
	}
	runtimeNode := prlmnode.NewNode("root.c2", "runtime", []string{"runtime/client.go"}, 999)
	runtimeNode.ParentID = root.ID
	if err := tr.AddNode(runtimeNode); err != nil {
		t.Fatalf("add runtime child: %v", err)
	}
	docsNode := prlmnode.NewNode("root.c3", "docs", []string{"docs/readme.md"}, 999)
	docsNode.ParentID = root.ID
	if err := tr.AddNode(docsNode); err != nil {
		t.Fatalf("add docs child: %v", err)
	}

	got := NewOracleNode(root, &NodeContext{Tree: tr}).RouteChildren("How does the broker work?")
	if len(got) != 1 {
		t.Fatalf("expected 1 routed child, got %d (%v)", len(got), got)
	}
	if got[0] != brokerNode.ID {
		t.Fatalf("expected broker child %q first, got %v", brokerNode.ID, got)
	}
}

func TestRouteChildren_FallbackBroadcastsAll(t *testing.T) {
	entries := []prlmnode.CorpusEntry{
		{Path: "c1/a.txt", Tokens: 1, Hash: "h1"},
		{Path: "c2/a.txt", Tokens: 10, Hash: "h2"},
		{Path: "c3/a.txt", Tokens: 5, Hash: "h3"},
		{Path: "c4/a.txt", Tokens: 20, Hash: "h4"},
		{Path: "c5/a.txt", Tokens: 15, Hash: "h5"},
	}
	tr := NewTree("t-route-fallback", "/tmp/repo", 999, entries)
	root := tr.MustNode(tr.RootID)
	root.LocalPaths = nil

	children := []*prlmnode.Node{
		prlmnode.NewNode("root.c1", "c1", []string{"c1/a.txt"}, 999),
		prlmnode.NewNode("root.c2", "c2", []string{"c2/a.txt"}, 999),
		prlmnode.NewNode("root.c3", "c3", []string{"c3/a.txt"}, 999),
		prlmnode.NewNode("root.c4", "c4", []string{"c4/a.txt"}, 999),
		prlmnode.NewNode("root.c5", "c5", []string{"c5/a.txt"}, 999),
	}
	for _, child := range children {
		child.ParentID = root.ID
		if err := tr.AddNode(child); err != nil {
			t.Fatalf("add child %q: %v", child.ID, err)
		}
	}

	got := NewOracleNode(root, &NodeContext{Tree: tr}).RouteChildren("completely unrelated query")
	if len(got) != 5 {
		t.Fatalf("expected fallback broadcast to all children, got %d (%v)", len(got), got)
	}
	want := map[string]bool{
		"root.c1": true,
		"root.c2": true,
		"root.c3": true,
		"root.c4": true,
		"root.c5": true,
	}
	for _, cid := range got {
		delete(want, cid)
	}
	if len(want) != 0 {
		t.Fatalf("missing routed children in fallback broadcast: %v (got=%v)", want, got)
	}
}

func TestRouteChildren_DoesNotApplyCap(t *testing.T) {
	entries := []prlmnode.CorpusEntry{}
	for i := 1; i <= 10; i++ {
		suffix := string(rune('a' + i - 1))
		entries = append(entries, prlmnode.CorpusEntry{
			Path:   "src/c" + suffix + "/a.txt",
			Tokens: i,
			Hash:   "h",
		})
	}
	tr := NewTree("t-route-cap", "/tmp/repo", 999, entries)
	root := tr.MustNode(tr.RootID)
	root.LocalPaths = nil

	for i := 1; i <= 10; i++ {
		suffix := string(rune('a' + i - 1))
		path := "src/c" + suffix
		file := path + "/a.txt"
		child := prlmnode.NewNode(fmt.Sprintf("root.c%d", i), path, []string{file}, 999)
		child.ParentID = root.ID
		if err := tr.AddNode(child); err != nil {
			t.Fatalf("add child %q: %v", child.ID, err)
		}
	}

	got := NewOracleNode(root, &NodeContext{Tree: tr}).RouteChildren("please check src logic")
	if len(got) != 10 {
		t.Fatalf("expected all 10 children routed, got %d (%v)", len(got), got)
	}
}
