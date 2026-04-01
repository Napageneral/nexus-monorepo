package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/nexus-project/adapter-eve/internal/etl"
	"github.com/nexus-project/adapter-eve/internal/livewatch"
	"github.com/nexus-project/adapter-eve/internal/migrate"
	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestLoadOrInitMonitorCursors(t *testing.T) {
	db := openMonitorStateDB(t)

	if _, err := db.Exec(`
		INSERT INTO messages (id) VALUES (3), (5);
		INSERT INTO message_updates (id) VALUES (6);
		INSERT INTO reactions (id) VALUES (2), (7);
		INSERT INTO membership_events (id) VALUES (4);
	`); err != nil {
		t.Fatalf("seed monitor state tables: %v", err)
	}

	cursors, err := loadOrInitMonitorCursors(db)
	if err != nil {
		t.Fatalf("loadOrInitMonitorCursors returned error: %v", err)
	}
	if cursors.MessageID != 5 || cursors.MessageUpdateID != 6 || cursors.ReactionID != 7 || cursors.MembershipID != 4 {
		t.Fatalf("unexpected initial cursors: %#v", cursors)
	}

	if err := setMonitorCursor(db, monitorMessageCursorName, 9); err != nil {
		t.Fatalf("setMonitorCursor returned error: %v", err)
	}

	if _, err := db.Exec(`INSERT INTO messages (id) VALUES (12)`); err != nil {
		t.Fatalf("insert later message: %v", err)
	}

	cursors, err = loadOrInitMonitorCursors(db)
	if err != nil {
		t.Fatalf("second loadOrInitMonitorCursors returned error: %v", err)
	}
	if cursors.MessageID != 9 {
		t.Fatalf("expected persisted message cursor 9, got %#v", cursors)
	}
}

func TestMessageRowIDWatermarkRoundTrip(t *testing.T) {
	db := openMonitorStateDB(t)

	if got := getMessageRowIDWatermark(db); got != 0 {
		t.Fatalf("expected zero watermark, got %d", got)
	}

	if err := setMessageRowIDWatermark(db, 42); err != nil {
		t.Fatalf("setMessageRowIDWatermark returned error: %v", err)
	}
	if got := getMessageRowIDWatermark(db); got != 42 {
		t.Fatalf("expected watermark 42, got %d", got)
	}
}

