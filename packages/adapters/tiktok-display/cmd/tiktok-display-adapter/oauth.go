package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	tiktokDisplayOAuthStateVersion          = 1
	tiktokDisplayDefaultRefreshBuffer       = 6 * time.Hour
	tiktokDisplayDefaultReauthWarningWindow = 7 * 24 * time.Hour
)

var (
	tiktokDisplayOAuthTokenURL = "https://open.tiktokapis.com/v2/oauth/token/"
	tiktokDisplayNow           = func() time.Time { return time.Now().UTC() }
)

type tiktokDisplayOAuthState struct {
	Version               int       `json:"version"`
	AccessToken           string    `json:"access_token,omitempty"`
	RefreshToken          string    `json:"refresh_token,omitempty"`
	OpenID                string    `json:"open_id,omitempty"`
	AccessTokenExpiresAt  time.Time `json:"access_token_expires_at,omitempty"`
	RefreshTokenExpiresAt time.Time `json:"refresh_token_expires_at,omitempty"`
	UpdatedAt             time.Time `json:"updated_at,omitempty"`
}

type tiktokDisplayOAuthRefreshResponse struct {
	AccessToken      string `json:"access_token,omitempty"`
	RefreshToken     string `json:"refresh_token,omitempty"`
	OpenID           string `json:"open_id,omitempty"`
	ExpiresIn        int64  `json:"expires_in,omitempty"`
	RefreshExpiresIn int64  `json:"refresh_expires_in,omitempty"`
	Scope            string `json:"scope,omitempty"`
	TokenType        string `json:"token_type,omitempty"`
	Error            string `json:"error,omitempty"`
	ErrorDescription string `json:"error_description,omitempty"`
	Message          string `json:"message,omitempty"`
}

func (state *tiktokDisplayRuntime) accessTokenForRequest(ctx context.Context) (string, error) {
	now := tiktokDisplayNow()
	if state.AccessToken != "" && !state.accessTokenRefreshRequired(now) {
		return state.AccessToken, nil
	}

	if strings.TrimSpace(state.RefreshToken) == "" {
		if state.accessTokenValid(now) {
			return state.AccessToken, nil
		}
		return "", errors.New("TikTok Display access token is expired or unavailable and no refresh token is configured; reauthorize the connection")
	}
	if state.refreshTokenExpired(now) {
		if state.accessTokenValid(now) {
			return state.AccessToken, nil
		}
		return "", errors.New("TikTok Display refresh token is expired and the access token is no longer usable; reauthorize the connection")
	}
	if strings.TrimSpace(state.ClientKey) == "" || strings.TrimSpace(state.ClientSecret) == "" {
		if state.accessTokenValid(now) {
			return state.AccessToken, nil
		}
		return "", errors.New("TikTok Display access token is expired or unavailable and OAuth client credentials are not configured")
	}

	accessToken, err := state.refreshAccessToken(ctx, now)
	if err != nil {
		if state.accessTokenValid(now) {
			nexadapter.LogError("tiktok display token refresh failed; using still-valid access token until expiry: %v", err)
			return state.AccessToken, nil
		}
		return "", err
	}
	return accessToken, nil
}

func (state *tiktokDisplayRuntime) accessTokenValid(now time.Time) bool {
	if strings.TrimSpace(state.AccessToken) == "" {
		return false
	}
	if state.AccessTokenExpiresAt.IsZero() {
		return true
	}
	return now.Before(state.AccessTokenExpiresAt)
}

func (state *tiktokDisplayRuntime) accessTokenRefreshRequired(now time.Time) bool {
	if strings.TrimSpace(state.AccessToken) == "" {
		return true
	}
	if state.AccessTokenExpiresAt.IsZero() {
		return strings.TrimSpace(state.RefreshToken) != ""
	}
	buffer := state.RefreshBuffer
	if buffer <= 0 {
		buffer = tiktokDisplayDefaultRefreshBuffer
	}
	return !now.Add(buffer).Before(state.AccessTokenExpiresAt)
}

func (state *tiktokDisplayRuntime) refreshTokenExpired(now time.Time) bool {
	if strings.TrimSpace(state.RefreshToken) == "" {
		return true
	}
	if state.RefreshTokenExpiresAt.IsZero() {
		return false
	}
	return !now.Before(state.RefreshTokenExpiresAt)
}

