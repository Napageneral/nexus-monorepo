package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"

	provider "github.com/nexus-project/adapter-plaid/internal/plaid"
	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName    = "plaid-adapter"
	adapterVersion = "0.3.2"
	platformID     = "plaid"
)

var environmentName = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

func main() {
	nexadapter.Run(nexadapter.DefineAdapter(adapterConfig()))
}

func adapterConfig() nexadapter.DefineAdapterConfig[*provider.Client] {
	readOnly := false
	connectionOptional := false
	return nexadapter.DefineAdapterConfig[*provider.Client]{
		Platform:          platformID,
		Name:              adapterName,
		Version:           adapterVersion,
		MultiAccount:      true,
		CredentialService: "plaid-item",
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					ID:      "plaid_item_access_token",
					Type:    "api_key",
					Label:   "Plaid Item Access Token",
					Icon:    "key",
					Service: "plaid-item",
					Fields: []nexadapter.AdapterAuthField{
						{
							Name:        "access_token",
							Label:       "Item access token",
							Type:        "secret",
							Required:    true,
							Placeholder: "access-production-...",
						},
					},
				},
			},
			SetupGuide: "Cleanroom contract only. Plaid application credentials are runtime environment references; each durable connection credential contains only one Item access token. Plaid Link onboarding is not implemented in this package version.",
		},
		Capabilities: nexadapter.ChannelCapabilities{
			TextLimit: 20000,
		},
		Projection: &nexadapter.AdapterProjection{
			Platform: platformID,
			Families: []nexadapter.AdapterProjectionFamily{
				{Name: "item_health_snapshot", Description: "Append-only Item health, freshness, consent, and provider-error evidence."},
				{Name: "account_snapshot", Description: "Read-only account and balance source evidence."},
				{Name: "credit_liability_snapshot", Description: "Read-only credit liability source evidence."},
				{Name: "transaction_sync_packet", Description: "Bounded cursor response summaries with explicit commit permission and references to complete page evidence."},
				{Name: "transaction_sync_page", Description: "Complete provider page evidence emitted as bounded deterministic records."},
				{Name: "transaction_change", Description: "Append-only added, modified, and removed transaction evidence."},
			},
			Backfill: &nexadapter.AdapterProjectionSync{Supported: false},
			Monitor:  &nexadapter.AdapterProjectionSync{Supported: true, Strategy: "cursor_replay", Cursor: "transactions_sync_cursor"},
			RecordIDs: &nexadapter.AdapterProjectionRecordIDs{
				Record: "provider-transaction-action-payload-hash",
			},
			Normalization: &nexadapter.AdapterProjectionNormalize{Content: "json"},
		},
		Client: nexadapter.ClientFactory[*provider.Client]{
			Create: resolveClient,
		},
		Connection: nexadapter.ConnectionHandlers[*provider.Client]{
			Connections: listConnections,
			Health:      health,
		},
		Ingest: nexadapter.IngestHandlers[*provider.Client]{
			Monitor: monitor,
		},
		Methods: map[string]nexadapter.DeclaredMethod[*provider.Client]{
			"plaid.institutions.coverage": nexadapter.Method(nexadapter.DeclaredMethod[*provider.Client]{
				Description:        "Probe Plaid institution product coverage by institution id or search query without an Item credential.",
				Action:             "read",
				ConnectionRequired: &connectionOptional,
				MutatesRemote:      &readOnly,
				Params:             institutionCoverageParamsSchema(),
				Response:           objectResponseSchema("credential_bindings", "institutions"),
				Handler:            institutionCoverage,
			}),
			"plaid.item.get": nexadapter.Method(nexadapter.DeclaredMethod[*provider.Client]{
				Description:   "Read the Plaid Item and transaction update status for the bound connection.",
				Action:        "read",
				MutatesRemote: &readOnly,
				Params:        emptyParamsSchema(),
				Response:      objectResponseSchema("evidence", "credential_bindings", "item", "raw"),
				Handler:       getItem,
			}),
			"plaid.accounts.list": nexadapter.Method(nexadapter.DeclaredMethod[*provider.Client]{
				Description:   "Read accounts and provider-reported balances for the bound Plaid Item.",
				Action:        "read",
				MutatesRemote: &readOnly,
				Params:        emptyParamsSchema(),
				Response:      objectResponseSchema("evidence", "credential_bindings", "accounts", "raw"),
				Handler:       getAccounts,
			}),
			"plaid.accounts.balance.get": nexadapter.Method(nexadapter.DeclaredMethod[*provider.Client]{
				Description:   "Request a real-time balance snapshot for all or selected provider accounts.",
				Action:        "read",
				MutatesRemote: &readOnly,
				Params:        accountFilterParamsSchema(),
				Response:      objectResponseSchema("evidence", "credential_bindings", "accounts", "raw"),
				Handler:       getBalance,
			}),
			"plaid.liabilities.get": nexadapter.Method(nexadapter.DeclaredMethod[*provider.Client]{
				Description:   "Read credit-card liability facts for all or selected provider accounts.",
				Action:        "read",
				MutatesRemote: &readOnly,
				Params:        accountFilterParamsSchema(),
				Response:      objectResponseSchema("evidence", "credential_bindings", "credit", "raw"),
				Handler:       getLiabilities,
			}),
			"plaid.transactions.sync": nexadapter.Method(nexadapter.DeclaredMethod[*provider.Client]{
				Description:   "Read transaction changes after a cursor, restart concurrent provider mutations, and return explicit non-committable terminal evidence on any fetched-page failure.",
				Action:        "read",
				MutatesRemote: &readOnly,
				Params:        transactionSyncParamsSchema(),
				Response:      objectResponseSchema("credential_bindings", "completion_state", "cursor_commit_allowed", "next_cursor", "pages", "restarts", "added", "modified", "removed", "changes", "page_evidence", "raw_pages", "restart_evidence", "terminal_error"),
				Handler:       syncTransactions,
			}),
		},
	}
}

