package main

import (
	"context"
	"fmt"
	"os"
	"slices"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName       = "Jira Cloud"
	adapterVersion    = "1.0.0"
	platformID        = "jira"
	credentialService = "atlassian"
)

func main() {
	os.Args = preprocessCLIArgs(os.Args)
	nexadapter.Run(nexadapter.DefineAdapter(adapterConfig()))
}

func adapterConfig() nexadapter.DefineAdapterConfig[struct{}] {
	return nexadapter.DefineAdapterConfig[struct{}]{
		Platform:          platformID,
		Name:              adapterName,
		Version:           adapterVersion,
		CredentialService: credentialService,
		MultiAccount:      true,
		Connection: nexadapter.ConnectionHandlers[struct{}]{
			Accounts: func(ctx nexadapter.AdapterContext[struct{}]) ([]nexadapter.AdapterAccount, error) {
				return accounts(ctx.Context)
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
		Delivery: nexadapter.DeliveryHandlers[struct{}]{
			Send: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.SendRequest) (*nexadapter.DeliveryResult, error) {
				return send(ctx.Context, req)
			},
		},
		Setup: nexadapter.SetupHandlers[struct{}]{
			Start: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
				return setupStart(ctx.Context, req)
			},
			Submit: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
				return setupSubmit(ctx.Context, req)
			},
			Status: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
				return setupStatus(ctx.Context, req)
			},
			Cancel: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
				return setupCancel(ctx.Context, req)
			},
		},
		Methods: map[string]nexadapter.DeclaredMethod[struct{}]{},
		Capabilities: nexadapter.ChannelCapabilities{
			TextLimit:             32768,
			SupportsMarkdown:      true,
			MarkdownFlavor:        "standard",
			SupportsTables:        false,
			SupportsCodeBlocks:    true,
			SupportsEmbeds:        false,
			SupportsThreads:       false,
			SupportsReactions:     false,
			SupportsPolls:         false,
			SupportsButtons:       false,
			SupportsEdit:          false,
			SupportsDelete:        false,
			SupportsMedia:         false,
			SupportsVoiceNotes:    false,
			SupportsStreamingEdit: false,
		},
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					ID:      "atlassian_api_key",
					Type:    "api_key",
					Label:   "Atlassian API Token",
					Icon:    "jira",
					Service: credentialService,
					Fields: []nexadapter.AdapterAuthField{
						{
							Name:        "site",
							Label:       "Site Name",
							Type:        "text",
							Required:    true,
							Placeholder: "yoursite (from yoursite.atlassian.net)",
						},
						{
							Name:        "email",
							Label:       "Email",
							Type:        "text",
							Required:    true,
							Placeholder: "you@company.com",
						},
						{
							Name:        "api_token",
							Label:       "API Token",
							Type:        "secret",
							Required:    true,
							Placeholder: "Atlassian API token",
						},
					},
				},
			},
			SetupGuide: "Generate an API token at https://id.atlassian.com/manage-profile/security/api-tokens",
		},
	}
}

func info(ctx context.Context) (*nexadapter.AdapterInfo, error) {
	adapter := nexadapter.DefineAdapter(adapterConfig())
	return adapter.Operations.AdapterInfo(ctx)
}

func accounts(_ context.Context) ([]nexadapter.AdapterAccount, error) {
	runtimeContext, err := loadRuntimeContext()
	if err != nil {
		return []nexadapter.AdapterAccount{}, nil
	}

	displayName := runtimeContext.ConnectionID
	if site := configString(runtimeContext.Config, "site"); site != "" {
		displayName = fmt.Sprintf("%s (%s)", runtimeContext.ConnectionID, normalizeSite(site))
	}

	return []nexadapter.AdapterAccount{
		{
			ID:            runtimeContext.ConnectionID,
			DisplayName:   displayName,
			CredentialRef: credentialService + "/" + runtimeContext.ConnectionID,
			Status:        "ready",
		},
	}, nil
}

