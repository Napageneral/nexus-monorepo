package tokenizer

import (
	"fmt"
	"sync"

	tiktoken "github.com/pkoukk/tiktoken-go"
)

// OpenAITokenizer implements token counting for OpenAI models (GPT-4, GPT-4o, o1, etc.)
type OpenAITokenizer struct {
	encoder  *tiktoken.Tiktoken
	encoding string
	model    string
	once     sync.Once
	initErr  error
}

// OpenAIModel represents supported OpenAI model types for tokenization
type OpenAIModel string

const (
	GPT4      OpenAIModel = "gpt-4"
	GPT4Turbo OpenAIModel = "gpt-4-turbo"
	GPT4o     OpenAIModel = "gpt-4o"
	O1        OpenAIModel = "o1"
)

// NewOpenAITokenizer creates a new tokenizer for OpenAI models.
// Supports model selection to use the appropriate encoding:
// - GPT-4, GPT-4-turbo: cl100k_base
// - GPT-4o, o1: o200k_base
func NewOpenAITokenizer(model OpenAIModel) (*OpenAITokenizer, error) {
	t := &OpenAITokenizer{
		model: string(model),
	}

	// Determine encoding based on model
	switch model {
	case GPT4, GPT4Turbo:
		t.encoding = "cl100k_base"
	case GPT4o, O1:
		t.encoding = "o200k_base"
	default:
		// Default to cl100k_base for unknown models
		t.encoding = "cl100k_base"
	}

	t.once.Do(func() {
		t.encoder, t.initErr = tiktoken.GetEncoding(t.encoding)
	})

	if t.initErr != nil {
		return nil, fmt.Errorf("failed to initialize OpenAI tokenizer with encoding %s: %w", t.encoding, t.initErr)
	}

	return t, nil
}

// NewDefaultOpenAITokenizer creates a tokenizer using GPT-4o encoding (o200k_base).
// This is a good default for modern OpenAI models.
func NewDefaultOpenAITokenizer() (*OpenAITokenizer, error) {
	return NewOpenAITokenizer(GPT4o)
}

// Count returns the number of tokens in the given text.
func (t *OpenAITokenizer) Count(text string) int {
	if t.encoder == nil {
		// Fallback if encoder initialization failed
		return len(text) / 4 // rough approximation
	}
	tokens := t.encoder.Encode(text, nil, nil)
	return len(tokens)
}

// CountFile reads a file and returns the number of tokens it contains.
func (t *OpenAITokenizer) CountFile(path string) (int, error) {
	return CountFileHelper(t, path)
}

// Name returns the name of this tokenizer.
func (t *OpenAITokenizer) Name() string {
	return fmt.Sprintf("openai-%s", t.model)
}

// Encoding returns the tiktoken encoding being used.
func (t *OpenAITokenizer) Encoding() string {
	return t.encoding
}
