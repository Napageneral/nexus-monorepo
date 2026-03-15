package agent

import (
	"log/slog"
	"os"
	"path/filepath"
	"testing"
)

func newTestAuthManager(t *testing.T) *AuthManager {
	t.Helper()
	dir := t.TempDir()
	authFile := filepath.Join(dir, "auth.json")
	if err := os.WriteFile(authFile, []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	return NewAuthManager(authFile, logger)
}

func TestModelManagerResolve(t *testing.T) {
	authMgr := newTestAuthManager(t)
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	cfg := defaultTestConfig()

	mm := NewModelManager(authMgr, cfg, logger)
	if mm == nil {
		t.Fatal("expected non-nil ModelManager")
	}

	// Resolve the default (anthropic / claude-opus-4-6).
	model, err := mm.Resolve("", "")
	if err != nil {
		t.Fatalf("Resolve default: %v", err)
	}
	if model.Provider != "anthropic" {
		t.Fatalf("expected provider anthropic, got %q", model.Provider)
	}

	// Resolve by explicit provider.
	model2, err := mm.Resolve("anthropic", "")
	if err != nil {
		t.Fatalf("Resolve anthropic: %v", err)
	}
	if model2.Provider != "anthropic" {
		t.Fatalf("expected anthropic, got %q", model2.Provider)
	}

	// Resolve non-existent should fail.
	_, err = mm.Resolve("nonexistent-provider-xyz", "no-such-model-abc")
	if err == nil {
		t.Fatal("expected error for nonexistent provider+model")
	}
}

func TestModelManagerList(t *testing.T) {
	authMgr := newTestAuthManager(t)
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	cfg := defaultTestConfig()

	mm := NewModelManager(authMgr, cfg, logger)

	all := mm.ListAll()
	if len(all) == 0 {
		t.Fatal("expected at least one built-in model")
	}

	// Available may be empty (no real API keys) but should not panic.
	_ = mm.ListAvailable()
}

func TestModelManagerDefault(t *testing.T) {
	authMgr := newTestAuthManager(t)
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	cfg := defaultTestConfig()

	mm := NewModelManager(authMgr, cfg, logger)
	model := mm.DefaultModel()
	if model.Provider != "anthropic" {
		t.Fatalf("expected default provider anthropic, got %q", model.Provider)
	}
}
