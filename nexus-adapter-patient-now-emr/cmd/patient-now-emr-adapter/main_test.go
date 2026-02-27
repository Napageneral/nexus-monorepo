package main

import "testing"

func TestExtractMetricPoints_FromMetricsArray(t *testing.T) {
	points, err := extractMetricPoints(map[string]any{
		"metrics": []any{
			map[string]any{
				"date":         "2026-02-26",
				"metric_name":  "appointments_booked",
				"metric_value": 11,
			},
			map[string]any{
				"date":         "2026-02-26",
				"metric_name":  "revenue",
				"metric_value": 3500.25,
			},
		},
	})
	if err != nil {
		t.Fatalf("extractMetricPoints: %v", err)
	}
	if len(points) != 2 {
		t.Fatalf("expected 2 metric points, got %d", len(points))
	}
}

func TestExtractMetricPoints_FromRowsFallback(t *testing.T) {
	points, err := extractMetricPoints(map[string]any{
		"rows": []any{
			map[string]any{
				"date":           "2026-02-26",
				"status":         "completed",
				"is_new_patient": true,
				"revenue":        550.5,
			},
			map[string]any{
				"date":           "2026-02-26",
				"status":         "no_show",
				"is_new_patient": false,
			},
		},
	})
	if err != nil {
		t.Fatalf("extractMetricPoints: %v", err)
	}
	if len(points) == 0 {
		t.Fatalf("expected transformed points from rows fallback")
	}
}

func TestNormalizeMetricName(t *testing.T) {
	if got := normalizeMetricName("appointments-booked"); got != "appointments_booked" {
		t.Fatalf("normalizeMetricName mismatch: %q", got)
	}
	if got := normalizeMetricName("totally_unknown"); got != "" {
		t.Fatalf("expected unknown metric to normalize to empty, got %q", got)
	}
}

func TestBuildPatientNowEvents_AggregateMetadataOnly(t *testing.T) {
	events := buildPatientNowEvents(
		patientNowCredentials{
			AccountID:  "default",
			PracticeID: "practice_123",
		},
		metricPoint{
			Date:        "2026-02-26",
			MetricName:  "appointments_completed",
			MetadataKey: "injectables",
			Value:       12,
		},
	)

	if len(events) != 1 {
		t.Fatalf("expected one event, got %d", len(events))
	}

	allowed := map[string]bool{
		"adapter_id":   true,
		"practice_id":  true,
		"date":         true,
		"metric_name":  true,
		"metric_value": true,
		"metadata_key": true,
	}

	for key := range events[0].Metadata {
		if !allowed[key] {
			t.Fatalf("unexpected metadata key %q; expected aggregate-only keys", key)
		}
	}

	for _, forbidden := range []string{"patient_name", "phone", "email", "dob", "appointment_id"} {
		if _, exists := events[0].Metadata[forbidden]; exists {
			t.Fatalf("forbidden PHI metadata key present: %s", forbidden)
		}
	}
}
