package broker

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	sessionFilenameSanitizer = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

	// ErrCheckpointMissingForkPoint indicates we could not capture or use a stable fork entry.
	ErrCheckpointMissingForkPoint = errors.New("checkpoint has no fork point")
)

// ForkOpt configures optional overrides for ForkFromCheckpoint.
type ForkOpt func(*forkOpts)

type forkOpts struct {
	workDir string
}

// WithForkWorkDir overrides the working directory for the forked session,
// replacing the (potentially stale) sandbox path stored in the checkpoint.
func WithForkWorkDir(dir string) ForkOpt {
	return func(o *forkOpts) { o.workDir = strings.TrimSpace(dir) }
}

// Execute sends a prompt through the configured engine and writes the result to the ledger.
// It reconstructs conversation history from the ledger (via BuildLedgerHistory) and seeds
// the engine with it, so engines don't need to maintain their own persistent session state.
func (b *Broker) Execute(ctx context.Context, sessionLabel string, prompt string) (*TurnResult, error) {
	return b.executeWithRunID(ctx, sessionLabel, prompt, "run:"+uuid.NewString())
}

func (b *Broker) executeWithRunID(ctx context.Context, sessionLabel string, prompt string, runID string) (*TurnResult, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	sessionLabel = strings.TrimSpace(sessionLabel)
	if sessionLabel == "" {
		return nil, fmt.Errorf("session label is required")
	}
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return nil, fmt.Errorf("prompt is required")
	}

	session, err := b.GetSession(sessionLabel)
	if errors.Is(err, sql.ErrNoRows) {
		session, err = b.CreateSession(sessionLabel, SessionOptions{PersonaID: "main", Origin: "ask"})
	}
	if err != nil {
		return nil, err
	}

	handle, err := b.getOrStartHandle(ctx, session)
	if err != nil {
		return nil, err
	}
	var (
		partialTokenText strings.Builder
		partialAssistant string
	)
	unsubscribeEvents := handle.OnEvent(func(event AgentEvent) {
		switch strings.ToLower(strings.TrimSpace(event.Type)) {
		case "assistant":
			if text := anyToString(event.Data["text"]); strings.TrimSpace(text) != "" {
				partialAssistant = text
			}
		case "token":
			if text := anyToString(event.Data["text"]); strings.TrimSpace(text) != "" {
				partialTokenText.WriteString(text)
			}
		}
		b.emitNormalizedAgentEvent(sessionLabel, runID, event)
	})
	defer unsubscribeEvents()
	b.emitAgentEvent(sessionLabel, AgentEvent{
		Type: "stream_start",
		Data: map[string]interface{}{
			"sessionLabel": sessionLabel,
			"runId":        runID,
		},
	})

	cfg := b.getSessionConfig(sessionLabel)
	turnProvider := strings.TrimSpace(cfg.Provider)
	turnModel := strings.TrimSpace(cfg.Model)
	if state, stateErr := handle.GetState(ctx); stateErr == nil && state != nil {
		if provider := strings.TrimSpace(state.Provider); provider != "" {
			turnProvider = provider
		}
		if model := strings.TrimSpace(state.Model); model != "" {
			turnModel = model
		}
	}

	startedAt := time.Now().UTC()
	turnResult, err := handle.Prompt(ctx, prompt)
	if err != nil {
		toolCalls := engineToolCalls(handle)
		partialContent := strings.TrimSpace(partialAssistant)
		if partialContent == "" {
			partialContent = strings.TrimSpace(partialTokenText.String())
		}
		completedAt := time.Now().UTC()
		terminalStatus := "failed"
		aborted := isAbortedExecutionError(err)
		if aborted {
			terminalStatus = "aborted"
		}
		failedTurnID, persistErr := b.persistTerminalTurn(
			sessionLabel,
			session,
			prompt,
			partialContent,
			startedAt,
			completedAt,
			turnProvider,
			turnModel,
			terminalStatus,
			toolCalls,
			cfg.WorkDir,
		)
		if aborted {
			b.emitAgentEvent(sessionLabel, AgentEvent{
				Type: "stream_end",
				Data: map[string]interface{}{
					"status": "aborted",
					"turnId": failedTurnID,
					"final":  false,
					"runId":  runID,
				},
			})
		} else {
			errorPayload := map[string]interface{}{"error": err.Error()}
			if strings.TrimSpace(failedTurnID) != "" {
				errorPayload["turnId"] = failedTurnID
			}
			errorPayload["partial"] = strings.TrimSpace(partialContent) != ""
			errorPayload["runId"] = runID
			b.emitAgentEvent(sessionLabel, AgentEvent{
				Type: "stream_error",
				Data: errorPayload,
			})
		}
		b.closeAgentEventStreams(sessionLabel)
		_ = handle.Stop(context.Background())
		b.removeHandle(sessionLabel)
		b.emitCompletion(sessionLabel, AgentResult{
			SessionLabel: sessionLabel,
			TurnID:       failedTurnID,
			Status:       terminalStatus,
			Error:        err.Error(),
		})
		if persistErr != nil {
			return nil, errors.Join(err, persistErr)
		}
		return nil, err
	}
	if turnResult == nil {
		turnResult = &TurnResult{}
	}
	if strings.TrimSpace(turnResult.TurnID) == "" {
		turnResult.TurnID = "turn:" + uuid.NewString()
	}
	if strings.TrimSpace(turnResult.MessageID) == "" {
		turnResult.MessageID = turnResult.TurnID + ":assistant"
	}
	if strings.TrimSpace(turnResult.Status) == "" {
		turnResult.Status = "completed"
	}
	if turnResult.CompletedAt.IsZero() {
		turnResult.CompletedAt = time.Now().UTC()
	}
	if turnResult.StartedAt.IsZero() {
		turnResult.StartedAt = startedAt
	}
	toolCalls := engineToolCalls(handle)
	if len(toolCalls) > turnResult.ToolCallCount {
		turnResult.ToolCallCount = len(toolCalls)
	}

	queryMessageID := turnResult.TurnID + ":user:0"
	queryMessageIDsJSON := mustJSON([]string{queryMessageID}, "[]")
	total := turnResult.Usage.TotalTokens
	if total == 0 {
		total = turnResult.Usage.InputTokens + turnResult.Usage.OutputTokens
	}

	parentTurnID := strings.TrimSpace(session.ThreadID)
	if err := b.insertTurn(TurnWrite{
		ID:                  turnResult.TurnID,
		ParentTurnID:        parentTurnID,
		TurnType:            "normal",
		Status:              turnResult.Status,
		StartedAt:           turnResult.StartedAt.UnixMilli(),
		CompletedAt:         int64Ptr(turnResult.CompletedAt.UnixMilli()),
		Model:               turnModel,
		Provider:            turnProvider,
		Role:                "unified",
		InputTokens:         intPtr(turnResult.Usage.InputTokens),
		OutputTokens:        intPtr(turnResult.Usage.OutputTokens),
		CachedInputTokens:   intPtr(turnResult.Usage.CachedInputTokens),
		CacheWriteTokens:    intPtr(turnResult.Usage.CacheWriteTokens),
		ReasoningTokens:     intPtr(turnResult.Usage.ReasoningTokens),
		TotalTokens:         intPtr(total),
		QueryMessageIDsJSON: queryMessageIDsJSON,
		ResponseMessageID:   turnResult.MessageID,
		HasChildren:         false,
		ToolCallCount:       turnResult.ToolCallCount,
		ScopeKey:            session.ScopeKey,
		RefName:             session.RefName,
		CommitSHA:           session.CommitSHA,
		TreeFlavor:          session.TreeFlavor,
		TreeVersionID:       session.TreeVersionID,
	}); err != nil {
		return nil, err
	}

	threadMeta := b.resolveThreadMeta(parentTurnID, turnResult.TurnID, total)
	if err := b.upsertThread(threadMeta); err != nil {
		return nil, err
	}
	if err := b.setSessionThread(sessionLabel, turnResult.TurnID, turnResult.CompletedAt.UnixMilli()); err != nil {
		return nil, err
	}
	if parentTurnID != "" {
		_, _ = db.Exec(`UPDATE turns SET has_children = 1 WHERE id = ? AND has_children = 0`, parentTurnID)
	}

	if err := b.insertMessage(MessageWrite{
		ID:            queryMessageID,
		TurnID:        turnResult.TurnID,
		Role:          "user",
		Content:       prompt,
		Sequence:      0,
		CreatedAt:     turnResult.StartedAt.UnixMilli(),
		ScopeKey:      session.ScopeKey,
		RefName:       session.RefName,
		CommitSHA:     session.CommitSHA,
		TreeFlavor:    session.TreeFlavor,
		TreeVersionID: session.TreeVersionID,
	}); err != nil {
		return nil, err
	}

	if err := b.insertMessage(MessageWrite{
		ID:            turnResult.MessageID,
		TurnID:        turnResult.TurnID,
		Role:          "assistant",
		Content:       strings.TrimSpace(turnResult.Content),
		Sequence:      1,
		CreatedAt:     turnResult.CompletedAt.UnixMilli(),
		ScopeKey:      session.ScopeKey,
		RefName:       session.RefName,
		CommitSHA:     session.CommitSHA,
		TreeFlavor:    session.TreeFlavor,
		TreeVersionID: session.TreeVersionID,
	}); err != nil {
		return nil, err
	}
	if err := b.persistToolCallsForTurn(turnResult.TurnID, turnResult, toolCalls, cfg.WorkDir); err != nil {
		return nil, err
	}

	turnResult.SessionLabel = sessionLabel
	turnResult.ThreadID = turnResult.TurnID
	turnResult.Usage.TotalTokens = total
	b.emitAgentEvent(sessionLabel, AgentEvent{
		Type: "stream_end",
		Data: map[string]interface{}{
			"status": turnResult.Status,
			"turnId": turnResult.TurnID,
			"final":  true,
			"runId":  runID,
		},
	})
	b.closeAgentEventStreams(sessionLabel)

	b.emitCompletion(sessionLabel, AgentResult{SessionLabel: sessionLabel, TurnID: turnResult.TurnID, Status: turnResult.Status})
	return turnResult, nil
}

