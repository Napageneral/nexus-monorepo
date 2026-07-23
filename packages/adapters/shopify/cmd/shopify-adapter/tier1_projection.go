package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	shopifyGraphQLProjectionPath = "/graphql.json"
	shopifyGraphQLPageSize       = 100
)

type shopifyGraphQLPageInfo struct {
	HasNextPage bool   `json:"hasNextPage"`
	EndCursor   string `json:"endCursor"`
}

type shopifyCustomerEdge struct {
	Cursor string                 `json:"cursor"`
	Node   shopifyGraphQLCustomer `json:"node"`
}

type shopifyCustomerConnection struct {
	Edges    []shopifyCustomerEdge  `json:"edges"`
	PageInfo shopifyGraphQLPageInfo `json:"pageInfo"`
}

type shopifyGraphQLCustomer struct {
	ID                 string                          `json:"id"`
	DisplayName        string                          `json:"displayName"`
	FirstName          string                          `json:"firstName"`
	LastName           string                          `json:"lastName"`
	Email              string                          `json:"email"`
	Phone              string                          `json:"phone"`
	CreatedAt          string                          `json:"createdAt"`
	UpdatedAt          string                          `json:"updatedAt"`
	Tags               []string                        `json:"tags"`
	State              string                          `json:"state"`
	VerifiedEmail      bool                            `json:"verifiedEmail"`
	DefaultAddress     *shopifyGraphQLCustomerAddress  `json:"defaultAddress"`
	Addresses          []shopifyGraphQLCustomerAddress `json:"addresses"`
	rawProviderJSON    json.RawMessage
	rawProviderPayload map[string]any
}

type shopifyGraphQLCustomerAddress struct {
	ID            string `json:"id"`
	FirstName     string `json:"firstName"`
	LastName      string `json:"lastName"`
	Name          string `json:"name"`
	Company       string `json:"company"`
	Address1      string `json:"address1"`
	Address2      string `json:"address2"`
	City          string `json:"city"`
	Province      string `json:"province"`
	ProvinceCode  string `json:"provinceCode"`
	Country       string `json:"country"`
	CountryCodeV2 string `json:"countryCodeV2"`
	Zip           string `json:"zip"`
	Phone         string `json:"phone"`
}

func (customer *shopifyGraphQLCustomer) UnmarshalJSON(data []byte) error {
	type decodedShopifyGraphQLCustomer shopifyGraphQLCustomer
	var decoded decodedShopifyGraphQLCustomer
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	raw, err := decodeProviderJSONObject(data)
	if err != nil {
		return err
	}
	*customer = shopifyGraphQLCustomer(decoded)
	customer.rawProviderJSON = append(json.RawMessage(nil), data...)
	customer.rawProviderPayload = raw
	return nil
}

type shopifyProductEdge struct {
	Cursor string                `json:"cursor"`
	Node   shopifyGraphQLProduct `json:"node"`
}

type shopifyProductConnection struct {
	Edges    []shopifyProductEdge   `json:"edges"`
	PageInfo shopifyGraphQLPageInfo `json:"pageInfo"`
}

type shopifyGraphQLProduct struct {
	ID                 string   `json:"id"`
	Title              string   `json:"title"`
	Handle             string   `json:"handle"`
	UpdatedAt          string   `json:"updatedAt"`
	Tags               []string `json:"tags"`
	Status             string   `json:"status"`
	Vendor             string   `json:"vendor"`
	ProductType        string   `json:"productType"`
	rawProviderJSON    json.RawMessage
	rawProviderPayload map[string]any
}

func (product *shopifyGraphQLProduct) UnmarshalJSON(data []byte) error {
	type decodedProduct shopifyGraphQLProduct
	var decoded decodedProduct
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	raw, err := decodeProviderJSONObject(data)
	if err != nil {
		return err
	}
	*product = shopifyGraphQLProduct(decoded)
	product.rawProviderJSON = append(json.RawMessage(nil), data...)
	product.rawProviderPayload = raw
	return nil
}

type shopifyCollectionEdge struct {
	Cursor string                   `json:"cursor"`
	Node   shopifyGraphQLCollection `json:"node"`
}

type shopifyCollectionConnection struct {
	Edges    []shopifyCollectionEdge `json:"edges"`
	PageInfo shopifyGraphQLPageInfo  `json:"pageInfo"`
}

type shopifyGraphQLCollectionCount struct {
	Count int `json:"count"`
}

type shopifyGraphQLCollectionRule struct {
	Column    string `json:"column"`
	Relation  string `json:"relation"`
	Condition string `json:"condition"`
}

type shopifyGraphQLCollectionRuleSet struct {
	AppliedDisjunctively bool                           `json:"appliedDisjunctively"`
	Rules                []shopifyGraphQLCollectionRule `json:"rules"`
}

type shopifyGraphQLCollection struct {
	ID                 string                           `json:"id"`
	Title              string                           `json:"title"`
	Handle             string                           `json:"handle"`
	UpdatedAt          string                           `json:"updatedAt"`
	TemplateSuffix     string                           `json:"templateSuffix"`
	ProductsCount      shopifyGraphQLCollectionCount    `json:"productsCount"`
	RuleSet            *shopifyGraphQLCollectionRuleSet `json:"ruleSet"`
	rawProviderJSON    json.RawMessage
	rawProviderPayload map[string]any
}

func (collection *shopifyGraphQLCollection) UnmarshalJSON(data []byte) error {
	type decodedCollection shopifyGraphQLCollection
	var decoded decodedCollection
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	raw, err := decodeProviderJSONObject(data)
	if err != nil {
		return err
	}
	*collection = shopifyGraphQLCollection(decoded)
	collection.rawProviderJSON = append(json.RawMessage(nil), data...)
	collection.rawProviderPayload = raw
	return nil
}

type shopifyInventoryItemEdge struct {
	Cursor string                      `json:"cursor"`
	Node   shopifyGraphQLInventoryItem `json:"node"`
}

type shopifyInventoryItemConnection struct {
	Edges    []shopifyInventoryItemEdge `json:"edges"`
	PageInfo shopifyGraphQLPageInfo     `json:"pageInfo"`
}

type shopifyInventoryLevelEdge struct {
	Node shopifyGraphQLInventoryLevel `json:"node"`
}

type shopifyInventoryLevelConnection struct {
	Edges []shopifyInventoryLevelEdge `json:"edges"`
}

type shopifyGraphQLLocation struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type shopifyGraphQLQuantity struct {
	Name     string `json:"name"`
	Quantity int    `json:"quantity"`
}

type shopifyGraphQLInventoryLevel struct {
	ID         string                   `json:"id"`
	UpdatedAt  string                   `json:"updatedAt"`
	Location   shopifyGraphQLLocation   `json:"location"`
	Quantities []shopifyGraphQLQuantity `json:"quantities"`
}

type shopifyGraphQLInventoryItem struct {
	ID                 string                          `json:"id"`
	SKU                string                          `json:"sku"`
	UpdatedAt          string                          `json:"updatedAt"`
	Tracked            bool                            `json:"tracked"`
	InventoryLevels    shopifyInventoryLevelConnection `json:"inventoryLevels"`
	rawProviderJSON    json.RawMessage
	rawProviderPayload map[string]any
}

func (item *shopifyGraphQLInventoryItem) UnmarshalJSON(data []byte) error {
	type decodedInventoryItem shopifyGraphQLInventoryItem
	var decoded decodedInventoryItem
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	raw, err := decodeProviderJSONObject(data)
	if err != nil {
		return err
	}
	*item = shopifyGraphQLInventoryItem(decoded)
	item.rawProviderJSON = append(json.RawMessage(nil), data...)
	item.rawProviderPayload = raw
	return nil
}

type shopifyFulfillmentOrderEdge struct {
	Cursor string                         `json:"cursor"`
	Node   shopifyGraphQLFulfillmentOrder `json:"node"`
}

type shopifyFulfillmentOrderConnection struct {
	Edges    []shopifyFulfillmentOrderEdge `json:"edges"`
	PageInfo shopifyGraphQLPageInfo        `json:"pageInfo"`
}

type shopifyGraphQLFulfillmentOrder struct {
	ID                 string `json:"id"`
	UpdatedAt          string `json:"updatedAt"`
	Status             string `json:"status"`
	RequestStatus      string `json:"requestStatus"`
	FulfillAt          string `json:"fulfillAt"`
	OrderName          string `json:"orderName"`
	OrderID            string `json:"orderId"`
	rawProviderJSON    json.RawMessage
	rawProviderPayload map[string]any
}

