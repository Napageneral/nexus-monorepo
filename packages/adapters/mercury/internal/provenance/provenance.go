package provenance

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	RecordContract      = "nex_mercury_record_revision_v1"
	CaptureContract     = "nex_mercury_api_capture_v1"
	FactContract        = "nex_mercury_fact_v1"
	ObservationContract = "nex_mercury_observation_v1"
	ExtractorName       = "nex-mercury-structured-fact-extractor"
	ExtractorRevision   = "1"
	ResolverName        = "nex-mercury-current-observation-resolver"
	ResolverRevision    = "1"
)

type StoredRecord struct {
	ID          string         `json:"id"`
	RecordID    string         `json:"record_id"`
	Timestamp   int64          `json:"timestamp"`
	Platform    string         `json:"platform"`
	ContainerID string         `json:"container_id"`
	Metadata    map[string]any `json:"metadata"`
}

type Authority struct {
	ProviderWrite bool `json:"provider_write"`
	Journal       bool `json:"journal"`
	Payment       bool `json:"payment"`
	Tax           bool `json:"tax"`
	Distribution  bool `json:"distribution"`
	Cutover       bool `json:"cutover"`
}

type Fact struct {
	Contract               string    `json:"contract"`
	FactID                 string    `json:"fact_id"`
	SubjectReference       string    `json:"subject_reference"`
	FieldName              string    `json:"field_name"`
	ValueType              string    `json:"value_type"`
	Value                  any       `json:"value"`
	Currency               *string   `json:"currency"`
	Unit                   *string   `json:"unit"`
	EffectiveAt            string    `json:"effective_at"`
	ObservedAt             string    `json:"observed_at"`
	SourceNexRecordID      string    `json:"source_nex_record_id"`
	SourceExternalRecordID string    `json:"source_external_record_id"`
	SourceContentSHA256    string    `json:"source_content_sha256"`
	EvidenceLocator        string    `json:"evidence_locator"`
	ExtractorName          string    `json:"extractor_name"`
	ExtractorRevision      string    `json:"extractor_revision"`
	ExtractionConfidence   string    `json:"extraction_confidence"`
	ExtractionReceiptID    string    `json:"extraction_receipt_id"`
	Authority              Authority `json:"authority"`
}

type ExtractionReceipt struct {
	Contract            string    `json:"contract"`
	ReceiptID           string    `json:"receipt_id"`
	SourceNexRecordID   string    `json:"source_nex_record_id"`
	SourceContentSHA256 string    `json:"source_content_sha256"`
	RecordFamily        string    `json:"record_family"`
	FactCount           int       `json:"fact_count"`
	FactIDs             []string  `json:"fact_ids"`
	ExtractorName       string    `json:"extractor_name"`
	ExtractorRevision   string    `json:"extractor_revision"`
	ObservedAt          string    `json:"observed_at"`
	Authority           Authority `json:"authority"`
}

type Requirement struct {
	SubjectReference string `json:"subject_reference"`
	FieldName        string `json:"field_name"`
	ValueType        string `json:"value_type"`
}

type Observation struct {
	Contract                string    `json:"contract"`
	ObservationID           string    `json:"observation_id"`
	SubjectReference        string    `json:"subject_reference"`
	FieldName               string    `json:"field_name"`
	ValueType               string    `json:"value_type"`
	ResolutionState         string    `json:"resolution_state"`
	Value                   any       `json:"value"`
	Currency                *string   `json:"currency"`
	Unit                    *string   `json:"unit"`
	SupportingFactIDs       []string  `json:"supporting_fact_ids"`
	ContradictingFactIDs    []string  `json:"contradicting_fact_ids"`
	ApplicableAt            *string   `json:"applicable_at"`
	ResolverName            string    `json:"resolver_name"`
	ResolverRevision        string    `json:"resolver_revision"`
	ResolutionReason        string    `json:"resolution_reason"`
	SupersededObservationID *string   `json:"superseded_observation_id"`
	CreatedAt               string    `json:"created_at"`
	CreatedActor            string    `json:"created_actor"`
	NexElementID            *string   `json:"nex_element_id,omitempty"`
	Authority               Authority `json:"authority"`
}

type MemoryOperation struct {
	Method string         `json:"method"`
	Params map[string]any `json:"params"`
}

type ExtractionResult struct {
	Contract         string              `json:"contract"`
	Facts            []Fact              `json:"facts"`
	Receipts         []ExtractionReceipt `json:"extraction_receipts"`
	MemoryFactParams []map[string]any    `json:"memory_fact_params"`
}

type ResolutionResult struct {
	Contract                string            `json:"contract"`
	Observations            []Observation     `json:"observations"`
	MemoryObservationParams []map[string]any  `json:"memory_observation_params"`
	MemoryOperations        []MemoryOperation `json:"memory_operations"`
}

type ProjectInput struct {
	Records           []StoredRecord `json:"records"`
	Requirements      []Requirement  `json:"requirements"`
	PriorObservations []Observation  `json:"prior_observations"`
	ResolutionAt      string         `json:"resolution_at"`
}

type ProjectResult struct {
	Extraction ExtractionResult `json:"extraction"`
	Resolution ResolutionResult `json:"resolution"`
}

type verifiedRecord struct {
	Record           StoredRecord
	Family           string
	ProviderObjectID string
	ProviderPayload  map[string]any
	ContentSHA256    string
	ObservedAt       string
	SourceExternalID string
	ReceiptID        string
	SubjectReference string
}

