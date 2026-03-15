package tools

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	gcatypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"
)

// CronScheduleTool manages cron jobs (schedule, list, cancel).
type CronScheduleTool struct {
	db *sql.DB
}

// NewCronScheduleTool creates a CronScheduleTool.
func NewCronScheduleTool(db *sql.DB) *CronScheduleTool {
	return &CronScheduleTool{db: db}
}

// Definition returns the tool schema.
func (t *CronScheduleTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        "cron_schedule",
		Description: "Schedule, list, or cancel cron jobs. Use action 'list' to see jobs, 'create' to add, 'cancel' to remove.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"action": map[string]any{
					"type":        "string",
					"description": "Action: 'list', 'create', or 'cancel'",
					"enum":        []string{"list", "create", "cancel"},
				},
				"schedule_id": map[string]any{
					"type":        "string",
					"description": "ID of the schedule (for cancel)",
				},
				"cron_expression": map[string]any{
					"type":        "string",
					"description": "Cron expression (for create), e.g. '0 9 * * *'",
				},
				"prompt": map[string]any{
					"type":        "string",
					"description": "The prompt to run on the schedule (for create)",
				},
				"agent_id": map[string]any{
					"type":        "string",
					"description": "Agent to run the schedule with (for create)",
				},
			},
			"required": []string{"action"},
		},
	}
}

// Execute performs cron management.
func (t *CronScheduleTool) Execute(ctx context.Context, toolCallID string, args map[string]any) (gcatypes.ToolResult, error) {
	action, _ := args["action"].(string)

	if t.db == nil {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "cron database is not available"}},
			IsError: true,
		}, nil
	}

	switch action {
	case "list":
		return t.list(ctx)
	case "create":
		return t.create(ctx, args)
	case "cancel":
		return t.cancel(ctx, args)
	default:
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "action must be 'list', 'create', or 'cancel'"}},
			IsError: true,
		}, nil
	}
}

func (t *CronScheduleTool) list(ctx context.Context) (gcatypes.ToolResult, error) {
	rows, err := t.db.QueryContext(ctx,
		`SELECT id, cron_expression, prompt, agent_id, status, created_at FROM schedules ORDER BY created_at DESC LIMIT 50`,
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
		var id, expr, prompt, agentID, status string
		var createdAt int64
		if err := rows.Scan(&id, &expr, &prompt, &agentID, &status, &createdAt); err != nil {
			continue
		}
		fmt.Fprintf(&sb, "- %s: '%s' agent=%s cron=%s status=%s\n", id, prompt, agentID, expr, status)
		count++
	}

	if count == 0 {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "No cron schedules found."}},
		}, nil
	}

	return gcatypes.ToolResult{
		Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("%d schedules:\n%s", count, sb.String())}},
	}, nil
}

func (t *CronScheduleTool) create(ctx context.Context, args map[string]any) (gcatypes.ToolResult, error) {
	cronExpr, _ := args["cron_expression"].(string)
	prompt, _ := args["prompt"].(string)
	agentID, _ := args["agent_id"].(string)

	if cronExpr == "" {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "cron_expression is required for create"}},
			IsError: true,
		}, nil
	}
	if prompt == "" {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "prompt is required for create"}},
			IsError: true,
		}, nil
	}
	if agentID == "" {
		agentID = "default"
	}

	id := fmt.Sprintf("sched-%d", time.Now().UnixNano())
	now := time.Now().UnixMilli()

	_, err := t.db.ExecContext(ctx,
		`INSERT INTO schedules (id, cron_expression, prompt, agent_id, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)`,
		id, cronExpr, prompt, agentID, now,
	)
	if err != nil {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("Failed to create schedule: %v", err)}},
			IsError: true,
		}, nil
	}

	return gcatypes.ToolResult{
		Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("Schedule created: %s (%s)", id, cronExpr)}},
		Details: map[string]any{"schedule_id": id},
	}, nil
}

func (t *CronScheduleTool) cancel(ctx context.Context, args map[string]any) (gcatypes.ToolResult, error) {
	scheduleID, _ := args["schedule_id"].(string)
	if scheduleID == "" {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: "schedule_id is required for cancel"}},
			IsError: true,
		}, nil
	}

	result, err := t.db.ExecContext(ctx,
		`UPDATE schedules SET status = 'cancelled' WHERE id = ?`,
		scheduleID,
	)
	if err != nil {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("Failed to cancel schedule: %v", err)}},
			IsError: true,
		}, nil
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		return gcatypes.ToolResult{
			Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("Schedule %s not found", scheduleID)}},
			IsError: true,
		}, nil
	}

	return gcatypes.ToolResult{
		Content: []gcatypes.ContentBlock{{Type: "text", Text: fmt.Sprintf("Schedule %s cancelled", scheduleID)}},
	}, nil
}