func (fulfillment *shopifyGraphQLFulfillmentOrder) UnmarshalJSON(data []byte) error {
	type decodedFulfillment shopifyGraphQLFulfillmentOrder
	var decoded decodedFulfillment
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	raw, err := decodeProviderJSONObject(data)
	if err != nil {
		return err
	}
	*fulfillment = shopifyGraphQLFulfillmentOrder(decoded)
	fulfillment.rawProviderJSON = append(json.RawMessage(nil), data...)
	fulfillment.rawProviderPayload = raw
	return nil
}

type shopifyDiscountEventEdge struct {
	Node shopifyDiscountEvent `json:"node"`
}

type shopifyDiscountEventConnection struct {
	Edges []shopifyDiscountEventEdge `json:"edges"`
}

type shopifyDiscountEvent struct {
	CreatedAt string `json:"createdAt"`
}

type shopifyGraphQLDiscountDetails struct {
	TypeName  string `json:"__typename"`
	Title     string `json:"title"`
	Status    string `json:"status"`
	StartsAt  string `json:"startsAt"`
	EndsAt    string `json:"endsAt"`
	UpdatedAt string `json:"updatedAt"`
}

type shopifyCodeDiscountNodeEdge struct {
	Cursor string                         `json:"cursor"`
	Node   shopifyGraphQLCodeDiscountNode `json:"node"`
}

type shopifyCodeDiscountNodeConnection struct {
	Edges    []shopifyCodeDiscountNodeEdge `json:"edges"`
	PageInfo shopifyGraphQLPageInfo        `json:"pageInfo"`
}

type shopifyGraphQLCodeDiscountNode struct {
	ID           string                         `json:"id"`
	Events       shopifyDiscountEventConnection `json:"events"`
	CodeDiscount shopifyGraphQLDiscountDetails  `json:"codeDiscount"`
}

type shopifyAutomaticDiscountNodeEdge struct {
	Cursor string                              `json:"cursor"`
	Node   shopifyGraphQLAutomaticDiscountNode `json:"node"`
}

type shopifyAutomaticDiscountNodeConnection struct {
	Edges    []shopifyAutomaticDiscountNodeEdge `json:"edges"`
	PageInfo shopifyGraphQLPageInfo             `json:"pageInfo"`
}

type shopifyGraphQLAutomaticDiscountNode struct {
	ID                string                         `json:"id"`
	Events            shopifyDiscountEventConnection `json:"events"`
	AutomaticDiscount shopifyGraphQLDiscountDetails  `json:"automaticDiscount"`
}

type shopifyGraphQLDiscountRecord struct {
	NodeGID      string
	DiscountType string
	Title        string
	Status       string
	StartsAt     string
	EndsAt       string
	UpdatedAt    string
}

type shopifyMarketingActivityEdge struct {
	Cursor string                          `json:"cursor"`
	Node   shopifyGraphQLMarketingActivity `json:"node"`
}

type shopifyMarketingActivityConnection struct {
	Edges    []shopifyMarketingActivityEdge `json:"edges"`
	PageInfo shopifyGraphQLPageInfo         `json:"pageInfo"`
}

type shopifyGraphQLMarketingActivity struct {
	ID               string `json:"id"`
	Title            string `json:"title"`
	Status           string `json:"status"`
	UpdatedAt        string `json:"updatedAt"`
	MarketingChannel string `json:"marketingChannel"`
	Tactic           string `json:"tactic"`
}

type shopifyCustomerPage struct {
	Customers     []shopifyGraphQLCustomer
	RequestCursor string
	NextCursor    string
	Complete      bool
}

const tier1CustomersDocument = `query Tier1Customers($first: Int!, $after: String, $query: String!, $reverse: Boolean!, $sortKey: CustomerSortKeys!) {
  customers(first: $first, after: $after, query: $query, reverse: $reverse, sortKey: $sortKey) {
    edges {
      cursor
      node {
        id
        displayName
        firstName
        lastName
        email
        phone
        createdAt
        updatedAt
        tags
        state
        verifiedEmail
        defaultAddress {
          id
          firstName
          lastName
          name
          company
          address1
          address2
          city
          province
          provinceCode
          country
          countryCodeV2
          zip
          phone
        }
        addresses {
          id
          firstName
          lastName
          name
          company
          address1
          address2
          city
          province
          provinceCode
          country
          countryCodeV2
          zip
          phone
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`

func fetchCustomersSince(ctx context.Context, state *shopifyState, since time.Time, mode shopifySyncMode) ([]shopifyGraphQLCustomer, shopifySourceRequest, time.Time, error) {
	document := tier1CustomersDocument
	query := shopifyUpdatedSinceFilter(since)
	localFilterSince := time.Time{}
	if mode == shopifySyncModeMonitor {
		// Shopify customer updated_at search did not reliably surface tag churn during live monitor proof.
		// Snapshot the current customer window and apply the updatedAt cursor locally instead.
		query = ""
		localFilterSince = since.UTC()
	}
	sourceRequest := shopifySourceRequest{
		APIBaseURL: fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion),
		Path:       shopifyGraphQLProjectionPath,
		Request: map[string]any{
			"operation":           "Tier1Customers",
			"document":            document,
			"query":               emptyToNil(query),
			"sortKey":             "UPDATED_AT",
			"reverse":             false,
			"page_size":           shopifyGraphQLPageSize,
			"api_version":         state.APIVersion,
			"cursor_since":        since.UTC().Format(time.RFC3339),
			"local_snapshot_scan": mode == shopifySyncModeMonitor,
		},
	}

	customers := make([]shopifyGraphQLCustomer, 0, shopifyGraphQLPageSize)
	latestUpdatedAt := time.Time{}
	after := ""

	for {
		page, err := fetchCustomerPage(ctx, state, query, after)
		if err != nil {
			return nil, sourceRequest, time.Time{}, err
		}
		for _, customer := range page.Customers {
			includeCustomer := localFilterSince.IsZero()
			if parsed := parseShopifyUpdatedAt(customer.UpdatedAt); !parsed.IsZero() {
				if parsed.After(latestUpdatedAt) {
					latestUpdatedAt = parsed
				}
				if !localFilterSince.IsZero() && parsed.After(localFilterSince) {
					includeCustomer = true
				}
			}
			if includeCustomer {
				customers = append(customers, customer)
			}
		}
		if page.Complete {
			break
		}
		after = page.NextCursor
	}

	return customers, sourceRequest, latestUpdatedAt, nil
}

func fetchCustomerPage(ctx context.Context, state *shopifyState, query string, after string) (shopifyCustomerPage, error) {
	variables := map[string]any{
		"first":   shopifyGraphQLPageSize,
		"after":   emptyToNil(after),
		"query":   query,
		"reverse": false,
		"sortKey": "UPDATED_AT",
	}
	response, err := executeShopifyGraphQL(ctx, state, tier1CustomersDocument, variables, "Tier1Customers")
	if err != nil {
		return shopifyCustomerPage{}, err
	}
	connection, err := decodeGraphQLField[shopifyCustomerConnection](response, "customers")
	if err != nil {
		return shopifyCustomerPage{}, err
	}
	customers := make([]shopifyGraphQLCustomer, 0, len(connection.Edges))
	for _, edge := range connection.Edges {
		if strings.TrimSpace(edge.Node.ID) == "" {
			continue
		}
		customers = append(customers, edge.Node)
	}
	nextCursor := strings.TrimSpace(connection.PageInfo.EndCursor)
	complete := !connection.PageInfo.HasNextPage || nextCursor == ""
	if complete {
		nextCursor = ""
	}
	return shopifyCustomerPage{
		Customers:     customers,
		RequestCursor: strings.TrimSpace(after),
		NextCursor:    nextCursor,
		Complete:      complete,
	}, nil
}

