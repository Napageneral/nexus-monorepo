package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestCustomerOrderBackfillResumesFromImmutablePageReceipt(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)
	allowSecondOrderPage := false
	orderFirstCalls := 0
	orderSecondCalls := 0
	customerCalls := 0
	var server *httptest.Server
	server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/orders.json":
			if r.URL.Query().Get("page_info") == "next-orders" {
				orderSecondCalls++
				if !allowSecondOrderPage {
					http.Error(w, "retryable test failure", http.StatusServiceUnavailable)
					return
				}
				_, _ = w.Write([]byte(`{"orders":[{"id":102,"name":"#102","created_at":"2026-07-20T11:00:00Z","updated_at":"2026-07-20T11:05:00Z","currency":"USD","total_price":"89.00","line_items":[]}]}`))
				return
			}
			orderFirstCalls++
			w.Header().Set("Link", "<"+server.URL+"/admin/api/2026-01/orders.json?page_info=next-orders>; rel=\"next\"")
			_, _ = w.Write([]byte(`{"orders":[{"id":101,"name":"#101","created_at":"2026-07-20T10:00:00Z","updated_at":"2026-07-20T10:05:00Z","currency":"USD","total_price":"199.00","line_items":[{"id":501,"product_id":99,"variant_id":199,"title":"MoonSpoon","quantity":1,"price":"199.00"}]}]}`))
		case "/admin/api/2026-01/graphql.json":
			customerCalls++
			_, _ = w.Write([]byte(`{"data":{"customers":{"edges":[{"cursor":"customer-44","node":{"id":"gid://shopify/Customer/44","displayName":"Jane Doe","updatedAt":"2026-07-20T10:05:00Z","addresses":[]}}],"pageInfo":{"hasNextPage":false,"endCursor":"customer-44"}}}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	shopifyHTTPClient = server.Client()

	stageDir := t.TempDir()
	if err := os.Chmod(stageDir, 0o700); err != nil {
		t.Fatal(err)
	}
	adapterContext := nexadapter.AdapterContext[struct{}]{
		Context:      context.Background(),
		ConnectionID: "shopify-primary",
		Runtime:      shopifyRuntimeContextForServer(server.URL),
	}
	payload := map[string]any{"since": "2026-01-01T00:00:00Z", "through": "2026-07-20T12:00:00Z", "stage_dir": stageDir}

	if _, err := stageCustomerOrderBackfill(adapterContext, payload); err == nil || !strings.Contains(err.Error(), "503") {
		t.Fatalf("expected the injected second-page failure, got %v", err)
	}
	if orderFirstCalls != 1 || orderSecondCalls != 1 || customerCalls != 0 {
		t.Fatalf("unexpected first attempt calls: first=%d second=%d customers=%d", orderFirstCalls, orderSecondCalls, customerCalls)
	}
	firstPage := filepath.Join(stageDir, "orders-page-000000.json")
	if info, err := os.Lstat(firstPage); err != nil {
		t.Fatalf("first durable page missing: %v", err)
	} else if !info.Mode().IsRegular() || info.Mode().Perm() != 0o600 {
		t.Fatalf("unexpected first page metadata: %s", info.Mode())
	}
	if _, err := os.Lstat(filepath.Join(stageDir, customerOrderBackfillManifestName)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("failed attempt must not publish a success manifest: %v", err)
	}

	allowSecondOrderPage = true
	result, err := stageCustomerOrderBackfill(adapterContext, payload)
	if err != nil {
		t.Fatalf("resume customer/order backfill: %v", err)
	}
	manifest, ok := result.(*customerOrderBackfillManifest)
	if !ok {
		t.Fatalf("unexpected manifest type: %T", result)
	}
	if orderFirstCalls != 1 || orderSecondCalls != 2 || customerCalls != 1 {
		t.Fatalf("resume refetched committed work: first=%d second=%d customers=%d", orderFirstCalls, orderSecondCalls, customerCalls)
	}
	if manifest.State != "succeeded" || len(manifest.Pages) != 3 {
		t.Fatalf("unexpected completed manifest: %#v", manifest)
	}
	if manifest.Totals.OrderSourceRows != 2 || manifest.Totals.CustomerSourceRows != 1 || manifest.Totals.Records != 4 {
		t.Fatalf("unexpected completed totals: %#v", manifest.Totals)
	}

	beforeCalls := orderFirstCalls + orderSecondCalls + customerCalls
	if _, err := stageCustomerOrderBackfill(adapterContext, payload); err != nil {
		t.Fatalf("idempotent completed replay: %v", err)
	}
	afterCalls := orderFirstCalls + orderSecondCalls + customerCalls
	if afterCalls != beforeCalls {
		t.Fatalf("completed replay contacted Shopify: before=%d after=%d", beforeCalls, afterCalls)
	}

	exported, err := exportCustomerOrderBackfill(adapterContext, payload)
	if err != nil {
		t.Fatalf("export exact customer/order import manifest: %v", err)
	}
	importManifest, ok := exported.(*customerOrderImportManifest)
	if !ok {
		t.Fatalf("unexpected import manifest type: %T", exported)
	}
	if importManifest.Version != 2 || importManifest.Format != "jsonl_files_sha256" || len(importManifest.Chunks) != 3 || importManifest.Totals.Records != 4 {
		t.Fatalf("unexpected hash-bound import manifest: %#v", importManifest)
	}
	manifestRaw, err := os.ReadFile(importManifest.ManifestPath)
	if err != nil {
		t.Fatal(err)
	}
	manifestDigest := sha256.Sum256(manifestRaw)
	if importManifest.ManifestFileSHA256 != hex.EncodeToString(manifestDigest[:]) {
		t.Fatalf("manifest file receipt does not bind exact persisted bytes: %#v", importManifest)
	}
	if bytes.Contains(manifestRaw, []byte("manifest_file_sha256")) {
		t.Fatal("persisted import manifest contains a circular self digest")
	}
	for _, chunk := range importManifest.Chunks {
		raw, err := os.ReadFile(chunk.Path)
		if err != nil {
			t.Fatal(err)
		}
		digest := sha256.Sum256(raw)
		if int64(len(raw)) != chunk.ByteCount || hex.EncodeToString(digest[:]) != chunk.SHA256 {
			t.Fatalf("import chunk receipt does not bind exact bytes: %#v", chunk)
		}
		if info, err := os.Lstat(chunk.Path); err != nil || info.Mode().Perm() != 0o600 {
			t.Fatalf("unexpected import chunk metadata: info=%v err=%v", info, err)
		}
	}
	firstExport, _ := json.Marshal(importManifest)
	replayed, err := exportCustomerOrderBackfill(adapterContext, payload)
	if err != nil {
		t.Fatalf("replay exact customer/order import export: %v", err)
	}
	replayedExport, _ := json.Marshal(replayed)
	if !bytes.Equal(firstExport, replayedExport) {
		t.Fatal("replayed customer/order import export changed its receipt")
	}

	genericPayload := map[string]any{
		"since":     payload["since"],
		"to":        payload["through"],
		"stage_dir": stageDir,
	}
	genericResult, err := stageAndExportCustomerOrderBackfill(adapterContext, genericPayload)
	if err != nil {
		t.Fatalf("generic Nex staged backfill bridge: %v", err)
	}
	genericRaw, _ := json.Marshal(genericResult)
	if !bytes.Equal(firstExport, genericRaw) {
		t.Fatal("generic Nex staged backfill bridge changed the exact import manifest")
	}
	if got := orderFirstCalls + orderSecondCalls + customerCalls; got != beforeCalls {
		t.Fatalf("generic replay contacted Shopify: before=%d after=%d", beforeCalls, got)
	}
	if _, err := stageAndExportCustomerOrderBackfill(adapterContext, map[string]any{
		"since": payload["since"], "stage_dir": stageDir,
	}); err == nil || !strings.Contains(err.Error(), "exact to boundary") {
		t.Fatalf("generic staged backfill accepted a missing fixed upper boundary: %v", err)
	}

	tamperedChunk := importManifest.Chunks[0]
	raw, err := os.ReadFile(tamperedChunk.Path)
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) == 0 {
		t.Fatal("expected non-empty import chunk")
	}
	raw[0] ^= 1
	if err := os.WriteFile(tamperedChunk.Path, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := exportCustomerOrderBackfill(adapterContext, payload); err == nil || !strings.Contains(err.Error(), "digest mismatch") {
		t.Fatalf("expected tampered import chunk rejection, got %v", err)
	}
}

func TestCustomerOrderBackfillRejectsTamperedCompletedReceipt(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/orders.json":
			_, _ = w.Write([]byte(`{"orders":[]}`))
		case "/admin/api/2026-01/graphql.json":
			_, _ = w.Write([]byte(`{"data":{"customers":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	shopifyHTTPClient = server.Client()
	stageDir := t.TempDir()
	if err := os.Chmod(stageDir, 0o700); err != nil {
		t.Fatal(err)
	}
	adapterContext := nexadapter.AdapterContext[struct{}]{Context: context.Background(), ConnectionID: "shopify-primary", Runtime: shopifyRuntimeContextForServer(server.URL)}
	payload := map[string]any{"since": "2026-01-01T00:00:00Z", "through": "2026-07-20T12:00:00Z", "stage_dir": stageDir}
	if _, err := stageCustomerOrderBackfill(adapterContext, payload); err != nil {
		t.Fatalf("initial customer/order backfill: %v", err)
	}

	pagePath := filepath.Join(stageDir, "orders-page-000000.json")
	raw, err := os.ReadFile(pagePath)
	if err != nil {
		t.Fatal(err)
	}
	var page map[string]any
	if err := json.Unmarshal(raw, &page); err != nil {
		t.Fatal(err)
	}
	page["source_rows"] = float64(99)
	tampered, _ := json.Marshal(page)
	if err := os.WriteFile(pagePath, append(tampered, '\n'), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := stageCustomerOrderBackfill(adapterContext, payload); err == nil || (!strings.Contains(err.Error(), "source/record count mismatch") && !strings.Contains(err.Error(), "manifest page inventory mismatch")) {
		t.Fatalf("expected tampered receipt rejection, got %v", err)
	}
}

func TestCustomerOrderBackfillRequiresPrivateStageDirectory(t *testing.T) {
	stageDir := t.TempDir()
	if err := os.Chmod(stageDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := resolvePrivateCustomerOrderStageDir(map[string]any{"stage_dir": stageDir}); err == nil {
		t.Fatal("expected group/world-readable stage directory rejection")
	}
}

func TestPrivateImmutableCustomerOrderArtifactRejectsLinks(t *testing.T) {
	root := t.TempDir()
	if err := os.Chmod(root, 0o700); err != nil {
		t.Fatal(err)
	}
	original := filepath.Join(root, "source.json")
	if err := os.WriteFile(original, []byte("{\"ok\":true}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if raw, err := readPrivateImmutableCustomerOrderArtifact(original, 1024); err != nil || string(raw) != "{\"ok\":true}\n" {
		t.Fatalf("read private immutable file: raw=%q err=%v", raw, err)
	}

	symlink := filepath.Join(root, "source-symlink.json")
	if err := os.Symlink(original, symlink); err != nil {
		t.Fatal(err)
	}
	if _, err := readPrivateImmutableCustomerOrderArtifact(symlink, 1024); err == nil {
		t.Fatal("accepted symlinked customer/order artifact")
	}

	hardlink := filepath.Join(root, "source-hardlink.json")
	if err := os.Link(original, hardlink); err != nil {
		t.Fatal(err)
	}
	if _, err := readPrivateImmutableCustomerOrderArtifact(original, 1024); err == nil {
		t.Fatal("accepted multiply-linked customer/order artifact")
	}
}

func TestCustomerOrderBackfillBindingRejectsAnotherStore(t *testing.T) {
	stageDir := t.TempDir()
	if err := os.Chmod(stageDir, 0o700); err != nil {
		t.Fatal(err)
	}
	since := mustParseRFC3339(t, "2026-01-01T00:00:00Z")
	through := mustParseRFC3339(t, "2026-07-20T12:00:00Z")
	first := &shopifyState{ConnectionID: "shopify-primary", ShopDomain: "moonsleepco.myshopify.com"}
	if err := ensureCustomerOrderBackfillBinding(stageDir, first, since, through); err != nil {
		t.Fatalf("create stage binding: %v", err)
	}
	other := &shopifyState{ConnectionID: "shopify-primary", ShopDomain: "another-store.myshopify.com"}
	if err := ensureCustomerOrderBackfillBinding(stageDir, other, since, through); err == nil || !strings.Contains(err.Error(), "binding mismatch") {
		t.Fatalf("expected cross-store binding rejection, got %v", err)
	}
	if err := ensureCustomerOrderBackfillBinding(stageDir, first, since, through.Add(-1)); err == nil || !strings.Contains(err.Error(), "binding mismatch") {
		t.Fatalf("expected changed upper-bound rejection, got %v", err)
	}
}

func TestCustomerOrderBackfillUsesExactFixedUpdatedWindow(t *testing.T) {
	through := time.Now().UTC().Truncate(time.Second)
	since := through.Add(-24 * time.Hour)
	resolvedSince, resolvedThrough, err := resolveCustomerOrderBackfillWindow(map[string]any{
		"since":   since.Format(time.RFC3339),
		"through": through.Format(time.RFC3339),
	})
	if err != nil {
		t.Fatalf("resolve fixed backfill window: %v", err)
	}
	if !resolvedSince.Equal(since) || !resolvedThrough.Equal(through) {
		t.Fatalf("window changed during parsing: since=%s through=%s", resolvedSince, resolvedThrough)
	}
	for name, payload := range map[string]map[string]any{
		"missing through": {"since": since.Format(time.RFC3339)},
		"reversed":        {"since": since.Format(time.RFC3339), "through": since.Format(time.RFC3339)},
		"future":          {"since": since.Format(time.RFC3339), "through": time.Now().UTC().Add(time.Hour).Format(time.RFC3339)},
	} {
		if _, _, err := resolveCustomerOrderBackfillWindow(payload); err == nil {
			t.Fatalf("%s window was accepted", name)
		}
	}

	state := &shopifyState{ShopDomain: "moonsleepco.myshopify.com", APIVersion: "2026-01"}
	orderSource, requestURL := shopifyOrdersWindowRequest(state, since, true, &through)
	parsedURL, err := url.Parse(requestURL)
	if err != nil {
		t.Fatal(err)
	}
	if got := parsedURL.Query().Get("updated_at_min"); got != since.Format(time.RFC3339) {
		t.Fatalf("wrong order lower bound: %q", got)
	}
	if got := parsedURL.Query().Get("updated_at_max"); got != through.Format(time.RFC3339) {
		t.Fatalf("wrong order upper bound: %q", got)
	}
	if got := parsedURL.Query().Get("order"); got != "updated_at asc" {
		t.Fatalf("wrong order window sort: %q", got)
	}
	if orderSource.Request["updated_at_min"] != since.Format(time.RFC3339) || orderSource.Request["updated_at_max"] != through.Format(time.RFC3339) {
		t.Fatalf("order source receipt lost its fixed window: %#v", orderSource.Request)
	}
	customerSource := shopifyCustomerSourceRequest(state, since, through)
	wantQuery := shopifyUpdatedWindowFilter(since, through)
	if customerSource.Request["query"] != wantQuery || customerSource.Request["cursor_since"] != since.Format(time.RFC3339) || customerSource.Request["cursor_through"] != through.Format(time.RFC3339) {
		t.Fatalf("customer source receipt lost its fixed window: %#v", customerSource.Request)
	}
}

func TestCustomerOrderBackfillReceiptHashesExactRecordsJSON(t *testing.T) {
	stageDir := t.TempDir()
	if err := os.Chmod(stageDir, 0o700); err != nil {
		t.Fatal(err)
	}
	since := mustParseRFC3339(t, "2026-01-01T00:00:00Z")
	through := mustParseRFC3339(t, "2026-07-20T12:00:00Z")
	record := nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: "shopify:test:customer:44:revision",
			Timestamp:        1,
			Content:          "customer proof",
			ContentType:      "text",
			Payload: map[string]any{
				"provider_object_json":   `{"provider_large_integer":9007199254740993123456789}`,
				"provider_object_sha256": "bb0d42371de05353a6aaff910297909eac6b1aa81d38f3ba1dff998f2c6c6f27",
			},
			Metadata: map[string]any{"family": "customer"},
		},
	}
	page := newCustomerOrderBackfillPage("customers", 0, since, through, "", "", true, 1, []nexadapter.AdapterInboundRecord{record})
	if _, err := persistCustomerOrderPage(stageDir, page); err != nil {
		t.Fatalf("exact-number page receipt rejected: %v", err)
	}
	if _, _, complete, err := loadCustomerOrderPageChain(stageDir, "customers", since, through, ""); err != nil {
		t.Fatalf("reload exact-number page receipt: %v", err)
	} else if !complete {
		t.Fatal("expected exact-number page to remain complete")
	}
	raw, err := os.ReadFile(filepath.Join(stageDir, "customers-page-000000.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(raw, []byte(`9007199254740993123456789`)) {
		t.Fatalf("exact provider number lexeme was not preserved in its source JSON string: %s", raw)
	}
}

func TestCustomerOrderBackfillMethodIsReadOnly(t *testing.T) {
	for _, methodName := range []string{
		"records.backfill.stage",
		"records.backfill.customer_orders.stage",
		"records.backfill.customer_orders.export",
	} {
		method, ok := declaredShopifyMethods()[methodName]
		if !ok {
			t.Fatalf("%s is not declared", methodName)
		}
		if method.MutatesRemote == nil || *method.MutatesRemote {
			t.Fatalf("%s must be provider read-only", methodName)
		}
	}
}

func TestShopifyOrderPageRejectsCrossOriginCursorBeforeRequest(t *testing.T) {
	state := &shopifyState{ShopDomain: "moonsleepco.myshopify.com", APIVersion: "2026-01"}
	for _, candidate := range []string{
		"https://attacker.example/admin/api/2026-01/orders.json?page_info=stolen",
		"https://moonsleepco.myshopify.com/admin/api/2026-01/customers.json?page_info=wrong-path",
		"http://moonsleepco.myshopify.com/admin/api/2026-01/orders.json?page_info=plaintext",
		"https://user@moonsleepco.myshopify.com/admin/api/2026-01/orders.json?page_info=user-info",
	} {
		if err := validateShopifyOrderPageURL(state, candidate); err == nil {
			t.Fatalf("unsafe Shopify page URL accepted: %s", candidate)
		}
	}
	valid := "https://moonsleepco.myshopify.com/admin/api/2026-01/orders.json?page_info=opaque"
	if err := validateShopifyOrderPageURL(state, valid); err != nil {
		t.Fatalf("valid Shopify page URL rejected: %v", err)
	}
}
