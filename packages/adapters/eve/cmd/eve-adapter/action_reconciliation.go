package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	actionAttemptReconcileLimit = 200
	actionAttemptMatchLookahead = 10 * time.Minute
	actionAttemptMatchLookback  = 5 * time.Second
)

func expectedSendChunks(req imessageSendRequest) []string {
	body := strings.TrimSpace(req.Text)
	if body == "" {
		body = strings.TrimSpace(req.Caption)
	}
	chunks := nexadapter.ChunkText(body, 4000)
	if len(chunks) == 0 {
		return []string{body}
	}
	return chunks
}

func attemptMetadataForSend(req imessageSendRequest, chunks []string, baselineRowID int64) map[string]any {
	metadata := map[string]any{
		"executor":            currentActionCapabilities().Executor,
		"target_container_id": strings.TrimSpace(req.Target.Channel.ContainerID),
		"target_thread_id":    strings.TrimSpace(req.Target.Channel.ThreadID),
		"has_media":           strings.TrimSpace(req.Media) != "",
		"expected_chunks":     chunks,
	}
	if baselineRowID > 0 {
		metadata["rowid_baseline"] = baselineRowID
	}
	return metadata
}

func mergeActionAttemptMetadata(base map[string]any, extra map[string]any) map[string]any {
	if len(base) == 0 && len(extra) == 0 {
		return nil
	}
	merged := make(map[string]any, len(base)+len(extra))
	for key, value := range base {
		merged[key] = value
	}
	for key, value := range extra {
		merged[key] = value
	}
	return merged
}

func createSendActionAttempt(db *sql.DB, req imessageSendRequest, chunks []string, baselineRowID int64) (ActionAttemptRecord, error) {
	return CreateActionAttempt(db, ActionAttemptCreateInput{
		ConnectionID:      strings.TrimSpace(req.Target.ConnectionID),
		Action:            imessageSendMethodID,
		Request:           req,
		TargetThreadID:    strings.TrimSpace(req.Target.Channel.ThreadID),
		TargetMessageGUID: strings.TrimSpace(req.Target.ReplyToID),
		Metadata:          attemptMetadataForSend(req, chunks, baselineRowID),
	})
}

func markActionAttemptDispatched(
	db *sql.DB,
	attempt ActionAttemptRecord,
	response map[string]any,
) (ActionAttemptRecord, error) {
	status := ActionAttemptStatusDispatched
	now := time.Now()
	return UpdateActionAttemptByAttemptID(db, attempt.AttemptID, ActionAttemptUpdateInput{
		Status:       &status,
		Response:     response,
		DispatchedAt: &now,
		UpdatedAt:    &now,
	})
}

func markActionAttemptFailed(
	db *sql.DB,
	attempt ActionAttemptRecord,
	errorMessage string,
	response map[string]any,
) (ActionAttemptRecord, error) {
	status := ActionAttemptStatusFailed
	now := time.Now()
	message := errorMessage
	return UpdateActionAttemptByAttemptID(db, attempt.AttemptID, ActionAttemptUpdateInput{
		Status:       &status,
		Response:     response,
		ErrorMessage: &message,
		FailedAt:     &now,
		UpdatedAt:    &now,
	})
}

func listReconcilableActionAttempts(db *sql.DB, connectionID string, limit int) ([]ActionAttemptRecord, error) {
	pending, err := ListActionAttempts(db, ActionAttemptQueryFilter{
		ConnectionID: connectionID,
		Status:       ActionAttemptStatusPending,
		Limit:        limit,
	})
	if err != nil {
		return nil, err
	}
	dispatched, err := ListActionAttempts(db, ActionAttemptQueryFilter{
		ConnectionID: connectionID,
		Status:       ActionAttemptStatusDispatched,
		Limit:        limit,
	})
	if err != nil {
		return nil, err
	}
	attempts := append(pending, dispatched...)
	slices.SortFunc(attempts, func(a, b ActionAttemptRecord) int {
		if a.CreatedAtMs == b.CreatedAtMs {
			if a.ID == b.ID {
				return 0
			}
			if a.ID < b.ID {
				return -1
			}
			return 1
		}
		if a.CreatedAtMs < b.CreatedAtMs {
			return -1
		}
		return 1
	})
	return attempts, nil
}

func recordPayloadBool(metadata map[string]any, key string) bool {
	value, ok := metadata[key]
	if !ok {
		return false
	}
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		normalized := strings.ToLower(strings.TrimSpace(typed))
		return normalized == "true" || normalized == "yes" || normalized == "1"
	default:
		return false
	}
}

