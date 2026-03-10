package main

import (
	"context"
	"crypto"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/Napageneral/spike/internal/control"
	"github.com/Napageneral/spike/internal/spikedb"
)

const defaultGitHubAPIBaseURL = "https://api.github.com"

const (
	spikeManagedGitHubConnectionProfileID  = "spike-managed-github-app"
	spikeBringYourOwnGitHubAppConnectionID = "bring-your-own-github-app"
	spikePersonalAccessTokenConnectionID   = "personal-access-token"
)

type githubConnectorSecret struct {
	Service                  string
	Account                  string
	AuthID                   string
	AppID                    int64
	InstallationID           int64
	PrivateKeyPEM            string
	APIBaseURL               string
	InstallationAccountLogin string
}

type githubInstallationToken struct {
	Token               string `json:"token"`
	ExpiresAt           string `json:"expires_at"`
	RepositorySelection string `json:"repository_selection"`
}

type githubRepositoryMetadata struct {
	FullName      string `json:"full_name"`
	CloneURL      string `json:"clone_url"`
	DefaultBranch string `json:"default_branch"`
}

type githubInstallationMetadata struct {
	ID      int64 `json:"id"`
	Account struct {
		Login string `json:"login"`
	} `json:"account"`
}

type githubInstallationRepositoriesPayload struct {
	Repositories []githubRepositoryMetadata `json:"repositories"`
}

type githubBranchMetadata struct {
	Name   string `json:"name"`
	Commit struct {
		SHA string `json:"sha"`
	} `json:"commit"`
}

type githubCommitMetadata struct {
	SHA     string `json:"sha"`
	HTMLURL string `json:"html_url"`
	Commit  struct {
		Message string `json:"message"`
		Author  struct {
			Date string `json:"date"`
		} `json:"author"`
	} `json:"commit"`
}

type githubInstallStatePayload struct {
	IssuedAt            int64  `json:"issued_at"`
	Nonce               string `json:"nonce"`
	ConnectionProfileID string `json:"connectionProfileId,omitempty"`
}

func (s *oracleServer) githubAppReady() bool {
	if s == nil {
		return false
	}
	return strings.TrimSpace(s.githubAppSlug) != "" &&
		s.githubAppID > 0 &&
		strings.TrimSpace(s.githubAppPrivateKey) != "" &&
		strings.TrimSpace(s.githubInstallSecret) != ""
}

func (s *oracleServer) configuredGitHubAPIBaseURL() string {
	if s == nil {
		return defaultGitHubAPIBaseURL
	}
	return normalizeGitHubAPIBaseURL(s.githubAppAPIBaseURL)
}

