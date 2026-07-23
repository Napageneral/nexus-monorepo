package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestGraphQLSourceFamiliesCaptureExactlyOneProviderPage(t *testing.T) {
	tests := []struct {
		name     string
		response string
		capture  func(context.Context, *shopifyState, time.Time, time.Time, string) ([]nexadapter.AdapterInboundRecord, string, bool, error)
	}{
		{
			name:     "products",
			response: `{"data":{"products":{"edges":[{"cursor":"p1","node":{"id":"gid://shopify/Product/1","title":"MoonSpoon","handle":"moonspoon","updatedAt":"2026-07-22T11:00:00Z","tags":[],"status":"ACTIVE","vendor":"MoonSleep","productType":"Pillow"}}],"pageInfo":{"hasNextPage":true,"endCursor":"product-next"}}}}`,
			capture:  captureProductsForTest,
		},
		{
			name:     "catalog",
			response: `{"data":{"collections":{"edges":[{"cursor":"c1","node":{"id":"gid://shopify/Collection/1","title":"Pillows","handle":"pillows","updatedAt":"2026-07-22T11:00:00Z","templateSuffix":"","productsCount":{"count":1},"ruleSet":null}}],"pageInfo":{"hasNextPage":true,"endCursor":"catalog-next"}}}}`,
			capture:  captureCollectionsForTest,
		},
		{
			name:     "fulfillment",
			response: `{"data":{"fulfillmentOrders":{"edges":[{"cursor":"f1","node":{"id":"gid://shopify/FulfillmentOrder/1","updatedAt":"2026-07-22T11:00:00Z","status":"OPEN","requestStatus":"UNSUBMITTED","fulfillAt":"","orderName":"#1001","orderId":"gid://shopify/Order/1"}}],"pageInfo":{"hasNextPage":true,"endCursor":"fulfillment-next"}}}}`,
			capture:  captureFulfillmentsForTest,
		},
		{
			name:     "marketing",
			response: `{"data":{"marketingActivities":{"edges":[{"cursor":"m1","node":{"id":"gid://shopify/MarketingActivity/1","title":"Launch","status":"ACTIVE","updatedAt":"2026-07-22T11:00:00Z","marketingChannel":"SOCIAL","tactic":"RETARGETING"}}],"pageInfo":{"hasNextPage":true,"endCursor":"marketing-next"}}}}`,
			capture:  captureMarketingForTest,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Cleanup(resetShopifyGlobals)
			requests := 0
			server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
				switch request.URL.Path {
				case "/admin/oauth/access_token":
					_, _ = response.Write([]byte(`{"access_token":"token"}`))
				case "/admin/api/2026-01/graphql.json":
					requests++
					_, _ = response.Write([]byte(test.response))
				default:
					http.NotFound(response, request)
				}
			}))
			defer server.Close()
			shopifyHTTPClient = server.Client()
			state := &shopifyState{ConnectionID: "shopify-primary-" + test.name, ShopDomain: strings.TrimPrefix(server.URL, "https://"), ClientID: "client-" + test.name, ClientSecret: "secret", APIVersion: "2026-01"}
			records, next, complete, err := test.capture(context.Background(), state, time.Date(2026, 7, 22, 10, 0, 0, 0, time.UTC), time.Date(2026, 7, 22, 12, 0, 0, 0, time.UTC), "")
			if err != nil {
				t.Fatal(err)
			}
			if requests != 1 || len(records) != 1 || next == "" || complete {
				t.Fatalf("requests=%d records=%d next=%q complete=%v", requests, len(records), next, complete)
			}
			if _, present := records[0].Payload.Metadata["raw_provider_payload"]; present {
				t.Fatal("provider object leaked into Nex metadata")
			}
			if asStringForTest(records[0].Payload.Payload["provider_object_json"]) == "" {
				t.Fatal("exact provider object is missing from record payload")
			}
		})
	}
}

func asStringForTest(value any) string {
	result, _ := value.(string)
	return result
}

func captureProductsForTest(ctx context.Context, state *shopifyState, since, through time.Time, after string) ([]nexadapter.AdapterInboundRecord, string, bool, error) {
	return captureShopifyProductsPage(ctx, state, since, through, after)
}

func captureCollectionsForTest(ctx context.Context, state *shopifyState, since, through time.Time, after string) ([]nexadapter.AdapterInboundRecord, string, bool, error) {
	return captureShopifyCollectionsPage(ctx, state, since, through, after)
}

func captureFulfillmentsForTest(ctx context.Context, state *shopifyState, since, through time.Time, after string) ([]nexadapter.AdapterInboundRecord, string, bool, error) {
	return captureShopifyFulfillmentsPage(ctx, state, since, through, after)
}

func captureMarketingForTest(ctx context.Context, state *shopifyState, since, through time.Time, after string) ([]nexadapter.AdapterInboundRecord, string, bool, error) {
	return captureShopifyMarketingPage(ctx, state, since, through, after)
}

func TestDiscountSourceCursorTraversesCodeThenAutomaticOnePageAtATime(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)
	requests := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/admin/oauth/access_token":
			_, _ = response.Write([]byte(`{"access_token":"token"}`))
		case "/admin/api/2026-01/graphql.json":
			requests++
			var payload struct {
				Query string `json:"query"`
			}
			_ = json.NewDecoder(request.Body).Decode(&payload)
			if strings.Contains(payload.Query, "SourceCodeDiscounts") {
				_, _ = response.Write([]byte(`{"data":{"codeDiscountNodes":{"edges":[{"cursor":"d1","node":{"id":"gid://shopify/DiscountCodeNode/900719925474099312345","events":{"edges":[]},"codeDiscount":{"__typename":"DiscountCodeBasic","title":"SAVE","status":"ACTIVE","startsAt":"2026-07-22T10:00:00Z","endsAt":null,"updatedAt":"2026-07-22T11:00:00Z"}}}],"pageInfo":{"hasNextPage":false,"endCursor":"d1"}}}}`))
				return
			}
			_, _ = response.Write([]byte(`{"data":{"automaticDiscountNodes":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":null}}}}`))
		}
	}))
	defer server.Close()
	shopifyHTTPClient = server.Client()
	state := &shopifyState{ConnectionID: "shopify-primary-discounts", ShopDomain: strings.TrimPrefix(server.URL, "https://"), ClientID: "client-discounts", ClientSecret: "secret", APIVersion: "2026-01"}
	since := time.Date(2026, 7, 22, 10, 0, 0, 0, time.UTC)
	through := time.Date(2026, 7, 22, 12, 0, 0, 0, time.UTC)
	records, next, complete, err := captureShopifyDiscountsPage(context.Background(), state, since, through, "")
	if err != nil {
		t.Fatal(err)
	}
	if requests != 1 || len(records) != 1 || next == "" || complete {
		t.Fatalf("code page requests=%d records=%d next=%q complete=%v", requests, len(records), next, complete)
	}
	providerJSON, _ := records[0].Payload.Payload["provider_object_json"].(string)
	if !strings.Contains(providerJSON, `"id":"gid://shopify/DiscountCodeNode/900719925474099312345"`) {
		t.Fatalf("exact discount object missing: %q", providerJSON)
	}
	records, next, complete, err = captureShopifyDiscountsPage(context.Background(), state, since, through, next)
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 || len(records) != 0 || next != "" || !complete {
		t.Fatalf("automatic page requests=%d records=%d next=%q complete=%v", requests, len(records), next, complete)
	}
}
