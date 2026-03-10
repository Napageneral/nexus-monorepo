package tree

import (
	"context"
	"crypto/sha1"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/Napageneral/spike/internal/broker"
	prlmhistory "github.com/Napageneral/spike/internal/prlm/history"
	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
)

const (
	defaultMaxChildren = 12
)

// Status reports tree health and staleness classification.
type Status struct {
	TreeID            string                 `json:"tree_id"`
	RootPath          string                 `json:"root_path"`
	NodeCount         int                    `json:"node_count"`
	CleanCount        int                    `json:"clean_count"`
	ContentStaleCount int                    `json:"content_stale_count"`
	StructuralCount   int                    `json:"structural_stale_count"`
	UpdatedAt         time.Time              `json:"updated_at"`
	Nodes             []NodeStatus           `json:"nodes,omitempty"`
	Metadata          map[string]interface{} `json:"metadata,omitempty"`
}

type NodeStatus struct {
	ID        string                 `json:"id"`
	Path      string                 `json:"path"`
	Status    prlmnode.NodeStatus    `json:"status"`
	Staleness prlmnode.StalenessKind `json:"staleness"`
}

// SyncReport describes what Sync changed.
type SyncReport struct {
	TreeID               string   `json:"tree_id"`
	RepartitionedNodeIDs []string `json:"repartitioned_node_ids,omitempty"`
	ContentStaleNodeIDs  []string `json:"content_stale_node_ids,omitempty"`
	StructuralNodeIDs    []string `json:"structural_node_ids,omitempty"`
}

// Answer is the result of Ask.
type Answer struct {
	TreeID  string   `json:"tree_id"`
	Query   string   `json:"query"`
	Content string   `json:"content"`
	Visited []string `json:"visited,omitempty"`
}

// AskOptions controls ask execution mode.
type AskOptions struct {
	RequestID string
}

// HydrateReport describes what Hydrate accomplished.
type HydrateReport struct {
	TreeID       string        `json:"tree_id"`
	NodesVisited int           `json:"nodes_visited"`
	NodesFailed  int           `json:"nodes_failed"`
	Elapsed      time.Duration `json:"elapsed"`
	FailedIDs    []string      `json:"failed_ids,omitempty"`
}

func (r HydrateReport) MarshalJSON() ([]byte, error) {
	wire := struct {
		TreeID       string   `json:"tree_id"`
		NodesVisited int      `json:"nodes_visited"`
		NodesFailed  int      `json:"nodes_failed"`
		Elapsed      string   `json:"elapsed"`
		FailedIDs    []string `json:"failed_ids,omitempty"`
	}{
		TreeID:       r.TreeID,
		NodesVisited: r.NodesVisited,
		NodesFailed:  r.NodesFailed,
		Elapsed:      r.Elapsed.String(),
		FailedIDs:    r.FailedIDs,
	}
	return json.Marshal(wire)
}

// hydrateParentContext carries the ancestry orientation chain downward.
type hydrateParentContext struct {
	AncestryChain []hydrateAncestorEntry
}

// hydrateAncestorEntry is one ancestor's orientation in the chain.
type hydrateAncestorEntry struct {
	NodeID      string
	NodePath    string
	Orientation string // Phase 1 orientation response
}

// OracleTree orchestrates nodes via Init/Status/Sync/Ask.
type OracleTree struct {
	store     Store
	substrate Substrate

	db *sql.DB

	maxChildren     int
	maxParallel     int
	preserveSandbox bool
	sandboxBaseDir  string
	runtimeDir      string

	historyMu    sync.Mutex
	historyAgent *prlmhistory.HistoryAgent
	historyRoot  string // rootPath the agent was created for

	llmProvider   string
	llmModel      string
	thinkingLevel string
	scopeKey      string
	refName       string
	commitSHA     string
	treeFlavor    string
	treeVersionID string
	askPolicies   AskPolicies

	rootRuntimeMu sync.Mutex
	rootRuntimes  map[string]*oracleRootRuntime
}

type oracleRootRuntime struct {
	broker *broker.Broker
}

// OracleTreeOptions configures the oracle tree.
type OracleTreeOptions struct {
	MaxChildren     int    // Max fan-out per node (default 12)
	MaxParallel     int    // Concurrent child execution (default 4)
	PreserveSandbox bool   // Keep sandbox dirs after execution (debug)
	SandboxBaseDir  string // Persistent sandbox root; when set, per-node sandboxes are rebuilt in-place per ask
	RuntimeDir      string // External runtime root (sessions/sandboxes); defaults outside the repository

	LLMProvider   string // Provider override (default: inferred or openai-codex)
	LLMModel      string // Model override
	ThinkingLevel string // Reasoning level override (none, low, medium, high, xhigh)
	ScopeKey      string // Optional scope key override for ledger rows
	RefName       string // Optional git ref override for ledger rows
	CommitSHA     string // Optional commit override for ledger rows
	TreeFlavor    string // Optional tree flavor override for ledger rows
	TreeVersionID string // Optional tree version id override for ledger rows
}

func NewOracleTree(store Store, opts OracleTreeOptions) (*OracleTree, error) {
	if store == nil {
		return nil, errors.New("nil store")
	}

	// Extract DB from store if it exposes one.
	var db *sql.DB
	type dbProvider interface {
		DB() *sql.DB
	}
	if p, ok := store.(dbProvider); ok {
		db = p.DB()
	}

	maxChildren := opts.MaxChildren
	if maxChildren <= 0 {
		maxChildren = defaultMaxChildren
	}
	maxParallel := opts.MaxParallel
	if maxParallel <= 0 {
		maxParallel = 4
	}

	// Create history agent internally.
	// RootPath isn't known at construction time (it comes from the tree at
	// Init/Hydrate/Ask), so the history agent is created lazily on first use.

	// Create substrate internally.
	substrate, err := NewCodeSubstrate(db)
	if err != nil {
		return nil, err
	}

	llmModel := strings.TrimSpace(opts.LLMModel)
	llmProvider := strings.ToLower(strings.TrimSpace(opts.LLMProvider))
	if llmProvider == "" {
		llmProvider = inferProviderFromModel(llmModel)
	}
	if llmProvider == "" {
		llmProvider = "openai-codex"
	}

	return &OracleTree{
		store:           store,
		substrate:       substrate,
		db:              db,
		maxChildren:     maxChildren,
		maxParallel:     maxParallel,
		preserveSandbox: opts.PreserveSandbox,
		sandboxBaseDir:  strings.TrimSpace(opts.SandboxBaseDir),
		runtimeDir:      strings.TrimSpace(opts.RuntimeDir),
		llmProvider:     llmProvider,
		llmModel:        llmModel,
		thinkingLevel:   strings.TrimSpace(opts.ThinkingLevel),
		scopeKey:        strings.TrimSpace(opts.ScopeKey),
		refName:         strings.TrimSpace(opts.RefName),
		commitSHA:       strings.TrimSpace(opts.CommitSHA),
		treeFlavor:      strings.TrimSpace(opts.TreeFlavor),
		treeVersionID:   strings.TrimSpace(opts.TreeVersionID),
		askPolicies:     DefaultAskPolicies(),
	}, nil
}

