// Package ws implements the WebSocket transport surface for Nexus.
// It provides JSON-RPC style message dispatch over WebSocket connections.
package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/Napageneral/nexus/internal/pipeline"
)

// Message is the JSON-RPC style message format for WebSocket communication.
type Message struct {
	ID        string `json:"id"`
	Operation string `json:"operation"`
	Payload   any    `json:"payload,omitempty"`
}

// Response is the JSON-RPC style response format.
type Response struct {
	ID     string `json:"id"`
	Result any    `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

// Server is the WebSocket transport surface.
type Server struct {
	pipeline *pipeline.Pipeline
	upgrader websocket.Upgrader
	logger   *slog.Logger
	clients  map[*Client]struct{}
	mu       sync.RWMutex
	done     chan struct{}
}

// Client represents a connected WebSocket client.
type Client struct {
	conn      *websocket.Conn
	server    *Server
	sessionID string
	send      chan []byte
	done      chan struct{}
}

// NewServer creates a new WebSocket server.
func NewServer(p *pipeline.Pipeline, logger *slog.Logger) *Server {
	return &Server{
		pipeline: p,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true // Permissive in self-hosted mode
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
		logger:  logger,
		clients: make(map[*Client]struct{}),
		done:    make(chan struct{}),
	}
}

// Name implements daemon.Service.
func (s *Server) Name() string { return "websocket" }

// Start implements daemon.Service. The WS server doesn't have its own listener;
// it registers with the HTTP server via HandleUpgrade.
func (s *Server) Start(_ context.Context) error {
	// Start heartbeat broadcaster
	go s.heartbeatLoop()
	return nil
}

// Stop implements daemon.Service.
func (s *Server) Stop(_ context.Context) error {
	close(s.done)

	s.mu.Lock()
	defer s.mu.Unlock()

	for client := range s.clients {
		client.conn.Close()
		close(client.done)
	}
	s.clients = make(map[*Client]struct{})
	return nil
}

// HandleUpgrade returns an http.HandlerFunc that upgrades to WebSocket.
func (s *Server) HandleUpgrade() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := s.upgrader.Upgrade(w, r, nil)
		if err != nil {
			s.logger.Error("websocket upgrade failed", "error", err)
			return
		}

		client := &Client{
			conn:      conn,
			server:    s,
			sessionID: fmt.Sprintf("ws-%d", time.Now().UnixNano()),
			send:      make(chan []byte, 64),
			done:      make(chan struct{}),
		}

		s.addClient(client)

		go client.readLoop()
		go client.writeLoop()
	}
}

// Broadcast sends a message to all connected clients.
func (s *Server) Broadcast(msg any) {
	data, err := json.Marshal(msg)
	if err != nil {
		s.logger.Error("broadcast marshal error", "error", err)
		return
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	for client := range s.clients {
		select {
		case client.send <- data:
		default:
			// Client's send buffer is full, skip
			s.logger.Warn("dropping broadcast to slow client", "session", client.sessionID)
		}
	}
}

// ClientCount returns the number of connected clients.
func (s *Server) ClientCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.clients)
}

func (s *Server) addClient(c *Client) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.clients[c] = struct{}{}
	s.logger.Debug("websocket client connected", "session", c.sessionID)
}

func (s *Server) removeClient(c *Client) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.clients[c]; ok {
		delete(s.clients, c)
		s.logger.Debug("websocket client disconnected", "session", c.sessionID)
	}
}

// heartbeatLoop broadcasts periodic heartbeat events to all clients.
func (s *Server) heartbeatLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.Broadcast(map[string]any{
				"event": "heartbeat",
				"data":  map[string]any{"ts": time.Now().UnixMilli()},
			})
		case <-s.done:
			return
		}
	}
}

// readLoop reads messages from the client and dispatches them through the pipeline.
func (c *Client) readLoop() {
	defer func() {
		c.server.removeClient(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(64 * 1024) // 64KB max message
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				c.server.logger.Warn("websocket read error", "error", err)
			}
			return
		}

		var msg Message
		if err := json.Unmarshal(data, &msg); err != nil {
			c.sendResponse(Response{Error: "invalid message format"})
			continue
		}

		c.handleMessage(msg)
	}
}

// writeLoop sends messages to the client.
func (c *Client) writeLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case data, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}

		case <-c.done:
			return
		}
	}
}

// handleMessage dispatches a message through the pipeline.
func (c *Client) handleMessage(msg Message) {
	req := pipeline.NewRequest(pipeline.NexusInput{
		Operation: msg.Operation,
		Routing: pipeline.Routing{
			Adapter:  "ws",
			Platform: "control",
			Sender: pipeline.RoutingParticipant{
				ID:   c.sessionID,
				Name: "ws-client",
			},
		},
		Payload: msg.Payload,
	})

	result, err := c.server.pipeline.Execute(context.Background(), req)
	if err != nil {
		c.sendResponse(Response{
			ID:    msg.ID,
			Error: err.Error(),
		})
		return
	}

	c.sendResponse(Response{
		ID:     msg.ID,
		Result: result.Data,
	})
}

// sendResponse sends a JSON response to the client.
func (c *Client) sendResponse(resp Response) {
	data, err := json.Marshal(resp)
	if err != nil {
		c.server.logger.Error("response marshal error", "error", err)
		return
	}
	select {
	case c.send <- data:
	default:
		c.server.logger.Warn("dropping response to slow client", "session", c.sessionID)
	}
}
