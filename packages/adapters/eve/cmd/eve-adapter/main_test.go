package main

import (
	"context"
	"database/sql"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestResolveSelfAccountProjection(t *testing.T) {
	t.Run("prefers email over phone", func(t *testing.T) {
		account, contact := resolveSelfAccountProjection(selfIdentity{
			Name:   "Tyler",
			Emails: []string{"tyler@example.com"},
			Phones: []string{"+17075551212"},
		})
		if account != "tyler@example.com" {
			t.Fatalf("expected account email, got %q", account)
		}
		if contact == nil {
			t.Fatalf("expected account contact")
		}
		if contact.Platform != "email" || contact.SpaceID != "" || contact.ContactID != "tyler@example.com" {
			t.Fatalf("unexpected account contact: %#v", contact)
		}
	})

	t.Run("falls back to phone", func(t *testing.T) {
		account, contact := resolveSelfAccountProjection(selfIdentity{
			Name:   "Tyler",
			Phones: []string{"+17075551212"},
		})
		if account != "+17075551212" {
			t.Fatalf("expected account phone, got %q", account)
		}
		if contact == nil {
			t.Fatalf("expected account contact")
		}
		if contact.Platform != "phone" || contact.SpaceID != "" || contact.ContactID != "+17075551212" {
			t.Fatalf("unexpected account contact: %#v", contact)
		}
	})

	t.Run("leaves unknown identity unset", func(t *testing.T) {
		account, contact := resolveSelfAccountProjection(selfIdentity{Name: "Tyler"})
		if account != "default" {
			t.Fatalf("expected default account, got %q", account)
		}
		if contact != nil {
			t.Fatalf("expected no account contact, got %#v", contact)
		}
	})
}

func TestEveConnectionsIncludeAccountContactWhenKnown(t *testing.T) {
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
	connection := connections[0]
	if connection.Account != "tyler@example.com" {
		t.Fatalf("expected account email, got %q", connection.Account)
	}
	if connection.AccountContact == nil {
		t.Fatalf("expected account contact")
	}
	if connection.AccountContact.Platform != "email" || connection.AccountContact.ContactID != "tyler@example.com" {
		t.Fatalf("unexpected account contact: %#v", connection.AccountContact)
	}
}

func TestEveConnectionsLeaveAccountContactUnsetWhenUnknown(t *testing.T) {
	oldIdentity := cachedSelfIdentity
	oldFullName := cachedFullName
	defer func() {
		cachedSelfIdentity = oldIdentity
		cachedFullName = oldFullName
	}()

	cachedSelfIdentity = &selfIdentity{Name: "Tyler Brandt"}
	cachedFullName = "Tyler Brandt"

	connections, err := eveConnections(context.Background())
	if err != nil {
		t.Fatalf("eveConnections returned error: %v", err)
	}
	if len(connections) != 1 {
		t.Fatalf("expected one connection, got %d", len(connections))
	}
	connection := connections[0]
	if connection.AccountContact != nil {
		t.Fatalf("expected no account contact, got %#v", connection.AccountContact)
	}
	if connection.Account != "default" {
		t.Fatalf("expected default account, got %q", connection.Account)
	}
}

func TestBuildEveSetupResultIncludesAccountContactWhenKnown(t *testing.T) {
	oldHealthFn := eveHealthFn
	oldIdentity := cachedSelfIdentity
	oldFullName := cachedFullName
	defer func() {
		eveHealthFn = oldHealthFn
		cachedSelfIdentity = oldIdentity
		cachedFullName = oldFullName
	}()

	eveHealthFn = func(context.Context, string) (*nexadapter.AdapterHealth, error) {
		return &nexadapter.AdapterHealth{
			Connected: true,
		}, nil
	}
	cachedSelfIdentity = &selfIdentity{
		Name:   "Tyler Brandt",
		Emails: []string{"tyler@example.com"},
	}
	cachedFullName = "Tyler Brandt"

	result, err := buildEveSetupResult(context.Background(), nexadapter.AdapterSetupRequest{}, false)
	if err != nil {
		t.Fatalf("buildEveSetupResult returned error: %v", err)
	}
	if result.Status != nexadapter.SetupStatusCompleted {
		t.Fatalf("expected completed setup, got %s", result.Status)
	}
	if result.Account != "tyler@example.com" {
		t.Fatalf("expected account email, got %q", result.Account)
	}
	if result.AccountContact == nil {
		t.Fatalf("expected account contact")
	}
	if result.AccountContact.Platform != "email" || result.AccountContact.ContactID != "tyler@example.com" {
		t.Fatalf("unexpected account contact: %#v", result.AccountContact)
	}
}

func TestBuildEveSetupResultLeavesAccountContactUnsetWhenUnknown(t *testing.T) {
	oldHealthFn := eveHealthFn
	oldIdentity := cachedSelfIdentity
	oldFullName := cachedFullName
	defer func() {
		eveHealthFn = oldHealthFn
		cachedSelfIdentity = oldIdentity
		cachedFullName = oldFullName
	}()

	eveHealthFn = func(context.Context, string) (*nexadapter.AdapterHealth, error) {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Error:     "cannot determine chat.db path",
		}, nil
	}
	cachedSelfIdentity = &selfIdentity{Name: "Tyler Brandt"}
	cachedFullName = "Tyler Brandt"

	result, err := buildEveSetupResult(context.Background(), nexadapter.AdapterSetupRequest{}, true)
	if err != nil {
		t.Fatalf("buildEveSetupResult returned error: %v", err)
	}
	if result.AccountContact != nil {
		t.Fatalf("expected no account contact, got %#v", result.AccountContact)
	}
	if result.Account != "default" {
		t.Fatalf("expected default account, got %q", result.Account)
	}
	if result.Status != nexadapter.SetupStatusRequiresInput {
		t.Fatalf("expected requires_input setup, got %s", result.Status)
	}
}

