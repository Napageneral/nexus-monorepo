package git

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

var scpRemotePattern = regexp.MustCompile(`^(?:[^@]+@)?([^:]+):(.+)$`)

// AdapterOptions configures deterministic mirror/worktree roots.
type AdapterOptions struct {
	MirrorsRoot   string
	WorktreesRoot string
}

// MirrorState reports mirror location and whether it was created this call.
type MirrorState struct {
	Path    string
	Created bool
}

// WorktreeState reports worktree location and whether it was created this call.
type WorktreeState struct {
	Path    string
	Created bool
}

// Adapter manages mirror fetch + pinned worktree materialization.
type Adapter struct {
	mirrorsRoot   string
	worktreesRoot string
}

func NewAdapter(opts AdapterOptions) (*Adapter, error) {
	mirrorsRoot := strings.TrimSpace(opts.MirrorsRoot)
	if mirrorsRoot == "" {
		return nil, fmt.Errorf("mirrors root is required")
	}
	worktreesRoot := strings.TrimSpace(opts.WorktreesRoot)
	if worktreesRoot == "" {
		return nil, fmt.Errorf("worktrees root is required")
	}
	absMirrors, err := filepath.Abs(mirrorsRoot)
	if err != nil {
		return nil, fmt.Errorf("resolve mirrors root: %w", err)
	}
	absWorktrees, err := filepath.Abs(worktreesRoot)
	if err != nil {
		return nil, fmt.Errorf("resolve worktrees root: %w", err)
	}
	return &Adapter{
		mirrorsRoot:   absMirrors,
		worktreesRoot: absWorktrees,
	}, nil
}

// MirrorPath resolves the deterministic mirror path for a remote URL.
func (a *Adapter) MirrorPath(remoteURL string) (string, error) {
	if a == nil {
		return "", fmt.Errorf("git adapter is not configured")
	}
	normalized, err := normalizeRemote(remoteURL)
	if err != nil {
		return "", err
	}
	if host, owner, repo, ok := parseRemoteIdentity(normalized); ok {
		return filepath.Join(
			a.mirrorsRoot,
			sanitizePathSegment(host),
			sanitizePathSegment(owner),
			sanitizePathSegment(repo)+".git",
		), nil
	}
	sum := sha1.Sum([]byte(normalized))
	return filepath.Join(a.mirrorsRoot, "local", hex.EncodeToString(sum[:])+".git"), nil
}

// EnsureMirror creates or refreshes a bare mirror for remoteURL.
func (a *Adapter) EnsureMirror(ctx context.Context, remoteURL string) (MirrorState, error) {
	mirrorPath, err := a.MirrorPath(remoteURL)
	if err != nil {
		return MirrorState{}, err
	}
	normalized, err := normalizeRemote(remoteURL)
	if err != nil {
		return MirrorState{}, err
	}
	if err := os.MkdirAll(filepath.Dir(mirrorPath), 0o755); err != nil {
		return MirrorState{}, fmt.Errorf("create mirror parent: %w", err)
	}

	if _, err := os.Stat(mirrorPath); err == nil {
		if _, err := runGit(ctx, "", "--git-dir", mirrorPath, "remote", "set-url", "origin", normalized); err != nil {
			return MirrorState{}, err
		}
		if _, err := runGit(ctx, "", "--git-dir", mirrorPath, "fetch", "--prune", "--tags", "origin"); err != nil {
			return MirrorState{}, err
		}
		return MirrorState{Path: mirrorPath, Created: false}, nil
	} else if !os.IsNotExist(err) {
		return MirrorState{}, fmt.Errorf("stat mirror path: %w", err)
	}

	if _, err := runGit(ctx, "", "clone", "--mirror", normalized, mirrorPath); err != nil {
		return MirrorState{}, err
	}
	return MirrorState{Path: mirrorPath, Created: true}, nil
}

// ResolveCommit returns immutable commit SHA for ref in a mirror.
func (a *Adapter) ResolveCommit(ctx context.Context, mirrorPath string, ref string) (string, error) {
	if a == nil {
		return "", fmt.Errorf("git adapter is not configured")
	}
	mirrorPath = strings.TrimSpace(mirrorPath)
	if mirrorPath == "" {
		return "", fmt.Errorf("mirror path is required")
	}
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return "", fmt.Errorf("ref is required")
	}
	sha, err := runGit(ctx, "", "--git-dir", mirrorPath, "rev-parse", "--verify", ref+"^{commit}")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(sha), nil
}

