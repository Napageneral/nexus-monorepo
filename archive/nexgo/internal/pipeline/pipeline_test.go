package pipeline

import (
	"context"
	"fmt"
	"testing"
)

// mockResolver implements OperationResolver for testing.
type mockResolver struct {
	ops map[string]OperationHandlerInfo
}

func newMockResolver() *mockResolver {
	return &mockResolver{ops: make(map[string]OperationHandlerInfo)}
}

func (m *mockResolver) register(name string, handler func(ctx context.Context, req *NexusRequest) (any, error)) {
	m.ops[name] = OperationHandlerInfo{
		Operation: name,
		Kind:      "control",
		Action:    "read",
		Resource:  "test." + name,
		Handler:   handler,
	}
}

func (m *mockResolver) Resolve(operation string) (OperationHandlerInfo, error) {
	info, ok := m.ops[operation]
	if !ok {
		return OperationHandlerInfo{}, fmt.Errorf("operation not found: %s", operation)
	}
	return info, nil
}

func (m *mockResolver) Has(operation string) bool {
	_, ok := m.ops[operation]
	return ok
}

// mockTraceStore records pipeline traces for test verification.
type mockTraceStore struct {
	traces []*NexusResult
}

func (m *mockTraceStore) StorePipelineTrace(_ context.Context, _ *NexusRequest, result *NexusResult) error {
	m.traces = append(m.traces, result)
	return nil
}

func TestPipelineExecuteHealth(t *testing.T) {
	resolver := newMockResolver()
	resolver.register("health", func(ctx context.Context, req *NexusRequest) (any, error) {
		return map[string]string{"status": "ok"}, nil
	})

	p := NewPipeline(resolver)

	req := NewRequest(NexusInput{
		Operation: "health",
		Routing: Routing{
			Adapter:  "internal",
			Platform: "system",
			Sender:   RoutingParticipant{ID: "test-user", Name: "Test"},
		},
	})

	result, err := p.Execute(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.Status != StatusCompleted {
		t.Fatalf("expected status completed, got %s", result.Status)
	}

	data, ok := result.Data.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string data, got %T", result.Data)
	}
	if data["status"] != "ok" {
		t.Fatalf("expected status ok, got %s", data["status"])
	}

	if result.DurationMS < 0 {
		t.Fatalf("expected non-negative duration, got %d", result.DurationMS)
	}
}

