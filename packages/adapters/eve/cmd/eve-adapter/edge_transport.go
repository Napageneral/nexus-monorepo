package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	// Keep edge requests comfortably below Nex's 512 KiB websocket frame cap.
	maxEdgeRecordBatchBytes     = 256 * 1024
	maxEdgeAttachmentChunkBytes = 192 * 1024
)

type edgeSessionTransport struct {
	session         *edgeRuntimeSession
	sessionID       string
	attachmentByKey map[string]nexadapter.Attachment
}

type edgeAttachmentUploadRequest struct {
	SessionID  string                `json:"sessionId"`
	RecordID   string                `json:"recordId"`
	Attachment nexadapter.Attachment `json:"attachment"`
	BlobBase64 string                `json:"blobBase64"`
	UploadID   string                `json:"uploadId,omitempty"`
	ChunkIndex *int                  `json:"chunkIndex,omitempty"`
	ChunkTotal *int                  `json:"chunkTotal,omitempty"`
}

type edgeAttachmentUploadResponse struct {
	Attachment nexadapter.Attachment `json:"attachment"`
}

type edgeRecordBatchRequest struct {
	SessionID string                `json:"sessionId"`
	Records   []edgeCanonicalRecord `json:"records"`
}

type edgeRecordBatchResponse struct {
	Accepted int `json:"accepted"`
}

type edgeCanonicalRecord struct {
	Operation string               `json:"operation"`
	Routing   edgeCanonicalRouting `json:"routing"`
	Payload   edgeCanonicalPayload `json:"payload"`
}

type edgeCanonicalRouting struct {
	Adapter       string             `json:"adapter"`
	Platform      string             `json:"platform"`
	Sender        edgeCanonicalParty `json:"sender"`
	Receiver      edgeCanonicalParty `json:"receiver"`
	SpaceID       string             `json:"space_id,omitempty"`
	SpaceName     string             `json:"space_name,omitempty"`
	ContainerKind string             `json:"container_kind,omitempty"`
	ContainerID   string             `json:"container_id,omitempty"`
	ContainerName string             `json:"container_name,omitempty"`
	ThreadID      string             `json:"thread_id,omitempty"`
	ThreadName    string             `json:"thread_name,omitempty"`
	ReplyToID     string             `json:"reply_to_id,omitempty"`
	Metadata      map[string]any     `json:"metadata,omitempty"`
}

type edgeCanonicalParty struct {
	ID        string         `json:"id"`
	Name      string         `json:"name,omitempty"`
	AvatarURL string         `json:"avatar_url,omitempty"`
	Auth      map[string]any `json:"auth,omitempty"`
}

type edgeCanonicalPayload struct {
	ID          string                  `json:"id"`
	Content     string                  `json:"content"`
	ContentType string                  `json:"content_type"`
	Attachments []nexadapter.Attachment `json:"attachments,omitempty"`
	Recipients  []edgeCanonicalParty    `json:"recipients,omitempty"`
	Timestamp   int64                   `json:"timestamp"`
	Metadata    map[string]any          `json:"metadata,omitempty"`
}

func newEdgeSessionTransport(session *edgeRuntimeSession, sessionID string) *edgeSessionTransport {
	return &edgeSessionTransport{
		session:         session,
		sessionID:       strings.TrimSpace(sessionID),
		attachmentByKey: map[string]nexadapter.Attachment{},
	}
}

func (t *edgeSessionTransport) call(
	ctx context.Context,
	method string,
	params map[string]any,
) (json.RawMessage, error) {
	return t.session.call(ctx, method, params)
}

func (t *edgeSessionTransport) context() context.Context {
	if t.session == nil {
		return context.Background()
	}
	return t.session.ctx
}

func (t *edgeSessionTransport) close() {
	if t.session != nil {
		t.session.close()
	}
}

func (t *edgeSessionTransport) sendCanonicalRecords(
	ctx context.Context,
	records []nexadapter.AdapterInboundRecord,
) error {
	prepared, err := t.prepareCanonicalRecords(ctx, records)
	if err != nil {
		return err
	}
	if len(prepared) == 0 {
		return nil
	}

	batches, err := splitCanonicalRecordBatches(t.sessionID, prepared, maxEdgeRecordBatchBytes)
	if err != nil {
		return err
	}
	for _, batch := range batches {
		_, err = t.call(
			ctx,
			"adapters.edges.records.ingest_batch",
			map[string]any{
				"sessionId": t.sessionID,
				"records":   batch,
			},
		)
		if err != nil {
			return fmt.Errorf("edge record batch send failed: %w", err)
		}
	}
	return nil
}

