package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	shopifyGraphQLDocument = "api/graphql.catalog.json"
	defaultShopSelection   = `
id
name
myshopifyDomain
primaryDomain {
  host
  url
}
`
	defaultOrdersSelection = `
edges {
  cursor
  node {
    id
    name
    createdAt
    updatedAt
  }
}
pageInfo {
  hasNextPage
  hasPreviousPage
  startCursor
  endCursor
}
`
	defaultOrderSelection = `
id
name
createdAt
updatedAt
lineItems(first: 25) {
  edges {
    cursor
    node {
      id
      name
      quantity
      sku
    }
  }
  pageInfo {
    hasNextPage
    endCursor
  }
}
`
	defaultProductsSelection = `
edges {
  cursor
  node {
    id
    title
    handle
    updatedAt
  }
}
pageInfo {
  hasNextPage
  hasPreviousPage
  startCursor
  endCursor
}
`
	defaultProductSelection = `
id
title
handle
updatedAt
variants(first: 25) {
  edges {
    node {
      id
      title
      sku
    }
  }
}
`
	defaultCustomersSelection = `
edges {
  cursor
  node {
    id
    displayName
    email
    updatedAt
  }
}
pageInfo {
  hasNextPage
  hasPreviousPage
  startCursor
  endCursor
}
`
	defaultCustomerSelection = `
id
displayName
email
updatedAt
numberOfOrders
`
)

type shopifyGraphQLResponse struct {
	Data       map[string]any            `json:"data"`
	Extensions map[string]any            `json:"extensions"`
	Errors     []shopifyGraphQLErrorItem `json:"errors"`
	rawData    map[string]json.RawMessage
}

