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
	adapterName                    = "google-business-profile-adapter"
	adapterVersion                 = "0.1.0"
	platformID                     = "google-business-profile"
	defaultOAuthTokenURL           = "https://www.googleapis.com/oauth2/v3/token"
	defaultAccountManagementAPI    = "https://mybusinessaccountmanagement.googleapis.com/v1"
	defaultBusinessInfoAPI         = "https://mybusinessbusinessinformation.googleapis.com/v1"
	defaultPerformanceAPI          = "https://businessprofileperformance.googleapis.com/v1"
	defaultReviewsAPI              = "https://mybusiness.googleapis.com/v4"
	defaultHTTPTimeout             = 30 * time.Second
	defaultMonitorInterval         = 24 * time.Hour
	performanceReplayWindow        = 14 * 24 * time.Hour
	defaultOAuthAccessTokenTTL     = 55 * time.Minute
	defaultLocationsPageSize       = 100
	defaultReviewsPageSize         = 50
	maxPagesPerCollection          = 200
	maxResponseBodyBytes           = 8 << 20
	defaultLocationReadMask        = "name,title,storeCode,websiteUri,phoneNumbers,primaryCategory,storefrontAddress,latlng,metadata,openInfo"
	dateLayout                     = "2006-01-02"
)

var (
	googleBusinessProfileHTTPClient = &http.Client{Timeout: defaultHTTPTimeout}
	googleOAuthTokenURL             = defaultOAuthTokenURL
	googleAccessTokenCached         *googleAccessTokenCache
)

type googleAccessTokenCache struct {
	AccessToken  string
	ExpiresAt    time.Time
	ClientID     string
	ClientSecret string
	RefreshToken string
}

type googleBusinessProfileCredentials struct {
	ConnectionID             string
	CredentialRef            string
	AccountID                string
	LocationID               string
	ClientID                 string
	ClientSecret             string
	RefreshToken             string
	AccountManagementAPIBase string
	BusinessInfoAPIBase      string
	PerformanceAPIBase       string
	ReviewsAPIBase           string
}

type googleBusinessProfileRowFamily struct {
	ID            string
	ContainerName string
}

type googleBusinessProfileSyncMode string

const (
	googleBusinessProfileSyncModeBackfill googleBusinessProfileSyncMode = "backfill"
	googleBusinessProfileSyncModeMonitor  googleBusinessProfileSyncMode = "monitor"
)

type googleBusinessProfileSourceRequest struct {
	APIBaseURL string
	Path       string
	Request    map[string]any
}

type googleBusinessProfileAccountsResponse struct {
	Accounts      []map[string]any `json:"accounts"`
	NextPageToken string           `json:"nextPageToken"`
}

type googleBusinessProfileLocationsResponse struct {
	Locations     []map[string]any `json:"locations"`
	NextPageToken string           `json:"nextPageToken"`
}

type googleBusinessProfileReviewsResponse struct {
	Reviews       []map[string]any `json:"reviews"`
	NextPageToken string           `json:"nextPageToken"`
}

type googleBusinessProfilePerformanceResponse struct {
	MultiDailyMetricTimeSeries []googleBusinessProfileMultiDailyMetricTimeSeries `json:"multiDailyMetricTimeSeries"`
}

type googleBusinessProfileMultiDailyMetricTimeSeries struct {
	DailyMetricTimeSeries []googleBusinessProfileDailyMetricTimeSeries `json:"dailyMetricTimeSeries"`
}

type googleBusinessProfileDailyMetricTimeSeries struct {
	DailyMetric string                        `json:"dailyMetric"`
	TimeSeries  googleBusinessProfileTimeSeries `json:"timeSeries"`
}

type googleBusinessProfileTimeSeries struct {
	DatedValues []googleBusinessProfileDatedValue `json:"datedValues"`
}

type googleBusinessProfileDatedValue struct {
	Date      googleBusinessProfileDate `json:"date"`
	Value     int64                     `json:"value,omitempty"`
	Threshold int64                     `json:"threshold,omitempty"`
}

type googleBusinessProfileDate struct {
	Year  int `json:"year"`
	Month int `json:"month"`
	Day   int `json:"day"`
}

var googleBusinessProfileRowFamilies = []googleBusinessProfileRowFamily{
	{ID: "account_snapshot", ContainerName: "Account Snapshots"},
	{ID: "location_snapshot", ContainerName: "Location Snapshots"},
	{ID: "location_performance_daily", ContainerName: "Location Performance Daily"},
	{ID: "review_snapshot", ContainerName: "Review Snapshots"},
}

var googleBusinessProfileDailyMetrics = []string{
	"BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
	"BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
	"BUSINESS_IMPRESSIONS_MOBILE_MAPS",
	"BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
	"BUSINESS_CONVERSATIONS",
	"BUSINESS_DIRECTION_REQUESTS",
	"CALL_CLICKS",
	"WEBSITE_CLICKS",
	"BUSINESS_BOOKINGS",
	"BUSINESS_FOOD_ORDERS",
	"BUSINESS_FOOD_MENU_CLICKS",
}

func main() {
	nexadapter.Run(nexadapter.DefineAdapter(adapterConfig()))
}

