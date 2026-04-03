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
			"nexus-bitbucket": {
				AccountID:           "nexus-bitbucket",
				Provider:            "bitbucket",
				Host:                "api.bitbucket.org/2.0",
				Token:               "secret-token",
				Username:            "octocat",
				CredentialRef:       "bitbucket/octocat",
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
	if loaded.Accounts["nexus-bitbucket"].CredentialRef != "bitbucket/octocat" {
		t.Fatalf("CredentialRef = %q, want bitbucket/octocat", loaded.Accounts["nexus-bitbucket"].CredentialRef)
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
	if len(result.Fields) != 3 {
		t.Fatalf("len(Fields) = %d, want 3", len(result.Fields))
	}
}

func TestSetupSubmitCredentials(t *testing.T) {
	server := bitbucketTestServer(t, http.StatusOK)
	defer server.Close()

	adapter := newGitAdapter()
	result, err := adapter.SetupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "s-1",
		Payload: map[string]any{
			"provider": "bitbucket",
			"host":     server.URL,
			"token":    "workspace_token",
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
	server := bitbucketTestServer(t, http.StatusUnauthorized)
	defer server.Close()

	adapter := newGitAdapter()
	result, err := adapter.SetupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "s-2",
		Payload: map[string]any{
			"provider": "bitbucket",
			"host":     server.URL,
			"token":    "bad_token",
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

	server := bitbucketTestServer(t, http.StatusOK)
	defer server.Close()

	adapter := newGitAdapter()
	_, err := adapter.SetupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "s-3",
		Payload: map[string]any{
			"provider": "bitbucket",
			"host":     server.URL,
			"token":    "workspace_token",
		},
	})
	if err != nil {
		t.Fatalf("credentials submit returned error: %v", err)
	}

	result, err := adapter.SetupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "s-3",
		Payload: map[string]any{
			"repositories":   "all",
			"backfill_since": "2026-03-31T00:00:00Z",
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
	if result.AccountContact.Platform != "bitbucket" || result.AccountContact.SpaceID != server.URL || result.AccountContact.ContactID != "octocat" {
		t.Fatalf("AccountContact = %#v, want bitbucket/%s/octocat", result.AccountContact, server.URL)
	}
	if result.SecretFields["token"] != "workspace_token" {
		t.Fatalf("secret_fields.token = %q, want workspace_token", result.SecretFields["token"])
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
	if account.Provider != "bitbucket" {
		t.Fatalf("Provider = %q, want bitbucket", account.Provider)
	}
	if account.BackfillSince != "2026-03-31T00:00:00Z" {
		t.Fatalf("BackfillSince = %q, want 2026-03-31T00:00:00Z", account.BackfillSince)
	}
	if len(account.Repositories) != 2 {
		t.Fatalf("len(account.Repositories) = %d, want 2", len(account.Repositories))
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

	server := bitbucketTestServer(t, http.StatusOK)
	defer server.Close()

	first := newGitAdapter()
	initial, err := first.SetupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "s-persist",
		Payload: map[string]any{
			"provider": "bitbucket",
			"host":     server.URL,
			"token":    "workspace_token",
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

func TestSetupSubmitRejectsInvalidBackfillSince(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv("NEXUS_ADAPTER_STATE_DIR", stateDir)

	server := bitbucketTestServer(t, http.StatusOK)
	defer server.Close()

	adapter := newGitAdapter()
	_, err := adapter.SetupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "s-invalid-backfill",
		Payload: map[string]any{
			"provider": "bitbucket",
			"host":     server.URL,
			"token":    "workspace_token",
		},
	})
	if err != nil {
		t.Fatalf("credentials submit returned error: %v", err)
	}

	result, err := adapter.SetupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: "s-invalid-backfill",
		Payload: map[string]any{
			"repositories":   "all",
			"backfill_since": "yesterday",
		},
	})
	if err != nil {
		t.Fatalf("repo selection submit returned error: %v", err)
	}
	if result.Status != nexadapter.SetupStatusRequiresInput {
		t.Fatalf("Status = %q, want requires_input", result.Status)
	}
	if !strings.Contains(result.Message, "backfill_since must be RFC3339") {
		t.Fatalf("Message = %q, want RFC3339 validation error", result.Message)
	}
}

func TestHealthConnected(t *testing.T) {
	server := bitbucketTestServer(t, http.StatusOK)
	defer server.Close()
	setRuntimeContext(t, "nexus-bitbucket", map[string]any{
		"workspace":             "nexus",
		"repositories":          []Repository{{FullName: "nexus-project/nex", Name: "nex"}},
		"poll_interval_seconds": 60,
	}, map[string]string{
		"provider": "bitbucket",
		"host":     server.URL,
		"token":    "workspace_token",
		"username": "octocat",
	})

	health, err := newGitAdapter().Health(context.Background(), "nexus-bitbucket")
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
	if health.AccountContact.Platform != "bitbucket" || health.AccountContact.SpaceID != server.URL || health.AccountContact.ContactID != "octocat" {
		t.Fatalf("AccountContact = %#v, want bitbucket/%s/octocat", health.AccountContact, server.URL)
	}
	if health.Details["provider"] != "bitbucket" {
		t.Fatalf("provider detail = %#v, want bitbucket", health.Details["provider"])
	}
	if health.Details["user"] != "octocat" {
		t.Fatalf("user detail = %#v, want octocat", health.Details["user"])
	}
}

func TestHealthDisconnected(t *testing.T) {
	server := bitbucketTestServer(t, http.StatusUnauthorized)
	defer server.Close()
	setRuntimeContext(t, "nexus-bitbucket", map[string]any{}, map[string]string{
		"provider": "bitbucket",
		"host":     server.URL,
		"token":    "bad_token",
		"username": "octocat",
	})

	health, err := newGitAdapter().Health(context.Background(), "nexus-bitbucket")
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
			"nexus-bitbucket": {
				AccountID:     "nexus-bitbucket",
				Provider:      "bitbucket",
				Workspace:     "Nexus",
				CredentialRef: "bitbucket/octocat",
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
	if accounts[0].CredentialRef != "bitbucket/octocat" {
		t.Fatalf("CredentialRef = %q, want bitbucket/octocat", accounts[0].CredentialRef)
	}
}

func bitbucketTestServer(t *testing.T, userStatus int) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/user", "/2.0/user":
			if userStatus != http.StatusOK {
				http.Error(w, "unauthorized", userStatus)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"username":     "octocat",
				"display_name": "Octocat",
				"account_id":   "{octocat}",
			})
		case "/user/workspaces", "/2.0/user/workspaces":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"values": []map[string]any{
					{
						"workspace": map[string]any{
							"slug": "nexus-project",
						},
					},
				},
			})
		case "/user/workspaces/nexus-project/permissions/repositories", "/2.0/user/workspaces/nexus-project/permissions/repositories":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"values": []map[string]any{
					{
						"repository": map[string]any{
							"full_name": "nexus-project/nex",
						},
					},
					{
						"repository": map[string]any{
							"full_name": "nexus-project/spike",
						},
					},
				},
			})
		case "/repositories/nexus-project/nex", "/2.0/repositories/nexus-project/nex":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"full_name": "nexus-project/nex",
				"name":      "nex",
				"slug":      "nex",
				"links": map[string]any{
					"clone": []map[string]any{
						{"name": "https", "href": "https://bitbucket.org/nexus-project/nex.git"},
					},
				},
				"workspace":  map[string]any{"slug": "nexus-project"},
				"mainbranch": map[string]any{"name": "main"},
			})
		case "/repositories/nexus-project/spike", "/2.0/repositories/nexus-project/spike":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"full_name": "nexus-project/spike",
				"name":      "spike",
				"slug":      "spike",
				"links": map[string]any{
					"clone": []map[string]any{
						{"name": "https", "href": "https://bitbucket.org/nexus-project/spike.git"},
					},
				},
				"workspace":  map[string]any{"slug": "nexus-project"},
				"mainbranch": map[string]any{"name": "main"},
			})
		default:
			http.NotFound(w, r)
		}
	}))
}