// ensureHistoryAgent lazily creates a git history agent for the given rootPath.
// Subsequent calls with the same rootPath are no-ops. Returns the agent (may be nil
// if git is not available or creation fails — callers must nil-check).
func (t *OracleTree) ensureHistoryAgent(rootPath string) *prlmhistory.HistoryAgent {
	t.historyMu.Lock()
	defer t.historyMu.Unlock()
	if t.historyAgent != nil && t.historyRoot == rootPath {
		return t.historyAgent
	}
	agent, err := prlmhistory.NewHistoryAgent(prlmhistory.Options{
		RootPath: rootPath,
		DB:       t.db,
		ScopeKey: t.rootLedgerScope(rootPath).ScopeKey,
	})
	if err != nil {
		// Git history is best-effort; don't fail the operation.
		return nil
	}
	t.historyAgent = agent
	t.historyRoot = rootPath
	return agent
}

func (t *OracleTree) wrapNode(tree *Tree, nodeID string) *OracleNode {
	return NewOracleNode(tree.MustNode(nodeID), t.buildNodeContext(tree))
}

func (t *OracleTree) buildNodeContext(tree *Tree) *NodeContext {
	// Best-effort: init/status/sync can run without an LLM runtime.
	br, _ := t.rootRuntime(tree.RootPath)
	scope := t.treeLedgerScope(tree)
	llmLimit := t.maxParallel
	if llmLimit <= 0 {
		llmLimit = 1
	}
	llmProvider := strings.ToLower(strings.TrimSpace(t.llmProvider))
	if llmProvider == "" {
		llmProvider = "openai-codex"
	}
	ctx := &NodeContext{
		Tree:              tree,
		Substrate:         t.substrate,
		ExecutionRecorder: newSQLAskExecutionRecorder(t.db),
		HistoryAgent:      t.historyAgent,
		MaxChildren:       t.maxChildren,
		MaxParallel:       t.maxParallel,
		PreserveSandbox:   t.preserveSandbox,
		SandboxBaseDir:    t.sandboxBaseDir,
		SessionDir:        filepath.Join(t.runtimeBaseDir(tree.RootPath), "sessions"),
		LLMProvider:       llmProvider,
		LLMModel:          t.llmModel,
		ThinkingLevel:     strings.TrimSpace(t.thinkingLevel),
		ScopeKey:          scope.ScopeKey,
		RefName:           scope.RefName,
		CommitSHA:         scope.CommitSHA,
		TreeFlavor:        scope.TreeFlavor,
		TreeVersionID:     scope.TreeVersionID,
		Policies:          t.askPolicies.withDefaults(),
		llmSem:            make(chan struct{}, llmLimit),
	}
	ctx.Executor = newBrokerPromptExecutor(br, brokerPromptExecutor{
		sessionDir:    ctx.SessionDir,
		provider:      ctx.LLMProvider,
		model:         ctx.LLMModel,
		thinkingLevel: ctx.ThinkingLevel,
		scopeKey:      ctx.ScopeKey,
		refName:       ctx.RefName,
		commitSHA:     ctx.CommitSHA,
		treeFlavor:    ctx.TreeFlavor,
		treeVersionID: ctx.TreeVersionID,
		sessionLabelBuilder: func(nodeID string) string {
			return ctx.statelessSessionLabel(nodeID)
		},
	})
	return ctx
}

func (t *OracleTree) Init(ctx context.Context, treeID string, rootPath string, capacity int) (*Tree, error) {
	if strings.TrimSpace(treeID) == "" {
		return nil, fmt.Errorf("tree id is required")
	}
	root, err := filepath.Abs(strings.TrimSpace(rootPath))
	if err != nil {
		return nil, err
	}
	if capacity <= 0 {
		return nil, fmt.Errorf("capacity must be > 0")
	}

	if ha := t.ensureHistoryAgent(root); ha != nil {
		if err := ha.Analyze(ctx); err != nil {
			return nil, err
		}
	}

	entries, err := t.substrate.Survey(ctx, root)
	if err != nil {
		return nil, err
	}
	tree := NewTree(treeID, root, capacity, entries)
	tree.MustNode(tree.RootID).Status = prlmnode.NodeStatusReady

	rootNode := NewOracleNode(tree.MustNode(tree.RootID), t.buildNodeContext(tree))
	if err := rootNode.PartitionRecursive(ctx); err != nil {
		return nil, err
	}

	if err := t.store.CreateTree(ctx, tree); err != nil {
		return nil, err
	}
	if err := t.store.SaveTree(ctx, tree); err != nil {
		return nil, err
	}
	return tree.Clone()
}

type hydrateTrackerKey struct{}

type hydrateTracker struct {
	mu        sync.Mutex
	visited   int
	failedIDs []string
	failedSet map[string]struct{}
}

func hydrateTrackerFromCtx(ctx context.Context) *hydrateTracker {
	if ctx == nil {
		return nil
	}
	t, _ := ctx.Value(hydrateTrackerKey{}).(*hydrateTracker)
	return t
}

func (t *hydrateTracker) visit(nodeID string) {
	if t == nil {
		return
	}
	t.mu.Lock()
	t.visited++
	t.mu.Unlock()
}

func (t *hydrateTracker) fail(nodeID string) {
	if t == nil || strings.TrimSpace(nodeID) == "" {
		return
	}
	t.mu.Lock()
	if t.failedSet == nil {
		t.failedSet = map[string]struct{}{}
	}
	if _, ok := t.failedSet[nodeID]; !ok {
		t.failedSet[nodeID] = struct{}{}
		t.failedIDs = append(t.failedIDs, nodeID)
	}
	t.mu.Unlock()
}