func fetchProductsSince(ctx context.Context, state *shopifyState, since time.Time, mode shopifySyncMode) ([]shopifyGraphQLProduct, shopifySourceRequest, time.Time, error) {
	document := `query Tier1Products($first: Int!, $after: String, $query: String!, $reverse: Boolean!, $sortKey: ProductSortKeys!, $savedSearchId: ID) {
  products(first: $first, after: $after, query: $query, reverse: $reverse, sortKey: $sortKey, savedSearchId: $savedSearchId) {
    edges {
      cursor
      node {
        id
        title
        handle
        updatedAt
        tags
        status
        vendor
        productType
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`
	query := shopifyUpdatedSinceFilter(since)
	localFilterSince := time.Time{}
	if mode == shopifySyncModeMonitor {
		// Shopify product updated_at search did not reliably surface tag churn during live monitor proof.
		// Snapshot the current product window and apply updatedAt locally instead.
		query = ""
		localFilterSince = since.UTC()
	}
	sourceRequest := shopifySourceRequest{
		APIBaseURL: fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion),
		Path:       shopifyGraphQLProjectionPath,
		Request: map[string]any{
			"operation":           "Tier1Products",
			"document":            document,
			"query":               emptyToNil(query),
			"sortKey":             "UPDATED_AT",
			"reverse":             false,
			"page_size":           shopifyGraphQLPageSize,
			"api_version":         state.APIVersion,
			"cursor_since":        since.UTC().Format(time.RFC3339),
			"local_snapshot_scan": mode == shopifySyncModeMonitor,
		},
	}

	products := make([]shopifyGraphQLProduct, 0, shopifyGraphQLPageSize)
	latestUpdatedAt := time.Time{}
	after := ""

	for {
		variables := map[string]any{
			"first":         shopifyGraphQLPageSize,
			"after":         emptyToNil(after),
			"query":         query,
			"reverse":       false,
			"sortKey":       "UPDATED_AT",
			"savedSearchId": nil,
		}
		response, err := executeShopifyGraphQL(ctx, state, document, variables, "Tier1Products")
		if err != nil {
			return nil, sourceRequest, time.Time{}, err
		}
		connection, err := decodeGraphQLField[shopifyProductConnection](response, "products")
		if err != nil {
			return nil, sourceRequest, time.Time{}, err
		}
		for _, edge := range connection.Edges {
			product := edge.Node
			if strings.TrimSpace(product.ID) == "" {
				continue
			}
			includeProduct := localFilterSince.IsZero()
			if parsed := parseShopifyUpdatedAt(product.UpdatedAt); !parsed.IsZero() && parsed.After(latestUpdatedAt) {
				latestUpdatedAt = parsed
			}
			if !localFilterSince.IsZero() {
				if parsed := parseShopifyUpdatedAt(product.UpdatedAt); !parsed.IsZero() && parsed.After(localFilterSince) {
					includeProduct = true
				}
			}
			if includeProduct {
				products = append(products, product)
			}
		}
		if !connection.PageInfo.HasNextPage || strings.TrimSpace(connection.PageInfo.EndCursor) == "" {
			break
		}
		after = connection.PageInfo.EndCursor
	}

	return products, sourceRequest, latestUpdatedAt, nil
}

func fetchCollectionsSince(ctx context.Context, state *shopifyState, since time.Time, mode shopifySyncMode) ([]shopifyGraphQLCollection, shopifySourceRequest, time.Time, error) {
	document := `query Tier1Collections($first: Int!, $after: String, $query: String!, $reverse: Boolean!, $sortKey: CollectionSortKeys!) {
  collections(first: $first, after: $after, query: $query, reverse: $reverse, sortKey: $sortKey) {
    edges {
      cursor
      node {
        id
        title
        handle
        updatedAt
        templateSuffix
        productsCount {
          count
        }
        ruleSet {
          appliedDisjunctively
          rules {
            column
            relation
            condition
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`
	query := shopifyUpdatedSinceFilter(since)
	localFilterSince := time.Time{}
	if mode == shopifySyncModeMonitor {
		// Shopify collection updated_at search did not reliably surface title changes during live monitor proof.
		// Snapshot the current collections window and apply the updatedAt cursor locally instead.
		query = ""
		localFilterSince = since.UTC()
	}
	sourceRequest := shopifySourceRequest{
		APIBaseURL: fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion),
		Path:       shopifyGraphQLProjectionPath,
		Request: map[string]any{
			"operation":           "Tier1Collections",
			"document":            document,
			"query":               emptyToNil(query),
			"sortKey":             "UPDATED_AT",
			"reverse":             false,
			"page_size":           shopifyGraphQLPageSize,
			"api_version":         state.APIVersion,
			"cursor_since":        since.UTC().Format(time.RFC3339),
			"local_snapshot_scan": mode == shopifySyncModeMonitor,
		},
	}

	collections := make([]shopifyGraphQLCollection, 0, shopifyGraphQLPageSize)
	latestUpdatedAt := time.Time{}
	after := ""

	for {
		variables := map[string]any{
			"first":   shopifyGraphQLPageSize,
			"after":   emptyToNil(after),
			"query":   query,
			"reverse": false,
			"sortKey": "UPDATED_AT",
		}
		response, err := executeShopifyGraphQL(ctx, state, document, variables, "Tier1Collections")
		if err != nil {
			return nil, sourceRequest, time.Time{}, err
		}
		connection, err := decodeGraphQLField[shopifyCollectionConnection](response, "collections")
		if err != nil {
			return nil, sourceRequest, time.Time{}, err
		}
		for _, edge := range connection.Edges {
			collection := edge.Node
			if strings.TrimSpace(collection.ID) == "" {
				continue
			}
			includeCollection := localFilterSince.IsZero()
			if parsed := parseShopifyUpdatedAt(collection.UpdatedAt); !parsed.IsZero() && parsed.After(latestUpdatedAt) {
				latestUpdatedAt = parsed
			}
			if !localFilterSince.IsZero() {
				if parsed := parseShopifyUpdatedAt(collection.UpdatedAt); !parsed.IsZero() && parsed.After(localFilterSince) {
					includeCollection = true
				}
			}
			if includeCollection {
				collections = append(collections, collection)
			}
		}
		if !connection.PageInfo.HasNextPage || strings.TrimSpace(connection.PageInfo.EndCursor) == "" {
			break
		}
		after = connection.PageInfo.EndCursor
	}

	return collections, sourceRequest, latestUpdatedAt, nil
}

func fetchInventoryItemsSince(ctx context.Context, state *shopifyState, since time.Time, mode shopifySyncMode) ([]shopifyGraphQLInventoryItem, shopifySourceRequest, time.Time, error) {
	document := `query Tier1Inventory($first: Int!, $after: String, $query: String!, $reverse: Boolean!) {
  inventoryItems(first: $first, after: $after, query: $query, reverse: $reverse) {
    edges {
      cursor
      node {
        id
        sku
        updatedAt
        tracked
        inventoryLevels(first: 20) {
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
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`
	query := shopifyUpdatedSinceFilter(since)
	localFilterSince := time.Time{}
	if mode == shopifySyncModeMonitor {
		// Shopify does not surface inventory level freshness through inventoryItems.updated_at
		// reliably enough for monitor use. Scan the current inventory snapshot and apply
		// the cursor locally against both item.updatedAt and inventoryLevel.updatedAt.
		query = ""
		localFilterSince = since.UTC()
	}
	sourceRequest := shopifySourceRequest{
		APIBaseURL: fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion),
		Path:       shopifyGraphQLProjectionPath,
		Request: map[string]any{
			"operation":           "Tier1Inventory",
			"document":            document,
			"query":               emptyToNil(query),
			"reverse":             false,
			"page_size":           shopifyGraphQLPageSize,
			"api_version":         state.APIVersion,
			"cursor_since":        since.UTC().Format(time.RFC3339),
			"local_snapshot_scan": mode == shopifySyncModeMonitor,
		},
	}

	items := make([]shopifyGraphQLInventoryItem, 0, shopifyGraphQLPageSize)
	latestUpdatedAt := time.Time{}
	after := ""

	for {
		variables := map[string]any{
			"first":   shopifyGraphQLPageSize,
			"after":   emptyToNil(after),
			"query":   query,
			"reverse": false,
		}
		response, err := executeShopifyGraphQL(ctx, state, document, variables, "Tier1Inventory")
		if err != nil {
			return nil, sourceRequest, time.Time{}, err
		}
		connection, err := decodeGraphQLField[shopifyInventoryItemConnection](response, "inventoryItems")
		if err != nil {
			return nil, sourceRequest, time.Time{}, err
		}
		for _, edge := range connection.Edges {
			item := edge.Node
			if strings.TrimSpace(item.ID) == "" {
				continue
			}
			includeItem := localFilterSince.IsZero()
			if parsed := parseShopifyUpdatedAt(item.UpdatedAt); !parsed.IsZero() && parsed.After(latestUpdatedAt) {
				latestUpdatedAt = parsed
			}
			if !localFilterSince.IsZero() {
				if parsed := parseShopifyUpdatedAt(item.UpdatedAt); !parsed.IsZero() && parsed.After(localFilterSince) {
					includeItem = true
				}
			}
			for _, levelEdge := range item.InventoryLevels.Edges {
				if parsed := parseShopifyUpdatedAt(levelEdge.Node.UpdatedAt); !parsed.IsZero() && parsed.After(latestUpdatedAt) {
					latestUpdatedAt = parsed
				}
				if !localFilterSince.IsZero() {
					if parsed := parseShopifyUpdatedAt(levelEdge.Node.UpdatedAt); !parsed.IsZero() && parsed.After(localFilterSince) {
						includeItem = true
					}
				}
			}
			if includeItem {
				items = append(items, item)
			}
		}
		if !connection.PageInfo.HasNextPage || strings.TrimSpace(connection.PageInfo.EndCursor) == "" {
			break
		}
		after = connection.PageInfo.EndCursor
	}

	return items, sourceRequest, latestUpdatedAt, nil
}

