//go:build live_shopify

package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"strconv"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestLiveShopifyCustomerAndOrderSourceFidelity(t *testing.T) {
	shopDomain := os.Getenv("SHOPIFY_SHOP_DOMAIN")
	clientID := os.Getenv("SHOPIFY_CLIENT_ID")
	clientSecret := os.Getenv("SHOPIFY_CLIENT_SECRET")
	if shopDomain == "" || clientID == "" || clientSecret == "" {
		t.Skip("MoonSleep Shopify read credentials are not configured")
	}

	since := time.Now().UTC().Add(-24 * time.Hour)
	if raw := os.Getenv("SHOPIFY_LIVE_SINCE"); raw != "" {
		parsed, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			t.Fatalf("parse SHOPIFY_LIVE_SINCE: %v", err)
		}
		since = parsed.UTC()
	}

	state := &shopifyState{
		ConnectionID: "shopify-live-source-fidelity",
		ShopDomain:   shopDomain,
		ClientID:     clientID,
		ClientSecret: clientSecret,
		APIVersion:   defaultAPIVersion,
	}
	tokenCache = nil

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	orders, orderSource, _, err := fetchOrdersSince(ctx, state, since, false)
	if err != nil {
		t.Fatalf("fetch live orders: %v", err)
	}
	customers, customerSource, _, err := fetchCustomersSince(ctx, state, since, shopifySyncModeBackfill)
	if err != nil {
		t.Fatalf("fetch live customers: %v", err)
	}

	assertMinimumLiveRows(t, "orders", len(orders), os.Getenv("SHOPIFY_LIVE_EXPECTED_MIN_ORDERS"))
	assertMinimumLiveRows(t, "customers", len(customers), os.Getenv("SHOPIFY_LIVE_EXPECTED_MIN_CUSTOMERS"))

	orderHash := sha256.New()
	for _, order := range orders {
		if !json.Valid(order.rawProviderJSON) || order.rawProviderPayload == nil {
			t.Fatal("live order lost its source object before typed projection")
		}
		record := buildOrderRecord(state, order, orderSource)
		if record.Operation != "record.ingest" || record.Payload.Payload == nil {
			t.Fatal("live order did not produce a payload-bearing record")
		}
		_, _ = orderHash.Write(order.rawProviderJSON)
	}

	customerHash := sha256.New()
	for _, customer := range customers {
		if !json.Valid(customer.rawProviderJSON) || customer.rawProviderPayload == nil {
			t.Fatal("live customer lost its source object before typed projection")
		}
		record := buildCustomerRecord(state, customer, customerSource)
		if record.Operation != "record.ingest" || record.Payload.Payload == nil {
			t.Fatal("live customer did not produce a payload-bearing record")
		}
		_, _ = customerHash.Write(customer.rawProviderJSON)
	}

	t.Logf("live source-fidelity PASS since=%s orders=%d order_aggregate_sha256=%s customers=%d customer_aggregate_sha256=%s",
		since.Format(time.RFC3339),
		len(orders), hex.EncodeToString(orderHash.Sum(nil)),
		len(customers), hex.EncodeToString(customerHash.Sum(nil)),
	)
}

func TestLiveShopifyCustomerOrderPageStaging(t *testing.T) {
	shopDomain := os.Getenv("SHOPIFY_SHOP_DOMAIN")
	clientID := os.Getenv("SHOPIFY_CLIENT_ID")
	clientSecret := os.Getenv("SHOPIFY_CLIENT_SECRET")
	if shopDomain == "" || clientID == "" || clientSecret == "" {
		t.Skip("MoonSleep Shopify read credentials are not configured")
	}
	since := time.Now().UTC().Add(-24 * time.Hour)
	if raw := os.Getenv("SHOPIFY_LIVE_SINCE"); raw != "" {
		parsed, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			t.Fatalf("parse SHOPIFY_LIVE_SINCE: %v", err)
		}
		since = parsed.UTC()
	}
	stageDir := t.TempDir()
	if err := os.Chmod(stageDir, 0o700); err != nil {
		t.Fatal(err)
	}
	runtimeContext := &nexadapter.RuntimeContext{
		Platform:     platformID,
		ConnectionID: "shopify-live-page-staging",
		Credential: &nexadapter.RuntimeCredential{
			Value: "runtime-fields",
			Fields: map[string]string{
				"shop_domain":   shopDomain,
				"client_id":     clientID,
				"client_secret": clientSecret,
				"api_version":   defaultAPIVersion,
			},
		},
	}
	tokenCache = nil
	result, err := stageCustomerOrderBackfill(nexadapter.AdapterContext[struct{}]{
		Context:      context.Background(),
		ConnectionID: runtimeContext.ConnectionID,
		Runtime:      runtimeContext,
	}, map[string]any{
		"since":     since.Format(time.RFC3339),
		"stage_dir": stageDir,
	})
	if err != nil {
		t.Fatalf("live customer/order page staging: %v", err)
	}
	manifest, ok := result.(*customerOrderBackfillManifest)
	if !ok || manifest.State != "succeeded" || len(manifest.Pages) < 2 {
		t.Fatalf("unexpected live page-staging manifest: %#v", result)
	}
	if manifest.Totals.OrderSourceRows == 0 || manifest.Totals.CustomerSourceRows == 0 || manifest.Totals.Records == 0 {
		t.Fatalf("unexpected empty live page-staging totals: %#v", manifest.Totals)
	}
	t.Logf("live resumable page staging PASS since=%s pages=%d order_source_rows=%d customer_source_rows=%d records=%d",
		since.Format(time.RFC3339), len(manifest.Pages), manifest.Totals.OrderSourceRows, manifest.Totals.CustomerSourceRows, manifest.Totals.Records)
}

func assertMinimumLiveRows(t *testing.T, family string, actual int, rawMinimum string) {
	t.Helper()
	if rawMinimum == "" {
		return
	}
	minimum, err := strconv.Atoi(rawMinimum)
	if err != nil || minimum < 0 {
		t.Fatalf("invalid minimum for %s: %q", family, rawMinimum)
	}
	if actual < minimum {
		t.Fatalf("incomplete %s fetch: got %d, expected at least %d", family, actual, minimum)
	}
}
