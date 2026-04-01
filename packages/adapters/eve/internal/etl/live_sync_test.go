package etl

import (
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/nexus-project/adapter-eve/internal/migrate"
)

func TestGetOrSeedWatermarkInt(t *testing.T) {
	db := openTestWarehouseDB(t)

	got, err := GetOrSeedWatermarkInt(db, "chatdb", "message_rowid", 42)
	if err != nil {
		t.Fatalf("GetOrSeedWatermarkInt returned error: %v", err)
	}
	if got != 42 {
		t.Fatalf("expected seeded watermark 42, got %d", got)
	}

	got, err = GetOrSeedWatermarkInt(db, "chatdb", "message_rowid", 99)
	if err != nil {
		t.Fatalf("GetOrSeedWatermarkInt returned error: %v", err)
	}
	if got != 42 {
		t.Fatalf("expected persisted watermark 42, got %d", got)
	}
}

func TestHotSyncIngestsFixtureAndPersistsWatermarks(t *testing.T) {
	chatDB := openTestChatDB(t)
	warehouseDB := openTestWarehouseDB(t)

	attachments, err := chatDB.GetAttachmentsSince(100)
	if err != nil {
		t.Fatalf("GetAttachmentsSince returned error: %v", err)
	}
	if len(attachments) != 1 {
		t.Fatalf("expected one attachment above watermark, got %d", len(attachments))
	}

	result, err := HotSync(chatDB, warehouseDB)
	if err != nil {
		t.Fatalf("HotSync returned error: %v", err)
	}

	if result.HandlesCount != 0 {
		t.Fatalf("expected 0 hot handles, got %d", result.HandlesCount)
	}
	if result.ChatsCount != 0 {
		t.Fatalf("expected 0 hot chats, got %d", result.ChatsCount)
	}
	if result.ChatParticipantsCount != 0 {
		t.Fatalf("expected 0 hot chat participants, got %d", result.ChatParticipantsCount)
	}
	if result.MessagesCount != 1 {
		t.Fatalf("expected 1 message, got %d", result.MessagesCount)
	}
	if result.MessageUpdatesCount != 2 {
		t.Fatalf("expected 2 message updates, got %d", result.MessageUpdatesCount)
	}
	if result.ReactionsCount != 1 {
		t.Fatalf("expected 1 reaction, got %d", result.ReactionsCount)
	}
	if result.ReactionRemovalsCount != 1 {
		t.Fatalf("expected 1 reaction removal, got %d", result.ReactionRemovalsCount)
	}
	if result.MembershipCount != 1 {
		t.Fatalf("expected 1 membership event, got %d", result.MembershipCount)
	}
	if result.AttachmentsCount != 1 {
		t.Fatalf("expected 1 attachment, got %d", result.AttachmentsCount)
	}

	assertCount(t, warehouseDB, "contacts", 1)
	assertCount(t, warehouseDB, "contact_identifiers", 1)
	assertCount(t, warehouseDB, "chats", 1)
	assertCount(t, warehouseDB, "chat_participants", 0)
	assertCount(t, warehouseDB, "messages", 1)
	assertCount(t, warehouseDB, "message_updates", 3)
	assertCount(t, warehouseDB, "reactions", 1)
	assertCount(t, warehouseDB, "membership_events", 1)
	assertCount(t, warehouseDB, "attachments", 1)
	assertCount(t, warehouseDB, "conversations", 0)

	assertWatermark(t, warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkHandleName, 0)
	assertWatermark(t, warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkChatName, 0)
	assertWatermark(t, warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkMessageName, 100)
	assertWatermark(t, warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkMessageUpdateName, 123456793)
	assertWatermark(t, warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkReactionName, 110)
	assertWatermark(t, warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkReactionRemovalName, 123456795)
	assertWatermark(t, warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkMembershipName, 120)
	assertWatermark(t, warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkAttachmentName, 200)
}

