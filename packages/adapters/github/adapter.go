package main

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"net/http"
	"sort"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
	core "github.com/nexus-project/github/internal/gitadapter"
)

const (
	adapterName                        = "GitHub Adapter"
	adapterVersion                     = "1.0.12"
	platformID                         = "github"
	backfillMaxConsecutiveRateLimits   = 5
	backfillMaxConsecutiveTransientErr = 4
	backfillOptionalRateLimitRetries   = 2
	backfillOptionalTransientRetries   = 2
	backfillHistoricalCommitDiffLimit  = 50
	backfillHistoricalPRArtifactLimit  = 50
	directReadMaxConsecutiveRateLimits = 11
	directReadMaxConsecutiveTransient  = 4
	directReadBaseCooldown             = 1500 * time.Millisecond
	directReadMaxCooldown              = 20 * time.Second
	directReadMaxTotalCooldown         = 3 * time.Minute
)

type backfillRetryBudget struct {
	maxRateLimitRetries int
	maxTransientRetries int
}

var (
	backfillPrimaryRetryBudget = backfillRetryBudget{
		maxRateLimitRetries: backfillMaxConsecutiveRateLimits,
		maxTransientRetries: backfillMaxConsecutiveTransientErr,
	}
	backfillOptionalRetryBudget = backfillRetryBudget{
		maxRateLimitRetries: backfillOptionalRateLimitRetries,
		maxTransientRetries: backfillOptionalTransientRetries,
	}
)

type GitAdapter struct {
}

type setupSession struct {
	Account       string
	PublicAccount string
	Provider      string
	Host          string
	Username      string
	Token         string
	Principal     string
	Workspace     string
	Repositories  []Repository
	CredentialRef string
}

func newGitAdapter() *GitAdapter {
	return &GitAdapter{}
}

func (a *GitAdapter) Info(_ context.Context) (*nexadapter.AdapterInfo, error) {
	adapter := nexadapter.DefineAdapter(adapterConfig(a))
	return adapter.Operations.AdapterInfo(context.Background())
}

func (a *GitAdapter) Health(ctx context.Context, account string) (*nexadapter.AdapterHealth, error) {
	accountID, err := nexadapter.RequireConnection(account)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: account,
			Error:        err.Error(),
		}, nil
	}

	config, provider, err := loadRuntimeAccount(accountID)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: accountID,
			Error:        err.Error(),
		}, nil
	}

	principal := authenticatedPrincipal(provider, config)
	details := healthDetails(provider, config, principal)

	if err := provider.ValidateCredentials(ctx, config); err != nil {
		if apiErr, ok := githubRateLimitAPIError(err); ok {
			principal = authenticatedPrincipal(provider, config)
			details = healthDetails(provider, config, principal)
			details["rate_limited"] = true
			details["warning"] = err.Error()
			if apiErr.RetryAfterMs > 0 {
				details["retry_after_ms"] = apiErr.RetryAfterMs
			}
			return &nexadapter.AdapterHealth{
				Connected:      true,
				ConnectionID:   accountID,
				Account:        principal,
				AccountContact: connectionAccountContact(config.Provider, config.Host, principal),
				Details:        details,
			}, nil
		}
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: accountID,
			Error:        err.Error(),
		}, nil
	}
	principal = authenticatedPrincipal(provider, config)
	details = healthDetails(provider, config, principal)
	return &nexadapter.AdapterHealth{
		Connected:      true,
		ConnectionID:   accountID,
		Account:        principal,
		AccountContact: connectionAccountContact(config.Provider, config.Host, principal),
		Details:        details,
	}, nil
}

func healthDetails(provider Provider, config AccountConfig, principal string) map[string]any {
	details := map[string]any{
		"provider":         config.Provider,
		"repos_tracked":    len(config.Repositories),
		"adapter_contacts": adapterContactSeeds(config.Provider, config.Host, principal),
	}
	if report, ok := provider.(interface{ ValidationDetails() map[string]any }); ok {
		maps.Copy(details, report.ValidationDetails())
	}
	if detailString(details, "user") == "" && strings.TrimSpace(principal) != "" {
		details["user"] = principal
	}
	return details
}

func (a *GitAdapter) ListConnections(_ context.Context) ([]nexadapter.AdapterConnectionIdentity, error) {
	accounts, err := LoadAccounts(adapterStateDir())
	if err != nil {
		return nil, err
	}

	list := make([]nexadapter.AdapterConnectionIdentity, 0, len(accounts.Accounts))
	for accountID, account := range accounts.Accounts {
		displayName := accountID
		if strings.TrimSpace(account.Workspace) != "" {
			displayName = fmt.Sprintf("%s (%s)", account.Workspace, strings.Title(account.Provider))
		}
		list = append(list, nexadapter.AdapterConnectionIdentity{
			ID:            accountID,
			DisplayName:   displayName,
			CredentialRef: account.CredentialRef,
			Status:        "ready",
		})
	}
	return list, nil
}

func (a *GitAdapter) SetupStart(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	result := &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusRequiresInput,
		SessionID:    setupSessionIDOrDefault(req.SessionID),
		Message:      "Configure a GitHub account",
		Instructions: "Enter the GitHub API host and a personal access token. Optionally scope discovery with a workspace or organization.",
		Fields:       gitAuthFields(),
	}
	if connectionID := optionalConnectionID(req.ConnectionID); connectionID != "" {
		result.ConnectionID = connectionID
	}
	return result, nil
}

