package provenance

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestExtractsTypedAccountAndPaymentFacts(t *testing.T) {
	records := []StoredRecord{
		testRevisionRecord(t, "account_snapshot", "acct_1", map[string]any{
			"id":                     "acct_1",
			"availableBalance":       json.Number("1234.56"),
			"currentBalance":         json.Number("1200"),
			"status":                 "active",
			"type":                   "checking",
			"name":                   "MoonSleep checking",
			"nickname":               "Operating",
			"legalBusinessName":      "MoonSleep LLC",
			"canReceiveTransactions": true,
			"createdAt":              "2026-07-01T10:00:00-05:00",
			"accountNumber":          "000012345678",
		}),
		testRevisionRecord(t, "approval_request_revision", "request_1", map[string]any{
			"requestId":                 "request_1",
			"accountId":                 "acct_1",
			"recipientId":               "recipient_1",
			"amount":                    json.Number("22834.95"),
			"status":                    "pendingApproval",
			"paymentMethod":             "ach",
			"memo":                      "Borden invoice",
			"numberOfApproversRequired": json.Number("1"),
			"reviews":                   []any{},
			"createdAt":                 "2026-07-24T09:00:00Z",
			"scheduledSendDate":         "2026-07-25",
		}),
	}
	result, err := Extract(records)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Receipts) != 2 {
		t.Fatalf("receipts = %d", len(result.Receipts))
	}
	assertFactValue(t, result.Facts, "available_balance_minor", int64(123456))
	assertFactValue(t, result.Facts, "current_balance_minor", int64(120000))
	assertFactValue(t, result.Facts, "account_suffix", "5678")
	assertFactValue(t, result.Facts, "amount_minor", int64(2283495))
	assertFactValue(t, result.Facts, "scheduled_send_date", "2026-07-25")
	assertFactValue(t, result.Facts, "approval_review_count", int64(0))
	for _, fact := range result.Facts {
		if fact.Authority != (Authority{}) {
			t.Fatalf("fact expanded authority: %#v", fact)
		}
		if fact.EvidenceLocator == "/accountNumber" && fact.Value == "000012345678" {
			t.Fatal("account number escaped into fact value")
		}
	}
	if len(result.MemoryFactParams) != len(result.Facts) {
		t.Fatalf("memory params = %d facts = %d", len(result.MemoryFactParams), len(result.Facts))
	}
}

func TestExtractsLiveShapedAttachmentFacts(t *testing.T) {
	parentProviderID := "txn_1"
	identityBasis := strings.Join([]string{parentProviderID, "receipt", "invoice.pdf"}, "\x00")
	providerID := "derived_attachment_" + sha256Hex([]byte(identityBasis+"\x001"))
	record := testRevisionRecord(t, "attachment_revision", providerID, map[string]any{
		"attachmentType": "receipt",
		"fileName":       "invoice.pdf",
		"url":            "https://example.test/private",
	})
	record.Metadata["provider_object_identity_contract"] = "nex_mercury_derived_attachment_identity_v1"
	record.Metadata["parent_provider_object_id"] = parentProviderID
	record.Metadata["attachment_occurrence"] = 1
	result, err := Extract([]StoredRecord{record})
	if err != nil {
		t.Fatal(err)
	}
	assertFactValue(t, result.Facts, "sanitized_filename", "invoice.pdf")
	assertFactValue(t, result.Facts, "attachment_type", "receipt")
	for _, fact := range result.Facts {
		if fact.Value == "https://example.test/private" {
			t.Fatal("attachment URL escaped into typed facts")
		}
	}
	tampered := record
	tampered.Metadata = map[string]any{}
	for key, value := range record.Metadata {
		tampered.Metadata[key] = value
	}
	tampered.Metadata["attachment_occurrence"] = 2
	if _, err := Extract([]StoredRecord{tampered}); err == nil ||
		!strings.Contains(err.Error(), "derived attachment identity mismatch") {
		t.Fatalf("tampered attachment identity error = %v", err)
	}
}

func TestCaptureFactsRemainScopedPerAccountRequest(t *testing.T) {
	firstScope := sha256Hex([]byte(`{"accountId":"acct_1"}`))
	secondScope := sha256Hex([]byte(`{"accountId":"acct_2"}`))
	result, err := Project(ProjectInput{
		Records: []StoredRecord{
			testCaptureRecord(t, firstScope, `{"statements":[],"page":{"nextPage":null}}`),
			testCaptureRecord(t, secondScope, `{"statements":[],"page":{"nextPage":null}}`),
		},
		ResolutionAt: "2026-07-24T12:05:00Z",
	})
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, observation := range result.Resolution.Observations {
		if observation.FieldName != "provider_response_sha256" {
			continue
		}
		count++
		if observation.ResolutionState != "resolved" {
			t.Fatalf("capture observation = %#v", observation)
		}
	}
	if count != 2 {
		t.Fatalf("provider response observations = %d", count)
	}
}

