package nexadapter

import (
	"testing"
	"time"
)

func TestMetricTimestamp(t *testing.T) {
	// 2026-03-05 noon UTC = 1772884800000 ms
	utcNoon := time.Date(2026, 3, 5, 12, 0, 0, 0, time.UTC).UnixMilli()

	t.Run("basic UTC", func(t *testing.T) {
		got := MetricTimestamp("2026-03-05", nil)
		if got != utcNoon {
			t.Errorf("MetricTimestamp(\"2026-03-05\", nil) = %d, want %d", got, utcNoon)
		}
	})

	t.Run("explicit UTC", func(t *testing.T) {
		got := MetricTimestamp("2026-03-05", time.UTC)
		if got != utcNoon {
			t.Errorf("MetricTimestamp(\"2026-03-05\", UTC) = %d, want %d", got, utcNoon)
		}
	})

	t.Run("timezone aware", func(t *testing.T) {
		// Phoenix is UTC-7 (no DST)
		phoenix, err := time.LoadLocation("America/Phoenix")
		if err != nil {
			t.Skip("America/Phoenix timezone not available")
		}
		// 2026-03-05 noon MST = 2026-03-05 19:00:00 UTC
		want := time.Date(2026, 3, 5, 12, 0, 0, 0, phoenix).UnixMilli()
		got := MetricTimestamp("2026-03-05", phoenix)
		if got != want {
			t.Errorf("MetricTimestamp(\"2026-03-05\", Phoenix) = %d, want %d (diff: %dms)",
				got, want, got-want)
		}
		// Should differ from UTC by 7 hours
		diffHours := (got - utcNoon) / (3600 * 1000)
		if diffHours != 7 {
			t.Errorf("expected 7 hour difference from UTC, got %d", diffHours)
		}
	})

	t.Run("trims whitespace", func(t *testing.T) {
		got := MetricTimestamp("  2026-03-05  ", nil)
		if got != utcNoon {
			t.Errorf("should trim whitespace")
		}
	})

	t.Run("empty string returns now", func(t *testing.T) {
		before := time.Now().UnixMilli()
		got := MetricTimestamp("", nil)
		after := time.Now().UnixMilli()
		if got < before || got > after {
			t.Errorf("empty string should return current time, got %d (before=%d, after=%d)", got, before, after)
		}
	})

	t.Run("invalid date returns now", func(t *testing.T) {
		before := time.Now().UnixMilli()
		got := MetricTimestamp("not-a-date", nil)
		after := time.Now().UnixMilli()
		if got < before || got > after {
			t.Errorf("invalid date should return current time")
		}
	})
}

func TestExtractISODate(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"iso date", "2026-03-05", "2026-03-05"},
		{"rfc3339", "2026-03-05T14:30:00Z", "2026-03-05"},
		{"rfc3339 with offset", "2026-03-05T14:30:00-07:00", "2026-03-05"},
		{"datetime space", "2026-03-05 14:30:00", "2026-03-05"},
		{"with whitespace", "  2026-03-05  ", "2026-03-05"},
		{"empty string", "", ""},
		{"invalid", "not-a-date", ""},
		{"too short", "2026", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ExtractISODate(tt.input)
			if got != tt.want {
				t.Errorf("ExtractISODate(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
