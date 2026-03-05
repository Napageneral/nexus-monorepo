package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Napageneral/spike/internal/broker"
	_ "modernc.org/sqlite"
)

type controlPlaneEngine struct {
	handle *controlPlaneHandle
}

func (e *controlPlaneEngine) Start(_ context.Context, _ broker.EngineStartOpts) (broker.EngineHandle, error) {
	if e.handle == nil {
		e.handle = &controlPlaneHandle{}
	}
	return e.handle, nil
}

type controlPlaneHandle struct {
	prompts int
	stops   int
}

func (h *controlPlaneHandle) Prompt(_ context.Context, message string) (*broker.TurnResult, error) {
	h.prompts++
	started := time.Now().UTC()
	completed := started.Add(5 * time.Millisecond)
	return &broker.TurnResult{
		TurnID:      fmt.Sprintf("turn-cp-%d", h.prompts),
		MessageID:   fmt.Sprintf("msg-cp-%d", h.prompts),
		Content:     "ok: " + strings.TrimSpace(message),
		Status:      "completed",
		StartedAt:   started,
		CompletedAt: completed,
		Usage: broker.SessionStats{
			InputTokens:  10,
			OutputTokens: 20,
			TotalTokens:  30,
		},
	}, nil
}

func (h *controlPlaneHandle) Steer(context.Context, string) error { return nil }
func (h *controlPlaneHandle) GetMessages(context.Context) ([]broker.AgentMessage, error) {
	return nil, nil
}
func (h *controlPlaneHandle) GetState(context.Context) (*broker.EngineSessionState, error) {
	return &broker.EngineSessionState{SessionID: "cp-session"}, nil
}
func (h *controlPlaneHandle) GetSessionStats(context.Context) (*broker.SessionStats, error) {
	return &broker.SessionStats{}, nil
}
func (h *controlPlaneHandle) Compact(context.Context, string) (*broker.CompactionResult, error) {
	return &broker.CompactionResult{
		Summary:      "compacted summary",
		TokensBefore: 120,
		TokensAfter:  60,
		DurationMS:   4,
	}, nil
}
func (h *controlPlaneHandle) SetModel(context.Context, string, string) error { return nil }
func (h *controlPlaneHandle) SetThinkingLevel(context.Context, string) error { return nil }
func (h *controlPlaneHandle) OnEvent(func(broker.AgentEvent)) (unsubscribe func()) {
	return func() {}
}
func (h *controlPlaneHandle) Stop(context.Context) error {
	h.stops++
	return nil
}

func openServeSessionsDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", "file:serve_sessions_test?mode=memory&cache=shared")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`PRAGMA foreign_keys=ON`); err != nil {
		t.Fatalf("pragma foreign_keys: %v", err)
	}
	return db
}

func postJSON(t *testing.T, client *http.Client, url string, path string, payload any, out any) int {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	resp, err := client.Post(url+path, "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("post %s: %v", path, err)
	}
	defer resp.Body.Close()
	if out != nil {
		raw, _ := io.ReadAll(resp.Body)
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, out); err != nil {
				t.Fatalf("decode %s response: %v raw=%s", path, err, strings.TrimSpace(string(raw)))
			}
		}
	}
	return resp.StatusCode
}

