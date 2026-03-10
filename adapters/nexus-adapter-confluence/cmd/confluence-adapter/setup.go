package main

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"

	"github.com/nexus-project/adapter-confluence/internal/atlassian"
	"github.com/nexus-project/adapter-confluence/internal/config"
)

const tokenGuide = "Generate an API token at https://id.atlassian.com/manage-profile/security/api-tokens"

func setupStart(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	store, err := config.NewSessionStore("")
	if err != nil {
		return nil, err
	}

	session := config.SetupSession{
		ID:        sessionIDOrDefault(req.SessionID),
		AccountID: fallbackAccountID(req.Account),
		Status:    string(nexadapter.SetupStatusRequiresInput),
		Step:      config.SetupStepCredentials,
		UpdatedAt: time.Now().UTC(),
	}

	if err := store.Save(session); err != nil {
		return nil, err
	}

	return credentialsPrompt(session), nil
}

func setupSubmit(ctx context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	store, err := config.NewSessionStore("")
	if err != nil {
		return nil, err
	}

	session, err := store.Load(sessionIDOrDefault(req.SessionID))
	if err != nil {
		return nil, err
	}

	switch session.Step {
	case config.SetupStepCredentials:
		return submitCredentials(ctx, store, session, req)
	case config.SetupStepSpaces:
		return submitSpaces(store, session, req)
	case config.SetupStepCompleted:
		return completedResult(session), nil
	default:
		return nil, fmt.Errorf("unknown setup step %q", session.Step)
	}
}

func setupStatus(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	store, err := config.NewSessionStore("")
	if err != nil {
		return nil, err
	}

	session, err := store.Load(sessionIDOrDefault(req.SessionID))
	if err != nil {
		return nil, err
	}

	switch session.Step {
	case config.SetupStepCredentials:
		return credentialsPrompt(session), nil
	case config.SetupStepSpaces:
		return spacesPrompt(session), nil
	case config.SetupStepCompleted:
		return completedResult(session), nil
	default:
		return nil, fmt.Errorf("unknown setup step %q", session.Step)
	}
}

func setupCancel(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	store, err := config.NewSessionStore("")
	if err != nil {
		return nil, err
	}

	sessionID := sessionIDOrDefault(req.SessionID)
	_ = store.Delete(sessionID)

	return &nexadapter.AdapterSetupResult{
		Status:    nexadapter.SetupStatusCancelled,
		SessionID: sessionID,
		Account:   fallbackAccountID(req.Account),
		Service:   serviceID,
		Message:   "Setup cancelled.",
	}, nil
}

func submitCredentials(ctx context.Context, store *config.SessionStore, session config.SetupSession, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	email := payloadString(req.Payload, "email")
	apiToken := payloadString(req.Payload, "api_token")
	site := payloadString(req.Payload, "site")

	missing := missingRequiredFields(map[string]string{
		"email":     email,
		"api_token": apiToken,
		"site":      site,
	})
	if len(missing) > 0 {
		return &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusRequiresInput,
			SessionID:    session.ID,
			Account:      session.AccountID,
			Service:      serviceID,
			Message:      fmt.Sprintf("Missing required fields: %s", strings.Join(missing, ", ")),
			Instructions: tokenGuide,
			Fields:       credentialFields(),
		}, nil
	}

	client := atlassian.NewClient(site, email, apiToken)
	spaces, err := client.ListSpaces(ctx, 250)
	if err != nil {
		return &nexadapter.AdapterSetupResult{
			Status:    nexadapter.SetupStatusFailed,
			SessionID: session.ID,
			Account:   session.AccountID,
			Service:   serviceID,
			Message:   fmt.Sprintf("Credential validation failed: %s", humanizeHealthError(err)),
			Metadata: map[string]any{
				"site": site,
			},
		}, nil
	}

	if len(spaces) == 0 {
		return &nexadapter.AdapterSetupResult{
			Status:    nexadapter.SetupStatusFailed,
			SessionID: session.ID,
			Account:   session.AccountID,
			Service:   serviceID,
			Message:   "Credential validation succeeded, but no Confluence spaces are accessible with this account.",
			Metadata: map[string]any{
				"site": site,
			},
		}, nil
	}

	spaceOptions := make([]config.SpaceOption, 0, len(spaces))
	for _, space := range spaces {
		spaceOptions = append(spaceOptions, config.SpaceOption{
			ID:    strings.TrimSpace(space.ID),
			Key:   strings.TrimSpace(space.Key),
			Name:  strings.TrimSpace(space.Name),
			Label: fmt.Sprintf("%s (%s)", strings.TrimSpace(space.Name), strings.TrimSpace(space.Key)),
		})
	}

	slices.SortFunc(spaceOptions, func(a, b config.SpaceOption) int {
		return strings.Compare(a.Key, b.Key)
	})

	session.Credentials = config.StoredCredentials{
		Email:    email,
		APIToken: apiToken,
		Site:     site,
	}
	session.SpaceOptions = spaceOptions
	session.Step = config.SetupStepSpaces
	session.UpdatedAt = time.Now().UTC()

	if err := store.Save(session); err != nil {
		return nil, err
	}

	return spacesPrompt(session), nil
}