func Extract(records []StoredRecord) (ExtractionResult, error) {
	result := ExtractionResult{
		Contract:         "nex_mercury_fact_extraction_result_v1",
		Facts:            []Fact{},
		Receipts:         []ExtractionReceipt{},
		MemoryFactParams: []map[string]any{},
	}
	for _, record := range records {
		verified, err := verifyStoredRecord(record)
		if err != nil {
			return ExtractionResult{}, err
		}
		facts, err := extractVerifiedRecord(verified)
		if err != nil {
			return ExtractionResult{}, fmt.Errorf("extract %s: %w", record.ID, err)
		}
		sort.Slice(facts, func(i, j int) bool { return facts[i].FactID < facts[j].FactID })
		factIDs := make([]string, 0, len(facts))
		for _, fact := range facts {
			factIDs = append(factIDs, fact.FactID)
			result.Facts = append(result.Facts, fact)
			result.MemoryFactParams = append(result.MemoryFactParams, MemoryFactParams(fact))
		}
		result.Receipts = append(result.Receipts, ExtractionReceipt{
			Contract:            "nex_mercury_fact_extraction_receipt_v1",
			ReceiptID:           verified.ReceiptID,
			SourceNexRecordID:   verified.Record.ID,
			SourceContentSHA256: verified.ContentSHA256,
			RecordFamily:        verified.Family,
			FactCount:           len(facts),
			FactIDs:             factIDs,
			ExtractorName:       ExtractorName,
			ExtractorRevision:   ExtractorRevision,
			ObservedAt:          verified.ObservedAt,
			Authority:           Authority{},
		})
	}
	sort.Slice(result.Facts, func(i, j int) bool { return result.Facts[i].FactID < result.Facts[j].FactID })
	sort.Slice(result.Receipts, func(i, j int) bool {
		return result.Receipts[i].ReceiptID < result.Receipts[j].ReceiptID
	})
	sort.Slice(result.MemoryFactParams, func(i, j int) bool {
		return metadataID(result.MemoryFactParams[i], "fact_id") < metadataID(result.MemoryFactParams[j], "fact_id")
	})
	return result, nil
}

