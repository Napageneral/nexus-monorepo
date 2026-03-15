package nexadapter

import (
	"strings"
	"time"
)

const isoDateLayout = "2006-01-02"

// MetricTimestamp converts an ISO date string (YYYY-MM-DD) to Unix milliseconds
// at noon in the given timezone. If tz is nil, defaults to UTC.
//
// Anchoring at noon avoids ambiguity around day boundaries and DST transitions.
// The timezone parameter allows clinics to anchor metrics in their local business
// day rather than UTC.
//
// Falls back to the current time if parsing fails.
func MetricTimestamp(isoDate string, tz *time.Location) int64 {
	if tz == nil {
		tz = time.UTC
	}
	trimmed := strings.TrimSpace(isoDate)
	if trimmed == "" {
		return time.Now().UnixMilli()
	}

	// Parse as a date in the specified timezone
	parsed, err := time.ParseInLocation(isoDateLayout, trimmed, tz)
	if err != nil {
		return time.Now().UnixMilli()
	}
	return parsed.Add(12 * time.Hour).UnixMilli()
}

// ExtractISODate attempts to extract a YYYY-MM-DD date from various timestamp
// formats. Tries direct substring extraction first (for timestamps starting with
// a date), then falls back to parsing common formats.
//
// Returns "" if no date could be extracted.
func ExtractISODate(timestamp string) string {
	trimmed := strings.TrimSpace(timestamp)
	if trimmed == "" {
		return ""
	}

	// Fast path: if it starts with YYYY-MM-DD, extract directly
	if len(trimmed) >= 10 {
		candidate := trimmed[:10]
		if _, err := time.Parse(isoDateLayout, candidate); err == nil {
			return candidate
		}
	}

	// Try common timestamp formats
	formats := []string{
		time.RFC3339,
		"2006-01-02T15:04:05-07:00",
		"2006-01-02 15:04:05",
		isoDateLayout,
	}
	for _, layout := range formats {
		if parsed, err := time.Parse(layout, trimmed); err == nil {
			return parsed.UTC().Format(isoDateLayout)
		}
	}

	return ""
}