func submitSpaces(store *config.SessionStore, session config.SetupSession, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	selectedKeys := payloadStrings(req.Payload, "spaces")
	if len(selectedKeys) == 0 {
		return &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusRequiresInput,
			SessionID:    session.ID,
			Account:      session.AccountID,
			Service:      serviceID,
			Message:      "Select at least one Confluence space to sync.",
			Instructions: "Choose one or more spaces and submit again.",
			Fields:       spacesField(session.SpaceOptions),
			Metadata: map[string]any{
				"spaces_available": len(session.SpaceOptions),
				"site_url":         siteURL(session.Credentials.Site),
			},
		}, nil
	}

	selected := make([]config.SpaceOption, 0, len(selectedKeys))
	for _, key := range selectedKeys {
		match := findSpaceOption(session.SpaceOptions, key)
		if match == nil {
			return &nexadapter.AdapterSetupResult{
				Status:    nexadapter.SetupStatusFailed,
				SessionID: session.ID,
				Account:   session.AccountID,
				Service:   serviceID,
				Message:   fmt.Sprintf("Unknown space key %q.", key),
			}, nil
		}
		selected = append(selected, *match)
	}

	accountID := normalizedAccountID(fallbackAccountID(session.AccountID), session.Credentials.Site)

	cfgStore, err := config.NewStore("")
	if err != nil {
		return nil, err
	}

	cfg, err := cfgStore.Load()
	if err != nil {
		return nil, err
	}

	cfg.Accounts[accountID] = config.AccountConfig{
		ID:               accountID,
		Email:            session.Credentials.Email,
		APIToken:         session.Credentials.APIToken,
		Site:             normalizeSite(session.Credentials.Site),
		SiteURL:          siteURL(session.Credentials.Site),
		SiteDisplayName:  siteDisplayNameFromSlug(session.Credentials.Site),
		Spaces:           selected,
		PollIntervalMins: 15,
		Sync:             config.DefaultSyncConfig(),
	}

	if err := cfgStore.Save(cfg); err != nil {
		return nil, err
	}

	session.AccountID = accountID
	session.SelectedSpaces = selected
	session.Step = config.SetupStepCompleted
	session.Status = string(nexadapter.SetupStatusCompleted)
	session.UpdatedAt = time.Now().UTC()

	if err := store.Save(session); err != nil {
		return nil, err
	}

	return completedResult(session), nil
}

func credentialsPrompt(session config.SetupSession) *nexadapter.AdapterSetupResult {
	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusRequiresInput,
		SessionID:    session.ID,
		Account:      session.AccountID,
		Service:      serviceID,
		Message:      "Enter your Atlassian credentials for Confluence Cloud.",
		Instructions: tokenGuide,
		Fields:       credentialFields(),
	}
}

func spacesPrompt(session config.SetupSession) *nexadapter.AdapterSetupResult {
	return &nexadapter.AdapterSetupResult{
		Status:    nexadapter.SetupStatusRequiresInput,
		SessionID: session.ID,
		Account:   session.AccountID,
		Service:   serviceID,
		Message:   "Select the Confluence spaces to sync.",
		Fields:    spacesField(session.SpaceOptions),
		Metadata: map[string]any{
			"spaces_available": len(session.SpaceOptions),
			"site_url":         siteURL(session.Credentials.Site),
		},
	}
}

func completedResult(session config.SetupSession) *nexadapter.AdapterSetupResult {
	spaceKeys := make([]string, 0, len(session.SelectedSpaces))
	for _, space := range session.SelectedSpaces {
		spaceKeys = append(spaceKeys, space.Key)
	}

	return &nexadapter.AdapterSetupResult{
		Status:    nexadapter.SetupStatusCompleted,
		SessionID: session.ID,
		Account:   session.AccountID,
		Service:   serviceID,
		Message:   fmt.Sprintf("Confluence adapter configured. Tracking %d spaces: %s.", len(spaceKeys), strings.Join(spaceKeys, ", ")),
		SecretFields: map[string]string{
			"email":     session.Credentials.Email,
			"api_token": session.Credentials.APIToken,
		},
		Metadata: map[string]any{
			"site":   normalizeSite(session.Credentials.Site),
			"spaces": spaceKeys,
		},
	}
}