func resolveClient(ctx nexadapter.AdapterRuntimeContext) (*provider.Client, error) {
	environment := configString(ctx.Runtime, "environment")
	if environment == "" {
		environment = strings.TrimSpace(os.Getenv("PLAID_ENV"))
	}
	if environment == "" {
		environment = "sandbox"
	}
	environment = strings.ToLower(strings.TrimSpace(environment))
	baseURL, err := plaidBaseURL(environment)
	if err != nil {
		return nil, err
	}

	clientIDEnv, err := configEnvironmentName(ctx.Runtime, "app_client_id_env", "PLAID_CLIENT_ID", "PLAID_CLIENT_ID")
	if err != nil {
		return nil, err
	}
	clientIDFileEnv, err := configEnvironmentName(
		ctx.Runtime,
		"app_client_id_file_env",
		"PLAID_CLIENT_ID_FILE",
		"PLAID_CLIENT_ID_FILE",
	)
	if err != nil {
		return nil, err
	}
	secretDefault := "PLAID_SANDBOX_SECRET"
	secretFileDefault := "PLAID_SANDBOX_SECRET_FILE"
	if environment == "production" {
		secretDefault = "PLAID_PRODUCTION_SECRET"
		secretFileDefault = "PLAID_PRODUCTION_SECRET_FILE"
	} else if environment == "development" {
		secretDefault = "PLAID_DEVELOPMENT_SECRET"
		secretFileDefault = "PLAID_DEVELOPMENT_SECRET_FILE"
	}
	secretEnv, err := configEnvironmentName(
		ctx.Runtime,
		"app_secret_env",
		secretDefault,
		secretDefault,
	)
	if err != nil {
		return nil, err
	}
	secretFileEnv, err := configEnvironmentName(
		ctx.Runtime,
		"app_secret_file_env",
		secretFileDefault,
		"PLAID_SANDBOX_SECRET_FILE",
		"PLAID_DEVELOPMENT_SECRET_FILE",
		"PLAID_PRODUCTION_SECRET_FILE",
	)
	if err != nil {
		return nil, err
	}
	clientID, clientIDRef, err := loadApplicationCredential(clientIDEnv, clientIDFileEnv)
	if err != nil {
		return nil, fmt.Errorf("load Plaid app client credential: %w", err)
	}
	secret, secretRef, err := loadApplicationCredential(secretEnv, secretFileEnv)
	if err != nil {
		return nil, fmt.Errorf("load Plaid app secret credential: %w", err)
	}

	accessToken := ""
	itemCredentialRef := ""
	if ctx.Runtime != nil && ctx.Runtime.Credential != nil {
		accessToken = strings.TrimSpace(ctx.Runtime.Credential.Fields["access_token"])
		if accessToken == "" {
			accessToken = strings.TrimSpace(ctx.Runtime.Credential.Value)
		}
		itemCredentialRef = strings.TrimSpace(ctx.Runtime.Credential.Ref)
	}
	if itemCredentialRef == "" && strings.TrimSpace(ctx.ConnectionID) != "" {
		itemCredentialRef = "nexus-connection:" + strings.TrimSpace(ctx.ConnectionID)
	}

	return provider.NewClient(provider.Config{
		BaseURL:     baseURL,
		Environment: environment,
		ClientID:    clientID,
		Secret:      secret,
		AccessToken: accessToken,
		Bindings: provider.CredentialBindings{
			AppClientIDRef:     clientIDRef,
			AppSecretRef:       secretRef,
			ItemAccessTokenRef: itemCredentialRef,
		},
	})
}

