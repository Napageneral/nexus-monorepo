package tools

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/Napageneral/nexus/internal/config"
	gcatypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"
)

const (
	// defaultExecTimeout is the default command execution timeout.
	defaultExecTimeout = 30 * time.Second

	// maxExecTimeout is the maximum allowed execution timeout.
	maxExecTimeout = 5 * time.Minute

	// maxOutputSize limits command output to 100KB.
	maxOutputSize = 100 * 1024
)

// ExecTool provides sandboxed command execution with security layers.
// This is Nexus's own exec tool (not the go-coding-agent bash tool) with
// path guards, timeout management, and output truncation.
type ExecTool struct {
	stateDir string
	config   *config.Config
}

func (t *ExecTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        "nexus_exec",
		Description: "Execute a shell command in a sandboxed environment. Commands are restricted to the agent's workspace directory. Output is truncated at 100KB.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"command":    map[string]any{"type": "string", "description": "The command to execute (passed to /bin/sh -c)"},
				"workdir":    map[string]any{"type": "string", "description": "Working directory for the command (must be within allowed paths)"},
				"timeout_ms": map[string]any{"type": "integer", "description": "Timeout in milliseconds (default: 30000, max: 300000)"},
			},
			"required": []string{"command"},
		},
	}
}

func (t *ExecTool) Execute(ctx context.Context, callID string, args map[string]any) (gcatypes.ToolResult, error) {
	command, _ := args["command"].(string)
	if command == "" {
		return errorResult("command parameter is required"), nil
	}

	// Determine working directory.
	workdir := t.stateDir
	if wd, ok := args["workdir"].(string); ok && wd != "" {
		workdir = wd
	}

	// Validate working directory is within allowed paths.
	if err := t.validatePath(workdir); err != nil {
		return errorResult(fmt.Sprintf("path not allowed: %v", err)), nil
	}

	// Determine timeout.
	timeout := defaultExecTimeout
	if ms, ok := args["timeout_ms"].(float64); ok && ms > 0 {
		timeout = time.Duration(ms) * time.Millisecond
		if timeout > maxExecTimeout {
			timeout = maxExecTimeout
		}
	}

	// Create command with timeout context.
	execCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(execCtx, "/bin/sh", "-c", command)
	cmd.Dir = workdir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	startTime := time.Now()
	err := cmd.Run()
	duration := time.Since(startTime)

	// Build output.
	out := stdout.String()
	errOut := stderr.String()

	// Truncate if needed.
	outTruncated := false
	if len(out) > maxOutputSize {
		out = out[:maxOutputSize]
		outTruncated = true
	}
	errTruncated := false
	if len(errOut) > maxOutputSize {
		errOut = errOut[:maxOutputSize]
		errTruncated = true
	}

	var resultText strings.Builder
	if out != "" {
		resultText.WriteString(out)
		if outTruncated {
			resultText.WriteString("\n[stdout truncated at 100KB]")
		}
	}
	if errOut != "" {
		if resultText.Len() > 0 {
			resultText.WriteString("\n")
		}
		resultText.WriteString("STDERR:\n")
		resultText.WriteString(errOut)
		if errTruncated {
			resultText.WriteString("\n[stderr truncated at 100KB]")
		}
	}

	exitCode := 0
	isError := false
	if err != nil {
		isError = true
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else if execCtx.Err() == context.DeadlineExceeded {
			exitCode = -1
			resultText.WriteString(fmt.Sprintf("\n[command timed out after %s]", timeout))
		} else {
			exitCode = -1
			resultText.WriteString(fmt.Sprintf("\n[execution error: %v]", err))
		}
	}

	if resultText.Len() == 0 {
		resultText.WriteString("(no output)")
	}

	return gcatypes.ToolResult{
		Content: []gcatypes.ContentBlock{
			{Type: "text", Text: resultText.String()},
		},
		Details: map[string]any{
			"exit_code":   exitCode,
			"duration_ms": duration.Milliseconds(),
			"workdir":     workdir,
		},
		IsError: isError,
	}, nil
}

// validatePath checks that the given path is within the allowed workspace.
// If no stateDir is configured, all paths are allowed (development mode).
func (t *ExecTool) validatePath(path string) error {
	if t.stateDir == "" {
		// No sandbox configured — allow all paths.
		return nil
	}

	absPath, err := filepath.Abs(path)
	if err != nil {
		return fmt.Errorf("cannot resolve path: %w", err)
	}

	absState, err := filepath.Abs(t.stateDir)
	if err != nil {
		return fmt.Errorf("cannot resolve state dir: %w", err)
	}

	// Path must be within or equal to the state directory.
	if !strings.HasPrefix(absPath, absState) {
		return fmt.Errorf("path %q is outside workspace %q", absPath, absState)
	}

	return nil
}