func (s *oracleServer) resolveGitHubInstallationSecret(installationID int64) (githubConnectorSecret, error) {
	if s == nil {
		return githubConnectorSecret{}, fmt.Errorf("server is not configured")
	}
	if s.connectorStateDir == "" {
		return githubConnectorSecret{}, fmt.Errorf("connector state dir is not configured")
	}
	secretPath := filepath.Join(
		s.connectorStateDir,
		"credentials",
		"github",
		"installations",
		strconv.FormatInt(installationID, 10),
		"secret.json",
	)
	raw, err := os.ReadFile(secretPath)
	if err != nil {
		return githubConnectorSecret{}, fmt.Errorf("read installation secret %s: %w", secretPath, err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return githubConnectorSecret{}, fmt.Errorf("parse installation secret %s: %w", secretPath, err)
	}

	appID, err := parsePositiveInt64Secret(secretFieldString(decoded, "app_id"))
	if err != nil {
		return githubConnectorSecret{}, fmt.Errorf("invalid app_id in installation secret: %w", err)
	}
	privateKey := normalizePrivateKeyPEM(secretFieldString(decoded, "private_key_pem"))
	if privateKey == "" {
		return githubConnectorSecret{}, fmt.Errorf("missing private_key_pem in installation secret")
	}
	if _, err := parseRSAPrivateKeyPEM(privateKey); err != nil {
		return githubConnectorSecret{}, fmt.Errorf("invalid private_key_pem in installation secret: %w", err)
	}

	apiBaseURL := normalizeGitHubAPIBaseURL(secretFieldString(decoded, "api_base_url"))
	return githubConnectorSecret{
		Service:                  "github",
		Account:                  fmt.Sprintf("installation-%d", installationID),
		AuthID:                   "custom",
		AppID:                    appID,
		InstallationID:           installationID,
		PrivateKeyPEM:            privateKey,
		APIBaseURL:               apiBaseURL,
		InstallationAccountLogin: secretFieldString(decoded, "installation_account_login"),
	}, nil
}

func (s *oracleServer) upsertGitHubInstallation(
	installationID int64,
	metadata githubInstallationMetadata,
	secret githubConnectorSecret,
) (string, error) {
	if s == nil || s.spikeStore == nil {
		return "", fmt.Errorf("spike store is not configured")
	}
	if s.connectorStateDir == "" {
		return "", fmt.Errorf("connector state dir is not configured")
	}
	if installationID <= 0 {
		return "", fmt.Errorf("installation_id must be a positive integer")
	}
	apiBaseURL := normalizeGitHubAPIBaseURL(secret.APIBaseURL)
	privateKey := normalizePrivateKeyPEM(secret.PrivateKeyPEM)
	if privateKey == "" {
		return "", fmt.Errorf("private_key_pem is required")
	}
	if _, err := parseRSAPrivateKeyPEM(privateKey); err != nil {
		return "", fmt.Errorf("private_key_pem is invalid: %w", err)
	}
	if secret.AppID <= 0 {
		return "", fmt.Errorf("app_id must be a positive integer")
	}

	// Store installation in spikeDB
	accountLogin := strings.TrimSpace(metadata.Account.Login)
	if accountLogin == "" {
		accountLogin = strings.TrimSpace(secret.InstallationAccountLogin)
	}
	if accountLogin == "" {
		accountLogin = fmt.Sprintf("installation-%d", installationID)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := s.spikeStore.UpsertGitHubInstallation(ctx, spikedb.GitHubInstallation{
		InstallationID:  installationID,
		AccountLogin:    accountLogin,
		AccountType:     "Organization", // Default, could be extracted from metadata
		AppSlug:         s.githubAppSlug,
		PermissionsJSON: "{}",
		Suspended:       false,
		MetadataJSON:    "{}",
	})
	if err != nil {
		return "", fmt.Errorf("store github installation: %w", err)
	}

	// Persist secret to credentials directory
	payload := map[string]any{
		"app_id":          strconv.FormatInt(secret.AppID, 10),
		"installation_id": strconv.FormatInt(installationID, 10),
		"private_key_pem": privateKey,
		"api_base_url":    apiBaseURL,
	}
	if accountLogin != "" {
		payload["installation_account_login"] = accountLogin
	}

	secretPath := filepath.Join(
		s.connectorStateDir,
		"credentials",
		"github",
		"installations",
		strconv.FormatInt(installationID, 10),
		"secret.json",
	)
	if err := os.MkdirAll(filepath.Dir(secretPath), 0o700); err != nil {
		return "", fmt.Errorf("create installation secret directory: %w", err)
	}
	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal installation secret payload: %w", err)
	}
	raw = append(raw, '\n')
	if err := os.WriteFile(secretPath, raw, 0o600); err != nil {
		return "", fmt.Errorf("write installation secret file: %w", err)
	}
	return secretPath, nil
}

func encodeGitHubInstallState(payload githubInstallStatePayload, secret string) (string, error) {
	secret = strings.TrimSpace(secret)
	if secret == "" {
		return "", fmt.Errorf("install state secret is required")
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	body := base64.RawURLEncoding.EncodeToString(raw)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(body))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return body + "." + signature, nil
}

func decodeGitHubInstallState(raw string, secret string, maxAge time.Duration, now time.Time) (githubInstallStatePayload, error) {
	secret = strings.TrimSpace(secret)
	raw = strings.TrimSpace(raw)
	if secret == "" || raw == "" {
		return githubInstallStatePayload{}, fmt.Errorf("state is required")
	}
	parts := strings.Split(raw, ".")
	if len(parts) != 2 {
		return githubInstallStatePayload{}, fmt.Errorf("invalid state format")
	}
	body := strings.TrimSpace(parts[0])
	sig := strings.TrimSpace(parts[1])
	if body == "" || sig == "" {
		return githubInstallStatePayload{}, fmt.Errorf("invalid state format")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(body))
	expected := mac.Sum(nil)
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil {
		return githubInstallStatePayload{}, fmt.Errorf("invalid state signature encoding")
	}
	if len(expected) != len(got) || subtle.ConstantTimeCompare(expected, got) != 1 {
		return githubInstallStatePayload{}, fmt.Errorf("invalid state signature")
	}
	rawPayload, err := base64.RawURLEncoding.DecodeString(body)
	if err != nil {
		return githubInstallStatePayload{}, fmt.Errorf("invalid state payload encoding")
	}
	var payload githubInstallStatePayload
	if err := json.Unmarshal(rawPayload, &payload); err != nil {
		return githubInstallStatePayload{}, fmt.Errorf("invalid state payload")
	}
	if payload.IssuedAt <= 0 {
		return githubInstallStatePayload{}, fmt.Errorf("state missing issued_at")
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	issuedAt := time.Unix(payload.IssuedAt, 0).UTC()
	if issuedAt.After(now.Add(5 * time.Minute)) {
		return githubInstallStatePayload{}, fmt.Errorf("state issued_at is in the future")
	}
	if maxAge > 0 && now.Sub(issuedAt) > maxAge {
		return githubInstallStatePayload{}, fmt.Errorf("state expired")
	}
	return payload, nil
}

func runtimeAppRedirectTarget(status string, detail string) string {
	values := url.Values{}
	if strings.TrimSpace(status) != "" {
		values.Set("github_connect", strings.TrimSpace(status))
	}
	if strings.TrimSpace(detail) != "" {
		values.Set("github_detail", strings.TrimSpace(detail))
	}
	// Redirect to root "/" rather than "/app/spike" so the dashboard's
	// standalone-mode detection (isNexMode = path starts with "/app/")
	// works correctly. In nex mode the runtime proxy strips the /app/spike
	// prefix and forwards "/" to the engine, so this works in both modes.
	target := "/"
	if encoded := values.Encode(); encoded != "" {
		target += "?" + encoded
	}
	return target
}

func isManagedGitHubConnectionProfileID(raw string) bool {
	return strings.TrimSpace(raw) == spikeManagedGitHubConnectionProfileID
}

func randomStateNonce() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func (s *oracleServer) handleGitHubConnectorSetup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s == nil || s.spikeStore == nil {
		http.Error(w, "spike store is not configured", http.StatusInternalServerError)
		return
	}
	var req githubConnectorSetupRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	installationID, err := parsePositiveInt64Secret(req.InstallationID)
	if err != nil {
		writeControlPlaneError(w, fmt.Errorf("installation_id must be a positive integer"))
		return
	}
	appID, err := parsePositiveInt64Secret(req.AppID)
	if err != nil {
		writeControlPlaneError(w, fmt.Errorf("app_id must be a positive integer"))
		return
	}
	privateKeyPEM := normalizePrivateKeyPEM(req.PrivateKeyPEM)
	if privateKeyPEM == "" {
		writeControlPlaneError(w, fmt.Errorf("private_key_pem is required"))
		return
	}
	if _, err := parseRSAPrivateKeyPEM(privateKeyPEM); err != nil {
		writeControlPlaneError(w, fmt.Errorf("private_key_pem is invalid: %w", err))
		return
	}
	apiBaseURL := normalizeGitHubAPIBaseURL(req.APIBaseURL)

	secretPath, err := s.upsertGitHubInstallation(installationID, githubInstallationMetadata{
		ID: installationID,
		Account: struct {
			Login string `json:"login"`
		}{
			Login: strings.TrimSpace(req.InstallationAccountLogin),
		},
	}, githubConnectorSecret{
		Service:                  "github",
		Account:                  fmt.Sprintf("installation-%d", installationID),
		AuthID:                   "custom",
		AppID:                    appID,
		InstallationID:           installationID,
		PrivateKeyPEM:            privateKeyPEM,
		APIBaseURL:               apiBaseURL,
		InstallationAccountLogin: strings.TrimSpace(req.InstallationAccountLogin),
	})
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true,
		"installation": map[string]any{
			"installation_id": installationID,
			"app_id":          strconv.FormatInt(appID, 10),
			"secret_path":     secretPath,
		},
	})
}

