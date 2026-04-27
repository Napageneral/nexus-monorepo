package main

import (
	"context"
	"encoding/json"
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

func TestBuildOrderRecordPreservesBridgeAttributes(t *testing.T) {
	record := buildOrderRecord(
		&shopifyState{
			ConnectionID: "shopify-primary",
			ShopDomain:   "moonsleepco.myshopify.com",
		},
		shopifyOrder{
			ID:              101,
			Name:            "#101",
			CreatedAt:       "2026-03-31T10:00:00Z",
			UpdatedAt:       "2026-03-31T10:05:00Z",
			ProcessedAt:     "2026-03-31T10:04:00Z",
			Currency:        "USD",
			TotalPrice:      "129.00",
			FinancialStatus: "paid",
			CheckoutToken:   "checkout-1",
			LandingSite:     "https://moonsleep.co/products/body-pillow?gclid=abc123&utm_source=google",
			NoteAttributes: []shopifyNoteAttribute{
				{Name: "ms_session_id", Value: "session-1"},
				{Name: "ms_initiate_checkout_event_id", Value: "evt-1"},
				{Name: "ms_fbclid", Value: "fbclid-1"},
			},
		},
		shopifySourceRequest{
			APIBaseURL: "https://moonsleepco.myshopify.com/admin/api/2026-01",
			Path:       "/orders.json",
			Request:    map[string]any{"created_at_min": "2026-03-01T00:00:00Z"},
		},
	)

	if record.Operation != "record.ingest" {
		t.Fatalf("unexpected operation: %q", record.Operation)
	}
	if record.Routing.Platform != platformID {
		t.Fatalf("unexpected platform: %q", record.Routing.Platform)
	}
	if record.Routing.ContainerID != "order" {
		t.Fatalf("unexpected container id: %q", record.Routing.ContainerID)
	}

	metadata := record.Payload.Metadata
	if metadata["family"] != "order" {
		t.Fatalf("unexpected family metadata: %#v", metadata["family"])
	}
	bridge, ok := metadata["bridge_attributes"].(map[string]any)
	if !ok {
		t.Fatalf("expected bridge attributes map, got %#v", metadata["bridge_attributes"])
	}
	if bridge["session_id"] != "session-1" {
		t.Fatalf("unexpected session_id: %#v", bridge["session_id"])
	}
	if bridge["gclid"] != "abc123" {
		t.Fatalf("unexpected gclid: %#v", bridge["gclid"])
	}
	if bridge["utm_source"] != "google" {
		t.Fatalf("unexpected utm_source: %#v", bridge["utm_source"])
	}
}

func TestBuildLineItemRecord(t *testing.T) {
	record := buildLineItemRecord(
		&shopifyState{
			ConnectionID: "shopify-primary",
			ShopDomain:   "moonsleepco.myshopify.com",
		},
		shopifyOrder{
			ID:          101,
			OrderNumber: 12,
			Name:        "#101",
			UpdatedAt:   "2026-03-31T10:05:00Z",
		},
		shopifyLineItem{
			ID:        501,
			ProductID: 99,
			VariantID: 199,
			Title:     "Body Pillow",
			Quantity:  2,
			Price:     "64.50",
		},
		shopifySourceRequest{
			APIBaseURL: "https://moonsleepco.myshopify.com/admin/api/2026-01",
			Path:       "/orders.json",
			Request:    map[string]any{"created_at_min": "2026-03-01T00:00:00Z"},
		},
	)

	if record.Routing.ContainerID != "line_item" {
		t.Fatalf("unexpected container id: %q", record.Routing.ContainerID)
	}
	if !strings.Contains(record.Payload.ExternalRecordID, ":line_item:101:501:") {
		t.Fatalf("unexpected external record id: %q", record.Payload.ExternalRecordID)
	}
}

func TestBuildLineItemRecordIgnoresParentOrderFreshnessInRevision(t *testing.T) {
	baseState := &shopifyState{
		ConnectionID: "shopify-primary",
		ShopDomain:   "moonsleepco.myshopify.com",
	}
	lineItem := shopifyLineItem{
		ID:        501,
		ProductID: 99,
		VariantID: 199,
		Title:     "Body Pillow",
		Quantity:  2,
		Price:     "64.50",
	}
	sourceRequest := shopifySourceRequest{
		APIBaseURL: "https://moonsleepco.myshopify.com/admin/api/2026-01",
		Path:       "/orders.json",
		Request:    map[string]any{"updated_at_min": "2026-03-01T00:00:00Z"},
	}

	first := buildLineItemRecord(baseState, shopifyOrder{
		ID:          101,
		OrderNumber: 12,
		Name:        "#101",
		UpdatedAt:   "2026-03-31T10:05:00Z",
	}, lineItem, sourceRequest)
	second := buildLineItemRecord(baseState, shopifyOrder{
		ID:          101,
		OrderNumber: 12,
		Name:        "#101",
		UpdatedAt:   "2026-03-31T10:25:00Z",
	}, lineItem, sourceRequest)

	if first.Payload.ExternalRecordID != second.Payload.ExternalRecordID {
		t.Fatalf("line item revision should ignore parent order freshness: %q != %q", first.Payload.ExternalRecordID, second.Payload.ExternalRecordID)
	}
}

func TestParseLinkHeader(t *testing.T) {
	links := parseLinkHeader(`<https://example.test/orders?page_info=1>; rel="previous", <https://example.test/orders?page_info=2>; rel="next"`)
	if links["next"] != "https://example.test/orders?page_info=2" {
		t.Fatalf("unexpected next link: %#v", links["next"])
	}
	if links["previous"] != "https://example.test/orders?page_info=1" {
		t.Fatalf("unexpected previous link: %#v", links["previous"])
	}
}

func TestHealthUsesShopifyShopEndpoint(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/shop.json":
			if got := r.Header.Get("X-Shopify-Access-Token"); got != "shopify-token" {
				http.Error(w, "missing token", http.StatusUnauthorized)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"shop":{"id":123,"name":"MoonSleep","email":"ops@moonsleep.co","domain":"moonsleep.co","myshopify_domain":"moonsleepco.myshopify.com","primary_domain":{"host":"moonsleep.co"}}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	state := &shopifyState{
		ConnectionID: "shopify-primary",
		ShopDomain:   strings.TrimPrefix(server.URL, "https://"),
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		APIVersion:   "2026-01",
	}

	shopifyHTTPClient = server.Client()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	shop, err := fetchShopInfo(ctx, state)
	if err != nil {
		t.Fatalf("fetchShopInfo: %v", err)
	}
	if shop.ID != 123 || shop.Name != "MoonSleep" {
		t.Fatalf("unexpected shop: %#v", shop)
	}
}

func TestShopifyQueryShopMethod(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)

	var capturedQuery string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/graphql.json":
			if got := r.Header.Get("X-Shopify-Access-Token"); got != "shopify-token" {
				http.Error(w, "missing token", http.StatusUnauthorized)
				return
			}
			var payload struct {
				Query string `json:"query"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			capturedQuery = payload.Query
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":{"shop":{"id":"gid://shopify/Shop/1","name":"MoonSleep","myshopifyDomain":"moonsleepco.myshopify.com"}},"extensions":{"cost":{"actualQueryCost":1}}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	shopifyHTTPClient = server.Client()
	method := declaredShopifyMethods()["shopify.query.shop"]
	result, err := method.Handler(nexadapter.AdapterContext[struct{}]{
		Context:      context.Background(),
		ConnectionID: "shopify-primary",
		Runtime:      shopifyRuntimeContextForServer(server.URL),
	}, nexadapter.AdapterMethodRequest{
		ConnectionID: "shopify-primary",
		Payload:      map[string]any{},
	})
	if err != nil {
		t.Fatalf("shop method: %v", err)
	}
	if !strings.Contains(capturedQuery, "shop {") {
		t.Fatalf("captured query = %q", capturedQuery)
	}
	response, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("unexpected result type %T", result)
	}
	if response["data"] == nil {
		t.Fatalf("expected data in response: %#v", response)
	}
}

func TestShopifyQueryOrdersMethod(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)

	var capturedQuery string
	var capturedVariables map[string]any
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/graphql.json":
			if got := r.Header.Get("X-Shopify-Access-Token"); got != "shopify-token" {
				http.Error(w, "missing token", http.StatusUnauthorized)
				return
			}
			var payload struct {
				Query     string         `json:"query"`
				Variables map[string]any `json:"variables"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			capturedQuery = payload.Query
			capturedVariables = payload.Variables
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":{"orders":{"edges":[{"cursor":"abc","node":{"id":"gid://shopify/Order/1","name":"#1001","createdAt":"2026-04-01T00:00:00Z","updatedAt":"2026-04-01T00:10:00Z"}}],"pageInfo":{"hasNextPage":false,"hasPreviousPage":false,"startCursor":"abc","endCursor":"abc"}}},"extensions":{"cost":{"actualQueryCost":4}}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	shopifyHTTPClient = server.Client()
	method := declaredShopifyMethods()["shopify.query.orders"]
	result, err := method.Handler(nexadapter.AdapterContext[struct{}]{
		Context:      context.Background(),
		ConnectionID: "shopify-primary",
		Runtime:      shopifyRuntimeContextForServer(server.URL),
	}, nexadapter.AdapterMethodRequest{
		ConnectionID: "shopify-primary",
		Payload: map[string]any{
			"first":   float64(2),
			"query":   "updated_at:>=2026-04-01",
			"reverse": true,
		},
	})
	if err != nil {
		t.Fatalf("orders method: %v", err)
	}
	if !strings.Contains(capturedQuery, "orders(") {
		t.Fatalf("captured query = %q", capturedQuery)
	}
	if got, ok := capturedVariables["first"].(float64); !ok || got != 2 {
		t.Fatalf("variables = %#v", capturedVariables)
	}
	if got, ok := capturedVariables["query"].(string); !ok || got != "updated_at:>=2026-04-01" {
		t.Fatalf("variables = %#v", capturedVariables)
	}
	response, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("unexpected result type %T", result)
	}
	if response["data"] == nil {
		t.Fatalf("expected data in response: %#v", response)
	}
}

func TestLoadShopifyStateFromRuntimeContext(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)

	dir := t.TempDir()
	contextPath := filepath.Join(dir, "runtime-context.json")
	payload := nexadapter.RuntimeContext{
		Platform:     platformID,
		ConnectionID: "shopify-primary",
		Credential: &nexadapter.RuntimeCredential{
			Value: "placeholder",
			Fields: map[string]string{
				"shop_domain":    "moonsleepco.myshopify.com",
				"client_id":      "client-id",
				"client_secret":  "client-secret",
				"webhook_secret": "webhook-secret",
				"api_version":    "2026-01",
			},
			Ref: "shopify/shopify-primary",
		},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal runtime context: %v", err)
	}
	if err := os.WriteFile(contextPath, raw, 0o600); err != nil {
		t.Fatalf("write runtime context: %v", err)
	}
	t.Setenv("NEXUS_ADAPTER_CONTEXT_PATH", contextPath)
	runtimeCtx, err := nexadapter.LoadRuntimeContextFromEnv()
	if err != nil {
		t.Fatalf("load runtime context: %v", err)
	}

	state, err := loadShopifyState(nexadapter.AdapterContext[struct{}]{
		ConnectionID: "shopify-primary",
		Runtime:      runtimeCtx,
	})
	if err != nil {
		t.Fatalf("loadShopifyState: %v", err)
	}
	if state.ShopDomain != "moonsleepco.myshopify.com" {
		t.Fatalf("unexpected shop domain: %q", state.ShopDomain)
	}
	if state.CredentialRef != "shopify/shopify-primary" {
		t.Fatalf("unexpected credential ref: %q", state.CredentialRef)
	}
}

