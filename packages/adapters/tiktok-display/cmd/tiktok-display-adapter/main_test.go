package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestAdapterInfoDeclaresTikTokDisplayOAuth(t *testing.T) {
	adapter := adapterConfig()
	if adapter.Platform != platformID {
		t.Fatalf("expected platform %q, got %q", platformID, adapter.Platform)
	}
	if adapter.Name != adapterName {
		t.Fatalf("expected adapter name %q, got %q", adapterName, adapter.Name)
	}
	if adapter.CredentialService != platformID {
		t.Fatalf("expected credential service %q, got %q", platformID, adapter.CredentialService)
	}
	if adapter.Auth == nil || len(adapter.Auth.Methods) != 2 {
		t.Fatalf("expected two auth methods, got %#v", adapter.Auth)
	}

	methodsByID := map[string]struct {
		method nexadapter.AdapterAuthMethod
		ok     bool
	}{}
	for _, method := range adapter.Auth.Methods {
		methodsByID[method.ID] = struct {
			method nexadapter.AdapterAuthMethod
			ok     bool
		}{method: method, ok: true}
	}

	oauthMethod, ok := methodsByID["tiktok_display_oauth"]
	if !ok {
		t.Fatalf("expected tiktok_display_oauth auth method, got %#v", adapter.Auth.Methods)
	}
	if oauthMethod.method.Type != "oauth2" {
		t.Fatalf("expected oauth2 auth method, got %q", oauthMethod.method.Type)
	}
	if oauthMethod.method.Service != platformID {
		t.Fatalf("expected auth service %q, got %q", platformID, oauthMethod.method.Service)
	}
	if !oauthMethod.method.PlatformCredentials {
		t.Fatalf("expected platform credentials to be enabled")
	}
	if len(oauthMethod.method.Scopes) == 0 {
		t.Fatalf("expected scopes to be declared")
	}

	directMethod, ok := methodsByID["tiktok_display_access_token"]
	if !ok {
		t.Fatalf("expected tiktok_display_access_token auth method, got %#v", adapter.Auth.Methods)
	}
	if directMethod.method.Type != "api_key" {
		t.Fatalf("expected api_key auth method, got %q", directMethod.method.Type)
	}
	if directMethod.method.Service != platformID {
		t.Fatalf("expected direct auth service %q, got %q", platformID, directMethod.method.Service)
	}
	if len(directMethod.method.Fields) < 2 {
		t.Fatalf("expected direct auth fields to be declared, got %#v", directMethod.method.Fields)
	}
}

func TestConnectionsListUsesRuntimeCredentialIdentity(t *testing.T) {
	path := writeTikTokDisplayRuntimeContext(t, map[string]any{
		"version":       1,
		"platform":      platformID,
		"connection_id": "display-primary",
		"config":        map[string]any{},
		"credential": map[string]any{
			"value":   "access-token",
			"ref":     "tiktok-display/display-primary",
			"service": platformID,
			"account": "open_123",
			"fields": map[string]string{
				"access_token":     "access-token",
				"open_id":          "open_123",
				"display_name":     "Moon Sleep",
				"profile_web_link": "https://www.tiktok.com/@moonsleep",
			},
		},
	})

	t.Setenv("NEXUS_ADAPTER_CONTEXT_PATH", path)

	conns, err := connections(context.Background())
	if err != nil {
		t.Fatalf("connections() returned error: %v", err)
	}
	if len(conns) != 1 {
		t.Fatalf("expected one connection, got %d", len(conns))
	}

	conn := conns[0]
	if conn.ID != "display-primary" {
		t.Fatalf("expected connection id display-primary, got %q", conn.ID)
	}
	if conn.CredentialRef != "tiktok-display/display-primary" {
		t.Fatalf("expected credential ref tiktok-display/display-primary, got %q", conn.CredentialRef)
	}
	if conn.Account != "open_123" {
		t.Fatalf("expected account open_123, got %q", conn.Account)
	}
	if conn.Status != "ready" {
		t.Fatalf("expected ready status, got %q", conn.Status)
	}
	if !strings.Contains(conn.DisplayName, "Moon Sleep") || !strings.Contains(conn.DisplayName, "open_123") {
		t.Fatalf("expected display name to include profile identity, got %q", conn.DisplayName)
	}
}

