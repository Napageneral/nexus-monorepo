package nexadapter

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"testing"
)

func TestRunMethodPassesCommunicationShapedPayloadThroughNamespacedMethod(t *testing.T) {
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
					Methods: []AdapterMethod{
						{
							Name:               "jira.comments.create",
							Action:             "write",
							ConnectionRequired: true,
							MutatesRemote:      true,
							ContextHints:       AdapterMethodContextHints{Params: map[string]AdapterMethodContextHintValue{}},
							Origin: AdapterMethodOrigin{
								PackageID:         "jira",
								PackageVersion:    "1.0.0",
								DeclarationMode:   "manifest",
								DeclarationSource: "adapter.info",
								Namespace:         "jira",
							},
						},
					},
				}, nil
			},
			Methods: map[string]func(ctx context.Context, req AdapterMethodRequest) (any, error){
				"jira.comments.create": func(ctx context.Context, req AdapterMethodRequest) (any, error) {
					captured = req
					return map[string]any{
						"ok":      true,
						"payload": req.Payload,
					}, nil
				},
			},
		},
	}

	err = runMethod(adapter, "jira.comments.create", []string{
		"--connection", "jira-conn",
		"--payload-json", `{"target":{"connection_id":"jira-conn","channel":{"platform":"jira","space_id":"vrtly","container_kind":"group","container_id":"VT","thread_id":"VT-7"},"reply_to_id":"jira:vrtly:VT-7"},"text":"hello"}`,
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

	if captured.ConnectionID != "jira-conn" {
		t.Fatalf("connection_id = %q", captured.ConnectionID)
	}
	target, ok := captured.Payload["target"].(map[string]any)
	if !ok {
		t.Fatalf("target type = %T", captured.Payload["target"])
	}
	if target["connection_id"] != "jira-conn" {
		t.Fatalf("target.connection_id = %#v", target["connection_id"])
	}
	if captured.Payload["text"] != "hello" {
		t.Fatalf("text = %#v", captured.Payload["text"])
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("json unmarshal: %v", err)
	}
	if payload["ok"] != true {
		t.Fatalf("ok = %#v", payload["ok"])
	}
}
