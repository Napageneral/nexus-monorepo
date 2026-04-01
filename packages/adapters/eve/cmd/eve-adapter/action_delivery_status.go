package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/nexus-project/adapter-eve/internal/etl"
)

const (
	sendDeliveryStageDispatched        = "dispatched"
	sendDeliveryStageLocalRowSeen      = "local_row_seen"
	sendDeliveryStageMessagesSent      = "messages_sent"
	sendDeliveryStageMessagesDelivered = "messages_delivered"
	sendDeliveryStageMessagesFailed    = "messages_failed"

	defaultSendObservationTimeout      = 4 * time.Second
	defaultSendObservationPollInterval = 200 * time.Millisecond
)

type imessageDeliveryObservation struct {
	Stage                   string `json:"stage"`
	RecordID                string `json:"record_id,omitempty"`
	ThreadID                string `json:"thread_id,omitempty"`
	MessageGUID             string `json:"message_guid,omitempty"`
	LocalRowSeen            bool   `json:"local_row_seen"`
	TextRowSeen             bool   `json:"text_row_seen"`
	MediaRowSeen            bool   `json:"media_row_seen"`
	TextRecordID            string `json:"text_record_id,omitempty"`
	TextMessageGUID         string `json:"text_message_guid,omitempty"`
	MediaRecordID           string `json:"media_record_id,omitempty"`
	MediaMessageGUID        string `json:"media_message_guid,omitempty"`
	MessagesIsSent          *bool  `json:"messages_is_sent,omitempty"`
	MessagesIsDelivered     *bool  `json:"messages_is_delivered,omitempty"`
	MessagesIsFinished      *bool  `json:"messages_is_finished,omitempty"`
	MessagesErrorCode       *int64 `json:"messages_error_code,omitempty"`
	AttachmentTransferState *int64 `json:"attachment_transfer_state,omitempty"`
	AttachmentFilename      string `json:"attachment_filename,omitempty"`
	expectsMedia            bool
}

func metadataStringValue(metadata map[string]any, key string) string {
	if len(metadata) == 0 {
		return ""
	}
	return stringFromAny(metadata[key])
}

func buildDispatchedDeliveryObservation(attempt ActionAttemptRecord) *imessageDeliveryObservation {
	metadata := attempt.Metadata
	hasMedia := recordPayloadBool(metadata, "has_media")

	textRecordID := metadataStringValue(metadata, "observed_text_record_id")
	textMessageGUID := metadataStringValue(metadata, "observed_text_message_guid")
	mediaRecordID := metadataStringValue(metadata, "observed_media_record_id")
	mediaMessageGUID := metadataStringValue(metadata, "observed_media_message_guid")
	threadID := metadataStringValue(metadata, "observed_media_thread_id")
	if threadID == "" {
		threadID = metadataStringValue(metadata, "observed_text_thread_id")
	}
	if threadID == "" {
		threadID = strings.TrimSpace(attempt.TargetThreadID)
	}

	textRowSeen := textRecordID != "" || textMessageGUID != ""
	mediaRowSeen := mediaRecordID != "" || mediaMessageGUID != ""

	recordID := strings.TrimSpace(attempt.TargetRecordID)
	messageGUID := strings.TrimSpace(attempt.TargetMessageGUID)
	switch {
	case hasMedia && mediaRowSeen:
		recordID = mediaRecordID
		messageGUID = mediaMessageGUID
	case !hasMedia && textRowSeen:
		recordID = textRecordID
		messageGUID = textMessageGUID
	}

	localRowSeen := textRowSeen || mediaRowSeen || recordID != "" || messageGUID != ""
	stage := sendDeliveryStageDispatched
	if localRowSeen {
		stage = sendDeliveryStageLocalRowSeen
	}

	return &imessageDeliveryObservation{
		Stage:            stage,
		RecordID:         recordID,
		ThreadID:         threadID,
		MessageGUID:      messageGUID,
		LocalRowSeen:     localRowSeen,
		TextRowSeen:      textRowSeen,
		MediaRowSeen:     mediaRowSeen,
		TextRecordID:     textRecordID,
		TextMessageGUID:  textMessageGUID,
		MediaRecordID:    mediaRecordID,
		MediaMessageGUID: mediaMessageGUID,
		expectsMedia:     hasMedia,
	}
}

func boolPointer(value bool) *bool {
	v := value
	return &v
}

func int64Pointer(value int64) *int64 {
	v := value
	return &v
}

func recordIDFromGUID(guid string) string {
	trimmed := strings.TrimSpace(guid)
	if trimmed == "" {
		return ""
	}
	return "imessage:" + trimmed
}

