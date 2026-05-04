package main

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"sort"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
	core "github.com/nexus-project/gitlab/internal/gitadapter"
)

const (
	adapterName                       = "GitLab Adapter"
	adapterVersion                    = "1.0.12"
	platformID                        = "gitlab"
	backfillMaxConsecutiveRateLimits  = 5
	backfillHistoricalCommitDiffLimit = 50
	backfillHistoricalPRArtifactLimit = 50
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

	if err := provider.ValidateCredentials(ctx, config); err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: accountID,
			Error:        err.Error(),
		}, nil
	}

	principal := authenticatedPrincipal(provider, config)
	details := map[string]any{
		"provider":         config.Provider,
		"repos_tracked":    len(config.Repositories),
		"adapter_contacts": adapterContactSeeds(config.Provider, config.Host, principal),
	}
	if report, ok := provider.(interface{ ValidationDetails() map[string]any }); ok {
		maps.Copy(details, report.ValidationDetails())
	}
	return &nexadapter.AdapterHealth{
		Connected:      true,
		ConnectionID:   accountID,
		Account:        principal,
		AccountContact: connectionAccountContact(config.Provider, config.Host, principal),
		Details:        details,
	}, nil
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
		Message:      "Configure a GitLab account",
		Instructions: "Enter the GitLab API host and a personal access token.",
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
		return a.completeRepositorySelection(sessionID, req)
	}

	providerID := platformID
	host := strings.TrimSpace(payloadString(req.Payload, "host"))
	token := strings.TrimSpace(payloadString(req.Payload, "token"))
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
		Provider: providerID,
		Host:     host,
		Token:    token,
	}
	if err := provider.ValidateCredentials(ctx, config); err != nil {
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

	repositories, err := provider.ListRepositories(ctx, config)
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
	return executeGitMethod(ctx, req, "gitlab.branches.create")
}

func (a *GitAdapter) CreatePullRequestMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitMethodResult, error) {
	return executeGitMethod(ctx, req, "gitlab.pull_requests.create")
}

func (a *GitAdapter) CreatePullRequestCommentMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitMethodResult, error) {
	return executeGitMethod(ctx, req, "gitlab.pull_requests.comments.create")
}

func (a *GitAdapter) MergePullRequestMethod(ctx context.Context, req nexadapter.AdapterMethodRequest) (*gitMethodResult, error) {
	return executeGitMethod(ctx, req, "gitlab.pull_requests.merge")
}

func gitAuthFields() []nexadapter.AdapterAuthField {
	return []nexadapter.AdapterAuthField{
		{
			Name:        "host",
			Label:       "API Host",
			Type:        "text",
			Required:    true,
			Placeholder: "https://gitlab.com/api/v4",
		},
		{
			Name:        "token",
			Label:       "API Token",
			Type:        "secret",
			Required:    true,
			Placeholder: "glpat-...",
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

func (a *GitAdapter) completeRepositorySelection(sessionID string, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
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

	repositories, err := selectRepositories(session.Repositories, payloadString(req.Payload, "repositories"))
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
		principal = strings.TrimSpace(fmt.Sprint(details["user"]))
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

func selectRepositories(available []Repository, selection string) ([]Repository, error) {
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
		key := strings.ToLower(strings.TrimSpace(part))
		if key == "" {
			continue
		}
		repo, ok := lookup[key]
		if !ok {
			return nil, fmt.Errorf("unknown repository %q", strings.TrimSpace(part))
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

func runBackfill(ctx context.Context, accountID string, provider Provider, config AccountConfig, since time.Time, emit nexadapter.EmitFunc) error {
	return runBackfillWindow(ctx, accountID, provider, config, since, nil, emit)
}

func runBackfillWindow(ctx context.Context, accountID string, provider Provider, config AccountConfig, since time.Time, to *time.Time, emit nexadapter.EmitFunc) error {
	diffLimitApplies := since.IsZero() || time.Since(since) > 90*24*time.Hour

	for _, repo := range config.Repositories {
		commits, err := retryBackfillRead(ctx, accountID, provider, config, repo, "commits", func() ([]Commit, error) {
			return provider.GetCommits(ctx, config, repo, since)
		})
		if err != nil {
			if shouldAbortBackfill(err) {
				return err
			}
			nexadapter.LogError("backfill commits failed for %s: %v", repo.FullName, err)
			continue
		}
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
			if !diffLimitApplies || i >= diffStart {
				diff, err = retryBackfillRead(ctx, accountID, provider, config, repo, "commit_diff", func() ([]byte, error) {
					return provider.GetCommitDiff(ctx, config, repo, commit.SHA)
				})
				if err != nil {
					return err
				}
			}
			event := buildCommitEvent(accountID, provider, repo, commit, diff)
			if diffLimitApplies && i < diffStart {
				if event.Payload.Metadata == nil {
					event.Payload.Metadata = map[string]any{}
				}
				event.Payload.Metadata["diff_available"] = false
			}
			emit(event)
		}

		prs, err := retryBackfillRead(ctx, accountID, provider, config, repo, "pull_requests", func() ([]PullRequest, error) {
			return provider.GetPullRequests(ctx, config, repo, since)
		})
		if err != nil {
			if shouldAbortBackfill(err) {
				return err
			}
			nexadapter.LogError("backfill prs failed for %s: %v", repo.FullName, err)
			continue
		}
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
				diff, err = retryBackfillRead(ctx, accountID, provider, config, repo, "pull_request_diff", func() ([]byte, error) {
					return provider.GetPullRequestDiff(ctx, config, repo, pr.ID)
				})
				if err != nil {
					return err
				}
				diffAvailable = len(diff) > 0
				sourceArchive, err := retryBackfillRead(ctx, accountID, provider, config, repo, "pull_request_source_archive", func() (*SourceArchive, error) {
					return provider.GetPullRequestSourceArchive(ctx, config, repo, pr)
				})
				if err != nil {
					return err
				}
				archiveAttachment, err = persistPullRequestSourceArchive(adapterStateDir(), provider, repo, pr, sourceArchive)
				if err != nil {
					return err
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
			comments, err := retryBackfillRead(ctx, accountID, provider, config, repo, "pull_request_comments", func() ([]Comment, error) {
				return provider.GetPullRequestComments(ctx, config, repo, pr.ID, since)
			})
			if err != nil {
				return err
			}
			sort.Slice(comments, func(i, j int) bool { return comments[i].CreatedAt < comments[j].CreatedAt })
			for _, comment := range comments {
				if backfillTimestampAfter(comment.CreatedAt, to) {
					continue
				}
				emit(buildCommentEvent(accountID, provider, repo, pr, comment))
			}
		}
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
	var apiErr *core.APIError
	return errors.As(err, &apiErr) && apiErr.StatusCode == 429
}

func retryBackfillRead[T any](ctx context.Context, accountID string, provider Provider, config AccountConfig, repo Repository, operation string, read func() (T, error)) (T, error) {
	var zero T
	consecutiveRateLimits := 0
	for {
		value, err := read()
		if err == nil {
			return value, nil
		}

		var apiErr *core.APIError
		if !errors.As(err, &apiErr) || apiErr.StatusCode != 429 {
			return zero, err
		}

		consecutiveRateLimits++
		if consecutiveRateLimits > backfillMaxConsecutiveRateLimits {
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
	}
}
