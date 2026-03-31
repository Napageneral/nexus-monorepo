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
	"sort"
	"strconv"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName               = "google-ads-adapter"
	adapterVersion            = "0.1.0"
	platformID                = "google-ads"
	defaultGoogleAdsAPIBase   = "https://googleads.googleapis.com/v22"
	defaultGoogleOAuthToken   = "https://www.googleapis.com/oauth2/v3/token"
	dateLayout                = "2006-01-02"
	dailyReplayWindow         = 7 * 24 * time.Hour
	hourlyReplayWindow        = 48 * time.Hour
	defaultMonitorInterval    = 6 * time.Hour
	defaultHTTPTimeout        = 30 * time.Second
	defaultAccessibleHTTPVerb = http.MethodGet
)

var (
	googleAdsAPIBaseURL     = defaultGoogleAdsAPIBase
	googleOAuthTokenURL     = defaultGoogleOAuthToken
	googleAdsHTTPClient     = &http.Client{Timeout: defaultHTTPTimeout}
	googleAccessTokenCached *googleAccessTokenCache
)

type googleAccessTokenCache struct {
	AccessToken  string
	ExpiresAt    time.Time
	ClientID     string
	ClientSecret string
	RefreshToken string
}

type googleAdsCredentials struct {
	ConnectionID    string
	CredentialRef   string
	DeveloperToken  string
	CustomerID      string
	LoginCustomerID string
	ClientID        string
	ClientSecret    string
	RefreshToken    string
	APIBaseURL      string
}

type googleRowFamily struct {
	ID            string
	ContainerName string
}

type googleSyncMode string

const (
	googleSyncModeBackfill googleSyncMode = "backfill"
	googleSyncModeMonitor  googleSyncMode = "monitor"
)

type googleFamilyWindow struct {
	Family       googleRowFamily
	RequestSince string
	RequestUntil string
	FilterStart  time.Time
	FilterEnd    time.Time
}

type googleSourceRequest struct {
	APIBaseURL string
	Path       string
	Request    map[string]any
}

type googleAccessibleCustomersResponse struct {
	ResourceNames []string `json:"resourceNames"`
}

type googleSearchStreamChunk[T any] struct {
	Results []T `json:"results"`
}

type googleCustomerSummaryRow struct {
	Customer googleCustomer `json:"customer"`
}

type googleCampaignReportRow struct {
	Campaign googleCampaign `json:"campaign"`
	Metrics  googleMetrics  `json:"metrics"`
	Segments googleSegments `json:"segments"`
}

type googleAdGroupReportRow struct {
	Campaign googleCampaign `json:"campaign"`
	AdGroup  googleAdGroup  `json:"adGroup"`
	Metrics  googleMetrics  `json:"metrics"`
	Segments googleSegments `json:"segments"`
}

type googleAdReportRow struct {
	Campaign  googleCampaign  `json:"campaign"`
	AdGroup   googleAdGroup   `json:"adGroup"`
	AdGroupAd googleAdGroupAd `json:"adGroupAd"`
	Metrics   googleMetrics   `json:"metrics"`
	Segments  googleSegments  `json:"segments"`
}

type googleCustomer struct {
	ID              jsonScalar `json:"id"`
	DescriptiveName jsonScalar `json:"descriptiveName"`
	CurrencyCode    jsonScalar `json:"currencyCode"`
	TimeZone        jsonScalar `json:"timeZone"`
}

type googleCampaign struct {
	ID                       jsonScalar `json:"id"`
	Name                     jsonScalar `json:"name"`
	Status                   jsonScalar `json:"status"`
	AdvertisingChannelType   jsonScalar `json:"advertisingChannelType"`
	AdvertisingChannelSubType jsonScalar `json:"advertisingChannelSubType"`
}

type googleAdGroup struct {
	ID     jsonScalar `json:"id"`
	Name   jsonScalar `json:"name"`
	Status jsonScalar `json:"status"`
}

type googleAd struct {
	ID   jsonScalar `json:"id"`
	Name jsonScalar `json:"name"`
	Type jsonScalar `json:"type"`
}

type googleAdGroupAd struct {
	Status jsonScalar `json:"status"`
	Ad     googleAd   `json:"ad"`
}

type googleMetrics struct {
	Impressions      jsonScalar `json:"impressions"`
	Clicks           jsonScalar `json:"clicks"`
	CostMicros       jsonScalar `json:"costMicros"`
	Conversions      jsonScalar `json:"conversions"`
	ConversionsValue jsonScalar `json:"conversionsValue"`
	AverageCpc       jsonScalar `json:"averageCpc"`
	Ctr              jsonScalar `json:"ctr"`
	LandingPageViews jsonScalar `json:"landingPageViews"`
}

type googleSegments struct {
	Date jsonScalar `json:"date"`
	Hour jsonScalar `json:"hour"`
}

type jsonScalar string

var googleRowFamilies = []googleRowFamily{
	{ID: "account_access_snapshot", ContainerName: "Account Access Snapshots"},
	{ID: "campaign_daily", ContainerName: "Campaign Daily"},
	{ID: "ad_group_daily", ContainerName: "Ad Group Daily"},
	{ID: "ad_daily", ContainerName: "Ad Daily"},
	{ID: "campaign_hourly", ContainerName: "Campaign Hourly"},
}

func main() {
	nexadapter.Run(nexadapter.DefineAdapter(adapterConfig()))
}

