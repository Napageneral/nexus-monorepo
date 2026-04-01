package main

import (
	"context"
	"fmt"
	"slices"
	"strings"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	imessageSendMethodID                     = "imessage.send"
	imessageReplyMethodID                    = "imessage.reply"
	imessageReactionAddMethodID              = "imessage.reaction.add"
	imessageReactionRemoveMethodID           = "imessage.reaction.remove"
	imessageMessageEditMethodID              = "imessage.message.edit"
	imessageMessageUnsendMethodID            = "imessage.message.unsend"
	imessageThreadCreateMethodID             = "imessage.thread.create"
	imessageThreadRenameMethodID             = "imessage.thread.rename"
	imessageThreadParticipantsAddMethodID    = "imessage.thread.participants.add"
	imessageThreadParticipantsRemoveMethodID = "imessage.thread.participants.remove"
	recordsBackfillStageMethodID             = "records.backfill.stage"
	actionExecutorAppleScriptSendOnly        = "applescript_send_only"
)

type edgeMethodSendFunc func(context.Context, imessageSendRequest) (*imessageMethodResult, error)
type edgeMethodStageBackfillFunc func(context.Context, string, map[string]any) (any, error)

func adapterChannelCapabilities() nexadapter.ChannelCapabilities {
	return currentActionCapabilities().ChannelCapabilities
}

func actionMethodResponseSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"success":     map[string]any{"type": "boolean"},
			"message_ids": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			"chunks_sent": map[string]any{"type": "integer"},
			"total_chars": map[string]any{"type": "integer"},
			"attempt_id":  map[string]any{"type": "string"},
			"status":      map[string]any{"type": "string"},
			"confirmed":   map[string]any{"type": "boolean"},
			"executor":    map[string]any{"type": "string"},
			"delivery": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"stage":                     map[string]any{"type": "string"},
					"record_id":                 map[string]any{"type": "string"},
					"thread_id":                 map[string]any{"type": "string"},
					"message_guid":              map[string]any{"type": "string"},
					"local_row_seen":            map[string]any{"type": "boolean"},
					"text_row_seen":             map[string]any{"type": "boolean"},
					"media_row_seen":            map[string]any{"type": "boolean"},
					"text_record_id":            map[string]any{"type": "string"},
					"text_message_guid":         map[string]any{"type": "string"},
					"media_record_id":           map[string]any{"type": "string"},
					"media_message_guid":        map[string]any{"type": "string"},
					"messages_is_sent":          map[string]any{"type": "boolean"},
					"messages_is_delivered":     map[string]any{"type": "boolean"},
					"messages_is_finished":      map[string]any{"type": "boolean"},
					"messages_error_code":       map[string]any{"type": "integer"},
					"attachment_transfer_state": map[string]any{"type": "integer"},
					"attachment_filename":       map[string]any{"type": "string"},
				},
			},
			"error": map[string]any{"type": "object"},
		},
	}
}

func sendMethodParamsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"target":  map[string]any{"type": "object"},
			"text":    map[string]any{"type": "string"},
			"media":   map[string]any{"type": "string"},
			"caption": map[string]any{"type": "string"},
		},
		"required": []string{"target"},
	}
}

func replyMethodParamsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"target":      map[string]any{"type": "object"},
			"reply_to_id": map[string]any{"type": "string"},
			"text":        map[string]any{"type": "string"},
			"media":       map[string]any{"type": "string"},
			"caption":     map[string]any{"type": "string"},
		},
		"required": []string{"target", "reply_to_id"},
	}
}

func reactionMethodParamsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"target":     map[string]any{"type": "object"},
			"message_id": map[string]any{"type": "string"},
			"reaction":   map[string]any{"type": "string"},
		},
		"required": []string{"target", "message_id", "reaction"},
	}
}

func editMethodParamsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"target":     map[string]any{"type": "object"},
			"message_id": map[string]any{"type": "string"},
			"text":       map[string]any{"type": "string"},
		},
		"required": []string{"target", "message_id", "text"},
	}
}

func unsendMethodParamsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"target":     map[string]any{"type": "object"},
			"message_id": map[string]any{"type": "string"},
		},
		"required": []string{"target", "message_id"},
	}
}

func threadCreateParamsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"participants": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			"text":         map[string]any{"type": "string"},
			"media":        map[string]any{"type": "string"},
			"caption":      map[string]any{"type": "string"},
			"thread_name":  map[string]any{"type": "string"},
		},
		"required": []string{"participants"},
	}
}

func threadRenameParamsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"target": map[string]any{"type": "object"},
			"name":   map[string]any{"type": "string"},
		},
		"required": []string{"target", "name"},
	}
}

func threadParticipantsParamsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"target":       map[string]any{"type": "object"},
			"participants": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
		},
		"required": []string{"target", "participants"},
	}
}

func stageBackfillResponseSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"version":       map[string]any{"type": "integer"},
			"format":        map[string]any{"type": "string"},
			"stage_dir":     map[string]any{"type": "string"},
			"manifest_path": map[string]any{"type": "string"},
			"totals": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"records": map[string]any{"type": "integer"},
				},
				"required": []string{"records"},
			},
			"chunks": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"path":               map[string]any{"type": "string"},
						"records":            map[string]any{"type": "integer"},
						"first_record_id":    map[string]any{"type": "string"},
						"last_record_id":     map[string]any{"type": "string"},
						"first_timestamp_ms": map[string]any{"type": "integer"},
						"last_timestamp_ms":  map[string]any{"type": "integer"},
					},
					"required": []string{"path", "records"},
				},
			},
		},
		"required": []string{"version", "format", "stage_dir", "manifest_path", "totals", "chunks"},
	}
}

