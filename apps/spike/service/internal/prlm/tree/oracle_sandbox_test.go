package tree

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
)

func TestShouldSkipSandboxPath(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{path: "", want: true},
		{path: ".", want: true},
		{path: ".intent/memory.md", want: true},
		{path: "_context/children/root.c1.md", want: true},
		{path: "_repl/repl_vars.json", want: true},
		{path: "src/_context/real_file.go", want: false},
		{path: "src/.intent/real_file.go", want: false},
		{path: "README.md", want: false},
	}
	for _, tc := range cases {
		got := shouldSkipSandboxPath(tc.path)
		if got != tc.want {
			t.Fatalf("shouldSkipSandboxPath(%q) = %v, want %v", tc.path, got, tc.want)
		}
	}
}

func TestPopulateSandboxSkipsLegacySidecarPaths(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "src", "app.go"), "package main\n")
	writeFile(t, filepath.Join(root, ".intent", "memory.md"), "stateful memory\n")
	writeFile(t, filepath.Join(root, "_context", "history.md"), "old context\n")
	writeFile(t, filepath.Join(root, "_repl", "repl_vars.json"), "{}\n")

	tree := &Tree{
		ID:       "tree-sandbox",
		RootPath: root,
		RootID:   "root",
		Nodes: map[string]*prlmnode.Node{
			"root": {ID: "root", Path: "."},
		},
		Index: map[string]prlmnode.CorpusEntry{},
	}
	domain := &prlmnode.Domain{
		NodeID: "root",
		Local: []prlmnode.CorpusEntry{
			{Path: "src/app.go"},
			{Path: ".intent/memory.md"},
			{Path: "_context/history.md"},
			{Path: "_repl/repl_vars.json"},
		},
	}
	sandbox := t.TempDir()

	if err := populateSandbox(context.Background(), tree, tree.MustNode("root"), domain, sandbox); err != nil {
		t.Fatalf("populateSandbox: %v", err)
	}
	if _, err := os.Stat(filepath.Join(sandbox, "src", "app.go")); err != nil {
		t.Fatalf("expected scoped source file in sandbox: %v", err)
	}
	if _, err := os.Stat(filepath.Join(sandbox, ".intent", "memory.md")); !os.IsNotExist(err) {
		t.Fatalf("expected .intent sidecar to be skipped, stat err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(sandbox, "_context", "history.md")); !os.IsNotExist(err) {
		t.Fatalf("expected _context sidecar to be skipped, stat err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(sandbox, "_repl", "repl_vars.json")); !os.IsNotExist(err) {
		t.Fatalf("expected _repl sidecar to be skipped, stat err=%v", err)
	}
}

func TestResolveOrBuildSandboxRebuildsPersistentSandbox(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "src", "main.go"), "package main // v1\n")

	tree := &Tree{
		ID:       "tree-persistent-sandbox",
		RootPath: root,
		RootID:   "root",
		Nodes: map[string]*prlmnode.Node{
			"root": {ID: "root", Path: "src"},
		},
		Index: map[string]prlmnode.CorpusEntry{},
	}
	domain := &prlmnode.Domain{
		NodeID: "root",
		Local: []prlmnode.CorpusEntry{
			{Path: "src/main.go"},
		},
	}
	nodeCtx := &NodeContext{
		SandboxBaseDir: t.TempDir(),
	}

	sandboxDir, ephemeral, err := nodeCtx.resolveOrBuildSandbox(context.Background(), tree, tree.MustNode("root"), domain)
	if err != nil {
		t.Fatalf("resolveOrBuildSandbox first call: %v", err)
	}
	if ephemeral {
		t.Fatalf("expected persistent sandbox, got ephemeral=true")
	}

	// Simulate stale artifacts from an older binary/run.
	writeFile(t, filepath.Join(sandboxDir, "_context", "children", "root.c1.md"), "stale sidecar\n")
	writeFile(t, filepath.Join(sandboxDir, "stale.txt"), "stale data\n")
	writeFile(t, filepath.Join(root, "src", "main.go"), "package main // v2\n")

	sandboxDir2, ephemeral2, err := nodeCtx.resolveOrBuildSandbox(context.Background(), tree, tree.MustNode("root"), domain)
	if err != nil {
		t.Fatalf("resolveOrBuildSandbox second call: %v", err)
	}
	if sandboxDir2 != sandboxDir {
		t.Fatalf("expected same persistent sandbox path, got %q and %q", sandboxDir, sandboxDir2)
	}
	if ephemeral2 {
		t.Fatalf("expected persistent sandbox on second call, got ephemeral=true")
	}
	if _, err := os.Stat(filepath.Join(sandboxDir, "stale.txt")); !os.IsNotExist(err) {
		t.Fatalf("expected stale file to be removed, stat err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(sandboxDir, "_context", "children", "root.c1.md")); !os.IsNotExist(err) {
		t.Fatalf("expected stale sidecar to be removed, stat err=%v", err)
	}

	content, err := os.ReadFile(filepath.Join(sandboxDir, "main.go"))
	if err != nil {
		t.Fatalf("read rebuilt sandbox file: %v", err)
	}
	if got := string(content); got != "package main // v2\n" {
		t.Fatalf("expected rebuilt sandbox to use latest source, got %q", got)
	}
}

func writeFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
