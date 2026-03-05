package broker

import "time"

// LedgerSession models a row in the broker sessions table.
type LedgerSession struct {
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
	CreatedAt          time.Time
	UpdatedAt          time.Time
	Status             string
}

// SessionOptions controls broker session creation.
type SessionOptions struct {
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
	ThreadID           string
	Status             string

	// Runtime bootstrap config for Engine.Start (kept in-memory by the broker).
	WorkDir      string
	Provider     string
	Model        string
	SystemPrompt string
	Tools        []string
	ThinkLevel   string
	SessionDir   string
	Env          map[string]string
	ExtraArgs    []string
}

// SessionFilter controls ListSessions query constraints.
type SessionFilter struct {
	PersonaID     string
	Status        string
	Origin        string
	ScopeKey      string
	RefName       string
	CommitSHA     string
	TreeFlavor    string
	TreeVersionID string
	Limit         int
}

// SessionPatch is the ledger-only mutable subset for session metadata.
type SessionPatch struct {
	PersonaID       *string
	TaskDescription *string
	TaskStatus      *string
	RoutingKey      *string
	Status          *string
}

// SessionPreviewItem is a compact session history item for control-plane previews.
type SessionPreviewItem struct {
	Role      string
	Content   string
	CreatedAt time.Time
}

// SessionPreview captures preview status and items for a requested session key.
type SessionPreview struct {
	Key    string
	Status string
	Items  []SessionPreviewItem
}

