package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestFormatJQLTimeUsesJiraTimeZone(t *testing.T) {
	loc, err := time.LoadLocation("America/Los_Angeles")
	if err != nil {
		t.Fatalf("load location: %v", err)
	}

	got := formatJQLTime(time.Date(2026, 3, 10, 23, 25, 58, 0, time.UTC), loc)
	if got != "2026-03-10 16:25" {
		t.Fatalf("unexpected formatted time: %q", got)
	}
}

func TestLoadJiraTimeZoneDefaultsToUTC(t *testing.T) {
	loc, err := loadJiraTimeZone("")
	if err != nil {
		t.Fatalf("loadJiraTimeZone: %v", err)
	}
	if loc != time.UTC {
		t.Fatalf("expected UTC, got %v", loc)
	}
}

func TestInfoDeclaresExpectedOperationsAndAuth(t *testing.T) {
	result, err := info(context.Background())
	if err != nil {
		t.Fatalf("info: %v", err)
	}

	if result.Platform != "jira" {
		t.Fatalf("platform mismatch: %q", result.Platform)
	}
	if result.Name != "Jira Cloud" {
		t.Fatalf("name mismatch: %q", result.Name)
	}
	if result.CredentialService != "atlassian" {
		t.Fatalf("credential service mismatch: %q", result.CredentialService)
	}

	required := map[string]bool{
		"adapter.info":          false,
		"adapter.health":        false,
		"adapter.accounts.list": false,
		"adapter.setup.start":   false,
		"adapter.setup.submit":  false,
		"adapter.setup.status":  false,
		"adapter.setup.cancel":  false,
		"adapter.monitor.start": false,
		"records.backfill":      false,
		"channels.send":         false,
	}
	for _, op := range result.Operations {
		if _, ok := required[string(op)]; ok {
			required[string(op)] = true
		}
	}
	for op, seen := range required {
		if !seen {
			t.Fatalf("missing operation %s", op)
		}
	}

	if result.Auth == nil || len(result.Auth.Methods) != 1 {
		t.Fatalf("expected one auth method, got %#v", result.Auth)
	}
	if got := result.Auth.Methods[0].Fields[2].Type; got != "secret" {
		t.Fatalf("expected api token field to be secret, got %q", got)
	}
}

func TestPreprocessCLIArgsUsesCanonicalBackfillAndConnectionFlags(t *testing.T) {
	rewritten := preprocessCLIArgs([]string{"jira-adapter", "backfill", "--connection", "conn-1"})
	if rewritten[1] != "records.backfill" {
		t.Fatalf("expected records.backfill, got %q", rewritten[1])
	}
	if rewritten[2] != "--connection" {
		t.Fatalf("backfill should preserve --connection, got %q", rewritten[2])
	}

	rewritten = preprocessCLIArgs([]string{"jira-adapter", "monitor", "--connection", "conn-1"})
	if rewritten[1] != "adapter.monitor.start" {
		t.Fatalf("expected adapter.monitor.start, got %q", rewritten[1])
	}
	if rewritten[2] != "--connection" {
		t.Fatalf("monitor should preserve --connection, got %q", rewritten[2])
	}
}

func TestSetupStartFailsWhenFieldsAreMissing(t *testing.T) {
	result, err := setupStart(context.Background(), nexadapter.AdapterSetupRequest{
		Payload: map[string]any{
			"site": "example",
		},
	})
	if err != nil {
		t.Fatalf("setupStart: %v", err)
	}
	if result.Status != nexadapter.SetupStatusFailed {
		t.Fatalf("expected failed status, got %q", result.Status)
	}
	if !strings.Contains(strings.ToLower(result.Message), "missing required fields") {
		t.Fatalf("unexpected message: %q", result.Message)
	}
}