func adapterConfig() nexadapter.DefineAdapterConfig[struct{}] {
	return nexadapter.DefineAdapterConfig[struct{}]{
		Platform:          platformID,
		Name:              adapterName,
		Version:           adapterVersion,
		CredentialService: "google-ads",
		MultiAccount:      true,
		Connection: nexadapter.ConnectionHandlers[struct{}]{
			Connections: func(ctx nexadapter.AdapterContext[struct{}]) ([]nexadapter.AdapterConnectionIdentity, error) {
				return connections(ctx.Context)
			},
			Health: func(ctx nexadapter.AdapterContext[struct{}]) (*nexadapter.AdapterHealth, error) {
				return health(ctx.Context, ctx.ConnectionID)
			},
		},
		Ingest: nexadapter.IngestHandlers[struct{}]{
			Monitor: func(ctx nexadapter.AdapterContext[struct{}], emit nexadapter.EmitFunc) error {
				return monitor(ctx.Context, ctx.ConnectionID, emit)
			},
			Backfill: func(ctx nexadapter.AdapterContext[struct{}], since time.Time, emit nexadapter.EmitFunc) error {
				return backfill(ctx.Context, ctx.ConnectionID, since, emit)
			},
		},
		Methods: map[string]nexadapter.DeclaredMethod[struct{}]{},
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					ID:      "google_ads_direct_credentials",
					Type:    "api_key",
					Label:   "Enter Google Ads Credentials",
					Icon:    "key",
					Service: "google-ads",
					Fields: []nexadapter.AdapterAuthField{
						{
							Name:        "developer_token",
							Label:       "Developer Token",
							Type:        "secret",
							Required:    true,
							Placeholder: "developer-token",
						},
						{
							Name:        "customer_id",
							Label:       "Customer ID",
							Type:        "text",
							Required:    true,
							Placeholder: "1234567890",
						},
						{
							Name:        "login_customer_id",
							Label:       "Login Customer ID",
							Type:        "text",
							Required:    false,
							Placeholder: "0987654321",
						},
						{
							Name:        "oauth_client_id",
							Label:       "OAuth Client ID",
							Type:        "text",
							Required:    true,
							Placeholder: "client-id.apps.googleusercontent.com",
						},
						{
							Name:        "oauth_client_secret",
							Label:       "OAuth Client Secret",
							Type:        "secret",
							Required:    true,
							Placeholder: "client-secret",
						},
						{
							Name:        "oauth_refresh_token",
							Label:       "OAuth Refresh Token",
							Type:        "secret",
							Required:    true,
							Placeholder: "refresh-token",
						},
					},
				},
			},
			SetupGuide: "Provide direct Google Ads API credentials. Required fields are developer_token, customer_id, OAuth client id/secret, and OAuth refresh token. login_customer_id is optional and should be supplied when using a manager account.",
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

func info(ctx context.Context) (*nexadapter.AdapterInfo, error) {
	adapter := nexadapter.DefineAdapter(adapterConfig())
	return adapter.Operations.AdapterInfo(ctx)
}

func connections(_ context.Context) ([]nexadapter.AdapterConnectionIdentity, error) {
	runtimeContext, err := nexadapter.LoadRuntimeContextFromEnv()
	if err != nil {
		return []nexadapter.AdapterConnectionIdentity{}, nil
	}

	displayName := runtimeContext.ConnectionID
	credentialRef := "google-ads/" + runtimeContext.ConnectionID
	if runtimeContext.Credential != nil {
		customerID := nexadapter.FirstNonBlank(
			nexadapter.FieldValue(runtimeContext.Credential.Fields, "customer_id"),
			nexadapter.FieldValue(runtimeContext.Credential.Fields, "customerId"),
		)
		if customerID != "" {
			displayName = fmt.Sprintf("%s (%s)", runtimeContext.ConnectionID, normalizeCustomerID(customerID))
		}
		if strings.TrimSpace(runtimeContext.Credential.Ref) != "" {
			credentialRef = runtimeContext.Credential.Ref
		}
	}

	return []nexadapter.AdapterConnectionIdentity{
		{
			ID:            runtimeContext.ConnectionID,
			DisplayName:   displayName,
			CredentialRef: credentialRef,
			Status:        "ready",
		},
	}, nil
}

func health(ctx context.Context, account string) (*nexadapter.AdapterHealth, error) {
	account, err := nexadapter.RequireConnection(account)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: account,
			Error:        err.Error(),
		}, nil
	}

	creds, err := resolveGoogleAdsCredentials(account)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: account,
			Error:        err.Error(),
		}, nil
	}

	summary, err := fetchCustomerSummary(ctx, creds, creds.CustomerID)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: account,
			Error:        err.Error(),
		}, nil
	}

	details := map[string]any{
		"customer_id":       creds.CustomerID,
		"login_customer_id": creds.LoginCustomerID,
		"account_name":      normalizeScalar(summary.Customer.DescriptiveName),
		"currency_code":     normalizeScalar(summary.Customer.CurrencyCode),
		"time_zone":         normalizeScalar(summary.Customer.TimeZone),
		"credential_ref":    creds.CredentialRef,
	}

	if accessibleIDs, lookupErr := fetchAccessibleCustomerIDs(ctx, creds); lookupErr != nil {
		details["accessible_customers_error"] = lookupErr.Error()
	} else if len(accessibleIDs) > 0 {
		details["accessible_customer_ids"] = accessibleIDs
	}

	return &nexadapter.AdapterHealth{
		Connected:    true,
		ConnectionID: account,
		Account:      creds.CustomerID,
		LastEventAt:  time.Now().UnixMilli(),
		Details:      details,
	}, nil
}

func backfill(ctx context.Context, account string, since time.Time, emit nexadapter.EmitFunc) error {
	account, err := nexadapter.RequireConnection(account)
	if err != nil {
		return err
	}
	asOf := time.Now().UTC()
	records, _, err := fetchGoogleAdsRowsCycle(ctx, account, since.UTC(), asOf, googleSyncModeBackfill)
	if err != nil {
		return err
	}
	for _, record := range records {
		emit(record)
	}
	return nil
}

func monitor(ctx context.Context, account string, emit nexadapter.EmitFunc) error {
	account, err := nexadapter.RequireConnection(account)
	if err != nil {
		return err
	}
	return nexadapter.PollMonitor(nexadapter.PollConfig[nexadapter.AdapterInboundRecord]{
		Interval: defaultMonitorInterval,
		Fetch: func(ctx context.Context, since time.Time) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
			asOf := time.Now().UTC()
			return fetchGoogleAdsRowsCycle(ctx, account, since.UTC(), asOf, googleSyncModeMonitor)
		},
		MaxConsecutiveErrors: 5,
	})(ctx, account, emit)
}

