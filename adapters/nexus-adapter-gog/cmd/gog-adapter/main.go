package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/mail"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName                  = "gog-adapter"
	adapterVersion               = "0.1.0"
	defaultPlatformCredentialURL = "https://hub.glowbot.com/api/platform-credentials"

	defaultSubject          = "Message from Nexus"
	defaultPollInterval     = 20 * time.Second
	defaultPollQuery        = "in:inbox newer_than:7d"
	defaultBackfillQuery    = "in:inbox -in:spam -category:promotions -category:social"
	defaultSearchMax        = 100
	maxSeenMessageIDs       = 500
	defaultRateLimitRetries = 6
	defaultRetryBaseDelay   = 2 * time.Second
	maxRetryDelay           = 45 * time.Second
)

type monitorState struct {
	HistoryID string `json:"history_id"`
}

type pollState struct {
	SeenMessageIDs []string `json:"seen_message_ids"`
}

type backfillState struct {
	LastSinceRFC3339 string `json:"last_since_rfc3339"`
	LastCompletedAt  int64  `json:"last_completed_at"`
	LastMessageID    string `json:"last_message_id,omitempty"`
}

func main() {
	nexadapter.Run(nexadapter.Adapter{
		Operations: nexadapter.AdapterOperations{
			AdapterInfo:         info,
			AdapterMonitorStart: monitor,
			DeliverySend:        send,
			EventBackfill:       backfill,
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
		Platform: "gmail",
		Name:     adapterName,
		Version:  adapterVersion,
		Operations: []nexadapter.AdapterOperation{
			nexadapter.OpAdapterInfo,
			nexadapter.OpAdapterMonitorStart,
			nexadapter.OpDeliverySend,
			nexadapter.OpEventBackfill,
			nexadapter.OpAdapterHealth,
			nexadapter.OpAdapterAccountsList,
			nexadapter.OpAdapterSetupStart,
			nexadapter.OpAdapterSetupSubmit,
			nexadapter.OpAdapterSetupStatus,
			nexadapter.OpAdapterSetupCancel,
		},
		CredentialService: "google",
		MultiAccount:      true,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					Type:                  "oauth2",
					Label:                 "Connect Google Account",
					Icon:                  "google",
					Service:               "google",
					PlatformCredentials:   true,
					PlatformCredentialURL: platformCredentialURL(),
					Scopes: []string{
						"https://www.googleapis.com/auth/gmail.modify",
						"https://www.googleapis.com/auth/gmail.send",
						"https://www.googleapis.com/auth/gmail.readonly",
					},
				},
				{
					Type:    "custom_flow",
					Label:   "Use Existing Gog Auth",
					Icon:    "settings",
					Service: "google",
					Fields: []nexadapter.AdapterAuthField{
						{
							Name:        "account_email",
							Label:       "Google account email (optional)",
							Type:        "text",
							Required:    false,
							Placeholder: "you@example.com",
						},
						{
							Name:     "confirm_auth_ready",
							Label:    "I already authenticated with `gog auth add`",
							Type:     "select",
							Required: true,
							Options: []nexadapter.AdapterAuthFieldOption{
								{Label: "Yes", Value: "yes"},
								{Label: "Not yet", Value: "no"},
							},
						},
					},
				},
			},
			SetupGuide: "Authenticate via Google OAuth, or use existing `gog auth add` credentials and complete custom setup.",
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

func platformCredentialURL() string {
	if v := strings.TrimSpace(os.Getenv("NEXUS_PLATFORM_CREDENTIAL_URL")); v != "" { //nolint:gosec // config
		return v
	}
	return defaultPlatformCredentialURL
}

// ---------- Accounts ----------

type gogAuthListResponse struct {
	Accounts []struct {
		Email    string   `json:"email"`
		Services []string `json:"services,omitempty"`
	} `json:"accounts"`
}

func accounts(ctx context.Context) ([]nexadapter.AdapterAccount, error) {
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
		result = append(result, nexadapter.AdapterAccount{
			ID:            email,
			DisplayName:   email,
			CredentialRef: fmt.Sprintf("google/%s", email),
			Status:        "ready",
		})
	}

	return result, nil
}

func gogSetupFields() []nexadapter.AdapterAuthField {
	return []nexadapter.AdapterAuthField{
		{
			Name:        "account_email",
			Label:       "Google account email (optional)",
			Type:        "text",
			Required:    false,
			Placeholder: "you@example.com",
		},
		{
			Name:     "confirm_auth_ready",
			Label:    "I already authenticated with `gog auth add`",
			Type:     "select",
			Required: true,
			Options: []nexadapter.AdapterAuthFieldOption{
				{Label: "Yes", Value: "yes"},
				{Label: "Not yet", Value: "no"},
			},
		},
	}
}

func setupSessionIDOrDefault(sessionID string) string {
	trimmed := strings.TrimSpace(sessionID)
	if trimmed == "" {
		return fmt.Sprintf("gog-setup-%d", time.Now().UnixNano())
	}
	return trimmed
}

func setupAccountOrDefault(account string) string {
	trimmed := strings.TrimSpace(strings.ToLower(account))
	if trimmed == "" {
		return "default"
	}
	return trimmed
}

func payloadString(payload map[string]any, key string) string {
	if payload == nil {
		return ""
	}
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	switch value := raw.(type) {
	case string:
		return strings.TrimSpace(value)
	default:
		return ""
	}
}

func payloadBool(payload map[string]any, key string) bool {
	if payload == nil {
		return false
	}
	raw, ok := payload[key]
	if !ok {
		return false
	}
	switch value := raw.(type) {
	case bool:
		return value
	case string:
		v := strings.ToLower(strings.TrimSpace(value))
		return v == "true" || v == "yes" || v == "y" || v == "1" || v == "confirmed"
	case float64:
		return value == 1
	case int:
		return value == 1
	case int64:
		return value == 1
	default:
		return false
	}
}

func selectSetupAccount(req nexadapter.AdapterSetupRequest, configured []nexadapter.AdapterAccount) (string, bool) {
	requested := strings.TrimSpace(strings.ToLower(req.Account))
	if requested == "" {
		requested = strings.TrimSpace(strings.ToLower(payloadString(req.Payload, "account_email")))
	}
	if requested == "" {
		requested = strings.TrimSpace(strings.ToLower(payloadString(req.Payload, "email")))
	}

	if len(configured) == 0 {
		return setupAccountOrDefault(requested), false
	}

	if requested == "" {
		return configured[0].ID, true
	}

	for _, row := range configured {
		if strings.EqualFold(strings.TrimSpace(row.ID), requested) {
			return row.ID, true
		}
	}
	return requested, false
}

func buildGogSetupResult(ctx context.Context, req nexadapter.AdapterSetupRequest, requireConfirm bool) (*nexadapter.AdapterSetupResult, error) {
	sessionID := setupSessionIDOrDefault(req.SessionID)

	if requireConfirm && !payloadBool(req.Payload, "confirm_auth_ready") {
		return &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusRequiresInput,
			SessionID:    sessionID,
			Account:      setupAccountOrDefault(req.Account),
			Service:      "google",
			Message:      "Confirm when `gog auth add <email>` is complete.",
			Instructions: "Run `gog auth add <email>` to authenticate Gmail access, then submit again.",
			Fields:       gogSetupFields(),
		}, nil
	}

	configured, err := accounts(ctx)
	if err != nil {
		return &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusRequiresInput,
			SessionID:    sessionID,
			Account:      setupAccountOrDefault(req.Account),
			Service:      "google",
			Message:      "Unable to read Gog auth accounts.",
			Instructions: "Ensure Gog CLI is installed and run `gog auth add <email>`.",
			Fields:       gogSetupFields(),
			Metadata: map[string]any{
				"error": err.Error(),
			},
		}, nil
	}

	account, found := selectSetupAccount(req, configured)
	if !found {
		return &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusRequiresInput,
			SessionID:    sessionID,
			Account:      setupAccountOrDefault(account),
			Service:      "google",
			Message:      "Requested Gog account is not authenticated yet.",
			Instructions: "Run `gog auth add <email>` for this account, then submit again.",
			Fields:       gogSetupFields(),
			Metadata: map[string]any{
				"configured_accounts": len(configured),
			},
		}, nil
	}

	healthResult, err := health(ctx, account)
	if err != nil {
		return nil, err
	}
	if healthResult.Connected {
		return &nexadapter.AdapterSetupResult{
			Status:    nexadapter.SetupStatusCompleted,
			SessionID: sessionID,
			Account:   account,
			Service:   "google",
			Message:   "Gog account is authenticated and ready.",
			Metadata: map[string]any{
				"configured_accounts": len(configured),
			},
		}, nil
	}

	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusRequiresInput,
		SessionID:    sessionID,
		Account:      account,
		Service:      "google",
		Message:      "Gog account health check failed.",
		Instructions: "Re-run `gog auth add <email>` and submit again.",
		Fields:       gogSetupFields(),
		Metadata: map[string]any{
			"error": healthResult.Error,
		},
	}, nil
}

