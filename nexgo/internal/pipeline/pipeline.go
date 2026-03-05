package pipeline

import (
	"context"
	"fmt"
	"log/slog"
	"time"
)

// OperationResolver looks up an operation handler by name.
// This interface decouples the pipeline from the operations package to avoid import cycles.
type OperationResolver interface {
	Resolve(operation string) (OperationHandlerInfo, error)
	Has(operation string) bool
}

// OperationHandlerInfo holds what the pipeline needs to dispatch an operation.
type OperationHandlerInfo struct {
	Operation string
	Kind      string
	Action    string
	Resource  string
	Handler   func(ctx context.Context, req *NexusRequest) (any, error)
}

// PrincipalResolver resolves sender/receiver entities from routing information.
// In Phase 1 this is a stub; real implementation uses identity.db in Phase 3.
type PrincipalResolver interface {
	ResolveSender(ctx context.Context, req *NexusRequest) (*Entity, error)
	ResolveReceiver(ctx context.Context, req *NexusRequest) (*Entity, error)
}

// AccessEvaluator evaluates access control for a request.
// Phase 1 stub allows all; real IAM evaluation is Phase 3.
type AccessEvaluator interface {
	Evaluate(ctx context.Context, req *NexusRequest) (*AccessDecision, error)
}

// TraceStore persists pipeline traces.
// Phase 1 implementation stores to runtime.db; can be nil for testing.
type TraceStore interface {
	StorePipelineTrace(ctx context.Context, req *NexusRequest, result *NexusResult) error
}

// Pipeline orchestrates the 5-stage request processing flow.
type Pipeline struct {
	operations OperationResolver
	principals PrincipalResolver
	access     AccessEvaluator
	traces     TraceStore
	logger     *slog.Logger
}

// NewPipeline creates a new Pipeline with the given dependencies.
func NewPipeline(ops OperationResolver, opts ...PipelineOption) *Pipeline {
	p := &Pipeline{
		operations: ops,
		principals: &stubPrincipalResolver{},
		access:     &stubAccessEvaluator{},
		logger:     slog.Default(),
	}
	for _, opt := range opts {
		opt(p)
	}
	return p
}

// PipelineOption configures optional Pipeline dependencies.
type PipelineOption func(*Pipeline)

// WithPrincipalResolver sets the principal resolver.
func WithPrincipalResolver(pr PrincipalResolver) PipelineOption {
	return func(p *Pipeline) { p.principals = pr }
}

// WithAccessEvaluator sets the access evaluator.
func WithAccessEvaluator(ae AccessEvaluator) PipelineOption {
	return func(p *Pipeline) { p.access = ae }
}

// WithTraceStore sets the trace persistence store.
func WithTraceStore(ts TraceStore) PipelineOption {
	return func(p *Pipeline) { p.traces = ts }
}

// WithLogger sets the logger.
func WithLogger(logger *slog.Logger) PipelineOption {
	return func(p *Pipeline) { p.logger = logger }
}

// Execute runs a NexusRequest through all 5 pipeline stages.
func (p *Pipeline) Execute(ctx context.Context, req *NexusRequest) (*NexusResult, error) {
	start := time.Now()

	p.logger.Debug("pipeline.execute",
		"request_id", req.RequestID,
		"operation", req.Operation,
	)

	// Stage 1: Accept Request
	if err := p.acceptRequest(ctx, req); err != nil {
		return p.failResult(req, start, err), err
	}

	// Stage 2: Resolve Principals
	if err := p.resolvePrincipals(ctx, req); err != nil {
		return p.failResult(req, start, err), err
	}

	// Stage 3: Resolve Access
	if err := p.resolveAccess(ctx, req); err != nil {
		return p.failResult(req, start, err), err
	}

	// Stage 4: Execute Operation
	data, err := p.executeOperation(ctx, req)
	if err != nil {
		return p.failResult(req, start, err), err
	}

	// Stage 5: Finalize Request
	result := p.finalizeRequest(req, start, data)

	// Persist trace (best-effort)
	if p.traces != nil {
		if traceErr := p.traces.StorePipelineTrace(ctx, req, result); traceErr != nil {
			p.logger.Warn("failed to persist pipeline trace",
				"request_id", req.RequestID,
				"error", traceErr,
			)
		}
	}

	return result, nil
}

// acceptRequest validates the request and assigns metadata (Stage 1).
func (p *Pipeline) acceptRequest(ctx context.Context, req *NexusRequest) error {
	stageStart := time.Now()
	stageName := "acceptRequest"

	// Validate operation exists
	if req.Operation == "" {
		err := fmt.Errorf("operation is required")
		p.appendTrace(req, stageName, stageStart, err)
		return err
	}
	if !p.operations.Has(req.Operation) {
		err := fmt.Errorf("unknown operation: %s", req.Operation)
		p.appendTrace(req, stageName, stageStart, err)
		return err
	}

	// Ensure request ID and timestamp are set
	if req.RequestID == "" {
		req.RequestID = newUUID()
	}
	if req.CreatedAt == 0 {
		req.CreatedAt = time.Now().UnixMilli()
	}

	req.Status = StatusProcessing
	p.appendTrace(req, stageName, stageStart, nil)
	return nil
}

