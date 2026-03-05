package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
)

// TestSchemaCompat verifies that the Go binary creates databases
// with schemas compatible with what the TS runtime expects.
func TestSchemaCompat(t *testing.T) {
	l := testLedgers(t)

	// Expected tables per database with key columns that must exist.
	type tableSpec struct {
		dbName  string
		table   string
		columns []string // key columns to verify
	}

	specs := []tableSpec{
		// events.db
		{"events", "events", []string{"id", "adapter_id", "platform", "event_type", "content_type", "space_id", "container_id", "thread_id", "sender_id", "sender_name", "receiver_id", "entity_id", "content", "processed", "timestamp", "metadata", "reply_to_id", "created_at"}},
		{"events", "attachments", []string{"id", "event_id", "filename", "mime_type", "size", "url"}},
		{"events", "attachment_interpretations", []string{"id", "attachment_id", "model", "type", "content"}},

		// agents.db
		{"agents", "sessions", []string{"id", "agent_id", "session_key", "adapter_id", "platform", "container_id", "entity_id", "model", "provider", "status", "title", "token_count", "turn_count", "metadata", "created_at", "updated_at"}},
		{"agents", "turns", []string{"id", "session_id", "role", "sequence", "request_id", "content", "metadata", "token_count", "created_at"}},
		{"agents", "messages", []string{"id", "turn_id", "role", "content", "content_type", "token_count", "metadata", "created_at"}},
		{"agents", "tool_calls", []string{"id", "turn_id", "tool_name", "tool_input", "tool_output", "status", "duration_ms", "error", "sequence", "metadata", "created_at"}},
		{"agents", "compactions", []string{"id", "session_id", "before_tokens", "after_tokens", "turns_removed", "summary"}},
		{"agents", "artifacts", []string{"id", "session_id", "turn_id", "type", "name", "content", "mime_type"}},

		// identity.db
		{"identity", "entities", []string{"id", "name", "type", "normalized", "is_user", "origin", "persona_path", "merged_into", "mention_count", "metadata", "created_at", "updated_at"}},
		{"identity", "contacts", []string{"id", "entity_id", "adapter_id", "platform", "platform_id", "display_name", "metadata", "created_at", "updated_at"}},
		{"identity", "entity_tags", []string{"entity_id", "tag", "created_at"}},
		{"identity", "entity_links", []string{"id", "source_entity_id", "target_entity_id", "relation", "confidence", "metadata"}},
		{"identity", "contact_participants", []string{"contact_id", "container_id", "last_seen_at"}},

		// memory.db
		{"memory", "elements", []string{"id", "type", "subtype", "content", "summary", "source", "source_event_id", "source_session_id", "confidence", "importance", "access_count", "decay_rate", "entity_ids", "tags", "metadata", "superseded_by", "status", "created_at", "updated_at"}},
		{"memory", "element_entities", []string{"element_id", "entity_id", "role"}},
		{"memory", "element_links", []string{"id", "source_id", "target_id", "relation", "weight", "metadata"}},
		{"memory", "sets", []string{"id", "name", "type", "description", "query", "metadata"}},
		{"memory", "set_members", []string{"set_id", "element_id", "added_at"}},
		{"memory", "jobs", []string{"id", "type", "status", "input", "output", "error", "attempts", "max_attempts"}},
		{"memory", "processing_log", []string{"id", "element_id", "job_id", "action", "details"}},
		{"memory", "review_queue", []string{"id", "element_id", "review_type", "priority", "status"}},

		// embeddings.db
		{"embeddings", "embeddings", []string{"id", "source_type", "source_id", "model", "dimensions", "vector", "content_hash", "metadata", "created_at"}},

		// runtime.db
		{"runtime", "pipeline_requests", []string{"id", "operation", "status", "sender_id", "receiver_id", "adapter_id", "payload", "result", "error", "stages", "duration_ms", "created_at", "completed_at"}},
		{"runtime", "automations", []string{"id", "name", "type", "enabled", "priority", "conditions", "actions", "metadata"}},
		{"runtime", "grants", []string{"id", "entity_id", "resource", "action", "effect", "conditions", "expires_at"}},
		{"runtime", "audit_log", []string{"id", "request_id", "operation", "entity_id", "action", "resource", "decision", "details", "created_at"}},
		{"runtime", "adapter_state", []string{"adapter_id", "status", "config", "metadata", "last_heartbeat_at", "connected_at"}},
		{"runtime", "import_jobs", []string{"id", "type", "status", "source", "progress", "error"}},
		{"runtime", "hooks", []string{"id", "name", "type", "enabled", "config"}},
		{"runtime", "clock_schedules", []string{"id", "name", "cron_expr", "operation", "payload", "enabled"}},
		{"runtime", "kv", []string{"key", "value", "updated_at"}},

		// work.db
		{"work", "work_items", []string{"id", "type", "title", "description", "status", "priority", "assignee_entity_id", "parent_id", "tags", "metadata", "created_at", "updated_at"}},
		{"work", "sequences", []string{"id", "name", "description", "status", "metadata"}},
		{"work", "workflows", []string{"id", "name", "description", "definition", "status", "metadata"}},
		{"work", "campaigns", []string{"id", "name", "description", "workflow_id", "status", "metadata"}},
		{"work", "dependencies", []string{"id", "source_id", "target_id", "type", "metadata"}},
	}

	for _, spec := range specs {
		t.Run(spec.dbName+"/"+spec.table, func(t *testing.T) {
			db := ledgerDB(l, spec.dbName)
			if db == nil {
				t.Fatalf("no db for %s", spec.dbName)
			}

			// Verify table exists via sqlite_master.
			var tableName string
			err := db.QueryRow(
				"SELECT name FROM sqlite_master WHERE type='table' AND name=?",
				spec.table,
			).Scan(&tableName)
			if err != nil {
				t.Fatalf("table %s.%s not found in sqlite_master: %v", spec.dbName, spec.table, err)
			}

			// Verify key columns exist via PRAGMA table_info.
			rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%s)", spec.table))
			if err != nil {
				t.Fatalf("PRAGMA table_info(%s): %v", spec.table, err)
			}
			defer rows.Close()

			existingCols := make(map[string]bool)
			for rows.Next() {
				var cid int
				var name, colType string
				var notNull, pk int
				var dfltValue *string
				if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err != nil {
					t.Fatalf("scan table_info: %v", err)
				}
				existingCols[name] = true
			}
			if err := rows.Err(); err != nil {
				t.Fatalf("table_info rows: %v", err)
			}

			for _, col := range spec.columns {
				if !existingCols[col] {
					t.Errorf("table %s.%s missing column %q", spec.dbName, spec.table, col)
				}
			}
		})
	}

	// Verify indexes exist for key tables.
	t.Run("indexes", func(t *testing.T) {
		indexChecks := []struct {
			dbName string
			index  string
		}{
			{"events", "idx_events_entity"},
			{"events", "idx_events_container"},
			{"events", "idx_events_timestamp"},
			{"events", "idx_events_adapter"},
			{"agents", "idx_sessions_key"},
			{"agents", "idx_sessions_entity"},
			{"agents", "idx_turns_session"},
			{"agents", "idx_messages_turn"},
			{"agents", "idx_tool_calls_turn"},
			{"identity", "idx_entities_name"},
			{"identity", "idx_contacts_entity"},
			{"identity", "idx_contacts_unique"},
			{"memory", "idx_elements_type"},
			{"memory", "idx_element_entities_entity"},
			{"memory", "idx_element_links_source"},
			{"embeddings", "idx_embeddings_source"},
			{"runtime", "idx_pipeline_op"},
			{"runtime", "idx_grants_entity"},
			{"runtime", "idx_audit_request"},
			{"work", "idx_work_items_type"},
			{"work", "idx_work_items_status"},
			{"work", "idx_campaigns_status"},
		}

		for _, ic := range indexChecks {
			db := ledgerDB(l, ic.dbName)
			if db == nil {
				t.Fatalf("no db for %s", ic.dbName)
			}

			var indexName string
			err := db.QueryRow(
				"SELECT name FROM sqlite_master WHERE type='index' AND name=?",
				ic.index,
			).Scan(&indexName)
			if err != nil {
				t.Errorf("index %s.%s not found: %v", ic.dbName, ic.index, err)
			}
		}
	})

	// Verify FTS5 tables when built with fts5 tag.
	if FTSEnabled() {
		t.Run("fts5/elements_fts", func(t *testing.T) {
			var name string
			err := l.Memory.QueryRow(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='elements_fts'",
			).Scan(&name)
			if err != nil {
				t.Fatalf("elements_fts table not found: %v", err)
			}
		})

		t.Run("fts5/events_fts", func(t *testing.T) {
			var name string
			err := l.Events.QueryRow(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='events_fts'",
			).Scan(&name)
			if err != nil {
				t.Fatalf("events_fts table not found: %v", err)
			}
		})
	}
}

