package nexadapter

// --- Adapter Identity & Registration ---

// AdapterInfo is returned by the `info` command. Describes the adapter's
// identity, capabilities, and channel features to NEX.
type AdapterInfo struct {
	// Identity
	Channel string `json:"channel"`  // "gmail", "imessage", "discord", etc.
	Name    string `json:"name"`     // Human-friendly name
	Version string `json:"version"`  // Semver

	// What this adapter implements
	Supports []Capability `json:"supports"`

	// Credential linking
	CredentialService string `json:"credential_service,omitempty"` // Links to credential store service
	MultiAccount      bool   `json:"multi_account"`

	// Channel capabilities (for agent context)
	ChannelCapabilities ChannelCapabilities `json:"channel_capabilities"`
}

// Capability identifies a command/feature the adapter supports.
type Capability string

const (
	CapMonitor  Capability = "monitor"
	CapSend     Capability = "send"
	CapStream   Capability = "stream"
	CapBackfill Capability = "backfill"
	CapHealth   Capability = "health"
	CapAccounts Capability = "accounts"
	CapReact    Capability = "react"
	CapEdit     Capability = "edit"
	CapDelete   Capability = "delete"
	CapPoll     Capability = "poll"
)

// ChannelCapabilities describes what a channel supports. Reported by the
// adapter via `info`, stored by NEX, served to context assembly so the
// agent knows how to format its responses.
type ChannelCapabilities struct {
	// Text limits
	TextLimit    int `json:"text_limit"`
	CaptionLimit int `json:"caption_limit,omitempty"`

	// Formatting
	SupportsMarkdown   bool   `json:"supports_markdown"`
	MarkdownFlavor     string `json:"markdown_flavor,omitempty"` // "standard", "discord", "telegram_html", "slack_mrkdwn"
	SupportsTables     bool   `json:"supports_tables"`
	SupportsCodeBlocks bool   `json:"supports_code_blocks"`

	// Features
	SupportsEmbeds     bool `json:"supports_embeds"`
	SupportsThreads    bool `json:"supports_threads"`
	SupportsReactions  bool `json:"supports_reactions"`
	SupportsPolls      bool `json:"supports_polls"`
	SupportsButtons    bool `json:"supports_buttons"`
	SupportsEdit       bool `json:"supports_edit"`
	SupportsDelete     bool `json:"supports_delete"`
	SupportsMedia      bool `json:"supports_media"`
	SupportsVoiceNotes bool `json:"supports_voice_notes"`

	// Behavioral
	SupportsStreamingEdit bool `json:"supports_streaming_edit"` // Can pseudo-stream by editing messages
}

// --- NexusEvent (Inbound) ---

// NexusEvent is the normalized event format that all adapters emit.
// One JSON object per line on stdout (JSONL).
type NexusEvent struct {
	// Identity
	EventID   string `json:"event_id"`  // "{platform}:{source_id}"
	Timestamp int64  `json:"timestamp"` // Unix ms

	// Content
	Content     string       `json:"content"`
	ContentType string       `json:"content_type"` // "text", "image", "audio", "video", "file", "reaction", "membership"
	Attachments []Attachment `json:"attachments,omitempty"`

	// Routing context
	Platform      string `json:"platform"`                // Platform name
	AccountID     string `json:"account_id"`              // Which account received this
	SenderID      string `json:"sender_id"`               // Platform-specific sender ID
	SenderName    string `json:"sender_name,omitempty"`
	SpaceID       string `json:"space_id,omitempty"`      // Optional parent container scope (guild/workspace)
	SpaceName     string `json:"space_name,omitempty"`    // Optional display name
	ContainerID   string `json:"container_id"`            // Chat/channel/DM identifier
	ContainerKind string `json:"container_kind"`          // "dm", "direct", "group", "channel"
	ContainerName string `json:"container_name,omitempty"`
	ThreadID      string `json:"thread_id,omitempty"`
	ThreadName    string `json:"thread_name,omitempty"`
	ReplyToID     string `json:"reply_to_id,omitempty"`

	// Platform metadata (anything channel-specific)
	Metadata         map[string]any `json:"metadata,omitempty"`
	DeliveryMetadata map[string]any `json:"delivery_metadata,omitempty"`
}

