package broker

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func openLedgerTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", "file:ledger_test?mode=memory&cache=shared")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`PRAGMA foreign_keys=ON`); err != nil {
		t.Fatalf("pragma foreign_keys: %v", err)
	}
	return db
}

func TestEnsureLedgerSchema_MigratesLegacyConflicts(t *testing.T) {
	db := openLedgerTestDB(t)

	legacy := []string{
		`CREATE TABLE sessions (agent_id TEXT PRIMARY KEY, runtime TEXT);`,
		`CREATE TABLE messages (id TEXT PRIMARY KEY, from_id TEXT, to_id TEXT, delivered INTEGER DEFAULT 0, payload TEXT DEFAULT '{}', timestamp TEXT DEFAULT '');`,
		`CREATE TABLE session_events (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT, event_type TEXT, turn_number INTEGER, data BLOB, created_at TEXT);`,
	}
	for _, stmt := range legacy {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("create legacy table: %v", err)
		}
	}
	if _, err := db.Exec(`CREATE TABLE turns (
		id TEXT PRIMARY KEY,
		parent_turn_id TEXT,
		turn_type TEXT NOT NULL DEFAULT 'normal',
		status TEXT NOT NULL DEFAULT 'pending',
		started_at INTEGER NOT NULL,
		completed_at INTEGER,
		model TEXT,
		provider TEXT,
		role TEXT NOT NULL DEFAULT 'unified',
		toolset_name TEXT,
		tools_available TEXT,
		permissions_granted TEXT,
		permissions_used TEXT,
		input_tokens INTEGER,
		output_tokens INTEGER,
		cached_input_tokens INTEGER,
		cache_write_tokens INTEGER,
		reasoning_tokens INTEGER,
		total_tokens INTEGER,
		query_message_ids TEXT,
		response_message_id TEXT,
		has_children INTEGER DEFAULT 0,
		tool_call_count INTEGER DEFAULT 0,
		source_event_id TEXT,
		workspace_path TEXT
	);`); err != nil {
		t.Fatalf("create legacy turns table: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE session_import_requests (
		idempotency_key TEXT PRIMARY KEY,
		source TEXT NOT NULL,
		mode TEXT NOT NULL,
		run_id TEXT NOT NULL,
		response_json TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);`); err != nil {
		t.Fatalf("create legacy session_import_requests table: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE session_aliases (
		alias TEXT PRIMARY KEY,
		session_label TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);`); err != nil {
		t.Fatalf("create legacy session_aliases table: %v", err)
	}

	if err := EnsureLedgerSchema(nil, db); err != nil {
		t.Fatalf("ensure ledger schema: %v", err)
	}

	mustHaveTable := func(name string) {
		t.Helper()
		var count int
		if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?`, name).Scan(&count); err != nil {
			t.Fatalf("table lookup %s: %v", name, err)
		}
		if count == 0 {
			t.Fatalf("expected table %s to exist", name)
		}
	}
	mustNotHaveTable := func(name string) {
		t.Helper()
		var count int
		if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?`, name).Scan(&count); err != nil {
			t.Fatalf("table lookup %s: %v", name, err)
		}
		if count != 0 {
			t.Fatalf("expected table %s to be dropped", name)
		}
	}
	mustHaveColumn := func(table string, column string) {
		t.Helper()
		rows, err := db.Query(`PRAGMA table_info(` + table + `)`)
		if err != nil {
			t.Fatalf("pragma table_info(%s): %v", table, err)
		}
		defer rows.Close()
		found := false
		for rows.Next() {
			var (
				cid      int
				name     string
				typeName string
				notNull  int
				defaultV sql.NullString
				pk       int
			)
			if err := rows.Scan(&cid, &name, &typeName, &notNull, &defaultV, &pk); err != nil {
				t.Fatalf("scan table_info(%s): %v", table, err)
			}
			if name == column {
				found = true
			}
		}
		if err := rows.Err(); err != nil {
			t.Fatalf("iterate table_info(%s): %v", table, err)
		}
		if !found {
			t.Fatalf("expected %s.%s to exist", table, column)
		}
	}

	for _, name := range []string{
		"agents",
		"legacy_runtime_sessions",
		"agent_messages",
		"legacy_runtime_session_events",
		"sessions",
		"messages",
		"turns",
		"threads",
		"tool_calls",
		"compactions",
		"session_history",
		"session_continuity_transfers",
		"session_imports",
		"session_import_requests",
		"session_import_chunk_parts",
		"queue_items",
		"message_files",
		"message_lints",
		"message_codeblocks",
		"artifacts",
		"tool_call_artifacts",
		"checkpoints",
	} {
		mustHaveTable(name)
	}
	mustNotHaveTable("session_aliases")
	mustHaveColumn("turns", "effective_config_json")
	mustHaveColumn("session_import_requests", "request_hash")
	mustHaveColumn("sessions", "scope_key")
	mustHaveColumn("turns", "scope_key")
	mustHaveColumn("messages", "scope_key")
	mustHaveColumn("tool_calls", "scope_key")
	mustHaveColumn("compactions", "scope_key")
	mustHaveColumn("session_history", "scope_key")
}

