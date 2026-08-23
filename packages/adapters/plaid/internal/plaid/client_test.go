package plaid

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

var fixedNow = time.Date(2026, 7, 17, 17, 0, 0, 123000000, time.UTC)

func TestReadOnlySourceMethodsPreserveRawAndExactMoney(t *testing.T) {
	t.Parallel()
	fixtures := map[string]string{
		"/item/get":               "item_get.json",
		"/accounts/get":           "accounts_get.json",
		"/accounts/balance/get":   "balance_get.json",
		"/liabilities/get":        "liabilities_get.json",
		"/institutions/get_by_id": "institution_get.json",
	}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		fixture, ok := fixtures[request.URL.Path]
		if !ok {
			http.Error(writer, "unexpected endpoint", http.StatusNotFound)
			return
		}
		assertSyntheticCredentialRequest(t, request, request.URL.Path != "/institutions/get_by_id")
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write(loadFixture(t, fixture))
	}))
	defer server.Close()

	client := newSyntheticClient(t, server.URL)
	ctx := context.Background()
	item, err := client.GetItem(ctx)
	if err != nil {
		t.Fatalf("get item: %v", err)
	}
	if item.Item.ProviderItemID != "item-synthetic-001" || item.Item.LastSuccessfulUpdate != "2026-07-17T16:30:00Z" {
		t.Fatalf("unexpected item: %+v", item.Item)
	}
	if item.Evidence.PayloadSHA256 == "" || len(item.Raw) == 0 {
		t.Fatal("item evidence must preserve payload hash and raw provider response")
	}
	var itemRoundTrip ItemResult
	if err := json.Unmarshal(mustJSON(t, item), &itemRoundTrip); err != nil {
		t.Fatal(err)
	}
	assertEvidencePayload(t, itemRoundTrip.Evidence)

	accounts, err := client.GetAccounts(ctx)
	if err != nil {
		t.Fatalf("get accounts: %v", err)
	}
	if len(accounts.Accounts) != 2 {
		t.Fatalf("accounts count = %d", len(accounts.Accounts))
	}
	current := accounts.Accounts[0].Current
	if current == nil || current.Decimal != "67578.06" || current.MinorUnits != "6757806" || !current.MinorUnitsExact {
		t.Fatalf("unexpected exact current balance: %+v", current)
	}

	balance, err := client.GetBalance(ctx, []string{"account-amex-synthetic"})
	if err != nil {
		t.Fatalf("get balance: %v", err)
	}
	if balance.Accounts[0].Current.MinorUnits != "7000010" {
		t.Fatalf("0.1 decimal conversion lost precision: %+v", balance.Accounts[0].Current)
	}
	if balance.Accounts[0].Limit.MinorUnitsExact || balance.Accounts[0].Limit.MinorUnits != "" {
		t.Fatalf("non-cent limit must stay decimal-only: %+v", balance.Accounts[0].Limit)
	}

	liabilities, err := client.GetLiabilities(ctx, nil)
	if err != nil {
		t.Fatalf("get liabilities: %v", err)
	}
	if len(liabilities.Credit) != 1 || liabilities.Credit[0].LastStatementBalance.MinorUnits != "6757806" {
		t.Fatalf("unexpected liabilities: %+v", liabilities.Credit)
	}
	if len(liabilities.Credit[0].APRs) != 1 ||
		liabilities.Credit[0].APRs[0].APRPercentageDecimal != "24.99" ||
		liabilities.Credit[0].APRs[0].BalanceSubjectToAPR.MinorUnits != "6757806" ||
		liabilities.Credit[0].APRs[0].InterestChargeAmount.MinorUnits != "0" {
		t.Fatalf("APR money was not normalized exactly: %+v", liabilities.Credit[0].APRs)
	}

	coverage, err := client.ProbeInstitutionCoverage(ctx, InstitutionCoverageRequest{
		InstitutionIDs:    []string{"ins_synthetic_card"},
		CountryCodes:      []string{"US"},
		RequestedProducts: []string{"transactions", "liabilities"},
	})
	if err != nil {
		t.Fatalf("institution coverage: %v", err)
	}
	if len(coverage.Institutions) != 1 || !coverage.Institutions[0].CoverageConfirmed || len(coverage.Institutions[0].MissingRequestedProducts) != 0 {
		t.Fatalf("unexpected institution coverage: %+v", coverage)
	}
}