func TestSetupFlowPersistsAcrossInvocations(t *testing.T) {
	t.Setenv(setupDirEnvVar, t.TempDir())

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/_edge/tenant_info":
			_ = json.NewEncoder(w).Encode(map[string]any{"cloudId": "test-cloud"})
		case "/ex/jira/test-cloud/rest/api/3/myself":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"accountId":    "acct-123",
				"displayName":  "Tyler",
				"emailAddress": "tyler@example.com",
			})
		case "/ex/jira/test-cloud/rest/api/3/project/search":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"isLast":     true,
				"maxResults": 50,
				"startAt":    0,
				"total":      2,
				"values": []map[string]any{
					{"id": "1", "key": "PP", "name": "Patient Portal"},
					{"id": "2", "key": "PC", "name": "Platform Core"},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	restoreTransport := installAtlassianTransport(t, server)
	defer restoreTransport()

	startResult, err := setupStart(context.Background(), nexadapter.AdapterSetupRequest{
		ConnectionID: "vrtly-jira",
		Payload: map[string]any{
			"site":      "vrtly",
			"email":     "tyler@example.com",
			"api_token": "secret-token",
		},
	})
	if err != nil {
		t.Fatalf("setupStart: %v", err)
	}
	if startResult.Status != nexadapter.SetupStatusRequiresInput {
		t.Fatalf("expected requires_input, got %q", startResult.Status)
	}
	if got := len(startResult.Fields[0].Options); got != 2 {
		t.Fatalf("expected 2 project options, got %d", got)
	}

	submitResult, err := setupSubmit(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: startResult.SessionID,
		Payload: map[string]any{
			"projects": []any{"PP"},
		},
	})
	if err != nil {
		t.Fatalf("setupSubmit: %v", err)
	}
	if submitResult.Status != nexadapter.SetupStatusCompleted {
		t.Fatalf("expected completed, got %q", submitResult.Status)
	}
	if got := submitResult.Metadata["user_id"]; got != "acct-123" {
		t.Fatalf("unexpected user id: %#v", got)
	}

	statusResult, err := setupStatus(context.Background(), nexadapter.AdapterSetupRequest{
		SessionID: startResult.SessionID,
	})
	if err != nil {
		t.Fatalf("setupStatus: %v", err)
	}
	if statusResult.Status != nexadapter.SetupStatusCompleted {
		t.Fatalf("expected completed from status, got %q", statusResult.Status)
	}
}

func TestHealthUsesRuntimeContextConnectionID(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/_edge/tenant_info":
			_ = json.NewEncoder(w).Encode(map[string]any{"cloudId": "test-cloud"})
		case "/ex/jira/test-cloud/rest/api/3/myself":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"accountId":   "acct-999",
				"displayName": "Tyler",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	restoreTransport := installAtlassianTransport(t, server)
	defer restoreTransport()

	runtimeContextPath := writeRuntimeContextForTest(t, map[string]any{
		"version":       1,
		"platform":      "jira",
		"connection_id": "vrtly-jira",
		"config": map[string]any{
			"projects": []string{"PP", "PC"},
		},
		"credential": map[string]any{
			"kind":  "config",
			"value": "ignored",
			"fields": map[string]string{
				"site":      "vrtly",
				"email":     "tyler@example.com",
				"api_token": "secret-token",
			},
		},
	})
	t.Setenv(nexadapter.AdapterContextEnvVar, runtimeContextPath)

	healthResult, err := health(context.Background(), "")
	if err != nil {
		t.Fatalf("health: %v", err)
	}
	if !healthResult.Connected {
		t.Fatalf("expected connected health, got %q", healthResult.Error)
	}
	if got := healthResult.Details["user_id"]; got != "acct-999" {
		t.Fatalf("unexpected user id: %#v", got)
	}
}

func TestBackfillEmitsCanonicalRecordIngest(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/_edge/tenant_info":
			_ = json.NewEncoder(w).Encode(map[string]any{"cloudId": "test-cloud"})
		case "/ex/jira/test-cloud/rest/api/3/search/jql":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"isLast": true,
				"issues": []map[string]any{
					{
						"id":  "10001",
						"key": "PP-1",
						"fields": map[string]any{
							"summary":     "Investigate session timeout",
							"description": adfDoc("Timeout affects mobile users"),
							"status":      map[string]any{"id": "1", "name": "To Do"},
							"issuetype":   map[string]any{"id": "10", "name": "Task"},
							"project":     map[string]any{"id": "1", "key": "PP", "name": "Patient Portal"},
							"created":     "2026-03-08T10:00:00.000-0600",
							"updated":     "2026-03-08T12:00:00.000-0600",
							"priority":    map[string]any{"id": "3", "name": "Medium"},
							"reporter":    map[string]any{"accountId": "acct-1", "displayName": "Tyler"},
							"labels":      []string{"backend"},
							"components":  []map[string]any{{"id": "99", "name": "Sessions"}},
							"comment": map[string]any{
								"startAt":    0,
								"maxResults": 1,
								"total":      1,
								"comments": []map[string]any{
									{
										"id":      "5001",
										"author":  map[string]any{"accountId": "acct-2", "displayName": "Alex"},
										"body":    adfDoc("Reproduced on iOS"),
										"created": "2026-03-08T12:05:00.000-0600",
										"updated": "2026-03-08T12:05:00.000-0600",
									},
								},
							},
						},
					},
				},
			})
		case "/ex/jira/test-cloud/rest/api/3/issue/PP-1":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":  "10001",
				"key": "PP-1",
				"changelog": map[string]any{
					"histories": []map[string]any{
						{
							"id":      "hist-1",
							"created": "2026-03-08T12:10:00.000-0600",
							"author":  map[string]any{"accountId": "acct-3", "displayName": "Casey"},
							"items": []map[string]any{
								{"field": "status", "fromString": "To Do", "toString": "In Progress"},
							},
						},
					},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	restoreTransport := installAtlassianTransport(t, server)
	defer restoreTransport()

	runtimeContextPath := writeRuntimeContextForTest(t, map[string]any{
		"version":       1,
		"platform":      "jira",
		"connection_id": "vrtly-jira",
		"config": map[string]any{
			"projects": []string{"PP"},
		},
		"credential": map[string]any{
			"kind":  "config",
			"value": "ignored",
			"fields": map[string]string{
				"site":      "vrtly",
				"email":     "tyler@example.com",
				"api_token": "secret-token",
			},
		},
	})
	t.Setenv(nexadapter.AdapterContextEnvVar, runtimeContextPath)

	output := captureStdout(t, func() {
		err := backfill(context.Background(), "", time.Date(2026, 3, 8, 0, 0, 0, 0, time.UTC), nil)
		if err != nil {
			t.Fatalf("backfill: %v", err)
		}
	})

	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) != 3 {
		t.Fatalf("expected 3 records, got %d: %q", len(lines), output)
	}

	for _, line := range lines {
		var record adapterInboundRecord
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			t.Fatalf("parse record: %v", err)
		}
		if record.Operation != "record.ingest" {
			t.Fatalf("unexpected operation: %q", record.Operation)
		}
		if record.Routing.ConnectionID != "vrtly-jira" {
			t.Fatalf("unexpected connection_id: %q", record.Routing.ConnectionID)
		}
	}
}

