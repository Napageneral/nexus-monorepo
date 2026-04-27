package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	defaultLocationCacheTTL   = 30 * time.Minute
	maxInventoryLevelsPages   = 200
	inventoryHotGraphQLOpName = "Tier1InventoryHotByIDs"
)

var inventoryLocationCache *shopifyLocationCache

type shopifyLocationsResponse struct {
	Locations []shopifyLocation `json:"locations"`
}

type shopifyLocation struct {
	ID                int64  `json:"id"`
	Name              string `json:"name"`
	AdminGraphQLAPIID string `json:"admin_graphql_api_id"`
}

type shopifyLocationCache struct {
	ShopDomain   string
	ClientID     string
	ClientSecret string
	APIVersion   string
	Locations    []shopifyLocation
	ExpiresAt    time.Time
}

type shopifyInventoryLevelsResponse struct {
	InventoryLevels []shopifyRESTInventoryLevel `json:"inventory_levels"`
}

type shopifyRESTInventoryLevel struct {
	InventoryItemID   int64  `json:"inventory_item_id"`
	LocationID        int64  `json:"location_id"`
	Available         int    `json:"available"`
	UpdatedAt         string `json:"updated_at"`
	AdminGraphQLAPIID string `json:"admin_graphql_api_id"`
}

type shopifyHotInventoryItemNode struct {
	ID              string                          `json:"id"`
	SKU             string                          `json:"sku"`
	UpdatedAt       string                          `json:"updatedAt"`
	Tracked         bool                            `json:"tracked"`
	InventoryLevels shopifyInventoryLevelConnection `json:"inventoryLevels"`
}

func fetchInventoryLevelsSince(ctx context.Context, state *shopifyState, since time.Time) ([]shopifyRESTInventoryLevel, shopifySourceRequest, time.Time, error) {
	locations, err := fetchShopifyLocations(ctx, state)
	if err != nil {
		return nil, shopifySourceRequest{}, time.Time{}, err
	}

	locationIDs := make([]string, 0, len(locations))
	for _, location := range locations {
		if location.ID <= 0 {
			continue
		}
		locationIDs = append(locationIDs, strconv.FormatInt(location.ID, 10))
	}
	if len(locationIDs) == 0 {
		return []shopifyRESTInventoryLevel{}, shopifySourceRequest{
			APIBaseURL: fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion),
			Path:       "/inventory_levels.json",
			Request: map[string]any{
				"location_ids":   []string{},
				"updated_at_min": since.UTC().Format(time.RFC3339),
				"api_version":    state.APIVersion,
			},
		}, time.Time{}, nil
	}

	accessToken, err := fetchShopifyAccessToken(ctx, state)
	if err != nil {
		return nil, shopifySourceRequest{}, time.Time{}, err
	}

	baseURL := fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion)
	path := "/inventory_levels.json"
	params := url.Values{}
	params.Set("location_ids", strings.Join(locationIDs, ","))
	params.Set("updated_at_min", since.UTC().Format(time.RFC3339))
	params.Set("limit", "250")

	sourceRequest := shopifySourceRequest{
		APIBaseURL: baseURL,
		Path:       path,
		Request: map[string]any{
			"location_ids":   locationIDs,
			"updated_at_min": since.UTC().Format(time.RFC3339),
			"limit":          250,
			"api_version":    state.APIVersion,
		},
	}

	nextURL := baseURL + path + "?" + params.Encode()
	levels := make([]shopifyRESTInventoryLevel, 0, 128)
	latestUpdatedAt := time.Time{}
	pageCount := 0

	for nextURL != "" {
		if pageCount >= maxInventoryLevelsPages {
			return nil, sourceRequest, time.Time{}, fmt.Errorf("exceeded Shopify inventory levels pagination guard (%d pages)", maxInventoryLevelsPages)
		}
		pageCount++

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, nextURL, nil)
		if err != nil {
			return nil, sourceRequest, time.Time{}, fmt.Errorf("build Shopify inventory levels request: %w", err)
		}
		req.Header.Set("X-Shopify-Access-Token", accessToken)

		res, err := shopifyHTTPClient.Do(req)
		if err != nil {
			return nil, sourceRequest, time.Time{}, fmt.Errorf("Shopify inventory levels request failed: %w", err)
		}

		bodyBytes, readErr := io.ReadAll(io.LimitReader(res.Body, maxResponseBodyBytes))
		_ = res.Body.Close()
		if readErr != nil {
			return nil, sourceRequest, time.Time{}, fmt.Errorf("read Shopify inventory levels response: %w", readErr)
		}
		bodyText := strings.TrimSpace(string(bodyBytes))
		if res.StatusCode >= 400 {
			return nil, sourceRequest, time.Time{}, fmt.Errorf("Shopify inventory levels request failed (%d): %s", res.StatusCode, bodyText)
		}

		var payload shopifyInventoryLevelsResponse
		if err := json.Unmarshal(bodyBytes, &payload); err != nil {
			return nil, sourceRequest, time.Time{}, fmt.Errorf("parse Shopify inventory levels response: %w", err)
		}

		for _, level := range payload.InventoryLevels {
			levels = append(levels, level)
			if parsed := parseShopifyUpdatedAt(level.UpdatedAt); !parsed.IsZero() && parsed.After(latestUpdatedAt) {
				latestUpdatedAt = parsed
			}
		}

		nextURL = parseLinkHeader(res.Header.Get("Link"))["next"]
	}

	return levels, sourceRequest, latestUpdatedAt, nil
}

