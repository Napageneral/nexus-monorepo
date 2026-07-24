package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/nexus-project/adapter-mercury/internal/catalog"
	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	mercuryMonitorInterval      = 5 * time.Minute
	mercuryMonitorErrorBackoff  = 1 * time.Minute
	mercuryMonitorReplayWindow  = 24 * time.Hour
	mercuryProjectionPageLimit  = 100
	mercuryProjectionPageSize   = 1000
	mercuryCaptureContract      = "nex_mercury_api_capture_v1"
	mercuryRecordContract       = "nex_mercury_record_revision_v1"
	mercuryProjectionRecordText = "Mercury immutable provider revision"
)

type mercuryProjectionSource struct {
	OperationID  string
	Family       string
	ArrayField   string
	IDField      string
	TimestampKey []string
}

type mercuryProjectionFetch struct {
	Source         mercuryProjectionSource
	PathParameters map[string]any
	Query          map[string]any
}

var mercuryProjectionSources = map[string]mercuryProjectionSource{
	"getAccounts": {
		OperationID:  "getAccounts",
		Family:       "account_snapshot",
		ArrayField:   "accounts",
		IDField:      "id",
		TimestampKey: []string{"createdAt"},
	},
	"listTransactions": {
		OperationID:  "listTransactions",
		Family:       "transaction_revision",
		ArrayField:   "transactions",
		IDField:      "id",
		TimestampKey: []string{"postedAt", "createdAt", "estimatedDeliveryDate"},
	},
	"getRecipients": {
		OperationID:  "getRecipients",
		Family:       "recipient_revision",
		ArrayField:   "recipients",
		IDField:      "id",
		TimestampKey: []string{"dateLastPaid"},
	},
	"listSendMoneyApprovalRequests": {
		OperationID:  "listSendMoneyApprovalRequests",
		Family:       "approval_request_revision",
		ArrayField:   "requests",
		IDField:      "requestId",
		TimestampKey: []string{"createdAt", "scheduledSendDate"},
	},
	"getAccountStatements": {
		OperationID:  "getAccountStatements",
		Family:       "statement_revision",
		ArrayField:   "statements",
		IDField:      "id",
		TimestampKey: []string{"endDate", "startDate"},
	},
}

func mercuryBackfill(ctx nexadapter.AdapterContext[*mercuryClient], since time.Time, emit nexadapter.EmitFunc) error {
	records, _, err := fetchMercuryProjection(ctx.Context, ctx.Client, since.UTC())
	if err != nil {
		return err
	}
	for _, record := range records {
		emit(record)
	}
	return nil
}

func mercuryMonitor(ctx nexadapter.AdapterContext[*mercuryClient], emit nexadapter.EmitFunc) error {
	poll := nexadapter.PollMonitor(nexadapter.PollConfig[nexadapter.AdapterInboundRecord]{
		Interval:      mercuryMonitorInterval,
		ErrorBackoff:  mercuryMonitorErrorBackoff,
		InitialCursor: time.Now().UTC().Add(-mercuryMonitorReplayWindow),
		Fetch: func(fetchContext context.Context, since time.Time) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
			return fetchMercuryProjection(fetchContext, ctx.Client, since.UTC())
		},
		MaxConsecutiveErrors: 5,
	})
	return poll(ctx.Context, ctx.ConnectionID, emit)
}

