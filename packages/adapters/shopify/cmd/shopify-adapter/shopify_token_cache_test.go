package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSharedShopifyAccessTokenReusesExactCredentialBindingAcrossCalls(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv(nexadapterStateDirEnvName, stateDir)
	state := &shopifyState{
		ConnectionID: "conn-token-cache",
		ShopDomain:   "moon.example.myshopify.com",
		ClientID:     "client-a",
		ClientSecret: "secret-a",
	}
	fetches := 0
	fetch := func(context.Context, *shopifyState) (shopifyAccessToken, error) {
		fetches++
		return shopifyAccessToken{Value: "token-a", ExpiresAt: time.Now().UTC().Add(24 * time.Hour)}, nil
	}

	first, err := sharedShopifyAccessToken(context.Background(), state, fetch)
	if err != nil {
		t.Fatal(err)
	}
	second, err := sharedShopifyAccessToken(context.Background(), state, fetch)
	if err != nil {
		t.Fatal(err)
	}
	if first != "token-a" || second != "token-a" || fetches != 1 {
		t.Fatalf("unexpected shared cache result first=%q second=%q fetches=%d", first, second, fetches)
	}

	cachePath, _, err := sharedShopifyTokenCachePaths(state.ConnectionID)
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(cachePath)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("token cache mode = %o", info.Mode().Perm())
	}
}

func TestSharedShopifyAccessTokenRejectsCredentialCrossReuse(t *testing.T) {
	t.Setenv(nexadapterStateDirEnvName, t.TempDir())
	state := &shopifyState{
		ConnectionID: "conn-token-rotation",
		ShopDomain:   "moon.example.myshopify.com",
		ClientID:     "client-a",
		ClientSecret: "secret-a",
	}
	fetches := 0
	fetch := func(context.Context, *shopifyState) (shopifyAccessToken, error) {
		fetches++
		return shopifyAccessToken{Value: "token-for-current-secret", ExpiresAt: time.Now().UTC().Add(24 * time.Hour)}, nil
	}
	if _, err := sharedShopifyAccessToken(context.Background(), state, fetch); err != nil {
		t.Fatal(err)
	}
	state.ClientSecret = "secret-b"
	if _, err := sharedShopifyAccessToken(context.Background(), state, fetch); err != nil {
		t.Fatal(err)
	}
	if fetches != 2 {
		t.Fatalf("credential rotation reused token: fetches=%d", fetches)
	}
}

func TestSharedShopifyAccessTokenFailsClosedOnUnsafeCacheMetadata(t *testing.T) {
	t.Setenv(nexadapterStateDirEnvName, t.TempDir())
	state := &shopifyState{
		ConnectionID: "conn-token-unsafe",
		ShopDomain:   "moon.example.myshopify.com",
		ClientID:     "client-a",
		ClientSecret: "secret-a",
	}
	cachePath, _, err := sharedShopifyTokenCachePaths(state.ConnectionID)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cachePath, []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(cachePath, 0o644); err != nil {
		t.Fatal(err)
	}
	_, err = sharedShopifyAccessToken(context.Background(), state, func(context.Context, *shopifyState) (shopifyAccessToken, error) {
		return shopifyAccessToken{Value: "must-not-fetch", ExpiresAt: time.Now().UTC().Add(24 * time.Hour)}, nil
	})
	if err == nil {
		t.Fatal("unsafe cache metadata was accepted")
	}
	if _, statErr := os.Stat(filepath.Dir(cachePath)); statErr != nil {
		t.Fatal(statErr)
	}
}

func TestSharedShopifyAccessTokenPersistsProviderExpiryAndInvalidatesRejectedToken(t *testing.T) {
	t.Setenv(nexadapterStateDirEnvName, t.TempDir())
	state := &shopifyState{
		ConnectionID: "conn-token-expiry",
		ShopDomain:   "moon.example.myshopify.com",
		ClientID:     "client-a",
		ClientSecret: "secret-a",
	}
	wantExpiry := time.Now().UTC().Add(23 * time.Hour).Truncate(time.Second)
	if _, err := sharedShopifyAccessToken(context.Background(), state, func(context.Context, *shopifyState) (shopifyAccessToken, error) {
		return shopifyAccessToken{Value: "token-expiring", ExpiresAt: wantExpiry}, nil
	}); err != nil {
		t.Fatal(err)
	}
	cachePath, _, err := sharedShopifyTokenCachePaths(state.ConnectionID)
	if err != nil {
		t.Fatal(err)
	}
	cache, err := readSharedShopifyTokenCache(cachePath)
	if err != nil {
		t.Fatal(err)
	}
	gotExpiry, err := time.Parse(time.RFC3339Nano, cache.ExpiresAt)
	if err != nil {
		t.Fatal(err)
	}
	if !gotExpiry.Equal(wantExpiry) {
		t.Fatalf("persisted expiry = %s, want %s", gotExpiry, wantExpiry)
	}
	if err := invalidateShopifyAccessToken(state); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(cachePath); !os.IsNotExist(err) {
		t.Fatalf("rejected token cache still exists: %v", err)
	}
}
