package broker

import "strings"

// SessionsImportRequest mirrors nex sessions.import payload shape.
type SessionsImportRequest struct {
	Source              string               `json:"source"`
	RunID               string               `json:"runId,omitempty"`
	RunIDSnake          string               `json:"run_id,omitempty"`
	Mode                string               `json:"mode"`
	PersonaID           string               `json:"personaId,omitempty"`
	PersonaIDSnake      string               `json:"persona_id,omitempty"`
	IdempotencyKey      string               `json:"idempotencyKey"`
	IdempotencyKeySnake string               `json:"idempotency_key,omitempty"`
	Items               []SessionsImportItem `json:"items"`
}

// SessionsImportItem is one imported source session graph.
type SessionsImportItem struct {
	SourceProvider                string                   `json:"sourceProvider"`
	SourceProviderSnake           string                   `json:"source_provider,omitempty"`
	SourceSessionID               string                   `json:"sourceSessionId"`
	SourceSessionIDSnake          string                   `json:"source_session_id,omitempty"`
	SourceSessionFingerprint      string                   `json:"sourceSessionFingerprint"`
	SourceSessionFingerprintSnake string                   `json:"source_session_fingerprint,omitempty"`
	ImportedAtMS                  int64                    `json:"importedAtMs"`
	ImportedAtMSSnake             int64                    `json:"imported_at_ms,omitempty"`
	Session                       SessionsImportSession    `json:"session"`
	Turns                         []SessionsImportTurn     `json:"turns"`
	Messages                      []SessionsImportMessage  `json:"messages"`
	ToolCalls                     []SessionsImportToolCall `json:"toolCalls,omitempty"`
}

// SessionsImportSession carries imported session metadata.
type SessionsImportSession struct {
	LabelHint                  string         `json:"labelHint,omitempty"`
	LabelHintSnake             string         `json:"label_hint,omitempty"`
	CreatedAtMS                *int64         `json:"createdAtMs,omitempty"`
	CreatedAtMSSnake           *int64         `json:"created_at_ms,omitempty"`
	UpdatedAtMS                *int64         `json:"updatedAtMs,omitempty"`
	UpdatedAtMSSnake           *int64         `json:"updated_at_ms,omitempty"`
	Model                      string         `json:"model,omitempty"`
	Provider                   string         `json:"provider,omitempty"`
	WorkspacePath              string         `json:"workspacePath,omitempty"`
	WorkspacePathSnake         string         `json:"workspace_path,omitempty"`
	Project                    string         `json:"project,omitempty"`
	IsSubagent                 bool           `json:"isSubagent,omitempty"`
	IsSubagentSnake            bool           `json:"is_subagent,omitempty"`
	ParentSourceSessionID      string         `json:"parentSourceSessionId,omitempty"`
	ParentSourceSessionIDSnake string         `json:"parent_source_session_id,omitempty"`
	ParentSourceMessageID      string         `json:"parentSourceMessageId,omitempty"`
	ParentSourceMessageIDSnake string         `json:"parent_source_message_id,omitempty"`
	SpawnToolCallID            string         `json:"spawnToolCallId,omitempty"`
	SpawnToolCallIDSnake       string         `json:"spawn_tool_call_id,omitempty"`
	TaskDescription            string         `json:"taskDescription,omitempty"`
	TaskDescriptionSnake       string         `json:"task_description,omitempty"`
	TaskStatus                 string         `json:"taskStatus,omitempty"`
	TaskStatusSnake            string         `json:"task_status,omitempty"`
	Metadata                   map[string]any `json:"metadata,omitempty"`
}

