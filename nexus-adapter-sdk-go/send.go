package nexadapter

import (
	"strings"
	"unicode"
)

// ChunkText splits text into chunks that fit within the given character limit.
// It splits at natural boundaries to produce readable chunks:
//
//  1. Paragraph breaks (\n\n)
//  2. Line breaks (\n)
//  3. Sentence endings (. ! ?)
//  4. Word boundaries (spaces)
//  5. Hard cut at limit (last resort)
//
// Returns a single-element slice if the text fits within the limit.
// Returns nil for empty text.
func ChunkText(text string, limit int) []string {
	if text == "" {
		return nil
	}
	if limit <= 0 || len(text) <= limit {
		return []string{text}
	}

	var chunks []string
	remaining := text

	for len(remaining) > 0 {
		if len(remaining) <= limit {
			chunks = append(chunks, remaining)
			break
		}

		// Find the best split point within the limit
		splitAt := findSplitPoint(remaining, limit)

		chunk := strings.TrimRight(remaining[:splitAt], " ")
		if chunk != "" {
			chunks = append(chunks, chunk)
		}
		remaining = strings.TrimLeft(remaining[splitAt:], " ")
	}

	return chunks
}

// findSplitPoint finds the best position to split text at, searching
// backwards from the limit for natural break points.
func findSplitPoint(text string, limit int) int {
	if limit >= len(text) {
		return len(text)
	}

	// 1. Look for paragraph break (\n\n) in the last 30% of the chunk
	searchStart := limit * 70 / 100
	if searchStart < 0 {
		searchStart = 0
	}
	window := text[searchStart:limit]
	if idx := strings.LastIndex(window, "\n\n"); idx != -1 {
		return searchStart + idx + 2 // Include the newlines in the first chunk
	}

	// 2. Look for line break (\n) in the last 40%
	searchStart = limit * 60 / 100
	if searchStart < 0 {
		searchStart = 0
	}
	window = text[searchStart:limit]
	if idx := strings.LastIndex(window, "\n"); idx != -1 {
		return searchStart + idx + 1
	}

	// 3. Look for sentence end (. ! ?) in the last 50%
	searchStart = limit * 50 / 100
	if searchStart < 0 {
		searchStart = 0
	}
	for i := limit - 1; i >= searchStart; i-- {
		r := rune(text[i])
		if r == '.' || r == '!' || r == '?' {
			// Make sure next char is whitespace or end (actual sentence end, not "Mr.")
			if i+1 >= len(text) || unicode.IsSpace(rune(text[i+1])) {
				return i + 1
			}
		}
	}

	// 4. Look for word boundary (space) in the last 20%
	searchStart = limit * 80 / 100
	if searchStart < 0 {
		searchStart = 0
	}
	window = text[searchStart:limit]
	if idx := strings.LastIndex(window, " "); idx != -1 {
		return searchStart + idx + 1
	}

	// 5. Hard cut at limit (no good break point found)
	return limit
}

// SendWithChunking is a helper that wraps a platform-specific send function
// with automatic text chunking. It splits the text into chunks, calls sendFn
// for each chunk, and assembles the DeliveryResult.
//
// The sendFn receives a single chunk and returns the platform message ID.
// SendWithChunking collects all IDs and returns a unified result.
//
// Example:
//
//	result := nexadapter.SendWithChunking(req.Text, 2000, func(chunk string) (string, error) {
//	    return discordAPI.SendMessage(channelID, chunk)
//	})
func SendWithChunking(text string, charLimit int, sendFn func(chunk string) (messageID string, err error)) *DeliveryResult {
	chunks := ChunkText(text, charLimit)
	if len(chunks) == 0 {
		return &DeliveryResult{
			Success:    false,
			MessageIDs: nil,
			ChunksSent: 0,
			Error: &DeliveryError{
				Type:    "content_rejected",
				Message: "empty message",
				Retry:   false,
			},
		}
	}

	var messageIDs []string
	for i, chunk := range chunks {
		id, err := sendFn(chunk)
		if err != nil {
			return &DeliveryResult{
				Success:    false,
				MessageIDs: messageIDs,
				ChunksSent: i,
				Error: &DeliveryError{
					Type:    "network",
					Message: err.Error(),
					Retry:   true,
				},
			}
		}
		messageIDs = append(messageIDs, id)
	}

	return &DeliveryResult{
		Success:    true,
		MessageIDs: messageIDs,
		ChunksSent: len(chunks),
	}
}
