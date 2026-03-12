package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	spikegit "github.com/Napageneral/spike/internal/git"
)

func TestLoadNexConnectionAuthFetchesCredentialFromRuntime(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method: %s", r.Method)
		}
		if r.URL.Path != "/runtime/operations/"+runtimeCredentialGetOperation {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.Header.Get("X-Nexus-Service-Token"); got != "svc-token" {
			t.Fatalf("unexpected service token: %q", got)
		}
		var payload map[string]string
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if payload["connection_id"] != "conn-1" {
			t.Fatalf("unexpected connection id: %#v", payload)
		}
		writeRuntimeCredentialEnvelope(t, w, map[string]any{
			"connection_id": "conn-1",
			"adapter":       "nexus-adapter-git",
			"service":       "bitbucket",
			"authMethodId":  "bitbucket_api_token",
			"credential": map[string]any{
				"fields": map[string]string{
					"username": "tyler@intent-systems.com",
					"token":    "secret-token",
				},
			},
		})
	}))
	defer server.Close()

	auth, err := loadNexConnectionAuth(
		context.Background(),
		server.Client(),
		server.URL,
		"svc-token",
		"conn-1",
		"https://bitbucket.org/fmcom/vrtly-component-library.git",
	)
	if err != nil {
		t.Fatalf("load auth: %v", err)
	}
	if auth == nil {
		t.Fatalf("expected auth")
	}
	if auth.Username != "x-bitbucket-api-token-auth" {
		t.Fatalf("unexpected username: %q", auth.Username)
	}
	if auth.Password != "secret-token" {
		t.Fatalf("unexpected password: %q", auth.Password)
	}
}

func TestLoadNexConnectionAuthAcceptsLegacyGitAdapterID(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeRuntimeCredentialEnvelope(t, w, map[string]any{
			"connection_id": "conn-legacy",
			"adapter":       "git",
			"service":       "bitbucket",
			"authMethodId":  "bitbucket_api_token",
			"credential": map[string]any{
				"fields": map[string]string{
					"token": "secret-token",
				},
			},
		})
	}))
	defer server.Close()

	auth, err := loadNexConnectionAuth(
		context.Background(),
		server.Client(),
		server.URL,
		"svc-token",
		"conn-legacy",
		"https://bitbucket.org/fmcom/vrtly-component-library.git",
	)
	if err != nil {
		t.Fatalf("load auth: %v", err)
	}
	if auth == nil {
		t.Fatalf("expected auth")
	}
	if auth.Username != "x-bitbucket-api-token-auth" {
		t.Fatalf("unexpected username: %q", auth.Username)
	}
}

func TestLoadNexConnectionAuthReturnsNilForMissingPayload(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeRuntimeCredentialEnvelope(t, w, nil)
	}))
	defer server.Close()

	auth, err := loadNexConnectionAuth(
		context.Background(),
		server.Client(),
		server.URL,
		"svc-token",
		"missing",
		"https://bitbucket.org/fmcom/vrtly-component-library.git",
	)
	if err != nil {
		t.Fatalf("load auth: %v", err)
	}
	if auth != nil {
		t.Fatalf("expected nil auth for missing payload")
	}
}

func TestNewNexConnectionAuthResolverUsesRuntimeEnv(t *testing.T) {
	t.Setenv("NEX_RUNTIME_HTTP_URL", "")
	t.Setenv("NEX_RUNTIME_SERVICE_TOKEN", "")
	if resolver := newNexConnectionAuthResolver(); resolver != nil {
		t.Fatalf("expected nil resolver without runtime env")
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeRuntimeCredentialEnvelope(t, w, map[string]any{
			"connection_id": "conn-1",
			"adapter":       "nexus-adapter-git",
			"service":       "github",
			"authMethodId":  "github_pat",
			"credential": map[string]any{
				"fields": map[string]string{
					"token": "gh-secret",
				},
			},
		})
	}))
	defer server.Close()

	t.Setenv("NEX_RUNTIME_HTTP_URL", server.URL)
	t.Setenv("NEX_RUNTIME_SERVICE_TOKEN", "svc-token")
	resolver := newNexConnectionAuthResolver()
	if resolver == nil {
		t.Fatalf("expected resolver")
	}
	auth, err := resolver(spikeContextWithConnection("conn-1"), "https://github.com/acme/api.git")
	if err != nil {
		t.Fatalf("resolve auth: %v", err)
	}
	if auth == nil {
		t.Fatalf("expected auth")
	}
	if auth.Username != "x-access-token" {
		t.Fatalf("unexpected username: %q", auth.Username)
	}
	if auth.Password != "gh-secret" {
		t.Fatalf("unexpected password: %q", auth.Password)
	}
}

func TestProviderGitUsernameFallbacks(t *testing.T) {
	t.Parallel()

	if got := providerGitUsername("github", ""); got != "x-access-token" {
		t.Fatalf("unexpected github fallback: %q", got)
	}
	if got := providerGitUsername("gitlab", ""); got != "oauth2" {
		t.Fatalf("unexpected gitlab fallback: %q", got)
	}
	if got := providerGitUsername("custom", "alice"); got != "alice" {
		t.Fatalf("unexpected custom username: %q", got)
	}
}

func spikeContextWithConnection(connectionID string) context.Context {
	return spikegit.WithConnectionID(context.Background(), connectionID)
}

func writeRuntimeCredentialEnvelope(t *testing.T, w http.ResponseWriter, payload any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	response := map[string]any{
		"ok":      true,
		"payload": payload,
	}
	if err := json.NewEncoder(w).Encode(response); err != nil {
		t.Fatalf("encode response: %v", err)
	}
}