// SessionsImportTurn is one imported turn row.
type SessionsImportTurn struct {
	SourceTurnID                 string         `json:"sourceTurnId"`
	SourceTurnIDSnake            string         `json:"source_turn_id,omitempty"`
	ParentSourceTurnID           string         `json:"parentSourceTurnId,omitempty"`
	ParentSourceTurnIDSnake      string         `json:"parent_source_turn_id,omitempty"`
	StartedAtMS                  int64          `json:"startedAtMs"`
	StartedAtMSSnake             int64          `json:"started_at_ms,omitempty"`
	CompletedAtMS                *int64         `json:"completedAtMs,omitempty"`
	CompletedAtMSSnake           *int64         `json:"completed_at_ms,omitempty"`
	Model                        string         `json:"model,omitempty"`
	Provider                     string         `json:"provider,omitempty"`
	InputTokens                  *int           `json:"inputTokens,omitempty"`
	InputTokensSnake             *int           `json:"input_tokens,omitempty"`
	OutputTokens                 *int           `json:"outputTokens,omitempty"`
	OutputTokensSnake            *int           `json:"output_tokens,omitempty"`
	CachedInputTokens            *int           `json:"cachedInputTokens,omitempty"`
	CachedInputTokensSnake       *int           `json:"cached_input_tokens,omitempty"`
	CacheWriteTokens             *int           `json:"cacheWriteTokens,omitempty"`
	CacheWriteTokensSnake        *int           `json:"cache_write_tokens,omitempty"`
	ReasoningTokens              *int           `json:"reasoningTokens,omitempty"`
	ReasoningTokensSnake         *int           `json:"reasoning_tokens,omitempty"`
	TotalTokens                  *int           `json:"totalTokens,omitempty"`
	TotalTokensSnake             *int           `json:"total_tokens,omitempty"`
	ResponseMessageSourceID      string         `json:"responseMessageSourceId,omitempty"`
	ResponseMessageSourceIDSnake string         `json:"response_message_source_id,omitempty"`
	QueryMessageSourceIDs        []string       `json:"queryMessageSourceIds,omitempty"`
	QueryMessageSourceIDsSnake   []string       `json:"query_message_source_ids,omitempty"`
	Metadata                     map[string]any `json:"metadata,omitempty"`
}

// SessionsImportMessage is one imported message row.
type SessionsImportMessage struct {
	SourceMessageID      string `json:"sourceMessageId"`
	SourceMessageIDSnake string `json:"source_message_id,omitempty"`
	SourceTurnID         string `json:"sourceTurnId,omitempty"`
	SourceTurnIDSnake    string `json:"source_turn_id,omitempty"`
	Role                 string `json:"role"`
	Content              string `json:"content,omitempty"`
	Sequence             int    `json:"sequence"`
	CreatedAtMS          int64  `json:"createdAtMs"`
	CreatedAtMSSnake     int64  `json:"created_at_ms,omitempty"`
	Thinking             string `json:"thinking,omitempty"`
	ContextJSON          any    `json:"contextJson,omitempty"`
	ContextJSONSnake     any    `json:"context_json,omitempty"`
	MetadataJSON         any    `json:"metadataJson,omitempty"`
	MetadataJSONSnake    any    `json:"metadata_json,omitempty"`
}

// SessionsImportToolCall is one imported tool call row.
type SessionsImportToolCall struct {
	SourceToolCallID            string `json:"sourceToolCallId"`
	SourceToolCallIDSnake       string `json:"source_tool_call_id,omitempty"`
	SourceTurnID                string `json:"sourceTurnId,omitempty"`
	SourceTurnIDSnake           string `json:"source_turn_id,omitempty"`
	SourceMessageID             string `json:"sourceMessageId,omitempty"`
	SourceMessageIDSnake        string `json:"source_message_id,omitempty"`
	ToolName                    string `json:"toolName"`
	ToolNameSnake               string `json:"tool_name,omitempty"`
	ToolNumber                  *int   `json:"toolNumber,omitempty"`
	ToolNumberSnake             *int   `json:"tool_number,omitempty"`
	ParamsJSON                  any    `json:"paramsJson,omitempty"`
	ParamsJSONSnake             any    `json:"params_json,omitempty"`
	ResultJSON                  any    `json:"resultJson,omitempty"`
	ResultJSONSnake             any    `json:"result_json,omitempty"`
	Status                      string `json:"status,omitempty"`
	SpawnedSourceSessionID      string `json:"spawnedSourceSessionId,omitempty"`
	SpawnedSourceSessionIDSnake string `json:"spawned_source_session_id,omitempty"`
	StartedAtMS                 int64  `json:"startedAtMs"`
	StartedAtMSSnake            int64  `json:"started_at_ms,omitempty"`
	CompletedAtMS               *int64 `json:"completedAtMs,omitempty"`
	CompletedAtMSSnake          *int64 `json:"completed_at_ms,omitempty"`
	Sequence                    int    `json:"sequence"`
	Error                       string `json:"error,omitempty"`
}