func postJSONRaw(t *testing.T, client *http.Client, url string, path string, payload any) (int, string) {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	resp, err := client.Post(url+path, "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("post %s: %v", path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, strings.TrimSpace(string(raw))
}

func encodeGzipBase64JSON(t *testing.T, payload any) string {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	var buf bytes.Buffer
	zw := gzip.NewWriter(&buf)
	if _, err := zw.Write(raw); err != nil {
		t.Fatalf("gzip write: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("gzip close: %v", err)
	}
	return base64.StdEncoding.EncodeToString(buf.Bytes())
}

func TestServeSessionsControlPlaneEndpoints(t *testing.T) {
	db := openServeSessionsDB(t)
	br, err := broker.NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	engine := &controlPlaneEngine{}
	br.SetEngine(engine)
	if _, err := br.CreateSession("oracle:test:session", broker.SessionOptions{PersonaID: "main", Origin: "ask", SessionDir: t.TempDir()}); err != nil {
		t.Fatalf("create session: %v", err)
	}
	if _, err := br.Execute(context.Background(), "oracle:test:session", "seed history"); err != nil {
		t.Fatalf("seed execute: %v", err)
	}

	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {broker: br},
		},
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	httpClient := httpSrv.Client()

	var listResp struct {
		Sessions []broker.LedgerSession `json:"sessions"`
	}
	if code := postJSON(t, httpClient, httpSrv.URL, "/sessions/list", sessionsListRequest{TreeID: "oracle-test", Limit: 10}, &listResp); code != http.StatusOK {
		t.Fatalf("expected /sessions/list 200, got %d", code)
	}
	if len(listResp.Sessions) == 0 || listResp.Sessions[0].Label == "" {
		t.Fatalf("expected non-empty sessions list: %#v", listResp)
	}

	var resolveResp struct {
		OK  bool   `json:"ok"`
		Key string `json:"key"`
	}
	if code := postJSON(t, httpClient, httpSrv.URL, "/sessions/resolve", sessionsResolveRequest{Key: "oracle:test:session"}, &resolveResp); code != http.StatusOK {
		t.Fatalf("expected /sessions/resolve 200, got %d", code)
	}
	if !resolveResp.OK || resolveResp.Key != "oracle:test:session" {
		t.Fatalf("unexpected sessions/resolve response: %#v", resolveResp)
	}

	var previewResp struct {
		Previews []broker.SessionPreview `json:"previews"`
	}
	if code := postJSON(t, httpClient, httpSrv.URL, "/sessions/preview", sessionsPreviewRequest{TreeID: "oracle-test", Keys: []string{"oracle:test:session"}, Limit: 2, MaxChars: 64}, &previewResp); code != http.StatusOK {
		t.Fatalf("expected /sessions/preview 200, got %d", code)
	}
	if len(previewResp.Previews) != 1 || previewResp.Previews[0].Status == "missing" {
		t.Fatalf("unexpected preview response: %#v", previewResp)
	}

	taskDesc := "oracle reliability follow-up"
	taskStatus := "active"
	routingKey := "oracle/root"
	status := "active"
	if code := postJSON(t, httpClient, httpSrv.URL, "/sessions/patch", sessionsPatchRequest{
		TreeID:          "oracle-test",
		Key:             "oracle:test:session",
		TaskDescription: &taskDesc,
		TaskStatus:      &taskStatus,
		RoutingKey:      &routingKey,
		Status:          &status,
	}, &resolveResp); code != http.StatusOK {
		t.Fatalf("expected /sessions/patch 200, got %d", code)
	}
	patched, err := br.GetSession("oracle:test:session")
	if err != nil {
		t.Fatalf("get patched session: %v", err)
	}
	if patched.TaskDescription != taskDesc || patched.TaskStatus != taskStatus || patched.RoutingKey != routingKey {
		t.Fatalf("patch not persisted: %#v", patched)
	}

	var importResp struct {
		OK       bool   `json:"ok"`
		RunID    string `json:"runId"`
		Imported int    `json:"imported"`
		Upserted int    `json:"upserted"`
		Skipped  int    `json:"skipped"`
		Failed   int    `json:"failed"`
		Results  []struct {
			Status       string `json:"status"`
			SessionLabel string `json:"sessionLabel"`
		} `json:"results"`
	}
	importPayload := sessionsImportRequest{
		TreeID:         "oracle-test",
		Source:         "aix",
		RunID:          "run-1",
		Mode:           "backfill",
		PersonaID:      "main",
		IdempotencyKey: "idem-1",
		Items: []broker.SessionsImportItem{
			{
				SourceProvider:           "anthropic",
				SourceSessionID:          "session-123",
				SourceSessionFingerprint: "fingerprint-abc",
				ImportedAtMS:             time.Now().UnixMilli(),
				Session: broker.SessionsImportSession{
					LabelHint: "oracle:test:session",
				},
				Turns:    []broker.SessionsImportTurn{},
				Messages: []broker.SessionsImportMessage{},
			},
		},
	}
	if code := postJSON(t, httpClient, httpSrv.URL, "/sessions/import", importPayload, &importResp); code != http.StatusOK {
		t.Fatalf("expected /sessions/import 200, got %d", code)
	}
	if !importResp.OK || strings.TrimSpace(importResp.RunID) == "" || importResp.Imported != 1 || importResp.Failed != 0 || len(importResp.Results) != 1 {
		t.Fatalf("unexpected import response: %#v", importResp)
	}
	if importResp.Results[0].Status != "imported" || strings.TrimSpace(importResp.Results[0].SessionLabel) == "" {
		t.Fatalf("unexpected import result payload: %#v", importResp)
	}
	firstRunID := importResp.RunID
	if code := postJSON(t, httpClient, httpSrv.URL, "/sessions/import", importPayload, &importResp); code != http.StatusOK {
		t.Fatalf("expected /sessions/import idempotent 200, got %d", code)
	}
	if importResp.RunID != firstRunID {
		t.Fatalf("expected cached runId on idempotent replay, got %q vs %q", importResp.RunID, firstRunID)
	}

	var chunkResp struct {
		OK       bool   `json:"ok"`
		RunID    string `json:"runId"`
		Status   string `json:"status"`
		Received int    `json:"received"`
		Total    int    `json:"total"`
		UploadID string `json:"uploadId"`
		Import   *struct {
			OK      bool   `json:"ok"`
			RunID   string `json:"runId"`
			Failed  int    `json:"failed"`
			Results []struct {
				Status string `json:"status"`
			} `json:"results"`
		} `json:"import"`
	}
	chunkItem := map[string]any{
		"sourceProvider":           "anthropic",
		"sourceSessionId":          "session-123",
		"sourceSessionFingerprint": "fingerprint-abc",
		"importedAtMs":             time.Now().UnixMilli(),
		"session": map[string]any{
			"labelHint": "oracle:test:session",
		},
	}
	encodedItem := encodeGzipBase64JSON(t, chunkItem)
	mid := len(encodedItem) / 2
	if mid <= 0 {
		t.Fatalf("encoded payload unexpectedly short: %d", len(encodedItem))
	}
	chunk0 := sessionsImportChunkRequest{
		TreeID:                   "oracle-test",
		Source:                   "aix",
		UploadID:                 "upload-1",
		ChunkIndex:               0,
		ChunkTotal:               2,
		Mode:                     "backfill",
		RunID:                    "run-1",
		PersonaID:                "main",
		IdempotencyKey:           "idem-chunk-1",
		SourceProvider:           "anthropic",
		SourceSessionID:          "session-123",
		SourceSessionFingerprint: "fingerprint-abc",
		Encoding:                 "gzip+base64",
		Data:                     encodedItem[:mid],
	}
	if code := postJSON(t, httpClient, httpSrv.URL, "/sessions/import.chunk", chunk0, &chunkResp); code != http.StatusOK {
		t.Fatalf("expected /sessions/import.chunk 200, got %d", code)
	}
	if !chunkResp.OK || chunkResp.Status != "staged" || chunkResp.Received != 1 || chunkResp.Total != 2 {
		t.Fatalf("unexpected chunk response after first part: %#v", chunkResp)
	}
	if strings.TrimSpace(chunkResp.RunID) == "" || strings.TrimSpace(chunkResp.UploadID) == "" {
		t.Fatalf("expected canonical runId/uploadId in chunk response: %#v", chunkResp)
	}
	chunk1 := chunk0
	chunk1.ChunkIndex = 1
	chunk1.Data = encodedItem[mid:]
	if code := postJSON(t, httpClient, httpSrv.URL, "/sessions/import.chunk", chunk1, &chunkResp); code != http.StatusOK {
		t.Fatalf("expected /sessions/import.chunk finalize 200, got %d", code)
	}
	if !chunkResp.OK || chunkResp.Status != "completed" || chunkResp.Received != 2 || chunkResp.Total != 2 {
		t.Fatalf("unexpected chunk finalize response: %#v", chunkResp)
	}
	if chunkResp.Import == nil {
		t.Fatalf("expected completed chunk response to include import payload: %#v", chunkResp)
	}
	if chunkResp.Import.Failed != 0 || len(chunkResp.Import.Results) != 1 || chunkResp.Import.Results[0].Status == "" {
		t.Fatalf("unexpected import payload in completed chunk response: %#v", chunkResp.Import)
	}

	var compactResp struct {
		OK         bool                    `json:"ok"`
		Key        string                  `json:"key"`
		Compacted  bool                    `json:"compacted"`
		Compaction broker.CompactionResult `json:"compaction"`
	}
	if code := postJSON(t, httpClient, httpSrv.URL, "/sessions/compact", sessionsCompactRequest{TreeID: "oracle-test", Key: "oracle:test:session"}, &compactResp); code != http.StatusOK {
		t.Fatalf("expected /sessions/compact 200, got %d", code)
	}
	if !compactResp.OK || compactResp.Key != "oracle:test:session" || !compactResp.Compacted || strings.TrimSpace(compactResp.Compaction.Summary) == "" {
		t.Fatalf("unexpected compact response: %#v", compactResp)
	}

	if code := postJSON(t, httpClient, httpSrv.URL, "/sessions/reset", sessionsKeyRequest{TreeID: "oracle-test", Key: "oracle:test:session"}, &resolveResp); code != http.StatusOK {
		t.Fatalf("expected /sessions/reset 200, got %d", code)
	}
	reset, err := br.GetSession("oracle:test:session")
	if err != nil {
		t.Fatalf("get reset session: %v", err)
	}
	if reset.ThreadID != "" {
		t.Fatalf("expected empty thread id after reset, got %s", reset.ThreadID)
	}

	if code := postJSON(t, httpClient, httpSrv.URL, "/sessions/delete", sessionsKeyRequest{TreeID: "oracle-test", Key: "oracle:test:session"}, &resolveResp); code != http.StatusOK {
		t.Fatalf("expected /sessions/delete 200, got %d", code)
	}
	deleted, err := br.GetSession("oracle:test:session")
	if err != nil {
		t.Fatalf("get deleted session: %v", err)
	}
	if deleted.Status != "deleted" {
		t.Fatalf("expected deleted status, got %s", deleted.Status)
	}
}

func TestServeSessionsImportParityMismatches(t *testing.T) {
	db := openServeSessionsDB(t)
	br, err := broker.NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	if _, err := br.CreateSession("oracle:test:session", broker.SessionOptions{PersonaID: "main", Origin: "ask", SessionDir: t.TempDir()}); err != nil {
		t.Fatalf("create session: %v", err)
	}
	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {broker: br},
		},
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()
	httpClient := httpSrv.Client()

	importPayload := sessionsImportRequest{
		TreeID:         "oracle-test",
		Source:         "aix",
		RunID:          "run-1",
		Mode:           "backfill",
		PersonaID:      "main",
		IdempotencyKey: "idem-import",
		Items: []broker.SessionsImportItem{
			{
				SourceProvider:           "anthropic",
				SourceSessionID:          "session-123",
				SourceSessionFingerprint: "fingerprint-abc",
				ImportedAtMS:             time.Now().UnixMilli(),
				Session: broker.SessionsImportSession{
					LabelHint: "oracle:test:session",
				},
				Turns:    []broker.SessionsImportTurn{},
				Messages: []broker.SessionsImportMessage{},
			},
		},
	}
	if status, body := postJSONRaw(t, httpClient, httpSrv.URL, "/sessions/import", importPayload); status != http.StatusOK {
		t.Fatalf("expected /sessions/import 200, got %d body=%q", status, body)
	}

	mismatchSource := importPayload
	mismatchSource.Source = "foo"
	if status, body := postJSONRaw(t, httpClient, httpSrv.URL, "/sessions/import", mismatchSource); status != http.StatusBadRequest || !strings.Contains(body, "source_unsupported") {
		t.Fatalf("expected source_unsupported 400, got status=%d body=%q", status, body)
	}

	mismatchMode := importPayload
	mismatchMode.Mode = "tail"
	if status, body := postJSONRaw(t, httpClient, httpSrv.URL, "/sessions/import", mismatchMode); status != http.StatusBadRequest || !strings.Contains(body, "idempotency_key_mode_mismatch") {
		t.Fatalf("expected idempotency_key_mode_mismatch 400, got status=%d body=%q", status, body)
	}

	chunk0 := sessionsImportChunkRequest{
		TreeID:                   "oracle-test",
		Source:                   "aix",
		UploadID:                 "upload-mismatch",
		ChunkIndex:               0,
		ChunkTotal:               2,
		Mode:                     "backfill",
		RunID:                    "run-1",
		PersonaID:                "main",
		IdempotencyKey:           "idem-chunk-mismatch",
		SourceProvider:           "anthropic",
		SourceSessionID:          "session-123",
		SourceSessionFingerprint: "fingerprint-abc",
		Encoding:                 "gzip+base64",
		Data:                     "part-0",
	}
	if code := postJSON(t, httpClient, httpSrv.URL, "/sessions/import.chunk", chunk0, nil); code != http.StatusOK {
		t.Fatalf("expected /sessions/import.chunk 200, got %d", code)
	}

	totalMismatch := chunk0
	totalMismatch.ChunkIndex = 1
	totalMismatch.ChunkTotal = 3
	totalMismatch.Data = "part-1"
	if status, body := postJSONRaw(t, httpClient, httpSrv.URL, "/sessions/import.chunk", totalMismatch); status != http.StatusBadRequest || !strings.Contains(body, "chunk_total_mismatch") {
		t.Fatalf("expected chunk_total_mismatch 400, got status=%d body=%q", status, body)
	}

	modeMismatch := chunk0
	modeMismatch.ChunkIndex = 1
	modeMismatch.Mode = "tail"
	modeMismatch.Data = "part-1"
	if status, body := postJSONRaw(t, httpClient, httpSrv.URL, "/sessions/import.chunk", modeMismatch); status != http.StatusBadRequest || !strings.Contains(body, "chunk_mode_mismatch") {
		t.Fatalf("expected chunk_mode_mismatch 400, got status=%d body=%q", status, body)
	}

	encodingMismatch := chunk0
	encodingMismatch.ChunkIndex = 1
	encodingMismatch.Encoding = "utf-8"
	encodingMismatch.Data = "part-1"
	if status, body := postJSONRaw(t, httpClient, httpSrv.URL, "/sessions/import.chunk", encodingMismatch); status != http.StatusBadRequest || !strings.Contains(body, "chunk_encoding_mismatch") {
		t.Fatalf("expected chunk_encoding_mismatch 400, got status=%d body=%q", status, body)
	}

	unsupportedEncoding := chunk0
	unsupportedEncoding.UploadID = "upload-encoding"
	unsupportedEncoding.ChunkTotal = 1
	unsupportedEncoding.Encoding = "utf-8"
	if status, body := postJSONRaw(t, httpClient, httpSrv.URL, "/sessions/import.chunk", unsupportedEncoding); status != http.StatusBadRequest || !strings.Contains(body, "chunk_encoding_unsupported") {
		t.Fatalf("expected chunk_encoding_unsupported 400, got status=%d body=%q", status, body)
	}

	indexOutOfRange := chunk0
	indexOutOfRange.UploadID = "upload-index-range"
	indexOutOfRange.ChunkIndex = 2
	indexOutOfRange.ChunkTotal = 2
	if status, body := postJSONRaw(t, httpClient, httpSrv.URL, "/sessions/import.chunk", indexOutOfRange); status != http.StatusBadRequest || !strings.Contains(body, "chunk_index_out_of_range") {
		t.Fatalf("expected chunk_index_out_of_range 400, got status=%d body=%q", status, body)
	}

	badItem := map[string]any{
		"sourceProvider":           "openai",
		"sourceSessionId":          "session-123",
		"sourceSessionFingerprint": "fingerprint-abc",
		"session":                  map[string]any{"labelHint": "oracle:test:session"},
	}
	badEncoded := encodeGzipBase64JSON(t, badItem)
	midBad := len(badEncoded) / 2
	if midBad <= 0 {
		t.Fatalf("bad encoded payload unexpectedly short: %d", len(badEncoded))
	}
	itemMismatch0 := chunk0
	itemMismatch0.UploadID = "upload-item-mismatch"
	itemMismatch0.Data = badEncoded[:midBad]
	if code := postJSON(t, httpClient, httpSrv.URL, "/sessions/import.chunk", itemMismatch0, nil); code != http.StatusOK {
		t.Fatalf("expected staged first bad-item chunk 200, got %d", code)
	}
	itemMismatch1 := itemMismatch0
	itemMismatch1.ChunkIndex = 1
	itemMismatch1.Data = badEncoded[midBad:]
	if status, body := postJSONRaw(t, httpClient, httpSrv.URL, "/sessions/import.chunk", itemMismatch1); status != http.StatusBadRequest || !strings.Contains(body, "chunk_item_source_provider_mismatch") {
		t.Fatalf("expected chunk_item_source_provider_mismatch 400, got status=%d body=%q", status, body)
	}

}

