package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestInfoDeclaresExpectedOperationsAndProjection(t *testing.T) {
	result, err := info(context.Background())
	if err != nil {
		t.Fatalf("info: %v", err)
	}

	if result.Platform != platformID {
		t.Fatalf("platform mismatch: %q", result.Platform)
	}
	if result.Name != adapterName {
		t.Fatalf("name mismatch: %q", result.Name)
	}
	if result.CredentialService != "google-ads" {
		t.Fatalf("credential service mismatch: %q", result.CredentialService)
	}
	if result.MethodCatalog == nil || result.MethodCatalog.Document != "api/openapi.yaml" || result.MethodCatalog.Namespace != platformID {
		t.Fatalf("method catalog mismatch: %#v", result.MethodCatalog)
	}
	if result.Projection == nil || len(result.Projection.Families) != len(googleRowFamilies) {
		t.Fatalf("projection mismatch: %#v", result.Projection)
	}

	required := map[string]bool{
		"adapter.info":             false,
		"adapter.health":           false,
		"adapter.connections.list": false,
		"adapter.monitor.start":    false,
		"records.backfill":         false,
	}
	for _, op := range result.Operations {
		if _, ok := required[string(op)]; ok {
			required[string(op)] = true
		}
	}
	for op, seen := range required {
		if !seen {
			t.Fatalf("missing operation %s", op)
		}
	}
	if len(result.Methods) != 3 {
		t.Fatalf("expected 3 public provider-native methods, got %#v", result.Methods)
	}
	methods := map[string]bool{
		"google-ads.customers.accessible.list":     false,
		"google-ads.customers.get":                 false,
		"google-ads.reporting.campaign_daily.list": false,
	}
	for _, method := range result.Methods {
		if _, ok := methods[method.Name]; ok {
			methods[method.Name] = true
		}
	}
	for method, seen := range methods {
		if !seen {
			t.Fatalf("missing method %s", method)
		}
	}
}

func TestGoogleAdsAccessibleCustomersListMethod(t *testing.T) {
	t.Cleanup(resetGoogleAdsGlobals)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"access-token","expires_in":3600}`))
		case "/v22/customers:listAccessibleCustomers":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"resourceNames":["customers/1234567890","customers/2223334444"]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	googleAdsHTTPClient = server.Client()
	googleOAuthTokenURL = server.URL + "/token"

	setGoogleRuntimeContext(t, googleRuntimeContextPayload(server.URL+"/v22"))

	result, err := googleAdsAccessibleCustomersListMethod(
		nexadapter.AdapterContext[struct{}]{Context: context.Background(), ConnectionID: "google-ads-primary"},
		nexadapter.AdapterMethodRequest{ConnectionID: "google-ads-primary"},
	)
	if err != nil {
		t.Fatalf("googleAdsAccessibleCustomersListMethod: %v", err)
	}
	payload, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("unexpected payload type: %#v", result)
	}
	customerIDs, ok := payload["customer_ids"].([]string)
	if !ok {
		t.Fatalf("unexpected customer_ids payload: %#v", payload["customer_ids"])
	}
	if len(customerIDs) != 2 || customerIDs[0] != "1234567890" || customerIDs[1] != "2223334444" {
		t.Fatalf("unexpected customer_ids: %#v", customerIDs)
	}
}

func TestGoogleAdsCustomerGetMethod(t *testing.T) {
	t.Cleanup(resetGoogleAdsGlobals)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"access-token","expires_in":3600}`))
		case "/v22/customers/2223334444/googleAds:searchStream":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[
				{"results":[{"customer":{"id":"2223334444","descriptiveName":"Secondary Account","currencyCode":"USD","timeZone":"America/Chicago"}}]}
			]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	googleAdsHTTPClient = server.Client()
	googleOAuthTokenURL = server.URL + "/token"

	setGoogleRuntimeContext(t, googleRuntimeContextPayload(server.URL+"/v22"))

	result, err := googleAdsCustomerGetMethod(
		nexadapter.AdapterContext[struct{}]{Context: context.Background(), ConnectionID: "google-ads-primary"},
		nexadapter.AdapterMethodRequest{
			ConnectionID: "google-ads-primary",
			Payload:      map[string]any{"customer_id": "222-333-4444"},
		},
	)
	if err != nil {
		t.Fatalf("googleAdsCustomerGetMethod: %v", err)
	}
	payload, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("unexpected payload type: %#v", result)
	}
	customer, ok := payload["customer"].(map[string]any)
	if !ok {
		t.Fatalf("unexpected customer payload: %#v", payload["customer"])
	}
	if got := customer["customer_id"]; got != "2223334444" {
		t.Fatalf("unexpected customer_id: %#v", got)
	}
	if got := customer["customer_name"]; got != "Secondary Account" {
		t.Fatalf("unexpected customer_name: %#v", got)
	}
}