func (s *oracleServer) handleGitHubConnectorInstallCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !s.githubAppReady() {
		http.Error(w, "github app is not configured", http.StatusServiceUnavailable)
		return
	}
	redirectError := func(detail string) {
		http.Redirect(w, r, runtimeAppRedirectTarget("error", detail), http.StatusTemporaryRedirect)
	}

	rawState := strings.TrimSpace(r.URL.Query().Get("state"))
	statePayload, err := decodeGitHubInstallState(rawState, s.githubInstallSecret, 20*time.Minute, time.Now().UTC())
	if err != nil {
		redirectError("invalid_state")
		return
	}
	if !isManagedGitHubConnectionProfileID(statePayload.ConnectionProfileID) {
		redirectError("invalid_connection_profile")
		return
	}
	installationID, err := parsePositiveInt64Secret(r.URL.Query().Get("installation_id"))
	if err != nil {
		redirectError("invalid_installation_id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()

	appJWT, err := buildGitHubAppJWT(s.githubAppID, s.githubAppPrivateKey, time.Now().UTC())
	if err != nil {
		redirectError("app_jwt_failed")
		return
	}
	metadata, err := fetchGitHubInstallationMetadata(ctx, s.configuredGitHubAPIBaseURL(), appJWT, installationID)
	if err != nil {
		redirectError("installation_lookup_failed")
		return
	}
	_, err = s.upsertGitHubInstallation(installationID, metadata, githubConnectorSecret{
		Service:                  "github",
		Account:                  fmt.Sprintf("installation-%d", installationID),
		AuthID:                   "custom",
		AppID:                    s.githubAppID,
		InstallationID:           installationID,
		PrivateKeyPEM:            s.githubAppPrivateKey,
		APIBaseURL:               s.configuredGitHubAPIBaseURL(),
		InstallationAccountLogin: strings.TrimSpace(metadata.Account.Login),
	})
	if err != nil {
		redirectError("connector_persist_failed")
		return
	}

	http.Redirect(w, r, runtimeAppRedirectTarget("connected", ""), http.StatusTemporaryRedirect)
}

func (s *oracleServer) handleGitHubConnectorRepos(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		InstallationID int64 `json:"installation_id"`
	}
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.InstallationID <= 0 {
		writeControlPlaneError(w, fmt.Errorf("installation_id is required"))
		return
	}

	secret, err := s.resolveGitHubInstallationSecret(req.InstallationID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	token, err := mintGitHubInstallationToken(ctx, secret)
	if err != nil {
		writeControlPlaneError(w, fmt.Errorf("mint github installation token failed: %w", err))
		return
	}
	repos, err := listGitHubInstallationRepositories(ctx, secret.APIBaseURL, token.Token, 100)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	items := make([]map[string]any, 0, len(repos))
	for _, repo := range repos {
		repoID := strings.ToLower(strings.TrimSpace(repo.FullName))
		if repoID == "" {
			continue
		}
		items = append(items, map[string]any{
			"repo_id":         repoID,
			"full_name":       strings.TrimSpace(repo.FullName),
			"clone_url":       strings.TrimSpace(repo.CloneURL),
			"default_branch":  strings.TrimSpace(repo.DefaultBranch),
			"installation_id": secret.InstallationID,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":    true,
		"items": items,
	})
}

func (s *oracleServer) handleGitHubConnectorBranches(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		InstallationID int64  `json:"installation_id"`
		RepoID         string `json:"repo_id"`
	}
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	repoID := strings.TrimSpace(req.RepoID)
	if repoID == "" {
		http.Error(w, "repo_id is required", http.StatusBadRequest)
		return
	}
	if req.InstallationID <= 0 {
		writeControlPlaneError(w, fmt.Errorf("installation_id is required"))
		return
	}

	secret, err := s.resolveGitHubInstallationSecret(req.InstallationID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	token, err := mintGitHubInstallationToken(ctx, secret)
	if err != nil {
		writeControlPlaneError(w, fmt.Errorf("mint github installation token failed: %w", err))
		return
	}
	defaultBranch := ""
	if repoMeta, metaErr := fetchGitHubRepositoryMetadata(ctx, secret.APIBaseURL, token.Token, repoID); metaErr == nil {
		defaultBranch = strings.TrimSpace(repoMeta.DefaultBranch)
	}
	branches, err := listGitHubBranches(ctx, secret.APIBaseURL, token.Token, repoID, 100)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	items := make([]map[string]any, 0, len(branches))
	for _, branch := range branches {
		name := strings.TrimSpace(branch.Name)
		if name == "" {
			continue
		}
		items = append(items, map[string]any{
			"name":       name,
			"commit_sha": strings.TrimSpace(branch.Commit.SHA),
			"is_default": strings.EqualFold(name, defaultBranch),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"repo_id": strings.ToLower(repoID),
		"items":   items,
	})
}

func (s *oracleServer) handleGitHubConnectorCommits(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		InstallationID int64  `json:"installation_id"`
		RepoID         string `json:"repo_id"`
		Ref            string `json:"ref,omitempty"`
	}
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	repoID := strings.TrimSpace(req.RepoID)
	if repoID == "" {
		http.Error(w, "repo_id is required", http.StatusBadRequest)
		return
	}
	if req.InstallationID <= 0 {
		writeControlPlaneError(w, fmt.Errorf("installation_id is required"))
		return
	}

	secret, err := s.resolveGitHubInstallationSecret(req.InstallationID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	token, err := mintGitHubInstallationToken(ctx, secret)
	if err != nil {
		writeControlPlaneError(w, fmt.Errorf("mint github installation token failed: %w", err))
		return
	}
	commits, err := listGitHubCommits(ctx, secret.APIBaseURL, token.Token, repoID, strings.TrimSpace(req.Ref), 50)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	items := make([]map[string]any, 0, len(commits))
	for _, commit := range commits {
		sha := strings.TrimSpace(commit.SHA)
		if sha == "" {
			continue
		}
		message := strings.TrimSpace(commit.Commit.Message)
		if idx := strings.Index(message, "\n"); idx >= 0 {
			message = strings.TrimSpace(message[:idx])
		}
		items = append(items, map[string]any{
			"sha":         sha,
			"message":     message,
			"authored_at": strings.TrimSpace(commit.Commit.Author.Date),
			"html_url":    strings.TrimSpace(commit.HTMLURL),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"repo_id": strings.ToLower(repoID),
		"ref":     strings.TrimSpace(req.Ref),
		"items":   items,
	})
}

func resolveConnectorStateDir(storageRoot string, override string) (string, error) {
	resolved := strings.TrimSpace(override)
	if resolved == "" {
		resolved = strings.TrimSpace(os.Getenv("NEXUS_STATE_DIR"))
	}
	if resolved == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		resolved = filepath.Join(homeDir, ".nexus", "state")
	}
	if !filepath.IsAbs(resolved) {
		resolved = filepath.Join(storageRoot, resolved)
	}
	return filepath.Abs(resolved)
}

func loadGitHubConnectorSecret(
	stateDir string,
	binding *control.GitHubConnectorBinding,
) (githubConnectorSecret, error) {
	if binding == nil {
		return githubConnectorSecret{}, fmt.Errorf("github connector binding is required")
	}
	service := strings.ToLower(strings.TrimSpace(binding.Service))
	if service == "" {
		service = "github"
	}
	account := strings.ToLower(strings.TrimSpace(binding.Account))
	if account == "" {
		return githubConnectorSecret{}, fmt.Errorf("github connector binding account is required")
	}
	authID := strings.ToLower(strings.TrimSpace(binding.AuthID))
	if authID == "" {
		authID = "custom"
	}

	secretPath := filepath.Join(
		stateDir,
		"credentials",
		service,
		"accounts",
		account,
		"secrets",
		authID+".json",
	)
	raw, err := os.ReadFile(secretPath)
	if err != nil {
		return githubConnectorSecret{}, fmt.Errorf("read connector secret %s: %w", secretPath, err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return githubConnectorSecret{}, fmt.Errorf("parse connector secret %s: %w", secretPath, err)
	}

	appID, err := parsePositiveInt64Secret(secretFieldString(decoded, "app_id"))
	if err != nil {
		return githubConnectorSecret{}, fmt.Errorf("invalid app_id in connector secret: %w", err)
	}
	installationID, err := parsePositiveInt64Secret(secretFieldString(decoded, "installation_id"))
	if err != nil {
		return githubConnectorSecret{}, fmt.Errorf("invalid installation_id in connector secret: %w", err)
	}
	privateKey := normalizePrivateKeyPEM(secretFieldString(decoded, "private_key_pem"))
	if privateKey == "" {
		return githubConnectorSecret{}, fmt.Errorf("missing private_key_pem in connector secret")
	}
	if _, err := parseRSAPrivateKeyPEM(privateKey); err != nil {
		return githubConnectorSecret{}, fmt.Errorf("invalid private_key_pem in connector secret: %w", err)
	}

	apiBaseURL := normalizeGitHubAPIBaseURL(secretFieldString(decoded, "api_base_url"))
	return githubConnectorSecret{
		Service:                  service,
		Account:                  account,
		AuthID:                   authID,
		AppID:                    appID,
		InstallationID:           installationID,
		PrivateKeyPEM:            privateKey,
		APIBaseURL:               apiBaseURL,
		InstallationAccountLogin: secretFieldString(decoded, "installation_account_login"),
	}, nil
}

func (s *oracleServer) resolveBoundGitHubRemote(
	ctx context.Context,
	treeID string,
	repoID string,
	ref string,
) (remoteURLForClone string, remoteURLPublic string, resolvedRepoID string, resolvedRef string, err error) {
	if s == nil || s.control == nil {
		return "", "", "", "", fmt.Errorf("control store is not configured")
	}
	treeID = strings.TrimSpace(treeID)
	repoID = strings.TrimSpace(repoID)
	if treeID == "" {
		return "", "", "", "", fmt.Errorf("tree_id is required for github connector resolution")
	}
	if repoID == "" {
		return "", "", "", "", fmt.Errorf("repo_id is required for github connector resolution")
	}

	binding, err := s.control.GetGitHubConnectorBinding(treeID)
	if err != nil {
		return "", "", "", "", fmt.Errorf("github connector binding missing for tree %s: %w", treeID, err)
	}
	secret, err := loadGitHubConnectorSecret(s.connectorStateDir, binding)
	if err != nil {
		return "", "", "", "", err
	}
	token, err := mintGitHubInstallationToken(ctx, secret)
	if err != nil {
		return "", "", "", "", fmt.Errorf("mint github installation token failed: %w", err)
	}
	repoMeta, err := fetchGitHubRepositoryMetadata(ctx, secret.APIBaseURL, token.Token, repoID)
	if err != nil {
		return "", "", "", "", fmt.Errorf("resolve github repository %s failed: %w", repoID, err)
	}
	remotePublic := strings.TrimSpace(repoMeta.CloneURL)
	if remotePublic == "" {
		return "", "", "", "", fmt.Errorf("github repository %s returned empty clone_url", repoID)
	}
	resolvedRepo := strings.ToLower(strings.TrimSpace(repoMeta.FullName))
	if resolvedRepo == "" {
		resolvedRepo = strings.ToLower(repoID)
	}

	resolvedRefName := normalizeGitRef(ref)
	if resolvedRefName == "" {
		resolvedRefName = normalizeGitRef(repoMeta.DefaultBranch)
	}
	if resolvedRefName == "" {
		resolvedRefName = "HEAD"
	}

	return injectGitTokenIntoRemote(remotePublic, token.Token), remotePublic, resolvedRepo, resolvedRefName, nil
}

func mintGitHubInstallationToken(
	ctx context.Context,
	secret githubConnectorSecret,
) (*githubInstallationToken, error) {
	jwt, err := buildGitHubAppJWT(secret.AppID, secret.PrivateKeyPEM, time.Now().UTC())
	if err != nil {
		return nil, fmt.Errorf("build github app jwt: %w", err)
	}
	endpoint := fmt.Sprintf(
		"%s/app/installations/%d/access_tokens",
		strings.TrimRight(secret.APIBaseURL, "/"),
		secret.InstallationID,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader("{}"))
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

	var payload githubInstallationToken
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode github installation token response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("github access token endpoint returned HTTP %d", resp.StatusCode)
	}
	if strings.TrimSpace(payload.Token) == "" {
		return nil, fmt.Errorf("github access token response missing token")
	}
	return &payload, nil
}

func fetchGitHubInstallationMetadata(
	ctx context.Context,
	apiBaseURL string,
	appJWT string,
	installationID int64,
) (githubInstallationMetadata, error) {
	endpoint := fmt.Sprintf(
		"%s/app/installations/%d",
		strings.TrimRight(apiBaseURL, "/"),
		installationID,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return githubInstallationMetadata{}, err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(appJWT))
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return githubInstallationMetadata{}, err
	}
	defer resp.Body.Close()

	var payload githubInstallationMetadata
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return githubInstallationMetadata{}, fmt.Errorf("decode github installation response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return githubInstallationMetadata{}, fmt.Errorf("github installation endpoint returned HTTP %d", resp.StatusCode)
	}
	if payload.ID <= 0 {
		payload.ID = installationID
	}
	return payload, nil
}

func listGitHubInstallationRepositories(
	ctx context.Context,
	apiBaseURL string,
	installationToken string,
	limit int,
) ([]githubRepositoryMetadata, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 100 {
		limit = 100
	}
	endpoint := fmt.Sprintf(
		"%s/installation/repositories?per_page=%d",
		strings.TrimRight(apiBaseURL, "/"),
		limit,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(installationToken))
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var payload githubInstallationRepositoriesPayload
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode github installation repositories response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("github installation repositories endpoint returned HTTP %d", resp.StatusCode)
	}
	return payload.Repositories, nil
}

func listGitHubBranches(
	ctx context.Context,
	apiBaseURL string,
	installationToken string,
	repoID string,
	limit int,
) ([]githubBranchMetadata, error) {
	owner, repoName, err := splitRepoID(repoID)
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 100
	}
	if limit > 100 {
		limit = 100
	}
	endpoint := fmt.Sprintf(
		"%s/repos/%s/%s/branches?per_page=%d",
		strings.TrimRight(apiBaseURL, "/"),
		url.PathEscape(owner),
		url.PathEscape(repoName),
		limit,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(installationToken))
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var payload []githubBranchMetadata
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode github branches response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("github branches endpoint returned HTTP %d", resp.StatusCode)
	}
	return payload, nil
}

