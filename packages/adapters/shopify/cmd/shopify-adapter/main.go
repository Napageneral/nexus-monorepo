package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName                = "shopify-adapter"
	adapterVersion             = "0.1.2"
	platformID                 = "shopify"
	defaultAPIVersion          = "2026-01"
	defaultHTTPTimeout         = 30 * time.Second
	defaultMonitorInterval     = 1 * time.Minute
	defaultMonitorErrorBackoff = 5 * time.Minute
	defaultTokenTTL            = 55 * time.Minute
	orderReplayWindow          = 72 * time.Hour
	maxOrdersPages             = 200
	maxResponseBodyBytes       = 8 << 20
	maxOAuthResponseBytes      = 1 << 20
	defaultShopifyBaseURL      = "https://%s/admin/api/%s"
	stageChunkSize             = 1000
)

var (
	shopifyHTTPClient = &http.Client{Timeout: defaultHTTPTimeout}
	tokenCache        *shopifyTokenCache
)

type shopifyState struct {
	ConnectionID  string
	CredentialRef string
	ShopDomain    string
	ClientID      string
	ClientSecret  string
	WebhookSecret string
	APIVersion    string
}

type shopifyTokenCache struct {
	ShopDomain   string
	ClientID     string
	ClientSecret string
	AccessToken  string
	ExpiresAt    time.Time
}

type shopifyShopResponse struct {
	Shop shopifyShop `json:"shop"`
}

type shopifyShop struct {
	ID              int64  `json:"id"`
	Name            string `json:"name"`
	Email           string `json:"email"`
	Domain          string `json:"domain"`
	MyshopifyDomain string `json:"myshopify_domain"`
	PrimaryDomain   struct {
		Host string `json:"host"`
	} `json:"primary_domain"`
}

type shopifyOrdersResponse struct {
	Orders []shopifyOrder `json:"orders"`
}

type shopifyOrderPage struct {
	Orders        []shopifyOrder
	RequestCursor string
	NextCursor    string
	Complete      bool
}

type shopifyOrder struct {
	ID                 int64                  `json:"id"`
	OrderNumber        int64                  `json:"order_number"`
	Name               string                 `json:"name"`
	CreatedAt          string                 `json:"created_at"`
	UpdatedAt          string                 `json:"updated_at"`
	ProcessedAt        string                 `json:"processed_at"`
	Currency           string                 `json:"currency"`
	TotalPrice         string                 `json:"total_price"`
	SubtotalPrice      string                 `json:"subtotal_price"`
	FinancialStatus    string                 `json:"financial_status"`
	FulfillmentStatus  string                 `json:"fulfillment_status"`
	CancelledAt        string                 `json:"cancelled_at"`
	CartToken          string                 `json:"cart_token"`
	CheckoutToken      string                 `json:"checkout_token"`
	SourceName         string                 `json:"source_name"`
	ReferringSite      string                 `json:"referring_site"`
	LandingSite        string                 `json:"landing_site"`
	Email              string                 `json:"email"`
	Phone              string                 `json:"phone"`
	Tags               string                 `json:"tags"`
	NoteAttributes     []shopifyNoteAttribute `json:"note_attributes"`
	Customer           *shopifyCustomer       `json:"customer"`
	BillingAddress     *shopifyAddress        `json:"billing_address"`
	ShippingAddress    *shopifyAddress        `json:"shipping_address"`
	LineItems          []shopifyLineItem      `json:"line_items"`
	rawProviderJSON    json.RawMessage
	rawProviderPayload map[string]any
}

type shopifyCustomer struct {
	ID int64 `json:"id"`
}

