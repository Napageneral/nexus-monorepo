package nexadapter

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
)

// ControlSession manages adapter.control.start frame IO.
type ControlSession struct {
	in  io.Reader
	out io.Writer
	mu  sync.Mutex
}

// NewControlSession creates a control session over JSONL streams.
func NewControlSession(in io.Reader, out io.Writer) *ControlSession {
	if in == nil {
		in = os.Stdin
	}
	if out == nil {
		out = os.Stdout
	}
	return &ControlSession{in: in, out: out}
}

// ControlServeHandlers defines callbacks for incoming runtime frames.
type ControlServeHandlers struct {
	OnInvoke func(ctx context.Context, frame AdapterControlInvokeRequestFrame) (*AdapterControlInvokeResultFrame, error)
	OnCancel func(ctx context.Context, frame AdapterControlInvokeCancelFrame) error
}

// ControlEndpointRegistry tracks endpoint declarations and mirrors changes to runtime.
type ControlEndpointRegistry struct {
	session   *ControlSession
	endpoints map[string]AdapterControlEndpoint
	mu        sync.Mutex
}

// NewControlEndpointRegistry builds a registry for a session.
func NewControlEndpointRegistry(session *ControlSession) *ControlEndpointRegistry {
	return &ControlEndpointRegistry{
		session:   session,
		endpoints: make(map[string]AdapterControlEndpoint),
	}
}

// Upsert registers/updates an endpoint and emits endpoint.upsert.
func (r *ControlEndpointRegistry) Upsert(endpoint AdapterControlEndpoint) error {
	id := strings.TrimSpace(endpoint.EndpointID)
	if id == "" {
		return fmt.Errorf("endpoint_id is required")
	}
	endpoint.EndpointID = id
	r.mu.Lock()
	r.endpoints[id] = endpoint
	r.mu.Unlock()
	return r.session.UpsertEndpoint(endpoint)
}

// Remove unregisters an endpoint and emits endpoint.remove.
func (r *ControlEndpointRegistry) Remove(endpointID string) error {
	id := strings.TrimSpace(endpointID)
	if id == "" {
		return fmt.Errorf("endpoint_id is required")
	}
	r.mu.Lock()
	delete(r.endpoints, id)
	r.mu.Unlock()
	return r.session.RemoveEndpoint(id)
}

// Get fetches a registered endpoint.
func (r *ControlEndpointRegistry) Get(endpointID string) (AdapterControlEndpoint, bool) {
	id := strings.TrimSpace(endpointID)
	r.mu.Lock()
	defer r.mu.Unlock()
	ep, ok := r.endpoints[id]
	return ep, ok
}

// List returns all registered endpoints.
func (r *ControlEndpointRegistry) List() []AdapterControlEndpoint {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]AdapterControlEndpoint, 0, len(r.endpoints))
	for _, ep := range r.endpoints {
		out = append(out, ep)
	}
	return out
}

// UpsertEndpoint emits endpoint.upsert.
func (s *ControlSession) UpsertEndpoint(endpoint AdapterControlEndpoint) error {
	if strings.TrimSpace(endpoint.EndpointID) == "" {
		return fmt.Errorf("endpoint_id is required")
	}
	if endpoint.Caps == nil {
		endpoint.Caps = []string{}
	}
	if endpoint.Commands == nil {
		endpoint.Commands = []string{}
	}
	frame := AdapterControlEndpointUpsertFrame{
		Type:                   "endpoint.upsert",
		AdapterControlEndpoint: endpoint,
	}
	return s.writeFrame(frame)
}

// RemoveEndpoint emits endpoint.remove.
func (s *ControlSession) RemoveEndpoint(endpointID string) error {
	id := strings.TrimSpace(endpointID)
	if id == "" {
		return fmt.Errorf("endpoint_id is required")
	}
	frame := AdapterControlEndpointRemoveFrame{
		Type:       "endpoint.remove",
		EndpointID: id,
	}
	return s.writeFrame(frame)
}

// EmitInvokeResult emits invoke.result.
func (s *ControlSession) EmitInvokeResult(frame AdapterControlInvokeResultFrame) error {
	if strings.TrimSpace(frame.RequestID) == "" {
		return fmt.Errorf("request_id is required")
	}
	if strings.TrimSpace(frame.Type) == "" {
		frame.Type = "invoke.result"
	}
	return s.writeFrame(frame)
}

// EmitRecordIngest emits canonical record.ingest control output.
func (s *ControlSession) EmitRecordIngest(record any) error {
	if record == nil {
		return fmt.Errorf("record is required")
	}
	frame := AdapterControlRecordIngestFrame{
		Type:   "record.ingest",
		Record: record,
	}
	return s.writeFrame(frame)
}

// Serve consumes incoming invoke.* frames and dispatches handlers.
func (s *ControlSession) Serve(ctx context.Context, handlers ControlServeHandlers) error {
	scanner := bufio.NewScanner(s.in)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return nil
		default:
		}
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var envelope struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal([]byte(line), &envelope); err != nil {
			LogError("control session: invalid frame json: %v", err)
			continue
		}

		switch envelope.Type {
		case "invoke.request":
			var req AdapterControlInvokeRequestFrame
			if err := json.Unmarshal([]byte(line), &req); err != nil {
				LogError("control session: invalid invoke.request frame: %v", err)
				continue
			}
			if handlers.OnInvoke == nil {
				continue
			}
			reply, err := handlers.OnInvoke(ctx, req)
			if err != nil {
				_ = s.EmitInvokeResult(AdapterControlInvokeResultFrame{
					Type:      "invoke.result",
					RequestID: req.RequestID,
					OK:        false,
					Error: &AdapterControlInvokeError{
						Message: err.Error(),
					},
				})
				continue
			}
			if reply == nil {
				continue
			}
			if strings.TrimSpace(reply.Type) == "" {
				reply.Type = "invoke.result"
			}
			if strings.TrimSpace(reply.RequestID) == "" {
				reply.RequestID = req.RequestID
			}
			if err := s.EmitInvokeResult(*reply); err != nil {
				return err
			}
		case "invoke.cancel":
			if handlers.OnCancel == nil {
				continue
			}
			var cancel AdapterControlInvokeCancelFrame
			if err := json.Unmarshal([]byte(line), &cancel); err != nil {
				LogError("control session: invalid invoke.cancel frame: %v", err)
				continue
			}
			if err := handlers.OnCancel(ctx, cancel); err != nil {
				return err
			}
		default:
			LogDebug("control session: ignored frame type %q", envelope.Type)
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("control session read error: %w", err)
	}
	return nil
}

func (s *ControlSession) writeFrame(frame any) error {
	data, err := json.Marshal(frame)
	if err != nil {
		return fmt.Errorf("control session marshal: %w", err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := s.out.Write(append(data, '\n')); err != nil {
		return fmt.Errorf("control session write: %w", err)
	}
	return nil
}
