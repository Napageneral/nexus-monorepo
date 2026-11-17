package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const shopifyPaymentsPageSize = 250

type shopifyPaymentsPageRequest struct {
	Family              string
	ContainerID         string
	Path                string
	ResponseField       string
	ProviderCursorParam string
	SinceParam          string
	ThroughParam        string
	TimestampKeys       []string
}

func shopifyPaymentsWindowValue(value time.Time, timestamp bool) string {
	if timestamp {
		return value.UTC().Format(time.RFC3339)
	}
	return value.UTC().Format("2006-01-02")
}

func captureShopifyPaymentsPage(
	ctx context.Context,
	state *shopifyState,
	spec shopifyPaymentsPageRequest,
	since time.Time,
	through time.Time,
	providerCursor string,
	pageCursor string,
) ([]nexadapter.AdapterInboundRecord, string, bool, error) {
	accessToken, err := fetchShopifyAccessToken(ctx, state)
	if err != nil {
		return nil, "", false, err
	}
	requestURL := strings.TrimSpace(pageCursor)
	if requestURL == "" {
		base := fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion)
		parsed, err := url.Parse(base + spec.Path)
		if err != nil {
			return nil, "", false, err
		}
		query := parsed.Query()
		query.Set("limit", fmt.Sprintf("%d", shopifyPaymentsPageSize))
		if spec.ProviderCursorParam != "" {
			providerCursor, err = normalizeShopifyProviderCursor(providerCursor)
			if err != nil {
				return nil, "", false, err
			}
			query.Set(spec.ProviderCursorParam, providerCursor)
		} else {
			isTimestamp := spec.Family == "disputes.delta"
			query.Set(spec.SinceParam, shopifyPaymentsWindowValue(since, isTimestamp))
			query.Set(spec.ThroughParam, shopifyPaymentsWindowValue(through, isTimestamp))
		}
		parsed.RawQuery = query.Encode()
		requestURL = parsed.String()
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return nil, "", false, err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("X-Shopify-Access-Token", accessToken)
	response, err := doShopifyRequest(ctx, state, request)
	if err != nil {
		return nil, "", false, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBodyBytes))
	if err != nil {
		return nil, "", false, err
	}
	if response.StatusCode != http.StatusOK {
		return nil, "", false, fmt.Errorf("Shopify %s request failed (%d): %s", spec.Family, response.StatusCode, strings.TrimSpace(string(body)))
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var envelope map[string]json.RawMessage
	if err := decoder.Decode(&envelope); err != nil {
		return nil, "", false, fmt.Errorf("decode Shopify %s response: %w", spec.Family, err)
	}
	rawRows, ok := envelope[spec.ResponseField]
	if !ok {
		return nil, "", false, fmt.Errorf("Shopify %s response omitted %s", spec.Family, spec.ResponseField)
	}
	var rows []json.RawMessage
	if err := json.Unmarshal(rawRows, &rows); err != nil {
		return nil, "", false, fmt.Errorf("decode Shopify %s rows: %w", spec.Family, err)
	}
	if len(rows) > shopifyPaymentsPageSize {
		return nil, "", false, fmt.Errorf(
			"Shopify %s response exceeded the %d-row provider page",
			spec.Family,
			shopifyPaymentsPageSize,
		)
	}
	sourceRequest := shopifySourceRequest{
		APIBaseURL: fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion),
		Path:       spec.Path,
		Request: map[string]any{
			"operation":       spec.Family,
			"page_size":       shopifyPaymentsPageSize,
			"api_version":     state.APIVersion,
			"request_since":   since.UTC().Format(time.RFC3339Nano),
			"window_through":  through.UTC().Format(time.RFC3339Nano),
			"provider_cursor": emptyToNil(providerCursor),
			"request_cursor":  emptyToNil(pageCursor),
		},
	}
	records := make([]nexadapter.AdapterInboundRecord, 0, len(rows))
	for _, raw := range rows {
		record, err := buildShopifyPaymentsRecord(state, spec, raw, sourceRequest)
		if err != nil {
			return nil, "", false, err
		}
		records = append(records, record)
	}
	nextCursor := parseLinkHeader(response.Header.Get("Link"))["next"]
	return records, nextCursor, nextCursor == "", nil
}

func rawScalarString(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case json.Number:
		return typed.String()
	case float64:
		return fmt.Sprintf("%.0f", typed)
	default:
		return ""
	}
}

func providerTimestamp(row map[string]any, keys []string) time.Time {
	for _, key := range keys {
		value := rawScalarString(row[key])
		if value == "" {
			continue
		}
		for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02"} {
			if parsed, err := time.Parse(layout, value); err == nil {
				return parsed.UTC()
			}
		}
	}
	return time.UnixMilli(0).UTC()
}

func buildShopifyPaymentsRecord(
	state *shopifyState,
	spec shopifyPaymentsPageRequest,
	raw json.RawMessage,
	sourceRequest shopifySourceRequest,
) (record nexadapter.AdapterInboundRecord, err error) {
	defer func() {
		if err == nil {
			record = bindShopifyImmutableRecord(state, record)
		}
	}()
	row, err := decodeProviderJSONObject(raw)
	if err != nil {
		return nexadapter.AdapterInboundRecord{}, err
	}
	providerID := rawScalarString(row["id"])
	if providerID == "" {
		return nexadapter.AdapterInboundRecord{}, errors.New("Shopify payments row omitted id")
	}
	connectionID, err := nexadapter.RequireConnection(state.ConnectionID)
	if err != nil {
		return nexadapter.AdapterInboundRecord{}, err
	}
	digest := sha256.Sum256(raw)
	fingerprint := hex.EncodeToString(digest[:])
	threadID := fmt.Sprintf("%s:%s:%s", state.ShopDomain, spec.ContainerID, nexadapter.SafeIDToken(providerID))
	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       platformID,
			Platform:      platformID,
			ConnectionID:  connectionID,
			SenderID:      state.ShopDomain,
			SenderName:    "Shopify",
			ReceiverID:    connectionID,
			SpaceID:       state.ShopDomain,
			SpaceName:     state.ShopDomain,
			ContainerKind: "group",
			ContainerID:   spec.ContainerID,
			ContainerName: spec.ContainerID,
			ThreadID:      threadID,
			ThreadName:    providerID,
			Metadata: map[string]any{
				"family":      spec.Family,
				"grain":       spec.ContainerID,
				"shop_domain": state.ShopDomain,
				"api_path":    sourceRequest.Path,
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("%s:%s:%s:%s:%s", platformID, nexadapter.SafeIDToken(connectionID), spec.ContainerID, nexadapter.SafeIDToken(providerID), fingerprint),
			Timestamp:        providerTimestamp(row, spec.TimestampKeys).UnixMilli(),
			Content:          fmt.Sprintf("%s %s", spec.ContainerID, providerID),
			ContentType:      "text",
			Payload:          providerPayloadEnvelope(raw, row, row),
			Metadata: map[string]any{
				"connection_id":               connectionID,
				"adapter_id":                  platformID,
				"family":                      spec.Family,
				"logical_row_id":              fmt.Sprintf("%s:%s", state.ShopDomain, providerID),
				"snapshot_fingerprint_sha256": fingerprint,
				"provider_ids": map[string]any{
					"shop_domain": state.ShopDomain,
					"provider_id": providerID,
				},
				"source_request": sourceRequest.metadata(),
			},
		},
	}, nil
}