func fetchFulfillmentOrdersSince(ctx context.Context, state *shopifyState, since time.Time) ([]shopifyGraphQLFulfillmentOrder, shopifySourceRequest, time.Time, error) {
	document := `query Tier1Fulfillments($first: Int!, $after: String, $query: String!, $reverse: Boolean!, $sortKey: FulfillmentOrderSortKeys!) {
  fulfillmentOrders(first: $first, after: $after, query: $query, reverse: $reverse, sortKey: $sortKey) {
    edges {
      cursor
      node {
        id
        updatedAt
        status
        requestStatus
        fulfillAt
        orderName
        orderId
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`
	query := shopifyUpdatedSinceFilter(since)
	sourceRequest := shopifySourceRequest{
		APIBaseURL: fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion),
		Path:       shopifyGraphQLProjectionPath,
		Request: map[string]any{
			"operation":   "Tier1Fulfillments",
			"document":    document,
			"query":       query,
			"sortKey":     "UPDATED_AT",
			"reverse":     false,
			"page_size":   shopifyGraphQLPageSize,
			"api_version": state.APIVersion,
		},
	}

	fulfillmentOrders := make([]shopifyGraphQLFulfillmentOrder, 0, shopifyGraphQLPageSize)
	latestUpdatedAt := time.Time{}
	after := ""

	for {
		variables := map[string]any{
			"first":   shopifyGraphQLPageSize,
			"after":   emptyToNil(after),
			"query":   query,
			"reverse": false,
			"sortKey": "UPDATED_AT",
		}
		response, err := executeShopifyGraphQL(ctx, state, document, variables, "Tier1Fulfillments")
		if err != nil {
			return nil, sourceRequest, time.Time{}, err
		}
		connection, err := decodeGraphQLField[shopifyFulfillmentOrderConnection](response, "fulfillmentOrders")
		if err != nil {
			return nil, sourceRequest, time.Time{}, err
		}
		for _, edge := range connection.Edges {
			fulfillment := edge.Node
			if strings.TrimSpace(fulfillment.ID) == "" {
				continue
			}
			fulfillmentOrders = append(fulfillmentOrders, fulfillment)
			if parsed := parseShopifyUpdatedAt(fulfillment.UpdatedAt); !parsed.IsZero() && parsed.After(latestUpdatedAt) {
				latestUpdatedAt = parsed
			}
		}
		if !connection.PageInfo.HasNextPage || strings.TrimSpace(connection.PageInfo.EndCursor) == "" {
			break
		}
		after = connection.PageInfo.EndCursor
	}

	return fulfillmentOrders, sourceRequest, latestUpdatedAt, nil
}

func fetchDiscountsSince(ctx context.Context, state *shopifyState, since time.Time) ([]shopifyGraphQLDiscountRecord, shopifySourceRequest, time.Time, error) {
	codeDocument := `query Tier1CodeDiscounts($first: Int!, $after: String, $query: String!, $reverse: Boolean!, $sortKey: CodeDiscountSortKeys!) {
  codeDiscountNodes(first: $first, after: $after, query: $query, reverse: $reverse, sortKey: $sortKey) {
    edges {
      cursor
      node {
        id
        events(first: 1) {
          edges {
            node {
              createdAt
            }
          }
        }
        codeDiscount {
          __typename
          ... on DiscountCodeBasic {
            title
            status
            startsAt
            endsAt
            updatedAt
          }
          ... on DiscountCodeBxgy {
            title
            status
            startsAt
            endsAt
            updatedAt
          }
          ... on DiscountCodeFreeShipping {
            title
            status
            startsAt
            endsAt
            updatedAt
          }
          ... on DiscountCodeApp {
            title
            status
            startsAt
            endsAt
            updatedAt
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`
	autoDocument := `query Tier1AutomaticDiscounts($first: Int!, $after: String, $query: String!, $reverse: Boolean!) {
  automaticDiscountNodes(first: $first, after: $after, query: $query, reverse: $reverse) {
    edges {
      cursor
      node {
        id
        events(first: 1) {
          edges {
            node {
              createdAt
            }
          }
        }
        automaticDiscount {
          __typename
          ... on DiscountAutomaticBasic {
            title
            status
            startsAt
            endsAt
            updatedAt
          }
          ... on DiscountAutomaticBxgy {
            title
            status
            startsAt
            endsAt
            updatedAt
          }
          ... on DiscountAutomaticFreeShipping {
            title
            status
            startsAt
            endsAt
            updatedAt
          }
          ... on DiscountAutomaticApp {
            title
            status
            startsAt
            endsAt
            updatedAt
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`
	query := shopifyUpdatedSinceFilter(since)
	sourceRequest := shopifySourceRequest{
		APIBaseURL: fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion),
		Path:       shopifyGraphQLProjectionPath,
		Request: map[string]any{
			"operations":  []string{"Tier1CodeDiscounts", "Tier1AutomaticDiscounts"},
			"query":       query,
			"api_version": state.APIVersion,
		},
	}

	records := make([]shopifyGraphQLDiscountRecord, 0, 32)
	latestUpdatedAt := time.Time{}
	codeAfter := ""
	for {
		variables := map[string]any{
			"first":   shopifyGraphQLPageSize,
			"after":   emptyToNil(codeAfter),
			"query":   query,
			"reverse": false,
			"sortKey": "UPDATED_AT",
		}
		response, err := executeShopifyGraphQL(ctx, state, codeDocument, variables, "Tier1CodeDiscounts")
		if err != nil {
			return nil, sourceRequest, time.Time{}, err
		}
		connection, err := decodeGraphQLField[shopifyCodeDiscountNodeConnection](response, "codeDiscountNodes")
		if err != nil {
			return nil, sourceRequest, time.Time{}, err
		}
		for _, edge := range connection.Edges {
			node := edge.Node
			if strings.TrimSpace(node.ID) == "" {
				continue
			}
			record := shopifyGraphQLDiscountRecord{
				NodeGID:      node.ID,
				DiscountType: node.CodeDiscount.TypeName,
				Title:        node.CodeDiscount.Title,
				Status:       node.CodeDiscount.Status,
				StartsAt:     node.CodeDiscount.StartsAt,
				EndsAt:       node.CodeDiscount.EndsAt,
				UpdatedAt:    discountUpdatedAt(node.CodeDiscount.UpdatedAt, node.Events, node.CodeDiscount.StartsAt, node.CodeDiscount.EndsAt),
			}
			records = append(records, record)
			if parsed := parseShopifyUpdatedAt(record.UpdatedAt); !parsed.IsZero() && parsed.After(latestUpdatedAt) {
				latestUpdatedAt = parsed
			}
		}
		if !connection.PageInfo.HasNextPage || strings.TrimSpace(connection.PageInfo.EndCursor) == "" {
			break
		}
		codeAfter = connection.PageInfo.EndCursor
	}

	autoAfter := ""
	for {
		variables := map[string]any{
			"first":   shopifyGraphQLPageSize,
			"after":   emptyToNil(autoAfter),
			"query":   query,
			"reverse": false,
		}
		response, err := executeShopifyGraphQL(ctx, state, autoDocument, variables, "Tier1AutomaticDiscounts")
		if err != nil {
			return nil, sourceRequest, time.Time{}, err
		}
		connection, err := decodeGraphQLField[shopifyAutomaticDiscountNodeConnection](response, "automaticDiscountNodes")
		if err != nil {
			return nil, sourceRequest, time.Time{}, err
		}
		for _, edge := range connection.Edges {
			node := edge.Node
			if strings.TrimSpace(node.ID) == "" {
				continue
			}
			record := shopifyGraphQLDiscountRecord{
				NodeGID:      node.ID,
				DiscountType: node.AutomaticDiscount.TypeName,
				Title:        node.AutomaticDiscount.Title,
				Status:       node.AutomaticDiscount.Status,
				StartsAt:     node.AutomaticDiscount.StartsAt,
				EndsAt:       node.AutomaticDiscount.EndsAt,
				UpdatedAt:    discountUpdatedAt(node.AutomaticDiscount.UpdatedAt, node.Events, node.AutomaticDiscount.StartsAt, node.AutomaticDiscount.EndsAt),
			}
			records = append(records, record)
			if parsed := parseShopifyUpdatedAt(record.UpdatedAt); !parsed.IsZero() && parsed.After(latestUpdatedAt) {
				latestUpdatedAt = parsed
			}
		}
		if !connection.PageInfo.HasNextPage || strings.TrimSpace(connection.PageInfo.EndCursor) == "" {
			break
		}
		autoAfter = connection.PageInfo.EndCursor
	}

	return records, sourceRequest, latestUpdatedAt, nil
}