func TestLedgerCRUD_SessionTurnMessageToolQueueCompactionCheckpoint(t *testing.T) {
	db := openLedgerTestDB(t)
	broker, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker with db: %v", err)
	}

	sess, err := broker.CreateSession("oracle:test:root", SessionOptions{
		PersonaID:     "main",
		Origin:        "hydrate",
		ScopeKey:      "repo-scope",
		RefName:       "main",
		CommitSHA:     "abc123",
		TreeFlavor:    "oracle-deep",
		TreeVersionID: "tv-1",
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	if sess.Label != "oracle:test:root" {
		t.Fatalf("unexpected session label: %s", sess.Label)
	}
	if sess.ScopeKey != "repo-scope" || sess.RefName != "main" || sess.CommitSHA != "abc123" || sess.TreeVersionID != "tv-1" {
		t.Fatalf("unexpected session scope metadata: %#v", sess)
	}

	filtered, err := broker.ListSessions(SessionFilter{RefName: "main"})
	if err != nil {
		t.Fatalf("list sessions by ref: %v", err)
	}
	if len(filtered) != 1 || filtered[0].Label != "oracle:test:root" {
		t.Fatalf("expected filtered session match, got %#v", filtered)
	}

	total := 7
	if err := broker.insertTurn(TurnWrite{
		ID:          "turn-1",
		TurnType:    "normal",
		Status:      "completed",
		StartedAt:   nowUnixMilli(),
		Model:       "claude-sonnet",
		Provider:    "anthropic",
		Role:        "unified",
		TotalTokens: &total,
	}); err != nil {
		t.Fatalf("insert turn: %v", err)
	}
	if err := broker.upsertThread(ThreadWrite{TurnID: "turn-1", PersonaID: "main", ThreadKey: "turn-1"}); err != nil {
		t.Fatalf("upsert thread: %v", err)
	}
	if err := broker.setSessionThread("oracle:test:root", "turn-1", nowUnixMilli()); err != nil {
		t.Fatalf("set session thread: %v", err)
	}

	if err := broker.insertMessage(MessageWrite{
		ID:        "msg-1",
		TurnID:    "turn-1",
		Role:      "assistant",
		Content:   "hello",
		Sequence:  1,
		CreatedAt: nowUnixMilli(),
	}); err != nil {
		t.Fatalf("insert message: %v", err)
	}

	if err := broker.insertToolCall(ToolCallWrite{
		ID:         "tool-1",
		TurnID:     "turn-1",
		ToolName:   "read",
		ParamsJSON: `{"path":"README.md"}`,
		Status:     "completed",
		StartedAt:  nowUnixMilli(),
		Sequence:   1,
	}); err != nil {
		t.Fatalf("insert tool call: %v", err)
	}

	turn, msgs, calls, err := broker.GetTurnDetails("turn-1")
	if err != nil {
		t.Fatalf("get turn details: %v", err)
	}
	if turn.ID != "turn-1" || len(msgs) != 1 || len(calls) != 1 {
		t.Fatalf("unexpected turn details: turn=%s msgs=%d calls=%d", turn.ID, len(msgs), len(calls))
	}

	history, err := broker.GetSessionHistory("oracle:test:root")
	if err != nil {
		t.Fatalf("get session history: %v", err)
	}
	if len(history) != 1 {
		t.Fatalf("expected 1 history turn, got %d", len(history))
	}
	var historyScope string
	if err := db.QueryRow(`SELECT scope_key FROM session_history WHERE session_label = ? LIMIT 1`, "oracle:test:root").Scan(&historyScope); err != nil {
		t.Fatalf("query session history scope: %v", err)
	}
	if historyScope != "repo-scope" {
		t.Fatalf("expected session_history scope_key repo-scope, got %q", historyScope)
	}

	stats, err := broker.GetSessionStats("oracle:test:root")
	if err != nil {
		t.Fatalf("get session stats: %v", err)
	}
	if stats.TurnCount != 1 || stats.TotalTokens != 7 {
		t.Fatalf("unexpected stats: %#v", stats)
	}

	if err := broker.enqueue(QueueItemWrite{
		ID:           "q-1",
		SessionLabel: "oracle:test:root",
		MessageJSON:  `{"text":"followup"}`,
		Mode:         "followup",
		Status:       "queued",
		EnqueuedAt:   nowUnixMilli(),
	}); err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	start := nowUnixMilli()
	end := start + 15
	if err := broker.updateQueueItemStatus("q-1", "completed", &start, &end, ""); err != nil {
		t.Fatalf("update queue status: %v", err)
	}
	queue, err := broker.listQueueItems(QueueFilter{SessionLabel: "oracle:test:root"})
	if err != nil {
		t.Fatalf("list queue: %v", err)
	}
	if len(queue) != 1 || queue[0].Status != "completed" {
		t.Fatalf("unexpected queue rows: %#v", queue)
	}

	count := 1
	if err := broker.insertTurn(TurnWrite{
		ID:           "turn-compact",
		ParentTurnID: "turn-1",
		TurnType:     "compaction",
		Status:       "completed",
		StartedAt:    nowUnixMilli(),
		Role:         "unified",
	}); err != nil {
		t.Fatalf("insert compaction turn: %v", err)
	}
	if err := broker.insertCompaction(CompactionWrite{
		TurnID:                  "turn-compact",
		Summary:                 "summary",
		SummarizedThroughTurnID: "turn-1",
		TurnsSummarized:         &count,
		CompactionType:          "summary",
		Model:                   "claude-sonnet",
	}); err != nil {
		t.Fatalf("insert compaction: %v", err)
	}
	compaction, err := broker.getCompaction("turn-compact")
	if err != nil {
		t.Fatalf("get compaction: %v", err)
	}
	if compaction.TurnID != "turn-compact" {
		t.Fatalf("unexpected compaction turn id: %s", compaction.TurnID)
	}

	if err := broker.saveCheckpoint(CheckpointWrite{
		Name:         "post-hydrate:test:root",
		SessionLabel: "oracle:test:root",
		EntryID:      "entry-1",
		CapturedAt:   nowUnixMilli(),
	}); err != nil {
		t.Fatalf("save checkpoint: %v", err)
	}
	cp, err := broker.getCheckpoint("post-hydrate:test:root")
	if err != nil {
		t.Fatalf("get checkpoint: %v", err)
	}
	if cp.EntryID != "entry-1" {
		t.Fatalf("unexpected checkpoint entry id: %s", cp.EntryID)
	}

	if err := broker.insertSessionContinuityTransfer(SessionContinuityTransferWrite{
		ID:               "continuity-1",
		SourceSessionKey: "oracle:test:old",
		TargetSessionKey: "oracle:test:root",
		Reason:           "entity_merge",
		SummaryTurnID:    "turn-compact",
		CreatedAt:        nowUnixMilli(),
	}); err != nil {
		t.Fatalf("insert continuity transfer: %v", err)
	}
	transfers, err := broker.listSessionContinuityTransfers("oracle:test:old", "", 10)
	if err != nil {
		t.Fatalf("list continuity transfers: %v", err)
	}
	if len(transfers) != 1 || transfers[0].TargetSessionKey != "oracle:test:root" {
		t.Fatalf("unexpected continuity transfers: %#v", transfers)
	}

	importedAt := nowUnixMilli()
	updatedAt := importedAt + 5
	if err := broker.upsertSessionImport(SessionImportWrite{
		Source:                   "aix",
		SourceProvider:           "anthropic",
		SourceSessionID:          "src-session",
		SourceSessionFingerprint: "fingerprint",
		SessionLabel:             "oracle:test:root",
		ImportedAt:               importedAt,
		UpdatedAt:                updatedAt,
		LastRunID:                "run-1",
	}); err != nil {
		t.Fatalf("upsert session import: %v", err)
	}
	sessionImport, err := broker.getSessionImportBySource("aix", "anthropic", "src-session")
	if err != nil {
		t.Fatalf("get session import: %v", err)
	}
	if sessionImport.SessionLabel != "oracle:test:root" || sessionImport.LastRunID != "run-1" {
		t.Fatalf("unexpected session import row: %#v", sessionImport)
	}

	if err := broker.upsertSessionImportRequest(SessionImportRequestWrite{
		IdempotencyKey: "idem-1",
		Source:         "aix",
		Mode:           "upsert",
		RunID:          "run-1",
		RequestHash:    "hash-1",
		ResponseJSON:   `{"ok":true}`,
		CreatedAt:      nowUnixMilli(),
	}); err != nil {
		t.Fatalf("upsert session import request: %v", err)
	}
	importRequest, err := broker.getSessionImportRequestByIdempotencyKey("idem-1")
	if err != nil {
		t.Fatalf("get session import request: %v", err)
	}
	if importRequest.RequestHash != "hash-1" {
		t.Fatalf("unexpected import request hash: %#v", importRequest)
	}

	chunkCreatedAt := nowUnixMilli()
	if err := broker.upsertSessionImportChunkPart(SessionImportChunkPartWrite{
		Source:                   "aix",
		UploadID:                 "upload-1",
		ChunkIndex:               0,
		ChunkTotal:               2,
		Mode:                     "upsert",
		RunID:                    "run-1",
		PersonaID:                "main",
		IdempotencyKey:           "idem-1",
		SourceProvider:           "anthropic",
		SourceSessionID:          "src-session",
		SourceSessionFingerprint: "fingerprint",
		Encoding:                 "gzip+base64",
		Payload:                  "part-0",
		CreatedAt:                chunkCreatedAt,
	}); err != nil {
		t.Fatalf("upsert session import chunk part 0: %v", err)
	}
	if err := broker.upsertSessionImportChunkPart(SessionImportChunkPartWrite{
		Source:                   "aix",
		UploadID:                 "upload-1",
		ChunkIndex:               1,
		ChunkTotal:               2,
		Mode:                     "upsert",
		RunID:                    "run-1",
		PersonaID:                "main",
		IdempotencyKey:           "idem-1",
		SourceProvider:           "anthropic",
		SourceSessionID:          "src-session",
		SourceSessionFingerprint: "fingerprint",
		Encoding:                 "gzip+base64",
		Payload:                  "part-1",
		CreatedAt:                chunkCreatedAt,
	}); err != nil {
		t.Fatalf("upsert session import chunk part 1: %v", err)
	}
	chunkCount, err := broker.countSessionImportChunkParts("aix", "upload-1")
	if err != nil {
		t.Fatalf("count session import chunk parts: %v", err)
	}
	if chunkCount != 2 {
		t.Fatalf("unexpected chunk part count: %d", chunkCount)
	}
	chunkMeta, err := broker.getSessionImportChunkMeta("aix", "upload-1")
	if err != nil {
		t.Fatalf("get session import chunk meta: %v", err)
	}
	if chunkMeta.ChunkIndex != 0 || chunkMeta.Payload != "part-0" {
		t.Fatalf("unexpected chunk meta: %#v", chunkMeta)
	}
	chunkParts, err := broker.listSessionImportChunkParts("aix", "upload-1")
	if err != nil {
		t.Fatalf("list session import chunk parts: %v", err)
	}
	if len(chunkParts) != 2 {
		t.Fatalf("unexpected chunk parts length: %d", len(chunkParts))
	}
	if err := broker.pruneSessionImportChunkParts(chunkCreatedAt + 1); err != nil {
		t.Fatalf("prune session import chunk parts: %v", err)
	}
	chunkCount, err = broker.countSessionImportChunkParts("aix", "upload-1")
	if err != nil {
		t.Fatalf("count session import chunk parts after prune: %v", err)
	}
	if chunkCount != 0 {
		t.Fatalf("expected 0 chunk parts after prune, got %d", chunkCount)
	}

	lineStart := 1
	lineEnd := 8
	if err := broker.insertMessageFile(MessageFileWrite{
		MessageID: "msg-1",
		Kind:      "read",
		FilePath:  "README.md",
		LineStart: &lineStart,
		LineEnd:   &lineEnd,
	}); err != nil {
		t.Fatalf("insert message file: %v", err)
	}
	files, err := broker.listMessageFiles("msg-1")
	if err != nil {
		t.Fatalf("list message files: %v", err)
	}
	if len(files) != 1 || files[0].FilePath != "README.md" {
		t.Fatalf("unexpected message files: %#v", files)
	}

	startCol := 3
	endCol := 5
	if err := broker.insertMessageLint(MessageLintWrite{
		MessageID:  "msg-1",
		FilePath:   "README.md",
		Message:    "example lint",
		LintSource: "test-linter",
		StartLine:  &lineStart,
		StartCol:   &startCol,
		EndLine:    &lineEnd,
		EndCol:     &endCol,
		Severity:   "warning",
	}); err != nil {
		t.Fatalf("insert message lint: %v", err)
	}
	lints, err := broker.listMessageLints("msg-1")
	if err != nil {
		t.Fatalf("list message lints: %v", err)
	}
	if len(lints) != 1 || lints[0].LintSource != "test-linter" {
		t.Fatalf("unexpected message lints: %#v", lints)
	}

	if err := broker.insertMessageCodeblock(MessageCodeblockWrite{
		MessageID: "msg-1",
		Index:     0,
		Language:  "go",
		Content:   "fmt.Println(\"hi\")",
		FilePath:  "main.go",
		LineStart: &lineStart,
		LineEnd:   &lineEnd,
	}); err != nil {
		t.Fatalf("insert message codeblock: %v", err)
	}
	codeblocks, err := broker.listMessageCodeblocks("msg-1")
	if err != nil {
		t.Fatalf("list message codeblocks: %v", err)
	}
	if len(codeblocks) != 1 || codeblocks[0].Language != "go" {
		t.Fatalf("unexpected message codeblocks: %#v", codeblocks)
	}
}