func (a *GitAdapter) SetupSubmit(ctx context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	sessionID := setupSessionIDOrDefault(req.SessionID)
	if strings.TrimSpace(payloadString(req.Payload, "repositories")) != "" {
		return a.completeRepositorySelection(ctx, sessionID, req)
	}

	providerID := platformID
	host := strings.TrimSpace(payloadString(req.Payload, "host"))
	token := strings.TrimSpace(payloadString(req.Payload, "token"))
	username := strings.TrimSpace(payloadString(req.Payload, "username"))
	workspace := strings.TrimSpace(payloadString(req.Payload, "workspace"))
	if host == "" || token == "" {
		result := &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusRequiresInput,
			SessionID:    sessionID,
			Message:      "Missing required fields: host and token are required.",
			Instructions: "Fill in the required fields and submit again.",
			Fields:       gitAuthFields(),
		}
		if connectionID := optionalConnectionID(req.ConnectionID); connectionID != "" {
			result.ConnectionID = connectionID
		}
		return result, nil
	}

	provider, err := GetProvider(providerID)
	if err != nil {
		result := &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusRequiresInput,
			SessionID:    sessionID,
			Message:      err.Error(),
			Instructions: "Choose a supported provider and submit again.",
			Fields:       gitAuthFields(),
		}
		if connectionID := optionalConnectionID(req.ConnectionID); connectionID != "" {
			result.ConnectionID = connectionID
		}
		return result, nil
	}

	config := AccountConfig{
		Provider:  providerID,
		Host:      host,
		Token:     token,
		Username:  username,
		Workspace: workspace,
	}
	if err := provider.ValidateCredentials(ctx, config); err != nil {
		if _, ok := githubRateLimitAPIError(err); !ok || (workspace == "" && username == "") {
			result := &nexadapter.AdapterSetupResult{
				Status:       nexadapter.SetupStatusRequiresInput,
				SessionID:    sessionID,
				Message:      fmt.Sprintf("Authentication failed: %s. Please check your token and try again.", err.Error()),
				Instructions: "Enter valid credentials and submit again.",
				Fields:       gitAuthFields(),
			}
			if connectionID := optionalConnectionID(req.ConnectionID); connectionID != "" {
				result.ConnectionID = connectionID
			}
			return result, nil
		}
		nexadapter.LogInfo(
			"setup auth validation rate limited for provider=%s host=%s workspace=%s username=%s; continuing with repository discovery",
			providerID,
			host,
			workspace,
			username,
		)
		if workspace != "" {
			config.Workspace = setupUserWorkspaceFallback(workspace)
		}
	}

	repositories, err := retrySetupDiscovery(ctx, provider, host, func() ([]Repository, error) {
		if discoverer, ok := provider.(interface {
			DiscoverRepositoriesForSetup(context.Context, AccountConfig) ([]Repository, error)
		}); ok {
			return discoverer.DiscoverRepositoriesForSetup(ctx, config)
		}
		return provider.ListRepositories(ctx, config)
	})
	if err != nil {
		result := &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusRequiresInput,
			SessionID:    sessionID,
			Message:      fmt.Sprintf("Repository discovery failed: %s", err.Error()),
			Instructions: "Verify the host and permissions, then submit again.",
			Fields:       gitAuthFields(),
		}
		if connectionID := optionalConnectionID(req.ConnectionID); connectionID != "" {
			result.ConnectionID = connectionID
		}
		return result, nil
	}

	principal, workspace := inferProviderIdentity(provider, repositories)
	if trimmed := authenticatedPrincipal(provider, config); trimmed != "" {
		principal = trimmed
	}
	if strings.TrimSpace(principal) == "" {
		if currentUser, err := provider.GetCurrentUser(ctx, config); err == nil {
			principal = strings.TrimSpace(currentUser)
		}
	}
	accountID := defaultAccountID(req.ConnectionID, workspace, providerID, principal)
	publicAccount := defaultPublicAccount(workspace, principal, accountID)
	credentialRef := defaultCredentialRef(providerID, principal, accountID)
	accountContact := connectionAccountContact(providerID, host, principal)

	if err := SaveSetupSession(adapterStateDir(), sessionID, setupSession{
		Account:       accountID,
		PublicAccount: publicAccount,
		Provider:      providerID,
		Host:          host,
		Token:         token,
		Principal:     principal,
		Username:      username,
		Workspace:     workspace,
		Repositories:  repositories,
		CredentialRef: credentialRef,
	}); err != nil {
		return nil, err
	}

	return &nexadapter.AdapterSetupResult{
		Status:         nexadapter.SetupStatusRequiresInput,
		SessionID:      sessionID,
		ConnectionID:   accountID,
		Service:        providerID,
		Account:        principal,
		AccountContact: accountContact,
		Message:        fmt.Sprintf("Found %d repositories in workspace %q. Select repositories to track.", len(repositories), workspace),
		Instructions:   "Submit `repositories` as `all` or a comma-separated list of repository names.",
		Fields: []nexadapter.AdapterAuthField{
			{
				Name:        "repositories",
				Label:       "Repositories",
				Type:        "text",
				Required:    true,
				Placeholder: "Comma-separated repo names, or 'all'",
			},
		},
		Metadata: map[string]any{
			"step":            "repo_selection",
			"available_repos": repositoryChoices(repositories),
		},
	}, nil
}

func (a *GitAdapter) SetupStatus(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	sessionID := setupSessionIDOrDefault(req.SessionID)
	session, ok, err := LoadSetupSession(adapterStateDir(), sessionID)
	if err != nil {
		return nil, err
	}
	if !ok {
		result := &nexadapter.AdapterSetupResult{
			Status:    nexadapter.SetupStatusFailed,
			SessionID: sessionID,
			Message:   "Setup session not found.",
		}
		if connectionID := optionalConnectionID(req.ConnectionID); connectionID != "" {
			result.ConnectionID = connectionID
		}
		return result, nil
	}

	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusRequiresInput,
		SessionID:    sessionID,
		ConnectionID: session.Account,
		Service:      session.Provider,
		Message:      "Repository selection is pending.",
		Instructions: "Submit `repositories` as `all` or a comma-separated list of repository names.",
		Fields: []nexadapter.AdapterAuthField{
			{
				Name:        "repositories",
				Label:       "Repositories",
				Type:        "text",
				Required:    true,
				Placeholder: "Comma-separated repo names, or 'all'",
			},
		},
		Metadata: map[string]any{
			"step":            "repo_selection",
			"available_repos": repositoryChoices(session.Repositories),
		},
	}, nil
}

