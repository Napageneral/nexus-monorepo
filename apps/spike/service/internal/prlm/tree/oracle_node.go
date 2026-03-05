package tree

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Napageneral/spike/internal/broker"
	prlmhistory "github.com/Napageneral/spike/internal/prlm/history"
	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
)

// NodeContext is a shared dependency bundle built once per OracleTree operation
// and shared by all OracleNodes during that operation.
type NodeContext struct {
	Tree      *Tree
	Substrate Substrate

	Broker *broker.Broker

	HistoryAgent *prlmhistory.HistoryAgent // nil when git unavailable

	// AskRootQuery is the raw user query for the current Ask operation.
	// It is constant across the full DAG recursion and is used for dispatch
	// prompts (so children always see the original question).
	AskRootQuery string

	MaxChildren     int
	MaxParallel     int
	PreserveSandbox bool
	SandboxBaseDir  string // persistent sandbox root; if set, sandboxes are rebuilt in-place for each ask
	SessionDir      string
	LLMProvider     string
	LLMModel        string
	ScopeKey        string
	RefName         string
	CommitSHA       string
	TreeFlavor      string
	TreeVersionID   string

	// llmSem is a shared limiter for LLM turn execution across the full OracleNode
	// recursion. Without this, nested fan-out can multiply parallelism and easily
	// trip per-runtime rate limits.
	llmSem chan struct{}

	RequestID string
}

// persistentSandboxPath returns the stable sandbox directory for a node.
// Returns "" if SandboxBaseDir is not configured.
func (c *NodeContext) persistentSandboxPath(nodeID string) string {
	if c == nil || strings.TrimSpace(c.SandboxBaseDir) == "" {
		return ""
	}
	// Use the node ID directly as subdirectory (e.g. "root.c2.c3").
	return filepath.Join(c.SandboxBaseDir, strings.TrimSpace(nodeID))
}

// resolveOrBuildSandbox returns the sandbox directory for a node.
// If persistent sandboxes are configured, the sandbox path is reused but its
// contents are rebuilt from source each ask.
// Otherwise a new sandbox is built (at the persistent path if configured, or a temp dir).
func (c *NodeContext) resolveOrBuildSandbox(ctx context.Context, tree *Tree, node *prlmnode.Node, domain *prlmnode.Domain) (sandboxDir string, ephemeral bool, err error) {
	if pdir := c.persistentSandboxPath(node.ID); pdir != "" {
		// Hard cutover reliability: persistent sandboxes are rebuilt for every ask so
		// no stale sidecars or previous run artifacts can influence synthesis.
		if err := os.MkdirAll(pdir, 0o755); err != nil {
			return "", false, err
		}
		if err := clearSandboxDir(pdir); err != nil {
			return "", false, err
		}
		if err := populateSandbox(ctx, tree, node, domain, pdir); err != nil {
			return "", false, err
		}
		return pdir, false, nil
	}
	// Fallback: build an ephemeral temp sandbox.
	dir, err := buildNodeSandbox(ctx, tree, node, domain)
	if err != nil {
		return "", false, err
	}
	return dir, true, nil
}

func clearSandboxDir(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return os.MkdirAll(dir, 0o755)
		}
		return err
	}
	for _, entry := range entries {
		if err := os.RemoveAll(filepath.Join(dir, entry.Name())); err != nil {
			return err
		}
	}
	return nil
}

var askTimingDebugEnabled atomic.Bool
var askTimingDebugInited atomic.Bool

func isAskTimingDebugEnabled() bool {
	if askTimingDebugInited.Load() {
		return askTimingDebugEnabled.Load()
	}
	enabled := strings.TrimSpace(os.Getenv("CARTOGRAPHER_DEBUG_ASK_TIMING")) == "1"
	askTimingDebugEnabled.Store(enabled)
	askTimingDebugInited.Store(true)
	return enabled
}

func askTimingf(enabled bool, nodeID string, requestID string, format string, args ...any) {
	if !enabled {
		return
	}
	prefix := fmt.Sprintf("[ask node=%s req=%s] ", strings.TrimSpace(nodeID), strings.TrimSpace(requestID))
	fmt.Printf(prefix+format+"\n", args...)
}

func (c *NodeContext) estimateTokens(text string) int {
	text = strings.TrimSpace(text)
	if text == "" {
		return 1
	}
	if c != nil && c.Substrate != nil {
		if n := c.Substrate.CountTokens(text); n > 0 {
			return n
		}
	}
	n := len(strings.Fields(text))
	if n <= 0 {
		n = 1
	}
	return n
}

func (c *NodeContext) statelessSessionLabel(nodeID string) string {
	base := c.baseSessionLabel(nodeID)
	ts := fmt.Sprintf("%d", time.Now().UTC().UnixNano())
	req := sanitizeSessionLabelSegment(c.RequestID)
	if req != "" {
		return base + ":stateless:" + req + ":" + ts
	}
	return base + ":stateless:" + ts
}

