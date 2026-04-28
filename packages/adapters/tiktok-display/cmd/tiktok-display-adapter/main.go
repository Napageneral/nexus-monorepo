package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName    = "tiktok-display-adapter"
	adapterVersion = "0.1.3"
	platformID     = "tiktok-display"

	tiktokDisplayUserInfoURL = "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,profile_web_link,is_verified,follower_count,following_count,likes_count,video_count"
)

var (
	tiktokDisplayHTTPClient   = &http.Client{Timeout: 15 * time.Second}
	fetchTikTokDisplayProfile = func(ctx context.Context, accessToken string) (*tiktokDisplayUserInfo, error) {
		return fetchTikTokDisplayProfileFromTikTok(ctx, accessToken)
	}
)

type tiktokDisplayRuntime struct {
	ConnectionID           string
	CredentialRef          string
	CredentialService      string
	AccessToken            string
	RefreshToken           string
	ClientKey              string
	ClientSecret           string
	AccessTokenExpiresAt   time.Time
	RefreshTokenExpiresAt  time.Time
	OpenID                 string
	DisplayName            string
	ProfileWebLink         string
	RefreshBuffer          time.Duration
	ReauthWarning          time.Duration
	OAuthStateLoaded       bool
	OAuthLastRefreshAt     time.Time
	OAuthLastRefreshSource string
}

type tiktokDisplayUserInfo struct {
	AvatarURL       string `json:"avatar_url,omitempty"`
	BioDescription  string `json:"bio_description,omitempty"`
	DisplayName     string `json:"display_name,omitempty"`
	FollowerCount   int64  `json:"follower_count"`
	FollowingCount  int64  `json:"following_count"`
	IsVerified      bool   `json:"is_verified"`
	LikesCount      int64  `json:"likes_count"`
	OpenID          string `json:"open_id,omitempty"`
	ProfileDeepLink string `json:"profile_deep_link,omitempty"`
	ProfileWebLink  string `json:"profile_web_link,omitempty"`
	UnionID         string `json:"union_id,omitempty"`
	VideoCount      int64  `json:"video_count"`
}

type tiktokDisplayUserResponse struct {
	Data *struct {
		User *tiktokDisplayUserInfo `json:"user,omitempty"`
	} `json:"data,omitempty"`
	Error *struct {
		Code    string `json:"code,omitempty"`
		Message string `json:"message,omitempty"`
		LogID   string `json:"log_id,omitempty"`
	} `json:"error,omitempty"`
}

func main() {
	nexadapter.Run(nexadapter.DefineAdapter(adapterConfig()))
}

