package cron

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// ParseCron parses a standard cron expression (5 fields: min hour dom month dow)
// and returns the next fire time after 'after'.
//
// Supported field formats:
//   - "*"        = every value
//   - "N"        = exact value
//   - "*/N"      = every N (step)
//   - "N-M"      = range (inclusive)
//   - "N,M,..."  = list of values
func ParseCron(expression string, after time.Time) (time.Time, error) {
	fields := strings.Fields(expression)
	if len(fields) != 5 {
		return time.Time{}, fmt.Errorf("cron: expected 5 fields, got %d", len(fields))
	}

	minutes, err := parseField(fields[0], 0, 59)
	if err != nil {
		return time.Time{}, fmt.Errorf("cron: minutes: %w", err)
	}
	hours, err := parseField(fields[1], 0, 23)
	if err != nil {
		return time.Time{}, fmt.Errorf("cron: hours: %w", err)
	}
	doms, err := parseField(fields[2], 1, 31)
	if err != nil {
		return time.Time{}, fmt.Errorf("cron: day-of-month: %w", err)
	}
	months, err := parseField(fields[3], 1, 12)
	if err != nil {
		return time.Time{}, fmt.Errorf("cron: month: %w", err)
	}
	dows, err := parseField(fields[4], 0, 6)
	if err != nil {
		return time.Time{}, fmt.Errorf("cron: day-of-week: %w", err)
	}

	minuteSet := toSet(minutes)
	hourSet := toSet(hours)
	domSet := toSet(doms)
	monthSet := toSet(months)
	dowSet := toSet(dows)

	// Start one minute after 'after', truncated to the minute.
	candidate := after.Truncate(time.Minute).Add(time.Minute)

	// Search up to 366 days ahead.
	limit := after.Add(366 * 24 * time.Hour)
	for candidate.Before(limit) {
		if !monthSet[int(candidate.Month())] {
			// Skip to the first day of the next month.
			candidate = time.Date(candidate.Year(), candidate.Month()+1, 1, 0, 0, 0, 0, candidate.Location())
			continue
		}
		if !domSet[candidate.Day()] || !dowSet[int(candidate.Weekday())] {
			// Skip to the next day.
			candidate = time.Date(candidate.Year(), candidate.Month(), candidate.Day()+1, 0, 0, 0, 0, candidate.Location())
			continue
		}
		if !hourSet[candidate.Hour()] {
			// Skip to the next hour.
			candidate = candidate.Truncate(time.Hour).Add(time.Hour)
			continue
		}
		if !minuteSet[candidate.Minute()] {
			candidate = candidate.Add(time.Minute)
			continue
		}
		return candidate, nil
	}
	return time.Time{}, fmt.Errorf("cron: no next run found within 366 days")
}

// ParseInterval parses interval expressions like "every 5m", "every 1h", "every 30s".
// Returns the next fire time after 'after'.
func ParseInterval(expr string, after time.Time) (time.Time, error) {
	expr = strings.TrimSpace(expr)
	if !strings.HasPrefix(expr, "every ") {
		return time.Time{}, fmt.Errorf("interval: expected 'every <duration>', got %q", expr)
	}

	durStr := strings.TrimPrefix(expr, "every ")
	durStr = strings.TrimSpace(durStr)

	dur, err := time.ParseDuration(durStr)
	if err != nil {
		return time.Time{}, fmt.Errorf("interval: invalid duration %q: %w", durStr, err)
	}
	if dur <= 0 {
		return time.Time{}, fmt.Errorf("interval: duration must be positive, got %v", dur)
	}

	return after.Add(dur), nil
}

// NextRun determines the next execution time for a schedule expression.
// It auto-detects whether the expression is a cron expression or an interval.
func NextRun(expression string, after time.Time) (time.Time, error) {
	expression = strings.TrimSpace(expression)
	if strings.HasPrefix(expression, "every ") {
		return ParseInterval(expression, after)
	}
	return ParseCron(expression, after)
}

// parseField parses a single cron field and returns the matching values.
func parseField(field string, min, max int) ([]int, error) {
	if field == "*" {
		return rangeInts(min, max), nil
	}

	// Handle step: "*/N" or "M-N/S"
	if strings.Contains(field, "/") {
		parts := strings.SplitN(field, "/", 2)
		step, err := strconv.Atoi(parts[1])
		if err != nil || step <= 0 {
			return nil, fmt.Errorf("invalid step %q", parts[1])
		}

		var base []int
		if parts[0] == "*" {
			base = rangeInts(min, max)
		} else if strings.Contains(parts[0], "-") {
			base, err = parseRange(parts[0], min, max)
			if err != nil {
				return nil, err
			}
		} else {
			start, err := strconv.Atoi(parts[0])
			if err != nil {
				return nil, fmt.Errorf("invalid field %q", parts[0])
			}
			base = rangeInts(start, max)
		}

		var result []int
		for i, v := range base {
			if i%step == 0 {
				result = append(result, v)
			}
		}
		return result, nil
	}

	// Handle list: "1,2,3"
	if strings.Contains(field, ",") {
		var result []int
		for _, part := range strings.Split(field, ",") {
			v, err := strconv.Atoi(strings.TrimSpace(part))
			if err != nil {
				return nil, fmt.Errorf("invalid value %q", part)
			}
			if v < min || v > max {
				return nil, fmt.Errorf("value %d out of range [%d, %d]", v, min, max)
			}
			result = append(result, v)
		}
		return result, nil
	}

	// Handle range: "1-5"
	if strings.Contains(field, "-") {
		return parseRange(field, min, max)
	}

	// Single value.
	v, err := strconv.Atoi(field)
	if err != nil {
		return nil, fmt.Errorf("invalid value %q", field)
	}
	if v < min || v > max {
		return nil, fmt.Errorf("value %d out of range [%d, %d]", v, min, max)
	}
	return []int{v}, nil
}

// parseRange parses "N-M" and returns all integers from N to M inclusive.
func parseRange(field string, min, max int) ([]int, error) {
	parts := strings.SplitN(field, "-", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid range %q", field)
	}
	start, err := strconv.Atoi(parts[0])
	if err != nil {
		return nil, fmt.Errorf("invalid range start %q", parts[0])
	}
	end, err := strconv.Atoi(parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid range end %q", parts[1])
	}
	if start < min || end > max || start > end {
		return nil, fmt.Errorf("range %d-%d out of bounds [%d, %d]", start, end, min, max)
	}
	return rangeInts(start, end), nil
}

// rangeInts returns a slice of integers from start to end inclusive.
func rangeInts(start, end int) []int {
	result := make([]int, 0, end-start+1)
	for i := start; i <= end; i++ {
		result = append(result, i)
	}
	return result
}

// toSet converts a slice of ints to a set (map) for O(1) lookups.
func toSet(vals []int) map[int]bool {
	m := make(map[int]bool, len(vals))
	for _, v := range vals {
		m[v] = true
	}
	return m
}
