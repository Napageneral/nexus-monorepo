// Package agent wraps go-coding-agent's Runtime for Nexus-specific usage,
// managing auth, model selection, system prompt, skills, and tool assembly.
package agent

import (
	"log/slog"
	"sync"
	"time"

	gcaconfig "github.com/badlogic/pi-mono/go-coding-agent/pkg/config"
)

// AuthManager wraps go-coding-agent's AuthStorage for Nexus, adding
// per-provider health tracking (success/failure counts, cooldowns) and
// profile enumeration.
type AuthManager struct {
	storage  *gcaconfig.AuthStorage
	profiles map[string]*AuthProfile
	mu       sync.RWMutex
	logger   *slog.Logger
}

// AuthProfile describes a single authentication credential and its health.
type AuthProfile struct {
	ID            string    `json:"id"`
	Provider      string    `json:"provider"`
	Type          string    `json:"type"` // "api_key", "oauth", "external_cli"
	LastUsed      time.Time `json:"last_used"`
	ErrorCount    int       `json:"error_count"`
	CooldownUntil time.Time `json:"cooldown_until"`
}

// NewAuthManager creates an AuthManager backed by go-coding-agent's AuthStorage
// rooted at credDir. If credDir is empty, the default go-coding-agent auth path
// is used.
func NewAuthManager(credDir string, logger *slog.Logger) *AuthManager {
	if logger == nil {
		logger = slog.Default()
	}
	storage := gcaconfig.NewAuthStorage(credDir)
	return &AuthManager{
		storage:  storage,
		profiles: make(map[string]*AuthProfile),
		logger:   logger,
	}
}

// Storage returns the underlying go-coding-agent AuthStorage.
func (m *AuthManager) Storage() *gcaconfig.AuthStorage {
	return m.storage
}

// GetAPIKey returns the API key for the given provider, delegating to
// go-coding-agent's AuthStorage resolution (env vars, file, overrides).
func (m *AuthManager) GetAPIKey(provider string) string {
	return m.storage.GetAPIKey(provider)
}

// HasAuth reports whether credentials exist for the given provider.
func (m *AuthManager) HasAuth(provider string) bool {
	return m.storage.HasAuth(provider)
}

// MarkSuccess records a successful API call for the given provider,
// resetting its error count and cooldown.
func (m *AuthManager) MarkSuccess(provider string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p := m.getOrCreateProfile(provider)
	p.LastUsed = time.Now()
	p.ErrorCount = 0
	p.CooldownUntil = time.Time{}
}

// MarkFailure records a failed API call for the given provider.
// After 3 consecutive failures the provider enters a 60-second cooldown.
func (m *AuthManager) MarkFailure(provider string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p := m.getOrCreateProfile(provider)
	p.ErrorCount++
	p.LastUsed = time.Now()
	if p.ErrorCount >= 3 {
		p.CooldownUntil = time.Now().Add(60 * time.Second)
		m.logger.Warn("provider entered cooldown",
			"provider", provider,
			"errors", p.ErrorCount,
			"cooldown_until", p.CooldownUntil)
	}
}

// IsAvailable reports whether a provider has auth and is not in cooldown.
func (m *AuthManager) IsAvailable(provider string) bool {
	if !m.HasAuth(provider) {
		return false
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	p, ok := m.profiles[provider]
	if !ok {
		return true
	}
	return time.Now().After(p.CooldownUntil)
}

// ListProfiles returns a snapshot of all tracked provider profiles.
func (m *AuthManager) ListProfiles() []AuthProfile {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]AuthProfile, 0, len(m.profiles))
	for _, p := range m.profiles {
		cp := *p
		out = append(out, cp)
	}
	return out
}

// getOrCreateProfile returns the profile for a provider, creating one if needed.
// Caller must hold m.mu.
func (m *AuthManager) getOrCreateProfile(provider string) *AuthProfile {
	p, ok := m.profiles[provider]
	if !ok {
		p = &AuthProfile{
			ID:       provider,
			Provider: provider,
			Type:     "api_key",
		}
		m.profiles[provider] = p
	}
	return p
}