func TestShopifyMonitorStateRoundTrip(t *testing.T) {
	tempDir := t.TempDir()
	t.Setenv("NEXUS_ADAPTER_STATE_DIR", tempDir)

	state := defaultShopifyMonitorState()
	pollTime := mustParseRFC3339(t, "2026-04-07T10:00:00Z")
	state.family(shopifyMonitorFamilyOrder).advance(pollTime, shopifyMonitorTuple{
		CursorAt:   mustParseRFC3339(t, "2026-04-07T09:59:30Z"),
		ProviderID: "101",
	})

	if err := saveShopifyMonitorState("shopify-primary", state); err != nil {
		t.Fatalf("saveShopifyMonitorState: %v", err)
	}

	loaded, err := loadShopifyMonitorState("shopify-primary")
	if err != nil {
		t.Fatalf("loadShopifyMonitorState: %v", err)
	}

	orderState := loaded.family(shopifyMonitorFamilyOrder)
	if got := orderState.CursorAt.UTC().Format(time.RFC3339); got != "2026-04-07T09:59:30Z" {
		t.Fatalf("unexpected cursor_at: %s", got)
	}
	if got := orderState.LastPollAt.UTC().Format(time.RFC3339); got != "2026-04-07T10:00:00Z" {
		t.Fatalf("unexpected last_poll_at: %s", got)
	}
}

