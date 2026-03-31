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
				"developer_token":      "developer-token",
				"customer_id":          "123-456-7890",
				"login_customer_id":    "999-888-7776",
				"oauth_client_id":      "client-id",
				"oauth_client_secret":  "client-secret",
				"oauth_refresh_token":  "refresh-token",
				"api_base_url":         "https://example.invalid/v22",
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
