package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func testMercuryClient(server *httptest.Server, role mercuryConnectionRole) *mercuryClient {
	return &mercuryClient{
		connectionID:  "connection-test",
		credentialRef: "mercury/test",
		role:          role,
		token:         "test-token-value",
		baseURL:       server.URL,
		httpClient:    server.Client(),
		sleep: func(context.Context, time.Duration) error {
			return nil
		},
	}
}

func TestPrimaryReadPreservesExactProviderBytes(t *testing.T) {
	body := []byte(`{"accounts":[{"id":"acct_1","balance":123.45}],"page":{"nextPage":null}}`)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			t.Fatalf("method = %s", request.Method)
		}
		if request.URL.Path != "/accounts" {
			t.Fatalf("path = %s", request.URL.Path)
		}
		if request.Header.Get("Authorization") != "Bearer test-token-value" {
			t.Fatal("authorization header missing")
		}
		writer.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = writer.Write(body)
	}))
	defer server.Close()

	response, err := invokeForTest(
		context.Background(),
		testMercuryClient(server, rolePrimaryRead),
		"getAccounts",
		map[string]any{},
	)
	if err != nil {
		t.Fatal(err)
	}
	if response.PageCount != 1 || response.ProviderCalls != 1 || !response.Complete {
		t.Fatalf("unexpected response summary: %#v", response)
	}
	if response.ProviderWriteAttempted {
		t.Fatal("provider write was reported")
	}
	if response.Pages[0].Body != string(body) || response.Pages[0].BodyEncoding != "utf8_json" {
		t.Fatal("provider bytes were not retained exactly")
	}
	digest := sha256.Sum256(body)
	if response.Pages[0].BodySHA256 != hex.EncodeToString(digest[:]) {
		t.Fatal("provider body hash mismatch")
	}
}

func TestPrimaryReadMayShadowAPReads(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		_, _ = writer.Write([]byte(`{"recipients":[],"page":{"nextPage":null}}`))
	}))
	defer server.Close()
	response, err := invokeForTest(
		context.Background(),
		testMercuryClient(server, rolePrimaryRead),
		"getRecipients",
		map[string]any{},
	)
	if err != nil {
		t.Fatal(err)
	}
	if response.ConnectionRole != string(rolePrimaryRead) {
		t.Fatalf("connection role = %q", response.ConnectionRole)
	}
}

func TestAPConnectionCannotInvokePrimaryRead(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		calls.Add(1)
		writer.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	_, err := invokeForTest(
		context.Background(),
		testMercuryClient(server, roleAPRequest),
		"getAccounts",
		map[string]any{},
	)
	if err == nil || !strings.Contains(err.Error(), "primary_read") {
		t.Fatalf("error = %v", err)
	}
	if calls.Load() != 0 {
		t.Fatalf("provider calls = %d, want 0", calls.Load())
	}
}

func TestEveryPublicWriteFailsBeforeNetwork(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		calls.Add(1)
		writer.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	for _, name := range sortedMethodNames() {
		operation, ok := operationForMethod(name)
		if !ok || operation.HTTPMethod == http.MethodGet {
			continue
		}
		role := rolePrimaryRead
		if _, apWrite := apWriteOperations[operation.OperationID]; apWrite {
			role = roleAPRequest
		}
		_, err := invokeForTest(
			context.Background(),
			testMercuryClient(server, role),
			operation.OperationID,
			map[string]any{},
		)
		if err == nil || !strings.Contains(err.Error(), "writes are disabled") {
			t.Fatalf("%s error = %v", operation.OperationID, err)
		}
	}
	if calls.Load() != 0 {
		t.Fatalf("provider calls = %d, want 0", calls.Load())
	}
}

func TestAPWriteRejectsWrongRoleBeforeDisabledGate(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		calls.Add(1)
	}))
	defer server.Close()
	_, err := invokeForTest(
		context.Background(),
		testMercuryClient(server, rolePrimaryRead),
		"requestSendMoney",
		map[string]any{},
	)
	if err == nil || !strings.Contains(err.Error(), "requires the ap_request connection") {
		t.Fatalf("error = %v", err)
	}
	if calls.Load() != 0 {
		t.Fatalf("provider calls = %d, want 0", calls.Load())
	}
}

func TestCardPANRevealFailsBeforeNetwork(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		calls.Add(1)
	}))
	defer server.Close()
	_, err := invokeForTest(
		context.Background(),
		testMercuryClient(server, rolePrimaryRead),
		"revealCardPan",
		map[string]any{"path_parameters": map[string]any{"cardId": "card_1"}},
	)
	if err == nil || !strings.Contains(err.Error(), "card-PAN reveal is excluded") {
		t.Fatalf("error = %v", err)
	}
	if calls.Load() != 0 {
		t.Fatalf("provider calls = %d, want 0", calls.Load())
	}
}