func (b *Broker) persistTerminalTurn(sessionLabel string, session *LedgerSession, prompt string, partialAssistant string, startedAt time.Time, completedAt time.Time, turnProvider string, turnModel string, status string, toolCalls []engineToolCallSnapshot, workDir string) (string, error) {
	if session == nil {
		return "", fmt.Errorf("session is required for terminal turn persistence")
	}
	if strings.TrimSpace(sessionLabel) == "" {
		return "", fmt.Errorf("session label is required for terminal turn persistence")
	}
	status = strings.ToLower(strings.TrimSpace(status))
	if status == "" {
		status = "failed"
	}
	if status != "failed" && status != "aborted" {
		return "", fmt.Errorf("terminal turn status must be failed or aborted: %q", status)
	}
	turnID := "turn:" + uuid.NewString()
	queryMessageID := turnID + ":user:0"
	assistantMessageID := ""
	if strings.TrimSpace(partialAssistant) != "" {
		assistantMessageID = turnID + ":assistant"
	}
	queryMessageIDsJSON := mustJSON([]string{queryMessageID}, "[]")
	parentTurnID := strings.TrimSpace(session.ThreadID)

	if err := b.insertTurn(TurnWrite{
		ID:                  turnID,
		ParentTurnID:        parentTurnID,
		TurnType:            "normal",
		Status:              status,
		StartedAt:           startedAt.UnixMilli(),
		CompletedAt:         int64Ptr(completedAt.UnixMilli()),
		Model:               turnModel,
		Provider:            turnProvider,
		Role:                "unified",
		QueryMessageIDsJSON: queryMessageIDsJSON,
		ResponseMessageID:   assistantMessageID,
		HasChildren:         false,
		ToolCallCount:       len(toolCalls),
		ScopeKey:            session.ScopeKey,
		RefName:             session.RefName,
		CommitSHA:           session.CommitSHA,
		TreeFlavor:          session.TreeFlavor,
		TreeVersionID:       session.TreeVersionID,
	}); err != nil {
		return "", err
	}

	threadMeta := b.resolveThreadMeta(parentTurnID, turnID, 0)
	if err := b.upsertThread(threadMeta); err != nil {
		return "", err
	}
	if err := b.setSessionThread(sessionLabel, turnID, completedAt.UnixMilli()); err != nil {
		return "", err
	}
	if parentTurnID != "" {
		_, _ = b.ledgerDB().Exec(`UPDATE turns SET has_children = 1 WHERE id = ? AND has_children = 0`, parentTurnID)
	}

	if err := b.insertMessage(MessageWrite{
		ID:            queryMessageID,
		TurnID:        turnID,
		Role:          "user",
		Content:       prompt,
		Sequence:      0,
		CreatedAt:     startedAt.UnixMilli(),
		ScopeKey:      session.ScopeKey,
		RefName:       session.RefName,
		CommitSHA:     session.CommitSHA,
		TreeFlavor:    session.TreeFlavor,
		TreeVersionID: session.TreeVersionID,
	}); err != nil {
		return "", err
	}

	if assistantMessageID != "" {
		if err := b.insertMessage(MessageWrite{
			ID:            assistantMessageID,
			TurnID:        turnID,
			Role:          "assistant",
			Content:       strings.TrimSpace(partialAssistant),
			Sequence:      1,
			CreatedAt:     completedAt.UnixMilli(),
			ScopeKey:      session.ScopeKey,
			RefName:       session.RefName,
			CommitSHA:     session.CommitSHA,
			TreeFlavor:    session.TreeFlavor,
			TreeVersionID: session.TreeVersionID,
		}); err != nil {
			return "", err
		}
	}

	if err := b.persistToolCallsForTurn(turnID, &TurnResult{
		StartedAt:   startedAt,
		CompletedAt: completedAt,
	}, toolCalls, workDir); err != nil {
		return "", err
	}

	return turnID, nil
}

