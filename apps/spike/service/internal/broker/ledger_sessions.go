package broker

import (
	"database/sql"
	"fmt"
	"strings"
)

func (b *Broker) CreateSession(label string, opts SessionOptions) (*LedgerSession, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	label = strings.TrimSpace(label)
	if label == "" {
		return nil, fmt.Errorf("session label is required")
	}

	now := nowUnixMilli()
	persona := strings.TrimSpace(opts.PersonaID)
	if persona == "" {
		persona = "main"
	}
	status := strings.TrimSpace(opts.Status)
	if status == "" {
		status = "active"
	}
	scope := normalizeLedgerScope(LedgerScope{
		ScopeKey:      opts.ScopeKey,
		RefName:       opts.RefName,
		CommitSHA:     opts.CommitSHA,
		TreeFlavor:    opts.TreeFlavor,
		TreeVersionID: opts.TreeVersionID,
	}, b.defaultLedgerScope())

	_, err := db.Exec(`
		INSERT INTO sessions (
			label, thread_id, persona_id, is_subagent, parent_session_label, parent_turn_id,
			spawn_tool_call_id, task_description, task_status, routing_key,
			origin, origin_session_id, scope_key, ref_name, commit_sha, tree_flavor, tree_version_id, created_at, updated_at, status
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(label) DO UPDATE SET
			thread_id=COALESCE(excluded.thread_id, sessions.thread_id),
			persona_id=excluded.persona_id,
			is_subagent=excluded.is_subagent,
			parent_session_label=COALESCE(excluded.parent_session_label, sessions.parent_session_label),
			parent_turn_id=COALESCE(excluded.parent_turn_id, sessions.parent_turn_id),
			spawn_tool_call_id=COALESCE(excluded.spawn_tool_call_id, sessions.spawn_tool_call_id),
			task_description=COALESCE(excluded.task_description, sessions.task_description),
			task_status=COALESCE(excluded.task_status, sessions.task_status),
			routing_key=COALESCE(excluded.routing_key, sessions.routing_key),
			origin=COALESCE(excluded.origin, sessions.origin),
			origin_session_id=COALESCE(excluded.origin_session_id, sessions.origin_session_id),
			scope_key=CASE WHEN excluded.scope_key != '' THEN excluded.scope_key ELSE sessions.scope_key END,
			ref_name=CASE WHEN excluded.ref_name != '' THEN excluded.ref_name ELSE sessions.ref_name END,
			commit_sha=CASE WHEN excluded.commit_sha != '' THEN excluded.commit_sha ELSE sessions.commit_sha END,
			tree_flavor=CASE WHEN excluded.tree_flavor != '' THEN excluded.tree_flavor ELSE sessions.tree_flavor END,
			tree_version_id=CASE WHEN excluded.tree_version_id != '' THEN excluded.tree_version_id ELSE sessions.tree_version_id END,
			updated_at=excluded.updated_at,
			status=excluded.status;
	`,
		label,
		nullIfBlank(opts.ThreadID),
		persona,
		boolToSQLite(opts.IsSubagent),
		nullIfBlank(opts.ParentSessionLabel),
		nullIfBlank(opts.ParentTurnID),
		nullIfBlank(opts.SpawnToolCallID),
		nullIfBlank(opts.TaskDescription),
		nullIfBlank(opts.TaskStatus),
		nullIfBlank(opts.RoutingKey),
		nullIfBlank(opts.Origin),
		nullIfBlank(opts.OriginSessionID),
		scope.ScopeKey,
		scope.RefName,
		scope.CommitSHA,
		scope.TreeFlavor,
		scope.TreeVersionID,
		now,
		now,
		status,
	)
	if err != nil {
		return nil, err
	}
	b.mu.Lock()
	if b.sessionConfigs == nil {
		b.sessionConfigs = map[string]EngineStartOpts{}
	}
	cfg := EngineStartOpts{
		WorkDir:      opts.WorkDir,
		Provider:     opts.Provider,
		Model:        opts.Model,
		SystemPrompt: opts.SystemPrompt,
		Tools:        append([]string(nil), opts.Tools...),
		ThinkLevel:   opts.ThinkLevel,
		SessionDir:   opts.SessionDir,
		ExtraArgs:    append([]string(nil), opts.ExtraArgs...),
	}
	if len(opts.Env) > 0 {
		cfg.Env = make(map[string]string, len(opts.Env))
		for key, value := range opts.Env {
			cfg.Env[key] = value
		}
	}
	b.sessionConfigs[label] = cfg
	b.mu.Unlock()
	return b.GetSession(label)
}

