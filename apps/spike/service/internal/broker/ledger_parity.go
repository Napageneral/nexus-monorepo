package broker

import (
	"database/sql"
	"fmt"
	"strings"
)

func (b *Broker) insertSessionContinuityTransfer(transfer SessionContinuityTransferWrite) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if strings.TrimSpace(transfer.ID) == "" {
		return fmt.Errorf("continuity transfer id is required")
	}
	if strings.TrimSpace(transfer.SourceSessionKey) == "" {
		return fmt.Errorf("source session key is required")
	}
	if strings.TrimSpace(transfer.TargetSessionKey) == "" {
		return fmt.Errorf("target session key is required")
	}
	if strings.TrimSpace(transfer.Reason) == "" {
		return fmt.Errorf("continuity transfer reason is required")
	}
	if strings.TrimSpace(transfer.SummaryTurnID) == "" {
		return fmt.Errorf("summary turn id is required")
	}
	if transfer.CreatedAt <= 0 {
		transfer.CreatedAt = nowUnixMilli()
	}

	_, err := db.Exec(`
		INSERT INTO session_continuity_transfers (
			id, source_session_key, target_session_key, reason, summary_turn_id, created_at
		) VALUES (?, ?, ?, ?, ?, ?)
	`,
		transfer.ID,
		transfer.SourceSessionKey,
		transfer.TargetSessionKey,
		transfer.Reason,
		transfer.SummaryTurnID,
		transfer.CreatedAt,
	)
	return err
}

