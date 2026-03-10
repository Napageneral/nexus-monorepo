package broker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"

	goagent "github.com/badlogic/pi-mono/go-coding-agent/pkg/agent"
	gosession "github.com/badlogic/pi-mono/go-coding-agent/pkg/session"
	gotypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"
)

// GoAgentEngine executes turns using go-coding-agent as a native Go library.
// No subprocess, no RPC, no .jsonl files — the broker ledger is the source
// of truth and conversation history is seeded into an in-memory SessionManager.
type GoAgentEngine struct{}

func NewGoAgentEngine() *GoAgentEngine {
	return &GoAgentEngine{}
}

func (e *GoAgentEngine) Start(ctx context.Context, opts EngineStartOpts) (EngineHandle, error) {
	cwd := strings.TrimSpace(opts.WorkDir)
	if cwd == "" {
		cwd = "."
	}

	// Create in-memory session manager seeded with history from the ledger.
	sm := gosession.NewInMemory(cwd)

	// Seed conversation history (from BuildLedgerHistory).
	for _, msg := range opts.History {
		goMsg := gotypes.TextMessage(msg.Role, msg.Content)
		if _, err := sm.AppendMessage(goMsg); err != nil {
			return nil, fmt.Errorf("failed to seed history message: %w", err)
		}
	}

	provider := strings.TrimSpace(opts.Provider)
	model := strings.TrimSpace(opts.Model)

	// Parse model string: "gpt-5.3-codex:high" → model="gpt-5.3-codex", thinkLevel="high"
	// The suffix is a thinking level, not part of the model ID.
	thinkLevel := strings.TrimSpace(opts.ThinkLevel)
	if idx := strings.LastIndex(model, ":"); idx > 0 {
		suffix := model[idx+1:]
		switch strings.ToLower(suffix) {
		case "xhigh", "high", "medium", "low", "none":
			if thinkLevel == "" {
				thinkLevel = suffix
			}
			model = model[:idx]
		}
	}

	// Infer provider from model if not set.
	if provider == "" {
		provider = inferGoAgentProvider(model)
	}

	apiKey := ""
	if len(opts.Env) > 0 {
		// Check common API key env vars.
		for _, key := range []string{"ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY"} {
			if v, ok := opts.Env[key]; ok && v != "" {
				apiKey = v
				break
			}
		}
	}
	// Fall back to environment variables from the OS.
	if apiKey == "" {
		apiKey = osEnvAPIKey(provider)
	}

	rt, err := goagent.NewRuntime(goagent.NewRuntimeOptions{
		CWD:            cwd,
		Provider:       provider,
		Model:          model,
		APIKey:         apiKey,
		SystemPrompt:   strings.TrimSpace(opts.SystemPrompt),
		SessionManager: sm,
	})
	if err != nil {
		return nil, fmt.Errorf("go-agent runtime init failed: %w", err)
	}
	normalizedThinkLevel := normalizeThinkingLevel(thinkLevel)
	if normalizedThinkLevel == "" {
		normalizedThinkLevel = "medium"
	}
	if err := rt.SetThinkingLevel(normalizedThinkLevel); err != nil {
		return nil, fmt.Errorf("failed to set runtime thinking level: %w", err)
	}
	if normalizedThinkLevel != "medium" {
		if _, err := sm.AppendThinkingLevel(normalizedThinkLevel); err != nil {
			return nil, fmt.Errorf("failed to set initial thinking level: %w", err)
		}
	}

	handle := &goAgentHandle{
		runtime:        rt,
		session:        sm,
		lastEntryIndex: len(sm.Entries()),
		thinkLevel:     normalizedThinkLevel,
		systemPrompt:   strings.TrimSpace(opts.SystemPrompt),
		workDir:        cwd,
		runtimeEvents:  true,
		listeners:      map[int]func(AgentEvent){},
	}
	rt.SetEventHook(handle.onRuntimeEvent)
	return handle, nil
}

type goAgentHandle struct {
	runtime        *goagent.Runtime
	session        *gosession.Manager
	lastEntryIndex int
	lastToolCalls  []engineToolCallSnapshot
	thinkLevel     string
	systemPrompt   string
	workDir        string
	runtimeEvents  bool

	mu           sync.Mutex
	execMu       sync.Mutex
	nextListener int
	listeners    map[int]func(AgentEvent)
}