func loadApplicationCredential(valueEnv string, fileEnv string) (string, string, error) {
	if path := strings.TrimSpace(os.Getenv(fileEnv)); path != "" {
		info, err := os.Lstat(path)
		if err != nil {
			return "", "file-env:" + fileEnv, err
		}
		if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
			return "", "file-env:" + fileEnv, fmt.Errorf("credential path must be a regular non-symlink file")
		}
		if info.Size() <= 0 || info.Size() > 64*1024 {
			return "", "file-env:" + fileEnv, fmt.Errorf("credential file size is outside the accepted range")
		}
		if info.Mode().Perm()&0o077 != 0 {
			return "", "file-env:" + fileEnv, fmt.Errorf("credential file permissions are too broad")
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return "", "file-env:" + fileEnv, err
		}
		value := strings.TrimSpace(string(raw))
		if value == "" {
			return "", "file-env:" + fileEnv, fmt.Errorf("credential file is empty")
		}
		return value, "file-env:" + fileEnv, nil
	}
	return strings.TrimSpace(os.Getenv(valueEnv)), "env:" + valueEnv, nil
}

func plaidBaseURL(environment string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(environment)) {
	case "sandbox":
		return "https://sandbox.plaid.com", nil
	case "development":
		return "https://development.plaid.com", nil
	case "production":
		return "https://production.plaid.com", nil
	default:
		return "", fmt.Errorf("unsupported Plaid environment %q", environment)
	}
}

func configString(runtime *nexadapter.RuntimeContext, name string) string {
	if runtime == nil || runtime.Config == nil {
		return ""
	}
	value, _ := runtime.Config[name].(string)
	return strings.TrimSpace(value)
}

func configEnvironmentName(runtime *nexadapter.RuntimeContext, configName string, fallback string, allowed ...string) (string, error) {
	name := configString(runtime, configName)
	if name == "" {
		name = fallback
	}
	if !environmentName.MatchString(name) {
		return "", fmt.Errorf("invalid environment variable reference for %s", configName)
	}
	for _, candidate := range allowed {
		if name == candidate {
			return name, nil
		}
	}
	return "", fmt.Errorf("environment variable reference %s is not allowed for %s", name, configName)
}