func TestConvertWarehouseMessageUsesSessionAccountMetadata(t *testing.T) {
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

	record := convertWarehouseMessage(
		warehouseRow{
			ID:             1,
			GUID:           "msg-1",
			Timestamp:      sql.NullString{String: "2026-03-31 00:00:00+00:00", Valid: true},
			IsFromMe:       true,
			ChatID:         1,
			ChatIdentifier: "chat-1",
			ServiceName:    sql.NullString{String: "iMessage", Valid: true},
		},
		nil,
		"tyler@example.com",
	)

	if got := record.Payload.Metadata["account"]; got != "tyler@example.com" {
		t.Fatalf("expected session account metadata, got %#v", got)
	}
}

func TestConvertWarehouseMessagePreservesMessageGUIDMetadata(t *testing.T) {
	record := convertWarehouseMessage(
		warehouseRow{
			ID:             1,
			GUID:           "6F08EF97-6BBF-4414-8622-42B938F083C1",
			Timestamp:      sql.NullString{String: "2026-03-31 00:00:00+00:00", Valid: true},
			IsFromMe:       false,
			ChatID:         1,
			ChatIdentifier: "+16319056994",
			ServiceName:    sql.NullString{String: "iMessage", Valid: true},
		},
		nil,
		"tyler@example.com",
	)

	if got := record.Payload.Metadata["message_guid"]; got != "6F08EF97-6BBF-4414-8622-42B938F083C1" {
		t.Fatalf("expected message guid metadata, got %#v", got)
	}
}

func TestQueryMessagesSinceHonorsUntil(t *testing.T) {
	db := openFixtureWarehouseDB(t)
	mustExecFixture(t, db, `INSERT INTO chats (id, chat_identifier, chat_name, is_group) VALUES (?, ?, ?, ?)`, 1, "chat-1", "Chat", false)
	mustExecFixture(t, db, `INSERT INTO messages (id, chat_id, content, timestamp, is_from_me, guid) VALUES (?, ?, ?, ?, ?, ?)`, 1, 1, "before", "2026-04-01 10:00:00+00:00", false, "msg-before")
	mustExecFixture(t, db, `INSERT INTO messages (id, chat_id, content, timestamp, is_from_me, guid) VALUES (?, ?, ?, ?, ?, ?)`, 2, 1, "inside", "2026-04-02 10:00:00+00:00", false, "msg-inside")
	mustExecFixture(t, db, `INSERT INTO messages (id, chat_id, content, timestamp, is_from_me, guid) VALUES (?, ?, ?, ?, ?, ?)`, 3, 1, "after", "2026-04-03 10:00:00+00:00", false, "msg-after")

	since := time.Date(2026, 4, 2, 0, 0, 0, 0, time.UTC)
	until := time.Date(2026, 4, 2, 23, 59, 59, 0, time.UTC)
	events, lastID, err := queryMessagesSince(db, since, &until, 0, 10, "")
	if err != nil {
		t.Fatalf("queryMessagesSince returned error: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("events count = %d, want 1", len(events))
	}
	if events[0].Payload.ExternalRecordID != "imessage:msg-inside" {
		t.Fatalf("record id = %q, want imessage:msg-inside", events[0].Payload.ExternalRecordID)
	}
	if lastID != 2 {
		t.Fatalf("lastID = %d, want 2", lastID)
	}
}