func TestGoogleAdsCampaignDailyListMethod(t *testing.T) {
	t.Cleanup(resetGoogleAdsGlobals)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"access-token","expires_in":3600}`))
		case "/v22/customers/1234567890/googleAds:searchStream":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[
				{"results":[{"campaign":{"id":"cmp-1","name":"Brand Search","status":"ENABLED","advertisingChannelType":"SEARCH"},"metrics":{"impressions":"1000","clicks":"80","costMicros":"1500000","conversions":"5","conversionsValue":"1000"},"segments":{"date":"2026-03-29"}}]}
			]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	googleAdsHTTPClient = server.Client()
	googleOAuthTokenURL = server.URL + "/token"

	setGoogleRuntimeContext(t, googleRuntimeContextPayload(server.URL+"/v22"))

	result, err := googleAdsCampaignDailyListMethod(
		nexadapter.AdapterContext[struct{}]{Context: context.Background(), ConnectionID: "google-ads-primary"},
		nexadapter.AdapterMethodRequest{
			ConnectionID: "google-ads-primary",
			Payload: map[string]any{
				"since": "2026-03-29",
				"until": "2026-03-29",
			},
		},
	)
	if err != nil {
		t.Fatalf("googleAdsCampaignDailyListMethod: %v", err)
	}
	payload, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("unexpected payload type: %#v", result)
	}
	rows, ok := payload["rows"].([]map[string]any)
	if !ok {
		rawRows, ok := payload["rows"].([]any)
		if !ok {
			t.Fatalf("unexpected rows payload: %#v", payload["rows"])
		}
		rows = make([]map[string]any, 0, len(rawRows))
		for _, raw := range rawRows {
			row, ok := raw.(map[string]any)
			if !ok {
				t.Fatalf("unexpected row payload: %#v", raw)
			}
			rows = append(rows, row)
		}
	}
	if len(rows) != 1 {
		t.Fatalf("unexpected rows length: %d", len(rows))
	}
	row, ok := rows[0]["row"].(map[string]any)
	if !ok {
		t.Fatalf("unexpected row payload: %#v", rows[0]["row"])
	}
	if got := row["campaign_id"]; got != "cmp-1" {
		t.Fatalf("unexpected campaign_id: %#v", got)
	}
	derived, ok := rows[0]["derived"].(map[string]any)
	if !ok {
		t.Fatalf("unexpected derived payload: %#v", rows[0]["derived"])
	}
	if got := derived["cost"]; got != 1.5 {
		t.Fatalf("unexpected cost: %#v", got)
	}
}

func TestBuildGoogleCampaignDailyRecord(t *testing.T) {
	record := buildGoogleCampaignDailyRecord(
		googleAdsCredentials{
			ConnectionID: "google-ads-primary",
			CustomerID:   "1234567890",
		},
		googleRowFamily{ID: "campaign_daily", ContainerName: "Campaign Daily"},
		googleCampaignReportRow{
			Campaign: googleCampaign{
				ID:                     "999",
				Name:                   "Brand Search",
				Status:                 "ENABLED",
				AdvertisingChannelType: "SEARCH",
			},
			Metrics: googleMetrics{
				Impressions:      "1000",
				Clicks:           "80",
				CostMicros:       "1500000",
				Conversions:      "5",
				ConversionsValue: "1000",
			},
			Segments: googleSegments{
				Date: "2026-03-29",
			},
		},
		googleSourceRequest{
			APIBaseURL: "https://googleads.googleapis.com/v22",
			Path:       "/customers/1234567890/googleAds:searchStream",
			Request: map[string]any{
				"gaql": "SELECT ...",
			},
		},
	)

	if record.Operation != "record.ingest" {
		t.Fatalf("unexpected operation: %q", record.Operation)
	}
	if record.Routing.Platform != platformID {
		t.Fatalf("unexpected platform: %q", record.Routing.Platform)
	}
	if record.Routing.ContainerID != "campaign_daily" {
		t.Fatalf("unexpected container id: %q", record.Routing.ContainerID)
	}
	if record.Routing.ThreadID != "1234567890:campaign:999" {
		t.Fatalf("unexpected thread id: %q", record.Routing.ThreadID)
	}

	metadata := record.Payload.Metadata
	if metadata["family"] != "campaign_daily" {
		t.Fatalf("unexpected family metadata: %#v", metadata["family"])
	}
	derived, ok := metadata["derived"].(map[string]any)
	if !ok {
		t.Fatalf("expected derived map, got %#v", metadata["derived"])
	}
	if got := derived["cost"]; got != 1.5 {
		t.Fatalf("unexpected derived cost: %#v", got)
	}
	if got := derived["conversions"]; got != 5.0 {
		t.Fatalf("unexpected derived conversions: %#v", got)
	}
	if got := derived["landing_page_views"]; got != 80.0 {
		t.Fatalf("unexpected derived landing_page_views: %#v", got)
	}
}

func TestPlanGoogleFamilyWindows(t *testing.T) {
	since := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	asOf := time.Date(2026, 3, 30, 12, 0, 0, 0, time.UTC)

	backfillPlans := planGoogleFamilyWindows(since, asOf, googleSyncModeBackfill)
	monitorPlans := planGoogleFamilyWindows(since, asOf, googleSyncModeMonitor)

	var backfillHourly googleFamilyWindow
	var backfillDaily googleFamilyWindow
	var monitorHourly googleFamilyWindow
	for _, plan := range backfillPlans {
		switch plan.Family.ID {
		case "campaign_hourly":
			backfillHourly = plan
		case "campaign_daily":
			backfillDaily = plan
		}
	}
	for _, plan := range monitorPlans {
		if plan.Family.ID == "campaign_hourly" {
			monitorHourly = plan
		}
	}

	wantBackfillHourlyStart := asOf.Add(-hourlyReplayWindow)
	if !backfillHourly.FilterStart.Equal(wantBackfillHourlyStart) {
		t.Fatalf("unexpected backfill hourly start: got %s want %s", backfillHourly.FilterStart, wantBackfillHourlyStart)
	}
	if backfillDaily.RequestSince != since.Format(dateLayout) {
		t.Fatalf("unexpected backfill daily requestSince: %q", backfillDaily.RequestSince)
	}
	if !monitorHourly.FilterStart.Equal(since) {
		t.Fatalf("unexpected monitor hourly start: got %s want %s", monitorHourly.FilterStart, since)
	}
}

func TestFetchAccessibleCustomerIDs_RetriesWithoutLoginHeader(t *testing.T) {
	t.Cleanup(resetGoogleAdsGlobals)

	var requestCount int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"access-token","expires_in":3600}`))
		case "/v22/customers:listAccessibleCustomers":
			count := atomic.AddInt32(&requestCount, 1)
			if count == 1 && r.Header.Get("login-customer-id") != "" {
				http.Error(w, `{"error":{"message":"USER_PERMISSION_DENIED"}}`, http.StatusForbidden)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"resourceNames":["customers/1234567890","customers/2223334444","customers/1234567890"]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	googleAdsHTTPClient = server.Client()
	googleOAuthTokenURL = server.URL + "/token"

	customerIDs, err := fetchAccessibleCustomerIDs(context.Background(), googleAdsCredentials{
		ConnectionID:    "google-ads-primary",
		DeveloperToken:  "developer-token",
		CustomerID:      "1234567890",
		LoginCustomerID: "9998887776",
		ClientID:        "client-id",
		ClientSecret:    "client-secret",
		RefreshToken:    "refresh-token",
		APIBaseURL:      server.URL + "/v22",
	})
	if err != nil {
		t.Fatalf("fetchAccessibleCustomerIDs: %v", err)
	}
	if len(customerIDs) != 2 {
		t.Fatalf("expected 2 unique customer ids, got %d", len(customerIDs))
	}
	if customerIDs[0] != "1234567890" || customerIDs[1] != "2223334444" {
		t.Fatalf("unexpected customer ids: %#v", customerIDs)
	}
	if got := atomic.LoadInt32(&requestCount); got != 2 {
		t.Fatalf("expected 2 requests due to retry, got %d", got)
	}
}