func TestMaintenanceSyncRepairsWarehouseSeparately(t *testing.T) {
	chatDB := openTestChatDB(t)
	warehouseDB := openTestWarehouseDB(t)

	if _, err := HotSync(chatDB, warehouseDB); err != nil {
		t.Fatalf("HotSync returned error: %v", err)
	}

	result, err := MaintenanceSync(chatDB, warehouseDB)
	if err != nil {
		t.Fatalf("MaintenanceSync returned error: %v", err)
	}

	if result.HandlesCount != 1 {
		t.Fatalf("expected 1 maintenance handle pass, got %d", result.HandlesCount)
	}
	if result.ChatsCount != 1 {
		t.Fatalf("expected 1 maintenance chat pass, got %d", result.ChatsCount)
	}
	if result.ChatParticipantsCount != 1 {
		t.Fatalf("expected 1 maintenance chat participant, got %d", result.ChatParticipantsCount)
	}
	if result.ConversationsCount != 1 {
		t.Fatalf("expected 1 repaired conversation, got %d", result.ConversationsCount)
	}
	if result.CompletedAtUnixMS <= 0 {
		t.Fatalf("expected positive CompletedAtUnixMS, got %d", result.CompletedAtUnixMS)
	}

	assertCount(t, warehouseDB, "contacts", 1)
	assertCount(t, warehouseDB, "contact_identifiers", 1)
	assertCount(t, warehouseDB, "chats", 1)
	assertCount(t, warehouseDB, "chat_participants", 1)
	assertCount(t, warehouseDB, "messages", 1)
	assertCount(t, warehouseDB, "message_updates", 3)
	assertCount(t, warehouseDB, "reactions", 1)
	assertCount(t, warehouseDB, "membership_events", 1)
	assertCount(t, warehouseDB, "attachments", 1)
	assertCount(t, warehouseDB, "conversations", 1)
}

func TestHotSyncHydratesOlderSourceMessagesReferencedByRecentReactions(t *testing.T) {
	chatDB := openTestChatDB(t)
	warehouseDB := openTestWarehouseDB(t)

	mustExec(t, chatDB.db, `
		INSERT INTO message (
			ROWID, guid, text, attributedBody, handle_id, date, is_from_me, type, service,
			associated_message_guid, reply_to_guid, group_action_type, item_type, message_action_type,
			other_handle, group_title, date_edited, date_retracted
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, 6001, "msg-6001", "Recent unrelated message", nil, 10, int64(123456796), 0, 0, "iMessage", nil, nil, 0, nil, nil, nil, nil, int64(0), int64(0))
	mustExec(t, chatDB.db, `INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)`, 5, 6001)
	mustExec(t, chatDB.db, `
		INSERT INTO message (
			ROWID, guid, text, attributedBody, handle_id, date, is_from_me, type, service,
			associated_message_guid, reply_to_guid, group_action_type, item_type, message_action_type,
			other_handle, group_title, date_edited, date_retracted
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, 7000, "msg-7000", "Laughed at “Hello from Eve”", nil, 10, int64(123456797), 0, 2003, "iMessage", "msg-100", nil, 0, nil, nil, nil, nil, int64(0), int64(0))
	mustExec(t, chatDB.db, `INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)`, 5, 7000)

	result, err := HotSync(chatDB, warehouseDB)
	if err != nil {
		t.Fatalf("HotSync returned error: %v", err)
	}
	if result.MessagesCount != 1 {
		t.Fatalf("expected 1 recent delta message, got %d", result.MessagesCount)
	}
	if result.ReactionsCount != 1 {
		t.Fatalf("expected 1 recent reaction, got %d", result.ReactionsCount)
	}

	assertCount(t, warehouseDB, "messages", 2)
	assertCount(t, warehouseDB, "reactions", 1)

	var originalGUID string
	if err := warehouseDB.QueryRow(`SELECT original_message_guid FROM reactions LIMIT 1`).Scan(&originalGUID); err != nil {
		t.Fatalf("failed to query hydrated reaction: %v", err)
	}
	if originalGUID != "msg-100" {
		t.Fatalf("expected hydrated reaction source guid msg-100, got %q", originalGUID)
	}
}

