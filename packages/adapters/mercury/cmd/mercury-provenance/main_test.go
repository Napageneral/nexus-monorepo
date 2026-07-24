package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"

	"github.com/nexus-project/adapter-mercury/internal/provenance"
)

func TestProjectCommandProducesFactsAndObservations(t *testing.T) {
	payload := map[string]any{
		"id":               "acct_1",
		"availableBalance": json.Number("42.50"),
		"status":           "active",
	}
	canonical, _ := json.Marshal(payload)
	digest := sha256.Sum256(canonical)
	hash := hex.EncodeToString(digest[:])
	input := provenance.ProjectInput{
		Records: []provenance.StoredRecord{
			{
				ID:          "record-1",
				RecordID:    "mercury:record-1",
				Timestamp:   1784900000000,
				Platform:    "mercury",
				ContainerID: "account_snapshot",
				Metadata: map[string]any{
					"external_record_id":              "mercury:record-1",
					"contract":                        provenance.RecordContract,
					"record_family":                   "account_snapshot",
					"provider_object_id":              "acct_1",
					"provider_payload":                payload,
					"provider_payload_canonical_json": string(canonical),
					"provider_payload_sha256":         hash,
					"captured_at":                     "2026-07-24T12:00:00Z",
					"provider_write_authority":        false,
					"journal_authority":               false,
					"payment_authority":               false,
					"tax_authority":                   false,
					"distribution_authority":          false,
					"cutover_authority":               false,
				},
			},
		},
		ResolutionAt: "2026-07-24T12:00:00Z",
	}
	encoded, _ := json.Marshal(input)
	var output bytes.Buffer
	if err := run([]string{"project"}, bytes.NewReader(encoded), &output); err != nil {
		t.Fatal(err)
	}
	var result provenance.ProjectResult
	decoder := json.NewDecoder(&output)
	decoder.UseNumber()
	if err := decoder.Decode(&result); err != nil {
		t.Fatal(err)
	}
	if len(result.Extraction.Facts) != 2 || len(result.Resolution.Observations) != 2 {
		t.Fatalf(
			"facts=%d observations=%d output=%s",
			len(result.Extraction.Facts),
			len(result.Resolution.Observations),
			output.String(),
		)
	}
}

func TestCommandRejectsUnknownMode(t *testing.T) {
	err := run([]string{"write-provider"}, strings.NewReader(`{}`), &bytes.Buffer{})
	if err == nil || !strings.Contains(err.Error(), "unknown command") {
		t.Fatalf("error = %v", err)
	}
}
