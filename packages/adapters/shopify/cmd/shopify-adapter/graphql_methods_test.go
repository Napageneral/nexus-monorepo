package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestAdapterInfoReportsGraphQLMethodCatalogAndProjection(t *testing.T) {
	adapter := nexadapter.DefineAdapter(adapterConfig())

	info, err := adapter.Operations.AdapterInfo(context.Background())
	if err != nil {
		t.Fatalf("AdapterInfo: %v", err)
	}
	if info.MethodCatalog == nil || info.MethodCatalog.Source != "graphql" {
		t.Fatalf("methodCatalog = %#v", info.MethodCatalog)
	}
	if info.MethodCatalog.Document != shopifyMethodCatalog().Document {
		t.Fatalf("methodCatalog.document = %q", info.MethodCatalog.Document)
	}
	if info.Projection == nil || len(info.Projection.Families) != 9 {
		t.Fatalf("projection = %#v", info.Projection)
	}
	gotFamilies := make([]string, 0, len(info.Projection.Families))
	for _, family := range info.Projection.Families {
		gotFamilies = append(gotFamilies, family.Name)
	}
	for _, family := range []string{"order", "line_item", "customer", "product", "collection", "inventory", "fulfillment", "discount", "marketing"} {
		if !slices.Contains(gotFamilies, family) {
			t.Fatalf("projection families missing %s in %#v", family, gotFamilies)
		}
	}
	if _, ok := adapter.DeclaredMethods["shopify.query.shop"]; !ok {
		t.Fatalf("declared methods missing shopify.query.shop")
	}
	if _, ok := adapter.DeclaredMethods["shopify.query.orders"]; !ok {
		t.Fatalf("declared methods missing shopify.query.orders")
	}
	if _, ok := adapter.DeclaredMethods["shopify.graphql.query"]; !ok {
		t.Fatalf("declared methods missing shopify.graphql.query")
	}
	if _, ok := adapter.DeclaredMethods["shopify.graphql.mutate"]; !ok {
		t.Fatalf("declared methods missing shopify.graphql.mutate")
	}
}

func TestShopifyQueryShopMethodUsesGraphQLEndpoint(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/graphql.json":
			if got := r.Header.Get("X-Shopify-Access-Token"); got != "shopify-token" {
				http.Error(w, "missing token", http.StatusUnauthorized)
				return
			}
			var payload map[string]any
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode graphql payload: %v", err)
			}
			queryText, _ := payload["query"].(string)
			if !strings.Contains(queryText, "shop {") {
				t.Fatalf("unexpected graphql query: %s", queryText)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":{"shop":{"id":"gid://shopify/Shop/1","name":"MoonSleep","myshopifyDomain":"moonsleepco.myshopify.com"}},"extensions":{"cost":{"requestedQueryCost":1}}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	shopifyHTTPClient = server.Client()
	ctx := nexadapter.AdapterContext[struct{}]{
		Context:      context.Background(),
		ConnectionID: "shopify-primary",
		Runtime: &nexadapter.RuntimeContext{
			Platform:     platformID,
			ConnectionID: "shopify-primary",
			Credential: &nexadapter.RuntimeCredential{
				Value: "placeholder",
				Fields: map[string]string{
					"shop_domain":   strings.TrimPrefix(server.URL, "https://"),
					"client_id":     "client-id",
					"client_secret": "client-secret",
					"api_version":   "2026-01",
				},
			},
		},
	}

	result, err := declaredShopifyMethods()["shopify.query.shop"].Handler(ctx, nexadapter.AdapterMethodRequest{
		ConnectionID: "shopify-primary",
		Payload:      map[string]any{},
	})
	if err != nil {
		t.Fatalf("shopify.query.shop: %v", err)
	}
	response, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("unexpected response type: %T", result)
	}
	if response["field"] != "shop" {
		t.Fatalf("field = %#v", response["field"])
	}
	data, ok := response["data"].(map[string]any)
	if !ok || data["name"] != "MoonSleep" {
		t.Fatalf("data = %#v", response["data"])
	}
}

func TestShopifyQueryOrdersMethodUsesGraphQLEndpoint(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/graphql.json":
			var payload map[string]any
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode graphql payload: %v", err)
			}
			queryText, _ := payload["query"].(string)
			if !strings.Contains(queryText, "orders(") {
				t.Fatalf("unexpected graphql query: %s", queryText)
			}
			if strings.Contains(queryText, "$after") {
				t.Fatalf("query declared an unused cursor variable: %s", queryText)
			}
			variables, _ := payload["variables"].(map[string]any)
			if got, _ := variables["first"].(float64); got != 2 {
				t.Fatalf("first = %#v", variables["first"])
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":{"orders":{"pageInfo":{"hasNextPage":false,"hasPreviousPage":false,"startCursor":"cursor-1","endCursor":"cursor-1"},"edges":[{"cursor":"cursor-1","node":{"id":"gid://shopify/Order/1","name":"#1001"}}]}}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	shopifyHTTPClient = server.Client()
	ctx := nexadapter.AdapterContext[struct{}]{
		Context:      context.Background(),
		ConnectionID: "shopify-primary",
		Runtime: &nexadapter.RuntimeContext{
			Platform:     platformID,
			ConnectionID: "shopify-primary",
			Credential: &nexadapter.RuntimeCredential{
				Value: "placeholder",
				Fields: map[string]string{
					"shop_domain":   strings.TrimPrefix(server.URL, "https://"),
					"client_id":     "client-id",
					"client_secret": "client-secret",
					"api_version":   "2026-01",
				},
			},
		},
	}

	result, err := declaredShopifyMethods()["shopify.query.orders"].Handler(ctx, nexadapter.AdapterMethodRequest{
		ConnectionID: "shopify-primary",
		Payload: map[string]any{
			"first": 2,
			"query": "status:open",
		},
	})
	if err != nil {
		t.Fatalf("shopify.query.orders: %v", err)
	}
	response, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("unexpected response type: %T", result)
	}
	if response["field"] != "orders" {
		t.Fatalf("field = %#v", response["field"])
	}
	data, ok := response["data"].(map[string]any)
	if !ok {
		t.Fatalf("orders data = %#v", response["data"])
	}
	edges, ok := data["edges"].([]any)
	if !ok || len(edges) != 1 {
		t.Fatalf("orders edges = %#v", data["edges"])
	}
}