func fetchMarketingActivitiesSince(ctx context.Context, state *shopifyState, since time.Time) ([]shopifyGraphQLMarketingActivity, shopifySourceRequest, time.Time, error) {
	document := `query Tier1Marketing($first: Int!, $after: String, $query: String!, $reverse: Boolean!, $sortKey: MarketingActivitySortKeys!) {
  marketingActivities(first: $first, after: $after, query: $query, reverse: $reverse, sortKey: $sortKey) {
    edges {
      cursor
      node {
        id
        title
        status
        updatedAt
        marketingChannel
        tactic
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`
	query := shopifyUpdatedSinceFilter(since)
	sourceRequest := shopifySourceRequest{
		APIBaseURL: fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion),
		Path:       shopifyGraphQLProjectionPath,
		Request: map[string]any{
			"operation": "Tier1Marketing",
			"document":  document,
			"query":     query,
			// Shopify does not expose UPDATED_AT as a supported marketing sort key.
			// The updated_at query filter remains the authoritative freshness gate.
			"sortKey":     "ID",
			"reverse":     false,
			"page_size":   shopifyGraphQLPageSize,
			"api_version": state.APIVersion,
		},
	}

	activities := make([]shopifyGraphQLMarketingActivity, 0, shopifyGraphQLPageSize)
	latestUpdatedAt := time.Time{}
	after := ""
	for {
		variables := map[string]any{
			"first":   shopifyGraphQLPageSize,
			"after":   emptyToNil(after),
			"query":   query,
			"reverse": false,
			"sortKey": "ID",
		}
		response, err := executeShopifyGraphQL(ctx, state, document, variables, "Tier1Marketing")
		if err != nil {
			return nil, sourceRequest, time.Time{}, err
		}
		connection, err := decodeGraphQLField[shopifyMarketingActivityConnection](response, "marketingActivities")
		if err != nil {
			return nil, sourceRequest, time.Time{}, err
		}
		for _, edge := range connection.Edges {
			activity := edge.Node
			if strings.TrimSpace(activity.ID) == "" {
				continue
			}
			activities = append(activities, activity)
			if parsed := parseShopifyUpdatedAt(activity.UpdatedAt); !parsed.IsZero() && parsed.After(latestUpdatedAt) {
				latestUpdatedAt = parsed
			}
		}
		if !connection.PageInfo.HasNextPage || strings.TrimSpace(connection.PageInfo.EndCursor) == "" {
			break
		}
		after = connection.PageInfo.EndCursor
	}

	return activities, sourceRequest, latestUpdatedAt, nil
}

func buildCustomerRecord(state *shopifyState, customer shopifyGraphQLCustomer, sourceRequest shopifySourceRequest) nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(state.ConnectionID)
	if err != nil {
		nexadapter.LogError("shopify customer build: %v", err)
		return nexadapter.AdapterInboundRecord{}
	}

	customerGID := strings.TrimSpace(customer.ID)
	if customerGID == "" {
		return nexadapter.AdapterInboundRecord{}
	}
	customerID := shopifyGIDIdentityToken(customerGID)
	row := normalizedCustomerRow(state.ShopDomain, customer)
	revision := revisionHash(providerRevisionInput(customer.rawProviderPayload, row))
	logicalRowID := fmt.Sprintf("%s:%s", state.ShopDomain, customerGID)
	threadID := fmt.Sprintf("%s:customer:%s", state.ShopDomain, customerID)
	threadName := firstNonBlank(customer.DisplayName, customer.Email, customerID)
	providerIDs := map[string]any{
		"shop_domain":  state.ShopDomain,
		"customer_gid": customerGID,
		"customer_id":  emptyToNil(shopifyNumericGID(customerGID)),
	}

	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       platformID,
			Platform:      platformID,
			ConnectionID:  connectionID,
			SenderID:      state.ShopDomain,
			SenderName:    "Shopify",
			ReceiverID:    connectionID,
			SpaceID:       state.ShopDomain,
			SpaceName:     state.ShopDomain,
			ContainerKind: "group",
			ContainerID:   "customer",
			ContainerName: "Customers",
			ThreadID:      threadID,
			ThreadName:    threadName,
			Metadata: map[string]any{
				"family":      "customer",
				"grain":       "customer",
				"shop_domain": state.ShopDomain,
				"api_path":    sourceRequest.Path,
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("%s:%s:customer:%s:%s", platformID, nexadapter.SafeIDToken(connectionID), customerID, revision),
			Timestamp:        shopifyUpdatedAtOrNow(customer.UpdatedAt).UnixMilli(),
			Content:          fmt.Sprintf("customer %s email=%s state=%s", threadName, firstNonBlank(customer.Email, "unknown"), firstNonBlank(customer.State, "unknown")),
			ContentType:      "text",
			Payload:          providerPayloadEnvelope(customer.rawProviderJSON, customer.rawProviderPayload, customer),
			Metadata: map[string]any{
				"connection_id":     connectionID,
				"adapter_id":        platformID,
				"family":            "customer",
				"logical_row_id":    logicalRowID,
				"revision_hash":     revision,
				"provider_ids":      providerIDs,
				"row":               row,
				"bridge_attributes": map[string]any{},
				"source_request":    sourceRequest.metadata(),
			},
		},
	}
}

func buildProductRecord(state *shopifyState, product shopifyGraphQLProduct, sourceRequest shopifySourceRequest) nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(state.ConnectionID)
	if err != nil {
		nexadapter.LogError("shopify product build: %v", err)
		return nexadapter.AdapterInboundRecord{}
	}

	productGID := strings.TrimSpace(product.ID)
	if productGID == "" {
		return nexadapter.AdapterInboundRecord{}
	}
	productID := shopifyGIDIdentityToken(productGID)
	row := normalizedProductRow(state.ShopDomain, product)
	revision := revisionHash(providerRevisionInput(product.rawProviderPayload, row))
	logicalRowID := fmt.Sprintf("%s:%s", state.ShopDomain, productGID)
	threadID := fmt.Sprintf("%s:product:%s", state.ShopDomain, productID)
	threadName := firstNonBlank(product.Title, product.Handle, productID)
	providerIDs := map[string]any{
		"shop_domain":    state.ShopDomain,
		"product_gid":    productGID,
		"product_id":     emptyToNil(shopifyNumericGID(productGID)),
		"product_handle": emptyToNil(product.Handle),
	}

	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       platformID,
			Platform:      platformID,
			ConnectionID:  connectionID,
			SenderID:      state.ShopDomain,
			SenderName:    "Shopify",
			ReceiverID:    connectionID,
			SpaceID:       state.ShopDomain,
			SpaceName:     state.ShopDomain,
			ContainerKind: "group",
			ContainerID:   "product",
			ContainerName: "Products",
			ThreadID:      threadID,
			ThreadName:    threadName,
			Metadata: map[string]any{
				"family":      "product",
				"grain":       "product",
				"shop_domain": state.ShopDomain,
				"api_path":    sourceRequest.Path,
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("%s:%s:product:%s:%s", platformID, nexadapter.SafeIDToken(connectionID), productID, revision),
			Timestamp:        shopifyUpdatedAtOrNow(product.UpdatedAt).UnixMilli(),
			Content:          fmt.Sprintf("product %s handle=%s status=%s", threadName, firstNonBlank(product.Handle, "unknown"), firstNonBlank(product.Status, "unknown")),
			ContentType:      "text",
			Payload:          providerPayloadEnvelope(product.rawProviderJSON, product.rawProviderPayload, product),
			Metadata: map[string]any{
				"connection_id":     connectionID,
				"adapter_id":        platformID,
				"family":            "product",
				"logical_row_id":    logicalRowID,
				"revision_hash":     revision,
				"provider_ids":      providerIDs,
				"row":               row,
				"bridge_attributes": map[string]any{},
				"source_request":    sourceRequest.metadata(),
			},
		},
	}
}

