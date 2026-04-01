package main

import (
	"fmt"
	"os"
	"os/user"
	"strings"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

type eveSessionSurface struct {
	Hostname       string
	Username       string
	UID            string
	FullName       string
	Account        string
	AccountContact *nexadapter.ConnectionAccountContact
}

func currentSessionSurface() eveSessionSurface {
	identity := getSelfIdentity()
	account, accountContact := resolveSelfAccountProjection(identity)

	host, err := os.Hostname()
	if err != nil {
		host = ""
	}

	surface := eveSessionSurface{
		Hostname:       strings.TrimSpace(host),
		FullName:       strings.TrimSpace(identity.Name),
		Account:        account,
		AccountContact: accountContact,
	}

	if currentUser, err := user.Current(); err == nil && currentUser != nil {
		surface.Username = strings.TrimSpace(currentUser.Username)
		surface.UID = strings.TrimSpace(currentUser.Uid)
	}

	return surface
}

func defaultConnectionID() string {
	if trimmed := strings.TrimSpace(os.Getenv("EVE_CONNECTION_ID")); trimmed != "" {
		return trimmed
	}
	if trimmed := strings.TrimSpace(os.Getenv("EVE_EDGE_CONNECTION_ID")); trimmed != "" {
		return trimmed
	}
	return defaultConnectionIDFromSurface(currentSessionSurface())
}

func defaultDisplayName() string {
	if trimmed := strings.TrimSpace(os.Getenv("EVE_CONNECTION_DISPLAY_NAME")); trimmed != "" {
		return trimmed
	}
	if trimmed := strings.TrimSpace(os.Getenv("EVE_EDGE_DISPLAY_NAME")); trimmed != "" {
		return trimmed
	}
	return defaultDisplayNameFromSurface(currentSessionSurface())
}

func defaultConnectionIDFromSurface(surface eveSessionSurface) string {
	host := sanitizeConnectionSegment(surface.Hostname)
	username := sanitizeConnectionSegment(surface.Username)
	account := sanitizeConnectionSegment(surface.Account)
	uid := sanitizeConnectionSegment(surface.UID)

	switch {
	case host != "" && username != "":
		return fmt.Sprintf("eve-%s-%s", host, username)
	case host != "" && account != "":
		return fmt.Sprintf("eve-%s-%s", host, account)
	case host != "" && uid != "":
		return fmt.Sprintf("eve-%s-%s", host, uid)
	case host != "":
		return fmt.Sprintf("eve-%s", host)
	case username != "":
		return fmt.Sprintf("eve-%s", username)
	case account != "":
		return fmt.Sprintf("eve-%s", account)
	case uid != "":
		return fmt.Sprintf("eve-%s", uid)
	default:
		return "eve-local"
	}
}

func defaultDisplayNameFromSurface(surface eveSessionSurface) string {
	label := strings.TrimSpace(surface.FullName)
	if label == "" {
		label = strings.TrimSpace(surface.Username)
	}
	if label == "" && strings.TrimSpace(surface.Account) != "" && surface.Account != "default" {
		label = strings.TrimSpace(surface.Account)
	}

	host := strings.TrimSpace(surface.Hostname)
	switch {
	case label != "" && host != "":
		return fmt.Sprintf("%s on %s", label, host)
	case label != "":
		return label
	case host != "":
		return host
	default:
		return "Eve"
	}
}

func sessionDetailsFromSurface(surface eveSessionSurface) map[string]any {
	details := map[string]any{}
	if host := strings.TrimSpace(surface.Hostname); host != "" {
		details["session_host"] = host
	}
	if username := strings.TrimSpace(surface.Username); username != "" {
		details["session_user"] = username
	}
	if uid := strings.TrimSpace(surface.UID); uid != "" {
		details["session_uid"] = uid
	}
	if fullName := strings.TrimSpace(surface.FullName); fullName != "" {
		details["session_full_name"] = fullName
	}
	return details
}

func mergeSessionDetails(details map[string]any, surface eveSessionSurface) map[string]any {
	out := map[string]any{}
	for key, value := range details {
		out[key] = value
	}
	for key, value := range sessionDetailsFromSurface(surface) {
		if _, exists := out[key]; !exists {
			out[key] = value
		}
	}
	return out
}

func sanitizeConnectionSegment(value string) string {
	trimmed := strings.ToLower(strings.TrimSpace(value))
	if trimmed == "" {
		return ""
	}

	var builder strings.Builder
	lastDash := false
	for _, r := range trimmed {
		isLetter := r >= 'a' && r <= 'z'
		isDigit := r >= '0' && r <= '9'
		if isLetter || isDigit {
			builder.WriteRune(r)
			lastDash = false
			continue
		}
		if builder.Len() == 0 || lastDash {
			continue
		}
		builder.WriteByte('-')
		lastDash = true
	}

	return strings.Trim(builder.String(), "-")
}
