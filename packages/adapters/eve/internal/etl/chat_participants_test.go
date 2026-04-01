package etl

import (
	"database/sql"
	"testing"
)

func TestSyncChatParticipantsResolvesDedupedHandleContacts(t *testing.T) {
	chatDB := openTestChatDB(t)
	warehouseDB := openTestWarehouseDB(t)

	seedExistingContact(t, warehouseDB)

	if _, err := SyncChats(chatDB, warehouseDB); err != nil {
		t.Fatalf("SyncChats returned error: %v", err)
	}

	count, err := SyncChatParticipants(chatDB, warehouseDB)
	if err != nil {
		t.Fatalf("SyncChatParticipants returned error: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 synced participant, got %d", count)
	}

	assertChatParticipantContactID(t, warehouseDB, 9)
}

func TestSyncChatParticipantsDeltaResolvesDedupedHandleContacts(t *testing.T) {
	chatDB := openTestChatDB(t)
	warehouseDB := openTestWarehouseDB(t)

	seedExistingContact(t, warehouseDB)

	if _, err := SyncChatsDelta(chatDB, warehouseDB, 0); err != nil {
		t.Fatalf("SyncChatsDelta returned error: %v", err)
	}

	count, err := SyncChatParticipantsDelta(chatDB, warehouseDB, 0)
	if err != nil {
		t.Fatalf("SyncChatParticipantsDelta returned error: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 synced participant, got %d", count)
	}

	assertChatParticipantContactID(t, warehouseDB, 9)
}

func seedExistingContact(t *testing.T, warehouseDB *sql.DB) {
	t.Helper()
	mustExec(
		t,
		warehouseDB,
		`INSERT INTO contacts (id, name, data_source, last_updated) VALUES (?, ?, 'test', CURRENT_TIMESTAMP)`,
		9,
		"Existing Contact",
	)
	mustExec(
		t,
		warehouseDB,
		`INSERT INTO contact_identifiers (contact_id, identifier, type, is_primary, last_used) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)`,
		9,
		"7075551212",
		"phone",
	)
}

func assertChatParticipantContactID(t *testing.T, warehouseDB *sql.DB, wantContactID int64) {
	t.Helper()

	var chatID int64
	var contactID int64
	if err := warehouseDB.QueryRow(`SELECT chat_id, contact_id FROM chat_participants LIMIT 1`).Scan(&chatID, &contactID); err != nil {
		t.Fatalf("query chat_participants failed: %v", err)
	}
	if chatID != 5 {
		t.Fatalf("expected chat_id 5, got %d", chatID)
	}
	if contactID != wantContactID {
		t.Fatalf("expected contact_id %d, got %d", wantContactID, contactID)
	}
}