// Hydrate boots live agent sessions at every node in the tree to establish
// durable orientation prior to answering real Ask queries.
func (t *OracleTree) Hydrate(ctx context.Context, treeID string) (*HydrateReport, error) {
	start := time.Now()
	tree, err := t.store.LoadTree(ctx, treeID)
	if err != nil {
		return nil, err
	}
	if _, err := t.rootRuntime(tree.RootPath); err != nil {
		return nil, fmt.Errorf("hydrate requires a real llm runtime: %w", err)
	}
	if ha := t.ensureHistoryAgent(tree.RootPath); ha != nil {
		if err := ha.Analyze(ctx); err != nil {
			return nil, err
		}
	}

	tracker := &hydrateTracker{failedSet: map[string]struct{}{}}
	if ctx == nil {
		ctx = context.Background()
	}
	ctx = context.WithValue(ctx, hydrateTrackerKey{}, tracker)

	_, err = NewOracleNode(tree.MustNode(tree.RootID), t.buildNodeContext(tree)).Hydrate(ctx, nil)
	if err != nil {
		return nil, err
	}

	tree.Touch()
	if err := t.store.SaveTree(ctx, tree); err != nil {
		return nil, err
	}

	failed := append([]string(nil), tracker.failedIDs...)
	sort.Strings(failed)

	return &HydrateReport{
		TreeID:       tree.ID,
		NodesVisited: tracker.visited,
		NodesFailed:  len(failed),
		Elapsed:      time.Since(start),
		FailedIDs:    failed,
	}, nil
}

func hydrateSystemPrompt(hasChildren bool) string {
	base := `You are a PRLM node agent being initialized for the first time.

You operate inside a domain-scoped sandbox that contains ONLY your local files.
Read them thoroughly. Understand the purpose of this code, how it's structured,
key abstractions, data flows, and architectural patterns.

You are building foundational understanding that you will use to answer
questions later. Be thorough but concise. Prefer citing exact file paths when
making claims.`
	if !hasChildren {
		return base
	}
	return base + `

You are a parent node. After orienting yourself on your local files, you will
receive your children's orientations. Synthesize them with your own understanding
to form a complete picture of your entire subtree.`
}

func hydrateOrientInstruction(node *prlmnode.Node, parentCtx *hydrateParentContext) string {
	scope := "."
	if node != nil && strings.TrimSpace(node.Path) != "" {
		scope = strings.TrimSpace(node.Path)
	}

	var b strings.Builder
	b.WriteString("Scope: ")
	b.WriteString(scope)
	b.WriteString("\n\n")

	if parentCtx != nil && len(parentCtx.AncestryChain) > 0 {
		b.WriteString("## Context from Ancestors\n\n")
		for _, anc := range parentCtx.AncestryChain {
			p := strings.TrimSpace(anc.NodePath)
			if p == "" {
				p = "."
			}
			b.WriteString("### ")
			b.WriteString(p)
			if strings.TrimSpace(anc.NodeID) != "" {
				b.WriteString(" (")
				b.WriteString(strings.TrimSpace(anc.NodeID))
				b.WriteString(")")
			}
			b.WriteString("\n")
			b.WriteString(strings.TrimSpace(anc.Orientation))
			b.WriteString("\n\n")
		}
	}

	b.WriteString("## Your Task\n\n")
	b.WriteString("Orient yourself on your domain. Read the files in your sandbox, understand what\n")
	b.WriteString("this code does, how it's structured, and how it fits into the system described\n")
	b.WriteString("above. Respond with a concise orientation of your domain.\n")
	return strings.TrimSpace(b.String())
}

func hydrateSynthesizeInstruction(tree *Tree, childOutputs map[string]string) string {
	type childRow struct {
		id   string
		path string
	}
	rows := make([]childRow, 0, len(childOutputs))
	for id := range childOutputs {
		p := ""
		if tree != nil {
			if n := tree.Nodes[id]; n != nil {
				p = n.Path
			}
		}
		rows = append(rows, childRow{id: id, path: p})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].path != rows[j].path {
			return rows[i].path < rows[j].path
		}
		return rows[i].id < rows[j].id
	})

	var b strings.Builder
	b.WriteString("## Children's Orientations\n\n")
	b.WriteString("Your child nodes have completed their orientations:\n\n")
	for _, r := range rows {
		p := strings.TrimSpace(r.path)
		if p == "" {
			p = r.id
		}
		b.WriteString("### ")
		b.WriteString(p)
		if strings.TrimSpace(r.id) != "" {
			b.WriteString(" (")
			b.WriteString(strings.TrimSpace(r.id))
			b.WriteString(")")
		}
		b.WriteString("\n")
		out := strings.TrimSpace(childOutputs[r.id])
		if out == "" {
			out = "(no output)"
		}
		b.WriteString(out)
		b.WriteString("\n\n")
	}

	b.WriteString("## Your Task\n\n")
	b.WriteString("Synthesize your children's orientations with your own understanding of your\n")
	b.WriteString("local domain. Build a complete picture of your entire subtree: how the pieces\n")
	b.WriteString("fit together, key data flows across boundaries, and important dependencies.\n")
	return strings.TrimSpace(b.String())
}

func askInterpretInstruction(node *prlmnode.Node, message string) string {
	scope := "."
	if node != nil && strings.TrimSpace(node.Path) != "" {
		scope = strings.TrimSpace(node.Path)
	}
	message = strings.TrimSpace(message)

	var b strings.Builder
	b.WriteString("## Phase 1: Interpret\n\n")
	b.WriteString("Scope: ")
	b.WriteString(scope)
	b.WriteString("\n\n")
	b.WriteString("Message from parent (or user at root):\n")
	b.WriteString(message)
	b.WriteString("\n\n")
	b.WriteString("Your task:\n")
	b.WriteString("- Read your local files in this sandbox.\n")
	b.WriteString("- Interpret what the parent/user is asking *as it relates to your subtree*.\n")
	b.WriteString("- Identify what parts of your own scope are likely relevant.\n")
	b.WriteString("- Provide guidance for children: what to look for in their own files.\n\n")
	b.WriteString("Rules:\n")
	b.WriteString("- Do NOT attempt to answer end-to-end. This is an interpretation + guidance step.\n")
	b.WriteString("- Do NOT invent file paths or symbols.\n")
	b.WriteString("- Only cite file paths you can see in this sandbox.\n\n")
	b.WriteString("Output format:\n")
	b.WriteString("- Interpretation: 3-8 bullets.\n")
	b.WriteString("- Child guidance: bullets (mention child scopes/paths when possible).\n")
	return strings.TrimSpace(b.String())
}

