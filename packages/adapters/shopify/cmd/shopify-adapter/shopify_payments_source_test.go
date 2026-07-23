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

func TestCaptureShopifyPaymentsPagePreservesExactRowsAndPagination(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)
	var queries []string
	var server *httptest.Server
	server = httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/admin/api/2026-01/shopify_payments/balance/transactions.json" {
			http.NotFound(response, request)
			return
		}
		if request.Header.Get("X-Shopify-Access-Token") != "token" {
			http.Error(response, "missing token", http.StatusUnauthorized)
			return
		}
		queries = append(queries, request.URL.RawQuery)
		if request.URL.Query().Get("page_info") == "next-page" {
			_, _ = response.Write([]byte(`{"transactions":[{"id":"txn-2","processed_at":"2026-07-22T11:00:00Z","amount":"4.00","fee":"-0.10","net":"3.90"}]}`))
			return
		}
		next := server.URL + "/admin/api/2026-01/shopify_payments/balance/transactions.json?page_info=next-page&limit=100"
		response.Header().Set("Link", "<"+next+">; rel=\"next\"")
		_, _ = response.Write([]byte(`{"transactions":[{"id":900719925474099312345,"processed_at":"2026-07-22T10:00:00Z","amount":"10.00","fee":"-0.30","net":"9.70"}]}`))
	}))
	defer server.Close()
	shopifyHTTPClient = server.Client()
	state := &shopifyState{
		ConnectionID: "shopify-primary",
		ShopDomain:   strings.TrimPrefix(server.URL, "https://"),
		ClientID:     "client",
		ClientSecret: "secret",
		APIVersion:   "2026-01",
	}
	tokenCache = &shopifyTokenCache{
		ShopDomain: state.ShopDomain, ClientID: state.ClientID, ClientSecret: state.ClientSecret,
		AccessToken: "token", ExpiresAt: time.Now().Add(time.Hour),
	}
	spec := shopifyPaymentsPageRequest{
		Family: "finance.transactions", ContainerID: "balance_transaction",
		Path: "/shopify_payments/balance/transactions.json", ResponseField: "transactions",
		SinceParam: "payout_date_min", ThroughParam: "payout_date_max",
		TimestampKeys: []string{"processed_at", "payout_date"},
	}
	since := time.Date(2026, 7, 20, 0, 0, 0, 0, time.UTC)
	through := time.Date(2026, 7, 22, 12, 0, 0, 0, time.UTC)
	records, next, complete, err := captureShopifyPaymentsPage(context.Background(), state, spec, since, through, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 1 || next == "" || complete {
		t.Fatalf("first page records=%d next=%q complete=%v", len(records), next, complete)
	}
	if !strings.Contains(queries[0], "payout_date_min=2026-07-20") || !strings.Contains(queries[0], "limit=100") {
		t.Fatalf("first query = %q", queries[0])
	}
	payload := records[0].Payload.Payload
	if payload["provider_object_json"] != `{"id":900719925474099312345,"processed_at":"2026-07-22T10:00:00Z","amount":"10.00","fee":"-0.30","net":"9.70"}` {
		t.Fatalf("provider object lost exact bytes: %#v", payload)
	}
	metadata, _ := records[0].Payload.Metadata["provider_ids"].(map[string]any)
	if metadata["provider_id"] != "900719925474099312345" {
		t.Fatalf("large provider id lost precision: %#v", metadata)
	}

	records, next, complete, err = captureShopifyPaymentsPage(context.Background(), state, spec, since, through, next)
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 1 || next != "" || !complete {
		t.Fatalf("last page records=%d next=%q complete=%v", len(records), next, complete)
	}
	if queries[1] != "page_info=next-page&limit=100" {
		t.Fatalf("pagination URL drifted: %q", queries[1])
	}
}

func TestBuildShopifyPaymentsRecordRejectsMissingProviderID(t *testing.T) {
	_, err := buildShopifyPaymentsRecord(
		&shopifyState{ConnectionID: "shopify-primary", ShopDomain: "moon.myshopify.com"},
		shopifyPaymentsPageRequest{Family: "disputes.delta", ContainerID: "dispute"},
		json.RawMessage(`{"initiated_at":"2026-07-22T10:00:00Z"}`),
		shopifySourceRequest{},
	)
	if err == nil {
		t.Fatal("payments record without id was accepted")
	}
}
