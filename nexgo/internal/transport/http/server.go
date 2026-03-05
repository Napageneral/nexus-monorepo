// Package httpx implements the HTTP transport surface for Nexus.
// It provides the /health endpoint and CORS middleware.
package httpx

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/Napageneral/nexus/internal/config"
	"github.com/Napageneral/nexus/internal/pipeline"
)

// Server is the HTTP transport surface.
type Server struct {
	cfg      *config.Config
	pipeline *pipeline.Pipeline
	server   *http.Server
	logger   *slog.Logger
	port     int
}

// NewServer creates a new HTTP server.
func NewServer(cfg *config.Config, p *pipeline.Pipeline, logger *slog.Logger) *Server {
	port := config.EffectivePort(cfg)
	s := &Server{
		cfg:      cfg,
		pipeline: p,
		logger:   logger,
		port:     port,
	}

	mux := http.NewServeMux()
	s.registerRoutes(mux)

	s.server = &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      corsMiddleware(mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	return s
}

// Name implements daemon.Service.
func (s *Server) Name() string { return "http" }

// Start implements daemon.Service. Starts listening in the background.
func (s *Server) Start(_ context.Context) error {
	ln, err := net.Listen("tcp", s.server.Addr)
	if err != nil {
		return fmt.Errorf("http listen: %w", err)
	}
	s.logger.Info("http server listening", "addr", s.server.Addr)

	go func() {
		if err := s.server.Serve(ln); err != nil && err != http.ErrServerClosed {
			s.logger.Error("http server error", "error", err)
		}
	}()

	return nil
}

// Stop implements daemon.Service. Gracefully shuts down the HTTP server.
func (s *Server) Stop(ctx context.Context) error {
	return s.server.Shutdown(ctx)
}

// Port returns the configured port.
func (s *Server) Port() int {
	return s.port
}

// registerRoutes sets up HTTP routes.
func (s *Server) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /api/events/stream", s.handleSSEStub)
}

// handleHealth dispatches the "health" operation through the pipeline.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	req := pipeline.NewRequest(pipeline.NexusInput{
		Operation: "health",
		Routing: pipeline.Routing{
			Adapter:  "http",
			Platform: "control",
			Sender: pipeline.RoutingParticipant{
				ID:   r.RemoteAddr,
				Name: "http-client",
			},
		},
	})

	result, err := s.pipeline.Execute(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"error": err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, result.Data)
}

// handleSSEStub is a placeholder for the SSE event stream (Phase 3).
func (s *Server) handleSSEStub(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	// Send a heartbeat then close
	fmt.Fprintf(w, "event: heartbeat\ndata: {\"ts\":%d}\n\n", time.Now().UnixMilli())
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

// corsMiddleware adds permissive CORS headers for self-hosted mode.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// writeJSON writes a JSON response with the given status code.
func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
