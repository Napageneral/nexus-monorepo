package main

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/nexus-project/adapter-mercury/internal/catalog"
	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName    = "mercury-adapter"
	adapterVersion = "0.3.1"
	platformID     = "mercury"
)

func main() {
	nexadapter.Run(nexadapter.DefineAdapter(adapterConfig()))
}

func adapterConfig() nexadapter.DefineAdapterConfig[*mercuryClient] {
	return nexadapter.DefineAdapterConfig[*mercuryClient]{
		Platform:          platformID,
		Name:              adapterName,
		Version:           adapterVersion,
		MultiAccount:      true,
		CredentialService: platformID,
		MethodCatalog: &nexadapter.AdapterMethodCatalog{
			Source:    "openapi",
			Document:  "internal/catalog/operations.catalog.json",
			Namespace: "mercury.api",
		},
		Projection: mercuryProjection(),
		Client: nexadapter.ClientFactory[*mercuryClient]{
			Create: loadMercuryClient,
		},
		Connection: nexadapter.ConnectionHandlers[*mercuryClient]{
			Connections: mercuryConnections,
			Health:      mercuryHealth,
		},
		Ingest: nexadapter.IngestHandlers[*mercuryClient]{
			Monitor:  mercuryMonitor,
			Backfill: mercuryBackfill,
		},
		Methods: mercuryMethods(),
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					ID:      "mercury_api_token",
					Type:    "api_key",
					Label:   "Connect Mercury API Token",
					Icon:    "key",
					Service: platformID,
					Fields: []nexadapter.AdapterAuthField{
						{
							Name:     "connection_role",
							Label:    "Connection Role",
							Type:     "select",
							Required: true,
							Options: []nexadapter.AdapterAuthFieldOption{
								{Label: "Primary Read", Value: string(rolePrimaryRead)},
								{Label: "AP Request", Value: string(roleAPRequest)},
							},
						},
						{
							Name:        "api_token",
							Label:       "API Token",
							Type:        "secret",
							Required:    true,
							Placeholder: "Mercury API token",
						},
					},
				},
			},
			SetupGuide: "Use a least-privilege Mercury token and select its exact logical role. The read-only package never executes provider mutations.",
		},
		Capabilities: nexadapter.ChannelCapabilities{
			TextLimit:             20000,
			SupportsMarkdown:      false,
			SupportsTables:        false,
			SupportsCodeBlocks:    false,
			SupportsEmbeds:        false,
			SupportsThreads:       false,
			SupportsReactions:     false,
			SupportsPolls:         false,
			SupportsButtons:       false,
			SupportsEdit:          false,
			SupportsDelete:        false,
			SupportsMedia:         false,
			SupportsVoiceNotes:    false,
			SupportsStreamingEdit: false,
		},
	}
}

func mercuryProjection() *nexadapter.AdapterProjection {
	return &nexadapter.AdapterProjection{
		Platform: platformID,
		Families: []nexadapter.AdapterProjectionFamily{
			{Name: "account_snapshot", Description: "Immutable Mercury account state revisions"},
			{Name: "transaction_revision", Description: "Immutable Mercury transaction revisions"},
			{Name: "recipient_revision", Description: "Immutable Mercury recipient revisions"},
			{Name: "approval_request_revision", Description: "Immutable approval-request revisions"},
			{Name: "payment_revision", Description: "Immutable payment-state revisions"},
			{Name: "scheduled_payment_observation", Description: "Observed scheduled-payment state"},
			{Name: "statement_revision", Description: "Immutable statement revisions"},
			{Name: "attachment_revision", Description: "Immutable attachment revisions"},
			{Name: "api_capture_receipt", Description: "Hash-bound provider capture receipts"},
		},
		Backfill: &nexadapter.AdapterProjectionSync{
			Supported: true,
			Strategy:  "bounded provider API pages projected as immutable record revisions",
			Cursor:    "provider-created timestamp for transactions; exact-content replay for state snapshots",
		},
		Monitor: &nexadapter.AdapterProjectionSync{
			Supported: true,
			Strategy:  "five-minute bounded polling with a 24-hour replay window and content-addressed idempotency",
			Cursor:    "successful capture time with transaction replay from the prior cursor",
		},
		Routing: &nexadapter.AdapterProjectionRouting{
			Space:            "organization",
			Container:        "record_family",
			Thread:           "provider_object_id",
			ThreadsSupported: true,
		},
		RecordIDs: &nexadapter.AdapterProjectionRecordIDs{
			Record:    "provider + environment + connection_role + record_family + provider_object_id + canonical_payload_sha256",
			Container: "record_family",
			Thread:    "provider_object_id",
		},
		Normalization: &nexadapter.AdapterProjectionNormalize{
			Content:     "exact provider page retained with SHA-256 receipt; object revisions use deterministic canonical JSON",
			Attachments: true,
		},
	}
}

func mercuryMethods() map[string]nexadapter.DeclaredMethod[*mercuryClient] {
	methods := map[string]nexadapter.DeclaredMethod[*mercuryClient]{}
	for _, operation := range catalog.MustOperations() {
		if operation.Visibility != "public" {
			continue
		}
		operation := operation
		action := "read"
		mutatesRemote := false
		if operation.HTTPMethod != http.MethodGet {
			action = "write"
			mutatesRemote = true
		}
		name := "mercury.api." + operation.OperationID
		methods[name] = nexadapter.Method(nexadapter.DeclaredMethod[*mercuryClient]{
			Description:        methodDescription(operation),
			Action:             action,
			Params:             mercuryMethodParams(operation),
			Response:           mercuryMethodResponseSchema(),
			ConnectionRequired: boolPointer(true),
			MutatesRemote:      boolPointer(mutatesRemote),
			Handler: func(ctx nexadapter.AdapterContext[*mercuryClient], req nexadapter.AdapterMethodRequest) (any, error) {
				return ctx.Client.invoke(ctx.Context, operation, req.Payload)
			},
		})
	}
	return methods
}