func TestHTTPStatusClassificationAndRetry(t *testing.T) {
	tests := []struct {
		status       int
		wantAttempts int
		wantRetry    bool
	}{
		{http.StatusUnauthorized, 1, false},
		{http.StatusForbidden, 1, false},
		{http.StatusNotFound, 1, false},
		{http.StatusConflict, 1, false},
		{http.StatusTooManyRequests, 3, true},
		{http.StatusInternalServerError, 3, true},
		{http.StatusServiceUnavailable, 3, true},
	}
	for _, test := range tests {
		t.Run(fmt.Sprintf("status_%d", test.status), func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				calls.Add(1)
				writer.Header().Set("Content-Type", "application/json")
				writer.Header().Set("Retry-After", "0")
				writer.WriteHeader(test.status)
				_, _ = writer.Write([]byte(`{"errors":{"errorCode":"safe_test_code","message":"secret response detail"}}`))
			}))
			defer server.Close()
			client := testMercuryClient(server, rolePrimaryRead)
			_, err := invokeForTest(context.Background(), client, "getAccounts", map[string]any{})
			var httpError *mercuryHTTPError
			if !errors.As(err, &httpError) {
				t.Fatalf("error = %v", err)
			}
			if httpError.Attempts != test.wantAttempts || httpError.Retryable != test.wantRetry {
				t.Fatalf("HTTP error = %#v", httpError)
			}
			if httpError.ProviderErrorCode != "safe_test_code" {
				t.Fatalf("provider error code = %q", httpError.ProviderErrorCode)
			}
			if strings.Contains(err.Error(), "secret response detail") ||
				strings.Contains(err.Error(), client.token) {
				t.Fatalf("error leaked secret detail: %v", err)
			}
			if int(calls.Load()) != test.wantAttempts {
				t.Fatalf("calls = %d, want %d", calls.Load(), test.wantAttempts)
			}
		})
	}
}

func TestRetryCanRecover(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if calls.Add(1) == 1 {
			writer.Header().Set("Retry-After", "0")
			writer.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = writer.Write([]byte(`{"accounts":[]}`))
	}))
	defer server.Close()
	response, err := invokeForTest(
		context.Background(),
		testMercuryClient(server, rolePrimaryRead),
		"getAccounts",
		map[string]any{},
	)
	if err != nil {
		t.Fatal(err)
	}
	if response.ProviderCalls != 2 || response.Pages[0].RequestAttempts != 2 {
		t.Fatalf("response = %#v", response)
	}
}

func TestAutomaticPaginationIsBounded(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		call := calls.Add(1)
		switch call {
		case 1:
			if request.URL.Query().Has("start_after") {
				t.Fatal("first page unexpectedly has start_after")
			}
			_, _ = writer.Write([]byte(`{"transactions":[{"id":"txn_1"}],"page":{"nextPage":"cursor_2"}}`))
		case 2:
			if request.URL.Query().Get("start_after") != "cursor_2" {
				t.Fatalf("start_after = %q", request.URL.Query().Get("start_after"))
			}
			_, _ = writer.Write([]byte(`{"transactions":[{"id":"txn_2"}],"page":{"nextPage":null}}`))
		default:
			t.Fatal("unexpected extra page")
		}
	}))
	defer server.Close()
	response, err := invokeForTest(
		context.Background(),
		testMercuryClient(server, rolePrimaryRead),
		"listTransactions",
		map[string]any{"auto_paginate": true, "max_pages": 3},
	)
	if err != nil {
		t.Fatal(err)
	}
	if response.PageCount != 2 || response.ProviderCalls != 2 || !response.Complete {
		t.Fatalf("response = %#v", response)
	}
}

func TestPaginationLimitDoesNotClaimComplete(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		_, _ = writer.Write([]byte(`{"transactions":[],"page":{"nextPage":"more"}}`))
	}))
	defer server.Close()
	response, err := invokeForTest(
		context.Background(),
		testMercuryClient(server, rolePrimaryRead),
		"listTransactions",
		map[string]any{"auto_paginate": true, "max_pages": 1},
	)
	if err != nil {
		t.Fatal(err)
	}
	if response.Complete {
		t.Fatal("bounded partial response claimed complete")
	}
}