func TestTransactionSyncRestartsFromOriginalCursorAndBuildsChanges(t *testing.T) {
	t.Parallel()
	responses := []struct {
		status  int
		fixture string
	}{
		{status: http.StatusOK, fixture: "transactions_sync_attempt1_page1.json"},
		{status: http.StatusBadRequest, fixture: "transactions_sync_mutation_error.json"},
		{status: http.StatusOK, fixture: "transactions_sync_restart_page1.json"},
		{status: http.StatusOK, fixture: "transactions_sync_restart_page2.json"},
	}
	var mutex sync.Mutex
	requestCursors := []string{}
	requestIndex := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/transactions/sync" {
			http.Error(writer, "unexpected endpoint", http.StatusNotFound)
			return
		}
		var body map[string]any
		decoder := json.NewDecoder(request.Body)
		decoder.UseNumber()
		if err := decoder.Decode(&body); err != nil {
			t.Errorf("decode request: %v", err)
		}
		if body["client_id"] != "synthetic-client" || body["secret"] != "synthetic-secret" || body["access_token"] != "synthetic-item-token" {
			t.Errorf("unexpected credential routing")
		}
		cursor, _ := body["cursor"].(string)
		mutex.Lock()
		requestCursors = append(requestCursors, cursor)
		if requestIndex >= len(responses) {
			mutex.Unlock()
			http.Error(writer, "too many requests", http.StatusInternalServerError)
			return
		}
		response := responses[requestIndex]
		requestIndex++
		mutex.Unlock()
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(response.status)
		_, _ = writer.Write(loadFixture(t, response.fixture))
	}))
	defer server.Close()

	client := newSyntheticClient(t, server.URL)
	result, err := client.SyncTransactions(context.Background(), SyncOptions{
		Cursor:      "cursor-original",
		Count:       2,
		MaxPages:    10,
		MaxRestarts: 2,
	})
	if err != nil {
		t.Fatalf("sync transactions: %v", err)
	}
	if !reflect.DeepEqual(requestCursors, []string{"cursor-original", "cursor-attempt-1", "cursor-original", "cursor-restart-1"}) {
		t.Fatalf("request cursors = %#v", requestCursors)
	}
	if result.CompletionState != "complete" || !result.CursorCommitAllowed || result.TerminalError != nil {
		t.Fatalf("successful sync did not expose a committable complete state: %+v", result)
	}
	if result.NextCursor != "cursor-final" || result.Pages != 2 || result.Restarts != 1 {
		t.Fatalf("unexpected sync completion: cursor=%q pages=%d restarts=%d", result.NextCursor, result.Pages, result.Restarts)
	}
	if len(result.Added) != 1 || result.Added[0].ProviderTransactionID != "posted-transaction-001" {
		t.Fatalf("stale first-attempt transactions leaked into result: %+v", result.Added)
	}
	if len(result.Modified) != 1 || result.Modified[0].Amount.MinorUnits != "10" {
		t.Fatalf("unexpected modified transactions: %+v", result.Modified)
	}
	if len(result.Removed) != 2 || len(result.Changes) != 4 {
		t.Fatalf("unexpected removal/change counts: removed=%d changes=%d", len(result.Removed), len(result.Changes))
	}

	var postedChange *TransactionChange
	var pendingRemoval *TransactionChange
	for index := range result.Changes {
		change := &result.Changes[index]
		if change.ProviderTransactionID == "posted-transaction-001" {
			postedChange = change
		}
		if change.ProviderTransactionID == "pending-transaction-001" && change.ChangeAction == "removed" {
			pendingRemoval = change
		}
	}
	if postedChange == nil || postedChange.SupersedesProviderTransactionID != "pending-transaction-001" || postedChange.Amount.MinorUnits != "39615" {
		t.Fatalf("posted change does not bind pending predecessor: %+v", postedChange)
	}
	if pendingRemoval == nil {
		t.Fatal("pending removal change is missing")
	}
	if len(result.RestartEvidence) != 1 || len(result.RestartEvidence[0].DiscardedRawPages) != 1 || result.RestartEvidence[0].ErrorPayloadSHA256 == "" {
		t.Fatalf("restart evidence did not preserve discarded provider evidence: %+v", result.RestartEvidence)
	}
	var resultRoundTrip TransactionSyncResult
	if err := json.Unmarshal(mustJSON(t, result), &resultRoundTrip); err != nil {
		t.Fatal(err)
	}
	for _, evidence := range resultRoundTrip.PageEvidence {
		assertEvidencePayload(t, evidence)
	}
	for _, evidence := range resultRoundTrip.RestartEvidence[0].DiscardedPageEvidence {
		assertEvidencePayload(t, evidence)
	}
	assertEvidencePayload(t, resultRoundTrip.RestartEvidence[0].ErrorEvidence)
	if bytes.Contains(mustJSON(t, result), []byte("stale-attempt-transaction\",\"provider_account_id")) {
		t.Fatal("stale attempt appeared in authoritative normalized result")
	}
}

