package nexadapter

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func parseJSONLLines(t *testing.T, raw string) []map[string]any {
	t.Helper()
	lines := strings.Split(strings.TrimSpace(raw), "\n")
	out := make([]map[string]any, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		var v map[string]any
		if err := json.Unmarshal([]byte(trimmed), &v); err != nil {
			t.Fatalf("parse jsonl line: %v", err)
		}
		out = append(out, v)
	}
	return out
}

func TestControlSessionServe_InvokeRequest(t *testing.T) {
	input := strings.NewReader(`{"type":"invoke.request","request_id":"req-1","endpoint_id":"device-host-1","command":"camera.snap","payload":{"quality":"high"}}` + "\n")
	var out bytes.Buffer
	session := NewControlSession(input, &out)

	err := session.Serve(context.Background(), ControlServeHandlers{
		OnInvoke: func(_ context.Context, frame AdapterControlInvokeRequestFrame) (*AdapterControlInvokeResultFrame, error) {
			if frame.Command != "camera.snap" {
				t.Fatalf("unexpected command: %s", frame.Command)
			}
			return &AdapterControlInvokeResultFrame{
				OK:      true,
				Payload: map[string]any{"image": "ok"},
			}, nil
		},
	})
	if err != nil {
		t.Fatalf("Serve returned error: %v", err)
	}

	lines := parseJSONLLines(t, out.String())
	if len(lines) != 1 {
		t.Fatalf("expected 1 output frame, got %d", len(lines))
	}
	frame := lines[0]
	if frame["type"] != "invoke.result" {
		t.Fatalf("unexpected frame type: %v", frame["type"])
	}
	if frame["request_id"] != "req-1" {
		t.Fatalf("unexpected request_id: %v", frame["request_id"])
	}
	if frame["ok"] != true {
		t.Fatalf("expected ok=true, got %v", frame["ok"])
	}
}

func TestControlEndpointRegistry_UpsertRemove(t *testing.T) {
	var out bytes.Buffer
	session := NewControlSession(strings.NewReader(""), &out)
	registry := NewControlEndpointRegistry(session)

	if err := registry.Upsert(AdapterControlEndpoint{
		EndpointID:  "device-host-1",
		DisplayName: "Device Host",
		Platform:    "ios",
		Caps:        []string{"camera"},
		Commands:    []string{"camera.snap"},
	}); err != nil {
		t.Fatalf("Upsert failed: %v", err)
	}
	if err := registry.Remove("device-host-1"); err != nil {
		t.Fatalf("Remove failed: %v", err)
	}

	lines := parseJSONLLines(t, out.String())
	if len(lines) != 2 {
		t.Fatalf("expected 2 output frames, got %d", len(lines))
	}
	if lines[0]["type"] != "endpoint.upsert" {
		t.Fatalf("expected endpoint.upsert, got %v", lines[0]["type"])
	}
	if lines[1]["type"] != "endpoint.remove" {
		t.Fatalf("expected endpoint.remove, got %v", lines[1]["type"])
	}

	if _, ok := registry.Get("device-host-1"); ok {
		t.Fatalf("expected endpoint to be removed from registry")
	}
}