func (a *GitAdapter) SetupCancel(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	sessionID := setupSessionIDOrDefault(req.SessionID)
	if err := DeleteSetupSession(adapterStateDir(), sessionID); err != nil {
		return nil, err
	}
	result := &nexadapter.AdapterSetupResult{
		Status:    nexadapter.SetupStatusCancelled,
		SessionID: sessionID,
		Message:   "Setup cancelled.",
	}
	if connectionID := optionalConnectionID(req.ConnectionID); connectionID != "" {
		result.ConnectionID = connectionID
	}
	return result, nil
}

func (a *GitAdapter) Monitor(ctx context.Context, account string, emit nexadapter.EmitFunc) error {
	accountID, err := nexadapter.RequireConnection(account)
	if err != nil {
		return err
	}
	config, provider, err := loadRuntimeAccount(accountID)
	if err != nil {
		return err
	}
	return monitorLoop(ctx, accountID, provider, config, emit)
}

func (a *GitAdapter) Backfill(ctx context.Context, account string, since time.Time, emit nexadapter.EmitFunc) error {
	return a.backfill(ctx, account, since, nil, emit)
}

func (a *GitAdapter) BackfillWindow(ctx context.Context, account string, window nexadapter.BackfillWindow, emit nexadapter.EmitFunc) error {
	return a.backfill(ctx, account, window.Since, window.To, emit)
}

func (a *GitAdapter) backfill(ctx context.Context, account string, since time.Time, to *time.Time, emit nexadapter.EmitFunc) error {
	accountID, err := nexadapter.RequireConnection(account)
	if err != nil {
		return err
	}
	config, provider, err := loadRuntimeAccount(accountID)
	if err != nil {
		return err
	}
	return runBackfillWindow(ctx, accountID, provider, config, since, to, emit)
}

func (a *GitAdapter) CreateBranchMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitMethodResult, error) {
	return executeGitMethod(ctx, req, "github.branches.create")
}

func (a *GitAdapter) CreatePullRequestMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitMethodResult, error) {
	return executeGitMethod(ctx, req, "github.pull_requests.create")
}

func (a *GitAdapter) CreatePullRequestCommentMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitMethodResult, error) {
	return executeGitMethod(ctx, req, "github.pull_requests.comments.create")
}

func (a *GitAdapter) MergePullRequestMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitMethodResult, error) {
	return executeGitMethod(ctx, req, "github.pull_requests.merge")
}

func gitAuthFields() []nexadapter.AdapterAuthField {
	return []nexadapter.AdapterAuthField{
		{
			Name:        "host",
			Label:       "API Host",
			Type:        "text",
			Required:    true,
			Placeholder: "https://api.github.com",
		},
		{
			Name:        "username",
			Label:       "Username",
			Type:        "text",
			Required:    false,
			Placeholder: "octocat",
		},
		{
			Name:        "workspace",
			Label:       "Workspace / Organization",
			Type:        "text",
			Required:    false,
			Placeholder: "octo-org",
		},
		{
			Name:        "token",
			Label:       "API Token",
			Type:        "secret",
			Required:    true,
			Placeholder: "github_pat_...",
		},
	}
}

func setupSessionIDOrDefault(raw string) string {
	if trimmed := strings.TrimSpace(raw); trimmed != "" {
		return trimmed
	}
	return fmt.Sprintf("%s-setup-%d", platformID, time.Now().UnixNano())
}

func optionalConnectionID(connectionID string) string {
	return strings.TrimSpace(connectionID)
}

func setupSecretFields(session setupSession) map[string]string {
	fields := map[string]string{
		"token": session.Token,
	}
	if strings.TrimSpace(session.Username) != "" {
		fields["username"] = session.Username
	}
	return fields
}