func splitCanonicalRecordBatches(
	sessionID string,
	records []edgeCanonicalRecord,
	maxBytes int,
) ([][]edgeCanonicalRecord, error) {
	if len(records) == 0 {
		return nil, nil
	}
	if maxBytes <= 0 {
		maxBytes = maxEdgeRecordBatchBytes
	}

	batches := make([][]edgeCanonicalRecord, 0, 1)
	current := make([]edgeCanonicalRecord, 0, len(records))
	for _, record := range records {
		candidate := append(append([]edgeCanonicalRecord{}, current...), record)
		size, err := estimateCanonicalRecordBatchBytes(sessionID, candidate)
		if err != nil {
			return nil, fmt.Errorf("estimate edge record batch bytes: %w", err)
		}
		if len(current) == 0 || size <= maxBytes {
			current = candidate
			continue
		}
		batches = append(batches, current)
		current = []edgeCanonicalRecord{record}
	}
	if len(current) > 0 {
		batches = append(batches, current)
	}
	return batches, nil
}

func estimateCanonicalRecordBatchBytes(sessionID string, records []edgeCanonicalRecord) (int, error) {
	body, err := json.Marshal(map[string]any{
		"sessionId": sessionID,
		"records":   records,
	})
	if err != nil {
		return 0, err
	}
	return len(body), nil
}

func (t *edgeSessionTransport) prepareCanonicalRecords(
	ctx context.Context,
	records []nexadapter.AdapterInboundRecord,
) ([]edgeCanonicalRecord, error) {
	out := make([]edgeCanonicalRecord, len(records))
	for index, record := range records {
		cloned := cloneInboundRecord(record)
		for attachmentIndex, attachment := range cloned.Payload.Attachments {
			if strings.TrimSpace(attachment.LocalPath) == "" && strings.TrimSpace(attachment.URL) != "" {
				continue
			}
			prepared, err := t.uploadAttachment(ctx, cloned.Payload.ExternalRecordID, attachment)
			if err != nil {
				return nil, err
			}
			cloned.Payload.Attachments[attachmentIndex] = prepared
		}
		out[index] = canonicalizeInboundRecord(cloned)
	}
	return out, nil
}

func canonicalizeInboundRecord(record nexadapter.AdapterInboundRecord) edgeCanonicalRecord {
	routingMetadata := cloneAnyMap(record.Routing.Metadata)
	payloadMetadata := cloneAnyMap(record.Payload.Metadata)
	externalRecordID := strings.TrimSpace(record.Payload.ExternalRecordID)
	if externalRecordID != "" {
		if payloadMetadata == nil {
			payloadMetadata = map[string]any{}
		}
		if _, exists := payloadMetadata["external_record_id"]; !exists {
			payloadMetadata["external_record_id"] = externalRecordID
		}
	}

	routing := edgeCanonicalRouting{
		Adapter:       fallbackTrimmed(record.Routing.Adapter, adapterName),
		Platform:      strings.TrimSpace(record.Routing.Platform),
		Sender:        canonicalizeParty(record.Routing.SenderID, record.Routing.SenderName),
		Receiver:      canonicalizeParty(fallbackTrimmed(record.Routing.ReceiverID, record.Routing.ConnectionID), record.Routing.ReceiverName),
		SpaceID:       strings.TrimSpace(record.Routing.SpaceID),
		SpaceName:     strings.TrimSpace(record.Routing.SpaceName),
		ContainerKind: normalizeCanonicalContainerKind(record.Routing.ContainerKind),
		ContainerID:   strings.TrimSpace(record.Routing.ContainerID),
		ContainerName: strings.TrimSpace(record.Routing.ContainerName),
		ThreadID:      strings.TrimSpace(record.Routing.ThreadID),
		ThreadName:    strings.TrimSpace(record.Routing.ThreadName),
		ReplyToID:     strings.TrimSpace(record.Routing.ReplyToID),
		Metadata:      routingMetadata,
	}

	recipients := make([]edgeCanonicalParty, 0, len(record.Payload.Recipients))
	for _, recipientID := range record.Payload.Recipients {
		trimmed := strings.TrimSpace(recipientID)
		if trimmed == "" {
			continue
		}
		recipients = append(recipients, edgeCanonicalParty{ID: trimmed})
	}

	payload := edgeCanonicalPayload{
		ID:          externalRecordID,
		Content:     record.Payload.Content,
		ContentType: normalizeCanonicalContentType(record.Payload.ContentType),
		Attachments: cloneAttachments(record.Payload.Attachments),
		Recipients:  recipients,
		Timestamp:   record.Payload.Timestamp,
		Metadata:    payloadMetadata,
	}

	if routing.ReplyToID == "" {
		if replyToID := strings.TrimSpace(readStringMetadata(payload.Metadata, "reply_to_id")); replyToID != "" {
			routing.ReplyToID = replyToID
		}
	}

	return edgeCanonicalRecord{
		Operation: "record.ingest",
		Routing:   routing,
		Payload:   payload,
	}
}

