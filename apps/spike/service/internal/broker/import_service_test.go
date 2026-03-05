package broker

import (
	"bytes"
	"compress/gzip"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func intPtrTest(v int) *int {
	out := v
	return &out
}

func int64PtrTest(v int64) *int64 {
	out := v
	return &out
}

func encodeGzipBase64JSONTest(t *testing.T, payload any) string {
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

func TestRunSessionsImport_FullGraphParityAndIdempotency(t *testing.T) {
	db := openLedgerTestDB(t)
	br, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker with db: %v", err)
	}

	startedAt := nowUnixMilli() - 3_000
	completedAt := startedAt + 1_000
	req := SessionsImportRequest{
		Source:         "aix",
		Mode:           "backfill",
		PersonaID:      "main",
		IdempotencyKey: "idem-full-1",
		Items: []SessionsImportItem{
			{
				SourceProvider:           "anthropic",
				SourceSessionID:          "session-full-1",
				SourceSessionFingerprint: "fp-v1",
				ImportedAtMS:             completedAt + 10,
				Session: SessionsImportSession{
					WorkspacePath:   "/workspace/chatstats",
					TaskDescription: "imported task",
					TaskStatus:      "active",
				},
				Turns: []SessionsImportTurn{
					{
						SourceTurnID:            "turn-src-1",
						StartedAtMS:             startedAt,
						CompletedAtMS:           int64PtrTest(completedAt),
						InputTokens:             intPtrTest(12),
						OutputTokens:            intPtrTest(34),
						TotalTokens:             intPtrTest(46),
						QueryMessageSourceIDs:   []string{"msg-src-1"},
						ResponseMessageSourceID: "msg-src-2",
						Metadata: map[string]any{
							"phase": "import",
						},
					},
				},
				Messages: []SessionsImportMessage{
					{
						SourceMessageID: "msg-src-1",
						SourceTurnID:    "turn-src-1",
						Role:            "user",
						Content:         "what happened on the last run?",
						Sequence:        0,
						CreatedAtMS:     startedAt,
					},
					{
						SourceMessageID: "msg-src-2",
						SourceTurnID:    "turn-src-1",
						Role:            "assistant",
						Content:         "investigation draft",
						Sequence:        1,
						CreatedAtMS:     completedAt,
					},
				},
				ToolCalls: []SessionsImportToolCall{
					{
						SourceToolCallID: "tool-src-1",
						SourceTurnID:     "turn-src-1",
						SourceMessageID:  "msg-src-2",
						ToolName:         "read_file",
						Status:           "completed",
						StartedAtMS:      startedAt + 100,
						CompletedAtMS:    int64PtrTest(completedAt + 100),
						Sequence:         0,
						ParamsJSON: map[string]any{
							"path": "/tmp/repro.log",
						},
						ResultJSON: map[string]any{
							"ok": true,
						},
					},
				},
			},
		},
	}

	resp, err := br.RunSessionsImport(req, SessionsImportOptions{})
	if err != nil {
		t.Fatalf("run sessions import: %v", err)
	}
	if !resp.OK || resp.Imported != 1 || resp.Upserted != 0 || resp.Skipped != 0 || resp.Failed != 0 {
		t.Fatalf("unexpected import response: %#v", resp)
	}
	if len(resp.Results) != 1 || resp.Results[0].Status != "imported" {
		t.Fatalf("unexpected per-item results: %#v", resp.Results)
	}
	sessionLabel := strings.TrimSpace(resp.Results[0].SessionLabel)
	if sessionLabel == "" {
		t.Fatalf("expected session label in import result")
	}

	session, err := br.GetSession(sessionLabel)
	if err != nil {
		t.Fatalf("get imported session: %v", err)
	}
	if session.PersonaID != "main" || session.Origin != "aix:anthropic" || strings.TrimSpace(session.ThreadID) == "" {
		t.Fatalf("unexpected imported session row: %#v", session)
	}

	turn, messages, toolCalls, err := br.GetTurnDetails(session.ThreadID)
	if err != nil {
		t.Fatalf("get imported turn details: %v", err)
	}
	if turn.ToolCallCount != 1 {
		t.Fatalf("expected tool_call_count=1, got %d", turn.ToolCallCount)
	}
	if len(messages) != 2 {
		t.Fatalf("expected 2 imported messages, got %d", len(messages))
	}
	if len(toolCalls) != 1 || toolCalls[0].ToolName != "read_file" {
		t.Fatalf("unexpected imported tool calls: %#v", toolCalls)
	}

	importRow, err := br.GetSessionImportBySource("aix", "anthropic", "session-full-1")
	if err != nil {
		t.Fatalf("get session import row: %v", err)
	}
	if importRow.SessionLabel != sessionLabel || importRow.SourceSessionFingerprint != "fp-v1" {
		t.Fatalf("unexpected import mapping row: %#v", importRow)
	}

	cachedResp, err := br.RunSessionsImport(req, SessionsImportOptions{})
	if err != nil {
		t.Fatalf("idempotent re-run failed: %v", err)
	}
	if cachedResp.RunID != resp.RunID || cachedResp.Imported != resp.Imported {
		t.Fatalf("expected cached response parity, got cached=%#v original=%#v", cachedResp, resp)
	}

	modeMismatch := req
	modeMismatch.Mode = "tail"
	if _, err := br.RunSessionsImport(modeMismatch, SessionsImportOptions{}); err == nil || !strings.Contains(err.Error(), "idempotency_key_mode_mismatch") {
		t.Fatalf("expected idempotency_key_mode_mismatch, got %v", err)
	}

	skipReq := req
	skipReq.IdempotencyKey = "idem-full-2"
	skipResp, err := br.RunSessionsImport(skipReq, SessionsImportOptions{})
	if err != nil {
		t.Fatalf("run skip import: %v", err)
	}
	if skipResp.Skipped != 1 || len(skipResp.Results) != 1 || skipResp.Results[0].Status != "skipped" {
		t.Fatalf("expected skipped response, got %#v", skipResp)
	}

	upsertReq := req
	upsertReq.IdempotencyKey = "idem-full-3"
	upsertReq.Items[0].SourceSessionFingerprint = "fp-v2"
	upsertResp, err := br.RunSessionsImport(upsertReq, SessionsImportOptions{})
	if err != nil {
		t.Fatalf("run upsert import: %v", err)
	}
	if upsertResp.Upserted != 1 || len(upsertResp.Results) != 1 || upsertResp.Results[0].Status != "upserted" {
		t.Fatalf("expected upserted response, got %#v", upsertResp)
	}
}

func TestRunSessionsImport_LabelHintCanonicalTarget(t *testing.T) {
	db := openLedgerTestDB(t)
	br, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker with db: %v", err)
	}

	now := nowUnixMilli()
	canonicalLabel := "dm:entity-import-target"
	if _, err := br.CreateSession(canonicalLabel, SessionOptions{PersonaID: "main"}); err != nil {
		t.Fatalf("seed canonical label: %v", err)
	}

	sourceProvider := "cursor"
	sourceSessionID := "cursor-session-hinted"
	resp, err := br.RunSessionsImport(SessionsImportRequest{
		Source:         "aix",
		Mode:           "backfill",
		IdempotencyKey: "idem-hinted-1",
		Items: []SessionsImportItem{
			{
				SourceProvider:           sourceProvider,
				SourceSessionID:          sourceSessionID,
				SourceSessionFingerprint: "fp-hinted",
				ImportedAtMS:             now,
				Session: SessionsImportSession{
					LabelHint:     canonicalLabel,
					CreatedAtMS:   int64PtrTest(now - 1_000),
					UpdatedAtMS:   int64PtrTest(now - 100),
					WorkspacePath: "/workspace/hinted",
				},
			},
		},
	}, SessionsImportOptions{PersonaID: "main"})
	if err != nil {
		t.Fatalf("run sessions import hinted label: %v", err)
	}
	if resp.Imported != 1 || resp.Failed != 0 || len(resp.Results) != 1 || resp.Results[0].Status != "imported" {
		t.Fatalf("unexpected hinted import response: %#v", resp)
	}
	if resp.Results[0].SessionLabel != canonicalLabel {
		t.Fatalf("expected hinted canonical label %q, got %#v", canonicalLabel, resp.Results[0])
	}

	importRow, err := br.GetSessionImportBySource("aix", sourceProvider, sourceSessionID)
	if err != nil {
		t.Fatalf("get import row: %v", err)
	}
	if importRow.SessionLabel != canonicalLabel {
		t.Fatalf("expected canonical import mapping label %q, got %#v", canonicalLabel, importRow)
	}

	fallbackLabel := buildImportedSessionLabel("aix", sourceProvider, sourceSessionID)
	if fallbackLabel == canonicalLabel {
		t.Fatalf("expected deterministic fallback label to differ from canonical label")
	}
	if _, err := br.GetSession(fallbackLabel); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected no fallback alias session %q, got err=%v", fallbackLabel, err)
	}
}

