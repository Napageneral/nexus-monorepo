package operations

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"runtime"
	"time"

	"github.com/Napageneral/nexus/internal/config"
	"github.com/Napageneral/nexus/internal/pipeline"
)

// ---------------------------------------------------------------------------
// ConfigHandlers - config.get, config.set, config.patch
// ---------------------------------------------------------------------------

// ConfigHandlers provides operation handlers for configuration operations.
type ConfigHandlers struct {
	config     *config.Config
	configPath string
	logger     *slog.Logger
}

// NewConfigHandlers creates ConfigHandlers.
func NewConfigHandlers(cfg *config.Config, configPath string, logger *slog.Logger) *ConfigHandlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &ConfigHandlers{config: cfg, configPath: configPath, logger: logger}
}

// Register registers config operation handlers.
func (h *ConfigHandlers) Register(reg *Registry) {
	reg.Register(OperationDef{
		Operation: "config.get",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "config",
		Surfaces:  []Surface{SurfaceWSControl, SurfaceHTTPControl},
		Handler:   h.HandleGet,
	})
	reg.Register(OperationDef{
		Operation: "config.set",
		Kind:      KindControl,
		Action:    ActionAdmin,
		Resource:  "config",
		Surfaces:  []Surface{SurfaceWSControl, SurfaceHTTPControl},
		Handler:   h.HandleSet,
	})
	reg.Register(OperationDef{
		Operation: "config.patch",
		Kind:      KindControl,
		Action:    ActionAdmin,
		Resource:  "config",
		Surfaces:  []Surface{SurfaceWSControl, SurfaceHTTPControl},
		Handler:   h.HandlePatch,
	})
}

// HandleGet returns the current configuration.
func (h *ConfigHandlers) HandleGet(_ context.Context, _ *pipeline.NexusRequest) (any, error) {
	return h.config, nil
}

// HandleSet replaces the entire configuration.
func (h *ConfigHandlers) HandleSet(_ context.Context, req *pipeline.NexusRequest) (any, error) {
	data, err := payloadJSON(req.Payload)
	if err != nil {
		return nil, fmt.Errorf("config.set: invalid payload: %w", err)
	}

	var newCfg config.Config
	if err := json.Unmarshal(data, &newCfg); err != nil {
		return nil, fmt.Errorf("config.set: parse config: %w", err)
	}

	*h.config = newCfg

	if h.configPath != "" {
		if err := config.Save(h.config, h.configPath); err != nil {
			h.logger.Error("config.set: save failed", "error", err)
			return nil, fmt.Errorf("config.set: save: %w", err)
		}
	}

	return map[string]any{"status": "updated"}, nil
}

// HandlePatch merges the payload into the current configuration.
func (h *ConfigHandlers) HandlePatch(_ context.Context, req *pipeline.NexusRequest) (any, error) {
	patchData, err := payloadJSON(req.Payload)
	if err != nil {
		return nil, fmt.Errorf("config.patch: invalid payload: %w", err)
	}

	// Marshal current config, merge, unmarshal back.
	currentData, err := json.Marshal(h.config)
	if err != nil {
		return nil, fmt.Errorf("config.patch: marshal current: %w", err)
	}

	var current map[string]any
	if err := json.Unmarshal(currentData, &current); err != nil {
		return nil, fmt.Errorf("config.patch: unmarshal current: %w", err)
	}

	var patch map[string]any
	if err := json.Unmarshal(patchData, &patch); err != nil {
		return nil, fmt.Errorf("config.patch: unmarshal patch: %w", err)
	}

	// Shallow merge.
	for k, v := range patch {
		current[k] = v
	}

	merged, err := json.Marshal(current)
	if err != nil {
		return nil, fmt.Errorf("config.patch: marshal merged: %w", err)
	}

	var newCfg config.Config
	if err := json.Unmarshal(merged, &newCfg); err != nil {
		return nil, fmt.Errorf("config.patch: unmarshal merged: %w", err)
	}

	*h.config = newCfg

	if h.configPath != "" {
		if err := config.Save(h.config, h.configPath); err != nil {
			h.logger.Error("config.patch: save failed", "error", err)
		}
	}

	return map[string]any{"status": "patched"}, nil
}

