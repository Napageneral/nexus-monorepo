package iam

import (
	"context"
	"log/slog"
)

// PolicyEngine evaluates access decisions using the grant store.
type PolicyEngine struct {
	grants *GrantStore
	logger *slog.Logger
}

// NewPolicyEngine creates a new PolicyEngine.
func NewPolicyEngine(grants *GrantStore, logger *slog.Logger) *PolicyEngine {
	return &PolicyEngine{
		grants: grants,
		logger: logger,
	}
}

// Evaluate checks if an entity has access to perform the given operation on the resource.
// Returns an AccessDecision with the result.
func (e *PolicyEngine) Evaluate(ctx context.Context, entityID, operation, resource string) *AccessDecision {
	decision, err := e.grants.Evaluate(ctx, entityID, operation, resource)
	if err != nil {
		e.logger.Error("policy evaluation error",
			"entity_id", entityID,
			"operation", operation,
			"resource", resource,
			"error", err,
		)
		return &AccessDecision{
			Allowed: false,
			Reason:  "evaluation error: " + err.Error(),
		}
	}

	e.logger.Debug("policy evaluated",
		"entity_id", entityID,
		"operation", operation,
		"resource", resource,
		"allowed", decision.Allowed,
		"reason", decision.Reason,
	)

	return decision
}
