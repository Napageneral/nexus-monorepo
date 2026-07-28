package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func sourceStateFixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	t.Setenv(nexadapter.AdapterStateDirEnvVar, root)
	return root
}

func TestSourceCaptureCommitsPagesOnlyAfterExplicitReceipt(t *testing.T) {
	root := sourceStateFixture(t)
	spec := shopifySourceFamilies["orders.delta"]
	now := time.Date(2026, 7, 22, 12, 0, 0, 0, time.UTC)

	first, err := beginSourceCapture("moonsleep-production", spec, now)
	if err != nil {
		t.Fatalf("begin first capture: %v", err)
	}
	if first.PageCursor != "" || first.WindowThrough != now.Format(time.RFC3339Nano) {
		t.Fatalf("unexpected first capture: %#v", first)
	}
	if _, err := beginSourceCapture("moonsleep-production", spec, now.Add(time.Minute)); err == nil {
		t.Fatal("expected an overlapping capture to fail closed")
	}
	if err := finishSourceCapture("moonsleep-production", spec.Name, first.CaptureID, "page-2", "", false); err != nil {
		t.Fatalf("stage first capture: %v", err)
	}
	commit, err := commitSourceCapture("moonsleep-production", spec.Name, first.CaptureID)
	if err != nil {
		t.Fatalf("commit first capture: %v", err)
	}
	if commit.Complete || commit.PageCursor != "page-2" || commit.CursorISO != "" {
		t.Fatalf("unexpected partial commit: %#v", commit)
	}
	if _, err := commitSourceCapture("moonsleep-production", spec.Name, first.CaptureID); err == nil {
		t.Fatal("expected replayed commit to fail closed")
	}

	second, err := beginSourceCapture("moonsleep-production", spec, now.Add(2*time.Minute))
	if err != nil {
		t.Fatalf("begin second capture: %v", err)
	}
	if second.PageCursor != "page-2" || second.WindowThrough != first.WindowThrough || second.RequestSince != first.RequestSince {
		t.Fatalf("pagination window drifted: first=%#v second=%#v", first, second)
	}
	if err := finishSourceCapture("moonsleep-production", spec.Name, second.CaptureID, "", "", true); err != nil {
		t.Fatalf("stage second capture: %v", err)
	}
	commit, err = commitSourceCapture("moonsleep-production", spec.Name, second.CaptureID)
	if err != nil {
		t.Fatalf("commit second capture: %v", err)
	}
	if !commit.Complete || commit.CursorISO != first.WindowThrough || commit.PageCursor != "" || commit.WindowThrough != "" {
		t.Fatalf("unexpected terminal commit: %#v", commit)
	}

	raw, err := os.ReadFile(filepath.Join(root, "source-observation", "moonsleep-production", "state.json"))
	if err != nil {
		t.Fatalf("read state: %v", err)
	}
	var state shopifySourceState
	if err := json.Unmarshal(raw, &state); err != nil {
		t.Fatalf("parse state: %v", err)
	}
	row := state.Families[spec.Name]
	if row.Lease != nil || row.CursorISO != first.WindowThrough || row.PageCursor != "" {
		t.Fatalf("unexpected durable state: %#v", row)
	}
}

func TestSourceCaptureExpiredLeaseRepeatsWithoutAdvancingCursor(t *testing.T) {
	sourceStateFixture(t)
	spec := shopifySourceFamilies["customers.delta"]
	now := time.Date(2026, 7, 22, 12, 0, 0, 0, time.UTC)
	first, err := beginSourceCapture("moonsleep-production", spec, now)
	if err != nil {
		t.Fatalf("begin first capture: %v", err)
	}
	second, err := beginSourceCapture("moonsleep-production", spec, now.Add(shopifySourceLeaseTTL+time.Second))
	if err != nil {
		t.Fatalf("replace expired capture: %v", err)
	}
	if first.CaptureID == second.CaptureID {
		t.Fatal("expired capture id was reused")
	}
	if first.RequestSince != second.RequestSince {
		t.Fatalf("expired capture advanced source cursor: %s != %s", first.RequestSince, second.RequestSince)
	}
	if err := finishSourceCapture("moonsleep-production", spec.Name, first.CaptureID, "", "", true); err == nil {
		t.Fatal("stale capture unexpectedly replaced the current lease")
	}
}