func adapterConfig() nexadapter.DefineAdapterConfig[struct{}] {
	return nexadapter.DefineAdapterConfig[struct{}]{
		Platform:          platformID,
		Name:              adapterName,
		Version:           adapterVersion,
		MultiAccount:      false,
		CredentialService: platformID,
		MethodCatalog: &nexadapter.AdapterMethodCatalog{
			Source:    "openapi",
			Document:  "api/openapi.yaml",
			Namespace: platformID,
		},
		Projection: &nexadapter.AdapterProjection{
			Platform: platformID,
			Families: []nexadapter.AdapterProjectionFamily{
				{Name: tiktokDisplayProfileSnapshotFamily, Description: "Current TikTok Display profile snapshots."},
				{Name: tiktokDisplayVideoSnapshotFamily, Description: "Current TikTok Display video snapshots."},
			},
			Backfill: &nexadapter.AdapterProjectionSync{
				Supported: true,
				Strategy:  "poll",
				Cursor:    "create_time",
			},
			Monitor: &nexadapter.AdapterProjectionSync{
				Supported: true,
				Strategy:  "poll",
				Cursor:    "create_time",
			},
			Normalization: &nexadapter.AdapterProjectionNormalize{
				Content:     "provider_native_profile_and_video_snapshots",
				Attachments: false,
			},
		},
		Connection: nexadapter.ConnectionHandlers[struct{}]{
			Connections: func(ctx nexadapter.AdapterContext[struct{}]) ([]nexadapter.AdapterConnectionIdentity, error) {
				return connections(ctx.Context)
			},
			Health: func(ctx nexadapter.AdapterContext[struct{}]) (*nexadapter.AdapterHealth, error) {
				return health(ctx.Context, ctx.ConnectionID)
			},
		},
		Ingest: nexadapter.IngestHandlers[struct{}]{
			Monitor: func(ctx nexadapter.AdapterContext[struct{}], emit nexadapter.EmitFunc) error {
				return monitor(ctx.Context, ctx.ConnectionID, emit)
			},
			Backfill: func(ctx nexadapter.AdapterContext[struct{}], since time.Time, emit nexadapter.EmitFunc) error {
				return backfill(ctx.Context, ctx.ConnectionID, since, emit)
			},
		},
		Methods: declaredTikTokDisplayMethods(),
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					ID:      "tiktok_display_oauth",
					Type:    "oauth2",
					Label:   "Connect TikTok Display",
					Icon:    "oauth",
					Service: platformID,
					Scopes: []string{
						"user.info.basic",
						"user.info.profile",
						"user.info.stats",
						"video.list",
					},
					PlatformCredentials:   true,
					PlatformCredentialURL: nexadapter.PlatformCredentialURL(""),
				},
				{
					ID:      "tiktok_display_access_token",
					Type:    "api_key",
					Label:   "Use Existing TikTok Display Access Token",
					Icon:    "key",
					Service: platformID,
					Fields: []nexadapter.AdapterAuthField{
						{
							Name:        "access_token",
							Label:       "TikTok Display Access Token",
							Type:        "secret",
							Required:    true,
							Placeholder: "act...",
						},
						{
							Name:        "refresh_token",
							Label:       "TikTok Display Refresh Token",
							Type:        "secret",
							Required:    false,
							Placeholder: "rft...",
						},
						{
							Name:        "open_id",
							Label:       "TikTok Display Open ID",
							Type:        "text",
							Required:    true,
							Placeholder: "open_123",
						},
						{
							Name:        "access_token_expires_at",
							Label:       "Access Token Expires At",
							Type:        "text",
							Required:    false,
							Placeholder: "2026-04-28T00:00:00Z",
						},
						{
							Name:        "refresh_token_expires_at",
							Label:       "Refresh Token Expires At",
							Type:        "text",
							Required:    false,
							Placeholder: "2027-04-28T00:00:00Z",
						},
						{
							Name:        "client_key",
							Label:       "TikTok OAuth Client Key",
							Type:        "secret",
							Required:    false,
							Placeholder: "client key",
						},
						{
							Name:        "client_secret",
							Label:       "TikTok OAuth Client Secret",
							Type:        "secret",
							Required:    false,
							Placeholder: "client secret",
						},
						{
							Name:        "display_name",
							Label:       "Display Name",
							Type:        "text",
							Required:    false,
							Placeholder: "Moon Sleep",
						},
						{
							Name:        "profile_web_link",
							Label:       "Profile Web Link",
							Type:        "text",
							Required:    false,
							Placeholder: "https://www.tiktok.com/@moonsleep",
						},
					},
				},
			},
			SetupGuide: "Connect a TikTok Display account through Nex OAuth or import an existing authorized token bundle. When refresh token and OAuth client credentials are present, the adapter renews TikTok Display access tokens before provider calls and stores renewed tokens in adapter state.",
		},
		Capabilities: nexadapter.ChannelCapabilities{
			TextLimit:          20000,
			SupportsMarkdown:   true,
			MarkdownFlavor:     "standard",
			SupportsTables:     false,
			SupportsCodeBlocks: false,
			SupportsEmbeds:     false,
			SupportsThreads:    false,
			SupportsReactions:  false,
			SupportsPolls:      false,
			SupportsButtons:    false,
			SupportsEdit:       false,
			SupportsDelete:     false,
			SupportsMedia:      false,
			SupportsVoiceNotes: false,
		},
	}
}

func connections(_ context.Context) ([]nexadapter.AdapterConnectionIdentity, error) {
	runtimeInfo, err := loadTikTokDisplayRuntime()
	if err != nil {
		return []nexadapter.AdapterConnectionIdentity{}, nil
	}

	displayName := runtimeInfo.DisplayName
	if displayName == "" {
		displayName = runtimeInfo.ConnectionID
	}
	if runtimeInfo.OpenID != "" {
		displayName = fmt.Sprintf("%s (%s)", displayName, runtimeInfo.OpenID)
	}

	credentialRef := runtimeInfo.CredentialRef
	if credentialRef == "" {
		credentialRef = platformID + "/" + runtimeInfo.ConnectionID
	}

	return []nexadapter.AdapterConnectionIdentity{
		{
			ID:            runtimeInfo.ConnectionID,
			DisplayName:   displayName,
			Account:       runtimeInfo.OpenID,
			CredentialRef: credentialRef,
			Status:        "ready",
		},
	}, nil
}

