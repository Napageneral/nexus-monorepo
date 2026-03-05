package cli

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/Napageneral/nexus/internal/config"
)

func TestWizardNonInteractive(t *testing.T) {
	dir := t.TempDir()
	var output bytes.Buffer

	wcfg := WizardConfig{
		StateDir:       dir,
		Provider:       "openai",
		APIKey:         "test-key-123",
		Model:          "gpt-4",
		Port:           18789,
		NonInteractive: true,
		writer:         &output,
	}

	if err := RunWizard(wcfg); err != nil {
		t.Fatalf("RunWizard error: %v", err)
	}

	// Verify config was written.
	configFile := filepath.Join(dir, "config.json")
	if _, err := os.Stat(configFile); os.IsNotExist(err) {
		t.Error("config file was not created")
	}

	// Load and verify.
	cfg, err := config.Load(configFile)
	if err != nil {
		t.Fatalf("loading config: %v", err)
	}

	if cfg.Runtime.Port != 18789 {
		t.Errorf("port = %d, want 18789", cfg.Runtime.Port)
	}

	if cfg.Agents.Defaults.Model.Primary != "gpt-4" {
		t.Errorf("model = %q, want %q", cfg.Agents.Defaults.Model.Primary, "gpt-4")
	}
}

func TestWizardCreatesDirs(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested", "state")
	var output bytes.Buffer

	wcfg := WizardConfig{
		StateDir:       dir,
		NonInteractive: true,
		writer:         &output,
	}

	if err := RunWizard(wcfg); err != nil {
		t.Fatalf("RunWizard error: %v", err)
	}

	// Verify directories were created.
	dirs := []string{
		dir,
		filepath.Join(dir, "data"),
		filepath.Join(dir, "credentials"),
		filepath.Join(dir, "acl"),
	}
	for _, d := range dirs {
		info, err := os.Stat(d)
		if os.IsNotExist(err) {
			t.Errorf("directory was not created: %s", d)
		} else if err != nil {
			t.Errorf("stat error on %s: %v", d, err)
		} else if !info.IsDir() {
			t.Errorf("%s is not a directory", d)
		}
	}
}

func TestWizardDefaultConfig(t *testing.T) {
	dir := t.TempDir()
	var output bytes.Buffer

	wcfg := WizardConfig{
		StateDir:       dir,
		NonInteractive: true,
		writer:         &output,
	}

	if err := RunWizard(wcfg); err != nil {
		t.Fatalf("RunWizard error: %v", err)
	}

	configFile := filepath.Join(dir, "config.json")
	cfg, err := config.Load(configFile)
	if err != nil {
		t.Fatalf("loading config: %v", err)
	}

	// Default port should be the config default.
	if cfg.Runtime.Port != config.DefaultRuntimePort {
		t.Errorf("port = %d, want %d", cfg.Runtime.Port, config.DefaultRuntimePort)
	}

	// Bind mode should be loopback.
	if cfg.Runtime.Bind != "loopback" {
		t.Errorf("bind = %q, want %q", cfg.Runtime.Bind, "loopback")
	}
}

func TestTestCredentialEmpty(t *testing.T) {
	err := TestCredential("openai", "")
	if err == nil {
		t.Error("expected error for empty API key")
	}
}

func TestTestCredentialValid(t *testing.T) {
	err := TestCredential("openai", "some-key")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}
