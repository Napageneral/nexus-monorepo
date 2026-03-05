// Package automations implements the Nexus hooks runtime, bundled automations,
// and automation seeding for first-boot initialization.
package automations

import (
	"context"
	"crypto/rand"
	"fmt"
	"log/slog"
	"sync"

	"github.com/Napageneral/nexus/internal/pipeline"
)

// HookHandler is the callback signature for hook handlers.
type HookHandler func(ctx context.Context, data HookData) error

// HookData carries information for a fired hook.
type HookData struct {
	Hookpoint string
	Request   *pipeline.NexusRequest
	Metadata  map[string]any
}

// registeredHook pairs a handler with its metadata.
type registeredHook struct {
	ID      string
	Name    string
	Handler HookHandler
	Source  string // "bundled", "workspace", "app"
}

// HooksRuntime manages hookpoint registrations and fires handlers.
type HooksRuntime struct {
	registry map[string][]registeredHook
	logger   *slog.Logger
	mu       sync.RWMutex
}

// NewHooksRuntime creates a new HooksRuntime.
func NewHooksRuntime(logger *slog.Logger) *HooksRuntime {
	if logger == nil {
		logger = slog.Default()
	}
	return &HooksRuntime{
		registry: make(map[string][]registeredHook),
		logger:   logger,
	}
}

// Register adds a handler for the given hookpoint and returns a unique hook ID.
func (h *HooksRuntime) Register(hookpoint, name, source string, handler HookHandler) string {
	h.mu.Lock()
	defer h.mu.Unlock()

	id := newHookID()
	h.registry[hookpoint] = append(h.registry[hookpoint], registeredHook{
		ID:      id,
		Name:    name,
		Handler: handler,
		Source:  source,
	})

	h.logger.Debug("hook registered",
		"hookpoint", hookpoint,
		"name", name,
		"source", source,
		"id", id,
	)

	return id
}

// Unregister removes a previously registered hook by ID.
func (h *HooksRuntime) Unregister(hookID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for hookpoint, hooks := range h.registry {
		for i, hook := range hooks {
			if hook.ID == hookID {
				h.registry[hookpoint] = append(hooks[:i], hooks[i+1:]...)
				h.logger.Debug("hook unregistered",
					"hookpoint", hookpoint,
					"name", hook.Name,
					"id", hookID,
				)
				return
			}
		}
	}
}

// Fire invokes all handlers registered for the given hookpoint.
// Errors from individual handlers are logged but do not stop execution;
// the first error encountered is returned.
func (h *HooksRuntime) Fire(ctx context.Context, hookpoint string, data HookData) error {
	h.mu.RLock()
	hooks := make([]registeredHook, len(h.registry[hookpoint]))
	copy(hooks, h.registry[hookpoint])
	h.mu.RUnlock()

	if len(hooks) == 0 {
		return nil
	}

	data.Hookpoint = hookpoint

	var firstErr error
	for _, hook := range hooks {
		if err := hook.Handler(ctx, data); err != nil {
			h.logger.Warn("hook handler error",
				"hookpoint", hookpoint,
				"name", hook.Name,
				"error", err,
			)
			if firstErr == nil {
				firstErr = err
			}
		}
	}
	return firstErr
}

// List returns a map of hookpoint -> handler names.
func (h *HooksRuntime) List() map[string][]string {
	h.mu.RLock()
	defer h.mu.RUnlock()

	result := make(map[string][]string, len(h.registry))
	for hookpoint, hooks := range h.registry {
		names := make([]string, len(hooks))
		for i, hook := range hooks {
			names[i] = hook.Name
		}
		result[hookpoint] = names
	}
	return result
}

// Count returns the total number of registered hooks across all hookpoints.
func (h *HooksRuntime) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	count := 0
	for _, hooks := range h.registry {
		count += len(hooks)
	}
	return count
}

// newHookID generates a random hook ID.
func newHookID() string {
	var buf [8]byte
	_, _ = rand.Read(buf[:])
	return fmt.Sprintf("hook-%x", buf)
}
