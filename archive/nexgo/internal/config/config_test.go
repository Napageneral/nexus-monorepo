package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	cfg := Default()

	if cfg.Runtime.Port != DefaultRuntimePort {
		t.Fatalf("expected default port %d, got %d", DefaultRuntimePort, cfg.Runtime.Port)
	}
	if cfg.Runtime.Bind != "loopback" {
		t.Fatalf("expected default bind 'loopback', got %q", cfg.Runtime.Bind)
	}
	if cfg.Logging.Level != "info" {
		t.Fatalf("expected default log level 'info', got %q", cfg.Logging.Level)
	}
	if cfg.Logging.ConsoleStyle != "pretty" {
		t.Fatalf("expected default console style 'pretty', got %q", cfg.Logging.ConsoleStyle)
	}
	if cfg.Session.MainKey != "main" {
		t.Fatalf("expected session.mainKey 'main', got %q", cfg.Session.MainKey)
	}
	if cfg.Agents.Defaults.MaxConcurrent != 4 {
		t.Fatalf("expected agents.defaults.maxConcurrent 4, got %d", cfg.Agents.Defaults.MaxConcurrent)
	}
}

func TestLoadNonexistentReturnsDefault(t *testing.T) {
	cfg, err := Load("/nonexistent/path/config.json")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Runtime.Port != DefaultRuntimePort {
		t.Fatalf("expected default port, got %d", cfg.Runtime.Port)
	}
}

func TestLoadAndSaveRoundTrip(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.json")

	original := &Config{
		Runtime: RuntimeConfig{
			Port: 9999,
			Bind: "lan",
		},
		Logging: LoggingConfig{
			Level: "debug",
		},
		Agents: AgentsConfig{
			List: []AgentConfig{
				{ID: "default", Default: true, Name: "Test Agent"},
			},
		},
	}

	if err := Save(original, configPath); err != nil {
		t.Fatalf("save error: %v", err)
	}

	// Verify file exists
	if _, err := os.Stat(configPath); err != nil {
		t.Fatalf("config file not created: %v", err)
	}

	loaded, err := Load(configPath)
	if err != nil {
		t.Fatalf("load error: %v", err)
	}

	if loaded.Runtime.Port != 9999 {
		t.Fatalf("expected port 9999, got %d", loaded.Runtime.Port)
	}
	if loaded.Runtime.Bind != "lan" {
		t.Fatalf("expected bind 'lan', got %q", loaded.Runtime.Bind)
	}
	if loaded.Logging.Level != "debug" {
		t.Fatalf("expected log level 'debug', got %q", loaded.Logging.Level)
	}
	if len(loaded.Agents.List) != 1 || loaded.Agents.List[0].ID != "default" {
		t.Fatalf("expected agent list with 'default', got %+v", loaded.Agents.List)
	}
}

func TestLoadInvalidJSON(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.json")

	if err := os.WriteFile(configPath, []byte("{invalid json"), 0o644); err != nil {
		t.Fatalf("write error: %v", err)
	}

	_, err := Load(configPath)
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestValidateConfig(t *testing.T) {
	// Valid config
	cfg := Default()
	issues := Validate(cfg)
	if len(issues) != 0 {
		t.Fatalf("expected no issues for default config, got: %v", issues)
	}

	// Invalid port
	cfg.Runtime.Port = 0
	issues = Validate(cfg)
	if len(issues) != 1 {
		t.Fatalf("expected 1 issue for port 0, got: %v", issues)
	}

	// Invalid bind
	cfg = Default()
	cfg.Runtime.Bind = "invalid"
	issues = Validate(cfg)
	if len(issues) != 1 {
		t.Fatalf("expected 1 issue for invalid bind, got: %v", issues)
	}

	// Invalid log level
	cfg = Default()
	cfg.Logging.Level = "whatever"
	issues = Validate(cfg)
	if len(issues) != 1 {
		t.Fatalf("expected 1 issue for invalid log level, got: %v", issues)
	}
}

func TestConfigJSONMarshaling(t *testing.T) {
	cfg := Default()
	cfg.Runtime.Port = 3284
	cfg.Agents.List = []AgentConfig{
		{ID: "test", Name: "TestAgent", Skills: []string{"web-search"}},
	}

	data, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}

	var loaded Config
	if err := json.Unmarshal(data, &loaded); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}

	if loaded.Runtime.Port != 3284 {
		t.Fatalf("expected port 3284, got %d", loaded.Runtime.Port)
	}
	if len(loaded.Agents.List) != 1 {
		t.Fatalf("expected 1 agent, got %d", len(loaded.Agents.List))
	}
}

func TestResolvePaths(t *testing.T) {
	// Test with no flags and no env
	paths := ResolvePaths("", "")
	if paths.Root == "" {
		t.Fatal("expected root to be set")
	}
	if paths.StateDir == "" {
		t.Fatal("expected stateDir to be set")
	}
	if paths.DataDir == "" {
		t.Fatal("expected dataDir to be set")
	}
	if paths.ConfigFile == "" {
		t.Fatal("expected configFile to be set")
	}
	if paths.PIDFile == "" {
		t.Fatal("expected pidFile to be set")
	}

	// Test with explicit state-dir flag
	paths = ResolvePaths("/tmp/test-state", "")
	if paths.StateDir != "/tmp/test-state" {
		t.Fatalf("expected stateDir '/tmp/test-state', got %q", paths.StateDir)
	}
	if paths.DataDir != "/tmp/test-state/data" {
		t.Fatalf("expected dataDir '/tmp/test-state/data', got %q", paths.DataDir)
	}
	if paths.ConfigFile != "/tmp/test-state/config.json" {
		t.Fatalf("expected configFile '/tmp/test-state/config.json', got %q", paths.ConfigFile)
	}

	// Test with explicit config flag
	paths = ResolvePaths("", "/tmp/custom-config.json")
	if paths.ConfigFile != "/tmp/custom-config.json" {
		t.Fatalf("expected configFile '/tmp/custom-config.json', got %q", paths.ConfigFile)
	}
}

func TestEffectivePort(t *testing.T) {
	cfg := Default()

	// Default case
	port := EffectivePort(cfg)
	if port != DefaultRuntimePort {
		t.Fatalf("expected default port %d, got %d", DefaultRuntimePort, port)
	}

	// Config override
	cfg.Runtime.Port = 5000
	port = EffectivePort(cfg)
	if port != 5000 {
		t.Fatalf("expected port 5000, got %d", port)
	}

	// Env override takes priority
	t.Setenv("NEXUS_RUNTIME_PORT", "7777")
	port = EffectivePort(cfg)
	if port != 7777 {
		t.Fatalf("expected env port 7777, got %d", port)
	}
}