func deriveSendDeliveryStage(observation *imessageDeliveryObservation) string {
	if observation == nil {
		return sendDeliveryStageDispatched
	}
	if !observation.LocalRowSeen {
		return sendDeliveryStageDispatched
	}
	if observation.expectsMedia && !observation.MediaRowSeen {
		return sendDeliveryStageLocalRowSeen
	}
	if observation.MessagesErrorCode != nil && *observation.MessagesErrorCode != 0 {
		return sendDeliveryStageMessagesFailed
	}
	if observation.AttachmentTransferState != nil && *observation.AttachmentTransferState == 6 {
		return sendDeliveryStageMessagesFailed
	}
	if observation.MessagesIsDelivered != nil && *observation.MessagesIsDelivered {
		return sendDeliveryStageMessagesDelivered
	}
	if observation.MessagesIsSent != nil && *observation.MessagesIsSent {
		return sendDeliveryStageMessagesSent
	}
	return sendDeliveryStageLocalRowSeen
}

func buildDeliveryObservationFromAttempt(attempt ActionAttemptRecord) (*imessageDeliveryObservation, error) {
	observation := buildDispatchedDeliveryObservation(attempt)

	chatDB, err := openChatDB()
	if err != nil {
		return observation, err
	}
	defer chatDB.Close()

	state, leg, err := observedDeliveryStateForAttempt(chatDB, attempt)
	if err != nil {
		return observation, err
	}
	if state != nil {
		applyObservedDeliveryState(observation, state, leg, recordPayloadBool(attempt.Metadata, "has_media"))
	}
	observation.Stage = deriveSendDeliveryStage(observation)
	return observation, nil
}

func observedDeliveryStateForAttempt(chatDB *etl.ChatDB, attempt ActionAttemptRecord) (*etl.MessageDeliveryState, string, error) {
	observation := buildDispatchedDeliveryObservation(attempt)
	messageGUID := strings.TrimSpace(observation.MessageGUID)
	if messageGUID != "" {
		state, err := chatDB.GetMessageDeliveryStateByGUID(messageGUID)
		if err != nil || state == nil {
			return state, "", err
		}
		switch {
		case observation.MediaMessageGUID != "" && observation.MediaMessageGUID == messageGUID:
			return state, "media", nil
		case observation.TextMessageGUID != "" && observation.TextMessageGUID == messageGUID:
			return state, "text", nil
		case observation.expectsMedia:
			return state, "media", nil
		default:
			return state, "text", nil
		}
	}

	var request imessageSendRequest
	if len(attempt.RequestJSON) == 0 {
		return nil, "", nil
	}
	if err := json.Unmarshal(attempt.RequestJSON, &request); err != nil {
		return nil, "", fmt.Errorf("decode send request for delivery observation: %w", err)
	}

	selectors := deliverySelectorsForRequest(request)
	baselineRowID := metadataInt64Value(attempt.Metadata, "rowid_baseline")
	states, err := chatDB.GetRecentOutboundDeliveryStates(selectors, baselineRowID)
	if err != nil {
		return nil, "", err
	}
	if len(states) == 0 {
		return nil, "", nil
	}

	hasMedia := strings.TrimSpace(request.Media) != ""
	textState := matchObservedTextState(expectedSendChunks(request), states)
	mediaState := matchObservedMediaState(states)
	if hasMedia {
		if mediaState != nil {
			return mediaState, "media", nil
		}
		if textState != nil {
			return textState, "text", nil
		}
		return nil, "", nil
	}
	if textState != nil {
		return textState, "text", nil
	}
	if mediaState != nil {
		return mediaState, "media", nil
	}
	return nil, "", nil
}

func applyObservedDeliveryState(
	observation *imessageDeliveryObservation,
	state *etl.MessageDeliveryState,
	leg string,
	hasMedia bool,
) {
	if observation == nil || state == nil {
		return
	}
	recordID := recordIDFromGUID(state.GUID)
	if strings.TrimSpace(recordID) != "" && (!hasMedia || strings.TrimSpace(leg) == "media") {
		observation.RecordID = recordID
	}
	if strings.TrimSpace(state.GUID) != "" && (!hasMedia || strings.TrimSpace(leg) == "media") {
		observation.MessageGUID = strings.TrimSpace(state.GUID)
	}
	observation.LocalRowSeen = true
	if !hasMedia || strings.TrimSpace(leg) == "media" {
		observation.MessagesIsSent = boolPointer(state.IsSent)
		observation.MessagesIsDelivered = boolPointer(state.IsDelivered)
		observation.MessagesIsFinished = boolPointer(state.IsFinished)
		observation.MessagesErrorCode = int64Pointer(state.ErrorCode)
		if state.AttachmentTransferState.Valid {
			observation.AttachmentTransferState = int64Pointer(state.AttachmentTransferState.Int64)
		}
		if state.AttachmentFilename.Valid {
			observation.AttachmentFilename = strings.TrimSpace(state.AttachmentFilename.String)
		}
	}
	switch strings.TrimSpace(leg) {
	case "media":
		observation.MediaRowSeen = true
		observation.MediaRecordID = recordID
		observation.MediaMessageGUID = strings.TrimSpace(state.GUID)
	case "text":
		observation.TextRowSeen = true
		observation.TextRecordID = recordID
		observation.TextMessageGUID = strings.TrimSpace(state.GUID)
	}
}

