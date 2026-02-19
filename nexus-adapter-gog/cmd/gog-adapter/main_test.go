package main

import (
	"path/filepath"
	"testing"
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
		if !joined["--thread-id=thread-1"] {
			t.Fatalf("missing thread-id arg: %#v", args)
		}
		if !joined["--reply-to-message-id=msg-9"] {
			t.Fatalf("missing reply-to-message-id arg: %#v", args)
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
