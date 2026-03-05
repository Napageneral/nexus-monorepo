package broker

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
)

// RunSessionsImport executes nex-style sessions.import ingestion semantics.
func (b *Broker) RunSessionsImport(request SessionsImportRequest, options SessionsImportOptions) (*SessionsImportResponse, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	request = request.normalized()

	source := strings.TrimSpace(request.Source)
	if source != "aix" {
		return nil, fmt.Errorf("source_unsupported")
	}
	mode := strings.TrimSpace(request.Mode)
	if mode != "backfill" && mode != "tail" {
		return nil, fmt.Errorf("mode_unsupported")
	}
	idempotencyKey := strings.TrimSpace(request.IdempotencyKey)
	if idempotencyKey == "" {
		return nil, fmt.Errorf("idempotency_key_required")
	}
	if len(request.Items) == 0 {
		return nil, fmt.Errorf("items_required")
	}
	runID := strings.TrimSpace(request.RunID)
	if runID == "" {
		runID = uuid.NewString()
	}

	personaID := strings.TrimSpace(options.PersonaID)
	if personaID == "" {
		personaID = strings.TrimSpace(request.PersonaID)
	}
	if personaID == "" {
		personaID = "main"
	}

	requestHash := buildSessionsImportHash(request)
	cached, err := b.getSessionImportRequestByIdempotencyKey(idempotencyKey)
	if err == nil {
		if strings.TrimSpace(cached.Source) != source {
			return nil, fmt.Errorf("idempotency_key_source_mismatch")
		}
		if strings.TrimSpace(cached.Mode) != mode {
			return nil, fmt.Errorf("idempotency_key_mode_mismatch")
		}
		if cachedHash := strings.TrimSpace(cached.RequestHash); cachedHash != "" && cachedHash != requestHash {
			return nil, fmt.Errorf("idempotency_key_payload_mismatch")
		}
		if strings.TrimSpace(cached.Source) == source && strings.TrimSpace(cached.RequestHash) == requestHash {
			var response SessionsImportResponse
			if json.Unmarshal([]byte(cached.ResponseJSON), &response) == nil {
				return &response, nil
			}
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	response := &SessionsImportResponse{
		OK:      true,
		RunID:   runID,
		Results: make([]SessionsImportItemResult, 0, len(request.Items)),
	}

	for idx, item := range request.Items {
		savepoint := fmt.Sprintf("sessions_import_item_%d", idx)
		if _, err := db.Exec(`SAVEPOINT ` + savepoint); err != nil {
			return nil, err
		}
		result, itemErr := b.importSingleSessionItem(source, runID, personaID, item)
		if itemErr != nil {
			_, _ = db.Exec(`ROLLBACK TO SAVEPOINT ` + savepoint)
			_, _ = db.Exec(`RELEASE SAVEPOINT ` + savepoint)
			response.Failed++
			response.Results = append(response.Results, SessionsImportItemResult{
				SourceProvider:  strings.TrimSpace(item.SourceProvider),
				SourceSessionID: strings.TrimSpace(item.SourceSessionID),
				Status:          "failed",
				Reason:          itemErr.Error(),
			})
			continue
		}
		if _, err := db.Exec(`RELEASE SAVEPOINT ` + savepoint); err != nil {
			return nil, err
		}
		response.Results = append(response.Results, result)
		switch result.Status {
		case "imported":
			response.Imported++
		case "upserted":
			response.Upserted++
		case "skipped":
			response.Skipped++
		default:
			response.Failed++
		}
	}

	if err := b.upsertSessionImportRequest(SessionImportRequestWrite{
		IdempotencyKey: idempotencyKey,
		Source:         source,
		Mode:           mode,
		RunID:          runID,
		RequestHash:    requestHash,
		ResponseJSON:   mustJSON(response, "{}"),
		CreatedAt:      nowUnixMilli(),
	}); err != nil {
		return nil, err
	}
	return response, nil
}

// RunSessionsImportChunk executes nex-style sessions.import.chunk staging/finalization semantics.
func (b *Broker) RunSessionsImportChunk(request SessionsImportChunkRequest, options SessionsImportOptions) (*SessionsImportChunkResponse, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	request = request.normalized()

	source := strings.TrimSpace(request.Source)
	if source != "aix" {
		return nil, fmt.Errorf("source_unsupported")
	}
	mode := strings.TrimSpace(request.Mode)
	if mode != "backfill" && mode != "tail" {
		return nil, fmt.Errorf("mode_unsupported")
	}
	idempotencyKey := strings.TrimSpace(request.IdempotencyKey)
	if idempotencyKey == "" {
		return nil, fmt.Errorf("idempotency_key_required")
	}

	uploadID := strings.TrimSpace(request.UploadID)
	if uploadID == "" {
		return nil, fmt.Errorf("chunk_upload_id_required")
	}

	runID := strings.TrimSpace(request.RunID)
	if runID == "" {
		runID = uuid.NewString()
	}

	chunkIndex := request.ChunkIndex
	if chunkIndex < 0 {
		chunkIndex = 0
	}
	chunkTotal := request.ChunkTotal
	if chunkTotal < 1 {
		chunkTotal = 1
	}
	if chunkIndex >= chunkTotal {
		return nil, fmt.Errorf("chunk_index_out_of_range")
	}

	nowMS := time.Now().UnixMilli()
	if err := b.pruneSessionImportChunkParts(nowMS - 7*24*60*60*1000); err != nil {
		return nil, err
	}

	sourceProvider := strings.TrimSpace(request.SourceProvider)
	sourceSessionID := strings.TrimSpace(request.SourceSessionID)
	sourceSessionFingerprint := strings.TrimSpace(request.SourceSessionFingerprint)
	encoding := strings.TrimSpace(request.Encoding)

	meta, err := b.getSessionImportChunkMeta(source, uploadID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	if meta != nil {
		if meta.ChunkTotal != chunkTotal {
			return nil, fmt.Errorf("chunk_total_mismatch")
		}
		if strings.TrimSpace(meta.Mode) != mode {
			return nil, fmt.Errorf("chunk_mode_mismatch")
		}
		if strings.TrimSpace(meta.IdempotencyKey) != idempotencyKey {
			return nil, fmt.Errorf("chunk_idempotency_key_mismatch")
		}
		if strings.TrimSpace(meta.SourceProvider) != sourceProvider {
			return nil, fmt.Errorf("chunk_source_provider_mismatch")
		}
		if strings.TrimSpace(meta.SourceSessionID) != sourceSessionID {
			return nil, fmt.Errorf("chunk_source_session_id_mismatch")
		}
		if strings.TrimSpace(meta.SourceSessionFingerprint) != sourceSessionFingerprint {
			return nil, fmt.Errorf("chunk_source_session_fingerprint_mismatch")
		}
		if strings.TrimSpace(meta.Encoding) != encoding {
			return nil, fmt.Errorf("chunk_encoding_mismatch")
		}
	}

	personaID := strings.TrimSpace(options.PersonaID)
	if personaID == "" {
		personaID = strings.TrimSpace(request.PersonaID)
	}
	if personaID == "" {
		personaID = "main"
	}

	if err := b.upsertSessionImportChunkPart(SessionImportChunkPartWrite{
		Source:                   source,
		UploadID:                 uploadID,
		ChunkIndex:               chunkIndex,
		ChunkTotal:               chunkTotal,
		Mode:                     mode,
		RunID:                    runID,
		PersonaID:                personaID,
		IdempotencyKey:           idempotencyKey,
		SourceProvider:           sourceProvider,
		SourceSessionID:          sourceSessionID,
		SourceSessionFingerprint: sourceSessionFingerprint,
		Encoding:                 encoding,
		Payload:                  request.Data,
		CreatedAt:                nowMS,
	}); err != nil {
		return nil, err
	}

	received, err := b.countSessionImportChunkParts(source, uploadID)
	if err != nil {
		return nil, err
	}
	if received < chunkTotal {
		return &SessionsImportChunkResponse{
			OK:       true,
			RunID:    runID,
			UploadID: uploadID,
			Status:   "staged",
			Received: received,
			Total:    chunkTotal,
		}, nil
	}

	parts, err := b.listSessionImportChunkParts(source, uploadID)
	if err != nil {
		return nil, err
	}
	if len(parts) != chunkTotal {
		return &SessionsImportChunkResponse{
			OK:       true,
			RunID:    runID,
			UploadID: uploadID,
			Status:   "staged",
			Received: len(parts),
			Total:    chunkTotal,
		}, nil
	}
	for idx := 0; idx < len(parts); idx++ {
		if parts[idx] == nil || parts[idx].ChunkIndex != idx {
			return nil, fmt.Errorf("chunk_index_gap")
		}
	}

	item, err := decodeChunkedImportItem(parts)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(item.SourceProvider) != sourceProvider {
		return nil, fmt.Errorf("chunk_item_source_provider_mismatch")
	}
	if strings.TrimSpace(item.SourceSessionID) != sourceSessionID {
		return nil, fmt.Errorf("chunk_item_source_session_id_mismatch")
	}
	if strings.TrimSpace(item.SourceSessionFingerprint) != sourceSessionFingerprint {
		return nil, fmt.Errorf("chunk_item_source_session_fingerprint_mismatch")
	}

	importResp, err := b.RunSessionsImport(SessionsImportRequest{
		Source:         source,
		RunID:          runID,
		Mode:           mode,
		PersonaID:      personaID,
		IdempotencyKey: idempotencyKey,
		Items:          []SessionsImportItem{*item},
	}, SessionsImportOptions{
		PersonaID: personaID,
	})
	if err != nil {
		return nil, err
	}

	return &SessionsImportChunkResponse{
		OK:       true,
		RunID:    importResp.RunID,
		UploadID: uploadID,
		Status:   "completed",
		Received: chunkTotal,
		Total:    chunkTotal,
		Import:   importResp,
	}, nil
}

func decodeChunkedImportItem(parts []*SessionImportChunkPart) (*SessionsImportItem, error) {
	if len(parts) == 0 {
		return nil, fmt.Errorf("chunk_upload_empty")
	}
	encoding := strings.TrimSpace(parts[0].Encoding)
	if encoding != "gzip+base64" {
		if encoding == "" {
			encoding = "unknown"
		}
		return nil, fmt.Errorf("chunk_encoding_unsupported:%s", encoding)
	}

	var payloadBuilder strings.Builder
	for _, part := range parts {
		if part == nil {
			continue
		}
		payloadBuilder.WriteString(part.Payload)
	}

	compressed, err := base64.StdEncoding.DecodeString(payloadBuilder.String())
	if err != nil {
		return nil, fmt.Errorf("chunk_payload_decode_failed")
	}
	reader, err := gzip.NewReader(bytes.NewReader(compressed))
	if err != nil {
		return nil, fmt.Errorf("chunk_payload_decode_failed")
	}
	defer reader.Close()
	inflated, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("chunk_payload_decode_failed")
	}

	var item SessionsImportItem
	if err := json.Unmarshal(inflated, &item); err != nil {
		return nil, fmt.Errorf("chunk_payload_json_invalid")
	}
	normalized := item.normalized()
	return &normalized, nil
}

func (b *Broker) importSingleSessionItem(source string, runID string, personaID string, item SessionsImportItem) (SessionsImportItemResult, error) {
	db := b.ledgerDB()
	if db == nil {
		return SessionsImportItemResult{}, fmt.Errorf("broker ledger is not configured")
	}

	sourceProvider := strings.TrimSpace(item.SourceProvider)
	sourceSessionID := strings.TrimSpace(item.SourceSessionID)
	sourceFingerprint := strings.TrimSpace(item.SourceSessionFingerprint)
	if sourceProvider == "" {
		return SessionsImportItemResult{}, fmt.Errorf("source_provider_required")
	}
	if sourceSessionID == "" {
		return SessionsImportItemResult{}, fmt.Errorf("source_session_id_required")
	}
	if sourceFingerprint == "" {
		return SessionsImportItemResult{}, fmt.Errorf("source_session_fingerprint_required")
	}
	runtimeScope := b.defaultLedgerScope()

	existingImport, err := b.getSessionImportBySource(source, sourceProvider, sourceSessionID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return SessionsImportItemResult{}, err
	}
	if errors.Is(err, sql.ErrNoRows) {
		existingImport = nil
	}

	deterministicSessionLabel := buildImportedSessionLabel(source, sourceProvider, sourceSessionID)
	sessionLabel := deterministicSessionLabel
	if existingImport != nil && strings.TrimSpace(existingImport.SessionLabel) != "" {
		sessionLabel = strings.TrimSpace(existingImport.SessionLabel)
	} else {
		sessionLabel = resolveImportSessionLabel(db, personaID, item.Session.LabelHint, deterministicSessionLabel)
	}

	if existingImport != nil && strings.TrimSpace(existingImport.SourceSessionFingerprint) == sourceFingerprint {
		_, _ = db.Exec(`
			UPDATE sessions
			SET persona_id = ?,
			    scope_key = CASE WHEN scope_key = '' THEN ? ELSE scope_key END,
			    ref_name = CASE WHEN ref_name = '' THEN ? ELSE ref_name END,
			    commit_sha = CASE WHEN commit_sha = '' THEN ? ELSE commit_sha END,
			    tree_flavor = CASE WHEN tree_flavor = '' THEN ? ELSE tree_flavor END,
			    tree_version_id = CASE WHEN tree_version_id = '' THEN ? ELSE tree_version_id END
			WHERE label = ?
		`, personaID, runtimeScope.ScopeKey, runtimeScope.RefName, runtimeScope.CommitSHA, runtimeScope.TreeFlavor, runtimeScope.TreeVersionID, sessionLabel)
		return SessionsImportItemResult{
			SourceProvider:  sourceProvider,
			SourceSessionID: sourceSessionID,
			SessionLabel:    sessionLabel,
			Status:          "skipped",
			Reason:          "fingerprint_unchanged",
		}, nil
	}

	nowMS := nowUnixMilli()
	itemImportedAt := normalizeEpochMS(item.ImportedAtMS, nowMS)
	sessionCreatedAt := normalizeEpochPtrMS(item.Session.CreatedAtMS, itemImportedAt)
	sessionUpdatedAt := normalizeEpochPtrMS(item.Session.UpdatedAtMS, itemImportedAt)
	fallbackTurnStartedAt := sessionCreatedAt
	if sessionUpdatedAt < fallbackTurnStartedAt {
		fallbackTurnStartedAt = sessionUpdatedAt
	}

	turns := item.Turns
	messages := item.Messages
	toolCalls := item.ToolCalls

	turnIDBySourceTurnID := make(map[string]string, len(turns)+1)
	for _, turn := range turns {
		sourceTurnID := strings.TrimSpace(turn.SourceTurnID)
		if sourceTurnID == "" {
			continue
		}
		turnIDBySourceTurnID[sourceTurnID] = buildImportScopedID("turn", source, sourceProvider, sourceSessionID, sourceTurnID)
	}

	rootTurnSourceID := "__root__"
	rootTurnID := buildImportScopedID("turn", source, sourceProvider, sourceSessionID, rootTurnSourceID)
	if len(turns) == 0 {
		turnIDBySourceTurnID[rootTurnSourceID] = rootTurnID
	}

	messageIDBySourceMessageID := make(map[string]string, len(messages))
	for _, message := range messages {
		sourceMessageID := strings.TrimSpace(message.SourceMessageID)
		if sourceMessageID == "" {
			continue
		}
		messageIDBySourceMessageID[sourceMessageID] = buildImportScopedID("message", source, sourceProvider, sourceSessionID, sourceMessageID)
	}

	toolCallIDBySourceToolCallID := make(map[string]string, len(toolCalls))
	for _, toolCall := range toolCalls {
		sourceToolCallID := strings.TrimSpace(toolCall.SourceToolCallID)
		if sourceToolCallID == "" {
			continue
		}
		toolCallIDBySourceToolCallID[sourceToolCallID] = buildImportScopedID("tool", source, sourceProvider, sourceSessionID, sourceToolCallID)
	}

	fallbackTurnID := rootTurnID
	if len(turns) > 0 {
		firstID := strings.TrimSpace(turns[0].SourceTurnID)
		if mapped := strings.TrimSpace(turnIDBySourceTurnID[firstID]); mapped != "" {
			fallbackTurnID = mapped
		}
	}

	toolCallCountBySourceTurnID := map[string]int{}
	for _, toolCall := range toolCalls {
		sourceTurnID := strings.TrimSpace(toolCall.SourceTurnID)
		if sourceTurnID == "" {
			continue
		}
		toolCallCountBySourceTurnID[sourceTurnID]++
	}

	if len(turns) == 0 {
		if err := upsertImportedTurn(db, importedTurnRow{
			ID:                  rootTurnID,
			ParentTurnID:        "",
			Status:              "completed",
			StartedAt:           fallbackTurnStartedAt,
			CompletedAt:         int64Ptr(sessionUpdatedAt),
			Model:               strings.TrimSpace(item.Session.Model),
			Provider:            strings.TrimSpace(item.Session.Provider),
			InputTokens:         nil,
			OutputTokens:        nil,
			CachedInputTokens:   nil,
			CacheWriteTokens:    nil,
			ReasoningTokens:     nil,
			TotalTokens:         nil,
			QueryMessageIDsJSON: "",
			ResponseMessageID:   "",
			EffectiveConfigJSON: toJSONString(item.Session.Metadata),
			HasChildren:         false,
			ToolCallCount:       len(toolCalls),
			SourceEventID:       rootTurnSourceID,
			WorkspacePath:       strings.TrimSpace(item.Session.WorkspacePath),
			ScopeKey:            runtimeScope.ScopeKey,
			RefName:             runtimeScope.RefName,
			CommitSHA:           runtimeScope.CommitSHA,
			TreeFlavor:          runtimeScope.TreeFlavor,
			TreeVersionID:       runtimeScope.TreeVersionID,
		}); err != nil {
			return SessionsImportItemResult{}, err
		}
		if err := b.upsertThread(ThreadWrite{
			TurnID:      rootTurnID,
			TotalTokens: nil,
			PersonaID:   personaID,
			ThreadKey:   rootTurnID,
		}); err != nil {
			return SessionsImportItemResult{}, err
		}
	}

	parentTurnIDByTurnID := map[string]string{}
	for _, turn := range turns {
		sourceTurnID := strings.TrimSpace(turn.SourceTurnID)
		if sourceTurnID == "" {
			continue
		}
		turnID := strings.TrimSpace(turnIDBySourceTurnID[sourceTurnID])
		if turnID == "" {
			turnID = fallbackTurnID
		}
		parentTurnID := ""
		if candidate := strings.TrimSpace(turn.ParentSourceTurnID); candidate != "" {
			parentTurnID = strings.TrimSpace(turnIDBySourceTurnID[candidate])
		}
		parentTurnIDByTurnID[turnID] = parentTurnID

		startedAt := normalizeEpochMS(turn.StartedAtMS, sessionCreatedAt)
		var completedAt *int64
		if turn.CompletedAtMS != nil {
			v := normalizeEpochMS(*turn.CompletedAtMS, startedAt)
			completedAt = int64Ptr(v)
		}

		queryMessageIDs := make([]string, 0, len(turn.QueryMessageSourceIDs))
		for _, sourceMessageID := range turn.QueryMessageSourceIDs {
			if mapped := strings.TrimSpace(messageIDBySourceMessageID[strings.TrimSpace(sourceMessageID)]); mapped != "" {
				queryMessageIDs = append(queryMessageIDs, mapped)
			}
		}
		queryJSON := ""
		if len(queryMessageIDs) > 0 {
			queryJSON = mustJSON(queryMessageIDs, "[]")
		}

		responseMessageID := ""
		if sourceMsg := strings.TrimSpace(turn.ResponseMessageSourceID); sourceMsg != "" {
			responseMessageID = strings.TrimSpace(messageIDBySourceMessageID[sourceMsg])
		}

		if err := upsertImportedTurn(db, importedTurnRow{
			ID:                  turnID,
			ParentTurnID:        "",
			Status:              importTurnStatus(completedAt),
			StartedAt:           startedAt,
			CompletedAt:         completedAt,
			Model:               firstImportNonBlank(strings.TrimSpace(turn.Model), strings.TrimSpace(item.Session.Model)),
			Provider:            firstImportNonBlank(strings.TrimSpace(turn.Provider), strings.TrimSpace(item.Session.Provider)),
			InputTokens:         clampIntPointer(turn.InputTokens),
			OutputTokens:        clampIntPointer(turn.OutputTokens),
			CachedInputTokens:   clampIntPointer(turn.CachedInputTokens),
			CacheWriteTokens:    clampIntPointer(turn.CacheWriteTokens),
			ReasoningTokens:     clampIntPointer(turn.ReasoningTokens),
			TotalTokens:         clampIntPointer(turn.TotalTokens),
			QueryMessageIDsJSON: queryJSON,
			ResponseMessageID:   responseMessageID,
			EffectiveConfigJSON: toJSONString(turn.Metadata),
			HasChildren:         false,
			ToolCallCount:       toolCallCountBySourceTurnID[sourceTurnID],
			SourceEventID:       sourceTurnID,
			WorkspacePath:       strings.TrimSpace(item.Session.WorkspacePath),
			ScopeKey:            runtimeScope.ScopeKey,
			RefName:             runtimeScope.RefName,
			CommitSHA:           runtimeScope.CommitSHA,
			TreeFlavor:          runtimeScope.TreeFlavor,
			TreeVersionID:       runtimeScope.TreeVersionID,
		}); err != nil {
			return SessionsImportItemResult{}, err
		}
		if err := b.upsertThread(ThreadWrite{
			TurnID:      turnID,
			TotalTokens: clampIntPointer(turn.TotalTokens),
			PersonaID:   personaID,
			ThreadKey:   turnID,
		}); err != nil {
			return SessionsImportItemResult{}, err
		}
	}

	for turnID, parentTurnID := range parentTurnIDByTurnID {
		if err := setImportedTurnParent(db, turnID, parentTurnID); err != nil {
			return SessionsImportItemResult{}, err
		}
	}

	for _, turnID := range turnIDBySourceTurnID {
		_, _ = db.Exec(`UPDATE turns SET has_children = 0 WHERE id = ?`, turnID)
	}
	for _, turn := range turns {
		parentSource := strings.TrimSpace(turn.ParentSourceTurnID)
		if parentSource == "" {
			continue
		}
		parentTurnID := strings.TrimSpace(turnIDBySourceTurnID[parentSource])
		if parentTurnID == "" {
			continue
		}
		_, _ = db.Exec(`UPDATE turns SET has_children = 1 WHERE id = ?`, parentTurnID)
	}

	importOrigin := source + ":" + sourceProvider
	for _, message := range messages {
		sourceMessageID := strings.TrimSpace(message.SourceMessageID)
		if sourceMessageID == "" {
			continue
		}
		messageID := strings.TrimSpace(messageIDBySourceMessageID[sourceMessageID])
		if messageID == "" {
			continue
		}
		mappedTurnID := fallbackTurnID
		if sourceTurn := strings.TrimSpace(message.SourceTurnID); sourceTurn != "" {
			if candidate := strings.TrimSpace(turnIDBySourceTurnID[sourceTurn]); candidate != "" {
				mappedTurnID = candidate
			}
		}
		metadata := mergeMetadata(message.MetadataJSON, map[string]any{
			"import_source":     source,
			"import_provider":   sourceProvider,
			"import_session_id": sourceSessionID,
			"source_message_id": sourceMessageID,
		})
		if err := upsertImportedMessage(db, importedMessageRow{
			ID:            messageID,
			TurnID:        mappedTurnID,
			Role:          normalizeMessageRole(message.Role),
			Content:       strings.TrimSpace(message.Content),
			Source:        importOrigin,
			Sequence:      maxInt(0, message.Sequence),
			CreatedAt:     normalizeEpochMS(message.CreatedAtMS, sessionCreatedAt),
			Thinking:      strings.TrimSpace(message.Thinking),
			ContextJSON:   toJSONString(message.ContextJSON),
			MetadataJSON:  toJSONString(metadata),
			ScopeKey:      runtimeScope.ScopeKey,
			RefName:       runtimeScope.RefName,
			CommitSHA:     runtimeScope.CommitSHA,
			TreeFlavor:    runtimeScope.TreeFlavor,
			TreeVersionID: runtimeScope.TreeVersionID,
		}); err != nil {
			return SessionsImportItemResult{}, err
		}
	}

	for _, toolCall := range toolCalls {
		sourceToolCallID := strings.TrimSpace(toolCall.SourceToolCallID)
		if sourceToolCallID == "" {
			continue
		}
		toolCallID := strings.TrimSpace(toolCallIDBySourceToolCallID[sourceToolCallID])
		if toolCallID == "" {
			continue
		}
		mappedTurnID := fallbackTurnID
		if sourceTurn := strings.TrimSpace(toolCall.SourceTurnID); sourceTurn != "" {
			if candidate := strings.TrimSpace(turnIDBySourceTurnID[sourceTurn]); candidate != "" {
				mappedTurnID = candidate
			}
		}
		mappedMessageID := ""
		if sourceMessageID := strings.TrimSpace(toolCall.SourceMessageID); sourceMessageID != "" {
			mappedMessageID = strings.TrimSpace(messageIDBySourceMessageID[sourceMessageID])
		}

		spawnedSessionLabel := ""
		if spawnedSource := strings.TrimSpace(toolCall.SpawnedSourceSessionID); spawnedSource != "" {
			spawnedImport, err := b.getSessionImportBySource(source, sourceProvider, spawnedSource)
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				return SessionsImportItemResult{}, err
			}
			if spawnedImport != nil {
				spawnedSessionLabel = strings.TrimSpace(spawnedImport.SessionLabel)
			} else {
				spawnedSessionLabel = buildImportedSessionLabel(source, sourceProvider, spawnedSource)
			}
		}

		startedAt := normalizeEpochMS(toolCall.StartedAtMS, sessionCreatedAt)
		var completedAt *int64
		if toolCall.CompletedAtMS != nil {
			v := normalizeEpochMS(*toolCall.CompletedAtMS, startedAt)
			completedAt = int64Ptr(v)
		}
		status := strings.TrimSpace(toolCall.Status)
		if status == "" {
			status = importTurnStatus(completedAt)
		}
		if err := upsertImportedToolCall(db, importedToolCallRow{
			ID:                  toolCallID,
			TurnID:              mappedTurnID,
			MessageID:           mappedMessageID,
			ToolName:            strings.TrimSpace(toolCall.ToolName),
			ToolNumber:          clampIntPointer(toolCall.ToolNumber),
			ParamsJSON:          toJSONStringNonEmpty(toolCall.ParamsJSON, "{}"),
			ResultJSON:          toJSONString(toolCall.ResultJSON),
			Error:               strings.TrimSpace(toolCall.Error),
			Status:              normalizeToolCallStatus(status),
			SpawnedSessionLabel: spawnedSessionLabel,
			StartedAt:           startedAt,
			CompletedAt:         completedAt,
			Sequence:            maxInt(0, toolCall.Sequence),
			ScopeKey:            runtimeScope.ScopeKey,
			RefName:             runtimeScope.RefName,
			CommitSHA:           runtimeScope.CommitSHA,
			TreeFlavor:          runtimeScope.TreeFlavor,
			TreeVersionID:       runtimeScope.TreeVersionID,
		}); err != nil {
			return SessionsImportItemResult{}, err
		}
	}

	headTurnID := fallbackTurnID
	if len(turns) > 0 {
		latestIdx := 0
		latestAt := importTurnSortTimestamp(turns[0])
		for idx := 1; idx < len(turns); idx++ {
			ts := importTurnSortTimestamp(turns[idx])
			if ts > latestAt {
				latestAt = ts
				latestIdx = idx
			}
		}
		latestSourceTurn := strings.TrimSpace(turns[latestIdx].SourceTurnID)
		if mapped := strings.TrimSpace(turnIDBySourceTurnID[latestSourceTurn]); mapped != "" {
			headTurnID = mapped
		}
	}

	parentSessionLabel := ""
	if parentSourceSessionID := strings.TrimSpace(item.Session.ParentSourceSessionID); parentSourceSessionID != "" {
		parentImport, err := b.getSessionImportBySource(source, sourceProvider, parentSourceSessionID)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return SessionsImportItemResult{}, err
		}
		if parentImport != nil {
			parentSessionLabel = strings.TrimSpace(parentImport.SessionLabel)
		} else {
			parentSessionLabel = buildImportedSessionLabel(source, sourceProvider, parentSourceSessionID)
		}
	}

	spawnToolCallID := ""
	if spawnToolCallRaw := strings.TrimSpace(item.Session.SpawnToolCallID); spawnToolCallRaw != "" {
		if mapped := strings.TrimSpace(toolCallIDBySourceToolCallID[spawnToolCallRaw]); mapped != "" {
			spawnToolCallID = mapped
		} else {
			spawnToolCallID = buildImportScopedID("tool", source, sourceProvider, sourceSessionID, spawnToolCallRaw)
		}
	}

	if err := upsertImportedSession(db, importedSessionRow{
		Label:              sessionLabel,
		ThreadID:           headTurnID,
		PersonaID:          personaID,
		IsSubagent:         item.Session.IsSubagent,
		ParentSessionLabel: parentSessionLabel,
		ParentTurnID:       "",
		SpawnToolCallID:    spawnToolCallID,
		TaskDescription:    strings.TrimSpace(item.Session.TaskDescription),
		TaskStatus:         strings.TrimSpace(item.Session.TaskStatus),
		RoutingKey:         firstImportNonBlank(strings.TrimSpace(item.Session.WorkspacePath), strings.TrimSpace(item.Session.Project)),
		Origin:             importOrigin,
		OriginSessionID:    sourceSessionID,
		ScopeKey:           runtimeScope.ScopeKey,
		RefName:            runtimeScope.RefName,
		CommitSHA:          runtimeScope.CommitSHA,
		TreeFlavor:         runtimeScope.TreeFlavor,
		TreeVersionID:      runtimeScope.TreeVersionID,
		CreatedAt:          sessionCreatedAt,
		UpdatedAt:          maxInt64(sessionUpdatedAt, sessionCreatedAt),
		Status:             "active",
	}); err != nil {
		return SessionsImportItemResult{}, err
	}

	if _, err := db.Exec(
		`INSERT INTO session_history (
			session_label, thread_id, changed_at, scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		sessionLabel,
		headTurnID,
		maxInt64(itemImportedAt, sessionUpdatedAt),
		runtimeScope.ScopeKey,
		runtimeScope.RefName,
		runtimeScope.CommitSHA,
		runtimeScope.TreeFlavor,
		runtimeScope.TreeVersionID,
	); err != nil {
		return SessionsImportItemResult{}, err
	}

	if err := b.upsertSessionImport(SessionImportWrite{
		Source:                   source,
		SourceProvider:           sourceProvider,
		SourceSessionID:          sourceSessionID,
		SourceSessionFingerprint: sourceFingerprint,
		SessionLabel:             sessionLabel,
		ImportedAt:               itemImportedAt,
		UpdatedAt:                nowMS,
		LastRunID:                runID,
	}); err != nil {
		return SessionsImportItemResult{}, err
	}

	status := "imported"
	if existingImport != nil {
		status = "upserted"
	}
	return SessionsImportItemResult{
		SourceProvider:  sourceProvider,
		SourceSessionID: sourceSessionID,
		SessionLabel:    sessionLabel,
		Status:          status,
	}, nil
}

type importedSessionRow struct {
	Label              string
	ThreadID           string
	PersonaID          string
	IsSubagent         bool
	ParentSessionLabel string
	ParentTurnID       string
	SpawnToolCallID    string
	TaskDescription    string
	TaskStatus         string
	RoutingKey         string
	Origin             string
	OriginSessionID    string
	ScopeKey           string
	RefName            string
	CommitSHA          string
	TreeFlavor         string
	TreeVersionID      string
	CreatedAt          int64
	UpdatedAt          int64
	Status             string
}

func upsertImportedSession(db *sql.DB, input importedSessionRow) error {
	_, err := db.Exec(`
		INSERT INTO sessions (
			label, thread_id, persona_id, is_subagent, parent_session_label, parent_turn_id,
			spawn_tool_call_id, task_description, task_status, routing_key,
			origin, origin_session_id, scope_key, ref_name, commit_sha, tree_flavor, tree_version_id, created_at, updated_at, status
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(label) DO UPDATE SET
			thread_id = COALESCE(excluded.thread_id, sessions.thread_id),
			persona_id = COALESCE(excluded.persona_id, sessions.persona_id),
			is_subagent = COALESCE(excluded.is_subagent, sessions.is_subagent),
			parent_session_label = COALESCE(excluded.parent_session_label, sessions.parent_session_label),
			parent_turn_id = COALESCE(excluded.parent_turn_id, sessions.parent_turn_id),
			spawn_tool_call_id = COALESCE(excluded.spawn_tool_call_id, sessions.spawn_tool_call_id),
			task_description = COALESCE(excluded.task_description, sessions.task_description),
			task_status = COALESCE(excluded.task_status, sessions.task_status),
			routing_key = COALESCE(excluded.routing_key, sessions.routing_key),
			origin = COALESCE(excluded.origin, sessions.origin),
			origin_session_id = COALESCE(excluded.origin_session_id, sessions.origin_session_id),
			scope_key = CASE WHEN excluded.scope_key != '' THEN excluded.scope_key ELSE sessions.scope_key END,
			ref_name = CASE WHEN excluded.ref_name != '' THEN excluded.ref_name ELSE sessions.ref_name END,
			commit_sha = CASE WHEN excluded.commit_sha != '' THEN excluded.commit_sha ELSE sessions.commit_sha END,
			tree_flavor = CASE WHEN excluded.tree_flavor != '' THEN excluded.tree_flavor ELSE sessions.tree_flavor END,
			tree_version_id = CASE WHEN excluded.tree_version_id != '' THEN excluded.tree_version_id ELSE sessions.tree_version_id END,
			updated_at = excluded.updated_at,
			status = excluded.status
	`,
		input.Label,
		nullIfBlank(input.ThreadID),
		nullIfBlank(input.PersonaID),
		boolToSQLite(input.IsSubagent),
		nullIfBlank(input.ParentSessionLabel),
		nullIfBlank(input.ParentTurnID),
		nullIfBlank(input.SpawnToolCallID),
		nullIfBlank(input.TaskDescription),
		nullIfBlank(input.TaskStatus),
		nullIfBlank(input.RoutingKey),
		nullIfBlank(input.Origin),
		nullIfBlank(input.OriginSessionID),
		strings.TrimSpace(input.ScopeKey),
		strings.TrimSpace(input.RefName),
		strings.TrimSpace(input.CommitSHA),
		strings.TrimSpace(input.TreeFlavor),
		strings.TrimSpace(input.TreeVersionID),
		input.CreatedAt,
		input.UpdatedAt,
		nullIfBlank(input.Status),
	)
	return err
}

type importedTurnRow struct {
	ID                  string
	ParentTurnID        string
	Status              string
	StartedAt           int64
	CompletedAt         *int64
	Model               string
	Provider            string
	InputTokens         *int
	OutputTokens        *int
	CachedInputTokens   *int
	CacheWriteTokens    *int
	ReasoningTokens     *int
	TotalTokens         *int
	QueryMessageIDsJSON string
	ResponseMessageID   string
	EffectiveConfigJSON string
	HasChildren         bool
	ToolCallCount       int
	SourceEventID       string
	WorkspacePath       string
	ScopeKey            string
	RefName             string
	CommitSHA           string
	TreeFlavor          string
	TreeVersionID       string
}

func upsertImportedTurn(db *sql.DB, input importedTurnRow) error {
	_, err := db.Exec(`
		INSERT INTO turns (
			id, parent_turn_id, turn_type, status, started_at, completed_at, model, provider, role,
			toolset_name, tools_available, permissions_granted, permissions_used,
			input_tokens, output_tokens, cached_input_tokens, cache_write_tokens, reasoning_tokens, total_tokens,
			query_message_ids, response_message_id, effective_config_json, has_children, tool_call_count, source_event_id, workspace_path,
			scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		) VALUES (?, ?, 'normal', ?, ?, ?, ?, ?, 'unified', NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			parent_turn_id = excluded.parent_turn_id,
			status = excluded.status,
			completed_at = excluded.completed_at,
			model = excluded.model,
			provider = excluded.provider,
			input_tokens = excluded.input_tokens,
			output_tokens = excluded.output_tokens,
			cached_input_tokens = excluded.cached_input_tokens,
			cache_write_tokens = excluded.cache_write_tokens,
			reasoning_tokens = excluded.reasoning_tokens,
			total_tokens = excluded.total_tokens,
			query_message_ids = excluded.query_message_ids,
			response_message_id = excluded.response_message_id,
			effective_config_json = COALESCE(excluded.effective_config_json, turns.effective_config_json),
			has_children = excluded.has_children,
			tool_call_count = excluded.tool_call_count,
			source_event_id = excluded.source_event_id,
			workspace_path = excluded.workspace_path,
			scope_key = CASE WHEN excluded.scope_key != '' THEN excluded.scope_key ELSE turns.scope_key END,
			ref_name = CASE WHEN excluded.ref_name != '' THEN excluded.ref_name ELSE turns.ref_name END,
			commit_sha = CASE WHEN excluded.commit_sha != '' THEN excluded.commit_sha ELSE turns.commit_sha END,
			tree_flavor = CASE WHEN excluded.tree_flavor != '' THEN excluded.tree_flavor ELSE turns.tree_flavor END,
			tree_version_id = CASE WHEN excluded.tree_version_id != '' THEN excluded.tree_version_id ELSE turns.tree_version_id END
	`,
		input.ID,
		nullIfBlank(input.ParentTurnID),
		nullIfBlank(input.Status),
		input.StartedAt,
		nullInt64Ptr(input.CompletedAt),
		nullIfBlank(input.Model),
		nullIfBlank(input.Provider),
		nullIntPtr(input.InputTokens),
		nullIntPtr(input.OutputTokens),
		nullIntPtr(input.CachedInputTokens),
		nullIntPtr(input.CacheWriteTokens),
		nullIntPtr(input.ReasoningTokens),
		nullIntPtr(input.TotalTokens),
		nullIfBlank(input.QueryMessageIDsJSON),
		nullIfBlank(input.ResponseMessageID),
		nullIfBlank(input.EffectiveConfigJSON),
		boolToSQLite(input.HasChildren),
		input.ToolCallCount,
		nullIfBlank(input.SourceEventID),
		nullIfBlank(input.WorkspacePath),
		strings.TrimSpace(input.ScopeKey),
		strings.TrimSpace(input.RefName),
		strings.TrimSpace(input.CommitSHA),
		strings.TrimSpace(input.TreeFlavor),
		strings.TrimSpace(input.TreeVersionID),
	)
	return err
}

func setImportedTurnParent(db *sql.DB, turnID string, parentTurnID string) error {
	_, err := db.Exec(`UPDATE turns SET parent_turn_id = ? WHERE id = ?`, nullIfBlank(parentTurnID), turnID)
	return err
}

type importedMessageRow struct {
	ID            string
	TurnID        string
	Role          string
	Content       string
	Source        string
	Sequence      int
	CreatedAt     int64
	Thinking      string
	ContextJSON   string
	MetadataJSON  string
	ScopeKey      string
	RefName       string
	CommitSHA     string
	TreeFlavor    string
	TreeVersionID string
}

func upsertImportedMessage(db *sql.DB, input importedMessageRow) error {
	_, err := db.Exec(`
		INSERT INTO messages (
			id, turn_id, role, content, source, sequence, created_at, thinking, context_json, metadata_json,
			scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			turn_id = excluded.turn_id,
			role = excluded.role,
			content = excluded.content,
			source = excluded.source,
			sequence = excluded.sequence,
			created_at = excluded.created_at,
			thinking = excluded.thinking,
			context_json = excluded.context_json,
			metadata_json = excluded.metadata_json,
			scope_key = CASE WHEN excluded.scope_key != '' THEN excluded.scope_key ELSE messages.scope_key END,
			ref_name = CASE WHEN excluded.ref_name != '' THEN excluded.ref_name ELSE messages.ref_name END,
			commit_sha = CASE WHEN excluded.commit_sha != '' THEN excluded.commit_sha ELSE messages.commit_sha END,
			tree_flavor = CASE WHEN excluded.tree_flavor != '' THEN excluded.tree_flavor ELSE messages.tree_flavor END,
			tree_version_id = CASE WHEN excluded.tree_version_id != '' THEN excluded.tree_version_id ELSE messages.tree_version_id END
	`,
		input.ID,
		input.TurnID,
		nullIfBlank(input.Role),
		nullIfBlank(input.Content),
		nullIfBlank(input.Source),
		input.Sequence,
		input.CreatedAt,
		nullIfBlank(input.Thinking),
		nullIfBlank(input.ContextJSON),
		nullIfBlank(input.MetadataJSON),
		strings.TrimSpace(input.ScopeKey),
		strings.TrimSpace(input.RefName),
		strings.TrimSpace(input.CommitSHA),
		strings.TrimSpace(input.TreeFlavor),
		strings.TrimSpace(input.TreeVersionID),
	)
	return err
}

type importedToolCallRow struct {
	ID                  string
	TurnID              string
	MessageID           string
	ToolName            string
	ToolNumber          *int
	ParamsJSON          string
	ResultJSON          string
	Error               string
	Status              string
	SpawnedSessionLabel string
	StartedAt           int64
	CompletedAt         *int64
	Sequence            int
	ScopeKey            string
	RefName             string
	CommitSHA           string
	TreeFlavor          string
	TreeVersionID       string
}

func upsertImportedToolCall(db *sql.DB, input importedToolCallRow) error {
	_, err := db.Exec(`
		INSERT INTO tool_calls (
			id, turn_id, message_id, tool_name, tool_number, params_json, result_json, error,
			status, spawned_session_label, started_at, completed_at, sequence,
			scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			turn_id = excluded.turn_id,
			message_id = excluded.message_id,
			tool_name = excluded.tool_name,
			tool_number = excluded.tool_number,
			params_json = excluded.params_json,
			result_json = excluded.result_json,
			error = excluded.error,
			status = excluded.status,
			spawned_session_label = excluded.spawned_session_label,
			started_at = excluded.started_at,
			completed_at = excluded.completed_at,
			sequence = excluded.sequence,
			scope_key = CASE WHEN excluded.scope_key != '' THEN excluded.scope_key ELSE tool_calls.scope_key END,
			ref_name = CASE WHEN excluded.ref_name != '' THEN excluded.ref_name ELSE tool_calls.ref_name END,
			commit_sha = CASE WHEN excluded.commit_sha != '' THEN excluded.commit_sha ELSE tool_calls.commit_sha END,
			tree_flavor = CASE WHEN excluded.tree_flavor != '' THEN excluded.tree_flavor ELSE tool_calls.tree_flavor END,
			tree_version_id = CASE WHEN excluded.tree_version_id != '' THEN excluded.tree_version_id ELSE tool_calls.tree_version_id END
	`,
		input.ID,
		input.TurnID,
		nullIfBlank(input.MessageID),
		nullIfBlank(input.ToolName),
		nullIntPtr(input.ToolNumber),
		toJSONStringNonEmpty(input.ParamsJSON, "{}"),
		nullIfBlank(input.ResultJSON),
		nullIfBlank(input.Error),
		nullIfBlank(input.Status),
		nullIfBlank(input.SpawnedSessionLabel),
		input.StartedAt,
		nullInt64Ptr(input.CompletedAt),
		input.Sequence,
		strings.TrimSpace(input.ScopeKey),
		strings.TrimSpace(input.RefName),
		strings.TrimSpace(input.CommitSHA),
		strings.TrimSpace(input.TreeFlavor),
		strings.TrimSpace(input.TreeVersionID),
	)
	return err
}

func buildSessionsImportHash(request SessionsImportRequest) string {
	normalized := map[string]any{
		"source":    strings.TrimSpace(request.Source),
		"mode":      strings.TrimSpace(request.Mode),
		"personaId": blankToNil(strings.TrimSpace(request.PersonaID)),
		"items":     request.Items,
	}
	raw := mustJSON(normalized, "{}")
	var parsed any
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		sum := sha256.Sum256([]byte(raw))
		return hex.EncodeToString(sum[:])
	}
	sorted := sortJSONValue(parsed)
	sortedRaw := mustJSON(sorted, "{}")
	sum := sha256.Sum256([]byte(sortedRaw))
	return hex.EncodeToString(sum[:])
}

func buildImportScopedID(kind string, source string, sourceProvider string, sourceSessionID string, sourceEntityID string) string {
	payload := strings.Join([]string{
		strings.TrimSpace(kind),
		strings.TrimSpace(source),
		strings.TrimSpace(sourceProvider),
		strings.TrimSpace(sourceSessionID),
		strings.TrimSpace(sourceEntityID),
	}, "\x1f")
	sum := sha256.Sum256([]byte(payload))
	return "imp_" + strings.TrimSpace(kind) + "_" + hex.EncodeToString(sum[:])[:24]
}

func buildImportedSessionLabel(source string, sourceProvider string, sourceSessionID string) string {
	provider := sanitizeImportLabelSegment(sourceProvider, "provider")
	sourceSession := sanitizeImportLabelSegment(sourceSessionID, "session")
	if len(sourceSession) > 32 {
		sourceSession = sourceSession[:32]
	}
	sum := sha256.Sum256([]byte(strings.TrimSpace(source) + "\x1f" + strings.TrimSpace(sourceProvider) + "\x1f" + strings.TrimSpace(sourceSessionID)))
	hash := hex.EncodeToString(sum[:])[:10]
	return "import:" + provider + ":" + sourceSession + ":" + hash
}

func sanitizeImportLabelSegment(value string, fallback string) string {
	cleaned := strings.ToLower(strings.TrimSpace(value))
	if cleaned == "" {
		return fallback
	}
	builder := strings.Builder{}
	lastDash := false
	for _, r := range cleaned {
		isAlnum := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if isAlnum || r == '_' || r == '-' {
			builder.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			builder.WriteRune('-')
			lastDash = true
		}
	}
	out := strings.Trim(builder.String(), "-")
	if out == "" {
		return fallback
	}
	return out
}

func resolveImportSessionLabel(db *sql.DB, personaID string, labelHint string, fallbackLabel string) string {
	hint := strings.TrimSpace(labelHint)
	if hint == "" || hint == fallbackLabel {
		return fallbackLabel
	}

	var hintedLabel string
	hintedErr := db.QueryRow(
		`SELECT label FROM sessions WHERE status != 'deleted' AND label = ? AND persona_id = ? LIMIT 1`,
		hint,
		strings.TrimSpace(personaID),
	).Scan(&hintedLabel)
	if hintedErr != nil || strings.TrimSpace(hintedLabel) != hint {
		return fallbackLabel
	}

	var fallbackFound string
	fallbackErr := db.QueryRow(
		`SELECT label FROM sessions WHERE status != 'deleted' AND label = ? LIMIT 1`,
		fallbackLabel,
	).Scan(&fallbackFound)
	if fallbackErr == nil && strings.TrimSpace(fallbackFound) == fallbackLabel {
		return fallbackLabel
	}
	return hint
}

func mergeMetadata(base any, extra map[string]any) map[string]any {
	if len(extra) == 0 {
		return map[string]any{}
	}
	switch typed := base.(type) {
	case map[string]any:
		out := map[string]any{}
		for k, v := range typed {
			out[k] = v
		}
		for k, v := range extra {
			out[k] = v
		}
		return out
	case nil:
		out := map[string]any{}
		for k, v := range extra {
			out[k] = v
		}
		return out
	default:
		out := map[string]any{}
		for k, v := range extra {
			out[k] = v
		}
		out["_raw"] = base
		return out
	}
}

func sortJSONValue(value any) any {
	switch typed := value.(type) {
	case []any:
		out := make([]any, 0, len(typed))
		for _, item := range typed {
			out = append(out, sortJSONValue(item))
		}
		return out
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		slices.Sort(keys)
		out := map[string]any{}
		for _, key := range keys {
			out[key] = sortJSONValue(typed[key])
		}
		return out
	default:
		return value
	}
}

func normalizeEpochMS(value int64, fallback int64) int64 {
	if value <= 0 {
		return fallback
	}
	return value
}

func normalizeEpochPtrMS(value *int64, fallback int64) int64 {
	if value == nil {
		return fallback
	}
	if *value <= 0 {
		return fallback
	}
	return *value
}

func toJSONString(value any) string {
	if value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return strings.TrimSpace(text)
	}
	return mustJSON(value, "")
}

func toJSONStringNonEmpty(value any, fallback string) string {
	text := strings.TrimSpace(toJSONString(value))
	if text == "" {
		return fallback
	}
	return text
}

func normalizeMessageRole(role string) string {
	switch strings.TrimSpace(role) {
	case "user", "assistant", "system", "tool":
		return strings.TrimSpace(role)
	default:
		return "assistant"
	}
}

func normalizeToolCallStatus(status string) string {
	switch strings.TrimSpace(status) {
	case "pending", "running", "completed", "failed":
		return strings.TrimSpace(status)
	default:
		return "pending"
	}
}

func importTurnStatus(completedAt *int64) string {
	if completedAt != nil {
		return "completed"
	}
	return "pending"
}

func importTurnSortTimestamp(turn SessionsImportTurn) int64 {
	if turn.CompletedAtMS != nil {
		return normalizeEpochMS(*turn.CompletedAtMS, 0)
	}
	return normalizeEpochMS(turn.StartedAtMS, 0)
}

func clampIntPointer(value *int) *int {
	if value == nil {
		return nil
	}
	v := *value
	if v < 0 {
		v = 0
	}
	return &v
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}

func maxInt64(a int64, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func blankToNil(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return strings.TrimSpace(value)
}

func firstImportNonBlank(values ...string) string {
	for _, value := range values {
		if v := strings.TrimSpace(value); v != "" {
			return v
		}
	}
	return ""
}
