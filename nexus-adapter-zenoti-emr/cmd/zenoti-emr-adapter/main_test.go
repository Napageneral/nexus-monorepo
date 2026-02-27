package main

import "testing"

func TestAggregateAppointmentRows(t *testing.T) {
	target := map[string]*metricPoint{}
	rows := []map[string]any{
		{
			"appointment_date": "2026-02-26",
			"status":           "closed",
			"is_new_guest":     true,
			"revenue":          320.5,
			"service_category": "injectables",
		},
		{
			"appointment_date": "2026-02-26",
			"status":           "no_show",
			"is_new_guest":     false,
		},
	}

	aggregateAppointmentRows(target, rows)
	points := sortedMetricPoints(target)
	if len(points) == 0 {
		t.Fatalf("expected aggregated points")
	}

	foundRevenue := false
	foundNewPatients := false
	for _, point := range points {
		if point.MetricName == "revenue" {
			foundRevenue = true
		}
		if point.MetricName == "patients_new" {
			foundNewPatients = true
		}
	}
	if !foundRevenue {
		t.Fatalf("expected revenue metric")
	}
	if !foundNewPatients {
		t.Fatalf("expected patients_new metric")
	}
}

func TestAppointmentNewGuest(t *testing.T) {
	if value, known := appointmentNewGuest(map[string]any{"is_new_guest": "yes"}); !known || !value {
		t.Fatalf("expected true new guest")
	}
	if value, known := appointmentNewGuest(map[string]any{"guest": map[string]any{"visits_count": 4}}); !known || value {
		t.Fatalf("expected returning guest from visits_count")
	}
}

func TestToISODate(t *testing.T) {
	if got := toISODate("2026-02-26T12:34:56Z"); got != "2026-02-26" {
		t.Fatalf("toISODate mismatch: %q", got)
	}
	if got := toISODate("not-a-date"); got != "" {
		t.Fatalf("expected empty iso date, got %q", got)
	}
}

func TestBuildZenotiMetricEvents_AggregateMetadataOnly(t *testing.T) {
	events := buildZenotiMetricEvents(
		zenotiCredentials{
			AccountID: "default",
			CenterID:  "center_123",
		},
		metricPoint{
			Date:        "2026-02-26",
			MetricName:  "patients_new",
			MetadataKey: "injectables",
			Value:       9,
		},
	)

	if len(events) != 1 {
		t.Fatalf("expected one event, got %d", len(events))
	}

	allowed := map[string]bool{
		"adapter_id":   true,
		"center_id":    true,
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