func TestExtractReplayIsByteStable(t *testing.T) {
	record := testRevisionRecord(t, "transaction_revision", "txn_1", map[string]any{
		"id":                         "txn_1",
		"accountId":                  "acct_1",
		"counterpartyId":             "recipient_1",
		"counterpartyName":           "L.A. Pillow & Fiber, Inc",
		"amount":                     json.Number("-1986.00"),
		"status":                     "pending",
		"kind":                       "externalTransfer",
		"compliantWithReceiptPolicy": false,
		"hasGeneratedReceipt":        false,
		"createdAt":                  "2026-07-24T09:00:00Z",
		"estimatedDeliveryDate":      "2026-07-25T12:00:00Z",
	})
	first, err := Extract([]StoredRecord{record})
	if err != nil {
		t.Fatal(err)
	}
	second, err := Extract([]StoredRecord{record})
	if err != nil {
		t.Fatal(err)
	}
	firstBytes, _ := json.Marshal(first)
	secondBytes, _ := json.Marshal(second)
	if !bytes.Equal(firstBytes, secondBytes) {
		t.Fatal("repeated extraction changed bytes")
	}
	assertFactValue(t, first.Facts, "amount_minor", int64(-198600))
	assertFactValue(t, first.Facts, "transaction_classification", "externalTransfer")
}

