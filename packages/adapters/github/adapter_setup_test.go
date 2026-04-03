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
)

func TestAccountConfigRoundTrip(t *testing.T) {
	stateDir := t.TempDir()
	accounts := &AccountsFile{
		Accounts: map[string]AccountConfig{
			"nexus-github": {
				AccountID:           "nexus-github",
				Provider:            "github",
				Host:                "api.github.com",
				Token:               "secret-token",
				Username:            "octocat",
				CredentialRef:       "github/octocat",
				Workspace:           "nexus",
				PollIntervalSeconds: 60,
			},
		},
	}

	if err := SaveAccounts(stateDir, accounts); err != nil {
		t.Fatalf("SaveAccounts returned error: %v", err)
	}

	loaded, err := LoadAccounts(stateDir)
	if err != nil {
		t.Fatalf("LoadAccounts returned error: %v", err)
	}
	if loaded.Accounts["nexus-github"].CredentialRef != "github/octocat" {
		t.Fatalf("CredentialRef = %q, want github/octocat", loaded.Accounts["nexus-github"].CredentialRef)
	}

	raw, err := os.ReadFile(filepath.Join(stateDir, accountsFilename))
	if err != nil {
		t.Fatalf("read accounts.json: %v", err)
	}
	if strings.Contains(string(raw), "secret-token") {
		t.Fatalf("accounts.json must not contain raw token")
	}
	if strings.Contains(string(raw), `"username"`) {
		t.Fatalf("accounts.json must not contain username field")
	}
}

func TestSetupStart(t *testing.T) {
	result, err := newGitAdapter().SetupStart(context.Background(), nexadapter.AdapterSetupRequest{})
	if err != nil {
		t.Fatalf("SetupStart returned error: %v", err)
	}
	if result.Status != nexadapter.SetupStatusRequiresInput {
		t.Fatalf("Status = %q, want requires_input", result.Status)
	}
	if len(result.Fields) != 4 {
		t.Fatalf("len(Fields) = %d, want 4", len(result.Fields))
	}
	if result.Fields[1].Name != "username" {
		t.Fatalf("Fields[1].Name = %q, want username", result.Fields[1].Name)
	}
}

func TestSetupSubmitCredentials(t *testing.T) {
	server := githubTestServer(t, http.StatusOK)
	defer server.Close()

	adapter := newGitAdapter()
	result, err := adapter.SetupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "s-1",
		Payload: map[string]any{
			"provider": "github",
			"host":     server.URL,
			"token":    "ghp_test",
		},
	})
	if err != nil {
		t.Fatalf("SetupSubmit returned error: %v", err)
	}
	if result.Status != nexadapter.SetupStatusRequiresInput {
		t.Fatalf("Status = %q, want requires_input", result.Status)
	}
	if result.Metadata["step"] != "repo_selection" {
		t.Fatalf("metadata.step = %#v, want repo_selection", result.Metadata["step"])
	}
}

func TestSetupSubmitBadCredentials(t *testing.T) {
	server := githubTestServer(t, http.StatusUnauthorized)
	defer server.Close()

	adapter := newGitAdapter()
	result, err := adapter.SetupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "s-2",
		Payload: map[string]any{
			"provider": "github",
			"host":     server.URL,
			"token":    "ghp_bad",
		},
	})
	if err != nil {
		t.Fatalf("SetupSubmit returned error: %v", err)
	}
	if result.Status != nexadapter.SetupStatusRequiresInput {
		t.Fatalf("Status = %q, want requires_input", result.Status)
	}
	if !strings.Contains(strings.ToLower(result.Message), "authentication failed") {
		t.Fatalf("Message = %q, want auth failure", result.Message)
	}
}

