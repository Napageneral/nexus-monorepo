package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestConnectionsPreservesBoundAdvertiserIdentity(t *testing.T) {
	ctx := nexadapter.AdapterContext[struct{}]{
		Context:      context.Background(),
		ConnectionID: "tiktok-conn",
		Runtime: &nexadapter.RuntimeContext{
			Platform:     platformID,
			ConnectionID: "tiktok-conn",
			Credential: &nexadapter.RuntimeCredential{
				Value:   "access-token",
				Ref:     "tiktok-business/tiktok-conn",
				Account: "advertiser-123",
				Fields: map[string]string{
					"advertiser_id": "advertiser-123",
					"app_id":        "app-1",
					"app_secret":    "secret-1",
				},
			},
		},
	}

	conns, err := connections(ctx)
	if err != nil {
		t.Fatalf("connections returned error: %v", err)
	}
	if len(conns) != 1 {
		t.Fatalf("connections length = %d, want 1", len(conns))
	}
	conn := conns[0]
	if conn.ID != "tiktok-conn" {
		t.Fatalf("connection ID = %q, want %q", conn.ID, "tiktok-conn")
	}
	if conn.Account != "advertiser-123" {
		t.Fatalf("connection Account = %q, want %q", conn.Account, "advertiser-123")
	}
	if conn.Status != "ready" {
		t.Fatalf("connection Status = %q, want ready", conn.Status)
	}
	if conn.CredentialRef != "tiktok-business/tiktok-conn" {
		t.Fatalf("connection CredentialRef = %q, want %q", conn.CredentialRef, "tiktok-business/tiktok-conn")
	}
}

func TestHealthVerifiesVisibleAdvertiserIDsWhenAppCredentialsArePresent(t *testing.T) {
	oldBaseURL := businessAPIBaseURL
	oldClient := businessHTTPClient
	t.Cleanup(func() {
		businessAPIBaseURL = oldBaseURL
		businessHTTPClient = oldClient
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("access_token"); got != "access-token" {
			t.Fatalf("access_token query = %q, want access-token", got)
		}
		if got := r.URL.Query().Get("app_id"); got != "app-1" {
			t.Fatalf("app_id query = %q, want app-1", got)
		}
		if got := r.URL.Query().Get("secret"); got != "secret-1" {
			t.Fatalf("secret query = %q, want secret-1", got)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"code": 0,
			"data": map[string]any{
				"advertiser_ids": []string{"advertiser-123", "advertiser-456"},
			},
		})
	}))
	t.Cleanup(server.Close)

	businessAPIBaseURL = server.URL
	businessHTTPClient = server.Client()

	ctx := nexadapter.AdapterContext[struct{}]{
		Context:      context.Background(),
		ConnectionID: "tiktok-conn",
		Runtime: &nexadapter.RuntimeContext{
			Platform:     platformID,
			ConnectionID: "tiktok-conn",
			Credential: &nexadapter.RuntimeCredential{
				Value:   "access-token",
				Ref:     "tiktok-business/tiktok-conn",
				Account: "advertiser-123",
				Fields: map[string]string{
					"advertiser_id": "advertiser-123",
					"app_id":        "app-1",
					"app_secret":    "secret-1",
				},
			},
		},
	}

	h, err := health(ctx)
	if err != nil {
		t.Fatalf("health returned error: %v", err)
	}
	if !h.Connected {
		t.Fatalf("health Connected = false, want true: %+v", h)
	}
	if h.Account != "advertiser-123" {
		t.Fatalf("health Account = %q, want advertiser-123", h.Account)
	}
	visible, ok := h.Details["visible_advertiser_ids"].([]string)
	if !ok {
		t.Fatalf("visible_advertiser_ids type = %T, want []string", h.Details["visible_advertiser_ids"])
	}
	if len(visible) != 2 {
		t.Fatalf("visible_advertiser_ids length = %d, want 2", len(visible))
	}
	if got := h.Details["verification"]; got != "advertiser_lookup" {
		t.Fatalf("verification = %v, want advertiser_lookup", got)
	}
}

func TestHealthFallsBackToBindingOnlyWhenLookupCredentialsAreMissing(t *testing.T) {
	ctx := nexadapter.AdapterContext[struct{}]{
		Context:      context.Background(),
		ConnectionID: "tiktok-conn",
		Runtime: &nexadapter.RuntimeContext{
			Platform:     platformID,
			ConnectionID: "tiktok-conn",
			Credential: &nexadapter.RuntimeCredential{
				Value:   "access-token",
				Ref:     "tiktok-business/tiktok-conn",
				Account: "advertiser-123",
				Fields: map[string]string{
					"advertiser_id": "advertiser-123",
				},
			},
		},
	}

	h, err := health(ctx)
	if err != nil {
		t.Fatalf("health returned error: %v", err)
	}
	if !h.Connected {
		t.Fatalf("health Connected = false, want true: %+v", h)
	}
	if got := h.Details["verification"]; got != "binding_only" {
		t.Fatalf("verification = %v, want binding_only", got)
	}
	if got := h.Details["warning"]; got == "" {
		t.Fatalf("warning should be populated when advertiser lookup is skipped")
	}
}

func TestLoadTikTokBusinessStatePrefersExplicitAdvertiserIDOverConnectionAccount(t *testing.T) {
	ctx := nexadapter.AdapterContext[struct{}]{
		Context:      context.Background(),
		ConnectionID: "tiktok-conn",
		Runtime: &nexadapter.RuntimeContext{
			Platform:     platformID,
			ConnectionID: "tiktok-conn",
			Credential: &nexadapter.RuntimeCredential{
				Value:   "access-token",
				Ref:     "tiktok-business/tiktok-conn",
				Account: "0a834144-ccc6-4e86-b66f-c86671bb69b3",
				Fields: map[string]string{
					"advertiser_id": "7563060383863488513",
				},
			},
		},
	}

	state, err := loadTikTokBusinessState(ctx)
	if err != nil {
		t.Fatalf("loadTikTokBusinessState returned error: %v", err)
	}
	if state.BoundAdvertiserID != "7563060383863488513" {
		t.Fatalf("BoundAdvertiserID = %q, want %q", state.BoundAdvertiserID, "7563060383863488513")
	}
}

func TestLoadTikTokBusinessStateFallsBackToNumericCredentialAccount(t *testing.T) {
	ctx := nexadapter.AdapterContext[struct{}]{
		Context:      context.Background(),
		ConnectionID: "tiktok-conn",
		Runtime: &nexadapter.RuntimeContext{
			Platform:     platformID,
			ConnectionID: "tiktok-conn",
			Credential: &nexadapter.RuntimeCredential{
				Value:   "access-token",
				Ref:     "tiktok-business/tiktok-conn",
				Account: "7563060383863488513",
				Fields:  map[string]string{},
			},
		},
	}

	state, err := loadTikTokBusinessState(ctx)
	if err != nil {
		t.Fatalf("loadTikTokBusinessState returned error: %v", err)
	}
	if state.BoundAdvertiserID != "7563060383863488513" {
		t.Fatalf("BoundAdvertiserID = %q, want %q", state.BoundAdvertiserID, "7563060383863488513")
	}
}
