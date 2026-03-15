package nexadapter

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

var ErrTargetContainerRequired = fmt.Errorf("target.channel.container_id is required")

type RetryOptions struct {
	Attempts     int
	InitialDelay time.Duration
	MaxDelay     time.Duration
	Factor       float64
	ShouldRetry  func(err error, attempt int) bool
	OnRetry      func(err error, attempt int, delay time.Duration)
}

func SleepContext(ctx context.Context, delay time.Duration) error {
	if delay <= 0 {
		return nil
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func ParseRetryAfterMs(value any) int {
	switch v := value.(type) {
	case int:
		if v >= 0 {
			return v
		}
	case int64:
		if v >= 0 {
			return int(v)
		}
	case float64:
		if v >= 0 && !math.IsNaN(v) && !math.IsInf(v, 0) {
			return int(v)
		}
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return 0
		}
		if seconds, err := strconv.ParseFloat(trimmed, 64); err == nil && seconds >= 0 {
			return int(seconds * 1000)
		}
		if parsed, err := time.Parse(time.RFC1123, trimmed); err == nil {
			return max(0, int(time.Until(parsed).Milliseconds()))
		}
		if parsed, err := time.Parse(time.RFC3339, trimmed); err == nil {
			return max(0, int(time.Until(parsed).Milliseconds()))
		}
	}
	return 0
}

func WithRetry[T any](ctx context.Context, work func() (T, error), options RetryOptions) (T, error) {
	var zero T

	attempts := options.Attempts
	if attempts <= 0 {
		attempts = 3
	}
	delay := options.InitialDelay
	if delay <= 0 {
		delay = time.Second
	}
	maxDelay := options.MaxDelay
	if maxDelay <= 0 {
		maxDelay = 30 * time.Second
	}
	factor := options.Factor
	if factor <= 0 {
		factor = 2
	}

	for attempt := 1; attempt <= attempts; attempt++ {
		result, err := work()
		if err == nil {
			return result, nil
		}

		shouldRetry := attempt < attempts
		if options.ShouldRetry != nil {
			shouldRetry = options.ShouldRetry(err, attempt)
		}
		if !shouldRetry || attempt >= attempts {
			return zero, err
		}
		if options.OnRetry != nil {
			options.OnRetry(err, attempt, delay)
		}
		if err := SleepContext(ctx, delay); err != nil {
			return zero, err
		}

		nextDelay := time.Duration(float64(delay) * factor)
		if nextDelay > maxDelay {
			nextDelay = maxDelay
		}
		delay = nextDelay
	}

	return zero, fmt.Errorf("retry exhausted")
}
