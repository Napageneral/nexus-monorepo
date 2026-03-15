package httpx

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/Napageneral/nexus/internal/config"
	"github.com/Napageneral/nexus/internal/pipeline"
)

// testResolver implements pipeline.OperationResolver for tests.
type testResolver struct {
	ops map[string]pipeline.OperationHandlerInfo
}

func newTestResolver() *testResolver {
	return &testResolver{ops: make(map[string]pipeline.OperationHandlerInfo)}
}

func (r *testResolver) register(name string, handler func(ctx context.Context, req *pipeline.NexusRequest) (any, error)) {
	r.ops[name] = pipeline.OperationHandlerInfo{
		Operation: name,
		Kind:      "control",
		Action:    "read",
		Resource:  "test." + name,
		Handler:   handler,
	}
}

func (r *testResolver) Resolve(operation string) (pipeline.OperationHandlerInfo, error) {
	info, ok := r.ops[operation]
	if !ok {
		return pipeline.OperationHandlerInfo{}, fmt.Errorf("not found: %s", operation)
	}
	return info, nil
}

func (r *testResolver) Has(operation string) bool {
	_, ok := r.ops[operation]
	return ok
}

func newTestServer(t *testing.T) *Server {
	t.Helper()

	resolver := newTestResolver()
	resolver.register("health", func(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
		return map[string]any{
			"status":  "ok",
			"uptime":  1234,
			"version": "dev",
		}, nil
	})

	p := pipeline.NewPipeline(resolver)
	cfg := config.Default()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	return NewServer(cfg, p, logger)
}

func TestHealthEndpoint(t *testing.T) {
	s := newTestServer(t)

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	// We need to use the server's handler
	s.server.Handler.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var data map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if data["status"] != "ok" {
		t.Fatalf("expected status 'ok', got %v", data["status"])
	}
}

func TestHealthCORSHeaders(t *testing.T) {
	s := newTestServer(t)

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	s.server.Handler.ServeHTTP(w, req)

	resp := w.Result()
	if resp.Header.Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("expected CORS allow origin *, got %q", resp.Header.Get("Access-Control-Allow-Origin"))
	}
	if resp.Header.Get("Access-Control-Allow-Methods") == "" {
		t.Fatal("expected CORS allow methods header")
	}
}

func TestCORSPreflight(t *testing.T) {
	s := newTestServer(t)

	req := httptest.NewRequest("OPTIONS", "/health", nil)
	w := httptest.NewRecorder()

	s.server.Handler.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204 for OPTIONS, got %d", resp.StatusCode)
	}
}

func TestSSEStub(t *testing.T) {
	s := newTestServer(t)

	req := httptest.NewRequest("GET", "/api/events/stream", nil)
	w := httptest.NewRecorder()

	s.server.Handler.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("expected Content-Type text/event-stream, got %q", ct)
	}
}

func TestContentTypeJSON(t *testing.T) {
	s := newTestServer(t)

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	s.server.Handler.ServeHTTP(w, req)

	resp := w.Result()
	if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
		t.Fatalf("expected Content-Type application/json, got %q", ct)
	}
}