func adapterConfig() nexadapter.DefineAdapterConfig[struct{}] {
	return nexadapter.DefineAdapterConfig[struct{}]{
		Platform:          platformID,
		Name:              adapterName,
		Version:           adapterVersion,
		CredentialService: platformID,
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
					ID:      "google_business_profile_direct_credentials",
					Type:    "api_key",
					Label:   "Enter Google Business Profile Credentials",
					Icon:    "key",
					Service: platformID,
					Fields: []nexadapter.AdapterAuthField{
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
						{
							Name:        "account_id",
							Label:       "Account ID",
							Type:        "text",
							Required:    false,
							Placeholder: "accounts/1234567890",
						},
						{
							Name:        "location_id",
							Label:       "Location ID",
							Type:        "text",
							Required:    false,
							Placeholder: "locations/1234567890",
						},
					},
				},
			},
			SetupGuide: "Provide OAuth client id/secret and refresh token for a Google account with Business Profile API access and business.manage scope. account_id and location_id are optional narrowing fields.",
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
	credentialRef := platformID + "/" + runtimeContext.ConnectionID
	if runtimeContext.Credential != nil {
		accountID := normalizeAccountResourceName(nexadapter.FirstNonBlank(
			nexadapter.FieldValue(runtimeContext.Credential.Fields, "account_id"),
			nexadapter.FieldValue(runtimeContext.Credential.Fields, "accountId"),
		))
		locationID := normalizeLocationResourceName(nexadapter.FirstNonBlank(
			nexadapter.FieldValue(runtimeContext.Credential.Fields, "location_id"),
			nexadapter.FieldValue(runtimeContext.Credential.Fields, "locationId"),
		))
		switch {
		case locationID != "":
			displayName = fmt.Sprintf("%s (%s)", runtimeContext.ConnectionID, locationID)
		case accountID != "":
			displayName = fmt.Sprintf("%s (%s)", runtimeContext.ConnectionID, accountID)
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

	creds, err := resolveGoogleBusinessProfileCredentials(account)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: account,
			Error:        err.Error(),
		}, nil
	}

	accounts, _, err := fetchAllAccounts(ctx, creds)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: account,
			Error:        err.Error(),
		}, nil
	}
	accounts = filterAccounts(accounts, creds.AccountID)
	if len(accounts) == 0 {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: account,
			Error:        "no Google Business Profile accounts visible for this credential",
		}, nil
	}

	locationCount := 0
	firstAccount := accounts[0]
	for _, accountRow := range accounts {
		locations, _, locationErr := fetchAllLocations(ctx, creds, accountResourceName(accountRow))
		if locationErr != nil {
			continue
		}
		locations = filterLocations(locations, creds.LocationID)
		locationCount += len(locations)
	}

	details := map[string]any{
		"credential_ref": creds.CredentialRef,
		"account_count":  len(accounts),
		"location_count": locationCount,
		"account_ids":    collectAccountIDs(accounts),
	}
	if creds.AccountID != "" {
		details["account_filter"] = creds.AccountID
	}
	if creds.LocationID != "" {
		details["location_filter"] = creds.LocationID
	}
	if displayName := firstNonBlank(stringField(firstAccount, "accountName"), accountResourceName(firstAccount)); displayName != "" {
		details["first_account_name"] = displayName
	}

	return &nexadapter.AdapterHealth{
		Connected:    true,
		ConnectionID: account,
		Account:      strings.TrimPrefix(accountResourceName(firstAccount), "accounts/"),
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
	records, _, err := fetchGoogleBusinessProfileRowsCycle(ctx, account, since.UTC(), asOf, googleBusinessProfileSyncModeBackfill)
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
			return fetchGoogleBusinessProfileRowsCycle(ctx, account, since.UTC(), asOf, googleBusinessProfileSyncModeMonitor)
		},
		MaxConsecutiveErrors: 5,
	})(ctx, account, emit)
}

func fetchGoogleBusinessProfileRowsCycle(ctx context.Context, account string, since time.Time, asOf time.Time, mode googleBusinessProfileSyncMode) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
	creds, err := resolveGoogleBusinessProfileCredentials(account)
	if err != nil {
		return nil, time.Time{}, err
	}

	accounts, accountRequest, err := fetchAllAccounts(ctx, creds)
	if err != nil {
		return nil, time.Time{}, err
	}
	accounts = filterAccounts(accounts, creds.AccountID)
	if len(accounts) == 0 {
		return nil, time.Time{}, errors.New("no Google Business Profile accounts visible for this credential")
	}

	records := make([]nexadapter.AdapterInboundRecord, 0, len(accounts)*4)
	for _, accountRow := range accounts {
		record := buildGoogleBusinessProfileAccountRecord(creds, googleBusinessProfileRowFamilies[0], accountRow, accountRequest)
		if record.Operation != "" {
			records = append(records, record)
		}
	}

	performanceSince, performanceUntil := performanceWindow(since, asOf, mode)
	for _, accountRow := range accounts {
		accountName := accountResourceName(accountRow)
		locations, locationRequest, err := fetchAllLocations(ctx, creds, accountName)
		if err != nil {
			return nil, time.Time{}, err
		}
		locations = filterLocations(locations, creds.LocationID)
		for _, locationRow := range locations {
			locationRecord := buildGoogleBusinessProfileLocationRecord(creds, googleBusinessProfileRowFamilies[1], accountRow, locationRow, locationRequest)
			if locationRecord.Operation != "" {
				records = append(records, locationRecord)
			}

			performanceResponse, performanceRequest, perfErr := fetchLocationPerformance(ctx, creds, locationResourceName(locationRow), performanceSince, performanceUntil)
			if perfErr != nil {
				return nil, time.Time{}, perfErr
			}
			records = append(records, buildGoogleBusinessProfilePerformanceRecords(creds, googleBusinessProfileRowFamilies[2], accountRow, locationRow, performanceResponse, performanceRequest)...)

			reviews, reviewRequest, reviewErr := fetchAllReviews(ctx, creds, accountName, locationResourceName(locationRow))
			if reviewErr != nil {
				return nil, time.Time{}, reviewErr
			}
			for _, reviewRow := range reviews {
				reviewRecord := buildGoogleBusinessProfileReviewRecord(creds, googleBusinessProfileRowFamilies[3], accountRow, locationRow, reviewRow, reviewRequest)
				if reviewRecord.Operation != "" {
					records = append(records, reviewRecord)
				}
			}
		}
	}

	return records, asOf, nil
}

