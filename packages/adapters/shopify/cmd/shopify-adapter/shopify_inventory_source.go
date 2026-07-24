package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const shopifyInventorySourceDocument = `query SourceInventory($first: Int!, $after: String, $query: String!, $reverse: Boolean!) {
  inventoryItems(first: $first, after: $after, query: $query, reverse: $reverse) {
    edges {
      cursor
      node {
        id
        sku
        updatedAt
        tracked
        variants(first: 10) {
          edges {
            node {
              id
              inventoryPolicy
              inventoryQuantity
            }
          }
          pageInfo { hasNextPage endCursor }
        }
        inventoryLevels(first: 20) {
          edges {
            node {
              id
              updatedAt
              location { id name }
              quantities(names: ["available"]) { name quantity }
            }
          }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`

func captureShopifyInventoryPage(
	ctx context.Context,
	state *shopifyState,
	since time.Time,
	through time.Time,
	after string,
	includeAll bool,
) ([]nexadapter.AdapterInboundRecord, string, bool, error) {
	response, err := executeShopifyGraphQL(ctx, state, shopifyInventorySourceDocument, map[string]any{
		"first":   shopifyGraphQLPageSize,
		"after":   emptyToNil(after),
		"query":   "",
		"reverse": false,
	}, "SourceInventory")
	if err != nil {
		return nil, "", false, err
	}
	connection, err := decodeGraphQLField[shopifyInventoryItemConnection](response, "inventoryItems")
	if err != nil {
		return nil, "", false, err
	}
	sourceRequest := shopifySourceRequest{
		APIBaseURL: fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion),
		Path:       shopifyGraphQLProjectionPath,
		Request: map[string]any{
			"operation":           "SourceInventory",
			"query":               nil,
			"page_size":           shopifyGraphQLPageSize,
			"api_version":         state.APIVersion,
			"request_since":       since.UTC().Format(time.RFC3339Nano),
			"window_through":      through.UTC().Format(time.RFC3339Nano),
			"request_cursor":      emptyToNil(after),
			"local_snapshot_scan": true,
		},
	}
	records := make([]nexadapter.AdapterInboundRecord, 0, len(connection.Edges))
	for _, edge := range connection.Edges {
		item := edge.Node
		if strings.TrimSpace(item.ID) == "" {
			continue
		}
		if item.Variants.PageInfo.HasNextPage {
			return nil, "", false, fmt.Errorf("Shopify inventory item %s has more than 10 variant bindings", item.ID)
		}
		include := includeAll
		if updated := parseShopifyUpdatedAt(item.UpdatedAt); updated.After(since) && !updated.After(through) {
			include = true
		}
		for _, level := range item.InventoryLevels.Edges {
			if updated := parseShopifyUpdatedAt(level.Node.UpdatedAt); updated.After(since) && !updated.After(through) {
				include = true
			}
		}
		if include {
			records = append(records, buildInventoryRecords(state, item, sourceRequest)...)
		}
	}
	if len(records) > shopifySourceMaxRecords {
		return nil, "", false, fmt.Errorf("Shopify inventory page expanded beyond %d source records", shopifySourceMaxRecords)
	}
	next := strings.TrimSpace(connection.PageInfo.EndCursor)
	complete := !connection.PageInfo.HasNextPage || next == ""
	if complete {
		next = ""
	}
	return records, next, complete, nil
}