func fetchGoogleAdsRowsCycle(ctx context.Context, account string, since time.Time, asOf time.Time, mode googleSyncMode) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
	creds, err := resolveGoogleAdsCredentials(account)
	if err != nil {
		return nil, time.Time{}, err
	}

	plans := planGoogleFamilyWindows(since, asOf, mode)
	records := make([]nexadapter.AdapterInboundRecord, 0, len(plans)*8)

	for _, plan := range plans {
		switch plan.Family.ID {
		case "account_access_snapshot":
			customerIDs, err := fetchAccessibleCustomerIDs(ctx, creds)
			if err != nil || len(customerIDs) == 0 {
				customerIDs = []string{creds.CustomerID}
			}
			customerIDs = uniqueStrings(customerIDs)
			for _, customerID := range customerIDs {
				row, sourceRequest, err := fetchAccountSnapshot(ctx, creds, customerID)
				if err != nil {
					return nil, time.Time{}, err
				}
				record := buildGoogleAccountSnapshotRecord(creds, plan.Family, row, sourceRequest)
				if record.Operation != "" {
					records = append(records, record)
				}
			}
		case "campaign_daily":
			rows, sourceRequest, err := fetchCampaignDailyRows(ctx, creds, plan.RequestSince, plan.RequestUntil)
			if err != nil {
				return nil, time.Time{}, err
			}
			for _, row := range rows {
				record := buildGoogleCampaignDailyRecord(creds, plan.Family, row, sourceRequest)
				if record.Operation != "" {
					records = append(records, record)
				}
			}
		case "ad_group_daily":
			rows, sourceRequest, err := fetchAdGroupDailyRows(ctx, creds, plan.RequestSince, plan.RequestUntil)
			if err != nil {
				return nil, time.Time{}, err
			}
			for _, row := range rows {
				record := buildGoogleAdGroupDailyRecord(creds, plan.Family, row, sourceRequest)
				if record.Operation != "" {
					records = append(records, record)
				}
			}
		case "ad_daily":
			rows, sourceRequest, err := fetchAdDailyRows(ctx, creds, plan.RequestSince, plan.RequestUntil)
			if err != nil {
				return nil, time.Time{}, err
			}
			for _, row := range rows {
				record := buildGoogleAdDailyRecord(creds, plan.Family, row, sourceRequest)
				if record.Operation != "" {
					records = append(records, record)
				}
			}
		case "campaign_hourly":
			rows, sourceRequest, err := fetchCampaignHourlyRows(ctx, creds, plan.RequestSince, plan.RequestUntil)
			if err != nil {
				return nil, time.Time{}, err
			}
			for _, row := range rows {
				record := buildGoogleCampaignHourlyRecord(creds, plan.Family, row, sourceRequest)
				if record.Operation != "" {
					records = append(records, record)
				}
			}
		}
	}

	return filterGoogleFamilyRecords(plans, records), asOf, nil
}

func fetchAccessibleCustomerIDs(ctx context.Context, creds googleAdsCredentials) ([]string, error) {
	var response googleAccessibleCustomersResponse
	sourcePath := "/customers:listAccessibleCustomers"
	if err := googleAdsJSONRequest(ctx, creds, defaultAccessibleHTTPVerb, sourcePath, nil, &response); err != nil {
		return nil, err
	}
	customerIDs := make([]string, 0, len(response.ResourceNames))
	for _, resourceName := range response.ResourceNames {
		resourceName = strings.TrimSpace(resourceName)
		if resourceName == "" {
			continue
		}
		customerIDs = append(customerIDs, normalizeCustomerID(strings.TrimPrefix(resourceName, "customers/")))
	}
	return uniqueStrings(customerIDs), nil
}

func fetchAccountSnapshot(ctx context.Context, creds googleAdsCredentials, customerID string) (googleCustomerSummaryRow, googleSourceRequest, error) {
	query := strings.TrimSpace(`
SELECT
  customer.id,
  customer.descriptive_name,
  customer.currency_code,
  customer.time_zone
FROM customer
LIMIT 1
`)
	rows, sourceRequest, err := googleAdsSearchStream[googleCustomerSummaryRow](ctx, creds, customerID, query)
	if err != nil {
		return googleCustomerSummaryRow{}, sourceRequest, err
	}
	if len(rows) == 0 {
		return googleCustomerSummaryRow{}, sourceRequest, fmt.Errorf("google ads customer summary returned no rows for customer %s", customerID)
	}
	return rows[0], sourceRequest, nil
}

func fetchCustomerSummary(ctx context.Context, creds googleAdsCredentials, customerID string) (googleCustomerSummaryRow, error) {
	row, _, err := fetchAccountSnapshot(ctx, creds, customerID)
	return row, err
}

func fetchCampaignDailyRows(ctx context.Context, creds googleAdsCredentials, since string, until string) ([]googleCampaignReportRow, googleSourceRequest, error) {
	query := fmt.Sprintf(strings.TrimSpace(`
SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  campaign.advertising_channel_sub_type,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions,
  metrics.conversions_value,
  segments.date
FROM campaign
WHERE segments.date BETWEEN '%s' AND '%s'
  AND campaign.status != REMOVED
ORDER BY segments.date, campaign.id
`), since, until)
	return googleAdsSearchStream[googleCampaignReportRow](ctx, creds, creds.CustomerID, query)
}

func fetchAdGroupDailyRows(ctx context.Context, creds googleAdsCredentials, since string, until string) ([]googleAdGroupReportRow, googleSourceRequest, error) {
	query := fmt.Sprintf(strings.TrimSpace(`
SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  campaign.advertising_channel_sub_type,
  ad_group.id,
  ad_group.name,
  ad_group.status,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions,
  metrics.conversions_value,
  segments.date
FROM ad_group
WHERE segments.date BETWEEN '%s' AND '%s'
  AND campaign.status != REMOVED
  AND ad_group.status != REMOVED
ORDER BY segments.date, campaign.id, ad_group.id
`), since, until)
	return googleAdsSearchStream[googleAdGroupReportRow](ctx, creds, creds.CustomerID, query)
}

func fetchAdDailyRows(ctx context.Context, creds googleAdsCredentials, since string, until string) ([]googleAdReportRow, googleSourceRequest, error) {
	query := fmt.Sprintf(strings.TrimSpace(`
SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  campaign.advertising_channel_sub_type,
  ad_group.id,
  ad_group.name,
  ad_group.status,
  ad_group_ad.status,
  ad_group_ad.ad.id,
  ad_group_ad.ad.name,
  ad_group_ad.ad.type,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions,
  metrics.conversions_value,
  segments.date
FROM ad_group_ad
WHERE segments.date BETWEEN '%s' AND '%s'
  AND campaign.status != REMOVED
  AND ad_group.status != REMOVED
  AND ad_group_ad.status != REMOVED
ORDER BY segments.date, campaign.id, ad_group.id, ad_group_ad.ad.id
`), since, until)
	return googleAdsSearchStream[googleAdReportRow](ctx, creds, creds.CustomerID, query)
}

