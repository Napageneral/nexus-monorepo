package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"
)

func TestShopifyOrderPreservesExactSourceObjectBeforeTypedProjection(t *testing.T) {
	input := []byte(`{
		"id":101,
		"order_number":12,
		"name":"#101",
		"created_at":"2026-07-20T10:00:00Z",
		"updated_at":"2026-07-20T10:05:00Z",
		"processed_at":"2026-07-20T10:04:00Z",
		"currency":"USD",
		"total_price":"199.00",
		"subtotal_price":"199.00",
		"financial_status":"paid",
		"email":"customer@example.com",
		"phone":"+15125550123",
		"customer":{"id":44,"provider_customer_extension":"retained"},
		"shipping_address":{"id":71,"first_name":"Jane","last_name":"Doe","address1":"1 Moon Way","city":"Austin","province_code":"TX","country_code":"US","zip":"78701","provider_address_extension":"retained"},
		"billing_address":{"id":72,"first_name":"Jane","last_name":"Doe","address1":"2 Billing Way","city":"Austin","province_code":"TX","country_code":"US","zip":"78702"},
		"line_items":[{"id":501,"product_id":99,"variant_id":199,"title":"MoonSpoon","variant_title":"Champagne","sku":"MS-MOONSPOON-CHAMPAGNE","quantity":1,"price":"199.00","provider_line_extension":{"value":true}}],
		"provider_order_extension":{"nested":[1,2,3]}
	}`)

	var order shopifyOrder
	if err := json.Unmarshal(input, &order); err != nil {
		t.Fatalf("decode order: %v", err)
	}
	if order.rawProviderPayload == nil {
		t.Fatal("expected exact source object")
	}
	if _, ok := order.rawProviderPayload["provider_order_extension"]; !ok {
		t.Fatal("provider-only order field was discarded")
	}
	if !bytes.Equal(order.rawProviderJSON, input) {
		t.Fatal("exact order source object bytes were not retained")
	}
	providerExtension, ok := order.rawProviderPayload["provider_order_extension"].(map[string]any)
	if !ok {
		t.Fatalf("unexpected provider extension: %#v", order.rawProviderPayload["provider_order_extension"])
	}
	nested, ok := providerExtension["nested"].([]any)
	if !ok || len(nested) != 3 {
		t.Fatalf("unexpected provider number list: %#v", providerExtension["nested"])
	}
	if _, ok := nested[0].(json.Number); !ok {
		t.Fatalf("provider numbers were coerced before payload custody: %#v", nested[0])
	}
	if len(order.LineItems) != 1 || order.LineItems[0].rawProviderPayload == nil {
		t.Fatal("expected exact line-item source object")
	}
	if _, ok := order.LineItems[0].rawProviderPayload["provider_line_extension"]; !ok {
		t.Fatal("provider-only line field was discarded")
	}
	if !bytes.Contains(order.LineItems[0].rawProviderJSON, []byte(`"provider_line_extension":{"value":true}`)) {
		t.Fatal("exact line-item source object bytes were not retained")
	}

	row := normalizedOrderRow("moonsleepco.myshopify.com", order)
	if got := row["customer_phone"]; got != "+15125550123" {
		t.Fatalf("unexpected customer phone: %#v", got)
	}
	shipping, ok := row["shipping_address"].(map[string]any)
	if !ok {
		t.Fatalf("expected normalized shipping snapshot, got %#v", row["shipping_address"])
	}
	if got := shipping["address1"]; got != "1 Moon Way" {
		t.Fatalf("unexpected shipping address: %#v", got)
	}
	if got := shipping["country_code"]; got != "US" {
		t.Fatalf("unexpected shipping country: %#v", got)
	}
	record := buildOrderRecord(&shopifyState{ConnectionID: "shopify-primary", ShopDomain: "moonsleepco.myshopify.com"}, order, shopifySourceRequest{})
	assertProviderPayloadEnvelope(t, record.Payload.Payload, input)
	if _, leaked := record.Payload.Metadata["raw_provider_payload"]; leaked {
		t.Fatal("provider order object leaked into Nex metadata")
	}
}

func TestUnknownShopifyProviderFieldChangesImmutableRevision(t *testing.T) {
	decodeOrder := func(t *testing.T, marker string) shopifyOrder {
		t.Helper()
		input := []byte(`{"id":101,"name":"#101","created_at":"2026-07-20T10:00:00Z","updated_at":"2026-07-20T10:05:00Z","currency":"USD","total_price":"199.00","provider_revision_marker":"` + marker + `"}`)
		var order shopifyOrder
		if err := json.Unmarshal(input, &order); err != nil {
			t.Fatalf("decode order: %v", err)
		}
		return order
	}
	state := &shopifyState{ConnectionID: "shopify-primary", ShopDomain: "moonsleepco.myshopify.com"}
	first := buildOrderRecord(state, decodeOrder(t, "first"), shopifySourceRequest{})
	second := buildOrderRecord(state, decodeOrder(t, "second"), shopifySourceRequest{})
	firstRevision := first.Payload.Metadata["revision_hash"]
	secondRevision := second.Payload.Metadata["revision_hash"]
	if firstRevision == secondRevision {
		t.Fatalf("provider-only change was suppressed under one revision: %#v", firstRevision)
	}
}

