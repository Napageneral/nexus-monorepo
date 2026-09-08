package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func managedShopifyRuntime(t *testing.T, families map[string]shopifySourceFamilyState) *nexadapter.RuntimeContext {
	t.Helper()
	checkpoints := map[string]json.RawMessage{}
	for family, state := range families {
		raw, err := json.Marshal(state)
		if err != nil {
			t.Fatal(err)
		}
		checkpoints[shopifySourceCheckpointScope+"/"+family] = raw
	}
	return &nexadapter.RuntimeContext{Version: 2, Platform: "shopify", ConnectionID: "shopify-primary", Config: map[string]any{}, Checkpoints: checkpoints}
}

func TestManagedSourceStateSeedsFromCheckpointsAndReturnsChangedFamilies(t *testing.T) {
	root := sourceStateFixture(t)
	const connection = "shopify-primary"
	t.Cleanup(func() { disableManagedSourceState(connection) })
	cursor := "2026-09-07T20:20:01.721174242Z"
	managed, err := enableManagedSourceState(connection, managedShopifyRuntime(t, map[string]shopifySourceFamilyState{
		"orders.delta":         {CursorISO: cursor},
		"finance.transactions": {CursorISO: "2026-08-12T03:06:47.841042188Z", ProviderCursor: "3113844211874"},
	}))
	if err != nil || !managed {
		t.Fatalf("managed=%v err=%v", managed, err)
	}
	spec := shopifySourceFamilies["orders.delta"]
	now := time.Date(2026, 9, 7, 23, 0, 0, 0, time.UTC)
	lease, err := beginSourceCapture(connection, spec, now)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	// The injected cursor drives the window: since = cursor - overlap, not the cold-start lookback.
	wantSince, _ := time.Parse(time.RFC3339Nano, cursor)
	if lease.RequestSince != wantSince.Add(-spec.Overlap).Format(time.RFC3339Nano) {
		t.Fatalf("request_since=%s want cursor-overlap", lease.RequestSince)
	}
	// Capture returns the family with its open lease as a checkpoint (a crash before commit leaves
	// a recoverable lease row), and only that family.
	captured, err := withSourceCheckpoints(connection, map[string]any{"family": spec.Name})
	if err != nil {
		t.Fatal(err)
	}
	object := captured.(map[string]any)
	checkpoints, _ := object["checkpoint"].([]nexadapter.Checkpoint)
	if len(checkpoints) != 1 || checkpoints[0].Key != "orders.delta" || checkpoints[0].Scope != "source" {
		t.Fatalf("capture checkpoints=%+v", object["checkpoint"])
	}
	if checkpoints[0].Value.(shopifySourceFamilyState).Lease == nil {
		t.Fatal("the capture checkpoint carries the open lease")
	}
	if err := finishSourceCapture(connection, spec.Name, lease.CaptureID, "", "", true); err != nil {
		t.Fatal(err)
	}
	commit, err := commitSourceCapture(connection, spec.Name, lease.CaptureID)
	if err != nil {
		t.Fatal(err)
	}
	if commit.CursorISO != lease.WindowThrough {
		t.Fatalf("commit cursor=%s want %s", commit.CursorISO, lease.WindowThrough)
	}
	result, err := withSourceCheckpoints(connection, commit)
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(result)
	var decoded struct {
		CursorISO  string `json:"cursor_iso"`
		Checkpoint []struct {
			Nex   string                   `json:"nex"`
			Scope string                   `json:"scope"`
			Key   string                   `json:"key"`
			Value shopifySourceFamilyState `json:"value"`
		} `json:"checkpoint"`
	}
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.CursorISO != lease.WindowThrough || len(decoded.Checkpoint) != 1 {
		t.Fatalf("commit result=%s", encoded)
	}
	if cp := decoded.Checkpoint[0]; cp.Nex != "checkpoint" || cp.Scope != "source" || cp.Key != "orders.delta" || cp.Value.CursorISO != lease.WindowThrough || cp.Value.Lease != nil {
		t.Fatalf("commit checkpoint=%+v", cp)
	}
	// No file: the runtime owns the rows.
	if _, err := os.Stat(filepath.Join(root, "source-observation", connection, "state.json")); !os.IsNotExist(err) {
		t.Fatalf("state.json must not be written under a managed runtime: %v", err)
	}
}

func TestManagedSourceStateColdStartMatchesFileBehaviour(t *testing.T) {
	sourceStateFixture(t)
	const connection = "shopify-primary"
	t.Cleanup(func() { disableManagedSourceState(connection) })
	// Version 1 runtime: not managed, the file path stays.
	if managed, err := enableManagedSourceState(connection, &nexadapter.RuntimeContext{Version: 1, Platform: "shopify", ConnectionID: connection, Config: map[string]any{}}); managed || err != nil {
		t.Fatalf("legacy managed=%v err=%v", managed, err)
	}
	// Version 2 without rows: the same cold start the file path takes (InitialLookback).
	if managed, err := enableManagedSourceState(connection, managedShopifyRuntime(t, nil)); !managed || err != nil {
		t.Fatalf("cold managed=%v err=%v", managed, err)
	}
	spec := shopifySourceFamilies["orders.delta"]
	now := time.Date(2026, 9, 7, 23, 0, 0, 0, time.UTC)
	lease, err := beginSourceCapture(connection, spec, now)
	if err != nil {
		t.Fatal(err)
	}
	if lease.RequestSince != now.Add(-spec.InitialLookback).Format(time.RFC3339Nano) {
		t.Fatalf("cold start request_since=%s", lease.RequestSince)
	}
	untouched, err := withSourceCheckpoints(connection, map[string]any{"ok": true})
	if err != nil {
		t.Fatal(err)
	}
	if _, has := untouched.(map[string]any)["checkpoint"]; !has {
		t.Fatal("an opened lease is a change worth a checkpoint")
	}
	disableManagedSourceState(connection)
	passthrough, err := withSourceCheckpoints(connection, map[string]any{"ok": true})
	if err != nil {
		t.Fatal(err)
	}
	if _, has := passthrough.(map[string]any)["checkpoint"]; has {
		t.Fatal("an unmanaged connection never carries a checkpoint field")
	}
}