func fetchMercuryProjection(
	ctx context.Context,
	client *mercuryClient,
	since time.Time,
) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
	if client == nil {
		return nil, time.Time{}, errors.New("missing Mercury client")
	}
	if since.IsZero() {
		return nil, time.Time{}, errors.New("Mercury projection requires a nonzero cursor")
	}
	capturedAt := time.Now().UTC()
	fetches := []mercuryProjectionFetch{}
	if client.role == rolePrimaryRead {
		fetches = append(fetches,
			mercuryProjectionFetch{
				Source: mercuryProjectionSources["getAccounts"],
				Query: map[string]any{
					"limit": mercuryProjectionPageSize,
					"order": "asc",
				},
			},
			mercuryProjectionFetch{
				Source: mercuryProjectionSources["listTransactions"],
				Query: map[string]any{
					"start": since.UTC().Format(time.RFC3339),
					"limit": mercuryProjectionPageSize,
					"order": "asc",
				},
			},
		)
	}
	fetches = append(fetches,
		mercuryProjectionFetch{
			Source: mercuryProjectionSources["getRecipients"],
			Query: map[string]any{
				"limit": mercuryProjectionPageSize,
				"order": "asc",
			},
		},
		mercuryProjectionFetch{
			Source: mercuryProjectionSources["listSendMoneyApprovalRequests"],
			Query: map[string]any{
				"limit": mercuryProjectionPageSize,
			},
		},
	)

	records := []nexadapter.AdapterInboundRecord{}
	accountIDs := []string{}
	for _, fetch := range fetches {
		response, err := invokeProjectionSource(ctx, client, fetch)
		if err != nil {
			return nil, time.Time{}, err
		}
		projected, err := projectMercuryResponse(client, fetch.Source, response, capturedAt)
		if err != nil {
			return nil, time.Time{}, err
		}
		records = append(records, projected...)
		if fetch.Source.OperationID == "getAccounts" {
			accountIDs, err = projectionProviderIDs(response, fetch.Source)
			if err != nil {
				return nil, time.Time{}, err
			}
		}
	}

	if client.role == rolePrimaryRead {
		for _, accountID := range accountIDs {
			fetch := mercuryProjectionFetch{
				Source: mercuryProjectionSources["getAccountStatements"],
				PathParameters: map[string]any{
					"accountId": accountID,
				},
				Query: map[string]any{
					"start": since.UTC().Format("2006-01-02"),
					"limit": mercuryProjectionPageSize,
					"order": "asc",
				},
			}
			response, err := invokeProjectionSource(ctx, client, fetch)
			if err != nil {
				return nil, time.Time{}, err
			}
			projected, err := projectMercuryResponse(client, fetch.Source, response, capturedAt)
			if err != nil {
				return nil, time.Time{}, err
			}
			records = append(records, projected...)
		}
	}

	return records, capturedAt, nil
}

func invokeProjectionSource(
	ctx context.Context,
	client *mercuryClient,
	fetch mercuryProjectionFetch,
) (*mercuryMethodResponse, error) {
	operation, err := mercuryOperation(fetch.Source.OperationID)
	if err != nil {
		return nil, err
	}
	payload := map[string]any{
		"path_parameters": fetch.PathParameters,
		"query":           fetch.Query,
		"auto_paginate":   true,
		"max_pages":       mercuryProjectionPageLimit,
	}
	if payload["path_parameters"] == nil {
		payload["path_parameters"] = map[string]any{}
	}
	if payload["query"] == nil {
		payload["query"] = map[string]any{}
	}
	response, err := client.invoke(ctx, operation, payload)
	if err != nil {
		return nil, fmt.Errorf("capture Mercury %s: %w", fetch.Source.OperationID, err)
	}
	if !response.Complete {
		return nil, fmt.Errorf("capture Mercury %s exceeded %d pages", fetch.Source.OperationID, mercuryProjectionPageLimit)
	}
	return response, nil
}

func mercuryOperation(operationID string) (catalog.Operation, error) {
	for _, operation := range catalog.MustOperations() {
		if operation.OperationID == operationID && operation.Visibility == "public" {
			return operation, nil
		}
	}
	return catalog.Operation{}, fmt.Errorf("Mercury operation %s is absent", operationID)
}

