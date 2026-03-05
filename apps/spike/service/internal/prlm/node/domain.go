package node

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// CorpusEntry is one corpus artifact indexed by repo-relative path.
type CorpusEntry struct {
	Path    string `json:"path"`
	Tokens  int    `json:"tokens"`
	Content string `json:"content,omitempty"`
	Hash    string `json:"hash"`
}

// ChildContext is what a parent sees from one child.
type ChildContext struct {
	NodeID  string `json:"node_id"`
	Content string `json:"content,omitempty"`
	Tokens  int    `json:"tokens,omitempty"`
}

// AncestorContext is inherited context from one ancestor.
type AncestorContext struct {
	NodeID  string `json:"node_id"`
	Content string `json:"content,omitempty"`
	Tokens  int    `json:"tokens,omitempty"`
}

// Domain is the capacity-bounded node-visible world.
type Domain struct {
	NodeID    string            `json:"node_id"`
	Local     []CorpusEntry     `json:"local"`
	Children  []ChildContext    `json:"children"`
	Ancestors []AncestorContext `json:"ancestors"`
	History   string            `json:"history,omitempty"`
}

// StableHash computes a deterministic hash for any JSON-serializable value.
func StableHash(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// CorpusHashFromEntries returns a deterministic hash for a set of corpus entries.
func CorpusHashFromEntries(entries []CorpusEntry) string {
	if len(entries) == 0 {
		return ""
	}
	copyEntries := append([]CorpusEntry(nil), entries...)
	sort.Slice(copyEntries, func(i, j int) bool {
		return copyEntries[i].Path < copyEntries[j].Path
	})
	rows := make([]string, 0, len(copyEntries))
	for _, e := range copyEntries {
		rows = append(rows, fmt.Sprintf("%s|%d|%s", e.Path, e.Tokens, e.Hash))
	}
	return StableHash(strings.Join(rows, "\n"))
}
