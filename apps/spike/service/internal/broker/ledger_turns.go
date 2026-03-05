package broker

import (
	"database/sql"
	"fmt"
	"strings"
)

func (b *Broker) insertTurn(turn TurnWrite) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if strings.TrimSpace(turn.ID) == "" {
		return fmt.Errorf("turn id is required")
	}
	if turn.StartedAt <= 0 {
		turn.StartedAt = nowUnixMilli()
	}
	if strings.TrimSpace(turn.TurnType) == "" {
		turn.TurnType = "normal"
	}
	if strings.TrimSpace(turn.Status) == "" {
		turn.Status = "pending"
	}
	if strings.TrimSpace(turn.Role) == "" {
		turn.Role = "unified"
	}
	scope := normalizeLedgerScope(LedgerScope{
		ScopeKey:      turn.ScopeKey,
		RefName:       turn.RefName,
		CommitSHA:     turn.CommitSHA,
		TreeFlavor:    turn.TreeFlavor,
		TreeVersionID: turn.TreeVersionID,
	}, b.defaultLedgerScope())
	if strings.TrimSpace(turn.ParentTurnID) != "" {
		if parentScope, err := b.turnScope(turn.ParentTurnID); err == nil {
			scope = normalizeLedgerScope(scope, parentScope)
		}
	}

	_, err := db.Exec(`
		INSERT INTO turns (
			id, parent_turn_id, turn_type, status, started_at, completed_at, model, provider, role,
			toolset_name, tools_available, permissions_granted, permissions_used, effective_config_json,
			input_tokens, output_tokens, cached_input_tokens, cache_write_tokens, reasoning_tokens, total_tokens,
			query_message_ids, response_message_id, has_children, tool_call_count, source_event_id, workspace_path,
			scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		turn.ID,
		nullIfBlank(turn.ParentTurnID),
		turn.TurnType,
		turn.Status,
		turn.StartedAt,
		nullInt64Ptr(turn.CompletedAt),
		nullIfBlank(turn.Model),
		nullIfBlank(turn.Provider),
		turn.Role,
		nullIfBlank(turn.ToolsetName),
		nullIfBlank(turn.ToolsAvailableJSON),
		nullIfBlank(turn.PermissionsJSON),
		nullIfBlank(turn.PermissionsUsedJSON),
		nullIfBlank(turn.EffectiveConfigJSON),
		nullIntPtr(turn.InputTokens),
		nullIntPtr(turn.OutputTokens),
		nullIntPtr(turn.CachedInputTokens),
		nullIntPtr(turn.CacheWriteTokens),
		nullIntPtr(turn.ReasoningTokens),
		nullIntPtr(turn.TotalTokens),
		nullIfBlank(turn.QueryMessageIDsJSON),
		nullIfBlank(turn.ResponseMessageID),
		boolToSQLite(turn.HasChildren),
		turn.ToolCallCount,
		nullIfBlank(turn.SourceEventID),
		nullIfBlank(turn.WorkspacePath),
		scope.ScopeKey,
		scope.RefName,
		scope.CommitSHA,
		scope.TreeFlavor,
		scope.TreeVersionID,
	)
	return err
}

func (b *Broker) upsertThread(thread ThreadWrite) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if strings.TrimSpace(thread.TurnID) == "" {
		return fmt.Errorf("thread turn id is required")
	}
	_, err := db.Exec(`
		INSERT INTO threads (turn_id, ancestry, total_tokens, depth, persona_id, system_prompt_hash, thread_key)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(turn_id) DO UPDATE SET
			ancestry = COALESCE(excluded.ancestry, threads.ancestry),
			total_tokens = COALESCE(excluded.total_tokens, threads.total_tokens),
			depth = COALESCE(excluded.depth, threads.depth),
			persona_id = COALESCE(excluded.persona_id, threads.persona_id),
			system_prompt_hash = COALESCE(excluded.system_prompt_hash, threads.system_prompt_hash),
			thread_key = COALESCE(excluded.thread_key, threads.thread_key)
	`,
		thread.TurnID,
		nullIfBlank(thread.AncestryJSON),
		nullIntPtr(thread.TotalTokens),
		nullIntPtr(thread.Depth),
		nullIfBlank(thread.PersonaID),
		nullIfBlank(thread.SystemPromptHash),
		nullIfBlank(thread.ThreadKey),
	)
	return err
}

func (b *Broker) insertMessage(msg MessageWrite) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if strings.TrimSpace(msg.ID) == "" || strings.TrimSpace(msg.TurnID) == "" {
		return fmt.Errorf("message id and turn id are required")
	}
	if strings.TrimSpace(msg.Role) == "" {
		msg.Role = "assistant"
	}
	if msg.CreatedAt <= 0 {
		msg.CreatedAt = nowUnixMilli()
	}
	scope := normalizeLedgerScope(LedgerScope{
		ScopeKey:      msg.ScopeKey,
		RefName:       msg.RefName,
		CommitSHA:     msg.CommitSHA,
		TreeFlavor:    msg.TreeFlavor,
		TreeVersionID: msg.TreeVersionID,
	}, b.defaultLedgerScope())
	if turnScope, err := b.turnScope(msg.TurnID); err == nil {
		scope = normalizeLedgerScope(scope, turnScope)
	}
	_, err := db.Exec(`
		INSERT INTO messages (
			id, turn_id, role, content, source, sequence, created_at, thinking, context_json, metadata_json,
			scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		msg.ID,
		msg.TurnID,
		msg.Role,
		nullIfBlank(msg.Content),
		nullIfBlank(msg.Source),
		msg.Sequence,
		msg.CreatedAt,
		nullIfBlank(msg.Thinking),
		nullIfBlank(msg.ContextJSON),
		nullIfBlank(msg.MetadataJSON),
		scope.ScopeKey,
		scope.RefName,
		scope.CommitSHA,
		scope.TreeFlavor,
		scope.TreeVersionID,
	)
	return err
}

