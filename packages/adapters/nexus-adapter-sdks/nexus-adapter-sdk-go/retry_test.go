package nexadapter

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestWithRetryEventuallySucceeds(t *testing.T) {
	attempts := 0
	value, err := WithRetry(context.Background(), func() (string, error) {
		attempts++
		if attempts < 3 {
			return "", errors.New("retry me")
		}
		return "ok", nil
	}, RetryOptions{
		Attempts:     3,
		InitialDelay: time.Millisecond,
		MaxDelay:     time.Millisecond,
	})
	if err != nil {
		t.Fatalf("WithRetry: %v", err)
	}
	if value != "ok" {
		t.Fatalf("value = %q", value)
	}
	if attempts != 3 {
		t.Fatalf("attempts = %d", attempts)
	}
}

func TestParseRetryAfterMs(t *testing.T) {
	if got := ParseRetryAfterMs("2"); got != 2000 {
		t.Fatalf("seconds parse = %d", got)
	}
	if got := ParseRetryAfterMs(1500); got != 1500 {
		t.Fatalf("int parse = %d", got)
	}
}
