package tokenizer

import (
	"fmt"
	"sync"

	tiktoken "github.com/pkoukk/tiktoken-go"
)

// AnthropicTokenizer implements token counting for Anthropic Claude models.
// Anthropic doesn't publish their exact tokenizer, so we use cl100k_base (OpenAI's GPT-4 tokenizer)
// as a close approximation. This is typically accurate within 5% for code and text.
type AnthropicTokenizer struct {
	encoder *tiktoken.Tiktoken
	once    sync.Once
	initErr error
}

// NewAnthropicTokenizer creates a new tokenizer for Anthropic Claude models.
func NewAnthropicTokenizer() (*AnthropicTokenizer, error) {
	t := &AnthropicTokenizer{}
	t.once.Do(func() {
		t.encoder, t.initErr = tiktoken.GetEncoding("cl100k_base")
	})
	if t.initErr != nil {
		return nil, fmt.Errorf("failed to initialize Anthropic tokenizer: %w", t.initErr)
	}
	return t, nil
}

// Count returns the number of tokens in the given text.
func (t *AnthropicTokenizer) Count(text string) int {
	if t.encoder == nil {
		// Fallback if encoder initialization failed
		return len(text) / 4 // rough approximation
	}
	tokens := t.encoder.Encode(text, nil, nil)
	return len(tokens)
}

// CountFile reads a file and returns the number of tokens it contains.
func (t *AnthropicTokenizer) CountFile(path string) (int, error) {
	return CountFileHelper(t, path)
}

// Name returns the name of this tokenizer.
func (t *AnthropicTokenizer) Name() string {
	return "anthropic"
}
