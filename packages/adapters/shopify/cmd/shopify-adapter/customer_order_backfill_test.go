package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

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
	payload := map[string]any{"since": "2026-01-01T00:00:00Z", "stage_dir": stageDir}

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
	payload := map[string]any{"since": "2026-01-01T00:00:00Z", "stage_dir": stageDir}
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

func TestCustomerOrderBackfillBindingRejectsAnotherStore(t *testing.T) {
	stageDir := t.TempDir()
	if err := os.Chmod(stageDir, 0o700); err != nil {
		t.Fatal(err)
	}
	since := mustParseRFC3339(t, "2026-01-01T00:00:00Z")
	first := &shopifyState{ConnectionID: "shopify-primary", ShopDomain: "moonsleepco.myshopify.com"}
	if err := ensureCustomerOrderBackfillBinding(stageDir, first, since); err != nil {
		t.Fatalf("create stage binding: %v", err)
	}
	other := &shopifyState{ConnectionID: "shopify-primary", ShopDomain: "another-store.myshopify.com"}
	if err := ensureCustomerOrderBackfillBinding(stageDir, other, since); err == nil || !strings.Contains(err.Error(), "binding mismatch") {
		t.Fatalf("expected cross-store binding rejection, got %v", err)
	}
}

func TestCustomerOrderBackfillReceiptHashesExactRecordsJSON(t *testing.T) {
	stageDir := t.TempDir()
	if err := os.Chmod(stageDir, 0o700); err != nil {
		t.Fatal(err)
	}
	since := mustParseRFC3339(t, "2026-01-01T00:00:00Z")
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
	page := newCustomerOrderBackfillPage("customers", 0, since, "", "", true, 1, []nexadapter.AdapterInboundRecord{record})
	if _, err := persistCustomerOrderPage(stageDir, page); err != nil {
		t.Fatalf("exact-number page receipt rejected: %v", err)
	}
	if _, _, complete, err := loadCustomerOrderPageChain(stageDir, "customers", since, ""); err != nil {
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
	method, ok := declaredShopifyMethods()["records.backfill.customer_orders.stage"]
	if !ok {
		t.Fatal("customer/order staging method is not declared")
	}
	if method.MutatesRemote == nil || *method.MutatesRemote {
		t.Fatal("customer/order staging method must be provider read-only")
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