func matchSendAttempt(attempt ActionAttemptRecord, record nexadapter.AdapterInboundRecord) bool {
	if attempt.Action != imessageSendMethodID {
		return false
	}
	if strings.TrimSpace(record.Routing.ConnectionID) != strings.TrimSpace(attempt.ConnectionID) {
		return false
	}
	if !recordPayloadBool(record.Payload.Metadata, "is_from_me") {
		return false
	}
	recordTimestamp := time.UnixMilli(record.Payload.Timestamp)
	attemptCreated := time.UnixMilli(attempt.CreatedAtMs)
	if recordTimestamp.Before(attemptCreated.Add(-actionAttemptMatchLookback)) {
		return false
	}
	if recordTimestamp.After(attemptCreated.Add(actionAttemptMatchLookahead)) {
		return false
	}

	var request imessageSendRequest
	if len(attempt.RequestJSON) > 0 {
		if err := json.Unmarshal(attempt.RequestJSON, &request); err != nil {
			return false
		}
	}
	targetContainerID := strings.TrimSpace(request.Target.Channel.ContainerID)
	if targetContainerID != "" && strings.TrimSpace(record.Routing.ContainerID) != targetContainerID {
		return false
	}
	targetThreadID := strings.TrimSpace(request.Target.Channel.ThreadID)
	if targetThreadID != "" && strings.TrimSpace(record.Routing.ThreadID) != targetThreadID {
		return false
	}

	chunks := expectedSendChunks(request)
	for _, chunk := range chunks {
		if strings.TrimSpace(chunk) != "" && record.Payload.Content == chunk {
			return true
		}
	}
	if strings.TrimSpace(request.Media) != "" && len(record.Payload.Attachments) > 0 {
		return true
	}
	return false
}

func observeSendAttempt(
	db *sql.DB,
	attempt ActionAttemptRecord,
	record nexadapter.AdapterInboundRecord,
) (ActionAttemptRecord, *imessageDeliveryObservation, error) {
	now := time.Now()
	hasMedia := recordPayloadBool(attempt.Metadata, "has_media")
	isMediaRecord := len(record.Payload.Attachments) > 0
	targetRecordID := strings.TrimSpace(record.Payload.ExternalRecordID)
	targetThreadID := strings.TrimSpace(record.Routing.ThreadID)
	targetMessageGUID := strings.TrimSpace(strings.TrimPrefix(targetRecordID, "imessage:"))
	metadata := map[string]any{
		"observed_record_id":    targetRecordID,
		"observed_thread_id":    targetThreadID,
		"observed_message_guid": targetMessageGUID,
		"observed_at_ms":        now.UnixMilli(),
	}
	if isMediaRecord {
		metadata["observed_media_record_id"] = targetRecordID
		metadata["observed_media_thread_id"] = targetThreadID
		metadata["observed_media_message_guid"] = targetMessageGUID
		metadata["observed_media_at_ms"] = now.UnixMilli()
	} else {
		metadata["observed_text_record_id"] = targetRecordID
		metadata["observed_text_thread_id"] = targetThreadID
		metadata["observed_text_message_guid"] = targetMessageGUID
		metadata["observed_text_at_ms"] = now.UnixMilli()
	}
	update := ActionAttemptUpdateInput{
		Response: map[string]any{
			"record_id":      targetRecordID,
			"thread_id":      targetThreadID,
			"message_id":     targetMessageGUID,
			"observed_media": isMediaRecord,
		},
		Metadata:  mergeActionAttemptMetadata(attempt.Metadata, metadata),
		UpdatedAt: &now,
	}
	if isMediaRecord || !hasMedia {
		update.TargetRecordID = &targetRecordID
		update.TargetThreadID = &targetThreadID
		update.TargetMessageGUID = &targetMessageGUID
	}
	updated, err := UpdateActionAttemptByAttemptID(db, attempt.AttemptID, update)
	if err != nil {
		return ActionAttemptRecord{}, nil, err
	}
	return refreshSendActionAttemptStatus(db, updated)
}

func reconcileActionAttempts(
	db *sql.DB,
	records []nexadapter.AdapterInboundRecord,
) error {
	if len(records) == 0 {
		return nil
	}

	byConnection := make(map[string][]nexadapter.AdapterInboundRecord)
	for _, record := range records {
		connectionID := strings.TrimSpace(record.Routing.ConnectionID)
		if connectionID == "" {
			continue
		}
		byConnection[connectionID] = append(byConnection[connectionID], record)
	}

	for connectionID, connectionRecords := range byConnection {
		attempts, err := listReconcilableActionAttempts(db, connectionID, actionAttemptReconcileLimit)
		if err != nil {
			return fmt.Errorf("list reconcilable action attempts for %s: %w", connectionID, err)
		}
		if len(attempts) == 0 {
			continue
		}
		for _, record := range connectionRecords {
			for index, attempt := range attempts {
				if attempt.Status == ActionAttemptStatusConfirmed || attempt.Status == ActionAttemptStatusFailed {
					continue
				}
				if !matchSendAttempt(attempt, record) {
					continue
				}
				updated, _, err := observeSendAttempt(db, attempt, record)
				if err != nil {
					return fmt.Errorf("observe action attempt %s: %w", attempt.AttemptID, err)
				}
				attempts[index] = updated
				break
			}
		}
	}

	return nil
}