func setupStart(ctx context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return buildGogSetupResult(ctx, req, false)
}

func setupSubmit(ctx context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return buildGogSetupResult(ctx, req, true)
}

func setupStatus(ctx context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return buildGogSetupResult(ctx, req, false)
}

func setupCancel(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return &nexadapter.AdapterSetupResult{
		Status:    nexadapter.SetupStatusCancelled,
		SessionID: setupSessionIDOrDefault(req.SessionID),
		Account:   setupAccountOrDefault(req.Account),
		Service:   "google",
		Message:   "Setup cancelled.",
	}, nil
}

// ---------- Health ----------

func health(ctx context.Context, account string) (*nexadapter.AdapterHealth, error) {
	resolved, err := resolveAccount(ctx, account)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   fallbackAccount(account),
			Error:     err.Error(),
		}, nil
	}

	// Basic connectivity: can we hit Gmail labels list?
	_, err = runGogJSON(ctx, resolved, "gmail", "labels", "list")
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   resolved,
			Error:     err.Error(),
		}, nil
	}

	return &nexadapter.AdapterHealth{
		Connected:   true,
		Account:     resolved,
		LastEventAt: time.Now().UnixMilli(),
	}, nil
}

// ---------- Send ----------

func send(ctx context.Context, req nexadapter.SendRequest) (*nexadapter.DeliveryResult, error) {
	resolved, err := resolveAccount(ctx, req.Account)
	if err != nil {
		return &nexadapter.DeliveryResult{
			Success: false,
			Error: &nexadapter.DeliveryError{
				Type:    "permission_denied",
				Message: err.Error(),
				Retry:   false,
			},
		}, nil
	}

	target := strings.TrimSpace(req.To)
	if target == "" {
		return &nexadapter.DeliveryResult{
			Success: false,
			Error: &nexadapter.DeliveryError{
				Type:    "content_rejected",
				Message: "--to is required",
				Retry:   false,
			},
		}, nil
	}

	if strings.TrimSpace(req.Media) != "" {
		return &nexadapter.DeliveryResult{
			Success: false,
			Error: &nexadapter.DeliveryError{
				Type:    "content_rejected",
				Message: "media sends are not supported by this adapter wrapper yet",
				Retry:   false,
			},
		}, nil
	}

	subject, body := parseEmailContent(req.Text)
	if strings.TrimSpace(body) == "" {
		return &nexadapter.DeliveryResult{
			Success: false,
			Error: &nexadapter.DeliveryError{
				Type:    "content_rejected",
				Message: "message text is required",
				Retry:   false,
			},
		}, nil
	}

	out, err := runGogJSON(ctx, resolved, buildGmailSendArgs(
		target,
		subject,
		body,
		strings.TrimSpace(req.ThreadID),
		strings.TrimSpace(req.ReplyToID),
	)...)
	if err != nil {
		return &nexadapter.DeliveryResult{
			Success: false,
			Error: &nexadapter.DeliveryError{
				Type:    "network",
				Message: err.Error(),
				Retry:   true,
			},
		}, nil
	}

	type sendResp struct {
		MessageID string `json:"messageId"`
		ThreadID  string `json:"threadId"`
	}

	var resp sendResp
	if err := json.Unmarshal(out, &resp); err != nil {
		return &nexadapter.DeliveryResult{
			Success: false,
			Error: &nexadapter.DeliveryError{
				Type:    "unknown",
				Message: fmt.Sprintf("parse gog gmail send: %v", err),
				Retry:   false,
			},
		}, nil
	}

	messageID := strings.TrimSpace(resp.MessageID)
	if messageID == "" {
		messageID = fmt.Sprintf("gmail:sent:%d", time.Now().UnixNano())
	}

	_ = resp.ThreadID // reserved for future metadata

	return &nexadapter.DeliveryResult{
		Success:    true,
		MessageIDs: []string{messageID},
		ChunksSent: 1,
	}, nil
}

