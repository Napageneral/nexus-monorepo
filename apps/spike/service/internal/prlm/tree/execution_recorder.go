package tree

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

type AskExecutionRecorder interface {
	RecordPromptExecution(ctx context.Context, record AskPromptExecutionRecord) error
}

type AskPromptExecutionRecord struct {
	RequestID     string
	NodeID        string
	Phase         AskPhase
	Attempt       int
	Origin        string
	Status        string
	Backend       string
	SessionKey    string
	RunID         string
	WorkingDir    string
	AnswerPreview string
	ErrorMessage  string
	StartedAt     int64
	CompletedAt   int64
}

type sqlAskExecutionRecorder struct {
	db *sql.DB
}

func newSQLAskExecutionRecorder(db *sql.DB) AskExecutionRecorder {
	if db == nil {
		return nil
	}
	return &sqlAskExecutionRecorder{db: db}
}

func (r *sqlAskExecutionRecorder) RecordPromptExecution(ctx context.Context, record AskPromptExecutionRecord) error {
	if r == nil || r.db == nil {
		return nil
	}
	if strings.TrimSpace(record.RequestID) == "" || strings.TrimSpace(record.NodeID) == "" {
		return nil
	}
	if record.Attempt <= 0 {
		record.Attempt = 1
	}
	if record.StartedAt <= 0 {
		record.StartedAt = time.Now().UTC().UnixMilli()
	}
	if record.CompletedAt <= 0 {
		record.CompletedAt = record.StartedAt
	}
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO ask_request_executions (
			request_id, node_id, phase, attempt, origin, status, execution_backend,
			session_key, run_id, working_dir, answer_preview, error_message, started_at, completed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(request_id, node_id, phase, attempt) DO UPDATE SET
			origin=excluded.origin,
			status=excluded.status,
			execution_backend=excluded.execution_backend,
			session_key=excluded.session_key,
			run_id=excluded.run_id,
			working_dir=excluded.working_dir,
			answer_preview=excluded.answer_preview,
			error_message=excluded.error_message,
			started_at=excluded.started_at,
			completed_at=excluded.completed_at
	`,
		strings.TrimSpace(record.RequestID),
		strings.TrimSpace(record.NodeID),
		strings.TrimSpace(string(record.Phase)),
		record.Attempt,
		strings.TrimSpace(record.Origin),
		strings.TrimSpace(record.Status),
		strings.TrimSpace(record.Backend),
		strings.TrimSpace(record.SessionKey),
		strings.TrimSpace(record.RunID),
		strings.TrimSpace(record.WorkingDir),
		truncateAskPreview(record.AnswerPreview),
		strings.TrimSpace(record.ErrorMessage),
		record.StartedAt,
		record.CompletedAt,
	)
	return err
}

func executionStatusForError(err error) string {
	if err == nil {
		return "completed"
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return "cancelled"
	}
	return "failed"
}