func fetchAllAccounts(ctx context.Context, creds googleBusinessProfileCredentials) ([]map[string]any, googleBusinessProfileSourceRequest, error) {
	query := url.Values{}
	query.Set("pageSize", strconv.Itoa(defaultLocationsPageSize))
	path := "/accounts"
	accounts := []map[string]any{}
	var sourceRequest googleBusinessProfileSourceRequest
	pageToken := ""

	for page := 0; page < maxPagesPerCollection; page++ {
		currentQuery := cloneValues(query)
		if pageToken != "" {
			currentQuery.Set("pageToken", pageToken)
		}
		var response googleBusinessProfileAccountsResponse
		if err := googleBusinessProfileJSONRequest(ctx, creds, http.MethodGet, creds.AccountManagementAPIBase, path, currentQuery, nil, &response); err != nil {
			return nil, sourceRequest, err
		}
		if page == 0 {
			sourceRequest = googleBusinessProfileSourceRequest{
				APIBaseURL: creds.AccountManagementAPIBase,
				Path:       path,
				Request: map[string]any{
					"query": currentQuery.Encode(),
				},
			}
		}
		accounts = append(accounts, response.Accounts...)
		if strings.TrimSpace(response.NextPageToken) == "" {
			break
		}
		pageToken = response.NextPageToken
	}

	return accounts, sourceRequest, nil
}

func fetchAllLocations(ctx context.Context, creds googleBusinessProfileCredentials, accountName string) ([]map[string]any, googleBusinessProfileSourceRequest, error) {
	query := url.Values{}
	query.Set("pageSize", strconv.Itoa(defaultLocationsPageSize))
	query.Set("readMask", defaultLocationReadMask)
	path := "/" + strings.TrimPrefix(accountName, "/") + "/locations"
	locations := []map[string]any{}
	var sourceRequest googleBusinessProfileSourceRequest
	pageToken := ""

	for page := 0; page < maxPagesPerCollection; page++ {
		currentQuery := cloneValues(query)
		if pageToken != "" {
			currentQuery.Set("pageToken", pageToken)
		}
		var response googleBusinessProfileLocationsResponse
		if err := googleBusinessProfileJSONRequest(ctx, creds, http.MethodGet, creds.BusinessInfoAPIBase, path, currentQuery, nil, &response); err != nil {
			return nil, sourceRequest, err
		}
		if page == 0 {
			sourceRequest = googleBusinessProfileSourceRequest{
				APIBaseURL: creds.BusinessInfoAPIBase,
				Path:       path,
				Request: map[string]any{
					"query": currentQuery.Encode(),
				},
			}
		}
		locations = append(locations, response.Locations...)
		if strings.TrimSpace(response.NextPageToken) == "" {
			break
		}
		pageToken = response.NextPageToken
	}

	return locations, sourceRequest, nil
}

func fetchLocationPerformance(ctx context.Context, creds googleBusinessProfileCredentials, locationName string, since time.Time, until time.Time) (googleBusinessProfilePerformanceResponse, googleBusinessProfileSourceRequest, error) {
	query := url.Values{}
	for _, metric := range googleBusinessProfileDailyMetrics {
		query.Add("dailyMetrics", metric)
	}
	query.Set("daily_range.start_date.year", strconv.Itoa(since.Year()))
	query.Set("daily_range.start_date.month", strconv.Itoa(int(since.Month())))
	query.Set("daily_range.start_date.day", strconv.Itoa(since.Day()))
	query.Set("daily_range.end_date.year", strconv.Itoa(until.Year()))
	query.Set("daily_range.end_date.month", strconv.Itoa(int(until.Month())))
	query.Set("daily_range.end_date.day", strconv.Itoa(until.Day()))

	path := "/" + locationName + ":fetchMultiDailyMetricsTimeSeries"
	var response googleBusinessProfilePerformanceResponse
	if err := googleBusinessProfileJSONRequest(ctx, creds, http.MethodGet, creds.PerformanceAPIBase, path, query, nil, &response); err != nil {
		return response, googleBusinessProfileSourceRequest{}, err
	}
	return response, googleBusinessProfileSourceRequest{
		APIBaseURL: creds.PerformanceAPIBase,
		Path:       path,
		Request: map[string]any{
			"query": query.Encode(),
		},
	}, nil
}

