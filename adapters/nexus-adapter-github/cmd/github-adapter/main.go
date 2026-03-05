package main

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName          = "github-adapter"
	adapterVersion       = "0.1.0"
	platformID           = "github"
	defaultGitHubAPIBase = "https://api.github.com"
)

type githubInstallTokenResponse struct {
	Token               string            `json:"token"`
	ExpiresAt           string            `json:"expires_at"`
	RepositorySelection string            `json:"repository_selection"`
	Permissions         map[string]string `json:"permissions"`
}

type githubTokenMintInput struct {
	AppID          int64
	InstallationID int64
	PrivateKeyPEM  string
	APIBaseURL     string
}

func main() {
	nexadapter.Run(nexadapter.Adapter{
		Operations: nexadapter.AdapterOperations{
			AdapterInfo:         info,
			AdapterHealth:       health,
			AdapterAccountsList: accounts,
			AdapterSetupStart:   setupStart,
			AdapterSetupSubmit:  setupSubmit,
			AdapterSetupStatus:  setupStatus,
			AdapterSetupCancel:  setupCancel,
		},
	})
}

func info(_ context.Context) (*nexadapter.AdapterInfo, error) {
	return &nexadapter.AdapterInfo{
		Platform: platformID,
		Name:     adapterName,
		Version:  adapterVersion,
		Operations: []nexadapter.AdapterOperation{
			nexadapter.OpAdapterInfo,
			nexadapter.OpAdapterHealth,
			nexadapter.OpAdapterAccountsList,
			nexadapter.OpAdapterSetupStart,
			nexadapter.OpAdapterSetupSubmit,
			nexadapter.OpAdapterSetupStatus,
			nexadapter.OpAdapterSetupCancel,
		},
		CredentialService: "github",
		MultiAccount:      true,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					Type:    "custom_flow",
					Label:   "Connect GitHub App Installation",
					Icon:    "github",
					Service: "github",
					Fields:  githubSetupFields(),
				},
			},
			SetupGuide: "Provide GitHub App ID, installation ID, and private key PEM. Adapter validates token mint before connecting.",
		},
		PlatformCapabilities: nexadapter.ChannelCapabilities{
			TextLimit:             20000,
			SupportsMarkdown:      true,
			MarkdownFlavor:        "standard",
			SupportsTables:        false,
			SupportsCodeBlocks:    true,
			SupportsEmbeds:        false,
			SupportsThreads:       true,
			SupportsReactions:     false,
			SupportsPolls:         false,
			SupportsButtons:       false,
			SupportsEdit:          false,
			SupportsDelete:        false,
			SupportsMedia:         false,
			SupportsVoiceNotes:    false,
			SupportsStreamingEdit: false,
		},
	}, nil
}

func accounts(_ context.Context) ([]nexadapter.AdapterAccount, error) {
	return []nexadapter.AdapterAccount{
		{
			ID:            "default",
			DisplayName:   "default",
			CredentialRef: "github/default",
			Status:        "ready",
		},
	}, nil
}