func projectMercuryResponse(
	client *mercuryClient,
	source mercuryProjectionSource,
	response *mercuryMethodResponse,
	capturedAt time.Time,
) ([]nexadapter.AdapterInboundRecord, error) {
	if client == nil || response == nil {
		return nil, errors.New("Mercury projection requires client and response")
	}
	if response.ProviderWriteAttempted {
		return nil, errors.New("Mercury read projection observed a provider write attempt")
	}
	if response.ProviderOperationID != source.OperationID {
		return nil, errors.New("Mercury response operation mismatch")
	}
	if response.ConnectionRole != string(client.role) {
		return nil, errors.New("Mercury response connection-role mismatch")
	}
	if !response.Complete {
		return nil, errors.New("Mercury projection refuses an incomplete provider capture")
	}
	if response.PageCount != len(response.Pages) || response.ProviderCalls < len(response.Pages) {
		return nil, errors.New("Mercury response page inventory is inconsistent")
	}
	records := []nexadapter.AdapterInboundRecord{}
	for pageIndex, page := range response.Pages {
		if page.HTTPStatus != http.StatusOK {
			return nil, fmt.Errorf("Mercury %s page %d is not HTTP 200", source.OperationID, pageIndex+1)
		}
		if !strings.HasPrefix(strings.ToLower(page.ContentType), "application/json") {
			return nil, fmt.Errorf("Mercury %s page %d is not JSON", source.OperationID, pageIndex+1)
		}
		if page.BodyEncoding != "utf8_json" {
			return nil, fmt.Errorf("Mercury %s projection requires JSON UTF-8", source.OperationID)
		}
		if page.RequestAttempts < 1 || page.RequestAttempts > maxGETAttempts {
			return nil, fmt.Errorf("Mercury %s page %d has invalid attempt count", source.OperationID, pageIndex+1)
		}
		bodyBytes := []byte(page.Body)
		digest := sha256.Sum256(bodyBytes)
		if hex.EncodeToString(digest[:]) != page.BodySHA256 {
			return nil, fmt.Errorf("Mercury %s page %d digest mismatch", source.OperationID, pageIndex+1)
		}
		rows, err := projectionRows(bodyBytes, source.ArrayField)
		if err != nil {
			return nil, fmt.Errorf("Mercury %s page %d: %w", source.OperationID, pageIndex+1, err)
		}
		for _, row := range rows {
			rowRecords, err := buildMercuryRevisionRecords(client, source, row, capturedAt)
			if err != nil {
				return nil, fmt.Errorf("Mercury %s page %d: %w", source.OperationID, pageIndex+1, err)
			}
			records = append(records, rowRecords...)
		}
		receipt, err := buildMercuryCaptureReceipt(client, source, page, pageIndex+1, len(rows), capturedAt)
		if err != nil {
			return nil, err
		}
		records = append(records, receipt)
	}
	return records, nil
}

func projectionRows(body []byte, arrayField string) ([]json.RawMessage, error) {
	var page map[string]json.RawMessage
	if err := json.Unmarshal(body, &page); err != nil {
		return nil, fmt.Errorf("parse provider page: %w", err)
	}
	rawRows, exists := page[arrayField]
	if !exists {
		return nil, fmt.Errorf("provider page omitted %s", arrayField)
	}
	var rows []json.RawMessage
	if err := json.Unmarshal(rawRows, &rows); err != nil {
		return nil, fmt.Errorf("parse provider rows: %w", err)
	}
	return rows, nil
}

func projectionProviderIDs(response *mercuryMethodResponse, source mercuryProjectionSource) ([]string, error) {
	ids := []string{}
	for _, page := range response.Pages {
		if page.BodyEncoding != "utf8_json" {
			return nil, errors.New("provider identifiers require JSON UTF-8")
		}
		rows, err := projectionRows([]byte(page.Body), source.ArrayField)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			object, _, err := canonicalProviderObject(row)
			if err != nil {
				return nil, err
			}
			id, err := requiredProviderID(object, source.IDField)
			if err != nil {
				return nil, err
			}
			ids = append(ids, id)
		}
	}
	return ids, nil
}

