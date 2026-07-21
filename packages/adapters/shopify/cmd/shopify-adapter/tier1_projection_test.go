package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestBuildCustomerRecord(t *testing.T) {
	record := buildCustomerRecord(
		&shopifyState{
			ConnectionID: "shopify-primary",
			ShopDomain:   "moonsleepco.myshopify.com",
		},
		shopifyGraphQLCustomer{
			ID:          "gid://shopify/Customer/44",
			DisplayName: "Jane Doe",
			Email:       "jane@example.com",
			UpdatedAt:   "2026-04-03T14:00:00Z",
			Tags:        []string{"vip", "repeat"},
			State:       "ENABLED",
		},
		shopifySourceRequest{
			APIBaseURL: "https://moonsleepco.myshopify.com/admin/api/2026-01",
			Path:       shopifyGraphQLProjectionPath,
			Request:    map[string]any{"operation": "Tier1Customers"},
		},
	)

	if record.Routing.ContainerID != "customer" {
		t.Fatalf("unexpected container id: %q", record.Routing.ContainerID)
	}
	if record.Routing.Adapter != platformID {
		t.Fatalf("unexpected adapter id: %q", record.Routing.Adapter)
	}
	if record.Routing.ThreadID != "moonsleepco.myshopify.com:customer:44" {
		t.Fatalf("unexpected thread id: %q", record.Routing.ThreadID)
	}
	if !strings.Contains(record.Payload.ExternalRecordID, ":customer:44:") {
		t.Fatalf("unexpected external record id: %q", record.Payload.ExternalRecordID)
	}
	if got := record.Payload.Metadata["family"]; got != "customer" {
		t.Fatalf("unexpected family metadata: %#v", got)
	}
}

func TestBuildProductRecord(t *testing.T) {
	record := buildProductRecord(
		&shopifyState{
			ConnectionID: "shopify-primary",
			ShopDomain:   "moonsleepco.myshopify.com",
		},
		shopifyGraphQLProduct{
			ID:          "gid://shopify/Product/55",
			Title:       "Cooling Pillow",
			Handle:      "cooling-pillow",
			UpdatedAt:   "2026-04-03T15:00:00Z",
			Tags:        []string{"hero"},
			Status:      "ACTIVE",
			Vendor:      "MoonSleep",
			ProductType: "Pillow",
		},
		shopifySourceRequest{
			APIBaseURL: "https://moonsleepco.myshopify.com/admin/api/2026-01",
			Path:       shopifyGraphQLProjectionPath,
			Request:    map[string]any{"operation": "Tier1Products"},
		},
	)

	if record.Routing.ContainerID != "product" {
		t.Fatalf("unexpected container id: %q", record.Routing.ContainerID)
	}
	if record.Routing.ThreadID != "moonsleepco.myshopify.com:product:55" {
		t.Fatalf("unexpected thread id: %q", record.Routing.ThreadID)
	}
	if !strings.Contains(record.Payload.ExternalRecordID, ":product:55:") {
		t.Fatalf("unexpected external record id: %q", record.Payload.ExternalRecordID)
	}
	if got := record.Payload.Metadata["family"]; got != "product" {
		t.Fatalf("unexpected family metadata: %#v", got)
	}
}

func TestBuildCollectionRecord(t *testing.T) {
	record := buildCollectionRecord(
		&shopifyState{
			ConnectionID: "shopify-primary",
			ShopDomain:   "moonsleepco.myshopify.com",
		},
		shopifyGraphQLCollection{
			ID:        "gid://shopify/Collection/66",
			Title:     "Proof Collection",
			Handle:    "proof-collection",
			UpdatedAt: "2026-04-03T15:30:00Z",
		},
		shopifySourceRequest{
			APIBaseURL: "https://moonsleepco.myshopify.com/admin/api/2026-01",
			Path:       shopifyGraphQLProjectionPath,
			Request:    map[string]any{"operation": "Tier1Collections"},
		},
	)

	if record.Routing.ContainerID != "collection" {
		t.Fatalf("unexpected container id: %q", record.Routing.ContainerID)
	}
	if record.Routing.ThreadID != "moonsleepco.myshopify.com:collection:66" {
		t.Fatalf("unexpected thread id: %q", record.Routing.ThreadID)
	}
	if got := record.Payload.Metadata["family"]; got != "collection" {
		t.Fatalf("unexpected family metadata: %#v", got)
	}
}