func TestShopifyCustomerPreservesIdentityFieldsAndExactSourceObject(t *testing.T) {
	input := []byte(`{
		"id":"gid://shopify/Customer/44",
		"displayName":"Jane Doe",
		"firstName":"Jane",
		"lastName":"Doe",
		"email":"customer@example.com",
		"phone":"+15125550123",
		"createdAt":"2026-01-01T00:00:00Z",
		"updatedAt":"2026-07-20T10:05:00Z",
		"tags":["repeat-customer"],
		"state":"ENABLED",
		"verifiedEmail":true,
		"defaultAddress":{"id":"gid://shopify/MailingAddress/71","firstName":"Jane","lastName":"Doe","address1":"1 Moon Way","city":"Austin","provinceCode":"TX","countryCodeV2":"US","zip":"78701"},
		"addresses":[{"id":"gid://shopify/MailingAddress/71","firstName":"Jane","lastName":"Doe","address1":"1 Moon Way","city":"Austin","provinceCode":"TX","countryCodeV2":"US","zip":"78701"}],
		"provider_customer_extension":{"retained":true}
	}`)

	var customer shopifyGraphQLCustomer
	if err := json.Unmarshal(input, &customer); err != nil {
		t.Fatalf("decode customer: %v", err)
	}
	if customer.rawProviderPayload == nil {
		t.Fatal("expected exact customer source object")
	}
	if _, ok := customer.rawProviderPayload["provider_customer_extension"]; !ok {
		t.Fatal("provider-only customer field was discarded")
	}
	if !bytes.Equal(customer.rawProviderJSON, input) {
		t.Fatal("exact customer source object bytes were not retained")
	}

	row := normalizedCustomerRow("moonsleepco.myshopify.com", customer)
	for field, want := range map[string]any{
		"customer_gid":   "gid://shopify/Customer/44",
		"first_name":     "Jane",
		"last_name":      "Doe",
		"email":          "customer@example.com",
		"phone":          "+15125550123",
		"created_at":     "2026-01-01T00:00:00Z",
		"verified_email": true,
	} {
		if got := row[field]; got != want {
			t.Fatalf("unexpected %s: got %#v want %#v", field, got, want)
		}
	}
	if got := row["addresses_complete"]; got != true {
		t.Fatalf("expected the Shopify customer address list to be complete, got %#v", got)
	}
	addresses, ok := row["addresses"].([]map[string]any)
	if !ok || len(addresses) != 1 {
		t.Fatalf("unexpected normalized addresses: %#v", row["addresses"])
	}
	if got := addresses[0]["country_code"]; got != "US" {
		t.Fatalf("unexpected address country: %#v", got)
	}
	record := buildCustomerRecord(&shopifyState{ConnectionID: "shopify-primary", ShopDomain: "moonsleepco.myshopify.com"}, customer, shopifySourceRequest{})
	assertProviderPayloadEnvelope(t, record.Payload.Payload, input)
	if _, leaked := record.Payload.Metadata["raw_provider_payload"]; leaked {
		t.Fatal("provider customer object leaked into Nex metadata")
	}
}

func assertProviderPayloadEnvelope(t *testing.T, envelope map[string]any, sourceJSON []byte) {
	t.Helper()
	if envelope == nil {
		t.Fatal("expected provider payload envelope")
	}
	if got := envelope["provider_object_json"]; got != string(sourceJSON) {
		t.Fatal("provider payload does not retain exact source JSON")
	}
	digest := sha256.Sum256(sourceJSON)
	if got := envelope["provider_object_sha256"]; got != hex.EncodeToString(digest[:]) {
		t.Fatalf("unexpected provider payload digest: %#v", got)
	}
	if _, present := envelope["provider_object"]; present {
		t.Fatal("decoded provider object must not cross the JavaScript JSON boundary")
	}
}

func TestShopifyGraphQLTypedProjectionUsesOriginalProviderObjectBytes(t *testing.T) {
	responseBody := []byte(`{"data":{"customers":{"edges":[{"cursor":"customer-44","node":{"id":"gid://shopify/Customer/44","displayName":"Jane Doe","updatedAt":"2026-07-20T10:05:00Z","provider_large_integer":9007199254740993123456789}}],"pageInfo":{"hasNextPage":false,"endCursor":"customer-44"}}}}`)

	var response shopifyGraphQLResponse
	if err := json.Unmarshal(responseBody, &response); err != nil {
		t.Fatalf("decode graphql response: %v", err)
	}
	connection, err := decodeGraphQLField[shopifyCustomerConnection](&response, "customers")
	if err != nil {
		t.Fatalf("decode typed customer connection: %v", err)
	}
	if len(connection.Edges) != 1 {
		t.Fatalf("expected one customer edge, got %d", len(connection.Edges))
	}
	customer := connection.Edges[0].Node
	if !bytes.Contains(customer.rawProviderJSON, []byte(`"provider_large_integer":9007199254740993123456789`)) {
		t.Fatalf("provider number lexeme was rewritten before typed decode: %s", customer.rawProviderJSON)
	}
}
