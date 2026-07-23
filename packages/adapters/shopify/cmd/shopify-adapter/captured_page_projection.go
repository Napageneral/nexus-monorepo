package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	capturedPageProjectionVersion = 1
	capturedPageMaxBytes          = maxResponseBodyBytes
)

var capturedPageObservationID = regexp.MustCompile(`^[a-zA-Z0-9._:-]{1,128}$`)

type capturedPageProjectionResult struct {
	Version                int                               `json:"version"`
	Family                 string                            `json:"family"`
	ConnectionID           string                            `json:"connection_id"`
	ShopDomain             string                            `json:"shop_domain"`
	ObservationID          string                            `json:"observation_id"`
	ProviderResponseSHA256 string                            `json:"provider_response_sha256"`
	SourceRows             int                               `json:"source_rows"`
	Records                []nexadapter.AdapterInboundRecord `json:"records"`
	ProviderCalls          int                               `json:"provider_calls"`
	ProviderWriteAuthority bool                              `json:"provider_write_authority"`
	CursorAdvanced         bool                              `json:"cursor_advanced"`
}

func parseCapturedWindow(payload map[string]any) (time.Time, time.Time, error) {
	sinceText, _ := payload["request_since"].(string)
	throughText, _ := payload["window_through"].(string)
	since, err := time.Parse(time.RFC3339, strings.TrimSpace(sinceText))
	if err != nil {
		return time.Time{}, time.Time{}, errors.New("captured Shopify page requires RFC3339 request_since")
	}
	through, err := time.Parse(time.RFC3339, strings.TrimSpace(throughText))
	if err != nil {
		return time.Time{}, time.Time{}, errors.New("captured Shopify page requires RFC3339 window_through")
	}
	if !through.After(since) {
		return time.Time{}, time.Time{}, errors.New("captured Shopify page window_through must be after request_since")
	}
	return since.UTC(), through.UTC(), nil
}

func validateCapturedOrdersRequestURL(state *shopifyState, requestURL string) (string, error) {
	requestURL = strings.TrimSpace(requestURL)
	if requestURL == "" || len(requestURL) > 4096 {
		return "", errors.New("captured Shopify page requires a bounded request_url")
	}
	if err := validateShopifyOrderPageURL(state, requestURL); err != nil {
		return "", err
	}
	parsed, err := url.Parse(requestURL)
	if err != nil {
		return "", fmt.Errorf("parse captured Shopify request URL: %w", err)
	}
	for _, forbidden := range []string{"access_token", "client_id", "client_secret"} {
		if parsed.Query().Has(forbidden) {
			return "", errors.New("captured Shopify request URL contains credential material")
		}
	}
	digest := sha256.Sum256([]byte(requestURL))
	return hex.EncodeToString(digest[:]), nil
}

func projectCapturedOrdersPage(
	state *shopifyState,
	payload map[string]any,
) (capturedPageProjectionResult, error) {
	if state == nil {
		return capturedPageProjectionResult{}, errors.New("captured Shopify page requires connection state")
	}
	family, _ := payload["family"].(string)
	if strings.TrimSpace(family) != "orders.delta" {
		return capturedPageProjectionResult{}, errors.New("captured Shopify page currently supports only orders.delta")
	}
	observationID, _ := payload["observation_id"].(string)
	observationID = strings.TrimSpace(observationID)
	if !capturedPageObservationID.MatchString(observationID) {
		return capturedPageProjectionResult{}, errors.New("captured Shopify page requires a safe observation_id")
	}
	responseText, ok := payload["provider_response_json"].(string)
	if !ok || responseText == "" {
		return capturedPageProjectionResult{}, errors.New("captured Shopify page requires provider_response_json")
	}
	responseBytes := []byte(responseText)
	if len(responseBytes) > capturedPageMaxBytes {
		return capturedPageProjectionResult{}, fmt.Errorf(
			"captured Shopify page exceeds %d bytes",
			capturedPageMaxBytes,
		)
	}
	expectedSHA, _ := payload["provider_response_sha256"].(string)
	expectedSHA = strings.TrimSpace(expectedSHA)
	digest := sha256.Sum256(responseBytes)
	actualSHA := hex.EncodeToString(digest[:])
	if expectedSHA == "" || expectedSHA != actualSHA {
		return capturedPageProjectionResult{}, errors.New("captured Shopify page SHA-256 mismatch")
	}
	if !json.Valid(responseBytes) {
		return capturedPageProjectionResult{}, errors.New("captured Shopify page is not valid JSON")
	}
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(responseBytes, &envelope); err != nil {
		return capturedPageProjectionResult{}, fmt.Errorf("parse captured Shopify page envelope: %w", err)
	}
	rawOrders, present := envelope["orders"]
	if !present || string(rawOrders) == "null" {
		return capturedPageProjectionResult{}, errors.New("captured Shopify orders page is missing orders")
	}
	var page shopifyOrdersResponse
	if err := json.Unmarshal(responseBytes, &page); err != nil {
		return capturedPageProjectionResult{}, fmt.Errorf("parse captured Shopify orders page: %w", err)
	}
	since, through, err := parseCapturedWindow(payload)
	if err != nil {
		return capturedPageProjectionResult{}, err
	}
	requestURL, _ := payload["request_url"].(string)
	requestURLSHA, err := validateCapturedOrdersRequestURL(state, requestURL)
	if err != nil {
		return capturedPageProjectionResult{}, err
	}
	sourceRequest := shopifySourceRequest{
		APIBaseURL: fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion),
		Path:       "/orders.json",
		Request: map[string]any{
			"operation":                "CapturedOrdersPage",
			"observation_id":           observationID,
			"request_url_sha256":       requestURLSHA,
			"request_since":            since.Format(time.RFC3339),
			"window_through":           through.Format(time.RFC3339),
			"provider_response_sha256": actualSHA,
			"api_version":              state.APIVersion,
		},
	}
	records := make([]nexadapter.AdapterInboundRecord, 0, len(page.Orders)*2)
	for _, order := range page.Orders {
		if record := buildOrderRecord(state, order, sourceRequest); record.Operation != "" {
			records = append(records, record)
		}
		for _, lineItem := range order.LineItems {
			if record := buildLineItemRecord(state, order, lineItem, sourceRequest); record.Operation != "" {
				records = append(records, record)
			}
		}
	}
	if len(records) > shopifySourceMaxRecords {
		return capturedPageProjectionResult{}, fmt.Errorf(
			"captured Shopify order page expanded beyond %d source records",
			shopifySourceMaxRecords,
		)
	}
	return capturedPageProjectionResult{
		Version:                capturedPageProjectionVersion,
		Family:                 family,
		ConnectionID:           state.ConnectionID,
		ShopDomain:             state.ShopDomain,
		ObservationID:          observationID,
		ProviderResponseSHA256: actualSHA,
		SourceRows:             len(page.Orders),
		Records:                records,
		ProviderCalls:          0,
		ProviderWriteAuthority: false,
		CursorAdvanced:         false,
	}, nil
}

func handleShopifySourceProjectCaptured(
	ctx nexadapter.AdapterContext[struct{}],
	payload map[string]any,
) (any, error) {
	state, err := loadShopifyState(ctx)
	if err != nil {
		return nil, err
	}
	return projectCapturedOrdersPage(state, payload)
}
