package memory

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// TurnData holds the data from a single agent turn for memory extraction.
type TurnData struct {
	SessionKey string
	AgentID    string
	UserPrompt string
	Response   string
	ToolCalls  []ToolCallData
}

// ToolCallData holds tool call information from a turn.
type ToolCallData struct {
	Name   string
	Args   map[string]any
	Result string
}

// RetainFromTurn extracts facts and observations from a turn and stores them.
// For Phase 3: uses simple heuristic extraction (look for factual statements).
// Full LLM-powered extraction is Phase 4.
func (m *Manager) RetainFromTurn(ctx context.Context, turn TurnData) error {
	// Extract memory elements from the response using simple heuristics.
	elements := m.extractFromTurn(turn)

	for _, elem := range elements {
		if err := m.RetainElement(ctx, elem); err != nil {
			return fmt.Errorf("retain element: %w", err)
		}
	}

	m.logger.Debug("retained from turn",
		"session", turn.SessionKey,
		"elements", len(elements),
	)
	return nil
}

// RetainElement directly inserts a memory element into the memory database.
func (m *Manager) RetainElement(ctx context.Context, elem MemoryElement) error {
	if elem.ID == "" {
		elem.ID = newUUID()
	}
	if elem.Status == "" {
		elem.Status = "active"
	}
	if elem.Type == "" {
		elem.Type = "observation"
	}

	now := time.Now().UnixMilli()

	const q = `INSERT INTO elements
		(id, type, content, source, importance, tags, status, created_at, updated_at, access_count)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := m.ledgers.Memory.ExecContext(ctx, q,
		elem.ID, elem.Type, elem.Content, elem.Source,
		elem.Importance, elem.Tags, elem.Status,
		now, now, 0,
	)
	if err != nil {
		return fmt.Errorf("insert element: %w", err)
	}
	return nil
}

// extractFromTurn uses simple heuristics to extract memory elements from turn data.
func (m *Manager) extractFromTurn(turn TurnData) []MemoryElement {
	var elements []MemoryElement

	// Extract from the response: split into sentences and look for factual statements.
	sentences := splitSentences(turn.Response)
	for _, sentence := range sentences {
		sentence = strings.TrimSpace(sentence)
		if len(sentence) < 10 {
			continue
		}

		// Simple heuristic: look for statements that contain factual markers.
		if isFactualStatement(sentence) {
			elements = append(elements, MemoryElement{
				Type:       "observation",
				Content:    sentence,
				Source:     fmt.Sprintf("session:%s", turn.SessionKey),
				Importance: 0.5,
				Tags:       "[]",
			})
		}
	}

	// Extract from tool call results.
	for _, tc := range turn.ToolCalls {
		if tc.Result != "" && len(tc.Result) > 10 {
			elements = append(elements, MemoryElement{
				Type:       "tool_result",
				Content:    fmt.Sprintf("[%s] %s", tc.Name, truncate(tc.Result, 500)),
				Source:     fmt.Sprintf("session:%s/tool:%s", turn.SessionKey, tc.Name),
				Importance: 0.3,
				Tags:       "[]",
			})
		}
	}

	return elements
}

// splitSentences splits text into sentences using simple punctuation rules.
func splitSentences(text string) []string {
	var sentences []string
	var current strings.Builder

	for _, r := range text {
		current.WriteRune(r)
		if r == '.' || r == '!' || r == '?' {
			s := strings.TrimSpace(current.String())
			if s != "" {
				sentences = append(sentences, s)
			}
			current.Reset()
		}
	}

	// Add remaining text as a sentence if it's meaningful.
	remaining := strings.TrimSpace(current.String())
	if len(remaining) > 10 {
		sentences = append(sentences, remaining)
	}

	return sentences
}

// isFactualStatement checks if a sentence looks like a factual statement.
func isFactualStatement(sentence string) bool {
	lower := strings.ToLower(sentence)

	// Look for factual markers.
	markers := []string{
		" is ", " are ", " was ", " were ",
		" has ", " have ", " had ",
		" uses ", " runs ", " contains ",
		" located ", " created ", " built ",
	}

	for _, marker := range markers {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return false
}

// truncate shortens a string to maxLen, adding ellipsis if truncated.
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}