func TestPathAndQueryValidation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.EscapedPath() != "/account/account%2Fwith%2Fslashes/transactions" {
			t.Fatalf("escaped path = %q", request.URL.EscapedPath())
		}
		if got := request.URL.Query()["status"]; len(got) != 2 || got[0] != "pending" || got[1] != "sent" {
			t.Fatalf("status query = %#v", got)
		}
		_, _ = writer.Write([]byte(`{"transactions":[]}`))
	}))
	defer server.Close()
	client := testMercuryClient(server, rolePrimaryRead)
	_, err := invokeForTest(
		context.Background(),
		client,
		"listAccountTransactions",
		map[string]any{
			"path_parameters": map[string]any{"accountId": "account/with/slashes"},
			"query":           map[string]any{"status": []any{"pending", "sent"}},
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	_, err = invokeForTest(
		context.Background(),
		client,
		"getAccount",
		map[string]any{},
	)
	if err == nil || !strings.Contains(err.Error(), "missing or invalid") {
		t.Fatalf("missing path error = %v", err)
	}
	_, err = invokeForTest(
		context.Background(),
		client,
		"getAccounts",
		map[string]any{"query": map[string]any{"access_token": "forbidden"}},
	)
	if err == nil || !strings.Contains(err.Error(), "credential-like") {
		t.Fatalf("credential query error = %v", err)
	}
}

func TestBinaryResponseUsesBase64(t *testing.T) {
	body := []byte{0x25, 0x50, 0x44, 0x46, 0x00, 0xff}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/pdf")
		_, _ = writer.Write(body)
	}))
	defer server.Close()
	response, err := invokeForTest(
		context.Background(),
		testMercuryClient(server, rolePrimaryRead),
		"getStatementPdf",
		map[string]any{"path_parameters": map[string]any{"statementId": "statement_1"}},
	)
	if err != nil {
		t.Fatal(err)
	}
	if response.Pages[0].BodyEncoding != "base64" || response.Pages[0].ContentType != "application/pdf" {
		t.Fatalf("page = %#v", response.Pages[0])
	}
}

func TestBaseURLBoundary(t *testing.T) {
	if got, err := validatedMercuryBaseURL(officialMercuryBaseURL, false); err != nil || got != officialMercuryBaseURL {
		t.Fatalf("official URL = %q, %v", got, err)
	}
	if _, err := validatedMercuryBaseURL("https://evil.example/api/v1", true); err == nil {
		t.Fatal("non-loopback test URL accepted")
	}
	if _, err := validatedMercuryBaseURL("http://127.0.0.1:8080", false); err == nil {
		t.Fatal("loopback URL accepted outside test mode")
	}
	if got, err := validatedMercuryBaseURL("http://127.0.0.1:8080", true); err != nil || got == "" {
		t.Fatalf("loopback test URL = %q, %v", got, err)
	}
}

func TestLoadClientRequiresExactRoleAndKeepsCredentialPointer(t *testing.T) {
	runtime := &nexadapter.RuntimeContext{
		Version:      1,
		Platform:     "mercury",
		ConnectionID: "mercury-primary",
		Config:       map[string]any{"connection_role": string(rolePrimaryRead)},
		Credential: &nexadapter.RuntimeCredential{
			Value:   "token",
			Ref:     "mercury/moonsleep-production",
			Service: "mercury",
			Account: "moonsleep-production",
		},
	}
	client, err := loadMercuryClient(nexadapter.AdapterRuntimeContext{
		Context:      context.Background(),
		Runtime:      runtime,
		ConnectionID: runtime.ConnectionID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if client.credentialRef != "mercury/moonsleep-production" ||
		client.role != rolePrimaryRead {
		t.Fatalf("client = %#v", client)
	}
	runtime.Config["connection_role"] = "invalid"
	if _, err := loadMercuryClient(nexadapter.AdapterRuntimeContext{
		Context:      context.Background(),
		Runtime:      runtime,
		ConnectionID: runtime.ConnectionID,
	}); err == nil {
		t.Fatal("invalid role accepted")
	}
}

func TestQueryEncodingUsesRepeatedValues(t *testing.T) {
	query, err := encodeQuery(map[string]any{
		"status": []any{"pending", "sent"},
		"limit":  100,
		"active": true,
	})
	if err != nil {
		t.Fatal(err)
	}
	expected := url.Values{
		"status": {"pending", "sent"},
		"limit":  {"100"},
		"active": {"true"},
	}
	if query.Encode() != expected.Encode() {
		t.Fatalf("query = %q, want %q", query.Encode(), expected.Encode())
	}
}