func (b *Broker) listSessionContinuityTransfers(sourceSessionKey string, targetSessionKey string, limit int) ([]*SessionContinuityTransfer, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	where := make([]string, 0, 2)
	args := make([]any, 0, 3)
	if v := strings.TrimSpace(sourceSessionKey); v != "" {
		where = append(where, "source_session_key = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(targetSessionKey); v != "" {
		where = append(where, "target_session_key = ?")
		args = append(args, v)
	}
	if limit <= 0 {
		limit = 200
	}

	query := `
		SELECT id, source_session_key, target_session_key, reason, summary_turn_id, created_at
		FROM session_continuity_transfers
	`
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	query += " ORDER BY created_at DESC LIMIT ?"
	args = append(args, limit)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]*SessionContinuityTransfer, 0)
	for rows.Next() {
		var (
			row       SessionContinuityTransfer
			createdAt int64
		)
		if err := rows.Scan(
			&row.ID,
			&row.SourceSessionKey,
			&row.TargetSessionKey,
			&row.Reason,
			&row.SummaryTurnID,
			&createdAt,
		); err != nil {
			return nil, err
		}
		row.CreatedAt = fromUnixMilli(createdAt)
		out = append(out, &row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (b *Broker) getSessionImportBySource(source string, sourceProvider string, sourceSessionID string) (*SessionImport, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	source = strings.TrimSpace(source)
	sourceProvider = strings.TrimSpace(sourceProvider)
	sourceSessionID = strings.TrimSpace(sourceSessionID)
	if source == "" || sourceProvider == "" || sourceSessionID == "" {
		return nil, fmt.Errorf("source, source provider, and source session id are required")
	}

	row := db.QueryRow(`
		SELECT source, source_provider, source_session_id, source_session_fingerprint,
		       session_label, imported_at, updated_at, last_run_id
		FROM session_imports
		WHERE source = ? AND source_provider = ? AND source_session_id = ?
	`, source, sourceProvider, sourceSessionID)

	var (
		out        SessionImport
		importedAt int64
		updatedAt  int64
		lastRunID  sql.NullString
	)
	if err := row.Scan(
		&out.Source,
		&out.SourceProvider,
		&out.SourceSessionID,
		&out.SourceSessionFingerprint,
		&out.SessionLabel,
		&importedAt,
		&updatedAt,
		&lastRunID,
	); err != nil {
		return nil, err
	}
	out.ImportedAt = fromUnixMilli(importedAt)
	out.UpdatedAt = fromUnixMilli(updatedAt)
	out.LastRunID = nullString(lastRunID)
	return &out, nil
}

func (b *Broker) upsertSessionImport(input SessionImportWrite) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if strings.TrimSpace(input.Source) == "" {
		return fmt.Errorf("session import source is required")
	}
	if strings.TrimSpace(input.SourceProvider) == "" {
		return fmt.Errorf("session import source provider is required")
	}
	if strings.TrimSpace(input.SourceSessionID) == "" {
		return fmt.Errorf("session import source session id is required")
	}
	if strings.TrimSpace(input.SourceSessionFingerprint) == "" {
		return fmt.Errorf("session import source session fingerprint is required")
	}
	if strings.TrimSpace(input.SessionLabel) == "" {
		return fmt.Errorf("session import session label is required")
	}
	if input.ImportedAt <= 0 {
		input.ImportedAt = nowUnixMilli()
	}
	if input.UpdatedAt <= 0 {
		input.UpdatedAt = input.ImportedAt
	}

	_, err := db.Exec(`
		INSERT INTO session_imports (
			source, source_provider, source_session_id, source_session_fingerprint,
			session_label, imported_at, updated_at, last_run_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(source, source_provider, source_session_id) DO UPDATE SET
			source_session_fingerprint = excluded.source_session_fingerprint,
			session_label = excluded.session_label,
			imported_at = excluded.imported_at,
			updated_at = excluded.updated_at,
			last_run_id = excluded.last_run_id
	`,
		input.Source,
		input.SourceProvider,
		input.SourceSessionID,
		input.SourceSessionFingerprint,
		input.SessionLabel,
		input.ImportedAt,
		input.UpdatedAt,
		nullIfBlank(input.LastRunID),
	)
	return err
}

func (b *Broker) getSessionImportRequestByIdempotencyKey(idempotencyKey string) (*SessionImportRequest, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	idempotencyKey = strings.TrimSpace(idempotencyKey)
	if idempotencyKey == "" {
		return nil, fmt.Errorf("idempotency key is required")
	}

	row := db.QueryRow(`
		SELECT idempotency_key, source, mode, run_id, request_hash, response_json, created_at
		FROM session_import_requests
		WHERE idempotency_key = ?
	`, idempotencyKey)

	var (
		out         SessionImportRequest
		requestHash sql.NullString
		createdAt   int64
	)
	if err := row.Scan(
		&out.IdempotencyKey,
		&out.Source,
		&out.Mode,
		&out.RunID,
		&requestHash,
		&out.ResponseJSON,
		&createdAt,
	); err != nil {
		return nil, err
	}
	out.RequestHash = nullString(requestHash)
	out.CreatedAt = fromUnixMilli(createdAt)
	return &out, nil
}

func (b *Broker) upsertSessionImportRequest(input SessionImportRequestWrite) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if strings.TrimSpace(input.IdempotencyKey) == "" {
		return fmt.Errorf("session import request idempotency key is required")
	}
	if strings.TrimSpace(input.Source) == "" {
		return fmt.Errorf("session import request source is required")
	}
	if strings.TrimSpace(input.Mode) == "" {
		return fmt.Errorf("session import request mode is required")
	}
	if strings.TrimSpace(input.RunID) == "" {
		return fmt.Errorf("session import request run id is required")
	}
	if strings.TrimSpace(input.ResponseJSON) == "" {
		return fmt.Errorf("session import request response json is required")
	}
	if input.CreatedAt <= 0 {
		input.CreatedAt = nowUnixMilli()
	}

	_, err := db.Exec(`
		INSERT INTO session_import_requests (
			idempotency_key, source, mode, run_id, request_hash, response_json, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(idempotency_key) DO UPDATE SET
			source = excluded.source,
			mode = excluded.mode,
			run_id = excluded.run_id,
			request_hash = excluded.request_hash,
			response_json = excluded.response_json,
			created_at = excluded.created_at
	`,
		input.IdempotencyKey,
		input.Source,
		input.Mode,
		input.RunID,
		nullIfBlank(input.RequestHash),
		input.ResponseJSON,
		input.CreatedAt,
	)
	return err
}

func (b *Broker) pruneSessionImportChunkParts(olderThanMs int64) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if olderThanMs <= 0 {
		return nil
	}
	_, err := db.Exec(`DELETE FROM session_import_chunk_parts WHERE created_at < ?`, olderThanMs)
	return err
}

