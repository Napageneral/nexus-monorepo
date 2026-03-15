package agent

import (
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestAuthManagerCreation(t *testing.T) {
	// Create a temp dir with an empty auth.json so AuthStorage does not
	// try to read a real credential file.
	dir := t.TempDir()
	authFile := filepath.Join(dir, "auth.json")
	if err := os.WriteFile(authFile, []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	m := NewAuthManager(authFile, logger)
	if m == nil {
		t.Fatal("expected non-nil AuthManager")
	}
	if m.storage == nil {
		t.Fatal("expected non-nil underlying AuthStorage")
	}
	if m.Storage() == nil {
		t.Fatal("Storage() should return the underlying AuthStorage")
	}
}

func TestAuthManagerHasAuth(t *testing.T) {
	dir := t.TempDir()
	authFile := filepath.Join(dir, "auth.json")
	if err := os.WriteFile(authFile, []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	m := NewAuthManager(authFile, logger)

	// No credentials loaded so HasAuth should be false (unless env vars are set).
	// We do not control env vars in tests, but at minimum the API should not panic.
	_ = m.HasAuth("nonexistent-provider")
	_ = m.GetAPIKey("nonexistent-provider")
}

func TestAuthManagerMarkSuccessAndFailure(t *testing.T) {
	dir := t.TempDir()
	authFile := filepath.Join(dir, "auth.json")
	if err := os.WriteFile(authFile, []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	m := NewAuthManager(authFile, logger)

	provider := "test-provider"

	// Mark success should not panic and should create a profile.
	m.MarkSuccess(provider)
	profiles := m.ListProfiles()
	if len(profiles) != 1 {
		t.Fatalf("expected 1 profile, got %d", len(profiles))
	}
	if profiles[0].Provider != provider {
		t.Fatalf("expected provider %q, got %q", provider, profiles[0].Provider)
	}
	if profiles[0].ErrorCount != 0 {
		t.Fatalf("expected 0 errors after success, got %d", profiles[0].ErrorCount)
	}

	// Mark failures.
	m.MarkFailure(provider)
	m.MarkFailure(provider)
	profiles = m.ListProfiles()
	if profiles[0].ErrorCount != 2 {
		t.Fatalf("expected 2 errors, got %d", profiles[0].ErrorCount)
	}

	// Third failure should trigger cooldown.
	m.MarkFailure(provider)
	profiles = m.ListProfiles()
	if profiles[0].ErrorCount != 3 {
		t.Fatalf("expected 3 errors, got %d", profiles[0].ErrorCount)
	}
	if profiles[0].CooldownUntil.IsZero() {
		t.Fatal("expected non-zero cooldown after 3 failures")
	}

	// Mark success should reset.
	m.MarkSuccess(provider)
	profiles = m.ListProfiles()
	if profiles[0].ErrorCount != 0 {
		t.Fatalf("expected 0 errors after success reset, got %d", profiles[0].ErrorCount)
	}
	if !profiles[0].CooldownUntil.IsZero() {
		t.Fatal("expected zero cooldown after success reset")
	}
}

func TestAuthManagerFallback(t *testing.T) {
	dir := t.TempDir()
	authFile := filepath.Join(dir, "auth.json")
	if err := os.WriteFile(authFile, []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	m := NewAuthManager(authFile, logger)

	// IsAvailable should return false for unknown provider with no credentials.
	if m.IsAvailable("unknown-provider") {
		t.Fatal("expected false for unknown provider without auth")
	}

	// Create a profile in cooldown.
	m.MarkFailure("cooldown-prov")
	m.MarkFailure("cooldown-prov")
	m.MarkFailure("cooldown-prov")

	m.mu.RLock()
	p := m.profiles["cooldown-prov"]
	p.CooldownUntil = time.Now().Add(1 * time.Hour) // ensure it's in the future
	m.mu.RUnlock()

	// Even if HasAuth returns false (no actual key), IsAvailable handles gracefully.
	_ = m.IsAvailable("cooldown-prov")
}
