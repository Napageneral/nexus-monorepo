package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// ---------------------------------------------------------------------------
// Test WebSocket server
// ---------------------------------------------------------------------------

// newTestWSServer creates a test HTTP server that upgrades to WebSocket
// and echoes back responses for event.ingest operations.
func newTestWSServer(t *testing.T) *httptest.Server {
	t.Helper()
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Logf("upgrade error: %v", err)
			return
		}
		defer conn.Close()

		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				return
			}

			var msg wsMessage
			if err := json.Unmarshal(data, &msg); err != nil {
				continue
			}

			// Build a mock response.
			result := map[string]any{
				"status":     "accepted",
				"request_id": msg.ID,
				"response":   "echo: test response",
			}
			resultJSON, _ := json.Marshal(result)

			resp := wsResponse{
				ID:     msg.ID,
				Result: resultJSON,
			}
			respData, _ := json.Marshal(resp)

			if err := conn.WriteMessage(websocket.TextMessage, respData); err != nil {
				return
			}
		}
	})

	return httptest.NewServer(handler)
}

// wsURLFromHTTP converts an httptest server URL to a WebSocket URL.
func wsURLFromHTTP(httpURL string) string {
	return "ws" + strings.TrimPrefix(httpURL, "http")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestChatClientCreation(t *testing.T) {
	c := NewChatClient("localhost", 3000, "default")
	if c == nil {
		t.Fatal("NewChatClient returned nil")
	}
	if c.wsURL != "ws://localhost:3000/ws" {
		t.Errorf("wsURL = %q, want ws://localhost:3000/ws", c.wsURL)
	}
	if c.agentID != "default" {
		t.Errorf("agentID = %q, want 'default'", c.agentID)
	}
}

func TestChatClientCreationDefaults(t *testing.T) {
	c := NewChatClient("", 0, "")
	if c.wsURL != "ws://localhost:3000/ws" {
		t.Errorf("wsURL = %q, want ws://localhost:3000/ws", c.wsURL)
	}
	if c.agentID != "default" {
		t.Errorf("agentID = %q, want 'default'", c.agentID)
	}
}

func TestChatClientConnect(t *testing.T) {
	server := newTestWSServer(t)
	defer server.Close()

	c := NewChatClient("", 0, "default")
	c.WithWSURL(wsURLFromHTTP(server.URL))

	if err := c.Connect(); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer c.Close()

	if c.conn == nil {
		t.Error("conn is nil after Connect")
	}
}

func TestChatClientSendMessage(t *testing.T) {
	server := newTestWSServer(t)
	defer server.Close()

	var output bytes.Buffer
	c := NewChatClient("", 0, "default")
	c.WithWSURL(wsURLFromHTTP(server.URL))
	c.WithWriter(&output)

	if err := c.Connect(); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer c.Close()

	if err := c.SendMessage("hello"); err != nil {
		t.Fatalf("SendMessage: %v", err)
	}

	got := strings.TrimSpace(output.String())
	if !strings.Contains(got, "echo: test response") {
		t.Errorf("output = %q, want to contain 'echo: test response'", got)
	}
}

func TestChatClientSendMessageNotConnected(t *testing.T) {
	c := NewChatClient("", 0, "default")
	err := c.SendMessage("hello")
	if err == nil {
		t.Error("expected error when not connected")
	}
}

func TestChatClientRun(t *testing.T) {
	server := newTestWSServer(t)
	defer server.Close()

	var output bytes.Buffer
	input := strings.NewReader("hello\n/quit\n")

	c := NewChatClient("", 0, "test-agent")
	c.WithWSURL(wsURLFromHTTP(server.URL))
	c.WithWriter(&output)
	c.WithReader(input)

	if err := c.Connect(); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := c.Run(ctx); err != nil {
		t.Fatalf("Run: %v", err)
	}

	out := output.String()
	if !strings.Contains(out, "Nexus Chat") {
		t.Errorf("missing banner in output")
	}
	if !strings.Contains(out, "Goodbye!") {
		t.Errorf("missing goodbye in output")
	}
	if !strings.Contains(out, "echo: test response") {
		t.Errorf("missing response in output: %s", out)
	}
}

func TestChatClientRunEOF(t *testing.T) {
	server := newTestWSServer(t)
	defer server.Close()

	var output bytes.Buffer
	input := strings.NewReader("hello\n")

	c := NewChatClient("", 0, "default")
	c.WithWSURL(wsURLFromHTTP(server.URL))
	c.WithWriter(&output)
	c.WithReader(input)

	if err := c.Connect(); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Should exit cleanly on EOF.
	if err := c.Run(ctx); err != nil {
		t.Fatalf("Run: %v", err)
	}
}

func TestChatClientClose(t *testing.T) {
	// Close on nil conn should be safe.
	c := NewChatClient("", 0, "default")
	if err := c.Close(); err != nil {
		t.Fatalf("Close on unconnected client: %v", err)
	}
}