func listConnections(ctx nexadapter.AdapterContext[*provider.Client]) ([]nexadapter.AdapterConnectionIdentity, error) {
	connectionID := strings.TrimSpace(ctx.ConnectionID)
	if connectionID == "" && ctx.Runtime != nil {
		connectionID = strings.TrimSpace(ctx.Runtime.ConnectionID)
	}
	if connectionID == "" {
		return []nexadapter.AdapterConnectionIdentity{}, nil
	}
	status := "error"
	if ctx.Client != nil && ctx.Client.HasAppCredentials() && ctx.Client.HasItemCredential() {
		status = "ready"
	}
	return []nexadapter.AdapterConnectionIdentity{
		{
			ID:            connectionID,
			DisplayName:   connectionID,
			CredentialRef: ctx.Client.Bindings().ItemAccessTokenRef,
			Status:        status,
		},
	}, nil
}

func health(ctx nexadapter.AdapterContext[*provider.Client]) (*nexadapter.AdapterHealth, error) {
	probe, err := ctx.Client.ProbeHealth(ctx.Context)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: ctx.ConnectionID,
			Error:        err.Error(),
			Details: map[string]any{
				"environment":         ctx.Client.Environment(),
				"credential_bindings": ctx.Client.Bindings(),
			},
		}, nil
	}
	return &nexadapter.AdapterHealth{
		Connected:      probe.Connected,
		ConnectionID:   ctx.ConnectionID,
		Account:        connectionAccountForProbe(probe),
		AccountContact: accountContactForProbe(probe),
		LastEventAt:    probe.LastEventAtMS,
		Details: map[string]any{
			"provider_item_id":       probe.ProviderItemID,
			"institution_id":         probe.InstitutionID,
			"last_successful_update": probe.LastSuccessfulUpdate,
			"last_failed_update":     probe.LastFailedUpdate,
			"freshness_state":        probe.FreshnessState,
			"provider_error":         probe.ProviderError,
			"credential_bindings":    probe.CredentialBindings,
		},
	}, nil
}

func accountContactForProbe(probe provider.HealthProbe) *nexadapter.ConnectionAccountContact {
	return &nexadapter.ConnectionAccountContact{
		Platform:  platformID,
		SpaceID:   strings.TrimSpace(probe.InstitutionID),
		ContactID: strings.TrimSpace(probe.ProviderItemID),
	}
}

func connectionAccountForProbe(probe provider.HealthProbe) string {
	return strings.TrimSpace(probe.ProviderItemID)
}

type institutionCoverageInput struct {
	InstitutionIDs    []string `json:"institution_ids"`
	Query             string   `json:"query"`
	CountryCodes      []string `json:"country_codes"`
	RequestedProducts []string `json:"requested_products"`
	Count             int      `json:"count"`
}

func institutionCoverage(ctx nexadapter.AdapterContext[*provider.Client], request nexadapter.AdapterMethodRequest) (any, error) {
	var input institutionCoverageInput
	if err := decodePayload(request.Payload, &input); err != nil {
		return nil, err
	}
	return ctx.Client.ProbeInstitutionCoverage(ctx.Context, provider.InstitutionCoverageRequest{
		InstitutionIDs:    input.InstitutionIDs,
		Query:             input.Query,
		CountryCodes:      input.CountryCodes,
		RequestedProducts: input.RequestedProducts,
		Count:             input.Count,
	})
}

func getItem(ctx nexadapter.AdapterContext[*provider.Client], request nexadapter.AdapterMethodRequest) (any, error) {
	if err := decodePayload(request.Payload, &struct{}{}); err != nil {
		return nil, err
	}
	return ctx.Client.GetItem(ctx.Context)
}

func getAccounts(ctx nexadapter.AdapterContext[*provider.Client], request nexadapter.AdapterMethodRequest) (any, error) {
	if err := decodePayload(request.Payload, &struct{}{}); err != nil {
		return nil, err
	}
	return ctx.Client.GetAccounts(ctx.Context)
}

type accountFilterInput struct {
	ProviderAccountIDs []string `json:"provider_account_ids"`
}

func getBalance(ctx nexadapter.AdapterContext[*provider.Client], request nexadapter.AdapterMethodRequest) (any, error) {
	var input accountFilterInput
	if err := decodePayload(request.Payload, &input); err != nil {
		return nil, err
	}
	return ctx.Client.GetBalance(ctx.Context, input.ProviderAccountIDs)
}

