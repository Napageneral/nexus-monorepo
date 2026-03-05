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

// ResolveSessionLabel resolves a user-facing session key to a concrete session label.
// It first matches by label, then by thread_id.
func (b *Broker) ResolveSessionLabel(key string) (string, error) {
	db := b.ledgerDB()
	if db == nil {
		return "", fmt.Errorf("broker ledger is not configured")
	}
	key = strings.TrimSpace(key)
	if key == "" {
		return "", fmt.Errorf("session key is required")
	}

	var label string
	err := db.QueryRow(
		`SELECT label FROM sessions WHERE status != 'deleted' AND label = ? LIMIT 1`,
		key,
	).Scan(&label)
	if err == nil {
		return label, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}

	err = db.QueryRow(
		`SELECT label FROM sessions WHERE status != 'deleted' AND thread_id = ? ORDER BY updated_at DESC LIMIT 1`,
		key,
	).Scan(&label)
	if err != nil {
		return "", err
	}
	return label, nil
}

// PreviewSessions returns compact recent message previews for the provided keys.
func (b *Broker) PreviewSessions(keys []string, limit int, maxChars int) ([]SessionPreview, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	if limit <= 0 {
		limit = 12
	}
	if maxChars <= 0 {
		maxChars = 240
	}
	if maxChars < 20 {
		maxChars = 20
	}

	out := make([]SessionPreview, 0, len(keys))
	for _, raw := range keys {
		key := strings.TrimSpace(raw)
		if key == "" {
			continue
		}
		preview := SessionPreview{
			Key:    key,
			Status: "missing",
			Items:  []SessionPreviewItem{},
		}
		label, err := b.ResolveSessionLabel(key)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				out = append(out, preview)
				continue
			}
			return nil, err
		}

		rows, err := db.Query(`
			WITH RECURSIVE chain(id, parent_turn_id) AS (
				SELECT t.id, t.parent_turn_id
				FROM sessions s
				JOIN turns t ON t.id = s.thread_id
				WHERE s.label = ?
				UNION ALL
				SELECT p.id, p.parent_turn_id
				FROM turns p
				JOIN chain c ON c.parent_turn_id = p.id
			)
			SELECT m.role, m.content, m.created_at
			FROM chain c
			JOIN messages m ON m.turn_id = c.id
			WHERE m.content IS NOT NULL AND TRIM(m.content) != ''
			ORDER BY m.created_at DESC
			LIMIT ?
		`, label, limit)
		if err != nil {
			return nil, err
		}

		items := make([]SessionPreviewItem, 0)
		for rows.Next() {
			var (
				item      SessionPreviewItem
				content   sql.NullString
				createdAt int64
			)
			if err := rows.Scan(&item.Role, &content, &createdAt); err != nil {
				_ = rows.Close()
				return nil, err
			}
			item.Content = truncatePreviewContent(nullString(content), maxChars)
			item.CreatedAt = fromUnixMilli(createdAt)
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			return nil, err
		}
		_ = rows.Close()

		preview.Items = items
		if len(items) > 0 {
			preview.Status = "ok"
		} else {
			preview.Status = "empty"
		}
		out = append(out, preview)
	}
	return out, nil
}

func truncatePreviewContent(content string, maxChars int) string {
	content = strings.TrimSpace(content)
	if content == "" {
		return ""
	}
	if maxChars <= 0 {
		return content
	}
	runes := []rune(content)
	if len(runes) <= maxChars {
		return content
	}
	if maxChars <= 3 {
		return string(runes[:maxChars])
	}
	return string(runes[:maxChars-3]) + "..."
}

// ResetSession clears thread state for a session and marks it active.
func (b *Broker) ResetSession(key string) (string, error) {
	db := b.ledgerDB()
	if db == nil {
		return "", fmt.Errorf("broker ledger is not configured")
	}
	label, err := b.ResolveSessionLabel(key)
	if err != nil {
		return "", err
	}
	now := nowUnixMilli()
	_, err = db.Exec(
		`UPDATE sessions SET thread_id = NULL, updated_at = ?, status = 'active' WHERE label = ?`,
		now,
		label,
	)
	if err != nil {
		return "", err
	}
	return label, nil
}

// DeleteSession marks a session as deleted.
func (b *Broker) DeleteSession(key string) (string, error) {
	db := b.ledgerDB()
	if db == nil {
		return "", fmt.Errorf("broker ledger is not configured")
	}
	label, err := b.ResolveSessionLabel(key)
	if err != nil {
		return "", err
	}
	now := nowUnixMilli()
	_, err = db.Exec(
		`UPDATE sessions SET status = 'deleted', updated_at = ? WHERE label = ?`,
		now,
		label,
	)
	if err != nil {
		return "", err
	}
	return label, nil
}