func askLeafInstruction(node *prlmnode.Node, message string) string {
	scope := "."
	if node != nil && strings.TrimSpace(node.Path) != "" {
		scope = strings.TrimSpace(node.Path)
	}
	message = strings.TrimSpace(message)
	return strings.TrimSpace(fmt.Sprintf(`Scope: %s

## Your Task
- Investigate ONLY your local files in this sandbox for evidence relevant to the message.
- Report concrete findings with exact file paths and (when applicable) function/class names.
- If nothing in your files is relevant, say so explicitly.

Rules:
- Do NOT invent file paths or symbols.
- Do NOT claim to have read files outside this sandbox.

## Message
%s`, scope, message))
}

func askSynthesizeInstruction(tree *Tree, node *prlmnode.Node, message string, childIDs []string, childOutputs map[string]string) string {
	scope := "."
	if node != nil && strings.TrimSpace(node.Path) != "" {
		scope = strings.TrimSpace(node.Path)
	}
	message = strings.TrimSpace(message)

	var b strings.Builder
	b.WriteString("## Phase 3: Synthesize\n\n")
	b.WriteString("Scope: ")
	b.WriteString(scope)
	b.WriteString("\n\n")
	if len(childIDs) > 0 && tree != nil {
		b.WriteString("Children queried:\n\n")
		for _, cid := range childIDs {
			p := cid
			if cn := tree.Nodes[cid]; cn != nil && strings.TrimSpace(cn.Path) != "" {
				p = strings.TrimSpace(cn.Path) + " (" + cid + ")"
			}
			b.WriteString("- ")
			b.WriteString(p)
			b.WriteString("\n")
		}
		b.WriteString("\n")
	}
	if len(childOutputs) > 0 {
		b.WriteString("Child answers (authoritative for their scopes):\n\n")
		for _, cid := range childIDs {
			out := strings.TrimSpace(childOutputs[cid])
			if out == "" {
				continue
			}
			p := cid
			if tree != nil {
				if cn := tree.Nodes[cid]; cn != nil && strings.TrimSpace(cn.Path) != "" {
					p = strings.TrimSpace(cn.Path) + " (" + cid + ")"
				}
			}
			b.WriteString("### ")
			b.WriteString(p)
			b.WriteString("\n\n")
			b.WriteString("```")
			b.WriteString("\n")
			b.WriteString(out)
			b.WriteString("\n")
			b.WriteString("```")
			b.WriteString("\n\n")
		}
	}
	b.WriteString("Message from parent (or user at root):\n")
	b.WriteString(message)
	b.WriteString("\n\n")
	b.WriteString("Your task:\n")
	b.WriteString("- Read the child answers above (authoritative for their scopes).\n")
	b.WriteString("- Use your own local files for any additional evidence in your scope.\n")
	b.WriteString("- Produce a coherent response to your parent/user message.\n\n")
	b.WriteString("Rules:\n")
	b.WriteString("- Prefer citing exact file paths from child answers and your own scope.\n")
	b.WriteString("- If something is uncertain, label it as uncertain and point to the most likely place to verify.\n")
	b.WriteString("- Do NOT invent file paths or symbols.\n")
	return strings.TrimSpace(b.String())
}

func askDispatchMessage(child *prlmnode.Node, rootQuery string, parentInterpretation string) string {
	scope := "."
	if child != nil && strings.TrimSpace(child.Path) != "" {
		scope = strings.TrimSpace(child.Path)
	}
	rootQuery = strings.TrimSpace(rootQuery)
	parentInterpretation = strings.TrimSpace(parentInterpretation)

	terms := routingTerms(rootQuery)
	termLine := ""
	if len(terms) > 0 {
		// Keep this short.
		if len(terms) > 12 {
			terms = terms[:12]
		}
		termLine = strings.Join(terms, ", ")
	}

	var b strings.Builder
	b.WriteString("Original question (root):\n")
	b.WriteString(rootQuery)
	b.WriteString("\n\n")
	if parentInterpretation != "" {
		b.WriteString("Parent interpretation + guidance:\n")
		b.WriteString(parentInterpretation)
		b.WriteString("\n\n")
	}
	b.WriteString("You are responsible for scope: ")
	b.WriteString(scope)
	b.WriteString("\n\n")
	if termLine != "" {
		b.WriteString("Suggested search terms: ")
		b.WriteString(termLine)
		b.WriteString("\n\n")
	}
	b.WriteString("Your task:\n")
	b.WriteString("- Investigate ONLY your local files in this sandbox.\n")
	b.WriteString("- Report concrete findings with exact file paths.\n")
	b.WriteString("- If nothing is relevant in your files, say so explicitly.\n\n")
	b.WriteString("Rules:\n")
	b.WriteString("- Do NOT invent file paths or symbols.\n")
	b.WriteString("- Do NOT claim to have read files outside this sandbox.\n")
	return strings.TrimSpace(b.String())
}