func payloadString(payload map[string]any, key string) string {
	if payload == nil {
		return ""
	}
	value, ok := payload[key]
	if !ok {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

func (a *GitAdapter) completeRepositorySelection(ctx context.Context, sessionID string, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	session, ok, err := LoadSetupSession(adapterStateDir(), sessionID)
	if err != nil {
		return nil, err
	}
	if !ok {
		result := &nexadapter.AdapterSetupResult{
			Status:    nexadapter.SetupStatusFailed,
			SessionID: sessionID,
			Message:   "Setup session not found.",
		}
		if connectionID := optionalConnectionID(req.ConnectionID); connectionID != "" {
			result.ConnectionID = connectionID
		}
		return result, nil
	}

	provider, err := GetProvider(session.Provider)
	if err != nil {
		return nil, err
	}

	repositories, err := selectRepositories(ctx, provider, AccountConfig{
		AccountID: session.Account,
		Provider:  session.Provider,
		Host:      session.Host,
		Username:  session.Username,
		Workspace: session.Workspace,
		Token:     session.Token,
	}, session.Repositories, payloadString(req.Payload, "repositories"))
	if err != nil {
		return &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusRequiresInput,
			SessionID:    sessionID,
			ConnectionID: session.Account,
			Service:      session.Provider,
			Message:      err.Error(),
			Instructions: "Submit `all` or a comma-separated list of repository names from the available list.",
			Fields: []nexadapter.AdapterAuthField{
				{
					Name:        "repositories",
					Label:       "Repositories",
					Type:        "text",
					Required:    true,
					Placeholder: "Comma-separated repo names, or 'all'",
				},
			},
			Metadata: map[string]any{
				"step":            "repo_selection",
				"available_repos": repositoryChoices(session.Repositories),
			},
		}, nil
	}

	accountConfig := AccountConfig{
		AccountID:           session.Account,
		Provider:            session.Provider,
		Host:                session.Host,
		Username:            session.Username,
		Workspace:           session.Workspace,
		Repositories:        repositories,
		PollIntervalSeconds: 60,
		BackfillSince:       payloadString(req.Payload, "backfill_since"),
	}

	stateDir := adapterStateDir()
	if err := seedLiveMonitorWatermarks(stateDir, session.Account, repositories, time.Now()); err != nil {
		return nil, err
	}

	if err := DeleteSetupSession(stateDir, sessionID); err != nil {
		return nil, err
	}

	return &nexadapter.AdapterSetupResult{
		Status:         nexadapter.SetupStatusCompleted,
		SessionID:      sessionID,
		ConnectionID:   session.Account,
		Service:        session.Provider,
		Account:        session.Principal,
		AccountContact: connectionAccountContact(session.Provider, session.Host, session.Principal),
		Message:        fmt.Sprintf("Account configured. Tracking %d repositories in %s.", len(repositories), session.Workspace),
		SecretFields:   setupSecretFields(session),
		Metadata: map[string]any{
			"adapter_config":   accountConfig,
			"adapter_contacts": adapterContactSeeds(session.Provider, session.Host, session.Principal),
		},
	}, nil
}

func seedLiveMonitorWatermarks(stateDir, accountID string, repositories []Repository, now time.Time) error {
	store, err := OpenWatermarkStore(stateDir)
	if err != nil {
		return err
	}
	defer store.Close()

	ts := now.UnixMilli()
	for _, repo := range repositories {
		if err := store.Set(accountID, repo.FullName+":commits", ts, ""); err != nil {
			return err
		}
		if err := store.Set(accountID, repo.FullName+":pull_requests", ts, ""); err != nil {
			return err
		}
	}
	return nil
}

func inferProviderIdentity(provider Provider, repositories []Repository) (principal string, workspace string) {
	if report, ok := provider.(interface{ ValidationDetails() map[string]any }); ok {
		details := report.ValidationDetails()
		principal = detailString(details, "user")
	}
	if len(repositories) > 0 {
		parts := strings.SplitN(repositories[0].FullName, "/", 2)
		if len(parts) == 2 {
			workspace = strings.TrimSpace(parts[0])
		}
	}
	if workspace == "" {
		workspace = principal
	}
	return principal, workspace
}

func authenticatedPrincipal(provider Provider, config AccountConfig) string {
	principal, _ := inferProviderIdentity(provider, nil)
	if trimmed := strings.TrimSpace(principal); trimmed != "" {
		return trimmed
	}
	return strings.TrimSpace(config.Username)
}

func detailString(details map[string]any, key string) string {
	if details == nil {
		return ""
	}
	value, ok := details[key]
	if !ok || value == nil {
		return ""
	}
	text := strings.TrimSpace(fmt.Sprint(value))
	if text == "<nil>" {
		return ""
	}
	return text
}

func connectionAccountContact(providerID, host, principal string) *nexadapter.ConnectionAccountContact {
	principal = strings.TrimSpace(principal)
	if principal == "" {
		return nil
	}
	return &nexadapter.ConnectionAccountContact{
		Platform:  strings.TrimSpace(providerID),
		SpaceID:   strings.TrimSpace(host),
		ContactID: principal,
	}
}

func adapterContactSeeds(providerID, host, principal string) []map[string]any {
	principal = strings.TrimSpace(principal)
	if principal == "" {
		return nil
	}
	return []map[string]any{
		{
			"platform":    strings.TrimSpace(providerID),
			"space_id":    strings.TrimSpace(host),
			"sender_id":   principal,
			"sender_name": principal,
		},
	}
}

func defaultAccountID(requested, workspace, providerID, principal string) string {
	if trimmed := strings.TrimSpace(requested); trimmed != "" {
		return trimmed
	}
	base := sanitizeSlug(workspace)
	if base == "" {
		base = sanitizeSlug(principal)
	}
	if base == "" {
		base = "default"
	}
	return fmt.Sprintf("%s-%s", base, providerID)
}

func defaultCredentialRef(providerID, principal, accountID string) string {
	key := sanitizeCredentialKey(principal)
	if key == "" {
		key = sanitizeCredentialKey(accountID)
	}
	return fmt.Sprintf("%s/%s", providerID, key)
}

func defaultPublicAccount(workspace, principal, accountID string) string {
	if trimmed := strings.TrimSpace(workspace); trimmed != "" {
		return trimmed
	}
	if trimmed := strings.TrimSpace(principal); trimmed != "" {
		return trimmed
	}
	return strings.TrimSpace(accountID)
}

func setupUserWorkspaceFallback(workspace string) string {
	return strings.TrimSpace(workspace) + "#user"
}

func sanitizeSlug(raw string) string {
	trimmed := strings.ToLower(strings.TrimSpace(raw))
	if trimmed == "" {
		return ""
	}
	var builder strings.Builder
	lastDash := false
	for _, r := range trimmed {
		switch {
		case r >= 'a' && r <= 'z':
			builder.WriteRune(r)
			lastDash = false
		case r >= '0' && r <= '9':
			builder.WriteRune(r)
			lastDash = false
		default:
			if !lastDash {
				builder.WriteRune('-')
				lastDash = true
			}
		}
	}
	return strings.Trim(builder.String(), "-")
}

func sanitizeCredentialKey(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	var builder strings.Builder
	for _, r := range trimmed {
		switch {
		case r >= 'a' && r <= 'z':
			builder.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			builder.WriteRune(r + ('a' - 'A'))
		case r >= '0' && r <= '9':
			builder.WriteRune(r)
		case r == '.', r == '-', r == '_', r == '@':
			builder.WriteRune(r)
		}
	}
	return strings.Trim(builder.String(), ".-_")
}

func splitRepoName(fullName string) string {
	parts := strings.Split(strings.TrimSpace(fullName), "/")
	if len(parts) == 0 {
		return strings.TrimSpace(fullName)
	}
	return parts[len(parts)-1]
}

func repositoryChoices(repositories []Repository) []map[string]string {
	choices := make([]map[string]string, 0, len(repositories))
	for _, repo := range repositories {
		choices = append(choices, map[string]string{
			"full_name": repo.FullName,
			"name":      repo.Name,
		})
	}
	return choices
}

func selectRepositories(ctx context.Context, provider Provider, config AccountConfig, available []Repository, selection string) ([]Repository, error) {
	trimmed := strings.TrimSpace(selection)
	if trimmed == "" {
		return nil, fmt.Errorf("repositories selection is required")
	}
	if strings.EqualFold(trimmed, "all") {
		return available, nil
	}

	lookup := make(map[string]Repository, len(available)*2)
	for _, repo := range available {
		lookup[strings.ToLower(repo.Name)] = repo
		lookup[strings.ToLower(repo.FullName)] = repo
	}

	selected := make([]Repository, 0)
	seen := map[string]bool{}
	for _, part := range strings.Split(trimmed, ",") {
		raw := strings.TrimSpace(part)
		key := strings.ToLower(raw)
		if key == "" {
			continue
		}
		repo, ok := lookup[key]
		if !ok {
			resolved, err := resolveRepositoryReference(ctx, provider, config, raw)
			if err != nil {
				return nil, err
			}
			repo = resolved
		}
		if seen[repo.FullName] {
			continue
		}
		seen[repo.FullName] = true
		selected = append(selected, repo)
	}
	if len(selected) == 0 {
		return nil, fmt.Errorf("repositories selection is required")
	}
	return selected, nil
}

func resolveRepositoryReference(ctx context.Context, provider Provider, config AccountConfig, raw string) (Repository, error) {
	candidates := []string{strings.TrimSpace(raw)}
	if workspace := strings.TrimSpace(config.Workspace); workspace != "" && !strings.Contains(raw, "/") {
		candidates = append([]string{workspace + "/" + strings.TrimSpace(raw)}, candidates...)
	}
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		repo, err := provider.GetRepository(ctx, config, Repository{FullName: candidate, Name: splitRepoName(candidate)})
		if err != nil || repo == nil {
			continue
		}
		return *repo, nil
	}
	return Repository{}, fmt.Errorf("unknown repository %q", strings.TrimSpace(raw))
}

