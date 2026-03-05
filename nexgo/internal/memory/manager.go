// Package memory implements the Nexus memory subsystem for storing, recalling,
// and consolidating memory elements extracted from agent conversations.
package memory

import (
	"context"
	"crypto/rand"
	"fmt"
	"log/slog"
	"time"

	"github.com/Napageneral/nexus/internal/config"
	"github.com/Napageneral/nexus/internal/db"
)

// Manager manages the memory subsystem.
type Manager struct {
	ledgers *db.Ledgers
	config  *config.MemoryConfig
	logger  *slog.Logger
}

// MemoryStatus summarizes the current state of the memory subsystem.
type MemoryStatus struct {
	ElementCount int64     `json:"element_count"`
	EntityCount  int64     `json:"entity_count"`
	LinkCount    int64     `json:"link_count"`
	FTSEnabled   bool      `json:"fts_enabled"`
	LastSync     time.Time `json:"last_sync"`
}

// NewManager creates a new memory Manager.
func NewManager(ledgers *db.Ledgers, cfg *config.MemoryConfig, logger *slog.Logger) *Manager {
	return &Manager{
		ledgers: ledgers,
		config:  cfg,
		logger:  logger,
	}
}

// Initialize ensures the memory tables exist and loads initial state.
func (m *Manager) Initialize(ctx context.Context) error {
	// Tables are bootstrapped by db.OpenLedgers, so this is a no-op for now.
	// Verify connectivity.
	if err := m.ledgers.Memory.PingContext(ctx); err != nil {
		return fmt.Errorf("memory db ping: %w", err)
	}
	m.logger.Info("memory subsystem initialized",
		"fts_enabled", db.FTSEnabled(),
	)
	return nil
}

// GetStatus returns the current memory subsystem status.
func (m *Manager) GetStatus() MemoryStatus {
	var status MemoryStatus
	status.FTSEnabled = db.FTSEnabled()

	// Count elements.
	row := m.ledgers.Memory.QueryRow("SELECT COUNT(*) FROM elements WHERE status = 'active'")
	_ = row.Scan(&status.ElementCount)

	// Count unique entity associations.
	row = m.ledgers.Memory.QueryRow("SELECT COUNT(DISTINCT entity_id) FROM element_entities")
	_ = row.Scan(&status.EntityCount)

	// Count links.
	row = m.ledgers.Memory.QueryRow("SELECT COUNT(*) FROM element_links")
	_ = row.Scan(&status.LinkCount)

	return status
}

// newUUID generates a random UUID v4.
func newUUID() string {
	var buf [16]byte
	_, _ = rand.Read(buf[:])
	buf[6] = (buf[6] & 0x0f) | 0x40 // version 4
	buf[8] = (buf[8] & 0x3f) | 0x80 // variant 2
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		buf[0:4], buf[4:6], buf[6:8], buf[8:10], buf[10:16])
}
