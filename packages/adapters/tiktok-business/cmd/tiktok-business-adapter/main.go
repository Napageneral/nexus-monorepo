package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName            = "tiktok-business-adapter"
	adapterVersion         = "0.1.0"
	platformID             = "tiktok-business"
	defaultBusinessAPIBase = "https://business-api.tiktok.com/open_api/v1.3"
	defaultLookupTimeout   = 15 * time.Second
)

var (
	businessAPIBaseURL = defaultBusinessAPIBase
	businessHTTPClient = &http.Client{Timeout: defaultLookupTimeout}
)

type tiktokBusinessState struct {
	ConnectionID         string
	CredentialRef        string
	AccessToken          string
	AppID                string
	AppSecret            string
	BoundAdvertiserID    string
	VisibleAdvertiserIDs []string
}

type tiktokAdvertiserLookupResponse struct {
	Code    int            `json:"code"`
	Message string         `json:"message"`
	Data    map[string]any `json:"data"`
}

func main() {
	nexadapter.Run(nexadapter.DefineAdapter(adapterConfig()))
}

func adapterConfig() nexadapter.DefineAdapterConfig[struct{}] {
	return nexadapter.DefineAdapterConfig[struct{}]{
		Platform:          platformID,
		Name:              adapterName,
		Version:           adapterVersion,
		MultiAccount:      true,
		CredentialService: "tiktok-business",
		Connection: nexadapter.ConnectionHandlers[struct{}]{
			Connections: connections,
			Health:      health,
		},
		Ingest: nexadapter.IngestHandlers[struct{}]{
			Monitor: func(ctx nexadapter.AdapterContext[struct{}], emit nexadapter.EmitFunc) error {
				return monitor(ctx, emit)
			},
			Backfill: func(ctx nexadapter.AdapterContext[struct{}], since time.Time, emit nexadapter.EmitFunc) error {
				return backfill(ctx, since, emit)
			},
		},
		Methods: map[string]nexadapter.DeclaredMethod[struct{}]{},
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					ID:      "tiktok_business_direct_credentials",
					Type:    "api_key",
					Label:   "Enter TikTok Business Credentials",
					Icon:    "key",
					Service: "tiktok-business",
					Fields: []nexadapter.AdapterAuthField{
						{
							Name:        "access_token",
							Label:       "TikTok Business Access Token",
							Type:        "secret",
							Required:    true,
							Placeholder: "act...",
						},
						{
							Name:        "advertiser_id",
							Label:       "Bound Advertiser ID",
							Type:        "text",
							Required:    true,
							Placeholder: "7563060383863488513",
						},
						{
							Name:        "app_id",
							Label:       "TikTok App ID",
							Type:        "text",
							Required:    false,
							Placeholder: "1234567890",
						},
						{
							Name:        "app_secret",
							Label:       "TikTok App Secret",
							Type:        "secret",
							Required:    false,
							Placeholder: "tiktok_app_secret",
						},
						{
							Name:        "advertiser_ids",
							Label:       "Visible Advertiser IDs",
							Type:        "text",
							Required:    false,
							Placeholder: "7563060383863488513,7563060383863488514",
						},
					},
				},
			},
			SetupGuide: "Provide a TikTok Business access token and one bound advertiser id. Add app_id and app_secret when you want Nex to verify advertiser visibility against TikTok's advertiser lookup endpoint.",
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

func connections(ctx nexadapter.AdapterContext[struct{}]) ([]nexadapter.AdapterConnectionIdentity, error) {
	state, err := loadTikTokBusinessState(ctx)
	if err != nil {
		return []nexadapter.AdapterConnectionIdentity{}, nil
	}

	status := "error"
	if state.AccessToken != "" && state.BoundAdvertiserID != "" {
		status = "ready"
	}

	displayName := state.ConnectionID
	if state.BoundAdvertiserID != "" {
		displayName = fmt.Sprintf("%s (%s)", state.ConnectionID, state.BoundAdvertiserID)
	}

	return []nexadapter.AdapterConnectionIdentity{
		{
			ID:            state.ConnectionID,
			DisplayName:   displayName,
			Account:       state.BoundAdvertiserID,
			CredentialRef: state.CredentialRef,
			Status:        status,
		},
	}, nil
}