func buildGmailSendArgs(
	target string,
	subject string,
	body string,
	threadID string,
	replyToMessageID string,
) []string {
	args := []string{
		"gmail", "send",
		"--to", target,
		"--subject", subject,
		"--body", body,
	}
	if threadID != "" {
		// gogcli only allows one of --thread-id or --reply-to-message-id.
		// Prefer explicit reply target when both are provided.
		if replyToMessageID == "" {
			args = append(args, "--thread-id", threadID)
		}
	}
	if replyToMessageID != "" {
		args = append(args, "--reply-to-message-id", replyToMessageID)
	}
	return args
}

func parseEmailContent(text string) (subject string, body string) {
	raw := strings.TrimSpace(text)
	if raw == "" {
		return defaultSubject, ""
	}

	lines := strings.Split(raw, "\n")
	first := strings.TrimSpace(lines[0])
	lower := strings.ToLower(first)
	if strings.HasPrefix(lower, "subject:") {
		subject = strings.TrimSpace(first[len("subject:"):])
		body = strings.TrimSpace(strings.Join(lines[1:], "\n"))
		if subject == "" {
			subject = defaultSubject
		}
		return subject, body
	}

	return defaultSubject, raw
}

// ---------- Monitor ----------

type gogWatchStatusResponse struct {
	Watch struct {
		HistoryID string `json:"historyId"`
	} `json:"watch"`
}