type shopifyAddress struct {
	ID           int64  `json:"id"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	Name         string `json:"name"`
	Company      string `json:"company"`
	Address1     string `json:"address1"`
	Address2     string `json:"address2"`
	City         string `json:"city"`
	Province     string `json:"province"`
	ProvinceCode string `json:"province_code"`
	Country      string `json:"country"`
	CountryCode  string `json:"country_code"`
	Zip          string `json:"zip"`
	Phone        string `json:"phone"`
}

type shopifyNoteAttribute struct {
	Name  string `json:"name"`
	Key   string `json:"key"`
	Value string `json:"value"`
}

type shopifyLineItem struct {
	ID                 int64  `json:"id"`
	ProductID          int64  `json:"product_id"`
	VariantID          int64  `json:"variant_id"`
	Title              string `json:"title"`
	VariantTitle       string `json:"variant_title"`
	SKU                string `json:"sku"`
	Vendor             string `json:"vendor"`
	Quantity           int    `json:"quantity"`
	Price              string `json:"price"`
	FulfillmentStatus  string `json:"fulfillment_status"`
	rawProviderJSON    json.RawMessage
	rawProviderPayload map[string]any
}

func (order *shopifyOrder) UnmarshalJSON(data []byte) error {
	type decodedShopifyOrder shopifyOrder
	var decoded decodedShopifyOrder
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	raw, err := decodeProviderJSONObject(data)
	if err != nil {
		return err
	}
	*order = shopifyOrder(decoded)
	order.rawProviderJSON = append(json.RawMessage(nil), data...)
	order.rawProviderPayload = raw
	return nil
}

func (lineItem *shopifyLineItem) UnmarshalJSON(data []byte) error {
	type decodedShopifyLineItem shopifyLineItem
	var decoded decodedShopifyLineItem
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	raw, err := decodeProviderJSONObject(data)
	if err != nil {
		return err
	}
	*lineItem = shopifyLineItem(decoded)
	lineItem.rawProviderJSON = append(json.RawMessage(nil), data...)
	lineItem.rawProviderPayload = raw
	return nil
}

func decodeProviderJSONObject(data []byte) (map[string]any, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var raw map[string]any
	if err := decoder.Decode(&raw); err != nil {
		return nil, err
	}
	if raw == nil {
		return nil, errors.New("Shopify provider object must be a JSON object")
	}
	return raw, nil
}

func providerRevisionInput(providerObject map[string]any, typedFallback any) any {
	if providerObject != nil {
		return providerObject
	}
	return typedFallback
}

func providerPayloadEnvelope(providerJSON json.RawMessage, providerObject map[string]any, typedFallback any) map[string]any {
	object := providerRevisionInput(providerObject, mustJSONObject(typedFallback))
	raw := append(json.RawMessage(nil), providerJSON...)
	if len(raw) == 0 {
		encoded, err := json.Marshal(object)
		if err != nil {
			encoded = []byte("{}")
		}
		raw = encoded
	}
	digest := sha256.Sum256(raw)
	return map[string]any{
		"provider_object_json":   string(raw),
		"provider_object_sha256": hex.EncodeToString(digest[:]),
	}
}

type shopifySourceRequest struct {
	APIBaseURL string
	Path       string
	Request    map[string]any
}

type shopifySyncMode string

const (
	shopifySyncModeBackfill shopifySyncMode = "backfill"
	shopifySyncModeMonitor  shopifySyncMode = "monitor"
)

type stagedBackfillChunk struct {
	Path             string `json:"path"`
	Records          int    `json:"records"`
	FirstRecordID    string `json:"first_record_id,omitempty"`
	LastRecordID     string `json:"last_record_id,omitempty"`
	FirstTimestampMs *int64 `json:"first_timestamp_ms,omitempty"`
	LastTimestampMs  *int64 `json:"last_timestamp_ms,omitempty"`
}

type stagedBackfillManifest struct {
	Version      int                   `json:"version"`
	Format       string                `json:"format"`
	StageDir     string                `json:"stage_dir"`
	ManifestPath string                `json:"manifest_path"`
	Chunks       []stagedBackfillChunk `json:"chunks"`
	Totals       struct {
		Records int `json:"records"`
	} `json:"totals"`
}

type stagedChunkWriter struct {
	stageDir     string
	chunkSize    int
	chunkIndex   int
	currentFile  *os.File
	currentEnc   *json.Encoder
	currentChunk *stagedBackfillChunk
	manifest     stagedBackfillManifest
}

func main() {
	nexadapter.Run(nexadapter.DefineAdapter(adapterConfig()))
}

func adapterConfig() nexadapter.DefineAdapterConfig[struct{}] {
	return nexadapter.DefineAdapterConfig[struct{}]{
		Platform:          platformID,
		Name:              adapterName,
		Version:           adapterVersion,
		MultiAccount:      true,
		CredentialService: platformID,
		MethodCatalog:     shopifyMethodCatalog(),
		Projection:        shopifyProjection(),
		Connection: nexadapter.ConnectionHandlers[struct{}]{
			Connections: connections,
			Health:      health,
		},
		Ingest: nexadapter.IngestHandlers[struct{}]{
			Monitor: func(ctx nexadapter.AdapterContext[struct{}], emit nexadapter.EmitFunc) error {
				return monitor(ctx, emit)
			},
			Backfill: func(ctx nexadapter.AdapterContext[struct{}], since time.Time, emit nexadapter.EmitFunc) error {
				return backfill(ctx, since, emit)
			},
		},
		Methods: declaredShopifyMethods(),
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					ID:      "shopify_direct_credentials",
					Type:    "api_key",
					Label:   "Enter Shopify Credentials",
					Icon:    "key",
					Service: platformID,
					Fields: []nexadapter.AdapterAuthField{
						{
							Name:        "shop_domain",
							Label:       "Shop Domain",
							Type:        "text",
							Required:    true,
							Placeholder: "moonsleepco.myshopify.com",
						},
						{
							Name:        "client_id",
							Label:       "Client ID",
							Type:        "text",
							Required:    true,
							Placeholder: "shopify_client_id",
						},
						{
							Name:        "client_secret",
							Label:       "Client Secret",
							Type:        "secret",
							Required:    true,
							Placeholder: "shopify_client_secret",
						},
						{
							Name:        "webhook_secret",
							Label:       "Webhook Secret",
							Type:        "secret",
							Required:    false,
							Placeholder: "shopify_webhook_secret",
						},
						{
							Name:        "api_version",
							Label:       "API Version",
							Type:        "text",
							Required:    false,
							Placeholder: defaultAPIVersion,
						},
					},
				},
			},
			SetupGuide: "Provide Shopify shop_domain, client_id, and client_secret for the client-credentials Admin API flow. webhook_secret is optional and only needed for future webhook-assisted refetch support.",
		},
		Capabilities: nexadapter.ChannelCapabilities{
			TextLimit:          20000,
			SupportsMarkdown:   true,
			MarkdownFlavor:     "standard",
			SupportsTables:     false,
			SupportsCodeBlocks: false,
			SupportsEmbeds:     false,
			SupportsThreads:    false,
			SupportsReactions:  false,
			SupportsPolls:      false,
			SupportsButtons:    false,
			SupportsEdit:       false,
			SupportsDelete:     false,
			SupportsMedia:      false,
			SupportsVoiceNotes: false,
		},
	}
}

func connections(ctx nexadapter.AdapterContext[struct{}]) ([]nexadapter.AdapterConnectionIdentity, error) {
	state, err := loadShopifyState(ctx)
	if err != nil {
		return []nexadapter.AdapterConnectionIdentity{}, nil
	}

	status := "error"
	if state.ShopDomain != "" && state.ClientID != "" && state.ClientSecret != "" {
		status = "ready"
	}

	return []nexadapter.AdapterConnectionIdentity{
		{
			ID:            state.ConnectionID,
			DisplayName:   fmt.Sprintf("%s (%s)", state.ConnectionID, state.ShopDomain),
			Account:       state.ShopDomain,
			CredentialRef: state.CredentialRef,
			Status:        status,
		},
	}, nil
}

func health(ctx nexadapter.AdapterContext[struct{}]) (*nexadapter.AdapterHealth, error) {
	state, err := loadShopifyState(ctx)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: ctx.ConnectionID,
			Error:        err.Error(),
		}, nil
	}

	details := map[string]any{
		"credential_ref":     state.CredentialRef,
		"credential_service": platformID,
		"shop_domain":        state.ShopDomain,
		"api_version":        state.APIVersion,
	}

	if state.ShopDomain == "" {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: state.ConnectionID,
			Account:      state.ShopDomain,
			Error:        "missing shop_domain",
			Details:      details,
		}, nil
	}
	if state.ClientID == "" || state.ClientSecret == "" {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: state.ConnectionID,
			Account:      state.ShopDomain,
			Error:        "missing Shopify client credentials",
			Details:      details,
		}, nil
	}

	shop, err := fetchShopInfo(ctx.Context, state)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: state.ConnectionID,
			Account:      state.ShopDomain,
			Error:        err.Error(),
			Details:      details,
		}, nil
	}

	shopID := strconv.FormatInt(shop.ID, 10)
	details["shop_id"] = shopID
	details["shop_name"] = shop.Name
	if strings.TrimSpace(shop.Email) != "" {
		details["shop_email"] = shop.Email
	}
	if strings.TrimSpace(shop.Domain) != "" {
		details["shop_domain_reported"] = shop.Domain
	}
	if strings.TrimSpace(shop.MyshopifyDomain) != "" {
		details["myshopify_domain"] = shop.MyshopifyDomain
	}
	if strings.TrimSpace(shop.PrimaryDomain.Host) != "" {
		details["primary_domain"] = shop.PrimaryDomain.Host
	}

	return &nexadapter.AdapterHealth{
		Connected:    true,
		ConnectionID: state.ConnectionID,
		Account:      state.ShopDomain,
		LastEventAt:  time.Now().UnixMilli(),
		Details:      details,
	}, nil
}

func backfill(ctx nexadapter.AdapterContext[struct{}], since time.Time, emit nexadapter.EmitFunc) error {
	state, err := loadShopifyState(ctx)
	if err != nil {
		return err
	}
	records, _, err := fetchShopifyRecords(ctx.Context, state, since.UTC(), shopifySyncModeBackfill)
	if err != nil {
		return err
	}
	for _, record := range records {
		emit(record)
	}
	return nil
}

func monitor(ctx nexadapter.AdapterContext[struct{}], emit nexadapter.EmitFunc) error {
	state, err := loadShopifyState(ctx)
	if err != nil {
		return err
	}

	poll := nexadapter.PollMonitor(nexadapter.PollConfig[nexadapter.AdapterInboundRecord]{
		Interval:      defaultMonitorInterval,
		ErrorBackoff:  defaultMonitorErrorBackoff,
		InitialCursor: time.Now().UTC().Add(-orderReplayWindow),
		Fetch: func(fetchCtx context.Context, since time.Time) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
			return fetchShopifyRecords(fetchCtx, state, since.UTC(), shopifySyncModeMonitor)
		},
		MaxConsecutiveErrors: 5,
	})

	return poll(ctx.Context, ctx.ConnectionID, emit)
}

func boolPtr(value bool) *bool {
	return &value
}

func loadShopifyState(ctx nexadapter.AdapterContext[struct{}]) (*shopifyState, error) {
	if ctx.Runtime == nil {
		runtimeCtx, err := nexadapter.LoadRuntimeContextFromEnv()
		if err == nil {
			ctx.Runtime = runtimeCtx
			if strings.TrimSpace(ctx.ConnectionID) == "" {
				ctx.ConnectionID = runtimeCtx.ConnectionID
			}
		}
	}

	connectionID, err := nexadapter.RequireConnection(ctx.ConnectionID)
	if err != nil {
		return nil, err
	}
	if ctx.Runtime == nil || ctx.Runtime.Credential == nil {
		return nil, errors.New("missing Shopify runtime credential")
	}

	credential := ctx.Runtime.Credential
	fields := credential.Fields

	state := &shopifyState{
		ConnectionID:  connectionID,
		CredentialRef: strings.TrimSpace(credential.Ref),
		ShopDomain: strings.TrimSpace(nexadapter.FirstNonBlank(
			nexadapter.FieldValue(fields, "shop_domain"),
			nexadapter.FieldValue(fields, "shopDomain"),
			strings.TrimSpace(credential.Account),
			os.Getenv("NEXUS_SHOPIFY_SHOP_DOMAIN"),
			os.Getenv("SHOPIFY_SHOP_DOMAIN"),
		)),
		ClientID: strings.TrimSpace(nexadapter.FirstNonBlank(
			nexadapter.FieldValue(fields, "client_id"),
			nexadapter.FieldValue(fields, "clientId"),
			os.Getenv("NEXUS_SHOPIFY_CLIENT_ID"),
			os.Getenv("SHOPIFY_CLIENT_ID"),
		)),
		ClientSecret: strings.TrimSpace(nexadapter.FirstNonBlank(
			nexadapter.FieldValue(fields, "client_secret"),
			nexadapter.FieldValue(fields, "clientSecret"),
			credential.Value,
			os.Getenv("NEXUS_SHOPIFY_CLIENT_SECRET"),
			os.Getenv("SHOPIFY_CLIENT_SECRET"),
		)),
		WebhookSecret: strings.TrimSpace(nexadapter.FirstNonBlank(
			nexadapter.FieldValue(fields, "webhook_secret"),
			nexadapter.FieldValue(fields, "webhookSecret"),
			os.Getenv("NEXUS_SHOPIFY_WEBHOOK_SECRET"),
			os.Getenv("SHOPIFY_WEBHOOK_SECRET"),
		)),
		APIVersion: strings.TrimSpace(nexadapter.FirstNonBlank(
			nexadapter.FieldValue(fields, "api_version"),
			os.Getenv("NEXUS_SHOPIFY_API_VERSION"),
			os.Getenv("SHOPIFY_API_VERSION"),
			defaultAPIVersion,
		)),
	}

	if state.CredentialRef == "" {
		state.CredentialRef = platformID + "/" + connectionID
	}
	if state.APIVersion == "" {
		state.APIVersion = defaultAPIVersion
	}
	return state, nil
}

func fetchShopifyRecords(ctx context.Context, state *shopifyState, since time.Time, mode shopifySyncMode) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
	requestSince := since.UTC()
	if requestSince.IsZero() {
		requestSince = time.Now().UTC()
	}
	asOf := time.Now().UTC()
	if mode == shopifySyncModeMonitor {
		requestSince = minTime(requestSince, asOf.Add(-orderReplayWindow))
	}

	useUpdatedAt := mode == shopifySyncModeMonitor
	orders, sourceRequest, latestUpdatedAt, err := fetchOrdersSince(ctx, state, requestSince, useUpdatedAt)
	if err != nil {
		return nil, time.Time{}, err
	}
	customers, customerSourceRequest, customerLatestUpdatedAt, err := fetchCustomersSince(ctx, state, requestSince, mode)
	if err != nil {
		return nil, time.Time{}, err
	}
	products, productSourceRequest, productLatestUpdatedAt, err := fetchProductsSince(ctx, state, requestSince, mode)
	if err != nil {
		return nil, time.Time{}, err
	}
	collections, collectionSourceRequest, collectionLatestUpdatedAt, err := fetchCollectionsSince(ctx, state, requestSince, mode)
	if err != nil {
		return nil, time.Time{}, err
	}
	inventoryItems, inventorySourceRequest, inventoryLatestUpdatedAt, err := fetchInventoryItemsSince(ctx, state, requestSince, mode)
	if err != nil {
		return nil, time.Time{}, err
	}
	fulfillmentOrders, fulfillmentSourceRequest, fulfillmentLatestUpdatedAt, err := fetchFulfillmentOrdersSince(ctx, state, requestSince)
	if err != nil {
		return nil, time.Time{}, err
	}
	discounts, discountSourceRequest, discountLatestUpdatedAt, err := fetchDiscountsSince(ctx, state, requestSince)
	if err != nil {
		return nil, time.Time{}, err
	}
	marketingActivities, marketingSourceRequest, marketingLatestUpdatedAt, err := fetchMarketingActivitiesSince(ctx, state, requestSince)
	if err != nil {
		return nil, time.Time{}, err
	}

	records := make([]nexadapter.AdapterInboundRecord, 0, len(orders)*2+len(customers)+len(products)+len(collections)+len(fulfillmentOrders)+len(discounts)+len(marketingActivities))
	for _, order := range orders {
		orderRecord := buildOrderRecord(state, order, sourceRequest)
		if orderRecord.Operation != "" {
			records = append(records, orderRecord)
		}
		for _, lineItem := range order.LineItems {
			lineItemRecord := buildLineItemRecord(state, order, lineItem, sourceRequest)
			if lineItemRecord.Operation != "" {
				records = append(records, lineItemRecord)
			}
		}
	}
	for _, customer := range customers {
		customerRecord := buildCustomerRecord(state, customer, customerSourceRequest)
		if customerRecord.Operation != "" {
			records = append(records, customerRecord)
		}
	}
	for _, product := range products {
		productRecord := buildProductRecord(state, product, productSourceRequest)
		if productRecord.Operation != "" {
			records = append(records, productRecord)
		}
	}
	for _, collection := range collections {
		collectionRecord := buildCollectionRecord(state, collection, collectionSourceRequest)
		if collectionRecord.Operation != "" {
			records = append(records, collectionRecord)
		}
	}
	for _, item := range inventoryItems {
		records = append(records, buildInventoryRecords(state, item, inventorySourceRequest)...)
	}
	for _, fulfillment := range fulfillmentOrders {
		fulfillmentRecord := buildFulfillmentRecord(state, fulfillment, fulfillmentSourceRequest)
		if fulfillmentRecord.Operation != "" {
			records = append(records, fulfillmentRecord)
		}
	}
	for _, discount := range discounts {
		discountRecord := buildDiscountRecord(state, discount, discountSourceRequest)
		if discountRecord.Operation != "" {
			records = append(records, discountRecord)
		}
	}
	for _, activity := range marketingActivities {
		marketingRecord := buildMarketingRecord(state, activity, marketingSourceRequest)
		if marketingRecord.Operation != "" {
			records = append(records, marketingRecord)
		}
	}

	newCursor := latestUpdatedAt
	if customerLatestUpdatedAt.After(newCursor) {
		newCursor = customerLatestUpdatedAt
	}
	if productLatestUpdatedAt.After(newCursor) {
		newCursor = productLatestUpdatedAt
	}
	if collectionLatestUpdatedAt.After(newCursor) {
		newCursor = collectionLatestUpdatedAt
	}
	if inventoryLatestUpdatedAt.After(newCursor) {
		newCursor = inventoryLatestUpdatedAt
	}
	if fulfillmentLatestUpdatedAt.After(newCursor) {
		newCursor = fulfillmentLatestUpdatedAt
	}
	if discountLatestUpdatedAt.After(newCursor) {
		newCursor = discountLatestUpdatedAt
	}
	if marketingLatestUpdatedAt.After(newCursor) {
		newCursor = marketingLatestUpdatedAt
	}
	if newCursor.IsZero() {
		newCursor = asOf
	}
	return records, newCursor, nil
}

func newStagedChunkWriter(stageDir string) *stagedChunkWriter {
	writer := &stagedChunkWriter{
		stageDir:  stageDir,
		chunkSize: stageChunkSize,
		manifest: stagedBackfillManifest{
			Version:  1,
			Format:   "jsonl_files",
			StageDir: stageDir,
		},
	}
	writer.manifest.ManifestPath = filepath.Join(stageDir, "manifest.json")
	return writer
}

func (w *stagedChunkWriter) openChunk() error {
	if w.currentFile != nil {
		return nil
	}
	chunkPath := filepath.Join(w.stageDir, fmt.Sprintf("chunk-%05d.jsonl", w.chunkIndex))
	file, err := os.Create(chunkPath)
	if err != nil {
		return err
	}
	w.currentFile = file
	w.currentEnc = json.NewEncoder(file)
	w.currentChunk = &stagedBackfillChunk{Path: chunkPath}
	w.chunkIndex++
	return nil
}

func extractRecordProgress(record nexadapter.AdapterInboundRecord) (string, *int64) {
	recordID := strings.TrimSpace(record.Payload.ExternalRecordID)
	timestamp := record.Payload.Timestamp
	if timestamp <= 0 {
		return recordID, nil
	}
	return recordID, &timestamp
}

func (w *stagedChunkWriter) closeChunk() error {
	if w.currentFile == nil || w.currentChunk == nil {
		return nil
	}
	if err := w.currentFile.Close(); err != nil {
		return err
	}
	w.manifest.Chunks = append(w.manifest.Chunks, *w.currentChunk)
	w.currentFile = nil
	w.currentEnc = nil
	w.currentChunk = nil
	return nil
}

func (w *stagedChunkWriter) write(record nexadapter.AdapterInboundRecord) error {
	if err := w.openChunk(); err != nil {
		return err
	}
	if err := w.currentEnc.Encode(record); err != nil {
		return err
	}
	recordID, timestamp := extractRecordProgress(record)
	w.currentChunk.Records++
	w.manifest.Totals.Records++
	if w.currentChunk.FirstRecordID == "" {
		w.currentChunk.FirstRecordID = recordID
	}
	w.currentChunk.LastRecordID = recordID
	if timestamp != nil {
		if w.currentChunk.FirstTimestampMs == nil || *timestamp < *w.currentChunk.FirstTimestampMs {
			value := *timestamp
			w.currentChunk.FirstTimestampMs = &value
		}
		if w.currentChunk.LastTimestampMs == nil || *timestamp > *w.currentChunk.LastTimestampMs {
			value := *timestamp
			w.currentChunk.LastTimestampMs = &value
		}
	}
	if w.currentChunk.Records >= w.chunkSize {
		return w.closeChunk()
	}
	return nil
}

func (w *stagedChunkWriter) finish() (*stagedBackfillManifest, error) {
	if err := w.closeChunk(); err != nil {
		return nil, err
	}
	raw, err := json.MarshalIndent(w.manifest, "", "  ")
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(w.manifest.ManifestPath, raw, 0o644); err != nil {
		return nil, err
	}
	return &w.manifest, nil
}

func resolveStagedBackfillSince(payload map[string]any) (time.Time, error) {
	raw, _ := payload["since"].(string)
	since := strings.TrimSpace(raw)
	if since == "" {
		return time.Time{}, fmt.Errorf("records.backfill.stage requires payload.since")
	}
	parsed, err := time.Parse(time.RFC3339, since)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid staged backfill since %q: %w", since, err)
	}
	return parsed, nil
}

func resolveStageDir(payload map[string]any) (string, error) {
	if payload != nil {
		if raw, ok := payload["stage_dir"].(string); ok && strings.TrimSpace(raw) != "" {
			stageDir := strings.TrimSpace(raw)
			if err := os.MkdirAll(stageDir, 0o755); err != nil {
				return "", err
			}
			return stageDir, nil
		}
	}
	return os.MkdirTemp("", "nex-shopify-staged-backfill-*")
}

func stageBackfill(ctx nexadapter.AdapterContext[struct{}], payload map[string]any) (any, error) {
	since, err := resolveStagedBackfillSince(payload)
	if err != nil {
		return nil, err
	}
	stageDir, err := resolveStageDir(payload)
	if err != nil {
		return nil, err
	}

	writer := newStagedChunkWriter(stageDir)
	var stageErr error
	err = backfill(ctx, since, func(record any) {
		if stageErr != nil {
			return
		}
		inbound, ok := record.(nexadapter.AdapterInboundRecord)
		if !ok {
			stageErr = fmt.Errorf("unexpected staged record type %T", record)
			return
		}
		if err := writer.write(inbound); err != nil {
			stageErr = err
		}
	})
	if err != nil {
		return nil, err
	}
	if stageErr != nil {
		return nil, stageErr
	}
	return writer.finish()
}

func fetchOrdersSince(ctx context.Context, state *shopifyState, since time.Time, useUpdatedAt bool) ([]shopifyOrder, shopifySourceRequest, time.Time, error) {
	accessToken, err := fetchShopifyAccessToken(ctx, state)
	if err != nil {
		return nil, shopifySourceRequest{}, time.Time{}, err
	}

	sourceRequest, nextURL := shopifyOrdersRequest(state, since, useUpdatedAt)
	orders := make([]shopifyOrder, 0, 256)
	latestUpdatedAt := time.Time{}
	pageCount := 0

	for nextURL != "" {
		if pageCount >= maxOrdersPages {
			return nil, sourceRequest, time.Time{}, fmt.Errorf("exceeded Shopify pagination guard (%d pages)", maxOrdersPages)
		}
		pageCount++

		page, err := fetchOrderPage(ctx, state, accessToken, nextURL)
		if err != nil {
			return nil, sourceRequest, time.Time{}, err
		}

		for _, order := range page.Orders {
			orders = append(orders, order)
			if parsed := parseOrderUpdatedAt(order); !parsed.IsZero() && parsed.After(latestUpdatedAt) {
				latestUpdatedAt = parsed
			}
		}

		nextURL = page.NextCursor
	}

	return orders, sourceRequest, latestUpdatedAt, nil
}

func shopifyOrdersRequest(state *shopifyState, since time.Time, useUpdatedAt bool) (shopifySourceRequest, string) {
	return shopifyOrdersWindowRequest(state, since, useUpdatedAt, nil)
}

func shopifyOrdersWindowRequest(state *shopifyState, since time.Time, useUpdatedAt bool, through *time.Time) (shopifySourceRequest, string) {
	windowField := "created_at_min"
	windowMaximumField := "created_at_max"
	orderField := "created_at"
	if useUpdatedAt {
		windowField = "updated_at_min"
		windowMaximumField = "updated_at_max"
		orderField = "updated_at"
	}

	baseURL := fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion)
	path := "/orders.json"
	params := url.Values{}
	params.Set("status", "any")
	params.Set("limit", "250")
	params.Set("order", orderField+" asc")
	params.Set(windowField, since.Format(time.RFC3339))
	if through != nil {
		params.Set(windowMaximumField, through.UTC().Format(time.RFC3339))
	}
	request := map[string]any{
		"status":         "any",
		"limit":          250,
		"order":          orderField + " asc",
		windowField:      since.Format(time.RFC3339),
		"api_version":    state.APIVersion,
		"use_updated_at": useUpdatedAt,
	}
	if through != nil {
		request[windowMaximumField] = through.UTC().Format(time.RFC3339)
	}
	sourceRequest := shopifySourceRequest{
		APIBaseURL: baseURL,
		Path:       path,
		Request:    request,
	}
	return sourceRequest, baseURL + path + "?" + params.Encode()
}

func fetchOrderPage(ctx context.Context, state *shopifyState, accessToken string, requestURL string) (shopifyOrderPage, error) {
	if err := validateShopifyOrderPageURL(state, requestURL); err != nil {
		return shopifyOrderPage{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return shopifyOrderPage{}, fmt.Errorf("build Shopify orders request: %w", err)
	}
	req.Header.Set("X-Shopify-Access-Token", accessToken)

	res, err := shopifyHTTPClient.Do(req)
	if err != nil {
		return shopifyOrderPage{}, fmt.Errorf("Shopify orders request failed: %w", err)
	}
	bodyBytes, readErr := io.ReadAll(io.LimitReader(res.Body, maxResponseBodyBytes))
	_ = res.Body.Close()
	if readErr != nil {
		return shopifyOrderPage{}, fmt.Errorf("read Shopify orders response: %w", readErr)
	}
	bodyText := strings.TrimSpace(string(bodyBytes))
	if res.StatusCode >= 400 {
		return shopifyOrderPage{}, fmt.Errorf("Shopify orders request failed (%d): %s", res.StatusCode, bodyText)
	}

	var payload shopifyOrdersResponse
	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		return shopifyOrderPage{}, fmt.Errorf("parse Shopify orders response: %w", err)
	}
	nextCursor := parseLinkHeader(res.Header.Get("Link"))["next"]
	return shopifyOrderPage{
		Orders:        payload.Orders,
		RequestCursor: requestURL,
		NextCursor:    nextCursor,
		Complete:      nextCursor == "",
	}, nil
}

func validateShopifyOrderPageURL(state *shopifyState, requestURL string) error {
	if state == nil {
		return errors.New("missing Shopify state for orders page")
	}
	candidate, err := url.Parse(requestURL)
	if err != nil {
		return fmt.Errorf("parse Shopify orders page URL: %w", err)
	}
	expected, err := url.Parse(fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion) + "/orders.json")
	if err != nil {
		return fmt.Errorf("parse configured Shopify orders URL: %w", err)
	}
	if candidate.Scheme != "https" || candidate.Scheme != expected.Scheme || !strings.EqualFold(candidate.Host, expected.Host) || candidate.Path != expected.Path || candidate.User != nil || candidate.Fragment != "" {
		return errors.New("Shopify orders page URL escaped the configured store boundary")
	}
	return nil
}

func fetchShopInfo(ctx context.Context, state *shopifyState) (*shopifyShop, error) {
	accessToken, err := fetchShopifyAccessToken(ctx, state)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion) + "/shop.json"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build Shopify shop request: %w", err)
	}
	req.Header.Set("X-Shopify-Access-Token", accessToken)

	res, err := shopifyHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Shopify shop request failed: %w", err)
	}
	defer res.Body.Close()

	bodyBytes, _ := io.ReadAll(io.LimitReader(res.Body, maxResponseBodyBytes))
	bodyText := strings.TrimSpace(string(bodyBytes))
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("Shopify shop request failed (%d): %s", res.StatusCode, bodyText)
	}

	var payload shopifyShopResponse
	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		return nil, fmt.Errorf("parse Shopify shop response: %w", err)
	}
	return &payload.Shop, nil
}

func fetchShopifyAccessToken(ctx context.Context, state *shopifyState) (string, error) {
	if tokenCache != nil &&
		tokenCache.ShopDomain == state.ShopDomain &&
		tokenCache.ClientID == state.ClientID &&
		tokenCache.ClientSecret == state.ClientSecret &&
		time.Now().Before(tokenCache.ExpiresAt) {
		return tokenCache.AccessToken, nil
	}

	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	form.Set("client_id", state.ClientID)
	form.Set("client_secret", state.ClientSecret)

	tokenURL := fmt.Sprintf("https://%s/admin/oauth/access_token", state.ShopDomain)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("build Shopify token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	res, err := shopifyHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("Shopify token exchange failed: %w", err)
	}
	defer res.Body.Close()

	bodyBytes, _ := io.ReadAll(io.LimitReader(res.Body, maxOAuthResponseBytes))
	bodyText := strings.TrimSpace(string(bodyBytes))
	if res.StatusCode >= 400 {
		return "", fmt.Errorf("Shopify token exchange failed (%d): %s", res.StatusCode, bodyText)
	}

	var payload struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		return "", fmt.Errorf("parse Shopify token response: %w", err)
	}
	if strings.TrimSpace(payload.AccessToken) == "" {
		return "", errors.New("Shopify token exchange returned empty access_token")
	}

	tokenCache = &shopifyTokenCache{
		ShopDomain:   state.ShopDomain,
		ClientID:     state.ClientID,
		ClientSecret: state.ClientSecret,
		AccessToken:  strings.TrimSpace(payload.AccessToken),
		ExpiresAt:    time.Now().Add(defaultTokenTTL),
	}
	return tokenCache.AccessToken, nil
}

func buildOrderRecord(state *shopifyState, order shopifyOrder, sourceRequest shopifySourceRequest) nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(state.ConnectionID)
	if err != nil {
		nexadapter.LogError("shopify order build: %v", err)
		return nexadapter.AdapterInboundRecord{}
	}

	orderID := int64String(order.ID)
	if orderID == "" {
		return nexadapter.AdapterInboundRecord{}
	}

	row := normalizedOrderRow(state.ShopDomain, order)
	bridgeAttributes := extractBridgeAttributes(order)
	logicalRowID := fmt.Sprintf("%s:%s", state.ShopDomain, orderID)
	typedRevisionInput := map[string]any{
		"row":               row,
		"bridge_attributes": bridgeAttributes,
	}
	revision := revisionHash(providerRevisionInput(order.rawProviderPayload, typedRevisionInput))
	threadID := fmt.Sprintf("%s:order:%s", state.ShopDomain, orderID)
	threadName := firstNonBlank(order.Name, orderID)
	providerIDs := map[string]any{
		"shop_domain":    state.ShopDomain,
		"order_id":       orderID,
		"customer_id":    int64String(pointerCustomerID(order.Customer)),
		"cart_token":     emptyToNil(order.CartToken),
		"checkout_token": emptyToNil(order.CheckoutToken),
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
			ContainerID:   "order",
			ContainerName: "Orders",
			ThreadID:      threadID,
			ThreadName:    threadName,
			Metadata: map[string]any{
				"family":      "order",
				"grain":       "order",
				"shop_domain": state.ShopDomain,
				"api_path":    sourceRequest.Path,
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("%s:%s:order:%s:%s", platformID, nexadapter.SafeIDToken(connectionID), orderID, revision),
			Timestamp:        orderTimestamp(order).UnixMilli(),
			Content:          fmt.Sprintf("order %s total=%s financial_status=%s fulfillment_status=%s", threadName, firstNonBlank(order.TotalPrice, "0"), firstNonBlank(order.FinancialStatus, "unknown"), firstNonBlank(order.FulfillmentStatus, "unknown")),
			ContentType:      "text",
			Payload:          providerPayloadEnvelope(order.rawProviderJSON, order.rawProviderPayload, order),
			Metadata: map[string]any{
				"connection_id":     connectionID,
				"adapter_id":        platformID,
				"family":            "order",
				"logical_row_id":    logicalRowID,
				"revision_hash":     revision,
				"provider_ids":      providerIDs,
				"row":               row,
				"bridge_attributes": bridgeAttributes,
				"source_request":    sourceRequest.metadata(),
			},
		},
	}
}

func buildLineItemRecord(state *shopifyState, order shopifyOrder, lineItem shopifyLineItem, sourceRequest shopifySourceRequest) nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(state.ConnectionID)
	if err != nil {
		nexadapter.LogError("shopify line item build: %v", err)
		return nexadapter.AdapterInboundRecord{}
	}

	orderID := int64String(order.ID)
	lineItemID := int64String(lineItem.ID)
	if orderID == "" || lineItemID == "" {
		return nexadapter.AdapterInboundRecord{}
	}

	row := normalizedLineItemRow(state.ShopDomain, order, lineItem)
	revision := revisionHash(providerRevisionInput(lineItem.rawProviderPayload, row))
	logicalRowID := fmt.Sprintf("%s:%s:%s", state.ShopDomain, orderID, lineItemID)
	threadID := fmt.Sprintf("%s:order:%s", state.ShopDomain, orderID)
	providerIDs := map[string]any{
		"shop_domain":  state.ShopDomain,
		"order_id":     orderID,
		"line_item_id": lineItemID,
		"product_id":   int64String(lineItem.ProductID),
		"variant_id":   int64String(lineItem.VariantID),
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
			ContainerID:   "line_item",
			ContainerName: "Line Items",
			ThreadID:      threadID,
			ThreadName:    firstNonBlank(order.Name, orderID),
			Metadata: map[string]any{
				"family":      "line_item",
				"grain":       "order+line_item",
				"shop_domain": state.ShopDomain,
				"api_path":    sourceRequest.Path,
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("%s:%s:line_item:%s:%s:%s", platformID, nexadapter.SafeIDToken(connectionID), orderID, lineItemID, revision),
			Timestamp:        lineItemTimestamp(order).UnixMilli(),
			Content:          fmt.Sprintf("line_item order=%s line_item=%s quantity=%d price=%s", firstNonBlank(order.Name, orderID), lineItemID, lineItem.Quantity, firstNonBlank(lineItem.Price, "0")),
			ContentType:      "text",
			Payload:          providerPayloadEnvelope(lineItem.rawProviderJSON, lineItem.rawProviderPayload, lineItem),
			Metadata: map[string]any{
				"connection_id":     connectionID,
				"adapter_id":        platformID,
				"family":            "line_item",
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

func normalizedOrderRow(shopDomain string, order shopifyOrder) map[string]any {
	noteAttributes := noteAttributesMap(order)
	row := map[string]any{
		"shop_domain":        shopDomain,
		"order_id":           int64String(order.ID),
		"order_number":       int64String(order.OrderNumber),
		"name":               order.Name,
		"created_at":         order.CreatedAt,
		"updated_at":         order.UpdatedAt,
		"processed_at":       order.ProcessedAt,
		"currency":           order.Currency,
		"total_price":        order.TotalPrice,
		"subtotal_price":     order.SubtotalPrice,
		"financial_status":   order.FinancialStatus,
		"fulfillment_status": order.FulfillmentStatus,
		"cancelled_at":       order.CancelledAt,
		"cart_token":         order.CartToken,
		"checkout_token":     order.CheckoutToken,
		"source_name":        order.SourceName,
		"referring_site":     order.ReferringSite,
		"landing_site":       order.LandingSite,
		"customer_id":        int64String(pointerCustomerID(order.Customer)),
		"customer_email":     order.Email,
		"customer_phone":     order.Phone,
		"billing_address":    normalizedAddressSnapshot(order.BillingAddress),
		"shipping_address":   normalizedAddressSnapshot(order.ShippingAddress),
		"tags":               order.Tags,
		"note_attributes":    noteAttributes,
	}
	return compactMap(row)
}

func normalizedAddressSnapshot(address *shopifyAddress) any {
	if address == nil {
		return nil
	}
	return compactMap(map[string]any{
		"address_id":    int64String(address.ID),
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
		"country_code":  address.CountryCode,
		"zip":           address.Zip,
		"phone":         address.Phone,
	})
}

func normalizedLineItemRow(shopDomain string, order shopifyOrder, lineItem shopifyLineItem) map[string]any {
	row := map[string]any{
		"shop_domain":        shopDomain,
		"order_id":           int64String(order.ID),
		"order_number":       int64String(order.OrderNumber),
		"order_updated_at":   firstNonBlank(order.UpdatedAt, order.ProcessedAt, order.CreatedAt),
		"line_item_id":       int64String(lineItem.ID),
		"product_id":         int64String(lineItem.ProductID),
		"variant_id":         int64String(lineItem.VariantID),
		"title":              lineItem.Title,
		"variant_title":      lineItem.VariantTitle,
		"sku":                lineItem.SKU,
		"vendor":             lineItem.Vendor,
		"quantity":           lineItem.Quantity,
		"price":              lineItem.Price,
		"fulfillment_status": lineItem.FulfillmentStatus,
	}
	return compactMap(row)
}

func extractBridgeAttributes(order shopifyOrder) map[string]any {
	attrs := noteAttributesMap(order)
	landingParams := parseLandingSiteParams(order.LandingSite)

	bridge := map[string]any{
		"session_id":                 firstNonBlank(attrs["ms_session_id"]),
		"initiate_checkout_event_id": firstNonBlank(attrs["ms_initiate_checkout_event_id"]),
		"purchase_event_id":          firstNonBlank(attrs["ms_purchase_event_id"]),
		"experiment_key":             firstNonBlank(attrs["ms_experiment_key"]),
		"experiment_variant":         firstNonBlank(attrs["ms_experiment_variant"]),
		"event_source_url":           firstNonBlank(attrs["ms_event_source_url"]),
		"landing_path":               firstNonBlank(attrs["ms_landing_path"]),
		"referrer":                   firstNonBlank(attrs["ms_referrer"]),
		"fbclid":                     firstNonBlank(attrs["ms_fbclid"], landingParams["fbclid"]),
		"fbc":                        firstNonBlank(attrs["ms_fbc"]),
		"fbp":                        firstNonBlank(attrs["ms_fbp"]),
		"gclid":                      firstNonBlank(attrs["ms_gclid"], landingParams["gclid"]),
		"gbraid":                     firstNonBlank(attrs["ms_gbraid"], landingParams["gbraid"]),
		"wbraid":                     firstNonBlank(attrs["ms_wbraid"], landingParams["wbraid"]),
		"ttclid":                     firstNonBlank(attrs["ms_ttclid"], landingParams["ttclid"]),
		"ttp":                        firstNonBlank(attrs["ms_ttp"]),
		"msclkid":                    firstNonBlank(attrs["ms_msclkid"], landingParams["msclkid"]),
		"utm_source":                 firstNonBlank(attrs["ms_utm_source"], landingParams["utm_source"]),
		"utm_medium":                 firstNonBlank(attrs["ms_utm_medium"], landingParams["utm_medium"]),
		"utm_campaign":               firstNonBlank(attrs["ms_utm_campaign"], landingParams["utm_campaign"]),
		"utm_content":                firstNonBlank(attrs["ms_utm_content"], landingParams["utm_content"]),
		"utm_term":                   firstNonBlank(attrs["ms_utm_term"], landingParams["utm_term"]),
		"product_id":                 firstNonBlank(attrs["ms_product_id"]),
		"variant_id":                 firstNonBlank(attrs["ms_variant_id"]),
		"quantity":                   firstNonBlank(attrs["ms_quantity"]),
	}
	return compactMap(bridge)
}

func noteAttributesMap(order shopifyOrder) map[string]string {
	out := map[string]string{}
	for _, item := range order.NoteAttributes {
		key := strings.TrimSpace(firstNonBlank(item.Key, item.Name))
		value := strings.TrimSpace(item.Value)
		if key == "" || value == "" {
			continue
		}
		out[key] = value
	}
	return out
}

func parseLandingSiteParams(landingSite string) map[string]string {
	landingSite = strings.TrimSpace(landingSite)
	if landingSite == "" {
		return map[string]string{}
	}
	parsedURL, err := url.Parse(landingSite)
	if err != nil || parsedURL.Scheme == "" {
		parsedURL, err = url.Parse("https://example.invalid" + landingSite)
		if err != nil {
			return map[string]string{}
		}
	}
	values := parsedURL.Query()
	out := map[string]string{}
	for _, key := range []string{"fbclid", "gclid", "gbraid", "wbraid", "ttclid", "msclkid", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"} {
		if value := strings.TrimSpace(values.Get(key)); value != "" {
			out[key] = value
		}
	}
	return out
}

func parseLinkHeader(value string) map[string]string {
	links := map[string]string{}
	if strings.TrimSpace(value) == "" {
		return links
	}
	for _, part := range strings.Split(value, ",") {
		part = strings.TrimSpace(part)
		if !strings.HasPrefix(part, "<") {
			continue
		}
		segments := strings.Split(part, ";")
		if len(segments) < 2 {
			continue
		}
		target := strings.Trim(strings.TrimSpace(segments[0]), "<>")
		rel := ""
		for _, segment := range segments[1:] {
			segment = strings.TrimSpace(segment)
			if strings.HasPrefix(segment, "rel=") {
				rel = strings.Trim(strings.TrimPrefix(segment, "rel="), "\"")
				break
			}
		}
		if target != "" && rel != "" {
			links[rel] = target
		}
	}
	return links
}

func (r shopifySourceRequest) metadata() map[string]any {
	return map[string]any{
		"api_base_url": r.APIBaseURL,
		"path":         r.Path,
		"request":      r.Request,
	}
}

func revisionHash(value any) string {
	body, err := json.Marshal(value)
	if err != nil {
		return "unhashable"
	}
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func mustJSONObject(value any) map[string]any {
	body, err := json.Marshal(value)
	if err != nil {
		return map[string]any{}
	}
	out := map[string]any{}
	if err := json.Unmarshal(body, &out); err != nil {
		return map[string]any{}
	}
	return out
}

func compactMap(input map[string]any) map[string]any {
	out := map[string]any{}
	for key, value := range input {
		switch typed := value.(type) {
		case string:
			if strings.TrimSpace(typed) == "" {
				continue
			}
			out[key] = typed
		case map[string]string:
			if len(typed) == 0 {
				continue
			}
			converted := map[string]any{}
			for nestedKey, nestedValue := range typed {
				if strings.TrimSpace(nestedValue) == "" {
					continue
				}
				converted[nestedKey] = nestedValue
			}
			if len(converted) > 0 {
				out[key] = converted
			}
		case map[string]any:
			if len(typed) == 0 {
				continue
			}
			out[key] = typed
		case int:
			if typed == 0 {
				continue
			}
			out[key] = typed
		case int64:
			if typed == 0 {
				continue
			}
			out[key] = typed
		default:
			if value != nil {
				out[key] = value
			}
		}
	}
	keys := make([]string, 0, len(out))
	for key := range out {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	sorted := make(map[string]any, len(out))
	for _, key := range keys {
		sorted[key] = out[key]
	}
	return sorted
}

func parseOrderUpdatedAt(order shopifyOrder) time.Time {
	return firstParsedTime(order.UpdatedAt, order.ProcessedAt, order.CreatedAt)
}

func orderTimestamp(order shopifyOrder) time.Time {
	if ts := firstParsedTime(order.ProcessedAt, order.CreatedAt, order.UpdatedAt); !ts.IsZero() {
		return ts
	}
	return time.Now().UTC()
}

func lineItemTimestamp(order shopifyOrder) time.Time {
	if ts := firstParsedTime(order.UpdatedAt, order.ProcessedAt, order.CreatedAt); !ts.IsZero() {
		return ts
	}
	return time.Now().UTC()
}

func firstParsedTime(values ...string) time.Time {
	for _, value := range values {
		if parsed := parseTime(value); !parsed.IsZero() {
			return parsed
		}
	}
	return time.Time{}
}

func parseTime(value string) time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err == nil {
		return parsed.UTC()
	}
	return time.Time{}
}

func minTime(left time.Time, right time.Time) time.Time {
	if left.IsZero() {
		return right
	}
	if right.IsZero() {
		return left
	}
	if left.Before(right) {
		return left
	}
	return right
}

func int64String(value int64) string {
	if value == 0 {
		return ""
	}
	return strconv.FormatInt(value, 10)
}

func pointerCustomerID(customer *shopifyCustomer) int64 {
	if customer == nil {
		return 0
	}
	return customer.ID
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func emptyToNil(value string) any {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return value
}