func fetchHotInventoryItemsByNumericIDs(ctx context.Context, state *shopifyState, itemIDs []int64) (map[int64]shopifyHotInventoryItemNode, error) {
	if len(itemIDs) == 0 {
		return map[int64]shopifyHotInventoryItemNode{}, nil
	}

	ids := make([]string, 0, len(itemIDs))
	for _, itemID := range itemIDs {
		if itemID <= 0 {
			continue
		}
		ids = append(ids, fmt.Sprintf("gid://shopify/InventoryItem/%d", itemID))
	}
	if len(ids) == 0 {
		return map[int64]shopifyHotInventoryItemNode{}, nil
	}

	document := `query Tier1InventoryHotByIDs($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on InventoryItem {
      id
      sku
      updatedAt
      tracked
      inventoryLevels(first: 50) {
        edges {
          node {
            id
            updatedAt
            location {
              id
              name
            }
            quantities(names: ["available"]) {
              name
              quantity
            }
          }
        }
      }
    }
  }
}`

	response, err := executeShopifyGraphQL(ctx, state, document, map[string]any{"ids": ids}, inventoryHotGraphQLOpName)
	if err != nil {
		return nil, err
	}
	nodes, err := decodeGraphQLField[[]*shopifyHotInventoryItemNode](response, "nodes")
	if err != nil {
		return nil, err
	}

	out := make(map[int64]shopifyHotInventoryItemNode, len(*nodes))
	for _, node := range *nodes {
		if node == nil {
			continue
		}
		numericID, err := strconv.ParseInt(shopifyNumericGID(node.ID), 10, 64)
		if err != nil || numericID <= 0 {
			continue
		}
		out[numericID] = *node
	}
	return out, nil
}

func fetchShopifyLocations(ctx context.Context, state *shopifyState) ([]shopifyLocation, error) {
	if inventoryLocationCache != nil &&
		inventoryLocationCache.ShopDomain == state.ShopDomain &&
		inventoryLocationCache.ClientID == state.ClientID &&
		inventoryLocationCache.ClientSecret == state.ClientSecret &&
		inventoryLocationCache.APIVersion == state.APIVersion &&
		time.Now().Before(inventoryLocationCache.ExpiresAt) {
		return inventoryLocationCache.Locations, nil
	}

	accessToken, err := fetchShopifyAccessToken(ctx, state)
	if err != nil {
		return nil, err
	}

	requestURL := fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion) + "/locations.json"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build Shopify locations request: %w", err)
	}
	req.Header.Set("X-Shopify-Access-Token", accessToken)

	res, err := shopifyHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Shopify locations request failed: %w", err)
	}
	defer res.Body.Close()

	bodyBytes, readErr := io.ReadAll(io.LimitReader(res.Body, maxResponseBodyBytes))
	if readErr != nil {
		return nil, fmt.Errorf("read Shopify locations response: %w", readErr)
	}
	bodyText := strings.TrimSpace(string(bodyBytes))
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("Shopify locations request failed (%d): %s", res.StatusCode, bodyText)
	}

	var payload shopifyLocationsResponse
	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		return nil, fmt.Errorf("parse Shopify locations response: %w", err)
	}

	inventoryLocationCache = &shopifyLocationCache{
		ShopDomain:   state.ShopDomain,
		ClientID:     state.ClientID,
		ClientSecret: state.ClientSecret,
		APIVersion:   state.APIVersion,
		Locations:    payload.Locations,
		ExpiresAt:    time.Now().Add(defaultLocationCacheTTL),
	}
	return payload.Locations, nil
}

func resetShopifyInventoryLocationCache() {
	inventoryLocationCache = nil
}

func matchHotInventoryLevel(levels shopifyInventoryLevelConnection, snapshot shopifyRESTInventoryLevel) (shopifyGraphQLInventoryLevel, bool) {
	targetLocationID := strconv.FormatInt(snapshot.LocationID, 10)
	for _, edge := range levels.Edges {
		level := edge.Node
		if shopifyNumericGID(level.Location.ID) != targetLocationID {
			continue
		}
		if level.UpdatedAt == "" {
			level.UpdatedAt = snapshot.UpdatedAt
		}
		if inventoryQuantity(level, "available") == 0 && snapshot.Available != 0 {
			level.Quantities = []shopifyGraphQLQuantity{{
				Name:     "available",
				Quantity: snapshot.Available,
			}}
		}
		return level, true
	}
	return shopifyGraphQLInventoryLevel{}, false
}

func synthesizeHotInventoryLevel(snapshot shopifyRESTInventoryLevel) shopifyGraphQLInventoryLevel {
	locationName := ""
	if inventoryLocationCache != nil {
		for _, location := range inventoryLocationCache.Locations {
			if location.ID == snapshot.LocationID {
				locationName = location.Name
				break
			}
		}
	}
	locationGID := ""
	if snapshot.LocationID > 0 {
		locationGID = fmt.Sprintf("gid://shopify/Location/%d", snapshot.LocationID)
	}
	levelID := strings.TrimSpace(snapshot.AdminGraphQLAPIID)
	if levelID == "" {
		levelID = fmt.Sprintf("inventory-level:%d:%d", snapshot.LocationID, snapshot.InventoryItemID)
	}
	return shopifyGraphQLInventoryLevel{
		ID:        levelID,
		UpdatedAt: snapshot.UpdatedAt,
		Location: shopifyGraphQLLocation{
			ID:   locationGID,
			Name: locationName,
		},
		Quantities: []shopifyGraphQLQuantity{{
			Name:     "available",
			Quantity: snapshot.Available,
		}},
	}
}
