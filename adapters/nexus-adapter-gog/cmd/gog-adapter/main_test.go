package main

import (
	"fmt"
	"path/filepath"
	"testing"
	"time"
)

func TestParseEmailContent(t *testing.T) {
	t.Run("subject prefix", func(t *testing.T) {
		subject, body := parseEmailContent("Subject: Hello\n\nWorld")
		if subject != "Hello" {
			t.Fatalf("subject=%q", subject)
		}
		if body != "World" {
			t.Fatalf("body=%q", body)
		}
	})

	t.Run("default subject", func(t *testing.T) {
		subject, body := parseEmailContent("hi")
		if subject != defaultSubject {
			t.Fatalf("subject=%q", subject)
		}
		if body != "hi" {
			t.Fatalf("body=%q", body)
		}
	})
}

func TestBuildGmailSendArgs(t *testing.T) {
	t.Run("basic send args", func(t *testing.T) {
		args := buildGmailSendArgs("a@b.com", "Hi", "Body", "", "")
		want := []string{"gmail", "send", "--to", "a@b.com", "--subject", "Hi", "--body", "Body"}
		if len(args) != len(want) {
			t.Fatalf("len(args)=%d len(want)=%d", len(args), len(want))
		}
		for i := range want {
			if args[i] != want[i] {
				t.Fatalf("args[%d]=%q want=%q", i, args[i], want[i])
			}
		}
	})

	t.Run("thread and reply args", func(t *testing.T) {
		args := buildGmailSendArgs("a@b.com", "Hi", "Body", "thread-1", "msg-9")
		joined := make(map[string]bool)
		for i := 0; i < len(args)-1; i++ {
			joined[args[i]+"="+args[i+1]] = true
		}
		if !joined["--reply-to-message-id=msg-9"] {
			t.Fatalf("missing reply-to-message-id arg: %#v", args)
		}
		if joined["--thread-id=thread-1"] {
			t.Fatalf("thread-id should be omitted when reply-to is present: %#v", args)
		}
	})
}

func TestMonitorStateRoundTrip(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), "state", "monitor.json")
	if err := writeMonitorCursor(statePath, "12345"); err != nil {
		t.Fatalf("writeMonitorCursor error: %v", err)
	}
	got, err := readMonitorCursor(statePath)
	if err != nil {
		t.Fatalf("readMonitorCursor error: %v", err)
	}
	if got != "12345" {
		t.Fatalf("cursor=%q", got)
	}
}

func TestResolveMonitorStatePathUsesEnv(t *testing.T) {
	t.Setenv("NEXUS_GOG_STATE_PATH", "/tmp/custom-state.json")
	got, err := resolveMonitorStatePath("a@b.com")
	if err != nil {
		t.Fatalf("resolveMonitorStatePath error: %v", err)
	}
	if got != "/tmp/custom-state.json" {
		t.Fatalf("path=%q", got)
	}
}

func TestInfoIncludesBackfillOperation(t *testing.T) {
	got, err := info(t.Context())
	if err != nil {
		t.Fatalf("info() error: %v", err)
	}
	found := false
	for _, operation := range got.Operations {
		if operation == "records.backfill" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected records.backfill operation in info.Operations, got %#v", got.Operations)
	}
}

func TestResolvePollQuery(t *testing.T) {
	t.Run("defaults", func(t *testing.T) {
		got := resolvePollQuery()
		if got != defaultPollQuery {
			t.Fatalf("query=%q", got)
		}
	})

	t.Run("env override", func(t *testing.T) {
		t.Setenv("NEXUS_GOG_POLL_QUERY", "label:inbox newer_than:1d")
		got := resolvePollQuery()
		if got != "label:inbox newer_than:1d" {
			t.Fatalf("query=%q", got)
		}
	})
}

func TestBuildBackfillQuery(t *testing.T) {
	since := time.Date(2026, 2, 18, 23, 15, 0, 0, time.UTC)

	t.Run("defaults to inbox only", func(t *testing.T) {
		got := buildBackfillQuery(since)
		if got != "in:inbox -in:spam -category:promotions -category:social after:2026/02/18" {
			t.Fatalf("query=%q", got)
		}
	})

	t.Run("supports base override", func(t *testing.T) {
		t.Setenv("NEXUS_GOG_BACKFILL_QUERY_BASE", "in:anywhere -in:spam")
		got := buildBackfillQuery(since)
		if got != "in:anywhere -in:spam after:2026/02/18" {
			t.Fatalf("query=%q", got)
		}
	})

	t.Run("supports full query override", func(t *testing.T) {
		t.Setenv("NEXUS_GOG_BACKFILL_QUERY", "in:trash after:2020/01/01")
		got := buildBackfillQuery(since)
		if got != "in:trash after:2020/01/01" {
			t.Fatalf("query=%q", got)
		}
	})

	t.Run("full query override appends after when missing", func(t *testing.T) {
		t.Setenv("NEXUS_GOG_BACKFILL_QUERY", "in:anywhere -in:spam")
		got := buildBackfillQuery(since)
		if got != "in:anywhere -in:spam after:2026/02/18" {
			t.Fatalf("query=%q", got)
		}
	})
}

func TestSeenMessageSetCapsSize(t *testing.T) {
	set := newSeenMessageSet(nil)
	for i := 0; i < maxSeenMessageIDs+25; i++ {
		set.Add(fmt.Sprintf("id-%d", i))
	}
	if len(set.Snapshot()) > maxSeenMessageIDs {
		t.Fatalf("seen snapshot too large: %d", len(set.Snapshot()))
	}
}

func TestTrimSeenMessageIDsDedupes(t *testing.T) {
	trimmed := trimSeenMessageIDs([]string{"a", " ", "b", "a", "b", "c"})
	if len(trimmed) != 3 {
		t.Fatalf("len(trimmed)=%d, want=3", len(trimmed))
	}
	if trimmed[0] != "a" || trimmed[1] != "b" || trimmed[2] != "c" {
		t.Fatalf("trimmed=%#v", trimmed)
	}
}

func TestRateLimitHelpers(t *testing.T) {
	if !isRateLimitError("Google API error (403 rateLimitExceeded): Quota exceeded for quota metric") {
		t.Fatalf("expected rate limit detection")
	}
	if isRateLimitError("permission denied") {
		t.Fatalf("unexpected rate limit detection")
	}

	if got := backoffDelay(0, time.Second); got != time.Second {
		t.Fatalf("attempt0 backoff=%s", got)
	}
	if got := backoffDelay(3, time.Second); got != 8*time.Second {
		t.Fatalf("attempt3 backoff=%s", got)
	}
	if got := backoffDelay(10, 10*time.Second); got != maxRetryDelay {
		t.Fatalf("expected capped delay=%s got=%s", maxRetryDelay, got)
	}
}

func TestResolveRateLimitConfig(t *testing.T) {
	if got := resolveRateLimitRetries(); got != defaultRateLimitRetries {
		t.Fatalf("default retries=%d", got)
	}
	if got := resolveRateLimitBackoff(); got != defaultRetryBaseDelay {
		t.Fatalf("default backoff=%s", got)
	}

	t.Setenv("NEXUS_GOG_RATE_LIMIT_RETRIES", "9")
	t.Setenv("NEXUS_GOG_RATE_LIMIT_BACKOFF", "5s")
	if got := resolveRateLimitRetries(); got != 9 {
		t.Fatalf("configured retries=%d", got)
	}
	if got := resolveRateLimitBackoff(); got != 5*time.Second {
		t.Fatalf("configured backoff=%s", got)
	}
}
