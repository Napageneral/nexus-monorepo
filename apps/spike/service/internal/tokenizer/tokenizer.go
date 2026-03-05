package tokenizer

import "os"

// Tokenizer defines the interface for counting tokens across different LLM providers.
// This abstraction allows accurate token counting for Anthropic, OpenAI, Google, and others.
type Tokenizer interface {
	// Count returns the number of tokens in the given text.
	Count(text string) int

	// CountFile reads a file and returns the number of tokens it contains.
	// Returns an error if the file cannot be read.
	CountFile(path string) (int, error)

	// Name returns the name of the tokenizer (e.g., "anthropic", "openai", "google").
	Name() string
}

// CountFileHelper is a helper function that can be used by tokenizer implementations
// to implement CountFile by reading the file and calling Count.
func CountFileHelper(t Tokenizer, path string) (int, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	return t.Count(string(data)), nil
}
