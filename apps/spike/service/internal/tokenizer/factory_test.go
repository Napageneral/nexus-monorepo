package tokenizer

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestNewTokenizer(t *testing.T) {
	tests := []struct {
		provider     string
		shouldError  bool
		expectedName string
	}{
		{"anthropic", false, "anthropic"},
		{"claude", false, "anthropic"},
		{"openai", false, "openai-gpt-4o"},
		{"openai-gpt4o", false, "openai-gpt-4o"},
		{"openai-gpt4", false, "openai-gpt-4"},
		{"openai-gpt4-turbo", false, "openai-gpt-4-turbo"},
		{"openai-o1", false, "openai-o1"},
		{"google", false, "google"},
		{"gemini", false, "google"},
		{"unknown", true, ""},
	}

	for _, tt := range tests {
		t.Run(tt.provider, func(t *testing.T) {
			tokenizer, err := NewTokenizer(tt.provider)
			if tt.shouldError {
				if err == nil {
					t.Error("Expected error for unknown provider, got nil")
				}
				return
			}

			if err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}

			if tokenizer.Name() != tt.expectedName {
				t.Errorf("Name() = %q, expected %q", tokenizer.Name(), tt.expectedName)
			}
		})
	}
}

func TestNewTokenizerFromConfig(t *testing.T) {
	tests := []struct {
		name         string
		config       *TokenizerConfig
		expectedName string
	}{
		{
			name:         "nil config defaults to anthropic",
			config:       nil,
			expectedName: "anthropic",
		},
		{
			name: "anthropic config",
			config: &TokenizerConfig{
				Provider: "anthropic",
			},
			expectedName: "anthropic",
		},
		{
			name: "openai config",
			config: &TokenizerConfig{
				Provider: "openai",
			},
			expectedName: "openai-gpt-4o",
		},
		{
			name: "google config",
			config: &TokenizerConfig{
				Provider: "google",
			},
			expectedName: "google",
		},
		{
			name: "google config with custom ratio",
			config: &TokenizerConfig{
				Provider:      "google",
				CharsPerToken: 4.0,
			},
			expectedName: "google",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tokenizer, err := NewTokenizerFromConfig(tt.config)
			if err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}

			if tokenizer.Name() != tt.expectedName {
				t.Errorf("Name() = %q, expected %q", tokenizer.Name(), tt.expectedName)
			}

			// For Google tokenizer with custom ratio, verify the ratio
			if tt.config != nil && tt.config.Provider == "google" && tt.config.CharsPerToken > 0 {
				if gt, ok := tokenizer.(*GoogleTokenizer); ok {
					if gt.CharsPerToken() != tt.config.CharsPerToken {
						t.Errorf("CharsPerToken() = %f, expected %f", gt.CharsPerToken(), tt.config.CharsPerToken)
					}
				}
			}
		})
	}
}

func TestLoadTokenizerFromFile(t *testing.T) {
	tmpDir := t.TempDir()

	tests := []struct {
		name         string
		configData   interface{}
		expectedName string
		shouldError  bool
	}{
		{
			name: "config with anthropic tokenizer",
			configData: Config{
				Version: 1,
				Name:    "test-project",
				Scope:   "directory",
				Tokenizer: &TokenizerConfig{
					Provider: "anthropic",
				},
			},
			expectedName: "anthropic",
			shouldError:  false,
		},
		{
			name: "config with openai tokenizer",
			configData: Config{
				Version: 1,
				Name:    "test-project",
				Scope:   "directory",
				Tokenizer: &TokenizerConfig{
					Provider: "openai",
					Model:    "gpt-4o",
				},
			},
			expectedName: "openai-gpt-4o",
			shouldError:  false,
		},
		{
			name: "config with google tokenizer and custom ratio",
			configData: Config{
				Version: 1,
				Name:    "test-project",
				Scope:   "directory",
				Tokenizer: &TokenizerConfig{
					Provider:      "google",
					CharsPerToken: 3.8,
				},
			},
			expectedName: "google",
			shouldError:  false,
		},
		{
			name: "config without tokenizer defaults to anthropic",
			configData: Config{
				Version: 1,
				Name:    "test-project",
				Scope:   "directory",
			},
			expectedName: "anthropic",
			shouldError:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			configPath := filepath.Join(tmpDir, tt.name+"-config.json")

			// Write config file
			data, err := json.MarshalIndent(tt.configData, "", "  ")
			if err != nil {
				t.Fatalf("Failed to marshal config: %v", err)
			}

			if err := os.WriteFile(configPath, data, 0644); err != nil {
				t.Fatalf("Failed to write config file: %v", err)
			}

			// Load tokenizer
			tokenizer, err := LoadTokenizerFromFile(configPath)
			if tt.shouldError {
				if err == nil {
					t.Error("Expected error, got nil")
				}
				return
			}

			if err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}

			if tokenizer.Name() != tt.expectedName {
				t.Errorf("Name() = %q, expected %q", tokenizer.Name(), tt.expectedName)
			}
		})
	}
}

