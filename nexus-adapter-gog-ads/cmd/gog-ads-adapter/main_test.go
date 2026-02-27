package main

import (
	"testing"
	"time"
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
	if first.Platform != platformID {
		t.Fatalf("unexpected platform: %q", first.Platform)
	}
	if first.AccountID != "clinic@example.com" {
		t.Fatalf("unexpected account: %q", first.AccountID)
	}
	if got := first.Metadata["adapter_id"]; got != platformID {
		t.Fatalf("unexpected adapter_id metadata: %#v", got)
	}
}

func TestMetricTimestampMs(t *testing.T) {
	got := metricTimestampMs("2026-02-26")
	want := time.Date(2026, time.February, 26, 12, 0, 0, 0, time.UTC).UnixMilli()
	if got != want {
		t.Fatalf("metricTimestampMs mismatch: got=%d want=%d", got, want)
	}
}

func TestSanitizeToken(t *testing.T) {
	if got := sanitizeToken(" Campaign #42 "); got != "campaign--42" {
		t.Fatalf("sanitizeToken mismatch: %q", got)
	}
}
