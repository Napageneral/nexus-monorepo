package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestAggregateTwilioCallsByDate(t *testing.T) {
	calls := []twilioCall{
		{
			SID:         "CA1",
			Status:      "completed",
			Direction:   "inbound",
			Duration:    "120",
			Price:       "-0.05",
			StartTime:   "Mon, 15 Jan 2026 10:30:00 +0000",
			DateCreated: "Mon, 15 Jan 2026 10:30:00 +0000",
		},
		{
			SID:         "CA2",
			Status:      "completed",
			Direction:   "outbound",
			Duration:    "60",
			Price:       "-0.03",
			StartTime:   "Mon, 15 Jan 2026 14:45:00 +0000",
			DateCreated: "Mon, 15 Jan 2026 14:45:00 +0000",
		},
		{
			SID:         "CA3",
			Status:      "failed",
			Direction:   "outbound",
			Duration:    "0",
			Price:       "-0.01",
			StartTime:   "Tue, 16 Jan 2026 09:00:00 +0000",
			DateCreated: "Tue, 16 Jan 2026 09:00:00 +0000",
		},
		{
			SID:         "CA4",
			Status:      "busy",
			Direction:   "inbound",
			Duration:    "0",
			Price:       "0",
			StartTime:   "Mon, 15 Jan 2026 16:00:00 +0000",
			DateCreated: "Mon, 15 Jan 2026 16:00:00 +0000",
		},
	}

	result := aggregateTwilioCallsByDate(calls)

	// Check 2026-01-15
	jan15, ok := result["2026-01-15"]
	if !ok {
		t.Fatal("Expected metrics for 2026-01-15")
	}
	if jan15.CallsTotal != 3 {
		t.Errorf("CallsTotal = %f, want 3", jan15.CallsTotal)
	}
	if jan15.CallsInbound != 2 {
		t.Errorf("CallsInbound = %f, want 2", jan15.CallsInbound)
	}
	if jan15.CallsOutbound != 1 {
		t.Errorf("CallsOutbound = %f, want 1", jan15.CallsOutbound)
	}
	if jan15.CallsCompleted != 2 {
		t.Errorf("CallsCompleted = %f, want 2", jan15.CallsCompleted)
	}
	if jan15.CallsFailed != 1 {
		t.Errorf("CallsFailed = %f, want 1", jan15.CallsFailed)
	}
	if jan15.CallsDurationSum != 180 {
		t.Errorf("CallsDurationSum = %f, want 180", jan15.CallsDurationSum)
	}
	if jan15.CallsDurationCnt != 2 {
		t.Errorf("CallsDurationCnt = %f, want 2", jan15.CallsDurationCnt)
	}
	if jan15.CallsCostSum != 0.08 {
		t.Errorf("CallsCostSum = %f, want 0.08", jan15.CallsCostSum)
	}

	// Check 2026-01-16
	jan16, ok := result["2026-01-16"]
	if !ok {
		t.Fatal("Expected metrics for 2026-01-16")
	}
	if jan16.CallsTotal != 1 {
		t.Errorf("CallsTotal = %f, want 1", jan16.CallsTotal)
	}
	if jan16.CallsFailed != 1 {
		t.Errorf("CallsFailed = %f, want 1", jan16.CallsFailed)
	}
}

func TestBuildTwilioMetricRecords(t *testing.T) {
	metrics := twilioMetrics{
		CallsTotal:       10,
		CallsInbound:     6,
		CallsOutbound:    4,
		CallsCompleted:   8,
		CallsFailed:      2,
		CallsDurationSum: 600,
		CallsDurationCnt: 8,
		CallsCostSum:     5.50,
	}

	records := buildTwilioMetricRecords("test-connection", "2026-01-15", metrics)

	if len(records) != 7 {
		t.Fatalf("Expected 7 records, got %d", len(records))
	}

	for _, record := range records {
		if record.Operation != "record.ingest" {
			t.Errorf("Record operation = %s, want record.ingest", record.Operation)
		}
		if record.Routing.Platform != platformID {
			t.Errorf("Record platform = %s, want %s", record.Routing.Platform, platformID)
		}
		if record.Routing.ConnectionID != "test-connection" {
			t.Errorf("Record connection = %s, want test-connection", record.Routing.ConnectionID)
		}
		if record.Routing.ContainerKind != "group" {
			t.Errorf("Record container kind = %s, want group", record.Routing.ContainerKind)
		}
		if record.Payload.Timestamp <= 0 {
			t.Errorf("Record timestamp is invalid: %d", record.Payload.Timestamp)
		}

		if record.Payload.Metadata["adapter_id"] != platformID {
			t.Errorf("Record metadata adapter_id = %v, want %s", record.Payload.Metadata["adapter_id"], platformID)
		}
		if record.Payload.Metadata["date"] != "2026-01-15" {
			t.Errorf("Record metadata date = %v, want 2026-01-15", record.Payload.Metadata["date"])
		}
	}

	metricsFound := make(map[string]bool)
	for _, record := range records {
		if metricName, ok := record.Payload.Metadata["metric_name"].(string); ok {
			metricsFound[metricName] = true
		}
	}

	expectedMetrics := []string{
		"calls_total",
		"calls_inbound",
		"calls_outbound",
		"calls_completed",
		"calls_failed",
		"calls_cost_total",
		"calls_duration_avg",
	}

	for _, metric := range expectedMetrics {
		if !metricsFound[metric] {
			t.Errorf("Expected metric %s not found in records", metric)
		}
	}
}

func TestExtractDate(t *testing.T) {
	tests := []struct {
		name      string
		timestamp string
		want      string
	}{
		{
			name:      "RFC1123Z format",
			timestamp: "Mon, 15 Jan 2026 10:30:00 +0000",
			want:      "2026-01-15",
		},
		{
			name:      "RFC3339 format",
			timestamp: "2026-01-15T10:30:00Z",
			want:      "2026-01-15",
		},
		{
			name:      "ISO date format",
			timestamp: "2026-01-15",
			want:      "2026-01-15",
		},
		{
			name:      "empty string",
			timestamp: "",
			want:      "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractDate(tt.timestamp)
			if got != tt.want {
				t.Errorf("extractDate(%q) = %q, want %q", tt.timestamp, got, tt.want)
			}
		})
	}
}

func TestParseNumber(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  float64
	}{
		{
			name:  "integer",
			input: "123",
			want:  123.0,
		},
		{
			name:  "float",
			input: "123.45",
			want:  123.45,
		},
		{
			name:  "negative",
			input: "-0.05",
			want:  -0.05,
		},
		{
			name:  "empty",
			input: "",
			want:  0,
		},
		{
			name:  "invalid",
			input: "abc",
			want:  0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseNumber(tt.input)
			if got != tt.want {
				t.Errorf("parseNumber(%q) = %f, want %f", tt.input, got, tt.want)
			}
		})
	}
}

func TestAccountsUsesRuntimeConnectionID(t *testing.T) {
	dir := t.TempDir()
	contextPath := filepath.Join(dir, "runtime-context.json")
	payload := nexadapter.RuntimeContext{
		Platform:     platformID,
		ConnectionID: "twilio-live-conn",
		Config:       map[string]any{},
		Credential: &nexadapter.RuntimeCredential{
			Kind: "api_key",
			Value: "token",
			Ref:  "twilio/twilio-live-conn",
			Fields: map[string]string{
				"account_sid": "AC123",
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
	if accountsList[0].ID != "twilio-live-conn" {
		t.Fatalf("unexpected account id: %q", accountsList[0].ID)
	}
}
