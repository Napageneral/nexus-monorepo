package memory

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/Napageneral/nexus/internal/db"
)

// RecallRequest specifies what to recall from memory.
type RecallRequest struct {
	Query     string
	EntityIDs []string // filter by entity
	Types     []string // filter by element type
	Limit     int
	TimeRange *TimeRange
}

// TimeRange constrains recall results to a time window.
type TimeRange struct {
	After  time.Time
	Before time.Time
}

// RecallResult contains the recalled memory elements and metadata.
type RecallResult struct {
	Elements []MemoryElement
	Query    string
	Strategy string // "fts5", "like", "entity", "temporal"
}

// MemoryElement represents a single memory element.
type MemoryElement struct {
	ID          string    `json:"id"`
	Type        string    `json:"type"`
	Content     string    `json:"content"`
	Source      string    `json:"source"`
	Importance  float64   `json:"importance"`
	Tags        string    `json:"tags"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	AccessCount int       `json:"access_count"`
	Score       float64   `json:"score"` // search relevance
}

// Recall searches memory using multiple strategies.
func (m *Manager) Recall(ctx context.Context, req RecallRequest) (*RecallResult, error) {
	if req.Limit <= 0 {
		req.Limit = 20
	}

	// Strategy 1: Entity filter (if entity IDs provided)
	if len(req.EntityIDs) > 0 && req.Query == "" {
		return m.recallByEntity(ctx, req)
	}

	// Strategy 2: Temporal filter (if time range provided with no query)
	if req.TimeRange != nil && req.Query == "" {
		return m.recallByTemporal(ctx, req)
	}

	// Strategy 3: FTS5 search (if available and query provided)
	if req.Query != "" && db.FTSEnabled() {
		result, err := m.recallByFTS(ctx, req)
		if err == nil && len(result.Elements) > 0 {
			return result, nil
		}
		// Fall through to LIKE if FTS returns nothing.
	}

	// Strategy 4: LIKE fallback for text queries.
	if req.Query != "" {
		return m.recallByLike(ctx, req)
	}

	// Default: return recent elements.
	return m.recallRecent(ctx, req)
}

// recallByFTS uses the FTS5 index to search memory elements.
func (m *Manager) recallByFTS(ctx context.Context, req RecallRequest) (*RecallResult, error) {
	query := buildFTSQuery(req.Query)

	baseQuery := `SELECT e.id, e.type, e.content, e.source, e.importance,
		e.tags, e.status, e.created_at, e.access_count,
		rank * -1 AS score
		FROM elements_fts fts
		JOIN elements e ON e.rowid = fts.rowid
		WHERE elements_fts MATCH ?
		AND e.status = 'active'`

	args := []any{query}
	baseQuery, args = appendFilters(baseQuery, args, req)
	baseQuery += " ORDER BY score DESC LIMIT ?"
	args = append(args, req.Limit)

	rows, err := m.ledgers.Memory.QueryContext(ctx, baseQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("fts5 recall: %w", err)
	}
	defer rows.Close()

	elements, err := scanElements(rows)
	if err != nil {
		return nil, err
	}

	// Update access counts.
	m.updateAccessCounts(ctx, elements)

	return &RecallResult{
		Elements: elements,
		Query:    req.Query,
		Strategy: "fts5",
	}, nil
}

// recallByLike uses LIKE queries as a fallback when FTS5 is unavailable.
func (m *Manager) recallByLike(ctx context.Context, req RecallRequest) (*RecallResult, error) {
	pattern := "%" + req.Query + "%"

	baseQuery := `SELECT id, type, content, source, importance,
		tags, status, created_at, access_count, 0.0 AS score
		FROM elements
		WHERE status = 'active'
		AND (content LIKE ? OR source LIKE ?)`

	args := []any{pattern, pattern}
	baseQuery, args = appendFilters(baseQuery, args, req)
	baseQuery += " ORDER BY importance DESC, created_at DESC LIMIT ?"
	args = append(args, req.Limit)

	rows, err := m.ledgers.Memory.QueryContext(ctx, baseQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("like recall: %w", err)
	}
	defer rows.Close()

	elements, err := scanElements(rows)
	if err != nil {
		return nil, err
	}

	m.updateAccessCounts(ctx, elements)

	return &RecallResult{
		Elements: elements,
		Query:    req.Query,
		Strategy: "like",
	}, nil
}

// recallByEntity retrieves elements associated with specific entities.
func (m *Manager) recallByEntity(ctx context.Context, req RecallRequest) (*RecallResult, error) {
	placeholders := make([]string, len(req.EntityIDs))
	args := make([]any, len(req.EntityIDs))
	for i, id := range req.EntityIDs {
		placeholders[i] = "?"
		args[i] = id
	}

	baseQuery := fmt.Sprintf(`SELECT DISTINCT e.id, e.type, e.content, e.source, e.importance,
		e.tags, e.status, e.created_at, e.access_count, 0.0 AS score
		FROM elements e
		JOIN element_entities ee ON ee.element_id = e.id
		WHERE e.status = 'active'
		AND ee.entity_id IN (%s)`, strings.Join(placeholders, ","))

	baseQuery, args = appendTimeFilter(baseQuery, args, req)
	baseQuery, args = appendTypeFilter(baseQuery, args, req)
	baseQuery += " ORDER BY e.importance DESC, e.created_at DESC LIMIT ?"
	args = append(args, req.Limit)

	rows, err := m.ledgers.Memory.QueryContext(ctx, baseQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("entity recall: %w", err)
	}
	defer rows.Close()

	elements, err := scanElements(rows)
	if err != nil {
		return nil, err
	}

	m.updateAccessCounts(ctx, elements)

	return &RecallResult{
		Elements: elements,
		Query:    req.Query,
		Strategy: "entity",
	}, nil
}

// recallByTemporal retrieves elements within a time range.
func (m *Manager) recallByTemporal(ctx context.Context, req RecallRequest) (*RecallResult, error) {
	baseQuery := `SELECT id, type, content, source, importance,
		tags, status, created_at, access_count, 0.0 AS score
		FROM elements
		WHERE status = 'active'`

	var args []any
	baseQuery, args = appendFilters(baseQuery, args, req)
	baseQuery += " ORDER BY created_at DESC LIMIT ?"
	args = append(args, req.Limit)

	rows, err := m.ledgers.Memory.QueryContext(ctx, baseQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("temporal recall: %w", err)
	}
	defer rows.Close()

	elements, err := scanElements(rows)
	if err != nil {
		return nil, err
	}

	m.updateAccessCounts(ctx, elements)

	return &RecallResult{
		Elements: elements,
		Query:    req.Query,
		Strategy: "temporal",
	}, nil
}

// recallRecent retrieves the most recent elements.
func (m *Manager) recallRecent(ctx context.Context, req RecallRequest) (*RecallResult, error) {
	baseQuery := `SELECT id, type, content, source, importance,
		tags, status, created_at, access_count, 0.0 AS score
		FROM elements
		WHERE status = 'active'`

	var args []any
	baseQuery, args = appendFilters(baseQuery, args, req)
	baseQuery += " ORDER BY created_at DESC LIMIT ?"
	args = append(args, req.Limit)

	rows, err := m.ledgers.Memory.QueryContext(ctx, baseQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("recent recall: %w", err)
	}
	defer rows.Close()

	elements, err := scanElements(rows)
	if err != nil {
		return nil, err
	}

	return &RecallResult{
		Elements: elements,
		Query:    req.Query,
		Strategy: "temporal",
	}, nil
}

// buildFTSQuery converts a user query into FTS5 match syntax.
func buildFTSQuery(query string) string {
	// Simple: wrap each word in quotes for phrase matching.
	words := strings.Fields(query)
	if len(words) == 0 {
		return query
	}
	if len(words) == 1 {
		return words[0]
	}
	// Use OR to match any word.
	return strings.Join(words, " OR ")
}

// appendFilters adds entity, type, and time filters to a query.
func appendFilters(query string, args []any, req RecallRequest) (string, []any) {
	query, args = appendTimeFilter(query, args, req)
	query, args = appendTypeFilter(query, args, req)
	return query, args
}

// appendTimeFilter adds temporal constraints.
func appendTimeFilter(query string, args []any, req RecallRequest) (string, []any) {
	if req.TimeRange != nil {
		if !req.TimeRange.After.IsZero() {
			query += " AND created_at >= ?"
			args = append(args, req.TimeRange.After.UnixMilli())
		}
		if !req.TimeRange.Before.IsZero() {
			query += " AND created_at <= ?"
			args = append(args, req.TimeRange.Before.UnixMilli())
		}
	}
	return query, args
}

// appendTypeFilter adds type constraints.
func appendTypeFilter(query string, args []any, req RecallRequest) (string, []any) {
	if len(req.Types) > 0 {
		placeholders := make([]string, len(req.Types))
		for i, t := range req.Types {
			placeholders[i] = "?"
			args = append(args, t)
		}
		query += fmt.Sprintf(" AND type IN (%s)", strings.Join(placeholders, ","))
	}
	return query, args
}

// scanElements scans rows into MemoryElement slices.
func scanElements(rows interface {
	Next() bool
	Scan(dest ...any) error
	Err() error
}) ([]MemoryElement, error) {
	var elements []MemoryElement
	for rows.Next() {
		var elem MemoryElement
		var createdAtMS int64
		if err := rows.Scan(
			&elem.ID, &elem.Type, &elem.Content, &elem.Source, &elem.Importance,
			&elem.Tags, &elem.Status, &createdAtMS, &elem.AccessCount, &elem.Score,
		); err != nil {
			return nil, fmt.Errorf("scan element: %w", err)
		}
		elem.CreatedAt = time.UnixMilli(createdAtMS)
		elements = append(elements, elem)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}
	return elements, nil
}

// updateAccessCounts bumps the access_count for recalled elements.
func (m *Manager) updateAccessCounts(ctx context.Context, elements []MemoryElement) {
	now := time.Now().UnixMilli()
	for _, elem := range elements {
		_, err := m.ledgers.Memory.ExecContext(ctx,
			"UPDATE elements SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?",
			now, elem.ID,
		)
		if err != nil {
			m.logger.Warn("failed to update access count", "element_id", elem.ID, "error", err)
		}
	}
}
