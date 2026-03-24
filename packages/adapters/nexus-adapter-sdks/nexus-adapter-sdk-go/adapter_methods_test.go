package nexadapter

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"testing"
)

func testAdapterMethod() AdapterMethod {
	return AdapterMethod{
		Name:        "jira.issues.transition",
		Description: "Transition a Jira issue",
		Action:      "write",
		Params: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"issue_key":     map[string]any{"type": "string"},
				"target_status": map[string]any{"type": "string"},
			},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"issue_key": map[string]any{"type": "string"},
			},
		},
		ConnectionRequired: true,
		MutatesRemote:      true,
		Origin: AdapterMethodOrigin{
			PackageID:         "jira",
			PackageVersion:    "1.0.0",
			DeclarationMode:   "manifest",
			DeclarationSource: "adapter.nexus.json",
			Namespace:         "jira",
		},
		ContextHints: AdapterMethodContextHints{
			Params: map[string]AdapterMethodContextHintValue{},
		},
	}
}

func TestRunMethodParsesNamespacedOperation(t *testing.T) {
	var captured AdapterMethodRequest

	originalStdout := os.Stdout
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	os.Stdout = writer
	defer func() {
		os.Stdout = originalStdout
	}()

	adapter := Adapter{
		Operations: AdapterOperations{
			AdapterInfo: func(ctx context.Context) (*AdapterInfo, error) {
				return &AdapterInfo{
					Platform:   "jira",
					Name:       "Jira Cloud",
					Version:    "1.0.0",
					Operations: []AdapterOperation{OpAdapterInfo},
					Methods:    []AdapterMethod{testAdapterMethod()},
					MethodCatalog: &AdapterMethodCatalog{
						Source:    "manifest",
						Namespace: "jira",
					},
				}, nil
			},
			Methods: map[string]func(ctx context.Context, req AdapterMethodRequest) (any, error){
				"jira.issues.transition": func(ctx context.Context, req AdapterMethodRequest) (any, error) {
					captured = req
					return map[string]any{
						"issue_key": req.Payload["issue_key"],
						"status":    req.Payload["target_status"],
					}, nil
				},
			},
		},
	}

	err = runMethod(adapter, "jira.issues.transition", []string{
		"--connection", "vrtly-jira",
		"--payload-json", `{"issue_key":"VT-123","target_status":"Done"}`,
	})
	if err != nil {
		t.Fatalf("runMethod: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}
	raw, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("read stdout: %v", err)
	}

	if captured.ConnectionID != "vrtly-jira" {
		t.Fatalf("connection_id = %q", captured.ConnectionID)
	}
	if got := captured.Payload["issue_key"]; got != "VT-123" {
		t.Fatalf("issue_key = %#v", got)
	}
	if got := captured.Payload["target_status"]; got != "Done" {
		t.Fatalf("target_status = %#v", got)
	}

	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("json unmarshal: %v", err)
	}
	if payload["issue_key"] != "VT-123" {
		t.Fatalf("result issue_key = %#v", payload["issue_key"])
	}
	if payload["status"] != "Done" {
		t.Fatalf("result status = %#v", payload["status"])
	}
}

func TestRunMethodRequiresDeclaredConnectionWhenMethodNeedsOne(t *testing.T) {
	adapter := Adapter{
		Operations: AdapterOperations{
			AdapterInfo: func(ctx context.Context) (*AdapterInfo, error) {
				return &AdapterInfo{
					Platform: "jira",
					Name:     "Jira Cloud",
					Version:  "1.0.0",
					Methods:  []AdapterMethod{testAdapterMethod()},
				}, nil
			},
			Methods: map[string]func(ctx context.Context, req AdapterMethodRequest) (any, error){
				"jira.issues.transition": func(ctx context.Context, req AdapterMethodRequest) (any, error) {
					return map[string]any{"ok": true}, nil
				},
			},
		},
	}

	err := runMethod(adapter, "jira.issues.transition", []string{
		"--payload-json", `{"issue_key":"VT-123","target_status":"Done"}`,
	})
	if err == nil {
		t.Fatalf("expected missing connection error")
	}
	if got := err.Error(); got != "--connection is required for jira.issues.transition" {
		t.Fatalf("unexpected error: %q", got)
	}
}

func TestRunMethodRejectsUndeclaredHandlers(t *testing.T) {
	adapter := Adapter{
		Operations: AdapterOperations{
			AdapterInfo: func(ctx context.Context) (*AdapterInfo, error) {
				return &AdapterInfo{
					Platform: "jira",
					Name:     "Jira Cloud",
					Version:  "1.0.0",
					Methods:  []AdapterMethod{},
				}, nil
			},
			Methods: map[string]func(ctx context.Context, req AdapterMethodRequest) (any, error){
				"jira.issues.transition": func(ctx context.Context, req AdapterMethodRequest) (any, error) {
					return map[string]any{"ok": true}, nil
				},
			},
		},
	}

	err := runMethod(adapter, "jira.issues.transition", []string{
		"--connection", "vrtly-jira",
		"--payload-json", `{"issue_key":"VT-123","target_status":"Done"}`,
	})
	if err == nil {
		t.Fatalf("expected undeclared method error")
	}
	if got := err.Error(); got != "adapter method not declared in adapter.info: jira.issues.transition" {
		t.Fatalf("unexpected error: %q", got)
	}
}