func listGitHubCommits(
	ctx context.Context,
	apiBaseURL string,
	installationToken string,
	repoID string,
	ref string,
	limit int,
) ([]githubCommitMetadata, error) {
	owner, repoName, err := splitRepoID(repoID)
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 30
	}
	if limit > 100 {
		limit = 100
	}
	endpoint := fmt.Sprintf(
		"%s/repos/%s/%s/commits",
		strings.TrimRight(apiBaseURL, "/"),
		url.PathEscape(owner),
		url.PathEscape(repoName),
	)
	values := url.Values{}
	values.Set("per_page", strconv.Itoa(limit))
	if trimmedRef := strings.TrimSpace(ref); trimmedRef != "" {
		values.Set("sha", trimmedRef)
	}
	if encoded := values.Encode(); encoded != "" {
		endpoint += "?" + encoded
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(installationToken))
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var payload []githubCommitMetadata
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode github commits response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("github commits endpoint returned HTTP %d", resp.StatusCode)
	}
	return payload, nil
}

func fetchGitHubRepositoryMetadata(
	ctx context.Context,
	apiBaseURL string,
	installationToken string,
	repoID string,
) (githubRepositoryMetadata, error) {
	owner, repoName, err := splitRepoID(repoID)
	if err != nil {
		return githubRepositoryMetadata{}, err
	}
	endpoint := fmt.Sprintf(
		"%s/repos/%s/%s",
		strings.TrimRight(apiBaseURL, "/"),
		url.PathEscape(owner),
		url.PathEscape(repoName),
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return githubRepositoryMetadata{}, err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(installationToken))
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return githubRepositoryMetadata{}, err
	}
	defer resp.Body.Close()

	var payload githubRepositoryMetadata
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return githubRepositoryMetadata{}, fmt.Errorf("decode github repo response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return githubRepositoryMetadata{}, fmt.Errorf("github repo endpoint returned HTTP %d", resp.StatusCode)
	}
	if strings.TrimSpace(payload.CloneURL) == "" {
		return githubRepositoryMetadata{}, fmt.Errorf("github repo response missing clone_url")
	}
	return payload, nil
}

