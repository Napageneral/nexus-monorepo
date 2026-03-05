package tokenizer

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Config represents the structure of .intent/config.json
type Config struct {
	Version      int                    `json:"version"`
	Name         string                 `json:"name"`
	Scope        string                 `json:"scope"`
	Cartographer CartographerConfig     `json:"cartographer"`
	Survey       SurveyConfig           `json:"survey"`
	Staleness    StalenessConfig        `json:"staleness"`
	Tokenizer    *TokenizerConfig       `json:"tokenizer,omitempty"`
}

// CartographerConfig holds cartographer-specific settings
type CartographerConfig struct {
	Agent string `json:"agent"`
	Model string `json:"model"`
}

// SurveyConfig holds survey-specific settings
type SurveyConfig struct {
	IgnorePatterns     []string `json:"ignorePatterns"`
	TokenEstimateRatio float64  `json:"tokenEstimateRatio"`
}

// StalenessConfig holds staleness threshold settings
type StalenessConfig struct {
	WarningDays  int `json:"warningDays"`
	CriticalDays int `json:"criticalDays"`
}

// TokenizerConfig holds tokenizer-specific settings
type TokenizerConfig struct {
	Provider      string  `json:"provider"`      // "anthropic", "openai", "google"
	Model         string  `json:"model"`         // e.g., "gpt-4o", "claude-sonnet"
	CharsPerToken float64 `json:"charsPerToken"` // for character-based tokenizers
}

// NewTokenizer creates a tokenizer based on the provider string.
// Supported providers: "anthropic", "openai", "openai-gpt4", "openai-gpt4o", "google"
func NewTokenizer(provider string) (Tokenizer, error) {
	switch provider {
	case "anthropic", "claude":
		return NewAnthropicTokenizer()
	case "openai", "openai-gpt4o":
		return NewDefaultOpenAITokenizer()
	case "openai-gpt4":
		return NewOpenAITokenizer(GPT4)
	case "openai-gpt4-turbo":
		return NewOpenAITokenizer(GPT4Turbo)
	case "openai-o1":
		return NewOpenAITokenizer(O1)
	case "google", "gemini":
		return NewGoogleTokenizer(), nil
	default:
		return nil, fmt.Errorf("unknown tokenizer provider: %s", provider)
	}
}

// NewTokenizerFromConfig creates a tokenizer based on a TokenizerConfig.
func NewTokenizerFromConfig(cfg *TokenizerConfig) (Tokenizer, error) {
	if cfg == nil {
		// Default to Anthropic if no config provided
		return NewAnthropicTokenizer()
	}

	// Handle Google separately since it has custom ratio support
	if cfg.Provider == "google" || cfg.Provider == "gemini" {
		if cfg.CharsPerToken > 0 {
			return NewGoogleTokenizerWithRatio(cfg.CharsPerToken), nil
		}
		return NewGoogleTokenizer(), nil
	}

	// For other providers, use the factory with provider string
	return NewTokenizer(cfg.Provider)
}

// LoadTokenizerFromConfigFile loads the tokenizer configuration from .intent/config.json
// and creates the appropriate tokenizer. If no tokenizer config is found, defaults to Anthropic.
func LoadTokenizerFromConfigFile(intentPath string) (Tokenizer, error) {
	configPath := filepath.Join(intentPath, ".intent", "config.json")
	return LoadTokenizerFromFile(configPath)
}

// LoadTokenizerFromFile loads a tokenizer from a specific config file path.
func LoadTokenizerFromFile(configPath string) (Tokenizer, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		// If file doesn't exist, default to Anthropic
		if os.IsNotExist(err) {
			return NewAnthropicTokenizer()
		}
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	// If tokenizer config exists, use it; otherwise default to Anthropic
	if config.Tokenizer != nil {
		return NewTokenizerFromConfig(config.Tokenizer)
	}

	// Default to Anthropic
	return NewAnthropicTokenizer()
}

// SaveTokenizerConfig saves a tokenizer configuration to .intent/config.json
func SaveTokenizerConfig(intentPath string, tokenizerCfg *TokenizerConfig) error {
	configPath := filepath.Join(intentPath, ".intent", "config.json")

	// Read existing config
	var config Config
	data, err := os.ReadFile(configPath)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to read config file: %w", err)
	}

	if len(data) > 0 {
		if err := json.Unmarshal(data, &config); err != nil {
			return fmt.Errorf("failed to parse config file: %w", err)
		}
	}

	// Update tokenizer config
	config.Tokenizer = tokenizerCfg

	// Write back
	data, err = json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(configPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}
