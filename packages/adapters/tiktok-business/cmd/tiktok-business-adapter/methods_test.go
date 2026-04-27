package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestInfoDeclaresTikTokBusinessMethodsAndProjection(t *testing.T) {
	adapter := nexadapter.DefineAdapter(adapterConfig())
	info, err := adapter.Operations.AdapterInfo(context.Background())
	if err != nil {
		t.Fatalf("AdapterInfo: %v", err)
	}

	if info.MethodCatalog == nil || info.MethodCatalog.Source != "openapi" || info.MethodCatalog.Document != "api/openapi.yaml" || info.MethodCatalog.Namespace != platformID {
		t.Fatalf("method catalog mismatch: %#v", info.MethodCatalog)
	}
	if info.Projection == nil || info.Projection.Platform != platformID {
		t.Fatalf("projection mismatch: %#v", info.Projection)
	}

	wantFamilies := map[string]bool{
		"campaign_snapshot": false,
		"adgroup_snapshot":  false,
		"ad_snapshot":       false,
		"campaign_daily":    false,
		"adgroup_daily":     false,
		"ad_daily":          false,
		"advertiser_hourly": false,
	}
	for _, family := range info.Projection.Families {
		if _, ok := wantFamilies[family.Name]; ok {
			wantFamilies[family.Name] = true
		}
	}
	for family, seen := range wantFamilies {
		if !seen {
			t.Fatalf("projection is missing family %s", family)
		}
	}

	wantMethods := []string{
		tiktokBusinessCampaignsListMethodName,
		tiktokBusinessAdGroupsListMethodName,
		tiktokBusinessAdsListMethodName,
		tiktokBusinessCampaignDailyListMethodName,
		tiktokBusinessAdGroupDailyListMethodName,
		tiktokBusinessAdDailyListMethodName,
		tiktokBusinessAdvertiserHourlyListMethodName,
	}
	if len(info.Methods) != len(wantMethods) {
		t.Fatalf("methods length = %d, want %d", len(info.Methods), len(wantMethods))
	}
	seenMethods := map[string]bool{}
	for _, method := range info.Methods {
		seenMethods[method.Name] = true
	}
	for _, methodName := range wantMethods {
		if !seenMethods[methodName] {
			t.Fatalf("missing method %s", methodName)
		}
	}

	declared := declaredTikTokBusinessMethods()
	for _, methodName := range wantMethods {
		if _, ok := declared[methodName]; !ok {
			t.Fatalf("declared methods missing %s", methodName)
		}
	}
}

