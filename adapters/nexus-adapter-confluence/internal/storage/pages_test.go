package storage

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWritePage(t *testing.T) {
	t.Parallel()

	store := NewPageStore(t.TempDir())
	path, err := store.WritePage("123456", 3, "<p>Hello</p>")
	if err != nil {
		t.Fatalf("WritePage() error = %v", err)
	}
	if path != filepath.Join(store.baseDir, "123456", "v3", "body.html") {
		t.Fatalf("path = %q", path)
	}
	fullPath := filepath.Join(store.baseDir, "123456", "v3", "body.html")
	raw, err := os.ReadFile(fullPath)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if string(raw) != "<p>Hello</p>" {
		t.Fatalf("body = %q", string(raw))
	}
}