func buildCollectionRecord(state *shopifyState, collection shopifyGraphQLCollection, sourceRequest shopifySourceRequest) nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(state.ConnectionID)
	if err != nil {
		nexadapter.LogError("shopify collection build: %v", err)
		return nexadapter.AdapterInboundRecord{}
	}

	collectionGID := strings.TrimSpace(collection.ID)
	if collectionGID == "" {
		return nexadapter.AdapterInboundRecord{}
	}
	collectionID := shopifyGIDIdentityToken(collectionGID)
	row := normalizedCollectionRow(state.ShopDomain, collection)
	revision := revisionHash(providerRevisionInput(collection.rawProviderPayload, row))
	logicalRowID := fmt.Sprintf("%s:%s", state.ShopDomain, collectionGID)
	threadID := fmt.Sprintf("%s:collection:%s", state.ShopDomain, collectionID)
	threadName := firstNonBlank(collection.Title, collection.Handle, collectionID)
	providerIDs := map[string]any{
		"shop_domain":       state.ShopDomain,
		"collection_gid":    collectionGID,
		"collection_id":     emptyToNil(shopifyNumericGID(collectionGID)),
		"collection_handle": emptyToNil(collection.Handle),
	}

	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       platformID,
			Platform:      platformID,
			ConnectionID:  connectionID,
			SenderID:      state.ShopDomain,
			SenderName:    "Shopify",
			ReceiverID:    connectionID,
			SpaceID:       state.ShopDomain,
			SpaceName:     state.ShopDomain,
			ContainerKind: "group",
			ContainerID:   "collection",
			ContainerName: "Collections",
			ThreadID:      threadID,
			ThreadName:    threadName,
			Metadata: map[string]any{
				"family":      "collection",
				"grain":       "collection",
				"shop_domain": state.ShopDomain,
				"api_path":    sourceRequest.Path,
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("%s:%s:collection:%s:%s", platformID, nexadapter.SafeIDToken(connectionID), collectionID, revision),
			Timestamp:        shopifyUpdatedAtOrNow(collection.UpdatedAt).UnixMilli(),
			Content:          fmt.Sprintf("collection %s handle=%s products=%d", threadName, firstNonBlank(collection.Handle, "unknown"), collection.ProductsCount.Count),
			ContentType:      "text",
			Payload:          providerPayloadEnvelope(collection.rawProviderJSON, collection.rawProviderPayload, collection),
			Metadata: map[string]any{
				"connection_id":     connectionID,
				"adapter_id":        platformID,
				"family":            "collection",
				"logical_row_id":    logicalRowID,
				"revision_hash":     revision,
				"provider_ids":      providerIDs,
				"row":               row,
				"bridge_attributes": map[string]any{},
				"source_request":    sourceRequest.metadata(),
			},
		},
	}
}

func buildInventoryRecords(state *shopifyState, item shopifyGraphQLInventoryItem, sourceRequest shopifySourceRequest) []nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(state.ConnectionID)
	if err != nil {
		nexadapter.LogError("shopify inventory build: %v", err)
		return nil
	}

	itemGID := strings.TrimSpace(item.ID)
	if itemGID == "" {
		return nil
	}
	itemID := shopifyGIDIdentityToken(itemGID)
	threadID := fmt.Sprintf("%s:inventory:%s", state.ShopDomain, itemID)
	threadName := firstNonBlank(item.SKU, itemID)
	records := make([]nexadapter.AdapterInboundRecord, 0, len(item.InventoryLevels.Edges))
	for _, levelEdge := range item.InventoryLevels.Edges {
		level := levelEdge.Node
		levelGID := strings.TrimSpace(level.ID)
		if levelGID == "" {
			continue
		}
		row := normalizedInventoryRow(state.ShopDomain, item, level)
		revision := revisionHash(providerRevisionInput(item.rawProviderPayload, row))
		logicalRowID := fmt.Sprintf("%s:%s:%s", state.ShopDomain, itemGID, levelGID)
		providerIDs := map[string]any{
			"shop_domain":         state.ShopDomain,
			"inventory_item_gid":  itemGID,
			"inventory_item_id":   emptyToNil(shopifyNumericGID(itemGID)),
			"inventory_level_gid": levelGID,
			"location_gid":        emptyToNil(level.Location.ID),
			"location_id":         emptyToNil(shopifyNumericGID(level.Location.ID)),
		}
		record := nexadapter.AdapterInboundRecord{
			Operation: "record.ingest",
			Routing: nexadapter.AdapterInboundRouting{
				Adapter:       platformID,
				Platform:      platformID,
				ConnectionID:  connectionID,
				SenderID:      state.ShopDomain,
				SenderName:    "Shopify",
				ReceiverID:    connectionID,
				SpaceID:       state.ShopDomain,
				SpaceName:     state.ShopDomain,
				ContainerKind: "group",
				ContainerID:   "inventory",
				ContainerName: "Inventory",
				ThreadID:      threadID,
				ThreadName:    threadName,
				Metadata: map[string]any{
					"family":      "inventory",
					"grain":       "inventory_item+inventory_level",
					"shop_domain": state.ShopDomain,
					"api_path":    sourceRequest.Path,
				},
			},
			Payload: nexadapter.AdapterInboundPayload{
				ExternalRecordID: fmt.Sprintf("%s:%s:inventory:%s:%s:%s", platformID, nexadapter.SafeIDToken(connectionID), itemID, nexadapter.SafeIDToken(levelGID), revision),
				Timestamp:        shopifyUpdatedAtOrNow(firstNonBlank(level.UpdatedAt, item.UpdatedAt)).UnixMilli(),
				Content:          fmt.Sprintf("inventory item=%s location=%s available=%d tracked=%t", threadName, firstNonBlank(level.Location.Name, "unknown"), inventoryQuantity(level, "available"), item.Tracked),
				ContentType:      "text",
				Payload:          providerPayloadEnvelope(item.rawProviderJSON, item.rawProviderPayload, item),
				Metadata: map[string]any{
					"connection_id":     connectionID,
					"adapter_id":        platformID,
					"family":            "inventory",
					"logical_row_id":    logicalRowID,
					"revision_hash":     revision,
					"provider_ids":      providerIDs,
					"row":               row,
					"bridge_attributes": map[string]any{},
					"source_request":    sourceRequest.metadata(),
				},
			},
		}
		records = append(records, record)
	}
	return records
}