func TestChangeIdentityIsStableAcrossObservationTimes(t *testing.T) {
	t.Parallel()
	raw := json.RawMessage(`{"transaction_id":"posted-stable","account_id":"account-1","pending":false,"amount":12.34,"iso_currency_code":"USD"}`)
	transactions, err := normalizeTransactions([]json.RawMessage{raw})
	if err != nil {
		t.Fatal(err)
	}
	first, err := buildTransactionChanges(func() time.Time { return fixedNow }, transactions, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	second, err := buildTransactionChanges(func() time.Time { return fixedNow.Add(time.Hour) }, transactions, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if first[0].ProviderEventID != second[0].ProviderEventID || first[0].SourcePayloadSHA256 != second[0].SourcePayloadSHA256 {
		t.Fatalf("change identity changed with observation time: %#v %#v", first[0], second[0])
	}
	if first[0].ObservedAt == second[0].ObservedAt {
		t.Fatal("observation timestamp should remain independent of stable change identity")
	}
	canonical, err := canonicalJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if first[0].SourcePayloadSHA256 != payloadDigest(canonical) {
		t.Fatalf("source payload hash is not independently verifiable: %+v", first[0])
	}
	if first[0].ChangeIdentitySHA256 != changeIdentityDigest("added", canonical) || first[0].ChangeIdentitySHA256 == first[0].SourcePayloadSHA256 {
		t.Fatalf("change identity must be action-bound and separate from payload hash: %+v", first[0])
	}
}

func TestTransactionSyncReturnsObservableTerminalEvidenceWithoutRestart(t *testing.T) {
	t.Parallel()
	var requestCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		count := requestCount.Add(1)
		writer.Header().Set("Content-Type", "application/json")
		if count == 1 {
			_, _ = writer.Write(loadFixture(t, "transactions_sync_attempt1_page1.json"))
			return
		}
		writer.WriteHeader(http.StatusBadRequest)
		_, _ = writer.Write(loadFixture(t, "transactions_sync_mutation_error.json"))
	}))
	defer server.Close()
	client := newSyntheticClient(t, server.URL)
	result, err := client.SyncTransactions(context.Background(), SyncOptions{
		Cursor:      "cursor-original",
		Count:       2,
		MaxPages:    10,
		MaxRestarts: 0,
	})
	if err != nil {
		t.Fatalf("fetched provider failure must be returned as observable method payload: %v", err)
	}
	if requestCount.Load() != 2 {
		t.Fatalf("request count = %d, expected no restart after mutation", requestCount.Load())
	}
	if len(result.RestartEvidence) != 1 || len(result.RestartEvidence[0].DiscardedRawPages) != 1 {
		t.Fatalf("terminal retry failure dropped audit evidence: %+v", result)
	}
	if result.CompletionState != "terminal_error" || result.CursorCommitAllowed || result.NextCursor != "cursor-original" {
		t.Fatalf("terminal retry failure advanced or authorized cursor: %+v", result)
	}
	if result.TerminalError == nil || result.TerminalError.ErrorCode != "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" || result.TerminalError.Evidence == nil {
		t.Fatalf("terminal provider error was not exposed: %+v", result.TerminalError)
	}
	if len(result.Added) != 0 || len(result.Modified) != 0 || len(result.Removed) != 0 || len(result.Changes) != 0 {
		t.Fatalf("partial normalized rows leaked from terminal sync: %+v", result)
	}
	var roundTrip TransactionSyncResult
	if err := json.Unmarshal(mustJSON(t, result), &roundTrip); err != nil {
		t.Fatal(err)
	}
	assertEvidencePayload(t, *roundTrip.TerminalError.Evidence)
	assertEvidencePayload(t, roundTrip.RestartEvidence[0].ErrorEvidence)
}