func TestTikTokBusinessResourceListMethodsUseProviderEndpoints(t *testing.T) {
	tests := []struct {
		name          string
		methodName    string
		path          string
		responseField string
		makeRow       func() map[string]any
		assertRow     func(t *testing.T, row any)
	}{
		{
			name:          "campaigns",
			methodName:    tiktokBusinessCampaignsListMethodName,
			path:          "/open_api/v1.3/campaign/get/",
			responseField: "campaigns",
			makeRow: func() map[string]any {
				return map[string]any{
					"advertiser_id":   "advertiser-123",
					"campaign_id":     "cmp-1",
					"campaign_name":   "Brand Awareness",
					"campaign_status": "ENABLE",
					"create_time":     "2026-03-01 00:00:00",
					"modify_time":     "2026-03-01 01:00:00",
				}
			},
			assertRow: func(t *testing.T, row any) {
				campaign, ok := row.(tiktokBusinessCampaignRow)
				if !ok {
					t.Fatalf("row type = %T, want tiktokBusinessCampaignRow", row)
				}
				if campaign.CampaignID != "cmp-1" {
					t.Fatalf("campaign id = %q", campaign.CampaignID)
				}
			},
		},
		{
			name:          "adgroups",
			methodName:    tiktokBusinessAdGroupsListMethodName,
			path:          "/open_api/v1.3/adgroup/get/",
			responseField: "adgroups",
			makeRow: func() map[string]any {
				return map[string]any{
					"advertiser_id":  "advertiser-123",
					"campaign_id":    "cmp-1",
					"adgroup_id":     "ag-1",
					"adgroup_name":   "Ad Group One",
					"adgroup_status": "ENABLE",
					"create_time":    "2026-03-01 00:00:00",
					"modify_time":    "2026-03-01 01:00:00",
				}
			},
			assertRow: func(t *testing.T, row any) {
				adGroup, ok := row.(tiktokBusinessAdGroupRow)
				if !ok {
					t.Fatalf("row type = %T, want tiktokBusinessAdGroupRow", row)
				}
				if adGroup.AdgroupID != "ag-1" {
					t.Fatalf("adgroup id = %q", adGroup.AdgroupID)
				}
			},
		},
		{
			name:          "ads",
			methodName:    tiktokBusinessAdsListMethodName,
			path:          "/open_api/v1.3/ad/get/",
			responseField: "ads",
			makeRow: func() map[string]any {
				return map[string]any{
					"advertiser_id": "advertiser-123",
					"campaign_id":   "cmp-1",
					"adgroup_id":    "ag-1",
					"ad_id":         "ad-1",
					"ad_name":       "Ad One",
					"ad_status":     "ENABLE",
					"create_time":   "2026-03-01 00:00:00",
					"modify_time":   "2026-03-01 01:00:00",
				}
			},
			assertRow: func(t *testing.T, row any) {
				ad, ok := row.(tiktokBusinessAdRow)
				if !ok {
					t.Fatalf("row type = %T, want tiktokBusinessAdRow", row)
				}
				if ad.AdID != "ad-1" {
					t.Fatalf("ad id = %q", ad.AdID)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			oldBaseURL := businessAPIBaseURL
			oldClient := businessHTTPClient
			t.Cleanup(func() {
				businessAPIBaseURL = oldBaseURL
				businessHTTPClient = oldClient
			})

			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != tt.path {
					t.Fatalf("path = %q, want %q", r.URL.Path, tt.path)
				}
				if got := r.Header.Get("Access-Token"); got != "access-token" {
					t.Fatalf("Access-Token header = %q, want access-token", got)
				}
				if got := r.URL.Query().Get("advertiser_id"); got != "advertiser-123" {
					t.Fatalf("advertiser_id = %q, want advertiser-123", got)
				}
				if got := r.URL.Query().Get("page_size"); got != tiktokBusinessDefaultPageSize {
					t.Fatalf("page_size = %q, want %q", got, tiktokBusinessDefaultPageSize)
				}
				if got := r.URL.Query().Get("page"); got != "1" {
					t.Fatalf("page = %q, want 1", got)
				}

				_ = json.NewEncoder(w).Encode(map[string]any{
					"code": 0,
					"data": map[string]any{
						"list": []map[string]any{tt.makeRow()},
						"page_info": map[string]any{
							"page":       1,
							"page_size":  100,
							"total_page": 1,
						},
					},
				})
			}))
			t.Cleanup(server.Close)

			businessAPIBaseURL = server.URL + "/open_api/v1.3"
			businessHTTPClient = server.Client()

			result, err := declaredTikTokBusinessMethods()[tt.methodName].Handler(
				tiktokBusinessTestContext(),
				nexadapter.AdapterMethodRequest{ConnectionID: "tiktok-business-primary", Payload: map[string]any{}},
			)
			if err != nil {
				t.Fatalf("%s: %v", tt.methodName, err)
			}

			payload, ok := result.(map[string]any)
			if !ok {
				t.Fatalf("unexpected response type: %T", result)
			}
			switch rows := payload[tt.responseField].(type) {
			case []tiktokBusinessCampaignRow:
				if len(rows) != 1 {
					t.Fatalf("%s rows length = %d, want 1", tt.responseField, len(rows))
				}
				tt.assertRow(t, rows[0])
			case []tiktokBusinessAdGroupRow:
				if len(rows) != 1 {
					t.Fatalf("%s rows length = %d, want 1", tt.responseField, len(rows))
				}
				tt.assertRow(t, rows[0])
			case []tiktokBusinessAdRow:
				if len(rows) != 1 {
					t.Fatalf("%s rows length = %d, want 1", tt.responseField, len(rows))
				}
				tt.assertRow(t, rows[0])
			default:
				t.Fatalf("%s rows type = %T, want typed TikTok Business row slice", tt.responseField, payload[tt.responseField])
			}
			if got := payload["count"]; got != 1 {
				t.Fatalf("count = %#v, want 1", got)
			}
		})
	}
}

