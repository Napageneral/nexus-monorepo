package broker

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Broker coordinates fractal agents through message passing and state management
type Broker struct {
	store *Store
	db    *sql.DB

	engine Engine
	orch   *Orchestrator

	mu             sync.Mutex
	handles        map[string]EngineHandle
	sessionConfigs map[string]EngineStartOpts
	completionSubs map[string][]chan AgentResult
	eventSubs      map[string][]chan AgentEvent
	ledgerScope    LedgerScope
}

// Dir returns the broker's storage directory (e.g., <root>/.intent/state/broker).
func (b *Broker) Dir() string {
	if b == nil || b.store == nil {
		return ""
	}
	return b.store.Dir()
}

// New creates a new broker instance
// brokerDir should point to .intent/state/broker/
func New(brokerDir string) (*Broker, error) {
	store := NewStore(brokerDir)

	// Initialize directory structure
	if err := store.Initialize(); err != nil {
		return nil, fmt.Errorf("failed to initialize store: %w", err)
	}

	return &Broker{
		store:          store,
		handles:        map[string]EngineHandle{},
		sessionConfigs: map[string]EngineStartOpts{},
		completionSubs: map[string][]chan AgentResult{},
		eventSubs:      map[string][]chan AgentEvent{},
	}, nil
}

// NewWithDB creates a broker backed by a shared SQLite database.
// When configured, the broker does not write any .intent/state/broker files.
func NewWithDB(db *sql.DB) (*Broker, error) {
	if err := EnsureLedgerSchema(context.Background(), db); err != nil {
		return nil, fmt.Errorf("failed to ensure broker ledger schema: %w", err)
	}
	store := NewSQLiteStore(db)
	if err := store.Initialize(); err != nil {
		return nil, fmt.Errorf("failed to initialize store: %w", err)
	}
	return &Broker{
		store:          store,
		db:             db,
		handles:        map[string]EngineHandle{},
		sessionConfigs: map[string]EngineStartOpts{},
		completionSubs: map[string][]chan AgentResult{},
		eventSubs:      map[string][]chan AgentEvent{},
	}, nil
}

// SetEngine configures the execution engine used by Execute/Fork/Checkpoint operations.
func (b *Broker) SetEngine(engine Engine) {
	if b == nil {
		return
	}
	b.mu.Lock()
	b.engine = engine
	b.mu.Unlock()
}

// SetLedgerScope configures default scope metadata written with ledger rows.
func (b *Broker) SetLedgerScope(scope LedgerScope) {
	if b == nil {
		return
	}
	b.mu.Lock()
	b.ledgerScope = scope.normalized()
	b.mu.Unlock()
}

func (b *Broker) defaultLedgerScope() LedgerScope {
	if b == nil {
		return LedgerScope{}
	}
	b.mu.Lock()
	scope := b.ledgerScope
	b.mu.Unlock()
	return scope.normalized()
}

// ConfigureOrchestrator installs a modular orchestrator with the provided options.
func (b *Broker) ConfigureOrchestrator(opts OrchestratorOpts) *Orchestrator {
	if b == nil {
		return nil
	}
	orch := NewOrchestrator(b, opts)
	b.mu.Lock()
	b.orch = orch
	b.mu.Unlock()
	return orch
}

// Orchestrator returns the configured orchestrator, if present.
func (b *Broker) Orchestrator() *Orchestrator {
	if b == nil {
		return nil
	}
	b.mu.Lock()
	orch := b.orch
	b.mu.Unlock()
	return orch
}

func (b *Broker) ledgerDB() *sql.DB {
	if b == nil {
		return nil
	}
	if b.db != nil {
		return b.db
	}
	if b.store != nil {
		return b.store.db
	}
	return nil
}

// RegisterAgent registers a new agent with the broker and returns its ID
func (b *Broker) RegisterAgent(role AgentRole, scope string) (string, error) {
	agentID := uuid.New().String()

	agent := &Agent{
		ID:        agentID,
		Role:      role,
		Scope:     scope,
		Status:    StatusPending,
		CreatedAt: time.Now(),
		LastSeen:  time.Now(),
		ChildIDs:  []string{},
		Metadata:  make(map[string]interface{}),
		Result:    make(map[string]interface{}),
	}

	if err := b.store.PutAgent(agent); err != nil {
		return "", fmt.Errorf("failed to register agent: %w", err)
	}

	return agentID, nil
}

// RegisterOrUpdateAgent ensures an agent with a deterministic ID exists.
// If it already exists, this updates role/scope and clears error status.
func (b *Broker) RegisterOrUpdateAgent(agentID string, role AgentRole, scope string) (string, error) {
	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		return "", fmt.Errorf("agentID is required")
	}

	now := time.Now()
	agent, err := b.store.GetAgent(agentID)
	if err != nil {
		// Create
		agent = &Agent{
			ID:        agentID,
			Role:      role,
			Scope:     scope,
			Status:    StatusPending,
			CreatedAt: now,
			LastSeen:  now,
			ChildIDs:  []string{},
			Metadata:  make(map[string]interface{}),
			Result:    make(map[string]interface{}),
		}
		if err := b.store.PutAgent(agent); err != nil {
			return "", fmt.Errorf("failed to register agent: %w", err)
		}
		return agentID, nil
	}

	agent.Role = role
	agent.Scope = scope
	agent.LastSeen = now
	agent.Error = ""
	if agent.Metadata == nil {
		agent.Metadata = make(map[string]interface{})
	}
	if agent.Result == nil {
		agent.Result = make(map[string]interface{})
	}
	if err := b.store.PutAgent(agent); err != nil {
		return "", fmt.Errorf("failed to update agent: %w", err)
	}
	return agentID, nil
}

