package tree

import (
	"testing"

	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
)

func TestDefaultAskPoliciesAreStrictCompleteAndExhaustive(t *testing.T) {
	policies := DefaultAskPolicies().withDefaults()

	if policies.ScopeClassifier == nil {
		t.Fatalf("ScopeClassifier must be set")
	}
	if policies.Routing == nil {
		t.Fatalf("Routing must be set")
	}
	if policies.Execution == nil {
		t.Fatalf("Execution must be set")
	}
	if policies.Synthesis == nil {
		t.Fatalf("Synthesis must be set")
	}
	if policies.Synthesis.AllowDegradedCompletion() {
		t.Fatalf("default synthesis policy must be strict-complete")
	}

	node := prlmnode.NewNode("root", ".", nil, 1000)
	node.ChildIDs = []string{"c2", "c1"}
	got := policies.Routing.RouteChildIDs(nil, node, "query", "interpret")
	if len(got) != 2 || got[0] != "c2" || got[1] != "c1" {
		t.Fatalf("RouteChildIDs = %#v, want original exhaustive child order", got)
	}
}

func TestConservativeScopeClassifierClassifiesEmptyLeaf(t *testing.T) {
	classifier := ConservativeScopeClassifier{}
	node := prlmnode.NewNode("leaf", "empty", nil, 1000)
	domain := &prlmnode.Domain{}

	got := classifier.Classify(nil, node, domain)
	if !got.Terminal {
		t.Fatalf("expected empty leaf to be terminal")
	}
	if got.Kind != ScopeClassificationEmpty {
		t.Fatalf("classification kind = %q, want %q", got.Kind, ScopeClassificationEmpty)
	}
}

func TestConservativeScopeClassifierClassifiesNonCodeAssetLeaf(t *testing.T) {
	classifier := ConservativeScopeClassifier{}
	node := prlmnode.NewNode("leaf", "assets/fonts", []string{
		"static/assets/plugins/iconfonts/fonts/weathericons/weathericons.woff2",
	}, 1000)
	domain := &prlmnode.Domain{
		Local: []prlmnode.CorpusEntry{
			{Path: "static/assets/plugins/iconfonts/fonts/weathericons/weathericons.woff2"},
		},
	}

	got := classifier.Classify(nil, node, domain)
	if !got.Terminal {
		t.Fatalf("expected non-code asset leaf to be terminal")
	}
	if got.Kind != ScopeClassificationNonCodeLeaf {
		t.Fatalf("classification kind = %q, want %q", got.Kind, ScopeClassificationNonCodeLeaf)
	}
}

func TestConservativeScopeClassifierLeavesCodeScopesLive(t *testing.T) {
	classifier := ConservativeScopeClassifier{}
	node := prlmnode.NewNode("leaf", "app/api", []string{"app/api/views/auth.py"}, 1000)
	domain := &prlmnode.Domain{
		Local: []prlmnode.CorpusEntry{
			{Path: "app/api/views/auth.py"},
		},
	}

	got := classifier.Classify(nil, node, domain)
	if got.Terminal {
		t.Fatalf("expected code leaf to require LLM, got terminal classification %#v", got)
	}
	if got.Kind != ScopeClassificationNeedsLLM {
		t.Fatalf("classification kind = %q, want %q", got.Kind, ScopeClassificationNeedsLLM)
	}
}
