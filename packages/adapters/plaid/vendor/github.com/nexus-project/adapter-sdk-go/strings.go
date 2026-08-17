package nexadapter

import (
	"fmt"
	"strings"
	"unicode"
)

// SafeIDToken converts a raw string to a safe identifier token for use in
// colon-delimited event IDs. Unlike the legacy sanitizeToken, this preserves
// case — Google Place IDs and other case-sensitive identifiers remain intact.
//
// Behavior:
//   - Preserves: letters (any case), digits, '-', '_', '.', '@'
//   - Replaces: spaces, colons, control chars, and other special chars with '-'
//   - Trims leading/trailing hyphens, underscores, dots
//   - Returns "na" for empty or whitespace-only input
func SafeIDToken(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "na"
	}

	var b strings.Builder
	b.Grow(len(trimmed))
	for _, ch := range trimmed {
		switch {
		case ch >= 'a' && ch <= 'z':
			b.WriteRune(ch)
		case ch >= 'A' && ch <= 'Z':
			b.WriteRune(ch)
		case ch >= '0' && ch <= '9':
			b.WriteRune(ch)
		case ch == '-', ch == '_', ch == '.', ch == '@':
			b.WriteRune(ch)
		case unicode.IsControl(ch):
			b.WriteByte('-')
		default:
			// Replace spaces, colons, and other chars that break colon-delimited IDs
			b.WriteByte('-')
		}
	}

	token := strings.Trim(b.String(), "-._")
	if token == "" {
		return "na"
	}
	return token
}

// FirstNonBlank returns the first non-empty trimmed string from a variadic list.
// Returns "" if all values are blank.
func FirstNonBlank(values ...string) string {
	for _, v := range values {
		if trimmed := strings.TrimSpace(v); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

// FieldValue safely extracts a trimmed string value from a credential field map.
// Returns "" if fields is nil or the key is missing.
func FieldValue(fields map[string]string, key string) string {
	if fields == nil {
		return ""
	}
	return strings.TrimSpace(fields[key])
}

// RequireConnection normalizes a runtime connection string (trims whitespace)
// and returns an error if it resolves to empty. Missing connection identifiers
// are a configuration error that should fail loudly so broken setups are caught
// immediately.
func RequireConnection(connectionID string) (string, error) {
	normalized := strings.TrimSpace(connectionID)
	if normalized == "" {
		return "", fmt.Errorf("connection is required but was empty (check adapter credentials and --connection flag)")
	}
	return normalized, nil
}