func credentialFields() []nexadapter.AdapterAuthField {
	return []nexadapter.AdapterAuthField{
		{
			Name:        "email",
			Label:       "Atlassian Email",
			Type:        "text",
			Required:    true,
			Placeholder: "you@company.com",
		},
		{
			Name:     "api_token",
			Label:    "API Token",
			Type:     "secret",
			Required: true,
		},
		{
			Name:        "site",
			Label:       "Site Name",
			Type:        "text",
			Required:    true,
			Placeholder: "yoursite",
		},
	}
}

func spacesField(options []config.SpaceOption) []nexadapter.AdapterAuthField {
	fieldOptions := make([]nexadapter.AdapterAuthFieldOption, 0, len(options))
	for _, option := range options {
		fieldOptions = append(fieldOptions, nexadapter.AdapterAuthFieldOption{
			Label: option.Label,
			Value: option.Key,
		})
	}

	return []nexadapter.AdapterAuthField{
		{
			Name:     "spaces",
			Label:    "Spaces",
			Type:     "select",
			Required: true,
			Options:  fieldOptions,
		},
	}
}

func sessionIDOrDefault(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed != "" {
		return trimmed
	}
	return fmt.Sprintf("confluence-setup-%d", time.Now().UnixNano())
}

func normalizedAccountID(explicit, site string) string {
	if trimmed := strings.TrimSpace(explicit); trimmed != "" && trimmed != "default" {
		return sanitizeToken(trimmed)
	}
	siteToken := sanitizeToken(normalizeSite(site))
	if siteToken == "" {
		return "default"
	}
	return siteToken + "-confluence"
}

func fallbackAccountID(account string) string {
	trimmed := strings.TrimSpace(account)
	if trimmed == "" {
		return "default"
	}
	return trimAndLower(trimmed)
}

func payloadString(payload map[string]any, key string) string {
	if payload == nil {
		return ""
	}
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	value, ok := raw.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func payloadStrings(payload map[string]any, key string) []string {
	if payload == nil {
		return nil
	}
	raw, ok := payload[key]
	if !ok {
		return nil
	}
	switch value := raw.(type) {
	case []string:
		out := make([]string, 0, len(value))
		for _, item := range value {
			if trimmed := strings.TrimSpace(item); trimmed != "" {
				out = append(out, trimmed)
			}
		}
		return out
	case []any:
		out := make([]string, 0, len(value))
		for _, item := range value {
			if text, ok := item.(string); ok {
				if trimmed := strings.TrimSpace(text); trimmed != "" {
					out = append(out, trimmed)
				}
			}
		}
		return out
	case string:
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return []string{trimmed}
		}
	}
	return nil
}

func missingRequiredFields(fields map[string]string) []string {
	missing := make([]string, 0, len(fields))
	for key, value := range fields {
		if strings.TrimSpace(value) == "" {
			missing = append(missing, key)
		}
	}
	slices.Sort(missing)
	return missing
}

func findSpaceOption(options []config.SpaceOption, key string) *config.SpaceOption {
	for i := range options {
		if strings.EqualFold(strings.TrimSpace(options[i].Key), strings.TrimSpace(key)) {
			return &options[i]
		}
	}
	return nil
}

func normalizeSite(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if strings.HasPrefix(trimmed, "https://") || strings.HasPrefix(trimmed, "http://") {
		trimmed = strings.TrimSuffix(trimmed, "/")
		trimmed = strings.TrimSuffix(trimmed, "/wiki")
		return trimmed
	}
	trimmed = strings.TrimPrefix(trimmed, "https://")
	trimmed = strings.TrimPrefix(trimmed, "http://")
	trimmed = strings.TrimSuffix(trimmed, "/")
	trimmed = strings.TrimSuffix(trimmed, "/wiki")
	trimmed = strings.TrimSuffix(trimmed, ".atlassian.net")
	return trimAndLower(trimmed)
}

func siteURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
		return strings.TrimSuffix(trimmed, "/") + "/wiki"
	}
	site := normalizeSite(trimmed)
	if site == "" {
		return ""
	}
	return "https://" + site + ".atlassian.net/wiki"
}

func siteDisplayNameFromSlug(raw string) string {
	site := normalizeSite(raw)
	if site == "" {
		return ""
	}
	parts := strings.FieldsFunc(site, func(r rune) bool {
		return r == '-' || r == '_'
	})
	for i := range parts {
		if parts[i] == "" {
			continue
		}
		parts[i] = strings.ToUpper(parts[i][:1]) + parts[i][1:]
	}
	return strings.Join(parts, " ")
}

func trimAndLower(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func sanitizeToken(raw string) string {
	var b strings.Builder
	for _, ch := range trimAndLower(raw) {
		switch {
		case ch >= 'a' && ch <= 'z':
			b.WriteRune(ch)
		case ch >= '0' && ch <= '9':
			b.WriteRune(ch)
		case ch == '-', ch == '_':
			b.WriteRune(ch)
		default:
			b.WriteByte('-')
		}
	}
	return strings.Trim(b.String(), "-")
}