func health(ctx context.Context, account string) (*nexadapter.AdapterHealth, error) {
	resolvedAccount := setupAccountOrDefault(account, "")
	runtimeContext, err := nexadapter.LoadRuntimeContextFromEnv()
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   resolvedAccount,
			Error:     err.Error(),
		}, nil
	}
	if runtimeContext.Credential == nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   resolvedAccount,
			Error:     "missing runtime credential for github adapter",
		}, nil
	}

	fields := runtimeContext.Credential.Fields
	appID, err := parsePositiveInt64(firstNonBlank(fields["app_id"], fields["appId"]))
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   resolvedAccount,
			Error:     fmt.Sprintf("invalid app_id: %v", err),
		}, nil
	}
	installationID, err := parsePositiveInt64(firstNonBlank(fields["installation_id"], fields["installationId"]))
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   resolvedAccount,
			Error:     fmt.Sprintf("invalid installation_id: %v", err),
		}, nil
	}
	privateKeyPEM := normalizePrivateKey(firstNonBlank(fields["private_key_pem"], fields["privateKeyPem"]))
	if privateKeyPEM == "" {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   resolvedAccount,
			Error:     "missing private_key_pem",
		}, nil
	}

	apiBaseURL := normalizeGitHubAPIBaseURL(firstNonBlank(fields["api_base_url"], fields["apiBaseUrl"]))
	tokenResp, err := mintInstallationToken(ctx, githubTokenMintInput{
		AppID:          appID,
		InstallationID: installationID,
		PrivateKeyPEM:  privateKeyPEM,
		APIBaseURL:     apiBaseURL,
	})
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   resolvedAccount,
			Error:     err.Error(),
		}, nil
	}

	return &nexadapter.AdapterHealth{
		Connected:   true,
		Account:     resolvedAccount,
		LastEventAt: time.Now().UnixMilli(),
		Details: map[string]any{
			"app_id":               strconv.FormatInt(appID, 10),
			"installation_id":      strconv.FormatInt(installationID, 10),
			"installation_account": firstNonBlank(fields["installation_account_login"], fields["installationAccountLogin"]),
			"api_base_url":         apiBaseURL,
			"token_expires_at":     tokenResp.ExpiresAt,
			"repository_selection": tokenResp.RepositorySelection,
		},
	}, nil
}

func setupStart(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusRequiresInput,
		SessionID:    setupSessionIDOrDefault(req.SessionID),
		Account:      setupAccountOrDefault(req.Account, payloadString(req.Payload, "account")),
		Service:      "github",
		Message:      "Provide GitHub App install credentials.",
		Instructions: "Enter app_id, installation_id, and private_key_pem. Optional: account label and api_base_url.",
		Fields:       githubSetupFields(),
	}, nil
}

func setupSubmit(ctx context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	sessionID := setupSessionIDOrDefault(req.SessionID)
	appIDRaw := payloadString(req.Payload, "app_id")
	installationIDRaw := payloadString(req.Payload, "installation_id")
	privateKeyRaw := payloadString(req.Payload, "private_key_pem")
	accountLabel := payloadString(req.Payload, "account")
	installationAccountLogin := payloadString(req.Payload, "installation_account_login")
	apiBaseURL := normalizeGitHubAPIBaseURL(payloadString(req.Payload, "api_base_url"))

	missing := missingRequiredFields(map[string]string{
		"app_id":          appIDRaw,
		"installation_id": installationIDRaw,
		"private_key_pem": privateKeyRaw,
	})
	if len(missing) > 0 {
		return &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusRequiresInput,
			SessionID:    sessionID,
			Account:      setupAccountOrDefault(req.Account, accountLabel),
			Service:      "github",
			Message:      fmt.Sprintf("Missing required fields: %s", strings.Join(missing, ", ")),
			Instructions: "Fill required fields and submit again.",
			Fields:       githubSetupFields(),
		}, nil
	}

	appID, err := parsePositiveInt64(appIDRaw)
	if err != nil {
		return setupValidationErrorResult(sessionID, req, accountLabel, fmt.Sprintf("invalid app_id: %v", err)), nil
	}
	installationID, err := parsePositiveInt64(installationIDRaw)
	if err != nil {
		return setupValidationErrorResult(sessionID, req, accountLabel, fmt.Sprintf("invalid installation_id: %v", err)), nil
	}
	privateKeyPEM := normalizePrivateKey(privateKeyRaw)
	if _, err := parseRSAPrivateKey(privateKeyPEM); err != nil {
		return setupValidationErrorResult(sessionID, req, accountLabel, fmt.Sprintf("invalid private_key_pem: %v", err)), nil
	}

	tokenResp, err := mintInstallationToken(ctx, githubTokenMintInput{
		AppID:          appID,
		InstallationID: installationID,
		PrivateKeyPEM:  privateKeyPEM,
		APIBaseURL:     apiBaseURL,
	})
	if err != nil {
		return &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusRequiresInput,
			SessionID:    sessionID,
			Account:      setupAccountOrDefault(req.Account, accountLabel),
			Service:      "github",
			Message:      fmt.Sprintf("GitHub token mint failed: %v", err),
			Instructions: "Verify app_id, installation_id, and private key, then submit again.",
			Fields:       githubSetupFields(),
		}, nil
	}

	resolvedAccount := setupAccountOrDefault(req.Account, firstNonBlank(accountLabel, fmt.Sprintf("installation-%d", installationID)))
	secretFields := map[string]string{
		"app_id":          strconv.FormatInt(appID, 10),
		"installation_id": strconv.FormatInt(installationID, 10),
		"private_key_pem": privateKeyPEM,
		"api_base_url":    apiBaseURL,
	}
	if installationAccountLogin != "" {
		secretFields["installation_account_login"] = installationAccountLogin
	}

	return &nexadapter.AdapterSetupResult{
		Status:    nexadapter.SetupStatusCompleted,
		SessionID: sessionID,
		Account:   resolvedAccount,
		Service:   "github",
		Message:   "GitHub App installation connected.",
		SecretFields: map[string]string{
			"app_id":          secretFields["app_id"],
			"installation_id": secretFields["installation_id"],
			"private_key_pem": secretFields["private_key_pem"],
			"api_base_url":    secretFields["api_base_url"],
			"installation_account_login": firstNonBlank(
				secretFields["installation_account_login"],
			),
		},
		Metadata: map[string]any{
			"token_expires_at":     tokenResp.ExpiresAt,
			"repository_selection": tokenResp.RepositorySelection,
		},
	}, nil
}

