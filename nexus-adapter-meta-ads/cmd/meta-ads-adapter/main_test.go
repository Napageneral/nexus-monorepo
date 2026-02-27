package main

import "testing"

func TestNormalizeAdAccountID(t *testing.T) {
	if got := normalizeAdAccountID("123456"); got != "act_123456" {
		t.Fatalf("normalizeAdAccountID mismatch: %q", got)
	}
	if got := normalizeAdAccountID("act_987"); got != "act_987" {
		t.Fatalf("normalizeAdAccountID mismatch: %q", got)
	}
}

func TestBuildMetaMetricEvents(t *testing.T) {
	events := buildMetaMetricEvents("default", metaInsightRow{
		DateStart:    "2026-02-26",
		CampaignID:   "cmp-1",
		CampaignName: "Brand Campaign",
		Spend:        "120.55",
		Impressions:  "5000",
		Clicks:       "330",
		Reach:        "4200",
		Actions: []metaActionMetric{
			{ActionType: "offsite_conversion.purchase", Value: "12"},
			{ActionType: "link_click", Value: "330"},
		},
		CostPerActionType: []metaActionMetric{
			{ActionType: "offsite_conversion.purchase", Value: "10.04"},
		},
	})

	if len(events) < 6 {
		t.Fatalf("expected at least 6 events, got %d", len(events))
	}
	if events[0].Platform != platformID {
		t.Fatalf("unexpected platform: %q", events[0].Platform)
	}
	if events[0].AccountID != "default" {
		t.Fatalf("unexpected account: %q", events[0].AccountID)
	}
}

func TestParseConversions(t *testing.T) {
	got := parseConversions([]metaActionMetric{
		{ActionType: "offsite_conversion.purchase", Value: "3"},
		{ActionType: "link_click", Value: "99"},
		{ActionType: "lead", Value: "2"},
	})
	if got != 5 {
		t.Fatalf("parseConversions mismatch: %v", got)
	}
}
