package broker

import (
	"context"
	"crypto/rand"
	"fmt"
	"sync"
	"time"
)

// SubAgentRegistry tracks active sub-agents spawned by parent sessions.
type SubAgentRegistry struct {
	agents map[string]*SubAgentState
	mu     sync.RWMutex
}

// SubAgentState describes a single sub-agent run.
type SubAgentState struct {
	ID            string
	ParentSession string
	AgentID       string
	Status        string // "pending", "running", "completed", "failed"
	Result        string
	CreatedAt     time.Time
	CompletedAt   *time.Time
}

// NewSubAgentRegistry creates a new empty sub-agent registry.
func NewSubAgentRegistry() *SubAgentRegistry {
	return &SubAgentRegistry{
		agents: make(map[string]*SubAgentState),
	}
}

// Register creates a new sub-agent entry in the registry.
func (r *SubAgentRegistry) Register(id, parentSession, agentID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.agents[id]; ok {
		return fmt.Errorf("sub-agent %s already registered", id)
	}

	r.agents[id] = &SubAgentState{
		ID:            id,
		ParentSession: parentSession,
		AgentID:       agentID,
		Status:        "pending",
		CreatedAt:     time.Now(),
	}
	return nil
}

// GetStatus returns the current state of a sub-agent, or an error if not found.
func (r *SubAgentRegistry) GetStatus(id string) (*SubAgentState, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	state, ok := r.agents[id]
	if !ok {
		return nil, fmt.Errorf("sub-agent %s not found", id)
	}
	// Return a copy to avoid data races.
	cp := *state
	return &cp, nil
}

// SetResult updates a sub-agent's result and status.
func (r *SubAgentRegistry) SetResult(id, result, status string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	state, ok := r.agents[id]
	if !ok {
		return fmt.Errorf("sub-agent %s not found", id)
	}

	state.Result = result
	state.Status = status
	now := time.Now()
	state.CompletedAt = &now
	return nil
}

// ListForSession returns all sub-agents spawned by the given parent session key.
func (r *SubAgentRegistry) ListForSession(sessionKey string) []*SubAgentState {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []*SubAgentState
	for _, s := range r.agents {
		if s.ParentSession == sessionKey {
			cp := *s
			result = append(result, &cp)
		}
	}
	return result
}

// DispatchToSubAgent creates a sub-agent entry, resolves a session key, and
// runs the agent in a background goroutine. Returns the sub-agent ID.
func (b *Broker) DispatchToSubAgent(ctx context.Context, parentSession, agentID, prompt string) (string, error) {
	id := newSubAgentID()

	if err := b.subAgents.Register(id, parentSession, agentID); err != nil {
		return "", fmt.Errorf("register sub-agent: %w", err)
	}

	// Mark as running.
	if err := b.subAgents.SetResult(id, "", "running"); err != nil {
		return "", fmt.Errorf("set sub-agent running: %w", err)
	}
	// Clear CompletedAt since it's not actually completed yet.
	b.subAgents.mu.Lock()
	if s, ok := b.subAgents.agents[id]; ok {
		s.CompletedAt = nil
	}
	b.subAgents.mu.Unlock()

	// Construct the session key for the sub-agent.
	sessionKey := fmt.Sprintf("subagent:%s:%s", parentSession, id)

	go func() {
		result, err := b.runner.Run(ctx, RunRequest{
			SessionKey: sessionKey,
			Prompt:     prompt,
			Model:      b.defaultModel(),
			Provider:   b.defaultProvider(),
			AgentID:    agentID,
		})

		if err != nil {
			b.logger.Error("sub-agent run failed",
				"sub_agent_id", id,
				"agent_id", agentID,
				"error", err)
			_ = b.subAgents.SetResult(id, err.Error(), "failed")
			return
		}

		_ = b.subAgents.SetResult(id, result.Response, "completed")
		b.logger.Debug("sub-agent completed",
			"sub_agent_id", id,
			"agent_id", agentID,
			"response_len", len(result.Response))
	}()

	return id, nil
}

// SubAgentRegistry returns the broker's sub-agent registry.
func (b *Broker) SubAgentRegistry() *SubAgentRegistry {
	return b.subAgents
}

// newSubAgentID generates a unique sub-agent identifier.
func newSubAgentID() string {
	var buf [8]byte
	_, _ = rand.Read(buf[:])
	return fmt.Sprintf("sa-%x", buf)
}
