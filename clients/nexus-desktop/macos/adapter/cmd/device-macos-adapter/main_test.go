package main

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestInfoIncludesControlAndSetupOperations(t *testing.T) {
	adapterInfo, err := info(t.Context())
	if err != nil {
		t.Fatalf("info() error: %v", err)
	}

	want := map[string]bool{
		"adapter.info":          false,
		"adapter.health":        false,
		"adapter.accounts.list": false,
		"adapter.serve.start":   false,
		"adapter.setup.start":   false,
		"adapter.setup.submit":  false,
		"adapter.setup.status":  false,
		"adapter.setup.cancel":  false,
	}
	for _, operation := range adapterInfo.Operations {
		if _, ok := want[string(operation)]; ok {
			want[string(operation)] = true
		}
	}
	for operation, found := range want {
		if !found {
			t.Fatalf("missing operation %q in info.Operations", operation)
		}
	}
	if adapterInfo.Auth == nil || len(adapterInfo.Auth.Methods) == 0 {
		t.Fatalf("expected auth manifest methods")
	}
}

func TestSetupSubmitRequiresConfirmation(t *testing.T) {
	pending, err := setupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "sess-1",
		Payload: map[string]any{
			"confirm_companion_installed": "yes",
			"confirm_permissions_granted": "no",
			"confirm_paired":              "yes",
		},
	})
	if err != nil {
		t.Fatalf("setupSubmit() pending error: %v", err)
	}
	if pending.Status != nexadapter.SetupStatusRequiresInput {
		t.Fatalf("expected requires_input, got %q", pending.Status)
	}

	completed, err := setupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "sess-2",
		Payload: map[string]any{
			"confirm_companion_installed": "yes",
			"confirm_permissions_granted": "yes",
			"confirm_paired":              "yes",
		},
	})
	if err != nil {
		t.Fatalf("setupSubmit() completed error: %v", err)
	}
	if completed.Status != nexadapter.SetupStatusCompleted {
		t.Fatalf("expected completed, got %q", completed.Status)
	}
}

func TestServeStartUpsertsEndpointAndHandlesInvoke(t *testing.T) {
	input := strings.NewReader(`{"type":"invoke.request","request_id":"req-1","endpoint_id":"macos-default","command":"system.run","payload":{"command":["echo","hi"]}}` + "\n")
	var out strings.Builder
	session := nexadapter.NewServeSession(input, &out)

	if err := serveStart(context.Background(), "default", session); err != nil {
		t.Fatalf("serveStart() error: %v", err)
	}

	lines := jsonLines(t, out.String())
	if len(lines) != 2 {
		t.Fatalf("expected 2 frames, got %d (%q)", len(lines), out.String())
	}
	if lines[0]["type"] != "endpoint.upsert" {
		t.Fatalf("expected endpoint.upsert, got %#v", lines[0]["type"])
	}
	if lines[1]["type"] != "invoke.result" {
		t.Fatalf("expected invoke.result, got %#v", lines[1]["type"])
	}
	if lines[1]["ok"] != true {
		t.Fatalf("expected invoke.result ok=true, got %#v", lines[1]["ok"])
	}
}

func TestServeStartRejectsUnknownCommand(t *testing.T) {
	input := strings.NewReader(`{"type":"invoke.request","request_id":"req-2","endpoint_id":"macos-default","command":"chat.push","payload":{}}` + "\n")
	var out strings.Builder
	session := nexadapter.NewServeSession(input, &out)

	if err := serveStart(context.Background(), "default", session); err != nil {
		t.Fatalf("serveStart() error: %v", err)
	}

	lines := jsonLines(t, out.String())
	if len(lines) != 2 {
		t.Fatalf("expected 2 frames, got %d", len(lines))
	}
	if lines[1]["ok"] != false {
		t.Fatalf("expected invoke.result ok=false for unknown command")
	}
	errorObj, ok := lines[1]["error"].(map[string]any)
	if !ok {
		t.Fatalf("expected error object, got %#v", lines[1]["error"])
	}
	if errorObj["code"] != "INVALID_REQUEST" {
		t.Fatalf("expected INVALID_REQUEST code, got %#v", errorObj["code"])
	}
}

func jsonLines(t *testing.T, raw string) []map[string]any {
	t.Helper()
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	parts := strings.Split(trimmed, "\n")
	out := make([]map[string]any, 0, len(parts))
	for _, part := range parts {
		if strings.TrimSpace(part) == "" {
			continue
		}
		var parsed map[string]any
		if err := json.Unmarshal([]byte(part), &parsed); err != nil {
			t.Fatalf("json.Unmarshal(%q): %v", part, err)
		}
		out = append(out, parsed)
	}
	return out
}