func fetchCampaignHourlyRows(ctx context.Context, creds googleAdsCredentials, since string, until string) ([]googleCampaignReportRow, googleSourceRequest, error) {
	query := fmt.Sprintf(strings.TrimSpace(`
SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  campaign.advertising_channel_sub_type,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions,
  metrics.conversions_value,
  segments.date,
  segments.hour
FROM campaign
WHERE segments.date BETWEEN '%s' AND '%s'
  AND campaign.status != REMOVED
ORDER BY segments.date, segments.hour, campaign.id
`), since, until)
	return googleAdsSearchStream[googleCampaignReportRow](ctx, creds, creds.CustomerID, query)
}

func googleAdsSearchStream[T any](ctx context.Context, creds googleAdsCredentials, customerID string, query string) ([]T, googleSourceRequest, error) {
	customerID = normalizeCustomerID(customerID)
	path := fmt.Sprintf("/customers/%s/googleAds:searchStream", customerID)
	request := map[string]string{"query": query}

	var response []googleSearchStreamChunk[T]
	if err := googleAdsJSONRequest(ctx, creds, http.MethodPost, path, request, &response); err != nil {
		return nil, googleSourceRequest{}, err
	}

	rows := make([]T, 0, len(response)*2)
	for _, chunk := range response {
		rows = append(rows, chunk.Results...)
	}

	return rows, googleSourceRequest{
		APIBaseURL: strings.TrimRight(creds.APIBaseURL, "/"),
		Path:       path,
		Request: map[string]any{
			"customer_id": customerID,
			"gaql":        query,
		},
	}, nil
}

func googleAdsJSONRequest(ctx context.Context, creds googleAdsCredentials, method string, path string, payload any, out any) error {
	bodyBytes, err := marshalPayload(payload)
	if err != nil {
		return err
	}

	responseBody, err := executeGoogleAdsRequest(ctx, creds, method, path, bodyBytes, true)
	if err != nil && creds.LoginCustomerID != "" && strings.Contains(err.Error(), "USER_PERMISSION_DENIED") {
		responseBody, err = executeGoogleAdsRequest(ctx, creds, method, path, bodyBytes, false)
	}
	if err != nil {
		return err
	}
	if out == nil || len(strings.TrimSpace(responseBody)) == 0 {
		return nil
	}
	if err := json.Unmarshal([]byte(responseBody), out); err != nil {
		return fmt.Errorf("parse google ads response: %w", err)
	}
	return nil
}

func executeGoogleAdsRequest(ctx context.Context, creds googleAdsCredentials, method string, path string, body []byte, includeLoginCustomerID bool) (string, error) {
	accessToken, err := refreshGoogleAdsAccessToken(ctx, creds)
	if err != nil {
		return "", err
	}

	requestURL := strings.TrimRight(creds.APIBaseURL, "/") + path
	var reader io.Reader
	if len(body) > 0 {
		reader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, requestURL, reader)
	if err != nil {
		return "", fmt.Errorf("build google ads request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("developer-token", creds.DeveloperToken)
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	if includeLoginCustomerID && creds.LoginCustomerID != "" {
		req.Header.Set("login-customer-id", creds.LoginCustomerID)
	}

	res, err := googleAdsHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("google ads request failed: %w", err)
	}
	defer res.Body.Close()

	payloadBytes, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	payloadText := strings.TrimSpace(string(payloadBytes))
	if res.StatusCode >= 400 {
		return "", fmt.Errorf("google ads request failed (%d): %s", res.StatusCode, payloadText)
	}
	return payloadText, nil
}

func refreshGoogleAdsAccessToken(ctx context.Context, creds googleAdsCredentials) (string, error) {
	if googleAccessTokenCached != nil &&
		googleAccessTokenCached.ClientID == creds.ClientID &&
		googleAccessTokenCached.ClientSecret == creds.ClientSecret &&
		googleAccessTokenCached.RefreshToken == creds.RefreshToken &&
		time.Now().Before(googleAccessTokenCached.ExpiresAt) {
		return googleAccessTokenCached.AccessToken, nil
	}

	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("client_id", creds.ClientID)
	form.Set("client_secret", creds.ClientSecret)
	form.Set("refresh_token", creds.RefreshToken)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, googleOAuthTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("build google oauth request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	res, err := googleAdsHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("google oauth refresh failed: %w", err)
	}
	defer res.Body.Close()

	payloadBytes, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	payloadText := strings.TrimSpace(string(payloadBytes))
	if res.StatusCode >= 400 {
		return "", fmt.Errorf("google oauth refresh failed (%d): %s", res.StatusCode, payloadText)
	}

	var response struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := json.Unmarshal(payloadBytes, &response); err != nil {
		return "", fmt.Errorf("parse google oauth refresh response: %w", err)
	}
	if strings.TrimSpace(response.AccessToken) == "" {
		return "", errors.New("google oauth refresh returned empty access_token")
	}

	expiresIn := response.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = 3600
	}
	googleAccessTokenCached = &googleAccessTokenCache{
		AccessToken:  strings.TrimSpace(response.AccessToken),
		ExpiresAt:    time.Now().Add(time.Duration(maxInt64(60, expiresIn-60)) * time.Second),
		ClientID:     creds.ClientID,
		ClientSecret: creds.ClientSecret,
		RefreshToken: creds.RefreshToken,
	}
	return googleAccessTokenCached.AccessToken, nil
}

func buildGoogleAccountSnapshotRecord(creds googleAdsCredentials, family googleRowFamily, row googleCustomerSummaryRow, sourceRequest googleSourceRequest) nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(creds.ConnectionID)
	if err != nil {
		nexadapter.LogError("google ads account snapshot build: %v", err)
		return nexadapter.AdapterInboundRecord{}
	}

	customerID := normalizeCustomerID(normalizeScalar(row.Customer.ID))
	if customerID == "" {
		customerID = creds.CustomerID
	}

	logicalRowID := customerID
	normalizedRow := normalizedAccountSnapshotRow(row, customerID)
	revision := revisionHash(normalizedRow)
	threadID := fmt.Sprintf("%s:customer:%s", customerID, customerID)
	threadName := nexadapter.FirstNonBlank(normalizeScalar(row.Customer.DescriptiveName), customerID)

	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       adapterName,
			Platform:      platformID,
			ConnectionID:  connectionID,
			SenderID:      customerID,
			SenderName:    "Google Ads",
			ReceiverID:    connectionID,
			SpaceID:       customerID,
			ContainerKind: "group",
			ContainerID:   family.ID,
			ContainerName: family.ContainerName,
			ThreadID:      threadID,
			ThreadName:    threadName,
			Metadata: map[string]any{
				"family":      family.ID,
				"grain":       familyGrain(family.ID),
				"customer_id": customerID,
				"api_path":    sourceRequest.Path,
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("%s:%s:%s:%s:%s", platformID, nexadapter.SafeIDToken(connectionID), family.ID, logicalRowID, revision),
			Timestamp:        time.Now().UnixMilli(),
			Content:          fmt.Sprintf("account_access_snapshot customer=%s name=%s", customerID, threadName),
			ContentType:      "text",
			Metadata: map[string]any{
				"connection_id":  connectionID,
				"adapter_id":     platformID,
				"family":         family.ID,
				"logical_row_id": logicalRowID,
				"revision_hash":  revision,
				"provider_ids": map[string]any{
					"customer_id": customerID,
				},
				"source_request": sourceRequest.metadata(),
				"row":            normalizedRow,
				"derived":        map[string]any{},
			},
		},
	}
}