func TestTikTokBusinessReportMethodsUseProviderEndpoints(t *testing.T) {
	tests := []struct {
		name       string
		methodName string
		path       string
		dataLevel  string
		dimensions string
		family     string
		reportRow  map[string]any
		assertRow  func(t *testing.T, row any)
	}{
		{
			name:       "campaign_daily",
			methodName: tiktokBusinessCampaignDailyListMethodName,
			path:       "/open_api/v1.3/report/integrated/get/",
			dataLevel:  "AUCTION_CAMPAIGN",
			dimensions: `["stat_time_day","campaign_id"]`,
			family:     "campaign_daily",
			reportRow: map[string]any{
				"dimensions": map[string]any{
					"advertiser_id": "advertiser-123",
					"campaign_id":   "cmp-1",
					"stat_time_day": "2026-03-01",
				},
				"metrics": map[string]any{
					"spend":                      "12.50",
					"impressions":                "100",
					"clicks":                     "5",
					"ctr":                        "0.05",
					"cpc":                        "2.50",
					"cpm":                        "125.00",
					"total_landing_page_view":    "3",
					"complete_payment":           "1",
					"complete_payment_roas":      "2.00",
					"value_per_complete_payment": "25.00",
				},
			},
			assertRow: func(t *testing.T, row any) {
				report, ok := row.(tiktokBusinessReportRow)
				if !ok {
					t.Fatalf("row type = %T, want tiktokBusinessReportRow", row)
				}
				if report.Dimensions["campaign_id"] != "cmp-1" {
					t.Fatalf("campaign_id = %#v", report.Dimensions["campaign_id"])
				}
			},
		},
		{
			name:       "adgroup_daily",
			methodName: tiktokBusinessAdGroupDailyListMethodName,
			path:       "/open_api/v1.3/report/integrated/get/",
			dataLevel:  "AUCTION_ADGROUP",
			dimensions: `["stat_time_day","adgroup_id"]`,
			family:     "adgroup_daily",
			reportRow: map[string]any{
				"dimensions": map[string]any{
					"advertiser_id": "advertiser-123",
					"adgroup_id":    "ag-1",
					"stat_time_day": "2026-03-01",
				},
				"metrics": map[string]any{
					"spend":  "4.00",
					"clicks": "2",
				},
			},
			assertRow: func(t *testing.T, row any) {
				report, ok := row.(tiktokBusinessReportRow)
				if !ok {
					t.Fatalf("row type = %T, want tiktokBusinessReportRow", row)
				}
				if report.Dimensions["adgroup_id"] != "ag-1" {
					t.Fatalf("adgroup_id = %#v", report.Dimensions["adgroup_id"])
				}
			},
		},
		{
			name:       "ad_daily",
			methodName: tiktokBusinessAdDailyListMethodName,
			path:       "/open_api/v1.3/report/integrated/get/",
			dataLevel:  "AUCTION_AD",
			dimensions: `["stat_time_day","ad_id"]`,
			family:     "ad_daily",
			reportRow: map[string]any{
				"dimensions": map[string]any{
					"advertiser_id": "advertiser-123",
					"ad_id":         "ad-1",
					"stat_time_day": "2026-03-01",
				},
				"metrics": map[string]any{
					"spend":  "1.00",
					"clicks": "1",
				},
			},
			assertRow: func(t *testing.T, row any) {
				report, ok := row.(tiktokBusinessReportRow)
				if !ok {
					t.Fatalf("row type = %T, want tiktokBusinessReportRow", row)
				}
				if report.Dimensions["ad_id"] != "ad-1" {
					t.Fatalf("ad_id = %#v", report.Dimensions["ad_id"])
				}
			},
		},
		{
			name:       "advertiser_hourly",
			methodName: tiktokBusinessAdvertiserHourlyListMethodName,
			path:       "/open_api/v1.3/report/integrated/get/",
			dataLevel:  "AUCTION_ADVERTISER",
			dimensions: `["stat_time_hour"]`,
			family:     "advertiser_hourly",
			reportRow: map[string]any{
				"dimensions": map[string]any{
					"advertiser_id":  "advertiser-123",
					"stat_time_hour": "2026-03-01 10:00:00",
				},
				"metrics": map[string]any{
					"spend":  "0.50",
					"clicks": "1",
				},
			},
			assertRow: func(t *testing.T, row any) {
				report, ok := row.(tiktokBusinessReportRow)
				if !ok {
					t.Fatalf("row type = %T, want tiktokBusinessReportRow", row)
				}
				if report.Dimensions["stat_time_hour"] != "2026-03-01 10:00:00" {
					t.Fatalf("stat_time_hour = %#v", report.Dimensions["stat_time_hour"])
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			oldBaseURL := businessAPIBaseURL
			oldClient := businessHTTPClient
			t.Cleanup(func() {
				businessAPIBaseURL = oldBaseURL
				businessHTTPClient = oldClient
			})

			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != tt.path {
					t.Fatalf("path = %q, want %q", r.URL.Path, tt.path)
				}
				if got := r.Header.Get("Access-Token"); got != "access-token" {
					t.Fatalf("Access-Token header = %q, want access-token", got)
				}
				if got := r.URL.Query().Get("advertiser_id"); got != "advertiser-123" {
					t.Fatalf("advertiser_id = %q, want advertiser-123", got)
				}
				if got := r.URL.Query().Get("report_type"); got != tiktokBusinessDefaultReportType {
					t.Fatalf("report_type = %q, want %q", got, tiktokBusinessDefaultReportType)
				}
				if got := r.URL.Query().Get("data_level"); got != tt.dataLevel {
					t.Fatalf("data_level = %q, want %q", got, tt.dataLevel)
				}
				if got := r.URL.Query().Get("dimensions"); got != tt.dimensions {
					t.Fatalf("dimensions = %q, want %q", got, tt.dimensions)
				}
				var metrics []string
				if err := json.Unmarshal([]byte(r.URL.Query().Get("metrics")), &metrics); err != nil {
					t.Fatalf("metrics query is not valid JSON: %v", err)
				}
				if !tiktokBusinessTestStringSliceContains(metrics, "total_landing_page_view") {
					t.Fatalf("metrics = %v, missing total_landing_page_view", metrics)
				}
				if got := r.URL.Query().Get("start_date"); got != "2026-03-01" {
					t.Fatalf("start_date = %q, want 2026-03-01", got)
				}
				if got := r.URL.Query().Get("end_date"); got != "2026-03-01" {
					t.Fatalf("end_date = %q, want 2026-03-01", got)
				}
				_ = json.NewEncoder(w).Encode(map[string]any{
					"code": 0,
					"data": map[string]any{
						"list": []map[string]any{tt.reportRow},
						"page_info": map[string]any{
							"page":       1,
							"page_size":  100,
							"total_page": 1,
						},
					},
				})
			}))
			t.Cleanup(server.Close)

			businessAPIBaseURL = server.URL + "/open_api/v1.3"
			businessHTTPClient = server.Client()

			result, err := declaredTikTokBusinessMethods()[tt.methodName].Handler(
				tiktokBusinessTestContext(),
				nexadapter.AdapterMethodRequest{
					ConnectionID: "tiktok-business-primary",
					Payload: map[string]any{
						"since": "2026-03-01",
						"until": "2026-03-01",
					},
				},
			)
			if err != nil {
				t.Fatalf("%s: %v", tt.methodName, err)
			}

			payload, ok := result.(map[string]any)
			if !ok {
				t.Fatalf("unexpected response type: %T", result)
			}
			rows, ok := payload["rows"].([]tiktokBusinessReportRow)
			if !ok {
				t.Fatalf("rows type = %T, want []tiktokBusinessReportRow", payload["rows"])
			}
			if len(rows) != 1 {
				t.Fatalf("rows length = %d, want 1", len(rows))
			}
			tt.assertRow(t, rows[0])
			if got := payload["count"]; got != 1 {
				t.Fatalf("count = %#v, want 1", got)
			}
			if got := payload["family"]; got != tt.family {
				t.Fatalf("family = %#v, want %q", got, tt.family)
			}
		})
	}
}

func tiktokBusinessTestStringSliceContains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func tiktokBusinessTestContext() nexadapter.AdapterContext[struct{}] {
	return nexadapter.AdapterContext[struct{}]{
		Context:      context.Background(),
		ConnectionID: "tiktok-business-primary",
		Runtime: &nexadapter.RuntimeContext{
			Platform:     platformID,
			ConnectionID: "tiktok-business-primary",
			Credential: &nexadapter.RuntimeCredential{
				Value:   "access-token",
				Ref:     "tiktok-business/tiktok-business-primary",
				Account: "advertiser-123",
				Fields: map[string]string{
					"access_token":   "access-token",
					"advertiser_id":  "advertiser-123",
					"app_id":         "app-1",
					"app_secret":     "secret-1",
					"advertiser_ids": "advertiser-123",
				},
			},
		},
	}
}