func TestTransactionSyncCapturesMalformedFetchedPageBeforeNormalization(t *testing.T) {
	t.Parallel()
	body := []byte(" {\n  \"added\": [{\"transaction_id\":\"missing-account\",\"amount\":1.00,\"iso_currency_code\":\"USD\"}],\n  \"modified\": [], \"removed\": [], \"next_cursor\": \"cursor-should-not-commit\", \"has_more\": false, \"request_id\": \"malformed-page\"\n}\n")
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write(body)
	}))
	defer server.Close()
	client := newSyntheticClient(t, server.URL)
	result, err := client.SyncTransactions(context.Background(), SyncOptions{Cursor: "cursor-original", Count: 10, MaxPages: 3})
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletionState != "terminal_error" || result.CursorCommitAllowed || result.NextCursor != "cursor-original" {
		t.Fatalf("malformed page was not fail-closed: %+v", result)
	}
	if result.TerminalError == nil || result.TerminalError.Stage != "normalize_added" || result.Pages != 1 || len(result.RawPages) != 1 || len(result.PageEvidence) != 1 {
		t.Fatalf("malformed page evidence was not retained: %+v", result)
	}
	if len(result.Added) != 0 || len(result.Changes) != 0 {
		t.Fatalf("malformed page produced authoritative rows: %+v", result)
	}
	var roundTrip TransactionSyncResult
	if err := json.Unmarshal(mustJSON(t, result), &roundTrip); err != nil {
		t.Fatal(err)
	}
	if got := assertEvidencePayload(t, roundTrip.PageEvidence[0]); !bytes.Equal(got, body) {
		t.Fatalf("exact provider bytes changed across method boundary\ngot:  %q\nwant: %q", got, body)
	}
}

func TestTransactionSyncRejectsTerminalPageWithoutNextCursor(t *testing.T) {
	t.Parallel()
	body := []byte(`{"added":[],"modified":[],"removed":[],"next_cursor":"","has_more":false,"request_id":"missing-cursor"}`)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write(body)
	}))
	defer server.Close()
	client := newSyntheticClient(t, server.URL)
	result, err := client.SyncTransactions(context.Background(), SyncOptions{Cursor: "cursor-original", Count: 10, MaxPages: 3})
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletionState != "terminal_error" || result.CursorCommitAllowed || result.NextCursor != "cursor-original" || result.TerminalError == nil || result.TerminalError.Stage != "cursor_validation" {
		t.Fatalf("empty terminal cursor was accepted or reset state: %+v", result)
	}
}

func TestTransactionSyncExposesUndecodableProviderResponse(t *testing.T) {
	t.Parallel()
	body := []byte(" {this-is-not-json}\n")
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write(body)
	}))
	defer server.Close()
	client := newSyntheticClient(t, server.URL)
	result, err := client.SyncTransactions(context.Background(), SyncOptions{Cursor: "cursor-original", Count: 10, MaxPages: 3})
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletionState != "terminal_error" || result.CursorCommitAllowed || result.NextCursor != "cursor-original" || result.TerminalError == nil || result.TerminalError.Stage != "provider_response" || result.TerminalError.Evidence == nil {
		t.Fatalf("undecodable provider response was not observable and fail-closed: %+v", result)
	}
	var roundTrip TransactionSyncResult
	if err := json.Unmarshal(mustJSON(t, result), &roundTrip); err != nil {
		t.Fatalf("terminal payload could not cross method JSON boundary: %v", err)
	}
	if got := assertEvidencePayload(t, *roundTrip.TerminalError.Evidence); !bytes.Equal(got, body) {
		t.Fatal("undecodable provider response bytes changed across method boundary")
	}
}

