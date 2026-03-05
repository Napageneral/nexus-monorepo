package tree

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/Napageneral/spike/internal/ignore"
	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
	tokenizerpkg "github.com/Napageneral/spike/internal/tokenizer"
)

// CodeSubstrate is the filesystem+code implementation used by OracleTree.
// It owns filesystem survey/domain/staleness behavior and wires in
// internal/tokenizer for real BPE token counting.
type CodeSubstrate struct {
	tokenizer tokenizerpkg.Tokenizer
	db        *sql.DB
}

func NewCodeSubstrate(db *sql.DB) (*CodeSubstrate, error) {
	tok, err := tokenizerpkg.NewAnthropicTokenizer()
	if err != nil {
		return nil, fmt.Errorf("init default tokenizer: %w", err)
	}
	return &CodeSubstrate{
		tokenizer: tok,
		db:        db,
	}, nil
}

func (s *CodeSubstrate) Survey(ctx context.Context, rootPath string) ([]prlmnode.CorpusEntry, error) {
	_ = ctx
	rootPath, err := filepath.Abs(rootPath)
	if err != nil {
		return nil, err
	}
	spec, _ := ignore.LoadSpec(rootPath)

	var entries []prlmnode.CorpusEntry
	err = filepath.WalkDir(rootPath, func(abs string, d os.DirEntry, walkErr error) error {
		// Be permissive: skip unreadable paths rather than failing the entire init.
		if walkErr != nil {
			return nil
		}
		if d.IsDir() {
			switch d.Name() {
			case ".git", ".intent":
				return filepath.SkipDir
			}
			if d.Type()&os.ModeSymlink != 0 {
				return filepath.SkipDir
			}
			if spec != nil && spec.MatchPath(abs, true) {
				return filepath.SkipDir
			}
			return nil
		}
		if spec != nil && spec.MatchPath(abs, false) {
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		if info, err := d.Info(); err == nil && !info.Mode().IsRegular() {
			return nil
		}

		rel, err := filepath.Rel(rootPath, abs)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if rel == "." || rel == "" {
			return nil
		}

		b, err := os.ReadFile(abs)
		if err != nil {
			return nil
		}
		tokens := s.CountTokens(string(b))
		if tokens <= 0 {
			tokens = 1
		}
		entries = append(entries, prlmnode.CorpusEntry{
			Path:    rel,
			Tokens:  tokens,
			Hash:    hashBytes(b),
			Content: "",
		})
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
	return entries, nil
}

func (s *CodeSubstrate) AssembleDomain(
	ctx context.Context,
	tree *Tree,
	node *prlmnode.Node,
	view prlmnode.Domain,
) (*prlmnode.Domain, error) {
	return s.buildDomainFilesystemFromView(ctx, tree, node, view)
}

func (s *CodeSubstrate) CheckStaleness(tree *Tree, node *prlmnode.Node) prlmnode.StalenessKind {
	return s.computeStalenessFilesystem(tree, node)
}

func (s *CodeSubstrate) CountTokens(text string) int {
	if s == nil || s.tokenizer == nil {
		return 0
	}
	return s.tokenizer.Count(text)
}

func (s *CodeSubstrate) buildDomainFilesystemFromView(
	ctx context.Context,
	tr *Tree,
	n *prlmnode.Node,
	d prlmnode.Domain,
) (*prlmnode.Domain, error) {
	_ = ctx
	if tr == nil || n == nil {
		return &prlmnode.Domain{}, nil
	}

	// Fill file content for all local files. The tree's token-budget-aware
	// partitioning already ensures each node's domain fits within capacity,
	// so we include every file without sampling or truncation.
	for i := range d.Local {
		if strings.TrimSpace(d.Local[i].Path) == "" {
			continue
		}
		abs := filepath.Join(tr.RootPath, filepath.FromSlash(d.Local[i].Path))
		d.Local[i].Content = readFileTruncatedUTF8(abs, 0)
	}
	return &d, nil
}

func (s *CodeSubstrate) computeStalenessFilesystem(tr *Tree, n *prlmnode.Node) prlmnode.StalenessKind {
	_ = s
	if tr == nil || n == nil {
		return prlmnode.StalenessClean
	}

	// Check for modified/missing files in the node's full extent (local + descendants).
	for _, rel := range tr.NodeExtentPaths(n.ID) {
		prev, ok := tr.Index[rel]
		if !ok {
			// Unknown to our snapshot; treat as structural drift.
			return prlmnode.StalenessStructural
		}
		abs := filepath.Join(tr.RootPath, filepath.FromSlash(rel))
		b, err := os.ReadFile(abs)
		if err != nil {
			// Missing / unreadable file changes the corpus shape.
			return prlmnode.StalenessStructural
		}
		if hashBytes(b) != prev.Hash {
			return prlmnode.StalenessContent
		}
	}

	// Detect newly added files under this node's real filesystem scope.
	// Virtual nodes don't correspond to a real directory, so skip this step.
	if isVirtualWorkspaceNode(n.Path) {
		return prlmnode.StalenessClean
	}

	scopeAbs := nodeAbsScope(tr, n)
	spec, _ := ignore.LoadSpec(tr.RootPath)
	err := filepath.WalkDir(scopeAbs, func(abs string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			// If we can't walk scope, assume staleness rather than falsely "clean".
			return errStructuralStale
		}
		if d.IsDir() {
			switch d.Name() {
			case ".git", ".intent":
				return filepath.SkipDir
			}
			if d.Type()&os.ModeSymlink != 0 {
				// Never follow directory symlinks (can escape corpus root).
				return filepath.SkipDir
			}
			if spec != nil && spec.MatchPath(abs, true) {
				return filepath.SkipDir
			}
			return nil
		}
		if spec != nil && spec.MatchPath(abs, false) {
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}

		rel, err := filepath.Rel(tr.RootPath, abs)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if rel == "." || rel == "" {
			return nil
		}

		// If a file exists in scope but not in our snapshot, the structure has changed.
		if _, ok := tr.Index[rel]; !ok {
			return errStructuralStale
		}
		return nil
	})
	if err != nil {
		if err == errStructuralStale {
			return prlmnode.StalenessStructural
		}
		// If we can't walk scope, assume staleness rather than falsely "clean".
		return prlmnode.StalenessContent
	}

	return prlmnode.StalenessClean
}
