package tree

import (
	"context"
	"path/filepath"
	"strings"

	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
)

type AskPhase string

const (
	AskPhaseLeaf       AskPhase = "leaf"
	AskPhaseInterpret  AskPhase = "interpret"
	AskPhaseSynthesize AskPhase = "synthesize"
)

type ScopeClassificationKind string

const (
	ScopeClassificationNeedsLLM    ScopeClassificationKind = "needs_llm"
	ScopeClassificationEmpty       ScopeClassificationKind = "empty_scope"
	ScopeClassificationNonCodeLeaf ScopeClassificationKind = "non_code_leaf"
)

type ScopeClassification struct {
	Kind     ScopeClassificationKind
	Terminal bool
	Content  string
}

type ScopeClassifier interface {
	Classify(tree *Tree, node *prlmnode.Node, domain *prlmnode.Domain) ScopeClassification
}

type RoutingPolicy interface {
	RouteChildIDs(tree *Tree, node *prlmnode.Node, rootQuery string, parentInterpretation string) []string
}

type SynthesisPolicy interface {
	AllowDegradedCompletion() bool
}

type ExecutionPolicy interface {
	PromptContext(ctx context.Context, nodeID string, phase AskPhase) (context.Context, context.CancelFunc)
}

type AskPolicies struct {
	ScopeClassifier ScopeClassifier
	Routing         RoutingPolicy
	Synthesis       SynthesisPolicy
	Execution       ExecutionPolicy
}

func DefaultAskPolicies() AskPolicies {
	return AskPolicies{
		ScopeClassifier: ConservativeScopeClassifier{},
		Routing:         ExhaustiveRoutingPolicy{},
		Synthesis:       StrictCompleteSynthesisPolicy{},
		Execution:       PassthroughExecutionPolicy{},
	}
}

func (p AskPolicies) withDefaults() AskPolicies {
	defaults := DefaultAskPolicies()
	if p.ScopeClassifier == nil {
		p.ScopeClassifier = defaults.ScopeClassifier
	}
	if p.Routing == nil {
		p.Routing = defaults.Routing
	}
	if p.Synthesis == nil {
		p.Synthesis = defaults.Synthesis
	}
	if p.Execution == nil {
		p.Execution = defaults.Execution
	}
	return p
}

type ConservativeScopeClassifier struct{}

func (ConservativeScopeClassifier) Classify(tree *Tree, node *prlmnode.Node, domain *prlmnode.Domain) ScopeClassification {
	if node == nil || domain == nil {
		return ScopeClassification{Kind: ScopeClassificationNeedsLLM}
	}
	if len(node.ChildIDs) > 0 {
		return ScopeClassification{Kind: ScopeClassificationNeedsLLM}
	}
	if len(domain.Local) == 0 {
		return ScopeClassification{
			Kind:     ScopeClassificationEmpty,
			Terminal: true,
			Content:  "No local files were present in this scope. Nothing relevant found here.",
		}
	}

	paths := make([]string, 0, len(domain.Local))
	for _, entry := range domain.Local {
		if rel := strings.TrimSpace(entry.Path); rel != "" {
			paths = append(paths, rel)
		}
	}
	if len(paths) == 0 {
		return ScopeClassification{
			Kind:     ScopeClassificationEmpty,
			Terminal: true,
			Content:  "No local files were present in this scope. Nothing relevant found here.",
		}
	}
	if allNonCodeAssetPaths(paths) {
		list := strings.Join(paths, ", ")
		return ScopeClassification{
			Kind:     ScopeClassificationNonCodeLeaf,
			Terminal: true,
			Content:  "This scope contains only generated or non-code assets (" + list + "). No implementation logic relevant to the task was found here.",
		}
	}
	return ScopeClassification{Kind: ScopeClassificationNeedsLLM}
}

type ExhaustiveRoutingPolicy struct{}

func (ExhaustiveRoutingPolicy) RouteChildIDs(_ *Tree, node *prlmnode.Node, _ string, _ string) []string {
	if node == nil || len(node.ChildIDs) == 0 {
		return nil
	}
	return append([]string(nil), node.ChildIDs...)
}

type StrictCompleteSynthesisPolicy struct{}

func (StrictCompleteSynthesisPolicy) AllowDegradedCompletion() bool { return false }

type PassthroughExecutionPolicy struct{}

func (PassthroughExecutionPolicy) PromptContext(ctx context.Context, _ string, _ AskPhase) (context.Context, context.CancelFunc) {
	if ctx == nil {
		ctx = context.Background()
	}
	return ctx, func() {}
}

func allNonCodeAssetPaths(paths []string) bool {
	if len(paths) == 0 {
		return false
	}
	for _, rel := range paths {
		if !isNonCodeAssetPath(rel) {
			return false
		}
	}
	return true
}

func isNonCodeAssetPath(rel string) bool {
	rel = strings.ToLower(strings.TrimSpace(rel))
	if rel == "" {
		return false
	}
	base := filepath.Base(rel)
	if strings.HasSuffix(base, ".min.js.map") || strings.HasSuffix(base, ".map") {
		return true
	}
	switch filepath.Ext(base) {
	case ".woff", ".woff2", ".ttf", ".eot", ".otf", ".png", ".jpg", ".jpeg",
		".gif", ".ico", ".icns", ".webp", ".bmp", ".pdf", ".mp3", ".wav",
		".mp4", ".mov", ".zip", ".tar", ".gz", ".tgz", ".7z", ".jar", ".so",
		".dylib", ".a", ".o":
		return true
	default:
		return false
	}
}
