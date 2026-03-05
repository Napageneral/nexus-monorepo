package nexadapter

import (
	"os"
	"strings"
)

// PlatformCredentialURL returns the platform credential service URL.
// Checks NEXUS_PLATFORM_CREDENTIAL_URL environment variable first,
// then falls back to the provided default.
func PlatformCredentialURL(defaultURL string) string {
	if v := strings.TrimSpace(os.Getenv("NEXUS_PLATFORM_CREDENTIAL_URL")); v != "" {
		return v
	}
	return defaultURL
}
