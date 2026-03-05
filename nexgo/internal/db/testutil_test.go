package db

import (
	"path/filepath"
	"testing"
)

// openTestLedgers creates a temp directory, opens all databases, runs schemas,
// and registers cleanup via t.Cleanup.
func openTestLedgers(t *testing.T) *Ledgers {
	t.Helper()
	dataDir := filepath.Join(t.TempDir(), "data")
	l, err := OpenLedgers(dataDir)
	if err != nil {
		t.Fatalf("openTestLedgers: OpenLedgers: %v", err)
	}
	t.Cleanup(func() { l.Close() })
	return l
}
