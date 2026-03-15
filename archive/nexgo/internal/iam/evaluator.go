package iam

import (
	"context"
	"fmt"

	"github.com/Napageneral/nexus/internal/pipeline"
)

// IAMEvaluator implements pipeline.AccessEvaluator using the grant-based policy engine.
// In allow-by-default mode (appropriate for personal/single-user deployments),
// requests are allowed unless an explicit deny grant matches. In deny-by-default
// mode, requests require an explicit allow grant.
type IAMEvaluator struct {
	engine          *PolicyEngine
	audit           *AuditLogger
	allowByDefault  bool
}

// NewIAMEvaluator creates a new IAMEvaluator.
// By default, uses allow-by-default mode suitable for personal deployments.
func NewIAMEvaluator(engine *PolicyEngine, audit *AuditLogger) *IAMEvaluator {
	return &IAMEvaluator{
		engine:         engine,
		audit:          audit,
		allowByDefault: true,
	}
}

// NewStrictIAMEvaluator creates an IAMEvaluator in deny-by-default mode.
// Use for multi-user or high-security deployments.
func NewStrictIAMEvaluator(engine *PolicyEngine, audit *AuditLogger) *IAMEvaluator {
	return &IAMEvaluator{
		engine:         engine,
		audit:          audit,
		allowByDefault: false,
	}
}

// Evaluate checks access for a pipeline request using the IAM policy engine.
// It inspects req.Principals to determine the sender entity and evaluates
// against the request's operation.
func (e *IAMEvaluator) Evaluate(ctx context.Context, req *pipeline.NexusRequest) (*pipeline.AccessDecision, error) {
	// Determine the entity ID from principals.
	entityID := ""
	if req.Principals != nil && req.Principals.Sender != nil {
		entityID = req.Principals.Sender.ID
	}
	if entityID == "" {
		entityID = req.Routing.Sender.ID
	}

	// Use the operation as both the operation and resource for evaluation.
	operation := req.Operation
	resource := "*" // Default resource

	decision := e.engine.Evaluate(ctx, entityID, operation, resource)

	// In allow-by-default mode, only honor explicit deny grants.
	// "no matching grant" means no explicit policy → allow.
	if e.allowByDefault && !decision.Allowed && decision.Reason == "no matching grant" {
		decision.Allowed = true
		decision.Reason = "allow-by-default"
		decision.MatchedGrant = "default-allow"
	}

	// Log the audit entry.
	if e.audit != nil {
		action := "deny"
		if decision.Allowed {
			action = "allow"
		}
		_ = e.audit.Log(ctx, AuditEntry{
			EntityID:  entityID,
			Operation: operation,
			Resource:  resource,
			Action:    action,
			Details:   fmt.Sprintf(`{"matched_grant":%q,"reason":%q}`, decision.MatchedGrant, decision.Reason),
		})
	}

	// Convert to pipeline.AccessDecision.
	pipelineDecision := &pipeline.AccessDecision{
		Decision: "deny",
	}
	if decision.Allowed {
		pipelineDecision.Decision = "allow"
		pipelineDecision.MatchedPolicy = decision.MatchedGrant
		pipelineDecision.Permissions = pipeline.AccessPermissions{
			Tools:       pipeline.ToolPermissions{Allow: []string{"*"}},
			Credentials: []string{},
		}
	} else {
		pipelineDecision.MatchedPolicy = decision.Reason
	}

	return pipelineDecision, nil
}