func health(ctx context.Context, connectionID string) (*nexadapter.AdapterHealth, error) {
	connectionID, err := nexadapter.RequireConnection(connectionID)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: connectionID,
			Error:        err.Error(),
		}, nil
	}

	runtimeInfo, err := loadTikTokDisplayRuntime()
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: connectionID,
			Error:        err.Error(),
		}, nil
	}

	if runtimeInfo.ConnectionID != "" && runtimeInfo.ConnectionID != connectionID {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: connectionID,
			Error:        fmt.Sprintf("runtime connection %q does not match requested connection %q", runtimeInfo.ConnectionID, connectionID),
			Details: map[string]any{
				"runtime_connection_id": runtimeInfo.ConnectionID,
			},
		}, nil
	}

	accessToken, err := runtimeInfo.accessTokenForRequest(ctx)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: connectionID,
			Account:      runtimeInfo.OpenID,
			Error:        err.Error(),
			Details:      runtimeInfo.healthAuthDetails(nil),
		}, nil
	}

	tokenDetails := tiktokDisplayTokenDetails(accessToken)
	profile, err := fetchTikTokDisplayProfile(ctx, accessToken)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: connectionID,
			Account:      runtimeInfo.OpenID,
			Error:        err.Error(),
			Details:      runtimeInfo.healthAuthDetails(&tokenDetails),
		}, nil
	}

	if profile == nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: connectionID,
			Account:      runtimeInfo.OpenID,
			Error:        "TikTok Display user/info returned no profile",
		}, nil
	}
	if profile.OpenID == "" {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: connectionID,
			Account:      runtimeInfo.OpenID,
			Error:        "TikTok Display user/info response did not include open_id",
			Details: map[string]any{
				"credential_ref":       runtimeInfo.CredentialRef,
				"credential_service":   runtimeInfo.CredentialService,
				"runtime_open_id":      runtimeInfo.OpenID,
				"profile_display_name": profile.DisplayName,
			},
		}, nil
	}
	if runtimeInfo.OpenID != "" && runtimeInfo.OpenID != profile.OpenID {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: connectionID,
			Account:      profile.OpenID,
			Error:        fmt.Sprintf("TikTok Display profile open_id %q does not match the runtime credential open_id %q", profile.OpenID, runtimeInfo.OpenID),
			Details: map[string]any{
				"credential_ref":       runtimeInfo.CredentialRef,
				"credential_service":   runtimeInfo.CredentialService,
				"runtime_open_id":      runtimeInfo.OpenID,
				"profile_open_id":      profile.OpenID,
				"profile_display_name": profile.DisplayName,
				"profile_web_link":     profile.ProfileWebLink,
			},
		}, nil
	}

	return &nexadapter.AdapterHealth{
		Connected:    true,
		ConnectionID: connectionID,
		Account:      profile.OpenID,
		LastEventAt:  time.Now().UnixMilli(),
		Details:      runtimeInfo.healthAuthDetailsWithProfile(&tokenDetails, profile),
	}, nil
}

type tiktokDisplayTokenDebug struct {
	Length int
	SHA256 string
}

func tiktokDisplayTokenDetails(accessToken string) tiktokDisplayTokenDebug {
	trimmed := strings.TrimSpace(accessToken)
	sum := sha256.Sum256([]byte(trimmed))
	return tiktokDisplayTokenDebug{
		Length: len(trimmed),
		SHA256: hex.EncodeToString(sum[:])[:12],
	}
}