func buildFulfillmentRecord(state *shopifyState, fulfillment shopifyGraphQLFulfillmentOrder, sourceRequest shopifySourceRequest) nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(state.ConnectionID)
	if err != nil {
		nexadapter.LogError("shopify fulfillment build: %v", err)
		return nexadapter.AdapterInboundRecord{}
	}

	fulfillmentGID := strings.TrimSpace(fulfillment.ID)
	if fulfillmentGID == "" {
		return nexadapter.AdapterInboundRecord{}
	}
	fulfillmentID := shopifyGIDIdentityToken(fulfillmentGID)
	row := normalizedFulfillmentRow(state.ShopDomain, fulfillment)
	revision := revisionHash(providerRevisionInput(fulfillment.rawProviderPayload, row))
	logicalRowID := fmt.Sprintf("%s:%s", state.ShopDomain, fulfillmentGID)
	threadID := fmt.Sprintf("%s:fulfillment:%s", state.ShopDomain, fulfillmentID)
	threadName := firstNonBlank(fulfillment.OrderName, fulfillmentID)
	providerIDs := map[string]any{
		"shop_domain":           state.ShopDomain,
		"fulfillment_order_gid": fulfillmentGID,
		"fulfillment_order_id":  emptyToNil(shopifyNumericGID(fulfillmentGID)),
		"order_gid":             emptyToNil(fulfillment.OrderID),
		"order_id":              emptyToNil(shopifyNumericGID(fulfillment.OrderID)),
	}

	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       platformID,
			Platform:      platformID,
			ConnectionID:  connectionID,
			SenderID:      state.ShopDomain,
			SenderName:    "Shopify",
			ReceiverID:    connectionID,
			SpaceID:       state.ShopDomain,
			SpaceName:     state.ShopDomain,
			ContainerKind: "group",
			ContainerID:   "fulfillment",
			ContainerName: "Fulfillments",
			ThreadID:      threadID,
			ThreadName:    threadName,
			Metadata: map[string]any{
				"family":      "fulfillment",
				"grain":       "fulfillment_order",
				"shop_domain": state.ShopDomain,
				"api_path":    sourceRequest.Path,
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("%s:%s:fulfillment:%s:%s", platformID, nexadapter.SafeIDToken(connectionID), fulfillmentID, revision),
			Timestamp:        shopifyUpdatedAtOrNow(fulfillment.UpdatedAt).UnixMilli(),
			Content:          fmt.Sprintf("fulfillment %s status=%s request_status=%s", threadName, firstNonBlank(fulfillment.Status, "unknown"), firstNonBlank(fulfillment.RequestStatus, "unknown")),
			ContentType:      "text",
			Payload:          providerPayloadEnvelope(fulfillment.rawProviderJSON, fulfillment.rawProviderPayload, fulfillment),
			Metadata: map[string]any{
				"connection_id":     connectionID,
				"adapter_id":        platformID,
				"family":            "fulfillment",
				"logical_row_id":    logicalRowID,
				"revision_hash":     revision,
				"provider_ids":      providerIDs,
				"row":               row,
				"bridge_attributes": map[string]any{},
				"source_request":    sourceRequest.metadata(),
			},
		},
	}
}

func buildDiscountRecord(state *shopifyState, discount shopifyGraphQLDiscountRecord, sourceRequest shopifySourceRequest) nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(state.ConnectionID)
	if err != nil {
		nexadapter.LogError("shopify discount build: %v", err)
		return nexadapter.AdapterInboundRecord{}
	}

	discountGID := strings.TrimSpace(discount.NodeGID)
	if discountGID == "" {
		return nexadapter.AdapterInboundRecord{}
	}
	discountID := shopifyGIDIdentityToken(discountGID)
	row := normalizedDiscountRow(state.ShopDomain, discount)
	revision := revisionHash(row)
	logicalRowID := fmt.Sprintf("%s:%s", state.ShopDomain, discountGID)
	threadID := fmt.Sprintf("%s:discount:%s", state.ShopDomain, discountID)
	threadName := firstNonBlank(discount.Title, discountID)
	providerIDs := map[string]any{
		"shop_domain":   state.ShopDomain,
		"discount_gid":  discountGID,
		"discount_id":   emptyToNil(shopifyNumericGID(discountGID)),
		"discount_type": emptyToNil(discount.DiscountType),
	}

	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       platformID,
			Platform:      platformID,
			ConnectionID:  connectionID,
			SenderID:      state.ShopDomain,
			SenderName:    "Shopify",
			ReceiverID:    connectionID,
			SpaceID:       state.ShopDomain,
			SpaceName:     state.ShopDomain,
			ContainerKind: "group",
			ContainerID:   "discount",
			ContainerName: "Discounts",
			ThreadID:      threadID,
			ThreadName:    threadName,
			Metadata: map[string]any{
				"family":      "discount",
				"grain":       "discount_node",
				"shop_domain": state.ShopDomain,
				"api_path":    sourceRequest.Path,
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("%s:%s:discount:%s:%s", platformID, nexadapter.SafeIDToken(connectionID), discountID, revision),
			Timestamp:        shopifyUpdatedAtOrNow(discount.UpdatedAt).UnixMilli(),
			Content:          fmt.Sprintf("discount %s status=%s class=%s", threadName, firstNonBlank(discount.Status, "unknown"), firstNonBlank(discount.DiscountType, "unknown")),
			ContentType:      "text",
			Metadata: map[string]any{
				"connection_id":        connectionID,
				"adapter_id":           platformID,
				"family":               "discount",
				"logical_row_id":       logicalRowID,
				"revision_hash":        revision,
				"provider_ids":         providerIDs,
				"row":                  row,
				"bridge_attributes":    map[string]any{},
				"raw_provider_payload": mustJSONObject(discount),
				"source_request":       sourceRequest.metadata(),
			},
		},
	}
}

func buildMarketingRecord(state *shopifyState, activity shopifyGraphQLMarketingActivity, sourceRequest shopifySourceRequest) nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(state.ConnectionID)
	if err != nil {
		nexadapter.LogError("shopify marketing build: %v", err)
		return nexadapter.AdapterInboundRecord{}
	}

	activityGID := strings.TrimSpace(activity.ID)
	if activityGID == "" {
		return nexadapter.AdapterInboundRecord{}
	}
	activityID := shopifyGIDIdentityToken(activityGID)
	row := normalizedMarketingRow(state.ShopDomain, activity)
	revision := revisionHash(row)
	logicalRowID := fmt.Sprintf("%s:%s", state.ShopDomain, activityGID)
	threadID := fmt.Sprintf("%s:marketing:%s", state.ShopDomain, activityID)
	threadName := firstNonBlank(activity.Title, activityID)
	providerIDs := map[string]any{
		"shop_domain":      state.ShopDomain,
		"marketing_gid":    activityGID,
		"marketing_id":     emptyToNil(shopifyNumericGID(activityGID)),
		"marketing_tactic": emptyToNil(activity.Tactic),
	}

	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       platformID,
			Platform:      platformID,
			ConnectionID:  connectionID,
			SenderID:      state.ShopDomain,
			SenderName:    "Shopify",
			ReceiverID:    connectionID,
			SpaceID:       state.ShopDomain,
			SpaceName:     state.ShopDomain,
			ContainerKind: "group",
			ContainerID:   "marketing",
			ContainerName: "Marketing",
			ThreadID:      threadID,
			ThreadName:    threadName,
			Metadata: map[string]any{
				"family":      "marketing",
				"grain":       "marketing_activity",
				"shop_domain": state.ShopDomain,
				"api_path":    sourceRequest.Path,
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("%s:%s:marketing:%s:%s", platformID, nexadapter.SafeIDToken(connectionID), activityID, revision),
			Timestamp:        shopifyUpdatedAtOrNow(activity.UpdatedAt).UnixMilli(),
			Content:          fmt.Sprintf("marketing %s status=%s channel=%s tactic=%s", threadName, firstNonBlank(activity.Status, "unknown"), firstNonBlank(activity.MarketingChannel, "unknown"), firstNonBlank(activity.Tactic, "unknown")),
			ContentType:      "text",
			Metadata: map[string]any{
				"connection_id":        connectionID,
				"adapter_id":           platformID,
				"family":               "marketing",
				"logical_row_id":       logicalRowID,
				"revision_hash":        revision,
				"provider_ids":         providerIDs,
				"row":                  row,
				"bridge_attributes":    map[string]any{},
				"raw_provider_payload": mustJSONObject(activity),
				"source_request":       sourceRequest.metadata(),
			},
		},
	}
}

func normalizedCustomerRow(shopDomain string, customer shopifyGraphQLCustomer) map[string]any {
	addresses := make([]map[string]any, 0, len(customer.Addresses))
	for _, address := range customer.Addresses {
		addresses = append(addresses, normalizedGraphQLCustomerAddress(address))
	}
	row := map[string]any{
		"shop_domain":        shopDomain,
		"customer_gid":       customer.ID,
		"customer_id":        shopifyNumericGID(customer.ID),
		"display_name":       customer.DisplayName,
		"first_name":         customer.FirstName,
		"last_name":          customer.LastName,
		"email":              customer.Email,
		"phone":              customer.Phone,
		"created_at":         customer.CreatedAt,
		"updated_at":         customer.UpdatedAt,
		"state":              customer.State,
		"verified_email":     customer.VerifiedEmail,
		"tags":               customer.Tags,
		"default_address":    normalizedOptionalGraphQLCustomerAddress(customer.DefaultAddress),
		"addresses":          addresses,
		"addresses_complete": true,
	}
	return compactMap(row)
}

