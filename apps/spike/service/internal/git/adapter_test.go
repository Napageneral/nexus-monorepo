package git

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestAdapterMirrorPathDeterministic(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	adapter, err := NewAdapter(AdapterOptions{
		MirrorsRoot:   filepath.Join(root, "mirrors"),
		WorktreesRoot: filepath.Join(root, "worktrees"),
	})
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	got, err := adapter.MirrorPath("https://github.com/acme/widget.git")
	if err != nil {
		t.Fatalf("mirror path: %v", err)
	}
	want := filepath.Join(root, "mirrors", "github.com", "acme", "widget.git")
	if got != want {
		t.Fatalf("unexpected mirror path: got %q want %q", got, want)
	}

	localPath := filepath.Join(root, "origin.git")
	gotLocal, err := adapter.MirrorPath(localPath)
	if err != nil {
		t.Fatalf("mirror path local: %v", err)
	}
	if !strings.Contains(gotLocal, filepath.Join("mirrors", "local")) {
		t.Fatalf("expected local mirror hash path, got %q", gotLocal)
	}
	if !strings.HasSuffix(gotLocal, ".git") {
		t.Fatalf("expected .git suffix for local mirror path, got %q", gotLocal)
	}
}

func TestAdapterEnsureMirrorResolveAndPinnedWorktree(t *testing.T) {
	root := t.TempDir()
	ctx := context.Background()

	originBare := filepath.Join(root, "origin.git")
	runGitCmd(t, "", "init", "--bare", originBare)

	source := filepath.Join(root, "source")
	if err := os.MkdirAll(source, 0o755); err != nil {
		t.Fatalf("mkdir source: %v", err)
	}
	runGitCmd(t, source, "init")
	runGitCmd(t, source, "config", "user.email", "test@example.com")
	runGitCmd(t, source, "config", "user.name", "Spike Test")
	writeFile(t, filepath.Join(source, "README.md"), "# spike\n")
	runGitCmd(t, source, "add", "README.md")
	runGitCmd(t, source, "commit", "-m", "initial")
	runGitCmd(t, source, "branch", "-M", "main")
	runGitCmd(t, source, "remote", "add", "origin", originBare)
	runGitCmd(t, source, "push", "-u", "origin", "main")

	adapter, err := NewAdapter(AdapterOptions{
		MirrorsRoot:   filepath.Join(root, "mirrors"),
		WorktreesRoot: filepath.Join(root, "worktrees"),
	})
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	mirror1, err := adapter.EnsureMirror(ctx, originBare)
	if err != nil {
		t.Fatalf("ensure mirror initial: %v", err)
	}
	if !mirror1.Created {
		t.Fatalf("expected initial mirror create")
	}
	if _, err := os.Stat(mirror1.Path); err != nil {
		t.Fatalf("mirror path missing: %v", err)
	}

	sha1, err := adapter.ResolveCommit(ctx, mirror1.Path, "refs/heads/main")
	if err != nil {
		t.Fatalf("resolve commit initial: %v", err)
	}
	if len(sha1) != 40 {
		t.Fatalf("expected full commit sha, got %q", sha1)
	}

	worktree1, err := adapter.EnsurePinnedWorktree(ctx, "repo-test", mirror1.Path, sha1)
	if err != nil {
		t.Fatalf("ensure pinned worktree initial: %v", err)
	}
	if !worktree1.Created {
		t.Fatalf("expected initial worktree create")
	}
	head1 := strings.TrimSpace(runGitCmd(t, worktree1.Path, "rev-parse", "--verify", "HEAD"))
	if head1 != sha1 {
		t.Fatalf("unexpected worktree head: got %q want %q", head1, sha1)
	}

	worktreeReuse, err := adapter.EnsurePinnedWorktree(ctx, "repo-test", mirror1.Path, sha1)
	if err != nil {
		t.Fatalf("ensure pinned worktree reuse: %v", err)
	}
	if worktreeReuse.Created {
		t.Fatalf("expected worktree reuse, got created=true")
	}
	if worktreeReuse.Path != worktree1.Path {
		t.Fatalf("expected same worktree path on reuse")
	}

	writeFile(t, filepath.Join(source, "notes.txt"), "v2\n")
	runGitCmd(t, source, "add", "notes.txt")
	runGitCmd(t, source, "commit", "-m", "second")
	runGitCmd(t, source, "push", "origin", "main")

	mirror2, err := adapter.EnsureMirror(ctx, originBare)
	if err != nil {
		t.Fatalf("ensure mirror refresh: %v", err)
	}
	if mirror2.Created {
		t.Fatalf("expected mirror refresh, got created=true")
	}
	if mirror2.Path != mirror1.Path {
		t.Fatalf("expected same mirror path on refresh")
	}

	sha2, err := adapter.ResolveCommit(ctx, mirror2.Path, "refs/heads/main")
	if err != nil {
		t.Fatalf("resolve commit refreshed: %v", err)
	}
	if sha2 == sha1 {
		t.Fatalf("expected new commit sha after push")
	}

	worktree2, err := adapter.EnsurePinnedWorktree(ctx, "repo-test", mirror2.Path, sha2)
	if err != nil {
		t.Fatalf("ensure pinned worktree second commit: %v", err)
	}
	if !worktree2.Created {
		t.Fatalf("expected new pinned worktree for new commit")
	}
	head2 := strings.TrimSpace(runGitCmd(t, worktree2.Path, "rev-parse", "--verify", "HEAD"))
	if head2 != sha2 {
		t.Fatalf("unexpected second worktree head: got %q want %q", head2, sha2)
	}
}

func runGitCmd(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	if strings.TrimSpace(dir) != "" {
		cmd.Dir = dir
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s failed: %v\n%s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return string(out)
}

func writeFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
