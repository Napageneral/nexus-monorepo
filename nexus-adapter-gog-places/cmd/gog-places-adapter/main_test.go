package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestResolvePlaceCredentials_FromRuntimeContext(t *testing.T) {
	dir := t.TempDir()
	contextPath := filepath.Join(dir, "runtime-context.json")
	payload := adapterRuntimeContext{
		AccountID: "default",
		Credential: &struct {
			Value  string            `json:"value"`
			Fields map[string]string `json:"fields"`
		}{
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
	if got := events[0].Metadata["adapter_id"]; got != platformID {
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