func TestShopifyRevisionStoreRoundTrip(t *testing.T) {
	t.Setenv("NEXUS_ADAPTER_STATE_DIR", t.TempDir())

	store, err := openShopifyRevisionStore("shopify-primary")
	if err != nil {
		t.Fatalf("openShopifyRevisionStore: %v", err)
	}
	defer func() {
		if err := store.Close(); err != nil {
			t.Fatalf("close revision store: %v", err)
		}
	}()

	duplicate, err := store.IsDuplicateRevision(shopifyMonitorFamilyOrder, "moonsleep:101", "rev-1")
	if err != nil {
		t.Fatalf("IsDuplicateRevision before insert: %v", err)
	}
	if duplicate {
		t.Fatalf("unexpected duplicate before insert")
	}

	if err := store.PutRevision(shopifyMonitorFamilyOrder, "moonsleep:101", "rev-1"); err != nil {
		t.Fatalf("PutRevision: %v", err)
	}

	duplicate, err = store.IsDuplicateRevision(shopifyMonitorFamilyOrder, "moonsleep:101", "rev-1")
	if err != nil {
		t.Fatalf("IsDuplicateRevision after insert: %v", err)
	}
	if !duplicate {
		t.Fatalf("expected duplicate after insert")
	}

	duplicate, err = store.IsDuplicateRevision(shopifyMonitorFamilyOrder, "moonsleep:101", "rev-2")
	if err != nil {
		t.Fatalf("IsDuplicateRevision with new revision: %v", err)
	}
	if duplicate {
		t.Fatalf("expected new revision to stay emit-worthy")
	}
}

