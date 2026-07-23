package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
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
	fetch := func(context.Context, *shopifyState) (string, error) {
		fetches++
		return "token-a", nil
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
	fetch := func(context.Context, *shopifyState) (string, error) {
		fetches++
		return "token-for-current-secret", nil
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
	_, err = sharedShopifyAccessToken(context.Background(), state, func(context.Context, *shopifyState) (string, error) {
		return "must-not-fetch", nil
	})
	if err == nil {
		t.Fatal("unsafe cache metadata was accepted")
	}
	if _, statErr := os.Stat(filepath.Dir(cachePath)); statErr != nil {
		t.Fatal(statErr)
	}
}