func (h *goAgentHandle) Prompt(ctx context.Context, message string) (*TurnResult, error) {
	h.execMu.Lock()
	defer h.execMu.Unlock()
	message = strings.TrimSpace(message)
	if message == "" {
		return nil, fmt.Errorf("prompt message is required")
	}
	if h.runtime == nil {
		return nil, fmt.Errorf("engine runtime is not initialized")
	}

	assistant, err := h.runtime.Prompt(message)
	h.lastToolCalls = h.captureToolCallsSinceCursor()
	content := extractGoAgentText(assistant)
	if !h.runtimeEvents {
		for _, call := range h.lastToolCalls {
			h.emitEvent(AgentEvent{
				Type: "tool",
				Data: map[string]interface{}{
					"phase":      "start",
					"toolCallId": call.ID,
					"name":       call.ToolName,
					"args":       parseJSONValue(call.ParamsJSON),
				},
			})
			h.emitEvent(AgentEvent{
				Type: "tool",
				Data: map[string]interface{}{
					"phase":      "result",
					"toolCallId": call.ID,
					"name":       call.ToolName,
					"isError":    call.Status == "failed",
					"result":     parseJSONValue(call.ResultJSON),
					"error":      call.Error,
				},
			})
		}
		if strings.TrimSpace(content) != "" {
			h.emitEvent(AgentEvent{
				Type: "assistant",
				Data: map[string]interface{}{
					"text": content,
				},
			})
		}
	}
	if err != nil {
		if errors.Is(err, goagent.ErrAborted) {
			err = context.Canceled
		}
		return nil, err
	}

	turnID := "turn:" + fmt.Sprintf("%d", gotypes.NowMillis())
	messageID := turnID + ":assistant"

	status := "completed"
	if assistant.StopReason == "error" || assistant.Error != "" {
		status = "failed"
	}

	return &TurnResult{
		TurnID:        turnID,
		MessageID:     messageID,
		Content:       content,
		Status:        status,
		ToolCallCount: len(h.lastToolCalls),
		Usage: SessionStats{
			InputTokens:       int(assistant.Usage.Input),
			OutputTokens:      int(assistant.Usage.Output),
			CachedInputTokens: int(assistant.Usage.CacheRead),
			CacheWriteTokens:  int(assistant.Usage.CacheWrite),
			TotalTokens:       int(assistant.Usage.Total),
		},
	}, nil
}

func (h *goAgentHandle) consumeToolCalls() []engineToolCallSnapshot {
	if len(h.lastToolCalls) == 0 {
		return nil
	}
	out := append([]engineToolCallSnapshot(nil), h.lastToolCalls...)
	h.lastToolCalls = nil
	return out
}

func (h *goAgentHandle) Steer(ctx context.Context, message string) error {
	message = strings.TrimSpace(message)
	if message == "" {
		return nil
	}
	if h.runtime != nil {
		h.runtime.Abort()
	}
	_, err := h.Prompt(ctx, message)
	return err
}

func (h *goAgentHandle) GetMessages(_ context.Context) ([]AgentMessage, error) {
	entries := h.session.Entries()
	out := make([]AgentMessage, 0, len(entries))
	for _, e := range entries {
		if e.Type != "message" || e.Message == nil {
			continue
		}
		out = append(out, AgentMessage{
			Content: extractGoAgentText(*e.Message),
			Mode:    e.Message.Role,
		})
	}
	return out, nil
}

func (h *goAgentHandle) GetState(_ context.Context) (*EngineSessionState, error) {
	model := h.runtime.Model()
	return &EngineSessionState{
		SessionID: h.session.SessionID(),
		Provider:  model.Provider,
		Model:     model.ID,
	}, nil
}

func (h *goAgentHandle) GetSessionStats(_ context.Context) (*SessionStats, error) {
	return &SessionStats{}, nil
}

