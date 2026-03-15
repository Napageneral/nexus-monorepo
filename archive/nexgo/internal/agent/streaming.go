package agent

import (
	gcaagent "github.com/badlogic/pi-mono/go-coding-agent/pkg/agent"
)

// translateEvent converts a go-coding-agent RuntimeEvent into a Nexus
// StreamEvent, mapping the agent's event vocabulary to Nexus's.
func (e *Engine) translateEvent(event gcaagent.RuntimeEvent, sessionKey string) StreamEvent {
	se := StreamEvent{
		SessionKey: sessionKey,
		Data:       make(map[string]any),
	}

	switch event.Type {
	case "assistant":
		se.Type = "text"
		if text, ok := event.Data["text"]; ok {
			se.Data["text"] = text
		}

	case "tool":
		phase, _ := event.Data["phase"].(string)
		switch phase {
		case "start":
			se.Type = "tool_start"
		case "result":
			se.Type = "tool_result"
		default:
			se.Type = "tool_start"
		}
		// Forward all tool data fields.
		for k, v := range event.Data {
			se.Data[k] = v
		}

	default:
		// Unknown event type: pass through as-is.
		se.Type = event.Type
		for k, v := range event.Data {
			se.Data[k] = v
		}
	}

	return se
}

// makeEventHook returns a RuntimeEventHook that translates events and
// dispatches them to both the per-request onEvent callback and the
// engine-wide WS broadcast.
func (e *Engine) makeEventHook(sessionKey string, onEvent func(StreamEvent)) gcaagent.RuntimeEventHook {
	return func(event gcaagent.RuntimeEvent) {
		se := e.translateEvent(event, sessionKey)

		// Per-request callback.
		if onEvent != nil {
			onEvent(se)
		}

		// Engine-wide broadcast (e.g. to WebSocket clients).
		if e.wsBroadcast != nil {
			e.wsBroadcast(se)
		}
	}
}
