// Package broker dispatches inbound events to agent sessions, managing
// session state, message queuing, and agent run lifecycle.
package broker

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/Napageneral/nexus/internal/config"
	"github.com/Napageneral/nexus/internal/db"
	"github.com/Napageneral/nexus/internal/pipeline"
)

// ---------------------------------------------------------------------------
// AgentRunner interface - implemented by agent.Engine (built by another team)
// ---------------------------------------------------------------------------

// AgentRunner is the interface the broker uses to run agents.
// Implemented by agent.Engine.
type AgentRunner interface {
	Run(ctx context.Context, req RunRequest) (*RunResult, error)
	Abort(sessionKey string)
}

// RunRequest describes what the broker asks the agent to do.
// Defined here (not in agent/) to avoid circular imports.
type RunRequest struct {
	SessionKey   string
	Prompt       string
	Model        string
	Provider     string
	AgentID      string
	SystemPrompt string
}

// RunResult is the outcome of an agent run.
type RunResult struct {
	Response  string
	Aborted   bool
	SessionID string
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

// SessionState tracks an active agent session.
type SessionState struct {
	Key        string
	AgentID    string
	Running    bool
	Queue      []QueuedMessage
	LastActive time.Time
	mu         sync.Mutex
}

// QueueMode determines how a queued message is handled by the agent session.
type QueueMode string

const (
	ModeFollowup  QueueMode = "followup"  // queue for after current run
	ModeSteer     QueueMode = "steer"     // interrupt with new instruction
	ModeCollect   QueueMode = "collect"   // batch messages
	ModeInterrupt QueueMode = "interrupt" // cancel and restart
)

// QueuedMessage is a prompt waiting to be processed by the agent.
type QueuedMessage struct {
	Prompt   string
	Mode     QueueMode
	Queued   time.Time
	Priority int
}

// ---------------------------------------------------------------------------
// Broker
// ---------------------------------------------------------------------------

// Broker dispatches inbound events to agent sessions. It:
//  1. Resolves a session key from the request routing
//  2. If the session is idle, runs the agent immediately
//  3. If the session is busy, queues the message
//  4. When a run completes, drains queued messages
type Broker struct {
	runner    AgentRunner
	ledgers   *db.Ledgers
	config    *config.Config
	sessions  map[string]*SessionState
	subAgents *SubAgentRegistry
	mu        sync.RWMutex
	logger    *slog.Logger
}

// NewBroker creates a Broker wired to the given agent runner, databases,
// and configuration.
func NewBroker(runner AgentRunner, ledgers *db.Ledgers, cfg *config.Config, logger *slog.Logger) *Broker {
	if logger == nil {
		logger = slog.Default()
	}
	return &Broker{
		runner:    runner,
		ledgers:   ledgers,
		config:    cfg,
		sessions:  make(map[string]*SessionState),
		subAgents: NewSubAgentRegistry(),
		logger:    logger,
	}
}

// HandleEvent is the main entry point -- routes an inbound event to the
// right agent session. It is called by the event.ingest operation handler.
func (b *Broker) HandleEvent(ctx context.Context, req *pipeline.NexusRequest) error {
	// Extract the text prompt from the event payload.
	prompt := extractPrompt(req)
	if prompt == "" {
		b.logger.Debug("broker: skipping event with empty prompt",
			"request_id", req.RequestID)
		return nil
	}

	sessionKey := b.resolveSessionKey(req)
	agentID := resolveAgentID(req, b.config)

	session := b.getOrCreateSession(sessionKey, agentID)

	session.mu.Lock()
	if session.Running {
		// Agent is busy -- queue the message for later.
		session.Queue = append(session.Queue, QueuedMessage{
			Prompt: prompt,
			Queued: time.Now(),
		})
		b.logger.Debug("broker: queued message",
			"session_key", sessionKey,
			"queue_depth", len(session.Queue))
		session.mu.Unlock()
		return nil
	}

	// Mark as running before releasing the lock.
	session.Running = true
	session.LastActive = time.Now()
	session.mu.Unlock()

	// Fire the agent in a goroutine so we don't block the caller.
	go b.runAgent(ctx, session, prompt)
	return nil
}

// resolveSessionKey computes a session key from the request routing.
// Format: {agent_id}:{container_id}:{sender_id}
func (b *Broker) resolveSessionKey(req *pipeline.NexusRequest) string {
	agentID := resolveAgentID(req, b.config)
	containerID := req.Routing.ContainerID
	if containerID == "" {
		containerID = "default"
	}
	senderID := req.Routing.Sender.ID
	if senderID == "" {
		senderID = "unknown"
	}
	return fmt.Sprintf("%s:%s:%s", agentID, containerID, senderID)
}

// getOrCreateSession returns an existing session or creates a new one.
func (b *Broker) getOrCreateSession(key string, agentID string) *SessionState {
	b.mu.Lock()
	defer b.mu.Unlock()

	if s, ok := b.sessions[key]; ok {
		return s
	}
	s := &SessionState{
		Key:        key,
		AgentID:    agentID,
		LastActive: time.Now(),
	}
	b.sessions[key] = s
	return s
}

// runAgent runs the agent for a session and, upon completion, drains any
// queued messages that arrived while the agent was busy.
func (b *Broker) runAgent(ctx context.Context, session *SessionState, prompt string) {
	for {
		model := b.defaultModel()
		provider := b.defaultProvider()

		result, err := b.runner.Run(ctx, RunRequest{
			SessionKey: session.Key,
			Prompt:     prompt,
			Model:      model,
			Provider:   provider,
			AgentID:    session.AgentID,
		})
		if err != nil {
			b.logger.Error("broker: agent run failed",
				"session_key", session.Key,
				"error", err)
		} else {
			b.logger.Debug("broker: agent run completed",
				"session_key", session.Key,
				"response_len", len(result.Response),
				"aborted", result.Aborted)
		}

		// Check the queue for follow-up messages.
		session.mu.Lock()
		if len(session.Queue) == 0 {
			session.Running = false
			session.LastActive = time.Now()
			session.mu.Unlock()
			return
		}

		// Drain the next queued message.
		next := session.Queue[0]
		session.Queue = session.Queue[1:]
		session.LastActive = time.Now()
		session.mu.Unlock()

		prompt = next.Prompt
		// Loop continues with the next prompt.
	}
}

// ActiveSessions returns the number of tracked sessions.
func (b *Broker) ActiveSessions() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.sessions)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// extractPrompt pulls the text content from the request payload.
// It handles both EventPayload structs and raw map payloads.
func extractPrompt(req *pipeline.NexusRequest) string {
	if req.Payload == nil {
		return ""
	}

	// Try typed EventPayload.
	if ep, ok := req.Payload.(*pipeline.EventPayload); ok {
		return ep.Content
	}
	if ep, ok := req.Payload.(pipeline.EventPayload); ok {
		return ep.Content
	}

	// Try generic map (common when payload comes from JSON).
	if m, ok := req.Payload.(map[string]any); ok {
		if c, ok := m["content"].(string); ok {
			return c
		}
	}

	return ""
}

// resolveAgentID determines which agent should handle the request.
// In Phase 2 this returns the receiver ID or "default".
func resolveAgentID(req *pipeline.NexusRequest, cfg *config.Config) string {
	if req.Routing.Receiver.ID != "" {
		return req.Routing.Receiver.ID
	}
	// Use first configured agent or fall back to "default".
	if cfg != nil && len(cfg.Agents.List) > 0 {
		for _, a := range cfg.Agents.List {
			if a.Default {
				return a.ID
			}
		}
		return cfg.Agents.List[0].ID
	}
	return "default"
}

// defaultModel returns the configured default model or a sensible fallback.
func (b *Broker) defaultModel() string {
	if b.config != nil && b.config.Agents.Defaults.Model.Primary != "" {
		return b.config.Agents.Defaults.Model.Primary
	}
	return "claude-sonnet-4-20250514"
}

// defaultProvider returns the configured default provider or a sensible fallback.
func (b *Broker) defaultProvider() string {
	return "anthropic"
}