func normalizedOptionalGraphQLCustomerAddress(address *shopifyGraphQLCustomerAddress) any {
	if address == nil {
		return nil
	}
	return normalizedGraphQLCustomerAddress(*address)
}

func normalizedGraphQLCustomerAddress(address shopifyGraphQLCustomerAddress) map[string]any {
	return compactMap(map[string]any{
		"address_gid":   address.ID,
		"first_name":    address.FirstName,
		"last_name":     address.LastName,
		"name":          address.Name,
		"company":       address.Company,
		"address1":      address.Address1,
		"address2":      address.Address2,
		"city":          address.City,
		"province":      address.Province,
		"province_code": address.ProvinceCode,
		"country":       address.Country,
		"country_code":  address.CountryCodeV2,
		"zip":           address.Zip,
		"phone":         address.Phone,
	})
}

func normalizedProductRow(shopDomain string, product shopifyGraphQLProduct) map[string]any {
	row := map[string]any{
		"shop_domain":  shopDomain,
		"product_gid":  product.ID,
		"product_id":   shopifyNumericGID(product.ID),
		"title":        product.Title,
		"handle":       product.Handle,
		"updated_at":   product.UpdatedAt,
		"status":       product.Status,
		"vendor":       product.Vendor,
		"product_type": product.ProductType,
		"tags":         product.Tags,
	}
	return compactMap(row)
}

func normalizedCollectionRow(shopDomain string, collection shopifyGraphQLCollection) map[string]any {
	row := map[string]any{
		"shop_domain":     shopDomain,
		"collection_gid":  collection.ID,
		"collection_id":   shopifyNumericGID(collection.ID),
		"title":           collection.Title,
		"handle":          collection.Handle,
		"updated_at":      collection.UpdatedAt,
		"template_suffix": emptyToNil(collection.TemplateSuffix),
		"products_count":  collection.ProductsCount.Count,
		"rule_set":        normalizedCollectionRuleSet(collection.RuleSet),
	}
	return compactMap(row)
}

func normalizedCollectionRuleSet(ruleSet *shopifyGraphQLCollectionRuleSet) any {
	if ruleSet == nil {
		return nil
	}
	rules := make([]map[string]any, 0, len(ruleSet.Rules))
	for _, rule := range ruleSet.Rules {
		rules = append(rules, compactMap(map[string]any{
			"column":    rule.Column,
			"relation":  rule.Relation,
			"condition": rule.Condition,
		}))
	}
	return compactMap(map[string]any{
		"applied_disjunctively": ruleSet.AppliedDisjunctively,
		"rules":                 rules,
		"rule_count":            len(rules),
	})
}

func normalizedInventoryRow(shopDomain string, item shopifyGraphQLInventoryItem, level shopifyGraphQLInventoryLevel) map[string]any {
	row := map[string]any{
		"shop_domain":         shopDomain,
		"inventory_item_gid":  item.ID,
		"inventory_item_id":   shopifyNumericGID(item.ID),
		"inventory_level_gid": level.ID,
		"sku":                 item.SKU,
		"tracked":             item.Tracked,
		"item_updated_at":     item.UpdatedAt,
		"level_updated_at":    level.UpdatedAt,
		"location_gid":        level.Location.ID,
		"location_id":         shopifyNumericGID(level.Location.ID),
		"location_name":       level.Location.Name,
		"available":           inventoryQuantity(level, "available"),
	}
	return compactMap(row)
}

func normalizedFulfillmentRow(shopDomain string, fulfillment shopifyGraphQLFulfillmentOrder) map[string]any {
	row := map[string]any{
		"shop_domain":           shopDomain,
		"fulfillment_order_gid": fulfillment.ID,
		"fulfillment_order_id":  shopifyNumericGID(fulfillment.ID),
		"order_gid":             fulfillment.OrderID,
		"order_id":              shopifyNumericGID(fulfillment.OrderID),
		"order_name":            fulfillment.OrderName,
		"updated_at":            fulfillment.UpdatedAt,
		"status":                fulfillment.Status,
		"request_status":        fulfillment.RequestStatus,
		"fulfill_at":            fulfillment.FulfillAt,
	}
	return compactMap(row)
}

func normalizedDiscountRow(shopDomain string, discount shopifyGraphQLDiscountRecord) map[string]any {
	row := map[string]any{
		"shop_domain":   shopDomain,
		"discount_gid":  discount.NodeGID,
		"discount_id":   shopifyNumericGID(discount.NodeGID),
		"discount_type": discount.DiscountType,
		"title":         discount.Title,
		"status":        discount.Status,
		"starts_at":     discount.StartsAt,
		"ends_at":       discount.EndsAt,
		"updated_at":    discount.UpdatedAt,
	}
	return compactMap(row)
}

func normalizedMarketingRow(shopDomain string, activity shopifyGraphQLMarketingActivity) map[string]any {
	row := map[string]any{
		"shop_domain":       shopDomain,
		"marketing_gid":     activity.ID,
		"marketing_id":      shopifyNumericGID(activity.ID),
		"title":             activity.Title,
		"status":            activity.Status,
		"updated_at":        activity.UpdatedAt,
		"marketing_channel": activity.MarketingChannel,
		"tactic":            activity.Tactic,
	}
	return compactMap(row)
}

func decodeGraphQLField[T any](response *shopifyGraphQLResponse, field string) (*T, error) {
	if raw, ok := response.rawData[field]; ok {
		var parsed T
		if err := json.Unmarshal(raw, &parsed); err != nil {
			return nil, fmt.Errorf("decode Shopify graphql %s field: %w", field, err)
		}
		return &parsed, nil
	}
	raw, ok := response.Data[field]
	if !ok {
		return nil, fmt.Errorf("Shopify graphql response missing field %q", field)
	}
	body, err := json.Marshal(raw)
	if err != nil {
		return nil, fmt.Errorf("marshal Shopify graphql %s field: %w", field, err)
	}
	var parsed T
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("decode Shopify graphql %s field: %w", field, err)
	}
	return &parsed, nil
}

func shopifyUpdatedSinceFilter(since time.Time) string {
	return fmt.Sprintf("updated_at:>='%s'", since.UTC().Format(time.RFC3339))
}

func shopifyUpdatedWindowFilter(since time.Time, through time.Time) string {
	return fmt.Sprintf(
		"updated_at:>='%s' updated_at:<='%s'",
		since.UTC().Format(time.RFC3339),
		through.UTC().Format(time.RFC3339),
	)
}

func shopifyUpdatedAtOrNow(value string) time.Time {
	if parsed := parseShopifyUpdatedAt(value); !parsed.IsZero() {
		return parsed
	}
	return time.Now().UTC()
}

func parseShopifyUpdatedAt(value string) time.Time {
	return firstParsedTime(value)
}

func inventoryQuantity(level shopifyGraphQLInventoryLevel, name string) int {
	for _, quantity := range level.Quantities {
		if strings.EqualFold(strings.TrimSpace(quantity.Name), strings.TrimSpace(name)) {
			return quantity.Quantity
		}
	}
	return 0
}

func discountUpdatedAt(updatedAt string, events shopifyDiscountEventConnection, startsAt string, endsAt string) string {
	_ = startsAt
	_ = endsAt
	latest := time.Time{}
	if parsed := parseShopifyUpdatedAt(updatedAt); !parsed.IsZero() {
		latest = parsed
	}
	for _, edge := range events.Edges {
		if parsed := parseShopifyUpdatedAt(edge.Node.CreatedAt); !parsed.IsZero() && parsed.After(latest) {
			latest = parsed
		}
	}
	if latest.IsZero() {
		return ""
	}
	return latest.UTC().Format(time.RFC3339)
}

func shopifyNumericGID(gid string) string {
	trimmed := strings.TrimSpace(gid)
	if trimmed == "" {
		return ""
	}
	last := strings.TrimSpace(trimmed[strings.LastIndex(trimmed, "/")+1:])
	if last == "" || strings.Contains(last, " ") {
		return ""
	}
	for _, ch := range last {
		if ch < '0' || ch > '9' {
			return ""
		}
	}
	return last
}

func shopifyGIDIdentityToken(gid string) string {
	if numeric := shopifyNumericGID(gid); numeric != "" {
		return numeric
	}
	return nexadapter.SafeIDToken(gid)
}