func TestBuildInventoryRecords(t *testing.T) {
	records := buildInventoryRecords(
		&shopifyState{
			ConnectionID: "shopify-primary",
			ShopDomain:   "moonsleepco.myshopify.com",
		},
		shopifyGraphQLInventoryItem{
			ID:        "gid://shopify/InventoryItem/77",
			SKU:       "proof-sku",
			UpdatedAt: "2026-04-03T15:40:00Z",
			Tracked:   true,
			InventoryLevels: shopifyInventoryLevelConnection{
				Edges: []shopifyInventoryLevelEdge{{
					Node: shopifyGraphQLInventoryLevel{
						ID:        "gid://shopify/InventoryLevel/88?inventory_item_id=77",
						UpdatedAt: "2026-04-03T15:41:00Z",
						Location:  shopifyGraphQLLocation{ID: "gid://shopify/Location/99", Name: "Warehouse"},
						Quantities: []shopifyGraphQLQuantity{{
							Name:     "available",
							Quantity: 42,
						}},
					},
				}},
			},
		},
		shopifySourceRequest{
			APIBaseURL: "https://moonsleepco.myshopify.com/admin/api/2026-01",
			Path:       shopifyGraphQLProjectionPath,
			Request:    map[string]any{"operation": "Tier1Inventory"},
		},
	)

	if len(records) != 1 {
		t.Fatalf("unexpected record count: %d", len(records))
	}
	if records[0].Routing.ContainerID != "inventory" {
		t.Fatalf("unexpected container id: %q", records[0].Routing.ContainerID)
	}
	if got := records[0].Payload.Metadata["family"]; got != "inventory" {
		t.Fatalf("unexpected family metadata: %#v", got)
	}
}

func TestBuildFulfillmentRecord(t *testing.T) {
	record := buildFulfillmentRecord(
		&shopifyState{
			ConnectionID: "shopify-primary",
			ShopDomain:   "moonsleepco.myshopify.com",
		},
		shopifyGraphQLFulfillmentOrder{
			ID:            "gid://shopify/FulfillmentOrder/101",
			UpdatedAt:     "2026-04-03T16:00:00Z",
			Status:        "OPEN",
			RequestStatus: "UNSUBMITTED",
			FulfillAt:     "2026-04-03T17:00:00Z",
			OrderName:     "#1001",
			OrderID:       "gid://shopify/Order/12",
		},
		shopifySourceRequest{
			APIBaseURL: "https://moonsleepco.myshopify.com/admin/api/2026-01",
			Path:       shopifyGraphQLProjectionPath,
			Request:    map[string]any{"operation": "Tier1Fulfillments"},
		},
	)

	if record.Routing.ContainerID != "fulfillment" {
		t.Fatalf("unexpected container id: %q", record.Routing.ContainerID)
	}
	if record.Routing.ThreadID != "moonsleepco.myshopify.com:fulfillment:101" {
		t.Fatalf("unexpected thread id: %q", record.Routing.ThreadID)
	}
	if got := record.Payload.Metadata["family"]; got != "fulfillment" {
		t.Fatalf("unexpected family metadata: %#v", got)
	}
}

func TestBuildDiscountRecord(t *testing.T) {
	record := buildDiscountRecord(
		&shopifyState{
			ConnectionID: "shopify-primary",
			ShopDomain:   "moonsleepco.myshopify.com",
		},
		shopifyGraphQLDiscountRecord{
			NodeGID:      "gid://shopify/DiscountCodeNode/202",
			DiscountType: "DiscountCodeBasic",
			Title:        "Proof Discount",
			Status:       "ACTIVE",
			StartsAt:     "2026-04-03T16:10:00Z",
			UpdatedAt:    "2026-04-03T16:11:00Z",
		},
		shopifySourceRequest{
			APIBaseURL: "https://moonsleepco.myshopify.com/admin/api/2026-01",
			Path:       shopifyGraphQLProjectionPath,
			Request:    map[string]any{"operation": "Tier1Discounts"},
		},
	)

	if record.Routing.ContainerID != "discount" {
		t.Fatalf("unexpected container id: %q", record.Routing.ContainerID)
	}
	if got := record.Payload.Metadata["family"]; got != "discount" {
		t.Fatalf("unexpected family metadata: %#v", got)
	}
}

