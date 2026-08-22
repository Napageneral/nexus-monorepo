package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func immutableObservationFixture(stream string, facts map[string]any) map[string]any {
	return map[string]any{
		"projection_work_id":          "channelprojection_11111111111111111111111111111111",
		"observation_receipt_id":      "channelobs_22222222222222222222222222222222",
		"projection_target":           "nex",
		"source_system":               "shopify",
		"source_account_ref":          "moonsleep",
		"source_stream":               stream,
		"external_receipt_id":         "f5d13f46-6d83-4a93-baf8-acdeec37893a",
		"semantic_revision_id":        "8328002633890:2026-08-22T20:00:00Z",
		"raw_body_sha256":             strings.Repeat("3", 64),
		"verification_issuer":         "cloudflare:moonsleep-meta-capi",
		"verification_receipt_sha256": strings.Repeat("4", 64),
		"observation_sha256":          strings.Repeat("5", 64),
		"immutable_facts_sha256":      strings.Repeat("6", 64),
		"immutable_facts":             facts,
	}
}

func TestImmutableObservationUsesCanonicalBuildersWithoutProviderCallOrCursorAdvance(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)
	sourceStateFixture(t)
	var providerCalls atomic.Int64
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		providerCalls.Add(1)
		http.Error(w, "provider call forbidden", http.StatusInternalServerError)
	}))
	defer server.Close()
	shopifyHTTPClient = server.Client()
	ctx := nexadapter.AdapterContext[struct{}]{
		Context:      context.Background(),
		ConnectionID: "shopify-primary",
		Runtime:      shopifyRuntimeContextForServer(server.URL),
	}
	initial := shopifySourceFamilyState{
		CursorISO:      "2026-08-22T19:00:00Z",
		ProviderCursor: "123",
	}
	_, err := withLockedSourceState("shopify-primary", func(state *shopifySourceState) (struct{}, error) {
		state.Families["orders.delta"] = initial
		state.Families["customers.delta"] = initial
		return struct{}{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name              string
		family            string
		stream            string
		facts             map[string]any
		externalRecordIDs []string
	}{
		{
			name:   "order and line item",
			family: "orders.delta",
			stream: "orders/paid",
			facts: map[string]any{
				"id":           8328002633890,
				"order_number": 17916,
				"name":         "#17916",
				"created_at":   "2026-08-22T19:59:00Z",
				"updated_at":   "2026-08-22T20:00:00Z",
				"currency":     "USD",
				"total_price":  "129.00",
				"line_items": []any{
					map[string]any{"id": 991, "quantity": 1, "price": "129.00"},
				},
			},
			externalRecordIDs: []string{"order:8328002633890", "line_item:8328002633890:991"},
		},
		{
			name:   "customer",
			family: "customers.delta",
			stream: "customers/updated",
			facts: map[string]any{
				"id":             771,
				"display_name":   "Ada Lovelace",
				"first_name":     "Ada",
				"last_name":      "Lovelace",
				"email":          "ada@example.com",
				"created_at":     "2026-08-22T19:59:00Z",
				"updated_at":     "2026-08-22T20:00:00Z",
				"verified_email": true,
			},
			externalRecordIDs: []string{"customer:771"},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			observation := immutableObservationFixture(test.stream, test.facts)
			observation["semantic_revision_id"] = fmt.Sprint(test.facts["id"]) + ":2026-08-22T20:00:00Z"
			payload := map[string]any{
				"family":      test.family,
				"observation": observation,
			}
			method := declaredShopifyMethods()["shopify.source.capture"]
			firstRaw, err := method.Handler(ctx, nexadapter.AdapterMethodRequest{
				ConnectionID: "shopify-primary",
				Payload:      payload,
			})
			if err != nil {
				t.Fatalf("first observation capture: %v", err)
			}
			first := firstRaw.(shopifySourceCaptureResult)
			if !first.Complete || len(first.Records) != len(test.externalRecordIDs) {
				t.Fatalf("unexpected first capture: %#v", first)
			}
			for index, want := range test.externalRecordIDs {
				if got := first.Records[index].Payload.ExternalRecordID; got != want {
					t.Fatalf("record %d id = %q, want %q", index, got, want)
				}
			}
			commitRaw, err := declaredShopifyMethods()["shopify.source.commit"].Handler(ctx, nexadapter.AdapterMethodRequest{
				ConnectionID: "shopify-primary",
				Payload: map[string]any{
					"family": test.family, "capture_id": first.CaptureID,
				},
			})
			if err != nil {
				t.Fatalf("commit observation: %v", err)
			}
			commit := commitRaw.(shopifySourceCommitResult)
			if !commit.Complete || commit.CursorISO != initial.CursorISO || commit.ProviderCursor != initial.ProviderCursor {
				t.Fatalf("observation advanced polling cursor: %#v", commit)
			}

			replayRaw, err := method.Handler(ctx, nexadapter.AdapterMethodRequest{
				ConnectionID: "shopify-primary",
				Payload:      payload,
			})
			if err != nil {
				t.Fatalf("replay observation capture: %v", err)
			}
			replay := replayRaw.(shopifySourceCaptureResult)
			if replay.CaptureID != first.CaptureID {
				t.Fatalf("capture id changed on exact replay: %s != %s", replay.CaptureID, first.CaptureID)
			}
			for index := range first.Records {
				if replay.Records[index].Payload.ExternalRecordID != first.Records[index].Payload.ExternalRecordID {
					t.Fatalf("record identity changed on replay")
				}
			}
			if _, err := declaredShopifyMethods()["shopify.source.abort"].Handler(ctx, nexadapter.AdapterMethodRequest{
				ConnectionID: "shopify-primary",
				Payload: map[string]any{
					"family": test.family, "capture_id": replay.CaptureID,
				},
			}); err != nil {
				t.Fatalf("abort replay: %v", err)
			}
		})
	}
	if providerCalls.Load() != 0 {
		t.Fatalf("immutable observations made %d provider calls", providerCalls.Load())
	}
}