func isAbortedExecutionError(err error) bool {
	if err == nil {
		return false
	}
	return errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)
}

// CaptureCheckpoint stores a fork point for the given session.
// With the ledger-based architecture, this is a pure metadata write — it records
// the session's current thread_id (head turn) as the fork anchor. No engine
// interaction is needed.
func (b *Broker) CaptureCheckpoint(sessionLabel string, name string) (*Checkpoint, error) {
	sessionLabel = strings.TrimSpace(sessionLabel)
	name = strings.TrimSpace(name)
	if sessionLabel == "" || name == "" {
		return nil, fmt.Errorf("session label and checkpoint name are required")
	}
	session, err := b.GetSession(sessionLabel)
	if err != nil {
		return nil, err
	}
	threadID := strings.TrimSpace(session.ThreadID)
	if threadID == "" {
		// No conversation turns yet — nothing to checkpoint.
		return nil, fmt.Errorf("%w: session=%s checkpoint=%s (no thread_id)", ErrCheckpointMissingForkPoint, sessionLabel, name)
	}
	capturedAt := nowUnixMilli()
	if err := b.saveCheckpoint(CheckpointWrite{
		Name:         name,
		SessionLabel: sessionLabel,
		EntryID:      threadID, // Store thread_id as the fork anchor
		CapturedAt:   capturedAt,
	}); err != nil {
		return nil, err
	}
	return b.getCheckpoint(name)
}

