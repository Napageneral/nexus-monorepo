package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestTikTokDisplayAccessTokenForRequestRefreshesAndCachesOAuthState(t *testing.T) {
	now := time.Date(2026, time.April, 27, 15, 0, 0, 0, time.UTC)
	originalNow := tiktokDisplayNow
	originalTokenURL := tiktokDisplayOAuthTokenURL
	tiktokDisplayNow = func() time.Time { return now }
	defer func() {
		tiktokDisplayNow = originalNow
		tiktokDisplayOAuthTokenURL = originalTokenURL
	}()

	var calls atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		if err := r.ParseForm(); err != nil {
			t.Fatalf("parse form: %v", err)
		}
		if got := r.Form.Get("grant_type"); got != "refresh_token" {
			t.Fatalf("expected refresh_token grant, got %q", got)
		}
		if got := r.Form.Get("refresh_token"); got != "refresh-token" {
			t.Fatalf("expected refresh token, got %q", got)
		}
		if got := r.Form.Get("client_key"); got != "client-key" {
			t.Fatalf("expected client key, got %q", got)
		}
		if got := r.Form.Get("client_secret"); got != "client-secret" {
			t.Fatalf("expected client secret, got %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token":       "fresh-access-token",
			"refresh_token":      "fresh-refresh-token",
			"open_id":            "open_123",
			"expires_in":         86_400,
			"refresh_expires_in": 31_536_000,
			"scope":              "user.info.basic,video.list",
			"token_type":         "Bearer",
		})
	}))
	defer server.Close()
	tiktokDisplayOAuthTokenURL = server.URL

	stateDir := t.TempDir()
	t.Setenv(tiktokDisplayAdapterStateDirEnv, stateDir)
	path := writeTikTokDisplayRuntimeContext(t, map[string]any{
		"version":       1,
		"platform":      platformID,
		"connection_id": "display-primary",
		"config":        map[string]any{},
		"credential": map[string]any{
			"value":   "expired-access-token",
			"ref":     "tiktok-display/display-primary",
			"service": platformID,
			"account": "open_123",
			"fields": map[string]string{
				"access_token":             "expired-access-token",
				"refresh_token":            "refresh-token",
				"open_id":                  "open_123",
				"access_token_expires_at":  now.Add(-time.Hour).Format(time.RFC3339),
				"refresh_token_expires_at": now.Add(24 * time.Hour).Format(time.RFC3339),
				"client_key":               "client-key",
				"client_secret":            "client-secret",
			},
		},
	})
	t.Setenv("NEXUS_ADAPTER_CONTEXT_PATH", path)

	state, err := loadTikTokDisplayRuntime()
	if err != nil {
		t.Fatalf("load runtime: %v", err)
	}
	accessToken, err := state.accessTokenForRequest(context.Background())
	if err != nil {
		t.Fatalf("access token for request: %v", err)
	}
	if accessToken != "fresh-access-token" {
		t.Fatalf("expected refreshed access token, got %q", accessToken)
	}
	if state.RefreshToken != "fresh-refresh-token" {
		t.Fatalf("expected refreshed refresh token to be retained")
	}
	if calls.Load() != 1 {
		t.Fatalf("expected one refresh call, got %d", calls.Load())
	}

	oauthStatePath := tiktokDisplayOAuthStatePath(stateDir, "display-primary")
	raw, err := os.ReadFile(oauthStatePath)
	if err != nil {
		t.Fatalf("read oauth state: %v", err)
	}
	var cached tiktokDisplayOAuthState
	if err := json.Unmarshal(raw, &cached); err != nil {
		t.Fatalf("parse oauth state: %v", err)
	}
	if cached.AccessToken != "fresh-access-token" || cached.RefreshToken != "fresh-refresh-token" {
		t.Fatalf("cached oauth state did not retain refreshed tokens")
	}
	if cached.OpenID != "open_123" {
		t.Fatalf("expected cached open_id open_123, got %q", cached.OpenID)
	}

	reloaded, err := loadTikTokDisplayRuntime()
	if err != nil {
		t.Fatalf("reload runtime: %v", err)
	}
	if !reloaded.OAuthStateLoaded {
		t.Fatalf("expected runtime to load cached oauth state")
	}
	accessToken, err = reloaded.accessTokenForRequest(context.Background())
	if err != nil {
		t.Fatalf("access token from cached state: %v", err)
	}
	if accessToken != "fresh-access-token" {
		t.Fatalf("expected cached access token, got %q", accessToken)
	}
	if calls.Load() != 1 {
		t.Fatalf("expected cached token to avoid a second refresh, got %d calls", calls.Load())
	}
}

func TestTikTokDisplayAccessTokenForRequestRejectsOpenIDMismatch(t *testing.T) {
	now := time.Date(2026, time.April, 27, 15, 0, 0, 0, time.UTC)
	originalNow := tiktokDisplayNow
	originalTokenURL := tiktokDisplayOAuthTokenURL
	tiktokDisplayNow = func() time.Time { return now }
	defer func() {
		tiktokDisplayNow = originalNow
		tiktokDisplayOAuthTokenURL = originalTokenURL
	}()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token":       "fresh-access-token",
			"refresh_token":      "fresh-refresh-token",
			"open_id":            "open_456",
			"expires_in":         86_400,
			"refresh_expires_in": 31_536_000,
		})
	}))
	defer server.Close()
	tiktokDisplayOAuthTokenURL = server.URL

	path := writeTikTokDisplayRuntimeContext(t, map[string]any{
		"version":       1,
		"platform":      platformID,
		"connection_id": "display-primary",
		"config":        map[string]any{},
		"credential": map[string]any{
			"value":   "expired-access-token",
			"service": platformID,
			"account": "open_123",
			"fields": map[string]string{
				"access_token":             "expired-access-token",
				"refresh_token":            "refresh-token",
				"open_id":                  "open_123",
				"access_token_expires_at":  now.Add(-time.Hour).Format(time.RFC3339),
				"refresh_token_expires_at": now.Add(24 * time.Hour).Format(time.RFC3339),
				"client_key":               "client-key",
				"client_secret":            "client-secret",
			},
		},
	})
	t.Setenv("NEXUS_ADAPTER_CONTEXT_PATH", path)

	state, err := loadTikTokDisplayRuntime()
	if err != nil {
		t.Fatalf("load runtime: %v", err)
	}
	_, err = state.accessTokenForRequest(context.Background())
	if err == nil || !strings.Contains(err.Error(), "open_id") {
		t.Fatalf("expected open_id mismatch error, got %v", err)
	}
}