func buildGoogleCampaignDailyRecord(creds googleAdsCredentials, family googleRowFamily, row googleCampaignReportRow, sourceRequest googleSourceRequest) nexadapter.AdapterInboundRecord {
	date := normalizeScalar(row.Segments.Date)
	campaignID := normalizeScalar(row.Campaign.ID)
	if !googleRowHasActivity(row.Metrics) || date == "" || campaignID == "" {
		return nexadapter.AdapterInboundRecord{}
	}
	normalizedRow := normalizedCampaignDailyRow(row, creds.CustomerID)
	derived := derivedMeasures(row.Metrics)
	return buildGoogleReportRecord(
		creds,
		family,
		fmt.Sprintf("%s:%s:%s", creds.CustomerID, date, campaignID),
		fmt.Sprintf("%s:campaign:%s", creds.CustomerID, campaignID),
		nexadapter.FirstNonBlank(normalizeScalar(row.Campaign.Name), campaignID),
		recordTimestamp(date, ""),
		normalizedRow,
		derived,
		sourceRequest,
		map[string]any{
			"customer_id": creds.CustomerID,
			"campaign_id": campaignID,
		},
		fmt.Sprintf("campaign_daily %s campaign=%s cost=%g clicks=%g conversions=%g", date, campaignID, derived["cost"], derived["clicks"], derived["conversions"]),
	)
}

func buildGoogleAdGroupDailyRecord(creds googleAdsCredentials, family googleRowFamily, row googleAdGroupReportRow, sourceRequest googleSourceRequest) nexadapter.AdapterInboundRecord {
	date := normalizeScalar(row.Segments.Date)
	adGroupID := normalizeScalar(row.AdGroup.ID)
	if !googleRowHasActivity(row.Metrics) || date == "" || adGroupID == "" {
		return nexadapter.AdapterInboundRecord{}
	}
	normalizedRow := normalizedAdGroupDailyRow(row, creds.CustomerID)
	derived := derivedMeasures(row.Metrics)
	return buildGoogleReportRecord(
		creds,
		family,
		fmt.Sprintf("%s:%s:%s", creds.CustomerID, date, adGroupID),
		fmt.Sprintf("%s:ad_group:%s", creds.CustomerID, adGroupID),
		nexadapter.FirstNonBlank(normalizeScalar(row.AdGroup.Name), adGroupID),
		recordTimestamp(date, ""),
		normalizedRow,
		derived,
		sourceRequest,
		map[string]any{
			"customer_id": creds.CustomerID,
			"campaign_id": normalizeScalar(row.Campaign.ID),
			"ad_group_id": adGroupID,
		},
		fmt.Sprintf("ad_group_daily %s ad_group=%s cost=%g clicks=%g conversions=%g", date, adGroupID, derived["cost"], derived["clicks"], derived["conversions"]),
	)
}

func buildGoogleAdDailyRecord(creds googleAdsCredentials, family googleRowFamily, row googleAdReportRow, sourceRequest googleSourceRequest) nexadapter.AdapterInboundRecord {
	date := normalizeScalar(row.Segments.Date)
	adID := normalizeScalar(row.AdGroupAd.Ad.ID)
	if !googleRowHasActivity(row.Metrics) || date == "" || adID == "" {
		return nexadapter.AdapterInboundRecord{}
	}
	normalizedRow := normalizedAdDailyRow(row, creds.CustomerID)
	derived := derivedMeasures(row.Metrics)
	return buildGoogleReportRecord(
		creds,
		family,
		fmt.Sprintf("%s:%s:%s", creds.CustomerID, date, adID),
		fmt.Sprintf("%s:ad:%s", creds.CustomerID, adID),
		nexadapter.FirstNonBlank(normalizeScalar(row.AdGroupAd.Ad.Name), normalizeScalar(row.AdGroupAd.Ad.Type), adID),
		recordTimestamp(date, ""),
		normalizedRow,
		derived,
		sourceRequest,
		map[string]any{
			"customer_id": creds.CustomerID,
			"campaign_id": normalizeScalar(row.Campaign.ID),
			"ad_group_id": normalizeScalar(row.AdGroup.ID),
			"ad_id":       adID,
		},
		fmt.Sprintf("ad_daily %s ad=%s cost=%g clicks=%g conversions=%g", date, adID, derived["cost"], derived["clicks"], derived["conversions"]),
	)
}

func buildGoogleCampaignHourlyRecord(creds googleAdsCredentials, family googleRowFamily, row googleCampaignReportRow, sourceRequest googleSourceRequest) nexadapter.AdapterInboundRecord {
	date := normalizeScalar(row.Segments.Date)
	hour := normalizeScalar(row.Segments.Hour)
	campaignID := normalizeScalar(row.Campaign.ID)
	if !googleRowHasActivity(row.Metrics) || date == "" || campaignID == "" || hour == "" {
		return nexadapter.AdapterInboundRecord{}
	}
	normalizedRow := normalizedCampaignHourlyRow(row, creds.CustomerID)
	derived := derivedMeasures(row.Metrics)
	return buildGoogleReportRecord(
		creds,
		family,
		fmt.Sprintf("%s:%s:%s:%s", creds.CustomerID, date, normalizeHour(hour), campaignID),
		fmt.Sprintf("%s:campaign:%s", creds.CustomerID, campaignID),
		nexadapter.FirstNonBlank(normalizeScalar(row.Campaign.Name), campaignID),
		recordTimestamp(date, hour),
		normalizedRow,
		derived,
		sourceRequest,
		map[string]any{
			"customer_id": creds.CustomerID,
			"campaign_id": campaignID,
			"hour":        normalizeHour(hour),
		},
		fmt.Sprintf("campaign_hourly %s hour=%s campaign=%s cost=%g clicks=%g conversions=%g", date, normalizeHour(hour), campaignID, derived["cost"], derived["clicks"], derived["conversions"]),
	)
}

