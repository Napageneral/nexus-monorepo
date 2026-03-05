package tree

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
)

// Tree is a durable PRLM agent-tree over one corpus root.
type Tree struct {
	ID        string                          `json:"id"`
	RootPath  string                          `json:"root_path"`
	RootID    string                          `json:"root_id"`
	Nodes     map[string]*prlmnode.Node       `json:"nodes"`
	Index     map[string]prlmnode.CorpusEntry `json:"index"`
	CreatedAt time.Time                       `json:"created_at"`
	UpdatedAt time.Time                       `json:"updated_at"`
}

func NewTree(id, rootPath string, capacity int, entries []prlmnode.CorpusEntry) *Tree {
	index := make(map[string]prlmnode.CorpusEntry, len(entries))
	paths := make([]string, 0, len(entries))
	for _, e := range entries {
		index[e.Path] = e
		paths = append(paths, e.Path)
	}
	sort.Strings(paths)
	root := prlmnode.NewNode("root", ".", paths, capacity)
	now := time.Now().UTC()
	return &Tree{
		ID:       id,
		RootPath: rootPath,
		RootID:   root.ID,
		Nodes: map[string]*prlmnode.Node{
			root.ID: root,
		},
		Index:     index,
		CreatedAt: now,
		UpdatedAt: now,
	}
}

func (t *Tree) Clone() (*Tree, error) {
	b, err := json.Marshal(t)
	if err != nil {
		return nil, err
	}
	var out Tree
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, err
	}
	out.Normalize()
	return &out, nil
}

func (t *Tree) Normalize() {
	if t == nil {
		return
	}
	if t.Nodes == nil {
		t.Nodes = map[string]*prlmnode.Node{}
	}
	if t.Index == nil {
		t.Index = map[string]prlmnode.CorpusEntry{}
	}
}

func (t *Tree) Touch() {
	t.UpdatedAt = time.Now().UTC()
}

func (t *Tree) Node(id string) (*prlmnode.Node, bool) {
	n, ok := t.Nodes[id]
	return n, ok
}

func (t *Tree) MustNode(id string) *prlmnode.Node {
	n := t.Nodes[id]
	if n == nil {
		panic("node not found: " + id)
	}
	return n
}

func (t *Tree) AddNode(n *prlmnode.Node) error {
	if _, exists := t.Nodes[n.ID]; exists {
		return fmt.Errorf("node already exists: %s", n.ID)
	}
	if n.ParentID != "" {
		parent := t.Nodes[n.ParentID]
		if parent == nil {
			return fmt.Errorf("parent missing: %s", n.ParentID)
		}
		parent.ChildIDs = append(parent.ChildIDs, n.ID)
	}
	t.Nodes[n.ID] = n
	t.Touch()
	return nil
}

func (t *Tree) RemoveSubtree(rootID string) error {
	if rootID == t.RootID {
		return errors.New("cannot remove root subtree")
	}
	node, ok := t.Nodes[rootID]
	if !ok {
		return nil
	}
	for _, childID := range append([]string(nil), node.ChildIDs...) {
		if err := t.RemoveSubtree(childID); err != nil {
			return err
		}
	}
	if node.ParentID != "" {
		parent := t.Nodes[node.ParentID]
		if parent != nil {
			filtered := parent.ChildIDs[:0]
			for _, cid := range parent.ChildIDs {
				if cid != rootID {
					filtered = append(filtered, cid)
				}
			}
			parent.ChildIDs = append([]string(nil), filtered...)
		}
	}
	delete(t.Nodes, rootID)
	t.Touch()
	return nil
}

func (t *Tree) NodeLocalEntries(nodeID string) []prlmnode.CorpusEntry {
	node := t.Nodes[nodeID]
	if node == nil {
		return nil
	}
	entries := make([]prlmnode.CorpusEntry, 0, len(node.LocalPaths))
	for _, p := range node.LocalPaths {
		if e, ok := t.Index[p]; ok {
			entries = append(entries, e)
		}
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
	return entries
}

func (t *Tree) NodeExtentPaths(nodeID string) []string {
	node := t.Nodes[nodeID]
	if node == nil {
		return nil
	}
	seen := map[string]struct{}{}
	for _, p := range node.LocalPaths {
		seen[p] = struct{}{}
	}
	for _, cid := range node.ChildIDs {
		for _, p := range t.NodeExtentPaths(cid) {
			seen[p] = struct{}{}
		}
	}
	out := make([]string, 0, len(seen))
	for p := range seen {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}

func (t *Tree) NodeExtentTokens(nodeID string) int {
	tokens := 0
	for _, p := range t.NodeExtentPaths(nodeID) {
		if e, ok := t.Index[p]; ok {
			tokens += e.Tokens
		}
	}
	return tokens
}

func (t *Tree) DomainView(nodeID string) prlmnode.Domain {
	node := t.Nodes[nodeID]
	d := prlmnode.Domain{
		NodeID: nodeID,
	}
	if node == nil {
		return d
	}
	d.Local = t.NodeLocalEntries(nodeID)
	for _, cid := range node.ChildIDs {
		d.Children = append(d.Children, prlmnode.ChildContext{NodeID: cid})
	}
	for _, aid := range t.AncestorChain(nodeID) {
		d.Ancestors = append(d.Ancestors, prlmnode.AncestorContext{NodeID: aid})
	}
	return d
}

func (t *Tree) AncestorChain(nodeID string) []string {
	node := t.Nodes[nodeID]
	if node == nil {
		return nil
	}
	chain := []string{}
	cur := node.ParentID
	for cur != "" {
		chain = append(chain, cur)
		n := t.Nodes[cur]
		if n == nil {
			break
		}
		cur = n.ParentID
	}
	return chain
}

func (t *Tree) IsAcyclic() bool {
	state := map[string]int{} // 0=unseen,1=visiting,2=done
	var visit func(id string) bool
	visit = func(id string) bool {
		switch state[id] {
		case 1:
			return false
		case 2:
			return true
		}
		state[id] = 1
		n := t.Nodes[id]
		if n != nil {
			for _, cid := range n.ChildIDs {
				if !visit(cid) {
					return false
				}
			}
		}
		state[id] = 2
		return true
	}
	if !visit(t.RootID) {
		return false
	}
	for id := range t.Nodes {
		if state[id] == 0 {
			return false
		}
	}
	return true
}

func (t *Tree) SingleRootInvariant() bool {
	if t.RootID == "" || t.Nodes[t.RootID] == nil {
		return false
	}
	parents := map[string]int{}
	for _, n := range t.Nodes {
		for _, cid := range n.ChildIDs {
			parents[cid]++
		}
	}
	for id, n := range t.Nodes {
		if id == t.RootID {
			if n.ParentID != "" {
				return false
			}
			continue
		}
		if parents[id] != 1 {
			return false
		}
	}
	return true
}

func (t *Tree) ValidateOwnershipDisjoint() bool {
	owner := map[string]string{}
	for _, n := range t.Nodes {
		for _, p := range n.LocalPaths {
			if prev, dup := owner[p]; dup && prev != n.ID {
				return false
			}
			owner[p] = n.ID
		}
	}
	return true
}

func (t *Tree) ReplaceIndex(entries []prlmnode.CorpusEntry) {
	updated := make(map[string]prlmnode.CorpusEntry, len(entries))
	for _, e := range entries {
		updated[e.Path] = e
	}
	t.Index = updated
	t.Touch()
}
