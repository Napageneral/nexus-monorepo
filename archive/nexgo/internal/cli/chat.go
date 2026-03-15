// Package cli implements the interactive chat CLI for Nexus.
// It connects to a running Nexus daemon via WebSocket and provides a REPL
// for sending messages and streaming responses.
package cli

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"os"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
)

// ---------------------------------------------------------------------------
// Message types (mirrored from transport/ws for client-side use)
// ---------------------------------------------------------------------------

// wsMessage is the JSON-RPC style message sent to the daemon.
type wsMessage struct {
	ID        string `json:"id"`
	Operation string `json:"operation"`
	Payload   any    `json:"payload,omitempty"`
}

// wsResponse is the JSON-RPC style response from the daemon.
type wsResponse struct {
	ID     string          `json:"id"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  string          `json:"error,omitempty"`
}

// ---------------------------------------------------------------------------
// ChatClient
// ---------------------------------------------------------------------------

// ChatClient connects to a running Nexus daemon via WebSocket for interactive chat.
type ChatClient struct {
	wsURL   string
	conn    *websocket.Conn
	agentID string
	logger  *slog.Logger

	mu    sync.Mutex
	msgID int

	// writer is the output destination (defaults to os.Stdout, overridable for testing).
	writer io.Writer
	// reader is the input source (defaults to os.Stdin, overridable for testing).
	reader io.Reader
}

// NewChatClient creates a ChatClient targeting the given host and port.
func NewChatClient(host string, port int, agentID string) *ChatClient {
	if host == "" {
		host = "localhost"
	}
	if port == 0 {
		port = 3000
	}
	if agentID == "" {
		agentID = "default"
	}

	wsURL := fmt.Sprintf("ws://%s:%d/ws", host, port)

	return &ChatClient{
		wsURL:   wsURL,
		agentID: agentID,
		logger:  slog.Default(),
		writer:  os.Stdout,
		reader:  os.Stdin,
	}
}

// WithLogger sets a custom logger.
func (c *ChatClient) WithLogger(logger *slog.Logger) *ChatClient {
	c.logger = logger
	return c
}

// WithWriter sets a custom output writer (useful for testing).
func (c *ChatClient) WithWriter(w io.Writer) *ChatClient {
	c.writer = w
	return c
}

// WithReader sets a custom input reader (useful for testing).
func (c *ChatClient) WithReader(r io.Reader) *ChatClient {
	c.reader = r
	return c
}

// WithWSURL sets a custom WebSocket URL (useful for testing).
func (c *ChatClient) WithWSURL(wsURL string) *ChatClient {
	c.wsURL = wsURL
	return c
}

// Connect establishes a WebSocket connection to the Nexus daemon.
func (c *ChatClient) Connect() error {
	u, err := url.Parse(c.wsURL)
	if err != nil {
		return fmt.Errorf("invalid ws url: %w", err)
	}

	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		return fmt.Errorf("connect to %s: %w", c.wsURL, err)
	}
	c.conn = conn
	c.logger.Debug("connected to nexus daemon", "url", c.wsURL)
	return nil
}

// SendMessage sends a chat message through the event.ingest operation
// and reads the response.
func (c *ChatClient) SendMessage(prompt string) error {
	if c.conn == nil {
		return fmt.Errorf("not connected")
	}

	c.mu.Lock()
	c.msgID++
	id := fmt.Sprintf("chat-%d", c.msgID)
	c.mu.Unlock()

	msg := wsMessage{
		ID:        id,
		Operation: "event.ingest",
		Payload: map[string]any{
			"content":      prompt,
			"content_type": "text",
		},
	}

	if err := c.conn.WriteJSON(msg); err != nil {
		return fmt.Errorf("send message: %w", err)
	}

	// Read one response.
	var resp wsResponse
	if err := c.conn.ReadJSON(&resp); err != nil {
		return fmt.Errorf("read response: %w", err)
	}

	if resp.Error != "" {
		fmt.Fprintf(c.writer, "Error: %s\n", resp.Error)
		return nil
	}

	// Print result.
	if resp.Result != nil {
		var resultMap map[string]any
		if err := json.Unmarshal(resp.Result, &resultMap); err == nil {
			if response, ok := resultMap["response"].(string); ok {
				fmt.Fprintf(c.writer, "%s\n", response)
				return nil
			}
		}
		// Fallback: print raw JSON.
		fmt.Fprintf(c.writer, "%s\n", string(resp.Result))
	}
	return nil
}

// Run starts the interactive REPL loop. It reads from the input reader,
// sends messages to the daemon, and prints responses to the output writer.
func (c *ChatClient) Run(ctx context.Context) error {
	scanner := bufio.NewScanner(c.reader)

	fmt.Fprintf(c.writer, "Nexus Chat (agent: %s)\n", c.agentID)
	fmt.Fprintf(c.writer, "Type your message and press Enter. Type /quit to exit.\n\n")

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		fmt.Fprint(c.writer, "> ")
		if !scanner.Scan() {
			// EOF or error.
			break
		}

		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		if line == "/quit" || line == "/exit" {
			fmt.Fprintln(c.writer, "Goodbye!")
			return nil
		}

		if err := c.SendMessage(line); err != nil {
			c.logger.Error("send failed", "error", err)
			fmt.Fprintf(c.writer, "Error: %v\n", err)
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read input: %w", err)
	}
	return nil
}

// Close disconnects from the daemon.
func (c *ChatClient) Close() error {
	if c.conn == nil {
		return nil
	}
	err := c.conn.WriteMessage(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
	)
	if err != nil {
		c.logger.Debug("close write error", "error", err)
	}
	return c.conn.Close()
}