func deliverySelectorsForRequest(req imessageSendRequest) []string {
	values := []string{
		strings.TrimSpace(req.Target.Channel.ContainerID),
		strings.TrimSpace(recipientFromThreadID(req.Target.Channel.ThreadID)),
	}
	seen := map[string]struct{}{}
	out := []string{}
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func querySendChatMaxRowID(target appleScriptSendTarget, req imessageSendRequest) (int64, error) {
	chatDB, err := openChatDB()
	if err != nil {
		return 0, err
	}
	defer chatDB.Close()

	selectors := deliverySelectorsForRequest(req)
	if trimmed := strings.TrimSpace(target.Recipient); trimmed != "" {
		selectors = append(selectors, trimmed)
	}
	if trimmed := strings.TrimSpace(target.ChatTarget); trimmed != "" {
		selectors = append(selectors, trimmed)
	}
	return chatDB.GetMaxMessageRowIDForChatSelectors(selectors)
}

func metadataInt64Value(metadata map[string]any, key string) int64 {
	if len(metadata) == 0 {
		return 0
	}
	value, ok := metadata[key]
	if !ok {
		return 0
	}
	switch typed := value.(type) {
	case int64:
		return typed
	case int:
		return int64(typed)
	case float64:
		return int64(typed)
	default:
		return 0
	}
}

func matchObservedTextState(chunks []string, states []etl.MessageDeliveryState) *etl.MessageDeliveryState {
	if len(chunks) == 0 {
		return nil
	}
	expected := map[string]struct{}{}
	for _, chunk := range chunks {
		trimmed := strings.TrimSpace(chunk)
		if trimmed == "" {
			continue
		}
		expected[trimmed] = struct{}{}
	}
	for index := len(states) - 1; index >= 0; index-- {
		state := states[index]
		if _, ok := expected[strings.TrimSpace(state.Text)]; !ok {
			continue
		}
		return &states[index]
	}
	return nil
}

func matchObservedMediaState(states []etl.MessageDeliveryState) *etl.MessageDeliveryState {
	for index := len(states) - 1; index >= 0; index-- {
		state := states[index]
		if !state.AttachmentTransferState.Valid && !state.AttachmentFilename.Valid {
			continue
		}
		return &states[index]
	}
	return nil
}

func deliveryObservationMetadata(observation *imessageDeliveryObservation) map[string]any {
	if observation == nil {
		return nil
	}
	metadata := map[string]any{
		"delivery_stage":          observation.Stage,
		"delivery_local_row_seen": observation.LocalRowSeen,
		"delivery_text_row_seen":  observation.TextRowSeen,
		"delivery_media_row_seen": observation.MediaRowSeen,
	}
	if trimmed := strings.TrimSpace(observation.RecordID); trimmed != "" {
		metadata["observed_record_id"] = trimmed
	}
	if trimmed := strings.TrimSpace(observation.ThreadID); trimmed != "" {
		metadata["observed_thread_id"] = trimmed
	}
	if trimmed := strings.TrimSpace(observation.MessageGUID); trimmed != "" {
		metadata["observed_message_guid"] = trimmed
	}
	if trimmed := strings.TrimSpace(observation.TextRecordID); trimmed != "" {
		metadata["observed_text_record_id"] = trimmed
	}
	if trimmed := strings.TrimSpace(observation.TextMessageGUID); trimmed != "" {
		metadata["observed_text_message_guid"] = trimmed
	}
	if trimmed := strings.TrimSpace(observation.MediaRecordID); trimmed != "" {
		metadata["observed_media_record_id"] = trimmed
	}
	if trimmed := strings.TrimSpace(observation.MediaMessageGUID); trimmed != "" {
		metadata["observed_media_message_guid"] = trimmed
	}
	if observation.MessagesIsSent != nil {
		metadata["delivery_messages_is_sent"] = *observation.MessagesIsSent
	}
	if observation.MessagesIsDelivered != nil {
		metadata["delivery_messages_is_delivered"] = *observation.MessagesIsDelivered
	}
	if observation.MessagesIsFinished != nil {
		metadata["delivery_messages_is_finished"] = *observation.MessagesIsFinished
	}
	if observation.MessagesErrorCode != nil {
		metadata["delivery_messages_error_code"] = *observation.MessagesErrorCode
	}
	if observation.AttachmentTransferState != nil {
		metadata["delivery_attachment_transfer_state"] = *observation.AttachmentTransferState
	}
	if trimmed := strings.TrimSpace(observation.AttachmentFilename); trimmed != "" {
		metadata["delivery_attachment_filename"] = trimmed
	}
	return metadata
}

func deliveryFailureMessage(observation *imessageDeliveryObservation) string {
	if observation == nil {
		return "Messages marked the outbound send as failed"
	}
	parts := []string{"Messages marked the outbound send as failed"}
	if observation.MessagesErrorCode != nil {
		parts = append(parts, fmt.Sprintf("error=%d", *observation.MessagesErrorCode))
	}
	if observation.AttachmentTransferState != nil {
		parts = append(parts, fmt.Sprintf("transfer_state=%d", *observation.AttachmentTransferState))
	}
	return strings.Join(parts, " ")
}

func refreshSendActionAttemptStatus(db *sql.DB, attempt ActionAttemptRecord) (ActionAttemptRecord, *imessageDeliveryObservation, error) {
	if attempt.Action != imessageSendMethodID {
		return attempt, nil, nil
	}

	observation, err := buildDeliveryObservationFromAttempt(attempt)
	if err != nil {
		return attempt, nil, err
	}
	if observation == nil {
		return attempt, nil, nil
	}

	stage := deriveSendDeliveryStage(observation)
	now := time.Now()
	metadata := mergeActionAttemptMetadata(attempt.Metadata, deliveryObservationMetadata(observation))
	update := ActionAttemptUpdateInput{
		Metadata:  metadata,
		UpdatedAt: &now,
		Response: map[string]any{
			"attempt_id": attempt.AttemptID,
			"status":     string(attempt.Status),
			"delivery":   observation,
			"confirmed":  attempt.Status == ActionAttemptStatusConfirmed,
		},
	}

	if trimmed := strings.TrimSpace(observation.RecordID); trimmed != "" && trimmed != attempt.TargetRecordID {
		update.TargetRecordID = &trimmed
	}
	if trimmed := strings.TrimSpace(observation.ThreadID); trimmed != "" && trimmed != attempt.TargetThreadID {
		update.TargetThreadID = &trimmed
	}
	if trimmed := strings.TrimSpace(observation.MessageGUID); trimmed != "" && trimmed != attempt.TargetMessageGUID {
		update.TargetMessageGUID = &trimmed
	}

	switch stage {
	case sendDeliveryStageMessagesDelivered, sendDeliveryStageMessagesSent:
		status := ActionAttemptStatusConfirmed
		update.Status = &status
		if attempt.ConfirmedAtMs == nil {
			update.ConfirmedAt = &now
		}
		update.Response = map[string]any{
			"attempt_id": attempt.AttemptID,
			"status":     string(status),
			"delivery":   observation,
			"confirmed":  true,
		}
		if trimmed := strings.TrimSpace(observation.RecordID); trimmed != "" {
			metadata["confirmed_record_id"] = trimmed
		}
		metadata["confirmed_at_ms"] = now.UnixMilli()
		update.Metadata = metadata
	case sendDeliveryStageMessagesFailed:
		status := ActionAttemptStatusFailed
		update.Status = &status
		if attempt.FailedAtMs == nil {
			update.FailedAt = &now
		}
		message := deliveryFailureMessage(observation)
		update.ErrorMessage = &message
		update.Response = map[string]any{
			"attempt_id": attempt.AttemptID,
			"status":     string(status),
			"delivery":   observation,
			"confirmed":  false,
		}
	}

	updated, err := UpdateActionAttemptByAttemptID(db, attempt.AttemptID, update)
	if err != nil {
		return attempt, nil, err
	}
	return updated, observation, nil
}

func waitForSendActionAttemptStatus(
	ctx context.Context,
	db *sql.DB,
	attemptID string,
	timeout time.Duration,
) (ActionAttemptRecord, *imessageDeliveryObservation, error) {
	attempt, err := GetActionAttemptByAttemptID(db, attemptID)
	if err != nil {
		return ActionAttemptRecord{}, nil, err
	}

	var observation *imessageDeliveryObservation
	deadline := time.Now().Add(timeout)
	for {
		attempt, observation, err = refreshSendActionAttemptStatus(db, attempt)
		if err != nil {
			return ActionAttemptRecord{}, nil, err
		}
		if attempt.Status == ActionAttemptStatusConfirmed || attempt.Status == ActionAttemptStatusFailed {
			return attempt, observation, nil
		}
		if time.Now().After(deadline) {
			return attempt, observation, nil
		}
		select {
		case <-ctx.Done():
			return attempt, observation, ctx.Err()
		case <-time.After(defaultSendObservationPollInterval):
		}
		attempt, err = GetActionAttemptByAttemptID(db, attempt.AttemptID)
		if err != nil {
			return ActionAttemptRecord{}, nil, err
		}
	}
}
