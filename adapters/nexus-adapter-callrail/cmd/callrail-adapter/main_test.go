package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestBuildCallMetricRecords_EmitsCoreMetrics(t *testing.T) {
	m := &callMetrics{
		TotalCalls:     25,
		AnsweredCalls:  20,
		MissedCalls:    5,
		FirstTimeCalls: 10,
		TotalDuration:  3600,
		BySource:       map[string]int{"Google Ads": 15, "Organic": 10},
		ByCampaign:     map[string]int{"Brand Search": 8},
		QualifiedLeads: 7,
		ConvertedLeads: 3,
	}
	records := buildCallMetricRecords("test-connection", "company-123", "2026-02-26", m)

	// Should have at least: calls_total, calls_answered, calls_missed, calls_first_time,
	// calls_duration_avg, leads_qualified, leads_converted + 2 source + 1 campaign = 10
	if len(records) < 7 {
		t.Fatalf("expected at least 7 metric records, got %d", len(records))
	}

	first := records[0]
	if first.Operation != "record.ingest" {
		t.Fatalf("unexpected operation: %q", first.Operation)
	}
	if first.Routing.Platform != platformID {
		t.Fatalf("unexpected platform: %q", first.Routing.Platform)
	}
	if first.Routing.ConnectionID != "test-connection" {
		t.Fatalf("unexpected connection: %q", first.Routing.ConnectionID)
	}
	if got := first.Payload.Metadata["adapter_id"]; got != platformID {
		t.Fatalf("unexpected adapter_id metadata: %#v", got)
	}
	if got := first.Payload.Metadata["clinic_id"]; got != "company-123" {
		t.Fatalf("expected clinic_id metadata, got: %#v", got)
	}
	if first.Payload.Metadata["metric_name"] != "calls_total" {
		t.Fatalf("first record should be calls_total, got: %v", first.Payload.Metadata["metric_name"])
	}
}

func TestBuildCallMetricRecords_NoCompanyID(t *testing.T) {
	m := &callMetrics{
		TotalCalls: 5,
		BySource:   map[string]int{},
		ByCampaign: map[string]int{},
	}
	records := buildCallMetricRecords("conn-123", "", "2026-01-01", m)

	for _, record := range records {
		if _, hasClinicID := record.Payload.Metadata["clinic_id"]; hasClinicID {
			t.Fatal("records without company_id should not have clinic_id metadata")
		}
	}
}

func TestAggregateCallsByDate(t *testing.T) {
	calls := []callRecord{
		{StartTime: "2026-02-26T10:00:00-05:00", AnsweredAt: "2026-02-26T10:00:05-05:00", Duration: "120", FirstCall: true, Source: "Google Ads", LeadStatus: "good_lead"},
		{StartTime: "2026-02-26T11:00:00-05:00", AnsweredAt: "", Duration: "0", FirstCall: false, Source: "Google Ads"},
		{StartTime: "2026-02-26T14:00:00-05:00", AnsweredAt: "2026-02-26T14:00:03-05:00", Duration: "300", FirstCall: false, Source: "Organic", CampaignName: "Brand"},
		{StartTime: "2026-02-27T09:00:00-05:00", AnsweredAt: "2026-02-27T09:00:02-05:00", Duration: "60", FirstCall: true, Source: "Facebook"},
	}

	metrics := aggregateCallsByDate(calls)

	if len(metrics) != 2 {
		t.Fatalf("expected metrics for 2 dates, got %d", len(metrics))
	}

	day1 := metrics["2026-02-26"]
	if day1 == nil {
		t.Fatal("missing metrics for 2026-02-26")
	}
	if day1.TotalCalls != 3 {
		t.Fatalf("expected 3 calls on 2026-02-26, got %d", day1.TotalCalls)
	}
	if day1.AnsweredCalls != 2 {
		t.Fatalf("expected 2 answered calls, got %d", day1.AnsweredCalls)
	}
	if day1.MissedCalls != 1 {
		t.Fatalf("expected 1 missed call, got %d", day1.MissedCalls)
	}
	if day1.FirstTimeCalls != 1 {
		t.Fatalf("expected 1 first-time call, got %d", day1.FirstTimeCalls)
	}
	if day1.TotalDuration != 420 {
		t.Fatalf("expected 420s total duration, got %d", day1.TotalDuration)
	}
	if day1.QualifiedLeads != 1 {
		t.Fatalf("expected 1 qualified lead, got %d", day1.QualifiedLeads)
	}
	if day1.BySource["Google Ads"] != 2 {
		t.Fatalf("expected 2 Google Ads calls, got %d", day1.BySource["Google Ads"])
	}
	if day1.ByCampaign["Brand"] != 1 {
		t.Fatalf("expected 1 Brand campaign call, got %d", day1.ByCampaign["Brand"])
	}

	day2 := metrics["2026-02-27"]
	if day2 == nil {
		t.Fatal("missing metrics for 2026-02-27")
	}
	if day2.TotalCalls != 1 {
		t.Fatalf("expected 1 call on 2026-02-27, got %d", day2.TotalCalls)
	}
}