func TestTransactionSyncRejectsValidPrefixWithTrailingGarbage(t *testing.T) {
	t.Parallel()
	body := []byte(`{"added":[],"modified":[],"removed":[],"next_cursor":"must-not-commit","has_more":false,"request_id":"trailing"} trailing`)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write(body)
	}))
	defer server.Close()
	client := newSyntheticClient(t, server.URL)
	result, err := client.SyncTransactions(context.Background(), SyncOptions{Cursor: "cursor-original", Count: 10, MaxPages: 3})
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletionState != "terminal_error" || result.CursorCommitAllowed || result.NextCursor != "cursor-original" || result.TerminalError == nil || result.TerminalError.Stage != "provider_response" || result.TerminalError.Evidence == nil {
		t.Fatalf("trailing provider garbage was not observable and fail-closed: %+v", result)
	}
	var roundTrip TransactionSyncResult
	if err := json.Unmarshal(mustJSON(t, result), &roundTrip); err != nil {
		t.Fatalf("terminal payload could not cross method JSON boundary: %v", err)
	}
	if got := assertEvidencePayload(t, *roundTrip.TerminalError.Evidence); !bytes.Equal(got, body) {
		t.Fatal("trailing-garbage response bytes changed across method boundary")
	}
}

func TestHTTPRedirectsAreNeverFollowedWithCredentials(t *testing.T) {
	t.Parallel()
	var forwarded atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		forwarded.Add(1)
		_, _ = io.Copy(io.Discard, request.Body)
		writer.WriteHeader(http.StatusOK)
	}))
	defer target.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Location", target.URL+"/credential-capture")
		writer.WriteHeader(http.StatusTemporaryRedirect)
		_, _ = writer.Write([]byte(`{"error_code":"REDIRECT_REJECTED"}`))
	}))
	defer redirect.Close()

	client, err := NewClient(Config{
		BaseURL: redirect.URL, Environment: "synthetic", ClientID: "synthetic-client", Secret: "synthetic-secret", AccessToken: "synthetic-item-token",
		HTTPClient: &http.Client{CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return nil }},
		Now:        func() time.Time { return fixedNow },
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.GetItem(context.Background())
	apiError, ok := IsAPIError(err)
	if !ok || apiError.StatusCode != http.StatusTemporaryRedirect {
		t.Fatalf("redirect did not fail closed as provider error: %#v", err)
	}
	if forwarded.Load() != 0 {
		t.Fatalf("credential-bearing request was forwarded %d times", forwarded.Load())
	}
}

func TestProviderErrorCannotOverwriteComputedEvidenceOrRawBody(t *testing.T) {
	t.Parallel()
	body := []byte(" {\n \"error_type\":\"INVALID_REQUEST\",\"error_code\":\"SYNTHETIC\",\"error_message\":\"nope\",\"request_id\":\"provider-request\",\"raw\":{\"forged\":true},\"evidence\":{\"payload_sha256\":\"forged\"}\n}\n")
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusBadRequest)
		_, _ = writer.Write(body)
	}))
	defer server.Close()
	client := newSyntheticClient(t, server.URL)
	_, err := client.GetItem(context.Background())
	apiError, ok := IsAPIError(err)
	if !ok {
		t.Fatalf("expected API error, got %v", err)
	}
	if !bytes.Equal(apiError.Raw, body) || apiError.Evidence.PayloadSHA256 == "forged" {
		t.Fatalf("provider JSON overwrote computed evidence: %+v", apiError)
	}
	var roundTrip APIError
	if err := json.Unmarshal(mustJSON(t, apiError), &roundTrip); err != nil {
		t.Fatal(err)
	}
	if got := assertEvidencePayload(t, roundTrip.Evidence); !bytes.Equal(got, body) {
		t.Fatalf("error evidence did not preserve exact response bytes")
	}
}

