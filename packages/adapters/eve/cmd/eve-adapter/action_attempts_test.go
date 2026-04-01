package main

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/nexus-project/adapter-eve/internal/migrate"
)

func TestActionAttemptCreateUpdateAndQuery(t *testing.T) {
	db, cleanup := openActionAttemptLedgerDB(t)
	defer cleanup()

	createdAt := time.Date(2026, time.March, 31, 11, 30, 0, 0, time.UTC)
	record, err := CreateActionAttempt(db, ActionAttemptCreateInput{
		ConnectionID:      "conn-eve",
		EdgeID:            "edge-1",
		Action:            "imessage.reply",
		Request:           map[string]any{"reply_to_id": "imessage:message-1"},
		TargetRecordID:    "record-1",
		TargetThreadID:    "thread-1",
		TargetMessageGUID: "guid-1",
		Metadata:          map[string]any{"source": "nex"},
		CreatedAt:         createdAt,
	})
	if err != nil {
		t.Fatalf("CreateActionAttempt returned error: %v", err)
	}
	if record.AttemptID == "" {
		t.Fatal("expected generated attempt id")
	}
	if record.Status != ActionAttemptStatusPending {
		t.Fatalf("expected pending status, got %q", record.Status)
	}
	if string(record.RequestJSON) != `{"reply_to_id":"imessage:message-1"}` {
		t.Fatalf("unexpected request json: %s", string(record.RequestJSON))
	}
	if record.ResponseJSON != nil {
		t.Fatalf("expected nil response json, got %s", string(record.ResponseJSON))
	}
	if record.CreatedAtMs != createdAt.UnixMilli() {
		t.Fatalf("unexpected created_at_ms: %d", record.CreatedAtMs)
	}

	dispatchedAt := createdAt.Add(10 * time.Second)
	confirmedAt := createdAt.Add(25 * time.Second)
	status := ActionAttemptStatusConfirmed
	updated, err := UpdateActionAttemptByAttemptID(db, record.AttemptID, ActionAttemptUpdateInput{
		Status:       &status,
		Response:     map[string]any{"message_ids": []string{"imessage:sent:1"}},
		DispatchedAt: &dispatchedAt,
		ConfirmedAt:  &confirmedAt,
	})
	if err != nil {
		t.Fatalf("UpdateActionAttemptByAttemptID returned error: %v", err)
	}
	if updated.Status != ActionAttemptStatusConfirmed {
		t.Fatalf("expected confirmed status, got %q", updated.Status)
	}
	if updated.DispatchedAtMs == nil || *updated.DispatchedAtMs != dispatchedAt.UnixMilli() {
		t.Fatalf("unexpected dispatched_at_ms: %#v", updated.DispatchedAtMs)
	}
	if updated.ConfirmedAtMs == nil || *updated.ConfirmedAtMs != confirmedAt.UnixMilli() {
		t.Fatalf("unexpected confirmed_at_ms: %#v", updated.ConfirmedAtMs)
	}
	if string(updated.ResponseJSON) != `{"message_ids":["imessage:sent:1"]}` {
		t.Fatalf("unexpected response json: %s", string(updated.ResponseJSON))
	}

	got, err := GetActionAttemptByAttemptID(db, record.AttemptID)
	if err != nil {
		t.Fatalf("GetActionAttemptByAttemptID returned error: %v", err)
	}
	if got.Status != ActionAttemptStatusConfirmed {
		t.Fatalf("expected confirmed status from get, got %q", got.Status)
	}
	if got.Metadata["source"] != "nex" {
		t.Fatalf("unexpected metadata: %#v", got.Metadata)
	}
	if got.TargetRecordID != "record-1" || got.TargetThreadID != "thread-1" {
		t.Fatalf("unexpected target fields: %#v", got)
	}

	otherAttempt, err := CreateActionAttempt(db, ActionAttemptCreateInput{
		AttemptID:    "attempt-pending-2",
		ConnectionID: "conn-eve",
		Action:       "imessage.reaction.add",
		Request:      map[string]any{"emoji": "👍"},
		CreatedAt:    createdAt.Add(1 * time.Minute),
	})
	if err != nil {
		t.Fatalf("CreateActionAttempt(second) returned error: %v", err)
	}
	if otherAttempt.Status != ActionAttemptStatusPending {
		t.Fatalf("expected pending status, got %q", otherAttempt.Status)
	}

	pending, err := ListPendingActionAttempts(db, "conn-eve", 10)
	if err != nil {
		t.Fatalf("ListPendingActionAttempts returned error: %v", err)
	}
	if len(pending) != 1 {
		t.Fatalf("expected one pending attempt, got %d", len(pending))
	}
	if pending[0].AttemptID != "attempt-pending-2" {
		t.Fatalf("unexpected pending attempt: %#v", pending[0])
	}

	filtered, err := ListActionAttempts(db, ActionAttemptQueryFilter{
		ConnectionID: "conn-eve",
		Status:       ActionAttemptStatusConfirmed,
		Limit:        10,
	})
	if err != nil {
		t.Fatalf("ListActionAttempts returned error: %v", err)
	}
	if len(filtered) != 1 {
		t.Fatalf("expected one confirmed attempt, got %d", len(filtered))
	}
	if filtered[0].AttemptID != record.AttemptID {
		t.Fatalf("unexpected confirmed attempt: %#v", filtered[0])
	}

	if _, err := json.Marshal(filtered[0]); err != nil {
		t.Fatalf("expected record to marshal cleanly: %v", err)
	}
}

func TestActionAttemptRejectsMissingRequiredFields(t *testing.T) {
	db, cleanup := openActionAttemptLedgerDB(t)
	defer cleanup()

	if _, err := CreateActionAttempt(db, ActionAttemptCreateInput{Action: "imessage.send"}); err == nil {
		t.Fatal("expected connection_id validation error")
	}
	if _, err := UpdateActionAttemptByAttemptID(db, " ", ActionAttemptUpdateInput{}); err == nil {
		t.Fatal("expected attempt_id validation error")
	}
	if _, err := GetActionAttemptByAttemptID(db, " "); err == nil {
		t.Fatal("expected attempt_id validation error")
	}
}

func openActionAttemptLedgerDB(t *testing.T) (*sql.DB, func()) {
	t.Helper()

	dir := t.TempDir()
	dbPath := filepath.Join(dir, "eve.db")
	if err := migrate.MigrateWarehouse(dbPath); err != nil {
		t.Fatalf("migrate warehouse failed: %v", err)
	}

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("open sqlite db failed: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
		_ = os.RemoveAll(dir)
	})
	return db, func() {}
}
