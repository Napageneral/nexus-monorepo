// Package operations implements the operation taxonomy and handler dispatch.
package operations

import (
	"context"
	"fmt"
	"sort"
	"sync"

	"github.com/Napageneral/nexus/internal/pipeline"
)

// OperationKind classifies how an operation is dispatched.
type OperationKind string

const (
	KindProtocol OperationKind = "protocol"
	KindControl  OperationKind = "control"
	KindEvent    OperationKind = "event"
)

// ActionType classifies the intent of an operation for IAM.
type ActionType string

const (
	ActionRead    ActionType = "read"
	ActionWrite   ActionType = "write"
	ActionAdmin   ActionType = "admin"
	ActionApprove ActionType = "approve"
	ActionPair    ActionType = "pair"
)

// Surface identifies where an operation can be invoked.
type Surface string

const (
	SurfaceWSControl    Surface = "ws.control"
	SurfaceHTTPControl  Surface = "http.control"
	SurfaceHTTPIngress  Surface = "http.ingress"
	SurfaceAdapterCLI   Surface = "adapter.cli"
	SurfaceInternalClock Surface = "internal.clock"
)

// OperationHandler is the function signature for operation handlers.
// It receives the request context and the NexusRequest, and returns a result or error.
type OperationHandler func(ctx context.Context, req *pipeline.NexusRequest) (any, error)

// OperationDef describes a single registered operation.
type OperationDef struct {
	Operation string
	Kind      OperationKind
	Action    ActionType
	Resource  string
	Surfaces  []Surface
	Handler   OperationHandler
}

// Registry holds all registered operations (static + dynamic).
type Registry struct {
	static  map[string]*OperationDef
	dynamic map[string]*OperationDef
	mu      sync.RWMutex
}

// NewRegistry creates a new empty operation registry.
func NewRegistry() *Registry {
	return &Registry{
		static:  make(map[string]*OperationDef),
		dynamic: make(map[string]*OperationDef),
	}
}

// Register adds a static operation to the registry.
func (r *Registry) Register(def OperationDef) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.static[def.Operation] = &def
}

// RegisterDynamic adds a dynamic (app-registered) operation.
func (r *Registry) RegisterDynamic(def OperationDef) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.dynamic[def.Operation] = &def
}

// UnregisterDynamic removes dynamic operations by their IDs.
func (r *Registry) UnregisterDynamic(operationIDs []string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, id := range operationIDs {
		delete(r.dynamic, id)
	}
}

// Resolve looks up an operation definition by name.
// Static operations take priority over dynamic ones.
func (r *Registry) Resolve(operation string) (*OperationDef, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if def, ok := r.static[operation]; ok {
		return def, nil
	}
	if def, ok := r.dynamic[operation]; ok {
		return def, nil
	}
	return nil, fmt.Errorf("%w: %s", ErrOperationNotFound, operation)
}

// Has returns true if the operation is registered (static or dynamic).
func (r *Registry) Has(operation string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, s := r.static[operation]
	_, d := r.dynamic[operation]
	return s || d
}

// List returns all registered operation names, sorted alphabetically.
func (r *Registry) List() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	seen := make(map[string]struct{})
	for k := range r.static {
		seen[k] = struct{}{}
	}
	for k := range r.dynamic {
		seen[k] = struct{}{}
	}

	names := make([]string, 0, len(seen))
	for k := range seen {
		names = append(names, k)
	}
	sort.Strings(names)
	return names
}

// Count returns the total number of registered operations.
func (r *Registry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	seen := make(map[string]struct{})
	for k := range r.static {
		seen[k] = struct{}{}
	}
	for k := range r.dynamic {
		seen[k] = struct{}{}
	}
	return len(seen)
}

// Sentinel errors.
var ErrOperationNotFound = fmt.Errorf("operation not found")
