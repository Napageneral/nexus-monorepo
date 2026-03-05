package memory

import (
	"context"
	"crypto/sha256"
	"fmt"
)

// ConsolidateResult reports what the consolidation pass accomplished.
type ConsolidateResult struct {
	Merged  int `json:"merged"`
	Removed int `json:"removed"`
}

// Consolidate finds duplicate or near-duplicate memory elements and merges them.
// For Phase 3: simple dedup by content hash. Full semantic dedup is Phase 4.
func (m *Manager) Consolidate(ctx context.Context) (*ConsolidateResult, error) {
	// Fetch all active elements.
	rows, err := m.ledgers.Memory.QueryContext(ctx,
		`SELECT id, content, importance FROM elements WHERE status = 'active' ORDER BY created_at ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("query elements: %w", err)
	}
	defer rows.Close()

	type elemInfo struct {
		id         string
		content    string
		importance float64
	}

	// Group elements by content hash.
	groups := make(map[string][]elemInfo)
	var order []string

	for rows.Next() {
		var e elemInfo
		if err := rows.Scan(&e.id, &e.content, &e.importance); err != nil {
			return nil, fmt.Errorf("scan element: %w", err)
		}
		hash := hashContent(e.content)
		if _, exists := groups[hash]; !exists {
			order = append(order, hash)
		}
		groups[hash] = append(groups[hash], e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}

	result := &ConsolidateResult{}

	// For each group with duplicates, keep the one with highest importance
	// and mark others as superseded.
	for _, hash := range order {
		group := groups[hash]
		if len(group) < 2 {
			continue
		}

		// Find the element with highest importance.
		bestIdx := 0
		for i, e := range group {
			if e.importance > group[bestIdx].importance {
				bestIdx = i
			}
		}
		keeper := group[bestIdx]

		// Mark others as superseded.
		for i, e := range group {
			if i == bestIdx {
				continue
			}
			_, err := m.ledgers.Memory.ExecContext(ctx,
				`UPDATE elements SET status = 'superseded', superseded_by = ? WHERE id = ?`,
				keeper.id, e.id,
			)
			if err != nil {
				m.logger.Warn("failed to supersede element", "id", e.id, "error", err)
				continue
			}
			result.Removed++
		}
		result.Merged++
	}

	m.logger.Info("memory consolidation complete",
		"merged", result.Merged,
		"removed", result.Removed,
	)

	return result, nil
}

// hashContent returns a hex SHA-256 hash of content for dedup purposes.
func hashContent(content string) string {
	h := sha256.Sum256([]byte(content))
	return fmt.Sprintf("%x", h)
}