func unsupportedActionResult(methodID string) *imessageMethodResult {
	return &imessageMethodResult{
		Success:    false,
		MessageIDs: []string{},
		ChunksSent: 0,
		Confirmed:  false,
		Executor:   currentActionCapabilities().Executor,
		Error: &nexadapter.DeliveryError{
			Type:    "unavailable",
			Message: fmt.Sprintf("%s is not supported by the current Eve executor", strings.TrimSpace(methodID)),
			Retry:   false,
		},
	}
}

func declaredSendMethod() nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
		Description:        "Send an outbound iMessage through the local Messages app.",
		Action:             "write",
		Params:             sendMethodParamsSchema(),
		Response:           actionMethodResponseSchema(),
		ConnectionRequired: boolPtr(true),
		MutatesRemote:      boolPtr(true),
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			sendReq, err := readMethodSendRequest(req)
			if err != nil {
				return nil, err
			}
			return eveSend(ctx.Context, sendReq)
		},
	})
}

func declaredUnsupportedMethod(methodID, description string, params map[string]any) nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
		Description:        description,
		Action:             "write",
		Params:             params,
		Response:           actionMethodResponseSchema(),
		ConnectionRequired: boolPtr(true),
		MutatesRemote:      boolPtr(true),
		Handler: func(_ nexadapter.AdapterContext[struct{}], _ nexadapter.AdapterMethodRequest) (any, error) {
			return unsupportedActionResult(methodID), nil
		},
	})
}

func declaredStageBackfillMethod() nexadapter.DeclaredMethod[struct{}] {
	return nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
		Description: "Stage historical Eve backfill into canonical JSONL chunk files for Nex bulk import.",
		Action:      "read",
		Params: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"since":     map[string]any{"type": "string"},
				"stage_dir": map[string]any{"type": "string"},
			},
			"required": []string{"since", "stage_dir"},
		},
		Response:           stageBackfillResponseSchema(),
		ConnectionRequired: boolPtr(true),
		MutatesRemote:      boolPtr(false),
		Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
			return eveStageBackfill(ctx.Context, ctx.ConnectionID, req.Payload)
		},
	})
}

func declaredAdapterMethods() map[string]nexadapter.DeclaredMethod[struct{}] {
	return map[string]nexadapter.DeclaredMethod[struct{}]{
		imessageSendMethodID: declaredSendMethod(),
		imessageReplyMethodID: declaredUnsupportedMethod(
			imessageReplyMethodID,
			"Reply to an existing iMessage when the local executor supports provider-native replies.",
			replyMethodParamsSchema(),
		),
		imessageReactionAddMethodID: declaredUnsupportedMethod(
			imessageReactionAddMethodID,
			"Add a tapback reaction to an existing iMessage when the local executor supports reactions.",
			reactionMethodParamsSchema(),
		),
		imessageReactionRemoveMethodID: declaredUnsupportedMethod(
			imessageReactionRemoveMethodID,
			"Remove a tapback reaction from an existing iMessage when the local executor supports reaction removal.",
			reactionMethodParamsSchema(),
		),
		imessageMessageEditMethodID: declaredUnsupportedMethod(
			imessageMessageEditMethodID,
			"Edit an existing iMessage when the local executor supports provider-native edits.",
			editMethodParamsSchema(),
		),
		imessageMessageUnsendMethodID: declaredUnsupportedMethod(
			imessageMessageUnsendMethodID,
			"Unsend an existing iMessage when the local executor supports provider-native retraction.",
			unsendMethodParamsSchema(),
		),
		imessageThreadCreateMethodID: declaredUnsupportedMethod(
			imessageThreadCreateMethodID,
			"Create a new iMessage thread when the local executor supports provider-native thread creation.",
			threadCreateParamsSchema(),
		),
		imessageThreadRenameMethodID: declaredUnsupportedMethod(
			imessageThreadRenameMethodID,
			"Rename an existing iMessage thread when the local executor supports provider-native thread mutation.",
			threadRenameParamsSchema(),
		),
		imessageThreadParticipantsAddMethodID: declaredUnsupportedMethod(
			imessageThreadParticipantsAddMethodID,
			"Add participants to an iMessage thread when the local executor supports provider-native membership changes.",
			threadParticipantsParamsSchema(),
		),
		imessageThreadParticipantsRemoveMethodID: declaredUnsupportedMethod(
			imessageThreadParticipantsRemoveMethodID,
			"Remove participants from an iMessage thread when the local executor supports provider-native membership changes.",
			threadParticipantsParamsSchema(),
		),
		recordsBackfillStageMethodID: declaredStageBackfillMethod(),
	}
}

func handleEdgeRuntimeMethod(
	ctx context.Context,
	methodID string,
	connectionID string,
	params map[string]any,
	sendFn edgeMethodSendFunc,
	stageBackfillFn edgeMethodStageBackfillFunc,
) (any, error) {
	switch strings.TrimSpace(methodID) {
	case imessageSendMethodID:
		sendReq, err := readMethodSendRequest(nexadapter.AdapterMethodRequest{
			ConnectionID: connectionID,
			Payload:      params,
		})
		if err != nil {
			return nil, err
		}
		return sendFn(ctx, sendReq)
	case recordsBackfillStageMethodID:
		return stageBackfillFn(ctx, connectionID, params)
	default:
		if slices.Contains(currentActionCapabilities().DeclaredMethods, strings.TrimSpace(methodID)) {
			return unsupportedActionResult(methodID), nil
		}
		return nil, fmt.Errorf("unsupported paired edge method: %s", strings.TrimSpace(methodID))
	}
}
