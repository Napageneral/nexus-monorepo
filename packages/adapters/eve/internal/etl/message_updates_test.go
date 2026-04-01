package etl

import "testing"

func TestGetMessageUpdatesSinceSplitsEditAndRetract(t *testing.T) {
	chatDB := openTestChatDB(t)

	updates, err := chatDB.GetMessageUpdatesSince(0)
	if err != nil {
		t.Fatalf("GetMessageUpdatesSince returned error: %v", err)
	}
	if len(updates) != 2 {
		t.Fatalf("expected 2 message updates, got %d", len(updates))
	}

	if updates[0].OriginalMessageGUID != "msg-100" {
		t.Fatalf("expected first update original guid msg-100, got %q", updates[0].OriginalMessageGUID)
	}
	if updates[0].UpdateType != messageUpdateTypeEdit {
		t.Fatalf("expected first update type edit, got %q", updates[0].UpdateType)
	}
	if updates[0].TimestampNS != 123456792 {
		t.Fatalf("expected first update timestamp 123456792, got %d", updates[0].TimestampNS)
	}

	if updates[1].OriginalMessageGUID != "msg-100" {
		t.Fatalf("expected second update original guid msg-100, got %q", updates[1].OriginalMessageGUID)
	}
	if updates[1].UpdateType != messageUpdateTypeRetract {
		t.Fatalf("expected second update type retract, got %q", updates[1].UpdateType)
	}
	if updates[1].TimestampNS != 123456793 {
		t.Fatalf("expected second update timestamp 123456793, got %d", updates[1].TimestampNS)
	}
}

func TestSyncMessageUpdatesDeltaIsReplaySafe(t *testing.T) {
	chatDB := openTestChatDB(t)
	warehouseDB := openTestWarehouseDB(t)

	if _, err := SyncHandlesDelta(chatDB, warehouseDB, 0); err != nil {
		t.Fatalf("SyncHandlesDelta returned error: %v", err)
	}
	if _, err := SyncChatsDelta(chatDB, warehouseDB, 0); err != nil {
		t.Fatalf("SyncChatsDelta returned error: %v", err)
	}
	if _, err := SyncMessagesDelta(chatDB, warehouseDB, 0); err != nil {
		t.Fatalf("SyncMessagesDelta returned error: %v", err)
	}

	count, err := SyncMessageUpdatesDelta(chatDB, warehouseDB, 0)
	if err != nil {
		t.Fatalf("SyncMessageUpdatesDelta returned error: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected 2 synced updates, got %d", count)
	}

	count, err = SyncMessageUpdatesDelta(chatDB, warehouseDB, 0)
	if err != nil {
		t.Fatalf("second SyncMessageUpdatesDelta returned error: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected 2 synced updates on replay, got %d", count)
	}

	assertCount(t, warehouseDB, "message_updates", 2)
}
