package agent

import (
	"testing"

	gcaagent "github.com/badlogic/pi-mono/go-coding-agent/pkg/agent"
)

func TestTranslateEventAssistant(t *testing.T) {
	e := &Engine{}
	event := gcaagent.RuntimeEvent{
		Type: "assistant",
		Data: map[string]any{"text": "Hello world"},
	}
	se := e.translateEvent(event, "sess-1")
	if se.Type != "text" {
		t.Errorf("expected type 'text', got %q", se.Type)
	}
	if se.SessionKey != "sess-1" {
		t.Errorf("expected session_key 'sess-1', got %q", se.SessionKey)
	}
	if se.Data["text"] != "Hello world" {
		t.Errorf("expected text 'Hello world', got %v", se.Data["text"])
	}
}

func TestTranslateEventToolStart(t *testing.T) {
	e := &Engine{}
	event := gcaagent.RuntimeEvent{
		Type: "tool",
		Data: map[string]any{
			"phase":      "start",
			"toolCallId": "tc-1",
			"toolName":   "read",
		},
	}
	se := e.translateEvent(event, "sess-2")
	if se.Type != "tool_start" {
		t.Errorf("expected type 'tool_start', got %q", se.Type)
	}
	if se.Data["toolName"] != "read" {
		t.Errorf("expected toolName 'read', got %v", se.Data["toolName"])
	}
}

func TestTranslateEventToolResult(t *testing.T) {
	e := &Engine{}
	event := gcaagent.RuntimeEvent{
		Type: "tool",
		Data: map[string]any{
			"phase":      "result",
			"toolCallId": "tc-1",
			"toolName":   "read",
			"isError":    false,
		},
	}
	se := e.translateEvent(event, "sess-3")
	if se.Type != "tool_result" {
		t.Errorf("expected type 'tool_result', got %q", se.Type)
	}
}

func TestTranslateEventUnknown(t *testing.T) {
	e := &Engine{}
	event := gcaagent.RuntimeEvent{
		Type: "custom_event",
		Data: map[string]any{"key": "value"},
	}
	se := e.translateEvent(event, "sess-4")
	if se.Type != "custom_event" {
		t.Errorf("expected passthrough type 'custom_event', got %q", se.Type)
	}
	if se.Data["key"] != "value" {
		t.Errorf("expected passthrough data key=value")
	}
}

func TestMakeEventHook(t *testing.T) {
	var captured []StreamEvent
	var broadcasted []any

	e := &Engine{
		wsBroadcast: func(msg any) {
			broadcasted = append(broadcasted, msg)
		},
	}

	hook := e.makeEventHook("sess-5", func(se StreamEvent) {
		captured = append(captured, se)
	})

	// Fire an event through the hook.
	hook(gcaagent.RuntimeEvent{
		Type: "assistant",
		Data: map[string]any{"text": "test"},
	})

	if len(captured) != 1 {
		t.Fatalf("expected 1 captured event, got %d", len(captured))
	}
	if captured[0].Type != "text" {
		t.Errorf("expected captured type 'text', got %q", captured[0].Type)
	}
	if len(broadcasted) != 1 {
		t.Fatalf("expected 1 broadcasted event, got %d", len(broadcasted))
	}
}

func TestMakeEventHookNilCallback(t *testing.T) {
	e := &Engine{}
	hook := e.makeEventHook("sess-6", nil)

	// Should not panic with nil onEvent and nil wsBroadcast.
	hook(gcaagent.RuntimeEvent{
		Type: "assistant",
		Data: map[string]any{"text": "no-op"},
	})
}
