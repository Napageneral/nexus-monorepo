package nexadapter

import (
	"os"
	"testing"
)

func TestPlatformCredentialURL(t *testing.T) {
	const defaultURL = "https://hub.glowbot.com/api/platform-credentials"

	t.Run("returns default when env not set", func(t *testing.T) {
		os.Unsetenv("NEXUS_PLATFORM_CREDENTIAL_URL")
		got := PlatformCredentialURL(defaultURL)
		if got != defaultURL {
			t.Errorf("PlatformCredentialURL() = %q, want %q", got, defaultURL)
		}
	})

	t.Run("returns env var when set", func(t *testing.T) {
		override := "https://custom.example.com/creds"
		os.Setenv("NEXUS_PLATFORM_CREDENTIAL_URL", override)
		defer os.Unsetenv("NEXUS_PLATFORM_CREDENTIAL_URL")

		got := PlatformCredentialURL(defaultURL)
		if got != override {
			t.Errorf("PlatformCredentialURL() = %q, want %q", got, override)
		}
	})

	t.Run("ignores whitespace-only env var", func(t *testing.T) {
		os.Setenv("NEXUS_PLATFORM_CREDENTIAL_URL", "   ")
		defer os.Unsetenv("NEXUS_PLATFORM_CREDENTIAL_URL")

		got := PlatformCredentialURL(defaultURL)
		if got != defaultURL {
			t.Errorf("whitespace-only env var should fall back to default")
		}
	})
}
