package tokenizer

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAnthropicTokenizer(t *testing.T) {
	tokenizer, err := NewAnthropicTokenizer()
	if err != nil {
		t.Fatalf("Failed to create Anthropic tokenizer: %v", err)
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

func TestAnthropicTokenizerCountFile(t *testing.T) {
	tokenizer, err := NewAnthropicTokenizer()
	if err != nil {
		t.Fatalf("Failed to create Anthropic tokenizer: %v", err)
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

func TestAnthropicTokenizerName(t *testing.T) {
	tokenizer, err := NewAnthropicTokenizer()
	if err != nil {
		t.Fatalf("Failed to create Anthropic tokenizer: %v", err)
	}

	name := tokenizer.Name()
	if name != "anthropic" {
		t.Errorf("Name() = %q, expected %q", name, "anthropic")
	}
}

func TestAnthropicTokenizerAccuracy(t *testing.T) {
	tokenizer, err := NewAnthropicTokenizer()
	if err != nil {
		t.Fatalf("Failed to create Anthropic tokenizer: %v", err)
	}

	// Test with typical Go code
	goCode := `package main

import "fmt"

func main() {
	fmt.Println("Hello, World!")
}
`

	count := tokenizer.Count(goCode)
	// cl100k_base should give us approximately 20-25 tokens for this code
	if count < 15 || count > 30 {
		t.Errorf("Count for Go code = %d, expected between 15 and 30 tokens", count)
	}
}
