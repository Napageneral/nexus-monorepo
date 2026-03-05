package cli

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/Napageneral/nexus/internal/config"
)

// WizardConfig holds parameters for the setup wizard.
type WizardConfig struct {
	StateDir       string
	Provider       string
	APIKey         string
	Model          string
	Port           int
	NonInteractive bool

	// reader overrides stdin for testing.
	reader io.Reader
	// writer overrides stdout for testing.
	writer io.Writer
}

// RunWizard runs the interactive (or non-interactive) setup wizard.
func RunWizard(wcfg WizardConfig) error {
	w := wcfg.writer
	if w == nil {
		w = os.Stdout
	}
	r := wcfg.reader
	if r == nil {
		r = os.Stdin
	}

	// Determine state directory.
	stateDir := wcfg.StateDir
	if stateDir == "" {
		home, _ := os.UserHomeDir()
		stateDir = filepath.Join(home, "nexus", "state")
	}

	port := wcfg.Port
	if port == 0 {
		port = config.DefaultRuntimePort
	}

	provider := wcfg.Provider
	apiKey := wcfg.APIKey
	model := wcfg.Model

	if !wcfg.NonInteractive {
		scanner := bufio.NewScanner(r)

		fmt.Fprintln(w, Bold("Nexus Setup Wizard"))
		fmt.Fprintln(w)

		// State directory.
		fmt.Fprintf(w, "State directory [%s]: ", stateDir)
		if scanner.Scan() {
			if v := strings.TrimSpace(scanner.Text()); v != "" {
				stateDir = v
			}
		}

		// Provider.
		if provider == "" {
			provider = "openai"
		}
		fmt.Fprintf(w, "AI provider [%s]: ", provider)
		if scanner.Scan() {
			if v := strings.TrimSpace(scanner.Text()); v != "" {
				provider = v
			}
		}

		// API key.
		fmt.Fprintf(w, "API key: ")
		if scanner.Scan() {
			if v := strings.TrimSpace(scanner.Text()); v != "" {
				apiKey = v
			}
		}

		// Model.
		if model == "" {
			model = "gpt-4"
		}
		fmt.Fprintf(w, "Default model [%s]: ", model)
		if scanner.Scan() {
			if v := strings.TrimSpace(scanner.Text()); v != "" {
				model = v
			}
		}

		// Port.
		fmt.Fprintf(w, "Port [%d]: ", port)
		if scanner.Scan() {
			if v := strings.TrimSpace(scanner.Text()); v != "" {
				var p int
				if _, err := fmt.Sscanf(v, "%d", &p); err == nil && p > 0 {
					port = p
				}
			}
		}
	}

	// Create directories.
	dirs := []string{
		stateDir,
		filepath.Join(stateDir, "data"),
		filepath.Join(stateDir, "credentials"),
		filepath.Join(stateDir, "acl"),
	}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("creating directory %s: %w", dir, err)
		}
	}

	// Build config.
	cfg := config.Default()
	cfg.Runtime.Port = port

	if provider != "" && model != "" {
		cfg.Agents.Defaults.Model = config.ModelSelection{
			Primary: model,
		}
	}

	// Write config.
	configFile := filepath.Join(stateDir, "config.json")
	if err := config.Save(cfg, configFile); err != nil {
		return fmt.Errorf("saving config: %w", err)
	}

	// Test credential if provided.
	if apiKey != "" {
		if err := TestCredential(provider, apiKey); err != nil {
			fmt.Fprintf(w, Yellow("Warning: credential test failed: %v\n"), err)
		} else {
			fmt.Fprintln(w, Green("Credential test passed."))
		}
	}

	fmt.Fprintf(w, "\nNexus configured at %s\n", stateDir)
	fmt.Fprintf(w, "Start with: nexus serve --state-dir %s\n", stateDir)

	return nil
}

// TestCredential performs a basic credential validation.
// For now this is a stub that always succeeds.
func TestCredential(provider, apiKey string) error {
	if apiKey == "" {
		return fmt.Errorf("no API key provided")
	}
	// TODO: make a minimal API call to verify the key.
	return nil
}