func TestExtractionRejectsTamperAndTypeConfusion(t *testing.T) {
	tampered := testRevisionRecord(t, "account_snapshot", "acct_1", map[string]any{
		"id":               "acct_1",
		"availableBalance": json.Number("10.00"),
	})
	tampered.Metadata["provider_payload_sha256"] = strings.Repeat("0", 64)
	if _, err := Extract([]StoredRecord{tampered}); err == nil ||
		!strings.Contains(err.Error(), "hash mismatch") {
		t.Fatalf("tamper error = %v", err)
	}

	for name, value := range map[string]any{
		"boolean": true,
		"string":  "10.00",
		"object":  map[string]any{"amount": 10},
	} {
		t.Run(name, func(t *testing.T) {
			record := testRevisionRecord(t, "account_snapshot", "acct_1", map[string]any{
				"id":               "acct_1",
				"availableBalance": value,
			})
			_, err := Extract([]StoredRecord{record})
			if name == "string" {
				if err != nil {
					t.Fatalf("exact decimal string should be accepted: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), "money must") {
				t.Fatalf("type confusion error = %v", err)
			}
		})
	}

	boolConfusion := testRevisionRecord(t, "account_snapshot", "acct_1", map[string]any{
		"id":                     "acct_1",
		"canReceiveTransactions": json.Number("0"),
	})
	if _, err := Extract([]StoredRecord{boolConfusion}); err == nil ||
		!strings.Contains(err.Error(), "must be a boolean") {
		t.Fatalf("bool confusion error = %v", err)
	}
}

func TestResolverSupersedesOlderFactsAndPreservesContradictions(t *testing.T) {
	firstRecord := testRevisionRecordAt(t, "account_snapshot", "acct_1", "2026-07-24T10:00:00Z", map[string]any{
		"id":               "acct_1",
		"availableBalance": json.Number("100.00"),
	})
	secondRecord := testRevisionRecordAt(t, "account_snapshot", "acct_1", "2026-07-24T11:00:00Z", map[string]any{
		"id":               "acct_1",
		"availableBalance": json.Number("125.00"),
	})
	extracted, err := Extract([]StoredRecord{firstRecord, secondRecord})
	if err != nil {
		t.Fatal(err)
	}
	var balanceFacts []Fact
	for _, fact := range extracted.Facts {
		if fact.FieldName == "available_balance_minor" {
			balanceFacts = append(balanceFacts, fact)
		}
	}
	priorID := "mobs_prior"
	prior := Observation{
		Contract:         ObservationContract,
		ObservationID:    priorID,
		SubjectReference: balanceFacts[0].SubjectReference,
		FieldName:        "available_balance_minor",
		ValueType:        "money_minor",
		CreatedAt:        "2026-07-24T10:00:00Z",
	}
	result, err := Resolve(balanceFacts, nil, []Observation{prior}, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Observations) != 1 {
		t.Fatalf("observations = %d", len(result.Observations))
	}
	observation := result.Observations[0]
	if observation.ResolutionState != "resolved" || observation.Value != int64(12500) {
		t.Fatalf("observation = %#v", observation)
	}
	if len(observation.ContradictingFactIDs) != 1 ||
		observation.SupersededObservationID == nil ||
		*observation.SupersededObservationID != priorID {
		t.Fatalf("observation provenance = %#v", observation)
	}
}

func TestResolverEmitsCreateReuseAndImmutableUpdateOperations(t *testing.T) {
	firstRecord := testRevisionRecordAt(
		t,
		"account_snapshot",
		"acct_1",
		"2026-07-24T10:00:00Z",
		map[string]any{
			"id":               "acct_1",
			"availableBalance": json.Number("100.00"),
		},
	)
	secondRecord := testRevisionRecordAt(
		t,
		"account_snapshot",
		"acct_1",
		"2026-07-24T11:00:00Z",
		map[string]any{
			"id":               "acct_1",
			"availableBalance": json.Number("125.00"),
		},
	)
	firstExtraction, err := Extract([]StoredRecord{firstRecord})
	if err != nil {
		t.Fatal(err)
	}
	firstResolution, err := Resolve(firstExtraction.Facts, nil, nil, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(firstResolution.MemoryOperations) != 1 ||
		firstResolution.MemoryOperations[0].Method != "memory.elements.create" {
		t.Fatalf("first memory operations = %#v", firstResolution.MemoryOperations)
	}

	prior := firstResolution.Observations[0]
	elementID := "mem_element_1"
	prior.NexElementID = &elementID
	replayed, err := Resolve(firstExtraction.Facts, nil, []Observation{prior}, "")
	if err != nil {
		t.Fatal(err)
	}
	if replayed.Observations[0].ObservationID != prior.ObservationID ||
		replayed.Observations[0].SupersededObservationID != nil ||
		len(replayed.MemoryOperations) != 1 ||
		replayed.MemoryOperations[0].Method != "memory.elements.get" ||
		replayed.MemoryOperations[0].Params["id"] != elementID {
		t.Fatalf("replay result = %#v", replayed)
	}

	secondExtraction, err := Extract([]StoredRecord{firstRecord, secondRecord})
	if err != nil {
		t.Fatal(err)
	}
	updated, err := Resolve(secondExtraction.Facts, nil, []Observation{prior}, "")
	if err != nil {
		t.Fatal(err)
	}
	observation := updated.Observations[0]
	operation := updated.MemoryOperations[0]
	if observation.ObservationID == prior.ObservationID ||
		observation.SupersededObservationID == nil ||
		*observation.SupersededObservationID != prior.ObservationID ||
		operation.Method != "memory.elements.update" ||
		operation.Params["id"] != elementID {
		t.Fatalf("update result = %#v", updated)
	}
	if _, hasType := operation.Params["type"]; hasType {
		t.Fatalf("update params include immutable type: %#v", operation.Params)
	}
	sourceFactIDs, ok := operation.Params["sourceFactIds"].([]string)
	if !ok || len(sourceFactIDs) != 2 {
		t.Fatalf("source fact ids = %#v", operation.Params["sourceFactIds"])
	}
}

func TestResolverFailsClosedForConcurrentConflictAndMissingRequirement(t *testing.T) {
	extracted, err := Extract([]StoredRecord{
		testRevisionRecordAt(t, "account_snapshot", "acct_1", "2026-07-24T11:00:00Z", map[string]any{
			"id":               "acct_1",
			"availableBalance": json.Number("100.00"),
		}),
		testRevisionRecordAt(t, "account_snapshot", "acct_1", "2026-07-24T11:00:00Z", map[string]any{
			"id":               "acct_1",
			"availableBalance": json.Number("125.00"),
		}),
	})
	if err != nil {
		t.Fatal(err)
	}
	var balanceFacts []Fact
	for _, fact := range extracted.Facts {
		if fact.FieldName == "available_balance_minor" {
			balanceFacts = append(balanceFacts, fact)
		}
	}
	missingSubject := "mercury:approval_request:" + strings.Repeat("4", 64)
	result, err := Resolve(
		balanceFacts,
		[]Requirement{
			{
				SubjectReference: missingSubject,
				FieldName:        "scheduled_send_date",
				ValueType:        "date",
			},
		},
		nil,
		"2026-07-24T11:00:00Z",
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Observations) != 2 {
		t.Fatalf("observations = %d", len(result.Observations))
	}
	byField := map[string]Observation{}
	for _, observation := range result.Observations {
		byField[observation.FieldName] = observation
	}
	balance := byField["available_balance_minor"]
	if balance.ResolutionState != "unresolved" ||
		balance.ResolutionReason != "concurrent_facts_conflict" ||
		len(balance.ContradictingFactIDs) != 2 {
		t.Fatalf("concurrent conflict = %#v", balance)
	}
	missing := byField["scheduled_send_date"]
	if missing.ResolutionState != "unresolved" ||
		missing.ResolutionReason != "required_fact_missing" ||
		missing.Value != nil {
		t.Fatalf("missing observation = %#v", missing)
	}
}

func TestProjectReplayIsDeterministic(t *testing.T) {
	input := ProjectInput{
		Records: []StoredRecord{
			testRevisionRecord(t, "recipient_revision", "recipient_1", map[string]any{
				"id":                   "recipient_1",
				"status":               "active",
				"name":                 "Borden Textile",
				"defaultPaymentMethod": "ach",
				"isBusiness":           true,
			}),
		},
		ResolutionAt: "2026-07-24T12:00:00Z",
	}
	first, err := Project(input)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Project(input)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatal("project replay changed output")
	}
	for _, params := range first.Resolution.MemoryObservationParams {
		metadata, _ := params["metadata"].(map[string]any)
		if metadata["authority"] != (Authority{}) {
			t.Fatalf("memory observation authority = %#v", metadata["authority"])
		}
	}
}

func testRevisionRecord(t *testing.T, family, providerID string, payload map[string]any) StoredRecord {
	t.Helper()
	return testRevisionRecordAt(t, family, providerID, "2026-07-24T12:00:00Z", payload)
}

func testCaptureRecord(t *testing.T, scopeSHA256 string, body string) StoredRecord {
	t.Helper()
	digest := sha256.Sum256([]byte(body))
	hash := hex.EncodeToString(digest[:])
	return StoredRecord{
		ID:          "capture-" + scopeSHA256,
		RecordID:    "mercury:capture:" + scopeSHA256,
		Timestamp:   1784900000000,
		Platform:    "mercury",
		ContainerID: "api_capture_receipt",
		Metadata: map[string]any{
			"external_record_id":       "mercury:capture:" + scopeSHA256,
			"contract":                 CaptureContract,
			"record_family":            "api_capture_receipt",
			"provider_operation_id":    "getAccountStatements",
			"capture_scope_sha256":     scopeSHA256,
			"page_number":              1,
			"row_count":                0,
			"http_status":              200,
			"provider_response_body":   body,
			"provider_response_sha256": hash,
			"captured_at":              "2026-07-24T12:00:00Z",
			"provider_write_attempted": false,
			"provider_write_authority": false,
			"journal_authority":        false,
			"payment_authority":        false,
			"tax_authority":            false,
			"distribution_authority":   false,
			"cutover_authority":        false,
		},
	}
}

func testRevisionRecordAt(
	t *testing.T,
	family string,
	providerID string,
	capturedAt string,
	payload map[string]any,
) StoredRecord {
	t.Helper()
	canonical, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(canonical)
	hash := hex.EncodeToString(digest[:])
	return StoredRecord{
		ID:          "record-" + family + "-" + hash,
		RecordID:    "mercury:" + family + ":" + hash,
		Timestamp:   1784900000000,
		Platform:    "mercury",
		ContainerID: family,
		Metadata: map[string]any{
			"external_record_id":              "mercury:" + family + ":" + hash,
			"contract":                        RecordContract,
			"provider":                        "mercury",
			"environment":                     "production",
			"connection_role":                 "primary_read",
			"record_family":                   family,
			"provider_object_id":              providerID,
			"provider_payload":                payload,
			"provider_payload_canonical_json": string(canonical),
			"provider_payload_sha256":         hash,
			"captured_at":                     capturedAt,
			"provider_write_authority":        false,
			"journal_authority":               false,
			"payment_authority":               false,
			"tax_authority":                   false,
			"distribution_authority":          false,
			"cutover_authority":               false,
		},
	}
}

func assertFactValue(t *testing.T, facts []Fact, field string, expected any) {
	t.Helper()
	for _, fact := range facts {
		if fact.FieldName == field {
			if !reflect.DeepEqual(fact.Value, expected) {
				t.Fatalf("%s value = %#v, want %#v", field, fact.Value, expected)
			}
			return
		}
	}
	t.Fatalf("fact %s is absent", field)
}