// ForkFromCheckpoint creates a new session by forking from a stored checkpoint.
// This is a pure metadata write: the new session's thread_id is set to the
// checkpoint's recorded turn, so that BuildLedgerHistory can reconstruct the
// full conversation when Execute is called on the forked session.
// No engine processes are spawned during fork.
func (b *Broker) ForkFromCheckpoint(ctx context.Context, checkpointName string, forkLabel string, opts ...ForkOpt) (*LedgerSession, error) {
	checkpointName = strings.TrimSpace(checkpointName)
	forkLabel = strings.TrimSpace(forkLabel)
	if checkpointName == "" || forkLabel == "" {
		return nil, fmt.Errorf("checkpoint name and fork label are required")
	}
	cp, err := b.getCheckpoint(checkpointName)
	if err != nil {
		return nil, err
	}
	baseSession, err := b.GetSession(cp.SessionLabel)
	if err != nil {
		return nil, err
	}

	// The checkpoint's EntryID now stores the thread_id (head turn) at checkpoint time.
	forkThreadID := strings.TrimSpace(cp.EntryID)
	if forkThreadID == "" {
		return nil, fmt.Errorf("%w: checkpoint=%s", ErrCheckpointMissingForkPoint, checkpointName)
	}

	cfg := b.getSessionConfig(cp.SessionLabel)
	var fo forkOpts
	for _, o := range opts {
		o(&fo)
	}
	if fo.workDir != "" {
		cfg.WorkDir = fo.workDir
	}

	// Pure metadata write: create a new session with thread_id pointing to the fork point.
	// When Execute is called on this session, BuildLedgerHistory will reconstruct
	// the conversation from this thread_id, and the engine will be seeded with that history.
	session, err := b.CreateSession(forkLabel, SessionOptions{
		PersonaID:          baseSession.PersonaID,
		ParentSessionLabel: baseSession.Label,
		ParentTurnID:       forkThreadID,
		ThreadID:           forkThreadID,
		Origin:             "fork",
		OriginSessionID:    baseSession.Label,
		ScopeKey:           baseSession.ScopeKey,
		RefName:            baseSession.RefName,
		CommitSHA:          baseSession.CommitSHA,
		TreeFlavor:         baseSession.TreeFlavor,
		TreeVersionID:      baseSession.TreeVersionID,
		Status:             "active",
		WorkDir:            cfg.WorkDir,
		Provider:           cfg.Provider,
		Model:              cfg.Model,
		SystemPrompt:       cfg.SystemPrompt,
		Tools:              cfg.Tools,
		ThinkLevel:         cfg.ThinkLevel,
		SessionDir:         cfg.SessionDir,
		Env:                cfg.Env,
		ExtraArgs:          cfg.ExtraArgs,
	})
	if err != nil {
		return nil, err
	}
	return session, nil
}

