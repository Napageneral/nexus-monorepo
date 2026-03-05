package broker

import (
	"context"
	"database/sql"
	"errors"
	"testing"
)

func TestResolvePreviewResetDeleteSession(t *testing.T) {
	db := openLedgerTestDB(t)
	broker, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker with db: %v", err)
	}

	if _, err := broker.CreateSession("oracle:test:preview", SessionOptions{PersonaID: "main", Origin: "ask"}); err != nil {
		t.Fatalf("create session: %v", err)
	}

	started := nowUnixMilli()
	if err := broker.insertTurn(TurnWrite{
		ID:        "turn-preview-root",
		TurnType:  "normal",
		Status:    "completed",
		StartedAt: started,
		Role:      "unified",
	}); err != nil {
		t.Fatalf("insert root turn: %v", err)
	}
	if err := broker.upsertThread(ThreadWrite{
		TurnID:       "turn-preview-root",
		AncestryJSON: `["turn-preview-root"]`,
		ThreadKey:    "turn-preview-root",
	}); err != nil {
		t.Fatalf("upsert root thread: %v", err)
	}
	if err := broker.setSessionThread("oracle:test:preview", "turn-preview-root", started); err != nil {
		t.Fatalf("set root session thread: %v", err)
	}
	if err := broker.insertMessage(MessageWrite{
		ID:        "msg-preview-root-user",
		TurnID:    "turn-preview-root",
		Role:      "user",
		Content:   "hello from user",
		Sequence:  0,
		CreatedAt: started,
	}); err != nil {
		t.Fatalf("insert root user message: %v", err)
	}
	if err := broker.insertMessage(MessageWrite{
		ID:        "msg-preview-root-assistant",
		TurnID:    "turn-preview-root",
		Role:      "assistant",
		Content:   "a very long assistant response for preview truncation",
		Sequence:  1,
		CreatedAt: started + 10,
	}); err != nil {
		t.Fatalf("insert root assistant message: %v", err)
	}

	if err := broker.insertTurn(TurnWrite{
		ID:           "turn-preview-child",
		ParentTurnID: "turn-preview-root",
		TurnType:     "normal",
		Status:       "completed",
		StartedAt:    started + 20,
		Role:         "unified",
	}); err != nil {
		t.Fatalf("insert child turn: %v", err)
	}
	if err := broker.upsertThread(ThreadWrite{
		TurnID:       "turn-preview-child",
		AncestryJSON: `["turn-preview-root","turn-preview-child"]`,
		ThreadKey:    "turn-preview-child",
	}); err != nil {
		t.Fatalf("upsert child thread: %v", err)
	}
	if err := broker.setSessionThread("oracle:test:preview", "turn-preview-child", started+20); err != nil {
		t.Fatalf("set child session thread: %v", err)
	}
	if err := broker.insertMessage(MessageWrite{
		ID:        "msg-preview-child-assistant",
		TurnID:    "turn-preview-child",
		Role:      "assistant",
		Content:   "latest assistant content",
		Sequence:  1,
		CreatedAt: started + 25,
	}); err != nil {
		t.Fatalf("insert child assistant message: %v", err)
	}

	label, err := broker.ResolveSessionLabel("oracle:test:preview")
	if err != nil {
		t.Fatalf("resolve by label: %v", err)
	}
	if label != "oracle:test:preview" {
		t.Fatalf("unexpected resolved label: %s", label)
	}
	label, err = broker.ResolveSessionLabel("turn-preview-child")
	if err != nil {
		t.Fatalf("resolve by thread id: %v", err)
	}
	if label != "oracle:test:preview" {
		t.Fatalf("unexpected resolved thread label: %s", label)
	}
	if _, err := broker.ResolveSessionLabel("does-not-exist"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for missing resolve, got: %v", err)
	}

	previews, err := broker.PreviewSessions(
		[]string{"oracle:test:preview", "missing-key"},
		2,
		20,
	)
	if err != nil {
		t.Fatalf("preview sessions: %v", err)
	}
	if len(previews) != 2 {
		t.Fatalf("expected 2 previews, got %d", len(previews))
	}
	if previews[0].Status != "ok" {
		t.Fatalf("expected first preview status ok, got %s", previews[0].Status)
	}
	if len(previews[0].Items) != 2 {
		t.Fatalf("expected 2 preview items, got %d", len(previews[0].Items))
	}
	if previews[0].Items[0].Content != "latest assistant ..." {
		t.Fatalf("unexpected truncated content: %q", previews[0].Items[0].Content)
	}
	if previews[1].Status != "missing" {
		t.Fatalf("expected second preview status missing, got %s", previews[1].Status)
	}

	taskDescription := "investigate oracle regressions"
	taskStatus := "in-progress"
	routingKey := "oracle/root"
	status := "paused"
	patched, err := broker.PatchSession("oracle:test:preview", SessionPatch{
		TaskDescription: &taskDescription,
		TaskStatus:      &taskStatus,
		RoutingKey:      &routingKey,
		Status:          &status,
	})
	if err != nil {
		t.Fatalf("patch session: %v", err)
	}
	if patched != "oracle:test:preview" {
		t.Fatalf("unexpected patch resolved label: %s", patched)
	}
	session, err := broker.GetSession("oracle:test:preview")
	if err != nil {
		t.Fatalf("get session after patch: %v", err)
	}
	if session.TaskDescription != taskDescription || session.TaskStatus != taskStatus || session.RoutingKey != routingKey || session.Status != status {
		t.Fatalf("unexpected patched session: %#v", session)
	}

	oldThreadID := session.ThreadID
	broker.SetEngine(&fakeEngine{handle: &fakeEngineHandle{}})
	resolvedCompact, compact, err := broker.CompactSession(context.Background(), "oracle:test:preview", "")
	if err != nil {
		t.Fatalf("compact session: %v", err)
	}
	if resolvedCompact != "oracle:test:preview" {
		t.Fatalf("unexpected compact resolved label: %s", resolvedCompact)
	}
	if compact == nil || compact.Summary != "compact" {
		t.Fatalf("unexpected compaction result: %#v", compact)
	}
	session, err = broker.GetSession("oracle:test:preview")
	if err != nil {
		t.Fatalf("get session after compact: %v", err)
	}
	if session.ThreadID == "" || session.ThreadID == oldThreadID {
		t.Fatalf("expected compacted thread id, before=%s after=%s", oldThreadID, session.ThreadID)
	}
	turn, _, _, err := broker.GetTurnDetails(session.ThreadID)
	if err != nil {
		t.Fatalf("get compact turn details: %v", err)
	}
	if turn.TurnType != "compaction" {
		t.Fatalf("expected compaction turn type, got %s", turn.TurnType)
	}
	compactionRow, err := broker.getCompaction(session.ThreadID)
	if err != nil {
		t.Fatalf("get compaction row: %v", err)
	}
	if compactionRow.SummarizedThroughTurnID != oldThreadID {
		t.Fatalf("unexpected summarized_through turn: %s (want %s)", compactionRow.SummarizedThroughTurnID, oldThreadID)
	}

	resolved, err := broker.ResetSession("oracle:test:preview")
	if err != nil {
		t.Fatalf("reset session: %v", err)
	}
	if resolved != "oracle:test:preview" {
		t.Fatalf("unexpected reset resolved label: %s", resolved)
	}
	session, err = broker.GetSession("oracle:test:preview")
	if err != nil {
		t.Fatalf("get session after reset: %v", err)
	}
	if session.ThreadID != "" {
		t.Fatalf("expected empty thread id after reset, got %s", session.ThreadID)
	}
	if session.Status != "active" {
		t.Fatalf("expected active status after reset, got %s", session.Status)
	}

	resolved, err = broker.DeleteSession("oracle:test:preview")
	if err != nil {
		t.Fatalf("delete session: %v", err)
	}
	if resolved != "oracle:test:preview" {
		t.Fatalf("unexpected delete resolved label: %s", resolved)
	}
	session, err = broker.GetSession("oracle:test:preview")
	if err != nil {
		t.Fatalf("get session after delete: %v", err)
	}
	if session.Status != "deleted" {
		t.Fatalf("expected deleted status after delete, got %s", session.Status)
	}
	if _, err := broker.ResolveSessionLabel("oracle:test:preview"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows after delete, got: %v", err)
	}
}
