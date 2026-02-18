package main

import "testing"

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