func (state *tiktokDisplayRuntime) refreshAccessToken(ctx context.Context, now time.Time) (string, error) {
	form := url.Values{}
	form.Set("client_key", strings.TrimSpace(state.ClientKey))
	form.Set("client_secret", strings.TrimSpace(state.ClientSecret))
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", strings.TrimSpace(state.RefreshToken))

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tiktokDisplayOAuthTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("create TikTok Display token refresh request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := tiktokDisplayHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("call TikTok Display token refresh: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read TikTok Display token refresh response: %w", err)
	}

	var payload tiktokDisplayOAuthRefreshResponse
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &payload); err != nil {
			return "", fmt.Errorf("parse TikTok Display token refresh response: %w", err)
		}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("TikTok Display token refresh failed with HTTP %d: %s", resp.StatusCode, tiktokDisplayOAuthErrorMessage(payload))
	}
	if strings.TrimSpace(payload.AccessToken) == "" {
		return "", fmt.Errorf("TikTok Display token refresh did not return an access token: %s", tiktokDisplayOAuthErrorMessage(payload))
	}

	nextOpenID := strings.TrimSpace(firstNonBlank(payload.OpenID, state.OpenID))
	if state.OpenID != "" && nextOpenID != "" && state.OpenID != nextOpenID {
		return "", fmt.Errorf("TikTok Display token refresh returned open_id %q but runtime credential is bound to %q", nextOpenID, state.OpenID)
	}

	state.AccessToken = strings.TrimSpace(payload.AccessToken)
	if nextRefreshToken := strings.TrimSpace(payload.RefreshToken); nextRefreshToken != "" {
		state.RefreshToken = nextRefreshToken
	}
	if nextOpenID != "" {
		state.OpenID = nextOpenID
	}
	state.AccessTokenExpiresAt = tiktokDisplayExpiresAt(now, payload.ExpiresIn)
	if refreshExpiresAt := tiktokDisplayExpiresAt(now, payload.RefreshExpiresIn); !refreshExpiresAt.IsZero() {
		state.RefreshTokenExpiresAt = refreshExpiresAt
	}
	state.OAuthLastRefreshAt = now
	state.OAuthLastRefreshSource = "direct_oauth_refresh"

	if err := state.saveOAuthState(now); err != nil {
		return "", err
	}
	return state.AccessToken, nil
}

func tiktokDisplayOAuthErrorMessage(payload tiktokDisplayOAuthRefreshResponse) string {
	return firstNonBlank(payload.ErrorDescription, payload.Message, payload.Error, "unknown provider error")
}

func (state *tiktokDisplayRuntime) overlayCachedOAuthState() {
	cached, err := loadOptionalTikTokDisplayOAuthState(state.ConnectionID)
	if err != nil {
		nexadapter.LogError("tiktok display cached oauth state ignored: %v", err)
		return
	}
	if cached == nil || strings.TrimSpace(cached.AccessToken) == "" {
		return
	}
	if cached.OpenID != "" && state.OpenID != "" && cached.OpenID != state.OpenID {
		nexadapter.LogError("tiktok display cached oauth state ignored: cached open_id does not match runtime credential")
		return
	}
	if !shouldUseCachedTikTokDisplayOAuthState(state, cached) {
		return
	}

	state.AccessToken = strings.TrimSpace(cached.AccessToken)
	if strings.TrimSpace(cached.RefreshToken) != "" {
		state.RefreshToken = strings.TrimSpace(cached.RefreshToken)
	}
	if strings.TrimSpace(cached.OpenID) != "" {
		state.OpenID = strings.TrimSpace(cached.OpenID)
	}
	if !cached.AccessTokenExpiresAt.IsZero() {
		state.AccessTokenExpiresAt = cached.AccessTokenExpiresAt.UTC()
	}
	if !cached.RefreshTokenExpiresAt.IsZero() {
		state.RefreshTokenExpiresAt = cached.RefreshTokenExpiresAt.UTC()
	}
	state.OAuthStateLoaded = true
	state.OAuthLastRefreshAt = cached.UpdatedAt.UTC()
	state.OAuthLastRefreshSource = "adapter_state"
}

func shouldUseCachedTikTokDisplayOAuthState(state *tiktokDisplayRuntime, cached *tiktokDisplayOAuthState) bool {
	if state.AccessToken == "" {
		return true
	}
	if state.AccessTokenExpiresAt.IsZero() {
		return !cached.AccessTokenExpiresAt.IsZero()
	}
	return !cached.AccessTokenExpiresAt.IsZero() && cached.AccessTokenExpiresAt.After(state.AccessTokenExpiresAt)
}

func loadOptionalTikTokDisplayOAuthState(connectionID string) (*tiktokDisplayOAuthState, error) {
	stateDir := strings.TrimSpace(os.Getenv(tiktokDisplayAdapterStateDirEnv))
	if stateDir == "" {
		return nil, nil
	}
	payload, err := os.ReadFile(tiktokDisplayOAuthStatePath(stateDir, connectionID))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read TikTok Display oauth state: %w", err)
	}
	var state tiktokDisplayOAuthState
	if err := json.Unmarshal(payload, &state); err != nil {
		return nil, fmt.Errorf("parse TikTok Display oauth state: %w", err)
	}
	return &state, nil
}