func TestRequestCollectionAndQueryCapsFailBeforeProviderCall(t *testing.T) {
	t.Parallel()
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		http.Error(writer, "must not be called", http.StatusInternalServerError)
	}))
	defer server.Close()
	client := newSyntheticClient(t, server.URL)
	values := make([]string, maxRequestCollectionSize+1)
	for index := range values {
		values[index] = fmt.Sprintf("value-%d", index)
	}
	tests := []struct {
		name string
		call func() error
	}{
		{name: "institution ids", call: func() error {
			_, err := client.ProbeInstitutionCoverage(context.Background(), InstitutionCoverageRequest{InstitutionIDs: values})
			return err
		}},
		{name: "country codes", call: func() error {
			_, err := client.ProbeInstitutionCoverage(context.Background(), InstitutionCoverageRequest{Query: "bank", CountryCodes: values})
			return err
		}},
		{name: "requested products", call: func() error {
			_, err := client.ProbeInstitutionCoverage(context.Background(), InstitutionCoverageRequest{Query: "bank", RequestedProducts: values})
			return err
		}},
		{name: "provider account balance ids", call: func() error { _, err := client.GetBalance(context.Background(), values); return err }},
		{name: "provider account liability ids", call: func() error { _, err := client.GetLiabilities(context.Background(), values); return err }},
		{name: "query", call: func() error {
			_, err := client.ProbeInstitutionCoverage(context.Background(), InstitutionCoverageRequest{Query: strings.Repeat("x", maxInstitutionQueryRunes+1)})
			return err
		}},
		{name: "institution search count", call: func() error {
			_, err := client.ProbeInstitutionCoverage(context.Background(), InstitutionCoverageRequest{Query: "bank", Count: maxInstitutionSearchCount + 1})
			return err
		}},
		{name: "transaction count", call: func() error {
			_, err := client.SyncTransactions(context.Background(), SyncOptions{Count: 501})
			return err
		}},
	}
	for _, test := range tests {
		if err := test.call(); err == nil {
			t.Fatalf("%s cap was not enforced", test.name)
		}
	}
	if calls.Load() != 0 {
		t.Fatalf("provider called %d times for rejected request", calls.Load())
	}
}

func TestProviderIdentifiersFailClosed(t *testing.T) {
	t.Parallel()
	for name, accounts := range map[string][]providerAccount{
		"empty":     {{AccountID: ""}},
		"duplicate": {{AccountID: "account-1"}, {AccountID: "account-1"}},
	} {
		if _, err := normalizeAccounts(accounts); err == nil {
			t.Fatalf("%s account ids were accepted", name)
		}
	}

	itemServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = writer.Write([]byte(`{"item":{"item_id":""},"request_id":"empty-item"}`))
	}))
	defer itemServer.Close()
	if _, err := newSyntheticClient(t, itemServer.URL).GetItem(context.Background()); err == nil {
		t.Fatal("empty Item id was accepted")
	}

	liabilityServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = writer.Write([]byte(`{"accounts":[{"account_id":"account-present","balances":{"iso_currency_code":"USD"}}],"liabilities":{"credit":[{"account_id":"account-absent"}]},"request_id":"missing-map"}`))
	}))
	defer liabilityServer.Close()
	if _, err := newSyntheticClient(t, liabilityServer.URL).GetLiabilities(context.Background(), nil); err == nil {
		t.Fatal("liability absent from account currency map was accepted")
	}
}

func TestMalformedTransactionFailsClosed(t *testing.T) {
	t.Parallel()
	for _, raw := range []json.RawMessage{
		json.RawMessage(`{"transaction_id":"missing-account","amount":1.00,"iso_currency_code":"USD"}`),
		json.RawMessage(`{"transaction_id":"missing-amount","account_id":"account-1","iso_currency_code":"USD"}`),
	} {
		if _, err := normalizeTransactions([]json.RawMessage{raw}); err == nil {
			t.Fatalf("malformed transaction was accepted: %s", raw)
		}
	}
}

func TestHealthUsesProviderFreshnessNotFetchTime(t *testing.T) {
	t.Parallel()
	var requested []string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requested = append(requested, request.URL.Path)
		var fixture string
		switch request.URL.Path {
		case "/item/get":
			fixture = "item_get.json"
		default:
			http.Error(writer, "unexpected endpoint", http.StatusNotFound)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write(loadFixture(t, fixture))
	}))
	defer server.Close()
	client := newSyntheticClient(t, server.URL)
	probe, err := client.ProbeHealth(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if probe.FreshnessState != "fresh" || probe.LastEventAtMS != time.Date(2026, 7, 17, 16, 30, 0, 0, time.UTC).UnixMilli() {
		t.Fatalf("unexpected health freshness: %+v", probe)
	}
	if !slices.Equal(requested, []string{"/item/get"}) {
		t.Fatalf("health requested unexpected endpoints: %v", requested)
	}
}

