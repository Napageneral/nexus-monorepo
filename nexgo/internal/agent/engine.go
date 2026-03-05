package agent

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	gcaagent "github.com/badlogic/pi-mono/go-coding-agent/pkg/agent"
	gcasession "github.com/badlogic/pi-mono/go-coding-agent/pkg/session"
	gcatypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"

	"github.com/Napageneral/nexus/internal/config"
	"github.com/Napageneral/nexus/internal/db"
	"github.com/Napageneral/nexus/internal/pipeline"
	nexustools "github.com/Napageneral/nexus/internal/tools"
)

// Engine wraps go-coding-agent's Runtime for Nexus-specific usage.
// It manages auth, model selection, system prompt, skills, and tool assembly.
type Engine struct {
	ledgers     *db.Ledgers
	config      *config.Config
	authMgr     *AuthManager
	modelMgr    *ModelManager
	skillsMgr   *SkillsManager
	logger      *slog.Logger
	wsBroadcast func(msg any)

	// activeMu guards the activeRuns map.
	activeMu   sync.Mutex
	activeRuns map[string]*gcaagent.Runtime
}

// RunRequest contains all parameters for a single agent execution.
type RunRequest struct {
	SessionKey   string
	Prompt       string
	Attachments  []pipeline.Attachment
	Model        string
	Provider     string
	AgentID      string
	SystemPrompt string // override; if empty, built from skills/config
	ExtraTools   []gcatypes.ToolExecutor
	OnEvent      func(event StreamEvent) // per-request event hook
}

// RunResult is the outcome of an Engine.Run call.
type RunResult struct {
	Response   string           `json:"response"`
	ToolCalls  []ToolCallRecord `json:"tool_calls,omitempty"`
	TokensUsed TokenUsage       `json:"tokens_used"`
	Aborted    bool             `json:"aborted"`
	SessionID  string           `json:"session_id"`
}

// ToolCallRecord captures a single tool invocation for logging/audit.
type ToolCallRecord struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Arguments  map[string]any `json:"arguments,omitempty"`
	Result     string         `json:"result,omitempty"`
	IsError    bool           `json:"is_error"`
	DurationMS int64          `json:"duration_ms"`
}

// TokenUsage tracks token consumption for a run.
type TokenUsage struct {
	Input  int64 `json:"input"`
	Output int64 `json:"output"`
	Total  int64 `json:"total"`
}

// StreamEvent is a Nexus-native event emitted during agent execution.
type StreamEvent struct {
	Type       string         `json:"type"` // "text", "tool_start", "tool_result", "error", "done"
	Data       map[string]any `json:"data"`
	SessionKey string         `json:"session_key"`
}

// NewEngine creates an Engine with the provided configuration and ledgers.
func NewEngine(cfg *config.Config, ledgers *db.Ledgers, logger *slog.Logger) *Engine {
	if logger == nil {
		logger = slog.Default()
	}
	if cfg == nil {
		cfg = config.Default()
	}

	authMgr := NewAuthManager("", logger)
	modelMgr := NewModelManager(authMgr, cfg, logger)
	skillsMgr := NewSkillsManager("", "", logger)

	return &Engine{
		ledgers:    ledgers,
		config:     cfg,
		authMgr:    authMgr,
		modelMgr:   modelMgr,
		skillsMgr:  skillsMgr,
		logger:     logger,
		activeRuns: make(map[string]*gcaagent.Runtime),
	}
}

// SetBroadcast sets the function used to broadcast stream events to
// WebSocket clients.
func (e *Engine) SetBroadcast(fn func(msg any)) {
	e.wsBroadcast = fn
}

// AuthManager returns the engine's auth manager.
func (e *Engine) AuthManager() *AuthManager { return e.authMgr }

// ModelManager returns the engine's model manager.
func (e *Engine) ModelManager() *ModelManager { return e.modelMgr }

// SkillsManager returns the engine's skills manager.
func (e *Engine) SkillsManager() *SkillsManager { return e.skillsMgr }

