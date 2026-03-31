package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestFetchTikTokBusinessMonitorCycleReplaysRecentWindows(t *testing.T) {
	oldBaseURL := businessAPIBaseURL
	oldClient := businessHTTPClient
	t.Cleanup(func() {
		businessAPIBaseURL = oldBaseURL
		businessHTTPClient = oldClient
	})

	var mu sync.Mutex
	var firstReportStartDate string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/report/integrated/get/") {
			mu.Lock()
			if firstReportStartDate == "" {
				firstReportStartDate = r.URL.Query().Get("start_date")
			}
			mu.Unlock()
		}

		_ = json.NewEncoder(w).Encode(map[string]any{
			"code": 0,
			"data": map[string]any{
				"list": []map[string]any{},
				"page_info": map[string]any{
					"page":       1,
					"page_size":  100,
					"total_page": 1,
				},
			},
		})
	}))
	t.Cleanup(server.Close)

	businessAPIBaseURL = server.URL
	businessHTTPClient = server.Client()

	state := &tiktokBusinessState{
		ConnectionID:      "tiktok-business-primary",
		AccessToken:       "access-token",
		BoundAdvertiserID: "advertiser-123",
	}

	since := time.Date(2026, time.January, 20, 15, 30, 0, 0, time.UTC)

	records, newCursor, err := fetchTikTokBusinessMonitorCycle(context.Background(), state, since)
	if err != nil {
		t.Fatalf("fetchTikTokBusinessMonitorCycle returned error: %v", err)
	}
	if len(records) != 0 {
		t.Fatalf("records length = %d, want 0 for empty upstream payloads", len(records))
	}
	if !newCursor.After(since) {
		t.Fatalf("newCursor = %s, want it to advance beyond since = %s", newCursor, since)
	}

	expectedStartDate := dateFloorUTC(since.Add(-tiktokBusinessMonitorReplayWindow)).Format(tiktokBusinessDateLayout)
	if firstReportStartDate == "" {
		t.Fatal("expected at least one report/integrated/get request to be issued")
	}
	if firstReportStartDate != expectedStartDate {
		t.Fatalf("first report start_date = %q, want %q", firstReportStartDate, expectedStartDate)
	}
}

func TestDecodeTikTokBusinessCampaignRowCoercesNumericFieldsToStrings(t *testing.T) {
	row, err := decodeTikTokBusinessRow[tiktokBusinessCampaignRow](map[string]any{
		"advertiser_id":    12345.0,
		"campaign_id":      67890.0,
		"campaign_name":    "Moon Sleep",
		"campaign_status":  "ENABLE",
		"budget_mode":      "BUDGET_MODE_TOTAL",
		"budget":           125.5,
		"create_time":      "2026-03-01 00:00:00",
		"modify_time":      "2026-03-02 00:00:00",
		"operation_status": "STATUS_ENABLE",
	})
	if err != nil {
		t.Fatalf("decodeTikTokBusinessRow returned error: %v", err)
	}
	if row.AdvertiserID != "12345" {
		t.Fatalf("AdvertiserID = %q, want numeric string", row.AdvertiserID)
	}
	if row.CampaignID != "67890" {
		t.Fatalf("CampaignID = %q, want numeric string", row.CampaignID)
	}
	if row.Budget != "125.5" {
		t.Fatalf("Budget = %q, want 125.5", row.Budget)
	}
}