func buildMercuryRevisionRecords(
	client *mercuryClient,
	source mercuryProjectionSource,
	raw json.RawMessage,
	capturedAt time.Time,
) ([]nexadapter.AdapterInboundRecord, error) {
	object, canonical, err := canonicalProviderObject(raw)
	if err != nil {
		return nil, err
	}
	providerID, err := requiredProviderID(object, source.IDField)
	if err != nil {
		return nil, err
	}
	occurredAt := providerTimestamp(object, source.TimestampKey, capturedAt)
	records := []nexadapter.AdapterInboundRecord{
		newMercuryRevisionRecord(client, source.Family, providerID, canonical, object, source.OperationID, occurredAt, capturedAt),
	}
	if source.Family == "transaction_revision" {
		if requestID := optionalProviderID(object, "requestId"); requestID != "" {
			records = append(records, newMercuryRevisionRecord(
				client,
				"payment_revision",
				requestID,
				canonical,
				object,
				source.OperationID,
				occurredAt,
				capturedAt,
			))
		}
	}
	if source.Family == "approval_request_revision" {
		if scheduledDate := optionalProviderID(object, "scheduledSendDate"); scheduledDate != "" {
			records = append(records, newMercuryRevisionRecord(
				client,
				"scheduled_payment_observation",
				providerID,
				canonical,
				object,
				source.OperationID,
				occurredAt,
				capturedAt,
			))
		}
	}
	for _, attachment := range embeddedAttachments(object) {
		attachmentObject, attachmentCanonical, err := canonicalProviderObject(attachment)
		if err != nil {
			return nil, err
		}
		attachmentID, err := requiredProviderID(attachmentObject, "id")
		if err != nil {
			return nil, err
		}
		records = append(records, newMercuryRevisionRecord(
			client,
			"attachment_revision",
			attachmentID,
			attachmentCanonical,
			attachmentObject,
			source.OperationID,
			occurredAt,
			capturedAt,
		))
	}
	return records, nil
}

func canonicalProviderObject(raw json.RawMessage) (map[string]any, []byte, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var object map[string]any
	if err := decoder.Decode(&object); err != nil {
		return nil, nil, fmt.Errorf("parse provider object: %w", err)
	}
	if len(object) == 0 {
		return nil, nil, errors.New("provider object is empty")
	}
	canonical, err := json.Marshal(object)
	if err != nil {
		return nil, nil, fmt.Errorf("canonicalize provider object: %w", err)
	}
	return object, canonical, nil
}

func requiredProviderID(object map[string]any, field string) (string, error) {
	id := optionalProviderID(object, field)
	if id == "" {
		return "", fmt.Errorf("provider object omitted %s", field)
	}
	return id, nil
}

func optionalProviderID(object map[string]any, field string) string {
	value, exists := object[field]
	if !exists || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case json.Number:
		return strings.TrimSpace(typed.String())
	default:
		return ""
	}
}

func providerTimestamp(object map[string]any, keys []string, fallback time.Time) time.Time {
	for _, key := range keys {
		value, ok := object[key].(string)
		if !ok || strings.TrimSpace(value) == "" {
			continue
		}
		if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
			return parsed.UTC()
		}
		if parsed, err := time.Parse("2006-01-02", value); err == nil {
			return parsed.UTC()
		}
	}
	return fallback.UTC()
}

func embeddedAttachments(object map[string]any) []json.RawMessage {
	raw, exists := object["attachments"]
	if !exists || raw == nil {
		return nil
	}
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	attachments := make([]json.RawMessage, 0, len(items))
	for _, item := range items {
		encoded, err := json.Marshal(item)
		if err == nil {
			attachments = append(attachments, encoded)
		}
	}
	return attachments
}