func splitRepoID(repoID string) (string, string, error) {
	repoID = strings.TrimSpace(strings.TrimPrefix(repoID, "https://github.com/"))
	repoID = strings.TrimSuffix(repoID, ".git")
	parts := strings.Split(repoID, "/")
	if len(parts) != 2 {
		return "", "", fmt.Errorf("repo_id must be owner/repo, got %q", repoID)
	}
	owner := strings.TrimSpace(parts[0])
	repo := strings.TrimSpace(parts[1])
	if owner == "" || repo == "" {
		return "", "", fmt.Errorf("repo_id must be owner/repo, got %q", repoID)
	}
	return owner, repo, nil
}

func injectGitTokenIntoRemote(remote string, token string) string {
	remote = strings.TrimSpace(remote)
	token = strings.TrimSpace(token)
	if remote == "" || token == "" {
		return remote
	}
	parsed, err := url.Parse(remote)
	if err != nil {
		return remote
	}
	if parsed.Scheme != "https" && parsed.Scheme != "http" {
		return remote
	}
	if parsed.Host == "" {
		return remote
	}
	if parsed.User != nil {
		return remote
	}
	parsed.User = url.UserPassword("x-access-token", token)
	return parsed.String()
}

func buildGitHubAppJWT(appID int64, privateKeyPEM string, now time.Time) (string, error) {
	privateKey, err := parseRSAPrivateKeyPEM(privateKeyPEM)
	if err != nil {
		return "", err
	}
	header, _ := json.Marshal(map[string]any{
		"alg": "RS256",
		"typ": "JWT",
	})
	payload, _ := json.Marshal(map[string]any{
		"iat": now.Add(-60 * time.Second).Unix(),
		"exp": now.Add(9 * time.Minute).Unix(),
		"iss": strconv.FormatInt(appID, 10),
	})
	headPart := base64.RawURLEncoding.EncodeToString(header)
	payloadPart := base64.RawURLEncoding.EncodeToString(payload)
	signingInput := headPart + "." + payloadPart

	hash := sha256.Sum256([]byte(signingInput))
	signature, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, hash[:])
	if err != nil {
		return "", err
	}
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func parseRSAPrivateKeyPEM(raw string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(raw))
	if block == nil {
		return nil, fmt.Errorf("invalid private key pem")
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

func parsePositiveInt64Secret(raw string) (int64, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return 0, fmt.Errorf("value is required")
	}
	value, err := strconv.ParseInt(trimmed, 10, 64)
	if err != nil {
		return 0, err
	}
	if value <= 0 {
		return 0, fmt.Errorf("value must be > 0")
	}
	return value, nil
}

func normalizePrivateKeyPEM(raw string) string {
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

func normalizeGitHubAPIBaseURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return defaultGitHubAPIBaseURL
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return defaultGitHubAPIBaseURL
	}
	return strings.TrimRight(parsed.String(), "/")
}

func secretFieldString(fields map[string]any, key string) string {
	if fields == nil {
		return ""
	}
	raw, ok := fields[key]
	if !ok {
		return ""
	}
	switch value := raw.(type) {
	case string:
		return strings.TrimSpace(value)
	case float64:
		return strconv.FormatInt(int64(value), 10)
	case int64:
		return strconv.FormatInt(value, 10)
	case int:
		return strconv.Itoa(value)
	default:
		return ""
	}
}
