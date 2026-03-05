package control

import (
	"database/sql"
	"path/filepath"
	"testing"
)

func TestWebhookDeliveryLifecycle(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(filepath.Join(dir, "control.db"))
	if err != nil {
		t.Fatalf("open control store: %v", err)
	}
	defer store.Close()

	row, created, err := store.UpsertWebhookDeliveryReceived("delivery-1", "push", "oracle-test", "abc123")
	if err != nil {
		t.Fatalf("upsert delivery initial: %v", err)
	}
	if !created {
		t.Fatalf("expected initial delivery insert to create row")
	}
	if row.DeliveryID != "delivery-1" || row.Status != "received" {
		t.Fatalf("unexpected inserted delivery row: %#v", row)
	}

	dup, created, err := store.UpsertWebhookDeliveryReceived("delivery-1", "push", "oracle-test", "abc123")
	if err != nil {
		t.Fatalf("upsert delivery duplicate: %v", err)
	}
	if created {
		t.Fatalf("expected duplicate delivery to return created=false")
	}
	if dup.DeliveryID != "delivery-1" {
		t.Fatalf("unexpected duplicate delivery row: %#v", dup)
	}

	if err := store.UpdateWebhookDelivery("delivery-1", "queued", `["job-1","job-2"]`, ""); err != nil {
		t.Fatalf("update delivery queued: %v", err)
	}
	updated, err := store.GetWebhookDelivery("delivery-1")
	if err != nil {
		t.Fatalf("get delivery updated: %v", err)
	}
	if updated.Status != "queued" || updated.JobIDsJSON != `["job-1","job-2"]` {
		t.Fatalf("unexpected updated delivery row: %#v", updated)
	}

	if _, err := store.GetWebhookDelivery("missing-delivery"); err == nil {
		t.Fatalf("expected missing delivery to return error")
	} else if err != sql.ErrNoRows {
		t.Fatalf("expected sql.ErrNoRows for missing delivery, got %v", err)
	}
}