func setupStart(ctx context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	site := payloadString(req.Payload, "site")
	email := payloadString(req.Payload, "email")
	apiToken := payloadString(req.Payload, "api_token")

	missing := missingRequiredFields(map[string]string{
		"site":      site,
		"email":     email,
		"api_token": apiToken,
	})
	if len(missing) > 0 {
		return failedSetupResult(req, fmt.Sprintf("Missing required fields: %s", strings.Join(missing, ", "))), nil
	}

	client, err := newJiraClient(site, email, apiToken)
	if err != nil {
		return failedSetupResult(req, err.Error()), nil
	}

	user, err := client.getMyself(ctx)
	if err != nil {
		return failedSetupResult(req, err.Error()), nil
	}

	projects, err := client.getProjects(ctx)
	if err != nil {
		return failedSetupResult(req, err.Error()), nil
	}

	sessionID := req.SessionID
	if strings.TrimSpace(sessionID) == "" {
		sessionID, err = newSetupSessionID()
		if err != nil {
			return nil, err
		}
	}

	projectOptions := make([]nexadapter.AdapterAuthFieldOption, 0, len(projects))
	projectMap := make(map[string]nexadapter.AdapterAuthFieldOption, len(projects))
	for _, project := range projects {
		option := nexadapter.AdapterAuthFieldOption{
			Label: fmt.Sprintf("%s (%s)", project.Name, project.Key),
			Value: project.Key,
		}
		projectOptions = append(projectOptions, option)
		projectMap[project.Key] = option
	}

	session := setupSession{
		SessionID:    sessionID,
		ConnectionID: resolvedConnectionID(req.ConnectionID, client.site),
		Site:         client.site,
		Email:        email,
		APIToken:     apiToken,
		User:         *user,
		ProjectMap:   projectMap,
		Status:       nexadapter.SetupStatusRequiresInput,
	}
	if err := saveSetupSession(session); err != nil {
		return nil, err
	}

	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusRequiresInput,
		SessionID:    sessionID,
		ConnectionID: session.ConnectionID,
		Service:      credentialService,
		Message: fmt.Sprintf(
			"Credentials valid. Authenticated as %s (%s). Select projects to sync.",
			user.DisplayName,
			firstNonBlank(user.EmailAddress, email),
		),
		Fields: []nexadapter.AdapterAuthField{
			{
				Name:     "projects",
				Label:    "Projects",
				Type:     "select",
				Required: true,
				Options:  projectOptions,
			},
		},
		SecretFields: map[string]string{
			"site":      client.site,
			"email":     email,
			"api_token": apiToken,
		},
	}, nil
}

func setupSubmit(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	session, err := loadSetupSession(req.SessionID)
	if err != nil {
		return &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusFailed,
			SessionID:    req.SessionID,
			ConnectionID: req.ConnectionID,
			Service:      credentialService,
			Message:      err.Error(),
		}, nil
	}

	if session.Status == nexadapter.SetupStatusCancelled {
		return &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusFailed,
			SessionID:    session.SessionID,
			ConnectionID: session.ConnectionID,
			Service:      credentialService,
			Message:      "setup session has been cancelled",
		}, nil
	}

	projects := payloadStringSlice(req.Payload, "projects")
	if len(projects) == 0 {
		return &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusFailed,
			SessionID:    session.SessionID,
			ConnectionID: session.ConnectionID,
			Service:      credentialService,
			Message:      "at least one project must be selected",
		}, nil
	}

	invalid := make([]string, 0)
	for _, project := range projects {
		if _, ok := session.ProjectMap[project]; !ok {
			invalid = append(invalid, project)
		}
	}
	if len(invalid) > 0 {
		return &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusFailed,
			SessionID:    session.SessionID,
			ConnectionID: session.ConnectionID,
			Service:      credentialService,
			Message:      fmt.Sprintf("unknown project keys: %s", strings.Join(invalid, ", ")),
		}, nil
	}

	session.Status = nexadapter.SetupStatusCompleted
	session.Projects = append([]string(nil), projects...)
	if err := saveSetupSession(*session); err != nil {
		return nil, err
	}

	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusCompleted,
		SessionID:    session.SessionID,
		ConnectionID: session.ConnectionID,
		Service:      credentialService,
		Message:      fmt.Sprintf("Jira adapter configured. Syncing projects: %s.", strings.Join(projects, ", ")),
		SecretFields: map[string]string{
			"site":      session.Site,
			"email":     session.Email,
			"api_token": session.APIToken,
		},
		Metadata: map[string]any{
			"site":              session.Site,
			"projects":          append([]string(nil), session.Projects...),
			"user_display_name": session.User.DisplayName,
			"user_id":           session.User.AccountID,
		},
	}, nil
}

func setupStatus(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	session, err := loadSetupSession(req.SessionID)
	if err != nil {
		return &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusFailed,
			SessionID:    req.SessionID,
			ConnectionID: req.ConnectionID,
			Service:      credentialService,
			Message:      err.Error(),
		}, nil
	}

	projectOptions := make([]nexadapter.AdapterAuthFieldOption, 0, len(session.ProjectMap))
	for _, option := range session.ProjectMap {
		projectOptions = append(projectOptions, option)
	}
	slices.SortFunc(projectOptions, func(a, b nexadapter.AdapterAuthFieldOption) int {
		return strings.Compare(a.Value, b.Value)
	})

	return &nexadapter.AdapterSetupResult{
		Status:       session.Status,
		SessionID:    session.SessionID,
		ConnectionID: session.ConnectionID,
		Service:      credentialService,
		Message:      "Setup session loaded.",
		Fields: []nexadapter.AdapterAuthField{
			{
				Name:     "projects",
				Label:    "Projects",
				Type:     "select",
				Required: true,
				Options:  projectOptions,
			},
		},
		SecretFields: map[string]string{
			"site":      session.Site,
			"email":     session.Email,
			"api_token": session.APIToken,
		},
		Metadata: map[string]any{
			"site":              session.Site,
			"projects":          append([]string(nil), session.Projects...),
			"user_display_name": session.User.DisplayName,
			"user_id":           session.User.AccountID,
		},
	}, nil
}

