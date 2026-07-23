package main

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
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
