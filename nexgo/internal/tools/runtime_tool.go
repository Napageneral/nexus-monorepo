package tools

import (
	"context"
	"fmt"
	"runtime"
	"strings"
	"time"

	gcatypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"
)

// RuntimeStatusTool provides runtime status information.
type RuntimeStatusTool struct {
	startedAt time.Time
}

// NewRuntimeStatusTool creates a RuntimeStatusTool with the given start time.
func NewRuntimeStatusTool() *RuntimeStatusTool {
	return &RuntimeStatusTool{startedAt: time.Now()}
}

// Definition returns the tool schema.
func (t *RuntimeStatusTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        "runtime_status",
		Description: "Check Nexus runtime status including uptime, Go version, goroutine count, and memory usage.",
		Parameters: map[string]any{
			"type":       "object",
			"properties": map[string]any{},
		},
	}
}

// Execute returns runtime status.
func (t *RuntimeStatusTool) Execute(ctx context.Context, toolCallID string, args map[string]any) (gcatypes.ToolResult, error) {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	uptime := time.Since(t.startedAt).Round(time.Second)

	var sb strings.Builder
	fmt.Fprintf(&sb, "Runtime Status:\n")
	fmt.Fprintf(&sb, "  Uptime: %s\n", uptime)
	fmt.Fprintf(&sb, "  Go version: %s\n", runtime.Version())
	fmt.Fprintf(&sb, "  Goroutines: %d\n", runtime.NumGoroutine())
	fmt.Fprintf(&sb, "  Heap alloc: %.1f MB\n", float64(m.HeapAlloc)/1024/1024)
	fmt.Fprintf(&sb, "  Sys memory: %.1f MB\n", float64(m.Sys)/1024/1024)
	fmt.Fprintf(&sb, "  OS/Arch: %s/%s\n", runtime.GOOS, runtime.GOARCH)

	return gcatypes.ToolResult{
		Content: []gcatypes.ContentBlock{{Type: "text", Text: sb.String()}},
		Details: map[string]any{
			"uptime_seconds": int64(uptime.Seconds()),
			"goroutines":     runtime.NumGoroutine(),
			"heap_alloc_mb":  float64(m.HeapAlloc) / 1024 / 1024,
		},
	}, nil
}