func setupStatus(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusRequiresInput,
		SessionID:    setupSessionIDOrDefault(req.SessionID),
		Account:      setupAccountOrDefault(req.Account, payloadString(req.Payload, "account")),
		Service:      "github",
		Message:      "Awaiting setup submission.",
		Instructions: "Submit required GitHub App installation fields to complete setup.",
		Fields:       githubSetupFields(),
	}, nil
}

func setupCancel(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return &nexadapter.AdapterSetupResult{
		Status:    nexadapter.SetupStatusCancelled,
		SessionID: setupSessionIDOrDefault(req.SessionID),
		Account:   setupAccountOrDefault(req.Account, payloadString(req.Payload, "account")),
		Service:   "github",
		Message:   "Setup cancelled.",
	}, nil
}

func githubSetupFields() []nexadapter.AdapterAuthField {
	return []nexadapter.AdapterAuthField{
		{
			Name:        "app_id",
			Label:       "GitHub App ID",
			Type:        "text",
			Required:    true,
			Placeholder: "123456",
		},
		{
			Name:        "installation_id",
			Label:       "Installation ID",
			Type:        "text",
			Required:    true,
			Placeholder: "9876543",
		},
		{
			Name:        "private_key_pem",
			Label:       "Private Key PEM",
			Type:        "secret",
			Required:    true,
			Placeholder: "-----BEGIN RSA PRIVATE KEY-----",
		},
		{
			Name:        "account",
			Label:       "Runtime Account Label",
			Type:        "text",
			Required:    false,
			Placeholder: "installation-9876543",
		},
		{
			Name:        "installation_account_login",
			Label:       "Installation Account Login",
			Type:        "text",
			Required:    false,
			Placeholder: "acme",
		},
		{
			Name:        "api_base_url",
			Label:       "GitHub API Base URL",
			Type:        "text",
			Required:    false,
			Placeholder: defaultGitHubAPIBase,
		},
	}
}

func setupSessionIDOrDefault(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed != "" {
		return trimmed
	}
	return fmt.Sprintf("github-setup-%d", time.Now().UnixNano())
}

func setupAccountOrDefault(raw string, fallback string) string {
	resolved := strings.ToLower(strings.TrimSpace(raw))
	if resolved == "" {
		resolved = strings.ToLower(strings.TrimSpace(fallback))
	}
	if resolved == "" {
		return "default"
	}
	return resolved
}

