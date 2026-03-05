package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Load reads and parses the configuration file at the given path.
// Returns a default Config if the file does not exist.
func Load(configPath string) (*Config, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			cfg := Default()
			return cfg, nil
		}
		return nil, fmt.Errorf("reading config file %s: %w", configPath, err)
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing config file %s: %w", configPath, err)
	}

	applyDefaults(&cfg)
	return &cfg, nil
}

// Default returns a Config with sensible defaults for a self-hosted instance.
func Default() *Config {
	cfg := &Config{}
	applyDefaults(cfg)
	return cfg
}

// applyDefaults fills in zero values with sensible defaults.
func applyDefaults(cfg *Config) {
	if cfg.Runtime.Port == 0 {
		cfg.Runtime.Port = DefaultRuntimePort
	}
	if cfg.Runtime.Bind == "" {
		cfg.Runtime.Bind = "loopback"
	}
	if cfg.Logging.Level == "" {
		cfg.Logging.Level = "info"
	}
	if cfg.Logging.ConsoleLevel == "" {
		cfg.Logging.ConsoleLevel = "info"
	}
	if cfg.Logging.ConsoleStyle == "" {
		cfg.Logging.ConsoleStyle = "pretty"
	}
	if cfg.Logging.RedactSensitive == "" {
		cfg.Logging.RedactSensitive = "tools"
	}
	if cfg.Session.MainKey == "" {
		cfg.Session.MainKey = "main"
	}
	if cfg.Agents.Defaults.MaxConcurrent == 0 {
		cfg.Agents.Defaults.MaxConcurrent = 4
	}
}

// Save writes the configuration to a file as formatted JSON.
func Save(cfg *Config, configPath string) error {
	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("creating config directory: %w", err)
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshaling config: %w", err)
	}

	if err := os.WriteFile(configPath, data, 0o644); err != nil {
		return fmt.Errorf("writing config file: %w", err)
	}
	return nil
}

// Validate checks that the config is internally consistent.
// Returns nil if valid, or a list of issues.
func Validate(cfg *Config) []string {
	var issues []string

	if cfg.Runtime.Port < 1 || cfg.Runtime.Port > 65535 {
		issues = append(issues, fmt.Sprintf("runtime.port %d is out of range (1-65535)", cfg.Runtime.Port))
	}

	validBindModes := map[string]bool{"auto": true, "lan": true, "loopback": true, "custom": true, "tailnet": true}
	if cfg.Runtime.Bind != "" && !validBindModes[cfg.Runtime.Bind] {
		issues = append(issues, fmt.Sprintf("runtime.bind %q is not valid (auto|lan|loopback|custom|tailnet)", cfg.Runtime.Bind))
	}

	validLogLevels := map[string]bool{
		"silent": true, "fatal": true, "error": true, "warn": true,
		"info": true, "debug": true, "trace": true,
	}
	if cfg.Logging.Level != "" && !validLogLevels[cfg.Logging.Level] {
		issues = append(issues, fmt.Sprintf("logging.level %q is not valid", cfg.Logging.Level))
	}
	if cfg.Logging.ConsoleLevel != "" && !validLogLevels[cfg.Logging.ConsoleLevel] {
		issues = append(issues, fmt.Sprintf("logging.consoleLevel %q is not valid", cfg.Logging.ConsoleLevel))
	}

	return issues
}

// EffectivePort returns the port to listen on, respecting the NEXUS_RUNTIME_PORT env override.
func EffectivePort(cfg *Config) int {
	if envPort := os.Getenv("NEXUS_RUNTIME_PORT"); envPort != "" {
		var port int
		if _, err := fmt.Sscanf(envPort, "%d", &port); err == nil && port > 0 && port <= 65535 {
			return port
		}
	}
	return cfg.Runtime.Port
}