func TestPipelineStageTraces(t *testing.T) {
	resolver := newMockResolver()
	resolver.register("test", func(ctx context.Context, req *NexusRequest) (any, error) {
		return "ok", nil
	})

	p := NewPipeline(resolver)

	req := NewRequest(NexusInput{
		Operation: "test",
		Routing: Routing{
			Adapter: "internal",
			Sender:  RoutingParticipant{ID: "user"},
		},
	})

	_, err := p.Execute(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should have 5 stage traces
	if len(req.Stages) != 5 {
		t.Fatalf("expected 5 stage traces, got %d", len(req.Stages))
	}

	expectedStages := []string{
		"acceptRequest",
		"resolvePrincipals",
		"resolveAccess",
		"executeOperation",
		"finalizeRequest",
	}
	for i, expected := range expectedStages {
		if req.Stages[i].Stage != expected {
			t.Errorf("stage %d: expected %q, got %q", i, expected, req.Stages[i].Stage)
		}
		if req.Stages[i].Error != "" {
			t.Errorf("stage %d: unexpected error: %s", i, req.Stages[i].Error)
		}
	}
}

func TestPipelineUnknownOperation(t *testing.T) {
	resolver := newMockResolver()
	p := NewPipeline(resolver)

	req := NewRequest(NexusInput{
		Operation: "nonexistent",
		Routing:   Routing{Adapter: "test"},
	})

	result, err := p.Execute(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for unknown operation")
	}
	if result.Status != StatusFailed {
		t.Fatalf("expected status failed, got %s", result.Status)
	}
}

func TestPipelineEmptyOperation(t *testing.T) {
	resolver := newMockResolver()
	p := NewPipeline(resolver)

	req := NewRequest(NexusInput{
		Operation: "",
		Routing:   Routing{Adapter: "test"},
	})

	_, err := p.Execute(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for empty operation")
	}
}

func TestPipelineHandlerError(t *testing.T) {
	resolver := newMockResolver()
	resolver.register("fail", func(ctx context.Context, req *NexusRequest) (any, error) {
		return nil, fmt.Errorf("handler failed")
	})

	p := NewPipeline(resolver)

	req := NewRequest(NexusInput{
		Operation: "fail",
		Routing:   Routing{Adapter: "test", Sender: RoutingParticipant{ID: "u"}},
	})

	result, err := p.Execute(context.Background(), req)
	if err == nil {
		t.Fatal("expected error from handler")
	}
	if result.Status != StatusFailed {
		t.Fatalf("expected status failed, got %s", result.Status)
	}
	if result.Error == "" {
		t.Fatal("expected error message in result")
	}
}

func TestPipelineTraceStore(t *testing.T) {
	resolver := newMockResolver()
	resolver.register("health", func(ctx context.Context, req *NexusRequest) (any, error) {
		return "ok", nil
	})

	store := &mockTraceStore{}
	p := NewPipeline(resolver, WithTraceStore(store))

	req := NewRequest(NexusInput{
		Operation: "health",
		Routing:   Routing{Adapter: "test", Sender: RoutingParticipant{ID: "u"}},
	})

	_, err := p.Execute(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(store.traces) != 1 {
		t.Fatalf("expected 1 trace, got %d", len(store.traces))
	}
	if store.traces[0].Status != StatusCompleted {
		t.Fatalf("expected completed trace, got %s", store.traces[0].Status)
	}
}

func TestPipelinePrincipals(t *testing.T) {
	resolver := newMockResolver()
	resolver.register("test", func(ctx context.Context, req *NexusRequest) (any, error) {
		return "ok", nil
	})

	p := NewPipeline(resolver)

	req := NewRequest(NexusInput{
		Operation: "test",
		Routing: Routing{
			Adapter: "test",
			Sender:  RoutingParticipant{ID: "user-123", Name: "Alice"},
		},
	})

	_, err := p.Execute(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if req.Principals == nil {
		t.Fatal("expected principals to be set")
	}
	if req.Principals.Sender == nil {
		t.Fatal("expected sender to be set")
	}
	if req.Principals.Sender.ID != "user-123" {
		t.Fatalf("expected sender ID 'user-123', got %q", req.Principals.Sender.ID)
	}
	if req.Principals.Receiver == nil {
		t.Fatal("expected receiver to be set")
	}
	if req.Principals.Receiver.ID != "runtime" {
		t.Fatalf("expected receiver ID 'runtime', got %q", req.Principals.Receiver.ID)
	}
}

func TestPipelineAccessDenied(t *testing.T) {
	resolver := newMockResolver()
	resolver.register("test", func(ctx context.Context, req *NexusRequest) (any, error) {
		return "ok", nil
	})

	// Custom access evaluator that denies all
	denyEvaluator := &denyAllEvaluator{}
	p := NewPipeline(resolver, WithAccessEvaluator(denyEvaluator))

	req := NewRequest(NexusInput{
		Operation: "test",
		Routing:   Routing{Adapter: "test", Sender: RoutingParticipant{ID: "u"}},
	})

	result, err := p.Execute(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for denied access")
	}
	if result.Status != StatusDenied {
		t.Fatalf("expected denied result status, got %s", result.Status)
	}
	if req.Status != StatusDenied {
		t.Fatalf("expected request status denied, got %s", req.Status)
	}
}

// denyAllEvaluator denies all requests.
type denyAllEvaluator struct{}

func (d *denyAllEvaluator) Evaluate(_ context.Context, _ *NexusRequest) (*AccessDecision, error) {
	return &AccessDecision{
		Decision:      "deny",
		MatchedPolicy: "deny-all-test",
	}, nil
}
