package tree

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// preserveSandboxDir moves (or copies) a sandbox directory into a persistent
// location for post-mortem inspection. Returns the destination path.
func preserveSandboxDir(baseDir, agentID, sandboxDir string) (string, error) {
	baseDir = strings.TrimSpace(baseDir)
	agentID = strings.TrimSpace(agentID)
	src := strings.TrimSpace(sandboxDir)
	if baseDir == "" || agentID == "" || src == "" {
		return "", fmt.Errorf("baseDir, agentID, and sandboxDir are all required")
	}

	if err := os.MkdirAll(filepath.Join(baseDir, agentID), 0o755); err != nil {
		_ = os.RemoveAll(src)
		return "", err
	}

	dst := filepath.Join(baseDir, agentID, fmt.Sprintf("run-%d", time.Now().UTC().UnixNano()))

	// Fast path: rename (same device).
	if err := os.Rename(src, dst); err == nil {
		return dst, nil
	}

	// Slow path: cross-device copy.
	if err := copyDir(src, dst); err != nil {
		_ = os.RemoveAll(src)
		_ = os.RemoveAll(dst)
		return "", err
	}
	_ = os.RemoveAll(src)
	return dst, nil
}

// copyDir recursively copies src into dst, preserving directory structure and
// file permissions.
func copyDir(src, dst string) error {
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	return filepath.WalkDir(src, func(p string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(src, p)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		target := filepath.Join(dst, rel)

		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}

		info, err := d.Info()
		if err != nil {
			return err
		}
		perm := info.Mode().Perm()
		if perm == 0 {
			perm = 0o644
		}

		in, err := os.Open(p)
		if err != nil {
			return err
		}
		defer in.Close()

		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, perm)
		if err != nil {
			return err
		}
		if _, err := io.Copy(out, in); err != nil {
			_ = out.Close()
			return err
		}
		return out.Close()
	})
}