func Resolve(
	facts []Fact,
	requirements []Requirement,
	prior []Observation,
	resolutionAt string,
) (ResolutionResult, error) {
	if strings.TrimSpace(resolutionAt) == "" {
		resolutionAt = maxFactObservedAt(facts)
	}
	if strings.TrimSpace(resolutionAt) == "" {
		return ResolutionResult{}, errors.New("resolution_at is required when no facts are present")
	}
	resolutionAt, err := normalizeTimestamp(resolutionAt)
	if err != nil {
		return ResolutionResult{}, fmt.Errorf("resolution_at: %w", err)
	}
	groups := map[string][]Fact{}
	requirementMap := map[string]Requirement{}
	for _, fact := range facts {
		if err := validateFact(fact); err != nil {
			return ResolutionResult{}, err
		}
		key := observationKey(fact.SubjectReference, fact.FieldName)
		groups[key] = append(groups[key], fact)
		requirementMap[key] = Requirement{
			SubjectReference: fact.SubjectReference,
			FieldName:        fact.FieldName,
			ValueType:        fact.ValueType,
		}
	}
	for _, requirement := range requirements {
		if strings.TrimSpace(requirement.SubjectReference) == "" ||
			strings.TrimSpace(requirement.FieldName) == "" ||
			strings.TrimSpace(requirement.ValueType) == "" {
			return ResolutionResult{}, errors.New("requirements need subject_reference, field_name and value_type")
		}
		key := observationKey(requirement.SubjectReference, requirement.FieldName)
		if existing, ok := requirementMap[key]; ok && existing.ValueType != requirement.ValueType {
			return ResolutionResult{}, fmt.Errorf("requirement value_type conflicts for %s", key)
		}
		requirementMap[key] = requirement
	}
	priorHeads := currentPriorObservations(prior)
	keys := make([]string, 0, len(requirementMap))
	for key := range requirementMap {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	result := ResolutionResult{
		Contract:                "nex_mercury_observation_resolution_result_v1",
		Observations:            []Observation{},
		MemoryObservationParams: []map[string]any{},
		MemoryOperations:        []MemoryOperation{},
	}
	for _, key := range keys {
		requirement := requirementMap[key]
		observation, err := resolveGroup(
			requirement,
			groups[key],
			priorHeads[key],
			resolutionAt,
		)
		if err != nil {
			return ResolutionResult{}, err
		}
		result.Observations = append(result.Observations, observation)
		result.MemoryObservationParams = append(
			result.MemoryObservationParams,
			MemoryObservationParams(observation),
		)
		result.MemoryOperations = append(
			result.MemoryOperations,
			MemoryObservationOperation(observation, priorHeads[key]),
		)
	}
	return result, nil
}

func Project(input ProjectInput) (ProjectResult, error) {
	extraction, err := Extract(input.Records)
	if err != nil {
		return ProjectResult{}, err
	}
	resolution, err := Resolve(
		extraction.Facts,
		input.Requirements,
		input.PriorObservations,
		input.ResolutionAt,
	)
	if err != nil {
		return ProjectResult{}, err
	}
	return ProjectResult{Extraction: extraction, Resolution: resolution}, nil
}

func verifyStoredRecord(record StoredRecord) (verifiedRecord, error) {
	if strings.TrimSpace(record.ID) == "" {
		return verifiedRecord{}, errors.New("stored record is missing id")
	}
	if record.Platform != "mercury" {
		return verifiedRecord{}, fmt.Errorf("record %s platform is not mercury", record.ID)
	}
	metadata := record.Metadata
	if metadata == nil {
		return verifiedRecord{}, fmt.Errorf("record %s is missing metadata", record.ID)
	}
	contract := stringValue(metadata["contract"])
	switch contract {
	case RecordContract:
		return verifyRevisionRecord(record)
	case CaptureContract:
		return verifyCaptureRecord(record)
	default:
		return verifiedRecord{}, fmt.Errorf("record %s has unsupported contract %q", record.ID, contract)
	}
}

func verifyRevisionRecord(record StoredRecord) (verifiedRecord, error) {
	metadata := record.Metadata
	family := stringValue(metadata["record_family"])
	if family == "" || family != record.ContainerID {
		return verifiedRecord{}, fmt.Errorf("record %s family mismatch", record.ID)
	}
	providerID := stringValue(metadata["provider_object_id"])
	if providerID == "" {
		return verifiedRecord{}, fmt.Errorf("record %s is missing provider_object_id", record.ID)
	}
	payload, ok := metadata["provider_payload"].(map[string]any)
	if !ok || len(payload) == 0 {
		return verifiedRecord{}, fmt.Errorf("record %s is missing provider_payload", record.ID)
	}
	canonicalText := stringValue(metadata["provider_payload_canonical_json"])
	contentSHA := stringValue(metadata["provider_payload_sha256"])
	if canonicalText == "" || !isSHA256(contentSHA) {
		return verifiedRecord{}, fmt.Errorf("record %s is missing canonical payload evidence", record.ID)
	}
	canonical, err := canonicalObject([]byte(canonicalText))
	if err != nil {
		return verifiedRecord{}, fmt.Errorf("record %s canonical payload: %w", record.ID, err)
	}
	if sha256Hex(canonical) != contentSHA {
		return verifiedRecord{}, fmt.Errorf("record %s canonical payload hash mismatch", record.ID)
	}
	payloadCanonical, err := json.Marshal(payload)
	if err != nil {
		return verifiedRecord{}, fmt.Errorf("record %s provider payload: %w", record.ID, err)
	}
	payloadCanonical, err = canonicalObject(payloadCanonical)
	if err != nil {
		return verifiedRecord{}, fmt.Errorf("record %s provider payload: %w", record.ID, err)
	}
	if !bytes.Equal(payloadCanonical, canonical) {
		return verifiedRecord{}, fmt.Errorf("record %s provider payload differs from canonical bytes", record.ID)
	}
	if optionalID(payload["id"]) == "" && optionalID(payload["requestId"]) == "" {
		return verifiedRecord{}, fmt.Errorf("record %s provider payload lacks stable identity", record.ID)
	}
	observedAt, err := normalizeTimestamp(stringValue(metadata["captured_at"]))
	if err != nil {
		return verifiedRecord{}, fmt.Errorf("record %s captured_at: %w", record.ID, err)
	}
	if err := validateFalseAuthority(metadata); err != nil {
		return verifiedRecord{}, fmt.Errorf("record %s: %w", record.ID, err)
	}
	subjectClass := subjectClassForFamily(family)
	if subjectClass == "" {
		return verifiedRecord{}, fmt.Errorf("record %s has unsupported family %q", record.ID, family)
	}
	externalID := stringValue(metadata["external_record_id"])
	if externalID == "" {
		externalID = record.RecordID
	}
	if externalID == "" {
		externalID = record.ID
	}
	subject := "mercury:" + subjectClass + ":" + sha256Hex([]byte(providerID))
	receiptID := "mextract_" + sha256Hex([]byte(
		record.ID+"\x00"+contentSHA+"\x00"+ExtractorName+"\x00"+ExtractorRevision,
	))
	return verifiedRecord{
		Record:           record,
		Family:           family,
		ProviderObjectID: providerID,
		ProviderPayload:  payload,
		ContentSHA256:    contentSHA,
		ObservedAt:       observedAt,
		SourceExternalID: externalID,
		ReceiptID:        receiptID,
		SubjectReference: subject,
	}, nil
}

func verifyCaptureRecord(record StoredRecord) (verifiedRecord, error) {
	metadata := record.Metadata
	if record.ContainerID != "api_capture_receipt" ||
		stringValue(metadata["record_family"]) != "api_capture_receipt" {
		return verifiedRecord{}, fmt.Errorf("record %s capture family mismatch", record.ID)
	}
	body := stringValue(metadata["provider_response_body"])
	contentSHA := stringValue(metadata["provider_response_sha256"])
	if body == "" || !isSHA256(contentSHA) || sha256Hex([]byte(body)) != contentSHA {
		return verifiedRecord{}, fmt.Errorf("record %s capture response hash mismatch", record.ID)
	}
	observedAt, err := normalizeTimestamp(stringValue(metadata["captured_at"]))
	if err != nil {
		return verifiedRecord{}, fmt.Errorf("record %s captured_at: %w", record.ID, err)
	}
	if value, ok := metadata["provider_write_attempted"]; !ok || value != false {
		return verifiedRecord{}, fmt.Errorf("record %s capture is not read-only", record.ID)
	}
	if err := validateFalseAuthority(metadata); err != nil {
		return verifiedRecord{}, fmt.Errorf("record %s: %w", record.ID, err)
	}
	operation := stringValue(metadata["provider_operation_id"])
	page, err := integerValue(metadata["page_number"])
	if operation == "" || err != nil {
		return verifiedRecord{}, fmt.Errorf("record %s has invalid capture identity", record.ID)
	}
	payload := map[string]any{
		"provider_operation_id":    operation,
		"page_number":              page,
		"row_count":                metadata["row_count"],
		"http_status":              metadata["http_status"],
		"provider_response_sha256": contentSHA,
		"captured_at":              observedAt,
		"provider_write_attempted": false,
	}
	externalID := stringValue(metadata["external_record_id"])
	if externalID == "" {
		externalID = record.RecordID
	}
	if externalID == "" {
		externalID = record.ID
	}
	subject := fmt.Sprintf("mercury:capture:%s:%d", operation, page)
	receiptID := "mextract_" + sha256Hex([]byte(
		record.ID+"\x00"+contentSHA+"\x00"+ExtractorName+"\x00"+ExtractorRevision,
	))
	return verifiedRecord{
		Record:           record,
		Family:           "api_capture_receipt",
		ProviderObjectID: subject,
		ProviderPayload:  payload,
		ContentSHA256:    contentSHA,
		ObservedAt:       observedAt,
		SourceExternalID: externalID,
		ReceiptID:        receiptID,
		SubjectReference: subject,
	}, nil
}

func extractVerifiedRecord(record verifiedRecord) ([]Fact, error) {
	builder := factBuilder{record: record}
	switch record.Family {
	case "account_snapshot":
		builder.addMoney("/availableBalance", "available_balance_minor", "USD")
		builder.addMoney("/currentBalance", "current_balance_minor", "USD")
		builder.addString("/status", "lifecycle_state")
		builder.addString("/type", "account_type")
		builder.addString("/name", "display_name")
		builder.addString("/nickname", "nickname")
		builder.addString("/legalBusinessName", "legal_business_name")
		builder.addBool("/canReceiveTransactions", "can_receive_transactions")
		builder.addTimestamp("/createdAt", "created_at")
		builder.addLastFour("/accountNumber", "account_suffix")
	case "transaction_revision":
		builder.addMoney("/amount", "amount_minor", "USD")
		builder.addString("/status", "lifecycle_state")
		builder.addString("/counterpartyName", "counterparty_name")
		builder.addString("/counterpartyNickname", "counterparty_nickname")
		builder.addString("/externalMemo", "external_memo")
		builder.addString("/bankDescription", "bank_description")
		builder.addString("/note", "note")
		builder.addString("/reasonForFailure", "failure_reason")
		builder.addBool("/compliantWithReceiptPolicy", "receipt_policy_compliant")
		builder.addBool("/hasGeneratedReceipt", "has_generated_receipt")
		builder.addTimestamp("/createdAt", "created_at")
		builder.addTimestamp("/postedAt", "posted_at")
		builder.addTimestamp("/estimatedDeliveryDate", "estimated_delivery_at")
		builder.addTimestamp("/failedAt", "failed_at")
		builder.addHashedReference("/accountId", "account_subject_reference", "account")
		builder.addHashedReference("/counterpartyId", "counterparty_subject_reference", "counterparty")
		builder.addHashedReference("/requestId", "payment_request_subject_reference", "payment")
		builder.addString("/kind", "transaction_classification")
	case "recipient_revision":
		builder.addString("/status", "lifecycle_state")
		builder.addString("/name", "display_name")
		builder.addString("/nickname", "nickname")
		builder.addBool("/isBusiness", "is_business")
		builder.addString("/defaultPaymentMethod", "default_payment_method")
		builder.addTimestamp("/dateLastPaid", "last_paid_at")
	case "approval_request_revision", "scheduled_payment_observation":
		builder.addMoney("/amount", "amount_minor", "USD")
		builder.addString("/status", "lifecycle_state")
		builder.addString("/paymentMethod", "payment_method")
		builder.addString("/memo", "memo")
		builder.addInteger("/numberOfApproversRequired", "approvals_required")
		builder.addIntegerCount("/reviews", "approval_review_count")
		builder.addTimestamp("/createdAt", "created_at")
		builder.addDate("/scheduledSendDate", "scheduled_send_date")
		builder.addHashedReference("/accountId", "account_subject_reference", "account")
		builder.addHashedReference("/recipientId", "recipient_subject_reference", "recipient")
	case "payment_revision":
		builder.addMoney("/amount", "amount_minor", "USD")
		builder.addString("/status", "lifecycle_state")
		builder.addTimestamp("/createdAt", "created_at")
		builder.addTimestamp("/postedAt", "posted_at")
		builder.addTimestamp("/estimatedDeliveryDate", "estimated_delivery_at")
		builder.addTimestamp("/failedAt", "failed_at")
		builder.addHashedReference("/accountId", "account_subject_reference", "account")
		builder.addHashedReference("/counterpartyId", "counterparty_subject_reference", "counterparty")
	case "statement_revision":
		builder.addTimestamp("/startDate", "statement_start_at")
		builder.addTimestamp("/endDate", "statement_end_at")
		builder.addMoney("/endingBalance", "ending_balance_minor", "USD")
		builder.addLastFour("/accountNumber", "account_suffix")
		builder.addIntegerCount("/transactions", "statement_transaction_count")
	case "attachment_revision":
		builder.addString("/filename", "sanitized_filename")
		builder.addString("/contentType", "media_type")
		builder.addString("/contentHash", "content_sha256")
		builder.addInteger("/sizeBytes", "byte_count")
	case "api_capture_receipt":
		builder.addString("/provider_operation_id", "provider_operation_id")
		builder.addInteger("/page_number", "page_number")
		builder.addInteger("/row_count", "row_count")
		builder.addInteger("/http_status", "http_status")
		builder.addString("/provider_response_sha256", "provider_response_sha256")
		builder.addTimestamp("/captured_at", "captured_at")
		builder.addBool("/provider_write_attempted", "provider_write_attempted")
	default:
		return nil, fmt.Errorf("unsupported record family %q", record.Family)
	}
	return builder.facts, errors.Join(builder.errors...)
}

type factBuilder struct {
	record verifiedRecord
	facts  []Fact
	errors []error
}

func (builder *factBuilder) addMoney(pointer, field, currency string) {
	value, exists := topLevelValue(builder.record.ProviderPayload, pointer)
	if !exists || value == nil {
		return
	}
	minor, err := moneyMinor(value)
	if err != nil {
		builder.errors = append(builder.errors, fmt.Errorf("%s: %w", pointer, err))
		return
	}
	builder.add(pointer, field, "money_minor", minor, &currency, nil, "")
}

func (builder *factBuilder) addString(pointer, field string) {
	value, exists := topLevelValue(builder.record.ProviderPayload, pointer)
	if !exists || value == nil {
		return
	}
	text, ok := value.(string)
	if !ok {
		builder.errors = append(builder.errors, fmt.Errorf("%s must be a string", pointer))
		return
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return
	}
	builder.add(pointer, field, "string", text, nil, nil, "")
}

func (builder *factBuilder) addBool(pointer, field string) {
	value, exists := topLevelValue(builder.record.ProviderPayload, pointer)
	if !exists || value == nil {
		return
	}
	typed, ok := value.(bool)
	if !ok {
		builder.errors = append(builder.errors, fmt.Errorf("%s must be a boolean", pointer))
		return
	}
	builder.add(pointer, field, "boolean", typed, nil, nil, "")
}

func (builder *factBuilder) addInteger(pointer, field string) {
	value, exists := topLevelValue(builder.record.ProviderPayload, pointer)
	if !exists || value == nil {
		return
	}
	typed, err := integerValue(value)
	if err != nil {
		builder.errors = append(builder.errors, fmt.Errorf("%s: %w", pointer, err))
		return
	}
	builder.add(pointer, field, "integer", typed, nil, nil, "")
}

func (builder *factBuilder) addIntegerCount(pointer, field string) {
	value, exists := topLevelValue(builder.record.ProviderPayload, pointer)
	if !exists || value == nil {
		return
	}
	items, ok := value.([]any)
	if !ok {
		builder.errors = append(builder.errors, fmt.Errorf("%s must be an array", pointer))
		return
	}
	builder.add(pointer, field, "integer", int64(len(items)), nil, nil, "")
}

func (builder *factBuilder) addTimestamp(pointer, field string) {
	value, exists := topLevelValue(builder.record.ProviderPayload, pointer)
	if !exists || value == nil {
		return
	}
	text, ok := value.(string)
	if !ok {
		builder.errors = append(builder.errors, fmt.Errorf("%s must be a timestamp string", pointer))
		return
	}
	normalized, err := normalizeTimestamp(text)
	if err != nil {
		builder.errors = append(builder.errors, fmt.Errorf("%s: %w", pointer, err))
		return
	}
	builder.add(pointer, field, "timestamp", normalized, nil, nil, normalized)
}

func (builder *factBuilder) addDate(pointer, field string) {
	value, exists := topLevelValue(builder.record.ProviderPayload, pointer)
	if !exists || value == nil {
		return
	}
	text, ok := value.(string)
	if !ok {
		builder.errors = append(builder.errors, fmt.Errorf("%s must be a date string", pointer))
		return
	}
	parsed, err := time.Parse("2006-01-02", text)
	if err != nil {
		builder.errors = append(builder.errors, fmt.Errorf("%s: invalid date", pointer))
		return
	}
	normalized := parsed.Format("2006-01-02")
	builder.add(pointer, field, "date", normalized, nil, nil, normalized+"T00:00:00Z")
}

func (builder *factBuilder) addHashedReference(pointer, field, subjectClass string) {
	value, exists := topLevelValue(builder.record.ProviderPayload, pointer)
	if !exists || value == nil {
		return
	}
	id := optionalID(value)
	if id == "" {
		builder.errors = append(builder.errors, fmt.Errorf("%s must be a string or integer reference", pointer))
		return
	}
	reference := "mercury:" + subjectClass + ":" + sha256Hex([]byte(id))
	builder.add(pointer, field, "reference", reference, nil, nil, "")
}

func (builder *factBuilder) addLastFour(pointer, field string) {
	value, exists := topLevelValue(builder.record.ProviderPayload, pointer)
	if !exists || value == nil {
		return
	}
	text, ok := value.(string)
	if !ok {
		builder.errors = append(builder.errors, fmt.Errorf("%s must be a string", pointer))
		return
	}
	digits := strings.Builder{}
	for _, char := range text {
		if char >= '0' && char <= '9' {
			digits.WriteRune(char)
		}
	}
	normalized := digits.String()
	if len(normalized) < 4 {
		builder.errors = append(builder.errors, fmt.Errorf("%s does not contain four digits", pointer))
		return
	}
	builder.add(pointer, field, "string", normalized[len(normalized)-4:], nil, nil, "")
}

func (builder *factBuilder) add(
	pointer string,
	field string,
	valueType string,
	value any,
	currency *string,
	unit *string,
	effectiveAt string,
) {
	if effectiveAt == "" {
		effectiveAt = factEffectiveAt(builder.record)
	}
	canonicalValue, err := json.Marshal(value)
	if err != nil {
		builder.errors = append(builder.errors, fmt.Errorf("%s value: %w", pointer, err))
		return
	}
	identity := strings.Join([]string{
		builder.record.SubjectReference,
		field,
		valueType,
		string(canonicalValue),
		builder.record.ContentSHA256,
		pointer,
		ExtractorRevision,
	}, "\x00")
	factID := "mfact_" + sha256Hex([]byte(identity))
	builder.facts = append(builder.facts, Fact{
		Contract:               FactContract,
		FactID:                 factID,
		SubjectReference:       builder.record.SubjectReference,
		FieldName:              field,
		ValueType:              valueType,
		Value:                  value,
		Currency:               currency,
		Unit:                   unit,
		EffectiveAt:            effectiveAt,
		ObservedAt:             builder.record.ObservedAt,
		SourceNexRecordID:      builder.record.Record.ID,
		SourceExternalRecordID: builder.record.SourceExternalID,
		SourceContentSHA256:    builder.record.ContentSHA256,
		EvidenceLocator:        pointer,
		ExtractorName:          ExtractorName,
		ExtractorRevision:      ExtractorRevision,
		ExtractionConfidence:   "deterministic",
		ExtractionReceiptID:    builder.record.ReceiptID,
		Authority:              Authority{},
	})
}

func resolveGroup(
	requirement Requirement,
	facts []Fact,
	prior *Observation,
	resolutionAt string,
) (Observation, error) {
	if len(facts) == 0 {
		observation := Observation{
			Contract:                ObservationContract,
			SubjectReference:        requirement.SubjectReference,
			FieldName:               requirement.FieldName,
			ValueType:               requirement.ValueType,
			ResolutionState:         "unresolved",
			Value:                   nil,
			Currency:                nil,
			Unit:                    nil,
			SupportingFactIDs:       []string{},
			ContradictingFactIDs:    []string{},
			ApplicableAt:            nil,
			ResolverName:            ResolverName,
			ResolverRevision:        ResolverRevision,
			ResolutionReason:        "required_fact_missing",
			SupersededObservationID: nil,
			CreatedAt:               resolutionAt,
			CreatedActor:            "nex-mercury-deterministic-resolver",
			Authority:               Authority{},
		}
		observation.ObservationID = observationID(observation)
		if prior != nil && prior.ObservationID != observation.ObservationID {
			observation.SupersededObservationID = priorObservationID(prior)
		}
		return observation, nil
	}
	sorted := append([]Fact(nil), facts...)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].EffectiveAt != sorted[j].EffectiveAt {
			return sorted[i].EffectiveAt > sorted[j].EffectiveAt
		}
		if sorted[i].ObservedAt != sorted[j].ObservedAt {
			return sorted[i].ObservedAt > sorted[j].ObservedAt
		}
		return sorted[i].FactID < sorted[j].FactID
	})
	selected := sorted[0]
	top := []Fact{}
	for _, fact := range sorted {
		if fact.EffectiveAt == selected.EffectiveAt && fact.ObservedAt == selected.ObservedAt {
			top = append(top, fact)
		}
	}
	topValues := map[string]struct{}{}
	for _, fact := range top {
		topValues[canonicalValueKey(fact.Value)] = struct{}{}
	}
	supporting := []string{}
	contradicting := []string{}
	for _, fact := range sorted {
		if canonicalValueKey(fact.Value) == canonicalValueKey(selected.Value) {
			supporting = append(supporting, fact.FactID)
		} else {
			contradicting = append(contradicting, fact.FactID)
		}
	}
	sort.Strings(supporting)
	sort.Strings(contradicting)
	applicableAt := selected.EffectiveAt
	observation := Observation{
		Contract:                ObservationContract,
		SubjectReference:        requirement.SubjectReference,
		FieldName:               requirement.FieldName,
		ValueType:               requirement.ValueType,
		ResolutionState:         "resolved",
		Value:                   selected.Value,
		Currency:                selected.Currency,
		Unit:                    selected.Unit,
		SupportingFactIDs:       supporting,
		ContradictingFactIDs:    contradicting,
		ApplicableAt:            &applicableAt,
		ResolverName:            ResolverName,
		ResolverRevision:        ResolverRevision,
		ResolutionReason:        "latest_effective_and_observed_fact_selected",
		SupersededObservationID: nil,
		CreatedAt:               selected.ObservedAt,
		CreatedActor:            "nex-mercury-deterministic-resolver",
		Authority:               Authority{},
	}
	if len(topValues) > 1 {
		allTop := make([]string, 0, len(top))
		for _, fact := range top {
			allTop = append(allTop, fact.FactID)
		}
		sort.Strings(allTop)
		observation.ResolutionState = "unresolved"
		observation.Value = nil
		observation.Currency = nil
		observation.Unit = nil
		observation.SupportingFactIDs = []string{}
		observation.ContradictingFactIDs = allTop
		observation.ResolutionReason = "concurrent_facts_conflict"
	}
	observation.ObservationID = observationID(observation)
	if prior != nil && prior.ObservationID != observation.ObservationID {
		observation.SupersededObservationID = priorObservationID(prior)
	}
	return observation, nil
}