// Run executes a single agent turn. It resolves the model, builds the
// system prompt, assembles tools, creates a go-coding-agent Runtime,
// runs the prompt, and returns the result.
func (e *Engine) Run(ctx context.Context, req RunRequest) (*RunResult, error) {
	startTime := time.Now()

	// 1. Resolve model + API key.
	model, err := e.modelMgr.Resolve(req.Provider, req.Model)
	if err != nil {
		return nil, fmt.Errorf("resolve model: %w", err)
	}
	apiKey := e.authMgr.GetAPIKey(model.Provider)

	// 2. Build system prompt.
	systemPrompt := req.SystemPrompt
	if strings.TrimSpace(systemPrompt) == "" {
		systemPrompt = e.buildDefaultPrompt(req)
	}

	// 3. Resolve working directory (tools assembled after runtime creation).
	cwd := e.resolveCWD(req)

	// 4. Create in-memory session manager.
	sm := gcasession.NewInMemory(cwd)

	// 5. Create go-coding-agent Runtime.
	rt, err := gcaagent.NewRuntime(gcaagent.NewRuntimeOptions{
		CWD:            cwd,
		Provider:       model.Provider,
		Model:          model.ID,
		APIKey:         apiKey,
		SystemPrompt:   systemPrompt,
		SessionManager: sm,
		EventHook:      e.makeEventHook(req.SessionKey, req.OnEvent),
	})
	if err != nil {
		return nil, fmt.Errorf("create runtime: %w", err)
	}

	// 5b. Inject Nexus-specific tools into the runtime's tool registry.
	// This extends the built-in coding tools (read, write, edit, bash, etc.)
	// with Nexus domain tools (cortex_recall, web_search, exec, etc.).
	nexusTools := e.assembleNexusTools(cwd, req.ExtraTools)
	if len(nexusTools) > 0 {
		rt.RegisterTools(nexusTools...)
	}

	// Register this run so it can be aborted.
	e.registerRun(req.SessionKey, rt)
	defer e.unregisterRun(req.SessionKey)

	// 6. Run the prompt (with context cancellation support).
	done := make(chan struct{})
	var respMsg gcatypes.Message
	var runErr error

	go func() {
		defer close(done)
		respMsg, runErr = rt.Prompt(req.Prompt)
	}()

	select {
	case <-ctx.Done():
		rt.Abort()
		<-done // wait for the goroutine to finish
		return &RunResult{
			Aborted:   true,
			SessionID: sm.SessionID(),
		}, ctx.Err()
	case <-done:
		// completed normally
	}

	aborted := false
	if runErr != nil && runErr == gcaagent.ErrAborted {
		aborted = true
		runErr = nil
	}
	if runErr != nil {
		e.authMgr.MarkFailure(model.Provider)
		return nil, fmt.Errorf("agent prompt: %w", runErr)
	}
	e.authMgr.MarkSuccess(model.Provider)

	// 7. Build result.
	responseText := gcaagent.AssistantText(respMsg)
	toolCalls := e.extractToolCalls(sm)
	usage := TokenUsage{
		Input:  respMsg.Usage.Input,
		Output: respMsg.Usage.Output,
		Total:  respMsg.Usage.Total,
	}

	result := &RunResult{
		Response:   responseText,
		ToolCalls:  toolCalls,
		TokensUsed: usage,
		Aborted:    aborted,
		SessionID:  sm.SessionID(),
	}

	// Emit done event.
	doneEvent := StreamEvent{
		Type:       "done",
		SessionKey: req.SessionKey,
		Data: map[string]any{
			"duration_ms": time.Since(startTime).Milliseconds(),
			"aborted":     aborted,
		},
	}
	if req.OnEvent != nil {
		req.OnEvent(doneEvent)
	}
	if e.wsBroadcast != nil {
		e.wsBroadcast(doneEvent)
	}

	return result, nil
}

// Abort cancels a running session by session key.
func (e *Engine) Abort(sessionKey string) {
	e.activeMu.Lock()
	rt, ok := e.activeRuns[sessionKey]
	e.activeMu.Unlock()
	if ok {
		rt.Abort()
	}
}

// registerRun tracks an active runtime for abort support.
func (e *Engine) registerRun(key string, rt *gcaagent.Runtime) {
	e.activeMu.Lock()
	e.activeRuns[key] = rt
	e.activeMu.Unlock()
}

// unregisterRun removes an active runtime after completion.
func (e *Engine) unregisterRun(key string) {
	e.activeMu.Lock()
	delete(e.activeRuns, key)
	e.activeMu.Unlock()
}

// buildDefaultPrompt assembles a system prompt from skills and config.
func (e *Engine) buildDefaultPrompt(req RunRequest) string {
	var agentName, agentPersonality string
	if e.config != nil && e.config.UI.Assistant.Name != "" {
		agentName = e.config.UI.Assistant.Name
	}
	if agentName == "" {
		agentName = "Nexus"
	}

	skills := e.skillsMgr.LoadForPrompt(e.config)

	return BuildSystemPrompt(PromptContext{
		AgentName:        agentName,
		AgentPersonality: agentPersonality,
		Skills:           skills,
	})
}

// resolveCWD determines the working directory for tool execution.
func (e *Engine) resolveCWD(req RunRequest) string {
	if e.config != nil {
		// Check per-agent workspace first.
		if req.AgentID != "" {
			for _, a := range e.config.Agents.List {
				if a.ID == req.AgentID && a.Workspace != "" {
					return a.Workspace
				}
			}
		}
		// Fall back to the defaults workspace.
		if e.config.Agents.Defaults.Workspace != "" {
			return e.config.Agents.Defaults.Workspace
		}
	}
	return "."
}

// assembleNexusTools returns domain-specific tool executors to inject into
// the go-coding-agent Runtime. The Runtime already has the coding builtins;
// these are the Nexus-specific additions (memory, web, exec, etc.).
func (e *Engine) assembleNexusTools(_ string, extras []gcatypes.ToolExecutor) []gcatypes.ToolExecutor {
	var result []gcatypes.ToolExecutor

	// Build Nexus domain tools from our tools package.
	ctx := nexustools.ToolContext{
		Ledgers:    e.ledgers,
		Config:     e.config,
		SessionKey: "",
		AgentID:    "",
		StateDir:   "",
	}
	result = append(result, nexustools.BuildNexusTools(ctx)...)

	// Append any per-request extra tools.
	result = append(result, extras...)

	return result
}

// extractToolCalls extracts tool call records from the session history.
func (e *Engine) extractToolCalls(sm *gcasession.Manager) []ToolCallRecord {
	var records []ToolCallRecord
	entries := sm.Entries()
	for _, entry := range entries {
		if entry.Type != "message" || entry.Message == nil {
			continue
		}
		msg := entry.Message
		if msg.Role == gcatypes.RoleTool {
			rec := ToolCallRecord{
				ID:      msg.ToolCallID,
				Name:    msg.ToolName,
				IsError: msg.IsError,
			}
			// Extract text content as the result.
			var parts []string
			for _, block := range msg.Content {
				if block.Type == "text" {
					parts = append(parts, block.Text)
				}
			}
			rec.Result = strings.Join(parts, "\n")
			records = append(records, rec)
		}
	}
	return records
}