// PatchSession updates mutable session metadata fields.
func (b *Broker) PatchSession(key string, patch SessionPatch) (string, error) {
	db := b.ledgerDB()
	if db == nil {
		return "", fmt.Errorf("broker ledger is not configured")
	}
	label, err := b.ResolveSessionLabel(key)
	if err != nil {
		return "", err
	}

	sets := []string{"updated_at = ?"}
	args := []any{nowUnixMilli()}

	if patch.PersonaID != nil {
		persona := strings.TrimSpace(*patch.PersonaID)
		if persona == "" {
			return "", fmt.Errorf("persona_id must be non-empty when patched")
		}
		sets = append(sets, "persona_id = ?")
		args = append(args, persona)
	}
	if patch.TaskDescription != nil {
		sets = append(sets, "task_description = ?")
		args = append(args, nullIfBlank(*patch.TaskDescription))
	}
	if patch.TaskStatus != nil {
		sets = append(sets, "task_status = ?")
		args = append(args, nullIfBlank(*patch.TaskStatus))
	}
	if patch.RoutingKey != nil {
		sets = append(sets, "routing_key = ?")
		args = append(args, nullIfBlank(*patch.RoutingKey))
	}
	if patch.Status != nil {
		status := strings.TrimSpace(*patch.Status)
		if status == "" {
			return "", fmt.Errorf("status must be non-empty when patched")
		}
		sets = append(sets, "status = ?")
		args = append(args, status)
	}

	if len(sets) == 1 {
		return "", fmt.Errorf("at least one mutable field is required")
	}

	args = append(args, label)
	query := `UPDATE sessions SET ` + strings.Join(sets, ", ") + ` WHERE label = ?`
	if _, err := db.Exec(query, args...); err != nil {
		return "", err
	}
	return label, nil
}

// CompactSession performs manual compaction for a session and persists the compaction turn.
func (b *Broker) CompactSession(ctx context.Context, key string, instructions string) (string, *CompactionResult, error) {
	db := b.ledgerDB()
	if db == nil {
		return "", nil, fmt.Errorf("broker ledger is not configured")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	label, err := b.ResolveSessionLabel(key)
	if err != nil {
		return "", nil, err
	}
	session, err := b.GetSession(label)
	if err != nil {
		return "", nil, err
	}
	if strings.TrimSpace(session.ThreadID) == "" {
		return "", nil, fmt.Errorf("cannot compact session %s: no thread_id", label)
	}

	handle, err := b.getOrStartHandle(ctx, session)
	if err != nil {
		return "", nil, err
	}

	startedAt := time.Now().UTC()
	result, err := handle.Compact(ctx, strings.TrimSpace(instructions))
	if err != nil {
		return "", nil, err
	}
	if result == nil {
		return "", nil, fmt.Errorf("engine returned nil compaction result")
	}
	summary := strings.TrimSpace(result.Summary)
	if summary == "" {
		return "", nil, fmt.Errorf("engine returned empty compaction summary")
	}
	completedAt := time.Now().UTC()
	if result.DurationMS <= 0 {
		result.DurationMS = int(completedAt.Sub(startedAt).Milliseconds())
	}

	parentTurnID := strings.TrimSpace(session.ThreadID)
	turnID := "turn:" + uuid.NewString()
	cfg := b.getSessionConfig(label)
	model := strings.TrimSpace(cfg.Model)
	if model == "" {
		model = "go-agent"
	}
	provider := strings.TrimSpace(cfg.Provider)
	totalTokens := result.TokensAfter
	if totalTokens <= 0 {
		totalTokens = result.TokensBefore
	}
	firstKeptTurnID := strings.TrimSpace(result.FirstKeptEntry)
	if firstKeptTurnID != "" {
		var count int
		if err := db.QueryRow(`SELECT COUNT(*) FROM turns WHERE id = ?`, firstKeptTurnID).Scan(&count); err != nil || count == 0 {
			firstKeptTurnID = ""
		}
	}

	if err := b.insertTurn(TurnWrite{
		ID:            turnID,
		ParentTurnID:  parentTurnID,
		TurnType:      "compaction",
		Status:        "completed",
		StartedAt:     startedAt.UnixMilli(),
		CompletedAt:   int64Ptr(completedAt.UnixMilli()),
		Model:         model,
		Provider:      provider,
		Role:          "unified",
		TotalTokens:   intPtr(totalTokens),
		ScopeKey:      session.ScopeKey,
		RefName:       session.RefName,
		CommitSHA:     session.CommitSHA,
		TreeFlavor:    session.TreeFlavor,
		TreeVersionID: session.TreeVersionID,
	}); err != nil {
		return "", nil, err
	}

	if err := b.insertCompaction(CompactionWrite{
		TurnID:                  turnID,
		Summary:                 summary,
		SummarizedThroughTurnID: parentTurnID,
		FirstKeptTurnID:         firstKeptTurnID,
		CompactionType:          "summary",
		Model:                   model,
		Provider:                provider,
		TokensBefore:            intPtr(result.TokensBefore),
		TokensAfter:             intPtr(result.TokensAfter),
		DurationMS:              intPtr(result.DurationMS),
		Trigger:                 "manual",
		ScopeKey:                session.ScopeKey,
		RefName:                 session.RefName,
		CommitSHA:               session.CommitSHA,
		TreeFlavor:              session.TreeFlavor,
		TreeVersionID:           session.TreeVersionID,
	}); err != nil {
		return "", nil, err
	}

	threadMeta := b.resolveThreadMeta(parentTurnID, turnID, totalTokens)
	if err := b.upsertThread(threadMeta); err != nil {
		return "", nil, err
	}
	if err := b.setSessionThread(label, turnID, completedAt.UnixMilli()); err != nil {
		return "", nil, err
	}
	if parentTurnID != "" {
		_, _ = db.Exec(`UPDATE turns SET has_children = 1 WHERE id = ? AND has_children = 0`, parentTurnID)
	}

	return label, result, nil
}