// ForkSession forks directly from a base session.
// This is a pure metadata write: the new session inherits the base session's
// thread_id so BuildLedgerHistory reconstructs the full conversation on Execute.
func (b *Broker) ForkSession(baseLabel string, forkLabel string, entryID string) (*LedgerSession, error) {
	baseLabel = strings.TrimSpace(baseLabel)
	forkLabel = strings.TrimSpace(forkLabel)
	if baseLabel == "" || forkLabel == "" {
		return nil, fmt.Errorf("base and fork labels are required")
	}
	baseSession, err := b.GetSession(baseLabel)
	if err != nil {
		return nil, err
	}

	cfg := b.getSessionConfig(baseLabel)

	// Use the provided entry ID as the fork point, or fall back to the session's thread_id.
	forkThreadID := strings.TrimSpace(entryID)
	if forkThreadID == "" {
		forkThreadID = strings.TrimSpace(baseSession.ThreadID)
	}

	return b.CreateSession(forkLabel, SessionOptions{
		PersonaID:          baseSession.PersonaID,
		ParentSessionLabel: baseSession.Label,
		ParentTurnID:       forkThreadID,
		ThreadID:           forkThreadID,
		Origin:             "fork",
		OriginSessionID:    baseSession.Label,
		ScopeKey:           baseSession.ScopeKey,
		RefName:            baseSession.RefName,
		CommitSHA:          baseSession.CommitSHA,
		TreeFlavor:         baseSession.TreeFlavor,
		TreeVersionID:      baseSession.TreeVersionID,
		Status:             "active",
		WorkDir:            cfg.WorkDir,
		Provider:           cfg.Provider,
		Model:              cfg.Model,
		SystemPrompt:       cfg.SystemPrompt,
		Tools:              cfg.Tools,
		ThinkLevel:         cfg.ThinkLevel,
		SessionDir:         cfg.SessionDir,
		Env:                cfg.Env,
		ExtraArgs:          cfg.ExtraArgs,
	})
}

// Send enqueues a broker message for orchestration.
func (b *Broker) Send(msg AgentMessage) error {
	if orch := b.Orchestrator(); orch != nil {
		return orch.Send(msg)
	}

	msg.Content = strings.TrimSpace(msg.Content)
	if msg.Content == "" {
		return fmt.Errorf("message content is required")
	}

	label := strings.TrimSpace(msg.SessionLabel)
	if label == "" {
		label = strings.TrimSpace(msg.To)
	}
	if label == "" {
		return fmt.Errorf("session label is required")
	}

	msg.To = label
	msg.SessionLabel = label
	msg.From = strings.TrimSpace(msg.From)
	if msg.From == "" {
		msg.From = "user"
	}
	msg.ID = strings.TrimSpace(msg.ID)
	if msg.ID == "" {
		msg.ID = "queue:" + uuid.NewString()
	}
	if msg.Timestamp.IsZero() {
		msg.Timestamp = time.Now().UTC()
	} else {
		msg.Timestamp = msg.Timestamp.UTC()
	}
	if msg.Priority == "" {
		msg.Priority = PriorityNormal
	}
	switch msg.Priority {
	case PriorityUrgent, PriorityHigh, PriorityNormal, PriorityLow:
	default:
		msg.Priority = PriorityNormal
	}

	if _, err := b.GetSession(label); errors.Is(err, sql.ErrNoRows) {
		if _, err := b.CreateSession(label, SessionOptions{PersonaID: "main", Origin: "queue"}); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}

	mode := strings.TrimSpace(msg.Mode)
	if mode == "" {
		mode = strings.TrimSpace(string(msg.DeliveryMode))
	}
	if mode == "" {
		mode = "queue"
	}
	if strings.EqualFold(mode, string(QueueModeInterrupt)) {
		if err := b.StopSession(label); err != nil {
			return err
		}
	}

	payload := map[string]any{
		"id":              msg.ID,
		"from":            msg.From,
		"to":              msg.To,
		"content":         msg.Content,
		"priority":        msg.Priority,
		"delivery_mode":   mode,
		"timestamp_unix":  msg.Timestamp.UnixMilli(),
		"conversation_id": msg.ConversationID,
		"metadata":        msg.Metadata,
	}

	return b.enqueue(QueueItemWrite{
		ID:           msg.ID,
		SessionLabel: label,
		MessageJSON:  mustJSON(payload, "{}"),
		Mode:         mode,
		Status:       "queued",
		EnqueuedAt:   msg.Timestamp.UnixMilli(),
	})
}

