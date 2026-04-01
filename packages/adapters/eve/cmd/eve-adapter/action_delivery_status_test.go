package main

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestRefreshSendActionAttemptStatusMarksDeliveredMediaConfirmed(t *testing.T) {
	warehouseDB := openFixtureWarehouseDB(t)
	chatDBPath := seedDeliveryStatusChatDB(t, deliveryFixture{
		MessageGUID:             "message-guid-1",
		IsSent:                  1,
		IsDelivered:             1,
		IsFinished:              1,
		ErrorCode:               0,
		AttachmentTransferState: 5,
		AttachmentFilename:      "~/Library/Messages/Attachments/eve/stage-1/test.png",
	})
	t.Setenv("EVE_SOURCE_CHAT_DB", chatDBPath)

	createdAt := time.Date(2026, time.April, 1, 12, 0, 0, 0, time.UTC)
	status := ActionAttemptStatusDispatched
	attempt, err := CreateActionAttempt(warehouseDB, ActionAttemptCreateInput{
		ConnectionID:      "conn-eve",
		Action:            imessageSendMethodID,
		TargetRecordID:    "imessage:message-guid-1",
		TargetThreadID:    "imessage:chat-1",
		TargetMessageGUID: "message-guid-1",
		Status:            status,
		CreatedAt:         createdAt,
		UpdatedAt:         createdAt,
	})
	if err != nil {
		t.Fatalf("CreateActionAttempt returned error: %v", err)
	}

	updated, observation, err := refreshSendActionAttemptStatus(warehouseDB, attempt)
	if err != nil {
		t.Fatalf("refreshSendActionAttemptStatus returned error: %v", err)
	}
	if updated.Status != ActionAttemptStatusConfirmed {
		t.Fatalf("expected confirmed status, got %q", updated.Status)
	}
	if observation == nil || observation.Stage != sendDeliveryStageMessagesDelivered {
		t.Fatalf("expected delivered observation, got %#v", observation)
	}
	if observation.AttachmentTransferState == nil || *observation.AttachmentTransferState != 5 {
		t.Fatalf("unexpected attachment transfer state: %#v", observation)
	}
}

func TestRefreshSendActionAttemptStatusMarksFailedMediaFailed(t *testing.T) {
	warehouseDB := openFixtureWarehouseDB(t)
	chatDBPath := seedDeliveryStatusChatDB(t, deliveryFixture{
		MessageGUID:             "message-guid-2",
		IsSent:                  0,
		IsDelivered:             0,
		IsFinished:              1,
		ErrorCode:               3,
		AttachmentTransferState: 6,
		AttachmentFilename:      "~/nexus/home/tmp/failing.png",
	})
	t.Setenv("EVE_SOURCE_CHAT_DB", chatDBPath)

	createdAt := time.Date(2026, time.April, 1, 12, 5, 0, 0, time.UTC)
	status := ActionAttemptStatusDispatched
	attempt, err := CreateActionAttempt(warehouseDB, ActionAttemptCreateInput{
		ConnectionID:      "conn-eve",
		Action:            imessageSendMethodID,
		TargetRecordID:    "imessage:message-guid-2",
		TargetThreadID:    "imessage:chat-1",
		TargetMessageGUID: "message-guid-2",
		Status:            status,
		CreatedAt:         createdAt,
		UpdatedAt:         createdAt,
	})
	if err != nil {
		t.Fatalf("CreateActionAttempt returned error: %v", err)
	}

	updated, observation, err := refreshSendActionAttemptStatus(warehouseDB, attempt)
	if err != nil {
		t.Fatalf("refreshSendActionAttemptStatus returned error: %v", err)
	}
	if updated.Status != ActionAttemptStatusFailed {
		t.Fatalf("expected failed status, got %q", updated.Status)
	}
	if observation == nil || observation.Stage != sendDeliveryStageMessagesFailed {
		t.Fatalf("expected failed observation, got %#v", observation)
	}
	if updated.ErrorMessage == "" {
		t.Fatalf("expected failure message to be recorded, got %#v", updated)
	}
}

type deliveryFixture struct {
	MessageGUID             string
	Text                    string
	IsSent                  int
	IsDelivered             int
	IsFinished              int
	ErrorCode               int
	IsFromMe                int
	DateNS                  int64
	ChatIdentifier          string
	AttachmentTransferState int
	AttachmentFilename      string
}

