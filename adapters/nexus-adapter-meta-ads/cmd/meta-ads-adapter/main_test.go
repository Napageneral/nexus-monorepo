package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestNormalizeAdAccountID(t *testing.T) {
	if got := normalizeAdAccountID("123456"); got != "act_123456" {
		t.Fatalf("normalizeAdAccountID mismatch: %q", got)
	}
	if got := normalizeAdAccountID("act_987"); got != "act_987" {
		t.Fatalf("normalizeAdAccountID mismatch: %q", got)
	}
}

func TestBuildMetaMetricEvents(t *testing.T) {
	records := buildMetaMetricRecords("conn-meta", metaInsightRow{
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

	if len(records) < 6 {
		t.Fatalf("expected at least 6 records, got %d", len(records))
	}
	if records[0].Routing.Platform != platformID {
		t.Fatalf("unexpected platform: %q", records[0].Routing.Platform)
	}
	if records[0].Routing.ConnectionID != "conn-meta" {
		t.Fatalf("unexpected connection: %q", records[0].Routing.ConnectionID)
	}
	if got := records[0].Payload.Metadata["adapter_id"]; got != platformID {
		t.Fatalf("unexpected adapter_id metadata: %#v", got)
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

func TestAccountsUsesRuntimeConnectionID(t *testing.T) {
	dir := t.TempDir()
	contextPath := filepath.Join(dir, "runtime-context.json")
	payload := nexadapter.RuntimeContext{
		Platform:     platformID,
		ConnectionID: "meta-live-conn",
		Config:       map[string]any{},
		Credential: &nexadapter.RuntimeCredential{
			Kind: "oauth",
			Value: "token",
			Ref:  "facebook/meta-live-conn",
			Fields: map[string]string{
				"ad_account_id": "act_123456",
			},
		},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal context: %v", err)
	}
	if err := os.WriteFile(contextPath, raw, 0o600); err != nil {
		t.Fatalf("write context: %v", err)
	}
	t.Setenv(nexadapter.AdapterContextEnvVar, contextPath)

	accountsList, err := accounts(nil)
	if err != nil {
		t.Fatalf("accounts: %v", err)
	}
	if len(accountsList) != 1 {
		t.Fatalf("expected 1 account, got %d", len(accountsList))
	}
	if accountsList[0].ID != "meta-live-conn" {
		t.Fatalf("unexpected account id: %q", accountsList[0].ID)
	}
}
