package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/mail"
	"os"
	"os/exec"
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

	out, err := runGogJSON(ctx, resolved,
		"gmail", "send",
		"--to", target,
		"--subject", subject,
		"--body", body,
	)
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

	// Fast-forward once so we don't replay backlog at startup.
	cursor = fastForwardHistoryCursor(ctx, resolved, cursor)
	nexadapter.LogInfo("monitor starting for account %q (historyId=%s)", resolved, cursor)

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
	event := nexadapter.NewEvent("gmail", fmt.Sprintf("gmail:message:%s", messageID)).
		WithTimestampUnixMs(timestamp).
		WithContent(content).
		WithSender(senderID, senderName).
		WithPeer(peerID, peerKind).
		WithAccount(account).
		Build()

	if threadID != "" {
		event.ThreadID = threadID
	}

	event.Metadata = map[string]any{
		"message_id": messageID,
		"thread_id":  threadID,
		"subject":    subject,
		"from":       fromHeader,
		"to":         toHeader,
		"snippet":    resp.Message.Snippet,
		"label_ids":  resp.Message.LabelIDs,
	}

	return event, nil
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
