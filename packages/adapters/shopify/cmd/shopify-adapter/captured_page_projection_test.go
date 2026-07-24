package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

func gzipBase64(t *testing.T, value string) string {
	t.Helper()
	var compressed bytes.Buffer
	writer, err := gzip.NewWriterLevel(&compressed, gzip.BestCompression)
	if err != nil {
		t.Fatal(err)
	}
	writer.Header.ModTime = time.Unix(0, 0)
	if _, err := writer.Write([]byte(value)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(compressed.Bytes())
}

func capturedOrdersPayload(t *testing.T, body string) map[string]any {
	t.Helper()
	digest := sha256.Sum256([]byte(body))
	return map[string]any{
		"family":                   "orders.delta",
		"observation_id":           "legacy-live-sync:20260723T150000Z:page-0001",
		"provider_response_json":   body,
		"provider_response_sha256": hex.EncodeToString(digest[:]),
		"request_url":              "https://example-shop.myshopify.com/admin/api/2026-01/orders.json?status=any&limit=100&updated_at_min=2026-07-23T14%3A50%3A00Z",
		"request_since":            "2026-07-23T14:50:00Z",
		"window_through":           "2026-07-23T15:00:00Z",
	}
}

func capturedOrdersState() *shopifyState {
	return &shopifyState{
		ConnectionID: "shopify-primary",
		ShopDomain:   "example-shop.myshopify.com",
		APIVersion:   "2026-01",
	}
}

func TestProjectCapturedOrdersPageUsesExactBytesWithoutProviderCall(t *testing.T) {
	body := `{"orders":[{"id":9007199254740991,"order_number":42,"name":"#1042","created_at":"2026-07-23T14:00:00Z","updated_at":"2026-07-23T14:59:00Z","processed_at":"2026-07-23T14:01:00Z","currency":"USD","total_price":"59.00","subtotal_price":"59.00","financial_status":"paid","fulfillment_status":null,"provider_extension":{"exact":true},"line_items":[{"id":8001,"product_id":7001,"variant_id":6001,"title":"MoonSpoon","variant_title":"Charcoal","sku":"MS-CHARCOAL","vendor":"MoonSleep","quantity":1,"price":"59.00","provider_line_extension":{"exact":"yes"}}]}]}`
	result, err := projectCapturedOrdersPage(capturedOrdersState(), capturedOrdersPayload(t, body))
	if err != nil {
		t.Fatal(err)
	}
	if result.SourceRows != 1 || len(result.Records) != 2 {
		t.Fatalf("unexpected captured projection counts: %#v", result)
	}
	if result.RecordOffset != 0 || result.RecordLimit != shopifySourceMaxRecords ||
		result.TotalRecords != 2 || result.NextRecordOffset != 2 || !result.Complete {
		t.Fatalf("unexpected captured projection cursor: %#v", result)
	}
	if result.ProviderCalls != 0 || result.ProviderWriteAuthority || result.CursorAdvanced {
		t.Fatalf("captured projection crossed its read-only boundary: %#v", result)
	}
	for _, record := range result.Records {
		envelope := record.Payload.Payload
		raw, _ := envelope["provider_object_json"].(string)
		if raw == "" || !json.Valid([]byte(raw)) {
			t.Fatalf("record lost exact provider object JSON: %#v", envelope)
		}
		metadata := record.Payload.Metadata
		sourceRequest, _ := metadata["source_request"].(map[string]any)
		request, _ := sourceRequest["request"].(map[string]any)
		if request["observation_id"] != "legacy-live-sync:20260723T150000Z:page-0001" {
			t.Fatalf("record lost source observation binding: %#v", sourceRequest)
		}
		if request["provider_response_sha256"] != result.ProviderResponseSHA256 {
			t.Fatalf("record lost source page digest: %#v", sourceRequest)
		}
	}
	orderRaw, _ := result.Records[0].Payload.Payload["provider_object_json"].(string)
	if !strings.Contains(orderRaw, `"provider_extension":{"exact":true}`) {
		t.Fatalf("order provider extension was not preserved: %s", orderRaw)
	}
	lineRaw, _ := result.Records[1].Payload.Payload["provider_object_json"].(string)
	if !strings.Contains(lineRaw, `"provider_line_extension":{"exact":"yes"}`) {
		t.Fatalf("line provider extension was not preserved: %s", lineRaw)
	}
}

func TestProjectCapturedOrdersPageSlicesOneExactResponseWithoutProviderCalls(t *testing.T) {
	body := `{"orders":[{"id":101,"name":"#101","created_at":"2026-07-23T14:00:00Z","updated_at":"2026-07-23T14:59:00Z","currency":"USD","line_items":[{"id":1001},{"id":1002}]},{"id":102,"name":"#102","created_at":"2026-07-23T14:00:00Z","updated_at":"2026-07-23T14:59:00Z","currency":"USD","line_items":[{"id":2001}]}]}`
	firstPayload := capturedOrdersPayload(t, body)
	firstPayload["record_offset"] = 0
	firstPayload["record_limit"] = 2
	first, err := projectCapturedOrdersPage(capturedOrdersState(), firstPayload)
	if err != nil {
		t.Fatal(err)
	}
	if first.TotalRecords != 5 || first.NextRecordOffset != 2 || first.Complete ||
		len(first.Records) != 2 || first.ProviderCalls != 0 {
		t.Fatalf("unexpected first projection slice: %#v", first)
	}

	secondPayload := capturedOrdersPayload(t, body)
	secondPayload["record_offset"] = first.NextRecordOffset
	secondPayload["record_limit"] = 2
	second, err := projectCapturedOrdersPage(capturedOrdersState(), secondPayload)
	if err != nil {
		t.Fatal(err)
	}
	if second.TotalRecords != 5 || second.NextRecordOffset != 4 || second.Complete ||
		len(second.Records) != 2 || second.ProviderResponseSHA256 != first.ProviderResponseSHA256 {
		t.Fatalf("unexpected second projection slice: %#v", second)
	}

	thirdPayload := capturedOrdersPayload(t, body)
	thirdPayload["record_offset"] = second.NextRecordOffset
	thirdPayload["record_limit"] = 2
	third, err := projectCapturedOrdersPage(capturedOrdersState(), thirdPayload)
	if err != nil {
		t.Fatal(err)
	}
	if third.TotalRecords != 5 || third.NextRecordOffset != 5 || !third.Complete ||
		len(third.Records) != 1 || third.ProviderCalls != 0 {
		t.Fatalf("unexpected terminal projection slice: %#v", third)
	}
}

func TestProjectCapturedOrdersPageRestoresExactGzipEnvelope(t *testing.T) {
	body := `{"orders":[{"id":101,"name":"#101","created_at":"2026-07-23T14:00:00Z","updated_at":"2026-07-23T14:59:00Z","currency":"USD","provider_extension":{"exact":true},"line_items":[]}]}`
	payload := capturedOrdersPayload(t, body)
	delete(payload, "provider_response_json")
	payload["provider_response_gzip_base64"] = gzipBase64(t, body)
	result, err := projectCapturedOrdersPage(capturedOrdersState(), payload)
	if err != nil {
		t.Fatal(err)
	}
	if result.TotalRecords != 1 || len(result.Records) != 1 || result.ProviderCalls != 0 {
		t.Fatalf("unexpected gzip projection: %#v", result)
	}
	raw, _ := result.Records[0].Payload.Payload["provider_object_json"].(string)
	if !strings.Contains(raw, `"provider_extension":{"exact":true}`) {
		t.Fatalf("gzip projection lost exact provider extension: %s", raw)
	}
}

func TestCapturedPageGzipEnvelopeRejectsExpansionAndTrailingBytes(t *testing.T) {
	oversized := strings.Repeat("x", capturedPageMaxBytes+1)
	if _, err := capturedPageResponseBytes(map[string]any{
		"provider_response_gzip_base64": gzipBase64(t, oversized),
	}); err == nil || !strings.Contains(err.Error(), "exceeds its byte limit") {
		t.Fatalf("expected decompressed byte-limit refusal, got %v", err)
	}

	valid := gzipBase64(t, `{"orders":[]}`)
	compressed, err := base64.StdEncoding.DecodeString(valid)
	if err != nil {
		t.Fatal(err)
	}
	compressed = append(compressed, []byte("trailing")...)
	if _, err := capturedPageResponseBytes(map[string]any{
		"provider_response_gzip_base64": base64.StdEncoding.EncodeToString(compressed),
	}); err == nil || !strings.Contains(err.Error(), "trailing bytes") {
		t.Fatalf("expected trailing-byte refusal, got %v", err)
	}
}

func TestProjectCapturedOrdersPageRejectsTamperAndForeignStore(t *testing.T) {
	body := `{"orders":[]}`
	payload := capturedOrdersPayload(t, body)
	payload["provider_response_sha256"] = strings.Repeat("0", 64)
	if _, err := projectCapturedOrdersPage(capturedOrdersState(), payload); err == nil ||
		!strings.Contains(err.Error(), "SHA-256 mismatch") {
		t.Fatalf("expected digest mismatch, got %v", err)
	}

	payload = capturedOrdersPayload(t, body)
	payload["request_url"] = "https://attacker.example/orders.json"
	if _, err := projectCapturedOrdersPage(capturedOrdersState(), payload); err == nil ||
		!strings.Contains(err.Error(), "escaped the configured store boundary") {
		t.Fatalf("expected store-boundary rejection, got %v", err)
	}
}

func TestProjectCapturedOrdersPageRejectsMalformedContract(t *testing.T) {
	body := `{"orders":[]}`
	tests := []struct {
		name   string
		mutate func(map[string]any)
		match  string
	}{
		{
			name: "wrong family",
			mutate: func(payload map[string]any) {
				payload["family"] = "customers.delta"
			},
			match: "only orders.delta",
		},
		{
			name: "unsafe observation id",
			mutate: func(payload map[string]any) {
				payload["observation_id"] = "../escape"
			},
			match: "safe observation_id",
		},
		{
			name: "missing orders",
			mutate: func(payload map[string]any) {
				replacement := `{"customers":[]}`
				digest := sha256.Sum256([]byte(replacement))
				payload["provider_response_json"] = replacement
				payload["provider_response_sha256"] = hex.EncodeToString(digest[:])
			},
			match: "missing orders",
		},
		{
			name: "credential query",
			mutate: func(payload map[string]any) {
				payload["request_url"] = payload["request_url"].(string) + "&access_token=secret"
			},
			match: "credential material",
		},
		{
			name: "invalid window",
			mutate: func(payload map[string]any) {
				payload["window_through"] = payload["request_since"]
			},
			match: "must be after",
		},
		{
			name: "fractional record offset",
			mutate: func(payload map[string]any) {
				payload["record_offset"] = 1.5
			},
			match: "must be an integer",
		},
		{
			name: "oversized record limit",
			mutate: func(payload map[string]any) {
				payload["record_limit"] = shopifySourceMaxRecords + 1
			},
			match: "outside its bound",
		},
		{
			name: "ambiguous response encoding",
			mutate: func(payload map[string]any) {
				payload["provider_response_gzip_base64"] = gzipBase64(t, body)
			},
			match: "exactly one provider response encoding",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			payload := capturedOrdersPayload(t, body)
			test.mutate(payload)
			_, err := projectCapturedOrdersPage(capturedOrdersState(), payload)
			if err == nil || !strings.Contains(err.Error(), test.match) {
				t.Fatalf("expected %q failure, got %v", test.match, err)
			}
		})
	}
}

