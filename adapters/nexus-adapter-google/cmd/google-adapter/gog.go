package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

// gogAuthListResponse is the JSON response from `gog auth list`.
type gogAuthListResponse struct {
	Accounts []struct {
		Email    string   `json:"email"`
		Services []string `json:"services,omitempty"`
	} `json:"accounts"`
}

// gogCommand returns the path to the gog CLI binary, configurable via env var.
func gogCommand() string {
	if v := strings.TrimSpace(os.Getenv("NEXUS_GOG_COMMAND")); v != "" {
		return v
	}
	return "gog"
}

// runGogJSON executes gog with --json output and returns the raw JSON bytes.
// If account is non-empty, passes --account flag.
func runGogJSON(ctx context.Context, account string, args ...string) ([]byte, error) {
	base := []string{"--json"}
	if trimmed := strings.TrimSpace(account); trimmed != "" {
		base = append(base, "--account", trimmed)
	}
	full := append(base, args...)

	cmd := exec.CommandContext(ctx, gogCommand(), full...)
	cmd.Env = os.Environ()

	out, err := cmd.Output()
	if err == nil {
		return out, nil
	}

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		stderr := strings.TrimSpace(string(exitErr.Stderr))
		if stderr == "" {
			stderr = "no stderr"
		}
		return nil, fmt.Errorf("gog %s failed: %s", strings.Join(args, " "), stderr)
	}
	return nil, err
}

func ensureGogRuntimeAuth(ctx context.Context, account string) error {
	account, err := nexadapter.RequireConnection(account)
	if err != nil {
		return err
	}

	runtimeContext, err := nexadapter.LoadRuntimeContextFromEnv()
	if err != nil || runtimeContext == nil || runtimeContext.Credential == nil {
		return nil
	}
	if strings.TrimSpace(runtimeContext.ConnectionID) != account {
		return nil
	}

	refreshToken := nexadapter.FirstNonBlank(
		nexadapter.FieldValue(runtimeContext.Credential.Fields, "refresh_token"),
		nexadapter.FieldValue(runtimeContext.Credential.Fields, "refreshToken"),
	)
	if refreshToken == "" {
		return nil
	}

	payload := map[string]any{
		"email":         account,
		"refresh_token": refreshToken,
	}
	if accessToken := nexadapter.FirstNonBlank(
		nexadapter.FieldValue(runtimeContext.Credential.Fields, "access_token"),
		nexadapter.FieldValue(runtimeContext.Credential.Fields, "accessToken"),
		runtimeContext.Credential.Value,
	); accessToken != "" {
		payload["access_token"] = accessToken
	}
	if expiresAt := nexadapter.FirstNonBlank(
		nexadapter.FieldValue(runtimeContext.Credential.Fields, "expires_at"),
		nexadapter.FieldValue(runtimeContext.Credential.Fields, "expiresAt"),
	); expiresAt != "" {
		payload["expires_at"] = expiresAt
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal gog token payload: %w", err)
	}

	tempDir, err := os.MkdirTemp("", "nexus-gog-token-*")
	if err != nil {
		return fmt.Errorf("create gog token temp dir: %w", err)
	}
	defer os.RemoveAll(tempDir)

	tokenPath := filepath.Join(tempDir, "token.json")
	if err := os.WriteFile(tokenPath, raw, 0o600); err != nil {
		return fmt.Errorf("write gog token file: %w", err)
	}

	cmd := exec.CommandContext(ctx, gogCommand(), "auth", "tokens", "import", tokenPath, "--force", "--json")
	cmd.Env = os.Environ()
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("gog auth tokens import failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

// containsService checks if a service list contains the target (case-insensitive).
func containsService(services []string, target string) bool {
	for _, service := range services {
		if strings.EqualFold(strings.TrimSpace(service), target) {
			return true
		}
	}
	return false
}

// resolveAccount discovers or normalizes an account for gog operations.
// If account is provided, normalizes and returns it.
// If empty, auto-discovers from gog auth list (filtering by service).
func resolveAccount(ctx context.Context, account string, service string) (string, error) {
	if runtimeContext, err := nexadapter.LoadRuntimeContextFromEnv(); err == nil && runtimeContext != nil {
		if strings.TrimSpace(runtimeContext.ConnectionID) != "" {
			account = runtimeContext.ConnectionID
		}
	}
	normalized := strings.ToLower(strings.TrimSpace(account))
	if normalized != "" {
		if err := ensureGogRuntimeAuth(ctx, normalized); err != nil {
			return "", err
		}
		return normalized, nil
	}
	list, err := discoverAccounts(ctx, service)
	if err != nil {
		return "", err
	}
	if len(list) == 0 {
		return "", fmt.Errorf("no gog accounts configured for %s; run `gog auth add <email> --services %s`", service, service)
	}
	return list[0].ID, nil
}

// discoverAccounts lists gog auth accounts filtered by a specific service.
func discoverAccounts(ctx context.Context, service string) ([]nexadapter.AdapterAccount, error) {
	out, err := runGogJSON(ctx, "", "auth", "list")
	if err != nil {
		return nil, err
	}

	var resp gogAuthListResponse
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, fmt.Errorf("parse gog auth list: %w", err)
	}

	result := make([]nexadapter.AdapterAccount, 0, len(resp.Accounts))
	for _, account := range resp.Accounts {
		email := strings.ToLower(strings.TrimSpace(account.Email))
		if email == "" {
			continue
		}
		if service != "" && len(account.Services) > 0 && !containsService(account.Services, service) {
			continue
		}
		result = append(result, nexadapter.AdapterAccount{
			ID:            email,
			DisplayName:   email,
			CredentialRef: fmt.Sprintf("google/%s", email),
			Status:        "ready",
		})
	}
	return result, nil
}
