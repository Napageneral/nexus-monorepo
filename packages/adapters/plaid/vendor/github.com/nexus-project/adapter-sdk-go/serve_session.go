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

// ServeSession manages adapter.serve.start frame IO.
type ServeSession struct {
	in  io.Reader
	out io.Writer
	mu  sync.Mutex
}

// NewServeSession creates a serve session over JSONL streams.
func NewServeSession(in io.Reader, out io.Writer) *ServeSession {
	if in == nil {
		in = os.Stdin
	}
	if out == nil {
		out = os.Stdout
	}
	return &ServeSession{in: in, out: out}
}

// ServeHandlers defines callbacks for incoming runtime frames.
type ServeHandlers struct {
	OnInvoke func(ctx context.Context, frame AdapterServeInvokeRequestFrame) (*AdapterServeInvokeResultFrame, error)
	OnCancel func(ctx context.Context, frame AdapterServeInvokeCancelFrame) error
}

// ServeEndpointRegistry tracks endpoint declarations and mirrors changes to runtime.
type ServeEndpointRegistry struct {
	session   *ServeSession
	endpoints map[string]AdapterServeEndpoint
	mu        sync.Mutex
}

// NewServeEndpointRegistry builds a registry for a session.
func NewServeEndpointRegistry(session *ServeSession) *ServeEndpointRegistry {
	return &ServeEndpointRegistry{
		session:   session,
		endpoints: make(map[string]AdapterServeEndpoint),
	}
}

// Upsert registers/updates an endpoint and emits endpoint.upsert.
func (r *ServeEndpointRegistry) Upsert(endpoint AdapterServeEndpoint) error {
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
func (r *ServeEndpointRegistry) Remove(endpointID string) error {
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
func (r *ServeEndpointRegistry) Get(endpointID string) (AdapterServeEndpoint, bool) {
	id := strings.TrimSpace(endpointID)
	r.mu.Lock()
	defer r.mu.Unlock()
	ep, ok := r.endpoints[id]
	return ep, ok
}

// List returns all registered endpoints.
func (r *ServeEndpointRegistry) List() []AdapterServeEndpoint {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]AdapterServeEndpoint, 0, len(r.endpoints))
	for _, ep := range r.endpoints {
		out = append(out, ep)
	}
	return out
}

// UpsertEndpoint emits endpoint.upsert.
func (s *ServeSession) UpsertEndpoint(endpoint AdapterServeEndpoint) error {
	if strings.TrimSpace(endpoint.EndpointID) == "" {
		return fmt.Errorf("endpoint_id is required")
	}
	if endpoint.Caps == nil {
		endpoint.Caps = []string{}
	}
	if endpoint.Commands == nil {
		endpoint.Commands = []string{}
	}
	frame := AdapterServeEndpointUpsertFrame{
		Type:                 "endpoint.upsert",
		AdapterServeEndpoint: endpoint,
	}
	return s.writeFrame(frame)
}

// RemoveEndpoint emits endpoint.remove.
func (s *ServeSession) RemoveEndpoint(endpointID string) error {
	id := strings.TrimSpace(endpointID)
	if id == "" {
		return fmt.Errorf("endpoint_id is required")
	}
	frame := AdapterServeEndpointRemoveFrame{
		Type:       "endpoint.remove",
		EndpointID: id,
	}
	return s.writeFrame(frame)
}

// EmitInvokeResult emits invoke.result.
func (s *ServeSession) EmitInvokeResult(frame AdapterServeInvokeResultFrame) error {
	if strings.TrimSpace(frame.RequestID) == "" {
		return fmt.Errorf("request_id is required")
	}
	if strings.TrimSpace(frame.Type) == "" {
		frame.Type = "invoke.result"
	}
	return s.writeFrame(frame)
}

// EmitRecordIngest emits canonical record.ingest control output.
func (s *ServeSession) EmitRecordIngest(record any) error {
	if record == nil {
		return fmt.Errorf("record is required")
	}
	frame := AdapterServeRecordIngestFrame{
		Type:   "record.ingest",
		Record: record,
	}
	return s.writeFrame(frame)
}

// Serve consumes incoming invoke.* frames and dispatches handlers.
func (s *ServeSession) Serve(ctx context.Context, handlers ServeHandlers) error {
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
			LogError("serve session: invalid frame json: %v", err)
			continue
		}

		switch envelope.Type {
		case "invoke.request":
			var req AdapterServeInvokeRequestFrame
			if err := json.Unmarshal([]byte(line), &req); err != nil {
				LogError("serve session: invalid invoke.request frame: %v", err)
				continue
			}
			if handlers.OnInvoke == nil {
				continue
			}
			reply, err := handlers.OnInvoke(ctx, req)
			if err != nil {
				_ = s.EmitInvokeResult(AdapterServeInvokeResultFrame{
					Type:      "invoke.result",
					RequestID: req.RequestID,
					OK:        false,
					Error: &AdapterServeInvokeError{
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
			var cancel AdapterServeInvokeCancelFrame
			if err := json.Unmarshal([]byte(line), &cancel); err != nil {
				LogError("serve session: invalid invoke.cancel frame: %v", err)
				continue
			}
			if err := handlers.OnCancel(ctx, cancel); err != nil {
				return err
			}
		default:
			LogDebug("serve session: ignored frame type %q", envelope.Type)
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("serve session read error: %w", err)
	}
	return nil
}

func (s *ServeSession) writeFrame(frame any) error {
	data, err := json.Marshal(frame)
	if err != nil {
		return fmt.Errorf("serve session marshal: %w", err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := s.out.Write(append(data, '\n')); err != nil {
		return fmt.Errorf("serve session write: %w", err)
	}
	return nil
}
