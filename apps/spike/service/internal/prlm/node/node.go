package node

import "time"

// NodeStatus is lifecycle state for a node in the kernel.
type NodeStatus string

const (
	NodeStatusCreated      NodeStatus = "created"
	NodeStatusPartitioning NodeStatus = "partitioning"
	NodeStatusReady        NodeStatus = "ready"
	NodeStatusOperating    NodeStatus = "operating"
	NodeStatusFailed       NodeStatus = "failed"
)

// StalenessKind tracks why a node is unconverged.
type StalenessKind string

const (
	StalenessClean      StalenessKind = "clean"
	StalenessContent    StalenessKind = "content_stale"
	StalenessStructural StalenessKind = "structurally_stale"
)

// Node is one durable agent stationed over a corpus slice.
type Node struct {
	ID       string   `json:"id"`
	ParentID string   `json:"parent_id,omitempty"`
	ChildIDs []string `json:"child_ids,omitempty"`
	Path     string   `json:"path"`

	LocalPaths []string `json:"local_paths,omitempty"`
	Capacity   int      `json:"capacity"`

	Status         NodeStatus    `json:"status"`
	StalenessState StalenessKind `json:"staleness"`

	LastOperatedAt time.Time `json:"last_operated_at,omitempty"`
	Error          string    `json:"error,omitempty"`

	BundleMembers []string `json:"bundle_members,omitempty"`
}

func NewNode(id, path string, localPaths []string, capacity int) *Node {
	copyPaths := append([]string(nil), localPaths...)
	return &Node{
		ID:             id,
		Path:           path,
		LocalPaths:     copyPaths,
		Capacity:       capacity,
		Status:         NodeStatusCreated,
		StalenessState: StalenessClean,
	}
}

func (n *Node) IsLeaf() bool {
	return len(n.ChildIDs) == 0
}
