package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	nexadapter "github.com/nexus-project/adapter-sdk-go"

	"github.com/nexus-project/adapter-confluence/internal/config"
)

func TestInfoMatchesSpec(t *testing.T) {
	t.Parallel()

	result, err := info(context.Background())
	if err != nil {
		t.Fatalf("info() error = %v", err)
	}

	if result.Platform != "confluence" {
		t.Fatalf("Platform = %q", result.Platform)
	}
	if result.Name != "Confluence Cloud" {
		t.Fatalf("Name = %q", result.Name)
	}
	if result.Version != "0.1.0" {
		t.Fatalf("Version = %q", result.Version)
	}
	if !result.MultiAccount {
		t.Fatalf("MultiAccount = false, want true")
	}
	if result.CredentialService != "atlassian" {
		t.Fatalf("CredentialService = %q", result.CredentialService)
	}
	if len(result.Auth.Methods) != 1 {
		t.Fatalf("len(Auth.Methods) = %d", len(result.Auth.Methods))
	}
	if result.Auth.Methods[0].ID != "atlassian_api_key" {
		t.Fatalf("Auth method ID = %q", result.Auth.Methods[0].ID)
	}
	if result.PlatformCapabilities.SupportsEdit != true {
		t.Fatalf("SupportsEdit = false, want true")
	}
	if !result.PlatformCapabilities.SupportsDelete {
		t.Fatalf("SupportsDelete = false, want true")
	}
	if result.PlatformCapabilities.SupportsMedia {
		t.Fatalf("SupportsMedia = true, want false")
	}
	if result.PlatformCapabilities.SupportsThreads {
		t.Fatalf("SupportsThreads = true, want false")
	}
	if !containsOperation(result.Operations, nexadapter.OpDeliveryDelete) {
		t.Fatalf("operations missing channels.delete: %#v", result.Operations)
	}
}

func TestSetupFlowPersistsSessionAndConfig(t *testing.T) {
	tempDir := t.TempDir()
	t.Setenv("NEXUS_CONFLUENCE_STATE_DIR", tempDir)

	sessionStore, err := config.NewSessionStore("")
	if err != nil {
		t.Fatalf("NewSessionStore() error = %v", err)
	}

	started, err := setupStart(context.Background(), nexadapter.AdapterSetupRequest{})
	if err != nil {
		t.Fatalf("setupStart() error = %v", err)
	}
	if started.Status != nexadapter.SetupStatusRequiresInput {
		t.Fatalf("setupStart status = %q", started.Status)
	}

	session, err := sessionStore.Load(started.SessionID)
	if err != nil {
		t.Fatalf("Load(session) error = %v", err)
	}
	session.Step = config.SetupStepSpaces
	session.Credentials = config.StoredCredentials{
		Email:    "tyler@example.com",
		APIToken: "secret",
		Site:     "vrtly",
	}
	session.SpaceOptions = []config.SpaceOption{
		{ID: "1", Key: "ENG", Name: "Engineering", Label: "Engineering (ENG)"},
		{ID: "2", Key: "PROD", Name: "Product", Label: "Product (PROD)"},
	}
	if err := sessionStore.Save(session); err != nil {
		t.Fatalf("Save(session) error = %v", err)
	}

	completed, err := setupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: started.SessionID,
		Payload: map[string]any{
			"spaces": []any{"ENG", "PROD"},
		},
	})
	if err != nil {
		t.Fatalf("setupSubmit() error = %v", err)
	}
	if completed.Status != nexadapter.SetupStatusCompleted {
		t.Fatalf("completed status = %q", completed.Status)
	}
	if completed.Account != "vrtly-confluence" {
		t.Fatalf("Account = %q", completed.Account)
	}
	if got := strings.TrimSpace(completed.SecretFields["email"]); got != "tyler@example.com" {
		t.Fatalf("SecretFields[email] = %q", got)
	}

	store, err := config.NewStore("")
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	cfg, err := store.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	account, ok := cfg.Accounts["vrtly-confluence"]
	if !ok {
		t.Fatalf("account vrtly-confluence missing from config: %#v", cfg.Accounts)
	}
	if account.SiteURL != "https://vrtly.atlassian.net/wiki" {
		t.Fatalf("SiteURL = %q", account.SiteURL)
	}
	if len(account.Spaces) != 2 {
		t.Fatalf("len(account.Spaces) = %d", len(account.Spaces))
	}
}

func TestAccountsListsConfiguredAccounts(t *testing.T) {
	tempDir := t.TempDir()
	t.Setenv("NEXUS_CONFLUENCE_STATE_DIR", tempDir)

	store, err := config.NewStore("")
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	if err := store.Save(&config.AdapterConfig{
		Accounts: map[string]config.AccountConfig{
			"vrtly-confluence": {
				ID:      "vrtly-confluence",
				Email:   "tyler@example.com",
				Site:    "vrtly",
				SiteURL: "https://vrtly.atlassian.net/wiki",
			},
		},
	}); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	list, err := accounts(context.Background())
	if err != nil {
		t.Fatalf("accounts() error = %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("len(list) = %d", len(list))
	}
	if list[0].ID != "vrtly-confluence" {
		t.Fatalf("ID = %q", list[0].ID)
	}
}

func TestSetupCancelDeletesSession(t *testing.T) {
	tempDir := t.TempDir()
	t.Setenv("NEXUS_CONFLUENCE_STATE_DIR", tempDir)

	started, err := setupStart(context.Background(), nexadapter.AdapterSetupRequest{SessionID: "sid-123"})
	if err != nil {
		t.Fatalf("setupStart() error = %v", err)
	}
	if started.SessionID != "sid-123" {
		t.Fatalf("SessionID = %q", started.SessionID)
	}

	if _, err := setupCancel(context.Background(), nexadapter.AdapterSetupRequest{SessionID: "sid-123"}); err != nil {
		t.Fatalf("setupCancel() error = %v", err)
	}

	sessionPath := filepath.Join(tempDir, "setup-sessions", "sid-123.json")
	if _, err := os.Stat(sessionPath); !os.IsNotExist(err) {
		t.Fatalf("session path still exists or unexpected stat error: %v", err)
	}
}

func TestHealthUsesRuntimeCredential(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/wiki/api/v2/spaces" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		if got := r.URL.Query().Get("limit"); got != "1" {
			t.Fatalf("limit = %q", got)
		}
		_, _ = w.Write([]byte(`{"results":[{"id":"1","key":"ENG","name":"Engineering"}],"_links":{}}`))
	}))
	defer server.Close()

	path := filepath.Join(t.TempDir(), "runtime-context.json")
	raw, err := json.Marshal(nexadapter.RuntimeContext{
		Platform:     "confluence",
		ConnectionID: "vrtly-confluence",
		Credential: &nexadapter.RuntimeCredential{
			Value: "token",
			Fields: map[string]string{
				"email":     "tyler@example.com",
				"api_token": "secret",
				"site":      server.URL,
			},
		},
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	t.Setenv(nexadapter.AdapterContextEnvVar, path)

	result, err := health(context.Background(), "vrtly-confluence")
	if err != nil {
		t.Fatalf("health() error = %v", err)
	}
	if !result.Connected {
		t.Fatalf("health not connected: %#v", result)
	}
}

func containsOperation(ops []nexadapter.AdapterOperation, want nexadapter.AdapterOperation) bool {
	for _, op := range ops {
		if op == want {
			return true
		}
	}
	return false
}
