package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/url"
	"regexp"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	capturedPageProjectionVersion = 1
	capturedPageMaxBytes          = maxResponseBodyBytes
	capturedPageMaxGzipBytes      = 700 * 1024
	capturedPageMaxBase64Bytes    = 950_000
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
	RecordOffset           int                               `json:"record_offset"`
	RecordLimit            int                               `json:"record_limit"`
	TotalRecords           int                               `json:"total_records"`
	NextRecordOffset       int                               `json:"next_record_offset"`
	Complete               bool                              `json:"complete"`
	Records                []nexadapter.AdapterInboundRecord `json:"records"`
	ProviderCalls          int                               `json:"provider_calls"`
	ProviderWriteAuthority bool                              `json:"provider_write_authority"`
	CursorAdvanced         bool                              `json:"cursor_advanced"`
}

func capturedPageInteger(
	payload map[string]any,
	field string,
	fallback int,
	minimum int,
	maximum int,
) (int, error) {
	raw, present := payload[field]
	if !present {
		return fallback, nil
	}
	var value int
	switch typed := raw.(type) {
	case int:
		value = typed
	case int64:
		if typed < int64(minimum) || typed > int64(maximum) {
			return 0, fmt.Errorf("captured Shopify page %s is outside its bound", field)
		}
		value = int(typed)
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) || math.Trunc(typed) != typed {
			return 0, fmt.Errorf("captured Shopify page %s must be an integer", field)
		}
		if typed < float64(minimum) || typed > float64(maximum) {
			return 0, fmt.Errorf("captured Shopify page %s is outside its bound", field)
		}
		value = int(typed)
	case json.Number:
		parsed, err := typed.Int64()
		if err != nil || parsed < int64(minimum) || parsed > int64(maximum) {
			return 0, fmt.Errorf("captured Shopify page %s must be a bounded integer", field)
		}
		value = int(parsed)
	default:
		return 0, fmt.Errorf("captured Shopify page %s must be an integer", field)
	}
	if value < minimum || value > maximum {
		return 0, fmt.Errorf("captured Shopify page %s is outside its bound", field)
	}
	return value, nil
}

func capturedPageResponseBytes(payload map[string]any) ([]byte, error) {
	responseText, hasText := payload["provider_response_json"].(string)
	encodedGzip, hasGzip := payload["provider_response_gzip_base64"].(string)
	hasText = hasText && responseText != ""
	hasGzip = hasGzip && encodedGzip != ""
	if hasText == hasGzip {
		return nil, errors.New(
			"captured Shopify page requires exactly one provider response encoding",
		)
	}
	if hasText {
		responseBytes := []byte(responseText)
		if len(responseBytes) > capturedPageMaxBytes {
			return nil, fmt.Errorf(
				"captured Shopify page exceeds %d bytes",
				capturedPageMaxBytes,
			)
		}
		return responseBytes, nil
	}
	if len(encodedGzip) > capturedPageMaxBase64Bytes {
		return nil, errors.New("captured Shopify page gzip envelope exceeds its byte limit")
	}
	compressed, err := base64.StdEncoding.Strict().DecodeString(encodedGzip)
	if err != nil || len(compressed) < 1 || len(compressed) > capturedPageMaxGzipBytes {
		return nil, errors.New("captured Shopify page gzip envelope is invalid")
	}
	source := bytes.NewReader(compressed)
	reader, err := gzip.NewReader(source)
	if err != nil {
		return nil, errors.New("captured Shopify page gzip envelope is invalid")
	}
	reader.Multistream(false)
	responseBytes, readErr := io.ReadAll(io.LimitReader(reader, capturedPageMaxBytes+1))
	closeErr := reader.Close()
	if readErr != nil || closeErr != nil || len(responseBytes) > capturedPageMaxBytes {
		return nil, errors.New("captured Shopify page gzip payload exceeds its byte limit")
	}
	if source.Len() != 0 {
		return nil, errors.New("captured Shopify page gzip envelope has trailing bytes")
	}
	return responseBytes, nil
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
	responseBytes, err := capturedPageResponseBytes(payload)
	if err != nil {
		return capturedPageProjectionResult{}, err
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
	recordOffset, err := capturedPageInteger(payload, "record_offset", 0, 0, 1_000_000)
	if err != nil {
		return capturedPageProjectionResult{}, err
	}
	recordLimit, err := capturedPageInteger(
		payload,
		"record_limit",
		shopifySourceMaxRecords,
		1,
		shopifySourceMaxRecords,
	)
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
	records := make([]nexadapter.AdapterInboundRecord, 0, recordLimit)
	totalRecords := 0
	appendRecord := func(record nexadapter.AdapterInboundRecord) {
		if record.Operation == "" {
			return
		}
		if totalRecords >= recordOffset && len(records) < recordLimit {
			records = append(records, record)
		}
		totalRecords++
	}
	for _, order := range page.Orders {
		appendRecord(buildOrderRecord(state, order, sourceRequest))
		for _, lineItem := range order.LineItems {
			appendRecord(buildLineItemRecord(state, order, lineItem, sourceRequest))
		}
	}
	if recordOffset > totalRecords {
		return capturedPageProjectionResult{}, errors.New(
			"captured Shopify page record_offset exceeds the projected record count",
		)
	}
	nextRecordOffset := recordOffset + len(records)
	return capturedPageProjectionResult{
		Version:                capturedPageProjectionVersion,
		Family:                 family,
		ConnectionID:           state.ConnectionID,
		ShopDomain:             state.ShopDomain,
		ObservationID:          observationID,
		ProviderResponseSHA256: actualSHA,
		SourceRows:             len(page.Orders),
		RecordOffset:           recordOffset,
		RecordLimit:            recordLimit,
		TotalRecords:           totalRecords,
		NextRecordOffset:       nextRecordOffset,
		Complete:               nextRecordOffset >= totalRecords,
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