func health(ctx nexadapter.AdapterContext[struct{}]) (*nexadapter.AdapterHealth, error) {
	state, err := loadTikTokBusinessState(ctx)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: ctx.ConnectionID,
			Error:        err.Error(),
		}, nil
	}

	details := map[string]any{
		"credential_ref":            state.CredentialRef,
		"credential_service":        platformID,
		"bound_advertiser_id":       state.BoundAdvertiserID,
		"configured_advertiser_ids": state.VisibleAdvertiserIDs,
	}

	if state.AccessToken == "" {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: state.ConnectionID,
			Account:      state.BoundAdvertiserID,
			Error:        "missing TikTok Business access token",
			Details:      details,
		}, nil
	}
	if state.BoundAdvertiserID == "" {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: state.ConnectionID,
			Account:      state.BoundAdvertiserID,
			Error:        "missing bound advertiser_id",
			Details:      details,
		}, nil
	}

	visibleAdvertiserIDs := append([]string{}, state.VisibleAdvertiserIDs...)
	lookupSource := "configured_credentials"

	if state.AppID != "" && state.AppSecret != "" {
		lookupIDs, lookupErr := lookupVisibleAdvertiserIDs(ctx.Context, state)
		if lookupErr != nil {
			details["lookup_error"] = lookupErr.Error()
		} else {
			visibleAdvertiserIDs = append(visibleAdvertiserIDs, lookupIDs...)
			lookupSource = "tiktok_business_lookup"
		}
	}

	visibleAdvertiserIDs = uniqueStrings(visibleAdvertiserIDs)
	details["visible_advertiser_ids"] = visibleAdvertiserIDs
	details["lookup_source"] = lookupSource

	if len(visibleAdvertiserIDs) > 0 && !containsString(visibleAdvertiserIDs, state.BoundAdvertiserID) {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: state.ConnectionID,
			Account:      state.BoundAdvertiserID,
			Error:        fmt.Sprintf("bound advertiser_id %q was not visible to TikTok Business", state.BoundAdvertiserID),
			Details:      details,
		}, nil
	}

	details["verification"] = "binding_only"
	if state.AppID != "" && state.AppSecret != "" {
		details["verification"] = "advertiser_lookup"
	}
	if state.AppID == "" || state.AppSecret == "" {
		details["warning"] = "app_id/app_secret not configured; advertiser lookup skipped"
	}

	return &nexadapter.AdapterHealth{
		Connected:    true,
		ConnectionID: state.ConnectionID,
		Account:      state.BoundAdvertiserID,
		LastEventAt:  time.Now().UnixMilli(),
		Details:      details,
	}, nil
}

func loadTikTokBusinessState(ctx nexadapter.AdapterContext[struct{}]) (*tiktokBusinessState, error) {
	connectionID, err := nexadapter.RequireConnection(ctx.ConnectionID)
	if err != nil {
		return nil, err
	}
	if ctx.Runtime == nil || ctx.Runtime.Credential == nil {
		return nil, errors.New("missing TikTok Business runtime credential")
	}

	credential := ctx.Runtime.Credential
	fields := credential.Fields

	accessToken := nexadapter.FirstNonBlank(
		credential.Value,
		nexadapter.FieldValue(fields, "access_token"),
		nexadapter.FieldValue(fields, "accessToken"),
	)
	boundAdvertiserID := nexadapter.FirstNonBlank(
		nexadapter.FieldValue(fields, "advertiser_id"),
		nexadapter.FieldValue(fields, "selected_advertiser_id"),
		nexadapter.FieldValue(fields, "account_id"),
	)
	if boundAdvertiserID == "" && looksLikeTikTokAdvertiserID(credential.Account) {
		boundAdvertiserID = strings.TrimSpace(credential.Account)
	}
	visibleAdvertiserIDs := parseIDList(
		nexadapter.FirstNonBlank(
			nexadapter.FieldValue(fields, "advertiser_ids"),
			nexadapter.FieldValue(fields, "visible_advertiser_ids"),
		),
	)

	return &tiktokBusinessState{
		ConnectionID:         connectionID,
		CredentialRef:        credentialRef(ctx),
		AccessToken:          accessToken,
		AppID:                nexadapter.FirstNonBlank(nexadapter.FieldValue(fields, "app_id"), nexadapter.FieldValue(fields, "appId")),
		AppSecret:            nexadapter.FirstNonBlank(nexadapter.FieldValue(fields, "app_secret"), nexadapter.FieldValue(fields, "appSecret"), nexadapter.FieldValue(fields, "secret")),
		BoundAdvertiserID:    boundAdvertiserID,
		VisibleAdvertiserIDs: visibleAdvertiserIDs,
	}, nil
}