func TestSetupSubmitRepoSelection(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv("NEXUS_ADAPTER_STATE_DIR", stateDir)

	server := githubTestServer(t, http.StatusOK)
	defer server.Close()

	adapter := newGitAdapter()
	_, err := adapter.SetupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "s-3",
		Payload: map[string]any{
			"provider": "github",
			"host":     server.URL,
			"token":    "ghp_test",
		},
	})
	if err != nil {
		t.Fatalf("credentials submit returned error: %v", err)
	}

	result, err := adapter.SetupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "s-3",
		Payload: map[string]any{
			"repositories":   "all",
			"backfill_since": "2026-03-15T00:00:00Z",
		},
	})
	if err != nil {
		t.Fatalf("repo selection submit returned error: %v", err)
	}
	if result.Status != nexadapter.SetupStatusCompleted {
		t.Fatalf("Status = %q, want completed", result.Status)
	}
	if result.Account != "octocat" {
		t.Fatalf("Account = %q, want octocat", result.Account)
	}
	if result.AccountContact == nil {
		t.Fatalf("AccountContact = nil, want explicit account contact")
	}
	if result.AccountContact.Platform != "github" || result.AccountContact.SpaceID != server.URL || result.AccountContact.ContactID != "octocat" {
		t.Fatalf("AccountContact = %#v, want github/%s/octocat", result.AccountContact, server.URL)
	}
	if result.SecretFields["token"] != "ghp_test" {
		t.Fatalf("secret_fields.token = %q, want ghp_test", result.SecretFields["token"])
	}
	adapterConfig, ok := result.Metadata["adapter_config"]
	if !ok {
		t.Fatalf("expected adapter_config metadata")
	}
	encoded, err := json.Marshal(adapterConfig)
	if err != nil {
		t.Fatalf("marshal adapter_config: %v", err)
	}
	var account AccountConfig
	if err := json.Unmarshal(encoded, &account); err != nil {
		t.Fatalf("unmarshal adapter_config: %v", err)
	}
	if account.Provider != "github" {
		t.Fatalf("Provider = %q, want github", account.Provider)
	}
	if len(account.Repositories) != 2 {
		t.Fatalf("len(account.Repositories) = %d, want 2", len(account.Repositories))
	}
	if account.BackfillSince != "2026-03-15T00:00:00Z" {
		t.Fatalf("BackfillSince = %q, want requested backfill_since", account.BackfillSince)
	}
	if _, err := os.Stat(filepath.Join(stateDir, accountsFilename)); !os.IsNotExist(err) {
		t.Fatalf("expected no durable accounts.json, got err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(stateDir, credentialsFilename)); !os.IsNotExist(err) {
		t.Fatalf("expected no durable credentials.json, got err=%v", err)
	}

	store, err := OpenWatermarkStore(stateDir)
	if err != nil {
		t.Fatalf("OpenWatermarkStore returned error: %v", err)
	}
	defer store.Close()
	commitWM, err := store.Get(result.ConnectionID, "nexus-project/nex:commits")
	if err != nil {
		t.Fatalf("store.Get commits returned error: %v", err)
	}
	if commitWM == nil || commitWM.ValueInt == 0 {
		t.Fatalf("expected commit watermark to be seeded, got %#v", commitWM)
	}
	prWM, err := store.Get(result.ConnectionID, "nexus-project/nex:pull_requests")
	if err != nil {
		t.Fatalf("store.Get pull requests returned error: %v", err)
	}
	if prWM == nil || prWM.ValueInt == 0 {
		t.Fatalf("expected pull request watermark to be seeded, got %#v", prWM)
	}
}

func TestSetupSessionPersistsAcrossAdapterProcesses(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv("NEXUS_ADAPTER_STATE_DIR", stateDir)

	server := githubTestServer(t, http.StatusOK)
	defer server.Close()

	first := newGitAdapter()
	initial, err := first.SetupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "s-persist",
		Payload: map[string]any{
			"provider": "github",
			"host":     server.URL,
			"token":    "ghp_test",
		},
	})
	if err != nil {
		t.Fatalf("initial SetupSubmit returned error: %v", err)
	}
	if initial.Status != nexadapter.SetupStatusRequiresInput {
		t.Fatalf("initial status = %q, want requires_input", initial.Status)
	}

	second := newGitAdapter()
	status, err := second.SetupStatus(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "s-persist",
	})
	if err != nil {
		t.Fatalf("SetupStatus returned error: %v", err)
	}
	if status.Status != nexadapter.SetupStatusRequiresInput {
		t.Fatalf("status = %q, want requires_input", status.Status)
	}
	if status.Metadata["step"] != "repo_selection" {
		t.Fatalf("metadata.step = %#v, want repo_selection", status.Metadata["step"])
	}

	final, err := second.SetupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "s-persist",
		Payload: map[string]any{
			"repositories": "all",
		},
	})
	if err != nil {
		t.Fatalf("final SetupSubmit returned error: %v", err)
	}
	if final.Status != nexadapter.SetupStatusCompleted {
		t.Fatalf("final status = %q, want completed", final.Status)
	}

	_, ok, err := LoadSetupSession(stateDir, "s-persist")
	if err != nil {
		t.Fatalf("LoadSetupSession returned error: %v", err)
	}
	if ok {
		t.Fatalf("expected setup session to be deleted after completion")
	}
}