func (b *Broker) GetSession(label string) (*LedgerSession, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	label = strings.TrimSpace(label)
	if label == "" {
		return nil, fmt.Errorf("session label is required")
	}

	row := db.QueryRow(`
		SELECT label, thread_id, persona_id, is_subagent, parent_session_label, parent_turn_id,
		       spawn_tool_call_id, task_description, task_status, routing_key,
		       origin, origin_session_id, scope_key, ref_name, commit_sha, tree_flavor, tree_version_id, created_at, updated_at, status
		FROM sessions
		WHERE label = ?
	`, label)

	var (
		s                  LedgerSession
		threadID           sql.NullString
		isSubagent         int64
		parentSessionLabel sql.NullString
		parentTurnID       sql.NullString
		spawnToolCallID    sql.NullString
		taskDescription    sql.NullString
		taskStatus         sql.NullString
		routingKey         sql.NullString
		origin             sql.NullString
		originSessionID    sql.NullString
		scopeKey           string
		refName            string
		commitSHA          string
		treeFlavor         string
		treeVersionID      string
		createdAt          int64
		updatedAt          int64
	)
	if err := row.Scan(
		&s.Label,
		&threadID,
		&s.PersonaID,
		&isSubagent,
		&parentSessionLabel,
		&parentTurnID,
		&spawnToolCallID,
		&taskDescription,
		&taskStatus,
		&routingKey,
		&origin,
		&originSessionID,
		&scopeKey,
		&refName,
		&commitSHA,
		&treeFlavor,
		&treeVersionID,
		&createdAt,
		&updatedAt,
		&s.Status,
	); err != nil {
		return nil, err
	}
	s.ThreadID = nullString(threadID)
	s.IsSubagent = sqliteToBool(isSubagent)
	s.ParentSessionLabel = nullString(parentSessionLabel)
	s.ParentTurnID = nullString(parentTurnID)
	s.SpawnToolCallID = nullString(spawnToolCallID)
	s.TaskDescription = nullString(taskDescription)
	s.TaskStatus = nullString(taskStatus)
	s.RoutingKey = nullString(routingKey)
	s.Origin = nullString(origin)
	s.OriginSessionID = nullString(originSessionID)
	s.ScopeKey = strings.TrimSpace(scopeKey)
	s.RefName = strings.TrimSpace(refName)
	s.CommitSHA = strings.TrimSpace(commitSHA)
	s.TreeFlavor = strings.TrimSpace(treeFlavor)
	s.TreeVersionID = strings.TrimSpace(treeVersionID)
	s.CreatedAt = fromUnixMilli(createdAt)
	s.UpdatedAt = fromUnixMilli(updatedAt)
	return &s, nil
}

