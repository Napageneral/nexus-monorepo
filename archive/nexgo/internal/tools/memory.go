package tools

import (
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/Napageneral/nexus/internal/db"
	gcatypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"
)

// ---------------------------------------------------------------------------
// cortex_recall — search memory by query
// ---------------------------------------------------------------------------

// CortexRecallTool searches the memory elements table for matching entries.
type CortexRecallTool struct {
	db *sql.DB // memory.db
}

func (t *CortexRecallTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        "cortex_recall",
		Description: "Search and recall information from your memory. Use this to remember facts, preferences, and context about users and topics.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"query": map[string]any{"type": "string", "description": "Search query to find relevant memories"},
				"limit": map[string]any{"type": "integer", "description": "Maximum number of results (default: 10)"},
			},
			"required": []string{"query"},
		},
	}
}

func (t *CortexRecallTool) Execute(ctx context.Context, callID string, args map[string]any) (gcatypes.ToolResult, error) {
	query, _ := args["query"].(string)
	if query == "" {
		return errorResult("query parameter is required"), nil
	}

	limit := 10
	if l, ok := args["limit"].(float64); ok && l > 0 {
		limit = int(l)
	}

	// Update access tracking on returned results.
	var rows *sql.Rows
	var err error

	if db.FTSEnabled() {
		// Use FTS5 full-text search.
		const ftsQuery = `SELECT e.id, e.type, e.subtype, e.content, e.summary, e.source, e.importance, e.created_at
			FROM elements_fts f
			JOIN elements e ON e.rowid = f.rowid
			WHERE elements_fts MATCH ? AND e.status = 'active'
			ORDER BY rank
			LIMIT ?`
		rows, err = t.db.QueryContext(ctx, ftsQuery, query, limit)
	} else {
		// Fallback to LIKE search across content and summary.
		likePattern := "%" + query + "%"
		const likeQuery = `SELECT id, type, subtype, content, summary, source, importance, created_at
			FROM elements
			WHERE status = 'active' AND (content LIKE ? OR summary LIKE ?)
			ORDER BY importance DESC, created_at DESC
			LIMIT ?`
		rows, err = t.db.QueryContext(ctx, likeQuery, likePattern, likePattern, limit)
	}
	if err != nil {
		return errorResult(fmt.Sprintf("query failed: %v", err)), nil
	}
	defer rows.Close()

	var results []string
	var ids []string
	for rows.Next() {
		var id, elemType, subtype, content, summary, source string
		var importance float64
		var createdAt int64
		if err := rows.Scan(&id, &elemType, &subtype, &content, &summary, &source, &importance, &createdAt); err != nil {
			return errorResult(fmt.Sprintf("scan failed: %v", err)), nil
		}
		ids = append(ids, id)

		ts := time.UnixMilli(createdAt).Format(time.RFC3339)
		entry := fmt.Sprintf("[%s] (%s/%s) %s", ts, elemType, subtype, content)
		if summary != "" && summary != content {
			entry += fmt.Sprintf("\n  Summary: %s", summary)
		}
		if source != "" {
			entry += fmt.Sprintf("\n  Source: %s", source)
		}
		results = append(results, entry)
	}
	if err := rows.Err(); err != nil {
		return errorResult(fmt.Sprintf("rows iteration failed: %v", err)), nil
	}

	// Update access counts for returned elements.
	if len(ids) > 0 {
		now := time.Now().UnixMilli()
		placeholders := make([]string, len(ids))
		updateArgs := make([]any, 0, len(ids)+1)
		updateArgs = append(updateArgs, now)
		for i, id := range ids {
			placeholders[i] = "?"
			updateArgs = append(updateArgs, id)
		}
		updateQ := fmt.Sprintf(
			`UPDATE elements SET access_count = access_count + 1, last_accessed_at = ? WHERE id IN (%s)`,
			strings.Join(placeholders, ","),
		)
		// Best-effort; don't fail the recall if this update fails.
		_, _ = t.db.ExecContext(ctx, updateQ, updateArgs...)
	}

	if len(results) == 0 {
		return textResult("No memories found matching your query."), nil
	}

	text := fmt.Sprintf("Found %d memory element(s):\n\n%s", len(results), strings.Join(results, "\n\n"))
	return textResult(text), nil
}

// ---------------------------------------------------------------------------
// cortex_remember — store a new memory element
// ---------------------------------------------------------------------------