func TestServeSessionsImportItemsPath(t *testing.T) {
	db := openServeSessionsDB(t)
	br, err := broker.NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {broker: br},
		},
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()
	httpClient := httpSrv.Client()

	startedAt := time.Now().UnixMilli() - 2_000
	completedAt := startedAt + 1_000
	payload := map[string]any{
		"tree_id":        "oracle-test",
		"source":         "aix",
		"mode":           "backfill",
		"idempotencyKey": "idem-items-1",
		"personaId":      "main",
		"items": []map[string]any{
			{
				"sourceProvider":           "anthropic",
				"sourceSessionId":          "items-session-1",
				"sourceSessionFingerprint": "items-fp-1",
				"importedAtMs":             completedAt,
				"session": map[string]any{
					"workspacePath": "/workspace/chatstats",
				},
				"turns": []map[string]any{
					{
						"sourceTurnId":            "items-turn-1",
						"startedAtMs":             startedAt,
						"completedAtMs":           completedAt,
						"queryMessageSourceIds":   []string{"items-msg-1"},
						"responseMessageSourceId": "items-msg-2",
					},
				},
				"messages": []map[string]any{
					{
						"sourceMessageId": "items-msg-1",
						"sourceTurnId":    "items-turn-1",
						"role":            "user",
						"content":         "imported question",
						"sequence":        0,
						"createdAtMs":     startedAt,
					},
					{
						"sourceMessageId": "items-msg-2",
						"sourceTurnId":    "items-turn-1",
						"role":            "assistant",
						"content":         "imported answer",
						"sequence":        1,
						"createdAtMs":     completedAt,
					},
				},
			},
		},
	}

	var resp struct {
		OK       bool   `json:"ok"`
		RunID    string `json:"runId"`
		Imported int    `json:"imported"`
		Upserted int    `json:"upserted"`
		Skipped  int    `json:"skipped"`
		Failed   int    `json:"failed"`
		Results  []struct {
			SourceProvider  string `json:"sourceProvider"`
			SourceSessionID string `json:"sourceSessionId"`
			SessionLabel    string `json:"sessionLabel"`
			Status          string `json:"status"`
		} `json:"results"`
	}
	if code := postJSON(t, httpClient, httpSrv.URL, "/sessions/import", payload, &resp); code != http.StatusOK {
		t.Fatalf("expected /sessions/import items path 200, got %d", code)
	}
	if !resp.OK || resp.Imported != 1 || resp.Failed != 0 || len(resp.Results) != 1 || resp.Results[0].Status != "imported" {
		t.Fatalf("unexpected items import response: %#v", resp)
	}
	if strings.TrimSpace(resp.RunID) == "" {
		t.Fatalf("expected canonical runId in items response: %#v", resp)
	}
	if strings.TrimSpace(resp.Results[0].SessionLabel) == "" {
		t.Fatalf("expected session label in items import response")
	}

	firstRunID := resp.RunID
	if code := postJSON(t, httpClient, httpSrv.URL, "/sessions/import", payload, &resp); code != http.StatusOK {
		t.Fatalf("expected /sessions/import idempotent items path 200, got %d", code)
	}
	if strings.TrimSpace(resp.RunID) == "" || resp.RunID != firstRunID {
		t.Fatalf("expected cached runId on idempotent replay, got %q vs %q", resp.RunID, firstRunID)
	}
	if resp.Imported != 1 || len(resp.Results) != 1 {
		t.Fatalf("unexpected cached items import response: %#v", resp)
	}
}