func loadTikTokDisplayRuntime() (*tiktokDisplayRuntime, error) {
	runtimeCtx, err := nexadapter.LoadRuntimeContextFromEnv()
	if err != nil {
		return nil, err
	}
	if runtimeCtx.Credential == nil {
		return nil, errors.New("missing TikTok Display runtime credential")
	}

	credentialService := strings.TrimSpace(runtimeCtx.Credential.Service)
	if credentialService != "" && credentialService != platformID {
		return nil, fmt.Errorf("runtime credential service %q does not match %q", credentialService, platformID)
	}

	accessToken := nexadapter.ReadCredential(nexadapter.AdapterRuntimeContext{
		Context:      context.Background(),
		Runtime:      runtimeCtx,
		ConnectionID: runtimeCtx.ConnectionID,
	}, nexadapter.CredentialLookupOptions{
		Fields:     []string{"access_token"},
		Env:        []string{"TIKTOK_DISPLAY_ACCESS_TOKEN"},
		AllowValue: true,
		Label:      "TikTok Display access token",
	})
	if accessToken == "" {
		return nil, errors.New("missing TikTok Display access token in runtime credential")
	}

	runtimeAdapterCtx := nexadapter.AdapterRuntimeContext{
		Context:      context.Background(),
		Runtime:      runtimeCtx,
		ConnectionID: runtimeCtx.ConnectionID,
	}
	refreshToken := nexadapter.ReadCredential(runtimeAdapterCtx, nexadapter.CredentialLookupOptions{
		Fields: []string{"refresh_token"},
		Env:    []string{"TIKTOK_DISPLAY_REFRESH_TOKEN"},
		Label:  "TikTok Display refresh token",
	})
	clientKey := nexadapter.ReadCredential(runtimeAdapterCtx, nexadapter.CredentialLookupOptions{
		Fields: []string{"client_key", "client_id"},
		Env:    []string{"TIKTOK_DISPLAY_CLIENT_KEY", "TIKTOK_DISPLAY_CLIENT_ID"},
		Label:  "TikTok Display OAuth client key",
	})
	clientSecret := nexadapter.ReadCredential(runtimeAdapterCtx, nexadapter.CredentialLookupOptions{
		Fields: []string{"client_secret"},
		Env:    []string{"TIKTOK_DISPLAY_CLIENT_SECRET"},
		Label:  "TikTok Display OAuth client secret",
	})

	openID := strings.TrimSpace(nexadapter.FirstNonBlank(
		nexadapter.FieldValue(runtimeCtx.Credential.Fields, "open_id"),
		runtimeCtx.Credential.Account,
	))
	accessTokenExpiresAt := parseTikTokDisplayOptionalTime(nexadapter.FieldValue(runtimeCtx.Credential.Fields, "access_token_expires_at"))
	refreshTokenExpiresAt := parseTikTokDisplayOptionalTime(nexadapter.FieldValue(runtimeCtx.Credential.Fields, "refresh_token_expires_at"))
	displayName := strings.TrimSpace(nexadapter.FirstNonBlank(
		nexadapter.FieldValue(runtimeCtx.Credential.Fields, "display_name"),
		nexadapter.FieldValue(runtimeCtx.Credential.Fields, "profile_display_name"),
	))
	profileWebLink := strings.TrimSpace(nexadapter.FirstNonBlank(
		nexadapter.FieldValue(runtimeCtx.Credential.Fields, "profile_web_link"),
	))

	credentialRef := strings.TrimSpace(runtimeCtx.Credential.Ref)
	if credentialRef == "" {
		credentialRef = platformID + "/" + runtimeCtx.ConnectionID
	}

	state := &tiktokDisplayRuntime{
		ConnectionID:          runtimeCtx.ConnectionID,
		CredentialRef:         credentialRef,
		CredentialService:     platformID,
		AccessToken:           accessToken,
		RefreshToken:          refreshToken,
		ClientKey:             clientKey,
		ClientSecret:          clientSecret,
		AccessTokenExpiresAt:  accessTokenExpiresAt,
		RefreshTokenExpiresAt: refreshTokenExpiresAt,
		OpenID:                openID,
		DisplayName:           displayName,
		ProfileWebLink:        profileWebLink,
		RefreshBuffer:         tiktokDisplayOAuthRefreshBuffer(),
		ReauthWarning:         tiktokDisplayOAuthReauthWarning(),
	}
	state.overlayCachedOAuthState()
	return state, nil
}

func fetchTikTokDisplayProfileFromTikTok(ctx context.Context, accessToken string) (*tiktokDisplayUserInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, tiktokDisplayUserInfoURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create TikTok Display user/info request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(accessToken))
	req.Header.Set("Accept", "application/json")

	resp, err := tiktokDisplayHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call TikTok Display user/info: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read TikTok Display user/info response: %w", err)
	}

	var payload tiktokDisplayUserResponse
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &payload); err != nil {
			return nil, fmt.Errorf("parse TikTok Display user/info response: %w", err)
		}
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if payload.Error != nil && strings.TrimSpace(payload.Error.Message) != "" {
			return nil, fmt.Errorf("TikTok Display user/info failed: %s", payload.Error.Message)
		}
		return nil, fmt.Errorf("TikTok Display user/info failed with HTTP %d", resp.StatusCode)
	}
	if payload.Error != nil && strings.TrimSpace(payload.Error.Message) != "" && !strings.EqualFold(strings.TrimSpace(payload.Error.Code), "ok") {
		return nil, fmt.Errorf("TikTok Display user/info failed: %s", payload.Error.Message)
	}
	if payload.Data == nil || payload.Data.User == nil {
		return nil, errors.New("TikTok Display user/info response missing user data")
	}

	return payload.Data.User, nil
}