func TestExtractDate(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"2026-02-26T10:00:00-05:00", "2026-02-26"},
		{"2026-02-26 14:30:00", "2026-02-26"},
		{"2026-02-26", "2026-02-26"},
		{"", ""},
	}
	for _, tt := range tests {
		got := nexadapter.ExtractISODate(tt.input)
		if got != tt.want {
			t.Errorf("nexadapter.ExtractISODate(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestMetricTimestampMs(t *testing.T) {
	got := nexadapter.MetricTimestamp("2026-02-26", nil)
	want := time.Date(2026, time.February, 26, 12, 0, 0, 0, time.UTC).UnixMilli()
	if got != want {
		t.Fatalf("nexadapter.MetricTimestamp mismatch: got=%d want=%d", got, want)
	}
}

func TestSanitizeToken(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{" Campaign #42 ", "campaign--42"},
		{"Google Ads", "google-ads"},
		{"", "na"},
		{"hello_world", "hello_world"},
	}
	for _, tt := range tests {
		// SafeIDToken preserves case, so we lowercase to match old behavior
		got := strings.ToLower(nexadapter.SafeIDToken(tt.input))
		if got != tt.want {
			t.Errorf("strings.ToLower(nexadapter.SafeIDToken(%q)) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestIsFirstCall(t *testing.T) {
	tests := []struct {
		input any
		want  bool
	}{
		{true, true},
		{false, false},
		{"true", true},
		{"false", false},
		{"1", true},
		{nil, false},
	}
	for _, tt := range tests {
		got := isFirstCall(tt.input)
		if got != tt.want {
			t.Errorf("isFirstCall(%v) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestHasTag(t *testing.T) {
	tags := []any{"booked", "new-patient", map[string]any{"name": "converted"}}
	if !hasTag(tags, "booked") {
		t.Error("expected hasTag to find 'booked'")
	}
	if !hasTag(tags, "converted") {
		t.Error("expected hasTag to find 'converted' in map format")
	}
	if hasTag(tags, "missing") {
		t.Error("expected hasTag to not find 'missing'")
	}
}

func TestAnyToInt(t *testing.T) {
	tests := []struct {
		input any
		want  int
	}{
		{42, 42},
		{int64(100), 100},
		{float64(55.0), 55},
		{"120", 120},
		{"", 0},
		{nil, 0},
	}
	for _, tt := range tests {
		got := anyToInt(tt.input)
		if got != tt.want {
			t.Errorf("anyToInt(%v) = %d, want %d", tt.input, got, tt.want)
		}
	}
}

func TestAccountsUsesRuntimeConnectionID(t *testing.T) {
	dir := t.TempDir()
	contextPath := filepath.Join(dir, "runtime-context.json")
	payload := nexadapter.RuntimeContext{
		Platform:     platformID,
		ConnectionID: "callrail-live-conn",
		Config:       map[string]any{},
		Credential: &nexadapter.RuntimeCredential{
			Kind: "api_key",
			Value: "token",
			Ref:  "callrail/callrail-live-conn",
			Fields: map[string]string{
				"company_id": "COM123",
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
	if accountsList[0].ID != "callrail-live-conn" {
		t.Fatalf("unexpected account id: %q", accountsList[0].ID)
	}
}