func TestBuildMarketingRecord(t *testing.T) {
	record := buildMarketingRecord(
		&shopifyState{
			ConnectionID: "shopify-primary",
			ShopDomain:   "moonsleepco.myshopify.com",
		},
		shopifyGraphQLMarketingActivity{
			ID:               "gid://shopify/MarketingActivity/303",
			Title:            "Proof Campaign",
			Status:           "ACTIVE",
			UpdatedAt:        "2026-04-03T16:12:00Z",
			MarketingChannel: "SOCIAL",
			Tactic:           "AD",
		},
		shopifySourceRequest{
			APIBaseURL: "https://moonsleepco.myshopify.com/admin/api/2026-01",
			Path:       shopifyGraphQLProjectionPath,
			Request:    map[string]any{"operation": "Tier1Marketing"},
		},
	)

	if record.Routing.ContainerID != "marketing" {
		t.Fatalf("unexpected container id: %q", record.Routing.ContainerID)
	}
	if got := record.Payload.Metadata["family"]; got != "marketing" {
		t.Fatalf("unexpected family metadata: %#v", got)
	}
}

func TestDiscountUpdatedAtIgnoresScheduledStartsAtAsFreshnessSignal(t *testing.T) {
	got := discountUpdatedAt(
		"",
		shopifyDiscountEventConnection{
			Edges: []shopifyDiscountEventEdge{{
				Node: shopifyDiscountEvent{
					CreatedAt: "2026-04-03T16:11:00Z",
				},
			}},
		},
		"2030-01-01T00:00:00Z",
		"",
	)
	if got != "2026-04-03T16:11:00Z" {
		t.Fatalf("unexpected updatedAt: %q", got)
	}
}

