package store

import (
	"context"
	"sort"
	"sync"

	prlmtree "github.com/Napageneral/spike/internal/prlm/tree"
)

// MemStore is an in-memory durable store used for fast tests.
type MemStore struct {
	mu    sync.RWMutex
	trees map[string]*prlmtree.Tree
}

func NewMemStore() *MemStore {
	return &MemStore{trees: map[string]*prlmtree.Tree{}}
}

func (s *MemStore) CreateTree(_ context.Context, tree *prlmtree.Tree) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.trees[tree.ID]; exists {
		return s.saveLocked(tree)
	}
	clone, err := tree.Clone()
	if err != nil {
		return err
	}
	s.trees[tree.ID] = clone
	return nil
}

func (s *MemStore) SaveTree(_ context.Context, tree *prlmtree.Tree) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveLocked(tree)
}

func (s *MemStore) saveLocked(tree *prlmtree.Tree) error {
	clone, err := tree.Clone()
	if err != nil {
		return err
	}
	s.trees[tree.ID] = clone
	return nil
}

func (s *MemStore) LoadTree(_ context.Context, treeID string) (*prlmtree.Tree, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	tree, ok := s.trees[treeID]
	if !ok {
		return nil, prlmtree.ErrTreeNotFound
	}
	return tree.Clone()
}

func (s *MemStore) ListTreeIDs(_ context.Context) ([]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ids := make([]string, 0, len(s.trees))
	for id := range s.trees {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids, nil
}

func (s *MemStore) DeleteTree(_ context.Context, treeID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.trees, treeID)
	return nil
}
