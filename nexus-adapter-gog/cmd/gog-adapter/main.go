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
	adapterName    = "gog-adapter"
	adapterVersion = "0.1.0"

	defaultSubject      = "Message from Nexus"
	defaultPollInterval = 20 * time.Second
)

type monitorState struct {
	HistoryID string `json:"history_id"`
}

func main() {
	nexadapter.Run(nexadapter.Adapter{
		Info:     info,
		Monitor:  monitor,
		Send:     send,
		Health:   health,
		Accounts: accounts,
	})
}

func info() *nexadapter.AdapterInfo {
	return &nexadapter.AdapterInfo{
		Channel: "gmail",
		Name:    adapterName,
		Version: adapterVersion,
		Supports: []nexadapter.Capability{
			nexadapter.CapMonitor,
			nexadapter.CapSend,
			nexadapter.CapHealth,
		},
		CredentialService: "google",
		MultiAccount:      true,
		ChannelCapabilities: nexadapter.ChannelCapabilities{
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
	}
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
		args = append(args, "--thread-id", threadID)
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

	// Require a configured watch state so we can seed a valid history cursor.
	watchOut, err := runGogJSON(ctx, resolved, "gmail", "watch", "status")
	if err != nil {
		return fmt.Errorf("missing gmail watch state for %s: %w (run `gog --account %s gmail watch start ...` first)", resolved, err, resolved)
	}

	var watch gogWatchStatusResponse
	if err := json.Unmarshal(watchOut, &watch); err != nil {
		return fmt.Errorf("parse gmail watch status: %w", err)
	}

	cursor := strings.TrimSpace(watch.Watch.HistoryID)
	if cursor == "" {
		return errors.New("gmail watch status missing historyId")
	}
	statePath, stateErr := resolveMonitorStatePath(resolved)
	if stateErr != nil {
		nexadapter.LogError("monitor state path unavailable for %s: %v", resolved, stateErr)
	}
	if statePath != "" {
		if persisted, err := readMonitorCursor(statePath); err == nil && persisted != "" {
			cursor = persisted
		} else if err != nil {
			nexadapter.LogError("failed reading monitor state for %s: %v", resolved, err)
		}
	}
	if statePath == "" || cursor == strings.TrimSpace(watch.Watch.HistoryID) {
		// First run (or missing state): fast-forward once so we don't replay backlog at startup.
		cursor = fastForwardHistoryCursor(ctx, resolved, cursor)
	}
	if statePath != "" {
		if err := writeMonitorCursor(statePath, cursor); err != nil {
			nexadapter.LogError("failed writing monitor state for %s: %v", resolved, err)
		}
	}
	nexadapter.LogInfo(
		"monitor starting for account %q (historyId=%s state=%s)",
		resolved,
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

		nextCursor, messageIDs, err := fetchHistoryMessageIDs(ctx, resolved, cursor)
		if err != nil {
			nexadapter.LogError("gmail history failed for %s: %v", resolved, err)
			continue
		}

		for _, messageID := range messageIDs {
			event, err := buildEventFromMessage(ctx, resolved, messageID)
			if err != nil {
				nexadapter.LogError("gmail get failed for %s/%s: %v", resolved, messageID, err)
				continue
			}
			emit(event)
		}

		if nextCursor != "" && nextCursor != cursor {
			cursor = nextCursor
			if statePath != "" {
				if err := writeMonitorCursor(statePath, cursor); err != nil {
					nexadapter.LogError("failed writing monitor state for %s: %v", resolved, err)
				}
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
		return nil, fmt.Errorf("gog %s failed: %s", strings.Join(args, " "), stderr)
	}

	return nil, err
}

func resolveMonitorStatePath(account string) (string, error) {
	if raw := strings.TrimSpace(os.Getenv("NEXUS_GOG_STATE_PATH")); raw != "" { //nolint:gosec // config
		return raw, nil
	}
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
	return filepath.Join(baseDir, token+".monitor.json"), nil
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
	if err := os.MkdirAll(filepath.Dir(statePath), 0o700); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(monitorState{HistoryID: cursor}, "", "  ")
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
