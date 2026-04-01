package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

type edgeRuntimeSession struct {
	conn           *websocket.Conn
	ctx            context.Context
	cancel         context.CancelFunc
	writeMu        sync.Mutex
	pendingMu      sync.Mutex
	pending        map[string]chan runtimeResponseFrame
	requestHandler func(context.Context, runtimeRequestFrame) (any, error)
	readyMu        sync.RWMutex
	ready          bool
	readyCh        chan struct{}
	readyOnce      sync.Once
	errCh          chan error
	closeOnce      sync.Once
}

var edgeRequestSeq atomic.Uint64

func newEdgeRuntimeSession(
	ctx context.Context,
	conn *websocket.Conn,
	requestHandler func(context.Context, runtimeRequestFrame) (any, error),
) *edgeRuntimeSession {
	sessionCtx, cancel := context.WithCancel(ctx)
	session := &edgeRuntimeSession{
		conn:           conn,
		ctx:            sessionCtx,
		cancel:         cancel,
		pending:        map[string]chan runtimeResponseFrame{},
		requestHandler: requestHandler,
		readyCh:        make(chan struct{}),
		errCh:          make(chan error, 1),
	}
	go session.closeOnCancel()
	go session.readLoop()
	return session
}

func (s *edgeRuntimeSession) closeOnCancel() {
	<-s.ctx.Done()
	s.closeConn()
}

func (s *edgeRuntimeSession) closeConn() {
	s.closeOnce.Do(func() {
		_ = s.conn.Close()
	})
}

func (s *edgeRuntimeSession) close() {
	s.cancel()
	s.closeConn()
}

func (s *edgeRuntimeSession) setReady(ready bool) {
	s.readyMu.Lock()
	s.ready = ready
	s.readyMu.Unlock()
	if ready {
		s.readyOnce.Do(func() {
			close(s.readyCh)
		})
	}
}

func (s *edgeRuntimeSession) isReady() bool {
	s.readyMu.RLock()
	defer s.readyMu.RUnlock()
	return s.ready
}

func (s *edgeRuntimeSession) call(
	ctx context.Context,
	method string,
	params map[string]any,
) (json.RawMessage, error) {
	if ctx == nil {
		ctx = s.ctx
	}
	reqID := fmt.Sprintf("eve-edge-%d-%d", time.Now().UnixNano(), edgeRequestSeq.Add(1))
	frame := runtimeRequestFrame{
		Type:   "req",
		ID:     reqID,
		Method: method,
		Params: params,
	}

	respCh := make(chan runtimeResponseFrame, 1)
	s.pendingMu.Lock()
	s.pending[reqID] = respCh
	s.pendingMu.Unlock()
	defer s.clearPending(reqID)

	if err := s.writeJSON(ctx, frame); err != nil {
		return nil, err
	}

	tryResponse := func() (json.RawMessage, error, bool) {
		select {
		case response := <-respCh:
			payload, err := decodeRuntimeResponse(method, response)
			return payload, err, true
		default:
			return nil, nil, false
		}
	}

	select {
	case response := <-respCh:
		return decodeRuntimeResponse(method, response)
	case <-ctx.Done():
		if payload, err, ok := s.tryLateResponse(method, respCh, tryResponse); ok {
			return payload, err
		}
		return nil, ctx.Err()
	case <-s.ctx.Done():
		if payload, err, ok := s.tryLateResponse(method, respCh, tryResponse); ok {
			return payload, err
		}
		return nil, context.Canceled
	case err := <-s.errCh:
		if payload, responseErr, ok := s.tryLateResponse(method, respCh, tryResponse); ok {
			return payload, responseErr
		}
		if err != nil {
			return nil, err
		}
		return nil, context.Canceled
	}
}

func (s *edgeRuntimeSession) tryLateResponse(
	method string,
	respCh <-chan runtimeResponseFrame,
	tryNow func() (json.RawMessage, error, bool),
) (json.RawMessage, error, bool) {
	if payload, err, ok := tryNow(); ok {
		return payload, err, true
	}
	timer := time.NewTimer(1 * time.Second)
	defer timer.Stop()
	select {
	case response := <-respCh:
		payload, err := decodeRuntimeResponse(method, response)
		return payload, err, true
	case <-timer.C:
		return nil, nil, false
	}
}

