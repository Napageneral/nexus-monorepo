// Package pipeline implements the 5-stage Nexus request pipeline.
package pipeline

import (
	"crypto/rand"
	"fmt"
	"time"
)

// RequestStatus represents the lifecycle state of a NexusRequest.
type RequestStatus string

const (
	StatusProcessing RequestStatus = "processing"
	StatusCompleted  RequestStatus = "completed"
	StatusDenied     RequestStatus = "denied"
	StatusSkipped    RequestStatus = "skipped"
	StatusFailed     RequestStatus = "failed"
)

// QueueMode determines how a message is queued for an active agent session.
type QueueMode string

const (
	QueueSteer     QueueMode = "steer"
	QueueFollowup  QueueMode = "followup"
	QueueCollect   QueueMode = "collect"
	QueueQueue     QueueMode = "queue"
	QueueInterrupt QueueMode = "interrupt"
)

// ContentType describes the kind of content in an event payload.
type ContentType string

const (
	ContentText       ContentType = "text"
	ContentReaction   ContentType = "reaction"
	ContentMembership ContentType = "membership"
)

// ContainerKind describes the type of conversation container.
type ContainerKind string

const (
	ContainerDirect ContainerKind = "direct"
	ContainerGroup  ContainerKind = "group"
)

// RoutingParticipant identifies a sender or receiver in the adapter's namespace.
type RoutingParticipant struct {
	ID        string         `json:"id"`
	Name      string         `json:"name,omitempty"`
	AvatarURL string         `json:"avatar_url,omitempty"`
	Auth      map[string]any `json:"auth,omitempty"`
}

// Routing carries the WHO and WHERE for a request.
type Routing struct {
	Adapter   string             `json:"adapter"`
	Platform  string             `json:"platform"`
	Sender    RoutingParticipant `json:"sender"`
	Receiver  RoutingParticipant `json:"receiver"`

	// WHERE
	SpaceID       string        `json:"space_id,omitempty"`
	SpaceName     string        `json:"space_name,omitempty"`
	ContainerKind ContainerKind `json:"container_kind,omitempty"`
	ContainerID   string        `json:"container_id,omitempty"`
	ContainerName string        `json:"container_name,omitempty"`
	ThreadID      string        `json:"thread_id,omitempty"`
	ReplyToID     string        `json:"reply_to_id,omitempty"`

	// Adapter-specific opaque data
	Metadata map[string]any `json:"metadata,omitempty"`
}