func getLiabilities(ctx nexadapter.AdapterContext[*provider.Client], request nexadapter.AdapterMethodRequest) (any, error) {
	var input accountFilterInput
	if err := decodePayload(request.Payload, &input); err != nil {
		return nil, err
	}
	return ctx.Client.GetLiabilities(ctx.Context, input.ProviderAccountIDs)
}

type transactionSyncInput struct {
	Cursor      string `json:"cursor"`
	Count       int    `json:"count"`
	MaxPages    int    `json:"max_pages"`
	MaxRestarts *int   `json:"max_restarts"`
}

func syncTransactions(ctx nexadapter.AdapterContext[*provider.Client], request nexadapter.AdapterMethodRequest) (any, error) {
	var input transactionSyncInput
	if err := decodePayload(request.Payload, &input); err != nil {
		return nil, err
	}
	maxRestarts := 3
	if input.MaxRestarts != nil {
		maxRestarts = *input.MaxRestarts
	}
	return ctx.Client.SyncTransactions(ctx.Context, provider.SyncOptions{
		Cursor:      input.Cursor,
		Count:       input.Count,
		MaxPages:    input.MaxPages,
		MaxRestarts: maxRestarts,
	})
}

func decodePayload(payload map[string]any, target any) error {
	if payload == nil {
		payload = map[string]any{}
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode method payload: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("invalid method payload: %w", err)
	}
	return nil
}

func emptyParamsSchema() map[string]any {
	return map[string]any{"type": "object", "additionalProperties": false}
}

func stringArraySchema() map[string]any {
	return map[string]any{
		"type":     "array",
		"items":    map[string]any{"type": "string"},
		"maxItems": 100,
	}
}

func institutionCoverageParamsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"institution_ids":    stringArraySchema(),
			"query":              map[string]any{"type": "string", "minLength": 1, "maxLength": 100},
			"country_codes":      stringArraySchema(),
			"requested_products": stringArraySchema(),
			"count":              map[string]any{"type": "integer", "minimum": 1, "maximum": 10},
		},
		"additionalProperties": false,
	}
}

func accountFilterParamsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"provider_account_ids": stringArraySchema(),
		},
		"additionalProperties": false,
	}
}

func transactionSyncParamsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"cursor":       map[string]any{"type": "string"},
			"count":        map[string]any{"type": "integer", "minimum": 1, "maximum": 500},
			"max_pages":    map[string]any{"type": "integer", "minimum": 1, "maximum": 1000},
			"max_restarts": map[string]any{"type": "integer", "minimum": 0, "maximum": 10},
		},
		"additionalProperties": false,
	}
}

func objectResponseSchema(required ...string) map[string]any {
	properties := make(map[string]any, len(required))
	for _, name := range required {
		properties[name] = responsePropertySchema(name)
	}
	return map[string]any{
		"type":                 "object",
		"properties":           properties,
		"required":             required,
		"additionalProperties": true,
	}
}

func responsePropertySchema(name string) map[string]any {
	switch name {
	case "next_cursor":
		return map[string]any{"type": "string"}
	case "completion_state":
		return map[string]any{"type": "string", "enum": []string{"complete", "terminal_error"}}
	case "cursor_commit_allowed":
		return map[string]any{"type": "boolean"}
	case "pages", "restarts":
		return map[string]any{"type": "integer", "minimum": 0}
	case "institutions", "accounts", "credit", "added", "modified", "removed", "changes", "page_evidence", "restart_evidence":
		return map[string]any{
			"type":  "array",
			"items": map[string]any{"type": "object", "additionalProperties": true},
		}
	case "raw_pages":
		return map[string]any{"type": "array", "items": map[string]any{}}
	case "terminal_error":
		return map[string]any{"type": []string{"object", "null"}, "additionalProperties": true}
	case "evidence", "credential_bindings", "item":
		return map[string]any{"type": "object", "additionalProperties": true}
	case "raw":
		return map[string]any{}
	default:
		return map[string]any{}
	}
}
