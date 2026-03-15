package nexadapter

import (
	"fmt"
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

type CredentialLookupOptions struct {
	Fields     []string
	Env        []string
	AllowValue bool
	Label      string
}

func ReadCredential(ctx AdapterRuntimeContext, options CredentialLookupOptions) string {
	if ctx.Runtime != nil && ctx.Runtime.Credential != nil {
		for _, field := range options.Fields {
			if value := strings.TrimSpace(ctx.Runtime.Credential.Fields[field]); value != "" {
				return value
			}
		}
		if options.AllowValue || (!options.AllowValue && len(options.Fields) == 0 && len(options.Env) == 0) {
			if value := strings.TrimSpace(ctx.Runtime.Credential.Value); value != "" {
				return value
			}
		}
	}
	for _, key := range options.Env {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}

func RequireCredential(ctx AdapterRuntimeContext, options CredentialLookupOptions) (string, error) {
	value := ReadCredential(ctx, options)
	if value != "" {
		return value, nil
	}

	label := strings.TrimSpace(options.Label)
	if label == "" {
		label = "credential"
	}
	sources := make([]string, 0, 3)
	if len(options.Fields) > 0 {
		sources = append(sources, fmt.Sprintf("runtime credential fields %v", options.Fields))
	}
	if options.AllowValue || (!options.AllowValue && len(options.Fields) == 0 && len(options.Env) == 0) {
		sources = append(sources, "runtime credential value")
	}
	if len(options.Env) > 0 {
		sources = append(sources, fmt.Sprintf("environment %v", options.Env))
	}
	if len(sources) == 0 {
		return "", fmt.Errorf("missing %s", label)
	}
	return "", fmt.Errorf("missing %s (looked in %s)", label, strings.Join(sources, ", "))
}
