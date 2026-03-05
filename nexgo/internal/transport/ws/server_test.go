package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

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

func newTestWSServer(t *testing.T) (*Server, *httptest.Server) {
	t.Helper()

	resolver := newTestResolver()
	resolver.register("health", func(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
		return map[string]any{"status": "ok"}, nil
	})
	resolver.register("config.get", func(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
		return map[string]any{"port": 18789}, nil
	})
	resolver.register("status", func(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
		return map[string]any{"uptime": 1234, "connections": 1}, nil
	})

	p := pipeline.NewPipeline(resolver)
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	ws := NewServer(p, logger)

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", ws.HandleUpgrade())

	ts := httptest.NewServer(mux)
	return ws, ts
}

func dialWS(t *testing.T, url string) *websocket.Conn {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(url, "http") + "/ws"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to dial: %v", err)
	}
	return conn
}

func TestWSHealthOperation(t *testing.T) {
	ws, ts := newTestWSServer(t)
	defer ts.Close()
	defer ws.Stop(context.Background())

	conn := dialWS(t, ts.URL)
	defer conn.Close()

	// Send health operation
	msg := Message{ID: "1", Operation: "health"}
	if err := conn.WriteJSON(msg); err != nil {
		t.Fatalf("write error: %v", err)
	}

	// Read response
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	var resp Response
	if err := conn.ReadJSON(&resp); err != nil {
		t.Fatalf("read error: %v", err)
	}

	if resp.ID != "1" {
		t.Fatalf("expected ID '1', got %q", resp.ID)
	}
	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}

	data, ok := resp.Result.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", resp.Result)
	}
	if data["status"] != "ok" {
		t.Fatalf("expected status ok, got %v", data["status"])
	}
}

func TestWSConfigGetOperation(t *testing.T) {
	ws, ts := newTestWSServer(t)
	defer ts.Close()
	defer ws.Stop(context.Background())

	conn := dialWS(t, ts.URL)
	defer conn.Close()

	msg := Message{ID: "2", Operation: "config.get"}
	if err := conn.WriteJSON(msg); err != nil {
		t.Fatalf("write error: %v", err)
	}

	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	var resp Response
	if err := conn.ReadJSON(&resp); err != nil {
		t.Fatalf("read error: %v", err)
	}

	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}

	data, ok := resp.Result.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", resp.Result)
	}
	if data["port"] != float64(18789) {
		t.Fatalf("expected port 18789, got %v", data["port"])
	}
}

func TestWSUnknownOperation(t *testing.T) {
	ws, ts := newTestWSServer(t)
	defer ts.Close()
	defer ws.Stop(context.Background())

	conn := dialWS(t, ts.URL)
	defer conn.Close()

	msg := Message{ID: "3", Operation: "nonexistent"}
	if err := conn.WriteJSON(msg); err != nil {
		t.Fatalf("write error: %v", err)
	}

	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	var resp Response
	if err := conn.ReadJSON(&resp); err != nil {
		t.Fatalf("read error: %v", err)
	}

	if resp.Error == "" {
		t.Fatal("expected error for unknown operation")
	}
}

func TestWSInvalidJSON(t *testing.T) {
	ws, ts := newTestWSServer(t)
	defer ts.Close()
	defer ws.Stop(context.Background())

	conn := dialWS(t, ts.URL)
	defer conn.Close()

	// Send invalid JSON
	if err := conn.WriteMessage(websocket.TextMessage, []byte("{invalid")); err != nil {
		t.Fatalf("write error: %v", err)
	}

	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, data, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read error: %v", err)
	}

	var resp Response
	if err := json.Unmarshal(data, &resp); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}

	if resp.Error == "" {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestWSClientCount(t *testing.T) {
	ws, ts := newTestWSServer(t)
	defer ts.Close()
	defer ws.Stop(context.Background())

	if ws.ClientCount() != 0 {
		t.Fatalf("expected 0 clients, got %d", ws.ClientCount())
	}

	conn1 := dialWS(t, ts.URL)
	defer conn1.Close()
	time.Sleep(50 * time.Millisecond) // Allow registration

	if ws.ClientCount() != 1 {
		t.Fatalf("expected 1 client, got %d", ws.ClientCount())
	}

	conn2 := dialWS(t, ts.URL)
	defer conn2.Close()
	time.Sleep(50 * time.Millisecond)

	if ws.ClientCount() != 2 {
		t.Fatalf("expected 2 clients, got %d", ws.ClientCount())
	}

	conn1.Close()
	time.Sleep(50 * time.Millisecond)

	if ws.ClientCount() != 1 {
		t.Fatalf("expected 1 client after disconnect, got %d", ws.ClientCount())
	}
}

func TestWSMultipleMessages(t *testing.T) {
	ws, ts := newTestWSServer(t)
	defer ts.Close()
	defer ws.Stop(context.Background())

	conn := dialWS(t, ts.URL)
	defer conn.Close()

	// Send multiple messages
	for i := 0; i < 5; i++ {
		msg := Message{
			ID:        fmt.Sprintf("msg-%d", i),
			Operation: "health",
		}
		if err := conn.WriteJSON(msg); err != nil {
			t.Fatalf("write error on msg %d: %v", i, err)
		}
	}

	// Read all responses
	for i := 0; i < 5; i++ {
		conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		var resp Response
		if err := conn.ReadJSON(&resp); err != nil {
			t.Fatalf("read error on msg %d: %v", i, err)
		}
		if resp.Error != "" {
			t.Fatalf("unexpected error on msg %d: %s", i, resp.Error)
		}
	}
}