func ingestCommitScopeRepository(repo Repository) Repository {
	if len(repo.TrackedBranches) > 0 {
		return repo
	}
	defaultBranch := strings.TrimSpace(repo.DefaultBranch)
	if defaultBranch == "" {
		return repo
	}
	copy := repo
	copy.TrackedBranches = []string{defaultBranch}
	return copy
}

func runBackfill(ctx context.Context, accountID string, provider Provider, config AccountConfig, since time.Time, emit nexadapter.EmitFunc) error {
	return runBackfillWindow(ctx, accountID, provider, config, since, nil, emit)
}

func runBackfillWindow(ctx context.Context, accountID string, provider Provider, config AccountConfig, since time.Time, to *time.Time, emit nexadapter.EmitFunc) error {
	diffLimitApplies := since.IsZero() || time.Since(since) > 90*24*time.Hour
	sinceMillis := since.UnixMilli()
	repositories := append([]Repository(nil), config.Repositories...)
	sort.SliceStable(repositories, func(i, j int) bool {
		left := repositories[i]
		right := repositories[j]
		if left.PushedAt == right.PushedAt {
			return strings.ToLower(left.FullName) < strings.ToLower(right.FullName)
		}
		return left.PushedAt > right.PushedAt
	})

	for repoIndex, repo := range repositories {
		nexadapter.LogInfo(
			"github backfill repo start account=%s repo=%s position=%d/%d since=%s",
			accountID,
			repo.FullName,
			repoIndex+1,
			len(repositories),
			since.UTC().Format(time.RFC3339),
		)
		var err error
		commits := []Commit{}
		if !since.IsZero() && repo.PushedAt > 0 && repo.PushedAt < sinceMillis {
			nexadapter.LogInfo(
				"github backfill repo commits skipped account=%s repo=%s pushed_at=%d since_ms=%d",
				accountID,
				repo.FullName,
				repo.PushedAt,
				sinceMillis,
			)
		} else {
			commitRepo := ingestCommitScopeRepository(repo)
			commits, err = retryBackfillRead(ctx, accountID, provider, config, repo, "commits", backfillPrimaryRetryBudget, func() ([]Commit, error) {
				return provider.GetCommits(ctx, config, commitRepo, since)
			})
			if err != nil {
				if shouldAbortBackfill(err) {
					return err
				}
				nexadapter.LogError("backfill commits failed for %s: %v", repo.FullName, err)
				continue
			}
		}
		nexadapter.LogInfo(
			"github backfill repo commits fetched account=%s repo=%s count=%d",
			accountID,
			repo.FullName,
			len(commits),
		)
		sort.Slice(commits, func(i, j int) bool { return commits[i].Timestamp < commits[j].Timestamp })
		diffStart := 0
		if diffLimitApplies && len(commits) > backfillHistoricalCommitDiffLimit {
			diffStart = len(commits) - backfillHistoricalCommitDiffLimit
		}
		for i, commit := range commits {
			if backfillTimestampAfter(commit.Timestamp, to) {
				continue
			}
			var diff []byte
			diffAvailable := false
			if !diffLimitApplies || i >= diffStart {
				diff, err = retryBackfillRead(ctx, accountID, provider, config, repo, "commit_diff", backfillOptionalRetryBudget, func() ([]byte, error) {
					return provider.GetCommitDiff(ctx, config, repo, commit.SHA)
				})
				if err != nil {
					if shouldAbortBackfill(err) {
						return err
					}
					nexadapter.LogError("backfill commit diff failed for %s@%s: %v", repo.FullName, commit.SHA, err)
					diff = nil
				} else {
					diffAvailable = len(diff) > 0
				}
			}
			event := buildCommitEvent(accountID, provider, repo, commit, diff)
			if !diffAvailable || (diffLimitApplies && i < diffStart) {
				if event.Payload.Metadata == nil {
					event.Payload.Metadata = map[string]any{}
				}
				event.Payload.Metadata["diff_available"] = false
			}
			emit(event)
		}

		prs, err := retryBackfillRead(ctx, accountID, provider, config, repo, "pull_requests", backfillPrimaryRetryBudget, func() ([]PullRequest, error) {
			return provider.GetPullRequests(ctx, config, repo, since)
		})
		if err != nil {
			if shouldAbortBackfill(err) {
				return err
			}
			nexadapter.LogError("backfill prs failed for %s: %v", repo.FullName, err)
			continue
		}
		nexadapter.LogInfo(
			"github backfill repo pull requests fetched account=%s repo=%s count=%d",
			accountID,
			repo.FullName,
			len(prs),
		)
		sort.Slice(prs, func(i, j int) bool { return prs[i].UpdatedAt < prs[j].UpdatedAt })
		prArtifactStart := 0
		if diffLimitApplies && len(prs) > backfillHistoricalPRArtifactLimit {
			prArtifactStart = len(prs) - backfillHistoricalPRArtifactLimit
		}
		for prIndex, pr := range prs {
			if backfillTimestampAfter(pr.UpdatedAt, to) {
				continue
			}
			var diff []byte
			diffAvailable := false
			var archiveAttachment *nexadapter.Attachment
			prArtifactEligible := !diffLimitApplies || len(prs) <= backfillHistoricalPRArtifactLimit || prIndex >= prArtifactStart
			if prArtifactEligible {
				diff, err := retryBackfillRead(ctx, accountID, provider, config, repo, "pull_request_diff", backfillOptionalRetryBudget, func() ([]byte, error) {
					return provider.GetPullRequestDiff(ctx, config, repo, pr.ID)
				})
				if err != nil {
					if shouldAbortBackfill(err) {
						return err
					}
					nexadapter.LogError("backfill pr diff failed for %s pr/%s: %v", repo.FullName, pr.ID, err)
					diff = nil
				} else {
					diffAvailable = len(diff) > 0
				}
				sourceArchive, err := retryBackfillRead(ctx, accountID, provider, config, repo, "pull_request_source_archive", backfillOptionalRetryBudget, func() (*SourceArchive, error) {
					return provider.GetPullRequestSourceArchive(ctx, config, repo, pr)
				})
				if err != nil {
					if shouldAbortBackfill(err) {
						return err
					}
					nexadapter.LogError("backfill pr source archive failed for %s pr/%s: %v", repo.FullName, pr.ID, err)
				} else {
					archiveAttachment, err = persistPullRequestSourceArchive(adapterStateDir(), provider, repo, pr, sourceArchive)
					if err != nil {
						return err
					}
				}
			}
			event := buildPullRequestEvent(accountID, provider, repo, pr, diff, archiveAttachment)
			if event.Payload.Metadata == nil {
				event.Payload.Metadata = map[string]any{}
			}
			if !diffAvailable {
				event.Payload.Metadata["diff_available"] = false
			}
			if archiveAttachment == nil {
				event.Payload.Metadata["source_archive_available"] = false
			}
			emit(event)
		}

		commentPRs := append([]PullRequest(nil), prs...)
		nexadapter.LogInfo(
			"github backfill repo comment scan set fetched account=%s repo=%s count=%d",
			accountID,
			repo.FullName,
			len(commentPRs),
		)
		sort.Slice(commentPRs, func(i, j int) bool {
			if commentPRs[i].UpdatedAt == commentPRs[j].UpdatedAt {
				return commentPRs[i].ID < commentPRs[j].ID
			}
			return commentPRs[i].UpdatedAt < commentPRs[j].UpdatedAt
		})
		for _, pr := range commentPRs {
			if backfillTimestampAfter(pr.UpdatedAt, to) {
				continue
			}
			comments, err := retryBackfillRead(ctx, accountID, provider, config, repo, "pull_request_comments", backfillPrimaryRetryBudget, func() ([]Comment, error) {
				return provider.GetPullRequestComments(ctx, config, repo, pr.ID, since)
			})
			if err != nil {
				if shouldAbortBackfill(err) {
					return err
				}
				nexadapter.LogError("backfill pr comments failed for %s pr/%s: %v", repo.FullName, pr.ID, err)
				continue
			}
			nexadapter.LogInfo(
				"github backfill repo pr comments fetched account=%s repo=%s pr=%s count=%d",
				accountID,
				repo.FullName,
				pr.ID,
				len(comments),
			)
			sort.Slice(comments, func(i, j int) bool { return comments[i].CreatedAt < comments[j].CreatedAt })
			for _, comment := range comments {
				if backfillTimestampAfter(comment.CreatedAt, to) {
					continue
				}
				emit(buildCommentEvent(accountID, provider, repo, pr, comment))
			}
		}
		nexadapter.LogInfo(
			"github backfill repo complete account=%s repo=%s position=%d/%d",
			accountID,
			repo.FullName,
			repoIndex+1,
			len(repositories),
		)
	}
	return nil
}