func MemoryFactParams(fact Fact) map[string]any {
	asOf, _ := time.Parse(time.RFC3339Nano, fact.EffectiveAt)
	return map[string]any{
		"content":       factContent(fact),
		"asOf":          asOf.UnixMilli(),
		"sourceEventId": fact.SourceNexRecordID,
		"evidenceRefs": []any{
			map[string]any{
				"sourceRecordId": fact.SourceNexRecordID,
				"reason":         "Exact immutable Mercury record location supporting this atomic fact.",
			},
		},
		"metadata": map[string]any{
			"contract":                  fact.Contract,
			"fact_id":                   fact.FactID,
			"subject_reference":         fact.SubjectReference,
			"field_name":                fact.FieldName,
			"value_type":                fact.ValueType,
			"value":                     fact.Value,
			"currency":                  fact.Currency,
			"unit":                      fact.Unit,
			"effective_at":              fact.EffectiveAt,
			"observed_at":               fact.ObservedAt,
			"source_nex_record_id":      fact.SourceNexRecordID,
			"source_external_record_id": fact.SourceExternalRecordID,
			"source_content_sha256":     fact.SourceContentSHA256,
			"evidence_locator":          fact.EvidenceLocator,
			"extractor_name":            fact.ExtractorName,
			"extractor_revision":        fact.ExtractorRevision,
			"extraction_confidence":     fact.ExtractionConfidence,
			"extraction_receipt_id":     fact.ExtractionReceiptID,
			"retention_key":             fact.FactID,
			"authority":                 fact.Authority,
		},
	}
}

