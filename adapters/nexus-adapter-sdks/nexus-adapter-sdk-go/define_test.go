package nexadapter

import (
	"context"
	"encoding/json"
	"os"
	"testing"
)

func boolPtr(v bool) *bool {
	return &v
}

func TestDefineAdapterBuildsInfoAndDefaults(t *testing.T) {
	adapter := DefineAdapter[struct{}](DefineAdapterConfig[struct{}]{
		Platform:          "jira",
		Name:              "Jira Cloud",
		Version:           "1.0.0",
		MultiAccount:      true,
		CredentialService: "atlassian",
		Capabilities: ChannelCapabilities{
			TextLimit:        32000,
			SupportsMarkdown: true,
		},
		Methods: map[string]DeclaredMethod[struct{}]{
			"jira.issues.transition": Method(DeclaredMethod[struct{}]{
				Description:        "Transition an issue",
				Action:             "write",
				ConnectionRequired: boolPtr(true),
				MutatesRemote:      boolPtr(true),
				Handler: func(ctx AdapterContext[struct{}], req AdapterMethodRequest) (any, error) {
					return map[string]any{"ok": true}, nil
				},
			}),
		},
	})

	info, err := adapter.Operations.AdapterInfo(context.Background())
	if err != nil {
		t.Fatalf("AdapterInfo: %v", err)
	}
	if info.Platform != "jira" {
		t.Fatalf("platform = %q", info.Platform)
	}
	if len(info.Methods) != 1 {
		t.Fatalf("methods = %d", len(info.Methods))
	}
	if info.Methods[0].Name != "jira.issues.transition" {
		t.Fatalf("method name = %q", info.Methods[0].Name)
	}
	if !info.Methods[0].ConnectionRequired {
		t.Fatalf("connection_required should default from declaration")
	}
	if !info.Methods[0].MutatesRemote {
		t.Fatalf("mutates_remote should default from declaration")
	}
	if info.MethodCatalog == nil || info.MethodCatalog.Namespace != "jira" {
		t.Fatalf("methodCatalog = %#v", info.MethodCatalog)
	}
}

func TestDefineAdapterDefaultAccountsUsesRuntimeContext(t *testing.T) {
	t.Setenv(AdapterContextEnvVar, writeTempRuntimeContext(t, RuntimeContext{
		Platform:     "jira",
		ConnectionID: "jira-prod",
		Config:       map[string]any{},
		Credential: &RuntimeCredential{
			Kind:  "token",
			Value: "secret",
			Ref:   "atlassian/jira-prod",
		},
	}))

	adapter := DefineAdapter[struct{}](DefineAdapterConfig[struct{}]{
		Platform: "jira",
		Name:     "Jira Cloud",
		Version:  "1.0.0",
		Capabilities: ChannelCapabilities{
			TextLimit:        32000,
			SupportsMarkdown: true,
		},
	})

	accounts, err := adapter.Operations.AdapterAccountsList(context.Background())
	if err != nil {
		t.Fatalf("AdapterAccountsList: %v", err)
	}
	if len(accounts) != 1 {
		t.Fatalf("accounts len = %d", len(accounts))
	}
	if accounts[0].ID != "jira-prod" {
		t.Fatalf("account id = %q", accounts[0].ID)
	}
	if accounts[0].CredentialRef != "atlassian/jira-prod" {
		t.Fatalf("credential_ref = %q", accounts[0].CredentialRef)
	}
}

func writeTempRuntimeContext(t *testing.T, runtimeCtx RuntimeContext) string {
	t.Helper()

	raw, err := json.Marshal(runtimeCtx)
	if err != nil {
		t.Fatalf("marshal runtime context: %v", err)
	}

	file, err := os.CreateTemp(t.TempDir(), "runtime-context-*.json")
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	if _, err := file.Write(raw); err != nil {
		t.Fatalf("write temp runtime context: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close temp runtime context: %v", err)
	}
	return file.Name()
}