// EnsurePinnedWorktree materializes or reuses a detached worktree for repoID+commitSHA.
func (a *Adapter) EnsurePinnedWorktree(ctx context.Context, repoID string, mirrorPath string, commitSHA string) (WorktreeState, error) {
	if a == nil {
		return WorktreeState{}, fmt.Errorf("git adapter is not configured")
	}
	repoID = sanitizePathSegment(strings.TrimSpace(repoID))
	if repoID == "" {
		return WorktreeState{}, fmt.Errorf("repo id is required")
	}
	mirrorPath = strings.TrimSpace(mirrorPath)
	if mirrorPath == "" {
		return WorktreeState{}, fmt.Errorf("mirror path is required")
	}
	commitSHA = strings.TrimSpace(strings.ToLower(commitSHA))
	if !isHexCommit(commitSHA) {
		return WorktreeState{}, fmt.Errorf("commit sha is invalid: %q", commitSHA)
	}

	worktreePath := filepath.Join(a.worktreesRoot, repoID, commitSHA)
	if err := os.MkdirAll(filepath.Dir(worktreePath), 0o755); err != nil {
		return WorktreeState{}, fmt.Errorf("create worktree parent: %w", err)
	}

	if _, err := os.Stat(worktreePath); err == nil {
		head, headErr := runGit(ctx, worktreePath, "rev-parse", "--verify", "HEAD")
		if headErr != nil {
			return WorktreeState{}, headErr
		}
		if !sameCommit(strings.TrimSpace(head), commitSHA) {
			return WorktreeState{}, fmt.Errorf("existing worktree head %q does not match commit %q", strings.TrimSpace(head), commitSHA)
		}
		return WorktreeState{Path: worktreePath, Created: false}, nil
	} else if !os.IsNotExist(err) {
		return WorktreeState{}, fmt.Errorf("stat worktree path: %w", err)
	}

	if _, err := runGit(ctx, "", "--git-dir", mirrorPath, "worktree", "add", "--detach", worktreePath, commitSHA); err != nil {
		return WorktreeState{}, err
	}
	head, err := runGit(ctx, worktreePath, "rev-parse", "--verify", "HEAD")
	if err != nil {
		return WorktreeState{}, err
	}
	if !sameCommit(strings.TrimSpace(head), commitSHA) {
		return WorktreeState{}, fmt.Errorf("materialized worktree head %q does not match commit %q", strings.TrimSpace(head), commitSHA)
	}
	return WorktreeState{Path: worktreePath, Created: true}, nil
}

func normalizeRemote(remoteURL string) (string, error) {
	remoteURL = strings.TrimSpace(remoteURL)
	if remoteURL == "" {
		return "", fmt.Errorf("remote url is required")
	}
	if looksLikeSCPRemote(remoteURL) {
		return remoteURL, nil
	}
	parsed, err := url.Parse(remoteURL)
	if err == nil && parsed.Scheme != "" {
		if parsed.Scheme == "file" {
			path := filepath.Clean(parsed.Path)
			absPath, absErr := filepath.Abs(path)
			if absErr == nil {
				return "file://" + absPath, nil
			}
			return "file://" + path, nil
		}
		return remoteURL, nil
	}
	absPath, err := filepath.Abs(remoteURL)
	if err != nil {
		return "", fmt.Errorf("resolve remote path: %w", err)
	}
	return absPath, nil
}

func parseRemoteIdentity(remote string) (host string, owner string, repo string, ok bool) {
	parsed, err := url.Parse(remote)
	if err == nil && parsed.Scheme != "" {
		parsedHost := strings.ToLower(strings.TrimSpace(parsed.Hostname()))
		parts := splitPath(parsed.Path)
		if parsedHost != "" && len(parts) >= 2 {
			return parsedHost, parts[len(parts)-2], trimGitSuffix(parts[len(parts)-1]), true
		}
		return "", "", "", false
	}
	matches := scpRemotePattern.FindStringSubmatch(remote)
	if len(matches) == 3 {
		scpHost := strings.ToLower(strings.TrimSpace(matches[1]))
		parts := splitPath(matches[2])
		if scpHost != "" && len(parts) >= 2 {
			return scpHost, parts[len(parts)-2], trimGitSuffix(parts[len(parts)-1]), true
		}
	}
	return "", "", "", false
}

func looksLikeSCPRemote(remote string) bool {
	matches := scpRemotePattern.FindStringSubmatch(remote)
	return len(matches) == 3
}

func splitPath(raw string) []string {
	raw = strings.TrimSpace(raw)
	raw = strings.Trim(raw, "/")
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, "/")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		out = append(out, part)
	}
	return out
}

func trimGitSuffix(name string) string {
	name = strings.TrimSpace(name)
	name = strings.TrimSuffix(name, ".git")
	return name
}

func sanitizePathSegment(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			b.WriteRune(r)
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_' || r == '.':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	return strings.Trim(strings.TrimSpace(b.String()), "._")
}

func isHexCommit(s string) bool {
	if len(s) < 7 || len(s) > 64 {
		return false
	}
	for _, r := range s {
		if (r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') {
			continue
		}
		return false
	}
	return true
}

func sameCommit(a string, b string) bool {
	a = strings.ToLower(strings.TrimSpace(a))
	b = strings.ToLower(strings.TrimSpace(b))
	return strings.HasPrefix(a, b) || strings.HasPrefix(b, a)
}

func runGit(ctx context.Context, dir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	if strings.TrimSpace(dir) != "" {
		cmd.Dir = dir
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			return "", fmt.Errorf("git %s: %w", strings.Join(args, " "), err)
		}
		return "", fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, msg)
	}
	return strings.TrimSpace(string(out)), nil
}