func TestHealthConnected(t *testing.T) {
	server := githubTestServer(t, http.StatusOK)
	defer server.Close()
	setRuntimeContext(t, "nexus-github", map[string]any{
		"workspace":             "nexus",
		"repositories":          []Repository{{FullName: "nexus-project/nex", Name: "nex"}},
		"poll_interval_seconds": 60,
	}, map[string]string{
		"provider": "github",
		"host":     server.URL,
		"token":    "ghp_test",
		"username": "octocat",
	})

	health, err := newGitAdapter().Health(context.Background(), "nexus-github")
	if err != nil {
		t.Fatalf("Health returned error: %v", err)
	}
	if !health.Connected {
		t.Fatalf("Connected = false, want true (error=%q)", health.Error)
	}
	if health.Account != "octocat" {
		t.Fatalf("Account = %q, want octocat", health.Account)
	}
	if health.AccountContact == nil {
		t.Fatalf("AccountContact = nil, want explicit account contact")
	}
	if health.AccountContact.Platform != "github" || health.AccountContact.SpaceID != server.URL || health.AccountContact.ContactID != "octocat" {
		t.Fatalf("AccountContact = %#v, want github/%s/octocat", health.AccountContact, server.URL)
	}
	if health.Details["provider"] != "github" {
		t.Fatalf("provider detail = %#v, want github", health.Details["provider"])
	}
	if health.Details["user"] != "octocat" {
		t.Fatalf("user detail = %#v, want octocat", health.Details["user"])
	}
}

func TestHealthDisconnected(t *testing.T) {
	server := githubTestServer(t, http.StatusUnauthorized)
	defer server.Close()
	setRuntimeContext(t, "nexus-github", map[string]any{}, map[string]string{
		"provider": "github",
		"host":     server.URL,
		"token":    "ghp_bad",
		"username": "octocat",
	})

	health, err := newGitAdapter().Health(context.Background(), "nexus-github")
	if err != nil {
		t.Fatalf("Health returned error: %v", err)
	}
	if health.Connected {
		t.Fatalf("Connected = true, want false")
	}
	if !strings.Contains(health.Error, "401") {
		t.Fatalf("Error = %q, want 401", health.Error)
	}
}

func TestAccountsList(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv("NEXUS_ADAPTER_STATE_DIR", stateDir)

	if err := SaveAccounts(stateDir, &AccountsFile{
		Accounts: map[string]AccountConfig{
			"nexus-github": {
				AccountID:     "nexus-github",
				Provider:      "github",
				Workspace:     "Nexus",
				CredentialRef: "github/octocat",
			},
		},
	}); err != nil {
		t.Fatalf("SaveAccounts returned error: %v", err)
	}

	accounts, err := newGitAdapter().ListConnections(context.Background())
	if err != nil {
		t.Fatalf("ListConnections returned error: %v", err)
	}
	if len(accounts) != 1 {
		t.Fatalf("len(accounts) = %d, want 1", len(accounts))
	}
	if accounts[0].CredentialRef != "github/octocat" {
		t.Fatalf("CredentialRef = %q, want github/octocat", accounts[0].CredentialRef)
	}
}

func githubTestServer(t *testing.T, userStatus int) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/user":
			if userStatus != http.StatusOK {
				http.Error(w, "unauthorized", userStatus)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"login": "octocat",
			})
		case "/user/repos":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{"id": 1, "full_name": "nexus-project/nex", "name": "nex", "default_branch": "main"},
				{"id": 2, "full_name": "nexus-project/spike", "name": "spike", "default_branch": "main"},
			})
		default:
			http.NotFound(w, r)
		}
	}))
}