func TestHealth_SkipsAccessibleCustomersLookup(t *testing.T) {
	t.Cleanup(resetGoogleAdsGlobals)

	var tokenRequests int32
	var summaryRequests int32
	var accessibleLookupRequests int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			atomic.AddInt32(&tokenRequests, 1)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"access-token","expires_in":3600}`))
		case "/v22/customers/1234567890/googleAds:searchStream":
			atomic.AddInt32(&summaryRequests, 1)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[
				{"results":[{"customer":{"id":"1234567890","descriptiveName":"Primary Account","currencyCode":"USD","timeZone":"America/Chicago"}}]}
			]`))
		case "/v22/customers:listAccessibleCustomers":
			atomic.AddInt32(&accessibleLookupRequests, 1)
			http.Error(w, `{"error":{"message":"RESOURCE_EXHAUSTED"}}`, http.StatusTooManyRequests)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	googleAdsHTTPClient = server.Client()
	googleOAuthTokenURL = server.URL + "/token"
	setGoogleRuntimeContext(t, googleRuntimeContextPayload(server.URL+"/v22"))

	result, err := health(context.Background(), "google-ads-primary")
	if err != nil {
		t.Fatalf("health: %v", err)
	}
	if !result.Connected {
		t.Fatalf("expected connected health result, got %#v", result)
	}
	if got := atomic.LoadInt32(&tokenRequests); got != 0 {
		t.Fatalf("expected health to skip oauth token refresh, got %d requests", got)
	}
	if got := atomic.LoadInt32(&summaryRequests); got != 0 {
		t.Fatalf("expected health to skip customer summary lookup, got %d requests", got)
	}
	if got := atomic.LoadInt32(&accessibleLookupRequests); got != 0 {
		t.Fatalf("expected health to skip accessible customer lookup, got %d requests", got)
	}
	if got := result.Details["health_check_mode"]; got != "credential_only" {
		t.Fatalf("unexpected health_check_mode detail: %#v", got)
	}
	if _, exists := result.Details["accessible_customers_error"]; exists {
		t.Fatalf("did not expect accessible_customers_error in health details: %#v", result.Details["accessible_customers_error"])
	}
}