func newMercuryRevisionRecord(
	client *mercuryClient,
	family string,
	providerID string,
	canonical []byte,
	object map[string]any,
	operationID string,
	occurredAt time.Time,
	capturedAt time.Time,
) nexadapter.AdapterInboundRecord {
	digest := sha256.Sum256(canonical)
	revision := hex.EncodeToString(digest[:])
	safeConnection := nexadapter.SafeIDToken(client.connectionID)
	safeProviderID := nexadapter.SafeIDToken(providerID)
	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       platformID,
			Platform:      platformID,
			ConnectionID:  client.connectionID,
			SenderID:      "mercury",
			SenderName:    "Mercury",
			ReceiverID:    client.connectionID,
			SpaceID:       "moonsleep",
			SpaceName:     "MoonSleep",
			ContainerKind: "group",
			ContainerID:   family,
			ContainerName: family,
			ThreadID:      fmt.Sprintf("mercury:%s:%s", family, safeProviderID),
			ThreadName:    providerID,
			Metadata: map[string]any{
				"family":                family,
				"provider_operation_id": operationID,
				"connection_role":       string(client.role),
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("mercury:%s:%s:%s:%s", safeConnection, family, safeProviderID, revision),
			Timestamp:        occurredAt.UnixMilli(),
			Content:          fmt.Sprintf("%s family=%s provider_id=%s", mercuryProjectionRecordText, family, providerID),
			ContentType:      "text",
			Payload: map[string]any{
				"contract":                        mercuryRecordContract,
				"provider":                        "mercury",
				"environment":                     "production",
				"connection_role":                 string(client.role),
				"family":                          family,
				"provider_object_id":              providerID,
				"provider_operation_id":           operationID,
				"provider_payload":                object,
				"provider_payload_canonical_json": string(canonical),
				"provider_payload_sha256":         revision,
				"captured_at":                     capturedAt.Format(time.RFC3339Nano),
				"provider_write_authority":        false,
				"journal_authority":               false,
				"payment_authority":               false,
				"tax_authority":                   false,
				"distribution_authority":          false,
				"cutover_authority":               false,
			},
			Metadata: map[string]any{
				"connection_id":      client.connectionID,
				"credential_ref":     client.credentialRef,
				"family":             family,
				"logical_row_id":     providerID,
				"revision_hash":      revision,
				"provider_object_id": providerID,
			},
		},
	}
}

func buildMercuryCaptureReceipt(
	client *mercuryClient,
	source mercuryProjectionSource,
	page mercuryMethodPage,
	pageNumber int,
	rowCount int,
	capturedAt time.Time,
) (nexadapter.AdapterInboundRecord, error) {
	if strings.TrimSpace(page.BodySHA256) == "" {
		return nexadapter.AdapterInboundRecord{}, errors.New("Mercury capture receipt requires page SHA-256")
	}
	receiptID := fmt.Sprintf("%s:%03d:%s", source.OperationID, pageNumber, page.BodySHA256)
	safeConnection := nexadapter.SafeIDToken(client.connectionID)
	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       platformID,
			Platform:      platformID,
			ConnectionID:  client.connectionID,
			SenderID:      "mercury",
			SenderName:    "Mercury",
			ReceiverID:    client.connectionID,
			SpaceID:       "moonsleep",
			SpaceName:     "MoonSleep",
			ContainerKind: "group",
			ContainerID:   "api_capture_receipt",
			ContainerName: "API capture receipts",
			ThreadID:      fmt.Sprintf("mercury:api_capture_receipt:%s", source.OperationID),
			ThreadName:    source.OperationID,
			Metadata: map[string]any{
				"family":                "api_capture_receipt",
				"provider_operation_id": source.OperationID,
				"connection_role":       string(client.role),
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("mercury:%s:api_capture_receipt:%s", safeConnection, nexadapter.SafeIDToken(receiptID)),
			Timestamp:        capturedAt.UnixMilli(),
			Content:          fmt.Sprintf("Mercury API capture operation=%s page=%d rows=%d", source.OperationID, pageNumber, rowCount),
			ContentType:      "text",
			Payload: map[string]any{
				"contract":                 mercuryCaptureContract,
				"provider":                 "mercury",
				"environment":              "production",
				"connection_role":          string(client.role),
				"provider_operation_id":    source.OperationID,
				"page_number":              pageNumber,
				"row_count":                rowCount,
				"http_status":              page.HTTPStatus,
				"content_type":             page.ContentType,
				"body_encoding":            page.BodyEncoding,
				"provider_response_body":   page.Body,
				"provider_response_sha256": page.BodySHA256,
				"next_page":                page.NextPage,
				"request_attempts":         page.RequestAttempts,
				"captured_at":              capturedAt.Format(time.RFC3339Nano),
				"provider_write_attempted": false,
				"provider_write_authority": false,
				"journal_authority":        false,
				"payment_authority":        false,
				"tax_authority":            false,
				"distribution_authority":   false,
				"cutover_authority":        false,
			},
			Metadata: map[string]any{
				"connection_id":  client.connectionID,
				"credential_ref": client.credentialRef,
				"family":         "api_capture_receipt",
				"revision_hash":  page.BodySHA256,
			},
		},
	}, nil
}