func backfillTimestampAfter(timestamp int64, to *time.Time) bool {
	if to == nil || timestamp <= 0 {
		return false
	}
	return timestamp > to.UTC().UnixMilli()
}

func shouldAbortBackfill(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	_, ok := githubRateLimitAPIError(err)
	return ok
}

func githubRateLimitAPIError(err error) (*core.APIError, bool) {
	var apiErr *core.APIError
	if !errors.As(err, &apiErr) {
		return nil, false
	}
	if apiErr.StatusCode == http.StatusTooManyRequests {
		return apiErr, true
	}
	if apiErr.StatusCode != http.StatusForbidden {
		return nil, false
	}
	message := strings.ToLower(apiErr.Message)
	if apiErr.RetryAfterMs > 0 || strings.Contains(message, "rate limit") {
		return apiErr, true
	}
	return nil, false
}

func githubTransientAPIError(err error) (*core.APIError, bool) {
	var apiErr *core.APIError
	if !errors.As(err, &apiErr) {
		return nil, false
	}
	switch apiErr.StatusCode {
	case http.StatusRequestTimeout, http.StatusInternalServerError, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return apiErr, true
	default:
		return nil, false
	}
}

func retryBackfillRead[T any](ctx context.Context, accountID string, provider Provider, config AccountConfig, repo Repository, operation string, budget backfillRetryBudget, read func() (T, error)) (T, error) {
	var zero T
	consecutiveRateLimits := 0
	consecutiveTransientErrors := 0
	for {
		value, err := read()
		if err == nil {
			return value, nil
		}
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return zero, err
		}

		if apiErr, ok := githubRateLimitAPIError(err); ok {
			consecutiveRateLimits++
			if consecutiveRateLimits > budget.maxRateLimitRetries {
				nexadapter.LogError(
					"backfill rate limit budget exhausted for account=%s provider=%s repo=%s operation=%s retries=%d",
					accountID,
					provider.ID(),
					repo.FullName,
					operation,
					consecutiveRateLimits-1,
				)
				return zero, fmt.Errorf(
					"backfill rate limit budget exhausted for repo=%s operation=%s after %d retries: %w",
					repo.FullName,
					operation,
					consecutiveRateLimits-1,
					apiErr,
				)
			}

			cooldown := rateLimitCooldownDuration(config, apiErr)
			nexadapter.LogInfo(
				"backfill rate limited for account=%s provider=%s repo=%s operation=%s cooldown_ms=%d",
				accountID,
				provider.ID(),
				repo.FullName,
				operation,
				cooldown.Milliseconds(),
			)
			if err := waitForMonitorCooldown(ctx, cooldown); err != nil {
				return zero, fmt.Errorf("backfill rate limit wait interrupted for repo=%s operation=%s: %w", repo.FullName, operation, err)
			}
			continue
		}

		if apiErr, ok := githubTransientAPIError(err); ok {
			consecutiveTransientErrors++
			if consecutiveTransientErrors > budget.maxTransientRetries {
				return zero, fmt.Errorf(
					"backfill transient error budget exhausted for repo=%s operation=%s after %d retries: %w",
					repo.FullName,
					operation,
					consecutiveTransientErrors-1,
					apiErr,
				)
			}
			cooldown, ok := directReadCooldownDuration(apiErr, consecutiveTransientErrors, 0)
			if !ok {
				return zero, fmt.Errorf(
					"backfill transient retry budget exceeded for repo=%s operation=%s after %d retries: %w",
					repo.FullName,
					operation,
					consecutiveTransientErrors-1,
					apiErr,
				)
			}
			nexadapter.LogInfo(
				"backfill transient failure for account=%s provider=%s repo=%s operation=%s status=%d cooldown_ms=%d retry=%d",
				accountID,
				provider.ID(),
				repo.FullName,
				operation,
				apiErr.StatusCode,
				cooldown.Milliseconds(),
				consecutiveTransientErrors,
			)
			if err := waitForMonitorCooldown(ctx, cooldown); err != nil {
				return zero, fmt.Errorf("backfill transient wait interrupted for repo=%s operation=%s: %w", repo.FullName, operation, err)
			}
			continue
		}

		return zero, err
	}
}

