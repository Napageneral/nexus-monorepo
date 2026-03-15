package httpx

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/Napageneral/nexus/internal/pipeline"
)

// RegisterOperationRoutes adds Phase 3 HTTP routes to the given mux.
// This extends the existing routes without modifying server.go.
func (s *Server) RegisterOperationRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/operations", s.handleOperation)
	mux.HandleFunc("POST /api/chat", s.handleChatSend)
	mux.HandleFunc("GET /api/sessions", s.handleSessionList)
	mux.HandleFunc("GET /api/agents", s.handleAgentList)
	mux.HandleFunc("GET /api/adapters", s.handleAdapterList)
	mux.HandleFunc("GET /api/models", s.handleModelList)
	mux.HandleFunc("GET /api/system/info", s.handleSystemInfo)
}

// operationRequest is the JSON body for POST /api/operations.
type operationRequest struct {
	Operation string         `json:"operation"`
	Payload   map[string]any `json:"payload,omitempty"`
}

// handleOperation is the generic operation dispatch endpoint.
// It accepts {operation, payload} as JSON and routes through the pipeline.
func (s *Server) handleOperation(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1MB limit
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": "failed to read request body",
		})
		return
	}
	defer r.Body.Close()

	var opReq operationRequest
	if err := json.Unmarshal(body, &opReq); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": fmt.Sprintf("invalid JSON: %v", err),
		})
		return
	}

	if opReq.Operation == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": "operation is required",
		})
		return
	}

	req := pipeline.NewRequest(pipeline.NexusInput{
		Operation: opReq.Operation,
		Routing: pipeline.Routing{
			Adapter:  "http",
			Platform: "control",
			Sender: pipeline.RoutingParticipant{
				ID:   r.RemoteAddr,
				Name: "http-client",
			},
		},
		Payload: any(opReq.Payload),
	})

	result, err := s.pipeline.Execute(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"error":      err.Error(),
			"request_id": req.RequestID,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"request_id": result.RequestID,
		"operation":  result.Operation,
		"status":     string(result.Status),
		"data":       result.Data,
	})
}

// handleChatSend handles POST /api/chat - a convenience route for event.ingest.
func (s *Server) handleChatSend(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": "failed to read request body",
		})
		return
	}
	defer r.Body.Close()

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": fmt.Sprintf("invalid JSON: %v", err),
		})
		return
	}

	req := pipeline.NewRequest(pipeline.NexusInput{
		Operation: "event.ingest",
		Routing: pipeline.Routing{
			Adapter:  "http",
			Platform: "control",
			Sender: pipeline.RoutingParticipant{
				ID:   r.RemoteAddr,
				Name: "http-client",
			},
		},
		Payload: payload,
	})

	result, err := s.pipeline.Execute(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"error":      err.Error(),
			"request_id": req.RequestID,
		})
		return
	}

	writeJSON(w, http.StatusOK, result.Data)
}

// handleSessionList handles GET /api/sessions.
func (s *Server) handleSessionList(w http.ResponseWriter, r *http.Request) {
	s.dispatchReadOperation(w, r, "sessions.list")
}

// handleAgentList handles GET /api/agents.
func (s *Server) handleAgentList(w http.ResponseWriter, r *http.Request) {
	s.dispatchReadOperation(w, r, "agents.list")
}

// handleAdapterList handles GET /api/adapters.
func (s *Server) handleAdapterList(w http.ResponseWriter, r *http.Request) {
	s.dispatchReadOperation(w, r, "adapter.info")
}

// handleModelList handles GET /api/models.
func (s *Server) handleModelList(w http.ResponseWriter, r *http.Request) {
	s.dispatchReadOperation(w, r, "models.list")
}

// handleSystemInfo handles GET /api/system/info.
func (s *Server) handleSystemInfo(w http.ResponseWriter, r *http.Request) {
	s.dispatchReadOperation(w, r, "status")
}

// dispatchReadOperation is a helper for simple GET routes that dispatch
// a read operation through the pipeline with no payload.
func (s *Server) dispatchReadOperation(w http.ResponseWriter, r *http.Request, operation string) {
	req := pipeline.NewRequest(pipeline.NexusInput{
		Operation: operation,
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
