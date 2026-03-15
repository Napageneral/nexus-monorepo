package agent

import (
	"log/slog"

	gcaconfig "github.com/badlogic/pi-mono/go-coding-agent/pkg/config"
	gcatypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"

	"github.com/Napageneral/nexus/internal/config"
)

// ModelManager wraps go-coding-agent's ModelRegistry, adding Nexus-specific
// resolution logic (per-agent defaults, config-driven fallbacks).
type ModelManager struct {
	registry *gcaconfig.ModelRegistry
	config   *config.Config
	authMgr  *AuthManager
	logger   *slog.Logger
}

// NewModelManager creates a ModelManager backed by go-coding-agent's model
// registry. The registry reads from the standard models.json on disk and
// merges any custom providers configured in the Nexus config.
func NewModelManager(authMgr *AuthManager, cfg *config.Config, logger *slog.Logger) *ModelManager {
	if logger == nil {
		logger = slog.Default()
	}
	var storage *gcaconfig.AuthStorage
	if authMgr != nil {
		storage = authMgr.Storage()
	}
	registry := gcaconfig.NewModelRegistry(storage, "")
	return &ModelManager{
		registry: registry,
		config:   cfg,
		authMgr:  authMgr,
		logger:   logger,
	}
}

// Resolve resolves a provider + model ID to a fully populated Model.
// Empty provider/modelID falls through to the Nexus config defaults, then
// to go-coding-agent's built-in defaults (anthropic/claude-opus-4-6).
func (m *ModelManager) Resolve(provider, modelID string) (gcatypes.Model, error) {
	if provider == "" && modelID == "" && m.config != nil {
		provider = ""
		modelID = m.config.Agents.Defaults.Model.Primary
	}
	return m.registry.ResolveModel(provider, modelID)
}

// ListAvailable returns all models for which the user has valid credentials.
func (m *ModelManager) ListAvailable() []gcatypes.Model {
	return m.registry.GetAvailable()
}

// ListAll returns every registered model regardless of auth status.
func (m *ModelManager) ListAll() []gcatypes.Model {
	return m.registry.GetAll()
}

// DefaultModel returns the default model (anthropic primary by default,
// or the one specified in the Nexus config).
func (m *ModelManager) DefaultModel() gcatypes.Model {
	model, err := m.Resolve("", "")
	if err != nil {
		// Last resort: return an empty model struct.
		m.logger.Warn("could not resolve default model", "error", err)
		return gcatypes.Model{}
	}
	return model
}

// Registry returns the underlying go-coding-agent ModelRegistry.
func (m *ModelManager) Registry() *gcaconfig.ModelRegistry {
	return m.registry
}