func payloadString(payload map[string]any, key string) string {
	if payload == nil {
		return ""
	}
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	if value, ok := raw.(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}

func missingRequiredFields(fields map[string]string) []string {
	missing := make([]string, 0, len(fields))
	for key, value := range fields {
		if strings.TrimSpace(value) == "" {
			missing = append(missing, key)
		}
	}
	if len(missing) <= 1 {
		return missing
	}
	for i := 0; i < len(missing)-1; i++ {
		for j := i + 1; j < len(missing); j++ {
			if missing[j] < missing[i] {
				missing[i], missing[j] = missing[j], missing[i]
			}
		}
	}
	return missing
}

func setupValidationErrorResult(sessionID string, req nexadapter.AdapterSetupRequest, accountLabel string, message string) *nexadapter.AdapterSetupResult {
	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusRequiresInput,
		SessionID:    sessionID,
		Account:      setupAccountOrDefault(req.Account, accountLabel),
		Service:      "github",
		Message:      message,
		Instructions: "Fix field values and submit again.",
		Fields:       githubSetupFields(),
	}
}

func parsePositiveInt64(raw string) (int64, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return 0, fmt.Errorf("value is required")
	}
	value, err := strconv.ParseInt(trimmed, 10, 64)
	if err != nil {
		return 0, err
	}
	if value <= 0 {
		return 0, fmt.Errorf("must be > 0")
	}
	return value, nil
}

func normalizePrivateKey(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	trimmed = strings.ReplaceAll(trimmed, "\\r", "")
	trimmed = strings.ReplaceAll(trimmed, "\\n", "\n")
	if !strings.HasSuffix(trimmed, "\n") {
		trimmed += "\n"
	}
	return trimmed
}

func parseRSAPrivateKey(rawPEM string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(rawPEM))
	if block == nil {
		return nil, fmt.Errorf("invalid PEM block")
	}

	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}

	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}
	key, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("private key must be RSA")
	}
	return key, nil
}

func buildGitHubAppJWT(appID int64, privateKeyPEM string, now time.Time) (string, error) {
	privateKey, err := parseRSAPrivateKey(privateKeyPEM)
	if err != nil {
		return "", err
	}

	headerJSON, _ := json.Marshal(map[string]any{
		"alg": "RS256",
		"typ": "JWT",
	})
	payloadJSON, _ := json.Marshal(map[string]any{
		"iat": now.UTC().Add(-60 * time.Second).Unix(),
		"exp": now.UTC().Add(9 * time.Minute).Unix(),
		"iss": strconv.FormatInt(appID, 10),
	})

	head := base64.RawURLEncoding.EncodeToString(headerJSON)
	payload := base64.RawURLEncoding.EncodeToString(payloadJSON)
	signingInput := head + "." + payload

	hash := sha256.Sum256([]byte(signingInput))
	sig, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, hash[:])
	if err != nil {
		return "", err
	}
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(sig), nil
}

func normalizeGitHubAPIBaseURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return defaultGitHubAPIBase
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return defaultGitHubAPIBase
	}
	return strings.TrimRight(parsed.String(), "/")
}

func mintInstallationToken(ctx context.Context, input githubTokenMintInput) (*githubInstallTokenResponse, error) {
	jwt, err := buildGitHubAppJWT(input.AppID, input.PrivateKeyPEM, time.Now().UTC())
	if err != nil {
		return nil, fmt.Errorf("build github app jwt: %w", err)
	}

	tokenURL := fmt.Sprintf("%s/app/installations/%d/access_tokens", strings.TrimRight(input.APIBaseURL, "/"), input.InstallationID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader("{}"))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+jwt)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var payload githubInstallTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode token response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("github token mint failed with http %d", resp.StatusCode)
	}
	if strings.TrimSpace(payload.Token) == "" {
		return nil, fmt.Errorf("github token response missing token")
	}
	return &payload, nil
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}
