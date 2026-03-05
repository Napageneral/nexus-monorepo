package broker

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// SpawnMeeseeks creates a one-shot worker session, executes it, and returns the result.
func (o *Orchestrator) SpawnMeeseeks(ctx context.Context, opts MeeseeksOpts) (*MeeseeksResult, error) {
	if o == nil || o.broker == nil {
		return nil, fmt.Errorf("orchestrator broker is not configured")
	}
	if !o.opts.Features.EnableMeeseeks {
		return nil, fmt.Errorf("meeseeks feature is disabled")
	}
	task := strings.TrimSpace(opts.Task)
	if task == "" {
		return nil, fmt.Errorf("meeseeks task is required")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	base := strings.TrimSpace(opts.BaseSessionLabel)
	labelHint := sanitizeSessionLabel(base)
	if labelHint == "" {
		labelHint = "root"
	}
	label := fmt.Sprintf("meeseeks:%s:%s", labelHint, uuid.NewString()[:8])

	sessionOpts := SessionOptions{
		PersonaID:          "meeseeks",
		IsSubagent:         true,
		ParentSessionLabel: base,
		TaskDescription:    task,
		TaskStatus:         "running",
		Origin:             "meeseeks",
		OriginSessionID:    base,
		Status:             "active",
	}
	if opts.MaxTurns > 0 {
		sessionOpts.ExtraArgs = []string{"--max-turns", fmt.Sprintf("%d", opts.MaxTurns)}
	}

	var (
		session *LedgerSession
		err     error
	)
	if base != "" {
		session, err = o.broker.ForkSession(base, label, "")
		if err != nil {
			// Fallback for engines without native forking.
			if errors.Is(err, ErrUnsupported) || errors.Is(err, sql.ErrNoRows) {
				session, err = o.broker.CreateSession(label, sessionOpts)
			}
		}
	} else {
		session, err = o.broker.CreateSession(label, sessionOpts)
	}
	if err != nil {
		return nil, err
	}

	turn, err := o.broker.Execute(ctx, session.Label, task)
	if err != nil {
		_ = o.setSessionTaskStatus(session.Label, "failed", "failed")
		return nil, err
	}

	if opts.Ephemeral {
		_ = o.setSessionTaskStatus(session.Label, "complete", "ephemeral")
	} else {
		_ = o.setSessionTaskStatus(session.Label, "complete", "complete")
	}

	out := &MeeseeksResult{
		SessionLabel: session.Label,
		CompletedAt:  time.Now().UTC(),
	}
	if turn != nil {
		out.TurnID = strings.TrimSpace(turn.TurnID)
		out.Content = strings.TrimSpace(turn.Content)
		if !turn.CompletedAt.IsZero() {
			out.CompletedAt = turn.CompletedAt.UTC()
		}
	}
	return out, nil
}

func (o *Orchestrator) setSessionTaskStatus(label string, taskStatus string, status string) error {
	if o == nil || o.broker == nil || o.broker.ledgerDB() == nil {
		return nil
	}
	label = strings.TrimSpace(label)
	if label == "" {
		return nil
	}
	taskStatus = strings.TrimSpace(taskStatus)
	if taskStatus == "" {
		taskStatus = "complete"
	}
	status = strings.TrimSpace(status)
	if status == "" {
		status = "complete"
	}
	_, err := o.broker.ledgerDB().Exec(`
		UPDATE sessions
		SET task_status = ?, status = ?, updated_at = ?
		WHERE label = ?
	`, taskStatus, status, nowUnixMilli(), label)
	return err
}