func seedDeliveryStatusChatDB(t *testing.T, fixture deliveryFixture) string {
	return seedDeliveryStatusChatDBWithFixtures(t, []deliveryFixture{fixture})
}

func seedDeliveryStatusChatDBWithFixtures(t *testing.T, fixtures []deliveryFixture) string {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "chat.db")
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("open chat db failed: %v", err)
	}
	defer db.Close()

	stmts := []string{
		`CREATE TABLE message (
			ROWID INTEGER PRIMARY KEY,
			guid TEXT,
			text TEXT,
			is_sent INTEGER,
			is_delivered INTEGER,
			is_finished INTEGER,
			error INTEGER,
			is_from_me INTEGER,
			date INTEGER
		)`,
		`CREATE TABLE chat (
			ROWID INTEGER PRIMARY KEY,
			chat_identifier TEXT,
			guid TEXT
		)`,
		`CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER)`,
		`CREATE TABLE attachment (
			ROWID INTEGER PRIMARY KEY,
			guid TEXT,
			filename TEXT,
			transfer_state INTEGER
		)`,
		`CREATE TABLE message_attachment_join (message_id INTEGER, attachment_id INTEGER)`,
	}
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("seed delivery chat schema failed: %v", err)
		}
	}
	if _, err := db.Exec(`INSERT INTO chat (ROWID, chat_identifier, guid) VALUES (1, '+17072876731', 'chat-guid-1')`); err != nil {
		t.Fatalf("insert chat delivery row failed: %v", err)
	}

	for index, fixture := range fixtures {
		rowID := index + 1
		text := fixture.Text
		if fixture.IsFromMe == 0 {
			fixture.IsFromMe = 1
		}
		if _, err := db.Exec(
			`INSERT INTO message (ROWID, guid, text, is_sent, is_delivered, is_finished, error, is_from_me, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			rowID,
			fixture.MessageGUID,
			text,
			fixture.IsSent,
			fixture.IsDelivered,
			fixture.IsFinished,
			fixture.ErrorCode,
			fixture.IsFromMe,
			fixture.DateNS,
		); err != nil {
			t.Fatalf("insert message delivery row failed: %v", err)
		}
		if _, err := db.Exec(`INSERT INTO chat_message_join (chat_id, message_id) VALUES (1, ?)`, rowID); err != nil {
			t.Fatalf("insert chat message join failed: %v", err)
		}
		if fixture.AttachmentFilename == "" && fixture.AttachmentTransferState == 0 {
			continue
		}
		if _, err := db.Exec(
			`INSERT INTO attachment (ROWID, guid, filename, transfer_state) VALUES (?, ?, ?, ?)`,
			rowID,
			"attachment-guid-"+fixture.MessageGUID,
			fixture.AttachmentFilename,
			fixture.AttachmentTransferState,
		); err != nil {
			t.Fatalf("insert attachment delivery row failed: %v", err)
		}
		if _, err := db.Exec(`INSERT INTO message_attachment_join (message_id, attachment_id) VALUES (?, ?)`, rowID, rowID); err != nil {
			t.Fatalf("insert message attachment join failed: %v", err)
		}
	}

	return dbPath
}

func TestRefreshSendActionAttemptStatusDiscoversRecentMediaFailureWithoutGUID(t *testing.T) {
	warehouseDB := openFixtureWarehouseDB(t)
	chatDBPath := seedDeliveryStatusChatDBWithFixtures(t, []deliveryFixture{
		{
			MessageGUID:    "baseline-guid-1",
			Text:           "older row",
			IsSent:         1,
			IsDelivered:    1,
			IsFinished:     1,
			IsFromMe:       1,
			DateNS:         1,
			ChatIdentifier: "+17072876731",
		},
		{
			MessageGUID:    "text-guid-1",
			Text:           "EVE STATUS MEDIA FAIL",
			IsSent:         1,
			IsDelivered:    1,
			IsFinished:     1,
			IsFromMe:       1,
			DateNS:         2,
			ChatIdentifier: "+17072876731",
		},
		{
			MessageGUID:             "media-guid-1",
			IsSent:                  0,
			IsDelivered:             0,
			IsFinished:              1,
			ErrorCode:               3,
			IsFromMe:                1,
			DateNS:                  3,
			ChatIdentifier:          "+17072876731",
			AttachmentTransferState: 6,
			AttachmentFilename:      "~/nexus/home/tmp/failing.png",
		},
	})
	t.Setenv("EVE_SOURCE_CHAT_DB", chatDBPath)

	status := ActionAttemptStatusDispatched
	request := imessageSendRequest{
		Target: imessageMethodTarget{
			ConnectionID: "conn-eve",
			Channel: nexadapter.ChannelRef{
				Platform:    "imessage",
				ContainerID: "+17072876731",
			},
		},
		Text:  "EVE STATUS MEDIA FAIL",
		Media: "/tmp/failing.png",
	}
	attempt, err := CreateActionAttempt(warehouseDB, ActionAttemptCreateInput{
		ConnectionID: "conn-eve",
		Action:       imessageSendMethodID,
		Status:       status,
		Request:      request,
		Metadata: map[string]any{
			"has_media":       true,
			"expected_chunks": []string{"EVE STATUS MEDIA FAIL"},
			"rowid_baseline":  int64(1),
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("CreateActionAttempt returned error: %v", err)
	}

	updated, observation, err := refreshSendActionAttemptStatus(warehouseDB, attempt)
	if err != nil {
		t.Fatalf("refreshSendActionAttemptStatus returned error: %v", err)
	}
	if updated.Status != ActionAttemptStatusFailed {
		t.Fatalf("expected failed status, got %q", updated.Status)
	}
	if observation == nil || observation.Stage != sendDeliveryStageMessagesFailed {
		t.Fatalf("expected failed observation, got %#v", observation)
	}
	if !observation.MediaRowSeen || strings.TrimSpace(observation.MediaMessageGUID) != "media-guid-1" {
		t.Fatalf("expected media row discovery, got %#v", observation)
	}
}

func TestRefreshSendActionAttemptStatusDiscoversRecentMediaDeliveryWithoutGUID(t *testing.T) {
	warehouseDB := openFixtureWarehouseDB(t)
	chatDBPath := seedDeliveryStatusChatDBWithFixtures(t, []deliveryFixture{
		{
			MessageGUID:    "baseline-guid-2",
			Text:           "older row",
			IsSent:         1,
			IsDelivered:    1,
			IsFinished:     1,
			IsFromMe:       1,
			DateNS:         1,
			ChatIdentifier: "+17072876731",
		},
		{
			MessageGUID:    "text-guid-2",
			Text:           "EVE STATUS MEDIA OK",
			IsSent:         1,
			IsDelivered:    1,
			IsFinished:     1,
			IsFromMe:       1,
			DateNS:         2,
			ChatIdentifier: "+17072876731",
		},
		{
			MessageGUID:             "media-guid-2",
			IsSent:                  1,
			IsDelivered:             1,
			IsFinished:              1,
			ErrorCode:               0,
			IsFromMe:                1,
			DateNS:                  3,
			ChatIdentifier:          "+17072876731",
			AttachmentTransferState: 5,
			AttachmentFilename:      "~/Library/Messages/Attachments/eve/stage-2/test.png",
		},
	})
	t.Setenv("EVE_SOURCE_CHAT_DB", chatDBPath)

	status := ActionAttemptStatusDispatched
	request := imessageSendRequest{
		Target: imessageMethodTarget{
			ConnectionID: "conn-eve",
			Channel: nexadapter.ChannelRef{
				Platform:    "imessage",
				ContainerID: "+17072876731",
			},
		},
		Text:  "EVE STATUS MEDIA OK",
		Media: "/tmp/ok.png",
	}
	attempt, err := CreateActionAttempt(warehouseDB, ActionAttemptCreateInput{
		ConnectionID: "conn-eve",
		Action:       imessageSendMethodID,
		Status:       status,
		Request:      request,
		Metadata: map[string]any{
			"has_media":       true,
			"expected_chunks": []string{"EVE STATUS MEDIA OK"},
			"rowid_baseline":  int64(1),
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("CreateActionAttempt returned error: %v", err)
	}

	updated, observation, err := refreshSendActionAttemptStatus(warehouseDB, attempt)
	if err != nil {
		t.Fatalf("refreshSendActionAttemptStatus returned error: %v", err)
	}
	if updated.Status != ActionAttemptStatusConfirmed {
		t.Fatalf("expected confirmed status, got %q", updated.Status)
	}
	if observation == nil || observation.Stage != sendDeliveryStageMessagesDelivered {
		t.Fatalf("expected delivered observation, got %#v", observation)
	}
	if !observation.MediaRowSeen || strings.TrimSpace(observation.MediaMessageGUID) != "media-guid-2" {
		t.Fatalf("expected media delivery discovery, got %#v", observation)
	}
}