func TestSendCreateIssueUsesProjectChannelTarget(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/_edge/tenant_info":
			_ = json.NewEncoder(w).Encode(map[string]any{"cloudId": "test-cloud"})
		case "/ex/jira/test-cloud/rest/api/3/issue":
			if r.Method != http.MethodPost {
				t.Fatalf("expected POST, got %s", r.Method)
			}
			var payload map[string]any
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode payload: %v", err)
			}
			fields := payload["fields"].(map[string]any)
			project := fields["project"].(map[string]any)
			if project["key"] != "PP" {
				t.Fatalf("unexpected project key: %#v", project["key"])
			}
			if fields["summary"] != "Investigate timeout" {
				t.Fatalf("unexpected summary: %#v", fields["summary"])
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "10001", "key": "PP-1"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	restoreTransport := installAtlassianTransport(t, server)
	defer restoreTransport()

	runtimeContextPath := writeRuntimeContextForTest(t, map[string]any{
		"version":       1,
		"platform":      "jira",
		"connection_id": "vrtly-jira",
		"config":        map[string]any{},
		"credential": map[string]any{
			"kind":  "config",
			"value": "ignored",
			"fields": map[string]string{
				"site":      "vrtly",
				"email":     "tyler@example.com",
				"api_token": "secret-token",
			},
		},
	})
	t.Setenv(nexadapter.AdapterContextEnvVar, runtimeContextPath)

	result, err := send(context.Background(), nexadapter.SendRequest{
		Target: nexadapter.DeliveryTarget{
			ConnectionID: "vrtly-jira",
			Channel: nexadapter.ChannelRef{
				Platform:      "jira",
				SpaceID:       "vrtly",
				ContainerKind: "group",
				ContainerID:   "PP",
			},
		},
		Text: `{"action":"create_issue","issuetype":"Task","summary":"Investigate timeout","description":"Follow up on mobile regression"}`,
	})
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	if !result.Success {
		t.Fatalf("expected success, got %#v", result.Error)
	}
	if len(result.MessageIDs) != 1 || result.MessageIDs[0] != "PP-1" {
		t.Fatalf("unexpected message ids: %#v", result.MessageIDs)
	}
}