func TestHotSyncDelaysMessageFrontierUntilChatJoinVisible(t *testing.T) {
	chatDB := openTestChatDB(t)
	warehouseDB := openTestWarehouseDB(t)

	if _, err := HotSync(chatDB, warehouseDB); err != nil {
		t.Fatalf("initial HotSync returned error: %v", err)
	}
	assertWatermark(t, warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkMessageName, 100)

	mustExec(t, chatDB.db, `
		INSERT INTO message (
			ROWID, guid, text, attributedBody, handle_id, date, is_from_me, type, service,
			associated_message_guid, reply_to_guid, group_action_type, item_type, message_action_type,
			other_handle, group_title, date_edited, date_retracted
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, 130, "msg-130", "Delayed join message", nil, 10, int64(123456800), 0, 0, "iMessage", nil, nil, 0, nil, nil, nil, nil, int64(0), int64(0))

	if _, err := HotSync(chatDB, warehouseDB); err != nil {
		t.Fatalf("HotSync without chat join returned error: %v", err)
	}

	assertWatermark(t, warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkMessageName, 100)
	assertCount(t, warehouseDB, "messages", 1)
	assertGUIDCount(t, warehouseDB, "messages", "msg-130", 0)

	mustExec(t, chatDB.db, `INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)`, 5, 130)

	if _, err := HotSync(chatDB, warehouseDB); err != nil {
		t.Fatalf("HotSync with delayed chat join returned error: %v", err)
	}

	assertWatermark(t, warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkMessageName, 130)
	assertCount(t, warehouseDB, "messages", 2)
	assertGUIDCount(t, warehouseDB, "messages", "msg-130", 1)
}

func TestHotSyncDelaysAttachmentFrontierUntilAttachmentJoinVisible(t *testing.T) {
	chatDB := openTestChatDB(t)
	warehouseDB := openTestWarehouseDB(t)

	if _, err := HotSync(chatDB, warehouseDB); err != nil {
		t.Fatalf("initial HotSync returned error: %v", err)
	}

	mustExec(t, chatDB.db, `
		INSERT INTO message (
			ROWID, guid, text, attributedBody, handle_id, date, is_from_me, type, service,
			associated_message_guid, reply_to_guid, group_action_type, item_type, message_action_type,
			other_handle, group_title, date_edited, date_retracted
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, 130, "msg-130", "Attachment parent", nil, 10, int64(123456800), 0, 0, "iMessage", nil, nil, 0, nil, nil, nil, nil, int64(0), int64(0))
	mustExec(t, chatDB.db, `INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)`, 5, 130)

	if _, err := HotSync(chatDB, warehouseDB); err != nil {
		t.Fatalf("HotSync for attachment parent returned error: %v", err)
	}

	mustExec(t, chatDB.db, `
		INSERT INTO attachment (ROWID, guid, created_date, filename, uti, mime_type, total_bytes, is_sticker)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, 210, "att-210", int64(123456801), "/tmp/later.png", "public.png", "image/png", 456, 0)

	if _, err := HotSync(chatDB, warehouseDB); err != nil {
		t.Fatalf("HotSync without attachment join returned error: %v", err)
	}

	assertWatermark(t, warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkAttachmentName, 200)
	assertCount(t, warehouseDB, "attachments", 1)
	assertGUIDCount(t, warehouseDB, "attachments", "att-210", 0)

	mustExec(t, chatDB.db, `INSERT INTO message_attachment_join (message_id, attachment_id) VALUES (?, ?)`, 130, 210)

	if _, err := HotSync(chatDB, warehouseDB); err != nil {
		t.Fatalf("HotSync with delayed attachment join returned error: %v", err)
	}

	assertWatermark(t, warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkAttachmentName, 210)
	assertCount(t, warehouseDB, "attachments", 2)
	assertGUIDCount(t, warehouseDB, "attachments", "att-210", 1)
}

func openTestWarehouseDB(t *testing.T) *sql.DB {
	t.Helper()

	dir := t.TempDir()
	dbPath := filepath.Join(dir, "warehouse.db")
	if err := migrate.MigrateWarehouse(dbPath); err != nil {
		t.Fatalf("migrate warehouse failed: %v", err)
	}

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("open warehouse db failed: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func openTestChatDB(t *testing.T) *ChatDB {
	t.Helper()

	dir := t.TempDir()
	dbPath := filepath.Join(dir, "chat.db")
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("open chat db failed: %v", err)
	}

	stmts := []string{
		`CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT)`,
		`CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, chat_identifier TEXT, display_name TEXT, service_name TEXT, style INTEGER)`,
		`CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER)`,
		`CREATE TABLE deleted_messages (ROWID INTEGER PRIMARY KEY, guid TEXT)`,
		`CREATE TABLE chat_recoverable_message_join (chat_id INTEGER, message_id INTEGER, delete_date INTEGER, ck_sync_state INTEGER)`,
		`CREATE TABLE recoverable_message_part (chat_id INTEGER, message_id INTEGER, part_index INTEGER, delete_date INTEGER, part_text BLOB, ck_sync_state INTEGER)`,
		`CREATE TABLE message (
			ROWID INTEGER PRIMARY KEY,
			guid TEXT,
			text TEXT,
			attributedBody BLOB,
			handle_id INTEGER,
			date INTEGER,
			is_from_me INTEGER,
			type INTEGER,
			service TEXT,
			associated_message_guid TEXT,
			reply_to_guid TEXT,
			group_action_type INTEGER,
			item_type INTEGER,
			message_action_type INTEGER,
			other_handle INTEGER,
			group_title TEXT,
			date_edited INTEGER,
			date_retracted INTEGER
		)`,
		`CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER)`,
		`CREATE TABLE attachment (ROWID INTEGER PRIMARY KEY, guid TEXT, created_date INTEGER, filename TEXT, uti TEXT, mime_type TEXT, total_bytes INTEGER, is_sticker INTEGER)`,
		`CREATE TABLE message_attachment_join (message_id INTEGER, attachment_id INTEGER)`,
	}
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("seed chat schema failed: %v", err)
		}
	}

	mustExec(t, db, `INSERT INTO handle (ROWID, id) VALUES (?, ?)`, 10, "+1 (707) 555-1212")
	mustExec(t, db, `INSERT INTO chat (ROWID, chat_identifier, display_name, service_name, style) VALUES (?, ?, ?, ?, ?)`, 5, "chat-1", "Test Chat", "iMessage", 45)
	mustExec(t, db, `INSERT INTO chat_handle_join (chat_id, handle_id) VALUES (?, ?)`, 5, 10)
	mustExec(t, db, `
		INSERT INTO message (
			ROWID, guid, text, attributedBody, handle_id, date, is_from_me, type, service,
			associated_message_guid, reply_to_guid, group_action_type, item_type, message_action_type,
			other_handle, group_title, date_edited, date_retracted
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, 100, "msg-100", "Hello from Eve", nil, 10, int64(123456789), 0, 0, "iMessage", nil, nil, 0, nil, nil, nil, nil, int64(123456792), int64(123456793))
	mustExec(t, db, `INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)`, 5, 100)
	mustExec(t, db, `
		INSERT INTO message (
			ROWID, guid, text, attributedBody, handle_id, date, is_from_me, type, service,
			associated_message_guid, reply_to_guid, group_action_type, item_type, message_action_type,
			other_handle, group_title, date_edited, date_retracted
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, 110, "msg-110", "Loved “Hello from Eve”", nil, 10, int64(123456790), 0, 2000, "iMessage", "msg-100", nil, 0, nil, nil, nil, nil, int64(0), int64(0))
	mustExec(t, db, `INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)`, 5, 110)
	mustExec(t, db, `INSERT INTO deleted_messages (ROWID, guid) VALUES (?, ?)`, 100, "msg-100")
	mustExec(t, db, `INSERT INTO deleted_messages (ROWID, guid) VALUES (?, ?)`, 110, "msg-110")
	mustExec(t, db, `INSERT INTO chat_recoverable_message_join (chat_id, message_id, delete_date, ck_sync_state) VALUES (?, ?, ?, ?)`, 5, 100, int64(123456795), 0)
	mustExec(t, db, `INSERT INTO chat_recoverable_message_join (chat_id, message_id, delete_date, ck_sync_state) VALUES (?, ?, ?, ?)`, 5, 110, int64(123456794), 0)
	mustExec(t, db, `
		INSERT INTO message (
			ROWID, guid, text, attributedBody, handle_id, date, is_from_me, type, service,
			associated_message_guid, reply_to_guid, group_action_type, item_type, message_action_type,
			other_handle, group_title, date_edited, date_retracted
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, 120, "msg-120", "", nil, 10, int64(123456791), 0, 0, "iMessage", nil, nil, 1, nil, nil, nil, "Test Chat", int64(0), int64(0))
	mustExec(t, db, `INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)`, 5, 120)
	mustExec(t, db, `INSERT INTO attachment (ROWID, guid, created_date, filename, uti, mime_type, total_bytes, is_sticker) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 200, "att-200", int64(123456790), "/tmp/hello.txt", "public.plain-text", "text/plain", 123, 0)
	mustExec(t, db, `INSERT INTO message_attachment_join (message_id, attachment_id) VALUES (?, ?)`, 100, 200)

	t.Cleanup(func() { _ = db.Close() })
	return &ChatDB{db: db}
}

func mustExec(t *testing.T, db *sql.DB, query string, args ...any) {
	t.Helper()
	if _, err := db.Exec(query, args...); err != nil {
		t.Fatalf("exec failed: %v", err)
	}
}

func assertCount(t *testing.T, db *sql.DB, table string, want int) {
	t.Helper()
	var got int
	if err := db.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&got); err != nil {
		t.Fatalf("count query for %s failed: %v", table, err)
	}
	if got != want {
		t.Fatalf("expected %s count %d, got %d", table, want, got)
	}
}

func assertWatermark(t *testing.T, db *sql.DB, source, name string, want int64) {
	t.Helper()
	got, err := GetWatermarkInt(db, source, name)
	if err != nil {
		t.Fatalf("GetWatermarkInt(%s,%s) failed: %v", source, name, err)
	}
	if got != want {
		t.Fatalf("expected watermark %s/%s=%d, got %d", source, name, want, got)
	}
}

func assertGUIDCount(t *testing.T, db *sql.DB, table, guid string, want int) {
	t.Helper()
	var got int
	if err := db.QueryRow(`SELECT COUNT(*) FROM `+table+` WHERE guid = ?`, guid).Scan(&got); err != nil {
		t.Fatalf("guid count query for %s failed: %v", table, err)
	}
	if got != want {
		t.Fatalf("expected %s guid %q count %d, got %d", table, guid, want, got)
	}
}
