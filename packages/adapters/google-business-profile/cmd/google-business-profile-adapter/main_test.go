package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestBuildGoogleBusinessProfilePerformanceRecords(t *testing.T) {
	records := buildGoogleBusinessProfilePerformanceRecords(
		googleBusinessProfileCredentials{
			ConnectionID: "gbp-primary",
		},
		googleBusinessProfileRowFamily{
			ID:            "location_performance_daily",
			ContainerName: "Location Performance Daily",
		},
		map[string]any{
			"name":        "accounts/1234567890",
			"accountName": "MoonSleep",
		},
		map[string]any{
			"name":  "locations/9998887776",
			"title": "MoonSleep HQ",
		},
		googleBusinessProfilePerformanceResponse{
			MultiDailyMetricTimeSeries: []googleBusinessProfileMultiDailyMetricTimeSeries{
				{
					DailyMetricTimeSeries: []googleBusinessProfileDailyMetricTimeSeries{
						{
							DailyMetric: "WEBSITE_CLICKS",
							TimeSeries: googleBusinessProfileTimeSeries{
								DatedValues: []googleBusinessProfileDatedValue{
									{Date: googleBusinessProfileDate{Year: 2026, Month: 3, Day: 30}, Value: 7},
								},
							},
						},
						{
							DailyMetric: "CALL_CLICKS",
							TimeSeries: googleBusinessProfileTimeSeries{
								DatedValues: []googleBusinessProfileDatedValue{
									{Date: googleBusinessProfileDate{Year: 2026, Month: 3, Day: 30}, Value: 2},
								},
							},
						},
					},
				},
			},
		},
		googleBusinessProfileSourceRequest{
			APIBaseURL: defaultPerformanceAPI,
			Path:       "/locations/9998887776:fetchMultiDailyMetricsTimeSeries",
			Request: map[string]any{
				"query": "dailyMetrics=WEBSITE_CLICKS&dailyMetrics=CALL_CLICKS",
			},
		},
	)

	if len(records) != 1 {
		t.Fatalf("expected 1 record, got %d", len(records))
	}
	record := records[0]
	if record.Operation != "record.ingest" {
		t.Fatalf("unexpected operation: %q", record.Operation)
	}
	if record.Routing.Platform != platformID {
		t.Fatalf("unexpected platform: %q", record.Routing.Platform)
	}
	if record.Routing.ContainerID != "location_performance_daily" {
		t.Fatalf("unexpected container id: %q", record.Routing.ContainerID)
	}
	if record.Routing.ThreadID != "google-business-profile:location:9998887776" {
		t.Fatalf("unexpected thread id: %q", record.Routing.ThreadID)
	}

	row, ok := record.Payload.Metadata["row"].(map[string]any)
	if !ok {
		t.Fatalf("expected row metadata map, got %#v", record.Payload.Metadata["row"])
	}
	if got := row["website_clicks"]; got != int64(7) {
		t.Fatalf("unexpected website_clicks: %#v", got)
	}
	if got := row["call_clicks"]; got != int64(2) {
		t.Fatalf("unexpected call_clicks: %#v", got)
	}
}

func TestResolveGoogleBusinessProfileCredentialsFromRuntimeContext(t *testing.T) {
	t.Cleanup(resetGoogleBusinessProfileGlobals)

	dir := t.TempDir()
	contextPath := filepath.Join(dir, "runtime-context.json")
	payload := nexadapter.RuntimeContext{
		Platform:     platformID,
		ConnectionID: "gbp-primary",
		Credential: &nexadapter.RuntimeCredential{
			Value: "placeholder",
			Fields: map[string]string{
				"oauth_client_id":     "client-id",
				"oauth_client_secret": "client-secret",
				"oauth_refresh_token": "refresh-token",
				"account_id":          "1234567890",
				"location_id":         "9998887776",
			},
			Ref: "google-business-profile/gbp-primary",
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

	creds, err := resolveGoogleBusinessProfileCredentials("ignored")
	if err != nil {
		t.Fatalf("resolveGoogleBusinessProfileCredentials: %v", err)
	}
	if creds.ConnectionID != "gbp-primary" {
		t.Fatalf("unexpected connection id: %q", creds.ConnectionID)
	}
	if creds.AccountID != "accounts/1234567890" {
		t.Fatalf("unexpected account id: %q", creds.AccountID)
	}
	if creds.LocationID != "locations/9998887776" {
		t.Fatalf("unexpected location id: %q", creds.LocationID)
	}
	if creds.CredentialRef != "google-business-profile/gbp-primary" {
		t.Fatalf("unexpected credential ref: %q", creds.CredentialRef)
	}
}

func TestFetchAllAccounts_Paginates(t *testing.T) {
	t.Cleanup(resetGoogleBusinessProfileGlobals)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"access-token","expires_in":3600}`))
		case "/v1/accounts":
			w.Header().Set("Content-Type", "application/json")
			if r.URL.Query().Get("pageToken") == "" {
				_, _ = w.Write([]byte(`{"accounts":[{"name":"accounts/111","accountName":"Alpha"}],"nextPageToken":"page-2"}`))
				return
			}
			_, _ = w.Write([]byte(`{"accounts":[{"name":"accounts/222","accountName":"Beta"}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	googleBusinessProfileHTTPClient = server.Client()
	googleOAuthTokenURL = server.URL + "/token"

	accounts, sourceRequest, err := fetchAllAccounts(context.Background(), googleBusinessProfileCredentials{
		ConnectionID:             "gbp-primary",
		ClientID:                 "client-id",
		ClientSecret:             "client-secret",
		RefreshToken:             "refresh-token",
		AccountManagementAPIBase: server.URL + "/v1",
		BusinessInfoAPIBase:      defaultBusinessInfoAPI,
		PerformanceAPIBase:       defaultPerformanceAPI,
		ReviewsAPIBase:           defaultReviewsAPI,
	})
	if err != nil {
		t.Fatalf("fetchAllAccounts: %v", err)
	}
	if len(accounts) != 2 {
		t.Fatalf("expected 2 accounts, got %d", len(accounts))
	}
	if got := accountResourceName(accounts[0]); got != "accounts/111" {
		t.Fatalf("unexpected first account: %q", got)
	}
	if sourceRequest.Path != "/accounts" {
		t.Fatalf("unexpected source path: %q", sourceRequest.Path)
	}
}

func TestPerformanceWindow(t *testing.T) {
	since := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	asOf := time.Date(2026, 3, 31, 8, 0, 0, 0, time.UTC)

	backfillSince, backfillUntil := performanceWindow(since, asOf, googleBusinessProfileSyncModeBackfill)
	if backfillSince.Format(dateLayout) != "2026-01-01" {
		t.Fatalf("unexpected backfill since: %s", backfillSince)
	}
	if backfillUntil.Format(dateLayout) != "2026-03-31" {
		t.Fatalf("unexpected backfill until: %s", backfillUntil)
	}

	monitorSince, _ := performanceWindow(since, asOf, googleBusinessProfileSyncModeMonitor)
	if !monitorSince.Equal(midnightUTC(asOf.Add(-performanceReplayWindow))) {
		t.Fatalf("unexpected monitor since: %s", monitorSince)
	}
}

func resetGoogleBusinessProfileGlobals() {
	googleBusinessProfileHTTPClient = &http.Client{Timeout: defaultHTTPTimeout}
	googleOAuthTokenURL = defaultOAuthTokenURL
	googleAccessTokenCached = nil
}