func (t *OracleTree) Status(ctx context.Context, treeID string) (*Status, error) {
	tree, err := t.store.LoadTree(ctx, treeID)
	if err != nil {
		return nil, err
	}

	// Ensure history agent is initialized for this corpus.
	t.ensureHistoryAgent(tree.RootPath)

	out := &Status{
		TreeID:    tree.ID,
		RootPath:  tree.RootPath,
		UpdatedAt: tree.UpdatedAt,
	}

	nodeCtx := t.buildNodeContext(tree)

	ids := make([]string, 0, len(tree.Nodes))
	for id := range tree.Nodes {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	for _, id := range ids {
		node := tree.Nodes[id]
		if node == nil {
			continue
		}
		st := NewOracleNode(node, nodeCtx).CheckStaleness()
		node.StalenessState = st
		switch st {
		case prlmnode.StalenessClean:
			out.CleanCount++
		case prlmnode.StalenessContent:
			out.ContentStaleCount++
		case prlmnode.StalenessStructural:
			out.StructuralCount++
		default:
			out.ContentStaleCount++
		}
		out.Nodes = append(out.Nodes, NodeStatus{
			ID:        node.ID,
			Path:      node.Path,
			Status:    node.Status,
			Staleness: node.StalenessState,
		})
	}
	out.NodeCount = len(out.Nodes)

	// Persist the latest staleness classification.
	tree.Touch()
	_ = t.store.SaveTree(ctx, tree)

	return out, nil
}

func (t *OracleTree) Sync(ctx context.Context, treeID string) (*SyncReport, error) {
	tree, err := t.store.LoadTree(ctx, treeID)
	if err != nil {
		return nil, err
	}

	if ha := t.ensureHistoryAgent(tree.RootPath); ha != nil {
		if err := ha.Analyze(ctx); err != nil {
			return nil, err
		}
	}

	nodeCtx := t.buildNodeContext(tree)

	// Compute staleness against the previous index snapshot before refreshing it.
	ids := make([]string, 0, len(tree.Nodes))
	for id := range tree.Nodes {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	structural := []string{}
	content := []string{}
	for _, id := range ids {
		node := tree.Nodes[id]
		if node == nil {
			continue
		}
		st := NewOracleNode(node, nodeCtx).CheckStaleness()
		node.StalenessState = st
		if st == prlmnode.StalenessStructural {
			structural = append(structural, id)
		} else if st == prlmnode.StalenessContent {
			content = append(content, id)
		}
	}

	currentEntries, err := t.substrate.Survey(ctx, tree.RootPath)
	if err != nil {
		return nil, err
	}
	tree.ReplaceIndex(currentEntries)

	repartitioned := []string{}
	if len(structural) > 0 {
		// Structural sync runs top-down: repartition the highest stale nodes first.
		repartitioned, err = t.syncStructural(ctx, tree, structural)
		if err != nil {
			return nil, err
		}
	}

	tree.Touch()
	if err := t.store.SaveTree(ctx, tree); err != nil {
		return nil, err
	}

	return &SyncReport{
		TreeID:               tree.ID,
		RepartitionedNodeIDs: repartitioned,
		ContentStaleNodeIDs:  content,
		StructuralNodeIDs:    structural,
	}, nil
}

func (t *OracleTree) Ask(ctx context.Context, treeID string, query string) (*Answer, error) {
	return t.AskWithOptions(ctx, treeID, query, AskOptions{})
}

func (t *OracleTree) AskWithOptions(ctx context.Context, treeID string, query string, opts AskOptions) (*Answer, error) {
	tree, err := t.store.LoadTree(ctx, treeID)
	if err != nil {
		return nil, err
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}

	// Ensure history agent is initialized for this corpus.
	t.ensureHistoryAgent(tree.RootPath)
	requestID := strings.TrimSpace(opts.RequestID)
	if requestID == "" {
		requestID = fmt.Sprintf("req-%d", time.Now().UTC().UnixNano())
	}
	scope := t.treeLedgerScope(tree)
	startedAt := time.Now().UTC().UnixMilli()
	if err := t.insertAskRequestStart(requestID, tree, query, scope, startedAt); err != nil {
		return nil, err
	}

	visited := map[string]struct{}{}
	var visitedMu sync.Mutex
	nodeCtx := t.buildNodeContext(tree)
	if nodeCtx != nil {
		nodeCtx.AskRootQuery = query
		nodeCtx.RequestID = requestID
	}
	content, err := NewOracleNode(tree.MustNode(tree.RootID), nodeCtx).Ask(ctx, query, visited, &visitedMu)
	if err != nil {
		rootTurnID, _ := t.findRootTurnIDForRequest(tree, requestID)
		status := "failed"
		errorCode := "ask_failed"
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			status = "cancelled"
			errorCode = "ask_cancelled"
		}
		if updateErr := t.updateAskRequestResult(requestID, status, rootTurnID, "", errorCode, err.Error(), time.Now().UTC().UnixMilli()); updateErr != nil {
			return nil, errors.Join(err, updateErr)
		}
		return nil, err
	}
	tree.Touch()
	if err := t.store.SaveTree(ctx, tree); err != nil {
		return nil, err
	}

	visitedIDs := make([]string, 0, len(visited))
	for id := range visited {
		visitedIDs = append(visitedIDs, id)
	}
	sort.Strings(visitedIDs)
	rootTurnID, _ := t.findRootTurnIDForRequest(tree, requestID)
	if err := t.updateAskRequestResult(requestID, "completed", rootTurnID, content, "", "", time.Now().UTC().UnixMilli()); err != nil {
		return nil, err
	}

	return &Answer{
		TreeID:  tree.ID,
		Query:   query,
		Content: content,
		Visited: visitedIDs,
	}, nil
}

func (t *OracleTree) insertAskRequestStart(requestID string, tree *Tree, query string, scope broker.LedgerScope, createdAt int64) error {
	if t == nil || t.db == nil {
		return nil
	}
	if strings.TrimSpace(requestID) == "" || tree == nil {
		return nil
	}
	_, err := t.db.Exec(`
		INSERT INTO ask_requests (
			request_id, tree_id, scope_key, ref_name, commit_sha, tree_flavor, tree_version_id,
			query_text, status, root_turn_id, answer_preview, error_code, error_message, created_at, completed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', '', '', '', '', ?, NULL)
		ON CONFLICT(request_id) DO UPDATE SET
			tree_id=excluded.tree_id,
			scope_key=excluded.scope_key,
			ref_name=excluded.ref_name,
			commit_sha=excluded.commit_sha,
			tree_flavor=excluded.tree_flavor,
			tree_version_id=excluded.tree_version_id,
			query_text=excluded.query_text,
			status='running',
			root_turn_id='',
			answer_preview='',
			error_code='',
			error_message='',
			created_at=excluded.created_at,
			completed_at=NULL
	`,
		strings.TrimSpace(requestID),
		strings.TrimSpace(tree.ID),
		strings.TrimSpace(scope.ScopeKey),
		strings.TrimSpace(scope.RefName),
		strings.TrimSpace(scope.CommitSHA),
		strings.TrimSpace(scope.TreeFlavor),
		strings.TrimSpace(scope.TreeVersionID),
		strings.TrimSpace(query),
		createdAt,
	)
	return err
}

func (t *OracleTree) updateAskRequestResult(requestID string, status string, rootTurnID string, answer string, errorCode string, errorMessage string, completedAt int64) error {
	if t == nil || t.db == nil {
		return nil
	}
	if strings.TrimSpace(requestID) == "" {
		return nil
	}
	_, err := t.db.Exec(`
		UPDATE ask_requests
		SET status = ?,
		    root_turn_id = ?,
		    answer_preview = ?,
		    error_code = ?,
		    error_message = ?,
		    completed_at = ?
		WHERE request_id = ?
	`,
		strings.TrimSpace(status),
		strings.TrimSpace(rootTurnID),
		truncateAskPreview(answer),
		strings.TrimSpace(errorCode),
		strings.TrimSpace(errorMessage),
		completedAt,
		strings.TrimSpace(requestID),
	)
	return err
}

func (t *OracleTree) CancelAskRequest(ctx context.Context, treeID string, requestID string, reason string) error {
	if t == nil || strings.TrimSpace(requestID) == "" {
		return nil
	}
	var rootTurnID string
	if strings.TrimSpace(treeID) != "" {
		tree, err := t.store.LoadTree(ctx, strings.TrimSpace(treeID))
		if err == nil && tree != nil {
			rootTurnID, _ = t.findRootTurnIDForRequest(tree, requestID)
		}
	}
	return t.updateAskRequestResult(
		requestID,
		"cancelled",
		rootTurnID,
		"",
		"ask_cancelled",
		strings.TrimSpace(reason),
		time.Now().UTC().UnixMilli(),
	)
}

func (t *OracleTree) findRootTurnIDForRequest(tree *Tree, requestID string) (string, error) {
	if t == nil || t.db == nil || tree == nil {
		return "", nil
	}
	requestToken := sanitizeSessionLabelSegment(requestID)
	if requestToken == "" {
		return "", nil
	}
	scope := t.treeLedgerScope(tree)
	treeVersionID := strings.TrimSpace(scope.TreeVersionID)
	if treeVersionID == "" {
		treeVersionID = strings.TrimSpace(tree.ID)
	}
	prefix := treeVersionID + ":" + strings.TrimSpace(tree.RootID) + ":stateless:" + requestToken + ":%"
	var threadID string
	if err := t.db.QueryRow(`
		SELECT thread_id
		FROM sessions
		WHERE label LIKE ?
		ORDER BY updated_at DESC
		LIMIT 1
	`, prefix).Scan(&threadID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	return strings.TrimSpace(threadID), nil
}

func truncateAskPreview(answer string) string {
	answer = strings.TrimSpace(answer)
	if answer == "" {
		return ""
	}
	const maxChars = 2000
	runes := []rune(answer)
	if len(runes) <= maxChars {
		return answer
	}
	return strings.TrimSpace(string(runes[:maxChars]))
}

// BrokerForTree returns the runtime broker for a served tree.
func (t *OracleTree) BrokerForTree(ctx context.Context, treeID string) (*broker.Broker, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	tree, err := t.store.LoadTree(ctx, strings.TrimSpace(treeID))
	if err != nil {
		return nil, err
	}
	return t.rootRuntime(tree.RootPath)
}

func (t *OracleTree) rootRuntime(rootPath string) (*broker.Broker, error) {
	if t == nil {
		return nil, fmt.Errorf("nil oracle tree")
	}
	rootAbs, err := filepath.Abs(strings.TrimSpace(rootPath))
	if err != nil {
		return nil, err
	}

	t.rootRuntimeMu.Lock()
	defer t.rootRuntimeMu.Unlock()
	if t.rootRuntimes == nil {
		t.rootRuntimes = map[string]*oracleRootRuntime{}
	}
	if existing := t.rootRuntimes[rootAbs]; existing != nil && existing.broker != nil {
		existing.broker.SetLedgerScope(t.rootLedgerScope(rootAbs))
		return existing.broker, nil
	}

	var br *broker.Broker
	if t.db != nil {
		br, err = broker.NewWithDB(t.db)
	} else {
		brokerDir := filepath.Join(rootAbs, ".intent", "state", "broker")
		br, err = broker.New(brokerDir)
	}
	if err != nil {
		return nil, err
	}

	br.SetEngine(broker.NewGoAgentEngine())
	br.SetLedgerScope(t.rootLedgerScope(rootAbs))

	t.rootRuntimes[rootAbs] = &oracleRootRuntime{broker: br}
	return br, nil
}

func (t *OracleTree) treeLedgerScope(tree *Tree) broker.LedgerScope {
	rootPath := ""
	treeID := ""
	if tree != nil {
		rootPath = strings.TrimSpace(tree.RootPath)
		treeID = strings.TrimSpace(tree.ID)
	}
	scope := t.rootLedgerScope(rootPath)
	treeFlavor := strings.TrimSpace(t.treeFlavor)
	if treeFlavor == "" {
		treeFlavor = treeID
	}
	treeVersionID := strings.TrimSpace(t.treeVersionID)
	if treeVersionID == "" {
		treeVersionID = treeID
	}
	scope.TreeFlavor = strings.TrimSpace(treeFlavor)
	scope.TreeVersionID = strings.TrimSpace(treeVersionID)
	return scope
}

func (t *OracleTree) rootLedgerScope(rootPath string) broker.LedgerScope {
	rootPath = strings.TrimSpace(rootPath)
	scopeKey := strings.TrimSpace(t.scopeKey)
	if scopeKey == "" && rootPath != "" {
		scopeKey = runtimeScopeKey(rootPath)
	}
	refName := strings.TrimSpace(t.refName)
	commitSHA := strings.TrimSpace(t.commitSHA)
	if rootPath != "" && (refName == "" || commitSHA == "") {
		resolvedRef, resolvedCommit := gitRefAndCommit(rootPath)
		if refName == "" {
			refName = resolvedRef
		}
		if commitSHA == "" {
			commitSHA = resolvedCommit
		}
	}
	return broker.LedgerScope{
		ScopeKey:      strings.TrimSpace(scopeKey),
		RefName:       strings.TrimSpace(refName),
		CommitSHA:     strings.TrimSpace(commitSHA),
		TreeFlavor:    strings.TrimSpace(t.treeFlavor),
		TreeVersionID: strings.TrimSpace(t.treeVersionID),
	}
}

func gitRefAndCommit(rootPath string) (refName string, commitSHA string) {
	rootPath = strings.TrimSpace(rootPath)
	if rootPath == "" {
		return "", ""
	}
	if !isGitRepo(rootPath) {
		return "", ""
	}
	commitOut, err := exec.Command("git", "-C", rootPath, "rev-parse", "--verify", "HEAD").Output()
	if err == nil {
		commitSHA = strings.TrimSpace(string(commitOut))
	}
	refOut, err := exec.Command("git", "-C", rootPath, "symbolic-ref", "--quiet", "--short", "HEAD").Output()
	if err == nil {
		refName = strings.TrimSpace(string(refOut))
	}
	return strings.TrimSpace(refName), strings.TrimSpace(commitSHA)
}

func isGitRepo(rootPath string) bool {
	if strings.TrimSpace(rootPath) == "" {
		return false
	}
	cmd := exec.Command("git", "-C", rootPath, "rev-parse", "--is-inside-work-tree")
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(out)) == "true"
}

func inferProviderFromModel(model string) string {
	model = strings.ToLower(strings.TrimSpace(model))
	if model == "" {
		return ""
	}
	if strings.Contains(model, "codex") {
		return "openai-codex"
	}
	if strings.HasPrefix(model, "gpt-") || strings.HasPrefix(model, "o1") || strings.HasPrefix(model, "o3") || strings.HasPrefix(model, "o4") {
		return "openai"
	}
	if strings.Contains(model, "claude") {
		return "anthropic"
	}
	return ""
}

func prlmAgentID(treeID string, nodeID string) string {
	return "prlm-" + prlmnode.StableHash(map[string]any{
		"tree_id": treeID,
		"node_id": nodeID,
	})
}

func (t *OracleTree) runtimeBaseDir(rootPath string) string {
	if t != nil && strings.TrimSpace(t.runtimeDir) != "" {
		if abs, err := filepath.Abs(strings.TrimSpace(t.runtimeDir)); err == nil {
			return abs
		}
		return strings.TrimSpace(t.runtimeDir)
	}
	rootPath = strings.TrimSpace(rootPath)
	if rootPath == "" {
		return ""
	}
	if abs, err := filepath.Abs(rootPath); err == nil {
		rootPath = abs
	}
	baseRoot := strings.TrimSpace(os.Getenv("SPIKE_RUNTIME_DIR"))
	if baseRoot == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return ""
		}
		baseRoot = filepath.Join(home, ".spike", "runtime", "repos")
	}
	return filepath.Join(baseRoot, runtimeScopeKey(rootPath))
}