// OnAgentComplete subscribes to completion events for a session label.
func (b *Broker) OnAgentComplete(sessionLabel string) <-chan AgentResult {
	if orch := b.Orchestrator(); orch != nil {
		return orch.OnceAgentCompletes(sessionLabel)
	}

	ch := make(chan AgentResult, 4)
	sessionLabel = strings.TrimSpace(sessionLabel)
	if sessionLabel == "" {
		close(ch)
		return ch
	}
	b.mu.Lock()
	if b.completionSubs == nil {
		b.completionSubs = map[string][]chan AgentResult{}
	}
	b.completionSubs[sessionLabel] = append(b.completionSubs[sessionLabel], ch)
	b.mu.Unlock()
	return ch
}

// OnAgentEvent subscribes to streaming execution events for a session label.
func (b *Broker) OnAgentEvent(sessionLabel string) <-chan AgentEvent {
	ch := make(chan AgentEvent, 16)
	sessionLabel = strings.TrimSpace(sessionLabel)
	if sessionLabel == "" {
		close(ch)
		return ch
	}
	b.mu.Lock()
	if b.eventSubs == nil {
		b.eventSubs = map[string][]chan AgentEvent{}
	}
	b.eventSubs[sessionLabel] = append(b.eventSubs[sessionLabel], ch)
	b.mu.Unlock()
	return ch
}

func (b *Broker) emitCompletion(sessionLabel string, result AgentResult) {
	sessionLabel = strings.TrimSpace(sessionLabel)
	if sessionLabel == "" {
		return
	}
	b.mu.Lock()
	subs := append([]chan AgentResult(nil), b.completionSubs[sessionLabel]...)
	b.mu.Unlock()
	for _, sub := range subs {
		select {
		case sub <- result:
		default:
		}
	}
}

func (b *Broker) emitAgentEvent(sessionLabel string, event AgentEvent) {
	sessionLabel = strings.TrimSpace(sessionLabel)
	if sessionLabel == "" {
		return
	}
	b.mu.Lock()
	subs := b.eventSubs[sessionLabel]
	for _, sub := range subs {
		select {
		case sub <- event:
		default:
		}
	}
	b.mu.Unlock()
}

func (b *Broker) closeAgentEventStreams(sessionLabel string) {
	sessionLabel = strings.TrimSpace(sessionLabel)
	if sessionLabel == "" {
		return
	}
	b.mu.Lock()
	subs := append([]chan AgentEvent(nil), b.eventSubs[sessionLabel]...)
	delete(b.eventSubs, sessionLabel)
	b.mu.Unlock()
	for _, sub := range subs {
		close(sub)
	}
}

func (b *Broker) emitNormalizedAgentEvent(sessionLabel string, runID string, event AgentEvent) {
	etype := strings.ToLower(strings.TrimSpace(event.Type))
	switch etype {
	case "assistant":
		text := strings.TrimSpace(anyToString(event.Data["text"]))
		if text != "" {
			b.emitAgentEvent(sessionLabel, AgentEvent{
				Type: "token",
				Data: withRunID(map[string]interface{}{"text": text}, runID),
			})
		}
		b.emitAgentEvent(sessionLabel, AgentEvent{
			Type: event.Type,
			Data: withRunID(event.Data, runID),
		})
	case "tool":
		payload := map[string]interface{}{}
		for key, value := range event.Data {
			payload[key] = value
		}
		phase := strings.ToLower(strings.TrimSpace(anyToString(payload["phase"])))
		if phase == "" {
			phase = "result"
			payload["phase"] = phase
		}
		status := strings.TrimSpace(anyToString(payload["status"]))
		if status == "" {
			switch phase {
			case "start":
				status = "started"
			default:
				if anyToBool(payload["isError"]) {
					status = "failed"
				} else {
					status = "completed"
				}
			}
		}
		payload["status"] = status
		b.emitAgentEvent(sessionLabel, AgentEvent{
			Type: "tool_status",
			Data: withRunID(payload, runID),
		})
	default:
		b.emitAgentEvent(sessionLabel, AgentEvent{
			Type: event.Type,
			Data: withRunID(event.Data, runID),
		})
	}
}

func withRunID(data map[string]interface{}, runID string) map[string]interface{} {
	payload := map[string]interface{}{}
	for key, value := range data {
		payload[key] = value
	}
	if strings.TrimSpace(runID) != "" {
		if _, exists := payload["runId"]; !exists {
			payload["runId"] = runID
		}
	}
	return payload
}

func anyToString(v interface{}) string {
	switch typed := v.(type) {
	case string:
		return typed
	default:
		return ""
	}
}

func anyToBool(v interface{}) bool {
	switch typed := v.(type) {
	case bool:
		return typed
	default:
		return false
	}
}