func fetchAllReviews(ctx context.Context, creds googleBusinessProfileCredentials, accountName string, locationName string) ([]map[string]any, googleBusinessProfileSourceRequest, error) {
	query := url.Values{}
	query.Set("pageSize", strconv.Itoa(defaultReviewsPageSize))
	path := fmt.Sprintf("/%s/%s/reviews", accountName, locationName)
	reviews := []map[string]any{}
	var sourceRequest googleBusinessProfileSourceRequest
	pageToken := ""

	for page := 0; page < maxPagesPerCollection; page++ {
		currentQuery := cloneValues(query)
		if pageToken != "" {
			currentQuery.Set("pageToken", pageToken)
		}
		var response googleBusinessProfileReviewsResponse
		if err := googleBusinessProfileJSONRequest(ctx, creds, http.MethodGet, creds.ReviewsAPIBase, path, currentQuery, nil, &response); err != nil {
			return nil, sourceRequest, err
		}
		if page == 0 {
			sourceRequest = googleBusinessProfileSourceRequest{
				APIBaseURL: creds.ReviewsAPIBase,
				Path:       path,
				Request: map[string]any{
					"query": currentQuery.Encode(),
				},
			}
		}
		reviews = append(reviews, response.Reviews...)
		if strings.TrimSpace(response.NextPageToken) == "" {
			break
		}
		pageToken = response.NextPageToken
	}

	return reviews, sourceRequest, nil
}

func googleBusinessProfileJSONRequest(ctx context.Context, creds googleBusinessProfileCredentials, method string, baseURL string, path string, query url.Values, body any, target any) error {
	accessToken, err := fetchGoogleAccessToken(ctx, creds)
	if err != nil {
		return err
	}

	fullURL := strings.TrimRight(baseURL, "/") + path
	if query != nil && len(query) > 0 {
		fullURL += "?" + query.Encode()
	}

	var bodyReader io.Reader
	if body != nil {
		raw, marshalErr := json.Marshal(body)
		if marshalErr != nil {
			return marshalErr
		}
		bodyReader = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, fullURL, bodyReader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	res, err := googleBusinessProfileHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	payload, _ := io.ReadAll(io.LimitReader(res.Body, maxResponseBodyBytes))
	payloadText := strings.TrimSpace(string(payload))
	if res.StatusCode >= 400 {
		return fmt.Errorf("google business profile request failed (%d): %s", res.StatusCode, payloadText)
	}
	if target == nil || len(payload) == 0 {
		return nil
	}
	if err := json.Unmarshal(payload, target); err != nil {
		return fmt.Errorf("parse google business profile response: %w", err)
	}
	return nil
}

func fetchGoogleAccessToken(ctx context.Context, creds googleBusinessProfileCredentials) (string, error) {
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

	res, err := googleBusinessProfileHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("google oauth refresh failed: %w", err)
	}
	defer res.Body.Close()

	payload, _ := io.ReadAll(io.LimitReader(res.Body, maxResponseBodyBytes))
	payloadText := strings.TrimSpace(string(payload))
	if res.StatusCode >= 400 {
		return "", fmt.Errorf("google oauth refresh failed (%d): %s", res.StatusCode, payloadText)
	}

	var response struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := json.Unmarshal(payload, &response); err != nil {
		return "", fmt.Errorf("parse google oauth refresh response: %w", err)
	}
	if strings.TrimSpace(response.AccessToken) == "" {
		return "", errors.New("google oauth refresh returned empty access_token")
	}

	expiry := defaultOAuthAccessTokenTTL
	if response.ExpiresIn > 60 {
		expiry = time.Duration(response.ExpiresIn-60) * time.Second
	}
	googleAccessTokenCached = &googleAccessTokenCache{
		AccessToken:  response.AccessToken,
		ExpiresAt:    time.Now().Add(expiry),
		ClientID:     creds.ClientID,
		ClientSecret: creds.ClientSecret,
		RefreshToken: creds.RefreshToken,
	}
	return response.AccessToken, nil
}

func buildGoogleBusinessProfileAccountRecord(creds googleBusinessProfileCredentials, family googleBusinessProfileRowFamily, accountRow map[string]any, sourceRequest googleBusinessProfileSourceRequest) nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(creds.ConnectionID)
	if err != nil {
		return nexadapter.AdapterInboundRecord{}
	}

	accountName := accountResourceName(accountRow)
	accountID := strings.TrimPrefix(accountName, "accounts/")
	if accountID == "" {
		return nexadapter.AdapterInboundRecord{}
	}

	row := normalizedAccountRow(accountRow)
	revision := revisionHash(row)
	threadID := fmt.Sprintf("%s:account:%s", platformID, accountID)
	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       adapterName,
			Platform:      platformID,
			ConnectionID:  connectionID,
			SenderID:      platformID,
			SenderName:    "Google Business Profile",
			ReceiverID:    connectionID,
			ContainerKind: "group",
			ContainerID:   family.ID,
			ContainerName: family.ContainerName,
			ThreadID:      threadID,
			ThreadName:    firstNonBlank(stringField(accountRow, "accountName"), accountID),
			Metadata: map[string]any{
				"family": family.ID,
				"grain":  "account",
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("%s:%s:account_snapshot:%s:%s", platformID, nexadapter.SafeIDToken(connectionID), accountID, revision),
			Timestamp:        time.Now().UTC().UnixMilli(),
			Content:          fmt.Sprintf("account %s visible via Google Business Profile", firstNonBlank(stringField(accountRow, "accountName"), accountID)),
			ContentType:      "text",
			Metadata: map[string]any{
				"connection_id":       connectionID,
				"adapter_id":          platformID,
				"family":              family.ID,
				"logical_row_id":      accountName,
				"revision_hash":       revision,
				"provider_ids":        map[string]any{"account_id": accountID, "account_name": accountName},
				"row":                 row,
				"raw_provider_payload": compactMap(accountRow),
				"source_request":      sourceRequest.metadata(),
			},
		},
	}
}