func buildGoogleReportRecord(
	creds googleAdsCredentials,
	family googleRowFamily,
	logicalRowID string,
	threadID string,
	threadName string,
	timestamp int64,
	row map[string]any,
	derived map[string]any,
	sourceRequest googleSourceRequest,
	providerIDs map[string]any,
	content string,
) nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(creds.ConnectionID)
	if err != nil {
		nexadapter.LogError("google ads report build: %v", err)
		return nexadapter.AdapterInboundRecord{}
	}
	revision := revisionHash(row)
	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       adapterName,
			Platform:      platformID,
			ConnectionID:  connectionID,
			SenderID:      creds.CustomerID,
			SenderName:    "Google Ads",
			ReceiverID:    connectionID,
			SpaceID:       creds.CustomerID,
			ContainerKind: "group",
			ContainerID:   family.ID,
			ContainerName: family.ContainerName,
			ThreadID:      threadID,
			ThreadName:    threadName,
			Metadata: map[string]any{
				"family":      family.ID,
				"grain":       familyGrain(family.ID),
				"customer_id": creds.CustomerID,
				"api_path":    sourceRequest.Path,
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("%s:%s:%s:%s:%s", platformID, nexadapter.SafeIDToken(connectionID), family.ID, logicalRowID, revision),
			Timestamp:        timestamp,
			Content:          content,
			ContentType:      "text",
			Metadata: map[string]any{
				"connection_id":  connectionID,
				"adapter_id":     platformID,
				"family":         family.ID,
				"logical_row_id": logicalRowID,
				"revision_hash":  revision,
				"provider_ids":   providerIDs,
				"source_request": sourceRequest.metadata(),
				"row":            row,
				"derived":        derived,
			},
		},
	}
}

func planGoogleFamilyWindows(since time.Time, asOf time.Time, mode googleSyncMode) []googleFamilyWindow {
	since = since.UTC()
	asOf = asOf.UTC()
	if since.IsZero() || since.After(asOf) {
		since = asOf
	}

	plans := make([]googleFamilyWindow, 0, len(googleRowFamilies))
	for _, family := range googleRowFamilies {
		plan := googleFamilyWindow{Family: family}
		switch family.ID {
		case "account_access_snapshot":
			plans = append(plans, plan)
		case "campaign_hourly":
			if mode == googleSyncModeMonitor {
				plan.FilterStart = minTime(since, asOf.Add(-hourlyReplayWindow))
			} else {
				plan.FilterStart = maxTime(since, asOf.Add(-hourlyReplayWindow))
			}
			plan.FilterEnd = asOf
			plan.RequestSince = plan.FilterStart.Format(dateLayout)
			plan.RequestUntil = plan.FilterEnd.Format(dateLayout)
			plans = append(plans, plan)
		default:
			effectiveSince := since
			if mode == googleSyncModeMonitor {
				effectiveSince = minTime(since, asOf.Add(-dailyReplayWindow))
			}
			plan.RequestSince = effectiveSince.Format(dateLayout)
			plan.RequestUntil = asOf.Format(dateLayout)
			plans = append(plans, plan)
		}
	}
	return plans
}

func filterGoogleFamilyRecords(plans []googleFamilyWindow, records []nexadapter.AdapterInboundRecord) []nexadapter.AdapterInboundRecord {
	planByFamily := map[string]googleFamilyWindow{}
	for _, plan := range plans {
		planByFamily[plan.Family.ID] = plan
	}
	filtered := make([]nexadapter.AdapterInboundRecord, 0, len(records))
	for _, record := range records {
		family, _ := record.Payload.Metadata["family"].(string)
		plan, ok := planByFamily[family]
		if !ok || (plan.FilterStart.IsZero() && plan.FilterEnd.IsZero()) {
			filtered = append(filtered, record)
			continue
		}
		timestamp := time.UnixMilli(record.Payload.Timestamp).UTC()
		if !plan.FilterStart.IsZero() && timestamp.Before(plan.FilterStart) {
			continue
		}
		if !plan.FilterEnd.IsZero() && timestamp.After(plan.FilterEnd) {
			continue
		}
		filtered = append(filtered, record)
	}
	return filtered
}

func normalizedAccountSnapshotRow(row googleCustomerSummaryRow, customerID string) map[string]any {
	normalized := map[string]any{}
	putIfNotBlank(normalized, "customer_id", customerID)
	putIfNotBlank(normalized, "customer_name", normalizeScalar(row.Customer.DescriptiveName))
	putIfNotBlank(normalized, "currency_code", normalizeScalar(row.Customer.CurrencyCode))
	putIfNotBlank(normalized, "time_zone", normalizeScalar(row.Customer.TimeZone))
	return normalized
}

func normalizedCampaignDailyRow(row googleCampaignReportRow, customerID string) map[string]any {
	normalized := normalizedCampaignCoreRow(row.Campaign, row.Metrics, row.Segments, customerID)
	return normalized
}

func normalizedAdGroupDailyRow(row googleAdGroupReportRow, customerID string) map[string]any {
	normalized := normalizedCampaignCoreRow(row.Campaign, row.Metrics, row.Segments, customerID)
	putIfNotBlank(normalized, "ad_group_id", normalizeScalar(row.AdGroup.ID))
	putIfNotBlank(normalized, "ad_group_name", normalizeScalar(row.AdGroup.Name))
	putIfNotBlank(normalized, "ad_group_status", normalizeScalar(row.AdGroup.Status))
	return normalized
}

func normalizedAdDailyRow(row googleAdReportRow, customerID string) map[string]any {
	normalized := normalizedCampaignCoreRow(row.Campaign, row.Metrics, row.Segments, customerID)
	putIfNotBlank(normalized, "ad_group_id", normalizeScalar(row.AdGroup.ID))
	putIfNotBlank(normalized, "ad_group_name", normalizeScalar(row.AdGroup.Name))
	putIfNotBlank(normalized, "ad_group_status", normalizeScalar(row.AdGroup.Status))
	putIfNotBlank(normalized, "ad_group_ad_status", normalizeScalar(row.AdGroupAd.Status))
	putIfNotBlank(normalized, "ad_id", normalizeScalar(row.AdGroupAd.Ad.ID))
	putIfNotBlank(normalized, "ad_name", normalizeScalar(row.AdGroupAd.Ad.Name))
	putIfNotBlank(normalized, "ad_type", normalizeScalar(row.AdGroupAd.Ad.Type))
	return normalized
}