// Attachment represents a media attachment on an event.
type Attachment struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"` // MIME type
	SizeBytes   int64  `json:"size_bytes,omitempty"`
	URL         string `json:"url,omitempty"`  // Remote URL
	Path        string `json:"path,omitempty"` // Local file path
}

// --- Outbound Delivery ---

// SendRequest contains the parameters for a `send` command invocation.
type SendRequest struct {
	Account  string `json:"account"`
	To       string `json:"to"`                  // Email, phone, channel:id, etc.
	Text     string `json:"text,omitempty"`
	Media    string `json:"media,omitempty"`      // File path
	Caption  string `json:"caption,omitempty"`
	ReplyToID  string `json:"reply_to_id,omitempty"` // Reply to event ID
	ThreadID string `json:"thread_id,omitempty"`
}

// DeliveryResult is the structured output of a `send` command.
type DeliveryResult struct {
	Success    bool           `json:"success"`
	MessageIDs []string       `json:"message_ids"`
	ChunksSent int            `json:"chunks_sent"`
	TotalChars int            `json:"total_chars,omitempty"`
	Error      *DeliveryError `json:"error,omitempty"`
}

// DeliveryError describes why a delivery failed.
type DeliveryError struct {
	Type         string `json:"type"`                    // "rate_limited", "permission_denied", "not_found", "content_rejected", "network", "unknown"
	Message      string `json:"message"`
	RetryAfterMs int    `json:"retry_after_ms,omitempty"` // For rate_limited
	Retry        bool   `json:"retry"`                    // Whether NEX should retry
	Details      map[string]any `json:"details,omitempty"` // Optional channel-specific debugging
}

// --- Health ---

// AdapterHealth is the structured output of a `health` command.
type AdapterHealth struct {
	Connected   bool           `json:"connected"`
	Account     string         `json:"account"`
	LastEventAt int64          `json:"last_event_at,omitempty"` // Unix ms
	Error       string         `json:"error,omitempty"`
	Details     map[string]any `json:"details,omitempty"`
}

// --- Accounts ---

// AdapterAccount represents a configured account within the adapter.
type AdapterAccount struct {
	ID            string `json:"id"`
	DisplayName   string `json:"display_name,omitempty"`
	CredentialRef string `json:"credential_ref,omitempty"` // "google/tnapathy@gmail.com"
	Status        string `json:"status"`                   // "ready", "active", "error"
}

// --- Streaming Protocol ---

// StreamEvent represents an event from NEX piped to the adapter's stdin
// during streaming delivery. Type determines which fields are populated.
type StreamEvent struct {
	Type string `json:"type"` // "stream_start", "token", "tool_status", "reasoning", "stream_end", "stream_error"

	// stream_start
	RunID        string          `json:"runId,omitempty"`
	SessionLabel string          `json:"sessionLabel,omitempty"`
	Target       *DeliveryTarget `json:"target,omitempty"`

	// token, reasoning
	Text string `json:"text,omitempty"`

	// tool_status
	ToolName   string `json:"toolName,omitempty"`
	ToolCallID string `json:"toolCallId,omitempty"`
	Status     string `json:"status,omitempty"`  // "started", "completed", "failed"
	Summary    string `json:"summary,omitempty"`

	// stream_end
	Final bool `json:"final,omitempty"`

	// stream_error
	ErrorMsg string `json:"error,omitempty"`
	Partial  bool   `json:"partial,omitempty"`
}

// DeliveryTarget identifies where to send a message during streaming.
type DeliveryTarget struct {
	Platform  string `json:"platform"`
	AccountID string `json:"account_id"`
	To        string `json:"to"`
	ThreadID  string `json:"thread_id,omitempty"`
	ReplyToID string `json:"reply_to_id,omitempty"`
}

// AdapterStreamStatus is emitted by the adapter on stdout during streaming.
type AdapterStreamStatus struct {
	Type string `json:"type"` // "message_created", "message_updated", "message_sent", "delivery_complete", "delivery_error"

	// message_created, message_updated, message_sent
	MessageID string `json:"messageId,omitempty"`

	// message_updated
	Chars int `json:"chars,omitempty"`

	// message_sent
	IsFinal bool `json:"final,omitempty"`

	// delivery_complete
	MessageIDs []string `json:"messageIds,omitempty"`

	// delivery_error
	ErrorMsg string `json:"error,omitempty"`
}