func methodDescription(operation catalog.Operation) string {
	if _, excluded := sensitiveExcludedOperations[operation.OperationID]; excluded {
		return fmt.Sprintf("%s %s. Reflected for catalog parity but permanently excluded.", operation.HTTPMethod, operation.Path)
	}
	if operation.HTTPMethod != http.MethodGet {
		return fmt.Sprintf("%s %s. Reflected for catalog parity but disabled in the read-only build.", operation.HTTPMethod, operation.Path)
	}
	if _, apRead := apReadOperations[operation.OperationID]; apRead {
		return fmt.Sprintf("%s %s through the AP-request role or proven primary-read shadow.", operation.HTTPMethod, operation.Path)
	}
	return fmt.Sprintf("%s %s through the primary-read role.", operation.HTTPMethod, operation.Path)
}

func mercuryMethodParams(operation catalog.Operation) map[string]any {
	properties := map[string]any{
		"path_parameters": map[string]any{
			"type":                 "object",
			"additionalProperties": map[string]any{"type": "string"},
		},
		"query": map[string]any{
			"type": "object",
			"additionalProperties": map[string]any{
				"oneOf": []any{
					map[string]any{"type": "string"},
					map[string]any{"type": "number"},
					map[string]any{"type": "boolean"},
					map[string]any{
						"type": "array",
						"items": map[string]any{
							"oneOf": []any{
								map[string]any{"type": "string"},
								map[string]any{"type": "number"},
								map[string]any{"type": "boolean"},
							},
						},
					},
				},
			},
		},
		"auto_paginate": map[string]any{"type": "boolean", "default": false},
		"max_pages":     map[string]any{"type": "integer", "minimum": 1, "maximum": maxPages, "default": 1},
	}
	if operation.HTTPMethod != http.MethodGet {
		properties["body"] = map[string]any{"type": "object"}
	}
	return map[string]any{
		"type":                 "object",
		"properties":           properties,
		"additionalProperties": false,
	}
}

func mercuryMethodResponseSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"provider_operation_id":    map[string]any{"type": "string"},
			"connection_role":          map[string]any{"type": "string", "enum": []string{string(rolePrimaryRead), string(roleAPRequest)}},
			"pages":                    map[string]any{"type": "array", "items": map[string]any{"type": "object"}},
			"page_count":               map[string]any{"type": "integer", "minimum": 0},
			"complete":                 map[string]any{"type": "boolean"},
			"provider_calls":           map[string]any{"type": "integer", "minimum": 0},
			"provider_write_attempted": map[string]any{"type": "boolean", "enum": []bool{false}},
		},
		"required": []string{
			"provider_operation_id",
			"connection_role",
			"pages",
			"page_count",
			"complete",
			"provider_calls",
			"provider_write_attempted",
		},
		"additionalProperties": false,
	}
}

func mercuryConnections(ctx nexadapter.AdapterContext[*mercuryClient]) ([]nexadapter.AdapterConnectionIdentity, error) {
	client := ctx.Client
	return []nexadapter.AdapterConnectionIdentity{
		{
			ID:            client.connectionID,
			DisplayName:   fmt.Sprintf("Mercury %s", client.role),
			Account:       string(client.role),
			CredentialRef: client.credentialRef,
			Status:        "ready",
		},
	}, nil
}

func mercuryHealth(ctx nexadapter.AdapterContext[*mercuryClient]) (*nexadapter.AdapterHealth, error) {
	client := ctx.Client
	operationID := "getAccounts"
	if client.role == roleAPRequest {
		operationID = "getRecipients"
	}
	var operation catalog.Operation
	found := false
	for _, candidate := range catalog.MustOperations() {
		if candidate.OperationID == operationID {
			operation = candidate
			found = true
			break
		}
	}
	if !found {
		return nil, fmt.Errorf("Mercury health operation %s is absent", operationID)
	}
	_, err := client.invoke(ctx.Context, operation, map[string]any{})
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: client.connectionID,
			Account:      string(client.role),
			Error:        err.Error(),
			Details: map[string]any{
				"connection_role":        string(client.role),
				"credential_ref":         client.credentialRef,
				"provider_write_enabled": false,
			},
		}, nil
	}
	return &nexadapter.AdapterHealth{
		Connected:    true,
		ConnectionID: client.connectionID,
		Account:      string(client.role),
		LastEventAt:  time.Now().UnixMilli(),
		Details: map[string]any{
			"connection_role":        string(client.role),
			"credential_ref":         client.credentialRef,
			"provider_write_enabled": false,
		},
	}, nil
}

func boolPointer(value bool) *bool {
	return &value
}

func sortedMethodNames() []string {
	methods := mercuryMethods()
	names := make([]string, 0, len(methods))
	for name := range methods {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func operationForMethod(name string) (catalog.Operation, bool) {
	operationID := strings.TrimPrefix(name, "mercury.api.")
	for _, operation := range catalog.MustOperations() {
		if operation.OperationID == operationID && operation.Visibility == "public" {
			return operation, true
		}
	}
	return catalog.Operation{}, false
}

func invokeForTest(ctx context.Context, client *mercuryClient, operationID string, payload map[string]any) (*mercuryMethodResponse, error) {
	operation, ok := operationForMethod("mercury.api." + operationID)
	if !ok {
		return nil, fmt.Errorf("unknown Mercury operation %s", operationID)
	}
	return client.invoke(ctx, operation, payload)
}