// resolvePrincipals resolves sender/receiver entities (Stage 2).
func (p *Pipeline) resolvePrincipals(ctx context.Context, req *NexusRequest) error {
	stageStart := time.Now()
	stageName := "resolvePrincipals"

	sender, err := p.principals.ResolveSender(ctx, req)
	if err != nil {
		p.appendTrace(req, stageName, stageStart, err)
		return fmt.Errorf("resolvePrincipals: sender: %w", err)
	}

	receiver, err := p.principals.ResolveReceiver(ctx, req)
	if err != nil {
		p.appendTrace(req, stageName, stageStart, err)
		return fmt.Errorf("resolvePrincipals: receiver: %w", err)
	}

	req.Principals = &Principals{
		Sender:   sender,
		Receiver: receiver,
	}

	p.appendTrace(req, stageName, stageStart, nil)
	return nil
}

// resolveAccess evaluates IAM policies (Stage 3).
func (p *Pipeline) resolveAccess(ctx context.Context, req *NexusRequest) error {
	stageStart := time.Now()
	stageName := "resolveAccess"

	decision, err := p.access.Evaluate(ctx, req)
	if err != nil {
		p.appendTrace(req, stageName, stageStart, err)
		return fmt.Errorf("resolveAccess: %w", err)
	}

	req.Access = decision

	if decision.Decision == "deny" {
		req.Status = StatusDenied
		p.appendTrace(req, stageName, stageStart, nil)
		return fmt.Errorf("access denied: policy=%s", decision.MatchedPolicy)
	}

	p.appendTrace(req, stageName, stageStart, nil)
	return nil
}

// executeOperation dispatches to the operation handler (Stage 4).
func (p *Pipeline) executeOperation(ctx context.Context, req *NexusRequest) (any, error) {
	stageStart := time.Now()
	stageName := "executeOperation"

	info, err := p.operations.Resolve(req.Operation)
	if err != nil {
		p.appendTrace(req, stageName, stageStart, err)
		return nil, fmt.Errorf("executeOperation: %w", err)
	}

	if info.Handler == nil {
		err := fmt.Errorf("operation %s has no handler", req.Operation)
		p.appendTrace(req, stageName, stageStart, err)
		return nil, err
	}

	data, err := info.Handler(ctx, req)
	if err != nil {
		p.appendTrace(req, stageName, stageStart, err)
		return nil, fmt.Errorf("executeOperation: %s: %w", req.Operation, err)
	}

	p.appendTrace(req, stageName, stageStart, nil)
	return data, nil
}

// finalizeRequest sets the final status and creates the result (Stage 5).
func (p *Pipeline) finalizeRequest(req *NexusRequest, pipelineStart time.Time, data any) *NexusResult {
	stageStart := time.Now()
	stageName := "finalizeRequest"

	req.Status = StatusCompleted
	req.Result = data

	p.appendTrace(req, stageName, stageStart, nil)

	return &NexusResult{
		RequestID:  req.RequestID,
		Operation:  req.Operation,
		Status:     StatusCompleted,
		Data:       data,
		DurationMS: time.Since(pipelineStart).Milliseconds(),
	}
}

// failResult creates a failure result. It preserves the request status if already
// set to a terminal state (e.g., StatusDenied), otherwise sets it to StatusFailed.
func (p *Pipeline) failResult(req *NexusRequest, start time.Time, err error) *NexusResult {
	status := req.Status
	if status == StatusProcessing || status == "" {
		status = StatusFailed
		req.Status = StatusFailed
	}
	return &NexusResult{
		RequestID:  req.RequestID,
		Operation:  req.Operation,
		Status:     status,
		Error:      err.Error(),
		DurationMS: time.Since(start).Milliseconds(),
	}
}

// appendTrace records a stage trace on the request.
func (p *Pipeline) appendTrace(req *NexusRequest, stage string, start time.Time, err error) {
	trace := StageTrace{
		Stage:      stage,
		StartedAt:  start.UnixMilli(),
		DurationMS: time.Since(start).Milliseconds(),
	}
	if err != nil {
		trace.Error = err.Error()
	}
	req.AppendStageTrace(trace)
}

// --- Stub implementations for Phase 1 ---

// stubPrincipalResolver always returns generic entities.
type stubPrincipalResolver struct{}

func (s *stubPrincipalResolver) ResolveSender(_ context.Context, req *NexusRequest) (*Entity, error) {
	return &Entity{
		ID:   req.Routing.Sender.ID,
		Name: req.Routing.Sender.Name,
		Type: "person",
	}, nil
}

func (s *stubPrincipalResolver) ResolveReceiver(_ context.Context, _ *NexusRequest) (*Entity, error) {
	return &Entity{
		ID:     "runtime",
		Name:   "nexus",
		Type:   "system",
		IsUser: false,
	}, nil
}

// stubAccessEvaluator allows all requests.
type stubAccessEvaluator struct{}

func (s *stubAccessEvaluator) Evaluate(_ context.Context, _ *NexusRequest) (*AccessDecision, error) {
	return &AccessDecision{
		Decision: "allow",
		Permissions: AccessPermissions{
			Tools:       ToolPermissions{Allow: []string{"*"}},
			Credentials: []string{},
		},
	}, nil
}