func MemoryObservationParams(observation Observation) map[string]any {
	asOf := int64(0)
	if observation.ApplicableAt != nil {
		if parsed, err := time.Parse(time.RFC3339Nano, *observation.ApplicableAt); err == nil {
			asOf = parsed.UnixMilli()
		}
	}
	if asOf == 0 {
		if parsed, err := time.Parse(time.RFC3339Nano, observation.CreatedAt); err == nil {
			asOf = parsed.UnixMilli()
		}
	}
	sourceFactIDs := mergedFactIDs(observation.SupportingFactIDs, observation.ContradictingFactIDs)
	return map[string]any{
		"type":          "observation",
		"content":       observationContent(observation),
		"asOf":          asOf,
		"sourceFactIds": sourceFactIDs,
		"metadata": map[string]any{
			"contract":                      observation.Contract,
			"observation_id":                observation.ObservationID,
			"subject_reference":             observation.SubjectReference,
			"field_name":                    observation.FieldName,
			"value_type":                    observation.ValueType,
			"resolution_state":              observation.ResolutionState,
			"value":                         observation.Value,
			"currency":                      observation.Currency,
			"unit":                          observation.Unit,
			"supporting_fact_ids":           observation.SupportingFactIDs,
			"contradicting_fact_ids":        observation.ContradictingFactIDs,
			"applicable_at":                 observation.ApplicableAt,
			"resolver_name":                 observation.ResolverName,
			"resolver_revision":             observation.ResolverRevision,
			"resolution_reason":             observation.ResolutionReason,
			"superseded_observation_id":     observation.SupersededObservationID,
			"created_at":                    observation.CreatedAt,
			"created_actor":                 observation.CreatedActor,
			"dedupe_key":                    observation.ObservationID,
			"source_fact_ids":               sourceFactIDs,
			"contradicting_source_fact_ids": observation.ContradictingFactIDs,
			"authority":                     observation.Authority,
		},
	}
}

