package apps

import (
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// AppState describes the lifecycle state of an app.
type AppState string

const (
	AppDiscovered AppState = "discovered"
	AppInstalled  AppState = "installed"
	AppActive     AppState = "active"
	AppStopped    AppState = "stopped"
	AppError      AppState = "error"
)

// AppRecord holds the runtime state for a registered app.
type AppRecord struct {
	Manifest  AppManifest
	State     AppState
	Error     string
	StartedAt *time.Time
}

// Registry maintains the set of known apps and their states.
type Registry struct {
	apps   map[string]*AppRecord
	mu     sync.RWMutex
	logger *slog.Logger
}

// NewRegistry creates a new app registry.
func NewRegistry(logger *slog.Logger) *Registry {
	if logger == nil {
		logger = slog.Default()
	}
	return &Registry{
		apps:   make(map[string]*AppRecord),
		logger: logger,
	}
}

// Register adds an app to the registry in the "discovered" state.
func (r *Registry) Register(manifest AppManifest) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if manifest.ID == "" {
		return fmt.Errorf("register: app manifest ID is required")
	}

	if _, exists := r.apps[manifest.ID]; exists {
		return fmt.Errorf("register: app %q already registered", manifest.ID)
	}

	r.apps[manifest.ID] = &AppRecord{
		Manifest: manifest,
		State:    AppDiscovered,
	}

	r.logger.Info("app registered",
		"app_id", manifest.ID,
		"name", manifest.Name,
		"version", manifest.Version,
	)

	return nil
}

// Get retrieves an app record by ID.
func (r *Registry) Get(appID string) (*AppRecord, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	record, ok := r.apps[appID]
	if !ok {
		return nil, fmt.Errorf("get: app %q not found", appID)
	}
	return record, nil
}

// List returns all registered app records.
func (r *Registry) List() []AppRecord {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]AppRecord, 0, len(r.apps))
	for _, record := range r.apps {
		result = append(result, *record)
	}
	return result
}

// SetState updates the state of a registered app.
func (r *Registry) SetState(appID string, state AppState) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	record, ok := r.apps[appID]
	if !ok {
		return fmt.Errorf("set state: app %q not found", appID)
	}

	old := record.State
	record.State = state

	if state == AppActive {
		now := time.Now()
		record.StartedAt = &now
	}

	r.logger.Debug("app state changed",
		"app_id", appID,
		"old", string(old),
		"new", string(state),
	)

	return nil
}

// Unregister removes an app from the registry.
func (r *Registry) Unregister(appID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.apps[appID]; !ok {
		return fmt.Errorf("unregister: app %q not found", appID)
	}

	delete(r.apps, appID)
	r.logger.Info("app unregistered", "app_id", appID)
	return nil
}