func TestHealthFailsClosedOnNewerFailureAndItemError(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/item/get":
			var payload map[string]any
			if err := json.Unmarshal(loadFixture(t, "item_get.json"), &payload); err != nil {
				t.Fatal(err)
			}
			item := payload["item"].(map[string]any)
			item["error"] = map[string]any{"error_code": "ITEM_LOGIN_REQUIRED"}
			status := item["status"].(map[string]any)
			transactions := status["transactions"].(map[string]any)
			transactions["last_failed_update"] = "2026-07-17T16:45:00Z"
			_ = json.NewEncoder(writer).Encode(payload)
		default:
			http.Error(writer, "unexpected endpoint", http.StatusNotFound)
		}
	}))
	defer server.Close()
	client := newSyntheticClient(t, server.URL)
	probe, err := client.ProbeHealth(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if probe.Connected || probe.FreshnessState != "provider_attention_required" || len(probe.ProviderError) == 0 {
		t.Fatalf("broken Item was reported healthy: %+v", probe)
	}
}

func newSyntheticClient(t *testing.T, baseURL string) *Client {
	t.Helper()
	client, err := NewClient(Config{
		BaseURL:     baseURL,
		Environment: "synthetic",
		ClientID:    "synthetic-client",
		Secret:      "synthetic-secret",
		AccessToken: "synthetic-item-token",
		Bindings: CredentialBindings{
			AppClientIDRef:     "test:app-client",
			AppSecretRef:       "test:app-secret",
			ItemAccessTokenRef: "test:item-token",
		},
		Now: func() time.Time { return fixedNow },
	})
	if err != nil {
		t.Fatal(err)
	}
	return client
}

func loadFixture(t *testing.T, name string) []byte {
	t.Helper()
	path := filepath.Join("testdata", name)
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture %s: %v", path, err)
	}
	return raw
}

func assertSyntheticCredentialRequest(t *testing.T, request *http.Request, itemCredentialRequired bool) {
	t.Helper()
	if request.Header.Get("Plaid-Version") != plaidAPIVersion {
		t.Errorf("Plaid-Version = %q, want %q", request.Header.Get("Plaid-Version"), plaidAPIVersion)
	}
	raw, err := io.ReadAll(request.Body)
	if err != nil {
		t.Errorf("read request: %v", err)
		return
	}
	request.Body = io.NopCloser(bytes.NewReader(raw))
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var body map[string]any
	if err := decoder.Decode(&body); err != nil {
		t.Errorf("decode request: %v", err)
		return
	}
	if body["client_id"] != "synthetic-client" || body["secret"] != "synthetic-secret" {
		t.Errorf("missing synthetic app credentials")
	}
	_, hasItemToken := body["access_token"]
	if hasItemToken != itemCredentialRequired {
		t.Errorf("item credential presence = %v, want %v", hasItemToken, itemCredentialRequired)
	}
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func assertEvidencePayload(t *testing.T, evidence SourceEvidence) []byte {
	t.Helper()
	if evidence.PayloadEncoding != "base64" || evidence.PayloadBodyBase64 == "" {
		t.Fatalf("evidence does not carry lossless provider bytes: %+v", evidence)
	}
	raw, err := base64.StdEncoding.DecodeString(evidence.PayloadBodyBase64)
	if err != nil {
		t.Fatalf("decode provider evidence: %v", err)
	}
	digest := sha256.Sum256(raw)
	if got := hex.EncodeToString(digest[:]); got != evidence.PayloadSHA256 {
		t.Fatalf("evidence hash mismatch: got %s, want %s", got, evidence.PayloadSHA256)
	}
	if evidence.PayloadBytes != len(raw) {
		t.Fatalf("evidence byte count = %d, decoded bytes = %d", evidence.PayloadBytes, len(raw))
	}
	if !evidence.PayloadComplete {
		t.Fatal("complete test response was marked as a partial capture")
	}
	return raw
}