func normalizedCampaignHourlyRow(row googleCampaignReportRow, customerID string) map[string]any {
	normalized := normalizedCampaignCoreRow(row.Campaign, row.Metrics, row.Segments, customerID)
	putIfNotBlank(normalized, "hour", normalizeHour(normalizeScalar(row.Segments.Hour)))
	return normalized
}

func normalizedCampaignCoreRow(campaign googleCampaign, metrics googleMetrics, segments googleSegments, customerID string) map[string]any {
	normalized := map[string]any{}
	putIfNotBlank(normalized, "customer_id", customerID)
	putIfNotBlank(normalized, "date", normalizeScalar(segments.Date))
	putIfNotBlank(normalized, "campaign_id", normalizeScalar(campaign.ID))
	putIfNotBlank(normalized, "campaign_name", normalizeScalar(campaign.Name))
	putIfNotBlank(normalized, "campaign_status", normalizeScalar(campaign.Status))
	putIfNotBlank(normalized, "advertising_channel_type", normalizeScalar(campaign.AdvertisingChannelType))
	putIfNotBlank(normalized, "advertising_channel_sub_type", normalizeScalar(campaign.AdvertisingChannelSubType))
	putIfNotBlank(normalized, "impressions", normalizeScalar(metrics.Impressions))
	putIfNotBlank(normalized, "clicks", normalizeScalar(metrics.Clicks))
	putIfNotBlank(normalized, "cost_micros", normalizeScalar(metrics.CostMicros))
	putIfNotBlank(normalized, "conversions", normalizeScalar(metrics.Conversions))
	putIfNotBlank(normalized, "conversions_value", normalizeScalar(metrics.ConversionsValue))
	putIfNotBlank(normalized, "average_cpc", normalizeScalar(metrics.AverageCpc))
	putIfNotBlank(normalized, "ctr", normalizeScalar(metrics.Ctr))
	putIfNotBlank(normalized, "landing_page_views", normalizeScalar(metrics.LandingPageViews))
	return normalized
}

func derivedMeasures(metrics googleMetrics) map[string]any {
	impressions := parseNumber(metrics.Impressions)
	clicks := parseNumber(metrics.Clicks)
	costMicros := parseNumber(metrics.CostMicros)
	conversions := parseNumber(metrics.Conversions)
	conversionsValue := parseNumber(metrics.ConversionsValue)
	cost := costMicros / 1_000_000
	ctr := 0.0
	if impressions > 0 {
		ctr = clicks / impressions
	}
	averageCPC := 0.0
	if clicks > 0 {
		averageCPC = cost / clicks
	}
	costPerConversion := 0.0
	if conversions > 0 {
		costPerConversion = cost / conversions
	}
	derived := map[string]any{
		"impressions":       impressions,
		"clicks":            clicks,
		"cost":              roundTo(cost, 6),
		"conversions":       conversions,
		"conversions_value": conversionsValue,
		"ctr":               roundTo(ctr, 6),
		"average_cpc":       roundTo(averageCPC, 6),
		"cost_per_conversion": roundTo(costPerConversion, 6),
	}
	if landingPageViews := parseNumber(metrics.LandingPageViews); landingPageViews > 0 {
		derived["landing_page_views"] = landingPageViews
	}
	return derived
}

func googleRowHasActivity(metrics googleMetrics) bool {
	return parseNumber(metrics.Impressions) > 0 ||
		parseNumber(metrics.Clicks) > 0 ||
		parseNumber(metrics.CostMicros) > 0 ||
		parseNumber(metrics.Conversions) > 0 ||
		parseNumber(metrics.ConversionsValue) > 0
}

func familyGrain(familyID string) string {
	switch familyID {
	case "account_access_snapshot":
		return "customer"
	case "campaign_daily":
		return "date+campaign"
	case "ad_group_daily":
		return "date+ad_group"
	case "ad_daily":
		return "date+ad"
	case "campaign_hourly":
		return "date+hour+campaign"
	default:
		return "row"
	}
}

func revisionHash(row map[string]any) string {
	payload, err := json.Marshal(row)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:8])
}

func recordTimestamp(date string, hour string) int64 {
	date = strings.TrimSpace(date)
	hour = strings.TrimSpace(hour)
	if date == "" {
		return time.Now().UnixMilli()
	}
	if hour == "" {
		return nexadapter.MetricTimestamp(date, time.UTC)
	}
	parsedDate, err := time.ParseInLocation(dateLayout, date, time.UTC)
	if err != nil {
		return nexadapter.MetricTimestamp(date, time.UTC)
	}
	hourNumber, err := strconv.Atoi(normalizeHour(hour))
	if err != nil {
		return nexadapter.MetricTimestamp(date, time.UTC)
	}
	return parsedDate.Add(time.Duration(hourNumber)*time.Hour + 30*time.Minute).UnixMilli()
}

