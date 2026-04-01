package main

import (
	"database/sql"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestReconcileActionAttemptsConfirmsMatchingSendEvidence(t *testing.T) {
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

	createdAt := time.Date(2026, time.March, 31, 12, 0, 0, 0, time.UTC)
	attempt, err := CreateActionAttempt(warehouseDB, ActionAttemptCreateInput{
		ConnectionID: "conn-eve",
		Action:       imessageSendMethodID,
		Request: imessageSendRequest{
			Target: imessageMethodTarget{
				ConnectionID: "conn-eve",
				Channel: nexadapter.ChannelRef{
					Platform:    "imessage",
					ContainerID: "chat-1",
					ThreadID:    "imessage:chat-1",
				},
			},
			Text: "Hello from Eve",
		},
		Metadata:  map[string]any{"executor": actionExecutorAppleScriptSendOnly},
		CreatedAt: createdAt,
		UpdatedAt: createdAt,
	})
	if err != nil {
		t.Fatalf("CreateActionAttempt returned error: %v", err)
	}

	dispatchedAt := createdAt.Add(3 * time.Second)
	status := ActionAttemptStatusDispatched
	attempt, err = UpdateActionAttemptByAttemptID(warehouseDB, attempt.AttemptID, ActionAttemptUpdateInput{
		Status:       &status,
		DispatchedAt: &dispatchedAt,
		UpdatedAt:    &dispatchedAt,
	})
	if err != nil {
		t.Fatalf("UpdateActionAttemptByAttemptID returned error: %v", err)
	}

	record := nexadapter.NewRecord(platformID, "imessage:message-guid-1").
		WithTimestamp(createdAt.Add(10*time.Second)).
		WithContent("Hello from Eve").
		WithContentType("text").
		WithSender("me@example.com", "Me").
		WithContainer("chat-1", "direct").
		WithThread("imessage:chat-1").
		WithConnection("conn-eve").
		WithMetadata("is_from_me", true).
		Build()

	if err := reconcileActionAttempts(warehouseDB, []nexadapter.AdapterInboundRecord{record}); err != nil {
		t.Fatalf("reconcileActionAttempts returned error: %v", err)
	}

	confirmed, err := GetActionAttemptByAttemptID(warehouseDB, attempt.AttemptID)
	if err != nil {
		t.Fatalf("GetActionAttemptByAttemptID returned error: %v", err)
	}
	if confirmed.Status != ActionAttemptStatusConfirmed {
		t.Fatalf("expected confirmed status, got %q", confirmed.Status)
	}
	if confirmed.TargetRecordID != "imessage:message-guid-1" {
		t.Fatalf("unexpected target record id: %#v", confirmed)
	}
	if confirmed.TargetThreadID != "imessage:chat-1" {
		t.Fatalf("unexpected target thread id: %#v", confirmed)
	}
	if confirmed.TargetMessageGUID != "message-guid-1" {
		t.Fatalf("unexpected target message guid: %#v", confirmed)
	}
	if confirmed.ConfirmedAtMs == nil || *confirmed.ConfirmedAtMs == 0 {
		t.Fatalf("expected confirmed_at_ms to be set, got %#v", confirmed.ConfirmedAtMs)
	}
	if confirmed.Metadata["confirmed_record_id"] != "imessage:message-guid-1" {
		t.Fatalf("expected reconciliation metadata to include record id, got %#v", confirmed.Metadata)
	}
	if confirmed.Metadata["delivery_stage"] != sendDeliveryStageMessagesDelivered {
		t.Fatalf("expected reconciliation metadata to include delivered stage, got %#v", confirmed.Metadata)
	}
}

func TestReconcileActionAttemptsMediaSendPrefersAttachmentEvidence(t *testing.T) {
	warehouseDB := openFixtureWarehouseDB(t)
	chatDBPath := seedDeliveryStatusChatDB(t, deliveryFixture{
		MessageGUID: "text-guid-1",
		IsSent:      1,
		IsDelivered: 1,
		IsFinished:  1,
		ErrorCode:   0,
	})
	t.Setenv("EVE_SOURCE_CHAT_DB", chatDBPath)

	createdAt := time.Date(2026, time.April, 1, 12, 15, 0, 0, time.UTC)
	attempt, err := CreateActionAttempt(warehouseDB, ActionAttemptCreateInput{
		ConnectionID: "conn-eve",
		Action:       imessageSendMethodID,
		Request: imessageSendRequest{
			Target: imessageMethodTarget{
				ConnectionID: "conn-eve",
				Channel: nexadapter.ChannelRef{
					Platform:    "imessage",
					ContainerID: "+17072876731",
				},
			},
			Text:  "Inline robot proof",
			Media: "/tmp/robot.png",
		},
		Metadata:  map[string]any{"executor": actionExecutorAppleScriptSendOnly, "has_media": true},
		CreatedAt: createdAt,
		UpdatedAt: createdAt,
	})
	if err != nil {
		t.Fatalf("CreateActionAttempt returned error: %v", err)
	}

	dispatchedAt := createdAt.Add(500 * time.Millisecond)
	status := ActionAttemptStatusDispatched
	attempt, err = UpdateActionAttemptByAttemptID(warehouseDB, attempt.AttemptID, ActionAttemptUpdateInput{
		Status:       &status,
		DispatchedAt: &dispatchedAt,
		UpdatedAt:    &dispatchedAt,
	})
	if err != nil {
		t.Fatalf("UpdateActionAttemptByAttemptID returned error: %v", err)
	}

	textRecord := nexadapter.NewRecord(platformID, "imessage:text-guid-1").
		WithTimestamp(createdAt.Add(1*time.Second)).
		WithContent("Inline robot proof").
		WithContentType("text").
		WithSender("me@example.com", "Me").
		WithContainer("+17072876731", "direct").
		WithConnection("conn-eve").
		WithMetadata("is_from_me", true).
		Build()
	if err := reconcileActionAttempts(warehouseDB, []nexadapter.AdapterInboundRecord{textRecord}); err != nil {
		t.Fatalf("reconcileActionAttempts returned error: %v", err)
	}

	updated, err := GetActionAttemptByAttemptID(warehouseDB, attempt.AttemptID)
	if err != nil {
		t.Fatalf("GetActionAttemptByAttemptID returned error: %v", err)
	}
	if updated.Status != ActionAttemptStatusDispatched {
		t.Fatalf("expected text-only evidence to remain dispatched, got %q", updated.Status)
	}
	if updated.Metadata["observed_text_record_id"] != "imessage:text-guid-1" {
		t.Fatalf("expected text observation metadata, got %#v", updated.Metadata)
	}
	if updated.Metadata["observed_media_record_id"] != nil {
		t.Fatalf("did not expect media observation yet, got %#v", updated.Metadata)
	}

	chatDB, err := sql.Open("sqlite3", chatDBPath)
	if err != nil {
		t.Fatalf("open chat db failed: %v", err)
	}
	defer chatDB.Close()
	if _, err := chatDB.Exec(
		`INSERT INTO message (ROWID, guid, is_sent, is_delivered, is_finished, error) VALUES (?, ?, ?, ?, ?, ?)`,
		2,
		"media-guid-1",
		1,
		1,
		1,
		0,
	); err != nil {
		t.Fatalf("insert media message row failed: %v", err)
	}
	if _, err := chatDB.Exec(
		`INSERT INTO attachment (ROWID, guid, filename, transfer_state) VALUES (?, ?, ?, ?)`,
		2,
		"attachment-guid-media",
		"~/Library/Messages/Attachments/eve/stage-1/test.png",
		5,
	); err != nil {
		t.Fatalf("insert media attachment row failed: %v", err)
	}
	if _, err := chatDB.Exec(`INSERT INTO message_attachment_join (message_id, attachment_id) VALUES (?, ?)`, 2, 2); err != nil {
		t.Fatalf("insert media join row failed: %v", err)
	}

	mediaRecord := nexadapter.NewRecord(platformID, "imessage:media-guid-1").
		WithTimestamp(createdAt.Add(1100*time.Millisecond)).
		WithContentType("text").
		WithSender("me@example.com", "Me").
		WithContainer("+17072876731", "direct").
		WithConnection("conn-eve").
		WithMetadata("is_from_me", true).
		WithAttachment(nexadapter.Attachment{
			ID:       "att-1",
			Filename: "robot.png",
			MIMEType: "image/png",
		}).
		Build()

	if err := reconcileActionAttempts(warehouseDB, []nexadapter.AdapterInboundRecord{mediaRecord}); err != nil {
		t.Fatalf("reconcileActionAttempts returned error: %v", err)
	}

	updated, err = GetActionAttemptByAttemptID(warehouseDB, attempt.AttemptID)
	if err != nil {
		t.Fatalf("GetActionAttemptByAttemptID returned error: %v", err)
	}
	if updated.Status != ActionAttemptStatusConfirmed {
		t.Fatalf("expected confirmed status, got %q", updated.Status)
	}
	if updated.TargetRecordID != "imessage:media-guid-1" {
		t.Fatalf("expected media record to drive confirmation, got %#v", updated)
	}
	if updated.TargetMessageGUID != "media-guid-1" {
		t.Fatalf("expected media guid to drive confirmation, got %#v", updated)
	}
	if updated.Metadata["observed_text_record_id"] != "imessage:text-guid-1" {
		t.Fatalf("expected text observation metadata, got %#v", updated.Metadata)
	}
	if updated.Metadata["observed_media_record_id"] != "imessage:media-guid-1" {
		t.Fatalf("expected media observation metadata, got %#v", updated.Metadata)
	}
	if updated.Metadata["confirmed_record_id"] != "imessage:media-guid-1" {
		t.Fatalf("expected media confirmation metadata, got %#v", updated.Metadata)
	}
}