func (b *Broker) getOrStartHandle(ctx context.Context, session *LedgerSession) (EngineHandle, error) {
	if session == nil {
		return nil, fmt.Errorf("nil session")
	}
	label := strings.TrimSpace(session.Label)
	if label == "" {
		return nil, fmt.Errorf("session label is required")
	}

	b.mu.Lock()
	handle := b.handles[label]
	engine := b.engine
	cfg := b.sessionConfigs[label]
	b.mu.Unlock()
	if handle != nil {
		return handle, nil
	}
	if engine == nil {
		return nil, fmt.Errorf("broker engine is not configured")
	}

	// Build conversation history from the ledger using the session's thread_id.
	// This is how forked sessions get their parent's conversation pre-loaded.
	threadID := strings.TrimSpace(session.ThreadID)
	if threadID != "" {
		history, err := b.BuildLedgerHistory(threadID)
		if err != nil {
			return nil, fmt.Errorf("failed to build ledger history for session %s: %w", label, err)
		}
		cfg.History = history
	}

	newHandle, err := engine.Start(ctx, cfg)
	if err != nil {
		return nil, err
	}

	b.mu.Lock()
	if existing := b.handles[label]; existing != nil {
		b.mu.Unlock()
		_ = newHandle.Stop(context.Background())
		return existing, nil
	}
	if b.handles == nil {
		b.handles = map[string]EngineHandle{}
	}
	if b.sessionConfigs == nil {
		b.sessionConfigs = map[string]EngineStartOpts{}
	}
	b.handles[label] = newHandle
	b.sessionConfigs[label] = cfg
	b.mu.Unlock()
	return newHandle, nil
}

func (b *Broker) startHandleWithConfig(ctx context.Context, label string, cfg EngineStartOpts) (EngineHandle, error) {
	label = strings.TrimSpace(label)
	if label == "" {
		return nil, fmt.Errorf("session label is required")
	}
	b.mu.Lock()
	engine := b.engine
	b.mu.Unlock()
	if engine == nil {
		return nil, fmt.Errorf("broker engine is not configured")
	}

	handle, err := engine.Start(ctx, cfg)
	if err != nil {
		return nil, err
	}
	b.mu.Lock()
	if b.handles == nil {
		b.handles = map[string]EngineHandle{}
	}
	if b.sessionConfigs == nil {
		b.sessionConfigs = map[string]EngineStartOpts{}
	}
	b.handles[label] = handle
	b.sessionConfigs[label] = cfg
	b.mu.Unlock()
	return handle, nil
}

func (b *Broker) getSessionConfig(label string) EngineStartOpts {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.sessionConfigs == nil {
		return EngineStartOpts{}
	}
	cfg := b.sessionConfigs[label]
	if len(cfg.Tools) > 0 {
		cfg.Tools = append([]string(nil), cfg.Tools...)
	}
	if len(cfg.ExtraArgs) > 0 {
		cfg.ExtraArgs = append([]string(nil), cfg.ExtraArgs...)
	}
	if len(cfg.Env) > 0 {
		dup := make(map[string]string, len(cfg.Env))
		for key, value := range cfg.Env {
			dup[key] = value
		}
		cfg.Env = dup
	}
	return cfg
}

func (b *Broker) removeHandle(label string) {
	label = strings.TrimSpace(label)
	if label == "" {
		return
	}
	b.mu.Lock()
	delete(b.handles, label)
	delete(b.sessionConfigs, label)
	b.mu.Unlock()
}

// StopSession stops and forgets a running engine handle for a session label.
func (b *Broker) StopSession(label string) error {
	label = strings.TrimSpace(label)
	if label == "" {
		return nil
	}
	b.mu.Lock()
	handle := b.handles[label]
	delete(b.handles, label)
	delete(b.sessionConfigs, label)
	b.mu.Unlock()
	if handle == nil {
		return nil
	}
	return handle.Stop(context.Background())
}