func TestSendCommentUsesIssueThreadTarget(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/_edge/tenant_info":
			_ = json.NewEncoder(w).Encode(map[string]any{"cloudId": "test-cloud"})
		case "/ex/jira/test-cloud/rest/api/3/issue/PP-7/comment":
			if r.Method != http.MethodPost {
				t.Fatalf("expected POST, got %s", r.Method)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "comment-1"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	restoreTransport := installAtlassianTransport(t, server)
	defer restoreTransport()

	runtimeContextPath := writeRuntimeContextForTest(t, map[string]any{
		"version":       1,
		"platform":      "jira",
		"connection_id": "vrtly-jira",
		"config":        map[string]any{},
		"credential": map[string]any{
			"kind":  "config",
			"value": "ignored",
			"fields": map[string]string{
				"site":      "vrtly",
				"email":     "tyler@example.com",
				"api_token": "secret-token",
			},
		},
	})
	t.Setenv(nexadapter.AdapterContextEnvVar, runtimeContextPath)

	result, err := send(context.Background(), nexadapter.SendRequest{
		Target: nexadapter.DeliveryTarget{
			ConnectionID: "vrtly-jira",
			Channel: nexadapter.ChannelRef{
				Platform:      "jira",
				SpaceID:       "vrtly",
				ContainerKind: "group",
				ContainerID:   "PP",
				ThreadID:      "PP-7",
			},
		},
		Text: `{"action":"comment","body":"Validation comment"}`,
	})
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	if !result.Success {
		t.Fatalf("expected success, got %#v", result.Error)
	}
	if len(result.MessageIDs) != 1 || result.MessageIDs[0] != "comment-1" {
		t.Fatalf("unexpected message ids: %#v", result.MessageIDs)
	}
}

func TestSendRejectsDeprecatedPayloadRoutingFields(t *testing.T) {
	runtimeContextPath := writeRuntimeContextForTest(t, map[string]any{
		"version":       1,
		"platform":      "jira",
		"connection_id": "vrtly-jira",
		"config":        map[string]any{},
		"credential": map[string]any{
			"kind":  "config",
			"value": "ignored",
			"fields": map[string]string{
				"site":      "vrtly",
				"email":     "tyler@example.com",
				"api_token": "secret-token",
			},
		},
	})
	t.Setenv(nexadapter.AdapterContextEnvVar, runtimeContextPath)

	result, err := send(context.Background(), nexadapter.SendRequest{
		Target: nexadapter.DeliveryTarget{
			ConnectionID: "vrtly-jira",
			Channel: nexadapter.ChannelRef{
				Platform:      "jira",
				ContainerKind: "group",
				ContainerID:   "PP",
			},
		},
		Text: `{"action":"create_issue","project":"PP","issuetype":"Task","summary":"Deprecated routing"}`,
	})
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	if result.Success {
		t.Fatalf("expected failure")
	}
	if result.Error == nil || !strings.Contains(result.Error.Message, "project is not allowed") {
		t.Fatalf("unexpected error: %#v", result.Error)
	}
}

func TestSendRejectsIssueMutationWithoutThreadTarget(t *testing.T) {
	runtimeContextPath := writeRuntimeContextForTest(t, map[string]any{
		"version":       1,
		"platform":      "jira",
		"connection_id": "vrtly-jira",
		"config":        map[string]any{},
		"credential": map[string]any{
			"kind":  "config",
			"value": "ignored",
			"fields": map[string]string{
				"site":      "vrtly",
				"email":     "tyler@example.com",
				"api_token": "secret-token",
			},
		},
	})
	t.Setenv(nexadapter.AdapterContextEnvVar, runtimeContextPath)

	result, err := send(context.Background(), nexadapter.SendRequest{
		Target: nexadapter.DeliveryTarget{
			ConnectionID: "vrtly-jira",
			Channel: nexadapter.ChannelRef{
				Platform:      "jira",
				ContainerKind: "group",
				ContainerID:   "PP",
			},
		},
		Text: `{"action":"comment","body":"Missing thread target"}`,
	})
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	if result.Success {
		t.Fatalf("expected failure")
	}
	if result.Error == nil || !strings.Contains(result.Error.Message, "must target a Jira issue thread") {
		t.Fatalf("unexpected error: %#v", result.Error)
	}
}

func writeRuntimeContextForTest(t *testing.T, payload map[string]any) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "runtime-context.json")
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal runtime context: %v", err)
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatalf("write runtime context: %v", err)
	}
	return path
}

func installAtlassianTransport(t *testing.T, server *httptest.Server) func() {
	t.Helper()
	original := http.DefaultTransport
	baseTransport := server.Client().Transport
	serverHost := strings.TrimPrefix(server.URL, "https://")
	http.DefaultTransport = roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		if strings.HasSuffix(req.URL.Host, ".atlassian.net") || req.URL.Host == "api.atlassian.com" {
			req.URL.Scheme = "https"
			req.URL.Host = serverHost
		}
		return baseTransport.RoundTrip(req)
	})
	return func() {
		http.DefaultTransport = original
	}
}

func captureStdout(t *testing.T, fn func()) string {
	t.Helper()
	original := os.Stdout
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	os.Stdout = writer
	defer func() {
		os.Stdout = original
	}()

	fn()

	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}
	out, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("read stdout: %v", err)
	}
	return string(out)
}

func adfDoc(text string) map[string]any {
	return map[string]any{
		"type":    "doc",
		"version": 1,
		"content": []map[string]any{
			{
				"type": "paragraph",
				"content": []map[string]any{
					{"type": "text", "text": text},
				},
			},
		},
	}
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