func MemoryObservationOperation(
	observation Observation,
	prior *Observation,
) MemoryOperation {
	params := MemoryObservationParams(observation)
	if prior == nil || prior.NexElementID == nil || strings.TrimSpace(*prior.NexElementID) == "" {
		return MemoryOperation{Method: "memory.elements.create", Params: params}
	}
	if prior.ObservationID == observation.ObservationID {
		return MemoryOperation{
			Method: "memory.elements.get",
			Params: map[string]any{"id": strings.TrimSpace(*prior.NexElementID)},
		}
	}
	params["id"] = strings.TrimSpace(*prior.NexElementID)
	delete(params, "type")
	return MemoryOperation{Method: "memory.elements.update", Params: params}
}

func validateFact(fact Fact) error {
	if fact.Contract != FactContract {
		return fmt.Errorf("fact %s contract mismatch", fact.FactID)
	}
	if !strings.HasPrefix(fact.FactID, "mfact_") ||
		fact.SubjectReference == "" ||
		fact.FieldName == "" ||
		fact.ValueType == "" ||
		fact.SourceNexRecordID == "" ||
		!isSHA256(fact.SourceContentSHA256) ||
		!strings.HasPrefix(fact.EvidenceLocator, "/") {
		return fmt.Errorf("fact %s is incomplete", fact.FactID)
	}
	if _, err := normalizeTimestamp(fact.EffectiveAt); err != nil {
		return fmt.Errorf("fact %s effective_at: %w", fact.FactID, err)
	}
	if _, err := normalizeTimestamp(fact.ObservedAt); err != nil {
		return fmt.Errorf("fact %s observed_at: %w", fact.FactID, err)
	}
	if fact.Authority != (Authority{}) {
		return fmt.Errorf("fact %s expands authority", fact.FactID)
	}
	canonicalValue, err := json.Marshal(fact.Value)
	if err != nil {
		return fmt.Errorf("fact %s value cannot be canonicalized", fact.FactID)
	}
	expectedID := "mfact_" + sha256Hex([]byte(strings.Join([]string{
		fact.SubjectReference,
		fact.FieldName,
		fact.ValueType,
		string(canonicalValue),
		fact.SourceContentSHA256,
		fact.EvidenceLocator,
		fact.ExtractorRevision,
	}, "\x00")))
	if expectedID != fact.FactID {
		return fmt.Errorf("fact %s identity hash mismatch", fact.FactID)
	}
	return nil
}

