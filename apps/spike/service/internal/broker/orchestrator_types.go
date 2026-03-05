package broker

import (
	"context"
	"time"
)

// SessionStatus is the orchestrator execution status for a target agent.
type SessionStatus string

const (
	SessionStatusActive SessionStatus = "active"
	SessionStatusIdle   SessionStatus = "idle"
)

// OrchestratorFeatures controls which orchestration behaviors are enabled.
type OrchestratorFeatures struct {
	EnableRouting                bool
	EnablePriorityQueue          bool
	EnableCollectMode            bool
	EnableSteerMode              bool
	EnableInterruptMode          bool
	EnableFollowupMode           bool
	EnableIARouting              bool
	EnableExternalCallerTracking bool
	EnableBatching               bool
	EnableMeeseeks               bool
}

// DefaultOrchestratorFeatures enables full parity behavior.
func DefaultOrchestratorFeatures() OrchestratorFeatures {
	return OrchestratorFeatures{
		EnableRouting:                true,
		EnablePriorityQueue:          true,
		EnableCollectMode:            true,
		EnableSteerMode:              true,
		EnableInterruptMode:          true,
		EnableFollowupMode:           true,
		EnableIARouting:              true,
		EnableExternalCallerTracking: true,
		EnableBatching:               true,
		EnableMeeseeks:               true,
	}
}

// OrchestratorOpts tunes queueing and lifecycle behavior.
type OrchestratorOpts struct {
	Features OrchestratorFeatures

	CollectDebounce            time.Duration
	CollectMaxMessages         int
	HighPriorityInterruptAfter time.Duration
}

// DefaultOrchestratorOpts returns production-safe defaults.
func DefaultOrchestratorOpts() OrchestratorOpts {
	return OrchestratorOpts{
		Features:                   DefaultOrchestratorFeatures(),
		CollectDebounce:            500 * time.Millisecond,
		CollectMaxMessages:         10,
		HighPriorityInterruptAfter: 30 * time.Second,
	}
}

// AgentHistoryEntry is the message history shape provided to worker factories.
type AgentHistoryEntry struct {
	Role      string
	Content   string
	Timestamp time.Time
}

// WorkerAgent is the execution contract for EA workers.
type WorkerAgent interface {
	Execute(ctx context.Context) (string, error)
}

// InterruptibleWorker can be preempted by steer/interrupt queue modes.
type InterruptibleWorker interface {
	Interrupt()
}

// SteeringWorker accepts in-flight steering updates without full interruption/restart.
type SteeringWorker interface {
	Steer(ctx context.Context, message string) error
}

// AgentFactory constructs an EA runner for one queued task batch.
type AgentFactory func(agentID string, taskDescription string, history []AgentHistoryEntry) (WorkerAgent, error)

// InteractionAgent is an always-on IA that can be messaged by the broker.
type InteractionAgent interface {
	QueueMessage(content string, priority MessagePriority, from string)
}

// ProcessQueueAgent executes IA queue processing.
type ProcessQueueAgent interface {
	ProcessQueue(ctx context.Context) (string, error)
}

// ChatSyncAgent is an optional IA fallback when ProcessQueue is unavailable.
type ChatSyncAgent interface {
	ChatSync(ctx context.Context, message string) error
}

// ODURegistration binds an ODU namespace to an EA factory.
type ODURegistration struct {
	Name             string
	SessionStorePath string
	Factory          AgentFactory
}

// MeeseeksOpts controls a one-shot disposable dispatch.
type MeeseeksOpts struct {
	BaseSessionLabel string
	Task             string
	MaxTurns         int
	Ephemeral        bool
}

// MeeseeksResult is the completion payload from SpawnMeeseeks.
type MeeseeksResult struct {
	SessionLabel string
	TurnID       string
	Content      string
	CompletedAt  time.Time
}

// Broker lifecycle events emitted by the orchestrator.
const (
	BrokerEventAgentStarted       = "agent_started"
	BrokerEventAgentCompleted     = "agent_completed"
	BrokerEventAgentStatusChanged = "agent_status_changed"
	BrokerEventMessageQueued      = "message_queued"
)
