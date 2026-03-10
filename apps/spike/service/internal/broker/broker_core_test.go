package broker

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"
)

type fakeEngine struct {
	handle *fakeEngineHandle
}

func (e *fakeEngine) Start(_ context.Context, opts EngineStartOpts) (EngineHandle, error) {
	if e.handle == nil {
		e.handle = &fakeEngineHandle{}
	}
	e.handle.lastStart = opts
	return e.handle, nil
}

type fakeEngineHandle struct {
	lastStart    EngineStartOpts
	promptCount  int
	latestPrompt string
	toolCalls    []engineToolCallSnapshot
	promptEvents []AgentEvent
	listeners    []func(AgentEvent)
	stopCalls    int
	promptErr    error
	promptBlock  chan struct{}
}

func (h *fakeEngineHandle) Prompt(ctx context.Context, message string) (*TurnResult, error) {
	h.promptCount++
	h.latestPrompt = message
	started := time.Now().UTC()
	completed := started.Add(10 * time.Millisecond)
	if h.promptBlock != nil {
		select {
		case <-h.promptBlock:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	for _, event := range h.promptEvents {
		h.emitEvent(event)
	}
	if h.promptErr != nil {
		return nil, h.promptErr
	}
	h.emitEvent(AgentEvent{
		Type: "assistant",
		Data: map[string]interface{}{"text": "answer:" + message},
	})
	return &TurnResult{
		TurnID:        "turn-fake-" + time.Now().UTC().Format("150405.000000"),
		MessageID:     "msg-fake-" + time.Now().UTC().Format("150405.000000"),
		Content:       "answer:" + message,
		Status:        "completed",
		StartedAt:     started,
		CompletedAt:   completed,
		ToolCallCount: 0,
		Usage: SessionStats{
			InputTokens:  3,
			OutputTokens: 4,
			TotalTokens:  7,
		},
	}, nil
}

func (h *fakeEngineHandle) Steer(context.Context, string) error                 { return nil }
func (h *fakeEngineHandle) GetMessages(context.Context) ([]AgentMessage, error) { return nil, nil }
func (h *fakeEngineHandle) GetState(context.Context) (*EngineSessionState, error) {
	return &EngineSessionState{
		SessionID: "session-fake",
		Provider:  strings.TrimSpace(h.lastStart.Provider),
		Model:     strings.TrimSpace(h.lastStart.Model),
	}, nil
}
func (h *fakeEngineHandle) GetSessionStats(context.Context) (*SessionStats, error) {
	return &SessionStats{InputTokens: 3, OutputTokens: 4, TotalTokens: 7, TurnCount: h.promptCount}, nil
}
func (h *fakeEngineHandle) Compact(context.Context, string) (*CompactionResult, error) {
	return &CompactionResult{Summary: "compact", FirstKeptEntry: "entry-non-ledger"}, nil
}
func (h *fakeEngineHandle) SetModel(context.Context, string, string) error { return nil }
func (h *fakeEngineHandle) SetThinkingLevel(context.Context, string) error { return nil }
func (h *fakeEngineHandle) OnEvent(listener func(AgentEvent)) (unsubscribe func()) {
	if listener == nil {
		return func() {}
	}
	h.listeners = append(h.listeners, listener)
	idx := len(h.listeners) - 1
	return func() {
		if idx >= 0 && idx < len(h.listeners) {
			h.listeners[idx] = nil
		}
	}
}
func (h *fakeEngineHandle) Stop(context.Context) error {
	h.stopCalls++
	return nil
}

func (h *fakeEngineHandle) consumeToolCalls() []engineToolCallSnapshot {
	if len(h.toolCalls) == 0 {
		return nil
	}
	out := append([]engineToolCallSnapshot(nil), h.toolCalls...)
	h.toolCalls = nil
	return out
}

func (h *fakeEngineHandle) emitEvent(event AgentEvent) {
	for _, listener := range h.listeners {
		if listener != nil {
			listener(event)
		}
	}
}

func collectEventTypes(ch <-chan AgentEvent, timeout time.Duration) []string {
	types := make([]string, 0, 16)
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	for {
		select {
		case event, ok := <-ch:
			if !ok {
				sort.Strings(types)
				return types
			}
			types = append(types, event.Type)
		case <-timer.C:
			sort.Strings(types)
			return types
		}
	}
}

func TestBrokerExecuteAndForkLifecycle(t *testing.T) {
	db := openLedgerTestDB(t)
	broker, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	engine := &fakeEngine{}
	broker.SetEngine(engine)

	session, err := broker.CreateSession("oracle:test:node-1", SessionOptions{PersonaID: "main", SessionDir: t.TempDir()})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	if session.Label != "oracle:test:node-1" {
		t.Fatalf("unexpected session label: %s", session.Label)
	}

	result, err := broker.Execute(context.Background(), "oracle:test:node-1", "where is auth")
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.Content == "" || result.Status != "completed" {
		t.Fatalf("unexpected result: %#v", result)
	}

	turn, msgs, calls, err := broker.GetTurnDetails(result.TurnID)
	if err != nil {
		t.Fatalf("turn details: %v", err)
	}
	if turn.ID != result.TurnID || len(msgs) != 2 || len(calls) != 0 {
		t.Fatalf("unexpected persisted turn: turn=%s msgs=%d calls=%d", turn.ID, len(msgs), len(calls))
	}

	checkpoint, err := broker.CaptureCheckpoint("oracle:test:node-1", "post-hydrate:test:node-1")
	if err != nil {
		t.Fatalf("capture checkpoint: %v", err)
	}
	if checkpoint.EntryID == "" {
		t.Fatalf("expected checkpoint entry id")
	}

	forkSession, err := broker.ForkFromCheckpoint(context.Background(), "post-hydrate:test:node-1", "ask-test-req-node-1")
	if err != nil {
		t.Fatalf("fork from checkpoint: %v", err)
	}
	if forkSession.ParentSessionLabel != "oracle:test:node-1" {
		t.Fatalf("unexpected fork parent label: %s", forkSession.ParentSessionLabel)
	}
}

func TestBrokerSendWithoutOrchestrator_PersistsDeliveryModeAndEnvelope(t *testing.T) {
	db := openLedgerTestDB(t)
	br, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	if _, err := br.CreateSession("oracle:test:send-steer", SessionOptions{PersonaID: "main", SessionDir: t.TempDir()}); err != nil {
		t.Fatalf("create session: %v", err)
	}

	if err := br.Send(AgentMessage{
		From:         "oracle:test:root",
		To:           "oracle:test:send-steer",
		Content:      "steer now",
		DeliveryMode: QueueModeSteer,
	}); err != nil {
		t.Fatalf("send: %v", err)
	}

	items, err := br.listQueueItems(QueueFilter{SessionLabel: "oracle:test:send-steer", Limit: 10})
	if err != nil {
		t.Fatalf("list queue: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 queue item, got %d", len(items))
	}
	item := items[0]
	if item.Mode != string(QueueModeSteer) {
		t.Fatalf("expected queue mode steer, got %q", item.Mode)
	}
	if item.Status != "queued" {
		t.Fatalf("expected queued status, got %q", item.Status)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(item.MessageJSON), &payload); err != nil {
		t.Fatalf("decode queue payload: %v", err)
	}
	if got := strings.TrimSpace(testAnyString(payload["from"])); got != "oracle:test:root" {
		t.Fatalf("expected payload from oracle:test:root, got %q", got)
	}
	if got := strings.TrimSpace(testAnyString(payload["to"])); got != "oracle:test:send-steer" {
		t.Fatalf("expected payload to oracle:test:send-steer, got %q", got)
	}
	if got := strings.TrimSpace(testAnyString(payload["content"])); got != "steer now" {
		t.Fatalf("expected payload content steer now, got %q", got)
	}
	if got := strings.TrimSpace(testAnyString(payload["delivery_mode"])); got != string(QueueModeSteer) {
		t.Fatalf("expected payload delivery_mode steer, got %q", got)
	}
}

func TestBrokerSendWithoutOrchestrator_InterruptStopsActiveHandle(t *testing.T) {
	db := openLedgerTestDB(t)
	br, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	engine := &fakeEngine{}
	br.SetEngine(engine)

	label := "oracle:test:send-interrupt"
	if _, err := br.CreateSession(label, SessionOptions{PersonaID: "main", SessionDir: t.TempDir()}); err != nil {
		t.Fatalf("create session: %v", err)
	}
	if _, err := br.Execute(context.Background(), label, "prime session"); err != nil {
		t.Fatalf("execute prime: %v", err)
	}
	if engine.handle == nil {
		t.Fatalf("expected engine handle after execute")
	}
	if engine.handle.stopCalls != 0 {
		t.Fatalf("expected no stop calls before interrupt, got %d", engine.handle.stopCalls)
	}

	if err := br.Send(AgentMessage{
		From:         "oracle:test:root",
		To:           label,
		Content:      "interrupt current run",
		DeliveryMode: QueueModeInterrupt,
	}); err != nil {
		t.Fatalf("send interrupt: %v", err)
	}

	if engine.handle.stopCalls == 0 {
		t.Fatalf("expected interrupt send to stop active handle")
	}
	items, err := br.listQueueItems(QueueFilter{SessionLabel: label, Limit: 10})
	if err != nil {
		t.Fatalf("list queue: %v", err)
	}
	if len(items) == 0 {
		t.Fatalf("expected queued interrupt item")
	}
	foundInterrupt := false
	for _, item := range items {
		if item != nil && item.Mode == string(QueueModeInterrupt) {
			foundInterrupt = true
			break
		}
	}
	if !foundInterrupt {
		t.Fatalf("expected queue item with mode interrupt, got %#v", items)
	}
}

func testAnyString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func TestBrokerExecute_PopulatesTurnModelProvider(t *testing.T) {
	db := openLedgerTestDB(t)
	br, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	br.SetEngine(&fakeEngine{})

	label := "oracle:test:model-provider"
	if _, err := br.CreateSession(label, SessionOptions{
		PersonaID:  "main",
		Provider:   "anthropic",
		Model:      "claude-sonnet-4-5",
		SessionDir: t.TempDir(),
	}); err != nil {
		t.Fatalf("create session: %v", err)
	}
	result, err := br.Execute(context.Background(), label, "persist turn metadata")
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	turn, _, _, err := br.GetTurnDetails(result.TurnID)
	if err != nil {
		t.Fatalf("turn details: %v", err)
	}
	if turn.Provider != "anthropic" {
		t.Fatalf("expected turn provider anthropic, got %q", turn.Provider)
	}
	if turn.Model != "claude-sonnet-4-5" {
		t.Fatalf("expected turn model claude-sonnet-4-5, got %q", turn.Model)
	}
}

func TestBrokerExecute_PersistsToolCallsFromEngineProvider(t *testing.T) {
	db := openLedgerTestDB(t)
	broker, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	engine := &fakeEngine{
		handle: &fakeEngineHandle{
			toolCalls: []engineToolCallSnapshot{
				{
					ID:         "call_1",
					ToolName:   "read",
					ParamsJSON: `{"path":"README.md"}`,
					ResultJSON: `{"ok":true}`,
					Status:     "completed",
				},
			},
		},
	}
	broker.SetEngine(engine)

	workDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(workDir, "README.md"), []byte("hello artifact"), 0o644); err != nil {
		t.Fatalf("seed artifact file: %v", err)
	}
	if _, err := broker.CreateSession("oracle:test:tool-persist", SessionOptions{
		PersonaID:  "main",
		SessionDir: t.TempDir(),
		WorkDir:    workDir,
	}); err != nil {
		t.Fatalf("create session: %v", err)
	}

	result, err := broker.Execute(context.Background(), "oracle:test:tool-persist", "inspect readme")
	if err != nil {
		t.Fatalf("execute: %v", err)
	}

	turn, _, calls, err := broker.GetTurnDetails(result.TurnID)
	if err != nil {
		t.Fatalf("turn details: %v", err)
	}
	if turn.ToolCallCount != 1 {
		t.Fatalf("expected turn tool_call_count=1, got %d", turn.ToolCallCount)
	}
	if len(calls) != 1 {
		t.Fatalf("expected 1 persisted tool call, got %d", len(calls))
	}
	if calls[0].ToolName != "read" || calls[0].Status != "completed" {
		t.Fatalf("unexpected persisted tool call: %#v", calls[0])
	}

	links, err := broker.listToolCallArtifacts(calls[0].ID)
	if err != nil {
		t.Fatalf("list tool call artifacts: %v", err)
	}
	if len(links) != 1 {
		t.Fatalf("expected 1 tool call artifact link, got %d", len(links))
	}
	if links[0].Kind != "input_file" {
		t.Fatalf("expected input_file artifact kind, got %q", links[0].Kind)
	}
	artifact, err := broker.getArtifact(links[0].ArtifactID)
	if err != nil {
		t.Fatalf("get artifact: %v", err)
	}
	if artifact.Kind != "input_file" {
		t.Fatalf("expected input_file artifact kind on row, got %q", artifact.Kind)
	}
	if !strings.HasSuffix(artifact.HostPath, "/README.md") && !strings.HasSuffix(artifact.HostPath, "\\README.md") {
		t.Fatalf("unexpected artifact host path: %q", artifact.HostPath)
	}
	if artifact.RelativePath != "README.md" {
		t.Fatalf("expected relative artifact path README.md, got %q", artifact.RelativePath)
	}
	if artifact.Bytes <= 0 {
		t.Fatalf("expected positive artifact bytes, got %d", artifact.Bytes)
	}
	if strings.TrimSpace(artifact.SHA256) == "" {
		t.Fatalf("expected artifact sha256")
	}
}

func TestBrokerExecute_DoesNotPersistArtifactsForFailedToolCall(t *testing.T) {
	db := openLedgerTestDB(t)
	broker, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	engine := &fakeEngine{
		handle: &fakeEngineHandle{
			toolCalls: []engineToolCallSnapshot{
				{
					ID:         "call_failed",
					ToolName:   "read",
					ParamsJSON: `{"path":"README.md"}`,
					ResultJSON: `{"ok":false}`,
					Error:      "missing file",
					Status:     "failed",
				},
			},
		},
	}
	broker.SetEngine(engine)

	workDir := t.TempDir()
	if _, err := broker.CreateSession("oracle:test:tool-failed", SessionOptions{
		PersonaID:  "main",
		SessionDir: t.TempDir(),
		WorkDir:    workDir,
	}); err != nil {
		t.Fatalf("create session: %v", err)
	}

	result, err := broker.Execute(context.Background(), "oracle:test:tool-failed", "inspect readme")
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	_, _, calls, err := broker.GetTurnDetails(result.TurnID)
	if err != nil {
		t.Fatalf("turn details: %v", err)
	}
	if len(calls) != 1 {
		t.Fatalf("expected 1 persisted tool call, got %d", len(calls))
	}

	links, err := broker.listToolCallArtifacts(calls[0].ID)
	if err != nil {
		t.Fatalf("list tool call artifacts: %v", err)
	}
	if len(links) != 0 {
		t.Fatalf("expected no artifact links for failed tool call, got %d", len(links))
	}
}

func TestBrokerExecute_BridgesEngineEventsToSubscribers(t *testing.T) {
	db := openLedgerTestDB(t)
	broker, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	engine := &fakeEngine{}
	broker.SetEngine(engine)

	label := "oracle:test:event-bridge"
	if _, err := broker.CreateSession(label, SessionOptions{PersonaID: "main", SessionDir: t.TempDir()}); err != nil {
		t.Fatalf("create session: %v", err)
	}
	events := broker.OnAgentEvent(label)

	if _, err := broker.Execute(context.Background(), label, "send event"); err != nil {
		t.Fatalf("execute: %v", err)
	}

	var (
		eventTypes       []string
		streamEndPayload map[string]interface{}
		runIDs           = map[string]bool{}
	)
	for {
		select {
		case event, ok := <-events:
			if !ok {
				goto done
			}
			eventTypes = append(eventTypes, event.Type)
			runID := strings.TrimSpace(testAnyString(event.Data["runId"]))
			if runID != "" {
				runIDs[runID] = true
			}
			if event.Type == "stream_end" {
				streamEndPayload = event.Data
			}
		case <-time.After(250 * time.Millisecond):
			goto done
		}
	}
done:
	sort.Strings(eventTypes)
	got := map[string]bool{}
	for _, typ := range eventTypes {
		got[typ] = true
	}
	if !got["stream_start"] {
		t.Fatalf("expected stream_start event, got=%v", eventTypes)
	}
	if !got["assistant"] {
		t.Fatalf("expected assistant event, got=%v", eventTypes)
	}
	if !got["token"] {
		t.Fatalf("expected token event, got=%v", eventTypes)
	}
	if !got["stream_end"] {
		t.Fatalf("expected stream_end event, got=%v", eventTypes)
	}
	if streamEndPayload == nil {
		t.Fatalf("expected stream_end payload")
	}
	final, _ := streamEndPayload["final"].(bool)
	if !final {
		t.Fatalf("expected stream_end final=true payload, got=%#v", streamEndPayload)
	}
	if len(runIDs) != 1 {
		t.Fatalf("expected exactly one non-empty runId across stream events, got=%v", runIDs)
	}
}

func TestBrokerExecute_NormalizesToolEvents(t *testing.T) {
	db := openLedgerTestDB(t)
	broker, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	engine := &fakeEngine{
		handle: &fakeEngineHandle{
			promptEvents: []AgentEvent{
				{
					Type: "tool",
					Data: map[string]interface{}{
						"phase":      "start",
						"toolCallId": "call_1",
						"name":       "read",
					},
				},
				{
					Type: "tool",
					Data: map[string]interface{}{
						"phase":      "result",
						"toolCallId": "call_1",
						"name":       "read",
						"isError":    false,
					},
				},
			},
		},
	}
	broker.SetEngine(engine)

	label := "oracle:test:tool-events"
	if _, err := broker.CreateSession(label, SessionOptions{PersonaID: "main", SessionDir: t.TempDir()}); err != nil {
		t.Fatalf("create session: %v", err)
	}
	events := broker.OnAgentEvent(label)

	if _, err := broker.Execute(context.Background(), label, "normalize tool events"); err != nil {
		t.Fatalf("execute: %v", err)
	}

	var (
		startSeen bool
		endSeen   bool
	)
	for {
		select {
		case event, ok := <-events:
			if !ok {
				goto done
			}
			if event.Type != "tool_status" {
				continue
			}
			phase, _ := event.Data["phase"].(string)
			status, _ := event.Data["status"].(string)
			if phase == "start" && status == "started" {
				startSeen = true
			}
			if phase == "result" && status == "completed" {
				endSeen = true
			}
		case <-time.After(250 * time.Millisecond):
			goto done
		}
	}
done:
	if !startSeen {
		t.Fatalf("expected normalized tool_status start/started event")
	}
	if !endSeen {
		t.Fatalf("expected normalized tool_status result/completed event")
	}
}

func TestBrokerExecute_PersistsFailedTurnOnEngineError(t *testing.T) {
	db := openLedgerTestDB(t)
	broker, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	engine := &fakeEngine{
		handle: &fakeEngineHandle{
			promptEvents: []AgentEvent{
				{
					Type: "assistant",
					Data: map[string]interface{}{"text": "partial assistant output"},
				},
			},
			toolCalls: []engineToolCallSnapshot{
				{
					ID:         "call_failed",
					ToolName:   "read",
					ParamsJSON: `{"path":"README.md"}`,
					ResultJSON: `{"ok":false}`,
					Error:      "read failed",
					Status:     "failed",
				},
			},
			promptErr: errors.New("simulated engine failure"),
		},
	}
	broker.SetEngine(engine)

	label := "oracle:test:execute-failed"
	if _, err := broker.CreateSession(label, SessionOptions{PersonaID: "main", SessionDir: t.TempDir()}); err != nil {
		t.Fatalf("create session: %v", err)
	}
	events := broker.OnAgentEvent(label)

	if _, err := broker.Execute(context.Background(), label, "this should fail"); err == nil {
		t.Fatalf("expected execute to fail")
	}

	turns, err := broker.GetSessionHistory(label)
	if err != nil {
		t.Fatalf("session history: %v", err)
	}
	if len(turns) != 1 {
		t.Fatalf("expected exactly one failed turn, got %d", len(turns))
	}
	turn := turns[0]
	if turn.Status != "failed" {
		t.Fatalf("expected failed turn status, got %q", turn.Status)
	}
	if turn.ToolCallCount != 1 {
		t.Fatalf("expected failed turn tool_call_count=1, got %d", turn.ToolCallCount)
	}

	_, messages, calls, err := broker.GetTurnDetails(turn.ID)
	if err != nil {
		t.Fatalf("turn details: %v", err)
	}
	if len(messages) != 2 {
		t.Fatalf("expected 2 messages on failed turn, got %d", len(messages))
	}
	if strings.TrimSpace(messages[0].Role) != "user" || strings.TrimSpace(messages[0].Content) != "this should fail" {
		t.Fatalf("unexpected failed turn user message: %#v", messages[0])
	}
	if strings.TrimSpace(messages[1].Role) != "assistant" || strings.TrimSpace(messages[1].Content) != "partial assistant output" {
		t.Fatalf("unexpected failed turn assistant message: %#v", messages[1])
	}
	if len(calls) != 1 || calls[0].Status != "failed" || calls[0].ToolName != "read" {
		t.Fatalf("unexpected failed turn tool calls: %#v", calls)
	}

	var (
		eventTypes         []string
		streamErrorPayload map[string]interface{}
		runIDs             = map[string]bool{}
	)
	for {
		select {
		case event, ok := <-events:
			if !ok {
				goto done
			}
			eventTypes = append(eventTypes, event.Type)
			runID := strings.TrimSpace(testAnyString(event.Data["runId"]))
			if runID != "" {
				runIDs[runID] = true
			}
			if event.Type == "stream_error" {
				streamErrorPayload = event.Data
			}
		case <-time.After(250 * time.Millisecond):
			goto done
		}
	}
done:
	sort.Strings(eventTypes)
	got := map[string]bool{}
	for _, typ := range eventTypes {
		got[typ] = true
	}
	if !got["stream_start"] {
		t.Fatalf("expected stream_start event, got=%v", eventTypes)
	}
	if !got["stream_error"] {
		t.Fatalf("expected stream_error event, got=%v", eventTypes)
	}
	if got["stream_end"] {
		t.Fatalf("did not expect stream_end on failed execute, got=%v", eventTypes)
	}
	if streamErrorPayload == nil {
		t.Fatalf("expected stream_error payload")
	}
	partial, _ := streamErrorPayload["partial"].(bool)
	if !partial {
		t.Fatalf("expected stream_error partial=true payload, got=%#v", streamErrorPayload)
	}
	if strings.TrimSpace(testAnyString(streamErrorPayload["turnId"])) == "" {
		t.Fatalf("expected stream_error turnId payload, got=%#v", streamErrorPayload)
	}
	if len(runIDs) != 1 {
		t.Fatalf("expected exactly one non-empty runId across failed stream events, got=%v", runIDs)
	}
}

func TestBrokerExecute_PersistsAbortedTurnAndEmitsNonFinalStreamEnd(t *testing.T) {
	db := openLedgerTestDB(t)
	broker, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	engine := &fakeEngine{
		handle: &fakeEngineHandle{
			promptEvents: []AgentEvent{
				{
					Type: "assistant",
					Data: map[string]interface{}{"text": "partial aborted output"},
				},
			},
			promptErr: context.Canceled,
		},
	}
	broker.SetEngine(engine)

	label := "oracle:test:execute-aborted"
	if _, err := broker.CreateSession(label, SessionOptions{PersonaID: "main", SessionDir: t.TempDir()}); err != nil {
		t.Fatalf("create session: %v", err)
	}
	events := broker.OnAgentEvent(label)

	if _, err := broker.Execute(context.Background(), label, "this should abort"); err == nil {
		t.Fatalf("expected execute to return abort error")
	}

	turns, err := broker.GetSessionHistory(label)
	if err != nil {
		t.Fatalf("session history: %v", err)
	}
	if len(turns) != 1 {
		t.Fatalf("expected exactly one aborted turn, got %d", len(turns))
	}
	turn := turns[0]
	if turn.Status != "aborted" {
		t.Fatalf("expected aborted turn status, got %q", turn.Status)
	}

	_, messages, _, err := broker.GetTurnDetails(turn.ID)
	if err != nil {
		t.Fatalf("turn details: %v", err)
	}
	if len(messages) != 2 {
		t.Fatalf("expected 2 messages on aborted turn, got %d", len(messages))
	}
	if strings.TrimSpace(messages[1].Role) != "assistant" || strings.TrimSpace(messages[1].Content) != "partial aborted output" {
		t.Fatalf("unexpected aborted turn assistant message: %#v", messages[1])
	}

	var (
		eventTypes       []string
		streamEndPayload map[string]interface{}
		runIDs           = map[string]bool{}
	)
	for {
		select {
		case event, ok := <-events:
			if !ok {
				goto done
			}
			eventTypes = append(eventTypes, event.Type)
			runID := strings.TrimSpace(testAnyString(event.Data["runId"]))
			if runID != "" {
				runIDs[runID] = true
			}
			if event.Type == "stream_end" {
				streamEndPayload = event.Data
			}
		case <-time.After(250 * time.Millisecond):
			goto done
		}
	}
done:
	sort.Strings(eventTypes)
	got := map[string]bool{}
	for _, typ := range eventTypes {
		got[typ] = true
	}
	if !got["stream_start"] {
		t.Fatalf("expected stream_start event, got=%v", eventTypes)
	}
	if !got["stream_end"] {
		t.Fatalf("expected stream_end event, got=%v", eventTypes)
	}
	if got["stream_error"] {
		t.Fatalf("did not expect stream_error on aborted execute, got=%v", eventTypes)
	}
	if streamEndPayload == nil {
		t.Fatalf("expected stream_end payload")
	}
	final, _ := streamEndPayload["final"].(bool)
	if final {
		t.Fatalf("expected stream_end final=false for abort, got=%#v", streamEndPayload)
	}
	if strings.TrimSpace(testAnyString(streamEndPayload["status"])) != "aborted" {
		t.Fatalf("expected stream_end status=aborted, got=%#v", streamEndPayload)
	}
	if strings.TrimSpace(testAnyString(streamEndPayload["turnId"])) == "" {
		t.Fatalf("expected stream_end turnId payload, got=%#v", streamEndPayload)
	}
	if len(runIDs) != 1 {
		t.Fatalf("expected exactly one non-empty runId across aborted stream events, got=%v", runIDs)
	}
}

func TestBrokerStartExecution_StreamHandleLifecycle(t *testing.T) {
	db := openLedgerTestDB(t)
	br, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	br.SetEngine(&fakeEngine{})

	label := "oracle:test:start-execution"
	if _, err := br.CreateSession(label, SessionOptions{PersonaID: "main", SessionDir: t.TempDir()}); err != nil {
		t.Fatalf("create session: %v", err)
	}

	exec := br.StartExecution(context.Background(), label, "streamed execute")
	if exec == nil || exec.Stream == nil {
		t.Fatalf("expected start execution handle")
	}
	select {
	case res, ok := <-exec.Result:
		if !ok {
			t.Fatalf("execution result channel closed without value")
		}
		if res.Err != nil {
			t.Fatalf("expected execution success, got err: %v", res.Err)
		}
		if res.Turn == nil || strings.TrimSpace(res.Turn.TurnID) == "" {
			t.Fatalf("expected successful turn result, got %#v", res.Turn)
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for execution result")
	}

	if exec.Stream.IsStreaming() {
		t.Fatalf("expected stream handle to be non-streaming after completion")
	}
	if exec.Stream.IsCompacting() {
		t.Fatalf("expected stream handle compacting=false after completion")
	}

	events := make([]AgentEvent, 0, 8)
	unsub := exec.Stream.OnEvent(func(event AgentEvent) {
		events = append(events, event)
	})
	unsub()
	if len(events) == 0 {
		t.Fatalf("expected replayable stream history")
	}

	got := map[string]bool{}
	for _, event := range events {
		got[event.Type] = true
		runID := strings.TrimSpace(testAnyString(event.Data["runId"]))
		if runID == "" {
			t.Fatalf("expected runId on stream event: %#v", event)
		}
		if runID != exec.RunID {
			t.Fatalf("expected stream event runId %q, got %q", exec.RunID, runID)
		}
	}
	if !got["stream_start"] {
		t.Fatalf("expected stream_start in stream history, got %#v", events)
	}
	if !got["token"] {
		t.Fatalf("expected token in stream history, got %#v", events)
	}
	if !got["stream_end"] {
		t.Fatalf("expected stream_end in stream history, got %#v", events)
	}
}

func TestBrokerStartExecution_AbortPersistsAbortedTurn(t *testing.T) {
	db := openLedgerTestDB(t)
	br, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	br.SetEngine(&fakeEngine{
		handle: &fakeEngineHandle{
			promptBlock: make(chan struct{}),
		},
	})

	label := "oracle:test:start-execution-abort"
	if _, err := br.CreateSession(label, SessionOptions{PersonaID: "main", SessionDir: t.TempDir()}); err != nil {
		t.Fatalf("create session: %v", err)
	}

	exec := br.StartExecution(context.Background(), label, "long running prompt")
	if exec == nil || exec.Stream == nil {
		t.Fatalf("expected start execution handle")
	}

	events := make([]AgentEvent, 0, 8)
	_ = exec.Stream.OnEvent(func(event AgentEvent) {
		events = append(events, event)
	})

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if exec.Stream.IsStreaming() {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	exec.Stream.Abort()

	select {
	case res, ok := <-exec.Result:
		if !ok {
			t.Fatalf("execution result channel closed without value")
		}
		if res.Err == nil {
			t.Fatalf("expected abort error from execution")
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for aborted execution result")
	}

	turns, err := br.GetSessionHistory(label)
	if err != nil {
		t.Fatalf("session history: %v", err)
	}
	if len(turns) != 1 {
		t.Fatalf("expected one terminal turn after abort, got %d", len(turns))
	}
	if turns[0].Status != "aborted" {
		t.Fatalf("expected aborted turn status, got %q", turns[0].Status)
	}

	got := map[string]bool{}
	var streamEndPayload map[string]interface{}
	for _, event := range events {
		got[event.Type] = true
		if event.Type == "stream_end" {
			streamEndPayload = event.Data
		}
	}
	if !got["stream_start"] || !got["stream_end"] {
		t.Fatalf("expected stream_start and stream_end for aborted execution, got %#v", events)
	}
	if got["stream_error"] {
		t.Fatalf("did not expect stream_error for aborted execution, got %#v", events)
	}
	if streamEndPayload == nil {
		t.Fatalf("expected stream_end payload for aborted execution")
	}
	final, _ := streamEndPayload["final"].(bool)
	if final {
		t.Fatalf("expected aborted stream_end final=false, got %#v", streamEndPayload)
	}
	if strings.TrimSpace(testAnyString(streamEndPayload["status"])) != "aborted" {
		t.Fatalf("expected aborted stream_end status, got %#v", streamEndPayload)
	}
}

func TestEmitAgentEventTouchesSessionActivity(t *testing.T) {
	db := openLedgerTestDB(t)
	br, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	label := "oracle:test:activity"
	if _, err := br.CreateSession(label, SessionOptions{PersonaID: "main", SessionDir: t.TempDir()}); err != nil {
		t.Fatalf("create session: %v", err)
	}
	before, err := br.GetSession(label)
	if err != nil {
		t.Fatalf("get session before: %v", err)
	}

	time.Sleep(1100 * time.Millisecond)
	br.emitAgentEvent(label, AgentEvent{
		Type: "provider_progress",
		Data: map[string]interface{}{"event_type": "response.output_text.delta"},
	})

	after, err := br.GetSession(label)
	if err != nil {
		t.Fatalf("get session after: %v", err)
	}
	if !after.UpdatedAt.After(before.UpdatedAt) {
		t.Fatalf("expected session updated_at to advance, before=%v after=%v", before.UpdatedAt, after.UpdatedAt)
	}
}