type gogHistoryResponse struct {
	HistoryID     string   `json:"historyId"`
	Messages      []string `json:"messages"`
	NextPageToken string   `json:"nextPageToken"`
}

type gogMessageSearchResponse struct {
	Messages []struct {
		ID string `json:"id"`
	} `json:"messages"`
	NextPageToken string `json:"nextPageToken"`
}

type gogGmailGetResponse struct {
	Message struct {
		ID           string   `json:"id"`
		ThreadID     string   `json:"threadId"`
		InternalDate string   `json:"internalDate"`
		Snippet      string   `json:"snippet"`
		LabelIDs     []string `json:"labelIds"`
	} `json:"message"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

func monitor(ctx context.Context, account string, emit nexadapter.EmitFunc) error {
	resolved, err := resolveAccount(ctx, account)
	if err != nil {
		return err
	}

	statePath, stateErr := resolveMonitorStatePath(resolved)
	if stateErr != nil {
		nexadapter.LogError("monitor state path unavailable for %s: %v", resolved, stateErr)
	}

	cursor, err := resolveHistoryCursor(ctx, resolved, statePath)
	if err == nil && strings.TrimSpace(cursor) != "" {
		return monitorWithHistoryCursor(ctx, resolved, cursor, statePath, emit)
	}

	nexadapter.LogInfo(
		"monitor starting for account %q in polling mode (no Gmail watch state): %v",
		resolved,
		err,
	)
	pollStatePath, pollStateErr := resolvePollStatePath(resolved)
	if pollStateErr != nil {
		nexadapter.LogError("poll state path unavailable for %s: %v", resolved, pollStateErr)
	}
	return monitorWithPollingQuery(ctx, resolved, pollStatePath, emit)
}

func backfill(ctx context.Context, account string, since time.Time, emit nexadapter.EmitFunc) error {
	resolved, err := resolveAccount(ctx, account)
	if err != nil {
		return err
	}

	query := buildBackfillQuery(since)
	page := ""
	lastMessageID := ""
	seen := make(map[string]struct{})
	total := 0

	nexadapter.LogInfo(
		"backfill starting for account %q (since=%s query=%q)",
		resolved,
		since.UTC().Format(time.RFC3339),
		query,
	)

	for {
		nextPage, messageIDs, err := searchMessageIDsPage(ctx, resolved, query, page, defaultSearchMax)
		if err != nil {
			return err
		}

		for i := len(messageIDs) - 1; i >= 0; i-- {
			messageID := strings.TrimSpace(messageIDs[i])
			if messageID == "" {
				continue
			}
			if _, exists := seen[messageID]; exists {
				continue
			}
			seen[messageID] = struct{}{}
			event, err := buildEventFromMessage(ctx, resolved, messageID)
			if err != nil {
				nexadapter.LogError("gmail get failed for %s/%s: %v", resolved, messageID, err)
				continue
			}
			emit(event)
			lastMessageID = messageID
			total++
		}

		if strings.TrimSpace(nextPage) == "" {
			break
		}
		page = nextPage
	}

	backfillStatePath, pathErr := resolveBackfillStatePath(resolved)
	if pathErr != nil {
		nexadapter.LogError("backfill state path unavailable for %s: %v", resolved, pathErr)
	} else if backfillStatePath != "" {
		if err := writeBackfillState(backfillStatePath, since, lastMessageID); err != nil {
			nexadapter.LogError("failed writing backfill state for %s: %v", resolved, err)
		}
	}

	nexadapter.LogInfo("backfill complete for account %q: %d messages", resolved, total)
	return nil
}

func monitorWithHistoryCursor(
	ctx context.Context,
	account string,
	cursor string,
	statePath string,
	emit nexadapter.EmitFunc,
) error {
	nexadapter.LogInfo(
		"monitor starting for account %q (historyId=%s state=%s)",
		account,
		cursor,
		statePath,
	)

	ticker := time.NewTicker(resolvePollInterval())
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			nexadapter.LogInfo("monitor shutting down")
			return nil
		case <-ticker.C:
		}

		nextCursor, messageIDs, err := fetchHistoryMessageIDs(ctx, account, cursor)
		if err != nil {
			nexadapter.LogError("gmail history failed for %s: %v", account, err)
			continue
		}

		for _, messageID := range messageIDs {
			event, err := buildEventFromMessage(ctx, account, messageID)
			if err != nil {
				nexadapter.LogError("gmail get failed for %s/%s: %v", account, messageID, err)
				continue
			}
			emit(event)
		}

		if nextCursor != "" && nextCursor != cursor {
			cursor = nextCursor
			if statePath != "" {
				if err := writeMonitorCursor(statePath, cursor); err != nil {
					nexadapter.LogError("failed writing monitor state for %s: %v", account, err)
				}
			}
		}
	}
}

func monitorWithPollingQuery(
	ctx context.Context,
	account string,
	pollStatePath string,
	emit nexadapter.EmitFunc,
) error {
	seenSet := newSeenMessageSet(nil)
	hasPersistedState := false
	if pollStatePath != "" {
		if seen, err := readPollState(pollStatePath); err == nil {
			seenSet = newSeenMessageSet(seen.SeenMessageIDs)
			hasPersistedState = len(seen.SeenMessageIDs) > 0
		} else {
			nexadapter.LogError("failed reading poll state for %s: %v", account, err)
		}
	}

	query := resolvePollQuery()
	nexadapter.LogInfo(
		"polling query monitor active for account %q (query=%q state=%s)",
		account,
		query,
		pollStatePath,
	)

	// First run without persisted state: fast-forward so monitor starts from "now"
	// instead of replaying recent mailbox history.
	if !hasPersistedState {
		messageIDs, err := fetchRecentMessageIDs(ctx, account, query, defaultSearchMax)
		if err != nil {
			nexadapter.LogError("initial gmail message search failed for %s: %v", account, err)
		} else {
			for _, messageID := range messageIDs {
				seenSet.Add(messageID)
			}
			if pollStatePath != "" {
				if err := writePollState(
					pollStatePath,
					pollState{SeenMessageIDs: seenSet.Snapshot()},
				); err != nil {
					nexadapter.LogError("failed writing initial poll state for %s: %v", account, err)
				}
			}
			nexadapter.LogInfo(
				"polling query monitor fast-forwarded for account %q (%d known IDs)",
				account,
				len(messageIDs),
			)
		}
	}

	ticker := time.NewTicker(resolvePollInterval())
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			nexadapter.LogInfo("monitor shutting down")
			return nil
		case <-ticker.C:
		}

		messageIDs, err := fetchRecentMessageIDs(ctx, account, query, defaultSearchMax)
		if err != nil {
			nexadapter.LogError("gmail message search failed for %s: %v", account, err)
			continue
		}

		updated := false
		for i := len(messageIDs) - 1; i >= 0; i-- {
			messageID := strings.TrimSpace(messageIDs[i])
			if messageID == "" || seenSet.Contains(messageID) {
				continue
			}
			event, err := buildEventFromMessage(ctx, account, messageID)
			if err != nil {
				nexadapter.LogError("gmail get failed for %s/%s: %v", account, messageID, err)
				continue
			}
			emit(event)
			seenSet.Add(messageID)
			updated = true
		}

		if updated && pollStatePath != "" {
			if err := writePollState(
				pollStatePath,
				pollState{SeenMessageIDs: seenSet.Snapshot()},
			); err != nil {
				nexadapter.LogError("failed writing poll state for %s: %v", account, err)
			}
		}
	}
}

func resolvePollInterval() time.Duration {
	if raw := strings.TrimSpace(os.Getenv("NEXUS_GOG_POLL_INTERVAL")); raw != "" { //nolint:gosec // config
		if d, err := time.ParseDuration(raw); err == nil && d > 0 {
			return d
		}
	}
	return defaultPollInterval
}

func resolveRateLimitRetries() int {
	if raw := strings.TrimSpace(os.Getenv("NEXUS_GOG_RATE_LIMIT_RETRIES")); raw != "" { //nolint:gosec // config
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 0 {
			return parsed
		}
	}
	return defaultRateLimitRetries
}

func resolveRateLimitBackoff() time.Duration {
	if raw := strings.TrimSpace(os.Getenv("NEXUS_GOG_RATE_LIMIT_BACKOFF")); raw != "" { //nolint:gosec // config
		if d, err := time.ParseDuration(raw); err == nil && d > 0 {
			return d
		}
	}
	return defaultRetryBaseDelay
}

func isRateLimitError(stderr string) bool {
	lower := strings.ToLower(strings.TrimSpace(stderr))
	if lower == "" {
		return false
	}
	return strings.Contains(lower, "ratelimitexceeded") ||
		strings.Contains(lower, "quota exceeded") ||
		strings.Contains(lower, "too many requests")
}

func backoffDelay(attempt int, base time.Duration) time.Duration {
	if base <= 0 {
		base = defaultRetryBaseDelay
	}
	multiplier := 1 << attempt
	delay := time.Duration(multiplier) * base
	if delay > maxRetryDelay {
		return maxRetryDelay
	}
	return delay
}

func sleepWithContext(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func resolvePollQuery() string {
	if raw := strings.TrimSpace(os.Getenv("NEXUS_GOG_POLL_QUERY")); raw != "" { //nolint:gosec // config
		return raw
	}
	return defaultPollQuery
}

func resolveBackfillQueryBase() string {
	if raw := strings.TrimSpace(os.Getenv("NEXUS_GOG_BACKFILL_QUERY_BASE")); raw != "" { //nolint:gosec // config
		return raw
	}
	return defaultBackfillQuery
}

func resolveHistoryCursor(ctx context.Context, account string, statePath string) (string, error) {
	if statePath != "" {
		persisted, err := readMonitorCursor(statePath)
		if err != nil {
			nexadapter.LogError("failed reading monitor state for %s: %v", account, err)
		}
		if strings.TrimSpace(persisted) != "" {
			return persisted, nil
		}
	}

	watchCursor, err := readWatchCursor(ctx, account)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(watchCursor) == "" {
		return "", errors.New("gmail watch status missing historyId")
	}

	cursor := fastForwardHistoryCursor(ctx, account, watchCursor)
	if statePath != "" {
		if err := writeMonitorCursor(statePath, cursor); err != nil {
			nexadapter.LogError("failed writing monitor state for %s: %v", account, err)
		}
	}
	return cursor, nil
}

func readWatchCursor(ctx context.Context, account string) (string, error) {
	watchOut, err := runGogJSON(ctx, account, "gmail", "watch", "status")
	if err != nil {
		return "", err
	}

	var watch gogWatchStatusResponse
	if err := json.Unmarshal(watchOut, &watch); err != nil {
		return "", fmt.Errorf("parse gmail watch status: %w", err)
	}
	return strings.TrimSpace(watch.Watch.HistoryID), nil
}

func fastForwardHistoryCursor(ctx context.Context, account string, cursor string) string {
	next, _, err := fetchHistoryMessageIDs(ctx, account, cursor)
	if err != nil {
		return cursor
	}
	if strings.TrimSpace(next) == "" {
		return cursor
	}
	return next
}

func fetchHistoryMessageIDs(ctx context.Context, account string, cursor string) (nextCursor string, messageIDs []string, err error) {
	cursor = strings.TrimSpace(cursor)
	if cursor == "" {
		return "", nil, errors.New("missing history cursor")
	}

	seen := make(map[string]struct{})
	page := ""
	nextCursor = cursor

	for {
		args := []string{"gmail", "history", "--since", cursor, "--max", "100"}
		if strings.TrimSpace(page) != "" {
			args = append(args, "--page", page)
		}

		out, err := runGogJSON(ctx, account, args...)
		if err != nil {
			return nextCursor, nil, err
		}

		var resp gogHistoryResponse
		if err := json.Unmarshal(out, &resp); err != nil {
			return nextCursor, nil, fmt.Errorf("parse gmail history: %w", err)
		}

		if strings.TrimSpace(resp.HistoryID) != "" {
			nextCursor = strings.TrimSpace(resp.HistoryID)
		}

		for _, id := range resp.Messages {
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			messageIDs = append(messageIDs, id)
		}

		page = strings.TrimSpace(resp.NextPageToken)
		if page == "" {
			break
		}
	}

	return nextCursor, messageIDs, nil
}

func fetchRecentMessageIDs(ctx context.Context, account string, query string, max int) ([]string, error) {
	_, messageIDs, err := searchMessageIDsPage(ctx, account, query, "", max)
	if err != nil {
		return nil, err
	}
	return messageIDs, nil
}

func searchMessageIDsPage(
	ctx context.Context,
	account string,
	query string,
	pageToken string,
	max int,
) (nextPageToken string, messageIDs []string, err error) {
	trimmedQuery := strings.TrimSpace(query)
	if trimmedQuery == "" {
		return "", nil, errors.New("missing Gmail search query")
	}
	if max <= 0 {
		max = defaultSearchMax
	}

	args := []string{
		"gmail",
		"messages",
		"search",
		trimmedQuery,
		"--max",
		strconv.Itoa(max),
	}
	if strings.TrimSpace(pageToken) != "" {
		args = append(args, "--page", strings.TrimSpace(pageToken))
	}

	out, err := runGogJSON(ctx, account, args...)
	if err != nil {
		return "", nil, err
	}

	var resp gogMessageSearchResponse
	if err := json.Unmarshal(out, &resp); err != nil {
		return "", nil, fmt.Errorf("parse gmail message search: %w", err)
	}

	messageIDs = make([]string, 0, len(resp.Messages))
	for _, msg := range resp.Messages {
		id := strings.TrimSpace(msg.ID)
		if id == "" {
			continue
		}
		messageIDs = append(messageIDs, id)
	}

	return strings.TrimSpace(resp.NextPageToken), messageIDs, nil
}

func buildBackfillQuery(since time.Time) string {
	dateFilter := fmt.Sprintf("after:%s", since.UTC().Format("2006/01/02"))
	if raw := strings.TrimSpace(os.Getenv("NEXUS_GOG_BACKFILL_QUERY")); raw != "" { //nolint:gosec // config
		lower := strings.ToLower(raw)
		if strings.Contains(lower, "after:") {
			return raw
		}
		return fmt.Sprintf("%s %s", raw, dateFilter)
	}
	return fmt.Sprintf("%s %s", resolveBackfillQueryBase(), dateFilter)
}

func buildEventFromMessage(ctx context.Context, account string, messageID string) (nexadapter.NexusEvent, error) {
	out, err := runGogJSON(ctx, account, "gmail", "get", messageID, "--format", "metadata")
	if err != nil {
		return nexadapter.NexusEvent{}, err
	}

	var resp gogGmailGetResponse
	if err := json.Unmarshal(out, &resp); err != nil {
		return nexadapter.NexusEvent{}, fmt.Errorf("parse gmail get: %w", err)
	}

	fromHeader := strings.TrimSpace(resp.Headers["from"])
	subject := strings.TrimSpace(resp.Headers["subject"])
	toHeader := strings.TrimSpace(resp.Headers["to"])

	senderID, senderName := parseSender(fromHeader)
	if senderID == "" {
		senderID = "unknown"
	}

	threadID := strings.TrimSpace(resp.Message.ThreadID)
	peerID := senderID
	peerKind := "dm"

	timestamp := time.Now().UnixMilli()
	if raw := strings.TrimSpace(resp.Message.InternalDate); raw != "" {
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil && parsed > 0 {
			timestamp = parsed
		}
	}

	content := renderEmailEventContent(subject, resp.Message.Snippet)
	eventBuilder := nexadapter.NewEvent("gmail", fmt.Sprintf("gmail:message:%s", messageID)).
		WithTimestampUnixMs(timestamp).
		WithContent(content).
		WithSender(senderID, senderName).
		WithContainer(peerID, peerKind).
		WithAccount(account).
		WithMetadata("message_id", messageID).
		WithMetadata("thread_id", threadID).
		WithMetadata("subject", subject).
		WithMetadata("from", fromHeader).
		WithMetadata("to", toHeader).
		WithMetadata("snippet", resp.Message.Snippet).
		WithMetadata("label_ids", resp.Message.LabelIDs)
	if threadID != "" {
		eventBuilder.WithThread(threadID)
	}

	return eventBuilder.Build(), nil
}

func renderEmailEventContent(subject string, snippet string) string {
	subject = strings.TrimSpace(subject)
	snippet = strings.TrimSpace(snippet)

	switch {
	case subject != "" && snippet != "":
		return fmt.Sprintf("Subject: %s\n\n%s", subject, snippet)
	case subject != "":
		return fmt.Sprintf("Subject: %s", subject)
	case snippet != "":
		return snippet
	default:
		return "(no content)"
	}
}

func parseSender(raw string) (id string, name string) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", ""
	}
	if addr, err := mail.ParseAddress(value); err == nil && addr != nil {
		return strings.ToLower(strings.TrimSpace(addr.Address)), strings.TrimSpace(addr.Name)
	}
	if list, err := mail.ParseAddressList(value); err == nil && len(list) > 0 {
		first := list[0]
		return strings.ToLower(strings.TrimSpace(first.Address)), strings.TrimSpace(first.Name)
	}
	return strings.ToLower(value), ""
}

// ---------- gog subprocess ----------

func gogCommand() string {
	if v := strings.TrimSpace(os.Getenv("NEXUS_GOG_COMMAND")); v != "" { //nolint:gosec // config
		return v
	}
	return "gog"
}

func resolveAccount(ctx context.Context, account string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(account))
	if normalized != "" {
		return normalized, nil
	}

	// Pick the first available gog account.
	list, err := accounts(ctx)
	if err != nil {
		return "", err
	}
	if len(list) == 0 {
		return "", errors.New("no gog accounts configured; run `gog auth add <email>` first")
	}
	return list[0].ID, nil
}

func fallbackAccount(account string) string {
	value := strings.TrimSpace(account)
	if value == "" {
		return "default"
	}
	return value
}

func runGogJSON(ctx context.Context, account string, args ...string) ([]byte, error) {
	base := []string{"--json"}
	if strings.TrimSpace(account) != "" {
		base = append(base, "--account", account)
	}
	full := append(base, args...)

	maxRetries := resolveRateLimitRetries()
	baseDelay := resolveRateLimitBackoff()

	for attempt := 0; ; attempt++ {
		cmd := exec.CommandContext(ctx, gogCommand(), full...) //nolint:gosec // command is configurable by user
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
			if attempt < maxRetries && isRateLimitError(stderr) {
				delay := backoffDelay(attempt, baseDelay)
				nexadapter.LogError(
					"gog rate limited (%s); retrying in %s (%d/%d)",
					strings.Join(args, " "),
					delay,
					attempt+1,
					maxRetries,
				)
				if err := sleepWithContext(ctx, delay); err != nil {
					return nil, err
				}
				continue
			}
			return nil, fmt.Errorf("gog %s failed: %s", strings.Join(args, " "), stderr)
		}

		return nil, err
	}
}

func resolveMonitorStatePath(account string) (string, error) {
	if raw := strings.TrimSpace(os.Getenv("NEXUS_GOG_STATE_PATH")); raw != "" { //nolint:gosec // config
		return raw, nil
	}
	return resolveStatePath(account, ".monitor.json")
}

func resolvePollStatePath(account string) (string, error) {
	return resolveStatePath(account, ".poll.json")
}

func resolveBackfillStatePath(account string) (string, error) {
	return resolveStatePath(account, ".backfill.json")
}

func resolveStatePath(account string, suffix string) (string, error) {
	baseDir := strings.TrimSpace(os.Getenv("NEXUS_GOG_STATE_DIR")) //nolint:gosec // config
	if baseDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve home dir: %w", err)
		}
		baseDir = filepath.Join(home, ".nexus", "adapters", "gog")
	}
	token := sanitizeFileToken(account)
	if token == "" {
		token = "default"
	}
	return filepath.Join(baseDir, token+suffix), nil
}

func sanitizeFileToken(raw string) string {
	trimmed := strings.TrimSpace(strings.ToLower(raw))
	if trimmed == "" {
		return ""
	}
	var b strings.Builder
	for _, ch := range trimmed {
		switch {
		case ch >= 'a' && ch <= 'z':
			b.WriteRune(ch)
		case ch >= '0' && ch <= '9':
			b.WriteRune(ch)
		case ch == '.', ch == '-', ch == '_':
			b.WriteRune(ch)
		default:
			b.WriteByte('_')
		}
	}
	return strings.Trim(b.String(), "._-")
}

func readMonitorCursor(statePath string) (string, error) {
	raw, err := os.ReadFile(statePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", err
	}
	var state monitorState
	if err := json.Unmarshal(raw, &state); err != nil {
		return "", fmt.Errorf("parse monitor state: %w", err)
	}
	return strings.TrimSpace(state.HistoryID), nil
}

func writeMonitorCursor(statePath string, cursor string) error {
	if strings.TrimSpace(cursor) == "" {
		return nil
	}
	state := monitorState{HistoryID: strings.TrimSpace(cursor)}
	return writeJSONStateFile(statePath, state)
}

func readPollState(statePath string) (pollState, error) {
	raw, err := os.ReadFile(statePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return pollState{}, nil
		}
		return pollState{}, err
	}
	var state pollState
	if err := json.Unmarshal(raw, &state); err != nil {
		return pollState{}, fmt.Errorf("parse poll state: %w", err)
	}
	state.SeenMessageIDs = trimSeenMessageIDs(state.SeenMessageIDs)
	return state, nil
}

func writePollState(statePath string, state pollState) error {
	state.SeenMessageIDs = trimSeenMessageIDs(state.SeenMessageIDs)
	return writeJSONStateFile(statePath, state)
}

func writeBackfillState(statePath string, since time.Time, lastMessageID string) error {
	state := backfillState{
		LastSinceRFC3339: since.UTC().Format(time.RFC3339),
		LastCompletedAt:  time.Now().UnixMilli(),
		LastMessageID:    strings.TrimSpace(lastMessageID),
	}
	return writeJSONStateFile(statePath, state)
}

func writeJSONStateFile(statePath string, state any) error {
	if err := os.MkdirAll(filepath.Dir(statePath), 0o700); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	tmpPath := statePath + ".tmp"
	if err := os.WriteFile(tmpPath, append(payload, '\n'), 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, statePath); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return nil
}

type seenMessageSet struct {
	order []string
	seen  map[string]struct{}
}

func newSeenMessageSet(seed []string) *seenMessageSet {
	set := &seenMessageSet{
		order: make([]string, 0, len(seed)),
		seen:  make(map[string]struct{}, len(seed)),
	}
	for _, id := range trimSeenMessageIDs(seed) {
		set.Add(id)
	}
	return set
}

func (s *seenMessageSet) Contains(id string) bool {
	_, ok := s.seen[strings.TrimSpace(id)]
	return ok
}

func (s *seenMessageSet) Add(id string) {
	normalized := strings.TrimSpace(id)
	if normalized == "" {
		return
	}
	if _, exists := s.seen[normalized]; exists {
		return
	}
	s.order = append(s.order, normalized)
	s.seen[normalized] = struct{}{}
	for len(s.order) > maxSeenMessageIDs {
		oldest := s.order[0]
		s.order = s.order[1:]
		delete(s.seen, oldest)
	}
}

func (s *seenMessageSet) Snapshot() []string {
	out := make([]string, len(s.order))
	copy(out, s.order)
	return out
}

func trimSeenMessageIDs(ids []string) []string {
	result := make([]string, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		normalized := strings.TrimSpace(id)
		if normalized == "" {
			continue
		}
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}
	if len(result) <= maxSeenMessageIDs {
		return result
	}
	return result[len(result)-maxSeenMessageIDs:]
}
