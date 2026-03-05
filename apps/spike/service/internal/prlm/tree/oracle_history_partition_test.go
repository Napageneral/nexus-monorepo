package tree_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	prlmstore "github.com/Napageneral/spike/internal/prlm/store"
	prlmtree "github.com/Napageneral/spike/internal/prlm/tree"
	tokenizerpkg "github.com/Napageneral/spike/internal/tokenizer"
)

func gitAvailable() bool {
	_, err := exec.LookPath("git")
	return err == nil
}

func runGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=test",
		"GIT_AUTHOR_EMAIL=test@example.com",
		"GIT_COMMITTER_NAME=test",
		"GIT_COMMITTER_EMAIL=test@example.com",
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s failed: %v\n%s", strings.Join(args, " "), err, string(out))
	}
}

func TestOracleTree_HistoryBundlesCoupledSiblings(t *testing.T) {
	if !gitAvailable() {
		t.Skip("git not available")
	}

	root := t.TempDir()
	runGit(t, root, "init")
	aV1 := "alpha beta gamma delta"
	bV1 := "one two three four"
	aV2 := "alpha beta gamma delta v2"
	bV2 := "one two three four v2"
	cV1 := "red green blue yellow"

	// Commit 1: add a + b together (co-change signal).
	if err := os.MkdirAll(filepath.Join(root, "a"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(root, "b"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "a", "one.txt"), []byte(aV1), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "b", "two.txt"), []byte(bV1), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	runGit(t, root, "add", ".")
	runGit(t, root, "commit", "-m", "add a and b")

	// Commit 2: modify a + b together again.
	if err := os.WriteFile(filepath.Join(root, "a", "one.txt"), []byte(aV2), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "b", "two.txt"), []byte(bV2), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	runGit(t, root, "add", ".")
	runGit(t, root, "commit", "-m", "modify a and b")

	// Commit 3: add c (not coupled).
	if err := os.MkdirAll(filepath.Join(root, "c"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "c", "three.txt"), []byte(cV1), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	runGit(t, root, "add", ".")
	runGit(t, root, "commit", "-m", "add c")

	// Use tokenizer only to compute a capacity that forces a split.
	tok, err := tokenizerpkg.NewAnthropicTokenizer()
	if err != nil {
		t.Fatalf("new tokenizer: %v", err)
	}
	capacity := tok.Count(aV2) + tok.Count(bV2)
	if capacity <= 0 || tok.Count(cV1) <= 0 {
		t.Fatalf("invalid token counts: a=%d b=%d c=%d", tok.Count(aV2), tok.Count(bV2), tok.Count(cV1))
	}

	store := prlmstore.NewMemStore()
	// History agent is auto-created lazily when Init sees the git repo.
	oracle, err := prlmtree.NewOracleTree(store, prlmtree.OracleTreeOptions{})
	if err != nil {
		t.Fatalf("new oracle tree: %v", err)
	}

	tree, err := oracle.Init(context.Background(), "t1", root, capacity)
	if err != nil {
		t.Fatalf("init: %v", err)
	}

	rootNode := tree.MustNode(tree.RootID)
	if got := len(rootNode.ChildIDs); got != 2 {
		t.Fatalf("expected root to have 2 children after bundling, got %d: %+v", got, rootNode.ChildIDs)
	}

	var bundleNodeID string
	var cNodeID string
	for _, cid := range rootNode.ChildIDs {
		n := tree.MustNode(cid)
		if strings.Contains(n.Path, "@bundle-") {
			bundleNodeID = cid
		}
		if n.Path == "c" {
			cNodeID = cid
		}
	}
	if bundleNodeID == "" {
		t.Fatalf("expected a bundle node child, got: %+v", rootNode.ChildIDs)
	}
	if cNodeID == "" {
		t.Fatalf("expected child node path c, got: %+v", rootNode.ChildIDs)
	}

	bundle := tree.MustNode(bundleNodeID)
	if got := strings.Join(bundle.BundleMembers, ","); got != "a,b" {
		t.Fatalf("expected BundleMembers to be [a,b], got %q", got)
	}
	bundlePaths := strings.Join(bundle.LocalPaths, "\n")
	if !strings.Contains(bundlePaths, "a/one.txt") || !strings.Contains(bundlePaths, "b/two.txt") {
		t.Fatalf("expected bundle local paths to include a + b files, got:\n%s", bundlePaths)
	}
	if strings.Contains(bundlePaths, "c/three.txt") {
		t.Fatalf("expected bundle local paths to exclude c, got:\n%s", bundlePaths)
	}
}