func runtimeScopeKey(scopeRoot string) string {
	scopeRoot = strings.TrimSpace(scopeRoot)
	name := sanitizeRuntimeSegment(filepath.Base(scopeRoot))
	sum := sha1.Sum([]byte(strings.ToLower(filepath.Clean(scopeRoot))))
	return name + "-" + hex.EncodeToString(sum[:])[:12]
}

func sanitizeRuntimeSegment(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return "repo"
	}
	var b strings.Builder
	lastDash := false
	for _, r := range raw {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "repo"
	}
	return out
}

func nodeScopeAbs(tree *Tree, node *prlmnode.Node) string {
	if tree == nil || node == nil {
		return ""
	}
	scopeRel := canonicalWorkspaceNodePath(node.Path)
	if scopeRel == "." || strings.TrimSpace(scopeRel) == "" {
		return tree.RootPath
	}
	return filepath.Join(tree.RootPath, filepath.FromSlash(scopeRel))
}

func (t *OracleTree) sandboxPreserveBaseDir(rootPath string) string {
	base := t.runtimeBaseDir(rootPath)
	if strings.TrimSpace(base) == "" {
		return ""
	}
	return filepath.Join(base, "sandboxes")
}

func (t *OracleTree) syncStructural(ctx context.Context, tree *Tree, staleIDs []string) ([]string, error) {
	nodeCtx := t.buildNodeContext(tree)

	// Sort by depth (shorter path first) so parents repartition before children.
	sort.Slice(staleIDs, func(i, j int) bool {
		ni := tree.Nodes[staleIDs[i]]
		nj := tree.Nodes[staleIDs[j]]
		di := 0
		dj := 0
		if ni != nil {
			di = strings.Count(path.Clean(ni.Path), "/")
		}
		if nj != nil {
			dj = strings.Count(path.Clean(nj.Path), "/")
		}
		return di < dj
	})
	out := []string{}
	seen := map[string]bool{}
	for _, id := range staleIDs {
		if seen[id] {
			continue
		}
		node, ok := tree.Nodes[id]
		if !ok || node == nil {
			continue
		}
		// Skip if an ancestor is already being repartitioned.
		ancestor := node.ParentID
		skip := false
		for ancestor != "" {
			if seen[ancestor] {
				skip = true
				break
			}
			a := tree.Nodes[ancestor]
			if a == nil {
				break
			}
			ancestor = a.ParentID
		}
		if skip {
			continue
		}
		seen[id] = true

		// Refresh local ownership from the latest index snapshot so structural sync can
		// incorporate added/removed files before repartitioning.
		if !isVirtualWorkspaceNode(node.Path) {
			node.LocalPaths = indexScopePaths(tree, node)
		}

		if err := NewOracleNode(tree.MustNode(id), nodeCtx).PartitionRecursive(ctx); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, nil
}

func indexScopePaths(tree *Tree, node *prlmnode.Node) []string {
	if tree == nil || node == nil {
		return nil
	}
	scopeRel := canonicalWorkspaceNodePath(node.Path)
	prefix := ""
	if scopeRel != "." && strings.TrimSpace(scopeRel) != "" {
		prefix = strings.TrimPrefix(path.Clean(scopeRel), "./") + "/"
	}
	paths := make([]string, 0, len(tree.Index))
	for p := range tree.Index {
		if prefix == "" || strings.HasPrefix(p, prefix) {
			paths = append(paths, p)
		}
	}
	sort.Strings(paths)
	return paths
}

func nextChildID(tree *Tree, parentID string, idx int) string {
	return fmt.Sprintf("%s.c%d", parentID, idx)
}

func oracleSystemPrompt(hasChildren bool) string {
	base := `You are an Oracle node agent in a DAG of collaborating agents.

You operate inside a domain-scoped sandbox that contains ONLY your local files.
You may NOT assume you can see code outside this sandbox.

Communication model:
- You receive one message from your parent (or the user if you are the root).
- If you have children, you may delegate by sending them messages. Their answers
  will be provided back to you for synthesis directly in the prompt.
- Your job is to investigate your local files, delegate if needed, synthesize,
  and respond upward (or to the user at root).

Evidence rules:
- Do not guess. Do not invent file paths or symbols.
- Only cite file paths you can actually see in the sandbox.
- If you cannot find evidence in your files, say so explicitly.

Session note:
- You may remember prior hydration, but do not rely on memory over evidence in
  the current sandbox.`
	if !hasChildren {
		return base
	}
	return base + `

You are a parent node. Treat child answers provided in the prompt as authoritative
for their scopes, and synthesize them with your own local findings.
Prefer child answers that cite concrete file paths. Ignore speculative claims
without evidence. If children disagree, call it out and point to the most likely
path(s) to inspect.`
}

func oracleInstruction(node *prlmnode.Node, message string) string {
	scope := node.Path
	if scope == "" {
		scope = "."
	}
	return strings.TrimSpace(fmt.Sprintf("Scope: %s\n\nMessage:\n%s", scope, strings.TrimSpace(message)))
}

// populateSandbox copies node-scoped files and context into an existing directory.
func populateSandbox(ctx context.Context, tree *Tree, node *prlmnode.Node, domain *prlmnode.Domain, dir string) error {
	if tree == nil || node == nil || domain == nil {
		return fmt.Errorf("nil inputs")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	// Copy local corpus files into sandbox.
	scopeRel := canonicalWorkspaceNodePath(node.Path)
	scopePrefix := ""
	if scopeRel != "." && strings.TrimSpace(scopeRel) != "" {
		scopePrefix = strings.TrimPrefix(path.Clean(scopeRel), "./") + "/"
	}
	for _, e := range domain.Local {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		if strings.TrimSpace(e.Path) == "" {
			continue
		}
		rel := strings.TrimPrefix(path.Clean(filepath.ToSlash(e.Path)), "./")
		if shouldSkipSandboxPath(rel) {
			continue
		}
		dstRel := rel
		if scopePrefix != "" && strings.HasPrefix(rel, scopePrefix) {
			dstRel = strings.TrimPrefix(rel, scopePrefix)
		}
		if shouldSkipSandboxPath(dstRel) {
			continue
		}
		if strings.TrimSpace(dstRel) == "" || dstRel == "." {
			continue
		}
		srcAbs := filepath.Join(tree.RootPath, filepath.FromSlash(rel))
		dstAbs := filepath.Join(dir, filepath.FromSlash(dstRel))
		if err := os.MkdirAll(filepath.Dir(dstAbs), 0o755); err != nil {
			return err
		}
		b, err := os.ReadFile(srcAbs)
		if err != nil {
			return err
		}
		if err := os.WriteFile(dstAbs, b, 0o644); err != nil {
			return err
		}
	}

	return nil
}

func shouldSkipSandboxPath(rel string) bool {
	rel = strings.TrimPrefix(path.Clean(strings.TrimSpace(filepath.ToSlash(rel))), "./")
	if rel == "" || rel == "." {
		return true
	}
	if rel == ".intent" || strings.HasPrefix(rel, ".intent/") {
		return true
	}
	if rel == "_context" || strings.HasPrefix(rel, "_context/") {
		return true
	}
	if rel == "_repl" || strings.HasPrefix(rel, "_repl/") {
		return true
	}
	return false
}

// buildNodeSandbox creates an ephemeral temp sandbox for a node.
func buildNodeSandbox(ctx context.Context, tree *Tree, node *prlmnode.Node, domain *prlmnode.Domain) (string, error) {
	tmp, err := os.MkdirTemp("", "prlm-sandbox-*")
	if err != nil {
		return "", err
	}
	if err := populateSandbox(ctx, tree, node, domain, tmp); err != nil {
		_ = os.RemoveAll(tmp)
		return "", err
	}
	return tmp, nil
}

func canonicalWorkspaceNodePath(nodePath string) string {
	clean := path.Clean(nodePath)
	if clean == "" || clean == "." {
		return "."
	}
	parts := strings.Split(strings.TrimPrefix(clean, "./"), "/")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if strings.HasPrefix(p, "@chunk-") || strings.HasPrefix(p, "@bundle-") {
			continue
		}
		out = append(out, p)
	}
	if len(out) == 0 {
		return "."
	}
	return path.Join(out...)
}

var routeStopWords = map[string]struct{}{
	"a": {}, "an": {}, "and": {}, "are": {}, "as": {}, "at": {}, "be": {}, "by": {}, "can": {}, "could": {},
	"do": {}, "does": {}, "for": {}, "from": {}, "how": {}, "i": {}, "in": {}, "is": {}, "it": {}, "me": {},
	"of": {}, "on": {}, "or": {}, "please": {}, "the": {}, "this": {}, "to": {}, "what": {}, "where": {}, "why": {},
	"with": {}, "you": {}, "your": {},
}

func routingTerms(q string) []string {
	q = strings.ToLower(strings.TrimSpace(q))
	if q == "" {
		return nil
	}
	raw := strings.FieldsFunc(q, func(r rune) bool {
		// Keep a few path-y characters so "internal/prlm" stays a token.
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			return false
		}
		switch r {
		case '/', '.', '_', '-':
			return false
		default:
			return true
		}
	})

	seen := map[string]struct{}{}
	out := []string{}
	add := func(s string) {
		s = strings.ToLower(strings.TrimSpace(s))
		s = strings.Trim(s, "._-/")
		if len(s) < 3 {
			return
		}
		if _, stop := routeStopWords[s]; stop {
			return
		}
		if _, ok := seen[s]; ok {
			return
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}

	for _, tok := range raw {
		add(tok)
		parts := strings.FieldsFunc(tok, func(r rune) bool {
			return r == '/' || r == '.' || r == '_' || r == '-'
		})
		for _, p := range parts {
			add(p)
		}
	}
	sort.Strings(out)
	return out
}

func scoreChildRelevance(tree *Tree, child *prlmnode.Node, queryLower string, terms []string) int {
	if tree == nil || child == nil {
		return 0
	}
	childPath := strings.ToLower(path.Clean(strings.TrimPrefix(canonicalWorkspaceNodePath(child.Path), "./")))
	score := 0
	if childPath != "" && childPath != "." {
		parts := strings.Split(childPath, "/")
		leaf := parts[len(parts)-1]
		if leaf != "" && strings.Contains(queryLower, leaf) {
			score += 100
		}
		for _, seg := range parts {
			if seg == "" || seg == "." || seg == leaf {
				continue
			}
			if strings.Contains(queryLower, seg) {
				score += 20
			}
		}
		for _, term := range terms {
			if strings.Contains(childPath, term) {
				score += 10
			}
		}
	}

	// Use a bounded sample of extent paths for cheap relevance scoring without an LLM.
	extent := tree.NodeExtentPaths(child.ID)
	if len(extent) > 200 {
		extent = extent[:200]
	}
	for _, p := range extent {
		pl := strings.ToLower(p)
		for _, term := range terms {
			if strings.Contains(pl, term) {
				score++
				break
			}
		}
	}

	return score
}
