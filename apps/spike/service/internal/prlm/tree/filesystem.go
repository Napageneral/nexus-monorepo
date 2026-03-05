package tree

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
	"unicode/utf8"

	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
)

const (
	// maxDomainFileReadBytes caps individual file reads to avoid pathological
	// cases (e.g. multi-GB auto-generated files). 10 MB is generous enough
	// for any reasonable source file.
	maxDomainFileReadBytes = 10 * 1024 * 1024
)

var errStructuralStale = fmt.Errorf("structural stale")

func nodeAbsScope(tr *Tree, n *prlmnode.Node) string {
	if tr == nil || n == nil {
		return ""
	}
	if n.Path == "." || strings.TrimSpace(n.Path) == "" {
		return tr.RootPath
	}
	rel := strings.TrimPrefix(filepath.ToSlash(n.Path), "./")
	return filepath.Join(tr.RootPath, filepath.FromSlash(rel))
}

func hashBytes(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func readFileTruncatedUTF8(absPath string, maxBytes int) string {
	if strings.TrimSpace(absPath) == "" {
		return ""
	}
	f, err := os.Open(absPath)
	if err != nil {
		return ""
	}
	defer f.Close()

	if maxBytes <= 0 {
		maxBytes = maxDomainFileReadBytes
	}
	b, err := io.ReadAll(io.LimitReader(f, int64(maxBytes)))
	if err != nil {
		return ""
	}
	if len(b) == 0 {
		return ""
	}

	// Avoid leaking binary blobs into prompts.
	if !utf8.Valid(b) {
		return strings.ToValidUTF8(string(b), "?")
	}
	return string(b)
}

func isVirtualWorkspaceNode(nodePath string) bool {
	clean := path.Clean(nodePath)
	if clean == "" || clean == "." {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(clean, "./"), "/")
	for _, p := range parts {
		if strings.HasPrefix(p, "@chunk-") || strings.HasPrefix(p, "@bundle-") {
			return true
		}
	}
	return false
}