func buildGoogleBusinessProfileLocationRecord(creds googleBusinessProfileCredentials, family googleBusinessProfileRowFamily, accountRow map[string]any, locationRow map[string]any, sourceRequest googleBusinessProfileSourceRequest) nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(creds.ConnectionID)
	if err != nil {
		return nexadapter.AdapterInboundRecord{}
	}

	accountName := accountResourceName(accountRow)
	accountID := strings.TrimPrefix(accountName, "accounts/")
	locationName := locationResourceName(locationRow)
	locationID := strings.TrimPrefix(locationName, "locations/")
	if locationID == "" {
		return nexadapter.AdapterInboundRecord{}
	}

	row := normalizedLocationRow(accountID, locationRow)
	revision := revisionHash(row)
	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       adapterName,
			Platform:      platformID,
			ConnectionID:  connectionID,
			SenderID:      platformID,
			SenderName:    "Google Business Profile",
			ReceiverID:    connectionID,
			ContainerKind: "group",
			ContainerID:   family.ID,
			ContainerName: family.ContainerName,
			ThreadID:      fmt.Sprintf("%s:location:%s", platformID, locationID),
			ThreadName:    firstNonBlank(stringField(locationRow, "title"), locationID),
			Metadata: map[string]any{
				"family": family.ID,
				"grain":  "location",
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("%s:%s:location_snapshot:%s:%s", platformID, nexadapter.SafeIDToken(connectionID), locationID, revision),
			Timestamp:        time.Now().UTC().UnixMilli(),
			Content:          fmt.Sprintf("location %s profile snapshot", firstNonBlank(stringField(locationRow, "title"), locationID)),
			ContentType:      "text",
			Metadata: map[string]any{
				"connection_id":       connectionID,
				"adapter_id":          platformID,
				"family":              family.ID,
				"logical_row_id":      locationName,
				"revision_hash":       revision,
				"provider_ids":        map[string]any{"account_id": accountID, "location_name": locationName, "location_id": locationID},
				"row":                 row,
				"raw_provider_payload": compactMap(locationRow),
				"source_request":      sourceRequest.metadata(),
			},
		},
	}
}

func buildGoogleBusinessProfilePerformanceRecords(creds googleBusinessProfileCredentials, family googleBusinessProfileRowFamily, accountRow map[string]any, locationRow map[string]any, response googleBusinessProfilePerformanceResponse, sourceRequest googleBusinessProfileSourceRequest) []nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(creds.ConnectionID)
	if err != nil {
		return nil
	}

	accountID := strings.TrimPrefix(accountResourceName(accountRow), "accounts/")
	locationName := locationResourceName(locationRow)
	locationID := strings.TrimPrefix(locationName, "locations/")
	if locationID == "" {
		return nil
	}

	pivotRows := map[string]map[string]any{}
	rawRows := map[string]map[string]any{}
	for _, multiSeries := range response.MultiDailyMetricTimeSeries {
		for _, series := range multiSeries.DailyMetricTimeSeries {
			metricKey := metricKey(series.DailyMetric)
			for _, datedValue := range series.TimeSeries.DatedValues {
				dateText := formatGoogleBusinessProfileDate(datedValue.Date)
				if dateText == "" {
					continue
				}
				if _, ok := pivotRows[dateText]; !ok {
					pivotRows[dateText] = map[string]any{
						"account_id":    accountID,
						"location_name": locationName,
						"location_id":   locationID,
						"date":          dateText,
					}
				}
				if _, ok := rawRows[dateText]; !ok {
					rawRows[dateText] = map[string]any{
						"account_id":    accountID,
						"location_name": locationName,
						"location_id":   locationID,
						"date":          dateText,
						"metrics":       map[string]any{},
					}
				}
				value := datedValue.Value
				if value == 0 && datedValue.Threshold > 0 {
					value = datedValue.Threshold
				}
				pivotRows[dateText][metricKey] = value
				metrics := rawRows[dateText]["metrics"].(map[string]any)
				metrics[series.DailyMetric] = map[string]any{
					"value":     value,
					"threshold": datedValue.Threshold,
				}
			}
		}
	}

	dates := make([]string, 0, len(pivotRows))
	for dateText := range pivotRows {
		dates = append(dates, dateText)
	}
	sort.Strings(dates)

	records := make([]nexadapter.AdapterInboundRecord, 0, len(dates))
	for _, dateText := range dates {
		row := compactMap(pivotRows[dateText])
		raw := compactMap(rawRows[dateText])
		revision := revisionHash(row)
		record := nexadapter.AdapterInboundRecord{
			Operation: "record.ingest",
			Routing: nexadapter.AdapterInboundRouting{
				Adapter:       adapterName,
				Platform:      platformID,
				ConnectionID:  connectionID,
				SenderID:      platformID,
				SenderName:    "Google Business Profile",
				ReceiverID:    connectionID,
				ContainerKind: "group",
				ContainerID:   family.ID,
				ContainerName: family.ContainerName,
				ThreadID:      fmt.Sprintf("%s:location:%s", platformID, locationID),
				ThreadName:    firstNonBlank(stringField(locationRow, "title"), locationID),
				Metadata: map[string]any{
					"family": family.ID,
					"grain":  "location+date",
				},
			},
			Payload: nexadapter.AdapterInboundPayload{
				ExternalRecordID: fmt.Sprintf("%s:%s:location_performance_daily:%s:%s:%s", platformID, nexadapter.SafeIDToken(connectionID), locationID, nexadapter.SafeIDToken(dateText), revision),
				Timestamp:        nexadapter.MetricTimestamp(dateText, nil),
				Content:          fmt.Sprintf("location performance %s date=%s", firstNonBlank(stringField(locationRow, "title"), locationID), dateText),
				ContentType:      "text",
				Metadata: map[string]any{
					"connection_id":       connectionID,
					"adapter_id":          platformID,
					"family":              family.ID,
					"logical_row_id":      locationName + ":" + dateText,
					"revision_hash":       revision,
					"provider_ids":        map[string]any{"account_id": accountID, "location_name": locationName, "location_id": locationID, "date": dateText},
					"row":                 row,
					"raw_provider_payload": raw,
					"source_request":      sourceRequest.metadata(),
				},
			},
		}
		records = append(records, record)
	}

	return records
}

