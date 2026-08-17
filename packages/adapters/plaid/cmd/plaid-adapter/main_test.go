package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	provider "github.com/nexus-project/adapter-plaid/internal/plaid"
	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestAdapterDeclaresOnlyReadOnlyProviderMethods(t *testing.T) {
	t.Parallel()
	adapter := nexadapter.DefineAdapter(adapterConfig())
	info, err := adapter.Operations.AdapterInfo(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	wantNames := []string{
		"plaid.accounts.balance.get",
		"plaid.accounts.list",
		"plaid.institutions.coverage",
		"plaid.item.get",
		"plaid.liabilities.get",
		"plaid.transactions.sync",
	}
	gotNames := make([]string, 0, len(info.Methods))
	for _, method := range info.Methods {
		gotNames = append(gotNames, method.Name)
		if method.Action != "read" || method.MutatesRemote {
			t.Fatalf("method %s is not fail-closed read-only: %+v", method.Name, method)
		}
	}
	sort.Strings(gotNames)
	if !equalStrings(gotNames, wantNames) {
		t.Fatalf("method names = %#v, want %#v", gotNames, wantNames)
	}
	if info.Projection == nil || info.Projection.Backfill == nil || info.Projection.Backfill.Supported || info.Projection.Monitor == nil || !info.Projection.Monitor.Supported {
		t.Fatalf("monitor projection must be enabled while automatic backfill remains disabled: %+v", info.Projection)
	}
	raw, err := json.Marshal(info)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, prohibitedSchemaField()) {
		t.Fatal("adapter reflection contains prohibited schema field")
	}
}

func TestManifestMatchesReadOnlyMethodSurface(t *testing.T) {
	t.Parallel()
	raw, err := os.ReadFile(filepath.Join("..", "..", "adapter.nexus.json"))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, prohibitedSchemaField()) {
		t.Fatal("manifest contains prohibited schema field")
	}
	var manifest struct {
		Methods map[string]struct {
			Description        string         `json:"description"`
			Action             string         `json:"action"`
			ConnectionRequired bool           `json:"connection_required"`
			MutatesRemote      bool           `json:"mutates_remote"`
			Params             map[string]any `json:"params"`
			Response           map[string]any `json:"response"`
		} `json:"methods"`
	}
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatal(err)
	}
	if len(manifest.Methods) != 6 {
		t.Fatalf("manifest method count = %d", len(manifest.Methods))
	}
	adapter := nexadapter.DefineAdapter(adapterConfig())
	info, err := adapter.Operations.AdapterInfo(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	infoRaw, err := json.Marshal(info)
	if err != nil {
		t.Fatal(err)
	}
	var reflectionSurface struct {
		Methods []struct {
			Name               string         `json:"name"`
			Description        string         `json:"description"`
			Action             string         `json:"action"`
			ConnectionRequired bool           `json:"connection_required"`
			MutatesRemote      bool           `json:"mutates_remote"`
			Params             map[string]any `json:"params"`
			Response           map[string]any `json:"response"`
		} `json:"methods"`
	}
	if err := json.Unmarshal(infoRaw, &reflectionSurface); err != nil {
		t.Fatal(err)
	}
	reflected := make(map[string]struct {
		Description        string
		Action             string
		ConnectionRequired bool
		MutatesRemote      bool
		Params             map[string]any
		Response           map[string]any
	}, len(reflectionSurface.Methods))
	for _, method := range reflectionSurface.Methods {
		reflected[method.Name] = struct {
			Description        string
			Action             string
			ConnectionRequired bool
			MutatesRemote      bool
			Params             map[string]any
			Response           map[string]any
		}{method.Description, method.Action, method.ConnectionRequired, method.MutatesRemote, method.Params, method.Response}
	}
	if len(reflected) != len(manifest.Methods) {
		t.Fatalf("reflection method count = %d, manifest = %d", len(reflected), len(manifest.Methods))
	}
	for name, method := range manifest.Methods {
		if method.Action != "read" || method.MutatesRemote {
			t.Fatalf("manifest method %s is not read-only", name)
		}
		properties, _ := method.Response["properties"].(map[string]any)
		required, _ := method.Response["required"].([]any)
		if len(properties) == 0 || len(required) == 0 {
			t.Fatalf("manifest method %s response is not typed", name)
		}
		for propertyName, propertyValue := range properties {
			if propertyName == "raw" {
				continue
			}
			property, _ := propertyValue.(map[string]any)
			if _, ok := property["type"]; !ok {
				t.Fatalf("manifest method %s response property %s has no type", name, propertyName)
			}
		}
		reflectedMethod, ok := reflected[name]
		if !ok {
			t.Fatalf("manifest method %s is absent from reflection", name)
		}
		if reflectedMethod.Description != method.Description || reflectedMethod.Action != method.Action || reflectedMethod.ConnectionRequired != method.ConnectionRequired || reflectedMethod.MutatesRemote != method.MutatesRemote || !reflect.DeepEqual(reflectedMethod.Params, method.Params) || !reflect.DeepEqual(reflectedMethod.Response, method.Response) {
			t.Fatalf("manifest/reflection mismatch for %s\nmanifest=%+v\nreflection=%+v", name, method, reflectedMethod)
		}
	}
}

