package operations

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/Napageneral/nexus/internal/db"
	"github.com/Napageneral/nexus/internal/pipeline"
)

// ---------------------------------------------------------------------------
// EventBroker interface - implemented by broker.Broker
// ---------------------------------------------------------------------------

// EventBroker is the interface for dispatching events to agent sessions.
type EventBroker interface {
	HandleEvent(ctx context.Context, req *pipeline.NexusRequest) error
}

// ---------------------------------------------------------------------------
// EventHandlers
// ---------------------------------------------------------------------------

// EventHandlers holds operation handlers for event operations.
type EventHandlers struct {
	ledgers *db.Ledgers
	broker  EventBroker
	logger  *slog.Logger
}

// NewEventHandlers creates EventHandlers wired to the given ledgers and broker.
func NewEventHandlers(ledgers *db.Ledgers, broker EventBroker, logger *slog.Logger) *EventHandlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &EventHandlers{
		ledgers: ledgers,
		broker:  broker,
		logger:  logger,
	}
}

// Register registers event operation handlers on the given registry.
func (h *EventHandlers) Register(reg *Registry) {
	reg.Register(OperationDef{
		Operation: "event.ingest",
		Kind:      KindEvent,
		Action:    ActionWrite,
		Resource:  "ingress.event",
		Surfaces:  []Surface{SurfaceWSControl, SurfaceHTTPIngress, SurfaceAdapterCLI, SurfaceInternalClock},
		Handler:   h.HandleIngest,
	})
}

// HandleIngest handles the event.ingest operation:
//  1. Persist the event to events.db
//  2. Dispatch to the broker for agent processing
//  3. Return an acknowledgement
func (h *EventHandlers) HandleIngest(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
	h.logger.Debug("event.ingest received",
		"request_id", req.RequestID,
		"adapter", req.Routing.Adapter,
		"sender", req.Routing.Sender.ID,
	)

	// 1. Persist event to events.db
	if err := h.persistEvent(ctx, req); err != nil {
		h.logger.Error("event.ingest: persist failed",
			"request_id", req.RequestID,
			"error", err)
		return nil, fmt.Errorf("persist event: %w", err)
	}

	// 2. Dispatch to broker
	if h.broker != nil {
		if err := h.broker.HandleEvent(ctx, req); err != nil {
			h.logger.Error("event.ingest: broker dispatch failed",
				"request_id", req.RequestID,
				"error", err)
			return nil, fmt.Errorf("broker dispatch: %w", err)
		}
	}

	// 3. Return acknowledgement
	return map[string]any{
		"status":     "accepted",
		"request_id": req.RequestID,
	}, nil
}

// persistEvent stores the event in events.db.
func (h *EventHandlers) persistEvent(ctx context.Context, req *pipeline.NexusRequest) error {
	if h.ledgers == nil || h.ledgers.Events == nil {
		return nil
	}

	now := time.Now().UnixMilli()
	eventID := req.RequestID

	content := ""
	contentType := "text"
	var timestamp int64

	// Extract fields from the payload.
	switch p := req.Payload.(type) {
	case *pipeline.EventPayload:
		eventID = p.ID
		if eventID == "" {
			eventID = req.RequestID
		}
		content = p.Content
		contentType = string(p.ContentType)
		timestamp = p.Timestamp
	case pipeline.EventPayload:
		eventID = p.ID
		if eventID == "" {
			eventID = req.RequestID
		}
		content = p.Content
		contentType = string(p.ContentType)
		timestamp = p.Timestamp
	case map[string]any:
		if c, ok := p["content"].(string); ok {
			content = c
		}
		if id, ok := p["id"].(string); ok && id != "" {
			eventID = id
		}
	}

	if timestamp == 0 {
		timestamp = now
	}

	metadataJSON := "{}"
	if req.Routing.Metadata != nil {
		if data, err := json.Marshal(req.Routing.Metadata); err == nil {
			metadataJSON = string(data)
		}
	}

	const q = `INSERT OR IGNORE INTO events
		(id, adapter_id, platform, content_type, space_id, space_name,
		 container_kind, container_id, container_name, thread_id,
		 sender_id, sender_name, sender_avatar, receiver_id, receiver_name,
		 content, timestamp, reply_to_id, metadata)
		VALUES (?, ?, ?, ?, ?, ?,
		        ?, ?, ?, ?,
		        ?, ?, ?, ?, ?,
		        ?, ?, ?, ?)`

	_, err := h.ledgers.Events.ExecContext(ctx, q,
		eventID,
		req.Routing.Adapter,
		req.Routing.Platform,
		contentType,
		req.Routing.SpaceID,
		req.Routing.SpaceName,
		string(req.Routing.ContainerKind),
		req.Routing.ContainerID,
		req.Routing.ContainerName,
		req.Routing.ThreadID,
		req.Routing.Sender.ID,
		req.Routing.Sender.Name,
		req.Routing.Sender.AvatarURL,
		req.Routing.Receiver.ID,
		req.Routing.Receiver.Name,
		content,
		timestamp,
		req.Routing.ReplyToID,
		metadataJSON,
	)
	return err
}