func TestLoadTokenizerFromFile_NonExistentFile(t *testing.T) {
	// Should default to Anthropic when file doesn't exist
	tokenizer, err := LoadTokenizerFromFile("/nonexistent/path/config.json")
	if err != nil {
		t.Fatalf("Expected default tokenizer, got error: %v", err)
	}

	if tokenizer.Name() != "anthropic" {
		t.Errorf("Name() = %q, expected %q for default", tokenizer.Name(), "anthropic")
	}
}

func TestLoadTokenizerFromConfigFile(t *testing.T) {
	tmpDir := t.TempDir()
	intentDir := filepath.Join(tmpDir, ".intent")
	if err := os.MkdirAll(intentDir, 0755); err != nil {
		t.Fatalf("Failed to create .intent dir: %v", err)
	}

	configPath := filepath.Join(intentDir, "config.json")
	config := Config{
		Version: 1,
		Name:    "test-project",
		Scope:   "directory",
		Tokenizer: &TokenizerConfig{
			Provider: "openai",
		},
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		t.Fatalf("Failed to marshal config: %v", err)
	}

	if err := os.WriteFile(configPath, data, 0644); err != nil {
		t.Fatalf("Failed to write config file: %v", err)
	}

	tokenizer, err := LoadTokenizerFromConfigFile(tmpDir)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if tokenizer.Name() != "openai-gpt-4o" {
		t.Errorf("Name() = %q, expected %q", tokenizer.Name(), "openai-gpt-4o")
	}
}

func TestSaveTokenizerConfig(t *testing.T) {
	tmpDir := t.TempDir()
	intentDir := filepath.Join(tmpDir, ".intent")
	if err := os.MkdirAll(intentDir, 0755); err != nil {
		t.Fatalf("Failed to create .intent dir: %v", err)
	}

	// Create initial config
	configPath := filepath.Join(intentDir, "config.json")
	initialConfig := Config{
		Version: 1,
		Name:    "test-project",
		Scope:   "directory",
		Cartographer: CartographerConfig{
			Agent: "claude",
			Model: "claude-sonnet-4-5",
		},
	}

	data, err := json.MarshalIndent(initialConfig, "", "  ")
	if err != nil {
		t.Fatalf("Failed to marshal initial config: %v", err)
	}

	if err := os.WriteFile(configPath, data, 0644); err != nil {
		t.Fatalf("Failed to write initial config: %v", err)
	}

	// Save tokenizer config
	tokenizerCfg := &TokenizerConfig{
		Provider: "openai",
		Model:    "gpt-4o",
	}

	if err := SaveTokenizerConfig(tmpDir, tokenizerCfg); err != nil {
		t.Fatalf("Failed to save tokenizer config: %v", err)
	}

	// Verify the config was updated
	data, err = os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("Failed to read updated config: %v", err)
	}

	var updatedConfig Config
	if err := json.Unmarshal(data, &updatedConfig); err != nil {
		t.Fatalf("Failed to parse updated config: %v", err)
	}

	// Check that existing fields are preserved
	if updatedConfig.Name != "test-project" {
		t.Errorf("Name = %q, expected %q", updatedConfig.Name, "test-project")
	}

	// Check that tokenizer config was added
	if updatedConfig.Tokenizer == nil {
		t.Fatal("Tokenizer config is nil")
	}

	if updatedConfig.Tokenizer.Provider != "openai" {
		t.Errorf("Provider = %q, expected %q", updatedConfig.Tokenizer.Provider, "openai")
	}

	if updatedConfig.Tokenizer.Model != "gpt-4o" {
		t.Errorf("Model = %q, expected %q", updatedConfig.Tokenizer.Model, "gpt-4o")
	}
}