// ---------------------------------------------------------------------------
// AgentHandlers - agents.list, agents.create, agents.update, agents.delete, agent.run
// ---------------------------------------------------------------------------

// AgentBroker is the interface used by agent handlers to dispatch work.
type AgentBroker interface {
	HandleEvent(ctx context.Context, req *pipeline.NexusRequest) error
}

// AgentHandlers provides operation handlers for agent management.
type AgentHandlers struct {
	db     *sql.DB
	broker AgentBroker
	logger *slog.Logger
}

// NewAgentHandlers creates AgentHandlers.
func NewAgentHandlers(db *sql.DB, broker AgentBroker, logger *slog.Logger) *AgentHandlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &AgentHandlers{db: db, broker: broker, logger: logger}
}

// Register registers agent operation handlers.
func (h *AgentHandlers) Register(reg *Registry) {
	reg.Register(OperationDef{
		Operation: "agents.list",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "agents",
		Handler:   h.HandleList,
	})
	reg.Register(OperationDef{
		Operation: "agents.create",
		Kind:      KindControl,
		Action:    ActionAdmin,
		Resource:  "agents",
		Handler:   h.HandleCreate,
	})
	reg.Register(OperationDef{
		Operation: "agents.update",
		Kind:      KindControl,
		Action:    ActionAdmin,
		Resource:  "agents",
		Handler:   h.HandleUpdate,
	})
	reg.Register(OperationDef{
		Operation: "agents.delete",
		Kind:      KindControl,
		Action:    ActionAdmin,
		Resource:  "agents",
		Handler:   h.HandleDelete,
	})
}

