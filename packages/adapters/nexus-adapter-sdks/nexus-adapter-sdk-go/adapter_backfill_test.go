package nexadapter

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestRunBackfillPassesExactWindow(t *testing.T) {
	var observed BackfillWindow
	adapter := Adapter{Operations: AdapterOperations{
		RecordsBackfillWindow: func(_ context.Context, connectionID string, window BackfillWindow, _ EmitFunc) error {
			if connectionID != "primary" {
				t.Fatalf("connection = %q", connectionID)
			}
			observed = window
			return nil
		},
	}}

	err := runBackfill(adapter, []string{
		"--connection", "primary",
		"--since", "2026-07-21T00:00:00Z",
		"--to", "2026-07-23T12:34:56Z",
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := observed.Since.Format(time.RFC3339); got != "2026-07-21T00:00:00Z" {
		t.Fatalf("since = %s", got)
	}
	if got := observed.To.Format(time.RFC3339); got != "2026-07-23T12:34:56Z" {
		t.Fatalf("to = %s", got)
	}
}

func TestRunBackfillRejectsReverseWindowBeforeHandler(t *testing.T) {
	called := false
	adapter := Adapter{Operations: AdapterOperations{
		RecordsBackfillWindow: func(_ context.Context, _ string, _ BackfillWindow, _ EmitFunc) error {
			called = true
			return nil
		},
	}}

	err := runBackfill(adapter, []string{
		"--connection", "primary",
		"--since", "2026-07-23T12:34:56Z",
		"--to", "2026-07-21T00:00:00Z",
	})
	if err == nil || !strings.Contains(err.Error(), "--to must be greater than or equal to --since") {
		t.Fatalf("error = %v", err)
	}
	if called {
		t.Fatal("bounded handler ran for a reverse window")
	}
}

func TestRunBackfillRefusesToDropUpperBoundForLegacyHandler(t *testing.T) {
	called := false
	adapter := Adapter{Operations: AdapterOperations{
		RecordsBackfill: func(_ context.Context, _ string, _ time.Time, _ EmitFunc) error {
			called = true
			return nil
		},
	}}

	err := runBackfill(adapter, []string{
		"--connection", "primary",
		"--since", "2026-07-21T00:00:00Z",
		"--to", "2026-07-23T12:34:56Z",
	})
	if err == nil || !strings.Contains(err.Error(), "does not support an exact --to boundary") {
		t.Fatalf("error = %v", err)
	}
	if called {
		t.Fatal("legacy handler ran after an upper bound was supplied")
	}
}
