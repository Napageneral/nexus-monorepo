package tokenizer

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGoogleTokenizer(t *testing.T) {
	tokenizer := NewGoogleTokenizer()

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
			name:     "longer text",
			text:     "This is a longer piece of text that should result in more tokens.",
			minCount: 15,
			maxCount: 25,
		},
		{
			name:     "code snippet",
			text:     "func main() {\n\tfmt.Println(\"Hello\")\n}",
			minCount: 10,
			maxCount: 15,
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

func TestGoogleTokenizerWithCustomRatio(t *testing.T) {
	tests := []struct {
		name          string
		charsPerToken float64
		text          string
		expectedCount int
	}{
		{
			name:          "4 chars per token",
			charsPerToken: 4.0,
			text:          "Hello, world!", // 13 chars
			expectedCount: 3,                // 13/4 = 3.25 -> rounds to 3
		},
		{
			name:          "3 chars per token",
			charsPerToken: 3.0,
			text:          "Hello, world!", // 13 chars
			expectedCount: 4,                // 13/3 = 4.33 -> rounds to 4
		},
		{
			name:          "default on zero",
			charsPerToken: 0,
			text:          "Hello, world!", // 13 chars
			expectedCount: 4,                // uses default 3.5: 13/3.5 = 3.71 -> rounds to 4
		},
		{
			name:          "default on negative",
			charsPerToken: -1,
			text:          "Hello, world!", // 13 chars
			expectedCount: 4,                // uses default 3.5: 13/3.5 = 3.71 -> rounds to 4
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tokenizer := NewGoogleTokenizerWithRatio(tt.charsPerToken)
			count := tokenizer.Count(tt.text)
			if count != tt.expectedCount {
				t.Errorf("Count(%q) = %d, expected %d", tt.text, count, tt.expectedCount)
			}
		})
	}
}

func TestGoogleTokenizerCountFile(t *testing.T) {
	tokenizer := NewGoogleTokenizer()

	// Create a temporary test file
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.txt")
	testContent := "This is a test file.\nIt has multiple lines.\nAnd some more content here.\n"

	if err := os.WriteFile(testFile, []byte(testContent), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	count, err := tokenizer.CountFile(testFile)
	if err != nil {
		t.Fatalf("CountFile failed: %v", err)
	}

	// testContent is 75 characters, so with 3.5 chars/token we expect ~21 tokens
	if count < 18 || count > 25 {
		t.Errorf("CountFile returned %d tokens, expected between 18 and 25", count)
	}

	// Test non-existent file
	_, err = tokenizer.CountFile(filepath.Join(tmpDir, "nonexistent.txt"))
	if err == nil {
		t.Error("Expected error for non-existent file, got nil")
	}
}

func TestGoogleTokenizerName(t *testing.T) {
	tokenizer := NewGoogleTokenizer()

	name := tokenizer.Name()
	if name != "google" {
		t.Errorf("Name() = %q, expected %q", name, "google")
	}
}

func TestGoogleTokenizerCharsPerToken(t *testing.T) {
	tests := []struct {
		name          string
		charsPerToken float64
		expected      float64
	}{
		{
			name:          "default",
			charsPerToken: 3.5,
			expected:      3.5,
		},
		{
			name:          "custom ratio",
			charsPerToken: 4.2,
			expected:      4.2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var tokenizer *GoogleTokenizer
			if tt.name == "default" {
				tokenizer = NewGoogleTokenizer()
			} else {
				tokenizer = NewGoogleTokenizerWithRatio(tt.charsPerToken)
			}

			ratio := tokenizer.CharsPerToken()
			if ratio != tt.expected {
				t.Errorf("CharsPerToken() = %f, expected %f", ratio, tt.expected)
			}
		})
	}
}

func TestGoogleTokenizerEstimationQuality(t *testing.T) {
	tokenizer := NewGoogleTokenizer()

	// Test with realistic Go code sample
	goCode := `package main

import "fmt"

func main() {
	message := "Hello, World!"
	fmt.Println(message)
}
`

	count := tokenizer.Count(goCode)
	// This code is approximately 90 characters, so we expect ~26 tokens with 3.5 chars/token
	if count < 20 || count > 30 {
		t.Errorf("Count for Go code = %d, expected between 20 and 30 tokens", count)
	}
}
