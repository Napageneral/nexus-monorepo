package agent

import (
	"context"
	"log/slog"
	"os"
	"testing"

	gcatypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"

	"github.com/Napageneral/nexus/internal/config"
)

func defaultTestConfig() *config.Config {
	return config.Default()
}

func TestEngineCreation(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	cfg := defaultTestConfig()

	// nil ledgers should work for basic creation.
	engine := NewEngine(cfg, nil, logger)
	if engine == nil {
		t.Fatal("expected non-nil Engine")
	}
	if engine.config == nil {
		t.Fatal("expected non-nil config")
	}
	if engine.authMgr == nil {
		t.Fatal("expected non-nil authMgr")
	}
	if engine.modelMgr == nil {
		t.Fatal("expected non-nil modelMgr")
	}
	if engine.skillsMgr == nil {
		t.Fatal("expected non-nil skillsMgr")
	}
	if engine.AuthManager() == nil {
		t.Fatal("AuthManager() should not be nil")
	}
	if engine.ModelManager() == nil {
		t.Fatal("ModelManager() should not be nil")
	}
	if engine.SkillsManager() == nil {
		t.Fatal("SkillsManager() should not be nil")
	}
}

func TestEngineCreationNilConfig(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	engine := NewEngine(nil, nil, logger)
	if engine == nil {
		t.Fatal("expected non-nil Engine even with nil config")
	}
	if engine.config == nil {
		t.Fatal("expected default config to be applied")
	}
}

func TestEngineCreationNilLogger(t *testing.T) {
	engine := NewEngine(nil, nil, nil)
	if engine == nil {
		t.Fatal("expected non-nil Engine with nil logger")
	}
}

func TestEngineSetBroadcast(t *testing.T) {
	engine := NewEngine(nil, nil, nil)
	called := false
	engine.SetBroadcast(func(msg any) {
		called = true
	})
	if engine.wsBroadcast == nil {
		t.Fatal("expected wsBroadcast to be set")
	}
	engine.wsBroadcast("test")
	if !called {
		t.Fatal("expected broadcast to be called")
	}
}

// stubTool is a test ToolExecutor that does nothing.
type stubTool struct {
	name string
}

func (s *stubTool) Definition() gcatypes.Tool {
	return gcatypes.Tool{
		Name:        s.name,
		Description: "A stub tool for testing: " + s.name,
		Parameters:  map[string]any{},
	}
}

func (s *stubTool) Execute(_ context.Context, _ string, _ map[string]interface{}) (gcatypes.ToolResult, error) {
	return gcatypes.ToolResult{
		Content: []gcatypes.ContentBlock{{Type: "text", Text: "stub result from " + s.name}},
	}, nil
}

func TestToolRegistration(t *testing.T) {
	engine := NewEngine(nil, nil, nil)

	extras := []gcatypes.ToolExecutor{
		&stubTool{name: "nexus_memory_search"},
		&stubTool{name: "nexus_send_message"},
	}

	// assembleNexusTools should include the extra tools alongside Nexus domain tools.
	tools := engine.assembleNexusTools(".", extras)

	names := make(map[string]bool)
	for _, t := range tools {
		names[t.Definition().Name] = true
	}

	if !names["nexus_memory_search"] {
		t.Error("expected nexus_memory_search in tool list")
	}
	if !names["nexus_send_message"] {
		t.Error("expected nexus_send_message in tool list")
	}
}

func TestToolRegistrationEmpty(t *testing.T) {
	engine := NewEngine(nil, nil, nil)

	// No extra tools: should still return Nexus domain tools (web_search, web_fetch, exec).
	tools := engine.assembleNexusTools(".", nil)

	if len(tools) == 0 {
		t.Fatal("expected at least Nexus domain tools")
	}

	// Check for at least one known Nexus tool.
	names := make(map[string]bool)
	for _, tool := range tools {
		names[tool.Definition().Name] = true
	}
	// Nexus domain tools include web_search, web_fetch, exec (memory tools need ledgers).
	if !names["web_fetch"] {
		t.Error("expected 'web_fetch' Nexus tool in default tool list")
	}
}

func TestEngineAbortNoRun(t *testing.T) {
	engine := NewEngine(nil, nil, nil)
	// Abort on a non-existent session key should not panic.
	engine.Abort("nonexistent-session")
}

func TestEngineBuildDefaultPrompt(t *testing.T) {
	engine := NewEngine(nil, nil, nil)
	prompt := engine.buildDefaultPrompt(RunRequest{})
	if prompt == "" {
		t.Fatal("expected non-empty default prompt")
	}
}

func TestEngineResolveCWD(t *testing.T) {
	cfg := defaultTestConfig()
	cfg.Agents.Defaults.Workspace = "/tmp/test-workspace"
	engine := NewEngine(cfg, nil, nil)

	// No agent ID: should use defaults workspace.
	cwd := engine.resolveCWD(RunRequest{})
	if cwd != "/tmp/test-workspace" {
		t.Errorf("expected /tmp/test-workspace, got %q", cwd)
	}

	// Agent with specific workspace.
	cfg.Agents.List = []config.AgentConfig{
		{ID: "agent-1", Workspace: "/tmp/agent-1-ws"},
	}
	cwd = engine.resolveCWD(RunRequest{AgentID: "agent-1"})
	if cwd != "/tmp/agent-1-ws" {
		t.Errorf("expected /tmp/agent-1-ws, got %q", cwd)
	}

	// Unknown agent ID falls back to defaults.
	cwd = engine.resolveCWD(RunRequest{AgentID: "unknown"})
	if cwd != "/tmp/test-workspace" {
		t.Errorf("expected /tmp/test-workspace fallback, got %q", cwd)
	}
}
