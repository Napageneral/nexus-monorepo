package nexadapter

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"
)

func TestRunSendParsesCanonicalDeliveryTarget(t *testing.T) {
	var captured SendRequest

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
			ChannelsSend: func(ctx context.Context, req SendRequest) (*DeliveryResult, error) {
				captured = req
				return &DeliveryResult{
					Success:    true,
					MessageIDs: []string{"msg-1"},
					ChunksSent: 1,
				}, nil
			},
		},
	}

	err = runSend(adapter, []string{
		"--connection", "jira-conn",
		"--target-json", `{"connection_id":"jira-conn","channel":{"platform":"jira","space_id":"vrtly","container_kind":"group","container_id":"VT","thread_id":"VT-7"},"reply_to_id":"jira:vrtly:VT-7"}`,
		"--text", `{"action":"comment","body":"hello"}`,
	})
	if err != nil {
		t.Fatalf("runSend: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}
	if _, err := io.ReadAll(reader); err != nil {
		t.Fatalf("read stdout: %v", err)
	}

	if captured.Target.ConnectionID != "jira-conn" {
		t.Fatalf("connection_id = %q", captured.Target.ConnectionID)
	}
	if captured.Target.Channel.Platform != "jira" {
		t.Fatalf("platform = %q", captured.Target.Channel.Platform)
	}
	if captured.Target.Channel.ContainerID != "VT" {
		t.Fatalf("container_id = %q", captured.Target.Channel.ContainerID)
	}
	if captured.Target.Channel.ThreadID != "VT-7" {
		t.Fatalf("thread_id = %q", captured.Target.Channel.ThreadID)
	}
	if captured.Target.ReplyToID != "jira:vrtly:VT-7" {
		t.Fatalf("reply_to_id = %q", captured.Target.ReplyToID)
	}
	if strings.TrimSpace(captured.Text) != `{"action":"comment","body":"hello"}` {
		t.Fatalf("text = %q", captured.Text)
	}
}

func TestRunSendNormalizesErrorDeliveryResultMessageIDs(t *testing.T) {
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
			ChannelsSend: func(ctx context.Context, req SendRequest) (*DeliveryResult, error) {
				return &DeliveryResult{
					Success: false,
					Error: &DeliveryError{
						Type:    "unknown",
						Message: "boom",
						Retry:   false,
					},
				}, nil
			},
		},
	}

	err = runSend(adapter, []string{
		"--connection", "jira-conn",
		"--target-json", `{"connection_id":"jira-conn","channel":{"platform":"jira","space_id":"vrtly","container_kind":"group","container_id":"VT"}}`,
		"--text", `{"action":"comment","body":"hello"}`,
	})
	if err != nil {
		t.Fatalf("runSend: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}
	raw, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("read stdout: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("json unmarshal: %v", err)
	}
	messageIDs, ok := payload["message_ids"].([]any)
	if !ok {
		t.Fatalf("message_ids type = %T, want []any", payload["message_ids"])
	}
	if len(messageIDs) != 0 {
		t.Fatalf("len(message_ids) = %d, want 0", len(messageIDs))
	}
}