// Attachment represents a file attached to an event.
type Attachment struct {
	ID          string         `json:"id"`
	Filename    string         `json:"filename,omitempty"`
	MIMEType    string         `json:"mime_type"`
	MediaType   string         `json:"media_type,omitempty"`
	Size        int64          `json:"size,omitempty"`
	URL         string         `json:"url,omitempty"`
	LocalPath   string         `json:"local_path,omitempty"`
	ContentHash string         `json:"content_hash,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

// EventPayload is the content of an inbound event.
type EventPayload struct {
	ID          string               `json:"id"`
	Content     string               `json:"content"`
	ContentType ContentType          `json:"content_type"`
	Attachments []Attachment         `json:"attachments,omitempty"`
	Recipients  []RoutingParticipant `json:"recipients,omitempty"`
	Timestamp   int64                `json:"timestamp"`
	Metadata    map[string]any       `json:"metadata,omitempty"`
}

// AccessDecision captures the result of the resolveAccess stage.
type AccessDecision struct {
	Decision      string            `json:"decision"` // "allow" or "deny"
	MatchedPolicy string            `json:"matched_policy,omitempty"`
	Permissions   AccessPermissions `json:"permissions"`
}

// AccessPermissions holds tool and credential access lists.
type AccessPermissions struct {
	Tools       ToolPermissions `json:"tools"`
	Credentials []string        `json:"credentials"`
}

// ToolPermissions defines per-request tool allow/deny lists.
type ToolPermissions struct {
	Allow []string `json:"allow"`
	Deny  []string `json:"deny"`
}

// AutomationContext tracks which automations were evaluated and fired.
type AutomationContext struct {
	Evaluated      []string              `json:"evaluated"`
	Fired          []string              `json:"fired"`
	Handled        bool                  `json:"handled,omitempty"`
	HandledBy      string                `json:"handled_by,omitempty"`
	Enrichment     map[string]string     `json:"enrichment,omitempty"`
	AgentOverrides *AgentOverrides       `json:"agent_overrides,omitempty"`
	Results        []AutomationResult    `json:"results,omitempty"`
}

// AgentOverrides allows automations to override agent configuration.
type AgentOverrides struct {
	SessionKey  string    `json:"session_key,omitempty"`
	PersonaPath string    `json:"persona_path,omitempty"`
	Model       string    `json:"model,omitempty"`
	Provider    string    `json:"provider,omitempty"`
	QueueMode   QueueMode `json:"queue_mode,omitempty"`
	Role        string    `json:"role,omitempty"`
}

// AutomationResult captures the outcome of a fired automation.
type AutomationResult struct {
	AutomationID string `json:"automation_id"`
	InvocationID string `json:"invocation_id"`
	DurationMS   int64  `json:"duration_ms"`
	Error        string `json:"error,omitempty"`
}

// AgentRole describes the role of an agent in a multi-agent setup.
type AgentRole string

const (
	RoleManager AgentRole = "manager"
	RoleWorker  AgentRole = "worker"
	RoleUnified AgentRole = "unified"
)

// AgentContext captures agent execution parameters set by the broker.
type AgentContext struct {
	SessionKey  string    `json:"session_key"`
	PersonaPath string    `json:"persona_path,omitempty"`
	QueueMode   QueueMode `json:"queue_mode,omitempty"`
	Model       string    `json:"model"`
	Provider    string    `json:"provider"`
	Role        AgentRole `json:"role"`
}

// StageTrace records timing and errors for a single pipeline stage.
type StageTrace struct {
	Stage      string `json:"stage"`
	StartedAt  int64  `json:"started_at"`
	DurationMS int64  `json:"duration_ms"`
	Error      string `json:"error,omitempty"`
}

// Principals holds the resolved sender and receiver entities.
type Principals struct {
	Sender     *Entity   `json:"sender"`
	Receiver   *Entity   `json:"receiver"`
	Recipients []*Entity `json:"recipients,omitempty"`
}

// NexusRequest is the single mutable data object that flows through all 5 pipeline stages.
type NexusRequest struct {
	RequestID   string             `json:"request_id"`
	CreatedAt   int64              `json:"created_at"`
	Operation   string             `json:"operation"`
	Routing     Routing            `json:"routing"`
	Payload     any                `json:"payload"`
	Principals  *Principals        `json:"principals,omitempty"`
	Access      *AccessDecision    `json:"access,omitempty"`
	Automations *AutomationContext `json:"automations,omitempty"`
	Agent       *AgentContext      `json:"agent,omitempty"`
	Stages      []StageTrace       `json:"stages"`
	Status      RequestStatus      `json:"status"`

	// Result is set by executeOperation. Nil until the handler runs.
	Result any `json:"result,omitempty"`
}

// NexusInput is the minimal input needed to create a NexusRequest.
type NexusInput struct {
	Operation string  `json:"operation"`
	Routing   Routing `json:"routing"`
	Payload   any     `json:"payload"`
}

// NewRequest creates a NexusRequest from input with a fresh ID and timestamp.
func NewRequest(input NexusInput) *NexusRequest {
	return &NexusRequest{
		RequestID: newUUID(),
		CreatedAt: time.Now().UnixMilli(),
		Operation: input.Operation,
		Routing:   input.Routing,
		Payload:   input.Payload,
		Stages:    make([]StageTrace, 0, 5),
		Status:    StatusProcessing,
	}
}

// AppendStageTrace records a completed stage trace on the request.
func (r *NexusRequest) AppendStageTrace(trace StageTrace) {
	r.Stages = append(r.Stages, trace)
}

// newUUID generates a random UUID v4.
func newUUID() string {
	var buf [16]byte
	_, _ = rand.Read(buf[:])
	buf[6] = (buf[6] & 0x0f) | 0x40 // version 4
	buf[8] = (buf[8] & 0x3f) | 0x80 // variant 2
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		buf[0:4], buf[4:6], buf[6:8], buf[8:10], buf[10:16])
}