func buildGoogleBusinessProfileReviewRecord(creds googleBusinessProfileCredentials, family googleBusinessProfileRowFamily, accountRow map[string]any, locationRow map[string]any, reviewRow map[string]any, sourceRequest googleBusinessProfileSourceRequest) nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(creds.ConnectionID)
	if err != nil {
		return nexadapter.AdapterInboundRecord{}
	}

	accountID := strings.TrimPrefix(accountResourceName(accountRow), "accounts/")
	locationName := locationResourceName(locationRow)
	locationID := strings.TrimPrefix(locationName, "locations/")
	reviewID := reviewResourceID(reviewRow)
	if reviewID == "" {
		return nexadapter.AdapterInboundRecord{}
	}

	row := normalizedReviewRow(accountID, locationName, locationID, reviewRow)
	revision := revisionHash(row)
	recordTime := parseRFC3339(stringField(reviewRow, "updateTime"))
	if recordTime.IsZero() {
		recordTime = parseRFC3339(stringField(reviewRow, "createTime"))
	}
	if recordTime.IsZero() {
		recordTime = time.Now().UTC()
	}

	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       adapterName,
			Platform:      platformID,
			ConnectionID:  connectionID,
			SenderID:      platformID,
			SenderName:    "Google Business Profile",
			ReceiverID:    connectionID,
			ContainerKind: "group",
			ContainerID:   family.ID,
			ContainerName: family.ContainerName,
			ThreadID:      fmt.Sprintf("%s:location:%s", platformID, locationID),
			ThreadName:    firstNonBlank(stringField(locationRow, "title"), locationID),
			Metadata: map[string]any{
				"family": family.ID,
				"grain":  "review",
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("%s:%s:review_snapshot:%s:%s:%s", platformID, nexadapter.SafeIDToken(connectionID), locationID, nexadapter.SafeIDToken(reviewID), revision),
			Timestamp:        recordTime.UnixMilli(),
			Content:          fmt.Sprintf("review %s stars=%s", reviewID, firstNonBlank(stringField(reviewRow, "starRating"), "unknown")),
			ContentType:      "text",
			Metadata: map[string]any{
				"connection_id":       connectionID,
				"adapter_id":          platformID,
				"family":              family.ID,
				"logical_row_id":      locationName + ":" + reviewID,
				"revision_hash":       revision,
				"provider_ids":        map[string]any{"account_id": accountID, "location_name": locationName, "location_id": locationID, "review_id": reviewID},
				"row":                 row,
				"raw_provider_payload": compactMap(reviewRow),
				"source_request":      sourceRequest.metadata(),
			},
		},
	}
}

func normalizedAccountRow(accountRow map[string]any) map[string]any {
	accountName := accountResourceName(accountRow)
	return compactMap(map[string]any{
		"account_name":         accountName,
		"account_id":           strings.TrimPrefix(accountName, "accounts/"),
		"display_name":         firstNonBlank(stringField(accountRow, "accountName"), accountName),
		"account_type":         stringField(accountRow, "type"),
		"role":                 stringField(accountRow, "role"),
		"verification_state":   stringField(accountRow, "verificationState"),
		"vetted_state":         stringField(accountRow, "vettedState"),
	})
}

func normalizedLocationRow(accountID string, locationRow map[string]any) map[string]any {
	locationName := locationResourceName(locationRow)
	return compactMap(map[string]any{
		"account_id":           accountID,
		"location_name":        locationName,
		"location_id":          strings.TrimPrefix(locationName, "locations/"),
		"title":                stringField(locationRow, "title"),
		"store_code":           stringField(locationRow, "storeCode"),
		"website_uri":          stringField(locationRow, "websiteUri"),
		"metadata":             mapField(locationRow, "metadata"),
		"open_info":            mapField(locationRow, "openInfo"),
		"latlng":               mapField(locationRow, "latlng"),
		"storefront_address":   mapField(locationRow, "storefrontAddress"),
		"phone_numbers":        mapField(locationRow, "phoneNumbers"),
		"primary_category":     mapField(locationRow, "primaryCategory"),
	})
}

