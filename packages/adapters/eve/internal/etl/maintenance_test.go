package etl

import (
	"database/sql"
	"testing"
)

func TestHotSyncLeavesConversationRepairToMaintenance(t *testing.T) {
	chatDB := openTestChatDB(t)
	warehouseDB := openTestWarehouseDB(t)

	if _, err := HotSync(chatDB, warehouseDB); err != nil {
		t.Fatalf("HotSync returned error: %v", err)
	}

	assertCount(t, warehouseDB, "conversations", 0)

	if wm, err := GetWatermark(warehouseDB, maintenanceWatermarkSource, maintenanceWatermarkConversationRunNS); err != nil {
		t.Fatalf("GetWatermark returned error: %v", err)
	} else if wm != nil {
		t.Fatalf("expected no maintenance watermark after hot sync, got %#v", wm)
	}
}

func TestMaintenanceSyncRepairsWarehouseAndPersistsBookkeeping(t *testing.T) {
	chatDB := openTestChatDB(t)
	warehouseDB := openTestWarehouseDB(t)

	if _, err := HotSync(chatDB, warehouseDB); err != nil {
		t.Fatalf("HotSync returned error: %v", err)
	}

	if _, err := warehouseDB.Exec(`DELETE FROM chat_participants`); err != nil {
		t.Fatalf("delete chat_participants: %v", err)
	}

	result, err := MaintenanceSync(chatDB, warehouseDB)
	if err != nil {
		t.Fatalf("MaintenanceSync returned error: %v", err)
	}

	if result.Watermarks.ConversationRunNS <= 0 {
		t.Fatalf("expected positive conversation watermark, got %#v", result.Watermarks)
	}

	assertCount(t, warehouseDB, "chat_participants", 1)
	assertCount(t, warehouseDB, "conversations", 1)

	assertPositiveWatermark(t, warehouseDB, maintenanceWatermarkSource, maintenanceWatermarkHandleRunNS)
	assertPositiveWatermark(t, warehouseDB, maintenanceWatermarkSource, maintenanceWatermarkAddressBookRunNS)
	assertPositiveWatermark(t, warehouseDB, maintenanceWatermarkSource, maintenanceWatermarkChatRunNS)
	assertPositiveWatermark(t, warehouseDB, maintenanceWatermarkSource, maintenanceWatermarkParticipantRunNS)
	assertPositiveWatermark(t, warehouseDB, maintenanceWatermarkSource, maintenanceWatermarkConversationRunNS)
}

func assertPositiveWatermark(t *testing.T, db *sql.DB, source, name string) {
	t.Helper()
	got, err := GetWatermarkInt(db, source, name)
	if err != nil {
		t.Fatalf("GetWatermarkInt(%s,%s) failed: %v", source, name, err)
	}
	if got <= 0 {
		t.Fatalf("expected positive watermark %s/%s, got %d", source, name, got)
	}
}