func TestRuntimeCredentialCannotSupplyGlobalAppSecrets(t *testing.T) {
	t.Setenv("PLAID_ENV", "production")
	t.Setenv("PLAID_CLIENT_ID", "")
	t.Setenv("PLAID_PRODUCTION_SECRET", "")
	client, err := resolveClient(nexadapter.AdapterRuntimeContext{
		ConnectionID: "synthetic-connection",
		Runtime: &nexadapter.RuntimeContext{
			Platform:     "plaid",
			ConnectionID: "synthetic-connection",
			Config:       map[string]any{"environment": "production"},
			Credential: &nexadapter.RuntimeCredential{
				Value: "synthetic-item-token",
				Ref:   "nexus-credential:synthetic-item",
				Fields: map[string]string{
					"client_id":    "must-not-be-used",
					"secret":       "must-not-be-used",
					"access_token": "synthetic-item-token",
				},
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if client.HasAppCredentials() {
		t.Fatal("connection credential fields incorrectly supplied global app credentials")
	}
	if !client.HasItemCredential() {
		t.Fatal("bound Item credential was not loaded")
	}
	bindings := client.Bindings()
	if bindings.AppClientIDRef != "env:PLAID_CLIENT_ID" || bindings.AppSecretRef != "env:PLAID_PRODUCTION_SECRET" || bindings.ItemAccessTokenRef != "nexus-credential:synthetic-item" {
		t.Fatalf("credential references were not kept separate: %+v", bindings)
	}
}

func TestDefaultEnvironmentIsSandbox(t *testing.T) {
	t.Setenv("PLAID_ENV", "")
	t.Setenv("PLAID_CLIENT_ID", "synthetic-client")
	t.Setenv("PLAID_SANDBOX_SECRET", "synthetic-secret")
	client, err := resolveClient(nexadapter.AdapterRuntimeContext{})
	if err != nil {
		t.Fatal(err)
	}
	if client.Environment() != "sandbox" {
		t.Fatalf("default environment = %q", client.Environment())
	}
}

func TestHealthPublishesAuthoritativePlaidItemContact(t *testing.T) {
	t.Parallel()
	probe := provider.HealthProbe{
		Connected:      true,
		ProviderItemID: "item-synthetic-123",
		InstitutionID:  "ins_10",
	}
	contact := accountContactForProbe(probe)
	if contact.Platform != "plaid" || contact.SpaceID != "ins_10" || contact.ContactID != "item-synthetic-123" {
		t.Fatalf("unexpected Plaid Item account contact: %+v", contact)
	}
	if account := connectionAccountForProbe(probe); account != "item-synthetic-123" {
		t.Fatalf("canonical connection account = %q", account)
	}
}

func TestRuntimeConfigCannotRedirectAppSecretLookup(t *testing.T) {
	t.Setenv("PLAID_ENV", "production")
	_, err := resolveClient(nexadapter.AdapterRuntimeContext{
		Runtime: &nexadapter.RuntimeContext{
			Platform:     "plaid",
			ConnectionID: "synthetic-connection",
			Config: map[string]any{
				"environment":    "production",
				"app_secret_env": "MERCURY_API_TOKEN",
			},
		},
	})
	if err == nil {
		t.Fatal("expected non-Plaid environment reference to be rejected")
	}
}

func TestApplicationCredentialsCanLoadFromRestrictedFiles(t *testing.T) {
	t.Setenv("PLAID_ENV", "production")
	t.Setenv("PLAID_CLIENT_ID", "")
	t.Setenv("PLAID_PRODUCTION_SECRET", "")
	directory := t.TempDir()
	clientIDPath := filepath.Join(directory, "client-id")
	secretPath := filepath.Join(directory, "secret")
	if err := os.WriteFile(clientIDPath, []byte("synthetic-client\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(secretPath, []byte("synthetic-secret\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PLAID_CLIENT_ID_FILE", clientIDPath)
	t.Setenv("PLAID_PRODUCTION_SECRET_FILE", secretPath)

	client, err := resolveClient(nexadapter.AdapterRuntimeContext{
		ConnectionID: "synthetic-connection",
		Runtime: &nexadapter.RuntimeContext{
			Platform:     "plaid",
			ConnectionID: "synthetic-connection",
			Config:       map[string]any{"environment": "production"},
			Credential: &nexadapter.RuntimeCredential{
				Value:  "synthetic-item-token",
				Ref:    "nexus-credential:synthetic-item",
				Fields: map[string]string{"access_token": "synthetic-item-token"},
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !client.HasAppCredentials() || !client.HasItemCredential() {
		t.Fatal("file-backed application credentials or Item credential were not loaded")
	}
	bindings := client.Bindings()
	if bindings.AppClientIDRef != "file-env:PLAID_CLIENT_ID_FILE" ||
		bindings.AppSecretRef != "file-env:PLAID_PRODUCTION_SECRET_FILE" {
		t.Fatalf("unexpected file-backed credential references: %+v", bindings)
	}
}

func TestApplicationCredentialFileRejectsBroadPermissions(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "secret")
	if err := os.WriteFile(path, []byte("synthetic-secret\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PLAID_PRODUCTION_SECRET_FILE", path)
	if _, _, err := loadApplicationCredential("PLAID_PRODUCTION_SECRET", "PLAID_PRODUCTION_SECRET_FILE"); err == nil {
		t.Fatal("expected broadly readable credential file to be rejected")
	}
}

func TestPollPlaidSourceEmitsImmutablePacketsAndChanges(t *testing.T) {
	t.Parallel()
	fixedNow := time.Date(2026, 7, 29, 15, 30, 0, 0, time.UTC)
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/item/get":
			_, _ = response.Write([]byte(`{
				"item": {
					"item_id": "item-synthetic",
					"institution_id": "ins_synthetic",
					"available_products": [],
					"billed_products": ["transactions"],
					"products": ["transactions"],
					"consent_expiration_time": "2027-07-29T00:00:00Z",
					"update_type": "background",
					"error": null,
					"status": {"transactions": {"last_successful_update": "2026-07-29T15:00:00Z", "last_failed_update": ""}}
				},
				"request_id": "request-item"
			}`))
		case "/accounts/get":
			_, _ = response.Write([]byte(`{
				"accounts": [{
					"account_id": "account-synthetic",
					"name": "Synthetic Card",
					"official_name": "Synthetic Business Card",
					"mask": "1000",
					"type": "credit",
					"subtype": "credit card",
					"balances": {"available": 1000, "current": 250, "limit": 1250, "iso_currency_code": "USD"}
				}],
				"request_id": "request-accounts"
			}`))
		case "/transactions/sync":
			_, _ = response.Write([]byte(`{
				"added": [{
					"transaction_id": "transaction-synthetic",
					"account_id": "account-synthetic",
					"pending": false,
					"date": "2026-07-29",
					"name": "Synthetic merchant",
					"merchant_name": "Synthetic merchant",
					"amount": 19.95,
					"iso_currency_code": "USD"
				}],
				"modified": [],
				"removed": [],
				"next_cursor": "cursor-synthetic",
				"has_more": false,
				"request_id": "request-sync"
			}`))
		default:
			http.NotFound(response, request)
		}
	}))
	t.Cleanup(server.Close)
	client, err := provider.NewClient(provider.Config{
		BaseURL:     server.URL,
		Environment: "production",
		ClientID:    "synthetic-client",
		Secret:      "synthetic-secret",
		AccessToken: "synthetic-token",
		Bindings: provider.CredentialBindings{
			AppClientIDRef:     "test:client",
			AppSecretRef:       "test:secret",
			ItemAccessTokenRef: "test:item",
		},
		Now: func() time.Time { return fixedNow },
	})
	if err != nil {
		t.Fatal(err)
	}

	var emitted []nexadapter.AdapterInboundRecord
	nextCursor, err := pollPlaidSource(
		context.Background(),
		client,
		"moonsleep-plaid-amex",
		"",
		func(record any) {
			typed, ok := record.(nexadapter.AdapterInboundRecord)
			if !ok {
				t.Fatalf("unexpected record type %T", record)
			}
			emitted = append(emitted, typed)
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if nextCursor != "cursor-synthetic" {
		t.Fatalf("next cursor = %q", nextCursor)
	}
	if len(emitted) != 5 {
		t.Fatalf("emitted %d records, want 5", len(emitted))
	}
	wantFamilies := []string{
		"item_health_snapshot",
		"account_snapshot",
		"transaction_sync_packet",
		"transaction_sync_page",
		"transaction_change",
	}
	for index, record := range emitted {
		if record.Operation != "record.ingest" ||
			record.Routing.Platform != "plaid" ||
			record.Routing.ConnectionID != "moonsleep-plaid-amex" ||
			record.Routing.ReceiverID != "moonsleep-plaid-amex" {
			t.Fatalf("record %d routing is not connection-bound: %+v", index, record.Routing)
		}
		if record.Payload.Metadata["family"] != wantFamilies[index] {
			t.Fatalf("record %d family = %#v", index, record.Payload.Metadata["family"])
		}
		if record.Payload.Metadata["automation_eligible"] != false ||
			record.Payload.Metadata["source_observation_reason"] != "plaid_readonly_financial_source" {
			t.Fatalf("record %d is not marked as a source-only observation: %#v", index, record.Payload.Metadata)
		}
		if strings.TrimSpace(record.Payload.ExternalRecordID) == "" {
			t.Fatalf("record %d has no external id", index)
		}
		raw, marshalErr := json.Marshal(record)
		if marshalErr != nil {
			t.Fatal(marshalErr)
		}
		if bytes.Contains(raw, prohibitedSchemaField()) {
			t.Fatalf("record %d contains prohibited schema field", index)
		}
		if bytes.Contains(raw, []byte("synthetic-token")) ||
			bytes.Contains(raw, []byte("synthetic-client")) ||
			bytes.Contains(raw, []byte("synthetic-secret")) {
			t.Fatalf("record %d leaked a credential", index)
		}
	}
	change, ok := emitted[4].Payload.Payload["change"].(provider.TransactionChange)
	if !ok || change.Amount == nil || change.Amount.MinorUnits != "1995" {
		t.Fatalf("transaction change did not preserve exact money: %#v", emitted[4].Payload.Payload["change"])
	}
}

func TestPollPlaidSourceRetainsCursorAndEmitsTerminalPacket(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/item/get":
			_, _ = response.Write([]byte(`{
				"item": {
					"item_id": "item-synthetic",
					"institution_id": "ins_synthetic",
					"available_products": [],
					"billed_products": ["transactions"],
					"products": ["transactions"],
					"error": null,
					"status": {"transactions": {"last_successful_update": "2026-07-29T15:00:00Z", "last_failed_update": ""}}
				},
				"request_id": "request-item"
			}`))
		case "/accounts/get":
			_, _ = response.Write([]byte(`{"accounts": [], "request_id": "request-accounts"}`))
		case "/transactions/sync":
			_, _ = response.Write([]byte(`{
				"added": [],
				"modified": [],
				"removed": [],
				"next_cursor": "",
				"has_more": false,
				"request_id": "request-sync"
			}`))
		default:
			http.NotFound(response, request)
		}
	}))
	t.Cleanup(server.Close)
	client, err := provider.NewClient(provider.Config{
		BaseURL:     server.URL,
		Environment: "production",
		ClientID:    "synthetic-client",
		Secret:      "synthetic-secret",
		AccessToken: "synthetic-token",
		Now:         func() time.Time { return time.Date(2026, 7, 29, 15, 30, 0, 0, time.UTC) },
	})
	if err != nil {
		t.Fatal(err)
	}

	var emitted []nexadapter.AdapterInboundRecord
	nextCursor, err := pollPlaidSource(
		context.Background(),
		client,
		"moonsleep-plaid-chase",
		"committed-cursor",
		func(record any) {
			emitted = append(emitted, record.(nexadapter.AdapterInboundRecord))
		},
	)
	if err == nil {
		t.Fatal("expected terminal sync to fail closed")
	}
	if nextCursor != "committed-cursor" {
		t.Fatalf("terminal sync advanced cursor to %q", nextCursor)
	}
	if len(emitted) != 4 || emitted[2].Payload.Metadata["family"] != "transaction_sync_packet" {
		t.Fatalf("terminal packet was not emitted before failure: %+v", emitted)
	}
	result, ok := emitted[2].Payload.Payload["sync_result"].(map[string]any)
	if !ok || result["completion_state"] != "terminal_error" || result["cursor_commit_allowed"] != false {
		t.Fatalf("terminal packet did not preserve non-committable evidence: %#v", emitted[2].Payload.Payload["sync_result"])
	}
}

func TestTransactionSyncSummaryStaysBoundedForLargeHistory(t *testing.T) {
	t.Parallel()
	result := provider.TransactionSyncResult{
		CompletionState:     "complete",
		CursorCommitAllowed: true,
		NextCursor:          "cursor-complete",
		Pages:               8,
		Added:               make([]provider.Transaction, 795),
		Changes:             make([]provider.TransactionChange, 795),
	}
	for index := 0; index < 8; index++ {
		result.PageEvidence = append(result.PageEvidence, provider.SourceEvidence{
			Provider:          "plaid",
			Endpoint:          "/transactions/sync",
			FetchedAt:         "2026-07-29T15:00:00Z",
			PayloadSHA256:     fmt.Sprintf("%064x", index+1),
			PayloadEncoding:   "base64",
			PayloadBodyBase64: strings.Repeat("A", 120_000),
			PayloadComplete:   true,
			PayloadBytes:      90_000,
		})
		result.RawPages = append(
			result.RawPages,
			json.RawMessage(`{"transactions_update_status":"HISTORICAL_UPDATE_COMPLETE"}`),
		)
	}
	item := provider.ItemSummary{
		ProviderItemID: "item-large",
		InstitutionID:  "ins_large",
	}
	packet := buildTransactionSyncPacketRecord("connection-large", item, result)
	packetRaw, err := json.Marshal(packet)
	if err != nil {
		t.Fatal(err)
	}
	if len(packetRaw) > 16_000 {
		t.Fatalf("bounded sync summary grew to %d bytes", len(packetRaw))
	}
	pages := buildTransactionSyncPageRecords("connection-large", item, result)
	if len(pages) != 8 {
		t.Fatalf("page records = %d, want 8", len(pages))
	}
	for index, page := range pages {
		raw, marshalErr := json.Marshal(page)
		if marshalErr != nil {
			t.Fatal(marshalErr)
		}
		if len(raw) > 256_000 {
			t.Fatalf("page record %d grew to %d bytes", index+1, len(raw))
		}
		if page.Payload.Payload["transactions_update_status"] != "HISTORICAL_UPDATE_COMPLETE" {
			t.Fatalf("page %d lost historical completion status", index+1)
		}
	}
}

func equalStrings(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func prohibitedSchemaField() []byte {
	return []byte{0x22, 0x6b, 0x69, 0x6e, 0x64, 0x22}
}