func sanitizeSessionLabelSegment(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return ""
	}
	var b strings.Builder
	lastDash := false
	for _, r := range raw {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if r == '-' || r == '_' {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func (c *NodeContext) withLLMLimit(ctx context.Context, fn func() (string, error)) (string, error) {
	if fn == nil {
		return "", nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if c == nil || c.llmSem == nil {
		return fn()
	}
	select {
	case c.llmSem <- struct{}{}:
		defer func() { <-c.llmSem }()
		return fn()
	case <-ctx.Done():
		return "", ctx.Err()
	}
}

const (
	defaultLLMRetryAttempts = 6
	defaultLLMRetryBase     = 2 * time.Second
	defaultLLMRetryMax      = 30 * time.Second
)

func isRetryableLLMError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "429") ||
		strings.Contains(msg, "too many requests") ||
		strings.Contains(msg, "rate limit") ||
		strings.Contains(msg, "exceeded retry limit") ||
		strings.Contains(msg, "prompt stalled") ||
		strings.Contains(msg, "produced no new messages") ||
		strings.Contains(msg, "signal: killed") ||
		strings.Contains(msg, "broken pipe") ||
		strings.Contains(msg, "unexpected eof")
}

func sleepWithContext(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return nil
	}
	if ctx == nil {
		time.Sleep(d)
		return nil
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (c *NodeContext) completeWithRetry(ctx context.Context, fn func() (string, error)) (string, error) {
	if fn == nil {
		return "", nil
	}
	var lastErr error
	backoff := defaultLLMRetryBase
	for attempt := 1; attempt <= defaultLLMRetryAttempts; attempt++ {
		out, err := c.withLLMLimit(ctx, fn)
		if err == nil {
			return out, nil
		}
		lastErr = err
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return "", err
		}
		if !isRetryableLLMError(err) || attempt == defaultLLMRetryAttempts {
			return "", err
		}
		wait := backoff
		if wait > defaultLLMRetryMax {
			wait = defaultLLMRetryMax
		}
		if err := sleepWithContext(ctx, wait); err != nil {
			return "", err
		}
		if backoff < defaultLLMRetryMax {
			backoff *= 2
		}
	}
	return "", lastErr
}

func (c *NodeContext) baseSessionLabel(nodeID string) string {
	if c == nil || c.Tree == nil {
		return strings.TrimSpace(nodeID)
	}
	treeVersionID := strings.TrimSpace(c.TreeVersionID)
	if treeVersionID == "" {
		treeVersionID = strings.TrimSpace(c.Tree.ID)
	}
	return treeVersionID + ":" + strings.TrimSpace(nodeID)
}

func (c *NodeContext) ensureSession(nodeID string, sessionLabel string, origin string, systemPrompt string, workDir string) error {
	if c == nil || c.Broker == nil {
		return fmt.Errorf("broker is not configured")
	}
	_, err := c.Broker.CreateSession(sessionLabel, broker.SessionOptions{
		PersonaID:     "oracle",
		Origin:        strings.TrimSpace(origin),
		WorkDir:       strings.TrimSpace(workDir),
		Provider:      strings.TrimSpace(c.LLMProvider),
		Model:         strings.TrimSpace(c.LLMModel),
		SystemPrompt:  strings.TrimSpace(systemPrompt),
		SessionDir:    strings.TrimSpace(c.SessionDir),
		ScopeKey:      strings.TrimSpace(c.ScopeKey),
		RefName:       strings.TrimSpace(c.RefName),
		CommitSHA:     strings.TrimSpace(c.CommitSHA),
		TreeFlavor:    strings.TrimSpace(c.TreeFlavor),
		TreeVersionID: strings.TrimSpace(c.TreeVersionID),
	})
	return err
}

func (c *NodeContext) executePrompt(ctx context.Context, nodeID string, origin string, prompt string, systemPrompt string, workDir string) (string, error) {
	if c == nil || c.Broker == nil {
		return "", fmt.Errorf("broker is not configured")
	}
	prompt = strings.TrimSpace(prompt)
	systemPrompt = strings.TrimSpace(systemPrompt)

	sessionLabel := c.statelessSessionLabel(nodeID)
	if err := c.ensureSession(nodeID, sessionLabel, origin, systemPrompt, workDir); err != nil {
		return "", err
	}
	result, err := c.Broker.Execute(ctx, sessionLabel, prompt)
	if err != nil {
		return "", err
	}
	if result == nil {
		_ = c.Broker.StopSession(sessionLabel)
		return "", nil
	}
	out := strings.TrimSpace(result.Content)
	_ = c.Broker.StopSession(sessionLabel)
	return out, nil
}

// OracleNode wraps a persisted *prlmnode.Node with active behavior.
// OracleNode is ephemeral: it is constructed at runtime and never persisted.
type OracleNode struct {
	*prlmnode.Node
	ctx *NodeContext
}

func NewOracleNode(node *prlmnode.Node, ctx *NodeContext) *OracleNode {
	return &OracleNode{Node: node, ctx: ctx}
}

// ChildPlan is a planned child split for one node partition operation.
type ChildPlan struct {
	Path          string
	LocalPaths    []string
	Capacity      int
	BundleMembers []string
}

// ---------------------------------------------------------------------------
// Pass A: Partition + Staleness
// ---------------------------------------------------------------------------

// CheckStaleness delegates to the substrate for I/O-based staleness detection.
func (n *OracleNode) CheckStaleness() prlmnode.StalenessKind {
	if n == nil || n.ctx == nil || n.ctx.Substrate == nil || n.ctx.Tree == nil || n.Node == nil {
		return prlmnode.StalenessClean
	}
	return n.ctx.Substrate.CheckStaleness(n.ctx.Tree, n.Node)
}

// ShouldSplit returns true if this node's extent exceeds its split threshold.
func (n *OracleNode) ShouldSplit() bool {
	if n == nil || n.ctx == nil || n.ctx.Tree == nil || n.Node == nil {
		return false
	}
	tokens := n.ctx.Tree.NodeExtentTokens(n.ID)
	limit := MaxLeafTokens
	if n.Capacity > 0 && n.Capacity < limit {
		limit = n.Capacity
	}
	if tokens <= limit {
		return false
	}
	if len(n.LocalPaths) <= 1 {
		return false
	}
	return true
}

// Partition decides how this node should split. Returns nil if no split needed.
func (n *OracleNode) Partition() []ChildPlan {
	if n == nil || n.ctx == nil || n.ctx.Tree == nil || n.Node == nil {
		return nil
	}
	if !n.ShouldSplit() {
		return nil
	}
	return n.PlanChildren()
}

// PartitionRecursive partitions this node and all descendants.
func (n *OracleNode) PartitionRecursive(ctx context.Context) error {
	if n == nil || n.ctx == nil || n.ctx.Tree == nil || n.Node == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	tree := n.ctx.Tree
	node := tree.MustNode(n.ID)

	children := n.Partition()
	if len(children) == 0 {
		if node.Status == prlmnode.NodeStatusCreated || node.Status == prlmnode.NodeStatusPartitioning {
			node.Status = prlmnode.NodeStatusReady
		}
		return nil
	}

	node.Status = prlmnode.NodeStatusPartitioning
	tree.Touch()

	// Clear existing subtree.
	for _, existing := range append([]string(nil), node.ChildIDs...) {
		_ = tree.RemoveSubtree(existing)
	}
	node = tree.MustNode(n.ID)
	node.ChildIDs = nil

	assigned := map[string]struct{}{}
	for _, child := range children {
		for _, p := range child.LocalPaths {
			assigned[p] = struct{}{}
		}
	}
	remaining := make([]string, 0, len(node.LocalPaths))
	for _, p := range node.LocalPaths {
		if _, ok := assigned[p]; !ok {
			remaining = append(remaining, p)
		}
	}
	node.LocalPaths = remaining

	for idx, child := range children {
		childID := nextChildID(tree, n.ID, idx+1)
		childNode := prlmnode.NewNode(childID, child.Path, child.LocalPaths, child.Capacity)
		childNode.ParentID = n.ID
		childNode.Status = prlmnode.NodeStatusReady
		if len(child.BundleMembers) > 0 {
			childNode.BundleMembers = append([]string(nil), child.BundleMembers...)
		}
		_ = tree.AddNode(childNode)
	}

	node.Status = prlmnode.NodeStatusReady
	node.StalenessState = prlmnode.StalenessContent
	tree.Touch()

	for _, cid := range node.ChildIDs {
		childNode := tree.MustNode(cid)
		if err := NewOracleNode(childNode, n.ctx).PartitionRecursive(ctx); err != nil {
			return err
		}
	}
	return nil
}

// PlanChildren returns the partition plan for splitting this node.
func (n *OracleNode) PlanChildren() []ChildPlan {
	if n == nil || n.ctx == nil || n.ctx.Tree == nil || n.Node == nil {
		return nil
	}

	tree := n.ctx.Tree
	node := n.Node

	groups := n.groupByFirstSegment(node.Path, node.LocalPaths)
	if len(groups) == 0 {
		groups = n.chunkFlat(node.Path, node.LocalPaths, tree, node.Capacity)
	}

	bundleMembers := map[string][]string{}
	if n.ctx.HistoryAgent != nil && len(groups) > 1 {
		merged, members := n.mergeGroupsByHistory(tree, node, groups)
		if len(merged) > 0 {
			groups = merged
			for k, v := range members {
				bundleMembers[k] = v
			}
		}
	}

	// Roll up undersized children before enforcing max children, but only when the
	// resulting bundles will be below this node's split threshold. Otherwise we'd
	// create bundles that immediately re-split.
	effectiveCap := MaxLeafTokens
	if node.Capacity > 0 && node.Capacity < effectiveCap {
		effectiveCap = node.Capacity
	}
	if effectiveCap >= MinLeafTokens {
		var rollupMembers map[string][]string
		groups, rollupMembers = n.rollupSmallGroups(node.Path, groups, tree, effectiveCap)
		for k, v := range rollupMembers {
			bundleMembers[k] = v
		}
	}

	// Keep fan-out bounded without dropping ownership.
	if n.ctx.MaxChildren > 0 && len(groups) > n.ctx.MaxChildren {
		var extraMembers map[string][]string
		groups, extraMembers = n.bundleToMaxChildren(node.Path, groups, tree, n.ctx.MaxChildren)
		for k, v := range extraMembers {
			bundleMembers[k] = v
		}
	}

	keys := make([]string, 0, len(groups))
	for k := range groups {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	if len(keys) == 0 {
		return nil
	}

	children := make([]ChildPlan, 0, len(keys))
	for _, key := range keys {
		local := append([]string(nil), groups[key]...)
		sort.Strings(local)
		childPath := n.childPath(node.Path, key)
		plan := ChildPlan{
			Path:       childPath,
			LocalPaths: local,
			Capacity:   node.Capacity,
		}
		if members := bundleMembers[key]; len(members) > 0 {
			plan.BundleMembers = append([]string(nil), members...)
		}
		children = append(children, plan)
	}
	return children
}

func (n *OracleNode) childPath(parentPath, key string) string {
	parentPath = strings.TrimSpace(parentPath)
	key = strings.TrimSpace(key)
	if parentPath == "" || parentPath == "." {
		return key
	}
	return path.Clean(parentPath + "/" + key)
}

func (n *OracleNode) groupByFirstSegment(nodePath string, paths []string) map[string][]string {
	out := map[string][]string{}
	for _, p := range paths {
		rel := n.relativeToNode(nodePath, p)
		if idx := strings.Index(rel, "/"); idx >= 0 {
			seg := rel[:idx]
			if seg == "" || seg == "." {
				continue
			}
			out[seg] = append(out[seg], p)
		}
	}
	return out
}

func (n *OracleNode) relativeToNode(nodePath, p string) string {
	norm := strings.TrimPrefix(path.Clean(p), "./")
	scope := canonicalWorkspaceNodePath(nodePath)
	if scope == "." || scope == "" {
		return norm
	}
	prefix := strings.TrimPrefix(path.Clean(scope), "./")
	if prefix == "" {
		return norm
	}
	prefix = prefix + "/"
	if strings.HasPrefix(norm, prefix) {
		return strings.TrimPrefix(norm, prefix)
	}
	return norm
}

func (n *OracleNode) chunkByPolicy(nodePath string, paths []string, tree *Tree) map[string][]string {
	files := make([]fileToken, 0, len(paths))
	total := 0
	relToAbs := make(map[string]string, len(paths))
	for _, p := range paths {
		entry, ok := tree.Index[p]
		tok := 1
		if ok && entry.Tokens > 0 {
			tok = entry.Tokens
		}
		rel := n.relativeToNode(nodePath, p)
		rel = strings.TrimPrefix(path.Clean(rel), "./")
		relToAbs[rel] = p
		files = append(files, fileToken{RelPath: rel, Tokens: tok})
		total += tok
	}
	chunks := splitFileTokens(files, total)
	out := map[string][]string{}
	for i, chunk := range chunks {
		key := fmt.Sprintf("@chunk-%d", i+1)
		for _, ft := range chunk {
			if abs, ok := relToAbs[ft.RelPath]; ok {
				out[key] = append(out[key], abs)
			}
		}
	}
	return out
}

func (n *OracleNode) chunkFlat(nodePath string, paths []string, tree *Tree, capacity int) map[string][]string {
	limit := MaxLeafTokens
	// Ensure chunking makes progress toward the node's split threshold.
	if capacity > 0 && capacity < limit {
		limit = capacity
	}
	// When the desired limit is smaller than MaxLeafTokens, fall back to a strict
	// token-cap chunker. splitFileTokens targets MaxLeafTokens and can return a
	// single chunk when totals are below that, causing infinite recursion.
	if limit > 0 && limit < MaxLeafTokens {
		return n.chunkByTokenLimit(paths, tree, limit)
	}
	return n.chunkByPolicy(nodePath, paths, tree)
}

func (n *OracleNode) chunkByTokenLimit(paths []string, tree *Tree, tokenLimit int) map[string][]string {
	if tokenLimit <= 0 {
		tokenLimit = MaxLeafTokens
	}
	sorted := append([]string(nil), paths...)
	sort.Strings(sorted)
	out := map[string][]string{}
	chunk := 1
	currentTokens := 0
	currentKey := fmt.Sprintf("@chunk-%d", chunk)
	for _, p := range sorted {
		entry, ok := tree.Index[p]
		tokens := 1
		if ok && entry.Tokens > 0 {
			tokens = entry.Tokens
		}
		if currentTokens > 0 && currentTokens+tokens > tokenLimit {
			chunk++
			currentKey = fmt.Sprintf("@chunk-%d", chunk)
			currentTokens = 0
		}
		out[currentKey] = append(out[currentKey], p)
		currentTokens += tokens
	}
	return out
}

func (n *OracleNode) rollupSmallGroups(nodePath string, groups map[string][]string, tree *Tree, splitLimit int) (map[string][]string, map[string][]string) {
	if len(groups) < 2 {
		return groups, nil
	}
	if splitLimit <= 0 {
		splitLimit = MaxLeafTokens
	}

	parent := canonicalWorkspaceNodePath(nodePath)
	if parent == "" {
		parent = "."
	}

	var small []childEntry
	rolled := make(map[string][]string, len(groups))
	for k, v := range groups {
		rolled[k] = v
	}

	members := map[string][]string{}
	for k, paths := range groups {
		tok := groupTokenCount(tree, paths)
		if tok >= MinLeafTokens {
			continue
		}
		// Virtual children (bundles/chunks) below MinLeafTokens aren't worth a node.
		// Keep their files on the parent rather than creating tiny virtual nodes.
		if strings.HasPrefix(k, "@") {
			delete(rolled, k)
			continue
		}
		small = append(small, childEntry{Path: n.childScope(parent, k), Tokens: tok})
	}

	if len(small) >= 2 {
		groupList := groupSmallChildren(parent, small, MinLeafTokens, splitLimit)
		for _, g := range groupList {
			if len(g.Children) == 0 {
				continue
			}
			// Avoid creating a bundle that only contains a single child; it makes no
			// structural progress and can trigger infinite recursion (virtual path stripped).
			if len(g.Children) < 2 {
				continue
			}
			// If the bundled result is still below MinLeafTokens, hoist it to the parent.
			if g.Tokens > 0 && g.Tokens < MinLeafTokens {
				for _, childPath := range g.Children {
					seg := strings.TrimPrefix(childPath, parent+"/")
					if parent == "." {
						seg = childPath
					}
					seg = strings.TrimPrefix(seg, "./")
					if seg == "" || seg == "." {
						continue
					}
					delete(rolled, seg)
				}
				continue
			}

			segMembers := make([]string, 0, len(g.Children))
			var bundlePaths []string
			for _, childPath := range g.Children {
				seg := strings.TrimPrefix(childPath, parent+"/")
				if parent == "." {
					seg = childPath
				}
				seg = strings.TrimPrefix(seg, "./")
				if seg == "" || seg == "." {
					continue
				}
				segMembers = append(segMembers, seg)
				bundlePaths = append(bundlePaths, groups[seg]...)
			}
			sort.Strings(segMembers)
			sort.Strings(bundlePaths)
			if groupTokenCount(tree, bundlePaths) > splitLimit {
				// This bundle would immediately re-split; keep its members as-is.
				continue
			}
			if len(segMembers) < 2 || groupTokenCount(tree, bundlePaths) < MinLeafTokens {
				// Hoist undersized children instead of creating a tiny bundle node.
				for _, seg := range segMembers {
					delete(rolled, seg)
				}
				continue
			}
			key := bundleKey(segMembers)
			rolled[key] = bundlePaths
			members[key] = segMembers
			for _, seg := range segMembers {
				delete(rolled, seg)
			}
		}
	}

	// Hoist any remaining undersized real children so we don't create tiny nodes.
	for k, paths := range rolled {
		if strings.HasPrefix(k, "@") {
			continue
		}
		if groupTokenCount(tree, paths) < MinLeafTokens {
			delete(rolled, k)
		}
	}

	if len(members) == 0 && len(rolled) == len(groups) {
		return groups, nil
	}
	return rolled, members
}

func (n *OracleNode) bundleToMaxChildren(nodePath string, groups map[string][]string, tree *Tree, maxChildren int) (map[string][]string, map[string][]string) {
	if len(groups) <= maxChildren || maxChildren <= 0 {
		return groups, nil
	}

	// Represent each current group as an item that can be bundled.
	type item struct {
		key     string
		tokens  int
		members []string
		paths   []string
	}
	items := make([]item, 0, len(groups))
	for k, v := range groups {
		items = append(items, item{
			key:     k,
			tokens:  groupTokenCount(tree, v),
			members: []string{k},
			paths:   append([]string(nil), v...),
		})
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].tokens != items[j].tokens {
			return items[i].tokens < items[j].tokens
		}
		return items[i].key < items[j].key
	})

	outMembers := map[string][]string{}
	for len(items) > maxChildren {
		a := items[0]
		b := items[1]
		items = items[2:]

		mergedMembers := append(append([]string(nil), a.members...), b.members...)
		sort.Strings(mergedMembers)
		mergedPaths := append(append([]string(nil), a.paths...), b.paths...)
		sort.Strings(mergedPaths)

		key := bundleKey(mergedMembers)
		outMembers[key] = mergedMembers
		items = append(items, item{
			key:     key,
			tokens:  a.tokens + b.tokens,
			members: mergedMembers,
			paths:   mergedPaths,
		})
		sort.Slice(items, func(i, j int) bool {
			if items[i].tokens != items[j].tokens {
				return items[i].tokens < items[j].tokens
			}
			return items[i].key < items[j].key
		})
	}

	out := map[string][]string{}
	for _, it := range items {
		out[it.key] = it.paths
	}
	return out, outMembers
}

