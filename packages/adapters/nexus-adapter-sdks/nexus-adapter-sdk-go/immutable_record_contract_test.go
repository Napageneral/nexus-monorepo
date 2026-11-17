package nexadapter

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"
)

func TestCompleteProviderSnapshotAndProviderProvenance(t *testing.T) {
	providerObjectJSON := `{"id":"456","title":"Fulfillment Runbook","version":{"number":7}}`
	snapshot, err := CompleteProviderSnapshot(providerObjectJSON, map[string]any{"page_id": "456"})
	if err != nil {
		t.Fatalf("CompleteProviderSnapshot: %v", err)
	}
	digest := sha256.Sum256([]byte(providerObjectJSON))
	if got, want := snapshot["provider_object_sha256"], hex.EncodeToString(digest[:]); got != want {
		t.Fatalf("provider_object_sha256 = %v, want %s", got, want)
	}

	record := MessageRecord(MessageRecordOptions{
		Platform:                 "confluence",
		ConnectionID:             "moonsleep-confluence",
		ProviderAccountRef:       "moonsleep.atlassian.net",
		ExternalRecordID:         "ari:cloud:confluence:site-1:page/456",
		SourceRecordType:         "page",
		ProviderVersionRef:       "7",
		SenderID:                 "atlassian-user-123",
		ContainerID:              "page-456",
		ContainerKind:            "group",
		Content:                  "Fulfillment runbook snapshot",
		CompleteProviderSnapshot: snapshot,
	})
	encoded, err := json.Marshal(record)
	if err != nil {
		t.Fatalf("marshal record: %v", err)
	}
	var roundTrip map[string]any
	if err := json.Unmarshal(encoded, &roundTrip); err != nil {
		t.Fatalf("unmarshal record: %v", err)
	}
	routing := roundTrip["routing"].(map[string]any)
	payload := roundTrip["payload"].(map[string]any)
	if routing["provider_account_ref"] != "moonsleep.atlassian.net" {
		t.Fatalf("provider_account_ref = %v", routing["provider_account_ref"])
	}
	if payload["source_record_type"] != "page" || payload["provider_version_ref"] != "7" {
		t.Fatalf("provider provenance missing: %#v", payload)
	}
	if _, exists := payload["record_id"]; exists {
		t.Fatal("adapter payload unexpectedly contains canonical record_id")
	}
}

func TestCompleteProviderSnapshotRejectsInvalidOrReservedInputs(t *testing.T) {
	for _, test := range []struct {
		name         string
		providerJSON string
		additional   map[string]any
	}{
		{name: "invalid json", providerJSON: "{"},
		{name: "top-level array", providerJSON: "[]"},
		{
			name:         "reserved digest",
			providerJSON: `{"id":"1"}`,
			additional:   map[string]any{"provider_object_sha256": "adapter-controlled"},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := CompleteProviderSnapshot(test.providerJSON, test.additional); err == nil {
				t.Fatal("expected CompleteProviderSnapshot to fail")
			}
		})
	}
}
