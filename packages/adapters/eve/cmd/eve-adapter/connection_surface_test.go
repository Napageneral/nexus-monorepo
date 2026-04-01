package main

import (
	"context"
	"testing"
)

func TestDefaultConnectionIDFromSurfacePrefersHostAndUsername(t *testing.T) {
	surface := eveSessionSurface{
		Hostname: "Tyler-MacBook-Pro.local",
		Username: "tyler",
		Account:  "tyler@example.com",
	}

	if got := defaultConnectionIDFromSurface(surface); got != "eve-tyler-macbook-pro-local-tyler" {
		t.Fatalf("expected host+username derived connection id, got %q", got)
	}
}

func TestDefaultConnectionIDFromSurfaceFallsBackSafely(t *testing.T) {
	if got := defaultConnectionIDFromSurface(eveSessionSurface{Account: "tyler@example.com"}); got != "eve-tyler-example-com" {
		t.Fatalf("expected account fallback connection id, got %q", got)
	}
	if got := defaultConnectionIDFromSurface(eveSessionSurface{}); got != "eve-local" {
		t.Fatalf("expected eve-local fallback, got %q", got)
	}
}

func TestDefaultConnectionIDPrefersConfiguredEnv(t *testing.T) {
	t.Setenv("EVE_CONNECTION_ID", "conn-tyler")
	if got := defaultConnectionID(); got != "conn-tyler" {
		t.Fatalf("expected configured env connection id, got %q", got)
	}
}

func TestDefaultDisplayNameFromSurfaceIncludesHostWhenKnown(t *testing.T) {
	surface := eveSessionSurface{
		Hostname: "Tyler-MacBook-Pro",
		FullName: "Tyler Brandt",
	}
	if got := defaultDisplayNameFromSurface(surface); got != "Tyler Brandt on Tyler-MacBook-Pro" {
		t.Fatalf("unexpected default display name: %q", got)
	}
}

func TestDefaultDisplayNamePrefersConfiguredEnv(t *testing.T) {
	t.Setenv("EVE_CONNECTION_DISPLAY_NAME", "Tyler Eve Edge")
	if got := defaultDisplayName(); got != "Tyler Eve Edge" {
		t.Fatalf("expected configured env display name, got %q", got)
	}
}

func TestMergeSessionDetailsAddsOperatorSessionMetadata(t *testing.T) {
	surface := eveSessionSurface{
		Hostname: "Tyler-MacBook-Pro",
		Username: "tyler",
		UID:      "501",
		FullName: "Tyler Brandt",
	}
	got := mergeSessionDetails(map[string]any{
		"chat_db_path": "/Users/tyler/Library/Messages/chat.db",
	}, surface)

	if got["session_host"] != "Tyler-MacBook-Pro" {
		t.Fatalf("expected session_host detail, got %#v", got["session_host"])
	}
	if got["session_user"] != "tyler" {
		t.Fatalf("expected session_user detail, got %#v", got["session_user"])
	}
	if got["session_uid"] != "501" {
		t.Fatalf("expected session_uid detail, got %#v", got["session_uid"])
	}
	if got["session_full_name"] != "Tyler Brandt" {
		t.Fatalf("expected session_full_name detail, got %#v", got["session_full_name"])
	}
	if got["chat_db_path"] != "/Users/tyler/Library/Messages/chat.db" {
		t.Fatalf("expected existing detail to survive merge, got %#v", got["chat_db_path"])
	}
}

func TestEveConnectionsUseDerivedSessionIdentity(t *testing.T) {
	oldIdentity := cachedSelfIdentity
	oldFullName := cachedFullName
	defer func() {
		cachedSelfIdentity = oldIdentity
		cachedFullName = oldFullName
	}()

	cachedSelfIdentity = &selfIdentity{
		Name:   "Tyler Brandt",
		Emails: []string{"tyler@example.com"},
	}
	cachedFullName = "Tyler Brandt"

	connections, err := eveConnections(context.Background())
	if err != nil {
		t.Fatalf("eveConnections returned error: %v", err)
	}
	if len(connections) != 1 {
		t.Fatalf("expected one connection, got %d", len(connections))
	}
	if connections[0].ID == "" || connections[0].ID == "default" {
		t.Fatalf("expected non-default derived connection id, got %#v", connections[0].ID)
	}
	if connections[0].Account != "tyler@example.com" {
		t.Fatalf("expected account email, got %#v", connections[0].Account)
	}
	if connections[0].AccountContact == nil {
		t.Fatalf("expected account contact")
	}
}

func TestAdapterConfigMarksEveMultiAccount(t *testing.T) {
	cfg := adapterConfig()
	if !cfg.MultiAccount {
		t.Fatal("expected Eve adapter to advertise multi-account support")
	}
}