// CortexRememberTool stores a new memory element in the elements table.
type CortexRememberTool struct {
	db *sql.DB
}

func (t *CortexRememberTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        "cortex_remember",
		Description: "Store a new memory element. Use this to remember important facts, preferences, instructions, or observations for future reference.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"content":    map[string]any{"type": "string", "description": "The memory content to store"},
				"type":       map[string]any{"type": "string", "description": "Memory type: observation, fact, preference, instruction (default: observation)"},
				"importance": map[string]any{"type": "number", "description": "Importance score from 0.0 to 1.0 (default: 0.5)"},
				"tags":       map[string]any{"type": "string", "description": "Comma-separated tags for categorization"},
			},
			"required": []string{"content"},
		},
	}
}

func (t *CortexRememberTool) Execute(ctx context.Context, callID string, args map[string]any) (gcatypes.ToolResult, error) {
	content, _ := args["content"].(string)
	if content == "" {
		return errorResult("content parameter is required"), nil
	}

	elemType := "observation"
	if tp, ok := args["type"].(string); ok && tp != "" {
		elemType = tp
	}

	importance := 0.5
	if imp, ok := args["importance"].(float64); ok && imp >= 0 && imp <= 1 {
		importance = imp
	}

	tagsStr := "[]"
	if tags, ok := args["tags"].(string); ok && tags != "" {
		// Convert comma-separated to JSON array.
		parts := strings.Split(tags, ",")
		for i := range parts {
			parts[i] = `"` + strings.TrimSpace(parts[i]) + `"`
		}
		tagsStr = "[" + strings.Join(parts, ",") + "]"
	}

	id := newToolUUID()
	now := time.Now().UnixMilli()

	const q = `INSERT INTO elements (id, type, content, importance, tags, status, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`

	_, err := t.db.ExecContext(ctx, q, id, elemType, content, importance, tagsStr, now, now)
	if err != nil {
		return errorResult(fmt.Sprintf("failed to store memory: %v", err)), nil
	}

	return textResult(fmt.Sprintf("Memory stored successfully (id: %s, type: %s, importance: %.1f)", id, elemType, importance)), nil
}

// ---------------------------------------------------------------------------
// cortex_forget — mark a memory element as deleted
// ---------------------------------------------------------------------------

// CortexForgetTool marks a memory element as deleted by updating its status.
type CortexForgetTool struct {
	db *sql.DB
}

func (t *CortexForgetTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        "cortex_forget",
		Description: "Mark a memory element as deleted. Use this to remove outdated or incorrect memories.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"id":     map[string]any{"type": "string", "description": "The ID of the memory element to forget"},
				"reason": map[string]any{"type": "string", "description": "Optional reason for forgetting this memory"},
			},
			"required": []string{"id"},
		},
	}
}

func (t *CortexForgetTool) Execute(ctx context.Context, callID string, args map[string]any) (gcatypes.ToolResult, error) {
	id, _ := args["id"].(string)
	if id == "" {
		return errorResult("id parameter is required"), nil
	}

	now := time.Now().UnixMilli()

	const q = `UPDATE elements SET status = 'deleted', updated_at = ? WHERE id = ? AND status = 'active'`
	result, err := t.db.ExecContext(ctx, q, now, id)
	if err != nil {
		return errorResult(fmt.Sprintf("failed to forget memory: %v", err)), nil
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		return errorResult(fmt.Sprintf("no active memory found with id: %s", id)), nil
	}

	return textResult(fmt.Sprintf("Memory element %s has been forgotten.", id)), nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// textResult creates a simple text ToolResult.
func textResult(text string) gcatypes.ToolResult {
	return gcatypes.ToolResult{
		Content: []gcatypes.ContentBlock{
			{Type: "text", Text: text},
		},
	}
}

// errorResult creates an error ToolResult.
func errorResult(text string) gcatypes.ToolResult {
	return gcatypes.ToolResult{
		Content: []gcatypes.ContentBlock{
			{Type: "text", Text: text},
		},
		IsError: true,
	}
}

// newToolUUID generates a random UUID v4 for tool-created records.
func newToolUUID() string {
	var buf [16]byte
	_, _ = rand.Read(buf[:])
	buf[6] = (buf[6] & 0x0f) | 0x40 // version 4
	buf[8] = (buf[8] & 0x3f) | 0x80 // variant 2
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		buf[0:4], buf[4:6], buf[6:8], buf[8:10], buf[10:16])
}