func normalizedReviewRow(accountID string, locationName string, locationID string, reviewRow map[string]any) map[string]any {
	reply := mapField(reviewRow, "reviewReply")
	reviewer := mapField(reviewRow, "reviewer")
	return compactMap(map[string]any{
		"account_id":                accountID,
		"location_name":             locationName,
		"location_id":               locationID,
		"review_id":                 reviewResourceID(reviewRow),
		"star_rating":               stringField(reviewRow, "starRating"),
		"comment":                   stringField(reviewRow, "comment"),
		"create_time":               stringField(reviewRow, "createTime"),
		"update_time":               stringField(reviewRow, "updateTime"),
		"reviewer":                  compactMap(reviewer),
		"review_reply_comment":      stringField(reply, "comment"),
		"review_reply_update_time":  stringField(reply, "updateTime"),
	})
}

func performanceWindow(since time.Time, asOf time.Time, mode googleBusinessProfileSyncMode) (time.Time, time.Time) {
	since = since.UTC()
	asOf = asOf.UTC()
	if since.IsZero() {
		since = asOf.Add(-performanceReplayWindow)
	}
	if mode == googleBusinessProfileSyncModeMonitor {
		replayStart := asOf.Add(-performanceReplayWindow)
		if replayStart.After(since) {
			since = replayStart
		}
	}
	return midnightUTC(since), midnightUTC(asOf)
}

func resolveGoogleBusinessProfileCredentials(account string) (googleBusinessProfileCredentials, error) {
	account, err := nexadapter.RequireConnection(account)
	if err != nil {
		return googleBusinessProfileCredentials{}, err
	}

	runtimeContext, err := nexadapter.LoadRuntimeContextFromEnv()
	if err != nil || runtimeContext == nil || runtimeContext.Credential == nil {
		return googleBusinessProfileCredentials{}, errors.New("missing google business profile runtime credential")
	}
	if strings.TrimSpace(runtimeContext.ConnectionID) != "" {
		account = runtimeContext.ConnectionID
	}

	fields := runtimeContext.Credential.Fields
	creds := googleBusinessProfileCredentials{
		ConnectionID: account,
		CredentialRef: firstNonBlank(
			runtimeContext.Credential.Ref,
			platformID+"/"+account,
		),
		AccountID: normalizeAccountResourceName(firstNonBlank(
			nexadapter.FieldValue(fields, "account_id"),
			nexadapter.FieldValue(fields, "accountId"),
			os.Getenv("NEXUS_GBP_ACCOUNT_ID"),
			os.Getenv("GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID"),
		)),
		LocationID: normalizeLocationResourceName(firstNonBlank(
			nexadapter.FieldValue(fields, "location_id"),
			nexadapter.FieldValue(fields, "locationId"),
			os.Getenv("NEXUS_GBP_LOCATION_ID"),
			os.Getenv("GOOGLE_BUSINESS_PROFILE_LOCATION_ID"),
		)),
		ClientID: firstNonBlank(
			nexadapter.FieldValue(fields, "oauth_client_id"),
			nexadapter.FieldValue(fields, "oauthClientId"),
			nexadapter.FieldValue(fields, "client_id"),
			os.Getenv("NEXUS_GBP_OAUTH_CLIENT_ID"),
			os.Getenv("GOOGLE_BUSINESS_PROFILE_OAUTH_CLIENT_ID"),
			os.Getenv("GOOGLE_ADS_OAUTH_CLIENT_ID"),
		),
		ClientSecret: firstNonBlank(
			nexadapter.FieldValue(fields, "oauth_client_secret"),
			nexadapter.FieldValue(fields, "oauthClientSecret"),
			nexadapter.FieldValue(fields, "client_secret"),
			os.Getenv("NEXUS_GBP_OAUTH_CLIENT_SECRET"),
			os.Getenv("GOOGLE_BUSINESS_PROFILE_OAUTH_CLIENT_SECRET"),
			os.Getenv("GOOGLE_ADS_OAUTH_CLIENT_SECRET"),
		),
		RefreshToken: firstNonBlank(
			nexadapter.FieldValue(fields, "oauth_refresh_token"),
			nexadapter.FieldValue(fields, "oauthRefreshToken"),
			nexadapter.FieldValue(fields, "refresh_token"),
			runtimeContext.Credential.Value,
			os.Getenv("NEXUS_GBP_OAUTH_REFRESH_TOKEN"),
			os.Getenv("GOOGLE_BUSINESS_PROFILE_OAUTH_REFRESH_TOKEN"),
			os.Getenv("GOOGLE_ADS_OAUTH_REFRESH_TOKEN"),
		),
		AccountManagementAPIBase: firstNonBlank(
			nexadapter.FieldValue(fields, "account_management_api_base"),
			os.Getenv("NEXUS_GBP_ACCOUNT_MANAGEMENT_API_BASE"),
			defaultAccountManagementAPI,
		),
		BusinessInfoAPIBase: firstNonBlank(
			nexadapter.FieldValue(fields, "business_info_api_base"),
			os.Getenv("NEXUS_GBP_BUSINESS_INFO_API_BASE"),
			defaultBusinessInfoAPI,
		),
		PerformanceAPIBase: firstNonBlank(
			nexadapter.FieldValue(fields, "performance_api_base"),
			os.Getenv("NEXUS_GBP_PERFORMANCE_API_BASE"),
			defaultPerformanceAPI,
		),
		ReviewsAPIBase: firstNonBlank(
			nexadapter.FieldValue(fields, "reviews_api_base"),
			os.Getenv("NEXUS_GBP_REVIEWS_API_BASE"),
			defaultReviewsAPI,
		),
	}

	switch {
	case strings.TrimSpace(creds.ClientID) == "":
		return googleBusinessProfileCredentials{}, errors.New("missing oauth_client_id credential field")
	case strings.TrimSpace(creds.ClientSecret) == "":
		return googleBusinessProfileCredentials{}, errors.New("missing oauth_client_secret credential field")
	case strings.TrimSpace(creds.RefreshToken) == "":
		return googleBusinessProfileCredentials{}, errors.New("missing oauth_refresh_token credential field")
	}

	return creds, nil
}