func TestResolveGoogleAdsCredentialsFromRuntimeContext(t *testing.T) {
	t.Cleanup(resetGoogleAdsGlobals)

	dir := t.TempDir()
	contextPath := filepath.Join(dir, "runtime-context.json")
	payload := nexadapter.RuntimeContext{
		Platform:     platformID,
		ConnectionID: "google-ads-primary",
		Credential: &nexadapter.RuntimeCredential{
			Value: "placeholder",
			Fields: map[string]string{
				"developer_token":     "developer-token",
				"customer_id":         "123-456-7890",
				"login_customer_id":   "999-888-7776",
				"oauth_client_id":     "client-id",
				"oauth_client_secret": "client-secret",
				"oauth_refresh_token": "refresh-token",
				"api_base_url":        "https://example.invalid/v22",
			},
			Ref: "google-ads/google-ads-primary",
		},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal runtime context: %v", err)
	}
	if err := os.WriteFile(contextPath, raw, 0o600); err != nil {
		t.Fatalf("write runtime context: %v", err)
	}
	t.Setenv("NEXUS_ADAPTER_CONTEXT_PATH", contextPath)

	creds, err := resolveGoogleAdsCredentials("ignored")
	if err != nil {
		t.Fatalf("resolveGoogleAdsCredentials: %v", err)
	}
	if creds.ConnectionID != "google-ads-primary" {
		t.Fatalf("unexpected connection id: %q", creds.ConnectionID)
	}
	if creds.CustomerID != "1234567890" {
		t.Fatalf("unexpected customer id: %q", creds.CustomerID)
	}
	if creds.LoginCustomerID != "9998887776" {
		t.Fatalf("unexpected login customer id: %q", creds.LoginCustomerID)
	}
	if creds.CredentialRef != "google-ads/google-ads-primary" {
		t.Fatalf("unexpected credential ref: %q", creds.CredentialRef)
	}
}

func resetGoogleAdsGlobals() {
	googleAdsAPIBaseURL = defaultGoogleAdsAPIBase
	googleOAuthTokenURL = defaultGoogleOAuthToken
	googleAdsHTTPClient = &http.Client{Timeout: defaultHTTPTimeout}
	googleAccessTokenCached = nil
}

func setGoogleRuntimeContext(t *testing.T, payload nexadapter.RuntimeContext) {
	t.Helper()
	dir := t.TempDir()
	contextPath := filepath.Join(dir, "runtime-context.json")
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal runtime context: %v", err)
	}
	if err := os.WriteFile(contextPath, raw, 0o600); err != nil {
		t.Fatalf("write runtime context: %v", err)
	}
	t.Setenv("NEXUS_ADAPTER_CONTEXT_PATH", contextPath)
}

func googleRuntimeContextPayload(apiBaseURL string) nexadapter.RuntimeContext {
	return nexadapter.RuntimeContext{
		Platform:     platformID,
		ConnectionID: "google-ads-primary",
		Credential: &nexadapter.RuntimeCredential{
			Value: "placeholder",
			Fields: map[string]string{
				"developer_token":     "developer-token",
				"customer_id":         "1234567890",
				"login_customer_id":   "9998887776",
				"oauth_client_id":     "client-id",
				"oauth_client_secret": "client-secret",
				"oauth_refresh_token": "refresh-token",
				"api_base_url":        apiBaseURL,
			},
			Ref: "google-ads/google-ads-primary",
		},
	}
}