func TestHealthUsesTikTokDisplayUserInfoAndValidatesOpenID(t *testing.T) {
	path := writeTikTokDisplayRuntimeContext(t, map[string]any{
		"version":       1,
		"platform":      platformID,
		"connection_id": "display-primary",
		"config":        map[string]any{},
		"credential": map[string]any{
			"value":   "access-token",
			"ref":     "tiktok-display/display-primary",
			"service": platformID,
			"fields": map[string]string{
				"access_token":     "access-token",
				"open_id":          "open_123",
				"display_name":     "Moon Sleep",
				"profile_web_link": "https://www.tiktok.com/@moonsleep",
			},
		},
	})

	t.Setenv("NEXUS_ADAPTER_CONTEXT_PATH", path)

	originalFetch := fetchTikTokDisplayProfile
	t.Cleanup(func() {
		fetchTikTokDisplayProfile = originalFetch
	})
	fetchTikTokDisplayProfile = func(ctx context.Context, accessToken string) (*tiktokDisplayUserInfo, error) {
		if accessToken != "access-token" {
			t.Fatalf("expected access token access-token, got %q", accessToken)
		}
		return &tiktokDisplayUserInfo{
			OpenID:         "open_123",
			DisplayName:    "Moon Sleep",
			ProfileWebLink: "https://www.tiktok.com/@moonsleep",
			FollowerCount:  123,
			FollowingCount: 45,
			LikesCount:     789,
			VideoCount:     12,
			IsVerified:     true,
		}, nil
	}

	health, err := health(context.Background(), "display-primary")
	if err != nil {
		t.Fatalf("health() returned error: %v", err)
	}
	if !health.Connected {
		t.Fatalf("expected adapter to be connected, got %#v", health)
	}
	if health.Account != "open_123" {
		t.Fatalf("expected account open_123, got %q", health.Account)
	}
	if health.ConnectionID != "display-primary" {
		t.Fatalf("expected connection id display-primary, got %q", health.ConnectionID)
	}
	if health.LastEventAt == 0 {
		t.Fatalf("expected last_event_at to be set")
	}

	details := health.Details
	if details == nil {
		t.Fatalf("expected health details to be populated")
	}
	if details["profile_open_id"] != "open_123" {
		t.Fatalf("expected profile_open_id open_123, got %#v", details["profile_open_id"])
	}
	if details["runtime_open_id"] != "open_123" {
		t.Fatalf("expected runtime_open_id open_123, got %#v", details["runtime_open_id"])
	}
}

func TestHealthFailsWhenProfileOpenIDDiffers(t *testing.T) {
	path := writeTikTokDisplayRuntimeContext(t, map[string]any{
		"version":       1,
		"platform":      platformID,
		"connection_id": "display-primary",
		"config":        map[string]any{},
		"credential": map[string]any{
			"value":   "access-token",
			"ref":     "tiktok-display/display-primary",
			"service": platformID,
			"fields": map[string]string{
				"access_token": "access-token",
				"open_id":      "open_expected",
			},
		},
	})

	t.Setenv("NEXUS_ADAPTER_CONTEXT_PATH", path)

	originalFetch := fetchTikTokDisplayProfile
	t.Cleanup(func() {
		fetchTikTokDisplayProfile = originalFetch
	})
	fetchTikTokDisplayProfile = func(ctx context.Context, accessToken string) (*tiktokDisplayUserInfo, error) {
		return &tiktokDisplayUserInfo{OpenID: "open_actual"}, nil
	}

	health, err := health(context.Background(), "display-primary")
	if err != nil {
		t.Fatalf("health() returned error: %v", err)
	}
	if health.Connected {
		t.Fatalf("expected health to fail closed on open_id mismatch, got %#v", health)
	}
	if !strings.Contains(health.Error, "does not match") {
		t.Fatalf("expected mismatch error, got %q", health.Error)
	}
}

func TestHealthIncludesTokenDiagnosticsWhenUserInfoFails(t *testing.T) {
	path := writeTikTokDisplayRuntimeContext(t, map[string]any{
		"version":       1,
		"platform":      platformID,
		"connection_id": "display-primary",
		"config":        map[string]any{},
		"credential": map[string]any{
			"value":   "access-token",
			"ref":     "tiktok-display/display-primary",
			"service": platformID,
			"fields": map[string]string{
				"access_token": "access-token",
				"open_id":      "open_123",
			},
		},
	})

	t.Setenv("NEXUS_ADAPTER_CONTEXT_PATH", path)

	originalFetch := fetchTikTokDisplayProfile
	t.Cleanup(func() {
		fetchTikTokDisplayProfile = originalFetch
	})
	fetchTikTokDisplayProfile = func(ctx context.Context, accessToken string) (*tiktokDisplayUserInfo, error) {
		return nil, errors.New("TikTok Display user/info failed: invalid token")
	}

	health, err := health(context.Background(), "display-primary")
	if err != nil {
		t.Fatalf("health() returned error: %v", err)
	}
	if health.Connected {
		t.Fatalf("expected health to fail, got %#v", health)
	}
	if health.Details == nil {
		t.Fatalf("expected health details to be populated")
	}
	if health.Details["access_token_length"] != len("access-token") {
		t.Fatalf("expected access_token_length %d, got %#v", len("access-token"), health.Details["access_token_length"])
	}
	sum := sha256.Sum256([]byte("access-token"))
	expectedHash := hex.EncodeToString(sum[:])[:12]
	if health.Details["access_token_sha256"] != expectedHash {
		t.Fatalf("expected access_token_sha256 %q, got %#v", expectedHash, health.Details["access_token_sha256"])
	}
}

func writeTikTokDisplayRuntimeContext(t *testing.T, payload map[string]any) string {
	t.Helper()

	dir := t.TempDir()
	path := filepath.Join(dir, "runtime-context.json")
	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal runtime context: %v", err)
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatalf("write runtime context: %v", err)
	}
	return path
}