func accountResourceName(accountRow map[string]any) string {
	return normalizeAccountResourceName(stringField(accountRow, "name"))
}

func locationResourceName(locationRow map[string]any) string {
	return normalizeLocationResourceName(stringField(locationRow, "name"))
}

func filterAccounts(accounts []map[string]any, filter string) []map[string]any {
	filter = normalizeAccountResourceName(filter)
	if filter == "" {
		return accounts
	}
	filtered := make([]map[string]any, 0, len(accounts))
	for _, accountRow := range accounts {
		if accountResourceName(accountRow) == filter {
			filtered = append(filtered, accountRow)
		}
	}
	return filtered
}

func filterLocations(locations []map[string]any, filter string) []map[string]any {
	filter = normalizeLocationResourceName(filter)
	if filter == "" {
		return locations
	}
	filtered := make([]map[string]any, 0, len(locations))
	for _, locationRow := range locations {
		if locationResourceName(locationRow) == filter {
			filtered = append(filtered, locationRow)
		}
	}
	return filtered
}

func collectAccountIDs(accounts []map[string]any) []string {
	ids := make([]string, 0, len(accounts))
	for _, accountRow := range accounts {
		accountName := accountResourceName(accountRow)
		if accountName == "" {
			continue
		}
		ids = append(ids, strings.TrimPrefix(accountName, "accounts/"))
	}
	return uniqueStrings(ids)
}

func reviewResourceID(reviewRow map[string]any) string {
	if id := stringField(reviewRow, "reviewId"); id != "" {
		return id
	}
	resourceName := stringField(reviewRow, "name")
	if resourceName == "" {
		return ""
	}
	parts := strings.Split(strings.Trim(resourceName, "/"), "/")
	return parts[len(parts)-1]
}

func metricKey(metric string) string {
	metric = strings.TrimSpace(metric)
	if metric == "" {
		return ""
	}
	return strings.ToLower(strings.ReplaceAll(metric, " ", "_"))
}

func normalizeAccountResourceName(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "accounts/") {
		return raw
	}
	return "accounts/" + raw
}

func normalizeLocationResourceName(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "locations/") {
		return raw
	}
	return "locations/" + raw
}

func formatGoogleBusinessProfileDate(value googleBusinessProfileDate) string {
	if value.Year == 0 || value.Month == 0 {
		return ""
	}
	day := value.Day
	if day == 0 {
		day = 1
	}
	return fmt.Sprintf("%04d-%02d-%02d", value.Year, value.Month, day)
}

func parseRFC3339(value string) time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}
	}
	return parsed.UTC()
}

func midnightUTC(value time.Time) time.Time {
	if value.IsZero() {
		return time.Time{}
	}
	value = value.UTC()
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, time.UTC)
}

func cloneValues(values url.Values) url.Values {
	cloned := url.Values{}
	for key, items := range values {
		for _, item := range items {
			cloned.Add(key, item)
		}
	}
	return cloned
}

func stringField(source map[string]any, key string) string {
	if source == nil {
		return ""
	}
	switch typed := source[key].(type) {
	case string:
		return strings.TrimSpace(typed)
	case float64:
		return strconv.FormatInt(int64(typed), 10)
	case int64:
		return strconv.FormatInt(typed, 10)
	case int:
		return strconv.Itoa(typed)
	default:
		return ""
	}
}

func mapField(source map[string]any, key string) map[string]any {
	if source == nil {
		return map[string]any{}
	}
	typed, ok := source[key].(map[string]any)
	if !ok || typed == nil {
		return map[string]any{}
	}
	return compactMap(typed)
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func compactMap(input map[string]any) map[string]any {
	out := map[string]any{}
	for key, value := range input {
		switch typed := value.(type) {
		case nil:
			continue
		case string:
			if strings.TrimSpace(typed) == "" {
				continue
			}
			out[key] = typed
		case []string:
			if len(typed) == 0 {
				continue
			}
			values := make([]any, 0, len(typed))
			for _, item := range typed {
				if strings.TrimSpace(item) != "" {
					values = append(values, item)
				}
			}
			if len(values) > 0 {
				out[key] = values
			}
		case []any:
			if len(typed) == 0 {
				continue
			}
			out[key] = typed
		case map[string]any:
			if len(typed) == 0 {
				continue
			}
			out[key] = compactMap(typed)
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
			out[key] = typed
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

func revisionHash(value any) string {
	body, err := json.Marshal(value)
	if err != nil {
		return "unhashable"
	}
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:8])
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
	}
	sort.Strings(out)
	return out
}

func (r googleBusinessProfileSourceRequest) metadata() map[string]any {
	return compactMap(map[string]any{
		"api_base_url": r.APIBaseURL,
		"path":         r.Path,
		"request":      r.Request,
	})
}
