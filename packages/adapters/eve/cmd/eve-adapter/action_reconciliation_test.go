package main

import (
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestReconcileActionAttemptsConfirmsMatchingSendEvidence(t *testing.T) {
	warehouseDB := openFixtureWarehouseDB(t)

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
}