func TestFetchShopifyRecordsIncludesTier1Families(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/orders.json":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"orders":[{"id":101,"order_number":12,"name":"#101","created_at":"2026-04-01T10:00:00Z","updated_at":"2026-04-01T10:05:00Z","processed_at":"2026-04-01T10:04:00Z","currency":"USD","total_price":"129.00","subtotal_price":"129.00","financial_status":"paid","source_name":"web","line_items":[{"id":501,"product_id":99,"variant_id":199,"title":"Body Pillow","quantity":2,"price":"64.50"}]}]}`))
		case "/admin/api/2026-01/graphql.json":
			var payload struct {
				Query string `json:"query"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode graphql payload: %v", err)
			}
			w.Header().Set("Content-Type", "application/json")
			switch {
			case strings.Contains(payload.Query, "customers("):
				_, _ = w.Write([]byte(`{"data":{"customers":{"edges":[{"cursor":"customer-1","node":{"id":"gid://shopify/Customer/44","displayName":"Jane Doe","email":"jane@example.com","updatedAt":"2026-04-03T14:00:00Z","tags":["vip"],"state":"ENABLED"}}],"pageInfo":{"hasNextPage":false,"endCursor":"customer-1"}}}}`))
			case strings.Contains(payload.Query, "products("):
				_, _ = w.Write([]byte(`{"data":{"products":{"edges":[{"cursor":"product-1","node":{"id":"gid://shopify/Product/55","title":"Cooling Pillow","handle":"cooling-pillow","updatedAt":"2026-04-03T15:00:00Z","tags":["hero"],"status":"ACTIVE","vendor":"MoonSleep","productType":"Pillow"}}],"pageInfo":{"hasNextPage":false,"endCursor":"product-1"}}}}`))
			case strings.Contains(payload.Query, "collections("):
				_, _ = w.Write([]byte(`{"data":{"collections":{"edges":[{"cursor":"collection-1","node":{"id":"gid://shopify/Collection/66","title":"Proof Collection","handle":"proof-collection","updatedAt":"2026-04-03T15:30:00Z"}}],"pageInfo":{"hasNextPage":false,"endCursor":"collection-1"}}}}`))
			case strings.Contains(payload.Query, "inventoryItems("):
				_ = json.NewEncoder(w).Encode(map[string]any{
					"data": map[string]any{
						"inventoryItems": map[string]any{
							"edges": []any{
								map[string]any{
									"cursor": "inventory-1",
									"node": map[string]any{
										"id":        "gid://shopify/InventoryItem/77",
										"sku":       "proof-sku",
										"updatedAt": "2026-04-03T15:40:00Z",
										"tracked":   true,
										"inventoryLevels": map[string]any{
											"edges": []any{
												map[string]any{
													"node": map[string]any{
														"id":        "gid://shopify/InventoryLevel/88?inventory_item_id=77",
														"updatedAt": "2026-04-03T15:41:00Z",
														"location": map[string]any{
															"id":   "gid://shopify/Location/99",
															"name": "Warehouse",
														},
														"quantities": []any{
															map[string]any{
																"name":     "available",
																"quantity": 42,
															},
														},
													},
												},
											},
										},
									},
								},
							},
							"pageInfo": map[string]any{
								"hasNextPage": false,
								"endCursor":   "inventory-1",
							},
						},
					},
				})
			case strings.Contains(payload.Query, "fulfillmentOrders("):
				_, _ = w.Write([]byte(`{"data":{"fulfillmentOrders":{"edges":[{"cursor":"fulfillment-1","node":{"id":"gid://shopify/FulfillmentOrder/101","updatedAt":"2026-04-03T16:00:00Z","status":"OPEN","requestStatus":"UNSUBMITTED","fulfillAt":"2026-04-03T17:00:00Z","orderName":"#1001","orderId":"gid://shopify/Order/12"}}],"pageInfo":{"hasNextPage":false,"endCursor":"fulfillment-1"}}}}`))
			case strings.Contains(payload.Query, "codeDiscountNodes("):
				_, _ = w.Write([]byte(`{"data":{"codeDiscountNodes":{"edges":[{"cursor":"discount-1","node":{"id":"gid://shopify/DiscountCodeNode/202","events":{"edges":[{"node":{"createdAt":"2026-04-03T16:11:00Z"}}]},"codeDiscount":{"__typename":"DiscountCodeBasic","title":"Proof Discount","status":"ACTIVE","startsAt":"2026-04-03T16:10:00Z","endsAt":null}}}],"pageInfo":{"hasNextPage":false,"endCursor":"discount-1"}}}}`))
			case strings.Contains(payload.Query, "automaticDiscountNodes("):
				_, _ = w.Write([]byte(`{"data":{"automaticDiscountNodes":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "marketingActivities("):
				_, _ = w.Write([]byte(`{"data":{"marketingActivities":{"edges":[{"cursor":"marketing-1","node":{"id":"gid://shopify/MarketingActivity/303","title":"Proof Campaign","status":"ACTIVE","updatedAt":"2026-04-03T16:12:00Z","marketingChannel":"SOCIAL","tactic":"AD"}}],"pageInfo":{"hasNextPage":false,"endCursor":"marketing-1"}}}}`))
			default:
				http.NotFound(w, r)
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	shopifyHTTPClient = server.Client()
	state := &shopifyState{
		ConnectionID: "shopify-primary",
		ShopDomain:   strings.TrimPrefix(server.URL, "https://"),
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		APIVersion:   "2026-01",
	}

	records, cursor, err := fetchShopifyRecords(context.Background(), state, mustParseRFC3339(t, "2026-04-01T00:00:00Z"), shopifySyncModeBackfill)
	if err != nil {
		t.Fatalf("fetchShopifyRecords: %v", err)
	}
	if len(records) != 9 {
		t.Fatalf("unexpected record count: %d", len(records))
	}
	families := map[string]int{}
	for _, record := range records {
		if family, _ := record.Payload.Metadata["family"].(string); family != "" {
			families[family]++
		}
	}
	for _, family := range []string{"order", "line_item", "customer", "product", "collection", "inventory", "fulfillment", "discount", "marketing"} {
		if families[family] == 0 {
			t.Fatalf("missing family %q in %#v", family, families)
		}
	}
	if got := cursor.Format(time.RFC3339); got != "2026-04-03T16:12:00Z" {
		t.Fatalf("unexpected cursor: %s", got)
	}
}

func TestFetchShopifyRecordsMonitorIncludesInventoryLevelOnlyChanges(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)

	monitorSince := mustParseRFC3339(t, "2026-04-03T17:25:00Z")
	inventoryQuery := "__unset__"

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/orders.json":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"orders":[]}`))
		case "/admin/api/2026-01/graphql.json":
			var payload struct {
				Query     string         `json:"query"`
				Variables map[string]any `json:"variables"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode graphql payload: %v", err)
			}
			w.Header().Set("Content-Type", "application/json")
			switch {
			case strings.Contains(payload.Query, "customers("):
				_, _ = w.Write([]byte(`{"data":{"customers":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "products("):
				_, _ = w.Write([]byte(`{"data":{"products":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "collections("):
				_, _ = w.Write([]byte(`{"data":{"collections":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "inventoryItems("):
				if raw, ok := payload.Variables["query"].(string); ok {
					inventoryQuery = raw
				}
				_ = json.NewEncoder(w).Encode(map[string]any{
					"data": map[string]any{
						"inventoryItems": map[string]any{
							"edges": []any{
								map[string]any{
									"cursor": "inventory-1",
									"node": map[string]any{
										"id":        "gid://shopify/InventoryItem/77",
										"sku":       "proof-sku",
										"updatedAt": "2026-04-03T17:24:00Z",
										"tracked":   true,
										"inventoryLevels": map[string]any{
											"edges": []any{
												map[string]any{
													"node": map[string]any{
														"id":        "gid://shopify/InventoryLevel/88?inventory_item_id=77",
														"updatedAt": "2026-04-03T17:25:46Z",
														"location": map[string]any{
															"id":   "gid://shopify/Location/99",
															"name": "Warehouse",
														},
														"quantities": []any{
															map[string]any{
																"name":     "available",
																"quantity": 1,
															},
														},
													},
												},
											},
										},
									},
								},
							},
							"pageInfo": map[string]any{
								"hasNextPage": false,
								"endCursor":   "inventory-1",
							},
						},
					},
				})
			case strings.Contains(payload.Query, "fulfillmentOrders("):
				_, _ = w.Write([]byte(`{"data":{"fulfillmentOrders":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "codeDiscountNodes("):
				_, _ = w.Write([]byte(`{"data":{"codeDiscountNodes":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "automaticDiscountNodes("):
				_, _ = w.Write([]byte(`{"data":{"automaticDiscountNodes":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "marketingActivities("):
				_, _ = w.Write([]byte(`{"data":{"marketingActivities":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			default:
				http.NotFound(w, r)
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	shopifyHTTPClient = server.Client()
	state := &shopifyState{
		ConnectionID: "shopify-primary",
		ShopDomain:   strings.TrimPrefix(server.URL, "https://"),
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		APIVersion:   "2026-01",
	}

	records, cursor, err := fetchShopifyRecords(context.Background(), state, monitorSince, shopifySyncModeMonitor)
	if err != nil {
		t.Fatalf("fetchShopifyRecords monitor: %v", err)
	}
	if inventoryQuery != "" {
		t.Fatalf("expected inventory monitor query to be blank for snapshot scan, got %q", inventoryQuery)
	}
	if cursor.IsZero() || cursor.UTC().Format(time.RFC3339) != "2026-04-03T17:25:46Z" {
		t.Fatalf("unexpected inventory cursor: %s", cursor.UTC().Format(time.RFC3339))
	}
	if len(records) != 1 {
		t.Fatalf("expected one inventory record, got %d", len(records))
	}
	if got := records[0].Routing.ContainerID; got != "inventory" {
		t.Fatalf("unexpected container id: %q", got)
	}
	if got := records[0].Payload.Timestamp; got != mustParseRFC3339(t, "2026-04-03T17:25:46Z").UnixMilli() {
		t.Fatalf("unexpected inventory timestamp: %d", got)
	}
}

func TestFetchShopifyRecordsMonitorIncludesCustomerOnlyChanges(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)

	monitorSince := mustParseRFC3339(t, "2026-04-03T18:49:00Z")
	customerQuery := "__unset__"

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/orders.json":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"orders":[]}`))
		case "/admin/api/2026-01/graphql.json":
			var payload struct {
				Query     string         `json:"query"`
				Variables map[string]any `json:"variables"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode graphql payload: %v", err)
			}
			w.Header().Set("Content-Type", "application/json")
			switch {
			case strings.Contains(payload.Query, "customers("):
				if raw, ok := payload.Variables["query"].(string); ok {
					customerQuery = raw
				}
				_, _ = w.Write([]byte(`{"data":{"customers":{"edges":[{"cursor":"customer-1","node":{"id":"gid://shopify/Customer/44","displayName":"Jane Doe","email":"jane@example.com","updatedAt":"2026-04-03T18:50:06Z","tags":["vip","nex-monitor-customer-proof-b"],"state":"ENABLED"}}],"pageInfo":{"hasNextPage":false,"endCursor":"customer-1"}}}}`))
			case strings.Contains(payload.Query, "products("):
				_, _ = w.Write([]byte(`{"data":{"products":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "collections("):
				_, _ = w.Write([]byte(`{"data":{"collections":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "inventoryItems("):
				_, _ = w.Write([]byte(`{"data":{"inventoryItems":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "fulfillmentOrders("):
				_, _ = w.Write([]byte(`{"data":{"fulfillmentOrders":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "codeDiscountNodes("):
				_, _ = w.Write([]byte(`{"data":{"codeDiscountNodes":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "automaticDiscountNodes("):
				_, _ = w.Write([]byte(`{"data":{"automaticDiscountNodes":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "marketingActivities("):
				_, _ = w.Write([]byte(`{"data":{"marketingActivities":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			default:
				http.NotFound(w, r)
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	shopifyHTTPClient = server.Client()
	state := &shopifyState{
		ConnectionID: "shopify-primary",
		ShopDomain:   strings.TrimPrefix(server.URL, "https://"),
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		APIVersion:   "2026-01",
	}

	records, cursor, err := fetchShopifyRecords(context.Background(), state, monitorSince, shopifySyncModeMonitor)
	if err != nil {
		t.Fatalf("fetchShopifyRecords monitor: %v", err)
	}
	if customerQuery != "" {
		t.Fatalf("expected customer monitor query to be blank for snapshot scan, got %q", customerQuery)
	}
	if cursor.IsZero() || cursor.UTC().Format(time.RFC3339) != "2026-04-03T18:50:06Z" {
		t.Fatalf("unexpected customer cursor: %s", cursor.UTC().Format(time.RFC3339))
	}
	if len(records) != 1 {
		t.Fatalf("expected one customer record, got %d", len(records))
	}
	if got := records[0].Routing.ContainerID; got != "customer" {
		t.Fatalf("unexpected container id: %q", got)
	}
	if got := records[0].Payload.Timestamp; got != mustParseRFC3339(t, "2026-04-03T18:50:06Z").UnixMilli() {
		t.Fatalf("unexpected customer timestamp: %d", got)
	}
}

func TestFetchShopifyRecordsMonitorIncludesCollectionOnlyChanges(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)

	monitorSince := mustParseRFC3339(t, "2026-04-03T18:00:00Z")
	collectionQuery := "__unset__"

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/orders.json":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"orders":[]}`))
		case "/admin/api/2026-01/graphql.json":
			var payload struct {
				Query     string         `json:"query"`
				Variables map[string]any `json:"variables"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode graphql payload: %v", err)
			}
			w.Header().Set("Content-Type", "application/json")
			switch {
			case strings.Contains(payload.Query, "customers("):
				_, _ = w.Write([]byte(`{"data":{"customers":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "products("):
				_, _ = w.Write([]byte(`{"data":{"products":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "collections("):
				if raw, ok := payload.Variables["query"].(string); ok {
					collectionQuery = raw
				}
				_ = json.NewEncoder(w).Encode(map[string]any{
					"data": map[string]any{
						"collections": map[string]any{
							"edges": []any{
								map[string]any{
									"cursor": "collection-1",
									"node": map[string]any{
										"id":             "gid://shopify/Collection/202",
										"title":          "Nexus Monitor Proof Collection B",
										"handle":         "nexus-monitor-proof-collection",
										"updatedAt":      "2026-04-03T18:00:13Z",
										"templateSuffix": "",
										"productsCount":  map[string]any{"count": 0},
										"ruleSet":        nil,
									},
								},
							},
							"pageInfo": map[string]any{
								"hasNextPage": false,
								"endCursor":   "collection-1",
							},
						},
					},
				})
			case strings.Contains(payload.Query, "inventoryItems("):
				_, _ = w.Write([]byte(`{"data":{"inventoryItems":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "fulfillmentOrders("):
				_, _ = w.Write([]byte(`{"data":{"fulfillmentOrders":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "codeDiscountNodes("):
				_, _ = w.Write([]byte(`{"data":{"codeDiscountNodes":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "automaticDiscountNodes("):
				_, _ = w.Write([]byte(`{"data":{"automaticDiscountNodes":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "marketingActivities("):
				_, _ = w.Write([]byte(`{"data":{"marketingActivities":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			default:
				http.NotFound(w, r)
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	shopifyHTTPClient = server.Client()
	state := &shopifyState{
		ConnectionID: "shopify-primary",
		ShopDomain:   strings.TrimPrefix(server.URL, "https://"),
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		APIVersion:   "2026-01",
	}

	records, cursor, err := fetchShopifyRecords(context.Background(), state, monitorSince, shopifySyncModeMonitor)
	if err != nil {
		t.Fatalf("fetchShopifyRecords monitor: %v", err)
	}
	if collectionQuery != "" {
		t.Fatalf("expected collection monitor query to be blank for snapshot scan, got %q", collectionQuery)
	}
	if cursor.IsZero() || cursor.UTC().Format(time.RFC3339) != "2026-04-03T18:00:13Z" {
		t.Fatalf("unexpected collection cursor: %s", cursor.UTC().Format(time.RFC3339))
	}
	if len(records) != 1 {
		t.Fatalf("expected one collection record, got %d", len(records))
	}
	if got := records[0].Routing.ContainerID; got != "collection" {
		t.Fatalf("unexpected container id: %q", got)
	}
	if got := records[0].Payload.Timestamp; got != mustParseRFC3339(t, "2026-04-03T18:00:13Z").UnixMilli() {
		t.Fatalf("unexpected collection timestamp: %d", got)
	}
}

func TestFetchShopifyRecordsMonitorIncludesProductOnlyChanges(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)

	monitorSince := mustParseRFC3339(t, "2026-04-03T18:08:00Z")
	productQuery := "__unset__"

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/orders.json":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"orders":[]}`))
		case "/admin/api/2026-01/graphql.json":
			var payload struct {
				Query     string         `json:"query"`
				Variables map[string]any `json:"variables"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode graphql payload: %v", err)
			}
			w.Header().Set("Content-Type", "application/json")
			switch {
			case strings.Contains(payload.Query, "customers("):
				_, _ = w.Write([]byte(`{"data":{"customers":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "products("):
				if raw, ok := payload.Variables["query"].(string); ok {
					productQuery = raw
				}
				_ = json.NewEncoder(w).Encode(map[string]any{
					"data": map[string]any{
						"products": map[string]any{
							"edges": []any{
								map[string]any{
									"cursor": "product-1",
									"node": map[string]any{
										"id":          "gid://shopify/Product/303",
										"title":       "Proof Product",
										"handle":      "proof-product",
										"updatedAt":   "2026-04-03T18:09:16Z",
										"tags":        []string{"nex-monitor-product-proof-a"},
										"status":      "ACTIVE",
										"vendor":      "MoonSleep",
										"productType": "Pillow",
									},
								},
							},
							"pageInfo": map[string]any{
								"hasNextPage": false,
								"endCursor":   "product-1",
							},
						},
					},
				})
			case strings.Contains(payload.Query, "collections("):
				_, _ = w.Write([]byte(`{"data":{"collections":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "inventoryItems("):
				_, _ = w.Write([]byte(`{"data":{"inventoryItems":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "fulfillmentOrders("):
				_, _ = w.Write([]byte(`{"data":{"fulfillmentOrders":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "codeDiscountNodes("):
				_, _ = w.Write([]byte(`{"data":{"codeDiscountNodes":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "automaticDiscountNodes("):
				_, _ = w.Write([]byte(`{"data":{"automaticDiscountNodes":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			case strings.Contains(payload.Query, "marketingActivities("):
				_, _ = w.Write([]byte(`{"data":{"marketingActivities":{"edges":[],"pageInfo":{"hasNextPage":false,"endCursor":""}}}}`))
			default:
				http.NotFound(w, r)
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	shopifyHTTPClient = server.Client()
	state := &shopifyState{
		ConnectionID: "shopify-primary",
		ShopDomain:   strings.TrimPrefix(server.URL, "https://"),
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		APIVersion:   "2026-01",
	}

	records, cursor, err := fetchShopifyRecords(context.Background(), state, monitorSince, shopifySyncModeMonitor)
	if err != nil {
		t.Fatalf("fetchShopifyRecords monitor: %v", err)
	}
	if productQuery != "" {
		t.Fatalf("expected product monitor query to be blank for snapshot scan, got %q", productQuery)
	}
	if cursor.IsZero() || cursor.UTC().Format(time.RFC3339) != "2026-04-03T18:09:16Z" {
		t.Fatalf("unexpected product cursor: %s", cursor.UTC().Format(time.RFC3339))
	}
	if len(records) != 1 {
		t.Fatalf("expected one product record, got %d", len(records))
	}
	if got := records[0].Routing.ContainerID; got != "product" {
		t.Fatalf("unexpected container id: %q", got)
	}
	if got := records[0].Payload.Timestamp; got != mustParseRFC3339(t, "2026-04-03T18:09:16Z").UnixMilli() {
		t.Fatalf("unexpected product timestamp: %d", got)
	}
}

func TestDiscountUpdatedAtPrefersExplicitUpdatedAt(t *testing.T) {
	updatedAt := discountUpdatedAt(
		"2026-04-03T18:10:00Z",
		shopifyDiscountEventConnection{
			Edges: []shopifyDiscountEventEdge{
				{Node: shopifyDiscountEvent{CreatedAt: "2026-04-03T18:05:00Z"}},
			},
		},
		"2026-04-03T18:00:00Z",
		"",
	)
	if updatedAt != "2026-04-03T18:10:00Z" {
		t.Fatalf("unexpected updatedAt: %q", updatedAt)
	}
}

func TestFetchMarketingActivitiesSinceUsesSupportedSortKey(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)

	seenSortKey := ""

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/graphql.json":
			var payload struct {
				Query     string         `json:"query"`
				Variables map[string]any `json:"variables"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode graphql payload: %v", err)
			}
			if strings.Contains(payload.Query, "marketingActivities(") {
				if raw, ok := payload.Variables["sortKey"].(string); ok {
					seenSortKey = raw
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"data":{"marketingActivities":{"edges":[{"cursor":"marketing-1","node":{"id":"gid://shopify/MarketingActivity/303","title":"Proof Campaign","status":"ACTIVE","updatedAt":"2026-04-03T16:12:00Z","marketingChannel":"SOCIAL","tactic":"AD"}}],"pageInfo":{"hasNextPage":false,"endCursor":"marketing-1"}}}}`))
				return
			}
			http.NotFound(w, r)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	shopifyHTTPClient = server.Client()
	state := &shopifyState{
		ConnectionID: "shopify-primary",
		ShopDomain:   strings.TrimPrefix(server.URL, "https://"),
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		APIVersion:   "2026-01",
	}

	activities, _, cursor, err := fetchMarketingActivitiesSince(context.Background(), state, mustParseRFC3339(t, "2026-04-01T00:00:00Z"))
	if err != nil {
		t.Fatalf("fetchMarketingActivitiesSince: %v", err)
	}
	if seenSortKey != "ID" {
		t.Fatalf("unexpected marketing sort key: %q", seenSortKey)
	}
	if len(activities) != 1 {
		t.Fatalf("unexpected activity count: %d", len(activities))
	}
	if got := cursor.UTC().Format(time.RFC3339); got != "2026-04-03T16:12:00Z" {
		t.Fatalf("unexpected marketing cursor: %s", got)
	}
}

func mustParseRFC3339(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		t.Fatalf("parse time %q: %v", value, err)
	}
	return parsed
}