func (t *edgeSessionTransport) uploadAttachment(
	ctx context.Context,
	recordID string,
	attachment nexadapter.Attachment,
) (nexadapter.Attachment, error) {
	cacheKey := attachmentCacheKey(attachment)
	if cached, ok := t.attachmentByKey[cacheKey]; ok {
		return cloneAttachment(cached), nil
	}

	localPath := strings.TrimSpace(attachment.LocalPath)
	if localPath == "" {
		return attachment, nil
	}
	resolvedPath, err := expandUserPath(localPath)
	if err != nil {
		return nexadapter.Attachment{}, fmt.Errorf("resolve attachment path %q: %w", localPath, err)
	}

	data, err := os.ReadFile(resolvedPath)
	if err != nil {
		if os.IsNotExist(err) {
			prepared := cloneAttachment(attachment)
			prepared.LocalPath = ""
			if prepared.Metadata == nil {
				prepared.Metadata = map[string]any{}
			}
			prepared.Metadata["local_path_missing"] = true
			prepared.Metadata["original_local_path"] = localPath
			t.attachmentByKey[cacheKey] = cloneAttachment(prepared)
			nexadapter.LogInfo("edge attachment missing on disk, keeping metadata only: %s", localPath)
			return cloneAttachment(prepared), nil
		}
		return nexadapter.Attachment{}, fmt.Errorf("read attachment %q: %w", localPath, err)
	}

	prepared := cloneAttachment(attachment)
	prepared.LocalPath = ""
	if prepared.ContentHash == "" {
		sum := sha256.Sum256(data)
		prepared.ContentHash = fmt.Sprintf("%x", sum[:])
	}

	request := edgeAttachmentUploadRequest{
		SessionID:  t.sessionID,
		RecordID:   recordID,
		Attachment: prepared,
	}
	var body json.RawMessage
	if len(data) <= maxEdgeAttachmentChunkBytes {
		request.BlobBase64 = base64.StdEncoding.EncodeToString(data)
		body, err = t.call(ctx, "adapters.edges.attachments.put", requestPayload(request))
		if err != nil {
			return nexadapter.Attachment{}, fmt.Errorf("edge attachment upload failed: %w", err)
		}
	} else {
		uploadID := edgeAttachmentUploadID(recordID, prepared)
		chunkTotal := (len(data) + maxEdgeAttachmentChunkBytes - 1) / maxEdgeAttachmentChunkBytes
		for chunkIndex := 0; chunkIndex < chunkTotal; chunkIndex++ {
			start := chunkIndex * maxEdgeAttachmentChunkBytes
			end := start + maxEdgeAttachmentChunkBytes
			if end > len(data) {
				end = len(data)
			}
			currentChunkIndex := chunkIndex
			currentChunkTotal := chunkTotal
			request.UploadID = uploadID
			request.ChunkIndex = &currentChunkIndex
			request.ChunkTotal = &currentChunkTotal
			request.BlobBase64 = base64.StdEncoding.EncodeToString(data[start:end])
			body, err = t.call(ctx, "adapters.edges.attachments.put", requestPayload(request))
			if err != nil {
				return nexadapter.Attachment{}, fmt.Errorf("edge attachment upload failed: %w", err)
			}
		}
	}

	var response edgeAttachmentUploadResponse
	if len(body) > 0 {
		if err := json.Unmarshal(body, &response); err != nil {
			return nexadapter.Attachment{}, fmt.Errorf("decode edge attachment upload response: %w", err)
		}
	}
	if strings.TrimSpace(response.Attachment.ID) == "" {
		response.Attachment = prepared
	}
	t.attachmentByKey[cacheKey] = cloneAttachment(response.Attachment)
	return cloneAttachment(response.Attachment), nil
}

