package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
	if record.Routing.Adapter != platformID {
		t.Fatalf("unexpected adapter id: %q", record.Routing.Adapter)
	}
	if record.Routing.ContainerID != "order" {
		t.Fatalf("unexpected container id: %q", record.Routing.ContainerID)
	}
	if record.Payload.ExternalRecordID != "order:101" {
		t.Fatalf("unexpected external record id: %q", record.Payload.ExternalRecordID)
	}
	if record.Payload.SourceRecordType == nil || *record.Payload.SourceRecordType != "shopify.order" {
		t.Fatalf("source_record_type: %#v", record.Payload.SourceRecordType)
	}
	if record.Routing.ProviderAccountRef == nil || *record.Routing.ProviderAccountRef != "moonsleepco.myshopify.com" {
		t.Fatalf("provider_account_ref: %#v", record.Routing.ProviderAccountRef)
	}
	if record.Payload.ProviderVersionRef != nil {
		t.Fatalf("provider_version_ref must not reuse snapshot fingerprint: %#v", record.Payload.ProviderVersionRef)
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

func TestBuildOrderRecordUsesUpdatedAtForRevisionFreshness(t *testing.T) {
	record := buildOrderRecord(
		&shopifyState{
			ConnectionID: "shopify-primary",
			ShopDomain:   "moonsleepco.myshopify.com",
		},
		shopifyOrder{
			ID:          101,
			Name:        "#101",
			CreatedAt:   "2026-07-30T21:30:49-05:00",
			ProcessedAt: "2026-07-30T21:30:44-05:00",
			UpdatedAt:   "2026-09-01T13:04:08-05:00",
		},
		shopifySourceRequest{},
	)

	want := time.Date(2026, time.September, 1, 18, 4, 8, 0, time.UTC).UnixMilli()
	if record.Payload.Timestamp != want {
		t.Fatalf("order timestamp=%d want updated_at=%d", record.Payload.Timestamp, want)
	}
}

func TestShopifySnapshotFingerprintStoreRoundTrip(t *testing.T) {
	t.Setenv(shopifyAdapterStateDirEnv, t.TempDir())
	store, err := openShopifySnapshotFingerprintStore("shopify-primary")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.close() })
	duplicate, err := store.isDuplicate("order", "moonsleep:101", "fingerprint-1")
	if err != nil || duplicate {
		t.Fatalf("initial duplicate=%t err=%v", duplicate, err)
	}
	if err := store.put("order", "moonsleep:101", "fingerprint-1"); err != nil {
		t.Fatal(err)
	}
	duplicate, err = store.isDuplicate("order", "moonsleep:101", "fingerprint-1")
	if err != nil || !duplicate {
		t.Fatalf("stored duplicate=%t err=%v", duplicate, err)
	}
	duplicate, err = store.isDuplicate("order", "moonsleep:101", "fingerprint-2")
	if err != nil || duplicate {
		t.Fatalf("changed duplicate=%t err=%v", duplicate, err)
	}
}

func TestShopifySnapshotFingerprintStoreMigratesLegacyCheckpoint(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv(shopifyAdapterStateDirEnv, stateDir)
	dbPath := filepath.Join(stateDir, "shopify", "shopify-primary", "monitor-revisions.db")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o700); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE monitor_revisions (family TEXT NOT NULL, logical_row_id TEXT NOT NULL, revision_hash TEXT NOT NULL, updated_ts INTEGER NOT NULL, PRIMARY KEY (family, logical_row_id))`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO monitor_revisions VALUES ('order', 'moonsleep:101', 'legacy-fingerprint', 1)`); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	store, err := openShopifySnapshotFingerprintStore("shopify-primary")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.close() })
	duplicate, err := store.isDuplicate("order", "moonsleep:101", "legacy-fingerprint")
	if err != nil || !duplicate {
		t.Fatalf("migrated duplicate=%t err=%v", duplicate, err)
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
	if record.Routing.Adapter != platformID {
		t.Fatalf("unexpected adapter id: %q", record.Routing.Adapter)
	}
	if record.Payload.ExternalRecordID != "line_item:101:501" {
		t.Fatalf("unexpected external record id: %q", record.Payload.ExternalRecordID)
	}
	if record.Payload.SourceRecordType == nil || *record.Payload.SourceRecordType != "shopify.line_item" {
		t.Fatalf("source_record_type: %#v", record.Payload.SourceRecordType)
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

func TestHealthUsesMinimalShopifyGraphQLIdentity(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)
	t.Setenv(nexadapterStateDirEnvName, t.TempDir())

	var capturedQuery string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token","expires_in":86399}`))
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
			_, _ = w.Write([]byte(`{"data":{"shop":{"id":"gid://shopify/Shop/123"}}}`))
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

	trace := newShopifyHealthTrace()
	shopID, err := fetchShopHealthIdentity(withShopifyHealthTrace(ctx, trace), state)
	if err != nil {
		t.Fatalf("fetchShopHealthIdentity: %v", err)
	}
	if shopID != "gid://shopify/Shop/123" {
		t.Fatalf("unexpected shop id: %q", shopID)
	}
	if strings.TrimSpace(capturedQuery) != "query NexAdapterHealth { shop { id } }" {
		t.Fatalf("unexpected health query: %q", capturedQuery)
	}
	latency, tokenSource := trace.snapshot()
	for _, phase := range []string{
		"token",
		"governor_state",
		"governor_slot_wait",
		"governor_reservation_wait",
		"http_headers",
		"body_read_decode",
		"provider_verification_total",
	} {
		if _, ok := latency[phase]; !ok {
			t.Fatalf("missing health latency phase %q: %#v", phase, latency)
		}
	}
	if tokenSource != "oauth_exchange" {
		t.Fatalf("unexpected token source: %q", tokenSource)
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
}
