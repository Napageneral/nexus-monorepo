package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestInfoDeclaresCustomFlowAndSetupOperations(t *testing.T) {
	result, err := info(context.Background())
	if err != nil {
		t.Fatalf("info: %v", err)
	}
	if result.Platform != "github" {
		t.Fatalf("platform mismatch: %q", result.Platform)
	}
	if result.CredentialService != "github" {
		t.Fatalf("credential service mismatch: %q", result.CredentialService)
	}
	if result.Auth == nil || len(result.Auth.Methods) != 1 {
		t.Fatalf("expected one auth method, got %#v", result.Auth)
	}
	if result.Auth.Methods[0].Type != "custom_flow" {
		t.Fatalf("expected custom_flow auth method, got %q", result.Auth.Methods[0].Type)
	}

	required := map[nexadapter.AdapterOperation]bool{
		nexadapter.OpAdapterInfo:         false,
		nexadapter.OpAdapterHealth:       false,
		nexadapter.OpAdapterAccountsList: false,
		nexadapter.OpAdapterSetupStart:   false,
		nexadapter.OpAdapterSetupSubmit:  false,
		nexadapter.OpAdapterSetupStatus:  false,
		nexadapter.OpAdapterSetupCancel:  false,
	}
	for _, op := range result.Operations {
		if _, ok := required[op]; ok {
			required[op] = true
		}
	}
	for op, present := range required {
		if !present {
			t.Fatalf("missing operation %s", op)
		}
	}
}

func TestSetupStartReturnsRequiresInput(t *testing.T) {
	result, err := setupStart(context.Background(), nexadapter.AdapterSetupRequest{})
	if err != nil {
		t.Fatalf("setup start: %v", err)
	}
	if result.Status != nexadapter.SetupStatusRequiresInput {
		t.Fatalf("expected requires_input, got %q", result.Status)
	}
	if result.Service != "github" {
		t.Fatalf("service mismatch: %q", result.Service)
	}
	if len(result.Fields) == 0 {
		t.Fatalf("expected setup fields")
	}
}

func TestSetupSubmitRequiresFields(t *testing.T) {
	result, err := setupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "s-1",
		Payload: map[string]any{
			"app_id": "123",
		},
	})
	if err != nil {
		t.Fatalf("setup submit: %v", err)
	}
	if result.Status != nexadapter.SetupStatusRequiresInput {
		t.Fatalf("expected requires_input, got %q", result.Status)
	}
	if !strings.Contains(strings.ToLower(result.Message), "missing required fields") {
		t.Fatalf("unexpected message: %q", result.Message)
	}
}

func TestSetupSubmitCompletesWhenTokenMintSucceeds(t *testing.T) {
	privateKeyPEM := mustGenerateRSAPrivateKeyPEM(t)
	var tokenMintSeen bool
	apiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/app/installations/42/access_tokens" {
			tokenMintSeen = true
			if auth := strings.TrimSpace(r.Header.Get("Authorization")); !strings.HasPrefix(auth, "Bearer ") {
				t.Fatalf("expected Bearer authorization, got %q", auth)
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"token":                "ghs_test_123",
				"expires_at":           "2026-02-26T19:00:00Z",
				"repository_selection": "all",
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer apiServer.Close()

	result, err := setupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "s-2",
		Payload: map[string]any{
			"app_id":                     "9001",
			"installation_id":            "42",
			"private_key_pem":            privateKeyPEM,
			"account":                    "installation-42",
			"installation_account_login": "acme",
			"api_base_url":               apiServer.URL,
		},
	})
	if err != nil {
		t.Fatalf("setup submit: %v", err)
	}
	if !tokenMintSeen {
		t.Fatalf("expected token mint request")
	}
	if result.Status != nexadapter.SetupStatusCompleted {
		t.Fatalf("expected completed status, got %q (%s)", result.Status, result.Message)
	}
	if result.Service != "github" {
		t.Fatalf("service mismatch: %q", result.Service)
	}
	if result.Account != "installation-42" {
		t.Fatalf("account mismatch: %q", result.Account)
	}
	if result.SecretFields == nil {
		t.Fatalf("expected secret fields")
	}
	if got := strings.TrimSpace(result.SecretFields["app_id"]); got != "9001" {
		t.Fatalf("app_id mismatch: %q", got)
	}
	if got := strings.TrimSpace(result.SecretFields["installation_id"]); got != "42" {
		t.Fatalf("installation_id mismatch: %q", got)
	}
	if got := strings.TrimSpace(result.SecretFields["api_base_url"]); got != apiServer.URL {
		t.Fatalf("api_base_url mismatch: %q", got)
	}
	if got := strings.TrimSpace(result.SecretFields["installation_account_login"]); got != "acme" {
		t.Fatalf("installation_account_login mismatch: %q", got)
	}
	if got := strings.TrimSpace(result.SecretFields["private_key_pem"]); !strings.Contains(got, "BEGIN RSA PRIVATE KEY") {
		t.Fatalf("private key not persisted correctly")
	}
}

func TestHealthUsesRuntimeContextCredential(t *testing.T) {
	privateKeyPEM := mustGenerateRSAPrivateKeyPEM(t)
	apiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/app/installations/99/access_tokens" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"token":                "ghs_test_99",
				"expires_at":           "2026-02-26T20:00:00Z",
				"repository_selection": "all",
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer apiServer.Close()

	runtimeContextPath := writeRuntimeContextForTest(t, map[string]any{
		"version":    1,
		"platform":   "github",
		"account_id": "installation-99",
		"config":     map[string]any{},
		"credential": map[string]any{
			"kind":  "config",
			"value": "ignored",
			"fields": map[string]string{
				"app_id":          "9001",
				"installation_id": "99",
				"private_key_pem": privateKeyPEM,
				"api_base_url":    apiServer.URL,
			},
		},
	})
	t.Setenv(nexadapter.AdapterContextEnvVar, runtimeContextPath)

	healthResult, err := health(context.Background(), "installation-99")
	if err != nil {
		t.Fatalf("health: %v", err)
	}
	if !healthResult.Connected {
		t.Fatalf("expected connected health, got error=%q", healthResult.Error)
	}
	if healthResult.Account != "installation-99" {
		t.Fatalf("account mismatch: %q", healthResult.Account)
	}
	details := healthResult.Details
	if details == nil {
		t.Fatalf("expected health details")
	}
	if got := strings.TrimSpace(asString(details["installation_id"])); got != "99" {
		t.Fatalf("installation detail mismatch: %q", got)
	}
	if got := strings.TrimSpace(asString(details["app_id"])); got != "9001" {
		t.Fatalf("app detail mismatch: %q", got)
	}
	if got := strings.TrimSpace(asString(details["api_base_url"])); got != apiServer.URL {
		t.Fatalf("api base detail mismatch: %q", got)
	}
}

func mustGenerateRSAPrivateKeyPEM(t *testing.T) string {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate rsa key: %v", err)
	}
	der := x509.MarshalPKCS1PrivateKey(key)
	block := &pem.Block{Type: "RSA PRIVATE KEY", Bytes: der}
	return string(pem.EncodeToMemory(block))
}

func writeRuntimeContextForTest(t *testing.T, payload map[string]any) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "runtime-context.json")
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal runtime context: %v", err)
	}
	if err := os.WriteFile(path, append(raw, '\n'), 0o600); err != nil {
		t.Fatalf("write runtime context: %v", err)
	}
	return path
}

func asString(value any) string {
	if value == nil {
		return ""
	}
	return fmt.Sprint(value)
}
