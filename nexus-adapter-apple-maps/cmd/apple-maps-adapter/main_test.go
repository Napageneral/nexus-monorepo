package main

import "testing"

func TestResolveManualMetrics(t *testing.T) {
	t.Setenv("NEXUS_APPLE_MAPS_DATE", "2026-02-26")
	t.Setenv("NEXUS_APPLE_MAPS_REVIEWS_COUNT", "102")
	t.Setenv("NEXUS_APPLE_MAPS_REVIEWS_RATING_AVG", "4.8")
	t.Setenv("NEXUS_APPLE_MAPS_REVIEWS_NEW", "6")

	metrics := resolveManualMetrics()
	if len(metrics) != 3 {
		t.Fatalf("expected 3 manual metrics, got %d", len(metrics))
	}
	if metrics[0].Date != "2026-02-26" {
		t.Fatalf("unexpected date: %q", metrics[0].Date)
	}
}

func TestSanitizeToken(t *testing.T) {
	if got := sanitizeToken("Apple Maps #42"); got != "apple-maps--42" {
		t.Fatalf("sanitizeToken mismatch: %q", got)
	}
}
