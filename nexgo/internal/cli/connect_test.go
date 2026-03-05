package cli

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDaemonURL(t *testing.T) {
	tests := []struct {
		host string
		port int
		want string
	}{
		{"localhost", 18789, "http://localhost:18789"},
		{"", 18789, "http://localhost:18789"},
		{"192.168.1.1", 3000, "http://192.168.1.1:3000"},
	}

	for _, tt := range tests {
		got := DaemonURL(tt.host, tt.port)
		if got != tt.want {
			t.Errorf("DaemonURL(%q, %d) = %q, want %q", tt.host, tt.port, got, tt.want)
		}
	}
}

func TestDispatchOperationSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/operations" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != "POST" {
			t.Errorf("unexpected method: %s", r.Method)
		}

		var req operationRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("decode request: %v", err)
		}
		if req.Operation != "status" {
			t.Errorf("operation = %q, want %q", req.Operation, "status")
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"status":  "running",
			"version": "dev",
		})
	}))
	defer server.Close()

	// Parse port from test server.
	addr := server.Listener.Addr().String()
	parts := strings.Split(addr, ":")
	var port int
	_, _ = fmt.Sscanf(parts[len(parts)-1], "%d", &port)

	result, err := DispatchOperation("localhost", port, "status", nil)
	if err != nil {
		t.Fatalf("DispatchOperation error: %v", err)
	}

	if result["status"] != "running" {
		t.Errorf("status = %v, want %q", result["status"], "running")
	}
}

func TestDispatchOperationOffline(t *testing.T) {
	_, err := DispatchOperation("localhost", 19999, "status", nil)
	if err == nil {
		t.Error("expected error when daemon is offline")
	}
}

func TestDispatchOperationError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{
			"error": "internal error",
		})
	}))
	defer server.Close()

	addr := server.Listener.Addr().String()
	parts := strings.Split(addr, ":")
	var port int
	_, _ = fmt.Sscanf(parts[len(parts)-1], "%d", &port)

	_, err := DispatchOperation("localhost", port, "bad-op", nil)
	if err == nil {
		t.Error("expected error for 500 response")
	}
}
