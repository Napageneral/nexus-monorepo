package codeintel

import (
	"context"
	"path/filepath"
	"sort"
	"strings"
)

type testImpactCandidate struct {
	FilePath string
	Language string
	Score    int
	Terms    map[string]struct{}
}

func isTestFilePath(path string) bool {
	path = strings.ToLower(filepath.ToSlash(path))
	return strings.Contains(path, "/tests/") ||
		strings.HasPrefix(path, "tests/") ||
		strings.HasSuffix(path, "_test.go") ||
		strings.Contains(path, "/test_") ||
		strings.HasSuffix(path, "_test.py") ||
		strings.Contains(path, "/test_") ||
		strings.HasSuffix(path, ".test.ts") ||
		strings.HasSuffix(path, ".test.tsx") ||
		strings.HasSuffix(path, ".spec.ts") ||
		strings.HasSuffix(path, ".spec.tsx") ||
		strings.HasSuffix(path, ".spec.js") ||
		strings.HasSuffix(path, ".test.js")
}

func normalizeTestImpactTerms(terms []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(terms))
	for _, term := range terms {
		term = strings.TrimSpace(strings.ToLower(term))
		if term == "" || len(term) < 3 {
			continue
		}
		if _, ok := seen[term]; ok {
			continue
		}
		seen[term] = struct{}{}
		out = append(out, term)
	}
	sort.Strings(out)
	return out
}

func baseStem(path string) string {
	base := filepath.Base(path)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	base = strings.TrimPrefix(base, "test_")
	base = strings.TrimSuffix(base, "_test")
	return base
}

func (s *Service) GetTestsImpact(ctx context.Context, snapshotID string, terms []string, limit int) ([]TestImpactRecord, error) {
	if limit <= 0 {
		limit = 10
	}
	terms = normalizeTestImpactTerms(terms)
	if len(terms) == 0 {
		return []TestImpactRecord{}, nil
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT c.file_path, c.language, c.content
		FROM code_chunks c
		WHERE c.snapshot_id = ?
		ORDER BY c.file_path ASC, c.start_line ASC
	`, snapshotID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	candidates := map[string]*testImpactCandidate{}
	for rows.Next() {
		var filePath string
		var language string
		var content string
		if err := rows.Scan(&filePath, &language, &content); err != nil {
			return nil, err
		}
		if !isTestFilePath(filePath) {
			continue
		}
		lowerPath := strings.ToLower(filePath)
		lowerContent := strings.ToLower(content)
		candidate := candidates[filePath]
		if candidate == nil {
			candidate = &testImpactCandidate{
				FilePath: filePath,
				Language: language,
				Terms:    map[string]struct{}{},
			}
			candidates[filePath] = candidate
		}
		for _, term := range terms {
			if strings.Contains(lowerPath, term) {
				candidate.Score += 3
				candidate.Terms[term] = struct{}{}
				continue
			}
			if strings.Contains(lowerContent, term) {
				candidate.Score++
				candidate.Terms[term] = struct{}{}
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	scored := make([]testImpactCandidate, 0, len(candidates))
	for _, candidate := range candidates {
		if candidate.Score <= 0 {
			continue
		}
		scored = append(scored, *candidate)
	}
	sort.Slice(scored, func(i, j int) bool {
		if scored[i].Score != scored[j].Score {
			return scored[i].Score > scored[j].Score
		}
		return scored[i].FilePath < scored[j].FilePath
	})
	if len(scored) > limit {
		scored = scored[:limit]
	}

	out := make([]TestImpactRecord, 0, len(scored))
	for _, candidate := range scored {
		matchedTerms := make([]string, 0, len(candidate.Terms))
		for term := range candidate.Terms {
			matchedTerms = append(matchedTerms, term)
		}
		sort.Strings(matchedTerms)
		out = append(out, TestImpactRecord{
			FilePath:   candidate.FilePath,
			Language:   candidate.Language,
			MatchKind:  "heuristic",
			MatchTerms: matchedTerms,
			Rationale:  "matched against test file path and indexed chunk content",
		})
	}
	return out, nil
}