// StopSessionsWithPrefix stops and forgets running handles whose labels share a prefix.
func (b *Broker) StopSessionsWithPrefix(prefix string) error {
	prefix = strings.TrimSpace(prefix)
	if prefix == "" {
		return nil
	}
	type target struct {
		label  string
		handle EngineHandle
	}
	targets := []target{}
	b.mu.Lock()
	for label, handle := range b.handles {
		if !strings.HasPrefix(label, prefix) {
			continue
		}
		targets = append(targets, target{label: label, handle: handle})
		delete(b.handles, label)
		delete(b.sessionConfigs, label)
	}
	b.mu.Unlock()

	var firstErr error
	for _, item := range targets {
		if item.handle == nil {
			continue
		}
		if err := item.handle.Stop(context.Background()); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func sanitizeSessionLabel(label string) string {
	label = strings.TrimSpace(label)
	if label == "" {
		return "session"
	}
	cleaned := sessionFilenameSanitizer.ReplaceAllString(label, "-")
	cleaned = strings.Trim(cleaned, "-.")
	if cleaned == "" {
		return "session"
	}
	return cleaned
}

func (b *Broker) resolveThreadMeta(parentTurnID string, turnID string, turnTokens int) ThreadWrite {
	meta := ThreadWrite{TurnID: turnID, ThreadKey: turnID}
	ancestry := []string{turnID}
	depth := 0
	totalTokens := turnTokens
	if parentTurnID != "" {
		row := b.ledgerDB().QueryRow(`SELECT ancestry, depth, total_tokens, persona_id, system_prompt_hash FROM threads WHERE turn_id = ?`, parentTurnID)
		var (
			ancestryRaw      sql.NullString
			parentDepth      sql.NullInt64
			parentTotal      sql.NullInt64
			personaID        sql.NullString
			systemPromptHash sql.NullString
		)
		if err := row.Scan(&ancestryRaw, &parentDepth, &parentTotal, &personaID, &systemPromptHash); err == nil {
			if strings.TrimSpace(ancestryRaw.String) != "" {
				var parsed []string
				if json.Unmarshal([]byte(ancestryRaw.String), &parsed) == nil {
					ancestry = append(parsed, turnID)
				}
			}
			if parentDepth.Valid {
				depth = int(parentDepth.Int64) + 1
			}
			if parentTotal.Valid {
				totalTokens += int(parentTotal.Int64)
			}
			meta.PersonaID = nullString(personaID)
			meta.SystemPromptHash = nullString(systemPromptHash)
		} else {
			ancestry = []string{parentTurnID, turnID}
			depth = 1
		}
	}
	meta.AncestryJSON = mustJSON(ancestry, "[]")
	meta.Depth = intPtr(depth)
	meta.TotalTokens = intPtr(totalTokens)
	return meta
}

func intPtr(v int) *int {
	if v == 0 {
		return nil
	}
	out := v
	return &out
}

func int64Ptr(v int64) *int64 {
	if v == 0 {
		return nil
	}
	out := v
	return &out
}

func engineToolCalls(handle EngineHandle) []engineToolCallSnapshot {
	if provider, ok := handle.(engineToolCallProvider); ok {
		return provider.consumeToolCalls()
	}
	return nil
}

func (b *Broker) persistToolCallsForTurn(turnID string, result *TurnResult, calls []engineToolCallSnapshot, workDir string) error {
	if len(calls) == 0 {
		return nil
	}
	startedAt := nowUnixMilli()
	completedAt := startedAt
	if result != nil {
		if !result.StartedAt.IsZero() {
			startedAt = result.StartedAt.UnixMilli()
		}
		if !result.CompletedAt.IsZero() {
			completedAt = result.CompletedAt.UnixMilli()
		}
	}
	for idx, call := range calls {
		callID := normalizeToolCallID(turnID, call.ID, idx+1)
		status := strings.TrimSpace(call.Status)
		if status == "" {
			status = "pending"
		}
		toolName := strings.TrimSpace(call.ToolName)
		if toolName == "" {
			toolName = "tool"
		}
		var completedAtPtr *int64
		if status == "completed" || status == "failed" {
			completedAtPtr = int64Ptr(completedAt)
		}
		if err := b.insertToolCall(ToolCallWrite{
			ID:                  callID,
			TurnID:              turnID,
			ToolName:            toolName,
			ParamsJSON:          asJSONString(call.ParamsJSON),
			ResultJSON:          strings.TrimSpace(call.ResultJSON),
			Error:               strings.TrimSpace(call.Error),
			Status:              status,
			SpawnedSessionLabel: strings.TrimSpace(call.SpawnedSessionLabel),
			StartedAt:           startedAt,
			CompletedAt:         completedAtPtr,
			Sequence:            idx + 1,
		}); err != nil {
			return err
		}
		artifactCreatedAt := startedAt
		if completedAtPtr != nil {
			artifactCreatedAt = *completedAtPtr
		}
		if err := b.persistToolCallArtifacts(callID, call, workDir, artifactCreatedAt); err != nil {
			return err
		}
	}
	return nil
}

func normalizeToolCallID(turnID string, raw string, seq int) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fmt.Sprintf("%s:tool:%d", turnID, seq)
	}
	raw = strings.ReplaceAll(raw, " ", "_")
	if strings.HasPrefix(raw, turnID+":") {
		return raw
	}
	return turnID + ":" + raw
}