// TestDataRoundTrip verifies data written by Go can be read back correctly,
// including field types, timestamps, and JSON encoding.
func TestDataRoundTrip(t *testing.T) {
	l := testLedgers(t)
	ctx := context.Background()
	now := time.Now().UnixMilli()

	t.Run("events", func(t *testing.T) {
		meta := map[string]any{"key": "value", "num": float64(42)}
		metaJSON, _ := json.Marshal(meta)

		_, err := l.Events.ExecContext(ctx,
			`INSERT INTO events (id, adapter_id, platform, event_type, content_type, content, timestamp, metadata)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			"evt-rt-1", "discord", "discord", "message", "text", "hello world", now, string(metaJSON))
		if err != nil {
			t.Fatalf("insert: %v", err)
		}

		var id, adapterID, platform, eventType, contentType, content, metadataStr string
		var ts, createdAt int64
		err = l.Events.QueryRowContext(ctx,
			`SELECT id, adapter_id, platform, event_type, content_type, content, timestamp, metadata, created_at
			 FROM events WHERE id = ?`, "evt-rt-1",
		).Scan(&id, &adapterID, &platform, &eventType, &contentType, &content, &ts, &metadataStr, &createdAt)
		if err != nil {
			t.Fatalf("select: %v", err)
		}

		if id != "evt-rt-1" {
			t.Errorf("id = %q, want evt-rt-1", id)
		}
		if adapterID != "discord" {
			t.Errorf("adapter_id = %q, want discord", adapterID)
		}
		if platform != "discord" {
			t.Errorf("platform = %q, want discord", platform)
		}
		if eventType != "message" {
			t.Errorf("event_type = %q, want message", eventType)
		}
		if contentType != "text" {
			t.Errorf("content_type = %q, want text", contentType)
		}
		if content != "hello world" {
			t.Errorf("content = %q, want hello world", content)
		}
		if ts != now {
			t.Errorf("timestamp = %d, want %d", ts, now)
		}
		if createdAt <= 0 {
			t.Errorf("created_at should be positive, got %d", createdAt)
		}

		// Verify JSON metadata round-trips.
		var readMeta map[string]any
		if err := json.Unmarshal([]byte(metadataStr), &readMeta); err != nil {
			t.Fatalf("unmarshal metadata: %v", err)
		}
		if readMeta["key"] != "value" {
			t.Errorf("metadata[key] = %v, want value", readMeta["key"])
		}
		if readMeta["num"] != float64(42) {
			t.Errorf("metadata[num] = %v, want 42", readMeta["num"])
		}
	})

	t.Run("agents/sessions+turns+messages+tool_calls", func(t *testing.T) {
		// Insert session.
		_, err := l.Agents.ExecContext(ctx,
			`INSERT INTO sessions (id, session_key, agent_id, model, provider, status, metadata)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			"sess-rt-1", "key-rt-1", "default", "claude-3-opus", "anthropic", "active", `{"test": true}`)
		if err != nil {
			t.Fatalf("insert session: %v", err)
		}

		var sessID, sessKey, agentID, model, provider, status, sessMeta string
		var tokenCount, turnCount int
		var createdAt, updatedAt int64
		err = l.Agents.QueryRowContext(ctx,
			`SELECT id, session_key, agent_id, model, provider, status, token_count, turn_count, metadata, created_at, updated_at
			 FROM sessions WHERE id = ?`, "sess-rt-1",
		).Scan(&sessID, &sessKey, &agentID, &model, &provider, &status, &tokenCount, &turnCount, &sessMeta, &createdAt, &updatedAt)
		if err != nil {
			t.Fatalf("select session: %v", err)
		}
		if sessKey != "key-rt-1" {
			t.Errorf("session_key = %q, want key-rt-1", sessKey)
		}
		if model != "claude-3-opus" {
			t.Errorf("model = %q, want claude-3-opus", model)
		}
		if status != "active" {
			t.Errorf("status = %q, want active", status)
		}
		if tokenCount != 0 {
			t.Errorf("token_count = %d, want 0", tokenCount)
		}

		// Insert turn.
		_, err = l.Agents.ExecContext(ctx,
			`INSERT INTO turns (id, session_id, role, sequence, content) VALUES (?, ?, ?, ?, ?)`,
			"turn-rt-1", "sess-rt-1", "user", 1, "What is Go?")
		if err != nil {
			t.Fatalf("insert turn: %v", err)
		}

		// Insert message.
		_, err = l.Agents.ExecContext(ctx,
			`INSERT INTO messages (id, turn_id, role, content, content_type) VALUES (?, ?, ?, ?, ?)`,
			"msg-rt-1", "turn-rt-1", "user", "What is Go?", "text")
		if err != nil {
			t.Fatalf("insert message: %v", err)
		}

		// Insert tool call.
		toolInput := `{"query": "Go programming language"}`
		_, err = l.Agents.ExecContext(ctx,
			`INSERT INTO tool_calls (id, turn_id, tool_name, tool_input, status) VALUES (?, ?, ?, ?, ?)`,
			"tc-rt-1", "turn-rt-1", "web_search", toolInput, "completed")
		if err != nil {
			t.Fatalf("insert tool_call: %v", err)
		}

		// Verify tool call round-trip.
		var tcID, toolName, readInput, tcStatus string
		err = l.Agents.QueryRowContext(ctx,
			`SELECT id, tool_name, tool_input, status FROM tool_calls WHERE id = ?`, "tc-rt-1",
		).Scan(&tcID, &toolName, &readInput, &tcStatus)
		if err != nil {
			t.Fatalf("select tool_call: %v", err)
		}
		if toolName != "web_search" {
			t.Errorf("tool_name = %q, want web_search", toolName)
		}
		// Verify JSON tool_input round-trips.
		var inputMap map[string]string
		if err := json.Unmarshal([]byte(readInput), &inputMap); err != nil {
			t.Fatalf("unmarshal tool_input: %v", err)
		}
		if inputMap["query"] != "Go programming language" {
			t.Errorf("tool_input[query] = %q, want 'Go programming language'", inputMap["query"])
		}
	})

	t.Run("identity/entities+contacts+tags", func(t *testing.T) {
		_, err := l.Identity.ExecContext(ctx,
			`INSERT INTO entities (id, name, type, normalized, is_user, metadata, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			"ent-rt-1", "Alice", "person", "alice", 1, `{"bio": "developer"}`, now, now)
		if err != nil {
			t.Fatalf("insert entity: %v", err)
		}

		var entID, name, entType, norm string
		var isUser int
		var entMeta string
		err = l.Identity.QueryRowContext(ctx,
			`SELECT id, name, type, normalized, is_user, metadata FROM entities WHERE id = ?`, "ent-rt-1",
		).Scan(&entID, &name, &entType, &norm, &isUser, &entMeta)
		if err != nil {
			t.Fatalf("select entity: %v", err)
		}
		if name != "Alice" {
			t.Errorf("name = %q, want Alice", name)
		}
		if isUser != 1 {
			t.Errorf("is_user = %d, want 1", isUser)
		}
		if norm != "alice" {
			t.Errorf("normalized = %q, want alice", norm)
		}

		// Insert contact.
		_, err = l.Identity.ExecContext(ctx,
			`INSERT INTO contacts (id, entity_id, adapter_id, platform, platform_id, display_name, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			"cont-rt-1", "ent-rt-1", "discord", "discord", "alice-123", "Alice", now, now)
		if err != nil {
			t.Fatalf("insert contact: %v", err)
		}

		// Insert entity tag.
		_, err = l.Identity.ExecContext(ctx,
			`INSERT INTO entity_tags (entity_id, tag) VALUES (?, ?)`,
			"ent-rt-1", "admin")
		if err != nil {
			t.Fatalf("insert entity_tag: %v", err)
		}

		var tag string
		err = l.Identity.QueryRowContext(ctx,
			`SELECT tag FROM entity_tags WHERE entity_id = ?`, "ent-rt-1",
		).Scan(&tag)
		if err != nil {
			t.Fatalf("select entity_tag: %v", err)
		}
		if tag != "admin" {
			t.Errorf("tag = %q, want admin", tag)
		}
	})

	t.Run("memory/elements+entities+links+sets", func(t *testing.T) {
		entityIDs := `["ent-1","ent-2"]`
		tags := `["important","work"]`
		_, err := l.Memory.ExecContext(ctx,
			`INSERT INTO elements (id, type, subtype, content, summary, source, confidence, importance, entity_ids, tags, metadata, status, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			"elem-rt-1", "fact", "preference", "Alice likes Go", "Go preference", "conversation",
			0.95, 0.8, entityIDs, tags, `{"source_turn": "turn-1"}`, "active", now, now)
		if err != nil {
			t.Fatalf("insert element: %v", err)
		}

		var elemID, elemType, subtype, content, summary, readEntityIDs, readTags, elemMeta, elemStatus string
		var confidence, importance float64
		err = l.Memory.QueryRowContext(ctx,
			`SELECT id, type, subtype, content, summary, confidence, importance, entity_ids, tags, metadata, status
			 FROM elements WHERE id = ?`, "elem-rt-1",
		).Scan(&elemID, &elemType, &subtype, &content, &summary, &confidence, &importance, &readEntityIDs, &readTags, &elemMeta, &elemStatus)
		if err != nil {
			t.Fatalf("select element: %v", err)
		}
		if elemType != "fact" {
			t.Errorf("type = %q, want fact", elemType)
		}
		if confidence != 0.95 {
			t.Errorf("confidence = %f, want 0.95", confidence)
		}
		if importance != 0.8 {
			t.Errorf("importance = %f, want 0.8", importance)
		}
		if elemStatus != "active" {
			t.Errorf("status = %q, want active", elemStatus)
		}

		// Verify JSON arrays round-trip.
		var eIDs []string
		if err := json.Unmarshal([]byte(readEntityIDs), &eIDs); err != nil {
			t.Fatalf("unmarshal entity_ids: %v", err)
		}
		if len(eIDs) != 2 || eIDs[0] != "ent-1" || eIDs[1] != "ent-2" {
			t.Errorf("entity_ids = %v, want [ent-1, ent-2]", eIDs)
		}

		// Insert element_entity.
		_, err = l.Memory.ExecContext(ctx,
			`INSERT INTO element_entities (element_id, entity_id, role) VALUES (?, ?, ?)`,
			"elem-rt-1", "ent-1", "subject")
		if err != nil {
			t.Fatalf("insert element_entity: %v", err)
		}

		// Insert set and member.
		_, err = l.Memory.ExecContext(ctx,
			`INSERT INTO sets (id, name, type) VALUES (?, ?, ?)`,
			"set-rt-1", "test-set", "manual")
		if err != nil {
			t.Fatalf("insert set: %v", err)
		}

		_, err = l.Memory.ExecContext(ctx,
			`INSERT INTO set_members (set_id, element_id) VALUES (?, ?)`,
			"set-rt-1", "elem-rt-1")
		if err != nil {
			t.Fatalf("insert set_member: %v", err)
		}
	})

	t.Run("embeddings", func(t *testing.T) {
		vector := []byte{0x01, 0x02, 0x03, 0x04} // dummy vector blob
		_, err := l.Embeddings.ExecContext(ctx,
			`INSERT INTO embeddings (id, source_type, source_id, model, dimensions, vector, content_hash, metadata)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			"emb-rt-1", "element", "elem-rt-1", "text-embedding-3-small", 1536, vector, "abc123", `{"version": 1}`)
		if err != nil {
			t.Fatalf("insert embedding: %v", err)
		}

		var embID, srcType, srcID, model, hash, embMeta string
		var dims int
		var readVector []byte
		err = l.Embeddings.QueryRowContext(ctx,
			`SELECT id, source_type, source_id, model, dimensions, vector, content_hash, metadata
			 FROM embeddings WHERE id = ?`, "emb-rt-1",
		).Scan(&embID, &srcType, &srcID, &model, &dims, &readVector, &hash, &embMeta)
		if err != nil {
			t.Fatalf("select embedding: %v", err)
		}
		if dims != 1536 {
			t.Errorf("dimensions = %d, want 1536", dims)
		}
		if model != "text-embedding-3-small" {
			t.Errorf("model = %q, want text-embedding-3-small", model)
		}
		if hash != "abc123" {
			t.Errorf("content_hash = %q, want abc123", hash)
		}
		if len(readVector) != 4 {
			t.Errorf("vector length = %d, want 4", len(readVector))
		}
	})

	t.Run("runtime/pipeline_requests+grants+audit_log+adapter_state", func(t *testing.T) {
		// pipeline_requests
		err := l.InsertPipelineRequest(ctx, PipelineRequestRow{
			ID:        "pr-rt-1",
			Operation: "event.ingest",
			Status:    "completed",
			SenderID:  "user-1",
			AdapterID: "discord",
			Payload:   `{"content": "hello"}`,
			Result:    `{"processed": true}`,
			Stages:    `[{"stage":"accept","duration_ms":1}]`,
			DurationMS: 42,
			CreatedAt: now,
		})
		if err != nil {
			t.Fatalf("insert pipeline_request: %v", err)
		}

		var prID, prOp, prPayload, prResult, prStages string
		var prDuration int64
		err = l.Runtime.QueryRowContext(ctx,
			`SELECT id, operation, payload, result, stages, duration_ms FROM pipeline_requests WHERE id = ?`, "pr-rt-1",
		).Scan(&prID, &prOp, &prPayload, &prResult, &prStages, &prDuration)
		if err != nil {
			t.Fatalf("select pipeline_request: %v", err)
		}
		if prOp != "event.ingest" {
			t.Errorf("operation = %q, want event.ingest", prOp)
		}
		if prDuration != 42 {
			t.Errorf("duration_ms = %d, want 42", prDuration)
		}

		// Verify JSON payload.
		var payload map[string]any
		if err := json.Unmarshal([]byte(prPayload), &payload); err != nil {
			t.Fatalf("unmarshal payload: %v", err)
		}
		if payload["content"] != "hello" {
			t.Errorf("payload[content] = %v, want hello", payload["content"])
		}

		// grants
		_, err = l.Runtime.ExecContext(ctx,
			`INSERT INTO grants (id, entity_id, resource, action, effect) VALUES (?, ?, ?, ?, ?)`,
			"grant-rt-1", "ent-1", "memory", "read", "allow")
		if err != nil {
			t.Fatalf("insert grant: %v", err)
		}

		var grantEffect string
		err = l.Runtime.QueryRowContext(ctx,
			`SELECT effect FROM grants WHERE id = ?`, "grant-rt-1",
		).Scan(&grantEffect)
		if err != nil {
			t.Fatalf("select grant: %v", err)
		}
		if grantEffect != "allow" {
			t.Errorf("effect = %q, want allow", grantEffect)
		}

		// audit_log
		_, err = l.Runtime.ExecContext(ctx,
			`INSERT INTO audit_log (id, request_id, operation, entity_id, action, resource, decision, details)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			"audit-rt-1", "pr-rt-1", "event.ingest", "ent-1", "read", "events", "allow", `{"reason":"admin"}`)
		if err != nil {
			t.Fatalf("insert audit_log: %v", err)
		}

		// adapter_state
		err = l.UpsertAdapterState(ctx, AdapterStateRow{
			AdapterID:   "discord-rt",
			Status:      "connected",
			Config:      `{"token":"***"}`,
			Metadata:    `{}`,
			ConnectedAt: &now,
		})
		if err != nil {
			t.Fatalf("upsert adapter_state: %v", err)
		}

		states, err := l.ListAdapterState(ctx)
		if err != nil {
			t.Fatalf("list adapter_state: %v", err)
		}
		found := false
		for _, s := range states {
			if s.AdapterID == "discord-rt" {
				found = true
				if s.Status != "connected" {
					t.Errorf("adapter status = %q, want connected", s.Status)
				}
			}
		}
		if !found {
			t.Error("adapter discord-rt not found")
		}
	})

	t.Run("work/work_items+workflows+campaigns", func(t *testing.T) {
		tagsJSON := `["urgent","bug"]`
		_, err := l.Work.ExecContext(ctx,
			`INSERT INTO work_items (id, type, title, description, status, priority, tags, metadata)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			"wi-rt-1", "task", "Fix critical bug", "Memory leak in pipeline", "open", 1, tagsJSON, `{"sprint": 42}`)
		if err != nil {
			t.Fatalf("insert work_item: %v", err)
		}

		var wiID, wiType, wiTitle, wiDesc, wiStatus, wiTags, wiMeta string
		var wiPriority int
		err = l.Work.QueryRowContext(ctx,
			`SELECT id, type, title, description, status, priority, tags, metadata
			 FROM work_items WHERE id = ?`, "wi-rt-1",
		).Scan(&wiID, &wiType, &wiTitle, &wiDesc, &wiStatus, &wiPriority, &wiTags, &wiMeta)
		if err != nil {
			t.Fatalf("select work_item: %v", err)
		}
		if wiTitle != "Fix critical bug" {
			t.Errorf("title = %q, want 'Fix critical bug'", wiTitle)
		}
		if wiPriority != 1 {
			t.Errorf("priority = %d, want 1", wiPriority)
		}

		// Verify JSON tags array.
		var readTags []string
		if err := json.Unmarshal([]byte(wiTags), &readTags); err != nil {
			t.Fatalf("unmarshal tags: %v", err)
		}
		if len(readTags) != 2 || readTags[0] != "urgent" {
			t.Errorf("tags = %v, want [urgent, bug]", readTags)
		}

		// workflows
		_, err = l.Work.ExecContext(ctx,
			`INSERT INTO workflows (id, name, description, definition, status)
			 VALUES (?, ?, ?, ?, ?)`,
			"wf-rt-1", "bug-fix", "Bug fix workflow", `{"steps":["triage","fix","verify"]}`, "active")
		if err != nil {
			t.Fatalf("insert workflow: %v", err)
		}

		var wfDef string
		err = l.Work.QueryRowContext(ctx,
			`SELECT definition FROM workflows WHERE id = ?`, "wf-rt-1",
		).Scan(&wfDef)
		if err != nil {
			t.Fatalf("select workflow: %v", err)
		}
		var def map[string]any
		if err := json.Unmarshal([]byte(wfDef), &def); err != nil {
			t.Fatalf("unmarshal definition: %v", err)
		}

		// campaigns
		_, err = l.Work.ExecContext(ctx,
			`INSERT INTO campaigns (id, name, workflow_id, status) VALUES (?, ?, ?, ?)`,
			"camp-rt-1", "Q1 Sprint", "wf-rt-1", "draft")
		if err != nil {
			t.Fatalf("insert campaign: %v", err)
		}

		var campName, campStatus string
		err = l.Work.QueryRowContext(ctx,
			`SELECT name, status FROM campaigns WHERE id = ?`, "camp-rt-1",
		).Scan(&campName, &campStatus)
		if err != nil {
			t.Fatalf("select campaign: %v", err)
		}
		if campName != "Q1 Sprint" {
			t.Errorf("name = %q, want Q1 Sprint", campName)
		}
		if campStatus != "draft" {
			t.Errorf("status = %q, want draft", campStatus)
		}
	})

	// FTS5 round-trip tests.
	if FTSEnabled() {
		t.Run("fts5/elements_fts_roundtrip", func(t *testing.T) {
			// Insert via elements table (trigger populates FTS).
			_, err := l.Memory.ExecContext(ctx,
				`INSERT INTO elements (id, type, content, summary, status, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
				"elem-fts-1", "fact", "The quick brown fox jumps over the lazy dog", "fox jumping", "active", now, now)
			if err != nil {
				t.Fatalf("insert element for fts: %v", err)
			}

			// Search via FTS.
			var matchContent string
			err = l.Memory.QueryRowContext(ctx,
				`SELECT content FROM elements WHERE rowid IN (SELECT rowid FROM elements_fts WHERE elements_fts MATCH ?)`,
				"quick brown fox",
			).Scan(&matchContent)
			if err != nil {
				t.Fatalf("FTS search failed: %v", err)
			}
			if !strings.Contains(matchContent, "quick brown fox") {
				t.Errorf("FTS content = %q, expected to contain 'quick brown fox'", matchContent)
			}
		})

		t.Run("fts5/events_fts_roundtrip", func(t *testing.T) {
			_, err := l.Events.ExecContext(ctx,
				`INSERT INTO events (id, adapter_id, content, sender_name, container_name, timestamp)
				 VALUES (?, ?, ?, ?, ?, ?)`,
				"evt-fts-1", "test", "searching for answers in the universe", "Bob", "general", now)
			if err != nil {
				t.Fatalf("insert event for fts: %v", err)
			}

			var matchID string
			err = l.Events.QueryRowContext(ctx,
				`SELECT id FROM events WHERE rowid IN (SELECT rowid FROM events_fts WHERE events_fts MATCH ?)`,
				"searching answers universe",
			).Scan(&matchID)
			if err != nil {
				t.Fatalf("FTS search events failed: %v", err)
			}
			if matchID != "evt-fts-1" {
				t.Errorf("FTS match id = %q, want evt-fts-1", matchID)
			}
		})
	}

	// Verify NULL handling for optional timestamp columns.
	t.Run("null_timestamps", func(t *testing.T) {
		_, err := l.Agents.ExecContext(ctx,
			`INSERT INTO sessions (id, session_key, archived_at) VALUES (?, ?, NULL)`,
			"sess-null-1", "key-null-1")
		if err != nil {
			t.Fatalf("insert session with null archived_at: %v", err)
		}

		var archivedAt sql.NullInt64
		err = l.Agents.QueryRowContext(ctx,
			`SELECT archived_at FROM sessions WHERE id = ?`, "sess-null-1",
		).Scan(&archivedAt)
		if err != nil {
			t.Fatalf("select null timestamp: %v", err)
		}
		if archivedAt.Valid {
			t.Errorf("archived_at should be NULL, got %d", archivedAt.Int64)
		}
	})

	// Verify foreign key constraints are active.
	t.Run("foreign_keys_enforced", func(t *testing.T) {
		// Inserting a turn with a nonexistent session_id should fail.
		_, err := l.Agents.ExecContext(ctx,
			`INSERT INTO turns (id, session_id, role) VALUES (?, ?, ?)`,
			"turn-fk-1", "nonexistent-session", "user")
		if err == nil {
			t.Fatal("expected foreign key error, got nil")
		}
		if !strings.Contains(err.Error(), "FOREIGN KEY") {
			t.Errorf("expected FOREIGN KEY error, got: %v", err)
		}
	})
}
