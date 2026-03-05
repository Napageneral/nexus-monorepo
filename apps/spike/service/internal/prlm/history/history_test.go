package history_test

import (
	"context"
	"database/sql"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	prlmhistory "github.com/Napageneral/spike/internal/prlm/history"
	_ "modernc.org/sqlite"
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

func TestHistoryAgent_AnalyzeAndQuery(t *testing.T) {
	if !gitAvailable() {
		t.Skip("git not available")
	}

	root := t.TempDir()
	runGit(t, root, "init")

	// Commit 1: add a + b together (co-change signal).
	if err := os.MkdirAll(filepath.Join(root, "a"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(root, "b"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "a", "one.txt"), []byte("one"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "b", "two.txt"), []byte("two"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	runGit(t, root, "add", ".")
	runGit(t, root, "commit", "-m", "add a and b")

	// Commit 2: modify a + b together again.
	if err := os.WriteFile(filepath.Join(root, "a", "one.txt"), []byte("one v2"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "b", "two.txt"), []byte("two v2"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	runGit(t, root, "add", ".")
	runGit(t, root, "commit", "-m", "modify a and b")

	// Commit 3: touch c only.
	if err := os.MkdirAll(filepath.Join(root, "c"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "c", "three.txt"), []byte("three"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	runGit(t, root, "add", ".")
	runGit(t, root, "commit", "-m", "add c")

	stateDir := filepath.Join(root, ".intent", "terrain-history")
	agent, err := prlmhistory.NewHistoryAgent(prlmhistory.Options{
		RootPath: root,
		StateDir: stateDir,
		MaxDepth: 3,
	})
	if err != nil {
		t.Fatalf("new history agent: %v", err)
	}
	if err := agent.Analyze(context.Background()); err != nil {
		t.Fatalf("analyze: %v", err)
	}

	// Stats persisted.
	for _, p := range []string{
		filepath.Join(stateDir, "analysis-state.json"),
		filepath.Join(stateDir, "stats", "co-change.json"),
		filepath.Join(stateDir, "stats", "velocity.json"),
		filepath.Join(stateDir, "stats", "structural-events.json"),
	} {
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("expected %s to exist: %v", p, err)
		}
	}

	ctxA, err := agent.Query("a")
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if ctxA == nil {
		t.Fatalf("expected non-nil context for scope a")
	}
	if len(ctxA.CoChange) == 0 || ctxA.CoChange[0].Dir != "b" {
		t.Fatalf("expected top co-change partner for a to be b, got: %+v", ctxA.CoChange)
	}
	if ctxA.Velocity == nil || ctxA.Velocity.CommitsAll < 2 {
		t.Fatalf("expected velocity for a commits_all >= 2, got: %+v", ctxA.Velocity)
	}
	if len(ctxA.Events) == 0 {
		t.Fatalf("expected structural events for a to be non-empty")
	}

	// Markdown is non-empty and includes key markers.
	md := ctxA.Markdown()
	if !strings.Contains(md, "Co-change") && !strings.Contains(md, "Co-change Partners") {
		t.Fatalf("expected markdown to contain co-change section, got:\n%s", md)
	}
}

func TestHistoryAgent_DBKeysAreNamespacedByScopeKey(t *testing.T) {
	if !gitAvailable() {
		t.Skip("git not available")
	}
	root := t.TempDir()
	runGit(t, root, "init")
	if err := os.MkdirAll(filepath.Join(root, "src"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "src", "a.go"), []byte("package src\n"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	runGit(t, root, "add", ".")
	runGit(t, root, "commit", "-m", "init")

	db, err := sql.Open("sqlite", "file:history_scope_test?mode=memory&cache=shared")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE history (key TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)`); err != nil {
		t.Fatalf("create history table: %v", err)
	}

	agent, err := prlmhistory.NewHistoryAgent(prlmhistory.Options{
		RootPath: root,
		DB:       db,
		ScopeKey: "repo-scope",
		MaxDepth: 3,
	})
	if err != nil {
		t.Fatalf("new history agent: %v", err)
	}
	if err := agent.Analyze(context.Background()); err != nil {
		t.Fatalf("analyze: %v", err)
	}

	rows, err := db.Query(`SELECT key FROM history ORDER BY key`)
	if err != nil {
		t.Fatalf("query keys: %v", err)
	}
	defer rows.Close()

	seen := map[string]bool{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			t.Fatalf("scan key: %v", err)
		}
		seen[key] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("rows err: %v", err)
	}

	for _, key := range []string{
		"history:repo-scope:analysis-state",
		"history:repo-scope:co-change",
		"history:repo-scope:velocity",
		"history:repo-scope:structural-events",
	} {
		if !seen[key] {
			t.Fatalf("expected namespaced key %q", key)
		}
	}
	if seen["co-change"] || seen["velocity"] || seen["structural-events"] {
		t.Fatalf("unexpected unscoped history keys found: %#v", seen)
	}
}