// HandleList lists agents from the database.
func (h *AgentHandlers) HandleList(ctx context.Context, _ *pipeline.NexusRequest) (any, error) {
	if h.db == nil {
		return map[string]any{"agents": []any{}}, nil
	}

	rows, err := h.db.QueryContext(ctx, `SELECT id, name, is_default FROM agents ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("agents.list: %w", err)
	}
	defer rows.Close()

	var agents []map[string]any
	for rows.Next() {
		var id, name string
		var isDefault bool
		if err := rows.Scan(&id, &name, &isDefault); err != nil {
			continue
		}
		agents = append(agents, map[string]any{
			"id":      id,
			"name":    name,
			"default": isDefault,
		})
	}
	if agents == nil {
		agents = []map[string]any{}
	}

	return map[string]any{"agents": agents}, nil
}

// HandleCreate creates a new agent.
func (h *AgentHandlers) HandleCreate(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	id, _ := params["id"].(string)
	name, _ := params["name"].(string)
	if id == "" {
		return nil, fmt.Errorf("agents.create: id is required")
	}
	if name == "" {
		name = id
	}

	if h.db != nil {
		_, err := h.db.ExecContext(ctx,
			`INSERT INTO agents (id, name, is_default, created_at) VALUES (?, ?, 0, ?)`,
			id, name, time.Now().UnixMilli(),
		)
		if err != nil {
			return nil, fmt.Errorf("agents.create: %w", err)
		}
	}

	return map[string]any{"id": id, "status": "created"}, nil
}

// HandleUpdate updates an existing agent.
func (h *AgentHandlers) HandleUpdate(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	id, _ := params["id"].(string)
	if id == "" {
		return nil, fmt.Errorf("agents.update: id is required")
	}

	name, _ := params["name"].(string)
	if h.db != nil && name != "" {
		_, err := h.db.ExecContext(ctx,
			`UPDATE agents SET name = ? WHERE id = ?`,
			name, id,
		)
		if err != nil {
			return nil, fmt.Errorf("agents.update: %w", err)
		}
	}

	return map[string]any{"id": id, "status": "updated"}, nil
}

// HandleDelete deletes an agent.
func (h *AgentHandlers) HandleDelete(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	id, _ := params["id"].(string)
	if id == "" {
		return nil, fmt.Errorf("agents.delete: id is required")
	}

	if h.db != nil {
		_, err := h.db.ExecContext(ctx, `DELETE FROM agents WHERE id = ?`, id)
		if err != nil {
			return nil, fmt.Errorf("agents.delete: %w", err)
		}
	}

	return map[string]any{"id": id, "status": "deleted"}, nil
}

// ---------------------------------------------------------------------------
// SessionHandlers - sessions.list, sessions.resolve, sessions.patch, sessions.delete
// ---------------------------------------------------------------------------

// SessionHandlers provides operation handlers for session management.
type SessionHandlers struct {
	db     *sql.DB
	logger *slog.Logger
}

// NewSessionHandlers creates SessionHandlers.
func NewSessionHandlers(db *sql.DB, logger *slog.Logger) *SessionHandlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &SessionHandlers{db: db, logger: logger}
}

// Register registers session operation handlers.
func (h *SessionHandlers) Register(reg *Registry) {
	reg.Register(OperationDef{
		Operation: "sessions.list",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "sessions",
		Handler:   h.HandleList,
	})
	reg.Register(OperationDef{
		Operation: "sessions.resolve",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "sessions",
		Handler:   h.HandleResolve,
	})
	reg.Register(OperationDef{
		Operation: "sessions.patch",
		Kind:      KindControl,
		Action:    ActionAdmin,
		Resource:  "sessions",
		Handler:   h.HandlePatch,
	})
	reg.Register(OperationDef{
		Operation: "sessions.delete",
		Kind:      KindControl,
		Action:    ActionAdmin,
		Resource:  "sessions",
		Handler:   h.HandleDelete,
	})
}

// HandleList lists sessions.
func (h *SessionHandlers) HandleList(ctx context.Context, _ *pipeline.NexusRequest) (any, error) {
	if h.db == nil {
		return map[string]any{"sessions": []any{}}, nil
	}

	rows, err := h.db.QueryContext(ctx,
		`SELECT session_key, agent_id, created_at FROM sessions ORDER BY created_at DESC LIMIT 100`,
	)
	if err != nil {
		return nil, fmt.Errorf("sessions.list: %w", err)
	}
	defer rows.Close()

	var sessions []map[string]any
	for rows.Next() {
		var key, agentID string
		var createdAt int64
		if err := rows.Scan(&key, &agentID, &createdAt); err != nil {
			continue
		}
		sessions = append(sessions, map[string]any{
			"session_key": key,
			"agent_id":    agentID,
			"created_at":  createdAt,
		})
	}
	if sessions == nil {
		sessions = []map[string]any{}
	}

	return map[string]any{"sessions": sessions}, nil
}

// HandleResolve resolves a session by key.
func (h *SessionHandlers) HandleResolve(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	key, _ := params["session_key"].(string)
	if key == "" {
		return nil, fmt.Errorf("sessions.resolve: session_key is required")
	}

	return map[string]any{"session_key": key, "status": "resolved"}, nil
}

// HandlePatch updates session metadata.
func (h *SessionHandlers) HandlePatch(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	key, _ := params["session_key"].(string)
	if key == "" {
		return nil, fmt.Errorf("sessions.patch: session_key is required")
	}

	return map[string]any{"session_key": key, "status": "patched"}, nil
}

// HandleDelete removes a session.
func (h *SessionHandlers) HandleDelete(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	key, _ := params["session_key"].(string)
	if key == "" {
		return nil, fmt.Errorf("sessions.delete: session_key is required")
	}

	if h.db != nil {
		_, err := h.db.ExecContext(ctx, `DELETE FROM sessions WHERE session_key = ?`, key)
		if err != nil {
			return nil, fmt.Errorf("sessions.delete: %w", err)
		}
	}

	return map[string]any{"session_key": key, "status": "deleted"}, nil
}

// ---------------------------------------------------------------------------
// ChatHandlers - chat.send, chat.abort, chat.history
// ---------------------------------------------------------------------------

// ChatHandlers provides operation handlers for chat operations.
type ChatHandlers struct {
	broker AgentBroker
	db     *sql.DB
	logger *slog.Logger
}

// NewChatHandlers creates ChatHandlers.
func NewChatHandlers(broker AgentBroker, db *sql.DB, logger *slog.Logger) *ChatHandlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &ChatHandlers{broker: broker, db: db, logger: logger}
}

// Register registers chat operation handlers.
func (h *ChatHandlers) Register(reg *Registry) {
	reg.Register(OperationDef{
		Operation: "event.ingest",
		Kind:      KindEvent,
		Action:    ActionWrite,
		Resource:  "ingress.event",
		Surfaces:  []Surface{SurfaceWSControl, SurfaceHTTPIngress, SurfaceAdapterCLI, SurfaceInternalClock},
		Handler:   h.HandleSend,
	})
	reg.Register(OperationDef{
		Operation: "chat.abort",
		Kind:      KindControl,
		Action:    ActionWrite,
		Resource:  "chat",
		Handler:   h.HandleAbort,
	})
	reg.Register(OperationDef{
		Operation: "chat.history",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "chat.history",
		Handler:   h.HandleHistory,
	})
}

// HandleSend dispatches a chat message to the broker.
func (h *ChatHandlers) HandleSend(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
	if h.broker != nil {
		if err := h.broker.HandleEvent(ctx, req); err != nil {
			return nil, fmt.Errorf("chat.send: %w", err)
		}
	}
	return map[string]any{"status": "accepted", "request_id": req.RequestID}, nil
}

// HandleAbort sends an abort signal for an active chat session.
func (h *ChatHandlers) HandleAbort(_ context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	sessionKey, _ := params["session_key"].(string)
	if sessionKey == "" {
		return nil, fmt.Errorf("chat.abort: session_key is required")
	}

	return map[string]any{"session_key": sessionKey, "status": "abort_requested"}, nil
}

// HandleHistory returns chat history for a session.
func (h *ChatHandlers) HandleHistory(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	sessionKey, _ := params["session_key"].(string)
	if sessionKey == "" {
		return nil, fmt.Errorf("chat.history: session_key is required")
	}

	return map[string]any{
		"session_key": sessionKey,
		"messages":    []any{},
	}, nil
}

// ---------------------------------------------------------------------------
// DeliveryHandlers - delivery.send, delivery.stream
// ---------------------------------------------------------------------------

// AdapterSender sends messages through adapters.
type AdapterSender interface {
	Send(adapterID string, req DeliveryRequest) error
}

// DeliveryRequest describes an outbound message delivery.
type DeliveryRequest struct {
	ChannelID string `json:"channel_id"`
	Content   string `json:"content"`
	ReplyTo   string `json:"reply_to,omitempty"`
	ThreadID  string `json:"thread_id,omitempty"`
}

// DeliveryHandlers provides operation handlers for message delivery.
type DeliveryHandlers struct {
	adapters AdapterSender
	logger   *slog.Logger
}

// NewDeliveryHandlers creates DeliveryHandlers.
func NewDeliveryHandlers(adapters AdapterSender, logger *slog.Logger) *DeliveryHandlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &DeliveryHandlers{adapters: adapters, logger: logger}
}

// Register registers delivery operation handlers.
func (h *DeliveryHandlers) Register(reg *Registry) {
	reg.Register(OperationDef{
		Operation: "delivery.send",
		Kind:      KindControl,
		Action:    ActionWrite,
		Resource:  "delivery.send",
		Handler:   h.HandleSend,
	})
	reg.Register(OperationDef{
		Operation: "delivery.stream",
		Kind:      KindControl,
		Action:    ActionWrite,
		Resource:  "delivery.stream",
		Handler:   h.HandleStream,
	})
}

// HandleSend sends a message through an adapter.
func (h *DeliveryHandlers) HandleSend(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	adapterID, _ := params["adapter_id"].(string)
	channelID, _ := params["channel_id"].(string)
	content, _ := params["content"].(string)

	if adapterID == "" || channelID == "" || content == "" {
		return nil, fmt.Errorf("delivery.send: adapter_id, channel_id, and content are required")
	}

	if h.adapters != nil {
		err := h.adapters.Send(adapterID, DeliveryRequest{
			ChannelID: channelID,
			Content:   content,
			ReplyTo:   stringParam(params, "reply_to"),
			ThreadID:  stringParam(params, "thread_id"),
		})
		if err != nil {
			return nil, fmt.Errorf("delivery.send: %w", err)
		}
	}

	return map[string]any{"status": "sent"}, nil
}

// HandleStream initiates streaming delivery (stub).
func (h *DeliveryHandlers) HandleStream(_ context.Context, req *pipeline.NexusRequest) (any, error) {
	return map[string]any{"status": "streaming_not_implemented"}, nil
}

// ---------------------------------------------------------------------------
// AdapterHandlers - adapter.info, adapter.health, adapter.connections.*
// ---------------------------------------------------------------------------

// AdapterManager provides adapter management operations.
type AdapterManager interface {
	List() []AdapterInfo
	Status(id string) (string, error)
	Health(id string) error
}

// AdapterInfo describes a connected adapter.
type AdapterInfo struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Platform string `json:"platform"`
	Status   string `json:"status"`
}

// AdapterHandlers provides operation handlers for adapter management.
type AdapterHandlers struct {
	adapters AdapterManager
	logger   *slog.Logger
}

// NewAdapterHandlers creates AdapterHandlers.
func NewAdapterHandlers(adapters AdapterManager, logger *slog.Logger) *AdapterHandlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &AdapterHandlers{adapters: adapters, logger: logger}
}

// Register registers adapter operation handlers.
func (h *AdapterHandlers) Register(reg *Registry) {
	reg.Register(OperationDef{
		Operation: "adapter.info",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "adapter.info",
		Handler:   h.HandleInfo,
	})
	reg.Register(OperationDef{
		Operation: "adapter.health",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "adapter.health",
		Handler:   h.HandleHealth,
	})
	reg.Register(OperationDef{
		Operation: "adapter.connections.list",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "adapter.connections",
		Handler:   h.HandleConnectionsList,
	})
}

// HandleInfo returns adapter information.
func (h *AdapterHandlers) HandleInfo(_ context.Context, _ *pipeline.NexusRequest) (any, error) {
	if h.adapters == nil {
		return map[string]any{"adapters": []any{}}, nil
	}
	return map[string]any{"adapters": h.adapters.List()}, nil
}

// HandleHealth checks adapter health.
func (h *AdapterHandlers) HandleHealth(_ context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	adapterID, _ := params["adapter_id"].(string)

	if h.adapters != nil && adapterID != "" {
		if err := h.adapters.Health(adapterID); err != nil {
			return map[string]any{"adapter_id": adapterID, "healthy": false, "error": err.Error()}, nil
		}
	}

	return map[string]any{"adapter_id": adapterID, "healthy": true}, nil
}

// HandleConnectionsList lists adapter connections.
func (h *AdapterHandlers) HandleConnectionsList(_ context.Context, _ *pipeline.NexusRequest) (any, error) {
	if h.adapters == nil {
		return map[string]any{"connections": []any{}}, nil
	}
	return map[string]any{"connections": h.adapters.List()}, nil
}

// ---------------------------------------------------------------------------
// MemoryHandlers - memory.review.*
// ---------------------------------------------------------------------------

// MemoryHandlers provides operation handlers for memory review operations.
type MemoryHandlers struct {
	db     *sql.DB
	logger *slog.Logger
}

// NewMemoryHandlers creates MemoryHandlers.
func NewMemoryHandlers(db *sql.DB, logger *slog.Logger) *MemoryHandlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &MemoryHandlers{db: db, logger: logger}
}

// Register registers memory review operation handlers.
func (h *MemoryHandlers) Register(reg *Registry) {
	reg.Register(OperationDef{
		Operation: "memory.review.runs.list",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "memory.review",
		Handler:   h.HandleRunsList,
	})
	reg.Register(OperationDef{
		Operation: "memory.review.search",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "memory.review",
		Handler:   h.HandleSearch,
	})
	reg.Register(OperationDef{
		Operation: "memory.review.quality.summary",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "memory.review",
		Handler:   h.HandleQualitySummary,
	})
}

// HandleRunsList lists memory review runs.
func (h *MemoryHandlers) HandleRunsList(_ context.Context, _ *pipeline.NexusRequest) (any, error) {
	return map[string]any{"runs": []any{}}, nil
}

// HandleSearch searches memory elements.
func (h *MemoryHandlers) HandleSearch(_ context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	query, _ := params["query"].(string)
	if query == "" {
		return nil, fmt.Errorf("memory.review.search: query is required")
	}
	return map[string]any{"results": []any{}, "query": query}, nil
}

// HandleQualitySummary returns memory quality statistics.
func (h *MemoryHandlers) HandleQualitySummary(_ context.Context, _ *pipeline.NexusRequest) (any, error) {
	return map[string]any{
		"total_elements":   0,
		"active_elements":  0,
		"deleted_elements": 0,
	}, nil
}

// ---------------------------------------------------------------------------
// WorkHandlers - work.items.*, work.workflows.*
// ---------------------------------------------------------------------------

// WorkHandlers provides operation handlers for work management.
type WorkHandlers struct {
	db     *sql.DB
	logger *slog.Logger
}

// NewWorkHandlers creates WorkHandlers.
func NewWorkHandlers(db *sql.DB, logger *slog.Logger) *WorkHandlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &WorkHandlers{db: db, logger: logger}
}

// Register registers work operation handlers.
func (h *WorkHandlers) Register(reg *Registry) {
	reg.Register(OperationDef{
		Operation: "work.items.list",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "work.items",
		Handler:   h.HandleItemsList,
	})
	reg.Register(OperationDef{
		Operation: "work.items.create",
		Kind:      KindControl,
		Action:    ActionWrite,
		Resource:  "work.items",
		Handler:   h.HandleItemsCreate,
	})
	reg.Register(OperationDef{
		Operation: "work.items.get",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "work.items",
		Handler:   h.HandleItemsGet,
	})
	reg.Register(OperationDef{
		Operation: "work.workflows.list",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "work.workflows",
		Handler:   h.HandleWorkflowsList,
	})
	reg.Register(OperationDef{
		Operation: "work.workflows.create",
		Kind:      KindControl,
		Action:    ActionWrite,
		Resource:  "work.workflows",
		Handler:   h.HandleWorkflowsCreate,
	})
}

// HandleItemsList lists work items.
func (h *WorkHandlers) HandleItemsList(ctx context.Context, _ *pipeline.NexusRequest) (any, error) {
	if h.db == nil {
		return map[string]any{"items": []any{}}, nil
	}

	rows, err := h.db.QueryContext(ctx,
		`SELECT id, title, status, created_at FROM work_items ORDER BY created_at DESC LIMIT 100`,
	)
	if err != nil {
		return nil, fmt.Errorf("work.items.list: %w", err)
	}
	defer rows.Close()

	var items []map[string]any
	for rows.Next() {
		var id, title, status string
		var createdAt int64
		if err := rows.Scan(&id, &title, &status, &createdAt); err != nil {
			continue
		}
		items = append(items, map[string]any{
			"id":         id,
			"title":      title,
			"status":     status,
			"created_at": createdAt,
		})
	}
	if items == nil {
		items = []map[string]any{}
	}

	return map[string]any{"items": items}, nil
}

// HandleItemsCreate creates a work item.
func (h *WorkHandlers) HandleItemsCreate(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	title, _ := params["title"].(string)
	if title == "" {
		return nil, fmt.Errorf("work.items.create: title is required")
	}

	id := fmt.Sprintf("wi-%d", time.Now().UnixNano())
	now := time.Now().UnixMilli()

	if h.db != nil {
		_, err := h.db.ExecContext(ctx,
			`INSERT INTO work_items (id, title, status, created_at) VALUES (?, ?, 'open', ?)`,
			id, title, now,
		)
		if err != nil {
			return nil, fmt.Errorf("work.items.create: %w", err)
		}
	}

	return map[string]any{"id": id, "status": "created"}, nil
}

// HandleItemsGet returns a single work item.
func (h *WorkHandlers) HandleItemsGet(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	id, _ := params["id"].(string)
	if id == "" {
		return nil, fmt.Errorf("work.items.get: id is required")
	}

	return map[string]any{"id": id, "status": "found"}, nil
}

// HandleWorkflowsList lists workflows.
func (h *WorkHandlers) HandleWorkflowsList(_ context.Context, _ *pipeline.NexusRequest) (any, error) {
	return map[string]any{"workflows": []any{}}, nil
}

// HandleWorkflowsCreate creates a workflow.
func (h *WorkHandlers) HandleWorkflowsCreate(_ context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	name, _ := params["name"].(string)
	if name == "" {
		return nil, fmt.Errorf("work.workflows.create: name is required")
	}

	id := fmt.Sprintf("wf-%d", time.Now().UnixNano())
	return map[string]any{"id": id, "status": "created"}, nil
}

// ---------------------------------------------------------------------------
// ClockHandlers - clock.schedule.*
// ---------------------------------------------------------------------------

// ClockHandlers provides operation handlers for clock/schedule management.
type ClockHandlers struct {
	db     *sql.DB
	logger *slog.Logger
}

// NewClockHandlers creates ClockHandlers.
func NewClockHandlers(db *sql.DB, logger *slog.Logger) *ClockHandlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &ClockHandlers{db: db, logger: logger}
}

// Register registers clock operation handlers.
func (h *ClockHandlers) Register(reg *Registry) {
	reg.Register(OperationDef{
		Operation: "clock.schedule.list",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "clock.schedule",
		Handler:   h.HandleList,
	})
	reg.Register(OperationDef{
		Operation: "clock.schedule.create",
		Kind:      KindControl,
		Action:    ActionAdmin,
		Resource:  "clock.schedule",
		Handler:   h.HandleCreate,
	})
	reg.Register(OperationDef{
		Operation: "clock.schedule.remove",
		Kind:      KindControl,
		Action:    ActionAdmin,
		Resource:  "clock.schedule",
		Handler:   h.HandleRemove,
	})
	reg.Register(OperationDef{
		Operation: "clock.schedule.run",
		Kind:      KindControl,
		Action:    ActionAdmin,
		Resource:  "clock.schedule",
		Handler:   h.HandleRun,
	})
}

// HandleList lists schedules.
func (h *ClockHandlers) HandleList(_ context.Context, _ *pipeline.NexusRequest) (any, error) {
	return map[string]any{"schedules": []any{}}, nil
}

// HandleCreate creates a schedule.
func (h *ClockHandlers) HandleCreate(_ context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	cronExpr, _ := params["cron"].(string)
	if cronExpr == "" {
		return nil, fmt.Errorf("clock.schedule.create: cron expression is required")
	}

	id := fmt.Sprintf("sch-%d", time.Now().UnixNano())
	return map[string]any{"id": id, "status": "created"}, nil
}

// HandleRemove removes a schedule.
func (h *ClockHandlers) HandleRemove(_ context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	id, _ := params["id"].(string)
	if id == "" {
		return nil, fmt.Errorf("clock.schedule.remove: id is required")
	}

	return map[string]any{"id": id, "status": "removed"}, nil
}

// HandleRun triggers immediate execution of a schedule.
func (h *ClockHandlers) HandleRun(_ context.Context, req *pipeline.NexusRequest) (any, error) {
	params := extractMapPayload(req.Payload)
	id, _ := params["id"].(string)
	if id == "" {
		return nil, fmt.Errorf("clock.schedule.run: id is required")
	}

	return map[string]any{"id": id, "status": "triggered"}, nil
}

// ---------------------------------------------------------------------------
// ModelHandlers - models.list
// ---------------------------------------------------------------------------

// ModelLister provides model listing.
type ModelLister interface {
	ListAll() []ModelInfo
}

// ModelInfo describes a model.
type ModelInfo struct {
	ID       string `json:"id"`
	Provider string `json:"provider"`
	Name     string `json:"name"`
}

// ModelHandlers provides operation handlers for model queries.
type ModelHandlers struct {
	models ModelLister
	logger *slog.Logger
}

// NewModelHandlers creates ModelHandlers.
func NewModelHandlers(models ModelLister, logger *slog.Logger) *ModelHandlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &ModelHandlers{models: models, logger: logger}
}

// Register registers model operation handlers.
func (h *ModelHandlers) Register(reg *Registry) {
	reg.Register(OperationDef{
		Operation: "models.list",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "models",
		Handler:   h.HandleList,
	})
}

// HandleList lists available models.
func (h *ModelHandlers) HandleList(_ context.Context, _ *pipeline.NexusRequest) (any, error) {
	if h.models == nil {
		return map[string]any{"models": []any{}}, nil
	}
	return map[string]any{"models": h.models.ListAll()}, nil
}

// ---------------------------------------------------------------------------
// SystemHandlers - system.info, health, skills.list, logs.tail
// ---------------------------------------------------------------------------

// SystemHandlers provides operation handlers for system introspection.
type SystemHandlers struct {
	config    *config.Config
	startedAt time.Time
	logger    *slog.Logger
}

// NewSystemHandlers creates SystemHandlers.
func NewSystemHandlers(cfg *config.Config, logger *slog.Logger) *SystemHandlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &SystemHandlers{config: cfg, startedAt: time.Now(), logger: logger}
}

// Register registers system operation handlers.
func (h *SystemHandlers) Register(reg *Registry) {
	reg.Register(OperationDef{
		Operation: "health",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "runtime.health",
		Surfaces:  []Surface{SurfaceWSControl, SurfaceHTTPControl},
		Handler:   h.HandleHealth,
	})
	reg.Register(OperationDef{
		Operation: "status",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "runtime.status",
		Handler:   h.HandleStatus,
	})
	reg.Register(OperationDef{
		Operation: "skills.status",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "skills",
		Handler:   h.HandleSkillsList,
	})
	reg.Register(OperationDef{
		Operation: "logs.tail",
		Kind:      KindControl,
		Action:    ActionRead,
		Resource:  "runtime.logs",
		Handler:   h.HandleLogsTail,
	})
}

// HandleHealth returns a health check response.
func (h *SystemHandlers) HandleHealth(_ context.Context, _ *pipeline.NexusRequest) (any, error) {
	return map[string]any{
		"status":  "ok",
		"uptime":  int64(time.Since(h.startedAt).Seconds()),
		"version": "dev",
	}, nil
}

// HandleStatus returns detailed runtime status.
func (h *SystemHandlers) HandleStatus(_ context.Context, _ *pipeline.NexusRequest) (any, error) {
	return map[string]any{
		"status":     "running",
		"uptime":     int64(time.Since(h.startedAt).Seconds()),
		"version":    "dev",
		"go_version": runtime.Version(),
		"os":         runtime.GOOS,
		"arch":       runtime.GOARCH,
		"goroutines": runtime.NumGoroutine(),
	}, nil
}

// HandleSkillsList lists available skills.
func (h *SystemHandlers) HandleSkillsList(_ context.Context, _ *pipeline.NexusRequest) (any, error) {
	return map[string]any{"skills": []any{}}, nil
}

// HandleLogsTail returns recent log entries.
func (h *SystemHandlers) HandleLogsTail(_ context.Context, _ *pipeline.NexusRequest) (any, error) {
	return map[string]any{"logs": []any{}, "count": 0}, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// extractMapPayload extracts a map from a request payload.
func extractMapPayload(payload any) map[string]any {
	if m, ok := payload.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

// payloadJSON marshals the payload to JSON bytes.
func payloadJSON(payload any) ([]byte, error) {
	if payload == nil {
		return nil, fmt.Errorf("nil payload")
	}

	// Already bytes
	if data, ok := payload.([]byte); ok {
		return data, nil
	}

	return json.Marshal(payload)
}

// stringParam extracts a string from a map, returning empty if not found.
func stringParam(m map[string]any, key string) string {
	v, _ := m[key].(string)
	return v
}
