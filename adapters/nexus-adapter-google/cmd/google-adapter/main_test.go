package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestBuildAdsMetricEvents_EmitsCoreMetrics(t *testing.T) {
	events := buildAdsMetricEvents("clinic@example.com", adsMetricRow{
		Date:         "2026-02-26",
		CampaignID:   "123",
		CampaignName: "Brand Search",
		Cost:         120.5,
		Impressions:  5000,
		Clicks:       320,
		Conversions:  22,
	})

	if len(events) < 4 {
		t.Fatalf("expected at least 4 metric events, got %d", len(events))
	}
	first := events[0]
	if first.Platform != adsPlatformID {
		t.Fatalf("unexpected platform: %q", first.Platform)
	}
	if first.AccountID != "clinic@example.com" {
		t.Fatalf("unexpected account: %q", first.AccountID)
	}
	if got := first.Metadata["adapter_id"]; got != adsPlatformID {
		t.Fatalf("unexpected adapter_id metadata: %#v", got)
	}
}

func TestBuildAdsMetricEvents_IncludesCPC(t *testing.T) {
	events := buildAdsMetricEvents("test@example.com", adsMetricRow{
		Date:        "2026-02-26",
		CampaignID:  "456",
		Cost:        100.0,
		Impressions: 1000,
		Clicks:      50,
		Conversions: 10,
	})

	// Should have 6 metrics: spend, impressions, clicks, conversions, CPC, CPA
	if len(events) != 6 {
		t.Fatalf("expected 6 metric events (including CPC and CPA), got %d", len(events))
	}
}

func TestBuildPlacesMetricEvents(t *testing.T) {
	events := buildPlacesMetricEvents(
		"default",
		"ChIJ123",
		"2026-02-26",
		placeDetailsResponse{
			Place: map[string]any{
				"rating":          4.7,
				"userRatingCount": 302,
			},
		},
		placeReviewsResponse{
			Reviews: []map[string]any{
				{"text": "Great clinic"},
				{"text": "Friendly team"},
			},
		},
	)

	if len(events) != 3 {
		t.Fatalf("expected 3 metric events, got %d", len(events))
	}
	if got := events[0].Platform; got != placesPlatformID {
		t.Fatalf("unexpected platform: %q", got)
	}
	if got := events[0].Metadata["adapter_id"]; got != placesPlatformID {
		t.Fatalf("unexpected adapter_id metadata: %#v", got)
	}
	if got := events[0].Metadata["place_id"]; got != "ChIJ123" {
		t.Fatalf("unexpected place_id metadata: %#v", got)
	}
}

func TestResolvePlaceCredentials_FromRuntimeContext(t *testing.T) {
	dir := t.TempDir()
	contextPath := filepath.Join(dir, "runtime-context.json")
	payload := nexadapter.RuntimeContext{
		Platform:  "google",
		AccountID: "default",
		Config:    map[string]any{},
		Credential: &nexadapter.RuntimeCredential{
			Kind:  "token",
			Value: "abc",
			Fields: map[string]string{
				"place_id": "ChIJ123",
				"api_key":  "AIza-test",
			},
		},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal context: %v", err)
	}
	if err := os.WriteFile(contextPath, raw, 0o600); err != nil {
		t.Fatalf("write context file: %v", err)
	}

	t.Setenv("NEXUS_ADAPTER_CONTEXT_PATH", contextPath)

	creds, err := resolvePlaceCredentials("clinic-account")
	if err != nil {
		t.Fatalf("resolvePlaceCredentials: %v", err)
	}
	if creds.PlaceID != "ChIJ123" {
		t.Fatalf("unexpected place id: %q", creds.PlaceID)
	}
	if creds.APIKey != "AIza-test" {
		t.Fatalf("unexpected api key: %q", creds.APIKey)
	}
}

func TestInfoReturnsAllOperations(t *testing.T) {
	info, err := info(nil)
	if err != nil {
		t.Fatalf("info: %v", err)
	}
	if info.Platform != "google" {
		t.Fatalf("unexpected platform: %q", info.Platform)
	}
	ops := map[nexadapter.AdapterOperation]bool{}
	for _, op := range info.Operations {
		ops[op] = true
	}
	required := []nexadapter.AdapterOperation{
		nexadapter.OpAdapterInfo,
		nexadapter.OpAdapterHealth,
		nexadapter.OpAdapterAccountsList,
		nexadapter.OpEventBackfill,
		nexadapter.OpAdapterMonitorStart,
	}
	for _, op := range required {
		if !ops[op] {
			t.Fatalf("missing required operation: %s", op)
		}
	}
}

func TestInfoHasMultipleAuthMethods(t *testing.T) {
	info, err := info(nil)
	if err != nil {
		t.Fatalf("info: %v", err)
	}
	if info.Auth == nil || len(info.Auth.Methods) < 3 {
		t.Fatalf("expected at least 3 auth methods (oauth, api_key, file_upload), got %d",
			len(info.Auth.Methods))
	}
	types := map[string]bool{}
	for _, m := range info.Auth.Methods {
		types[m.Type] = true
	}
	if !types["oauth2"] {
		t.Fatal("missing oauth2 auth method")
	}
	if !types["api_key"] {
		t.Fatal("missing api_key auth method")
	}
	if !types["file_upload"] {
		t.Fatal("missing file_upload auth method")
	}
}