// LedgerTurn models a row in the turns table.
type LedgerTurn struct {
	ID                  string
	ParentTurnID        string
	TurnType            string
	Status              string
	StartedAt           time.Time
	CompletedAt         *time.Time
	Model               string
	Provider            string
	Role                string
	ToolsetName         string
	ToolsAvailableJSON  string
	EffectiveConfigJSON string
	InputTokens         int
	OutputTokens        int
	CachedInputTokens   int
	CacheWriteTokens    int
	ReasoningTokens     int
	TotalTokens         int
	QueryMessageIDsJSON string
	ResponseMessageID   string
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

// TurnWrite is the write model for a new turn.
type TurnWrite struct {
	ID                  string
	ParentTurnID        string
	TurnType            string
	Status              string
	StartedAt           int64
	CompletedAt         *int64
	Model               string
	Provider            string
	Role                string
	ToolsetName         string
	ToolsAvailableJSON  string
	PermissionsJSON     string
	PermissionsUsedJSON string
	EffectiveConfigJSON string
	InputTokens         *int
	OutputTokens        *int
	CachedInputTokens   *int
	CacheWriteTokens    *int
	ReasoningTokens     *int
	TotalTokens         *int
	QueryMessageIDsJSON string
	ResponseMessageID   string
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

// ThreadWrite is an upsert model for thread pointers.
type ThreadWrite struct {
	TurnID           string
	AncestryJSON     string
	TotalTokens      *int
	Depth            *int
	PersonaID        string
	SystemPromptHash string
	ThreadKey        string
}

// LedgerMessage models a row in the messages table.
type LedgerMessage struct {
	ID            string
	TurnID        string
	Role          string
	Content       string
	Source        string
	Sequence      int
	CreatedAt     time.Time
	Thinking      string
	ContextJSON   string
	MetadataJSON  string
	ScopeKey      string
	RefName       string
	CommitSHA     string
	TreeFlavor    string
	TreeVersionID string
}

// MessageWrite is the write model for messages.
type MessageWrite struct {
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

// LedgerToolCall models a row in tool_calls.
type LedgerToolCall struct {
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
	StartedAt           time.Time
	CompletedAt         *time.Time
	Sequence            int
	ScopeKey            string
	RefName             string
	CommitSHA           string
	TreeFlavor          string
	TreeVersionID       string
}

// ToolCallWrite is the write model for tool calls.
type ToolCallWrite struct {
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

// LedgerCompaction models a row in compactions.
type LedgerCompaction struct {
	TurnID                    string
	Summary                   string
	SummarizedThroughTurnID   string
	FirstKeptTurnID           string
	TurnsSummarized           *int
	CompactionType            string
	Model                     string
	Provider                  string
	TokensBefore              *int
	TokensAfter               *int
	SummaryTokens             *int
	SummarizationInputTokens  *int
	SummarizationOutputTokens *int
	DurationMS                *int
	Trigger                   string
	MetadataJSON              string
	ScopeKey                  string
	RefName                   string
	CommitSHA                 string
	TreeFlavor                string
	TreeVersionID             string
}

// CompactionWrite is the write model for compactions.
type CompactionWrite = LedgerCompaction

// QueueItem models a row in queue_items.
type QueueItem struct {
	ID           string
	SessionLabel string
	MessageJSON  string
	Mode         string
	Status       string
	EnqueuedAt   time.Time
	StartedAt    *time.Time
	CompletedAt  *time.Time
	Error        string
}

// QueueItemWrite is the write model for queue rows.
type QueueItemWrite struct {
	ID           string
	SessionLabel string
	MessageJSON  string
	Mode         string
	Status       string
	EnqueuedAt   int64
	StartedAt    *int64
	CompletedAt  *int64
	Error        string
}

// QueueFilter controls queue listing.
type QueueFilter struct {
	SessionLabel string
	Status       string
	Limit        int
}

// Checkpoint is an immutable fork point for a session.
type Checkpoint struct {
	Name         string
	SessionLabel string
	EntryID      string
	CapturedAt   time.Time
	MetadataJSON string
}

// CheckpointWrite is the write model for checkpoints.
type CheckpointWrite struct {
	Name         string
	SessionLabel string
	EntryID      string
	CapturedAt   int64
	MetadataJSON string
}

// SessionContinuityTransfer models a row in session_continuity_transfers.
type SessionContinuityTransfer struct {
	ID               string
	SourceSessionKey string
	TargetSessionKey string
	Reason           string
	SummaryTurnID    string
	CreatedAt        time.Time
}

// SessionContinuityTransferWrite is the write model for continuity rows.
type SessionContinuityTransferWrite struct {
	ID               string
	SourceSessionKey string
	TargetSessionKey string
	Reason           string
	SummaryTurnID    string
	CreatedAt        int64
}

// SessionImport models a row in session_imports.
type SessionImport struct {
	Source                   string
	SourceProvider           string
	SourceSessionID          string
	SourceSessionFingerprint string
	SessionLabel             string
	ImportedAt               time.Time
	UpdatedAt                time.Time
	LastRunID                string
}

// SessionImportWrite is the write model for session_imports.
type SessionImportWrite struct {
	Source                   string
	SourceProvider           string
	SourceSessionID          string
	SourceSessionFingerprint string
	SessionLabel             string
	ImportedAt               int64
	UpdatedAt                int64
	LastRunID                string
}

// SessionImportRequest models a row in session_import_requests.
type SessionImportRequest struct {
	IdempotencyKey string
	Source         string
	Mode           string
	RunID          string
	RequestHash    string
	ResponseJSON   string
	CreatedAt      time.Time
}

// SessionImportRequestWrite is the write model for session_import_requests.
type SessionImportRequestWrite struct {
	IdempotencyKey string
	Source         string
	Mode           string
	RunID          string
	RequestHash    string
	ResponseJSON   string
	CreatedAt      int64
}

// SessionImportChunkPart models a row in session_import_chunk_parts.
type SessionImportChunkPart struct {
	Source                   string
	UploadID                 string
	ChunkIndex               int
	ChunkTotal               int
	Mode                     string
	RunID                    string
	PersonaID                string
	IdempotencyKey           string
	SourceProvider           string
	SourceSessionID          string
	SourceSessionFingerprint string
	Encoding                 string
	Payload                  string
	CreatedAt                time.Time
}

// SessionImportChunkPartWrite is the write model for session_import_chunk_parts.
type SessionImportChunkPartWrite struct {
	Source                   string
	UploadID                 string
	ChunkIndex               int
	ChunkTotal               int
	Mode                     string
	RunID                    string
	PersonaID                string
	IdempotencyKey           string
	SourceProvider           string
	SourceSessionID          string
	SourceSessionFingerprint string
	Encoding                 string
	Payload                  string
	CreatedAt                int64
}

// MessageFile models a row in message_files.
type MessageFile struct {
	ID        int64
	MessageID string
	Kind      string
	FilePath  string
	LineStart *int
	LineEnd   *int
}

// MessageFileWrite is the write model for message_files.
type MessageFileWrite struct {
	MessageID string
	Kind      string
	FilePath  string
	LineStart *int
	LineEnd   *int
}

// MessageLint models a row in message_lints.
type MessageLint struct {
	ID         int64
	MessageID  string
	FilePath   string
	Message    string
	LintSource string
	StartLine  *int
	StartCol   *int
	EndLine    *int
	EndCol     *int
	Severity   string
}

// MessageLintWrite is the write model for message_lints.
type MessageLintWrite struct {
	MessageID  string
	FilePath   string
	Message    string
	LintSource string
	StartLine  *int
	StartCol   *int
	EndLine    *int
	EndCol     *int
	Severity   string
}

// MessageCodeblock models a row in message_codeblocks.
type MessageCodeblock struct {
	ID        int64
	MessageID string
	Index     int
	Language  string
	Content   string
	FilePath  string
	LineStart *int
	LineEnd   *int
}

// MessageCodeblockWrite is the write model for message_codeblocks.
type MessageCodeblockWrite struct {
	MessageID string
	Index     int
	Language  string
	Content   string
	FilePath  string
	LineStart *int
	LineEnd   *int
}

// Artifact models a row in artifacts.
type Artifact struct {
	ID           string
	Kind         string
	Storage      string
	CreatedAt    time.Time
	Bytes        int64
	SHA256       string
	HostPath     string
	AgentPath    string
	RelativePath string
	ContentType  string
	Encoding     string
	MetadataJSON string
}

// ArtifactWrite is the write model for artifacts.
type ArtifactWrite struct {
	ID           string
	Kind         string
	Storage      string
	CreatedAt    int64
	Bytes        int64
	SHA256       string
	HostPath     string
	AgentPath    string
	RelativePath string
	ContentType  string
	Encoding     string
	MetadataJSON string
}

// ToolCallArtifact models a row in tool_call_artifacts.
type ToolCallArtifact struct {
	ToolCallID string
	ArtifactID string
	Kind       string
	CreatedAt  time.Time
}

// ToolCallArtifactWrite is the write model for tool_call_artifacts.
type ToolCallArtifactWrite struct {
	ToolCallID string
	ArtifactID string
	Kind       string
	CreatedAt  int64
}

// SessionStats mirrors token accounting at the session level.
type SessionStats struct {
	InputTokens       int
	OutputTokens      int
	CachedInputTokens int
	CacheWriteTokens  int
	ReasoningTokens   int
	TotalTokens       int
	TurnCount         int
}

// TurnResult is a broker execution result.
type TurnResult struct {
	TurnID        string
	SessionLabel  string
	ThreadID      string
	MessageID     string
	Content       string
	Status        string
	StartedAt     time.Time
	CompletedAt   time.Time
	Usage         SessionStats
	ToolCallCount int
}

// MessagePriority is the broker priority label for queued work.
type MessagePriority string

const (
	PriorityUrgent MessagePriority = "urgent"
	PriorityHigh   MessagePriority = "high"
	PriorityNormal MessagePriority = "normal"
	PriorityLow    MessagePriority = "low"
)

// QueueMode controls queue behavior when a target is busy.
type QueueMode string

const (
	QueueModeSteer     QueueMode = "steer"
	QueueModeFollowup  QueueMode = "followup"
	QueueModeCollect   QueueMode = "collect"
	QueueModeQueue     QueueMode = "queue"
	QueueModeInterrupt QueueMode = "interrupt"
)

// AgentMessage is an orchestrator-facing message envelope.
// Legacy aliases:
// - SessionLabel maps to To
// - Mode maps to DeliveryMode
type AgentMessage struct {
	ID             string                 `json:"id,omitempty"`
	From           string                 `json:"from,omitempty"`
	To             string                 `json:"to,omitempty"`
	Content        string                 `json:"content"`
	Priority       MessagePriority        `json:"priority,omitempty"`
	DeliveryMode   QueueMode              `json:"delivery_mode,omitempty"`
	Timestamp      time.Time              `json:"timestamp,omitempty"`
	ConversationID string                 `json:"conversation_id,omitempty"`
	Metadata       map[string]interface{} `json:"metadata,omitempty"`

	// Legacy compatibility fields.
	SessionLabel string `json:"session_label,omitempty"`
	Mode         string `json:"mode,omitempty"`
}

// AgentResult is an orchestrator completion event payload.
type AgentResult struct {
	AgentID      string    `json:"agent_id,omitempty"`
	SessionLabel string    `json:"session_label,omitempty"`
	TurnID       string    `json:"turn_id,omitempty"`
	Status       string    `json:"status"`
	Output       string    `json:"output,omitempty"`
	Error        string    `json:"error,omitempty"`
	StartedAt    time.Time `json:"started_at,omitempty"`
	CompletedAt  time.Time `json:"completed_at,omitempty"`
}