func TestRunSessionsImport_ParentTurnReferencesLaterParent(t *testing.T) {
	db := openLedgerTestDB(t)
	br, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker with db: %v", err)
	}

	now := nowUnixMilli()
	sourceSessionID := "cursor-parent-order-test"
	parentTurnSourceID := "turn-parent-order-parent"
	childTurnSourceID := "turn-parent-order-child"

	resp, err := br.RunSessionsImport(SessionsImportRequest{
		Source:         "aix",
		Mode:           "backfill",
		IdempotencyKey: "idem-parent-order-1",
		Items: []SessionsImportItem{
			{
				SourceProvider:           "cursor",
				SourceSessionID:          sourceSessionID,
				SourceSessionFingerprint: "fp-parent-order-1",
				ImportedAtMS:             now,
				Session: SessionsImportSession{
					WorkspacePath: "/workspace/parent-order",
					CreatedAtMS:   int64PtrTest(now - 5_000),
					UpdatedAtMS:   int64PtrTest(now - 100),
				},
				Turns: []SessionsImportTurn{
					{
						SourceTurnID:            childTurnSourceID,
						ParentSourceTurnID:      parentTurnSourceID,
						StartedAtMS:             now - 1_000,
						CompletedAtMS:           int64PtrTest(now - 500),
						QueryMessageSourceIDs:   []string{"msg-user-2"},
						ResponseMessageSourceID: "msg-assistant-2",
					},
					{
						SourceTurnID:            parentTurnSourceID,
						StartedAtMS:             now - 1_200,
						CompletedAtMS:           int64PtrTest(now - 700),
						QueryMessageSourceIDs:   []string{"msg-user-1"},
						ResponseMessageSourceID: "msg-assistant-1",
					},
				},
				Messages: []SessionsImportMessage{
					{
						SourceMessageID: "msg-user-1",
						SourceTurnID:    parentTurnSourceID,
						Role:            "user",
						Content:         "Parent turn input",
						Sequence:        0,
						CreatedAtMS:     now - 1_500,
					},
					{
						SourceMessageID: "msg-assistant-1",
						SourceTurnID:    parentTurnSourceID,
						Role:            "assistant",
						Content:         "Parent turn response",
						Sequence:        1,
						CreatedAtMS:     now - 1_400,
					},
					{
						SourceMessageID: "msg-user-2",
						SourceTurnID:    childTurnSourceID,
						Role:            "user",
						Content:         "Child turn input",
						Sequence:        2,
						CreatedAtMS:     now - 1_300,
					},
					{
						SourceMessageID: "msg-assistant-2",
						SourceTurnID:    childTurnSourceID,
						Role:            "assistant",
						Content:         "Child turn response",
						Sequence:        3,
						CreatedAtMS:     now - 1_200,
					},
				},
			},
		},
	}, SessionsImportOptions{})
	if err != nil {
		t.Fatalf("run sessions import parent-order: %v", err)
	}
	if resp.Imported != 1 || resp.Failed != 0 || len(resp.Results) != 1 || resp.Results[0].Status != "imported" {
		t.Fatalf("unexpected parent-order import response: %#v", resp)
	}

	var parentTurnID string
	if err := db.QueryRow(`SELECT id FROM turns WHERE source_event_id = ? LIMIT 1`, parentTurnSourceID).Scan(&parentTurnID); err != nil {
		t.Fatalf("query parent turn id: %v", err)
	}
	var childParentTurnID sql.NullString
	if err := db.QueryRow(`SELECT parent_turn_id FROM turns WHERE source_event_id = ? LIMIT 1`, childTurnSourceID).Scan(&childParentTurnID); err != nil {
		t.Fatalf("query child parent_turn_id: %v", err)
	}
	if !childParentTurnID.Valid || strings.TrimSpace(childParentTurnID.String) != parentTurnID {
		t.Fatalf("expected child parent_turn_id=%q, got %q", parentTurnID, childParentTurnID.String)
	}
}