func resolveGoogleAdsCredentials(account string) (googleAdsCredentials, error) {
	fields := map[string]string{}
	credentialRef := "google-ads/" + account
	runtimeContext, err := nexadapter.LoadRuntimeContextFromEnv()
	if err == nil && runtimeContext != nil {
		if strings.TrimSpace(runtimeContext.ConnectionID) != "" {
			account = runtimeContext.ConnectionID
		}
		if runtimeContext.Credential != nil {
			fields = runtimeContext.Credential.Fields
			if strings.TrimSpace(runtimeContext.Credential.Ref) != "" {
				credentialRef = runtimeContext.Credential.Ref
			}
		}
	}

	developerToken := firstNonBlank(
		nexadapter.FieldValue(fields, "developer_token"),
		nexadapter.FieldValue(fields, "developerToken"),
		strings.TrimSpace(os.Getenv("NEXUS_GOOGLE_ADS_DEVELOPER_TOKEN")),
		strings.TrimSpace(os.Getenv("GOOGLE_ADS_DEVELOPER_TOKEN")),
	)
	customerID := firstNonBlank(
		nexadapter.FieldValue(fields, "customer_id"),
		nexadapter.FieldValue(fields, "customerId"),
		strings.TrimSpace(os.Getenv("NEXUS_GOOGLE_ADS_CUSTOMER_ID")),
		strings.TrimSpace(os.Getenv("GOOGLE_ADS_CUSTOMER_ID")),
	)
	loginCustomerID := firstNonBlank(
		nexadapter.FieldValue(fields, "login_customer_id"),
		nexadapter.FieldValue(fields, "loginCustomerId"),
		strings.TrimSpace(os.Getenv("NEXUS_GOOGLE_ADS_LOGIN_CUSTOMER_ID")),
		strings.TrimSpace(os.Getenv("GOOGLE_ADS_LOGIN_CUSTOMER_ID")),
	)
	clientID := firstNonBlank(
		nexadapter.FieldValue(fields, "oauth_client_id"),
		nexadapter.FieldValue(fields, "oauthClientId"),
		nexadapter.FieldValue(fields, "client_id"),
		strings.TrimSpace(os.Getenv("NEXUS_GOOGLE_ADS_OAUTH_CLIENT_ID")),
		strings.TrimSpace(os.Getenv("GOOGLE_ADS_OAUTH_CLIENT_ID")),
	)
	clientSecret := firstNonBlank(
		nexadapter.FieldValue(fields, "oauth_client_secret"),
		nexadapter.FieldValue(fields, "oauthClientSecret"),
		nexadapter.FieldValue(fields, "client_secret"),
		strings.TrimSpace(os.Getenv("NEXUS_GOOGLE_ADS_OAUTH_CLIENT_SECRET")),
		strings.TrimSpace(os.Getenv("GOOGLE_ADS_OAUTH_CLIENT_SECRET")),
	)
	refreshToken := firstNonBlank(
		nexadapter.FieldValue(fields, "oauth_refresh_token"),
		nexadapter.FieldValue(fields, "oauthRefreshToken"),
		nexadapter.FieldValue(fields, "refresh_token"),
		strings.TrimSpace(os.Getenv("NEXUS_GOOGLE_ADS_OAUTH_REFRESH_TOKEN")),
		strings.TrimSpace(os.Getenv("GOOGLE_ADS_OAUTH_REFRESH_TOKEN")),
	)
	apiBaseURL := firstNonBlank(
		nexadapter.FieldValue(fields, "api_base_url"),
		nexadapter.FieldValue(fields, "google_ads_api_base_url"),
		strings.TrimSpace(os.Getenv("NEXUS_GOOGLE_ADS_API_BASE_URL")),
		googleAdsAPIBaseURL,
	)

	switch {
	case strings.TrimSpace(developerToken) == "":
		return googleAdsCredentials{}, errors.New("missing developer_token credential field")
	case strings.TrimSpace(customerID) == "":
		return googleAdsCredentials{}, errors.New("missing customer_id credential field")
	case strings.TrimSpace(clientID) == "":
		return googleAdsCredentials{}, errors.New("missing oauth_client_id credential field")
	case strings.TrimSpace(clientSecret) == "":
		return googleAdsCredentials{}, errors.New("missing oauth_client_secret credential field")
	case strings.TrimSpace(refreshToken) == "":
		return googleAdsCredentials{}, errors.New("missing oauth_refresh_token credential field")
	}

	return googleAdsCredentials{
		ConnectionID:    account,
		CredentialRef:   credentialRef,
		DeveloperToken:  strings.TrimSpace(developerToken),
		CustomerID:      normalizeCustomerID(customerID),
		LoginCustomerID: normalizeOptionalCustomerID(loginCustomerID),
		ClientID:        strings.TrimSpace(clientID),
		ClientSecret:    strings.TrimSpace(clientSecret),
		RefreshToken:    strings.TrimSpace(refreshToken),
		APIBaseURL:      strings.TrimRight(strings.TrimSpace(apiBaseURL), "/"),
	}, nil
}

func (s *googleSourceRequest) metadata() map[string]any {
	return map[string]any{
		"api_base_url": s.APIBaseURL,
		"path":         s.Path,
		"request":      s.Request,
	}
}

func (s *jsonScalar) UnmarshalJSON(data []byte) error {
	trimmed := bytes.TrimSpace(data)
	if bytes.Equal(trimmed, []byte("null")) || len(trimmed) == 0 {
		*s = ""
		return nil
	}
	var asString string
	if err := json.Unmarshal(trimmed, &asString); err == nil {
		*s = jsonScalar(asString)
		return nil
	}
	decoder := json.NewDecoder(bytes.NewReader(trimmed))
	decoder.UseNumber()
	var asNumber json.Number
	if err := decoder.Decode(&asNumber); err == nil {
		*s = jsonScalar(asNumber.String())
		return nil
	}
	return fmt.Errorf("unsupported scalar json: %s", string(trimmed))
}

func normalizeScalar(value jsonScalar) string {
	return strings.TrimSpace(string(value))
}

func normalizeCustomerID(raw string) string {
	replacer := strings.NewReplacer("-", "", " ", "")
	return replacer.Replace(strings.TrimSpace(raw))
}

func normalizeOptionalCustomerID(raw string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	return normalizeCustomerID(raw)
}

func normalizeHour(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	hour, err := strconv.Atoi(raw)
	if err != nil {
		return raw
	}
	return strconv.Itoa(hour)
}

func parseNumber(value jsonScalar) float64 {
	text := normalizeScalar(value)
	if text == "" {
		return 0
	}
	parsed, err := strconv.ParseFloat(text, 64)
	if err != nil {
		return 0
	}
	return parsed
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		normalized = append(normalized, value)
	}
	sort.Strings(normalized)
	return normalized
}

func marshalPayload(payload any) ([]byte, error) {
	if payload == nil {
		return nil, nil
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal request payload: %w", err)
	}
	return raw, nil
}

func putIfNotBlank(target map[string]any, key string, value string) {
	if strings.TrimSpace(value) != "" {
		target[key] = strings.TrimSpace(value)
	}
}

func roundTo(value float64, precision int) float64 {
	if precision < 0 {
		return value
	}
	scale := mathPow10(precision)
	return mathRound(value*scale) / scale
}

func mathPow10(precision int) float64 {
	scale := 1.0
	for i := 0; i < precision; i++ {
		scale *= 10
	}
	return scale
}

func mathRound(value float64) float64 {
	if value < 0 {
		return -mathRound(-value)
	}
	floor := float64(int64(value))
	if value-floor >= 0.5 {
		return floor + 1
	}
	return floor
}

func maxInt64(a int64, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func minTime(a time.Time, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

func maxTime(a time.Time, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}
