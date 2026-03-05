package testkit

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"sort"
	"strings"

	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
)

func EntriesFromFiles(files map[string]string) []prlmnode.CorpusEntry {
	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	entries := make([]prlmnode.CorpusEntry, 0, len(paths))
	for _, p := range paths {
		content := files[p]
		entries = append(entries, prlmnode.CorpusEntry{
			Path:    filepath.ToSlash(p),
			Tokens:  tokenCount(content),
			Content: content,
			Hash:    hash(content),
		})
	}
	return entries
}

func tokenCount(content string) int {
	if content == "" {
		return 0
	}
	return len(strings.Fields(content))
}

func hash(content string) string {
	sum := sha256.Sum256([]byte(content))
	return hex.EncodeToString(sum[:])
}

func WriteCorpus(root string, files map[string]string) error {
	for rel, body := range files {
		abs := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(abs, []byte(body), 0o644); err != nil {
			return err
		}
	}
	return nil
}
