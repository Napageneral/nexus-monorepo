package main

import (
	"context"
	"errors"
	"fmt"
	"strings"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

type actionExecutor interface {
	ID() string
	Capabilities() actionCapabilities
	Send(context.Context, imessageSendRequest) (*imessageMethodResult, error)
}

type actionCapabilities struct {
	Executor            string
	DeclaredMethods     []string
	SupportedMethods    []string
	ChannelCapabilities nexadapter.ChannelCapabilities
	DetailFields        map[string]any
}

type appleScriptSendOnlyExecutor struct{}

func currentActionExecutor() actionExecutor {
	return appleScriptSendOnlyExecutor{}
}

func currentActionCapabilities() actionCapabilities {
	return currentActionExecutor().Capabilities()
}

func (appleScriptSendOnlyExecutor) ID() string {
	return actionExecutorAppleScriptSendOnly
}

func (appleScriptSendOnlyExecutor) Capabilities() actionCapabilities {
	declaredMethods := []string{
		imessageSendMethodID,
		imessageReplyMethodID,
		imessageReactionAddMethodID,
		imessageReactionRemoveMethodID,
		imessageMessageEditMethodID,
		imessageMessageUnsendMethodID,
		imessageThreadCreateMethodID,
		imessageThreadRenameMethodID,
		imessageThreadParticipantsAddMethodID,
		imessageThreadParticipantsRemoveMethodID,
		recordsBackfillStageMethodID,
	}
	supportedMethods := []string{
		imessageSendMethodID,
		recordsBackfillStageMethodID,
	}

	return actionCapabilities{
		Executor:         actionExecutorAppleScriptSendOnly,
		DeclaredMethods:  declaredMethods,
		SupportedMethods: supportedMethods,
		ChannelCapabilities: nexadapter.ChannelCapabilities{
			TextLimit:          4000,
			SupportsMarkdown:   false,
			SupportsTables:     false,
			SupportsCodeBlocks: false,
			SupportsEmbeds:     false,
			SupportsThreads:    false,
			SupportsReactions:  false,
			SupportsPolls:      false,
			SupportsButtons:    false,
			SupportsEdit:       false,
			SupportsDelete:     false,
			// The AppleScript lane now stages media under the Messages attachments
			// root so supported images and videos can render with provider-native
			// inline behavior while generic file attachments remain supported.
			SupportsMedia:      true,
			SupportsVoiceNotes: true,
		},
		DetailFields: map[string]any{
			"supports_inline_media":               true,
			"supports_file_attachments":           true,
			"supports_reply":                      false,
			"supports_reaction_add":               false,
			"supports_reaction_remove":            false,
			"supports_edit_message":               false,
			"supports_unsend_message":             false,
			"supports_thread_create":              false,
			"supports_thread_rename":              false,
			"supports_thread_participants_add":    false,
			"supports_thread_participants_remove": false,
		},
	}
}

func (appleScriptSendOnlyExecutor) Send(ctx context.Context, req imessageSendRequest) (*imessageMethodResult, error) {
	target, err := resolveAppleScriptSendTarget(req.Target.Channel.ContainerID, req.Target.Channel.ThreadID)
	if err != nil {
		return &imessageMethodResult{
			Success: false,
			Error: &nexadapter.DeliveryError{
				Type:    "content_rejected",
				Message: err.Error(),
				Retry:   false,
			},
		}, nil
	}
	if strings.TrimSpace(req.Target.ReplyToID) != "" {
		return &imessageMethodResult{
			Success: false,
			Error: &nexadapter.DeliveryError{
				Type:    "content_rejected",
				Message: "reply_to_id is not supported by the imessage adapter",
				Retry:   false,
			},
		}, nil
	}

	body := strings.TrimSpace(req.Text)
	if body == "" {
		body = strings.TrimSpace(req.Caption)
	}

	caps := currentActionCapabilities()
	if body == "" && strings.TrimSpace(req.Media) == "" {
		return &imessageMethodResult{
			Success:    false,
			MessageIDs: []string{},
			ChunksSent: 0,
			TotalChars: 0,
			Status:     string(ActionAttemptStatusFailed),
			Executor:   caps.Executor,
			Error: &nexadapter.DeliveryError{
				Type:    "content_rejected",
				Message: "empty message",
				Retry:   false,
			},
		}, nil
	}

	warehouseDB, err := openWarehouse()
	if err != nil {
		return nil, fmt.Errorf("open warehouse for action attempt: %w", err)
	}
	defer warehouseDB.Close()

	chunks := expectedSendChunks(req)
	baselineRowID, err := querySendChatMaxRowID(target, req)
	if err != nil {
		baselineRowID = 0
	}
	attempt, err := createSendActionAttempt(warehouseDB, req, chunks, baselineRowID)
	if err != nil {
		return nil, fmt.Errorf("create send action attempt: %w", err)
	}

	chunksSent := 0
	totalChars := len(body)
	for index, chunk := range chunks {
		media := ""
		if index == 0 {
			media = req.Media
		}
		if err := sendAppleScript(ctx, target, chunk, media); err != nil {
			failure := map[string]any{
				"message_ids": []string{},
				"chunks_sent": chunksSent,
				"total_chars": totalChars,
				"attempt_id":  attempt.AttemptID,
				"executor":    caps.Executor,
			}
			if _, updateErr := markActionAttemptFailed(warehouseDB, attempt, err.Error(), failure); updateErr != nil {
				return nil, fmt.Errorf("send failed: %v (also failed to mark attempt: %w)", err, updateErr)
			}
			return &imessageMethodResult{
				Success:    false,
				MessageIDs: []string{},
				ChunksSent: chunksSent,
				TotalChars: totalChars,
				AttemptID:  attempt.AttemptID,
				Status:     string(ActionAttemptStatusFailed),
				Confirmed:  false,
				Executor:   caps.Executor,
				Error: &nexadapter.DeliveryError{
					Type:    "network",
					Message: err.Error(),
					Retry:   true,
				},
			}, nil
		}
		chunksSent++
	}

	success := map[string]any{
		"message_ids": []string{},
		"chunks_sent": chunksSent,
		"total_chars": totalChars,
		"attempt_id":  attempt.AttemptID,
		"executor":    caps.Executor,
		"confirmed":   false,
	}
	if _, err := markActionAttemptDispatched(warehouseDB, attempt, success); err != nil {
		return nil, fmt.Errorf("mark send action attempt dispatched: %w", err)
	}

	attempt, observation, err := waitForSendActionAttemptStatus(ctx, warehouseDB, attempt.AttemptID, defaultSendObservationTimeout)
	if err != nil && !errors.Is(err, context.Canceled) {
		return nil, fmt.Errorf("wait for send action attempt status: %w", err)
	}

	result := &imessageMethodResult{
		Success:    true,
		MessageIDs: []string{},
		ChunksSent: chunksSent,
		TotalChars: totalChars,
		AttemptID:  attempt.AttemptID,
		Status:     string(attempt.Status),
		Confirmed:  attempt.Status == ActionAttemptStatusConfirmed,
		Executor:   caps.Executor,
		Delivery:   observation,
	}
	if attempt.Status == ActionAttemptStatusFailed {
		result.Success = false
		result.Error = &nexadapter.DeliveryError{
			Type:    "delivery_failed",
			Message: strings.TrimSpace(attempt.ErrorMessage),
			Retry:   true,
		}
		if strings.TrimSpace(result.Error.Message) == "" {
			result.Error.Message = deliveryFailureMessage(observation)
		}
	}

	return result, nil
}

func actionCapabilityFields(caps actionCapabilities) map[string]any {
	out := map[string]any{
		"action_executor":   caps.Executor,
		"supported_methods": append([]string(nil), caps.SupportedMethods...),
		"declared_methods":  append([]string(nil), caps.DeclaredMethods...),
	}
	for key, value := range caps.DetailFields {
		out[key] = value
	}
	return out
}

func mergeActionCapabilityFields(base map[string]any, caps actionCapabilities) map[string]any {
	out := map[string]any{}
	for key, value := range base {
		out[key] = value
	}
	for key, value := range actionCapabilityFields(caps) {
		out[key] = value
	}
	return out
}