func retryDirectRead[T any](ctx context.Context, accountID string, provider Provider, scope string, operation string, read func() (T, error)) (T, error) {
	var zero T
	consecutiveRateLimits := 0
	consecutiveTransientErrors := 0
	totalCooldown := time.Duration(0)
	for {
		value, err := read()
		if err == nil {
			return value, nil
		}
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return zero, err
		}

		if apiErr, ok := githubRateLimitAPIError(err); ok {
			consecutiveRateLimits++
			if consecutiveRateLimits > directReadMaxConsecutiveRateLimits {
				return zero, fmt.Errorf(
					"direct read rate limit budget exhausted for scope=%s operation=%s after %d retries: %w",
					scope,
					operation,
					consecutiveRateLimits-1,
					apiErr,
				)
			}

			cooldown, ok := directReadCooldownDuration(apiErr, consecutiveRateLimits, totalCooldown)
			if !ok {
				return zero, fmt.Errorf(
					"direct read retry budget exceeded for scope=%s operation=%s after %d retries (retry_after_ms=%d total_wait_ms=%d): %w",
					scope,
					operation,
					consecutiveRateLimits-1,
					apiErr.RetryAfterMs,
					totalCooldown.Milliseconds(),
					apiErr,
				)
			}
			totalCooldown += cooldown

			nexadapter.LogInfo(
				"direct read rate limited for account=%s provider=%s scope=%s operation=%s cooldown_ms=%d retry=%d total_wait_ms=%d",
				accountID,
				provider.ID(),
				scope,
				operation,
				cooldown.Milliseconds(),
				consecutiveRateLimits,
				totalCooldown.Milliseconds(),
			)
			if err := waitForMonitorCooldown(ctx, cooldown); err != nil {
				return zero, fmt.Errorf("direct read rate limit wait interrupted for scope=%s operation=%s: %w", scope, operation, err)
			}
			continue
		}

		if apiErr, ok := githubTransientAPIError(err); ok {
			consecutiveTransientErrors++
			if consecutiveTransientErrors > directReadMaxConsecutiveTransient {
				return zero, fmt.Errorf(
					"direct read transient error budget exhausted for scope=%s operation=%s after %d retries: %w",
					scope,
					operation,
					consecutiveTransientErrors-1,
					apiErr,
				)
			}
			cooldown, ok := directReadCooldownDuration(apiErr, consecutiveTransientErrors, totalCooldown)
			if !ok {
				return zero, fmt.Errorf(
					"direct read transient retry budget exceeded for scope=%s operation=%s after %d retries: %w",
					scope,
					operation,
					consecutiveTransientErrors-1,
					apiErr,
				)
			}
			totalCooldown += cooldown
			nexadapter.LogInfo(
				"direct read transient failure for account=%s provider=%s scope=%s operation=%s status=%d cooldown_ms=%d retry=%d total_wait_ms=%d",
				accountID,
				provider.ID(),
				scope,
				operation,
				apiErr.StatusCode,
				cooldown.Milliseconds(),
				consecutiveTransientErrors,
				totalCooldown.Milliseconds(),
			)
			if err := waitForMonitorCooldown(ctx, cooldown); err != nil {
				return zero, fmt.Errorf("direct read transient wait interrupted for scope=%s operation=%s: %w", scope, operation, err)
			}
			continue
		}

		return zero, err
	}
}

