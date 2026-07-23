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
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return cache, nil
	}
	if err != nil {
		return cache, fmt.Errorf("inspect Shopify token cache: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm() != 0o600 {
		return cache, errors.New("Shopify token cache metadata is unsafe")
	}
	raw, err := os.ReadFile(path)
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
	temp, err := os.CreateTemp(filepath.Dir(path), ".token-cache-*")
	if err != nil {
		return fmt.Errorf("create Shopify token cache: %w", err)
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath) //nolint:errcheck
	if err := temp.Chmod(0o600); err != nil {
		_ = temp.Close()
		return err
	}
	if _, err := temp.Write(append(raw, '\n')); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Sync(); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("replace Shopify token cache: %w", err)
	}
	dir, err := os.Open(filepath.Dir(path))
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}

func sharedShopifyAccessToken(
	ctx context.Context,
	state *shopifyState,
	fetch func(context.Context, *shopifyState) (string, error),
) (string, error) {
	if strings.TrimSpace(os.Getenv(nexadapterStateDirEnvName)) == "" {
		return fetch(ctx, state)
	}
	cachePath, lockPath, err := sharedShopifyTokenCachePaths(state.ConnectionID)
	if err != nil {
		return "", err
	}
	lock, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o600)
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
		return cache.AccessToken, nil
	}

	token, err := fetch(ctx, state)
	if err != nil {
		return "", err
	}
	cache = shopifySharedTokenCache{
		Version:               shopifySharedTokenCacheVersion,
		CredentialFingerprint: fingerprint,
		AccessToken:           token,
		ExpiresAt:             time.Now().UTC().Add(defaultTokenTTL).Format(time.RFC3339Nano),
	}
	if err := writeSharedShopifyTokenCache(cachePath, cache); err != nil {
		return "", fmt.Errorf("persist Shopify token cache: %w", err)
	}
	return token, nil
}
