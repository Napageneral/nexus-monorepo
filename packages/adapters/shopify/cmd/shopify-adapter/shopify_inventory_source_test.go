package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestCaptureShopifyInventoryPageIsOneProviderPageAndExact(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)
	requests := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/admin/oauth/access_token":
			_, _ = response.Write([]byte(`{"access_token":"token"}`))
		case "/admin/api/2026-01/graphql.json":
			requests++
			var payload struct {
				Variables map[string]any `json:"variables"`
			}
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
				http.Error(response, err.Error(), http.StatusBadRequest)
				return
			}
			if payload.Variables["first"] != float64(100) {
				http.Error(response, "wrong page size", http.StatusBadRequest)
				return
			}
			_, _ = response.Write([]byte(`{"data":{"inventoryItems":{"edges":[{"cursor":"inventory-1","node":{"id":"gid://shopify/InventoryItem/900719925474099312345","sku":"MOON-1","updatedAt":"2026-07-22T11:00:00Z","tracked":true,"inventoryLevels":{"edges":[{"node":{"id":"gid://shopify/InventoryLevel/2","updatedAt":"2026-07-22T11:01:00Z","location":{"id":"gid://shopify/Location/3","name":"Borden"},"quantities":[{"name":"available","quantity":7}]}}]}}}],"pageInfo":{"hasNextPage":true,"endCursor":"inventory-next"}}}}`))
		default:
			http.NotFound(response, request)
		}
	}))
	defer server.Close()
	shopifyHTTPClient = server.Client()
	state := &shopifyState{
		ConnectionID: "shopify-primary",
		ShopDomain:   strings.TrimPrefix(server.URL, "https://"),
		ClientID:     "client", ClientSecret: "secret", APIVersion: "2026-01",
	}
	records, next, complete, err := captureShopifyInventoryPage(
		context.Background(), state,
		time.Date(2026, 7, 22, 10, 0, 0, 0, time.UTC),
		time.Date(2026, 7, 22, 12, 0, 0, 0, time.UTC),
		"", false,
	)
	if err != nil {
		t.Fatal(err)
	}
	if requests != 1 || len(records) != 1 || next != "inventory-next" || complete {
		t.Fatalf("requests=%d records=%d next=%q complete=%v", requests, len(records), next, complete)
	}
	payloadJSON, _ := records[0].Payload.Payload["provider_object_json"].(string)
	if !strings.Contains(payloadJSON, `"id":"gid://shopify/InventoryItem/900719925474099312345"`) {
		t.Fatalf("exact provider inventory object missing: %q", payloadJSON)
	}
	if _, present := records[0].Payload.Metadata["raw_provider_payload"]; present {
		t.Fatal("provider object leaked into Nex control metadata")
	}
}

func TestCaptureShopifyInventoryReconcileIncludesUnchangedRows(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/admin/oauth/access_token":
			_, _ = response.Write([]byte(`{"access_token":"token"}`))
		case "/admin/api/2026-01/graphql.json":
			_, _ = response.Write([]byte(`{"data":{"inventoryItems":{"edges":[{"cursor":"inventory-1","node":{"id":"gid://shopify/InventoryItem/1","sku":"MOON-1","updatedAt":"2020-01-01T00:00:00Z","tracked":true,"inventoryLevels":{"edges":[{"node":{"id":"gid://shopify/InventoryLevel/2","updatedAt":"2020-01-01T00:00:00Z","location":{"id":"gid://shopify/Location/3","name":"Borden"},"quantities":[{"name":"available","quantity":7}]}}]}}}],"pageInfo":{"hasNextPage":false,"endCursor":"inventory-1"}}}}`))
		}
	}))
	defer server.Close()
	shopifyHTTPClient = server.Client()
	state := &shopifyState{ConnectionID: "shopify-primary", ShopDomain: strings.TrimPrefix(server.URL, "https://"), ClientID: "client", ClientSecret: "secret", APIVersion: "2026-01"}
	records, _, complete, err := captureShopifyInventoryPage(context.Background(), state, time.Now().Add(-time.Minute), time.Now(), "", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 1 || !complete {
		t.Fatalf("reconcile records=%d complete=%v", len(records), complete)
	}
}