func retrySetupDiscovery[T any](ctx context.Context, provider Provider, scope string, read func() (T, error)) (T, error) {
	var zero T
	consecutiveRateLimits := 0
	consecutiveTransientErrors := 0
	totalCooldown := time.Duration(0)
	for {
		value, err := read()
		if err == nil {
			return value, nil
		}
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return zero, err
		}

		if apiErr, ok := githubRateLimitAPIError(err); ok {
			consecutiveRateLimits++
			if consecutiveRateLimits > directReadMaxConsecutiveRateLimits {
				return zero, fmt.Errorf(
					"setup discovery rate limit budget exhausted for scope=%s after %d retries: %w",
					scope,
					consecutiveRateLimits-1,
					apiErr,
				)
			}

			cooldown, ok := directReadCooldownDuration(apiErr, consecutiveRateLimits, totalCooldown)
			if !ok {
				return zero, fmt.Errorf(
					"setup discovery retry budget exceeded for scope=%s after %d retries (retry_after_ms=%d total_wait_ms=%d): %w",
					scope,
					consecutiveRateLimits-1,
					apiErr.RetryAfterMs,
					totalCooldown.Milliseconds(),
					apiErr,
				)
			}
			totalCooldown += cooldown

			nexadapter.LogInfo(
				"setup discovery rate limited for provider=%s scope=%s cooldown_ms=%d retry=%d total_wait_ms=%d",
				provider.ID(),
				scope,
				cooldown.Milliseconds(),
				consecutiveRateLimits,
				totalCooldown.Milliseconds(),
			)
			if err := waitForMonitorCooldown(ctx, cooldown); err != nil {
				return zero, fmt.Errorf("setup discovery rate limit wait interrupted for scope=%s: %w", scope, err)
			}
			continue
		}

		if apiErr, ok := githubTransientAPIError(err); ok {
			consecutiveTransientErrors++
			if consecutiveTransientErrors > directReadMaxConsecutiveTransient {
				return zero, fmt.Errorf(
					"setup discovery transient error budget exhausted for scope=%s after %d retries: %w",
					scope,
					consecutiveTransientErrors-1,
					apiErr,
				)
			}
			cooldown, ok := directReadCooldownDuration(apiErr, consecutiveTransientErrors, totalCooldown)
			if !ok {
				return zero, fmt.Errorf(
					"setup discovery transient retry budget exceeded for scope=%s after %d retries: %w",
					scope,
					consecutiveTransientErrors-1,
					apiErr,
				)
			}
			totalCooldown += cooldown
			nexadapter.LogInfo(
				"setup discovery transient failure for provider=%s scope=%s status=%d cooldown_ms=%d retry=%d total_wait_ms=%d",
				provider.ID(),
				scope,
				apiErr.StatusCode,
				cooldown.Milliseconds(),
				consecutiveTransientErrors,
				totalCooldown.Milliseconds(),
			)
			if err := waitForMonitorCooldown(ctx, cooldown); err != nil {
				return zero, fmt.Errorf("setup discovery transient wait interrupted for scope=%s: %w", scope, err)
			}
			continue
		}

		return zero, err
	}
}

func directReadCooldownDuration(apiErr *core.APIError, retry int, totalCooldown time.Duration) (time.Duration, bool) {
	var cooldown time.Duration
	if apiErr != nil && apiErr.RetryAfterMs > 0 {
		cooldown = time.Duration(apiErr.RetryAfterMs) * time.Millisecond
	} else {
		if retry < 1 {
			retry = 1
		}
		cooldown = directReadBaseCooldown << (retry - 1)
	}
	if cooldown > directReadMaxCooldown {
		cooldown = directReadMaxCooldown
	}
	if cooldown <= 0 || totalCooldown+cooldown > directReadMaxTotalCooldown {
		return 0, false
	}
	return cooldown, true
}