func TestFinanceProviderCursorAdvancesOnlyAfterTerminalCommit(t *testing.T) {
	root := sourceStateFixture(t)
	const connectionID = "moonsleep-production"
	const family = "finance.transactions"
	now := time.Date(2026, 7, 28, 18, 0, 0, 0, time.UTC)
	emptyStateSHA, err := sourceFamilyStateSHA256(shopifySourceFamilyState{})
	if err != nil {
		t.Fatal(err)
	}
	adoption, err := adoptShopifyFinanceCheckpoint(connectionID, "900719925474099312345", emptyStateSHA)
	if err != nil {
		t.Fatalf("adopt finance checkpoint: %v", err)
	}
	if adoption.ProviderCursor != "900719925474099312345" || adoption.ProviderCalls != 0 || adoption.ProviderWriteAuthority {
		t.Fatalf("unexpected checkpoint adoption: %#v", adoption)
	}

	first, err := beginSourceCapture(connectionID, shopifySourceFamilies[family], now)
	if err != nil {
		t.Fatalf("begin first finance capture: %v", err)
	}
	if first.ProviderCursor != adoption.ProviderCursor || first.NextProviderCursor != "" {
		t.Fatalf("unexpected first finance lease: %#v", first)
	}
	if err := finishSourceCapture(connectionID, family, first.CaptureID, "page-2", "900719925474099312999", false); err != nil {
		t.Fatalf("stage partial finance capture: %v", err)
	}
	partial, err := commitSourceCapture(connectionID, family, first.CaptureID)
	if err != nil {
		t.Fatalf("commit partial finance capture: %v", err)
	}
	if partial.ProviderCursor != adoption.ProviderCursor || partial.Complete {
		t.Fatalf("partial finance capture advanced stable provider cursor: %#v", partial)
	}

	second, err := beginSourceCapture(connectionID, shopifySourceFamilies[family], now.Add(time.Minute))
	if err != nil {
		t.Fatalf("resume finance capture: %v", err)
	}
	if second.ProviderCursor != adoption.ProviderCursor ||
		second.NextProviderCursor != "900719925474099312999" ||
		second.PageCursor != "page-2" {
		t.Fatalf("finance pagination state drifted: %#v", second)
	}
	if err := finishSourceCapture(connectionID, family, second.CaptureID, "", "900719925474099313111", true); err != nil {
		t.Fatalf("stage terminal finance capture: %v", err)
	}
	terminal, err := commitSourceCapture(connectionID, family, second.CaptureID)
	if err != nil {
		t.Fatalf("commit terminal finance capture: %v", err)
	}
	if !terminal.Complete || terminal.ProviderCursor != "900719925474099313111" {
		t.Fatalf("terminal finance cursor did not advance: %#v", terminal)
	}

	raw, err := os.ReadFile(filepath.Join(root, "source-observation", connectionID, "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	var durable shopifySourceState
	if err := json.Unmarshal(raw, &durable); err != nil {
		t.Fatal(err)
	}
	row := durable.Families[family]
	if row.ProviderCursor != terminal.ProviderCursor ||
		row.PageCursor != "" ||
		row.WindowProviderCursor != "" ||
		row.Lease != nil {
		t.Fatalf("unexpected durable finance cursor: %#v", row)
	}
}

func TestFinanceCheckpointAdoptionIsExactAndClearsLegacyPagination(t *testing.T) {
	sourceStateFixture(t)
	const connectionID = "moonsleep-production"
	const family = "finance.transactions"
	legacy := shopifySourceFamilyState{
		CursorISO:     "2026-07-23T00:00:00Z",
		WindowSince:   "2026-07-23T00:00:00Z",
		WindowThrough: "2026-07-28T18:00:00Z",
		PageCursor:    "https://moon.myshopify.com/page_info=legacy",
	}
	_, err := withLockedSourceState(connectionID, func(state *shopifySourceState) (struct{}, error) {
		state.Families[family] = legacy
		return struct{}{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	expectedSHA, err := sourceFamilyStateSHA256(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := adoptShopifyFinanceCheckpoint(connectionID, "12345", strings.Repeat("0", 64)); err == nil {
		t.Fatal("checkpoint adoption accepted a stale state SHA")
	}
	adoption, err := adoptShopifyFinanceCheckpoint(connectionID, "12345", expectedSHA)
	if err != nil {
		t.Fatalf("adopt legacy checkpoint: %v", err)
	}
	if !adoption.ClearedInProgress ||
		adoption.PreviousProviderCursor != "" ||
		adoption.ProviderCursor != "12345" ||
		adoption.PreviousStateSHA256 != expectedSHA ||
		adoption.CurrentStateSHA256 == expectedSHA {
		t.Fatalf("unexpected legacy checkpoint adoption: %#v", adoption)
	}
	lease, err := beginSourceCapture(connectionID, shopifySourceFamilies[family], time.Date(2026, 7, 28, 19, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if lease.ProviderCursor != "12345" || lease.PageCursor != "" {
		t.Fatalf("legacy page cursor survived adoption: %#v", lease)
	}
}

func TestFinanceCheckpointAdoptionRejectsActiveLeaseAndInvalidCursor(t *testing.T) {
	sourceStateFixture(t)
	const connectionID = "moonsleep-production"
	const family = "finance.transactions"
	emptyStateSHA, err := sourceFamilyStateSHA256(shopifySourceFamilyState{})
	if err != nil {
		t.Fatal(err)
	}
	for _, invalid := range []string{"", "-1", "01", "1.0", "900719925474099312345x"} {
		if _, err := adoptShopifyFinanceCheckpoint(connectionID, invalid, emptyStateSHA); err == nil {
			t.Fatalf("accepted invalid provider cursor %q", invalid)
		}
	}
	if _, err := adoptShopifyFinanceCheckpoint(connectionID, "42", emptyStateSHA); err != nil {
		t.Fatal(err)
	}
	if _, err := beginSourceCapture(connectionID, shopifySourceFamilies[family], time.Now().UTC()); err != nil {
		t.Fatal(err)
	}
	row, err := withLockedSourceState(connectionID, func(state *shopifySourceState) (shopifySourceFamilyState, error) {
		return state.Families[family], nil
	})
	if err != nil {
		t.Fatal(err)
	}
	stateSHA, err := sourceFamilyStateSHA256(row)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := adoptShopifyFinanceCheckpoint(connectionID, "43", stateSHA); err == nil {
		t.Fatal("checkpoint adoption accepted an active capture")
	}
}

func TestHighestShopifyProviderCursorPreservesLargeDecimalIDs(t *testing.T) {
	records := []nexadapter.AdapterInboundRecord{
		{Payload: nexadapter.AdapterInboundPayload{Metadata: map[string]any{"provider_ids": map[string]any{"provider_id": "900719925474099312345"}}}},
		{Payload: nexadapter.AdapterInboundPayload{Metadata: map[string]any{"provider_ids": map[string]any{"provider_id": "1000719925474099312345"}}}},
		{Payload: nexadapter.AdapterInboundPayload{Metadata: map[string]any{"provider_ids": map[string]any{"provider_id": "99"}}}},
	}
	highest, err := highestShopifyProviderCursor(records)
	if err != nil {
		t.Fatal(err)
	}
	if highest != "1000719925474099312345" {
		t.Fatalf("large provider cursor lost ordering: %s", highest)
	}
}

func TestSourceMethodCatalogIsBoundedAndRemoteReadOnly(t *testing.T) {
	adapter := adapterConfig()
	capture, ok := adapter.Methods["shopify.source.capture"]
	if !ok {
		t.Fatal("missing shopify.source.capture")
	}
	if capture.MutatesRemote == nil || *capture.MutatesRemote {
		t.Fatal("source capture must be provider read-only")
	}
	if capture.ConnectionRequired == nil || !*capture.ConnectionRequired {
		t.Fatal("source capture must require a connection")
	}
	commit, ok := adapter.Methods["shopify.source.commit"]
	if !ok {
		t.Fatal("missing shopify.source.commit")
	}
	if commit.MutatesRemote == nil || *commit.MutatesRemote {
		t.Fatal("source commit must not mutate Shopify")
	}
	adopt, ok := adapter.Methods["shopify.source.checkpoint.adopt"]
	if !ok {
		t.Fatal("missing shopify.source.checkpoint.adopt")
	}
	if adopt.MutatesRemote == nil || *adopt.MutatesRemote {
		t.Fatal("checkpoint adoption must not mutate Shopify")
	}

	raw, err := os.ReadFile("../../adapter.nexus.json")
	if err != nil {
		t.Fatal(err)
	}
	var descriptor struct {
		Methods map[string]struct {
			Description        string         `json:"description"`
			Action             string         `json:"action"`
			ConnectionRequired bool           `json:"connection_required"`
			MutatesRemote      bool           `json:"mutates_remote"`
			Params             map[string]any `json:"params"`
			Response           map[string]any `json:"response"`
		} `json:"methods"`
	}
	if err := json.Unmarshal(raw, &descriptor); err != nil {
		t.Fatal(err)
	}
	published, ok := descriptor.Methods["shopify.source.checkpoint.adopt"]
	if !ok {
		t.Fatal("adapter.nexus.json does not publish shopify.source.checkpoint.adopt")
	}
	if published.Description != adopt.Description ||
		published.Action != adopt.Action ||
		published.ConnectionRequired != *adopt.ConnectionRequired ||
		published.MutatesRemote != *adopt.MutatesRemote {
		t.Fatal("published checkpoint adoption metadata differs from executable declaration")
	}
	for label, pair := range map[string][2]any{
		"params":   {published.Params, adopt.Params},
		"response": {published.Response, adopt.Response},
	} {
		publishedJSON, err := json.Marshal(pair[0])
		if err != nil {
			t.Fatal(err)
		}
		executableJSON, err := json.Marshal(pair[1])
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(publishedJSON, executableJSON) {
			t.Fatalf("published checkpoint adoption %s differs\npublished: %s\nexecutable: %s", label, publishedJSON, executableJSON)
		}
	}
}
