package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestShopifyGovernorCapsCrossProcessSlots(t *testing.T) {
	root := t.TempDir()
	t.Setenv(nexadapter.AdapterStateDirEnvVar, root)
	dir, err := shopifyGovernorDir("shopify-production")
	if err != nil {
		t.Fatalf("governor dir: %v", err)
	}
	first, err := acquireShopifyGovernorSlot(context.Background(), dir)
	if err != nil {
		t.Fatalf("first slot: %v", err)
	}
	defer first.release()
	second, err := acquireShopifyGovernorSlot(context.Background(), dir)
	if err != nil {
		t.Fatalf("second slot: %v", err)
	}
	defer second.release()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Millisecond)
	defer cancel()
	if _, err := acquireShopifyGovernorSlot(ctx, dir); err == nil {
		t.Fatal("third concurrent Shopify request unexpectedly acquired a slot")
	}
	first.release()
	ctx, cancel = context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	third, err := acquireShopifyGovernorSlot(ctx, dir)
	if err != nil {
		t.Fatalf("third slot after release: %v", err)
	}
	third.release()
}

func TestShopifyGovernorPersists429Backoff(t *testing.T) {
	root := t.TempDir()
	t.Setenv(nexadapter.AdapterStateDirEnvVar, root)
	originalClient := shopifyHTTPClient
	defer func() { shopifyHTTPClient = originalClient }()

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Retry-After", "2")
		response.WriteHeader(http.StatusTooManyRequests)
		_, _ = response.Write([]byte(`{"errors":"slow down"}`))
	}))
	defer server.Close()
	shopifyHTTPClient = server.Client()
	state := &shopifyState{ConnectionID: "shopify-production"}
	request, err := http.NewRequestWithContext(context.Background(), http.MethodGet, server.URL, nil)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	result, err := doShopifyRequest(context.Background(), state, request)
	if err != nil {
		t.Fatalf("governed request: %v", err)
	}
	_, _ = io.Copy(io.Discard, result.Body)
	_ = result.Body.Close()

	dir, err := shopifyGovernorDir(state.ConnectionID)
	if err != nil {
		t.Fatalf("governor dir: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()
	if err := reserveShopifyRequest(ctx, dir, time.Now); err == nil {
		t.Fatal("429 backoff was not shared with the next request")
	}
}

func TestShopifyGovernorInvalidatesRejectedAccessToken(t *testing.T) {
	t.Setenv(nexadapter.AdapterStateDirEnvVar, t.TempDir())
	originalClient := shopifyHTTPClient
	defer func() { shopifyHTTPClient = originalClient }()
	state := &shopifyState{
		ConnectionID: "shopify-production",
		ShopDomain:   "moon.example.myshopify.com",
		ClientID:     "client-a",
		ClientSecret: "secret-a",
	}
	if _, err := sharedShopifyAccessToken(context.Background(), state, func(context.Context, *shopifyState) (shopifyAccessToken, error) {
		return shopifyAccessToken{Value: "rejected-token", ExpiresAt: time.Now().UTC().Add(24 * time.Hour)}, nil
	}); err != nil {
		t.Fatal(err)
	}
	cachePath, _, err := sharedShopifyTokenCachePaths(state.ConnectionID)
	if err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()
	shopifyHTTPClient = server.Client()
	request, err := http.NewRequestWithContext(context.Background(), http.MethodGet, server.URL, nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("X-Shopify-Access-Token", "rejected-token")
	response, err := doShopifyRequest(context.Background(), state, request)
	if err != nil {
		t.Fatalf("governed request: %v", err)
	}
	_ = response.Body.Close()
	if _, err := os.Stat(cachePath); !os.IsNotExist(err) {
		t.Fatalf("rejected token cache still exists: %v", err)
	}
}

func TestShopifyGovernorReservesCapacityBelowProviderLeakRate(t *testing.T) {
	root := t.TempDir()
	t.Setenv(nexadapter.AdapterStateDirEnvVar, root)
	dir, err := shopifyGovernorDir("shopify-production")
	if err != nil {
		t.Fatalf("governor dir: %v", err)
	}
	now := time.Date(2026, 7, 28, 18, 0, 0, 0, time.UTC)
	if err := reserveShopifyRequest(context.Background(), dir, func() time.Time { return now }); err != nil {
		t.Fatalf("reserve request: %v", err)
	}
	raw, err := readShopifyPrivateFile(filepath.Join(dir, "state.json"))
	if err != nil {
		t.Fatalf("read governor state: %v", err)
	}
	var state shopifyGovernorState
	if err := json.Unmarshal(raw, &state); err != nil {
		t.Fatalf("decode governor state: %v", err)
	}
	next := parseGovernorTime(state.NextRequestAt)
	if got := next.Sub(now); got != shopifyGovernorRequestSpacing {
		t.Fatalf("request spacing = %s, want %s", got, shopifyGovernorRequestSpacing)
	}
	if shopifyGovernorRequestSpacing < time.Second {
		t.Fatalf("request spacing %s does not reserve capacity below the two-per-second provider leak rate", shopifyGovernorRequestSpacing)
	}
}

func TestShopifyGovernorRecognizesRESTPressureWithoutWaitingFor429(t *testing.T) {
	response := &http.Response{Header: make(http.Header)}
	response.Header.Set("X-Shopify-Shop-Api-Call-Limit", "32/40")
	if delay := shopifyRESTPressureDelay(response); delay <= 0 {
		t.Fatal("expected proactive delay at 80 percent REST budget usage")
	}
	response.Header.Set("X-Shopify-Shop-Api-Call-Limit", "10/40")
	if delay := shopifyRESTPressureDelay(response); delay != 0 {
		t.Fatalf("unexpected low-pressure delay: %s", delay)
	}
}
