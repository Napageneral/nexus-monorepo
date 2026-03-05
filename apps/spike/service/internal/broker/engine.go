package broker

import (
	"context"
	"errors"
)

// ErrUnsupported indicates an engine operation is not implemented by a backend.
var ErrUnsupported = errors.New("engine operation is not supported")

// Engine executes LLM turns. The broker delegates runtime execution to an engine.
type Engine interface {
	Start(ctx context.Context, opts EngineStartOpts) (EngineHandle, error)
}

// EngineHandle is a running engine process/session.
type EngineHandle interface {
	Prompt(ctx context.Context, message string) (*TurnResult, error)
	Steer(ctx context.Context, message string) error
	GetMessages(ctx context.Context) ([]AgentMessage, error)
	GetState(ctx context.Context) (*EngineSessionState, error)
	GetSessionStats(ctx context.Context) (*SessionStats, error)
	Compact(ctx context.Context, instructions string) (*CompactionResult, error)
	SetModel(ctx context.Context, provider, modelID string) error
	SetThinkingLevel(ctx context.Context, level string) error
	OnEvent(listener func(AgentEvent)) (unsubscribe func())
	Stop(ctx context.Context) error
}

// HistoryMessage is a single message in reconstructed conversation history.
type HistoryMessage struct {
	Role    string // "user" or "assistant"
	Content string
}

// EngineStartOpts configures engine process/session startup.
type EngineStartOpts struct {
	SessionDir   string
	WorkDir      string
	Provider     string
	Model        string
	SystemPrompt string
	Tools        []string
	ThinkLevel   string
	Env          map[string]string
	ExtraArgs    []string

	// History is pre-seeded conversation context from the broker ledger.
	// When non-empty, the engine initializes with these messages before
	// accepting new prompts. Used for ledger-based forking.
	History []HistoryMessage
}

// EngineSessionState reports engine-side state useful for checkpoints.
type EngineSessionState struct {
	SessionID string
	Provider  string
	Model     string
	Streaming bool
}

// AgentEvent is a streaming event emitted during engine execution.
// Concrete engines (including GoAgentEngine) emit these events for
// token/tool/compaction lifecycle streaming.
type AgentEvent struct {
	Type string
	Data map[string]interface{}
}

// engineToolCallSnapshot is an internal normalized tool-call record emitted by engines.
type engineToolCallSnapshot struct {
	ID                  string
	ToolName            string
	ParamsJSON          string
	ResultJSON          string
	Error               string
	Status              string
	SpawnedSessionLabel string
}

type engineToolCallProvider interface {
	consumeToolCalls() []engineToolCallSnapshot
}

// CompactionResult reports context compaction details.
type CompactionResult struct {
	Summary        string
	FirstKeptEntry string
	TokensBefore   int
	TokensAfter    int
	DurationMS     int
}
