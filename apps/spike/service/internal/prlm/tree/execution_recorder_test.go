package tree

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

type stubPromptExecutor struct {
	attempts int
}

func (s *stubPromptExecutor) PrepareNode(context.Context, NodeExecutionScope) error {
	return nil
}

func (s *stubPromptExecutor) ExecutePrompt(_ context.Context, req PromptExecutionRequest) (*PromptExecutionResult, error) {
	s.attempts++
	if s.attempts == 1 {
		return &PromptExecutionResult{
			Backend:    "stub",
			SessionKey: "session-attempt-1",
		}, errors.New("rate limit")
	}
	return &PromptExecutionResult{
		Backend:    "stub",
		SessionKey: "session-attempt-2",
		Content:    "final answer",
	}, nil
}

func TestCompleteWithRetryRecordsExecutionAttempts(t *testing.T) {
	dir := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(dir, ".oracle.db"))
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	defer db.Close()
	if _, err := db.ExecContext(context.Background(), `
		CREATE TABLE ask_request_executions (
			request_id        TEXT NOT NULL,
			node_id           TEXT NOT NULL,
			phase             TEXT NOT NULL,
			attempt           INTEGER NOT NULL,
			origin            TEXT NOT NULL DEFAULT '',
			status            TEXT NOT NULL DEFAULT '',
			execution_backend TEXT NOT NULL DEFAULT '',
			session_key       TEXT NOT NULL DEFAULT '',
			run_id            TEXT NOT NULL DEFAULT '',
			working_dir       TEXT NOT NULL DEFAULT '',
			answer_preview    TEXT NOT NULL DEFAULT '',
			error_message     TEXT NOT NULL DEFAULT '',
			started_at        INTEGER NOT NULL,
			completed_at      INTEGER NOT NULL,
			PRIMARY KEY (request_id, node_id, phase, attempt)
		);
	`); err != nil {
		t.Fatalf("create ask_request_executions: %v", err)
	}

	executor := &stubPromptExecutor{}
	ctx := &NodeContext{
		Executor:          executor,
		ExecutionRecorder: newSQLAskExecutionRecorder(db),
		RequestID:         "req-1",
		Policies:          DefaultAskPolicies(),
	}

	out, err := ctx.completeWithRetry(context.Background(), func(attempt int) (string, error) {
		return ctx.executePromptAttempt(
			context.Background(),
			"root",
			AskPhaseLeaf,
			attempt,
			"ask",
			"prompt",
			"system",
			"/tmp/workdir",
		)
	})
	if err != nil {
		t.Fatalf("completeWithRetry: %v", err)
	}
	if out != "final answer" {
		t.Fatalf("unexpected output: %q", out)
	}

	rows, err := db.QueryContext(
		context.Background(),
		`SELECT attempt, status, execution_backend, session_key, answer_preview, error_message
		 FROM ask_request_executions
		 WHERE request_id = ?
		 ORDER BY attempt ASC`,
		"req-1",
	)
	if err != nil {
		t.Fatalf("query ask_request_executions: %v", err)
	}
	defer rows.Close()

	type row struct {
		attempt       int
		status        string
		backend       string
		sessionKey    string
		answerPreview string
		errorMessage  string
	}
	var got []row
	for rows.Next() {
		var item row
		if err := rows.Scan(
			&item.attempt,
			&item.status,
			&item.backend,
			&item.sessionKey,
			&item.answerPreview,
			&item.errorMessage,
		); err != nil {
			t.Fatalf("scan ask_request_executions: %v", err)
		}
		got = append(got, item)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate ask_request_executions: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 execution rows, got %#v", got)
	}
	if got[0].attempt != 1 || got[0].status != "failed" || got[0].backend != "stub" || got[0].sessionKey != "session-attempt-1" {
		t.Fatalf("unexpected first execution row: %#v", got[0])
	}
	if got[0].errorMessage == "" {
		t.Fatalf("expected first attempt error message, got %#v", got[0])
	}
	if got[1].attempt != 2 || got[1].status != "completed" || got[1].answerPreview != "final answer" || got[1].sessionKey != "session-attempt-2" {
		t.Fatalf("unexpected second execution row: %#v", got[1])
	}
}