func attachmentCacheKey(attachment nexadapter.Attachment) string {
	if hash := strings.TrimSpace(attachment.ContentHash); hash != "" {
		return "hash:" + hash
	}
	if localPath := strings.TrimSpace(attachment.LocalPath); localPath != "" {
		return "path:" + localPath
	}
	return "id:" + strings.TrimSpace(attachment.ID)
}

func edgeAttachmentUploadID(recordID string, attachment nexadapter.Attachment) string {
	sum := sha256.Sum256([]byte(strings.Join([]string{
		strings.TrimSpace(recordID),
		strings.TrimSpace(attachment.ID),
		strings.TrimSpace(attachment.Filename),
		strings.TrimSpace(attachment.ContentHash),
		fmt.Sprintf("%d", attachment.Size),
	}, "|")))
	return fmt.Sprintf("edge-upload-%x", sum[:8])
}

func expandUserPath(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", nil
	}
	if trimmed == "~" || strings.HasPrefix(trimmed, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		if trimmed == "~" {
			return home, nil
		}
		return filepath.Join(home, strings.TrimPrefix(trimmed, "~/")), nil
	}
	return trimmed, nil
}

func requestPayload(value any) map[string]any {
	body, err := json.Marshal(value)
	if err != nil {
		return map[string]any{}
	}
	var out map[string]any
	if err := json.Unmarshal(body, &out); err != nil {
		return map[string]any{}
	}
	return out
}

func cloneInboundRecord(record nexadapter.AdapterInboundRecord) nexadapter.AdapterInboundRecord {
	cloned := record
	cloned.Routing.Metadata = cloneAnyMap(record.Routing.Metadata)
	cloned.Payload.Metadata = cloneAnyMap(record.Payload.Metadata)
	if len(record.Payload.Attachments) > 0 {
		cloned.Payload.Attachments = make([]nexadapter.Attachment, len(record.Payload.Attachments))
		for i, attachment := range record.Payload.Attachments {
			cloned.Payload.Attachments[i] = cloneAttachment(attachment)
		}
	}
	if len(record.Payload.Recipients) > 0 {
		cloned.Payload.Recipients = append([]string{}, record.Payload.Recipients...)
	}
	return cloned
}

func cloneAttachment(attachment nexadapter.Attachment) nexadapter.Attachment {
	cloned := attachment
	cloned.Metadata = cloneAnyMap(attachment.Metadata)
	return cloned
}

func cloneAttachments(attachments []nexadapter.Attachment) []nexadapter.Attachment {
	if len(attachments) == 0 {
		return nil
	}
	out := make([]nexadapter.Attachment, len(attachments))
	for i, attachment := range attachments {
		out[i] = cloneAttachment(attachment)
	}
	return out
}

func cloneAnyMap(value map[string]any) map[string]any {
	if len(value) == 0 {
		return nil
	}
	out := make(map[string]any, len(value))
	for key, raw := range value {
		out[key] = raw
	}
	return out
}

func canonicalizeParty(id string, name string) edgeCanonicalParty {
	party := edgeCanonicalParty{
		ID: strings.TrimSpace(id),
	}
	if trimmedName := strings.TrimSpace(name); trimmedName != "" {
		party.Name = trimmedName
	}
	return party
}

func fallbackTrimmed(primary string, fallback string) string {
	if trimmed := strings.TrimSpace(primary); trimmed != "" {
		return trimmed
	}
	return strings.TrimSpace(fallback)
}

func normalizeCanonicalContainerKind(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "dm":
		return "direct"
	case "direct", "group":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return strings.TrimSpace(value)
	}
}

func normalizeCanonicalContentType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "reaction":
		return "reaction"
	case "membership":
		return "membership"
	default:
		return "text"
	}
}

func readStringMetadata(metadata map[string]any, key string) string {
	if len(metadata) == 0 {
		return ""
	}
	raw, ok := metadata[key]
	if !ok {
		return ""
	}
	value, ok := raw.(string)
	if !ok {
		return ""
	}
	return value
}
