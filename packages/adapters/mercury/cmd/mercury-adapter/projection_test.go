package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestProjectionCreatesImmutableRevisionAndExactCaptureReceipt(t *testing.T) {
	body := `{
  "accounts": [
    {"id":"acct_1","createdAt":"2026-07-24T10:00:00Z","availableBalance":42.50}
  ],
  "page":{"nextPage":null}
}`
	response := projectionResponse("getAccounts", body)
	client := &mercuryClient{
		connectionID:  "mercury-primary",
		credentialRef: "mercury/moonsleep-production",
		role:          rolePrimaryRead,
	}
	capturedAt := time.Date(2026, 7, 24, 12, 0, 0, 0, time.UTC)
	records, err := projectMercuryResponse(
		client,
		mercuryProjectionSources["getAccounts"],
		response,
		capturedAt,
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 {
		t.Fatalf("records = %d, want revision + receipt", len(records))
	}

	revision := records[0]
	if revision.Operation != "record.ingest" ||
		revision.Routing.ContainerID != "account_snapshot" ||
		revision.Routing.ThreadID != "mercury:account_snapshot:acct_1" {
		t.Fatalf("revision routing = %#v", revision.Routing)
	}
	if revision.Payload.Timestamp != time.Date(2026, 7, 24, 10, 0, 0, 0, time.UTC).UnixMilli() {
		t.Fatalf("revision timestamp = %d", revision.Payload.Timestamp)
	}
	payload := revision.Payload.Payload
	if payload["contract"] != mercuryRecordContract ||
		payload["provider_object_id"] != "acct_1" ||
		payload["provider_write_authority"] != false ||
		payload["journal_authority"] != false ||
		payload["payment_authority"] != false {
		t.Fatalf("revision payload = %#v", payload)
	}
	canonical := payload["provider_payload_canonical_json"].(string)
	digest := sha256.Sum256([]byte(canonical))
	if payload["provider_payload_sha256"] != hex.EncodeToString(digest[:]) {
		t.Fatal("revision digest does not bind canonical provider object")
	}

	receipt := records[1]
	if receipt.Routing.ContainerID != "api_capture_receipt" {
		t.Fatalf("receipt routing = %#v", receipt.Routing)
	}
	receiptPayload := receipt.Payload.Payload
	if receiptPayload["provider_response_body"] != body ||
		receiptPayload["provider_response_sha256"] != response.Pages[0].BodySHA256 ||
		receiptPayload["provider_write_attempted"] != false {
		t.Fatalf("receipt payload = %#v", receiptPayload)
	}
}

func TestProjectionRevisionIdentityIsContentAddressed(t *testing.T) {
	client := &mercuryClient{
		connectionID:  "mercury-primary",
		credentialRef: "mercury/test",
		role:          rolePrimaryRead,
	}
	source := mercuryProjectionSources["getRecipients"]
	first := projectionResponse("getRecipients", `{"recipients":[{"id":"recipient_1","name":"Borden"}],"page":{"nextPage":null}}`)
	second := projectionResponse("getRecipients", `{"recipients":[{"name":"Borden","id":"recipient_1"}],"page":{"nextPage":null}}`)
	changed := projectionResponse("getRecipients", `{"recipients":[{"id":"recipient_1","name":"Borden Textile"}],"page":{"nextPage":null}}`)

	firstRecords, err := projectMercuryResponse(client, source, first, time.Unix(1, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	secondRecords, err := projectMercuryResponse(client, source, second, time.Unix(2, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	changedRecords, err := projectMercuryResponse(client, source, changed, time.Unix(3, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	if firstRecords[0].Payload.ExternalRecordID != secondRecords[0].Payload.ExternalRecordID {
		t.Fatal("object key order changed immutable revision identity")
	}
	if firstRecords[0].Payload.ExternalRecordID == changedRecords[0].Payload.ExternalRecordID {
		t.Fatal("changed provider content reused immutable revision identity")
	}
}

func TestTransactionCreatesPaymentAndAttachmentRevisions(t *testing.T) {
	body := `{"transactions":[{"id":"txn_1","requestId":"request_1","createdAt":"2026-07-24T09:00:00Z","attachments":[{"id":"attachment_1","filename":"invoice.pdf"}]}],"page":{"nextPage":null}}`
	records, err := projectMercuryResponse(
		&mercuryClient{connectionID: "primary", credentialRef: "mercury/test", role: rolePrimaryRead},
		mercuryProjectionSources["listTransactions"],
		projectionResponse("listTransactions", body),
		time.Date(2026, 7, 24, 12, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatal(err)
	}
	families := recordFamilies(records)
	for _, expected := range []string{
		"transaction_revision",
		"payment_revision",
		"attachment_revision",
		"api_capture_receipt",
	} {
		if families[expected] != 1 {
			t.Fatalf("families = %#v", families)
		}
	}
}

func TestApprovalCreatesScheduledPaymentObservationOnlyWhenScheduled(t *testing.T) {
	body := `{"requests":[{"requestId":"request_1","createdAt":"2026-07-24T09:00:00Z","scheduledSendDate":"2026-07-25"},{"requestId":"request_2","createdAt":"2026-07-24T10:00:00Z","scheduledSendDate":null}],"page":{"nextPage":null}}`
	records, err := projectMercuryResponse(
		&mercuryClient{connectionID: "primary", credentialRef: "mercury/test", role: rolePrimaryRead},
		mercuryProjectionSources["listSendMoneyApprovalRequests"],
		projectionResponse("listSendMoneyApprovalRequests", body),
		time.Date(2026, 7, 24, 12, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatal(err)
	}
	families := recordFamilies(records)
	if families["approval_request_revision"] != 2 ||
		families["scheduled_payment_observation"] != 1 ||
		families["api_capture_receipt"] != 1 {
		t.Fatalf("families = %#v", families)
	}
}

func TestProjectionRejectsTamperAndMissingIdentity(t *testing.T) {
	client := &mercuryClient{connectionID: "primary", credentialRef: "mercury/test", role: rolePrimaryRead}
	tampered := projectionResponse("getAccounts", `{"accounts":[],"page":{"nextPage":null}}`)
	tampered.Pages[0].BodySHA256 = strings.Repeat("0", 64)
	if _, err := projectMercuryResponse(
		client,
		mercuryProjectionSources["getAccounts"],
		tampered,
		time.Now().UTC(),
	); err == nil || !strings.Contains(err.Error(), "digest mismatch") {
		t.Fatalf("tamper error = %v", err)
	}

	missingID := projectionResponse("getAccounts", `{"accounts":[{"name":"checking"}],"page":{"nextPage":null}}`)
	if _, err := projectMercuryResponse(
		client,
		mercuryProjectionSources["getAccounts"],
		missingID,
		time.Now().UTC(),
	); err == nil || !strings.Contains(err.Error(), "omitted id") {
		t.Fatalf("missing identity error = %v", err)
	}
}

func TestProjectionRejectsInconsistentCaptureEnvelope(t *testing.T) {
	client := &mercuryClient{connectionID: "primary", credentialRef: "mercury/test", role: rolePrimaryRead}
	source := mercuryProjectionSources["getAccounts"]
	body := `{"accounts":[],"page":{"nextPage":null}}`
	tests := []struct {
		name   string
		mutate func(*mercuryMethodResponse)
		match  string
	}{
		{
			name: "role",
			mutate: func(response *mercuryMethodResponse) {
				response.ConnectionRole = string(roleAPRequest)
			},
			match: "connection-role mismatch",
		},
		{
			name: "incomplete",
			mutate: func(response *mercuryMethodResponse) {
				response.Complete = false
			},
			match: "incomplete provider capture",
		},
		{
			name: "page inventory",
			mutate: func(response *mercuryMethodResponse) {
				response.PageCount = 2
			},
			match: "page inventory",
		},
		{
			name: "status",
			mutate: func(response *mercuryMethodResponse) {
				response.Pages[0].HTTPStatus = http.StatusPartialContent
			},
			match: "not HTTP 200",
		},
		{
			name: "content type",
			mutate: func(response *mercuryMethodResponse) {
				response.Pages[0].ContentType = "text/plain"
			},
			match: "not JSON",
		},
		{
			name: "attempt count",
			mutate: func(response *mercuryMethodResponse) {
				response.Pages[0].RequestAttempts = 0
			},
			match: "invalid attempt count",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := projectionResponse("getAccounts", body)
			test.mutate(response)
			if _, err := projectMercuryResponse(client, source, response, time.Now().UTC()); err == nil || !strings.Contains(err.Error(), test.match) {
				t.Fatalf("error = %v", err)
			}
		})
	}
}

func TestPrimaryProjectionFetchesAllCanonicalReadFamilies(t *testing.T) {
	var lock sync.Mutex
	seen := map[string]int{}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			t.Fatalf("method = %s", request.Method)
		}
		lock.Lock()
		seen[request.URL.Path]++
		lock.Unlock()
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/accounts":
			_, _ = writer.Write([]byte(`{"accounts":[{"id":"acct_1","createdAt":"2026-07-20T00:00:00Z"}],"page":{"nextPage":null}}`))
		case "/transactions":
			if request.URL.Query().Get("start") != "2026-07-21T00:00:00Z" {
				t.Fatalf("transaction start = %q", request.URL.Query().Get("start"))
			}
			_, _ = writer.Write([]byte(`{"transactions":[{"id":"txn_1","createdAt":"2026-07-22T00:00:00Z"}],"page":{"nextPage":null}}`))
		case "/recipients":
			_, _ = writer.Write([]byte(`{"recipients":[{"id":"recipient_1","name":"LA Pillow"}],"page":{"nextPage":null}}`))
		case "/request-send-money":
			_, _ = writer.Write([]byte(`{"requests":[{"requestId":"request_1","createdAt":"2026-07-22T01:00:00Z"}],"page":{"nextPage":null}}`))
		case "/account/acct_1/statements":
			if request.URL.Query().Get("start") != "2026-07-21" {
				t.Fatalf("statement start = %q", request.URL.Query().Get("start"))
			}
			_, _ = writer.Write([]byte(`{"statements":[{"id":"statement_1","endDate":"2026-07-22T00:00:00Z"}],"page":{"nextPage":null}}`))
		default:
			t.Fatalf("unexpected path %s", request.URL.Path)
		}
	}))
	defer server.Close()

	records, cursor, err := fetchMercuryProjection(
		context.Background(),
		testMercuryClient(server, rolePrimaryRead),
		time.Date(2026, 7, 21, 0, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatal(err)
	}
	if cursor.IsZero() {
		t.Fatal("projection cursor did not advance")
	}
	for _, path := range []string{
		"/accounts",
		"/transactions",
		"/recipients",
		"/request-send-money",
		"/account/acct_1/statements",
	} {
		if seen[path] != 1 {
			t.Fatalf("seen = %#v", seen)
		}
	}
	if len(records) != 10 {
		t.Fatalf("records = %d, want five revisions and five receipts", len(records))
	}
}

func TestAPProjectionCannotEscapeAPReadFamilies(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		paths = append(paths, request.URL.Path)
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/recipients":
			_, _ = writer.Write([]byte(`{"recipients":[],"page":{"nextPage":null}}`))
		case "/request-send-money":
			_, _ = writer.Write([]byte(`{"requests":[],"page":{"nextPage":null}}`))
		default:
			t.Fatalf("AP projection escaped to %s", request.URL.Path)
		}
	}))
	defer server.Close()
	records, _, err := fetchMercuryProjection(
		context.Background(),
		testMercuryClient(server, roleAPRequest),
		time.Date(2026, 7, 21, 0, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(paths) != 2 || len(records) != 2 {
		t.Fatalf("paths=%v records=%d", paths, len(records))
	}
	for _, record := range records {
		if record.Routing.ContainerID != "api_capture_receipt" {
			t.Fatalf("unexpected AP record family %s", record.Routing.ContainerID)
		}
	}
}

func TestBackfillEmitsProjectionRecords(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/recipients":
			_, _ = writer.Write([]byte(`{"recipients":[],"page":{"nextPage":null}}`))
		case "/request-send-money":
			_, _ = writer.Write([]byte(`{"requests":[],"page":{"nextPage":null}}`))
		default:
			t.Fatalf("unexpected path %s", request.URL.Path)
		}
	}))
	defer server.Close()
	emitted := []nexadapter.AdapterInboundRecord{}
	err := mercuryBackfill(
		nexadapter.AdapterContext[*mercuryClient]{
			Context:      context.Background(),
			ConnectionID: "ap",
			Client:       testMercuryClient(server, roleAPRequest),
		},
		time.Date(2026, 7, 21, 0, 0, 0, 0, time.UTC),
		func(record any) {
			emitted = append(emitted, record.(nexadapter.AdapterInboundRecord))
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(emitted) != 2 {
		t.Fatalf("emitted = %d, want two capture receipts", len(emitted))
	}
}

func TestExecutableBackfillEmitsJSONLThroughRuntimeContext(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/accounts":
			_, _ = writer.Write([]byte(`{"accounts":[{"id":"acct_1","createdAt":"2026-07-20T00:00:00Z"}],"page":{"nextPage":null}}`))
		case "/transactions":
			_, _ = writer.Write([]byte(`{"transactions":[{"id":"txn_1","createdAt":"2026-07-22T00:00:00Z"}],"page":{"nextPage":null}}`))
		case "/recipients":
			_, _ = writer.Write([]byte(`{"recipients":[{"id":"recipient_1","name":"Borden"}],"page":{"nextPage":null}}`))
		case "/request-send-money":
			_, _ = writer.Write([]byte(`{"requests":[{"requestId":"request_1","createdAt":"2026-07-22T01:00:00Z"}],"page":{"nextPage":null}}`))
		case "/account/acct_1/statements":
			_, _ = writer.Write([]byte(`{"statements":[{"id":"statement_1","endDate":"2026-07-22T00:00:00Z"}],"page":{"nextPage":null}}`))
		default:
			t.Fatalf("unexpected path %s", request.URL.Path)
		}
	}))
	defer server.Close()

	runtimeContext := map[string]any{
		"version":       1,
		"platform":      platformID,
		"connection_id": "primary",
		"config": map[string]any{
			"connection_role": string(rolePrimaryRead),
			"base_url":        server.URL,
		},
		"credential": map[string]any{
			"value":   "test-token-value",
			"ref":     "mercury/test",
			"service": "mercury",
			"account": "test",
		},
	}
	runtimeRaw, err := json.Marshal(runtimeContext)
	if err != nil {
		t.Fatal(err)
	}
	contextPath := filepath.Join(t.TempDir(), "runtime-context.json")
	if err := os.WriteFile(contextPath, runtimeRaw, 0o600); err != nil {
		t.Fatal(err)
	}

	command := exec.Command("go", "run", ".", "records.backfill", "--connection", "primary", "--since", "2026-07-21")
	command.Env = append(
		os.Environ(),
		"NEXUS_ADAPTER_CONTEXT_PATH="+contextPath,
		"NEXUS_ADAPTER_TEST_MODE=1",
	)
	var stderr bytes.Buffer
	command.Stderr = &stderr
	output, err := command.Output()
	if err != nil {
		t.Fatalf("executable backfill: %v\n%s", err, stderr.String())
	}
	scanner := bufio.NewScanner(bytes.NewReader(output))
	count := 0
	for scanner.Scan() {
		var record nexadapter.AdapterInboundRecord
		if err := json.Unmarshal(scanner.Bytes(), &record); err != nil {
			t.Fatalf("decode record %d: %v", count+1, err)
		}
		if record.Operation != "record.ingest" {
			t.Fatalf("operation = %q", record.Operation)
		}
		count++
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	if count != 10 {
		t.Fatalf("record count = %d, want 10", count)
	}
}

