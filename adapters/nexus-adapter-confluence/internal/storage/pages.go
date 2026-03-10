package storage

import (
	"fmt"
	"os"
	"path/filepath"
)

type PageStore struct {
	baseDir string
}

func NewPageStore(dataDir string) *PageStore {
	return &PageStore{
		baseDir: filepath.Join(dataDir, "confluence", "pages"),
	}
}

func (s *PageStore) PagePath(pageID string, version int) string {
	return fmt.Sprintf("/confluence/pages/%s/v%d/body.html", pageID, version)
}

func (s *PageStore) WritePage(pageID string, version int, bodyHTML string) (string, error) {
	fullPath := filepath.Join(s.baseDir, pageID, fmt.Sprintf("v%d", version), "body.html")
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(fullPath, []byte(bodyHTML), 0o644); err != nil {
		return "", err
	}
	return fullPath, nil
}