func (n *OracleNode) childScope(parentPath, key string) string {
	parentPath = strings.TrimSpace(parentPath)
	key = strings.TrimSpace(key)
	if parentPath == "" || parentPath == "." {
		return key
	}
	return path.Clean(parentPath + "/" + key)
}

func (n *OracleNode) mergeGroupsByHistory(tree *Tree, node *prlmnode.Node, groups map[string][]string) (map[string][]string, map[string][]string) {
	if n == nil || n.ctx == nil || n.ctx.HistoryAgent == nil || tree == nil || node == nil || len(groups) < 2 {
		return groups, nil
	}
	// Only attempt to merge real directory segments (not virtual @chunk groups).
	for k := range groups {
		if strings.HasPrefix(k, "@") {
			return groups, nil
		}
	}

	keys := make([]string, 0, len(groups))
	for k := range groups {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	groupTokens := map[string]int{}
	for _, k := range keys {
		groupTokens[k] = groupTokenCount(tree, groups[k])
	}

	type mergeCandidate struct {
		a     string
		b     string
		score float64
		co    int
	}

	// Build candidate merges using co-change coupling between sibling scopes.
	cands := []mergeCandidate{}
	for i := 0; i < len(keys); i++ {
		for j := i + 1; j < len(keys); j++ {
			a := keys[i]
			b := keys[j]
			scopeA := n.childScope(node.Path, a)
			scopeB := n.childScope(node.Path, b)
			score, co, ok := n.ctx.HistoryAgent.Coupling(scopeA, scopeB)
			if !ok {
				continue
			}
			if !shouldBundleCoupling(score, co) {
				continue
			}
			cands = append(cands, mergeCandidate{a: a, b: b, score: score, co: co})
		}
	}
	if len(cands) == 0 {
		return groups, nil
	}
	sort.Slice(cands, func(i, j int) bool {
		if cands[i].score != cands[j].score {
			return cands[i].score > cands[j].score
		}
		if cands[i].co != cands[j].co {
			return cands[i].co > cands[j].co
		}
		if cands[i].a != cands[j].a {
			return cands[i].a < cands[j].a
		}
		return cands[i].b < cands[j].b
	})

	// Greedy union-find over keys, respecting effective capacity (merged child must still fit).
	effectiveCap := MaxLeafTokens
	if node.Capacity > 0 && node.Capacity < effectiveCap {
		effectiveCap = node.Capacity
	}

	parent := map[string]string{}
	tokens := map[string]int{}
	members := map[string][]string{}
	paths := map[string][]string{}
	for _, k := range keys {
		parent[k] = k
		tokens[k] = groupTokens[k]
		members[k] = []string{k}
		paths[k] = append([]string(nil), groups[k]...)
	}
	var find func(string) string
	find = func(x string) string {
		p := parent[x]
		if p == x {
			return x
		}
		root := find(p)
		parent[x] = root
		return root
	}
	union := func(a, b string) bool {
		ra := find(a)
		rb := find(b)
		if ra == rb {
			return false
		}
		if tokens[ra]+tokens[rb] > effectiveCap {
			return false
		}
		root := ra
		other := rb
		if root > other {
			root, other = other, root
		}
		parent[other] = root
		tokens[root] += tokens[other]
		members[root] = append(members[root], members[other]...)
		paths[root] = append(paths[root], paths[other]...)
		delete(tokens, other)
		delete(members, other)
		delete(paths, other)
		return true
	}
	for _, c := range cands {
		_ = union(c.a, c.b)
	}

	merged := map[string][]string{}
	bundleMembers := map[string][]string{}
	seenRoot := map[string]bool{}
	for _, k := range keys {
		r := find(k)
		if seenRoot[r] {
			continue
		}
		seenRoot[r] = true
		ms := append([]string(nil), members[r]...)
		sort.Strings(ms)
		ps := append([]string(nil), paths[r]...)
		sort.Strings(ps)

		if len(ms) <= 1 {
			merged[ms[0]] = ps
			continue
		}
		key := bundleKey(ms)
		merged[key] = ps
		bundleMembers[key] = ms
	}

	return merged, bundleMembers
}

// ---------------------------------------------------------------------------
// Pass B: Hydrate + Ask + Operate + Routing
// ---------------------------------------------------------------------------

// Hydrate orients this node and recursively hydrates children.
func (n *OracleNode) Hydrate(ctx context.Context, parentCtx *hydrateParentContext) (string, error) {
	if n == nil || n.ctx == nil || n.ctx.Tree == nil || n.ctx.Substrate == nil || n.Node == nil {
		return "", nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	default:
	}

	tree := n.ctx.Tree
	node := tree.MustNode(n.ID)
	tracker := hydrateTrackerFromCtx(ctx)
	if tracker != nil {
		tracker.visit(n.ID)
	}

	// Hydrate requires a live broker-backed runtime.
	if n.ctx.Broker == nil {
		node.Status = prlmnode.NodeStatusFailed
		node.Error = "no llm runtime configured"
		if tracker != nil {
			tracker.fail(n.ID)
		}
		return "", fmt.Errorf("hydrate requires an LLM runtime")
	}

	domainView := tree.DomainView(n.ID)
	if n.ctx.HistoryAgent != nil {
		scope := canonicalWorkspaceNodePath(node.Path)
		if hc, err := n.ctx.HistoryAgent.Query(scope); err == nil && hc != nil {
			domainView.History = hc.Markdown()
		}
	}
	domain, err := n.ctx.Substrate.AssembleDomain(ctx, tree, node, domainView)
	if err != nil {
		node.Status = prlmnode.NodeStatusFailed
		node.Error = err.Error()
		if tracker != nil {
			tracker.fail(n.ID)
		}
		return "", err
	}

	sandboxDir, ephemeral, err := n.ctx.resolveOrBuildSandbox(ctx, tree, node, domain)
	if err != nil {
		node.Status = prlmnode.NodeStatusFailed
		node.Error = err.Error()
		if tracker != nil {
			tracker.fail(n.ID)
		}
		return "", err
	}

	agentID := prlmAgentID(tree.ID, node.ID)
	if ephemeral {
		if n.ctx.PreserveSandbox {
			baseDir := filepath.Join(tree.RootPath, ".intent", "state", "sandboxes")
			defer func() { _, _ = preserveSandboxDir(baseDir, agentID, sandboxDir) }()
		} else {
			defer os.RemoveAll(sandboxDir)
		}
	}

	scopeAbs := nodeScopeAbs(tree, node)
	if _, err := n.ctx.Broker.RegisterOrUpdateAgent(agentID, broker.RoleLeafMapper, scopeAbs); err != nil {
		node.Status = prlmnode.NodeStatusFailed
		node.Error = err.Error()
		if tracker != nil {
			tracker.fail(n.ID)
		}
		return "", err
	}

	// Phase 1: ORIENT
	sys := hydrateSystemPrompt(len(node.ChildIDs) > 0)
	orientInstruction := hydrateOrientInstruction(node, parentCtx)
	node.Status = prlmnode.NodeStatusOperating
	node.Error = ""
	orientOut, err := n.ctx.completeWithRetry(ctx, func() (string, error) {
		return n.ctx.executePrompt(ctx, node.ID, "hydrate", orientInstruction, sys, sandboxDir)
	})
	if err != nil {
		node.Status = prlmnode.NodeStatusFailed
		node.Error = err.Error()
		if tracker != nil {
			tracker.fail(n.ID)
		}
		return "", err
	}
	node.LastOperatedAt = time.Now().UTC()
	node.Status = prlmnode.NodeStatusReady
	orientOut = strings.TrimSpace(orientOut)

	// Leaf nodes stop after Phase 1.
	if len(node.ChildIDs) == 0 {
		return orientOut, nil
	}

	// Phase 2: DISPATCH
	childCtx := &hydrateParentContext{}
	if parentCtx != nil && len(parentCtx.AncestryChain) > 0 {
		childCtx.AncestryChain = append([]hydrateAncestorEntry(nil), parentCtx.AncestryChain...)
	}
	childCtx.AncestryChain = append(childCtx.AncestryChain, hydrateAncestorEntry{
		NodeID:      node.ID,
		NodePath:    node.Path,
		Orientation: orientOut,
	})

	childOutputs := make(map[string]string, len(node.ChildIDs))
	var mu sync.Mutex
	if err := broker.RunParallel(ctx, node.ChildIDs, n.ctx.MaxParallel, func(cid string) error {
		out, err := NewOracleNode(tree.MustNode(cid), n.ctx).Hydrate(ctx, childCtx)
		if err != nil {
			if tracker != nil {
				tracker.fail(cid)
			}
			return err
		}
		mu.Lock()
		childOutputs[cid] = out
		mu.Unlock()
		return nil
	}); err != nil {
		return "", err
	}

	// Phase 3: SYNTHESIZE
	synthInstruction := hydrateSynthesizeInstruction(tree, childOutputs)
	node.Status = prlmnode.NodeStatusOperating
	synthOut, err := n.ctx.completeWithRetry(ctx, func() (string, error) {
		return n.ctx.executePrompt(ctx, node.ID, "hydrate", synthInstruction, sys, sandboxDir)
	})
	if err != nil {
		node.Status = prlmnode.NodeStatusFailed
		node.Error = err.Error()
		if tracker != nil {
			tracker.fail(n.ID)
		}
		return "", err
	}
	node.LastOperatedAt = time.Now().UTC()
	node.Status = prlmnode.NodeStatusReady
	return strings.TrimSpace(synthOut), nil
}

// Ask routes a message through this node's subtree and synthesizes an answer.
//
// This uses the same top-down then bottom-up pattern as Hydrate:
// Phase 1: Interpret (investigate local files first)
// Phase 2: Dispatch (send refined messages to relevant children)
// Phase 3: Synthesize (combine own findings + child answers and respond to parent)
func (n *OracleNode) Ask(ctx context.Context, message string, visited map[string]struct{}, visitedMu *sync.Mutex) (string, error) {
	if n == nil || n.ctx == nil || n.ctx.Tree == nil || n.ctx.Substrate == nil || n.Node == nil {
		return "", nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	default:
	}

	tree := n.ctx.Tree
	node := tree.MustNode(n.ID)
	debugEnabled := isAskTimingDebugEnabled() && node.ID == tree.RootID
	requestID := strings.TrimSpace(n.ctx.RequestID)
	if requestID == "" {
		requestID = "req"
	}
	askTimingf(debugEnabled, node.ID, requestID, "start")

	// Ask always requires a live broker-backed runtime.
	if n.ctx.Broker == nil {
		return "", fmt.Errorf("ask requires an LLM runtime")
	}

	if visitedMu != nil && visited != nil {
		visitedMu.Lock()
		visited[n.ID] = struct{}{}
		visitedMu.Unlock()
	}

	message = strings.TrimSpace(message)
	if message == "" {
		return "", nil
	}

	rootQuery := strings.TrimSpace(n.ctx.AskRootQuery)
	if rootQuery == "" {
		rootQuery = message
	}

	domainView := tree.DomainView(n.ID)
	// Ask uses parent->child messages as the ONLY parent context mechanism.
	// Do not materialize separate ancestor context sidecars for Ask.
	domainView.Ancestors = nil

	if n.ctx.HistoryAgent != nil {
		scope := canonicalWorkspaceNodePath(node.Path)
		if hc, err := n.ctx.HistoryAgent.Query(scope); err == nil && hc != nil {
			domainView.History = hc.Markdown()
		}
	}

	domain, err := n.ctx.Substrate.AssembleDomain(ctx, tree, node, domainView)
	if err != nil {
		return "", err
	}
	askTimingf(debugEnabled, node.ID, requestID, "assembled domain local=%d children=%d", len(domain.Local), len(domain.Children))

	sandboxDir, ephemeral, err := n.ctx.resolveOrBuildSandbox(ctx, tree, node, domain)
	if err != nil {
		node.Status = prlmnode.NodeStatusFailed
		node.Error = err.Error()
		return "", err
	}
	askTimingf(debugEnabled, node.ID, requestID, "sandbox ready persistent=%v", !ephemeral)
	if ephemeral {
		defer os.RemoveAll(sandboxDir)
	}

	scopeAbs := nodeScopeAbs(tree, node)
	agentID := prlmAgentID(tree.ID, node.ID)
	if _, err := n.ctx.Broker.RegisterOrUpdateAgent(agentID, broker.RoleLeafMapper, scopeAbs); err != nil {
		node.Status = prlmnode.NodeStatusFailed
		node.Error = err.Error()
		return "", err
	}

	sys := oracleSystemPrompt(len(node.ChildIDs) > 0)

	// Leaf: answer directly (one turn).
	if len(node.ChildIDs) == 0 {
		instruction := askLeafInstruction(node, message)
		node.Status = prlmnode.NodeStatusOperating
		node.Error = ""
		out, err := n.ctx.completeWithRetry(ctx, func() (string, error) {
			return n.ctx.executePrompt(ctx, node.ID, "ask", instruction, sys, sandboxDir)
		})
		if err != nil {
			node.Status = prlmnode.NodeStatusFailed
			node.Error = err.Error()
			return "", err
		}
		node.LastOperatedAt = time.Now().UTC()
		node.Status = prlmnode.NodeStatusReady
		askTimingf(debugEnabled, node.ID, requestID, "leaf done")
		return strings.TrimSpace(out), nil
	}

	// Phase 1: INTERPRET (parent first, then refine for children).
	node.Status = prlmnode.NodeStatusOperating
	node.Error = ""
	interpretInstruction := askInterpretInstruction(node, message)
	interpretOut, err := n.ctx.completeWithRetry(ctx, func() (string, error) {
		return n.ctx.executePrompt(ctx, node.ID, "ask", interpretInstruction, sys, sandboxDir)
	})
	if err != nil {
		node.Status = prlmnode.NodeStatusFailed
		node.Error = err.Error()
		return "", err
	}
	interpretOut = strings.TrimSpace(interpretOut)
	node.LastOperatedAt = time.Now().UTC()
	node.Status = prlmnode.NodeStatusReady
	askTimingf(debugEnabled, node.ID, requestID, "interpret done")

	// Phase 2: DISPATCH (always exhaustive fan-out to all direct children).
	childIDs := append([]string(nil), node.ChildIDs...)
	askTimingf(debugEnabled, node.ID, requestID, "dispatching %d children (exhaustive)", len(childIDs))

	childOutputs := make(map[string]string, len(childIDs))
	childErrors := make(map[string]string, len(childIDs))
	var mu sync.Mutex
	if err := broker.RunParallel(ctx, childIDs, n.ctx.MaxParallel, func(cid string) error {
		childNode := tree.MustNode(cid)

		childMsg := askDispatchMessage(childNode, rootQuery, interpretOut)
		out, err := NewOracleNode(childNode, n.ctx).Ask(ctx, childMsg, visited, visitedMu)
		if err != nil {
			mu.Lock()
			childErrors[cid] = strings.TrimSpace(err.Error())
			mu.Unlock()
			return nil
		}
		mu.Lock()
		childOutputs[cid] = strings.TrimSpace(out)
		mu.Unlock()
		return nil
	}); err != nil {
		return "", err
	}
	if len(childErrors) > 0 {
		keys := make([]string, 0, len(childErrors))
		for cid := range childErrors {
			keys = append(keys, cid)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, cid := range keys {
			parts = append(parts, fmt.Sprintf("%s: %s", cid, childErrors[cid]))
		}
		return "", fmt.Errorf("child ask failures are not tolerated: %s", strings.Join(parts, "; "))
	}
	askTimingf(debugEnabled, node.ID, requestID, "children complete successes=%d failures=%d", len(childOutputs), len(childErrors))

	// Phase 3: SYNTHESIZE
	synthInstruction := askSynthesizeInstruction(tree, node, message, childIDs, childOutputs)
	node.Status = prlmnode.NodeStatusOperating
	node.Error = ""
	synthOut, err := n.ctx.completeWithRetry(ctx, func() (string, error) {
		return n.ctx.executePrompt(ctx, node.ID, "ask", synthInstruction, sys, sandboxDir)
	})
	if err != nil {
		node.Status = prlmnode.NodeStatusFailed
		node.Error = err.Error()
		return "", err
	}
	node.LastOperatedAt = time.Now().UTC()
	node.Status = prlmnode.NodeStatusReady
	askTimingf(debugEnabled, node.ID, requestID, "synthesize done")
	return strings.TrimSpace(synthOut), nil
}

// Operate runs one node-level operation through the broker-backed session client.
func (n *OracleNode) Operate(ctx context.Context, domain *prlmnode.Domain, message string) (string, error) {
	if n == nil || n.ctx == nil || n.ctx.Tree == nil || n.Node == nil || domain == nil {
		return "", nil
	}

	tree := n.ctx.Tree
	node := n.Node

	if n.ctx.Broker == nil {
		return "", fmt.Errorf("operate requires an LLM runtime")
	}

	node.Status = prlmnode.NodeStatusOperating
	node.Error = ""

	sandboxDir, ephemeral, err := n.ctx.resolveOrBuildSandbox(ctx, tree, node, domain)
	if err != nil {
		node.Status = prlmnode.NodeStatusFailed
		node.Error = err.Error()
		return "", err
	}
	if ephemeral {
		defer os.RemoveAll(sandboxDir)
	}

	sys := oracleSystemPrompt(len(domain.Children) > 0)
	instruction := oracleInstruction(node, message)

	agentID := prlmAgentID(tree.ID, node.ID)
	scopeAbs := nodeScopeAbs(tree, node)
	if _, err := n.ctx.Broker.RegisterOrUpdateAgent(agentID, broker.RoleLeafMapper, scopeAbs); err != nil {
		node.Status = prlmnode.NodeStatusFailed
		node.Error = err.Error()
		return "", err
	}

	out, err := n.ctx.completeWithRetry(ctx, func() (string, error) {
		return n.ctx.executePrompt(ctx, node.ID, "operate", instruction, sys, sandboxDir)
	})
	if err != nil {
		node.Status = prlmnode.NodeStatusFailed
		node.Error = err.Error()
		return "", err
	}

	node.LastOperatedAt = time.Now().UTC()
	return out, nil
}

func hydrateParentContextText(parentCtx *hydrateParentContext) string {
	if parentCtx == nil || len(parentCtx.AncestryChain) == 0 {
		return ""
	}
	var b strings.Builder
	for _, anc := range parentCtx.AncestryChain {
		p := strings.TrimSpace(anc.NodePath)
		if p == "" {
			p = "."
		}
		b.WriteString("## ")
		b.WriteString(p)
		b.WriteString("\n")
		b.WriteString(strings.TrimSpace(anc.Orientation))
		b.WriteString("\n\n")
	}
	return strings.TrimSpace(b.String())
}

// RouteChildren scores and selects the most relevant children for a query.
// All children with a positive relevance score are included. When no children
// score positively, all children are returned (full broadcast).
func (n *OracleNode) RouteChildren(query string) []string {
	if n == nil || n.ctx == nil || n.ctx.Tree == nil || n.Node == nil || len(n.ChildIDs) == 0 {
		return nil
	}

	tree := n.ctx.Tree
	node := n.Node

	q := strings.ToLower(strings.TrimSpace(query))
	terms := routingTerms(q)

	type scored struct {
		id    string
		score int
	}

	var nonZero []scored
	for _, cid := range node.ChildIDs {
		child := tree.Nodes[cid]
		if child == nil {
			continue
		}
		score := scoreChildRelevance(tree, child, q, terms)
		if score > 0 {
			nonZero = append(nonZero, scored{id: cid, score: score})
		}
	}

	if len(nonZero) > 0 {
		sort.Slice(nonZero, func(i, j int) bool {
			if nonZero[i].score != nonZero[j].score {
				return nonZero[i].score > nonZero[j].score
			}
			return nonZero[i].id < nonZero[j].id
		})
		out := make([]string, 0, len(nonZero))
		for _, s := range nonZero {
			out = append(out, s.id)
		}
		return out
	}

	// No scoring signal — broadcast to all children.
	return append([]string(nil), node.ChildIDs...)
}