func (state *tiktokDisplayRuntime) saveOAuthState(now time.Time) error {
	stateDir := strings.TrimSpace(os.Getenv(tiktokDisplayAdapterStateDirEnv))
	if stateDir == "" {
		return nil
	}
	path := tiktokDisplayOAuthStatePath(stateDir, state.ConnectionID)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("create TikTok Display oauth state dir: %w", err)
	}
	payload := tiktokDisplayOAuthState{
		Version:               tiktokDisplayOAuthStateVersion,
		AccessToken:           strings.TrimSpace(state.AccessToken),
		RefreshToken:          strings.TrimSpace(state.RefreshToken),
		OpenID:                strings.TrimSpace(state.OpenID),
		AccessTokenExpiresAt:  state.AccessTokenExpiresAt.UTC(),
		RefreshTokenExpiresAt: state.RefreshTokenExpiresAt.UTC(),
		UpdatedAt:             now.UTC(),
	}
	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal TikTok Display oauth state: %w", err)
	}
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, append(raw, '\n'), 0o600); err != nil {
		return fmt.Errorf("write TikTok Display oauth state: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("replace TikTok Display oauth state: %w", err)
	}
	return nil
}

func tiktokDisplayOAuthStatePath(stateDir string, connectionID string) string {
	return filepath.Join(stateDir, "tiktok-display", connectionID, "oauth-state.json")
}

func parseTikTokDisplayOptionalTime(raw string) time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed.UTC()
		}
	}
	if value, err := strconv.ParseInt(raw, 10, 64); err == nil {
		if value > 1_000_000_000_000 {
			return time.UnixMilli(value).UTC()
		}
		return time.Unix(value, 0).UTC()
	}
	return time.Time{}
}

func tiktokDisplayExpiresAt(now time.Time, seconds int64) time.Time {
	if seconds <= 0 {
		return time.Time{}
	}
	return now.UTC().Add(time.Duration(seconds) * time.Second)
}

func tiktokDisplayOAuthRefreshBuffer() time.Duration {
	return tiktokDisplayDurationFromEnv("TIKTOK_DISPLAY_REFRESH_BUFFER_SECONDS", tiktokDisplayDefaultRefreshBuffer)
}

func tiktokDisplayOAuthReauthWarning() time.Duration {
	return tiktokDisplayDurationFromEnv("TIKTOK_DISPLAY_REAUTH_WARNING_SECONDS", tiktokDisplayDefaultReauthWarningWindow)
}

func tiktokDisplayDurationFromEnv(key string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	if seconds, err := strconv.ParseInt(raw, 10, 64); err == nil && seconds > 0 {
		return time.Duration(seconds) * time.Second
	}
	if duration, err := time.ParseDuration(raw); err == nil && duration > 0 {
		return duration
	}
	return fallback
}

func (state *tiktokDisplayRuntime) healthAuthDetails(tokenDetails *tiktokDisplayTokenDebug) map[string]any {
	details := map[string]any{
		"credential_ref":           state.CredentialRef,
		"credential_service":       state.CredentialService,
		"runtime_open_id":          state.OpenID,
		"runtime_display_name":     state.DisplayName,
		"oauth_refresh_configured": strings.TrimSpace(state.RefreshToken) != "" && strings.TrimSpace(state.ClientKey) != "" && strings.TrimSpace(state.ClientSecret) != "",
		"oauth_state_loaded":       state.OAuthStateLoaded,
		"refresh_buffer_seconds":   int64(state.RefreshBuffer.Seconds()),
	}
	if tokenDetails != nil {
		details["access_token_length"] = tokenDetails.Length
		details["access_token_sha256"] = tokenDetails.SHA256
	}
	if !state.AccessTokenExpiresAt.IsZero() {
		details["access_token_expires_at"] = state.AccessTokenExpiresAt.Format(time.RFC3339)
	}
	if !state.RefreshTokenExpiresAt.IsZero() {
		details["refresh_token_expires_at"] = state.RefreshTokenExpiresAt.Format(time.RFC3339)
		if state.ReauthWarning > 0 {
			details["reauth_recommended"] = tiktokDisplayNow().Add(state.ReauthWarning).After(state.RefreshTokenExpiresAt)
		}
	}
	if !state.OAuthLastRefreshAt.IsZero() {
		details["oauth_last_refresh_at"] = state.OAuthLastRefreshAt.Format(time.RFC3339)
		details["oauth_last_refresh_source"] = state.OAuthLastRefreshSource
	}
	return details
}

func (state *tiktokDisplayRuntime) healthAuthDetailsWithProfile(tokenDetails *tiktokDisplayTokenDebug, profile *tiktokDisplayUserInfo) map[string]any {
	details := state.healthAuthDetails(tokenDetails)
	if profile == nil {
		return details
	}
	details["profile_open_id"] = profile.OpenID
	details["profile_display_name"] = profile.DisplayName
	details["profile_web_link"] = profile.ProfileWebLink
	details["profile_deep_link"] = profile.ProfileDeepLink
	details["profile_verified"] = profile.IsVerified
	details["profile_follower_count"] = profile.FollowerCount
	details["profile_following_count"] = profile.FollowingCount
	details["profile_likes_count"] = profile.LikesCount
	details["profile_video_count"] = profile.VideoCount
	return details
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