// SessionsImportItemResult mirrors per-item import status.
type SessionsImportItemResult struct {
	SourceProvider  string `json:"sourceProvider"`
	SourceSessionID string `json:"sourceSessionId"`
	SessionLabel    string `json:"sessionLabel,omitempty"`
	Status          string `json:"status"`
	Reason          string `json:"reason,omitempty"`
}

// SessionsImportResponse mirrors nex import response shape.
type SessionsImportResponse struct {
	OK       bool                       `json:"ok"`
	RunID    string                     `json:"runId"`
	Imported int                        `json:"imported"`
	Upserted int                        `json:"upserted"`
	Skipped  int                        `json:"skipped"`
	Failed   int                        `json:"failed"`
	Results  []SessionsImportItemResult `json:"results"`
}

// SessionsImportChunkRequest mirrors nex sessions.import.chunk payload shape.
type SessionsImportChunkRequest struct {
	Source                        string `json:"source"`
	RunID                         string `json:"runId,omitempty"`
	RunIDSnake                    string `json:"run_id,omitempty"`
	Mode                          string `json:"mode"`
	PersonaID                     string `json:"personaId,omitempty"`
	PersonaIDSnake                string `json:"persona_id,omitempty"`
	IdempotencyKey                string `json:"idempotencyKey"`
	IdempotencyKeySnake           string `json:"idempotency_key,omitempty"`
	UploadID                      string `json:"uploadId"`
	UploadIDSnake                 string `json:"upload_id,omitempty"`
	ChunkIndex                    int    `json:"chunkIndex"`
	ChunkIndexSnake               *int   `json:"chunk_index,omitempty"`
	ChunkTotal                    int    `json:"chunkTotal"`
	ChunkTotalSnake               *int   `json:"chunk_total,omitempty"`
	Encoding                      string `json:"encoding"`
	Data                          string `json:"data"`
	Payload                       string `json:"payload,omitempty"`
	SourceProvider                string `json:"sourceProvider"`
	SourceProviderSnake           string `json:"source_provider,omitempty"`
	SourceSessionID               string `json:"sourceSessionId"`
	SourceSessionIDSnake          string `json:"source_session_id,omitempty"`
	SourceSessionFingerprint      string `json:"sourceSessionFingerprint"`
	SourceSessionFingerprintSnake string `json:"source_session_fingerprint,omitempty"`
}

// SessionsImportChunkResponse mirrors nex sessions.import.chunk response shape.
type SessionsImportChunkResponse struct {
	OK       bool                    `json:"ok"`
	RunID    string                  `json:"runId"`
	UploadID string                  `json:"uploadId"`
	Status   string                  `json:"status"`
	Received int                     `json:"received"`
	Total    int                     `json:"total"`
	Import   *SessionsImportResponse `json:"import,omitempty"`
}

// SessionsImportOptions controls server-side defaults for import execution.
type SessionsImportOptions struct {
	PersonaID string
}

func (request SessionsImportRequest) normalized() SessionsImportRequest {
	out := request
	if strings.TrimSpace(out.RunID) == "" {
		out.RunID = strings.TrimSpace(out.RunIDSnake)
	}
	if strings.TrimSpace(out.PersonaID) == "" {
		out.PersonaID = strings.TrimSpace(out.PersonaIDSnake)
	}
	if strings.TrimSpace(out.IdempotencyKey) == "" {
		out.IdempotencyKey = strings.TrimSpace(out.IdempotencyKeySnake)
	}
	for idx := range out.Items {
		out.Items[idx] = out.Items[idx].normalized()
	}
	return out
}

