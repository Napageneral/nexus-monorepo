package tools

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	gcatypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"
)

// ---------------------------------------------------------------------------
// SessionListTool - list active sessions
// ---------------------------------------------------------------------------

// SessionListTool lists agent sessions from the runtime database.
type SessionListTool struct {
	db *sql.DB
}

// NewSessionListTool creates a SessionListTool.
func NewSessionListTool(db *sql.DB) *SessionListTool {
	return &SessionListTool{db: db}
}

// Definition returns the tool schema.
func (t *SessionListTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        "session_list",
		Description: "List active agent sessions with their keys and last activity time.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"limit": map[string]any{
					"type":        "number",
					"description": "Maximum number of sessions to return (default 20)",
				},
			},
		},
	}
}

// Execute lists sessions.
func (t *SessionListTool) Execute(ctx context.Context, toolCallID string, args map[string]any) (gcatypes.ToolResult, error) {
	if t.db == nil {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "session database is not available"}},
			IsError: true,
		}, nil
	}

	limit := 20
	if l, ok := args["limit"].(float64); ok && l > 0 {
		limit = int(l)
	}

	rows, err := t.db.QueryContext(ctx,
		`SELECT session_key, agent_id, created_at FROM sessions ORDER BY created_at DESC LIMIT ?`,
		limit,
	)
	if err != nil {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("Query failed: %v", err)}},
			IsError: true,
		}, nil
	}
	defer rows.Close()

	var sb strings.Builder
	count := 0
	for rows.Next() {
		var key, agentID string
		var createdAt int64
		if err := rows.Scan(&key, &agentID, &createdAt); err != nil {
			continue
		}
		fmt.Fprintf(&sb, "- %s (agent: %s, created: %d)\n", key, agentID, createdAt)
		count++
	}

	if count == 0 {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "No sessions found."}},
		}, nil
	}

	return gcatypes.ToolResult{
		Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("Found %d sessions:\n%s", count, sb.String())}},
	}, nil
}

// ---------------------------------------------------------------------------
// SessionHistoryTool - view session history
// ---------------------------------------------------------------------------

// SessionHistoryTool retrieves the message history for a session.
type SessionHistoryTool struct {
	db *sql.DB
}

// NewSessionHistoryTool creates a SessionHistoryTool.
func NewSessionHistoryTool(db *sql.DB) *SessionHistoryTool {
	return &SessionHistoryTool{db: db}
}

// Definition returns the tool schema.
func (t *SessionHistoryTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        "session_history",
		Description: "Retrieve the recent message history for a session.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"session_key": map[string]any{
					"type":        "string",
					"description": "The session key to look up",
				},
				"limit": map[string]any{
					"type":        "number",
					"description": "Maximum number of messages (default 50)",
				},
			},
			"required": []string{"session_key"},
		},
	}
}

// Execute retrieves session history.
func (t *SessionHistoryTool) Execute(ctx context.Context, toolCallID string, args map[string]any) (gcatypes.ToolResult, error) {
	sessionKey, _ := args["session_key"].(string)
	if sessionKey == "" {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "session_key is required"}},
			IsError: true,
		}, nil
	}

	if t.db == nil {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "session database is not available"}},
			IsError: true,
		}, nil
	}

	limit := 50
	if l, ok := args["limit"].(float64); ok && l > 0 {
		limit = int(l)
	}

	rows, err := t.db.QueryContext(ctx,
		`SELECT role, content, timestamp FROM messages WHERE session_key = ? ORDER BY timestamp DESC LIMIT ?`,
		sessionKey, limit,
	)
	if err != nil {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("Query failed: %v", err)}},
			IsError: true,
		}, nil
	}
	defer rows.Close()

	var sb strings.Builder
	count := 0
	for rows.Next() {
		var role, content string
		var ts int64
		if err := rows.Scan(&role, &content, &ts); err != nil {
			continue
		}
		fmt.Fprintf(&sb, "[%s] %s\n", role, content)
		count++
	}

	if count == 0 {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("No messages found for session %s.", sessionKey)}},
		}, nil
	}

	return gcatypes.ToolResult{
		Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("%d messages for session %s:\n%s", count, sessionKey, sb.String())}},
	}, nil
}