func TestCapturedPagePublishedDiscoveryMatchesExecutableContract(t *testing.T) {
	raw, err := os.ReadFile("../../adapter.nexus.json")
	if err != nil {
		t.Fatal(err)
	}
	var descriptor struct {
		Methods map[string]struct {
			Description        string         `json:"description"`
			Action             string         `json:"action"`
			ConnectionRequired bool           `json:"connection_required"`
			MutatesRemote      bool           `json:"mutates_remote"`
			Params             map[string]any `json:"params"`
			Response           map[string]any `json:"response"`
		} `json:"methods"`
	}
	if err := json.Unmarshal(raw, &descriptor); err != nil {
		t.Fatal(err)
	}
	const methodName = "shopify.source.project-captured-page"
	published, ok := descriptor.Methods[methodName]
	if !ok {
		t.Fatalf("adapter.nexus.json does not publish %s", methodName)
	}
	executable, ok := declaredShopifyMethods()[methodName]
	if !ok {
		t.Fatalf("executable adapter does not declare %s", methodName)
	}
	if executable.ConnectionRequired == nil || executable.MutatesRemote == nil {
		t.Fatalf("executable %s authority flags are incomplete", methodName)
	}
	if published.Description != executable.Description ||
		published.Action != executable.Action ||
		published.ConnectionRequired != *executable.ConnectionRequired ||
		published.MutatesRemote != *executable.MutatesRemote {
		t.Fatalf("published %s metadata differs from executable declaration", methodName)
	}
	for label, pair := range map[string][2]any{
		"params":   {published.Params, executable.Params},
		"response": {published.Response, executable.Response},
	} {
		publishedJSON, err := json.Marshal(pair[0])
		if err != nil {
			t.Fatalf("marshal published %s: %v", label, err)
		}
		executableJSON, err := json.Marshal(pair[1])
		if err != nil {
			t.Fatalf("marshal executable %s: %v", label, err)
		}
		if !bytes.Equal(publishedJSON, executableJSON) {
			t.Fatalf("published %s %s differs from executable declaration\npublished: %s\nexecutable: %s", methodName, label, publishedJSON, executableJSON)
		}
	}
}