func (request SessionsImportChunkRequest) normalized() SessionsImportChunkRequest {
	out := request
	if strings.TrimSpace(out.RunID) == "" {
		out.RunID = strings.TrimSpace(out.RunIDSnake)
	}
	if strings.TrimSpace(out.PersonaID) == "" {
		out.PersonaID = strings.TrimSpace(out.PersonaIDSnake)
	}
	if strings.TrimSpace(out.IdempotencyKey) == "" {
		out.IdempotencyKey = strings.TrimSpace(out.IdempotencyKeySnake)
	}
	if strings.TrimSpace(out.UploadID) == "" {
		out.UploadID = strings.TrimSpace(out.UploadIDSnake)
	}
	if out.ChunkIndexSnake != nil {
		out.ChunkIndex = *out.ChunkIndexSnake
	}
	if out.ChunkTotalSnake != nil {
		out.ChunkTotal = *out.ChunkTotalSnake
	}
	if strings.TrimSpace(out.Data) == "" {
		out.Data = strings.TrimSpace(out.Payload)
	}
	if strings.TrimSpace(out.SourceProvider) == "" {
		out.SourceProvider = strings.TrimSpace(out.SourceProviderSnake)
	}
	if strings.TrimSpace(out.SourceSessionID) == "" {
		out.SourceSessionID = strings.TrimSpace(out.SourceSessionIDSnake)
	}
	if strings.TrimSpace(out.SourceSessionFingerprint) == "" {
		out.SourceSessionFingerprint = strings.TrimSpace(out.SourceSessionFingerprintSnake)
	}
	return out
}

func (item SessionsImportItem) normalized() SessionsImportItem {
	out := item
	if strings.TrimSpace(out.SourceProvider) == "" {
		out.SourceProvider = strings.TrimSpace(out.SourceProviderSnake)
	}
	if strings.TrimSpace(out.SourceSessionID) == "" {
		out.SourceSessionID = strings.TrimSpace(out.SourceSessionIDSnake)
	}
	if strings.TrimSpace(out.SourceSessionFingerprint) == "" {
		out.SourceSessionFingerprint = strings.TrimSpace(out.SourceSessionFingerprintSnake)
	}
	if out.ImportedAtMS <= 0 {
		out.ImportedAtMS = out.ImportedAtMSSnake
	}
	out.Session = out.Session.normalized()
	for idx := range out.Turns {
		out.Turns[idx] = out.Turns[idx].normalized()
	}
	for idx := range out.Messages {
		out.Messages[idx] = out.Messages[idx].normalized()
	}
	for idx := range out.ToolCalls {
		out.ToolCalls[idx] = out.ToolCalls[idx].normalized()
	}
	return out
}

func (session SessionsImportSession) normalized() SessionsImportSession {
	out := session
	if strings.TrimSpace(out.LabelHint) == "" {
		out.LabelHint = strings.TrimSpace(out.LabelHintSnake)
	}
	if out.CreatedAtMS == nil {
		out.CreatedAtMS = out.CreatedAtMSSnake
	}
	if out.UpdatedAtMS == nil {
		out.UpdatedAtMS = out.UpdatedAtMSSnake
	}
	if strings.TrimSpace(out.WorkspacePath) == "" {
		out.WorkspacePath = strings.TrimSpace(out.WorkspacePathSnake)
	}
	if strings.TrimSpace(out.ParentSourceSessionID) == "" {
		out.ParentSourceSessionID = strings.TrimSpace(out.ParentSourceSessionIDSnake)
	}
	if strings.TrimSpace(out.ParentSourceMessageID) == "" {
		out.ParentSourceMessageID = strings.TrimSpace(out.ParentSourceMessageIDSnake)
	}
	if strings.TrimSpace(out.SpawnToolCallID) == "" {
		out.SpawnToolCallID = strings.TrimSpace(out.SpawnToolCallIDSnake)
	}
	if strings.TrimSpace(out.TaskDescription) == "" {
		out.TaskDescription = strings.TrimSpace(out.TaskDescriptionSnake)
	}
	if strings.TrimSpace(out.TaskStatus) == "" {
		out.TaskStatus = strings.TrimSpace(out.TaskStatusSnake)
	}
	if !out.IsSubagent && out.IsSubagentSnake {
		out.IsSubagent = true
	}
	return out
}

