package apps

import (
	"context"
	"fmt"
	"log/slog"
	"os/exec"
	"sync"
)

// ServiceManager manages the OS processes for app services.
type ServiceManager struct {
	registry *Registry
	procs    map[string]*exec.Cmd
	mu       sync.RWMutex
	logger   *slog.Logger
}

// NewServiceManager creates a new ServiceManager.
func NewServiceManager(registry *Registry, logger *slog.Logger) *ServiceManager {
	if logger == nil {
		logger = slog.Default()
	}
	return &ServiceManager{
		registry: registry,
		procs:    make(map[string]*exec.Cmd),
		logger:   logger,
	}
}

// StartApp starts all services for the given app.
func (m *ServiceManager) StartApp(ctx context.Context, appID string) error {
	record, err := m.registry.Get(appID)
	if err != nil {
		return fmt.Errorf("start app: %w", err)
	}

	for _, svc := range record.Manifest.Services {
		cmd := exec.CommandContext(ctx, svc.Binary, svc.Args...)
		if err := cmd.Start(); err != nil {
			// Clean up any already-started processes for this app.
			m.StopApp(appID)
			if err2 := m.registry.SetState(appID, AppError); err2 != nil {
				m.logger.Warn("failed to set app state to error", "app_id", appID, "error", err2)
			}
			return fmt.Errorf("start app %s service %s: %w", appID, svc.Name, err)
		}

		m.mu.Lock()
		m.procs[appID+"/"+svc.Name] = cmd
		m.mu.Unlock()

		m.logger.Info("app service started",
			"app_id", appID,
			"service", svc.Name,
			"pid", cmd.Process.Pid,
		)
	}

	if err := m.registry.SetState(appID, AppActive); err != nil {
		return fmt.Errorf("start app set state: %w", err)
	}

	return nil
}

// StopApp stops all running services for the given app.
func (m *ServiceManager) StopApp(appID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	var lastErr error
	for key, cmd := range m.procs {
		// Match keys that start with appID + "/".
		if len(key) > len(appID) && key[:len(appID)+1] == appID+"/" {
			if cmd.Process != nil {
				if err := cmd.Process.Kill(); err != nil {
					m.logger.Warn("failed to kill process",
						"app_id", appID,
						"key", key,
						"error", err,
					)
					lastErr = err
				}
			}
			delete(m.procs, key)
		}
	}

	if err := m.registry.SetState(appID, AppStopped); err != nil {
		return fmt.Errorf("stop app set state: %w", err)
	}

	return lastErr
}

// StopAll stops all running app services.
func (m *ServiceManager) StopAll(_ context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	var lastErr error
	for key, cmd := range m.procs {
		if cmd.Process != nil {
			if err := cmd.Process.Kill(); err != nil {
				m.logger.Warn("failed to kill process",
					"key", key,
					"error", err,
				)
				lastErr = err
			}
		}
		delete(m.procs, key)
	}

	return lastErr
}

// Status returns the current state of an app.
func (m *ServiceManager) Status(appID string) (AppState, error) {
	record, err := m.registry.Get(appID)
	if err != nil {
		return "", fmt.Errorf("status: %w", err)
	}
	return record.State, nil
}