func (b *Broker) getSessionImportChunkMeta(source string, uploadID string) (*SessionImportChunkPart, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	source = strings.TrimSpace(source)
	uploadID = strings.TrimSpace(uploadID)
	if source == "" || uploadID == "" {
		return nil, fmt.Errorf("source and upload id are required")
	}
	row := db.QueryRow(`
		SELECT source, upload_id, chunk_index, chunk_total, mode, run_id, persona_id,
		       idempotency_key, source_provider, source_session_id, source_session_fingerprint,
		       encoding, payload, created_at
		FROM session_import_chunk_parts
		WHERE source = ? AND upload_id = ?
		ORDER BY chunk_index ASC
		LIMIT 1
	`, source, uploadID)
	return scanSessionImportChunkPart(row)
}

func (b *Broker) upsertSessionImportChunkPart(input SessionImportChunkPartWrite) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if strings.TrimSpace(input.Source) == "" {
		return fmt.Errorf("session import chunk source is required")
	}
	if strings.TrimSpace(input.UploadID) == "" {
		return fmt.Errorf("session import chunk upload id is required")
	}
	if input.ChunkIndex < 0 {
		return fmt.Errorf("session import chunk index must be >= 0")
	}
	if input.ChunkTotal <= 0 {
		return fmt.Errorf("session import chunk total must be > 0")
	}
	if strings.TrimSpace(input.Mode) == "" {
		return fmt.Errorf("session import chunk mode is required")
	}
	if strings.TrimSpace(input.RunID) == "" {
		return fmt.Errorf("session import chunk run id is required")
	}
	if strings.TrimSpace(input.IdempotencyKey) == "" {
		return fmt.Errorf("session import chunk idempotency key is required")
	}
	if strings.TrimSpace(input.SourceProvider) == "" {
		return fmt.Errorf("session import chunk source provider is required")
	}
	if strings.TrimSpace(input.SourceSessionID) == "" {
		return fmt.Errorf("session import chunk source session id is required")
	}
	if strings.TrimSpace(input.SourceSessionFingerprint) == "" {
		return fmt.Errorf("session import chunk source session fingerprint is required")
	}
	if strings.TrimSpace(input.Encoding) == "" {
		return fmt.Errorf("session import chunk encoding is required")
	}
	if strings.TrimSpace(input.Payload) == "" {
		return fmt.Errorf("session import chunk payload is required")
	}
	if input.CreatedAt <= 0 {
		input.CreatedAt = nowUnixMilli()
	}

	_, err := db.Exec(`
		INSERT INTO session_import_chunk_parts (
			source, upload_id, chunk_index, chunk_total, mode, run_id, persona_id,
			idempotency_key, source_provider, source_session_id, source_session_fingerprint,
			encoding, payload, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(source, upload_id, chunk_index) DO UPDATE SET
			chunk_total = excluded.chunk_total,
			mode = excluded.mode,
			run_id = excluded.run_id,
			persona_id = excluded.persona_id,
			idempotency_key = excluded.idempotency_key,
			source_provider = excluded.source_provider,
			source_session_id = excluded.source_session_id,
			source_session_fingerprint = excluded.source_session_fingerprint,
			encoding = excluded.encoding,
			payload = excluded.payload,
			created_at = excluded.created_at
	`,
		input.Source,
		input.UploadID,
		input.ChunkIndex,
		input.ChunkTotal,
		input.Mode,
		input.RunID,
		nullIfBlank(input.PersonaID),
		input.IdempotencyKey,
		input.SourceProvider,
		input.SourceSessionID,
		input.SourceSessionFingerprint,
		input.Encoding,
		input.Payload,
		input.CreatedAt,
	)
	return err
}