func (b *Broker) ListSessions(filter SessionFilter) ([]*LedgerSession, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}

	where := make([]string, 0, 3)
	args := make([]any, 0, 4)
	if v := strings.TrimSpace(filter.PersonaID); v != "" {
		where = append(where, "persona_id = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(filter.Status); v != "" {
		where = append(where, "status = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(filter.Origin); v != "" {
		where = append(where, "origin = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(filter.ScopeKey); v != "" {
		where = append(where, "scope_key = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(filter.RefName); v != "" {
		where = append(where, "ref_name = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(filter.CommitSHA); v != "" {
		where = append(where, "commit_sha = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(filter.TreeFlavor); v != "" {
		where = append(where, "tree_flavor = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(filter.TreeVersionID); v != "" {
		where = append(where, "tree_version_id = ?")
		args = append(args, v)
	}
	query := `
		SELECT label, thread_id, persona_id, is_subagent, parent_session_label, parent_turn_id,
		       spawn_tool_call_id, task_description, task_status, routing_key,
		       origin, origin_session_id, scope_key, ref_name, commit_sha, tree_flavor, tree_version_id, created_at, updated_at, status
		FROM sessions
	`
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	query += " ORDER BY updated_at DESC LIMIT ?"
	limit := filter.Limit
	if limit <= 0 {
		limit = 200
	}
	args = append(args, limit)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]*LedgerSession, 0)
	for rows.Next() {
		var (
			s                  LedgerSession
			threadID           sql.NullString
			isSubagent         int64
			parentSessionLabel sql.NullString
			parentTurnID       sql.NullString
			spawnToolCallID    sql.NullString
			taskDescription    sql.NullString
			taskStatus         sql.NullString
			routingKey         sql.NullString
			origin             sql.NullString
			originSessionID    sql.NullString
			scopeKey           string
			refName            string
			commitSHA          string
			treeFlavor         string
			treeVersionID      string
			createdAt          int64
			updatedAt          int64
		)
		if err := rows.Scan(
			&s.Label,
			&threadID,
			&s.PersonaID,
			&isSubagent,
			&parentSessionLabel,
			&parentTurnID,
			&spawnToolCallID,
			&taskDescription,
			&taskStatus,
			&routingKey,
			&origin,
			&originSessionID,
			&scopeKey,
			&refName,
			&commitSHA,
			&treeFlavor,
			&treeVersionID,
			&createdAt,
			&updatedAt,
			&s.Status,
		); err != nil {
			return nil, err
		}
		s.ThreadID = nullString(threadID)
		s.IsSubagent = sqliteToBool(isSubagent)
		s.ParentSessionLabel = nullString(parentSessionLabel)
		s.ParentTurnID = nullString(parentTurnID)
		s.SpawnToolCallID = nullString(spawnToolCallID)
		s.TaskDescription = nullString(taskDescription)
		s.TaskStatus = nullString(taskStatus)
		s.RoutingKey = nullString(routingKey)
		s.Origin = nullString(origin)
		s.OriginSessionID = nullString(originSessionID)
		s.ScopeKey = strings.TrimSpace(scopeKey)
		s.RefName = strings.TrimSpace(refName)
		s.CommitSHA = strings.TrimSpace(commitSHA)
		s.TreeFlavor = strings.TrimSpace(treeFlavor)
		s.TreeVersionID = strings.TrimSpace(treeVersionID)
		s.CreatedAt = fromUnixMilli(createdAt)
		s.UpdatedAt = fromUnixMilli(updatedAt)
		out = append(out, &s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (b *Broker) setSessionThread(sessionLabel string, threadID string, changedAt int64) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	sessionLabel = strings.TrimSpace(sessionLabel)
	threadID = strings.TrimSpace(threadID)
	if sessionLabel == "" || threadID == "" {
		return fmt.Errorf("session label and thread id are required")
	}
	if changedAt <= 0 {
		changedAt = nowUnixMilli()
	}
	if _, err := db.Exec(`
		UPDATE sessions
		SET thread_id = ?, updated_at = ?
		WHERE label = ?
	`, threadID, changedAt, sessionLabel); err != nil {
		return err
	}
	scope, err := b.sessionScope(sessionLabel)
	if err != nil {
		scope = b.defaultLedgerScope()
	}
	_, err = db.Exec(`
		INSERT INTO session_history (
			session_label, thread_id, changed_at, scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, sessionLabel, threadID, changedAt, scope.ScopeKey, scope.RefName, scope.CommitSHA, scope.TreeFlavor, scope.TreeVersionID)
	return err
}

func (b *Broker) sessionScope(sessionLabel string) (LedgerScope, error) {
	db := b.ledgerDB()
	if db == nil {
		return LedgerScope{}, fmt.Errorf("broker ledger is not configured")
	}
	sessionLabel = strings.TrimSpace(sessionLabel)
	if sessionLabel == "" {
		return LedgerScope{}, fmt.Errorf("session label is required")
	}
	var scope LedgerScope
	if err := db.QueryRow(`
		SELECT scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		FROM sessions
		WHERE label = ?
	`, sessionLabel).Scan(
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

func nullIfBlank(v string) any {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil
	}
	return v
}

func (b *Broker) touchSessionActivity(sessionLabel string, touchedAt int64) {
	db := b.ledgerDB()
	if db == nil {
		return
	}
	sessionLabel = strings.TrimSpace(sessionLabel)
	if sessionLabel == "" {
		return
	}
	if touchedAt <= 0 {
		touchedAt = nowUnixMilli()
	}
	const minTouchIntervalMS int64 = 1000

	b.mu.Lock()
	if b.sessionActivity == nil {
		b.sessionActivity = map[string]int64{}
	}
	last := b.sessionActivity[sessionLabel]
	if last > 0 && touchedAt-last < minTouchIntervalMS {
		b.mu.Unlock()
		return
	}
	b.sessionActivity[sessionLabel] = touchedAt
	b.mu.Unlock()

	_, _ = db.Exec(`
		UPDATE sessions
		SET updated_at = ?
		WHERE label = ? AND updated_at < ?
	`, touchedAt, sessionLabel, touchedAt)
}

func nullString(v sql.NullString) string {
	if !v.Valid {
		return ""
	}
	return strings.TrimSpace(v.String)
}
