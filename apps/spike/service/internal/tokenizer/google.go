package tokenizer

// GoogleTokenizer implements token counting for Google Gemini models.
// Since Google doesn't provide a public tokenizer library, we use a character-based
// estimation with a Gemini-tuned ratio. This is less accurate than tiktoken-based
// tokenizers but provides a reasonable approximation.
//
// Based on empirical testing, Gemini models typically use approximately 1 token per 3.5 characters
// for English text and code, which is slightly more efficient than GPT models.
type GoogleTokenizer struct {
	// charsPerToken is the average number of characters per token for Gemini models.
	// Default is 3.5 based on empirical testing.
	charsPerToken float64
}

// NewGoogleTokenizer creates a new tokenizer for Google Gemini models.
func NewGoogleTokenizer() *GoogleTokenizer {
	return &GoogleTokenizer{
		charsPerToken: 3.5,
	}
}

// NewGoogleTokenizerWithRatio creates a Google tokenizer with a custom character-to-token ratio.
// This allows fine-tuning the estimation based on specific use cases.
func NewGoogleTokenizerWithRatio(charsPerToken float64) *GoogleTokenizer {
	if charsPerToken <= 0 {
		charsPerToken = 3.5 // fallback to default
	}
	return &GoogleTokenizer{
		charsPerToken: charsPerToken,
	}
}

// Count returns the estimated number of tokens in the given text.
// This is a heuristic approximation based on character count.
func (t *GoogleTokenizer) Count(text string) int {
	if len(text) == 0 {
		return 0
	}
	// Round up to avoid underestimating
	return int(float64(len(text))/t.charsPerToken + 0.5)
}

// CountFile reads a file and returns the estimated number of tokens it contains.
func (t *GoogleTokenizer) CountFile(path string) (int, error) {
	return CountFileHelper(t, path)
}

// Name returns the name of this tokenizer.
func (t *GoogleTokenizer) Name() string {
	return "google"
}

// CharsPerToken returns the current character-to-token ratio being used.
func (t *GoogleTokenizer) CharsPerToken() float64 {
	return t.charsPerToken
}