func TestRunWatcherMonitorProcessesStartupAndWalChange(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "chat.db")
	if err := os.WriteFile(dbPath, []byte("db-0"), 0o600); err != nil {
		t.Fatalf("write db fixture: %v", err)
	}
	if err := os.WriteFile(dbPath+"-wal", []byte("wal-0"), 0o600); err != nil {
		t.Fatalf("write wal fixture: %v", err)
	}
	if err := os.WriteFile(dbPath+"-shm", []byte("shm-0"), 0o600); err != nil {
		t.Fatalf("write shm fixture: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	reasons := make(chan string, 2)
	done := make(chan error, 1)
	go func() {
		done <- runWatcherMonitor(ctx, dbPath, func(reason string, detectionLag time.Duration) error {
			if detectionLag < 0 {
				t.Fatalf("expected non-negative detection lag, got %s", detectionLag)
			}
			reasons <- reason
			if reason == "filesystem" {
				cancel()
			}
			return nil
		})
	}()

	select {
	case reason := <-reasons:
		if reason != "startup" {
			t.Fatalf("expected startup reason, got %q", reason)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for startup callback")
	}

	time.Sleep(100 * time.Millisecond)
	if err := os.WriteFile(dbPath+"-wal", []byte("wal-1"), 0o600); err != nil {
		t.Fatalf("mutate wal fixture: %v", err)
	}

	select {
	case reason := <-reasons:
		if reason != "filesystem" {
			t.Fatalf("expected filesystem reason, got %q", reason)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for filesystem callback")
	}

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("runWatcherMonitor returned error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for watcher monitor shutdown")
	}
}

func TestRunWatcherMonitorWithMaintenanceRunsStartupAndInterval(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "chat.db")
	if err := os.WriteFile(dbPath, []byte("db-0"), 0o600); err != nil {
		t.Fatalf("write db fixture: %v", err)
	}
	if err := os.WriteFile(dbPath+"-wal", []byte("wal-0"), 0o600); err != nil {
		t.Fatalf("write wal fixture: %v", err)
	}
	if err := os.WriteFile(dbPath+"-shm", []byte("shm-0"), 0o600); err != nil {
		t.Fatalf("write shm fixture: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	processReasons := make(chan string, 1)
	maintenanceReasons := make(chan string, 2)
	done := make(chan error, 1)
	go func() {
		done <- runWatcherMonitorWithMaintenance(
			ctx,
			dbPath,
			func(reason string, detectionLag time.Duration) error {
				if detectionLag < 0 {
					t.Fatalf("expected non-negative detection lag, got %s", detectionLag)
				}
				processReasons <- reason
				return nil
			},
			func(reason string) error {
				maintenanceReasons <- reason
				if reason == "interval" {
					cancel()
				}
				return nil
			},
			25*time.Millisecond,
		)
	}()

	select {
	case reason := <-processReasons:
		if reason != "startup" {
			t.Fatalf("expected startup process reason, got %q", reason)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for startup process callback")
	}

	select {
	case reason := <-maintenanceReasons:
		if reason != "startup" {
			t.Fatalf("expected startup maintenance reason, got %q", reason)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for startup maintenance callback")
	}

	select {
	case reason := <-maintenanceReasons:
		if reason != "interval" {
			t.Fatalf("expected interval maintenance reason, got %q", reason)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for interval maintenance callback")
	}

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("runWatcherMonitorWithMaintenance returned error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for watcher monitor with maintenance shutdown")
	}
}

func TestRunWatcherMonitorCapturesEventThatArrivesDuringStartup(t *testing.T) {
	originalFactory := livewatchEventsFactory
	t.Cleanup(func() {
		livewatchEventsFactory = originalFactory
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	factoryCalled := make(chan struct{})
	events := make(chan livewatch.Event, 1)
	livewatchEventsFactory = func(_ context.Context, _ string) <-chan livewatch.Event {
		close(factoryCalled)
		return events
	}

	reasons := make(chan string, 2)
	done := make(chan error, 1)
	go func() {
		done <- runWatcherMonitorWithCadence(
			ctx,
			"/tmp/chat.db",
			func(reason string, detectionLag time.Duration) error {
				if detectionLag < 0 {
					t.Fatalf("expected non-negative detection lag, got %s", detectionLag)
				}
				reasons <- reason
				switch reason {
				case "startup":
					select {
					case <-factoryCalled:
					case <-time.After(2 * time.Second):
						t.Fatal("watcher factory was not called before startup processing")
					}
					events <- livewatch.Event{
						WALChanged: true,
						ObservedAt: time.Now(),
						WALModTime: time.Now(),
					}
				case "filesystem":
					cancel()
				}
				return nil
			},
			nil,
			0,
			0,
		)
	}()

	select {
	case reason := <-reasons:
		if reason != "startup" {
			t.Fatalf("expected startup reason, got %q", reason)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for startup callback")
	}

	select {
	case reason := <-reasons:
		if reason != "filesystem" {
			t.Fatalf("expected filesystem reason, got %q", reason)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for filesystem callback")
	}

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("runWatcherMonitorWithCadence returned error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for watcher monitor shutdown")
	}
}

func TestProcessMonitorBatchDoesNotAdvanceCursorsWhenPublishFails(t *testing.T) {
	chatDB := openFixtureChatDB(t)
	warehouseDB := openFixtureWarehouseDB(t)

	if _, err := etl.HotSync(chatDB, warehouseDB); err != nil {
		t.Fatalf("HotSync returned error: %v", err)
	}

	cursors := monitorCursors{}
	if err := setMonitorCursor(warehouseDB, monitorMessageCursorName, 0); err != nil {
		t.Fatalf("seed message cursor: %v", err)
	}
	if err := setMonitorCursor(warehouseDB, monitorMessageUpdateCursorName, 0); err != nil {
		t.Fatalf("seed message update cursor: %v", err)
	}
	if err := setMonitorCursor(warehouseDB, monitorReactionCursorName, 0); err != nil {
		t.Fatalf("seed reaction cursor: %v", err)
	}
	if err := setMonitorCursor(warehouseDB, monitorMembershipCursorName, 0); err != nil {
		t.Fatalf("seed membership cursor: %v", err)
	}

	_, err := processMonitorBatch(
		context.Background(),
		warehouseDB,
		nil,
		"conn-eve",
		"",
		&cursors,
		func(context.Context, []nexadapter.AdapterInboundRecord) error {
			return fmt.Errorf("publish failed")
		},
	)
	if err == nil {
		t.Fatal("expected publish failure")
	}

	assertMonitorCursorValue(t, warehouseDB, monitorMessageCursorName, 0)
	assertMonitorCursorValue(t, warehouseDB, monitorMessageUpdateCursorName, 0)
	assertMonitorCursorValue(t, warehouseDB, monitorReactionCursorName, 0)
	assertMonitorCursorValue(t, warehouseDB, monitorMembershipCursorName, 0)
	if cursors != (monitorCursors{}) {
		t.Fatalf("expected in-memory cursors to remain unchanged, got %#v", cursors)
	}
}

func TestProcessMonitorBatchPublishesAndPersistsCursors(t *testing.T) {
	chatDB := openFixtureChatDB(t)
	warehouseDB := openFixtureWarehouseDB(t)

	if _, err := etl.HotSync(chatDB, warehouseDB); err != nil {
		t.Fatalf("HotSync returned error: %v", err)
	}

	cursors := monitorCursors{}
	var published []nexadapter.AdapterInboundRecord
	metrics, err := processMonitorBatch(
		context.Background(),
		warehouseDB,
		nil,
		"conn-eve",
		"",
		&cursors,
		func(_ context.Context, records []nexadapter.AdapterInboundRecord) error {
			published = append([]nexadapter.AdapterInboundRecord{}, records...)
			return nil
		},
	)
	if err != nil {
		t.Fatalf("processMonitorBatch returned error: %v", err)
	}

	if got := len(published); got != 6 {
		t.Fatalf("expected 6 published records, got %d", got)
	}
	if metrics.MessageCount != 1 || metrics.MessageUpdateCount != 3 || metrics.ReactionCount != 1 || metrics.MembershipCount != 1 {
		t.Fatalf("unexpected batch metrics: %#v", metrics)
	}
	if cursors.MessageID != 1 || cursors.MessageUpdateID != 3 || cursors.ReactionID != 1 || cursors.MembershipID != 1 {
		t.Fatalf("unexpected in-memory cursors: %#v", cursors)
	}
	assertMonitorCursorValue(t, warehouseDB, monitorMessageCursorName, 1)
	assertMonitorCursorValue(t, warehouseDB, monitorMessageUpdateCursorName, 3)
	assertMonitorCursorValue(t, warehouseDB, monitorReactionCursorName, 1)
	assertMonitorCursorValue(t, warehouseDB, monitorMembershipCursorName, 1)
}

func openMonitorStateDB(t *testing.T) *sql.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "monitor-state.db")
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	if _, err := db.Exec(`
		CREATE TABLE watermarks (
			source TEXT NOT NULL,
			name TEXT NOT NULL,
			value_int INTEGER,
			value_text TEXT,
			updated_ts INTEGER NOT NULL,
			PRIMARY KEY (source, name)
		);
		CREATE TABLE messages (id INTEGER PRIMARY KEY);
		CREATE TABLE message_updates (id INTEGER PRIMARY KEY);
		CREATE TABLE reactions (id INTEGER PRIMARY KEY);
		CREATE TABLE membership_events (id INTEGER PRIMARY KEY);
	`); err != nil {
		t.Fatalf("create monitor state schema: %v", err)
	}

	wm, err := etl.GetWatermark(db, monitorWatermarkSource, monitorMessageCursorName)
	if err != nil {
		t.Fatalf("sanity check watermark read: %v", err)
	}
	if wm != nil {
		t.Fatalf("expected empty watermark table, got %#v", wm)
	}

	return db
}

func openFixtureWarehouseDB(t *testing.T) *sql.DB {
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

func openFixtureChatDB(t *testing.T) *etl.ChatDB {
	t.Helper()

	dir := t.TempDir()
	attachmentPath := filepath.Join(dir, "hello.txt")
	if err := os.WriteFile(attachmentPath, []byte("hello"), 0o600); err != nil {
		t.Fatalf("write attachment fixture: %v", err)
	}

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

	mustExecFixture(t, db, `INSERT INTO handle (ROWID, id) VALUES (?, ?)`, 10, "+1 (707) 555-1212")
	mustExecFixture(t, db, `INSERT INTO chat (ROWID, chat_identifier, display_name, service_name, style) VALUES (?, ?, ?, ?, ?)`, 5, "chat-1", "Test Chat", "iMessage", 45)
	mustExecFixture(t, db, `INSERT INTO chat_handle_join (chat_id, handle_id) VALUES (?, ?)`, 5, 10)
	mustExecFixture(t, db, `
		INSERT INTO message (
			ROWID, guid, text, attributedBody, handle_id, date, is_from_me, type, service,
			associated_message_guid, reply_to_guid, group_action_type, item_type, message_action_type,
			other_handle, group_title, date_edited, date_retracted
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, 100, "msg-100", "Hello from Eve", nil, 10, int64(123456789), 0, 0, "iMessage", nil, nil, 0, nil, nil, nil, nil, int64(123456792), int64(123456793))
	mustExecFixture(t, db, `INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)`, 5, 100)
	mustExecFixture(t, db, `
		INSERT INTO message (
			ROWID, guid, text, attributedBody, handle_id, date, is_from_me, type, service,
			associated_message_guid, reply_to_guid, group_action_type, item_type, message_action_type,
			other_handle, group_title, date_edited, date_retracted
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, 110, "msg-110", "Loved Hello from Eve", nil, 10, int64(123456790), 0, 2000, "iMessage", "msg-100", nil, 0, nil, nil, nil, nil, int64(0), int64(0))
	mustExecFixture(t, db, `INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)`, 5, 110)
	mustExecFixture(t, db, `INSERT INTO deleted_messages (ROWID, guid) VALUES (?, ?)`, 100, "msg-100")
	mustExecFixture(t, db, `INSERT INTO deleted_messages (ROWID, guid) VALUES (?, ?)`, 110, "msg-110")
	mustExecFixture(t, db, `INSERT INTO chat_recoverable_message_join (chat_id, message_id, delete_date, ck_sync_state) VALUES (?, ?, ?, ?)`, 5, 100, int64(123456795), 0)
	mustExecFixture(t, db, `INSERT INTO chat_recoverable_message_join (chat_id, message_id, delete_date, ck_sync_state) VALUES (?, ?, ?, ?)`, 5, 110, int64(123456794), 0)
	mustExecFixture(t, db, `
		INSERT INTO message (
			ROWID, guid, text, attributedBody, handle_id, date, is_from_me, type, service,
			associated_message_guid, reply_to_guid, group_action_type, item_type, message_action_type,
			other_handle, group_title, date_edited, date_retracted
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, 120, "msg-120", "", nil, 10, int64(123456791), 0, 0, "iMessage", nil, nil, 1, nil, nil, nil, "Test Chat", int64(0), int64(0))
	mustExecFixture(t, db, `INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)`, 5, 120)
	mustExecFixture(t, db, `INSERT INTO attachment (ROWID, guid, created_date, filename, uti, mime_type, total_bytes, is_sticker) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 200, "att-200", int64(123456790), attachmentPath, "public.plain-text", "text/plain", 123, 0)
	mustExecFixture(t, db, `INSERT INTO message_attachment_join (message_id, attachment_id) VALUES (?, ?)`, 100, 200)

	if err := db.Close(); err != nil {
		t.Fatalf("close seeded chat db: %v", err)
	}

	chatDB, err := etl.OpenChatDB(dbPath)
	if err != nil {
		t.Fatalf("OpenChatDB returned error: %v", err)
	}
	t.Cleanup(func() { _ = chatDB.Close() })
	return chatDB
}

func mustExecFixture(t *testing.T, db *sql.DB, query string, args ...any) {
	t.Helper()
	if _, err := db.Exec(query, args...); err != nil {
		t.Fatalf("exec failed: %v", err)
	}
}

func assertMonitorCursorValue(t *testing.T, db *sql.DB, name string, want int64) {
	t.Helper()
	got, err := etl.GetWatermarkInt(db, monitorWatermarkSource, name)
	if err != nil {
		t.Fatalf("GetWatermarkInt(%s) failed: %v", name, err)
	}
	if got != want {
		t.Fatalf("expected %s=%d, got %d", name, want, got)
	}
}
