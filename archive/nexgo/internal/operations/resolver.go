package operations

import (
	"github.com/Napageneral/nexus/internal/pipeline"
)

// RegistryResolver adapts a Registry to satisfy pipeline.OperationResolver.
type RegistryResolver struct {
	reg *Registry
}

// NewResolver creates a pipeline.OperationResolver backed by the given Registry.
func NewResolver(reg *Registry) *RegistryResolver {
	return &RegistryResolver{reg: reg}
}

// Resolve looks up an operation and returns info the pipeline needs.
func (rr *RegistryResolver) Resolve(operation string) (pipeline.OperationHandlerInfo, error) {
	def, err := rr.reg.Resolve(operation)
	if err != nil {
		return pipeline.OperationHandlerInfo{}, err
	}
	return pipeline.OperationHandlerInfo{
		Operation: def.Operation,
		Kind:      string(def.Kind),
		Action:    string(def.Action),
		Resource:  def.Resource,
		Handler:   def.Handler,
	}, nil
}

// Has returns true if the operation is registered.
func (rr *RegistryResolver) Has(operation string) bool {
	return rr.reg.Has(operation)
}
