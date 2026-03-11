package nexadapter

import "time"

// RecordBuilder provides a fluent API for constructing canonical
// record.ingest envelopes. Use NewRecord() to start building.
type RecordBuilder struct {
	record AdapterInboundRecord
}

// NewRecord creates a new record builder for the given platform and external
// record ID.
func NewRecord(platform, externalRecordID string) *RecordBuilder {
	return &RecordBuilder{
		record: AdapterInboundRecord{
			Operation: "record.ingest",
			Routing: AdapterInboundRouting{
				Platform:      platform,
				ConnectionID:  "",
				SenderID:      "",
				ContainerKind: "direct",
				ContainerID:   "",
			},
			Payload: AdapterInboundPayload{
				ExternalRecordID: externalRecordID,
				Timestamp:        time.Now().UnixMilli(),
				Content:          "",
				ContentType:      "text",
			},
		},
	}
}

func (b *RecordBuilder) WithTimestamp(t time.Time) *RecordBuilder {
	b.record.Payload.Timestamp = t.UnixMilli()
	return b
}

func (b *RecordBuilder) WithTimestampUnixMs(ms int64) *RecordBuilder {
	b.record.Payload.Timestamp = ms
	return b
}

func (b *RecordBuilder) WithContent(content string) *RecordBuilder {
	b.record.Payload.Content = content
	return b
}

func (b *RecordBuilder) WithContentType(ct string) *RecordBuilder {
	b.record.Payload.ContentType = ct
	return b
}

func (b *RecordBuilder) WithSender(id, name string) *RecordBuilder {
	b.record.Routing.SenderID = id
	b.record.Routing.SenderName = name
	return b
}

func (b *RecordBuilder) WithReceiver(id, name string) *RecordBuilder {
	b.record.Routing.ReceiverID = id
	b.record.Routing.ReceiverName = name
	return b
}

func (b *RecordBuilder) WithContainer(containerID, kind string) *RecordBuilder {
	b.record.Routing.ContainerID = containerID
	b.record.Routing.ContainerKind = kind
	return b
}

func (b *RecordBuilder) WithConnection(connectionID string) *RecordBuilder {
	b.record.Routing.ConnectionID = connectionID
	return b
}

func (b *RecordBuilder) WithThread(threadID string) *RecordBuilder {
	b.record.Routing.ThreadID = threadID
	return b
}

func (b *RecordBuilder) WithSpace(spaceID, spaceName string) *RecordBuilder {
	b.record.Routing.SpaceID = spaceID
	b.record.Routing.SpaceName = spaceName
	return b
}

func (b *RecordBuilder) WithReplyTo(recordID string) *RecordBuilder {
	b.record.Routing.ReplyToID = recordID
	return b
}

func (b *RecordBuilder) WithAttachment(a Attachment) *RecordBuilder {
	b.record.Payload.Attachments = append(b.record.Payload.Attachments, a)
	return b
}

func (b *RecordBuilder) WithRecipient(recipientID string) *RecordBuilder {
	b.record.Payload.Recipients = append(b.record.Payload.Recipients, recipientID)
	return b
}

func (b *RecordBuilder) WithMetadata(key string, value any) *RecordBuilder {
	if b.record.Payload.Metadata == nil {
		b.record.Payload.Metadata = make(map[string]any)
	}
	b.record.Payload.Metadata[key] = value
	return b
}

func (b *RecordBuilder) WithRoutingMetadata(key string, value any) *RecordBuilder {
	if b.record.Routing.Metadata == nil {
		b.record.Routing.Metadata = make(map[string]any)
	}
	b.record.Routing.Metadata[key] = value
	return b
}

func (b *RecordBuilder) Build() AdapterInboundRecord {
	return b.record
}
