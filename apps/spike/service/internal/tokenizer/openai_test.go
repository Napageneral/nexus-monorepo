package tokenizer

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOpenAITokenizer(t *testing.T) {
	models := []struct {
		model    OpenAIModel
		encoding string
	}{
		{GPT4, "cl100k_base"},
		{GPT4Turbo, "cl100k_base"},
		{GPT4o, "o200k_base"},
		{O1, "o200k_base"},
	}

	for _, m := range models {
		t.Run(string(m.model), func(t *testing.T) {
			tokenizer, err := NewOpenAITokenizer(m.model)
			if err != nil {
				t.Fatalf("Failed to create OpenAI tokenizer for %s: %v", m.model, err)
			}

			if tokenizer.Encoding() != m.encoding {
				t.Errorf("Expected encoding %s, got %s", m.encoding, tokenizer.Encoding())
			}

			// Test basic counting
			text := "Hello, world!"
			count := tokenizer.Count(text)
			if count < 2 || count > 6 {
				t.Errorf("Count(%q) = %d, expected between 2 and 6", text, count)
			}
		})
	}
}

func TestOpenAITokenizerDefaultModel(t *testing.T) {
	tokenizer, err := NewDefaultOpenAITokenizer()
	if err != nil {
		t.Fatalf("Failed to create default OpenAI tokenizer: %v", err)
	}

	if tokenizer.Encoding() != "o200k_base" {
		t.Errorf("Default tokenizer should use o200k_base, got %s", tokenizer.Encoding())
	}

	if !contains(tokenizer.Name(), "gpt-4o") {
		t.Errorf("Default tokenizer name should contain 'gpt-4o', got %s", tokenizer.Name())
	}
}

func TestOpenAITokenizerCount(t *testing.T) {
	tokenizer, err := NewOpenAITokenizer(GPT4)
	if err != nil {
		t.Fatalf("Failed to create OpenAI tokenizer: %v", err)
	}

	tests := []struct {
		name     string
		text     string
		minCount int
		maxCount int
	}{
		{
			name:     "simple text",
			text:     "Hello, world!",
			minCount: 3,
			maxCount: 5,
		},
		{
			name:     "code snippet",
			text:     "func main() {\n\tfmt.Println(\"Hello\")\n}",
			minCount: 10,
			maxCount: 20,
		},
		{
			name:     "empty string",
			text:     "",
			minCount: 0,
			maxCount: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			count := tokenizer.Count(tt.text)
			if count < tt.minCount || count > tt.maxCount {
				t.Errorf("Count(%q) = %d, expected between %d and %d", tt.text, count, tt.minCount, tt.maxCount)
			}
		})
	}
}

func TestOpenAITokenizerCountFile(t *testing.T) {
	tokenizer, err := NewOpenAITokenizer(GPT4o)
	if err != nil {
		t.Fatalf("Failed to create OpenAI tokenizer: %v", err)
	}

	// Create a temporary test file
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.txt")
	testContent := "This is a test file.\nIt has multiple lines.\n"

	if err := os.WriteFile(testFile, []byte(testContent), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	count, err := tokenizer.CountFile(testFile)
	if err != nil {
		t.Fatalf("CountFile failed: %v", err)
	}

	if count < 8 || count > 15 {
		t.Errorf("CountFile returned %d tokens, expected between 8 and 15", count)
	}

	// Test non-existent file
	_, err = tokenizer.CountFile(filepath.Join(tmpDir, "nonexistent.txt"))
	if err == nil {
		t.Error("Expected error for non-existent file, got nil")
	}
}

func TestOpenAITokenizerName(t *testing.T) {
	tests := []struct {
		model        OpenAIModel
		expectedName string
	}{
		{GPT4, "openai-gpt-4"},
		{GPT4Turbo, "openai-gpt-4-turbo"},
		{GPT4o, "openai-gpt-4o"},
		{O1, "openai-o1"},
	}

	for _, tt := range tests {
		t.Run(string(tt.model), func(t *testing.T) {
			tokenizer, err := NewOpenAITokenizer(tt.model)
			if err != nil {
				t.Fatalf("Failed to create tokenizer: %v", err)
			}

			if tokenizer.Name() != tt.expectedName {
				t.Errorf("Name() = %q, expected %q", tokenizer.Name(), tt.expectedName)
			}
		})
	}
}

func TestOpenAITokenizerModelComparison(t *testing.T) {
	gpt4Tokenizer, err := NewOpenAITokenizer(GPT4)
	if err != nil {
		t.Fatalf("Failed to create GPT-4 tokenizer: %v", err)
	}

	gpt4oTokenizer, err := NewOpenAITokenizer(GPT4o)
	if err != nil {
		t.Fatalf("Failed to create GPT-4o tokenizer: %v", err)
	}

	// Test that different encodings can produce different token counts
	text := "Hello, world! This is a test of tokenization."

	gpt4Count := gpt4Tokenizer.Count(text)
	gpt4oCount := gpt4oTokenizer.Count(text)

	// Both should be reasonable
	if gpt4Count < 8 || gpt4Count > 20 {
		t.Errorf("GPT-4 count out of expected range: %d", gpt4Count)
	}
	if gpt4oCount < 8 || gpt4oCount > 20 {
		t.Errorf("GPT-4o count out of expected range: %d", gpt4oCount)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > len(substr) && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
