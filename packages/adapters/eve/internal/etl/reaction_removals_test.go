package etl

import "testing"

func TestGetReactionRemovalsSinceReturnsDeletedMessageEvidence(t *testing.T) {
	chatDB := openTestChatDB(t)

	removals, err := chatDB.GetReactionRemovalsSince(0)
	if err != nil {
		t.Fatalf("GetReactionRemovalsSince returned error: %v", err)
	}
	if len(removals) != 2 {
		t.Fatalf("expected 2 deleted-message candidates, got %d", len(removals))
	}

	if removals[0].SourceMessageGUID.String != "msg-110" {
		t.Fatalf("expected first candidate to be msg-110, got %q", removals[0].SourceMessageGUID.String)
	}
	if removals[0].DeleteDateNS != 123456794 {
		t.Fatalf("expected first candidate delete date 123456794, got %d", removals[0].DeleteDateNS)
	}
	if removals[1].SourceMessageGUID.String != "msg-100" {
		t.Fatalf("expected second candidate to be msg-100, got %q", removals[1].SourceMessageGUID.String)
	}
	if removals[1].DeleteDateNS != 123456795 {
		t.Fatalf("expected second candidate delete date 123456795, got %d", removals[1].DeleteDateNS)
	}
}

func TestSyncReactionRemovalsDeltaIsReplaySafe(t *testing.T) {
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
	if _, err := SyncReactionsDelta(chatDB, warehouseDB, 0); err != nil {
		t.Fatalf("SyncReactionsDelta returned error: %v", err)
	}

	count, err := SyncReactionRemovalsDelta(chatDB, warehouseDB, 0)
	if err != nil {
		t.Fatalf("SyncReactionRemovalsDelta returned error: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 synced reaction removal, got %d", count)
	}

	count, err = SyncReactionRemovalsDelta(chatDB, warehouseDB, 0)
	if err != nil {
		t.Fatalf("second SyncReactionRemovalsDelta returned error: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 synced reaction removal on replay, got %d", count)
	}

	assertCount(t, warehouseDB, "message_updates", 1)
}
