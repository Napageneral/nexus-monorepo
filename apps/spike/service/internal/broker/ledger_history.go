package broker

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

// BuildLedgerHistory reconstructs the full conversation from the broker
// ledger for a given head turn ID. It walks the turn ancestry, handles
// compaction summaries, and returns messages in chronological order.
//
// This is the Go equivalent of nex's buildLedgerHistory in assembleContext.ts.
func (b *Broker) BuildLedgerHistory(headTurnID string) ([]HistoryMessage, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	headTurnID = strings.TrimSpace(headTurnID)
	if headTurnID == "" {
		return nil, nil
	}

	// 1. Build turn ancestry (oldest first).
	ancestry, err := b.buildTurnAncestry(db, headTurnID)
	if err != nil {
		return nil, fmt.Errorf("failed to build turn ancestry: %w", err)
	}
	if len(ancestry) == 0 {
		return nil, nil
	}

	// 2. Find latest compaction turn in ancestry.
	compactionIdx := -1
	var compactionSummary string
	for i := len(ancestry) - 1; i >= 0; i-- {
		turnID := ancestry[i]
		var turnType string
		row := db.QueryRow(`SELECT turn_type FROM turns WHERE id = ?`, turnID)
		if err := row.Scan(&turnType); err != nil {
			continue
		}
		if turnType == "compaction" {
			var summary sql.NullString
			row := db.QueryRow(`SELECT summary FROM compactions WHERE turn_id = ?`, turnID)
			if err := row.Scan(&summary); err == nil && summary.Valid && strings.TrimSpace(summary.String) != "" {
				compactionIdx = i
				compactionSummary = strings.TrimSpace(summary.String)
			}
			break
		}
	}

	var history []HistoryMessage

	// 3. If compaction found, start with summary (nex uses role: "user").
	if compactionIdx >= 0 && compactionSummary != "" {
		history = append(history, HistoryMessage{
			Role:    "user",
			Content: "[Previous conversation summary]\n" + compactionSummary,
		})
	}

	// 4. Load messages for each turn after compaction.
	startIdx := 0
	if compactionIdx >= 0 {
		startIdx = compactionIdx + 1
	}

	for i := startIdx; i < len(ancestry); i++ {
		turnID := ancestry[i]
		msgs, err := b.fetchTurnMessages(db, turnID)
		if err != nil {
			continue // skip turns with missing messages
		}
		history = append(history, msgs...)
	}

	return history, nil
}

// buildTurnAncestry returns the ordered turn chain from oldest to newest.
// First tries threads.ancestry JSON array, then falls back to walking
// turns.parent_turn_id.
func (b *Broker) buildTurnAncestry(db *sql.DB, headTurnID string) ([]string, error) {
	// Try the threads table first (has pre-computed ancestry).
	var ancestryJSON sql.NullString
	row := db.QueryRow(`SELECT ancestry FROM threads WHERE turn_id = ?`, headTurnID)
	if err := row.Scan(&ancestryJSON); err == nil && ancestryJSON.Valid {
		var ancestry []string
		if json.Unmarshal([]byte(ancestryJSON.String), &ancestry) == nil && len(ancestry) > 0 {
			// Ensure headTurnID is included.
			if ancestry[len(ancestry)-1] != headTurnID {
				ancestry = append(ancestry, headTurnID)
			}
			return ancestry, nil
		}
	}

	// Fallback: walk parent_turn_id chain.
	var chain []string
	seen := map[string]bool{}
	cur := headTurnID
	for cur != "" && !seen[cur] {
		seen[cur] = true
		chain = append(chain, cur)
		var parentID sql.NullString
		row := db.QueryRow(`SELECT parent_turn_id FROM turns WHERE id = ?`, cur)
		if err := row.Scan(&parentID); err != nil {
			break
		}
		cur = strings.TrimSpace(nullString(parentID))
	}
	// Reverse to get oldest-first.
	for i, j := 0, len(chain)-1; i < j; i, j = i+1, j-1 {
		chain[i], chain[j] = chain[j], chain[i]
	}
	return chain, nil
}

// fetchTurnMessages loads messages for a single turn from the ledger.
func (b *Broker) fetchTurnMessages(db *sql.DB, turnID string) ([]HistoryMessage, error) {
	rows, err := db.Query(`
		SELECT role, content FROM messages
		WHERE turn_id = ? ORDER BY sequence ASC
	`, turnID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []HistoryMessage
	for rows.Next() {
		var (
			role    string
			content sql.NullString
		)
		if err := rows.Scan(&role, &content); err != nil {
			continue
		}
		role = strings.TrimSpace(role)
		text := strings.TrimSpace(nullString(content))
		if role == "" || text == "" {
			continue
		}
		// Normalize role to what LLMs expect.
		switch role {
		case "user", "assistant", "system":
			// keep as-is
		default:
			continue
		}
		msgs = append(msgs, HistoryMessage{
			Role:    role,
			Content: text,
		})
	}
	return msgs, rows.Err()
}