func TestRunShopifyMonitorCycleUsesOrderWatermark(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)
	t.Setenv("NEXUS_ADAPTER_STATE_DIR", t.TempDir())

	orderSince := make([]string, 0, 2)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/orders.json":
			orderSince = append(orderSince, r.URL.Query().Get("updated_at_min"))
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"orders":[{"id":101,"order_number":12,"name":"#101","created_at":"2026-04-07T09:58:00Z","updated_at":"2026-04-07T10:00:30Z","processed_at":"2026-04-07T10:00:30Z","currency":"USD","total_price":"129.00","subtotal_price":"129.00","financial_status":"paid","source_name":"web","line_items":[{"id":501,"product_id":99,"variant_id":199,"title":"Body Pillow","quantity":2,"price":"64.50"}]}]}`))
		case "/admin/api/2026-01/locations.json":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"locations":[{"id":99,"name":"Warehouse","admin_graphql_api_id":"gid://shopify/Location/99"}]}`))
		case "/admin/api/2026-01/inventory_levels.json":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"inventory_levels":[]}`))
		case "/admin/api/2026-01/graphql.json":
			var payload struct {
				Query         string `json:"query"`
				OperationName string `json:"operationName"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			switch {
			case payload.OperationName == inventoryHotGraphQLOpName:
				_, _ = w.Write([]byte(`{"data":{"nodes":[]}}`))
			case strings.Contains(payload.Query, "customers("):
				_, _ = w.Write([]byte(`{"data":{"customers":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "products("):
				_, _ = w.Write([]byte(`{"data":{"products":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "collections("):
				_, _ = w.Write([]byte(`{"data":{"collections":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "inventoryItems("):
				_, _ = w.Write([]byte(`{"data":{"inventoryItems":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "fulfillmentOrders("):
				_, _ = w.Write([]byte(`{"data":{"fulfillmentOrders":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "codeDiscountNodes("):
				_, _ = w.Write([]byte(`{"data":{"codeDiscountNodes":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "automaticDiscountNodes("):
				_, _ = w.Write([]byte(`{"data":{"automaticDiscountNodes":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "marketingActivities("):
				_, _ = w.Write([]byte(`{"data":{"marketingActivities":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			default:
				http.NotFound(w, r)
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	shopifyHTTPClient = server.Client()
	state := &shopifyState{
		ConnectionID: "shopify-primary",
		ShopDomain:   strings.TrimPrefix(server.URL, "https://"),
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		APIVersion:   "2026-01",
	}
	monitorState := defaultShopifyMonitorState()
	revisionStore, err := openShopifyRevisionStore("shopify-primary")
	if err != nil {
		t.Fatalf("openShopifyRevisionStore: %v", err)
	}
	defer func() {
		if err := revisionStore.Close(); err != nil {
			t.Fatalf("close revision store: %v", err)
		}
	}()
	emitted := make([]nexadapter.AdapterInboundRecord, 0, 4)
	emit := func(record any) {
		inbound, ok := record.(nexadapter.AdapterInboundRecord)
		if ok {
			emitted = append(emitted, inbound)
		}
	}

	firstPoll := mustParseRFC3339(t, "2026-04-07T10:01:00Z")
	first := runShopifyMonitorCycle(context.Background(), state, monitorState, revisionStore, firstPoll, emit)
	if len(first.FailedFamilies) != 0 {
		t.Fatalf("unexpected failures: %#v", first.FailedFamilies)
	}
	if len(emitted) != 2 {
		t.Fatalf("expected order + line item, got %d", len(emitted))
	}
	if got := monitorState.family(shopifyMonitorFamilyOrder).CursorAt.UTC().Format(time.RFC3339); got != "2026-04-07T10:00:30Z" {
		t.Fatalf("unexpected order cursor after first cycle: %s", got)
	}

	emitted = emitted[:0]
	secondPoll := mustParseRFC3339(t, "2026-04-07T10:04:00Z")
	second := runShopifyMonitorCycle(context.Background(), state, monitorState, revisionStore, secondPoll, emit)
	if len(second.FailedFamilies) != 0 {
		t.Fatalf("unexpected failures on second cycle: %#v", second.FailedFamilies)
	}
	if len(emitted) != 0 {
		t.Fatalf("expected duplicate order to be skipped on second cycle, got %d records", len(emitted))
	}

	emitted = emitted[:0]
	thirdPoll := mustParseRFC3339(t, "2026-04-07T10:07:00Z")
	third := runShopifyMonitorCycle(context.Background(), state, monitorState, revisionStore, thirdPoll, emit)
	if len(third.FailedFamilies) != 0 {
		t.Fatalf("unexpected failures on third cycle: %#v", third.FailedFamilies)
	}
	if len(emitted) != 0 {
		t.Fatalf("expected duplicate order to be skipped on third cycle, got %d records", len(emitted))
	}
	if len(orderSince) < 3 {
		t.Fatalf("expected three order reads, got %#v", orderSince)
	}
	if orderSince[0] == orderSince[1] {
		t.Fatalf("expected first incremental overlap query to tighten after the first seen order, got %#v", orderSince)
	}
	if orderSince[1] != orderSince[2] {
		t.Fatalf("expected stable overlap query when no newer orders arrive, got %#v", orderSince)
	}
}

func TestShopifyFamilyStateSinceFallsBackToLastPollAt(t *testing.T) {
	state := &shopifyFamilyState{
		LastPollAt: mustParseRFC3339(t, "2026-04-07T10:00:00Z"),
	}
	now := mustParseRFC3339(t, "2026-04-07T10:30:00Z")

	got := state.since(now, 2*time.Minute)
	if got.UTC().Format(time.RFC3339) != "2026-04-07T09:58:00Z" {
		t.Fatalf("expected last_poll_at overlap fallback, got %s", got.UTC().Format(time.RFC3339))
	}

	state.CursorAt = mustParseRFC3339(t, "2026-04-07T10:20:00Z")
	got = state.since(now, 2*time.Minute)
	if got.UTC().Format(time.RFC3339) != "2026-04-07T10:18:00Z" {
		t.Fatalf("expected cursor_at to win over last_poll_at, got %s", got.UTC().Format(time.RFC3339))
	}
}

func TestRunShopifyMonitorCycleSuppressesDuplicateLineItemRevision(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)
	t.Setenv("NEXUS_ADAPTER_STATE_DIR", t.TempDir())

	orderReads := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/orders.json":
			orderReads++
			w.Header().Set("Content-Type", "application/json")
			updatedAt := "2026-04-07T10:00:30Z"
			if orderReads > 1 {
				updatedAt = "2026-04-07T10:03:30Z"
			}
			_, _ = w.Write([]byte(`{"orders":[{"id":101,"order_number":12,"name":"#101","created_at":"2026-04-07T09:58:00Z","updated_at":"` + updatedAt + `","processed_at":"2026-04-07T10:00:30Z","currency":"USD","total_price":"129.00","subtotal_price":"129.00","financial_status":"paid","source_name":"web","line_items":[{"id":501,"product_id":99,"variant_id":199,"title":"Body Pillow","quantity":2,"price":"64.50"}]}]}`))
		case "/admin/api/2026-01/locations.json":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"locations":[{"id":99,"name":"Warehouse","admin_graphql_api_id":"gid://shopify/Location/99"}]}`))
		case "/admin/api/2026-01/inventory_levels.json":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"inventory_levels":[]}`))
		case "/admin/api/2026-01/graphql.json":
			var payload struct {
				Query         string `json:"query"`
				OperationName string `json:"operationName"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			switch {
			case payload.OperationName == inventoryHotGraphQLOpName:
				_, _ = w.Write([]byte(`{"data":{"nodes":[]}}`))
			case strings.Contains(payload.Query, "customers("):
				_, _ = w.Write([]byte(`{"data":{"customers":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "products("):
				_, _ = w.Write([]byte(`{"data":{"products":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "collections("):
				_, _ = w.Write([]byte(`{"data":{"collections":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "inventoryItems("):
				_, _ = w.Write([]byte(`{"data":{"inventoryItems":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "fulfillmentOrders("):
				_, _ = w.Write([]byte(`{"data":{"fulfillmentOrders":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "codeDiscountNodes("):
				_, _ = w.Write([]byte(`{"data":{"codeDiscountNodes":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "automaticDiscountNodes("):
				_, _ = w.Write([]byte(`{"data":{"automaticDiscountNodes":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "marketingActivities("):
				_, _ = w.Write([]byte(`{"data":{"marketingActivities":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			default:
				http.NotFound(w, r)
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	shopifyHTTPClient = server.Client()
	state := &shopifyState{
		ConnectionID: "shopify-primary",
		ShopDomain:   strings.TrimPrefix(server.URL, "https://"),
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		APIVersion:   "2026-01",
	}
	monitorState := defaultShopifyMonitorState()
	revisionStore, err := openShopifyRevisionStore("shopify-primary")
	if err != nil {
		t.Fatalf("openShopifyRevisionStore: %v", err)
	}
	defer func() {
		if err := revisionStore.Close(); err != nil {
			t.Fatalf("close revision store: %v", err)
		}
	}()

	emitted := make([]nexadapter.AdapterInboundRecord, 0, 4)
	emit := func(record any) {
		inbound, ok := record.(nexadapter.AdapterInboundRecord)
		if ok {
			emitted = append(emitted, inbound)
		}
	}

	firstPoll := mustParseRFC3339(t, "2026-04-07T10:01:00Z")
	first := runShopifyMonitorCycle(context.Background(), state, monitorState, revisionStore, firstPoll, emit)
	if len(first.FailedFamilies) != 0 {
		t.Fatalf("unexpected failures on first cycle: %#v", first.FailedFamilies)
	}
	if len(emitted) != 2 {
		t.Fatalf("expected first cycle to emit order + line item, got %d", len(emitted))
	}

	emitted = emitted[:0]
	secondPoll := mustParseRFC3339(t, "2026-04-07T10:04:00Z")
	second := runShopifyMonitorCycle(context.Background(), state, monitorState, revisionStore, secondPoll, emit)
	if len(second.FailedFamilies) != 0 {
		t.Fatalf("unexpected failures on second cycle: %#v", second.FailedFamilies)
	}
	if len(emitted) != 1 {
		t.Fatalf("expected second cycle to emit only the order revision, got %d records", len(emitted))
	}
	if got := emitted[0].Routing.ContainerID; got != "order" {
		t.Fatalf("expected surviving record to be order, got %q", got)
	}

	lineItemMetrics := monitorState.metrics(shopifyMonitorFamilyLineItem)
	if lineItemMetrics.LastSuppressed != 1 {
		t.Fatalf("expected one suppressed line_item revision, got %#v", lineItemMetrics)
	}
	orderMetrics := monitorState.metrics(shopifyMonitorFamilyOrder)
	if orderMetrics.LastEmitted != 1 {
		t.Fatalf("expected one emitted order revision, got %#v", orderMetrics)
	}
}

func TestPollShopifyInventoryUsesInventoryLevelsHotLane(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)

	var seenLocationsPath int
	var seenInventoryLevelsQuery url.Values
	var seenNodeIDs []any

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/locations.json":
			seenLocationsPath++
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"locations":[{"id":99,"name":"Warehouse","admin_graphql_api_id":"gid://shopify/Location/99"}]}`))
		case "/admin/api/2026-01/inventory_levels.json":
			seenInventoryLevelsQuery = r.URL.Query()
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"inventory_levels":[{"inventory_item_id":77,"location_id":99,"available":1,"updated_at":"2026-04-07T10:00:30Z","admin_graphql_api_id":"gid://shopify/InventoryLevel/88?inventory_item_id=77"}]}`))
		case "/admin/api/2026-01/graphql.json":
			var payload struct {
				Query         string         `json:"query"`
				Variables     map[string]any `json:"variables"`
				OperationName string         `json:"operationName"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			switch {
			case payload.OperationName == inventoryHotGraphQLOpName:
				if raw, ok := payload.Variables["ids"].([]any); ok {
					seenNodeIDs = raw
				}
				_, _ = w.Write([]byte(`{"data":{"nodes":[{"id":"gid://shopify/InventoryItem/77","sku":"proof-sku","updatedAt":"2026-04-07T10:00:00Z","tracked":true,"inventoryLevels":{"edges":[{"node":{"id":"gid://shopify/InventoryLevel/88?inventory_item_id=77","updatedAt":"2026-04-07T10:00:30Z","location":{"id":"gid://shopify/Location/99","name":"Warehouse"},"quantities":[{"name":"available","quantity":1}]}}]}}]}}`))
			default:
				http.NotFound(w, r)
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	shopifyHTTPClient = server.Client()
	state := &shopifyState{
		ConnectionID: "shopify-primary",
		ShopDomain:   strings.TrimPrefix(server.URL, "https://"),
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		APIVersion:   "2026-01",
	}
	emitted := make([]nexadapter.AdapterInboundRecord, 0, 2)
	emit := func(record any) {
		inbound, ok := record.(nexadapter.AdapterInboundRecord)
		if ok {
			emitted = append(emitted, inbound)
		}
	}

	latest, err := pollShopifyInventory(context.Background(), state, shopifyMonitorTuple{}, mustParseRFC3339(t, "2026-04-07T09:58:00Z"), emit)
	if err != nil {
		t.Fatalf("pollShopifyInventory: %v", err)
	}
	if seenLocationsPath != 1 {
		t.Fatalf("expected one locations lookup, got %d", seenLocationsPath)
	}
	if got := seenInventoryLevelsQuery.Get("location_ids"); got != "99" {
		t.Fatalf("unexpected inventory level location_ids query: %q", got)
	}
	if got := seenInventoryLevelsQuery.Get("updated_at_min"); got != "2026-04-07T09:58:00Z" {
		t.Fatalf("unexpected inventory level updated_at_min query: %q", got)
	}
	if len(seenNodeIDs) != 1 || seenNodeIDs[0] != "gid://shopify/InventoryItem/77" {
		t.Fatalf("unexpected inventory hot node ids: %#v", seenNodeIDs)
	}
	if len(emitted) != 1 {
		t.Fatalf("expected one inventory record, got %d", len(emitted))
	}
	if emitted[0].Routing.ContainerID != "inventory" {
		t.Fatalf("unexpected inventory container id: %q", emitted[0].Routing.ContainerID)
	}
	if got := latest.CursorAt.UTC().Format(time.RFC3339); got != "2026-04-07T10:00:30Z" {
		t.Fatalf("unexpected inventory latest cursor: %s", got)
	}
	if got := latest.ProviderID; got != "77:99" {
		t.Fatalf("unexpected inventory latest provider id: %q", got)
	}
}

func shopifyRuntimeContextForServer(serverURL string) *nexadapter.RuntimeContext {
	return &nexadapter.RuntimeContext{
		Platform:     platformID,
		ConnectionID: "shopify-primary",
		Credential: &nexadapter.RuntimeCredential{
			Value: "placeholder",
			Fields: map[string]string{
				"shop_domain":   strings.TrimPrefix(serverURL, "https://"),
				"client_id":     "client-id",
				"client_secret": "client-secret",
				"api_version":   "2026-01",
			},
			Ref: "shopify/shopify-primary",
		},
	}
}

func TestStageBackfillWritesManifestAndChunks(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/orders.json":
			if got := r.Header.Get("X-Shopify-Access-Token"); got != "shopify-token" {
				http.Error(w, "missing token", http.StatusUnauthorized)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"orders":[{"id":101,"order_number":12,"name":"#101","created_at":"2026-03-31T10:00:00Z","updated_at":"2026-03-31T10:05:00Z","processed_at":"2026-03-31T10:04:00Z","currency":"USD","total_price":"129.00","subtotal_price":"129.00","financial_status":"paid","source_name":"web","line_items":[{"id":501,"product_id":99,"variant_id":199,"title":"Body Pillow","quantity":2,"price":"64.50"}]}]}`))
		case "/admin/api/2026-01/graphql.json":
			var payload struct {
				Query string `json:"query"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			switch {
			case strings.Contains(payload.Query, "customers("):
				_, _ = w.Write([]byte(`{"data":{"customers":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "products("):
				_, _ = w.Write([]byte(`{"data":{"products":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "collections("):
				_, _ = w.Write([]byte(`{"data":{"collections":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "inventoryItems("):
				_, _ = w.Write([]byte(`{"data":{"inventoryItems":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "fulfillmentOrders("):
				_, _ = w.Write([]byte(`{"data":{"fulfillmentOrders":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "codeDiscountNodes("):
				_, _ = w.Write([]byte(`{"data":{"codeDiscountNodes":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "automaticDiscountNodes("):
				_, _ = w.Write([]byte(`{"data":{"automaticDiscountNodes":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "marketingActivities("):
				_, _ = w.Write([]byte(`{"data":{"marketingActivities":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			default:
				http.NotFound(w, r)
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	shopifyHTTPClient = server.Client()
	stageDir := t.TempDir()
	runtimeCtx := &nexadapter.RuntimeContext{
		Platform:     platformID,
		ConnectionID: "shopify-primary",
		Credential: &nexadapter.RuntimeCredential{
			Value: "placeholder",
			Fields: map[string]string{
				"shop_domain":   strings.TrimPrefix(server.URL, "https://"),
				"client_id":     "client-id",
				"client_secret": "client-secret",
				"api_version":   "2026-01",
			},
			Ref: "shopify/shopify-primary",
		},
	}

	result, err := stageBackfill(nexadapter.AdapterContext[struct{}]{
		Context:      context.Background(),
		ConnectionID: "shopify-primary",
		Runtime:      runtimeCtx,
	}, map[string]any{
		"since":     "2026-03-01T00:00:00Z",
		"stage_dir": stageDir,
	})
	if err != nil {
		t.Fatalf("stageBackfill: %v", err)
	}

	manifest, ok := result.(*stagedBackfillManifest)
	if !ok {
		t.Fatalf("unexpected manifest type: %T", result)
	}
	if manifest.Totals.Records != 2 {
		t.Fatalf("unexpected record total: %d", manifest.Totals.Records)
	}
	if len(manifest.Chunks) != 1 {
		t.Fatalf("unexpected chunk count: %d", len(manifest.Chunks))
	}
	if manifest.Chunks[0].Records != 2 {
		t.Fatalf("unexpected chunk record count: %d", manifest.Chunks[0].Records)
	}
	if _, err := os.Stat(manifest.ManifestPath); err != nil {
		t.Fatalf("manifest path missing: %v", err)
	}
	rawChunk, err := os.ReadFile(manifest.Chunks[0].Path)
	if err != nil {
		t.Fatalf("read chunk: %v", err)
	}
	if got := strings.Count(strings.TrimSpace(string(rawChunk)), "\n") + 1; got != 2 {
		t.Fatalf("unexpected staged chunk rows: %d", got)
	}
}

func resetShopifyGlobals() {
	shopifyHTTPClient = &http.Client{Timeout: defaultHTTPTimeout}
	tokenCache = nil
	resetShopifyInventoryLocationCache()
}
