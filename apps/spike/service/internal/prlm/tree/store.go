package tree

import (
	"context"
	"errors"
)

var ErrTreeNotFound = errors.New("prlm tree not found")

// Store persists PRLM tree state for pause/resume durability.
type Store interface {
	CreateTree(ctx context.Context, tree *Tree) error
	SaveTree(ctx context.Context, tree *Tree) error
	LoadTree(ctx context.Context, treeID string) (*Tree, error)
	ListTreeIDs(ctx context.Context) ([]string, error)
	DeleteTree(ctx context.Context, treeID string) error
}