// SendMessage enqueues a message for delivery to an agent
func (b *Broker) SendMessage(from, to string, msgType MessageType, payload map[string]interface{}) error {
	// Verify recipient exists
	if _, err := b.store.GetAgent(to); err != nil {
		return fmt.Errorf("recipient agent not found: %w", err)
	}

	message := &Message{
		ID:        uuid.New().String(),
		From:      from,
		To:        to,
		Type:      msgType,
		Payload:   payload,
		Timestamp: time.Now(),
		Delivered: false,
	}

	// Load recipient's message store
	msgStore, err := b.store.LoadMessages(to)
	if err != nil {
		return fmt.Errorf("failed to load messages: %w", err)
	}

	// Append message
	msgStore.Messages = append(msgStore.Messages, message)

	// Save messages
	if err := b.store.SaveMessages(to, msgStore); err != nil {
		return fmt.Errorf("failed to save messages: %w", err)
	}

	return nil
}

// ReceiveMessages retrieves all pending (undelivered) messages for an agent
func (b *Broker) ReceiveMessages(agentID string) ([]*Message, error) {
	// Verify agent exists
	if _, err := b.store.GetAgent(agentID); err != nil {
		return nil, fmt.Errorf("agent not found: %w", err)
	}

	// Load messages
	msgStore, err := b.store.LoadMessages(agentID)
	if err != nil {
		return nil, fmt.Errorf("failed to load messages: %w", err)
	}

	// Filter undelivered messages
	pending := []*Message{}
	for _, msg := range msgStore.Messages {
		if !msg.Delivered {
			pending = append(pending, msg)
		}
	}

	return pending, nil
}

// MarkMessagesDelivered marks messages as delivered (consumed)
func (b *Broker) MarkMessagesDelivered(agentID string, messageIDs []string) error {
	// Load messages
	msgStore, err := b.store.LoadMessages(agentID)
	if err != nil {
		return fmt.Errorf("failed to load messages: %w", err)
	}

	// Mark specified messages as delivered
	idSet := make(map[string]bool)
	for _, id := range messageIDs {
		idSet[id] = true
	}

	for _, msg := range msgStore.Messages {
		if idSet[msg.ID] {
			msg.Delivered = true
		}
	}

	// Save messages
	if err := b.store.SaveMessages(agentID, msgStore); err != nil {
		return fmt.Errorf("failed to save messages: %w", err)
	}

	return nil
}

// UpdateStatus updates an agent's status and metadata
func (b *Broker) UpdateStatus(agentID string, status AgentStatus) error {
	agent, err := b.store.GetAgent(agentID)
	if err != nil {
		return fmt.Errorf("agent not found: %w", err)
	}

	agent.Status = status
	agent.LastSeen = time.Now()

	// Update timestamps based on status
	switch status {
	case StatusRunning:
		if agent.StartedAt.IsZero() {
			agent.StartedAt = time.Now()
		}
	case StatusComplete, StatusFailed:
		if agent.FinishedAt.IsZero() {
			agent.FinishedAt = time.Now()
		}
	}

	if err := b.store.PutAgent(agent); err != nil {
		return fmt.Errorf("failed to update agent: %w", err)
	}

	return nil
}

// GetAgent retrieves an agent by ID
func (b *Broker) GetAgent(agentID string) (*Agent, error) {
	return b.store.GetAgent(agentID)
}

// ListAgents retrieves all registered agents
func (b *Broker) ListAgents() ([]*Agent, error) {
	agentStore, err := b.store.LoadAgents()
	if err != nil {
		return nil, err
	}

	agents := make([]*Agent, 0, len(agentStore.Agents))
	for _, agent := range agentStore.Agents {
		agents = append(agents, agent)
	}

	return agents, nil
}

// SetAgentError sets an error message on an agent and marks it as failed
func (b *Broker) SetAgentError(agentID string, errorMsg string) error {
	agent, err := b.store.GetAgent(agentID)
	if err != nil {
		return fmt.Errorf("agent not found: %w", err)
	}

	agent.Error = errorMsg
	agent.Status = StatusFailed
	agent.LastSeen = time.Now()
	if agent.FinishedAt.IsZero() {
		agent.FinishedAt = time.Now()
	}

	if err := b.store.PutAgent(agent); err != nil {
		return fmt.Errorf("failed to update agent: %w", err)
	}

	return nil
}

// SetAgentResult sets the result data for an agent
func (b *Broker) SetAgentResult(agentID string, result map[string]interface{}) error {
	agent, err := b.store.GetAgent(agentID)
	if err != nil {
		return fmt.Errorf("agent not found: %w", err)
	}

	agent.Result = result
	agent.LastSeen = time.Now()

	if err := b.store.PutAgent(agent); err != nil {
		return fmt.Errorf("failed to update agent: %w", err)
	}

	return nil
}

// SetAgentMetadata updates an agent's metadata
func (b *Broker) SetAgentMetadata(agentID string, metadata map[string]interface{}) error {
	agent, err := b.store.GetAgent(agentID)
	if err != nil {
		return fmt.Errorf("agent not found: %w", err)
	}

	agent.Metadata = metadata
	agent.LastSeen = time.Now()

	if err := b.store.PutAgent(agent); err != nil {
		return fmt.Errorf("failed to update agent: %w", err)
	}

	return nil
}
