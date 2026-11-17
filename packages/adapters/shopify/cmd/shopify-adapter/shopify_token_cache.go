package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

const shopifySharedTokenCacheVersion = 1

type shopifySharedTokenCache struct {
	Version               int    `json:"version"`
	CredentialFingerprint string `json:"credential_fingerprint"`
	AccessToken           string `json:"access_token"`
	ExpiresAt             string `json:"expires_at"`
}

func shopifyCredentialFingerprint(state *shopifyState) string {
	digest := sha256.Sum256([]byte(strings.Join([]string{
		strings.TrimSpace(state.ShopDomain),
		strings.TrimSpace(state.ClientID),
		state.ClientSecret,
	}, "\x00")))
	return hex.EncodeToString(digest[:])
}

func sharedShopifyTokenCachePaths(connectionID string) (string, string, error) {
	dir, err := shopifyGovernorDir(connectionID)
	if err != nil {
		return "", "", err
	}
	return filepath.Join(dir, "token-cache.json"), filepath.Join(dir, "token-cache.lock"), nil
}

func readSharedShopifyTokenCache(path string) (shopifySharedTokenCache, error) {
	var cache shopifySharedTokenCache
	raw, err := readShopifyPrivateFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return cache, nil
	}
	if err != nil {
		return cache, fmt.Errorf("read Shopify token cache: %w", err)
	}
	if err := json.Unmarshal(raw, &cache); err != nil {
		return cache, errors.New("Shopify token cache is invalid")
	}
	if cache.Version != shopifySharedTokenCacheVersion {
		return cache, errors.New("Shopify token cache version is unsupported")
	}
	return cache, nil
}

func writeSharedShopifyTokenCache(path string, cache shopifySharedTokenCache) error {
	raw, err := json.Marshal(cache)
	if err != nil {
		return err
	}
	return writeShopifyPrivateFileAtomic(path, append(raw, '\n'))
}

func sharedShopifyAccessToken(
	ctx context.Context,
	state *shopifyState,
	fetch func(context.Context, *shopifyState) (shopifyAccessToken, error),
) (string, error) {
	startedAt := time.Now()
	if strings.TrimSpace(os.Getenv(nexadapterStateDirEnvName)) == "" {
		fresh, err := fetch(ctx, state)
		recordShopifyHealthTokenSource(ctx, "oauth_exchange")
		recordShopifyHealthLatency(ctx, "token", startedAt)
		return fresh.Value, err
	}
	cachePath, lockPath, err := sharedShopifyTokenCachePaths(state.ConnectionID)
	if err != nil {
		return "", err
	}
	lock, err := openShopifyPrivateFile(lockPath, syscall.O_RDWR, true)
	if err != nil {
		return "", fmt.Errorf("open Shopify token cache lock: %w", err)
	}
	defer lock.Close()
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX); err != nil {
		return "", fmt.Errorf("lock Shopify token cache: %w", err)
	}
	defer syscall.Flock(int(lock.Fd()), syscall.LOCK_UN) //nolint:errcheck

	fingerprint := shopifyCredentialFingerprint(state)
	cache, err := readSharedShopifyTokenCache(cachePath)
	if err != nil {
		return "", err
	}
	expiresAt, _ := time.Parse(time.RFC3339Nano, cache.ExpiresAt)
	if cache.CredentialFingerprint == fingerprint &&
		strings.TrimSpace(cache.AccessToken) != "" &&
		time.Now().UTC().Add(time.Minute).Before(expiresAt) {
		recordShopifyHealthTokenSource(ctx, "persistent_cache")
		recordShopifyHealthLatency(ctx, "token", startedAt)
		return cache.AccessToken, nil
	}

	fresh, err := fetch(ctx, state)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(fresh.Value) == "" {
		return "", errors.New("Shopify token exchange returned an empty token")
	}
	expiresAt = fresh.ExpiresAt.UTC()
	if expiresAt.IsZero() {
		expiresAt = time.Now().UTC().Add(defaultTokenTTL)
	}
	cache = shopifySharedTokenCache{
		Version:               shopifySharedTokenCacheVersion,
		CredentialFingerprint: fingerprint,
		AccessToken:           fresh.Value,
		ExpiresAt:             expiresAt.Format(time.RFC3339Nano),
	}
	if err := writeSharedShopifyTokenCache(cachePath, cache); err != nil {
		return "", fmt.Errorf("persist Shopify token cache: %w", err)
	}
	recordShopifyHealthTokenSource(ctx, "oauth_exchange")
	recordShopifyHealthLatency(ctx, "token", startedAt)
	return fresh.Value, nil
}

func invalidateSharedShopifyAccessToken(state *shopifyState) error {
	if strings.TrimSpace(os.Getenv(nexadapterStateDirEnvName)) == "" || state == nil {
		return nil
	}
	cachePath, lockPath, err := sharedShopifyTokenCachePaths(state.ConnectionID)
	if err != nil {
		return err
	}
	lock, err := openShopifyPrivateFile(lockPath, syscall.O_RDWR, true)
	if err != nil {
		return fmt.Errorf("open Shopify token cache lock: %w", err)
	}
	defer lock.Close()
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX); err != nil {
		return fmt.Errorf("lock Shopify token cache: %w", err)
	}
	defer syscall.Flock(int(lock.Fd()), syscall.LOCK_UN) //nolint:errcheck
	if err := os.Remove(cachePath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove Shopify token cache: %w", err)
	}
	return nil
}

func invalidateShopifyAccessToken(state *shopifyState) error {
	if state != nil && tokenCache != nil &&
		tokenCache.ShopDomain == state.ShopDomain &&
		tokenCache.ClientID == state.ClientID {
		tokenCache = nil
	}
	return invalidateSharedShopifyAccessToken(state)
}