func (b *Broker) insertToolCall(call ToolCallWrite) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if strings.TrimSpace(call.ID) == "" || strings.TrimSpace(call.TurnID) == "" {
		return fmt.Errorf("tool call id and turn id are required")
	}
	if strings.TrimSpace(call.ToolName) == "" {
		return fmt.Errorf("tool call tool name is required")
	}
	if call.StartedAt <= 0 {
		call.StartedAt = nowUnixMilli()
	}
	if strings.TrimSpace(call.Status) == "" {
		call.Status = "pending"
	}
	scope := normalizeLedgerScope(LedgerScope{
		ScopeKey:      call.ScopeKey,
		RefName:       call.RefName,
		CommitSHA:     call.CommitSHA,
		TreeFlavor:    call.TreeFlavor,
		TreeVersionID: call.TreeVersionID,
	}, b.defaultLedgerScope())
	if turnScope, err := b.turnScope(call.TurnID); err == nil {
		scope = normalizeLedgerScope(scope, turnScope)
	}
	_, err := db.Exec(`
		INSERT INTO tool_calls (
			id, turn_id, message_id, tool_name, tool_number, params_json, result_json, error,
			status, spawned_session_label, started_at, completed_at, sequence,
			scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		call.ID,
		call.TurnID,
		nullIfBlank(call.MessageID),
		call.ToolName,
		nullIntPtr(call.ToolNumber),
		asJSONString(call.ParamsJSON),
		nullIfBlank(call.ResultJSON),
		nullIfBlank(call.Error),
		call.Status,
		nullIfBlank(call.SpawnedSessionLabel),
		call.StartedAt,
		nullInt64Ptr(call.CompletedAt),
		call.Sequence,
		scope.ScopeKey,
		scope.RefName,
		scope.CommitSHA,
		scope.TreeFlavor,
		scope.TreeVersionID,
	)
	return err
}

func (b *Broker) GetSessionHistory(label string) ([]*LedgerTurn, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	label = strings.TrimSpace(label)
	if label == "" {
		return nil, fmt.Errorf("session label is required")
	}

	rows, err := db.Query(`
		WITH RECURSIVE chain(id, parent_turn_id, depth) AS (
			SELECT t.id, t.parent_turn_id, 0
			FROM sessions s
			JOIN turns t ON t.id = s.thread_id
			WHERE s.label = ?
			UNION ALL
			SELECT p.id, p.parent_turn_id, depth + 1
			FROM turns p
			JOIN chain c ON c.parent_turn_id = p.id
		)
		SELECT t.id, t.parent_turn_id, t.turn_type, t.status, t.started_at, t.completed_at,
		       t.model, t.provider, t.role, t.toolset_name, t.tools_available, t.effective_config_json,
		       t.input_tokens, t.output_tokens, t.cached_input_tokens, t.cache_write_tokens,
		       t.reasoning_tokens, t.total_tokens, t.query_message_ids, t.response_message_id,
		       t.has_children, t.tool_call_count, t.source_event_id, t.workspace_path,
		       t.scope_key, t.ref_name, t.commit_sha, t.tree_flavor, t.tree_version_id
		FROM chain c
		JOIN turns t ON t.id = c.id
		ORDER BY c.depth DESC
	`, label)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*LedgerTurn
	for rows.Next() {
		turn, err := scanLedgerTurn(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, turn)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (b *Broker) GetTurnDetails(turnID string) (*LedgerTurn, []*LedgerMessage, []*LedgerToolCall, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, nil, nil, fmt.Errorf("broker ledger is not configured")
	}
	turnID = strings.TrimSpace(turnID)
	if turnID == "" {
		return nil, nil, nil, fmt.Errorf("turn id is required")
	}

	turnRow := db.QueryRow(`
		SELECT id, parent_turn_id, turn_type, status, started_at, completed_at,
		       model, provider, role, toolset_name, tools_available, effective_config_json,
		       input_tokens, output_tokens, cached_input_tokens, cache_write_tokens,
		       reasoning_tokens, total_tokens, query_message_ids, response_message_id,
		       has_children, tool_call_count, source_event_id, workspace_path,
		       scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		FROM turns WHERE id = ?
	`, turnID)
	turn, err := scanLedgerTurn(turnRow)
	if err != nil {
		return nil, nil, nil, err
	}

	messagesRows, err := db.Query(`
		SELECT id, turn_id, role, content, source, sequence, created_at, thinking, context_json, metadata_json,
		       scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		FROM messages WHERE turn_id = ? ORDER BY sequence
	`, turnID)
	if err != nil {
		return nil, nil, nil, err
	}
	defer messagesRows.Close()
	messages := make([]*LedgerMessage, 0)
	for messagesRows.Next() {
		msg, err := scanLedgerMessage(messagesRows)
		if err != nil {
			return nil, nil, nil, err
		}
		messages = append(messages, msg)
	}
	if err := messagesRows.Err(); err != nil {
		return nil, nil, nil, err
	}

	toolRows, err := db.Query(`
		SELECT id, turn_id, message_id, tool_name, tool_number, params_json, result_json,
		       error, status, spawned_session_label, started_at, completed_at, sequence,
		       scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		FROM tool_calls WHERE turn_id = ? ORDER BY sequence
	`, turnID)
	if err != nil {
		return nil, nil, nil, err
	}
	defer toolRows.Close()
	calls := make([]*LedgerToolCall, 0)
	for toolRows.Next() {
		call, err := scanLedgerToolCall(toolRows)
		if err != nil {
			return nil, nil, nil, err
		}
		calls = append(calls, call)
	}
	if err := toolRows.Err(); err != nil {
		return nil, nil, nil, err
	}

	return turn, messages, calls, nil
}

func (b *Broker) GetSessionStats(label string) (*SessionStats, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	label = strings.TrimSpace(label)
	if label == "" {
		return nil, fmt.Errorf("session label is required")
	}

	row := db.QueryRow(`
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
		SELECT
			COUNT(1),
			COALESCE(SUM(COALESCE(t.input_tokens, 0)), 0),
			COALESCE(SUM(COALESCE(t.output_tokens, 0)), 0),
			COALESCE(SUM(COALESCE(t.cached_input_tokens, 0)), 0),
			COALESCE(SUM(COALESCE(t.cache_write_tokens, 0)), 0),
			COALESCE(SUM(COALESCE(t.reasoning_tokens, 0)), 0),
			COALESCE(SUM(COALESCE(t.total_tokens, 0)), 0)
		FROM chain c
		JOIN turns t ON t.id = c.id
	`, label)

	stats := &SessionStats{}
	if err := row.Scan(
		&stats.TurnCount,
		&stats.InputTokens,
		&stats.OutputTokens,
		&stats.CachedInputTokens,
		&stats.CacheWriteTokens,
		&stats.ReasoningTokens,
		&stats.TotalTokens,
	); err != nil {
		return nil, err
	}
	return stats, nil
}

func scanLedgerTurn(scanner interface{ Scan(dest ...any) error }) (*LedgerTurn, error) {
	var (
		turn              LedgerTurn
		parentTurnID      sql.NullString
		completedAt       sql.NullInt64
		model             sql.NullString
		provider          sql.NullString
		toolsetName       sql.NullString
		toolsAvailable    sql.NullString
		effectiveConfig   sql.NullString
		inputTokens       sql.NullInt64
		outputTokens      sql.NullInt64
		cachedInputTokens sql.NullInt64
		cacheWriteTokens  sql.NullInt64
		reasoningTokens   sql.NullInt64
		totalTokens       sql.NullInt64
		queryMessageIDs   sql.NullString
		responseMessageID sql.NullString
		hasChildren       int64
		toolCallCount     sql.NullInt64
		sourceEventID     sql.NullString
		workspacePath     sql.NullString
		scopeKey          string
		refName           string
		commitSHA         string
		treeFlavor        string
		treeVersionID     string
		startedAt         int64
	)
	if err := scanner.Scan(
		&turn.ID,
		&parentTurnID,
		&turn.TurnType,
		&turn.Status,
		&startedAt,
		&completedAt,
		&model,
		&provider,
		&turn.Role,
		&toolsetName,
		&toolsAvailable,
		&effectiveConfig,
		&inputTokens,
		&outputTokens,
		&cachedInputTokens,
		&cacheWriteTokens,
		&reasoningTokens,
		&totalTokens,
		&queryMessageIDs,
		&responseMessageID,
		&hasChildren,
		&toolCallCount,
		&sourceEventID,
		&workspacePath,
		&scopeKey,
		&refName,
		&commitSHA,
		&treeFlavor,
		&treeVersionID,
	); err != nil {
		return nil, err
	}
	turn.ParentTurnID = nullString(parentTurnID)
	turn.CompletedAt = fromNullUnixMilli(completedAt)
	turn.Model = nullString(model)
	turn.Provider = nullString(provider)
	turn.ToolsetName = nullString(toolsetName)
	turn.ToolsAvailableJSON = nullString(toolsAvailable)
	turn.EffectiveConfigJSON = nullString(effectiveConfig)
	turn.InputTokens = int(inputTokens.Int64)
	turn.OutputTokens = int(outputTokens.Int64)
	turn.CachedInputTokens = int(cachedInputTokens.Int64)
	turn.CacheWriteTokens = int(cacheWriteTokens.Int64)
	turn.ReasoningTokens = int(reasoningTokens.Int64)
	turn.TotalTokens = int(totalTokens.Int64)
	turn.QueryMessageIDsJSON = nullString(queryMessageIDs)
	turn.ResponseMessageID = nullString(responseMessageID)
	turn.HasChildren = sqliteToBool(hasChildren)
	turn.ToolCallCount = int(toolCallCount.Int64)
	turn.SourceEventID = nullString(sourceEventID)
	turn.WorkspacePath = nullString(workspacePath)
	turn.ScopeKey = strings.TrimSpace(scopeKey)
	turn.RefName = strings.TrimSpace(refName)
	turn.CommitSHA = strings.TrimSpace(commitSHA)
	turn.TreeFlavor = strings.TrimSpace(treeFlavor)
	turn.TreeVersionID = strings.TrimSpace(treeVersionID)
	turn.StartedAt = fromUnixMilli(startedAt)
	return &turn, nil
}

func scanLedgerMessage(scanner interface{ Scan(dest ...any) error }) (*LedgerMessage, error) {
	var (
		msg           LedgerMessage
		content       sql.NullString
		source        sql.NullString
		createdAt     int64
		thinking      sql.NullString
		contextJSON   sql.NullString
		metadataJSON  sql.NullString
		scopeKey      string
		refName       string
		commitSHA     string
		treeFlavor    string
		treeVersionID string
	)
	if err := scanner.Scan(
		&msg.ID,
		&msg.TurnID,
		&msg.Role,
		&content,
		&source,
		&msg.Sequence,
		&createdAt,
		&thinking,
		&contextJSON,
		&metadataJSON,
		&scopeKey,
		&refName,
		&commitSHA,
		&treeFlavor,
		&treeVersionID,
	); err != nil {
		return nil, err
	}
	msg.Content = nullString(content)
	msg.Source = nullString(source)
	msg.CreatedAt = fromUnixMilli(createdAt)
	msg.Thinking = nullString(thinking)
	msg.ContextJSON = nullString(contextJSON)
	msg.MetadataJSON = nullString(metadataJSON)
	msg.ScopeKey = strings.TrimSpace(scopeKey)
	msg.RefName = strings.TrimSpace(refName)
	msg.CommitSHA = strings.TrimSpace(commitSHA)
	msg.TreeFlavor = strings.TrimSpace(treeFlavor)
	msg.TreeVersionID = strings.TrimSpace(treeVersionID)
	return &msg, nil
}

func scanLedgerToolCall(scanner interface{ Scan(dest ...any) error }) (*LedgerToolCall, error) {
	var (
		call                LedgerToolCall
		messageID           sql.NullString
		toolNumber          sql.NullInt64
		resultJSON          sql.NullString
		errText             sql.NullString
		spawnedSessionLabel sql.NullString
		startedAt           int64
		completedAt         sql.NullInt64
		scopeKey            string
		refName             string
		commitSHA           string
		treeFlavor          string
		treeVersionID       string
	)
	if err := scanner.Scan(
		&call.ID,
		&call.TurnID,
		&messageID,
		&call.ToolName,
		&toolNumber,
		&call.ParamsJSON,
		&resultJSON,
		&errText,
		&call.Status,
		&spawnedSessionLabel,
		&startedAt,
		&completedAt,
		&call.Sequence,
		&scopeKey,
		&refName,
		&commitSHA,
		&treeFlavor,
		&treeVersionID,
	); err != nil {
		return nil, err
	}
	call.MessageID = nullString(messageID)
	if toolNumber.Valid {
		v := int(toolNumber.Int64)
		call.ToolNumber = &v
	}
	call.ResultJSON = nullString(resultJSON)
	call.Error = nullString(errText)
	call.SpawnedSessionLabel = nullString(spawnedSessionLabel)
	call.StartedAt = fromUnixMilli(startedAt)
	call.CompletedAt = fromNullUnixMilli(completedAt)
	call.ScopeKey = strings.TrimSpace(scopeKey)
	call.RefName = strings.TrimSpace(refName)
	call.CommitSHA = strings.TrimSpace(commitSHA)
	call.TreeFlavor = strings.TrimSpace(treeFlavor)
	call.TreeVersionID = strings.TrimSpace(treeVersionID)
	return &call, nil
}

func (b *Broker) turnScope(turnID string) (LedgerScope, error) {
	db := b.ledgerDB()
	if db == nil {
		return LedgerScope{}, fmt.Errorf("broker ledger is not configured")
	}
	turnID = strings.TrimSpace(turnID)
	if turnID == "" {
		return LedgerScope{}, fmt.Errorf("turn id is required")
	}
	var scope LedgerScope
	if err := db.QueryRow(`
		SELECT scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		FROM turns
		WHERE id = ?
	`, turnID).Scan(
		&scope.ScopeKey,
		&scope.RefName,
		&scope.CommitSHA,
		&scope.TreeFlavor,
		&scope.TreeVersionID,
	); err != nil {
		return LedgerScope{}, err
	}
	return scope.normalized(), nil
}

func nullIntPtr(v *int) any {
	if v == nil {
		return nil
	}
	return *v
}

func nullInt64Ptr(v *int64) any {
	if v == nil {
		return nil
	}
	return *v
}