func TestServeSessionsImportItemsPathRejectsSnakeCase(t *testing.T) {
	db := openServeSessionsDB(t)
	br, err := broker.NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	srv := &oracleServer{
		trees: map[string]*servedTree{
			"oracle-test": {broker: br},
		},
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()
	httpClient := httpSrv.Client()

	startedAt := time.Now().UnixMilli() - 2_000
	completedAt := startedAt + 1_000
	payload := map[string]any{
		"tree_id":         "oracle-test",
		"source":          "aix",
		"mode":            "backfill",
		"idempotency_key": "idem-items-snake-1",
		"persona_id":      "main",
		"items": []map[string]any{
			{
				"source_provider":            "anthropic",
				"source_session_id":          "items-snake-session-1",
				"source_session_fingerprint": "items-snake-fp-1",
				"imported_at_ms":             completedAt,
				"session": map[string]any{
					"workspace_path": "/workspace/chatstats",
				},
				"turns": []map[string]any{
					{
						"source_turn_id":             "items-snake-turn-1",
						"started_at_ms":              startedAt,
						"completed_at_ms":            completedAt,
						"query_message_source_ids":   []string{"items-snake-msg-1"},
						"response_message_source_id": "items-snake-msg-2",
					},
				},
				"messages": []map[string]any{
					{
						"source_message_id": "items-snake-msg-1",
						"source_turn_id":    "items-snake-turn-1",
						"role":              "user",
						"content":           "imported snake question",
						"sequence":          0,
						"created_at_ms":     startedAt,
					},
					{
						"source_message_id": "items-snake-msg-2",
						"source_turn_id":    "items-snake-turn-1",
						"role":              "assistant",
						"content":           "imported snake answer",
						"sequence":          1,
						"created_at_ms":     completedAt,
					},
				},
			},
		},
	}

	if status, body := postJSONRaw(t, httpClient, httpSrv.URL, "/sessions/import", payload); status != http.StatusBadRequest || !strings.Contains(body, "unknown field") {
		t.Fatalf("expected /sessions/import snake-case payload 400 unknown field, got status=%d body=%q", status, body)
	}
}
