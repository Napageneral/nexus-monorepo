package adapters

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"

	"github.com/Napageneral/nexus/internal/config"
	"github.com/Napageneral/nexus/internal/db"
)

// Manager orchestrates adapter process lifecycles.
type Manager struct {
	ledgers *db.Ledgers
	config  *config.Config
	procs   map[string]*AdapterProcess
	onEvent func(adapterID string, msg ProtocolMessage) // callback for inbound events
	mu      sync.RWMutex
	logger  *slog.Logger
}

// NewManager creates a new adapter Manager.
func NewManager(ledgers *db.Ledgers, cfg *config.Config, logger *slog.Logger) *Manager {
	return &Manager{
		ledgers: ledgers,
		config:  cfg,
		procs:   make(map[string]*AdapterProcess),
		logger:  logger,
	}
}

// SetEventHandler sets the callback invoked when an adapter sends an event.
func (m *Manager) SetEventHandler(fn func(string, ProtocolMessage)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onEvent = fn
}

// Start launches an adapter process and begins reading its stdout.
func (m *Manager) Start(ctx context.Context, adapterID, binaryPath string, args []string) error {
	m.mu.Lock()
	if _, exists := m.procs[adapterID]; exists {
		m.mu.Unlock()
		return fmt.Errorf("adapter %s already running", adapterID)
	}
	m.mu.Unlock()

	proc := NewAdapterProcess(adapterID, binaryPath, args)
	if err := proc.Start(ctx); err != nil {
		return fmt.Errorf("start adapter %s: %w", adapterID, err)
	}

	m.mu.Lock()
	m.procs[adapterID] = proc
	handler := m.onEvent
	m.mu.Unlock()

	// Start the read loop in a goroutine.
	go proc.readLoop(func(msg ProtocolMessage) {
		m.logger.Debug("adapter event",
			"adapter", adapterID,
			"verb", msg.Verb,
			"id", msg.ID,
		)
		if handler != nil {
			handler(adapterID, msg)
		}
	})

	m.logger.Info("adapter started", "adapter", adapterID, "binary", binaryPath)
	return nil
}

// Stop stops a running adapter process.
func (m *Manager) Stop(adapterID string) error {
	m.mu.Lock()
	proc, exists := m.procs[adapterID]
	if !exists {
		m.mu.Unlock()
		return fmt.Errorf("adapter %s not found", adapterID)
	}
	delete(m.procs, adapterID)
	m.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 5_000_000_000) // 5s
	defer cancel()

	if err := proc.Stop(ctx); err != nil {
		return fmt.Errorf("stop adapter %s: %w", adapterID, err)
	}
	m.logger.Info("adapter stopped", "adapter", adapterID)
	return nil
}

// Shutdown stops all running adapter processes.
func (m *Manager) Shutdown(ctx context.Context) error {
	m.mu.Lock()
	ids := make([]string, 0, len(m.procs))
	for id := range m.procs {
		ids = append(ids, id)
	}
	m.mu.Unlock()

	var errs []string
	for _, id := range ids {
		if err := m.Stop(id); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", id, err))
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("shutdown errors: %v", errs)
	}
	return nil
}

// Status returns the current status of an adapter process.
func (m *Manager) Status(adapterID string) (ProcessStatus, error) {
	m.mu.RLock()
	proc, exists := m.procs[adapterID]
	m.mu.RUnlock()

	if !exists {
		return StatusStopped, fmt.Errorf("adapter %s not found", adapterID)
	}
	return proc.Status(), nil
}

// List returns info for all managed adapter processes.
func (m *Manager) List() []AdapterInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	infos := make([]AdapterInfo, 0, len(m.procs))
	for _, proc := range m.procs {
		infos = append(infos, proc.Info)
	}
	return infos
}

// Send delivers a message to a specific adapter.
func (m *Manager) Send(adapterID string, req DeliveryRequest) error {
	m.mu.RLock()
	proc, exists := m.procs[adapterID]
	m.mu.RUnlock()

	if !exists {
		return fmt.Errorf("adapter %s not found", adapterID)
	}

	payload, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("marshal delivery request: %w", err)
	}

	msg := ProtocolMessage{
		ID:   newUUID(),
		Verb: VerbSend,
	}
	// Store the raw JSON as the payload.
	var raw json.RawMessage = payload
	msg.Payload = &raw

	return proc.Send(msg)
}

// Health sends a health check to an adapter.
func (m *Manager) Health(adapterID string) error {
	m.mu.RLock()
	proc, exists := m.procs[adapterID]
	m.mu.RUnlock()

	if !exists {
		return fmt.Errorf("adapter %s not found", adapterID)
	}

	msg := ProtocolMessage{
		ID:   newUUID(),
		Verb: VerbHealth,
	}
	return proc.Send(msg)
}

// Name returns the service name for the daemon.Service interface.
func (m *Manager) Name() string {
	return "adapters"
}
