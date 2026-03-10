package tree

import (
	"context"
	"testing"
)

func TestBuildNodeContextCarriesProviderModelAndThinking(t *testing.T) {
	store := &stubStore{}
	oracle, err := NewOracleTree(store, OracleTreeOptions{
		LLMProvider:   "openai-codex",
		LLMModel:      "gpt-5.4",
		ThinkingLevel: "high",
	})
	if err != nil {
		t.Fatalf("new oracle tree: %v", err)
	}

	root := t.TempDir()
	tree := NewTree("t1", root, 1000, nil)
	ctx := oracle.buildNodeContext(tree)

	if ctx.LLMProvider != "openai-codex" {
		t.Fatalf("LLMProvider = %q, want openai-codex", ctx.LLMProvider)
	}
	if ctx.LLMModel != "gpt-5.4" {
		t.Fatalf("LLMModel = %q, want gpt-5.4", ctx.LLMModel)
	}
	if ctx.ThinkingLevel != "high" {
		t.Fatalf("ThinkingLevel = %q, want high", ctx.ThinkingLevel)
	}
}

type stubStore struct{}

func (s *stubStore) CreateTree(context.Context, *Tree) error { return nil }
func (s *stubStore) SaveTree(context.Context, *Tree) error   { return nil }
func (s *stubStore) LoadTree(context.Context, string) (*Tree, error) {
	return nil, ErrTreeNotFound
}
func (s *stubStore) ListTreeIDs(context.Context) ([]string, error) { return nil, nil }
func (s *stubStore) DeleteTree(context.Context, string) error      { return nil }