func (h *goAgentHandle) Compact(ctx context.Context, instructions string) (*CompactionResult, error) {
	if h.session == nil {
		return nil, fmt.Errorf("engine session is not initialized")
	}
	h.emitEvent(AgentEvent{
		Type: "compaction",
		Data: map[string]interface{}{
			"phase": "start",
		},
	})
	entries := h.session.Entries()
	firstKept := ""
	for _, entry := range entries {
		if entry.Type == "message" {
			firstKept = strings.TrimSpace(entry.ID)
			if firstKept != "" {
				break
			}
		}
	}
	lines := make([]string, 0, 24)
	tokensBefore := 0
	for _, entry := range entries {
		if entry.Type != "message" || entry.Message == nil {
			continue
		}
		text := extractGoAgentText(*entry.Message)
		if text == "" {
			continue
		}
		role := strings.TrimSpace(entry.Message.Role)
		if role == "" {
			role = "message"
		}
		lines = append(lines, role+": "+text)
		tokensBefore += len([]rune(text)) / 4
	}
	if len(lines) == 0 {
		return nil, fmt.Errorf("cannot compact: no message content")
	}
	if len(lines) > 24 {
		lines = lines[len(lines)-24:]
	}
	summary := strings.Join(lines, "\n")
	if modelSummary, ok := h.tryModelCompactionSummary(ctx, summary, instructions); ok {
		summary = modelSummary
	}
	if _, err := h.session.AppendCompaction(summary, firstKept, tokensBefore); err != nil {
		return nil, err
	}
	tokensAfter := len([]rune(summary)) / 4
	if tokensAfter < 1 {
		tokensAfter = 1
	}
	h.emitEvent(AgentEvent{
		Type: "compaction",
		Data: map[string]interface{}{
			"phase":     "end",
			"summary":   summary,
			"retryable": false,
		},
	})
	return &CompactionResult{
		Summary:        summary,
		FirstKeptEntry: firstKept,
		TokensBefore:   tokensBefore,
		TokensAfter:    tokensAfter,
		DurationMS:     0,
	}, nil
}

func (h *goAgentHandle) SetModel(_ context.Context, provider, modelID string) error {
	return h.runtime.SetModel(provider, modelID)
}

func (h *goAgentHandle) SetThinkingLevel(_ context.Context, level string) error {
	if h.session == nil {
		return fmt.Errorf("engine session is not initialized")
	}
	normalized := normalizeThinkingLevel(level)
	if normalized == "" {
		return fmt.Errorf("unsupported thinking level: %q", level)
	}
	if normalized == h.thinkLevel {
		return nil
	}
	if h.runtime != nil {
		if err := h.runtime.SetThinkingLevel(normalized); err != nil {
			return err
		}
	}
	if _, err := h.session.AppendThinkingLevel(normalized); err != nil {
		return err
	}
	h.thinkLevel = normalized
	h.emitEvent(AgentEvent{
		Type: "thinking",
		Data: map[string]interface{}{
			"level": normalized,
		},
	})
	return nil
}

func (h *goAgentHandle) OnEvent(listener func(AgentEvent)) (unsubscribe func()) {
	if listener == nil {
		return func() {}
	}
	h.mu.Lock()
	if h.listeners == nil {
		h.listeners = map[int]func(AgentEvent){}
	}
	h.nextListener++
	id := h.nextListener
	h.listeners[id] = listener
	h.mu.Unlock()
	return func() {
		h.mu.Lock()
		delete(h.listeners, id)
		h.mu.Unlock()
	}
}

func (h *goAgentHandle) Stop(_ context.Context) error {
	if h.runtime != nil {
		h.runtime.Abort()
	}
	return nil
}

func (h *goAgentHandle) tryModelCompactionSummary(_ context.Context, localSummary string, instructions string) (string, bool) {
	if h.session == nil || h.runtime == nil {
		return "", false
	}
	localSummary = strings.TrimSpace(localSummary)
	if localSummary == "" {
		return "", false
	}

	cloned, err := cloneSessionForCompaction(h.session)
	if err != nil {
		return "", false
	}
	model := h.runtime.Model()
	worker, err := goagent.NewRuntime(goagent.NewRuntimeOptions{
		CWD:            firstNonBlank(strings.TrimSpace(h.workDir), strings.TrimSpace(h.session.CWD()), "."),
		Provider:       strings.TrimSpace(model.Provider),
		Model:          strings.TrimSpace(model.ID),
		APIKey:         osEnvAPIKey(model.Provider),
		SystemPrompt:   strings.TrimSpace(h.systemPrompt),
		SessionManager: cloned,
	})
	if err != nil {
		return "", false
	}

	before := len(cloned.Entries())
	assistant, err := worker.Prompt(compactionPrompt(localSummary, instructions))
	if err != nil {
		return "", false
	}
	after := cloned.Entries()
	if before >= 0 && before <= len(after) {
		if len(collectToolCallsFromEntries(after[before:])) > 0 {
			return "", false
		}
	}
	summary := strings.TrimSpace(extractGoAgentText(assistant))
	if summary == "" {
		return "", false
	}
	return summary, true
}

