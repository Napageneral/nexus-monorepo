package memory

import (
	"context"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// SyncMemoryFiles scans .md files in the given directory, parses their content,
// and upserts them into the memory elements table. Files are tracked by content
// hash to avoid re-importing unchanged files.
func (m *Manager) SyncMemoryFiles(ctx context.Context, dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read dir %s: %w", dir, err)
	}

	synced := 0
	skipped := 0

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}

		filePath := filepath.Join(dir, entry.Name())
		data, err := os.ReadFile(filePath)
		if err != nil {
			m.logger.Warn("failed to read memory file", "path", filePath, "error", err)
			continue
		}

		content := string(data)
		hash := contentHash(content)

		// Check if we already have this content by hash.
		existing, err := m.findBySourceHash(ctx, filePath, hash)
		if err != nil {
			m.logger.Warn("failed to check existing", "path", filePath, "error", err)
			continue
		}
		if existing {
			skipped++
			continue
		}

		// Parse frontmatter if present.
		title, body := parseFrontmatter(content)
		if title == "" {
			title = strings.TrimSuffix(entry.Name(), ".md")
		}

		// Upsert the element.
		elem := MemoryElement{
			ID:         newUUID(),
			Type:       "document",
			Content:    body,
			Source:     fmt.Sprintf("file:%s#%s", filePath, hash),
			Importance: 0.5,
			Tags:       fmt.Sprintf(`[%q]`, title),
			Status:     "active",
		}

		if err := m.RetainElement(ctx, elem); err != nil {
			m.logger.Warn("failed to retain file element", "path", filePath, "error", err)
			continue
		}
		synced++
	}

	m.logger.Info("memory file sync complete",
		"dir", dir,
		"synced", synced,
		"skipped", skipped,
	)

	// Store last sync time.
	now := time.Now().UnixMilli()
	_, _ = m.ledgers.Memory.ExecContext(ctx,
		`INSERT OR REPLACE INTO processing_log (id, element_id, action, details, created_at)
		VALUES (?, '', 'sync', ?, ?)`,
		"last-sync", fmt.Sprintf(`{"dir":%q,"synced":%d}`, dir, synced), now,
	)

	return nil
}

// findBySourceHash checks if an element with the given source path and hash already exists.
func (m *Manager) findBySourceHash(ctx context.Context, filePath, hash string) (bool, error) {
	source := fmt.Sprintf("file:%s#%s", filePath, hash)
	var count int
	err := m.ledgers.Memory.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM elements WHERE source = ? AND status = 'active'",
		source,
	).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// contentHash returns a hex SHA-256 hash of the content.
func contentHash(content string) string {
	h := sha256.Sum256([]byte(content))
	return fmt.Sprintf("%x", h[:8]) // short hash
}

// parseFrontmatter extracts a title from simple YAML-like frontmatter.
// Returns the title and the body (content after frontmatter).
func parseFrontmatter(content string) (title, body string) {
	if !strings.HasPrefix(content, "---\n") {
		return "", content
	}

	// Find the closing ---.
	rest := content[4:]
	idx := strings.Index(rest, "\n---")
	if idx < 0 {
		return "", content
	}

	frontmatter := rest[:idx]
	body = strings.TrimSpace(rest[idx+4:])

	// Extract title from frontmatter.
	for _, line := range strings.Split(frontmatter, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "title:") {
			title = strings.TrimSpace(strings.TrimPrefix(line, "title:"))
			title = strings.Trim(title, `"'`)
			break
		}
	}

	return title, body
}
