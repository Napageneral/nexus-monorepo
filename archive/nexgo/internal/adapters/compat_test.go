package adapters

import (
	"encoding/json"
	"testing"
)

// TestProtocolCompat verifies that protocol messages can be marshaled/unmarshaled
// in formats compatible with the TypeScript runtime.
func TestProtocolCompat(t *testing.T) {
	t.Run("all_verbs_encode_correctly", func(t *testing.T) {
		verbs := []Verb{VerbInfo, VerbMonitor, VerbBackfill, VerbSend, VerbStream, VerbHealth, VerbAccounts}
		expected := []string{"info", "monitor", "backfill", "send", "stream", "health", "accounts"}

		for i, verb := range verbs {
			msg := ProtocolMessage{ID: "test", Verb: verb}
			data, err := json.Marshal(msg)
			if err != nil {
				t.Fatalf("marshal verb %s: %v", verb, err)
			}

			var raw map[string]any
			if err := json.Unmarshal(data, &raw); err != nil {
				t.Fatalf("unmarshal verb %s: %v", verb, err)
			}

			if raw["verb"] != expected[i] {
				t.Errorf("verb %s encoded as %q, want %q", verb, raw["verb"], expected[i])
			}
		}
	})

	t.Run("info_verb_response", func(t *testing.T) {
		// Test marshaling an info response in the expected format.
		info := AdapterInfo{
			ID:           "discord",
			Name:         "Discord",
			Platform:     "discord",
			Version:      "1.0.0",
			Capabilities: []string{"send", "monitor"},
		}
		msg := ProtocolMessage{
			ID:      "1",
			Verb:    VerbInfo,
			Payload: info,
		}

		data, err := json.Marshal(msg)
		if err != nil {
			t.Fatalf("marshal info: %v", err)
		}

		// Unmarshal and verify structure.
		var raw map[string]any
		if err := json.Unmarshal(data, &raw); err != nil {
			t.Fatalf("unmarshal info: %v", err)
		}

		if raw["id"] != "1" {
			t.Errorf("id = %v, want 1", raw["id"])
		}
		if raw["verb"] != "info" {
			t.Errorf("verb = %v, want info", raw["verb"])
		}

		payload, ok := raw["payload"].(map[string]any)
		if !ok {
			t.Fatalf("payload is not a map, got %T", raw["payload"])
		}
		if payload["id"] != "discord" {
			t.Errorf("payload.id = %v, want discord", payload["id"])
		}
		if payload["name"] != "Discord" {
			t.Errorf("payload.name = %v, want Discord", payload["name"])
		}
		if payload["platform"] != "discord" {
			t.Errorf("payload.platform = %v, want discord", payload["platform"])
		}
		if payload["version"] != "1.0.0" {
			t.Errorf("payload.version = %v, want 1.0.0", payload["version"])
		}
		caps, ok := payload["capabilities"].([]any)
		if !ok || len(caps) != 2 {
			t.Fatalf("capabilities = %v, want [send, monitor]", payload["capabilities"])
		}
		if caps[0] != "send" || caps[1] != "monitor" {
			t.Errorf("capabilities = %v, want [send, monitor]", caps)
		}

		// Test unmarshaling from the expected TS format JSON.
		tsJSON := `{"id":"1","verb":"info","payload":{"id":"discord","name":"Discord","platform":"discord","version":"1.0.0","capabilities":["send","monitor"]}}`
		var decoded ProtocolMessage
		if err := json.Unmarshal([]byte(tsJSON), &decoded); err != nil {
			t.Fatalf("unmarshal TS format: %v", err)
		}
		if decoded.ID != "1" {
			t.Errorf("decoded.ID = %q, want 1", decoded.ID)
		}
		if decoded.Verb != VerbInfo {
			t.Errorf("decoded.Verb = %q, want info", decoded.Verb)
		}

		// Payload will be map[string]any after generic unmarshal.
		payloadBytes, _ := json.Marshal(decoded.Payload)
		var infoDecoded AdapterInfo
		if err := json.Unmarshal(payloadBytes, &infoDecoded); err != nil {
			t.Fatalf("unmarshal payload as AdapterInfo: %v", err)
		}
		if infoDecoded.ID != "discord" {
			t.Errorf("payload.id = %q, want discord", infoDecoded.ID)
		}
		if len(infoDecoded.Capabilities) != 2 {
			t.Errorf("capabilities length = %d, want 2", len(infoDecoded.Capabilities))
		}
	})

	t.Run("monitor_event", func(t *testing.T) {
		// Test that a monitor event in TS format can be parsed.
		tsJSON := `{"id":"2","verb":"monitor","payload":{"operation":"event.ingest","routing":{"adapter":"discord","platform":"discord","sender":{"id":"user-123","name":"John"}},"payload":{"content":"hello"}}}`

		var decoded ProtocolMessage
		if err := json.Unmarshal([]byte(tsJSON), &decoded); err != nil {
			t.Fatalf("unmarshal monitor: %v", err)
		}
		if decoded.ID != "2" {
			t.Errorf("id = %q, want 2", decoded.ID)
		}
		if decoded.Verb != VerbMonitor {
			t.Errorf("verb = %q, want monitor", decoded.Verb)
		}

		// Verify nested payload structure.
		payloadBytes, _ := json.Marshal(decoded.Payload)
		var payloadMap map[string]any
		if err := json.Unmarshal(payloadBytes, &payloadMap); err != nil {
			t.Fatalf("unmarshal payload: %v", err)
		}
		if payloadMap["operation"] != "event.ingest" {
			t.Errorf("operation = %v, want event.ingest", payloadMap["operation"])
		}
		routing, ok := payloadMap["routing"].(map[string]any)
		if !ok {
			t.Fatalf("routing is not a map")
		}
		if routing["adapter"] != "discord" {
			t.Errorf("routing.adapter = %v, want discord", routing["adapter"])
		}
		sender, ok := routing["sender"].(map[string]any)
		if !ok {
			t.Fatalf("sender is not a map")
		}
		if sender["id"] != "user-123" {
			t.Errorf("sender.id = %v, want user-123", sender["id"])
		}
		if sender["name"] != "John" {
			t.Errorf("sender.name = %v, want John", sender["name"])
		}
	})

	t.Run("send_delivery", func(t *testing.T) {
		// Test marshaling a send delivery in the expected format.
		delivery := DeliveryRequest{
			ChannelID: "channel-123",
			Content:   "Hello back!",
			ReplyTo:   "msg-456",
		}
		msg := ProtocolMessage{
			ID:      "3",
			Verb:    VerbSend,
			Payload: delivery,
		}

		data, err := json.Marshal(msg)
		if err != nil {
			t.Fatalf("marshal send: %v", err)
		}

		var raw map[string]any
		if err := json.Unmarshal(data, &raw); err != nil {
			t.Fatalf("unmarshal send: %v", err)
		}
		if raw["verb"] != "send" {
			t.Errorf("verb = %v, want send", raw["verb"])
		}

		payload, ok := raw["payload"].(map[string]any)
		if !ok {
			t.Fatalf("payload is not a map")
		}
		if payload["channel_id"] != "channel-123" {
			t.Errorf("channel_id = %v, want channel-123", payload["channel_id"])
		}
		if payload["content"] != "Hello back!" {
			t.Errorf("content = %v, want Hello back!", payload["content"])
		}
		if payload["reply_to"] != "msg-456" {
			t.Errorf("reply_to = %v, want msg-456", payload["reply_to"])
		}

		// Test unmarshaling from TS format.
		tsJSON := `{"id":"3","verb":"send","payload":{"channel_id":"channel-123","content":"Hello back!","reply_to":"msg-456"}}`
		var decoded ProtocolMessage
		if err := json.Unmarshal([]byte(tsJSON), &decoded); err != nil {
			t.Fatalf("unmarshal TS format: %v", err)
		}
		if decoded.Verb != VerbSend {
			t.Errorf("verb = %q, want send", decoded.Verb)
		}

		payloadBytes, _ := json.Marshal(decoded.Payload)
		var deliveryDecoded DeliveryRequest
		if err := json.Unmarshal(payloadBytes, &deliveryDecoded); err != nil {
			t.Fatalf("unmarshal payload as DeliveryRequest: %v", err)
		}
		if deliveryDecoded.ChannelID != "channel-123" {
			t.Errorf("channel_id = %q, want channel-123", deliveryDecoded.ChannelID)
		}
		if deliveryDecoded.Content != "Hello back!" {
			t.Errorf("content = %q, want Hello back!", deliveryDecoded.Content)
		}
		if deliveryDecoded.ReplyTo != "msg-456" {
			t.Errorf("reply_to = %q, want msg-456", deliveryDecoded.ReplyTo)
		}
	})

	t.Run("health_response", func(t *testing.T) {
		msg := ProtocolMessage{
			ID:      "4",
			Verb:    VerbHealth,
			Payload: map[string]string{"status": "ok"},
		}

		data, err := json.Marshal(msg)
		if err != nil {
			t.Fatalf("marshal health: %v", err)
		}

		var raw map[string]any
		if err := json.Unmarshal(data, &raw); err != nil {
			t.Fatalf("unmarshal health: %v", err)
		}
		if raw["verb"] != "health" {
			t.Errorf("verb = %v, want health", raw["verb"])
		}
		payload, ok := raw["payload"].(map[string]any)
		if !ok {
			t.Fatalf("payload is not a map")
		}
		if payload["status"] != "ok" {
			t.Errorf("status = %v, want ok", payload["status"])
		}

		// Test unmarshaling from TS format.
		tsJSON := `{"id":"4","verb":"health","payload":{"status":"ok"}}`
		var decoded ProtocolMessage
		if err := json.Unmarshal([]byte(tsJSON), &decoded); err != nil {
			t.Fatalf("unmarshal TS format: %v", err)
		}
		if decoded.Verb != VerbHealth {
			t.Errorf("verb = %q, want health", decoded.Verb)
		}
	})

	t.Run("error_field", func(t *testing.T) {
		msg := ProtocolMessage{
			ID:    "5",
			Verb:  VerbInfo,
			Error: "adapter not configured",
		}

		data, err := json.Marshal(msg)
		if err != nil {
			t.Fatalf("marshal error: %v", err)
		}

		var decoded ProtocolMessage
		if err := json.Unmarshal(data, &decoded); err != nil {
			t.Fatalf("unmarshal error: %v", err)
		}
		if decoded.Error != "adapter not configured" {
			t.Errorf("error = %q, want 'adapter not configured'", decoded.Error)
		}
	})

	t.Run("request_id_correlation", func(t *testing.T) {
		msg := ProtocolMessage{
			ID:        "6",
			Verb:      VerbSend,
			RequestID: "req-correlation-123",
			Payload:   map[string]string{"channel_id": "ch1", "content": "test"},
		}

		data, err := json.Marshal(msg)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}

		var decoded ProtocolMessage
		if err := json.Unmarshal(data, &decoded); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if decoded.RequestID != "req-correlation-123" {
			t.Errorf("request_id = %q, want req-correlation-123", decoded.RequestID)
		}
	})

	t.Run("omitempty_fields", func(t *testing.T) {
		// Verify omitempty works: empty optional fields should not appear in JSON.
		msg := ProtocolMessage{
			ID:   "7",
			Verb: VerbHealth,
		}

		data, err := json.Marshal(msg)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}

		var raw map[string]any
		if err := json.Unmarshal(data, &raw); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}

		// payload should be omitted when nil.
		if _, exists := raw["payload"]; exists {
			t.Error("payload should be omitted when nil")
		}
		// error should be omitted when empty.
		if _, exists := raw["error"]; exists {
			t.Error("error should be omitted when empty string")
		}
		// request_id should be omitted when empty.
		if _, exists := raw["request_id"]; exists {
			t.Error("request_id should be omitted when empty")
		}
	})

	t.Run("delivery_request_omitempty", func(t *testing.T) {
		// DeliveryRequest optional fields should be omitted when empty.
		delivery := DeliveryRequest{
			ChannelID: "ch1",
			Content:   "hello",
			// ReplyTo and ThreadID are empty.
		}

		data, err := json.Marshal(delivery)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}

		var raw map[string]any
		if err := json.Unmarshal(data, &raw); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}

		if _, exists := raw["reply_to"]; exists {
			t.Error("reply_to should be omitted when empty")
		}
		if _, exists := raw["thread_id"]; exists {
			t.Error("thread_id should be omitted when empty")
		}
	})
}