func compactionPrompt(localSummary string, instructions string) string {
	localSummary = strings.TrimSpace(localSummary)
	instructions = strings.TrimSpace(instructions)
	parts := []string{
		"You are compacting session history for a coding assistant.",
		"Produce a concise but complete compaction summary suitable for future context reconstruction.",
		"Do not call tools. Output plain text only.",
	}
	if instructions != "" {
		parts = append(parts, "Additional instructions:\n"+instructions)
	}
	parts = append(parts, "Conversation excerpt:\n"+localSummary)
	return strings.Join(parts, "\n\n")
}

func cloneSessionForCompaction(src *gosession.Manager) (*gosession.Manager, error) {
	if src == nil {
		return nil, fmt.Errorf("session manager is required")
	}
	cloned := gosession.NewInMemory(firstNonBlank(strings.TrimSpace(src.CWD()), "."))
	for _, entry := range src.Entries() {
		switch strings.TrimSpace(entry.Type) {
		case "message":
			if entry.Message == nil {
				continue
			}
			if _, err := cloned.AppendMessage(*entry.Message); err != nil {
				return nil, err
			}
		case "model_change":
			if strings.TrimSpace(entry.Provider) == "" && strings.TrimSpace(entry.ModelID) == "" {
				continue
			}
			if _, err := cloned.AppendModelChange(strings.TrimSpace(entry.Provider), strings.TrimSpace(entry.ModelID)); err != nil {
				return nil, err
			}
		case "thinking_level_change":
			level := strings.TrimSpace(entry.ThinkingLevel)
			if level == "" {
				continue
			}
			if _, err := cloned.AppendThinkingLevel(level); err != nil {
				return nil, err
			}
		case "compaction":
			summary := strings.TrimSpace(entry.Summary)
			if summary == "" {
				continue
			}
			if _, err := cloned.AppendCompaction(summary, strings.TrimSpace(entry.FirstKeptEntry), entry.TokensBefore); err != nil {
				return nil, err
			}
		}
	}
	return cloned, nil
}

func (h *goAgentHandle) captureToolCallsSinceCursor() []engineToolCallSnapshot {
	entries := h.session.Entries()
	if h.lastEntryIndex < 0 || h.lastEntryIndex > len(entries) {
		h.lastEntryIndex = len(entries)
		return nil
	}
	recent := entries[h.lastEntryIndex:]
	h.lastEntryIndex = len(entries)
	return collectToolCallsFromEntries(recent)
}

func collectToolCallsFromEntries(entries []gosession.Entry) []engineToolCallSnapshot {
	if len(entries) == 0 {
		return nil
	}
	ordered := make([]string, 0)
	states := make(map[string]*engineToolCallSnapshot)
	nextAnon := 0

	ensureState := func(callID string) *engineToolCallSnapshot {
		callID = strings.TrimSpace(callID)
		if callID == "" {
			nextAnon++
			callID = fmt.Sprintf("tool_call_%d", nextAnon)
		}
		state, ok := states[callID]
		if !ok {
			state = &engineToolCallSnapshot{
				ID:     callID,
				Status: "pending",
			}
			states[callID] = state
			ordered = append(ordered, callID)
		}
		return state
	}

	for _, entry := range entries {
		if entry.Type != "message" || entry.Message == nil {
			continue
		}
		msg := entry.Message

		if msg.Role == gotypes.RoleAssistant {
			for _, block := range msg.Content {
				if block.Type != "toolCall" {
					continue
				}
				state := ensureState(block.ID)
				if name := strings.TrimSpace(block.Name); name != "" {
					state.ToolName = name
				}
				if block.Arguments != nil {
					state.ParamsJSON = mustJSON(block.Arguments, "{}")
				} else if strings.TrimSpace(state.ParamsJSON) == "" {
					state.ParamsJSON = "{}"
				}
			}
			continue
		}

		if msg.Role != gotypes.RoleTool {
			continue
		}

		callID := strings.TrimSpace(msg.ToolCallID)
		if callID == "" {
			callID = findPendingCallForToolName(ordered, states, msg.ToolName)
		}
		state := ensureState(callID)
		if state.ToolName == "" {
			state.ToolName = strings.TrimSpace(msg.ToolName)
		}
		state.ResultJSON = toolResultJSON(*msg)
		if msg.IsError {
			state.Status = "failed"
			state.Error = extractGoAgentText(*msg)
			if strings.TrimSpace(state.Error) == "" {
				state.Error = "tool call failed"
			}
		} else {
			state.Status = "completed"
			state.Error = ""
		}
	}

	out := make([]engineToolCallSnapshot, 0, len(ordered))
	for _, id := range ordered {
		state := states[id]
		if state == nil {
			continue
		}
		if strings.TrimSpace(state.ToolName) == "" {
			state.ToolName = "tool"
		}
		if strings.TrimSpace(state.ParamsJSON) == "" {
			state.ParamsJSON = "{}"
		}
		if strings.TrimSpace(state.Status) == "" {
			state.Status = "pending"
		}
		out = append(out, *state)
	}
	return out
}