func (b *Broker) countSessionImportChunkParts(source string, uploadID string) (int, error) {
	db := b.ledgerDB()
	if db == nil {
		return 0, fmt.Errorf("broker ledger is not configured")
	}
	source = strings.TrimSpace(source)
	uploadID = strings.TrimSpace(uploadID)
	if source == "" || uploadID == "" {
		return 0, fmt.Errorf("source and upload id are required")
	}
	row := db.QueryRow(
		`SELECT COUNT(*) FROM session_import_chunk_parts WHERE source = ? AND upload_id = ?`,
		source,
		uploadID,
	)
	var count int
	if err := row.Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (b *Broker) listSessionImportChunkParts(source string, uploadID string) ([]*SessionImportChunkPart, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	source = strings.TrimSpace(source)
	uploadID = strings.TrimSpace(uploadID)
	if source == "" || uploadID == "" {
		return nil, fmt.Errorf("source and upload id are required")
	}
	rows, err := db.Query(`
		SELECT source, upload_id, chunk_index, chunk_total, mode, run_id, persona_id,
		       idempotency_key, source_provider, source_session_id, source_session_fingerprint,
		       encoding, payload, created_at
		FROM session_import_chunk_parts
		WHERE source = ? AND upload_id = ?
		ORDER BY chunk_index ASC
	`, source, uploadID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]*SessionImportChunkPart, 0)
	for rows.Next() {
		row, err := scanSessionImportChunkPart(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func scanSessionImportChunkPart(scanner interface{ Scan(dest ...any) error }) (*SessionImportChunkPart, error) {
	var (
		out       SessionImportChunkPart
		personaID sql.NullString
		createdAt int64
	)
	if err := scanner.Scan(
		&out.Source,
		&out.UploadID,
		&out.ChunkIndex,
		&out.ChunkTotal,
		&out.Mode,
		&out.RunID,
		&personaID,
		&out.IdempotencyKey,
		&out.SourceProvider,
		&out.SourceSessionID,
		&out.SourceSessionFingerprint,
		&out.Encoding,
		&out.Payload,
		&createdAt,
	); err != nil {
		return nil, err
	}
	out.PersonaID = nullString(personaID)
	out.CreatedAt = fromUnixMilli(createdAt)
	return &out, nil
}

func (b *Broker) insertMessageFile(file MessageFileWrite) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if strings.TrimSpace(file.MessageID) == "" {
		return fmt.Errorf("message file message id is required")
	}
	if strings.TrimSpace(file.Kind) == "" {
		return fmt.Errorf("message file kind is required")
	}
	if strings.TrimSpace(file.FilePath) == "" {
		return fmt.Errorf("message file path is required")
	}
	_, err := db.Exec(`
		INSERT OR IGNORE INTO message_files (
			message_id, kind, file_path, line_start, line_end
		) VALUES (?, ?, ?, ?, ?)
	`,
		file.MessageID,
		file.Kind,
		file.FilePath,
		nullIntPtr(file.LineStart),
		nullIntPtr(file.LineEnd),
	)
	return err
}

func (b *Broker) listMessageFiles(messageID string) ([]*MessageFile, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return nil, fmt.Errorf("message id is required")
	}
	rows, err := db.Query(`
		SELECT id, message_id, kind, file_path, line_start, line_end
		FROM message_files
		WHERE message_id = ?
		ORDER BY id ASC
	`, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]*MessageFile, 0)
	for rows.Next() {
		var (
			file      MessageFile
			lineStart sql.NullInt64
			lineEnd   sql.NullInt64
		)
		if err := rows.Scan(
			&file.ID,
			&file.MessageID,
			&file.Kind,
			&file.FilePath,
			&lineStart,
			&lineEnd,
		); err != nil {
			return nil, err
		}
		file.LineStart = intPtrFromNull(lineStart)
		file.LineEnd = intPtrFromNull(lineEnd)
		out = append(out, &file)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (b *Broker) insertMessageLint(lint MessageLintWrite) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if strings.TrimSpace(lint.MessageID) == "" {
		return fmt.Errorf("message lint message id is required")
	}
	_, err := db.Exec(`
		INSERT INTO message_lints (
			message_id, file_path, message, lint_source, start_line, start_col, end_line, end_col, severity
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		lint.MessageID,
		nullIfBlank(lint.FilePath),
		nullIfBlank(lint.Message),
		nullIfBlank(lint.LintSource),
		nullIntPtr(lint.StartLine),
		nullIntPtr(lint.StartCol),
		nullIntPtr(lint.EndLine),
		nullIntPtr(lint.EndCol),
		nullIfBlank(lint.Severity),
	)
	return err
}

func (b *Broker) listMessageLints(messageID string) ([]*MessageLint, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return nil, fmt.Errorf("message id is required")
	}
	rows, err := db.Query(`
		SELECT id, message_id, file_path, message, lint_source, start_line, start_col, end_line, end_col, severity
		FROM message_lints
		WHERE message_id = ?
		ORDER BY id ASC
	`, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]*MessageLint, 0)
	for rows.Next() {
		var (
			lint       MessageLint
			filePath   sql.NullString
			message    sql.NullString
			lintSource sql.NullString
			startLine  sql.NullInt64
			startCol   sql.NullInt64
			endLine    sql.NullInt64
			endCol     sql.NullInt64
			severity   sql.NullString
		)
		if err := rows.Scan(
			&lint.ID,
			&lint.MessageID,
			&filePath,
			&message,
			&lintSource,
			&startLine,
			&startCol,
			&endLine,
			&endCol,
			&severity,
		); err != nil {
			return nil, err
		}
		lint.FilePath = nullString(filePath)
		lint.Message = nullString(message)
		lint.LintSource = nullString(lintSource)
		lint.StartLine = intPtrFromNull(startLine)
		lint.StartCol = intPtrFromNull(startCol)
		lint.EndLine = intPtrFromNull(endLine)
		lint.EndCol = intPtrFromNull(endCol)
		lint.Severity = nullString(severity)
		out = append(out, &lint)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (b *Broker) insertMessageCodeblock(block MessageCodeblockWrite) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if strings.TrimSpace(block.MessageID) == "" {
		return fmt.Errorf("message codeblock message id is required")
	}
	if strings.TrimSpace(block.Content) == "" {
		return fmt.Errorf("message codeblock content is required")
	}
	_, err := db.Exec(`
		INSERT INTO message_codeblocks (
			message_id, idx, language, content, file_path, line_start, line_end
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`,
		block.MessageID,
		block.Index,
		nullIfBlank(block.Language),
		block.Content,
		nullIfBlank(block.FilePath),
		nullIntPtr(block.LineStart),
		nullIntPtr(block.LineEnd),
	)
	return err
}

func (b *Broker) listMessageCodeblocks(messageID string) ([]*MessageCodeblock, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return nil, fmt.Errorf("message id is required")
	}
	rows, err := db.Query(`
		SELECT id, message_id, idx, language, content, file_path, line_start, line_end
		FROM message_codeblocks
		WHERE message_id = ?
		ORDER BY idx ASC
	`, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]*MessageCodeblock, 0)
	for rows.Next() {
		var (
			block     MessageCodeblock
			language  sql.NullString
			filePath  sql.NullString
			lineStart sql.NullInt64
			lineEnd   sql.NullInt64
		)
		if err := rows.Scan(
			&block.ID,
			&block.MessageID,
			&block.Index,
			&language,
			&block.Content,
			&filePath,
			&lineStart,
			&lineEnd,
		); err != nil {
			return nil, err
		}
		block.Language = nullString(language)
		block.FilePath = nullString(filePath)
		block.LineStart = intPtrFromNull(lineStart)
		block.LineEnd = intPtrFromNull(lineEnd)
		out = append(out, &block)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (b *Broker) upsertArtifact(artifact ArtifactWrite) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if strings.TrimSpace(artifact.ID) == "" {
		return fmt.Errorf("artifact id is required")
	}
	if strings.TrimSpace(artifact.Kind) == "" {
		return fmt.Errorf("artifact kind is required")
	}
	if strings.TrimSpace(artifact.HostPath) == "" {
		return fmt.Errorf("artifact host path is required")
	}
	if strings.TrimSpace(artifact.AgentPath) == "" {
		return fmt.Errorf("artifact agent path is required")
	}
	if artifact.Bytes < 0 {
		return fmt.Errorf("artifact bytes must be >= 0")
	}
	if artifact.CreatedAt <= 0 {
		artifact.CreatedAt = nowUnixMilli()
	}
	storage := strings.TrimSpace(artifact.Storage)
	if storage == "" {
		storage = "fs"
	}

	_, err := db.Exec(`
		INSERT INTO artifacts (
			id, kind, storage, created_at, bytes, sha256, host_path, agent_path, relative_path, content_type, encoding, metadata_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			kind = excluded.kind,
			storage = excluded.storage,
			created_at = excluded.created_at,
			bytes = excluded.bytes,
			sha256 = excluded.sha256,
			host_path = excluded.host_path,
			agent_path = excluded.agent_path,
			relative_path = excluded.relative_path,
			content_type = excluded.content_type,
			encoding = excluded.encoding,
			metadata_json = excluded.metadata_json
	`,
		artifact.ID,
		artifact.Kind,
		storage,
		artifact.CreatedAt,
		artifact.Bytes,
		nullIfBlank(artifact.SHA256),
		artifact.HostPath,
		artifact.AgentPath,
		nullIfBlank(artifact.RelativePath),
		nullIfBlank(artifact.ContentType),
		nullIfBlank(artifact.Encoding),
		nullIfBlank(artifact.MetadataJSON),
	)
	return err
}

func (b *Broker) linkToolCallArtifact(link ToolCallArtifactWrite) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if strings.TrimSpace(link.ToolCallID) == "" {
		return fmt.Errorf("tool call artifact tool call id is required")
	}
	if strings.TrimSpace(link.ArtifactID) == "" {
		return fmt.Errorf("tool call artifact artifact id is required")
	}
	if strings.TrimSpace(link.Kind) == "" {
		return fmt.Errorf("tool call artifact kind is required")
	}
	if link.CreatedAt <= 0 {
		link.CreatedAt = nowUnixMilli()
	}

	_, err := db.Exec(`
		INSERT OR IGNORE INTO tool_call_artifacts (
			tool_call_id, artifact_id, kind, created_at
		) VALUES (?, ?, ?, ?)
	`,
		link.ToolCallID,
		link.ArtifactID,
		link.Kind,
		link.CreatedAt,
	)
	return err
}

func (b *Broker) listToolCallArtifacts(toolCallID string) ([]*ToolCallArtifact, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	toolCallID = strings.TrimSpace(toolCallID)
	if toolCallID == "" {
		return nil, fmt.Errorf("tool call id is required")
	}
	rows, err := db.Query(`
		SELECT tool_call_id, artifact_id, kind, created_at
		FROM tool_call_artifacts
		WHERE tool_call_id = ?
		ORDER BY created_at ASC, artifact_id ASC
	`, toolCallID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]*ToolCallArtifact, 0)
	for rows.Next() {
		var (
			row       ToolCallArtifact
			createdAt int64
		)
		if err := rows.Scan(&row.ToolCallID, &row.ArtifactID, &row.Kind, &createdAt); err != nil {
			return nil, err
		}
		row.CreatedAt = fromUnixMilli(createdAt)
		out = append(out, &row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (b *Broker) getArtifact(id string) (*Artifact, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, fmt.Errorf("artifact id is required")
	}
	row := db.QueryRow(`
		SELECT id, kind, storage, created_at, bytes, sha256, host_path, agent_path, relative_path, content_type, encoding, metadata_json
		FROM artifacts
		WHERE id = ?
	`, id)
	var (
		out          Artifact
		createdAt    int64
		sha256Val    sql.NullString
		relativePath sql.NullString
		contentType  sql.NullString
		encoding     sql.NullString
		metadataJSON sql.NullString
	)
	if err := row.Scan(
		&out.ID,
		&out.Kind,
		&out.Storage,
		&createdAt,
		&out.Bytes,
		&sha256Val,
		&out.HostPath,
		&out.AgentPath,
		&relativePath,
		&contentType,
		&encoding,
		&metadataJSON,
	); err != nil {
		return nil, err
	}
	out.CreatedAt = fromUnixMilli(createdAt)
	out.SHA256 = nullString(sha256Val)
	out.RelativePath = nullString(relativePath)
	out.ContentType = nullString(contentType)
	out.Encoding = nullString(encoding)
	out.MetadataJSON = nullString(metadataJSON)
	return &out, nil
}