func credentialRef(ctx nexadapter.AdapterContext[struct{}]) string {
	if ctx.Runtime == nil || ctx.Runtime.Credential == nil {
		return "tiktok-business/" + ctx.ConnectionID
	}
	if ref := strings.TrimSpace(ctx.Runtime.Credential.Ref); ref != "" {
		return ref
	}
	return "tiktok-business/" + ctx.ConnectionID
}

func lookupVisibleAdvertiserIDs(ctx context.Context, state *tiktokBusinessState) ([]string, error) {
	if state.AppID == "" || state.AppSecret == "" {
		return nil, errors.New("TikTok Business app_id and app_secret are required for advertiser lookup")
	}

	query := url.Values{}
	query.Set("access_token", state.AccessToken)
	query.Set("app_id", state.AppID)
	query.Set("secret", state.AppSecret)

	endpoint := strings.TrimRight(businessAPIBaseURL, "/") + "/oauth2/advertiser/get/?" + query.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}

	resp, err := businessHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var payload tiktokAdvertiserLookupResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode TikTok Business advertiser lookup response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("TikTok Business advertiser lookup failed with HTTP %d", resp.StatusCode)
	}
	if payload.Code != 0 {
		if payload.Message != "" {
			return nil, errors.New(payload.Message)
		}
		return nil, errors.New("TikTok Business advertiser lookup returned a non-zero code")
	}

	ids := extractAdvertiserIDs(payload.Data)
	if len(ids) == 0 {
		return nil, errors.New("TikTok Business advertiser lookup returned no advertiser ids")
	}
	return ids, nil
}

func extractAdvertiserIDs(data map[string]any) []string {
	candidates := []any{
		data["advertiser_ids"],
		data["list"],
		data["items"],
		data["advertisers"],
	}
	ids := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		ids = append(ids, collectIDs(candidate)...)
	}
	return uniqueStrings(ids)
}

func collectIDs(value any) []string {
	switch typed := value.(type) {
	case nil:
		return nil
	case string:
		return parseIDList(typed)
	case float64:
		return []string{strings.TrimSpace(fmt.Sprintf("%.0f", typed))}
	case int:
		return []string{strings.TrimSpace(fmt.Sprintf("%d", typed))}
	case []any:
		var ids []string
		for _, item := range typed {
			ids = append(ids, collectIDs(item)...)
		}
		return ids
	case map[string]any:
		var ids []string
		for _, key := range []string{"advertiser_id", "id", "account_id"} {
			if candidate, ok := typed[key]; ok {
				ids = append(ids, collectIDs(candidate)...)
			}
		}
		for _, key := range []string{"list", "items", "advertisers", "data"} {
			if candidate, ok := typed[key]; ok {
				ids = append(ids, collectIDs(candidate)...)
			}
		}
		return ids
	default:
		return parseIDList(fmt.Sprint(typed))
	}
}

func parseIDList(value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}

	parts := strings.FieldsFunc(value, func(r rune) bool {
		switch r {
		case ',', ';', '\n', '\t', ' ':
			return true
		default:
			return false
		}
	})
	return uniqueStrings(parts)
}

func looksLikeTikTokAdvertiserID(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func uniqueStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func containsString(values []string, target string) bool {
	target = strings.TrimSpace(target)
	for _, value := range values {
		if strings.TrimSpace(value) == target {
			return true
		}
	}
	return false
}
