package record

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/nexus-project/adapter-confluence/internal/atlassian"
)

func TestBuildPageRecord(t *testing.T) {
	t.Parallel()

	page := atlassian.Page{
		ID:       "123456",
		Title:    "Session Management Architecture",
		ParentID: "100000",
		Version: atlassian.PageVersion{
			Number:    3,
			AuthorID:  "abc123",
			CreatedAt: time.Date(2026, 2, 6, 0, 0, 0, 0, time.UTC),
		},
		Body: atlassian.PageBody{
			Storage: atlassian.StorageBody{Value: "<p>This document describes...</p>", Representation: "storage"},
		},
		Labels: []atlassian.Label{{Name: "architecture"}, {Name: "sessions"}},
	}
	space := atlassian.Space{Key: "ENG", Name: "Engineering"}

	event := BuildPageRecord(page, space, "vrtly-confluence", "vrtly-cloud", "Vrtly Cloud", "/confluence/pages/123456/v3/body.html", "Alice Smith")
	if event.Operation != "record.ingest" {
		t.Fatalf("Operation = %q", event.Operation)
	}
	if event.Payload.ExternalRecordID != "confluence:vrtly-cloud:page/123456:v3" {
		t.Fatalf("ExternalRecordID = %q", event.Payload.ExternalRecordID)
	}
	if event.Routing.ConnectionID != "vrtly-confluence" || event.Routing.SenderID != "abc123" || event.Routing.SenderName != "Alice Smith" {
		t.Fatalf("routing mismatch: %#v", event)
	}
	if event.Routing.SpaceID != "vrtly-cloud" || event.Routing.SpaceName != "Vrtly Cloud" {
		t.Fatalf("space mismatch: %#v", event)
	}
	if event.Routing.ContainerKind != "group" || event.Routing.ContainerID != "ENG" || event.Routing.ContainerName != "Engineering" {
		t.Fatalf("container mismatch: %#v", event)
	}
	if event.Routing.ThreadID != "page/123456" || event.Routing.ThreadName != "Session Management Architecture" {
		t.Fatalf("thread mismatch: %#v", event)
	}
	if len(event.Payload.Attachments) != 1 {
		t.Fatalf("len(Attachments) = %d", len(event.Payload.Attachments))
	}
	if event.Payload.Attachments[0].Filename != "session-management-architecture.html" {
		t.Fatalf("attachment filename = %q", event.Payload.Attachments[0].Filename)
	}
	if got := event.Payload.Metadata["parent_page_id"]; got != "page/100000" {
		t.Fatalf("parent_page_id = %#v", got)
	}
}

func TestExtractExcerpt(t *testing.T) {
	t.Parallel()

	got := ExtractExcerpt(`<p>This is a <strong>bold</strong> introduction.</p><ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[func main()]]></ac:plain-text-body></ac:structured-macro><p>Second paragraph with more text.</p>`, 500)
	if got == "" || containsAny(got, "<strong>", "<ac:", "<![CDATA[") {
		t.Fatalf("excerpt = %q", got)
	}
}

func TestSlugify(t *testing.T) {
	t.Parallel()

	cases := map[string]string{
		"Session Management Architecture": "session-management-architecture",
		"  Leading and Trailing  ":        "leading-and-trailing",
		"UPPERCASE ONLY":                  "uppercase-only",
	}
	for input, want := range cases {
		if got := Slugify(input); got != want {
			t.Fatalf("Slugify(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestUserCache(t *testing.T) {
	t.Parallel()

	client := &fakeUserClient{users: map[string]*atlassian.User{
		"abc123": {AccountID: "abc123", DisplayName: "Alice Smith"},
	}}
	cache := NewUserCache()
	if got := cache.Resolve(context.Background(), client, "abc123"); got != "Alice Smith" {
		t.Fatalf("Resolve() = %q", got)
	}
	if got := cache.Resolve(context.Background(), client, "abc123"); got != "Alice Smith" {
		t.Fatalf("Resolve() cache = %q", got)
	}
	if client.calls != 1 {
		t.Fatalf("calls = %d", client.calls)
	}

	if got := cache.Resolve(context.Background(), client, "missing"); got != "" {
		t.Fatalf("Resolve(missing) = %q", got)
	}
}

type fakeUserClient struct {
	users map[string]*atlassian.User
	calls int
}

func (f *fakeUserClient) GetUser(_ context.Context, userID string) (*atlassian.User, error) {
	f.calls++
	user := f.users[userID]
	if user == nil {
		return nil, errors.New("not found")
	}
	return user, nil
}

func containsAny(value string, patterns ...string) bool {
	for _, pattern := range patterns {
		if pattern != "" && strings.Contains(value, pattern) {
			return true
		}
	}
	return false
}
