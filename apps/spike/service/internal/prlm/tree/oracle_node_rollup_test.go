package tree

import (
	"strings"
	"testing"

	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
)

func isGeneratedBundleKey(k string) bool {
	if !strings.HasPrefix(k, "@bundle-") {
		return false
	}
	if len(k) != len("@bundle-")+8 {
		return false
	}
	suf := k[len("@bundle-"):]
	for _, r := range suf {
		switch {
		case r >= '0' && r <= '9':
		case r >= 'a' && r <= 'f':
		default:
			return false
		}
	}
	return true
}

func TestOracleNode_RollupSmallGroups_BundlesSmallRealChildrenEvenWithExistingVirtualChild(t *testing.T) {
	entries := []prlmnode.CorpusEntry{
		{Path: "app/eve/existing/file.txt", Tokens: 30_000, Hash: "h1"},
		{Path: "app/eve/utils/u.txt", Tokens: 900, Hash: "h2"},
		{Path: "app/eve/database/d.txt", Tokens: 14_000, Hash: "h3"},
		{Path: "app/eve/prompts/p.txt", Tokens: 16_000, Hash: "h4"},
	}
	tree := NewTree("t1", "/tmp", 120_000, entries)
	root := tree.MustNode(tree.RootID)

	n := NewOracleNode(root, &NodeContext{Tree: tree})

	groups := map[string][]string{
		"@chunk-1": {"app/eve/existing/file.txt"},
		"utils":    {"app/eve/utils/u.txt"},
		"database": {"app/eve/database/d.txt"},
		"prompts":  {"app/eve/prompts/p.txt"},
	}

	rolled, members := n.rollupSmallGroups("app/eve", groups, tree, MaxLeafTokens)

	if _, ok := rolled["@chunk-1"]; !ok {
		t.Fatalf("expected existing virtual group to remain")
	}
	if _, ok := rolled["utils"]; ok {
		t.Fatalf("expected undersized child utils to be rolled up/hoisted")
	}
	if _, ok := rolled["database"]; ok {
		t.Fatalf("expected undersized child database to be rolled up/hoisted")
	}
	if _, ok := rolled["prompts"]; ok {
		t.Fatalf("expected undersized child prompts to be rolled up/hoisted")
	}

	var gotBundleKey string
	for k := range rolled {
		if isGeneratedBundleKey(k) {
			gotBundleKey = k
			break
		}
	}
	if gotBundleKey == "" {
		t.Fatalf("expected a generated bundle key in rolled groups, got keys: %+v", keysOf(rolled))
	}
	gotMembers := members[gotBundleKey]
	if strings.Join(gotMembers, ",") != "database,prompts,utils" {
		t.Fatalf("expected bundle members to be database,prompts,utils; got %q", strings.Join(gotMembers, ","))
	}
}

func TestOracleNode_RollupSmallGroups_HoistsUndersizedVirtualGroups(t *testing.T) {
	entries := []prlmnode.CorpusEntry{
		{Path: "scope/a/a.txt", Tokens: 1_000, Hash: "ha"},
		{Path: "scope/b/b.txt", Tokens: 25_000, Hash: "hb"},
		{Path: "scope/c/c.txt", Tokens: 25_000, Hash: "hc"},
	}
	tree := NewTree("t2", "/tmp", 120_000, entries)
	root := tree.MustNode(tree.RootID)

	n := NewOracleNode(root, &NodeContext{Tree: tree})

	groups := map[string][]string{
		"@bundle-too-small": {"scope/a/a.txt"},
		"b":                 {"scope/b/b.txt"},
		"c":                 {"scope/c/c.txt"},
	}

	rolled, _ := n.rollupSmallGroups(".", groups, tree, MaxLeafTokens)
	if _, ok := rolled["@bundle-too-small"]; ok {
		t.Fatalf("expected undersized virtual group to be hoisted to parent")
	}
	if _, ok := rolled["b"]; !ok {
		t.Fatalf("expected group b to remain")
	}
	if _, ok := rolled["c"]; !ok {
		t.Fatalf("expected group c to remain")
	}
}

func keysOf(m map[string][]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