func setupCancel(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	session, err := loadSetupSession(req.SessionID)
	if err != nil {
		return &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusFailed,
			SessionID:    req.SessionID,
			ConnectionID: req.ConnectionID,
			Service:      credentialService,
			Message:      err.Error(),
		}, nil
	}

	session.Status = nexadapter.SetupStatusCancelled
	if err := saveSetupSession(*session); err != nil {
		return nil, err
	}

	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusCancelled,
		SessionID:    session.SessionID,
		ConnectionID: session.ConnectionID,
		Service:      credentialService,
		Message:      "Setup cancelled.",
	}, nil
}

func health(ctx context.Context, connection string) (*nexadapter.AdapterHealth, error) {
	client, cfg, err := loadJiraClientFromRuntime()
	resolvedConnection := strings.TrimSpace(connection)
	if resolvedConnection == "" && cfg != nil {
		resolvedConnection = cfg.ConnectionID
	}
	if resolvedConnection == "" {
		resolvedConnection = "jira"
	}
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: resolvedConnection,
			Error:        err.Error(),
		}, nil
	}

	user, err := client.getMyself(ctx)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: resolvedConnection,
			Error:        err.Error(),
		}, nil
	}

	watermarks := map[string]string{}
	for project, watermark := range cfg.Watermarks {
		watermarks[project] = watermark.UTC().Format(time.RFC3339Nano)
	}

	return &nexadapter.AdapterHealth{
		Connected:    true,
		ConnectionID: resolvedConnection,
		LastEventAt:  time.Now().UnixMilli(),
		Details: map[string]any{
			"site":          fmt.Sprintf("%s.atlassian.net", client.site),
			"user":          user.DisplayName,
			"user_id":       user.AccountID,
			"projects":      append([]string(nil), cfg.Projects...),
			"watermarks":    watermarks,
			"poll_interval": cfg.PollInterval.String(),
		},
	}, nil
}

func payloadString(payload map[string]any, key string) string {
	if payload == nil {
		return ""
	}
	raw, ok := payload[key]
	if !ok || raw == nil {
		return ""
	}
	switch value := raw.(type) {
	case string:
		return strings.TrimSpace(value)
	default:
		return strings.TrimSpace(fmt.Sprintf("%v", value))
	}
}

func payloadStringSlice(payload map[string]any, key string) []string {
	if payload == nil {
		return nil
	}
	raw, ok := payload[key]
	if !ok || raw == nil {
		return nil
	}

	var values []string
	switch list := raw.(type) {
	case []string:
		values = append(values, list...)
	case []any:
		for _, item := range list {
			if item == nil {
				continue
			}
			text := strings.TrimSpace(fmt.Sprintf("%v", item))
			if text != "" {
				values = append(values, text)
			}
		}
	default:
		text := strings.TrimSpace(fmt.Sprintf("%v", list))
		if text != "" {
			values = append(values, text)
		}
	}
	return values
}

func missingRequiredFields(fields map[string]string) []string {
	var missing []string
	for key, value := range fields {
		if strings.TrimSpace(value) == "" {
			missing = append(missing, key)
		}
	}
	slices.Sort(missing)
	return missing
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func failedSetupResult(req nexadapter.AdapterSetupRequest, message string) *nexadapter.AdapterSetupResult {
	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusFailed,
		SessionID:    strings.TrimSpace(req.SessionID),
		ConnectionID: resolvedConnectionID(req.ConnectionID, payloadString(req.Payload, "site")),
		Service:      credentialService,
		Message:      message,
	}
}

func resolvedConnectionID(connection, site string) string {
	if trimmed := strings.TrimSpace(connection); trimmed != "" {
		return trimmed
	}
	if normalizedSite := normalizeSite(site); normalizedSite != "" {
		return normalizedSite + "-jira"
	}
	return "jira"
}

func configStringSlice(config map[string]any, key string) []string {
	if config == nil {
		return nil
	}
	raw, ok := config[key]
	if !ok || raw == nil {
		return nil
	}
	switch list := raw.(type) {
	case []string:
		return append([]string(nil), list...)
	case []any:
		values := make([]string, 0, len(list))
		for _, item := range list {
			if item == nil {
				continue
			}
			text := strings.TrimSpace(fmt.Sprintf("%v", item))
			if text != "" {
				values = append(values, text)
			}
		}
		return values
	default:
		return nil
	}
}

func configString(config map[string]any, key string) string {
	if config == nil {
		return ""
	}
	raw, ok := config[key]
	if !ok || raw == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprintf("%v", raw))
}

func stringsTrimmed(value string) string {
	return strings.TrimSpace(value)
}