func (response *shopifyGraphQLResponse) UnmarshalJSON(data []byte) error {
	var envelope struct {
		Data       map[string]json.RawMessage `json:"data"`
		Extensions map[string]any             `json:"extensions"`
		Errors     []shopifyGraphQLErrorItem  `json:"errors"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return err
	}

	decodedData := make(map[string]any, len(envelope.Data))
	rawData := make(map[string]json.RawMessage, len(envelope.Data))
	for field, raw := range envelope.Data {
		var decoded any
		if err := json.Unmarshal(raw, &decoded); err != nil {
			return fmt.Errorf("decode Shopify graphql data field %q: %w", field, err)
		}
		decodedData[field] = decoded
		rawData[field] = append(json.RawMessage(nil), raw...)
	}

	response.Data = decodedData
	response.Extensions = envelope.Extensions
	response.Errors = envelope.Errors
	response.rawData = rawData
	return nil
}

type shopifyGraphQLErrorItem struct {
	Message    string         `json:"message"`
	Path       []any          `json:"path"`
	Extensions map[string]any `json:"extensions"`
}

func shopifyMethodCatalog() *nexadapter.AdapterMethodCatalog {
	return &nexadapter.AdapterMethodCatalog{
		Source:    "graphql",
		Document:  "api/graphql.catalog.json",
		Namespace: platformID,
	}
}

func shopifyProjection() *nexadapter.AdapterProjection {
	return &nexadapter.AdapterProjection{
		Platform: platformID,
		Families: []nexadapter.AdapterProjectionFamily{
			{Name: "order", Description: "Canonical Shopify order records"},
			{Name: "line_item", Description: "Canonical Shopify line-item records"},
			{Name: "customer", Description: "Canonical Shopify customer records"},
			{Name: "product", Description: "Canonical Shopify product records"},
			{Name: "collection", Description: "Canonical Shopify collection records"},
			{Name: "inventory", Description: "Canonical Shopify inventory records"},
			{Name: "fulfillment", Description: "Canonical Shopify fulfillment records"},
			{Name: "discount", Description: "Canonical Shopify discount records"},
			{Name: "marketing", Description: "Canonical Shopify marketing records"},
		},
		Backfill: &nexadapter.AdapterProjectionSync{
			Supported: true,
			Strategy:  "poll",
			Cursor:    "created_at|updated_at|max(customer.updated_at,product.updated_at,collection.updated_at,inventory.updated_at,fulfillment.updated_at,discount.updated_at,marketing.updated_at)",
		},
		Monitor: &nexadapter.AdapterProjectionSync{
			Supported: true,
			Strategy:  "poll",
			Cursor:    "max(order.updated_at,customer.updated_at,product.updated_at,collection.updated_at,inventory.updated_at,fulfillment.updated_at,discount.updated_at,marketing.updated_at) with replay overlap",
		},
		Routing: &nexadapter.AdapterProjectionRouting{
			Space:            "shop",
			Container:        "family",
			Thread:           "order|customer|product|collection|inventory|fulfillment|discount|marketing",
			ThreadsSupported: true,
		},
		RecordIDs: &nexadapter.AdapterProjectionRecordIDs{
			Record:    "shop_domain + family provider identity + revision_hash",
			Container: "family",
			Thread:    "shop_domain + per-family provider identity",
		},
		Normalization: &nexadapter.AdapterProjectionNormalize{
			Content:     "row-shaped order, line_item, customer, product, collection, inventory, fulfillment, discount, and marketing records",
			Attachments: false,
		},
	}
}

func declaredShopifyMethods() map[string]nexadapter.DeclaredMethod[struct{}] {
	methods := graphQLBackboneMethods()
	for name, method := range graphQLQueryMethods() {
		methods[name] = method
	}
	methods["records.backfill.stage"] = nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
		Description: "Stage historical Shopify backfill into canonical JSONL chunk files for Nex bulk import.",
		Action:      "read",
		Params: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"since":     map[string]any{"type": "string"},
				"stage_dir": map[string]any{"type": "string"},
			},
			"required": []string{"since", "stage_dir"},
		},
		Response: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"version":       map[string]any{"type": "integer"},
				"format":        map[string]any{"type": "string"},
				"stage_dir":     map[string]any{"type": "string"},
				"manifest_path": map[string]any{"type": "string"},
				"totals": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"records": map[string]any{"type": "integer"},
					},
					"required": []string{"records"},
				},
				"chunks": map[string]any{
					"type": "array",
					"items": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"path":               map[string]any{"type": "string"},
							"records":            map[string]any{"type": "integer"},
							"first_record_id":    map[string]any{"type": "string"},
							"last_record_id":     map[string]any{"type": "string"},
							"first_timestamp_ms": map[string]any{"type": "integer"},
							"last_timestamp_ms":  map[string]any{"type": "integer"},
						},
						"required": []string{"path", "records"},
					},
				},
			},
			"required": []string{"version", "format", "stage_dir", "manifest_path", "totals", "chunks"},
		},
		ConnectionRequired: boolPtr(true),
		MutatesRemote:      boolPtr(false),
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return stageBackfill(ctx, req.Payload)
		},
	})
	return methods
}

func graphQLBackboneMethods() map[string]nexadapter.DeclaredMethod[struct{}] {
	return map[string]nexadapter.DeclaredMethod[struct{}]{
		"shopify.graphql.query":  graphqlGenericQueryMethod(),
		"shopify.graphql.mutate": graphqlGenericMutationMethod(),
	}
}

func graphQLQueryMethods() map[string]nexadapter.DeclaredMethod[struct{}] {
	return map[string]nexadapter.DeclaredMethod[struct{}]{
		"shopify.query.shop":      graphqlShopMethod(),
		"shopify.query.orders":    graphqlOrdersMethod(),
		"shopify.query.order":     graphqlOrderMethod(),
		"shopify.query.products":  graphqlProductsMethod(),
		"shopify.query.product":   graphqlProductMethod(),
		"shopify.query.customers": graphqlCustomersMethod(),
		"shopify.query.customer":  graphqlCustomerMethod(),
	}
}

func graphqlGenericQueryMethod() nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
		Description:        "Execute a Shopify Admin GraphQL query document.",
		Action:             "read",
		Params:             graphqlDocumentParamsSchema(),
		Response:           graphqlDocumentResponseSchema(),
		ConnectionRequired: boolPtr(true),
		MutatesRemote:      boolPtr(false),
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			document, variables, operationName, err := parseGraphQLDocumentPayload(req.Payload, "query")
			if err != nil {
				return nil, err
			}
			return executeShopifyGraphQLDocument(ctx, document, variables, operationName)
		},
	})
}

func graphqlGenericMutationMethod() nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
		Description:        "Execute a Shopify Admin GraphQL mutation document.",
		Action:             "write",
		Params:             graphqlDocumentParamsSchema(),
		Response:           graphqlDocumentResponseSchema(),
		ConnectionRequired: boolPtr(true),
		MutatesRemote:      boolPtr(true),
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			document, variables, operationName, err := parseGraphQLDocumentPayload(req.Payload, "mutation")
			if err != nil {
				return nil, err
			}
			return executeShopifyGraphQLDocument(ctx, document, variables, operationName)
		},
	})
}

func graphqlShopMethod() nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
		Description:        "Read Shopify shop details from the Admin GraphQL shop query field.",
		Action:             "read",
		Params:             selectionOnlyParamsSchema(),
		Response:           graphqlMethodResponseSchema(),
		ConnectionRequired: boolPtr(true),
		MutatesRemote:      boolPtr(false),
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return executeShopifyGraphQLField(ctx, "shop", graphqlQuery("shop", "", "", defaultShopSelection, req.Payload, nil), nil)
		},
	})
}

func graphqlOrdersMethod() nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
		Description:        "Read Shopify orders from the Admin GraphQL orders query field.",
		Action:             "read",
		Params:             connectionQueryParamsSchema("OrderSortKeys", true),
		Response:           graphqlMethodResponseSchema(),
		ConnectionRequired: boolPtr(true),
		MutatesRemote:      boolPtr(false),
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			variableDefs, assignments, variables := collectConnectionQueryComponents(req.Payload, "OrderSortKeys", true)
			return executeShopifyGraphQLField(
				ctx,
				"orders",
				graphqlQuery(
					"orders",
					variableDefs,
					assignments,
					defaultOrdersSelection,
					req.Payload,
					variables,
				),
				variables,
			)
		},
	})
}

func graphqlOrderMethod() nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
		Description:        "Read one Shopify order from the Admin GraphQL order query field.",
		Action:             "read",
		Params:             nodeParamsSchema(),
		Response:           graphqlMethodResponseSchema(),
		ConnectionRequired: boolPtr(true),
		MutatesRemote:      boolPtr(false),
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			id, err := requirePayloadString(req.Payload, "id")
			if err != nil {
				return nil, err
			}
			return executeShopifyGraphQLField(
				ctx,
				"order",
				graphqlQuery("order", "$id: ID!", "id: $id", defaultOrderSelection, req.Payload, map[string]any{"id": id}),
				map[string]any{"id": id},
			)
		},
	})
}

func graphqlProductsMethod() nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
		Description:        "Read Shopify products from the Admin GraphQL products query field.",
		Action:             "read",
		Params:             connectionQueryParamsSchema("ProductSortKeys", true),
		Response:           graphqlMethodResponseSchema(),
		ConnectionRequired: boolPtr(true),
		MutatesRemote:      boolPtr(false),
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			variableDefs, assignments, variables := collectConnectionQueryComponents(req.Payload, "ProductSortKeys", true)
			return executeShopifyGraphQLField(
				ctx,
				"products",
				graphqlQuery(
					"products",
					variableDefs,
					assignments,
					defaultProductsSelection,
					req.Payload,
					variables,
				),
				variables,
			)
		},
	})
}

func graphqlProductMethod() nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
		Description:        "Read one Shopify product from the Admin GraphQL product query field.",
		Action:             "read",
		Params:             nodeParamsSchema(),
		Response:           graphqlMethodResponseSchema(),
		ConnectionRequired: boolPtr(true),
		MutatesRemote:      boolPtr(false),
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			id, err := requirePayloadString(req.Payload, "id")
			if err != nil {
				return nil, err
			}
			return executeShopifyGraphQLField(
				ctx,
				"product",
				graphqlQuery("product", "$id: ID!", "id: $id", defaultProductSelection, req.Payload, map[string]any{"id": id}),
				map[string]any{"id": id},
			)
		},
	})
}

func graphqlCustomersMethod() nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
		Description:        "Read Shopify customers from the Admin GraphQL customers query field.",
		Action:             "read",
		Params:             connectionQueryParamsSchema("CustomerSortKeys", false),
		Response:           graphqlMethodResponseSchema(),
		ConnectionRequired: boolPtr(true),
		MutatesRemote:      boolPtr(false),
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			variableDefs, assignments, variables := collectConnectionQueryComponents(req.Payload, "CustomerSortKeys", false)
			return executeShopifyGraphQLField(
				ctx,
				"customers",
				graphqlQuery(
					"customers",
					variableDefs,
					assignments,
					defaultCustomersSelection,
					req.Payload,
					variables,
				),
				variables,
			)
		},
	})
}

func graphqlCustomerMethod() nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
		Description:        "Read one Shopify customer from the Admin GraphQL customer query field.",
		Action:             "read",
		Params:             nodeParamsSchema(),
		Response:           graphqlMethodResponseSchema(),
		ConnectionRequired: boolPtr(true),
		MutatesRemote:      boolPtr(false),
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			id, err := requirePayloadString(req.Payload, "id")
			if err != nil {
				return nil, err
			}
			return executeShopifyGraphQLField(
				ctx,
				"customer",
				graphqlQuery("customer", "$id: ID!", "id: $id", defaultCustomerSelection, req.Payload, map[string]any{"id": id}),
				map[string]any{"id": id},
			)
		},
	})
}

func selectionOnlyParamsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"selection": map[string]any{"type": "string"},
		},
	}
}

func nodeParamsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"id":        map[string]any{"type": "string"},
			"selection": map[string]any{"type": "string"},
		},
		"required": []string{"id"},
	}
}

func connectionQueryParamsSchema(sortEnum string, includeSavedSearch bool) map[string]any {
	properties := map[string]any{
		"first":     map[string]any{"type": "integer"},
		"after":     map[string]any{"type": "string"},
		"last":      map[string]any{"type": "integer"},
		"before":    map[string]any{"type": "string"},
		"reverse":   map[string]any{"type": "boolean"},
		"sortKey":   map[string]any{"type": "string", "description": sortEnum},
		"query":     map[string]any{"type": "string"},
		"selection": map[string]any{"type": "string"},
	}
	if includeSavedSearch {
		properties["savedSearchId"] = map[string]any{"type": "string"}
	}
	return map[string]any{
		"type":       "object",
		"properties": properties,
	}
}

func graphqlMethodResponseSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"field":      map[string]any{"type": "string"},
			"data":       map[string]any{"type": "object", "additionalProperties": true},
			"extensions": map[string]any{"type": "object", "additionalProperties": true},
		},
		"required": []string{"field", "data"},
	}
}

func graphqlDocumentParamsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"document": map[string]any{"type": "string"},
			"variables": map[string]any{
				"type":                 "object",
				"additionalProperties": true,
			},
			"operationName": map[string]any{"type": "string"},
		},
		"required": []string{"document"},
	}
}

func graphqlDocumentResponseSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"data": map[string]any{
				"type":                 "object",
				"additionalProperties": true,
			},
			"extensions": map[string]any{
				"type":                 "object",
				"additionalProperties": true,
			},
		},
		"required": []string{"data"},
	}
}

func graphqlQuery(field string, variableDefs string, assignments string, defaultSelection string, payload map[string]any, variables map[string]any) string {
	selection := defaultSelection
	if payload != nil {
		if raw, ok := payload["selection"].(string); ok && strings.TrimSpace(raw) != "" {
			selection = raw
		}
	}
	selection = strings.TrimSpace(selection)
	if strings.HasPrefix(selection, "{") && strings.HasSuffix(selection, "}") {
		selection = strings.TrimSpace(selection[1 : len(selection)-1])
	}
	selection = strings.TrimSpace(selection)
	operationName := "Shopify" + strings.ToUpper(field[:1]) + field[1:]
	filteredVariableDefs := filterVariableDefinitions(variableDefs, variables)
	if filteredVariableDefs != "" {
		if assignments != "" {
			return fmt.Sprintf("query %s(%s) { %s(%s) { %s } }", operationName, filteredVariableDefs, field, assignments, selection)
		}
		return fmt.Sprintf("query %s(%s) { %s { %s } }", operationName, filteredVariableDefs, field, selection)
	}
	return fmt.Sprintf("query %s { %s { %s } }", operationName, field, selection)
}

func filterVariableDefinitions(variableDefs string, variables map[string]any) string {
	trimmed := strings.TrimSpace(variableDefs)
	if trimmed == "" {
		return ""
	}
	if len(variables) == 0 {
		return ""
	}
	parts := strings.Split(trimmed, ",")
	filtered := make([]string, 0, len(parts))
	for _, part := range parts {
		candidate := strings.TrimSpace(part)
		if candidate == "" || !strings.HasPrefix(candidate, "$") {
			continue
		}
		namePortion := candidate[1:]
		colonIndex := strings.Index(namePortion, ":")
		if colonIndex <= 0 {
			continue
		}
		name := strings.TrimSpace(namePortion[:colonIndex])
		if _, ok := variables[name]; ok {
			filtered = append(filtered, candidate)
		}
	}
	return strings.Join(filtered, ", ")
}

func collectConnectionQueryComponents(payload map[string]any, sortEnum string, includeSavedSearch bool) (string, string, map[string]any) {
	variables := map[string]any{}
	variableDefs := make([]string, 0, 8)
	assignments := make([]string, 0, 8)
	if payload == nil {
		return "", "", variables
	}
	add := func(key string, typeName string) {
		if value, ok := payload[key]; ok && value != nil {
			variables[key] = value
			variableDefs = append(variableDefs, fmt.Sprintf("$%s: %s", key, typeName))
			assignments = append(assignments, fmt.Sprintf("%s: $%s", key, key))
		}
	}
	add("first", "Int")
	add("after", "String")
	add("last", "Int")
	add("before", "String")
	add("reverse", "Boolean")
	add("sortKey", sortEnum)
	add("query", "String")
	if includeSavedSearch {
		add("savedSearchId", "ID")
	}
	return strings.Join(variableDefs, ", "), strings.Join(assignments, ", "), variables
}

func requirePayloadString(payload map[string]any, key string) (string, error) {
	if payload == nil {
		return "", fmt.Errorf("missing payload.%s", key)
	}
	value, ok := payload[key].(string)
	if !ok || strings.TrimSpace(value) == "" {
		return "", fmt.Errorf("missing payload.%s", key)
	}
	return strings.TrimSpace(value), nil
}

func parseGraphQLDocumentPayload(payload map[string]any, operationType string) (string, map[string]any, string, error) {
	document, err := requirePayloadString(payload, "document")
	if err != nil {
		return "", nil, "", err
	}
	trimmed := strings.TrimSpace(document)
	if trimmed == "" {
		return "", nil, "", fmt.Errorf("missing payload.document")
	}
	if operationType == "query" {
		if normalized := normalizeGraphQLDocumentPrefix(trimmed); normalized != "" && normalized != "query" {
			return "", nil, "", fmt.Errorf("payload.document must be a GraphQL query document")
		}
	}
	if operationType == "mutation" {
		if normalizeGraphQLDocumentPrefix(trimmed) != "mutation" {
			return "", nil, "", fmt.Errorf("payload.document must be a GraphQL mutation document")
		}
	}

	variables := map[string]any{}
	if payload != nil {
		if rawVariables, ok := payload["variables"]; ok && rawVariables != nil {
			typed, ok := rawVariables.(map[string]any)
			if !ok {
				return "", nil, "", fmt.Errorf("payload.variables must be an object")
			}
			variables = typed
		}
	}

	operationName := ""
	if payload != nil {
		if rawName, ok := payload["operationName"]; ok && rawName != nil {
			name, ok := rawName.(string)
			if !ok || strings.TrimSpace(name) == "" {
				return "", nil, "", fmt.Errorf("payload.operationName must be a non-empty string when provided")
			}
			operationName = strings.TrimSpace(name)
		}
	}

	return trimmed, variables, operationName, nil
}

func normalizeGraphQLDocumentPrefix(document string) string {
	trimmed := strings.TrimSpace(document)
	for strings.HasPrefix(trimmed, "#") {
		newline := strings.Index(trimmed, "\n")
		if newline < 0 {
			return ""
		}
		trimmed = strings.TrimSpace(trimmed[newline+1:])
	}
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(trimmed, "{") {
		return "query"
	}
	lower := strings.ToLower(trimmed)
	for _, prefix := range []string{"query", "mutation", "subscription"} {
		if strings.HasPrefix(lower, prefix) {
			return prefix
		}
	}
	return ""
}

func executeShopifyGraphQLField(
	ctx nexadapter.AdapterContext[struct{}],
	field string,
	query string,
	variables map[string]any,
) (map[string]any, error) {
	state, err := loadShopifyState(ctx)
	if err != nil {
		return nil, err
	}
	response, err := executeShopifyGraphQL(ctx.Context, state, query, variables, "")
	if err != nil {
		return nil, err
	}
	result := map[string]any{
		"field": field,
		"data":  response.Data[field],
	}
	if len(response.Extensions) > 0 {
		result["extensions"] = response.Extensions
	}
	return result, nil
}

func executeShopifyGraphQLDocument(
	ctx nexadapter.AdapterContext[struct{}],
	document string,
	variables map[string]any,
	operationName string,
) (map[string]any, error) {
	state, err := loadShopifyState(ctx)
	if err != nil {
		return nil, err
	}
	response, err := executeShopifyGraphQL(ctx.Context, state, document, variables, operationName)
	if err != nil {
		return nil, err
	}
	result := map[string]any{
		"data": response.Data,
	}
	if len(response.Extensions) > 0 {
		result["extensions"] = response.Extensions
	}
	return result, nil
}

func executeShopifyGraphQL(
	ctx context.Context,
	state *shopifyState,
	query string,
	variables map[string]any,
	operationName string,
) (*shopifyGraphQLResponse, error) {
	accessToken, err := fetchShopifyAccessToken(ctx, state)
	if err != nil {
		return nil, err
	}

	requestBody, err := json.Marshal(map[string]any{
		"query":         query,
		"variables":     variables,
		"operationName": operationName,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal Shopify graphql request: %w", err)
	}

	endpoint := fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion) + "/graphql.json"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(requestBody)))
	if err != nil {
		return nil, fmt.Errorf("build Shopify graphql request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Shopify-Access-Token", accessToken)

	res, err := shopifyHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Shopify graphql request failed: %w", err)
	}
	defer res.Body.Close()

	bodyBytes, readErr := io.ReadAll(io.LimitReader(res.Body, maxResponseBodyBytes))
	if readErr != nil {
		return nil, fmt.Errorf("read Shopify graphql response: %w", readErr)
	}
	bodyText := strings.TrimSpace(string(bodyBytes))
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("Shopify graphql request failed (%d): %s", res.StatusCode, bodyText)
	}

	var payload shopifyGraphQLResponse
	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		return nil, fmt.Errorf("parse Shopify graphql response: %w", err)
	}
	if len(payload.Errors) > 0 {
		return nil, fmt.Errorf("Shopify graphql query failed: %s", strings.TrimSpace(payload.Errors[0].Message))
	}
	return &payload, nil
}
