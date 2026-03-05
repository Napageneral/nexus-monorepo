package broker

import (
	"context"
	"strings"
	"sync"

	"github.com/google/uuid"
)

// BrokerExecutionResult is the terminal outcome for a stream-backed execution.
type BrokerExecutionResult struct {
	Turn *TurnResult
	Err  error
}

// BrokerExecution represents one asynchronous execution with a live stream.
type BrokerExecution struct {
	RunID  string
	Stream *BrokerStreamHandle
	Result <-chan BrokerExecutionResult
}

// BrokerStreamHandle provides stream fanout, abort, and lifecycle state.
type BrokerStreamHandle struct {
	mu sync.Mutex

	nextID      int
	subscribers map[int]func(AgentEvent)
	history     []AgentEvent
	streaming   bool
	compacting  bool
	abort       context.CancelFunc
}

func newBrokerStreamHandle(abort context.CancelFunc) *BrokerStreamHandle {
	return &BrokerStreamHandle{
		subscribers: map[int]func(AgentEvent){},
		streaming:   true,
		abort:       abort,
	}
}

// OnEvent subscribes to stream events and replays history for late subscribers.
func (h *BrokerStreamHandle) OnEvent(callback func(AgentEvent)) (unsubscribe func()) {
	if h == nil || callback == nil {
		return func() {}
	}
	h.mu.Lock()
	h.nextID++
	id := h.nextID
	h.subscribers[id] = callback
	history := append([]AgentEvent(nil), h.history...)
	h.mu.Unlock()

	for _, event := range history {
		callback(event)
	}

	return func() {
		h.mu.Lock()
		delete(h.subscribers, id)
		h.mu.Unlock()
	}
}

// Abort requests cancellation of the underlying execution.
func (h *BrokerStreamHandle) Abort() {
	if h == nil {
		return
	}
	h.mu.Lock()
	abort := h.abort
	h.mu.Unlock()
	if abort != nil {
		abort()
	}
}

// IsStreaming reports whether the execution is currently streaming.
func (h *BrokerStreamHandle) IsStreaming() bool {
	if h == nil {
		return false
	}
	h.mu.Lock()
	streaming := h.streaming
	h.mu.Unlock()
	return streaming
}

// IsCompacting reports whether compaction is currently in progress.
func (h *BrokerStreamHandle) IsCompacting() bool {
	if h == nil {
		return false
	}
	h.mu.Lock()
	compacting := h.compacting
	h.mu.Unlock()
	return compacting
}

func (h *BrokerStreamHandle) emit(event AgentEvent) {
	if h == nil {
		return
	}
	etype := strings.ToLower(strings.TrimSpace(event.Type))
	h.mu.Lock()
	switch etype {
	case "stream_start":
		h.streaming = true
	case "stream_end", "stream_error":
		h.streaming = false
		h.compacting = false
	case "compaction":
		phase := strings.ToLower(strings.TrimSpace(anyToString(event.Data["phase"])))
		if phase == "start" {
			h.compacting = true
		}
		if phase == "end" {
			h.compacting = false
		}
	}
	h.history = append(h.history, event)
	callbacks := make([]func(AgentEvent), 0, len(h.subscribers))
	for _, cb := range h.subscribers {
		callbacks = append(callbacks, cb)
	}
	h.mu.Unlock()

	for _, cb := range callbacks {
		cb(event)
	}
}

func (h *BrokerStreamHandle) setStreaming(streaming bool) {
	if h == nil {
		return
	}
	h.mu.Lock()
	h.streaming = streaming
	if !streaming {
		h.compacting = false
	}
	h.mu.Unlock()
}

func (h *BrokerStreamHandle) hasTerminalEvent(runID string) bool {
	if h == nil {
		return false
	}
	runID = strings.TrimSpace(runID)
	h.mu.Lock()
	defer h.mu.Unlock()
	for i := len(h.history) - 1; i >= 0; i-- {
		event := h.history[i]
		etype := strings.ToLower(strings.TrimSpace(event.Type))
		if etype != "stream_end" && etype != "stream_error" {
			continue
		}
		if runID == "" {
			return true
		}
		eventRunID := strings.TrimSpace(anyToString(event.Data["runId"]))
		if eventRunID == "" || eventRunID == runID {
			return true
		}
	}
	return false
}

// StartExecution runs Execute asynchronously and provides a stream handle.
func (b *Broker) StartExecution(ctx context.Context, sessionLabel string, prompt string) *BrokerExecution {
	if ctx == nil {
		ctx = context.Background()
	}
	runID := "run:" + uuid.NewString()
	runCtx, cancel := context.WithCancel(ctx)
	stream := newBrokerStreamHandle(cancel)
	result := make(chan BrokerExecutionResult, 1)

	events := b.OnAgentEvent(sessionLabel)
	go func() {
		for event := range events {
			eventRunID := strings.TrimSpace(anyToString(event.Data["runId"]))
			if eventRunID != "" && eventRunID != runID {
				continue
			}
			stream.emit(event)
		}
		stream.setStreaming(false)
	}()

	go func() {
		turn, err := b.executeWithRunID(runCtx, sessionLabel, prompt, runID)
		if !stream.hasTerminalEvent(runID) {
			if err != nil && !isAbortedExecutionError(err) {
				stream.emit(AgentEvent{
					Type: "stream_error",
					Data: map[string]interface{}{
						"error": err.Error(),
						"runId": runID,
					},
				})
			} else {
				status := "completed"
				final := true
				if err != nil && isAbortedExecutionError(err) {
					status = "aborted"
					final = false
				}
				turnID := ""
				if turn != nil {
					turnID = strings.TrimSpace(turn.TurnID)
				}
				stream.emit(AgentEvent{
					Type: "stream_end",
					Data: map[string]interface{}{
						"status": status,
						"turnId": turnID,
						"final":  final,
						"runId":  runID,
					},
				})
			}
		}
		stream.setStreaming(false)
		result <- BrokerExecutionResult{Turn: turn, Err: err}
		close(result)
	}()

	return &BrokerExecution{
		RunID:  runID,
		Stream: stream,
		Result: result,
	}
}
