package nexadapter

import "time"

// EventBuilder provides a fluent API for constructing NexusEvent objects.
// Use NewEvent() to start building.
type EventBuilder struct {
	event NexusEvent
}

// NewEvent creates a new event builder for the given platform and event ID.
// The event ID should follow the convention "{platform}:{source_id}".
//
//	event := nexadapter.NewEvent("imessage", "imessage:abc-def-123").
//	    WithTimestamp(msg.Date).
//	    WithContent(msg.Text).
//	    WithSender(msg.Handle, msg.DisplayName).
//	    WithContainer(msg.ChatID, "dm").
//	    WithAccount("default").
//	    Build()
func NewEvent(platform, eventID string) *EventBuilder {
	return &EventBuilder{
		event: NexusEvent{
			Platform:    platform,
			EventID:     eventID,
			ContentType: "text",
			Timestamp:   time.Now().UnixMilli(),
		},
	}
}

// WithTimestamp sets the event timestamp from a time.Time.
func (b *EventBuilder) WithTimestamp(t time.Time) *EventBuilder {
	b.event.Timestamp = t.UnixMilli()
	return b
}

// WithTimestampUnixMs sets the event timestamp from a Unix millisecond value.
func (b *EventBuilder) WithTimestampUnixMs(ms int64) *EventBuilder {
	b.event.Timestamp = ms
	return b
}

// WithContent sets the text content of the event.
func (b *EventBuilder) WithContent(content string) *EventBuilder {
	b.event.Content = content
	return b
}

// WithContentType sets the content type (default is "text").
// Common values: "text", "image", "audio", "video", "file", "reaction".
func (b *EventBuilder) WithContentType(ct string) *EventBuilder {
	b.event.ContentType = ct
	return b
}

// WithSender sets the sender's platform ID and optional display name.
func (b *EventBuilder) WithSender(id, name string) *EventBuilder {
	b.event.SenderID = id
	b.event.SenderName = name
	return b
}

// WithContainer sets the conversation container identifier and kind.
// containerID is the chat/channel/DM identifier.
// kind is one of: "dm", "direct", "group", "channel".
func (b *EventBuilder) WithContainer(containerID, kind string) *EventBuilder {
	b.event.ContainerID = containerID
	b.event.ContainerKind = kind
	return b
}

// WithPeer is a deprecated alias for WithContainer.
func (b *EventBuilder) WithPeer(peerID, kind string) *EventBuilder {
	return b.WithContainer(peerID, kind)
}

// WithAccount sets the adapter account ID that received this event.
func (b *EventBuilder) WithAccount(account string) *EventBuilder {
	b.event.AccountID = account
	return b
}

// WithThread sets the thread ID for threaded conversations.
func (b *EventBuilder) WithThread(threadID string) *EventBuilder {
	b.event.ThreadID = threadID
	return b
}

// WithSpace sets the optional parent container scope (e.g., guild/workspace).
func (b *EventBuilder) WithSpace(spaceID, spaceName string) *EventBuilder {
	b.event.SpaceID = spaceID
	b.event.SpaceName = spaceName
	return b
}

// WithReplyTo sets the event ID this event is replying to.
func (b *EventBuilder) WithReplyTo(eventID string) *EventBuilder {
	b.event.ReplyToID = eventID
	return b
}

// WithAttachment adds a media attachment to the event.
func (b *EventBuilder) WithAttachment(a Attachment) *EventBuilder {
	b.event.Attachments = append(b.event.Attachments, a)
	return b
}

// WithMetadata sets a key-value pair in the platform-specific metadata.
func (b *EventBuilder) WithMetadata(key string, value any) *EventBuilder {
	if b.event.Metadata == nil {
		b.event.Metadata = make(map[string]any)
	}
	b.event.Metadata[key] = value
	return b
}

// Build returns the constructed NexusEvent.
func (b *EventBuilder) Build() NexusEvent {
	return b.event
}