func findPendingCallForToolName(order []string, states map[string]*engineToolCallSnapshot, toolName string) string {
	toolName = strings.TrimSpace(toolName)
	if toolName == "" {
		return ""
	}
	for _, id := range order {
		state := states[id]
		if state == nil {
			continue
		}
		if state.ToolName == toolName && state.Status == "pending" {
			return id
		}
	}
	return ""
}

func toolResultJSON(msg gotypes.Message) string {
	payload := map[string]any{
		"toolCallId": msg.ToolCallID,
		"toolName":   msg.ToolName,
		"isError":    msg.IsError,
		"content":    msg.Content,
	}
	return mustJSON(payload, "{}")
}

func (h *goAgentHandle) emitEvent(event AgentEvent) {
	h.mu.Lock()
	listeners := make([]func(AgentEvent), 0, len(h.listeners))
	for _, listener := range h.listeners {
		listeners = append(listeners, listener)
	}
	h.mu.Unlock()
	for _, listener := range listeners {
		listener(event)
	}
}

func (h *goAgentHandle) onRuntimeEvent(event goagent.RuntimeEvent) {
	eventType := strings.ToLower(strings.TrimSpace(event.Type))
	payload := map[string]interface{}{}
	for key, value := range event.Data {
		payload[key] = value
	}
	switch eventType {
	case "assistant":
		text := strings.TrimSpace(anyToString(payload["text"]))
		if text == "" {
			return
		}
		h.emitEvent(AgentEvent{
			Type: "assistant",
			Data: map[string]interface{}{"text": text},
		})
	case "tool":
		h.emitEvent(AgentEvent{
			Type: "tool",
			Data: payload,
		})
	case "provider_progress":
		h.emitEvent(AgentEvent{
			Type: "provider_progress",
			Data: payload,
		})
	}
}

func parseJSONValue(raw string) interface{} {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var out interface{}
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return raw
	}
	return out
}

func normalizeThinkingLevel(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "xhigh":
		return "high"
	case "low", "medium", "high", "none":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return ""
	}
}

func extractGoAgentText(msg gotypes.Message) string {
	var parts []string
	for _, block := range msg.Content {
		if block.Type == "text" && strings.TrimSpace(block.Text) != "" {
			parts = append(parts, strings.TrimSpace(block.Text))
		}
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}

// inferGoAgentProvider maps a model ID to its go-coding-agent provider name.
func inferGoAgentProvider(model string) string {
	m := strings.ToLower(strings.TrimSpace(model))
	if m == "" {
		return ""
	}
	if strings.Contains(m, "codex") {
		return "openai-codex"
	}
	if strings.HasPrefix(m, "gpt-") || strings.HasPrefix(m, "o1") || strings.HasPrefix(m, "o3") || strings.HasPrefix(m, "o4") {
		return "openai"
	}
	if strings.Contains(m, "claude") || strings.Contains(m, "opus") || strings.Contains(m, "sonnet") || strings.Contains(m, "haiku") {
		return "anthropic"
	}
	if strings.Contains(m, "gemini") {
		return "google"
	}
	return ""
}

// osEnvAPIKey reads an API key from the OS environment for the given provider.
func osEnvAPIKey(provider string) string {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "anthropic":
		return os.Getenv("ANTHROPIC_API_KEY")
	case "openai":
		return os.Getenv("OPENAI_API_KEY")
	case "openai-codex":
		// Codex uses OAuth tokens from auth.json; don't override with a
		// plain API key so the go-agent runtime's built-in OAuth flow is
		// used instead.
		return ""
	case "google":
		return os.Getenv("GOOGLE_API_KEY")
	default:
		return ""
	}
}