func TestRunSessionsImportChunk_StagedThenCompleted(t *testing.T) {
	db := openLedgerTestDB(t)
	br, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker with db: %v", err)
	}

	now := nowUnixMilli()
	itemPayload := map[string]any{
		"sourceProvider":           "anthropic",
		"sourceSessionId":          "chunk-session-1",
		"sourceSessionFingerprint": "chunk-fp-1",
		"importedAtMs":             now,
		"session": map[string]any{
			"workspacePath": "/workspace/chunk",
		},
		"turns":    []any{},
		"messages": []any{},
	}
	encoded := encodeGzipBase64JSONTest(t, itemPayload)
	mid := len(encoded) / 2
	if mid <= 0 {
		t.Fatalf("encoded payload unexpectedly short: %d", len(encoded))
	}

	baseReq := SessionsImportChunkRequest{
		Source:                   "aix",
		Mode:                     "backfill",
		PersonaID:                "main",
		IdempotencyKey:           "idem-chunk-broker-1",
		UploadID:                 "upload-broker-1",
		ChunkIndex:               0,
		ChunkTotal:               2,
		Encoding:                 "gzip+base64",
		Data:                     encoded[:mid],
		SourceProvider:           "anthropic",
		SourceSessionID:          "chunk-session-1",
		SourceSessionFingerprint: "chunk-fp-1",
	}

	staged, err := br.RunSessionsImportChunk(baseReq, SessionsImportOptions{PersonaID: "main"})
	if err != nil {
		t.Fatalf("run sessions import chunk staged: %v", err)
	}
	if !staged.OK || staged.Status != "staged" || staged.Received != 1 || staged.Total != 2 || staged.Import != nil {
		t.Fatalf("unexpected staged response: %#v", staged)
	}
	if strings.TrimSpace(staged.RunID) == "" || strings.HasPrefix(staged.RunID, "run-") {
		t.Fatalf("expected nex-parity uuid runId, got %q", staged.RunID)
	}

	finalReq := baseReq
	finalReq.ChunkIndex = 1
	finalReq.Data = encoded[mid:]
	completed, err := br.RunSessionsImportChunk(finalReq, SessionsImportOptions{PersonaID: "main"})
	if err != nil {
		t.Fatalf("run sessions import chunk complete: %v", err)
	}
	if !completed.OK || completed.Status != "completed" || completed.Received != 2 || completed.Total != 2 || completed.Import == nil {
		t.Fatalf("unexpected completed response: %#v", completed)
	}
	if completed.Import.Imported != 1 || completed.Import.Failed != 0 || len(completed.Import.Results) != 1 || completed.Import.Results[0].Status != "imported" {
		t.Fatalf("unexpected completed import response: %#v", completed.Import)
	}
	if strings.TrimSpace(completed.RunID) == "" || strings.HasPrefix(completed.RunID, "run-") {
		t.Fatalf("expected nex-parity uuid completed runId, got %q", completed.RunID)
	}
	if completed.Import.RunID != completed.RunID {
		t.Fatalf("expected completed import runId %q, got %#v", completed.RunID, completed.Import)
	}

	encodingMismatch := baseReq
	encodingMismatch.Encoding = "raw"
	if _, err := br.RunSessionsImportChunk(encodingMismatch, SessionsImportOptions{PersonaID: "main"}); err == nil || !strings.Contains(err.Error(), "chunk_encoding_mismatch") {
		t.Fatalf("expected chunk_encoding_mismatch, got %v", err)
	}
}