func (turn SessionsImportTurn) normalized() SessionsImportTurn {
	out := turn
	if strings.TrimSpace(out.SourceTurnID) == "" {
		out.SourceTurnID = strings.TrimSpace(out.SourceTurnIDSnake)
	}
	if strings.TrimSpace(out.ParentSourceTurnID) == "" {
		out.ParentSourceTurnID = strings.TrimSpace(out.ParentSourceTurnIDSnake)
	}
	if out.StartedAtMS <= 0 {
		out.StartedAtMS = out.StartedAtMSSnake
	}
	if out.CompletedAtMS == nil {
		out.CompletedAtMS = out.CompletedAtMSSnake
	}
	if out.InputTokens == nil {
		out.InputTokens = out.InputTokensSnake
	}
	if out.OutputTokens == nil {
		out.OutputTokens = out.OutputTokensSnake
	}
	if out.CachedInputTokens == nil {
		out.CachedInputTokens = out.CachedInputTokensSnake
	}
	if out.CacheWriteTokens == nil {
		out.CacheWriteTokens = out.CacheWriteTokensSnake
	}
	if out.ReasoningTokens == nil {
		out.ReasoningTokens = out.ReasoningTokensSnake
	}
	if out.TotalTokens == nil {
		out.TotalTokens = out.TotalTokensSnake
	}
	if strings.TrimSpace(out.ResponseMessageSourceID) == "" {
		out.ResponseMessageSourceID = strings.TrimSpace(out.ResponseMessageSourceIDSnake)
	}
	if len(out.QueryMessageSourceIDs) == 0 && len(out.QueryMessageSourceIDsSnake) > 0 {
		out.QueryMessageSourceIDs = out.QueryMessageSourceIDsSnake
	}
	return out
}

func (message SessionsImportMessage) normalized() SessionsImportMessage {
	out := message
	if strings.TrimSpace(out.SourceMessageID) == "" {
		out.SourceMessageID = strings.TrimSpace(out.SourceMessageIDSnake)
	}
	if strings.TrimSpace(out.SourceTurnID) == "" {
		out.SourceTurnID = strings.TrimSpace(out.SourceTurnIDSnake)
	}
	if out.CreatedAtMS <= 0 {
		out.CreatedAtMS = out.CreatedAtMSSnake
	}
	if out.ContextJSON == nil {
		out.ContextJSON = out.ContextJSONSnake
	}
	if out.MetadataJSON == nil {
		out.MetadataJSON = out.MetadataJSONSnake
	}
	return out
}

func (call SessionsImportToolCall) normalized() SessionsImportToolCall {
	out := call
	if strings.TrimSpace(out.SourceToolCallID) == "" {
		out.SourceToolCallID = strings.TrimSpace(out.SourceToolCallIDSnake)
	}
	if strings.TrimSpace(out.SourceTurnID) == "" {
		out.SourceTurnID = strings.TrimSpace(out.SourceTurnIDSnake)
	}
	if strings.TrimSpace(out.SourceMessageID) == "" {
		out.SourceMessageID = strings.TrimSpace(out.SourceMessageIDSnake)
	}
	if strings.TrimSpace(out.ToolName) == "" {
		out.ToolName = strings.TrimSpace(out.ToolNameSnake)
	}
	if out.ToolNumber == nil {
		out.ToolNumber = out.ToolNumberSnake
	}
	if out.ParamsJSON == nil {
		out.ParamsJSON = out.ParamsJSONSnake
	}
	if out.ResultJSON == nil {
		out.ResultJSON = out.ResultJSONSnake
	}
	if strings.TrimSpace(out.SpawnedSourceSessionID) == "" {
		out.SpawnedSourceSessionID = strings.TrimSpace(out.SpawnedSourceSessionIDSnake)
	}
	if out.StartedAtMS <= 0 {
		out.StartedAtMS = out.StartedAtMSSnake
	}
	if out.CompletedAtMS == nil {
		out.CompletedAtMS = out.CompletedAtMSSnake
	}
	return out
}