func decodeRuntimeResponse(method string, response runtimeResponseFrame) (json.RawMessage, error) {
	if !response.OK {
		message := "runtime request failed"
		if response.Error != nil && strings.TrimSpace(response.Error.Message) != "" {
			message = response.Error.Message
		}
		return nil, fmt.Errorf("%s: %s", method, message)
	}
	return response.Payload, nil
}

func (s *edgeRuntimeSession) writeJSON(ctx context.Context, frame runtimeRequestFrame) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if err := s.conn.SetWriteDeadline(time.Now().Add(runtimeRequestTimeout)); err != nil {
		return err
	}
	if ctx != nil {
		if deadline, ok := ctx.Deadline(); ok {
			if err := s.conn.SetWriteDeadline(deadline); err != nil {
				return err
			}
		}
	}
	return s.conn.WriteJSON(frame)
}

func (s *edgeRuntimeSession) writeResponse(
	ctx context.Context,
	id string,
	ok bool,
	payload any,
	errShape *runtimeErrorShape,
) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if err := s.conn.SetWriteDeadline(time.Now().Add(runtimeRequestTimeout)); err != nil {
		return err
	}
	var raw json.RawMessage
	if payload != nil {
		body, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		raw = body
	}
	frame := runtimeResponseFrame{
		Type:    "res",
		ID:      id,
		OK:      ok,
		Payload: raw,
		Error:   errShape,
	}
	if ctx != nil {
		if deadline, ok := ctx.Deadline(); ok {
			if err := s.conn.SetWriteDeadline(deadline); err != nil {
				return err
			}
		}
	}
	return s.conn.WriteJSON(frame)
}

func (s *edgeRuntimeSession) clearPending(id string) {
	s.pendingMu.Lock()
	delete(s.pending, id)
	s.pendingMu.Unlock()
}

func (s *edgeRuntimeSession) readLoop() {
	defer s.cancel()
	for {
		_, payload, err := s.conn.ReadMessage()
		if err != nil {
			if s.ctx.Err() == nil && !errors.Is(err, context.Canceled) {
				select {
				case s.errCh <- err:
				default:
				}
			}
			return
		}

		var envelope map[string]any
		if err := json.Unmarshal(payload, &envelope); err != nil {
			continue
		}

		frameType := strings.TrimSpace(stringFromAny(envelope["type"]))
		switch frameType {
		case "res":
			var response runtimeResponseFrame
			if err := json.Unmarshal(payload, &response); err != nil {
				continue
			}
			id := strings.TrimSpace(response.ID)
			if id == "" {
				continue
			}
			s.pendingMu.Lock()
			respCh := s.pending[id]
			delete(s.pending, id)
			s.pendingMu.Unlock()
			if respCh == nil {
				continue
			}
			select {
			case respCh <- response:
			default:
			}
		case "req":
			var request runtimeRequestFrame
			if err := json.Unmarshal(payload, &request); err != nil {
				continue
			}
			if strings.TrimSpace(request.ID) == "" || strings.TrimSpace(request.Method) == "" {
				continue
			}
			go s.handleServerRequest(request)
		}
	}
}

func (s *edgeRuntimeSession) handleServerRequest(request runtimeRequestFrame) {
	ctx := s.ctx
	if !s.isReady() {
		select {
		case <-s.readyCh:
		case <-ctx.Done():
			return
		case <-time.After(time.Second):
			_ = s.writeResponse(
				ctx,
				request.ID,
				false,
				nil,
				&runtimeErrorShape{Message: "paired edge session is not ready"},
			)
			return
		}
	}

	if s.requestHandler == nil {
		_ = s.writeResponse(
			ctx,
			request.ID,
			false,
			nil,
			&runtimeErrorShape{Message: "no paired edge request handler configured"},
		)
		return
	}

	payload, err := s.requestHandler(ctx, request)
	if err != nil {
		_ = s.writeResponse(
			ctx,
			request.ID,
			false,
			nil,
			&runtimeErrorShape{Message: err.Error()},
		)
		return
	}

	_ = s.writeResponse(ctx, request.ID, true, payload, nil)
}
