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

func TestRunTikTokBusinessMonitorCycleUsesBoundedFamilyLanes(t *testing.T) {
	oldBaseURL := businessAPIBaseURL
	oldClient := businessHTTPClient
	t.Cleanup(func() {
		businessAPIBaseURL = oldBaseURL
		businessHTTPClient = oldClient
	})

	var mu sync.Mutex
	reportStartDates := map[string]string{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/report/integrated/get/") {
			mu.Lock()
			dataLevel := r.URL.Query().Get("data_level")
			if _, ok := reportStartDates[dataLevel]; !ok {
				reportStartDates[dataLevel] = r.URL.Query().Get("start_date")
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
	t.Setenv(tiktokBusinessAdapterStateDirEnv, t.TempDir())

	state := &tiktokBusinessState{
		ConnectionID:      "tiktok-business-primary",
		AccessToken:       "access-token",
		BoundAdvertiserID: "advertiser-123",
	}

	pollTime := time.Date(2026, time.January, 20, 15, 30, 0, 0, time.UTC)
	monitorState := defaultTikTokBusinessMonitorState()
	revisionStore, err := loadTikTokBusinessRevisionStore(state.ConnectionID)
	if err != nil {
		t.Fatalf("loadTikTokBusinessRevisionStore: %v", err)
	}

	var emitted []any
	result := runTikTokBusinessMonitorCycle(context.Background(), state, monitorState, revisionStore, pollTime, func(record any) {
		emitted = append(emitted, record)
	})
	if len(result.FailedFamilies) != 0 {
		t.Fatalf("failed families = %v", result.FailedFamilies)
	}
	if len(emitted) != 0 {
		t.Fatalf("emitted records = %d, want 0 for empty upstream payloads", len(emitted))
	}

	wantHourlyStart := dateFloorUTC(pollTime.Add(-tiktokBusinessHotReportLookback)).Format(tiktokBusinessDateLayout)
	if got := reportStartDates["AUCTION_ADVERTISER"]; got != wantHourlyStart {
		t.Fatalf("hourly start_date = %q, want %q", got, wantHourlyStart)
	}
	wantDailyStart := dateFloorUTC(pollTime.Add(-tiktokBusinessDailyReportLookback)).Format(tiktokBusinessDateLayout)
	for _, dataLevel := range []string{"AUCTION_CAMPAIGN", "AUCTION_ADGROUP", "AUCTION_AD"} {
		if got := reportStartDates[dataLevel]; got != wantDailyStart {
			t.Fatalf("%s start_date = %q, want %q", dataLevel, got, wantDailyStart)
		}
	}
}

func TestRunTikTokBusinessMonitorCycleSuppressesDuplicateHourlyRevision(t *testing.T) {
	oldBaseURL := businessAPIBaseURL
	oldClient := businessHTTPClient
	t.Cleanup(func() {
		businessAPIBaseURL = oldBaseURL
		businessHTTPClient = oldClient
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rows := []map[string]any{}
		if strings.Contains(r.URL.Path, "/report/integrated/get/") && r.URL.Query().Get("data_level") == "AUCTION_ADVERTISER" {
			rows = append(rows, map[string]any{
				"dimensions": map[string]any{
					"stat_time_hour": "2026-01-20 15:00:00",
				},
				"metrics": map[string]any{
					"spend":                      "12.34",
					"impressions":                "1000",
					"clicks":                     "25",
					"ctr":                        "0.025",
					"cpc":                        "0.49",
					"cpm":                        "12.34",
					"complete_payment":           "2",
					"complete_payment_roas":      "3.5",
					"value_per_complete_payment": "21",
				},
			})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"code": 0,
			"data": map[string]any{
				"list": rows,
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
	t.Setenv(tiktokBusinessAdapterStateDirEnv, t.TempDir())

	state := &tiktokBusinessState{
		ConnectionID:      "tiktok-business-primary",
		AccessToken:       "access-token",
		BoundAdvertiserID: "advertiser-123",
	}
	monitorState := defaultTikTokBusinessMonitorState()
	revisionStore, err := loadTikTokBusinessRevisionStore(state.ConnectionID)
	if err != nil {
		t.Fatalf("loadTikTokBusinessRevisionStore: %v", err)
	}

	firstPoll := time.Date(2026, time.January, 20, 15, 30, 0, 0, time.UTC)
	var firstEmitted []any
	first := runTikTokBusinessMonitorCycle(context.Background(), state, monitorState, revisionStore, firstPoll, func(record any) {
		firstEmitted = append(firstEmitted, record)
	})
	if len(first.FailedFamilies) != 0 {
		t.Fatalf("first failed families = %v", first.FailedFamilies)
	}
	if len(firstEmitted) != 1 {
		t.Fatalf("first emitted records = %d, want 1", len(firstEmitted))
	}

	secondPoll := firstPoll.Add(tiktokBusinessMonitorInterval)
	var secondEmitted []any
	second := runTikTokBusinessMonitorCycle(context.Background(), state, monitorState, revisionStore, secondPoll, func(record any) {
		secondEmitted = append(secondEmitted, record)
	})
	if len(second.FailedFamilies) != 0 {
		t.Fatalf("second failed families = %v", second.FailedFamilies)
	}
	if len(secondEmitted) != 0 {
		t.Fatalf("second emitted records = %d, want duplicate suppression", len(secondEmitted))
	}
	metrics := monitorState.metrics(tiktokBusinessMonitorFamilyAdvertiserHourly)
	if metrics.LastAttempted != 1 || metrics.LastSuppressed != 1 || metrics.LastEmitted != 0 {
		t.Fatalf("unexpected second-cycle metrics: %+v", metrics)
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