func TestShopifyGenericGraphQLQueryMethodUsesDocumentAndVariables(t *testing.T) {
	t.Cleanup(resetShopifyGlobals)

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/admin/oauth/access_token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"shopify-token"}`))
		case "/admin/api/2026-01/graphql.json":
			var payload map[string]any
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode graphql payload: %v", err)
			}
			if payload["operationName"] != "ShopIdentity" {
				t.Fatalf("operationName = %#v", payload["operationName"])
			}
			queryText, _ := payload["query"].(string)
			if !strings.Contains(queryText, "query ShopIdentity") {
				t.Fatalf("unexpected graphql query: %s", queryText)
			}
			variables, _ := payload["variables"].(map[string]any)
			if got, _ := variables["handle"].(string); got != "moon" {
				t.Fatalf("variables = %#v", variables)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":{"shop":{"name":"MoonSleep"}},"extensions":{"cost":{"requestedQueryCost":1}}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	shopifyHTTPClient = server.Client()
	ctx := nexadapter.AdapterContext[struct{}]{
		Context:      context.Background(),
		ConnectionID: "shopify-primary",
		Runtime: &nexadapter.RuntimeContext{
			Platform:     platformID,
			ConnectionID: "shopify-primary",
			Credential: &nexadapter.RuntimeCredential{
				Value: "placeholder",
				Fields: map[string]string{
					"shop_domain":   strings.TrimPrefix(server.URL, "https://"),
					"client_id":     "client-id",
					"client_secret": "client-secret",
					"api_version":   "2026-01",
				},
			},
		},
	}

	result, err := declaredShopifyMethods()["shopify.graphql.query"].Handler(ctx, nexadapter.AdapterMethodRequest{
		ConnectionID: "shopify-primary",
		Payload: map[string]any{
			"document":      "query ShopIdentity($handle: String!) { shop { name } }",
			"variables":     map[string]any{"handle": "moon"},
			"operationName": "ShopIdentity",
		},
	})
	if err != nil {
		t.Fatalf("shopify.graphql.query: %v", err)
	}
	response, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("unexpected response type: %T", result)
	}
	data, ok := response["data"].(map[string]any)
	if !ok {
		t.Fatalf("data = %#v", response["data"])
	}
	shop, ok := data["shop"].(map[string]any)
	if !ok || shop["name"] != "MoonSleep" {
		t.Fatalf("shop = %#v", data["shop"])
	}
}

func TestShopifyGenericGraphQLMutationMethodRequiresMutationDocument(t *testing.T) {
	_, err := declaredShopifyMethods()["shopify.graphql.mutate"].Handler(
		nexadapter.AdapterContext[struct{}]{},
		nexadapter.AdapterMethodRequest{
			Payload: map[string]any{
				"document": "query ShopIdentity { shop { name } }",
			},
		},
	)
	if err == nil || !strings.Contains(err.Error(), "GraphQL mutation document") {
		t.Fatalf("expected mutation document validation error, got %v", err)
	}
}

func TestGraphqlQueryBuildsExpectedShopQuery(t *testing.T) {
	got := graphqlQuery("shop", "", "", defaultShopSelection, map[string]any{}, nil)
	want := strings.TrimSpace(`
query ShopifyShop { shop { id
name
myshopifyDomain
primaryDomain {
  host
  url
} } }
`)
	if got != want {
		t.Fatalf("shop query mismatch:\nwant:\n%s\n\ngot:\n%s", want, got)
	}
}

func TestGraphqlQueryBuildsExpectedConnectionQuery(t *testing.T) {
	variableDefs, assignments, variables := collectConnectionQueryComponents(
		map[string]any{
			"first":   2,
			"query":   "status:open",
			"reverse": true,
		},
		"OrderSortKeys",
		false,
	)
	got := graphqlQuery(
		"orders",
		variableDefs,
		assignments,
		defaultOrdersSelection,
		map[string]any{},
		variables,
	)
	if !strings.Contains(got, "query ShopifyOrders(") {
		t.Fatalf("missing operation header in query: %s", got)
	}
	if !strings.Contains(got, "orders(first: $first, reverse: $reverse, query: $query)") {
		t.Fatalf("missing assignments in query: %s", got)
	}
	if strings.Contains(got, "$after:") || strings.Contains(got, "$last:") || strings.Contains(got, "$before:") || strings.Contains(got, "$sortKey:") || strings.Contains(got, "$savedSearchId:") {
		t.Fatalf("query contains unused variable definitions: %s", got)
	}
	if !slices.Equal(
		[]string{"first", "query", "reverse"},
		func() []string {
			keys := make([]string, 0, len(variables))
			for key := range variables {
				keys = append(keys, key)
			}
			slices.Sort(keys)
			return keys
		}(),
	) {
		t.Fatalf("variables = %#v", variables)
	}
}
