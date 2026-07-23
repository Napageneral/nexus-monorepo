package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const shopifyProductsSourceDocument = `query SourceProducts($first: Int!, $after: String, $query: String!, $reverse: Boolean!, $sortKey: ProductSortKeys!, $savedSearchId: ID) {
  products(first: $first, after: $after, query: $query, reverse: $reverse, sortKey: $sortKey, savedSearchId: $savedSearchId) {
    edges { cursor node { id title handle updatedAt tags status vendor productType } }
    pageInfo { hasNextPage endCursor }
  }
}`

const shopifyCollectionsSourceDocument = `query SourceCollections($first: Int!, $after: String, $query: String!, $reverse: Boolean!, $sortKey: CollectionSortKeys!) {
  collections(first: $first, after: $after, query: $query, reverse: $reverse, sortKey: $sortKey) {
    edges {
      cursor
      node {
        id title handle updatedAt templateSuffix
        productsCount { count }
        ruleSet { appliedDisjunctively rules { column relation condition } }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const shopifyFulfillmentsSourceDocument = `query SourceFulfillments($first: Int!, $after: String, $query: String!, $reverse: Boolean!, $sortKey: FulfillmentOrderSortKeys!) {
  fulfillmentOrders(first: $first, after: $after, query: $query, reverse: $reverse, sortKey: $sortKey) {
    edges { cursor node { id updatedAt status requestStatus fulfillAt orderName orderId } }
    pageInfo { hasNextPage endCursor }
  }
}`

const shopifyCodeDiscountsSourceDocument = `query SourceCodeDiscounts($first: Int!, $after: String, $query: String!, $reverse: Boolean!, $sortKey: CodeDiscountSortKeys!) {
  codeDiscountNodes(first: $first, after: $after, query: $query, reverse: $reverse, sortKey: $sortKey) {
    edges {
      cursor
      node {
        id
        events(first: 1) { edges { node { createdAt } } }
        codeDiscount {
          __typename
          ... on DiscountCodeBasic { title status startsAt endsAt updatedAt }
          ... on DiscountCodeBxgy { title status startsAt endsAt updatedAt }
          ... on DiscountCodeFreeShipping { title status startsAt endsAt updatedAt }
          ... on DiscountCodeApp { title status startsAt endsAt updatedAt }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const shopifyAutomaticDiscountsSourceDocument = `query SourceAutomaticDiscounts($first: Int!, $after: String, $query: String!, $reverse: Boolean!) {
  automaticDiscountNodes(first: $first, after: $after, query: $query, reverse: $reverse) {
    edges {
      cursor
      node {
        id
        events(first: 1) { edges { node { createdAt } } }
        automaticDiscount {
          __typename
          ... on DiscountAutomaticBasic { title status startsAt endsAt updatedAt }
          ... on DiscountAutomaticBxgy { title status startsAt endsAt updatedAt }
          ... on DiscountAutomaticFreeShipping { title status startsAt endsAt updatedAt }
          ... on DiscountAutomaticApp { title status startsAt endsAt updatedAt }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const shopifyMarketingSourceDocument = `query SourceMarketing($first: Int!, $after: String, $query: String!, $reverse: Boolean!, $sortKey: MarketingActivitySortKeys!) {
  marketingActivities(first: $first, after: $after, query: $query, reverse: $reverse, sortKey: $sortKey) {
    edges { cursor node { id title status updatedAt marketingChannel tactic } }
    pageInfo { hasNextPage endCursor }
  }
}`

func sourceGraphQLRequest(state *shopifyState, operation string, since, through time.Time, after string, snapshot bool) shopifySourceRequest {
	return shopifySourceRequest{
		APIBaseURL: fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion),
		Path:       shopifyGraphQLProjectionPath,
		Request: map[string]any{
			"operation":           operation,
			"page_size":           shopifyGraphQLPageSize,
			"api_version":         state.APIVersion,
			"request_since":       since.UTC().Format(time.RFC3339Nano),
			"window_through":      through.UTC().Format(time.RFC3339Nano),
			"request_cursor":      emptyToNil(after),
			"local_snapshot_scan": snapshot,
		},
	}
}

func sourcePageResult(records []nexadapter.AdapterInboundRecord, pageInfo shopifyGraphQLPageInfo) ([]nexadapter.AdapterInboundRecord, string, bool, error) {
	if len(records) > shopifySourceMaxRecords {
		return nil, "", false, fmt.Errorf("Shopify source page expanded beyond %d records", shopifySourceMaxRecords)
	}
	next := strings.TrimSpace(pageInfo.EndCursor)
	complete := !pageInfo.HasNextPage || next == ""
	if complete {
		next = ""
	}
	return records, next, complete, nil
}

func inSourceWindow(value string, since, through time.Time) bool {
	updated := parseShopifyUpdatedAt(value)
	return !updated.IsZero() && updated.After(since) && !updated.After(through)
}

func captureShopifyProductsPage(ctx context.Context, state *shopifyState, since, through time.Time, after string) ([]nexadapter.AdapterInboundRecord, string, bool, error) {
	response, err := executeShopifyGraphQL(ctx, state, shopifyProductsSourceDocument, map[string]any{
		"first": shopifyGraphQLPageSize, "after": emptyToNil(after), "query": "", "reverse": false,
		"sortKey": "UPDATED_AT", "savedSearchId": nil,
	}, "SourceProducts")
	if err != nil {
		return nil, "", false, err
	}
	connection, err := decodeGraphQLField[shopifyProductConnection](response, "products")
	if err != nil {
		return nil, "", false, err
	}
	sourceRequest := sourceGraphQLRequest(state, "SourceProducts", since, through, after, true)
	records := make([]nexadapter.AdapterInboundRecord, 0, len(connection.Edges))
	for _, edge := range connection.Edges {
		if strings.TrimSpace(edge.Node.ID) != "" && inSourceWindow(edge.Node.UpdatedAt, since, through) {
			records = append(records, buildProductRecord(state, edge.Node, sourceRequest))
		}
	}
	return sourcePageResult(records, connection.PageInfo)
}

func captureShopifyCollectionsPage(ctx context.Context, state *shopifyState, since, through time.Time, after string) ([]nexadapter.AdapterInboundRecord, string, bool, error) {
	response, err := executeShopifyGraphQL(ctx, state, shopifyCollectionsSourceDocument, map[string]any{
		"first": shopifyGraphQLPageSize, "after": emptyToNil(after), "query": "", "reverse": false, "sortKey": "UPDATED_AT",
	}, "SourceCollections")
	if err != nil {
		return nil, "", false, err
	}
	connection, err := decodeGraphQLField[shopifyCollectionConnection](response, "collections")
	if err != nil {
		return nil, "", false, err
	}
	sourceRequest := sourceGraphQLRequest(state, "SourceCollections", since, through, after, true)
	records := make([]nexadapter.AdapterInboundRecord, 0, len(connection.Edges))
	for _, edge := range connection.Edges {
		if strings.TrimSpace(edge.Node.ID) != "" && inSourceWindow(edge.Node.UpdatedAt, since, through) {
			records = append(records, buildCollectionRecord(state, edge.Node, sourceRequest))
		}
	}
	return sourcePageResult(records, connection.PageInfo)
}

func captureShopifyFulfillmentsPage(ctx context.Context, state *shopifyState, since, through time.Time, after string) ([]nexadapter.AdapterInboundRecord, string, bool, error) {
	query := shopifyUpdatedWindowFilter(since, through)
	response, err := executeShopifyGraphQL(ctx, state, shopifyFulfillmentsSourceDocument, map[string]any{
		"first": shopifyGraphQLPageSize, "after": emptyToNil(after), "query": query, "reverse": false, "sortKey": "UPDATED_AT",
	}, "SourceFulfillments")
	if err != nil {
		return nil, "", false, err
	}
	connection, err := decodeGraphQLField[shopifyFulfillmentOrderConnection](response, "fulfillmentOrders")
	if err != nil {
		return nil, "", false, err
	}
	sourceRequest := sourceGraphQLRequest(state, "SourceFulfillments", since, through, after, false)
	sourceRequest.Request["query"] = query
	records := make([]nexadapter.AdapterInboundRecord, 0, len(connection.Edges))
	for _, edge := range connection.Edges {
		if strings.TrimSpace(edge.Node.ID) != "" && inSourceWindow(edge.Node.UpdatedAt, since, through) {
			records = append(records, buildFulfillmentRecord(state, edge.Node, sourceRequest))
		}
	}
	return sourcePageResult(records, connection.PageInfo)
}

type discountSourceCursor struct {
	Stream string
	After  string
}

func parseDiscountSourceCursor(value string) (discountSourceCursor, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return discountSourceCursor{Stream: "code"}, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return discountSourceCursor{}, errors.New("invalid Shopify discount page cursor")
	}
	parts := strings.SplitN(string(raw), "\x00", 2)
	if len(parts) != 2 || (parts[0] != "code" && parts[0] != "automatic") {
		return discountSourceCursor{}, errors.New("invalid Shopify discount page cursor")
	}
	return discountSourceCursor{Stream: parts[0], After: parts[1]}, nil
}

func formatDiscountSourceCursor(stream, after string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(stream + "\x00" + after))
}

func captureShopifyDiscountsPage(ctx context.Context, state *shopifyState, since, through time.Time, cursorValue string) ([]nexadapter.AdapterInboundRecord, string, bool, error) {
	cursor, err := parseDiscountSourceCursor(cursorValue)
	if err != nil {
		return nil, "", false, err
	}
	query := shopifyUpdatedWindowFilter(since, through)
	if cursor.Stream == "code" {
		response, err := executeShopifyGraphQL(ctx, state, shopifyCodeDiscountsSourceDocument, map[string]any{
			"first": shopifyGraphQLPageSize, "after": emptyToNil(cursor.After), "query": query, "reverse": false, "sortKey": "UPDATED_AT",
		}, "SourceCodeDiscounts")
		if err != nil {
			return nil, "", false, err
		}
		connection, err := decodeGraphQLField[shopifyCodeDiscountNodeConnection](response, "codeDiscountNodes")
		if err != nil {
			return nil, "", false, err
		}
		sourceRequest := sourceGraphQLRequest(state, "SourceCodeDiscounts", since, through, cursorValue, false)
		sourceRequest.Request["query"] = query
		records := make([]nexadapter.AdapterInboundRecord, 0, len(connection.Edges))
		for _, edge := range connection.Edges {
			node := edge.Node
			updatedAt := discountUpdatedAt(node.CodeDiscount.UpdatedAt, node.Events, node.CodeDiscount.StartsAt, node.CodeDiscount.EndsAt)
			if strings.TrimSpace(node.ID) == "" || !inSourceWindow(updatedAt, since, through) {
				continue
			}
			records = append(records, buildDiscountRecord(state, shopifyGraphQLDiscountRecord{
				NodeGID: node.ID, DiscountType: node.CodeDiscount.TypeName, Title: node.CodeDiscount.Title,
				Status: node.CodeDiscount.Status, StartsAt: node.CodeDiscount.StartsAt, EndsAt: node.CodeDiscount.EndsAt,
				UpdatedAt: updatedAt, rawProviderJSON: node.rawProviderJSON, rawProviderPayload: node.rawProviderPayload,
			}, sourceRequest))
		}
		next := strings.TrimSpace(connection.PageInfo.EndCursor)
		if connection.PageInfo.HasNextPage && next != "" {
			return records, formatDiscountSourceCursor("code", next), false, nil
		}
		return records, formatDiscountSourceCursor("automatic", ""), false, nil
	}

	response, err := executeShopifyGraphQL(ctx, state, shopifyAutomaticDiscountsSourceDocument, map[string]any{
		"first": shopifyGraphQLPageSize, "after": emptyToNil(cursor.After), "query": query, "reverse": false,
	}, "SourceAutomaticDiscounts")
	if err != nil {
		return nil, "", false, err
	}
	connection, err := decodeGraphQLField[shopifyAutomaticDiscountNodeConnection](response, "automaticDiscountNodes")
	if err != nil {
		return nil, "", false, err
	}
	sourceRequest := sourceGraphQLRequest(state, "SourceAutomaticDiscounts", since, through, cursorValue, false)
	sourceRequest.Request["query"] = query
	records := make([]nexadapter.AdapterInboundRecord, 0, len(connection.Edges))
	for _, edge := range connection.Edges {
		node := edge.Node
		updatedAt := discountUpdatedAt(node.AutomaticDiscount.UpdatedAt, node.Events, node.AutomaticDiscount.StartsAt, node.AutomaticDiscount.EndsAt)
		if strings.TrimSpace(node.ID) == "" || !inSourceWindow(updatedAt, since, through) {
			continue
		}
		records = append(records, buildDiscountRecord(state, shopifyGraphQLDiscountRecord{
			NodeGID: node.ID, DiscountType: node.AutomaticDiscount.TypeName, Title: node.AutomaticDiscount.Title,
			Status: node.AutomaticDiscount.Status, StartsAt: node.AutomaticDiscount.StartsAt, EndsAt: node.AutomaticDiscount.EndsAt,
			UpdatedAt: updatedAt, rawProviderJSON: node.rawProviderJSON, rawProviderPayload: node.rawProviderPayload,
		}, sourceRequest))
	}
	next := strings.TrimSpace(connection.PageInfo.EndCursor)
	complete := !connection.PageInfo.HasNextPage || next == ""
	if complete {
		next = ""
	} else {
		next = formatDiscountSourceCursor("automatic", next)
	}
	return records, next, complete, nil
}

func captureShopifyMarketingPage(ctx context.Context, state *shopifyState, since, through time.Time, after string) ([]nexadapter.AdapterInboundRecord, string, bool, error) {
	query := shopifyUpdatedWindowFilter(since, through)
	response, err := executeShopifyGraphQL(ctx, state, shopifyMarketingSourceDocument, map[string]any{
		"first": shopifyGraphQLPageSize, "after": emptyToNil(after), "query": query, "reverse": false, "sortKey": "ID",
	}, "SourceMarketing")
	if err != nil {
		return nil, "", false, err
	}
	connection, err := decodeGraphQLField[shopifyMarketingActivityConnection](response, "marketingActivities")
	if err != nil {
		return nil, "", false, err
	}
	sourceRequest := sourceGraphQLRequest(state, "SourceMarketing", since, through, after, false)
	sourceRequest.Request["query"] = query
	records := make([]nexadapter.AdapterInboundRecord, 0, len(connection.Edges))
	for _, edge := range connection.Edges {
		if strings.TrimSpace(edge.Node.ID) != "" && inSourceWindow(edge.Node.UpdatedAt, since, through) {
			records = append(records, buildMarketingRecord(state, edge.Node, sourceRequest))
		}
	}
	return sourcePageResult(records, connection.PageInfo)
}
