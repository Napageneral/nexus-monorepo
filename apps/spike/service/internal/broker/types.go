package broker

import "time"

// AgentRole represents the role of an agent in the fractal cartography system
type AgentRole string

const (
	// RolePlanner generates cartography plans (fractal)
	RolePlanner AgentRole = "planner"

	// RoleSubPlanner explores subsets and proposes boundaries (fractal)
	RoleSubPlanner AgentRole = "sub-planner"

	// RoleLeafMapper creates maps for leaf nodes
	RoleLeafMapper AgentRole = "leaf-mapper"

	// RoleSynthesizer builds parent maps from child maps
	RoleSynthesizer AgentRole = "synthesizer"

	// RoleVerifier validates map quality
	RoleVerifier AgentRole = "verifier"
)

// AgentStatus represents the current state of an agent
type AgentStatus string

const (
	// StatusPending - agent registered but not yet started
	StatusPending AgentStatus = "pending"

	// StatusRunning - agent is actively working
	StatusRunning AgentStatus = "running"

	// StatusWaiting - agent is waiting for child agents or resources
	StatusWaiting AgentStatus = "waiting"

	// StatusComplete - agent finished successfully
	StatusComplete AgentStatus = "complete"

	// StatusFailed - agent encountered an error
	StatusFailed AgentStatus = "failed"

	// StatusSuspended - agent paused (for reactivation later)
	StatusSuspended AgentStatus = "suspended"
)

// MessageType represents the type of message being sent
type MessageType string

const (
	// MessageSpawn - request to spawn a new agent
	MessageSpawn MessageType = "SPAWN"

	// MessageResult - agent reporting results
	MessageResult MessageType = "RESULT"

	// MessageStatus - agent status update
	MessageStatus MessageType = "STATUS"

	// MessageTerminate - request to terminate an agent
	MessageTerminate MessageType = "TERMINATE"

	// MessageResume - request to resume a suspended agent
	MessageResume MessageType = "RESUME"

	// MessageQuery - query agent state or results
	MessageQuery MessageType = "QUERY"
)

// Message represents a message between agents
type Message struct {
	ID        string                 `json:"id"`
	From      string                 `json:"from"`      // sender agent ID
	To        string                 `json:"to"`        // recipient agent ID
	Type      MessageType            `json:"type"`      // message type
	Payload   map[string]interface{} `json:"payload"`   // message data
	Timestamp time.Time              `json:"timestamp"` // when message was created
	Delivered bool                   `json:"delivered"` // whether message has been consumed
}

// Agent represents a fractal agent (planner, mapper, synthesizer, etc.)
type Agent struct {
	ID         string                 `json:"id"`         // unique agent ID
	Role       AgentRole              `json:"role"`       // agent's role
	Scope      string                 `json:"scope"`      // directory/path this agent is responsible for
	ParentID   string                 `json:"parentId"`   // ID of parent agent (empty for root)
	ChildIDs   []string               `json:"childIds"`   // IDs of child agents spawned by this agent
	Status     AgentStatus            `json:"status"`     // current status
	CreatedAt  time.Time              `json:"createdAt"`  // when agent was created
	StartedAt  time.Time              `json:"startedAt"`  // when agent started working
	FinishedAt time.Time              `json:"finishedAt"` // when agent completed
	LastSeen   time.Time              `json:"lastSeen"`   // last activity timestamp
	Error      string                 `json:"error"`      // error message if failed
	Result     map[string]interface{} `json:"result"`     // agent's result data
	Metadata   map[string]interface{} `json:"metadata"`   // additional agent-specific data
}

// SpawnRequest represents a request to spawn a new agent
type SpawnRequest struct {
	Role     AgentRole              `json:"role"`     // role of the new agent
	Scope    string                 `json:"scope"`    // scope for the new agent
	ParentID string                 `json:"parentId"` // parent agent ID
	Metadata map[string]interface{} `json:"metadata"` // optional metadata
}

// StatusUpdate represents an agent status change
type StatusUpdate struct {
	AgentID   string                 `json:"agentId"`
	Status    AgentStatus            `json:"status"`
	Error     string                 `json:"error,omitempty"`
	Result    map[string]interface{} `json:"result,omitempty"`
	Timestamp time.Time              `json:"timestamp"`
}