func projectionResponse(operationID string, body string) *mercuryMethodResponse {
	digest := sha256.Sum256([]byte(body))
	return &mercuryMethodResponse{
		ProviderOperationID: operationID,
		ConnectionRole:      string(rolePrimaryRead),
		Pages: []mercuryMethodPage{
			{
				HTTPStatus:      http.StatusOK,
				ContentType:     "application/json",
				BodyEncoding:    "utf8_json",
				Body:            body,
				BodySHA256:      hex.EncodeToString(digest[:]),
				RequestAttempts: 1,
			},
		},
		PageCount:              1,
		Complete:               true,
		ProviderCalls:          1,
		ProviderWriteAttempted: false,
	}
}

func recordFamilies(records []nexadapter.AdapterInboundRecord) map[string]int {
	result := map[string]int{}
	for _, record := range records {
		result[record.Routing.ContainerID]++
	}
	return result
}

func TestProjectionRecordsContainNoExpandedAuthority(t *testing.T) {
	body := `{"accounts":[{"id":"acct_1"}],"page":{"nextPage":null}}`
	records, err := projectMercuryResponse(
		&mercuryClient{connectionID: "primary", credentialRef: "mercury/test", role: rolePrimaryRead},
		mercuryProjectionSources["getAccounts"],
		projectionResponse("getAccounts", body),
		time.Now().UTC(),
	)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(records)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{
		`"provider_write_authority":true`,
		`"journal_authority":true`,
		`"payment_authority":true`,
		`"tax_authority":true`,
		`"distribution_authority":true`,
		`"cutover_authority":true`,
	} {
		if strings.Contains(string(raw), forbidden) {
			t.Fatalf("expanded authority %s", forbidden)
		}
	}
}
