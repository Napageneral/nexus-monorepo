package nexadapter

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestRuntimeContextCheckpointsAreOptionalAndDecode(t *testing.T) {
	dir := t.TempDir()
	v1 := filepath.Join(dir, "v1.json")
	if err := os.WriteFile(v1, []byte(`{"version":1,"platform":"gmail","connection_id":"a@b.co","config":{}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	legacy, err := LoadRuntimeContextFile(v1)
	if err != nil {
		t.Fatal(err)
	}
	if legacy.ManagedCheckpoints() {
		t.Fatal("a version 1 context must not report managed checkpoints")
	}
	var state struct {
		HistoryID string `json:"history_id"`
	}
	if found, err := legacy.Checkpoint("monitor", "history", &state); err != nil || found {
		t.Fatalf("legacy context: found=%v err=%v", found, err)
	}

	v2 := filepath.Join(dir, "v2.json")
	if err := os.WriteFile(v2, []byte(`{"version":2,"platform":"gmail","connection_id":"a@b.co","config":{},"checkpoints":{"monitor/history":{"history_id":"3332306"}}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	managed, err := LoadRuntimeContextFile(v2)
	if err != nil {
		t.Fatal(err)
	}
	if !managed.ManagedCheckpoints() {
		t.Fatal("a version 2 context reports managed checkpoints")
	}
	found, err := managed.Checkpoint("monitor", "history", &state)
	if err != nil || !found || state.HistoryID != "3332306" {
		t.Fatalf("checkpoint decode: found=%v err=%v state=%+v", found, err, state)
	}
	if found, _ := managed.Checkpoint("monitor", "missing", &state); found {
		t.Fatal("an absent key is a cold start, not a value")
	}
	empty := &RuntimeContext{Checkpoints: map[string]json.RawMessage{}}
	if !empty.ManagedCheckpoints() {
		t.Fatal("an empty checkpoint map still means the runtime owns checkpoints")
	}
}

func TestEmitCheckpointWritesTheLineBehindRecords(t *testing.T) {
	var lines []any
	emit := func(record any) { lines = append(lines, record) }
	emit(map[string]any{"operation": "record.ingest"})
	if err := EmitCheckpoint(emit, NewCheckpoint("monitor", "history", map[string]any{"history_id": "1"})); err != nil {
		t.Fatal(err)
	}
	if len(lines) != 2 {
		t.Fatalf("lines=%d", len(lines))
	}
	encoded, err := json.Marshal(lines[1])
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != `{"nex":"checkpoint","scope":"monitor","key":"history","value":{"history_id":"1"}}` {
		t.Fatalf("line=%s", encoded)
	}
	if err := EmitCheckpoint(emit, NewCheckpoint("Monitor", "history", nil)); err == nil {
		t.Fatal("an uppercase scope must be refused")
	}
	if err := EmitCheckpoint(emit, NewCheckpoint("monitor", "bad\nkey", nil)); err == nil {
		t.Fatal("a control character in the key must be refused")
	}
}

func TestWithCheckpointAttachesTheResultField(t *testing.T) {
	type result struct {
		Family string `json:"family"`
	}
	object, err := WithCheckpoint(result{Family: "orders.delta"}, NewCheckpoint("source", "orders.delta", map[string]any{"cursor_iso": "x"}))
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(object)
	if string(encoded) != `{"checkpoint":[{"nex":"checkpoint","scope":"source","key":"orders.delta","value":{"cursor_iso":"x"}}],"family":"orders.delta"}` {
		t.Fatalf("object=%s", encoded)
	}
	plain, err := WithCheckpoint(result{Family: "x"})
	if err != nil || plain["checkpoint"] != nil {
		t.Fatalf("no checkpoints: %v %v", plain, err)
	}
	if _, err := WithCheckpoint([]int{1}, NewCheckpoint("source", "a", 1)); err == nil {
		t.Fatal("a non-object result cannot carry a checkpoint")
	}
}
