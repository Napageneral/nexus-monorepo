package main

import (
	"context"
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