func validateFalseAuthority(metadata map[string]any) error {
	for _, field := range []string{
		"provider_write_authority",
		"journal_authority",
		"payment_authority",
		"tax_authority",
		"distribution_authority",
		"cutover_authority",
	} {
		value, ok := metadata[field]
		if !ok || value != false {
			return fmt.Errorf("%s must be exactly false", field)
		}
	}
	return nil
}

func factEffectiveAt(record verifiedRecord) string {
	for _, field := range []string{
		"postedAt",
		"scheduledSendDate",
		"endDate",
		"createdAt",
		"estimatedDeliveryDate",
	} {
		value, ok := record.ProviderPayload[field].(string)
		if !ok || strings.TrimSpace(value) == "" {
			continue
		}
		if normalized, err := normalizeTimestamp(value); err == nil {
			return normalized
		}
		if parsed, err := time.Parse("2006-01-02", value); err == nil {
			return parsed.UTC().Format(time.RFC3339Nano)
		}
	}
	if record.Record.Timestamp > 0 {
		return time.UnixMilli(record.Record.Timestamp).UTC().Format(time.RFC3339Nano)
	}
	return record.ObservedAt
}

func subjectClassForFamily(family string) string {
	switch family {
	case "account_snapshot":
		return "account"
	case "transaction_revision":
		return "transaction"
	case "recipient_revision":
		return "recipient"
	case "approval_request_revision":
		return "approval_request"
	case "payment_revision":
		return "payment"
	case "scheduled_payment_observation":
		return "scheduled_payment"
	case "statement_revision":
		return "statement"
	case "attachment_revision":
		return "attachment"
	default:
		return ""
	}
}

func topLevelValue(payload map[string]any, pointer string) (any, bool) {
	if !strings.HasPrefix(pointer, "/") || strings.Contains(strings.TrimPrefix(pointer, "/"), "/") {
		return nil, false
	}
	key := strings.ReplaceAll(strings.ReplaceAll(strings.TrimPrefix(pointer, "/"), "~1", "/"), "~0", "~")
	value, exists := payload[key]
	return value, exists
}