func TestExpiredImmutableObservationLeaseCannotRewritePollingCheckpoint(t *testing.T) {
	sourceStateFixture(t)
	const connectionID = "shopify-primary"
	const family = "orders.delta"
	initial := shopifySourceFamilyState{
		CursorISO:      "2026-08-22T19:00:00Z",
		ProviderCursor: "123",
		PageCursor:     "poll-page-4",
		WindowSince:    "2026-08-22T18:00:00Z",
		WindowThrough:  "2026-08-22T19:30:00Z",
	}
	observation, err := parseShopifyImmutableObservation(
		immutableObservationFixture("orders/updated", map[string]any{"id": 8328002633890}),
		family,
	)
	if err != nil {
		t.Fatal(err)
	}
	started := time.Date(2026, 8, 22, 20, 0, 0, 0, time.UTC)
	_, err = withLockedSourceState(connectionID, func(state *shopifySourceState) (struct{}, error) {
		state.Families[family] = initial
		return struct{}{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := beginObservationSourceCapture(connectionID, shopifySourceFamilies[family], observation, started); err != nil {
		t.Fatal(err)
	}
	lease, err := beginSourceCapture(connectionID, shopifySourceFamilies[family], started.Add(shopifySourceLeaseTTL+time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if lease.ProviderCursor != initial.ProviderCursor || lease.PageCursor != initial.PageCursor || lease.RequestSince != initial.WindowSince || lease.WindowThrough != initial.WindowThrough {
		t.Fatalf("expired observation lease rewrote polling state: %#v", lease)
	}
}

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
	publishedCapture, ok := descriptor.Methods["shopify.source.capture"]
	if !ok {
		t.Fatal("adapter.nexus.json does not publish shopify.source.capture")
	}
	for label, pair := range map[string][2]any{
		"params":   {publishedCapture.Params, capture.Params},
		"response": {publishedCapture.Response, capture.Response},
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
			t.Fatalf("published source capture %s differs\npublished: %s\nexecutable: %s", label, publishedJSON, executableJSON)
		}
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
