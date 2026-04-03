package main

import (
	"context"
	"testing"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestInfoMatchesScaffoldSpec(t *testing.T) {
	info, err := newGitAdapter().Info(context.Background())
	if err != nil {
		t.Fatalf("Info returned error: %v", err)
	}

	if info.Platform != platformID {
		t.Fatalf("Platform = %q, want %q", info.Platform, platformID)
	}
	if info.Name != adapterName {
		t.Fatalf("Name = %q, want %q", info.Name, adapterName)
	}
	if info.Version != adapterVersion {
		t.Fatalf("Version = %q, want %q", info.Version, adapterVersion)
	}
	if !info.MultiAccount {
		t.Fatalf("MultiAccount = false, want true")
	}
	if info.Auth == nil || len(info.Auth.Methods) != 1 {
		t.Fatalf("expected a single auth method, got %#v", info.Auth)
	}

	method := info.Auth.Methods[0]
	if method.ID != "bitbucket_api_key" {
		t.Fatalf("Auth method ID = %q, want bitbucket_api_key", method.ID)
	}
	if method.Type != "custom_flow" {
		t.Fatalf("Auth method type = %q, want custom_flow", method.Type)
	}
	if info.CredentialService != platformID {
		t.Fatalf("CredentialService = %q, want %q", info.CredentialService, platformID)
	}
	if method.Service != platformID {
		t.Fatalf("Auth method service = %q, want %q", method.Service, platformID)
	}
	if info.Projection == nil {
		t.Fatalf("Projection = nil")
	}
	if info.Projection.Platform != "git" {
		t.Fatalf("Projection.Platform = %q, want git", info.Projection.Platform)
	}
	if len(info.Projection.Families) != 3 {
		t.Fatalf("Projection.Families = %#v", info.Projection.Families)
	}

	expectedOps := map[nexadapter.AdapterOperation]bool{
		nexadapter.OpAdapterInfo:            false,
		nexadapter.OpAdapterHealth:          false,
		nexadapter.OpAdapterConnectionsList: false,
		nexadapter.OpAdapterMonitorStart:    false,
		nexadapter.OpAdapterSetupStart:      false,
		nexadapter.OpAdapterSetupSubmit:     false,
		nexadapter.OpAdapterSetupStatus:     false,
		nexadapter.OpAdapterSetupCancel:     false,
		nexadapter.OpRecordsBackfill:        false,
	}
	for _, op := range info.Operations {
		if _, ok := expectedOps[op]; ok {
			expectedOps[op] = true
		}
	}
	for op, seen := range expectedOps {
		if !seen {
			t.Fatalf("missing operation %s", op)
		}
	}

	methodNames := map[string]bool{}
	for _, method := range info.Methods {
		methodNames[method.Name] = true
	}
	for _, name := range []string{
		"bitbucket.repositories.list",
		"bitbucket.branches.list",
		"bitbucket.commits.list",
		"bitbucket.pull_requests.list",
		"bitbucket.pull_requests.comments.list",
		"bitbucket.branches.create",
		"bitbucket.pull_requests.create",
		"bitbucket.pull_requests.comments.create",
		"bitbucket.pull_requests.merge",
	} {
		if !methodNames[name] {
			t.Fatalf("missing method %q", name)
		}
	}
}