func moneyMinor(value any) (int64, error) {
	text := ""
	switch typed := value.(type) {
	case json.Number:
		text = typed.String()
	case float64:
		text = strconv.FormatFloat(typed, 'f', -1, 64)
	case string:
		text = strings.TrimSpace(typed)
	default:
		return 0, errors.New("money must be a JSON number or decimal string")
	}
	if text == "" {
		return 0, errors.New("money is empty")
	}
	negative := strings.HasPrefix(text, "-")
	if negative || strings.HasPrefix(text, "+") {
		text = text[1:]
	}
	parts := strings.Split(text, ".")
	if len(parts) > 2 || len(parts) == 0 || parts[0] == "" {
		return 0, errors.New("money is not a fixed decimal")
	}
	if !allDigits(parts[0]) {
		return 0, errors.New("money has invalid whole units")
	}
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	if len(fraction) > 2 || (fraction != "" && !allDigits(fraction)) {
		return 0, errors.New("money has more than two decimal places")
	}
	fraction += strings.Repeat("0", 2-len(fraction))
	whole, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || whole > (1<<63-1)/100 {
		return 0, errors.New("money is out of range")
	}
	cents, err := strconv.ParseInt(fraction, 10, 64)
	if err != nil {
		return 0, errors.New("money fraction is invalid")
	}
	minor := whole*100 + cents
	if negative {
		minor = -minor
	}
	return minor, nil
}

func integerValue(value any) (int64, error) {
	switch typed := value.(type) {
	case json.Number:
		return typed.Int64()
	case float64:
		if typed != float64(int64(typed)) {
			return 0, errors.New("value is not an integer")
		}
		return int64(typed), nil
	case int:
		return int64(typed), nil
	case int64:
		return typed, nil
	default:
		return 0, errors.New("value is not an integer")
	}
}

func optionalID(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case json.Number:
		return strings.TrimSpace(typed.String())
	default:
		return ""
	}
}

func normalizeTimestamp(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", errors.New("timestamp is empty")
	}
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return parsed.UTC().Format(time.RFC3339Nano), nil
	}
	if parsed, err := time.Parse("2006-01-02", value); err == nil {
		return parsed.UTC().Format(time.RFC3339Nano), nil
	}
	return "", errors.New("timestamp is not RFC3339 or YYYY-MM-DD")
}

func canonicalObject(raw []byte) ([]byte, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var object map[string]any
	if err := decoder.Decode(&object); err != nil {
		return nil, err
	}
	if len(object) == 0 {
		return nil, errors.New("object is empty")
	}
	return json.Marshal(object)
}

func currentPriorObservations(prior []Observation) map[string]*Observation {
	result := map[string]*Observation{}
	for index := range prior {
		observation := &prior[index]
		if observation.Contract != ObservationContract || observation.ObservationID == "" {
			continue
		}
		key := observationKey(observation.SubjectReference, observation.FieldName)
		current := result[key]
		if current == nil || observation.CreatedAt > current.CreatedAt ||
			(observation.CreatedAt == current.CreatedAt && observation.ObservationID > current.ObservationID) {
			result[key] = observation
		}
	}
	return result
}

func priorObservationID(prior *Observation) *string {
	if prior == nil || strings.TrimSpace(prior.ObservationID) == "" {
		return nil
	}
	value := prior.ObservationID
	return &value
}

func observationID(observation Observation) string {
	identity := struct {
		Subject       string   `json:"subject"`
		Field         string   `json:"field"`
		ValueType     string   `json:"value_type"`
		State         string   `json:"state"`
		Value         any      `json:"value"`
		Supporting    []string `json:"supporting"`
		Contradicting []string `json:"contradicting"`
		ApplicableAt  *string  `json:"applicable_at"`
		Reason        string   `json:"reason"`
		Revision      string   `json:"revision"`
	}{
		Subject:       observation.SubjectReference,
		Field:         observation.FieldName,
		ValueType:     observation.ValueType,
		State:         observation.ResolutionState,
		Value:         observation.Value,
		Supporting:    observation.SupportingFactIDs,
		Contradicting: observation.ContradictingFactIDs,
		ApplicableAt:  observation.ApplicableAt,
		Reason:        observation.ResolutionReason,
		Revision:      ResolverRevision,
	}
	encoded, _ := json.Marshal(identity)
	return "mobs_" + sha256Hex(encoded)
}

func observationKey(subject, field string) string {
	return subject + "\x00" + field
}

func canonicalValueKey(value any) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}

func maxFactObservedAt(facts []Fact) string {
	result := ""
	for _, fact := range facts {
		if fact.ObservedAt > result {
			result = fact.ObservedAt
		}
	}
	return result
}

func mergedFactIDs(groups ...[]string) []string {
	seen := map[string]struct{}{}
	for _, group := range groups {
		for _, factID := range group {
			factID = strings.TrimSpace(factID)
			if factID != "" {
				seen[factID] = struct{}{}
			}
		}
	}
	result := make([]string, 0, len(seen))
	for factID := range seen {
		result = append(result, factID)
	}
	sort.Strings(result)
	return result
}

func factContent(fact Fact) string {
	return fmt.Sprintf(
		"Mercury fact %s %s = %s",
		fact.SubjectReference,
		fact.FieldName,
		displayValue(fact.Value),
	)
}

func observationContent(observation Observation) string {
	if observation.ResolutionState != "resolved" {
		return fmt.Sprintf(
			"Mercury observation %s %s is unresolved: %s",
			observation.SubjectReference,
			observation.FieldName,
			observation.ResolutionReason,
		)
	}
	return fmt.Sprintf(
		"Mercury observation %s %s = %s",
		observation.SubjectReference,
		observation.FieldName,
		displayValue(observation.Value),
	)
}

func displayValue(value any) string {
	encoded, _ := json.Marshal(value)
	if len(encoded) > 160 {
		return string(encoded[:157]) + "..."
	}
	return string(encoded)
}

func metadataID(params map[string]any, key string) string {
	metadata, _ := params["metadata"].(map[string]any)
	return stringValue(metadata[key])
}

func stringValue(value any) string {
	text, _ := value.(string)
	return strings.TrimSpace(text)
}

func allDigits(value string) bool {
	if value == "" {
		return false
	}
	for _, char := range value {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}

func isSHA256(value string) bool {
	if len(value) != 64 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

func sha256Hex(value []byte) string {
	digest := sha256.Sum256(value)
	return hex.EncodeToString(digest[:])
}
