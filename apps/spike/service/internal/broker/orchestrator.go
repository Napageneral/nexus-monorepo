package broker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

type runningWorker struct {
	agentID   string
	worker    WorkerAgent
	startedAt time.Time
	status    SessionStatus

	ctx       context.Context
	cancel    context.CancelCauseFunc
	done      chan struct{}
	preempted bool

	queueIDs []string
}

type orchestratorEventHandler struct {
	id      uint64
	handler func(any)
}

// Orchestrator ports ActiveMessageBroker behavior for multi-agent queue/lifecycle control.
type Orchestrator struct {
	broker *Broker
	opts   OrchestratorOpts

	mu sync.Mutex

	queues       map[string][]AgentMessage
	running      map[string]*runningWorker
	starting     map[string]bool
	agentStatus  map[string]SessionStatus
	registeredIA map[string]InteractionAgent
	external     map[string]map[string]struct{}
	deliveryMode map[string]string // "batch" | "single"

	oduFactories map[string]ODURegistration

	collectionTimers  map[string]*time.Timer
	collectionBuffers map[string][]AgentMessage

	completionWaiters map[string][]chan AgentResult
	eventHandlers     map[string][]orchestratorEventHandler
	nextEventHandler  uint64
}

// NewOrchestrator creates a broker orchestrator with modular feature flags.
func NewOrchestrator(b *Broker, opts OrchestratorOpts) *Orchestrator {
	if opts.Features == (OrchestratorFeatures{}) {
		opts.Features = DefaultOrchestratorFeatures()
	}
	if opts.CollectDebounce <= 0 {
		opts.CollectDebounce = 500 * time.Millisecond
	}
	if opts.CollectMaxMessages <= 0 {
		opts.CollectMaxMessages = 10
	}
	if opts.HighPriorityInterruptAfter <= 0 {
		opts.HighPriorityInterruptAfter = 30 * time.Second
	}
	orch := &Orchestrator{
		broker:            b,
		opts:              opts,
		queues:            map[string][]AgentMessage{},
		running:           map[string]*runningWorker{},
		starting:          map[string]bool{},
		agentStatus:       map[string]SessionStatus{},
		registeredIA:      map[string]InteractionAgent{},
		external:          map[string]map[string]struct{}{},
		deliveryMode:      map[string]string{},
		oduFactories:      map[string]ODURegistration{},
		collectionTimers:  map[string]*time.Timer{},
		collectionBuffers: map[string][]AgentMessage{},
		completionWaiters: map[string][]chan AgentResult{},
		eventHandlers:     map[string][]orchestratorEventHandler{},
	}
	orch.loadPersistedQueues()
	return orch
}

// RegisterODU registers an ODU namespace and worker factory.
func (o *Orchestrator) RegisterODU(oduName string, sessionStorePath string, factory AgentFactory) error {
	oduName = strings.TrimSpace(oduName)
	if oduName == "" {
		return fmt.Errorf("odu name is required")
	}
	if factory == nil {
		return fmt.Errorf("agent factory is required")
	}
	o.mu.Lock()
	o.oduFactories[oduName] = ODURegistration{
		Name:             oduName,
		SessionStorePath: strings.TrimSpace(sessionStorePath),
		Factory:          factory,
	}
	o.mu.Unlock()
	return nil
}

// RegisterIA registers an always-on interaction agent target.
func (o *Orchestrator) RegisterIA(agentID string, ia InteractionAgent) error {
	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		return fmt.Errorf("ia id is required")
	}
	if ia == nil {
		return fmt.Errorf("ia instance is required")
	}
	o.mu.Lock()
	o.registeredIA[agentID] = ia
	o.mu.Unlock()
	return nil
}

// SetDeliveryMode sets per-agent delivery behavior (batch|single).
func (o *Orchestrator) SetDeliveryMode(agentID string, mode string) {
	agentID = strings.TrimSpace(agentID)
	mode = strings.ToLower(strings.TrimSpace(mode))
	if agentID == "" {
		return
	}
	if mode != "single" {
		mode = "batch"
	}
	o.mu.Lock()
	o.deliveryMode[agentID] = mode
	o.mu.Unlock()
}

// SetCollectionParams updates collect-mode debounce and max batch size.
func (o *Orchestrator) SetCollectionParams(debounce time.Duration, maxMessages int) {
	o.mu.Lock()
	if debounce > 0 {
		o.opts.CollectDebounce = debounce
	}
	if maxMessages > 0 {
		o.opts.CollectMaxMessages = maxMessages
	}
	o.mu.Unlock()
}

// SendAndWaitForAck routes a message to an IA and waits for ProcessQueue completion.
func (o *Orchestrator) SendAndWaitForAck(ctx context.Context, msg AgentMessage) (string, error) {
	msg, err := o.normalizeMessage(msg)
	if err != nil {
		return "", err
	}
	if o.opts.Features.EnableRouting {
		msg.To, err = o.routeMessage(msg.From, msg.To)
		if err != nil {
			return "", err
		}
	}
	ia := o.lookupIA(msg.To)
	if ia == nil {
		return "", fmt.Errorf("cannot wait for ack: %s is not a registered IA", msg.To)
	}

	if o.opts.Features.EnableExternalCallerTracking {
		o.trackExternalCaller(msg.From, msg.To)
	}
	if err := o.enqueue(msg); err != nil {
		return "", err
	}

	started := nowUnixMilli()
	_ = o.persistQueueStatus(msg.ID, "processing", &started, nil, "")
	ia.QueueMessage(msg.Content, msg.Priority, msg.From)

	var ack string
	if proc, ok := ia.(ProcessQueueAgent); ok {
		ack, err = proc.ProcessQueue(ctx)
		if err != nil {
			completed := nowUnixMilli()
			_ = o.persistQueueStatus(msg.ID, "failed", nil, &completed, err.Error())
			return "", err
		}
	} else if syncer, ok := ia.(ChatSyncAgent); ok {
		err = syncer.ChatSync(ctx, "")
		if err != nil {
			completed := nowUnixMilli()
			_ = o.persistQueueStatus(msg.ID, "failed", nil, &completed, err.Error())
			return "", err
		}
	}

	completed := nowUnixMilli()
	_ = o.persistQueueStatus(msg.ID, "completed", nil, &completed, "")
	return strings.TrimSpace(ack), nil
}

// Send enqueues a message and runs orchestration lifecycle behavior.
func (o *Orchestrator) Send(msg AgentMessage) error {
	msg, err := o.normalizeMessage(msg)
	if err != nil {
		return err
	}
	if o.opts.Features.EnableRouting {
		msg.To, err = o.routeMessage(msg.From, msg.To)
		if err != nil {
			return err
		}
	}

	if o.opts.Features.EnableExternalCallerTracking {
		o.trackExternalCaller(msg.From, msg.To)
	}

	if msg.DeliveryMode == QueueModeCollect && o.opts.Features.EnableCollectMode {
		o.handleCollectMode(msg)
		return nil
	}
	if msg.DeliveryMode == QueueModeSteer && o.opts.Features.EnableSteerMode {
		steered, err := o.trySteerRunningWorker(msg)
		if err != nil {
			return err
		}
		if steered {
			return nil
		}
		msg.Priority = PriorityUrgent
		msg.DeliveryMode = QueueModeInterrupt
	}

	if err := o.enqueue(msg); err != nil {
		return err
	}

	if o.opts.Features.EnableIARouting {
		if ia := o.lookupIA(msg.To); ia != nil {
			o.deliverToIA(msg, ia)
			return nil
		}
	}

	if o.shouldInterrupt(msg) {
		o.interruptAndRestart(msg.To)
		return nil
	}
	o.maybeStartProcessing(msg.To)
	return nil
}

func (o *Orchestrator) trySteerRunningWorker(msg AgentMessage) (bool, error) {
	target := strings.TrimSpace(msg.To)
	if target == "" {
		return false, nil
	}
	o.mu.Lock()
	rw := o.running[target]
	o.mu.Unlock()
	if rw == nil || rw.worker == nil {
		return false, nil
	}
	steering, ok := rw.worker.(SteeringWorker)
	if !ok {
		return false, nil
	}
	if err := o.enqueue(msg); err != nil {
		return true, err
	}
	started := nowUnixMilli()
	_ = o.persistQueueStatus(msg.ID, "processing", &started, nil, "")
	if err := steering.Steer(rw.ctx, msg.Content); err != nil {
		completed := nowUnixMilli()
		_ = o.persistQueueStatus(msg.ID, "failed", nil, &completed, err.Error())
		o.removeQueuedMessage(target, msg.ID)
		return true, err
	}
	completed := nowUnixMilli()
	_ = o.persistQueueStatus(msg.ID, "completed", nil, &completed, "")
	o.removeQueuedMessage(target, msg.ID)
	return true, nil
}

func (o *Orchestrator) removeQueuedMessage(agentID string, messageID string) {
	agentID = strings.TrimSpace(agentID)
	messageID = strings.TrimSpace(messageID)
	if agentID == "" || messageID == "" {
		return
	}
	o.mu.Lock()
	queue := o.queues[agentID]
	if len(queue) == 0 {
		o.mu.Unlock()
		return
	}
	next := queue[:0]
	for _, msg := range queue {
		if strings.TrimSpace(msg.ID) == messageID {
			continue
		}
		next = append(next, msg)
	}
	o.queues[agentID] = append([]AgentMessage(nil), next...)
	o.mu.Unlock()
}

// OnceAgentCompletes resolves after the next completion event for agentID.
func (o *Orchestrator) OnceAgentCompletes(agentID string) <-chan AgentResult {
	ch := make(chan AgentResult, 1)
	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		close(ch)
		return ch
	}
	o.mu.Lock()
	o.completionWaiters[agentID] = append(o.completionWaiters[agentID], ch)
	o.mu.Unlock()
	return ch
}

// HasPending reports whether there are queued messages for agentID.
func (o *Orchestrator) HasPending(agentID string) bool {
	o.mu.Lock()
	defer o.mu.Unlock()
	return len(o.queues[strings.TrimSpace(agentID)]) > 0
}

// GetAgentStatus returns active|idle for the target agent.
func (o *Orchestrator) GetAgentStatus(agentID string) SessionStatus {
	o.mu.Lock()
	defer o.mu.Unlock()
	if status, ok := o.agentStatus[strings.TrimSpace(agentID)]; ok {
		return status
	}
	return SessionStatusIdle
}

// IsAgentActive reports active state for the target agent.
func (o *Orchestrator) IsAgentActive(agentID string) bool {
	return o.GetAgentStatus(agentID) == SessionStatusActive
}

// GetQueueSize returns queued message count for one agent.
func (o *Orchestrator) GetQueueSize(agentID string) int {
	o.mu.Lock()
	defer o.mu.Unlock()
	return len(o.queues[strings.TrimSpace(agentID)])
}

// GetExternalCallers returns all caller IDs that have messaged this agent.
func (o *Orchestrator) GetExternalCallers(agentID string) []string {
	agentID = strings.TrimSpace(agentID)
	o.mu.Lock()
	callers := o.external[agentID]
	out := make([]string, 0, len(callers))
	for caller := range callers {
		out = append(out, caller)
	}
	o.mu.Unlock()
	sort.Strings(out)
	return out
}

// GetRegisteredIAs returns IA identity metadata.
func (o *Orchestrator) GetRegisteredIAs() []map[string]string {
	o.mu.Lock()
	defer o.mu.Unlock()
	out := make([]map[string]string, 0, len(o.registeredIA))
	for id := range o.registeredIA {
		out = append(out, map[string]string{
			"id":       id,
			"odu_name": o.getODUName(id),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i]["id"] < out[j]["id"] })
	return out
}

// GetRunningAgents returns active EA metadata.
func (o *Orchestrator) GetRunningAgents() []map[string]any {
	o.mu.Lock()
	defer o.mu.Unlock()
	out := make([]map[string]any, 0, len(o.running))
	for id, worker := range o.running {
		out = append(out, map[string]any{
			"agent_id":   id,
			"status":     worker.status,
			"started_at": worker.startedAt.UnixMilli(),
			"odu_name":   o.getODUName(id),
			"queue_size": len(o.queues[id]),
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return fmt.Sprintf("%v", out[i]["agent_id"]) < fmt.Sprintf("%v", out[j]["agent_id"])
	})
	return out
}

// GetAllQueues returns queued item counts by agent.
func (o *Orchestrator) GetAllQueues() map[string]int {
	o.mu.Lock()
	defer o.mu.Unlock()
	out := make(map[string]int, len(o.queues))
	for id, queue := range o.queues {
		out[id] = len(queue)
	}
	return out
}

// On subscribes to orchestrator lifecycle events.
func (o *Orchestrator) On(event string, handler func(any)) (unsubscribe func()) {
	event = strings.TrimSpace(event)
	if event == "" || handler == nil {
		return func() {}
	}
	id := atomic.AddUint64(&o.nextEventHandler, 1)
	o.mu.Lock()
	o.eventHandlers[event] = append(o.eventHandlers[event], orchestratorEventHandler{
		id:      id,
		handler: handler,
	})
	o.mu.Unlock()
	return func() {
		o.mu.Lock()
		list := o.eventHandlers[event]
		kept := list[:0]
		for _, item := range list {
			if item.id != id {
				kept = append(kept, item)
			}
		}
		o.eventHandlers[event] = append([]orchestratorEventHandler(nil), kept...)
		o.mu.Unlock()
	}
}

func (o *Orchestrator) normalizeMessage(msg AgentMessage) (AgentMessage, error) {
	msg.Content = strings.TrimSpace(msg.Content)
	if msg.Content == "" {
		return AgentMessage{}, fmt.Errorf("message content is required")
	}

	msg.From = strings.TrimSpace(msg.From)
	if msg.From == "" {
		msg.From = "user"
	}

	to := strings.TrimSpace(msg.To)
	if to == "" {
		to = strings.TrimSpace(msg.SessionLabel)
	}
	if to == "" {
		return AgentMessage{}, fmt.Errorf("message target is required")
	}
	msg.To = to

	if msg.Timestamp.IsZero() {
		msg.Timestamp = time.Now().UTC()
	} else {
		msg.Timestamp = msg.Timestamp.UTC()
	}

	if strings.TrimSpace(msg.ID) == "" {
		msg.ID = "queue:" + uuid.NewString()
	}
	if msg.Priority == "" {
		msg.Priority = PriorityNormal
	}
	switch msg.Priority {
	case PriorityUrgent, PriorityHigh, PriorityNormal, PriorityLow:
	default:
		msg.Priority = PriorityNormal
	}

	mode := strings.TrimSpace(string(msg.DeliveryMode))
	if mode == "" {
		mode = strings.TrimSpace(msg.Mode)
	}
	switch QueueMode(mode) {
	case QueueModeSteer:
		if !o.opts.Features.EnableSteerMode {
			msg.DeliveryMode = QueueModeQueue
		} else {
			msg.DeliveryMode = QueueModeSteer
		}
	case QueueModeFollowup:
		if !o.opts.Features.EnableFollowupMode {
			msg.DeliveryMode = QueueModeQueue
		} else {
			msg.DeliveryMode = QueueModeFollowup
		}
	case QueueModeCollect:
		if !o.opts.Features.EnableCollectMode {
			msg.DeliveryMode = QueueModeQueue
		} else {
			msg.DeliveryMode = QueueModeCollect
		}
	case QueueModeInterrupt:
		if !o.opts.Features.EnableInterruptMode {
			msg.DeliveryMode = QueueModeQueue
		} else {
			msg.DeliveryMode = QueueModeInterrupt
		}
	case QueueModeQueue, "":
		msg.DeliveryMode = QueueModeQueue
	default:
		msg.DeliveryMode = QueueModeQueue
	}
	return msg, nil
}

func (o *Orchestrator) routeMessage(from string, to string) (string, error) {
	to = strings.TrimSpace(to)
	if to == "" {
		return "", fmt.Errorf("target is required")
	}
	if o.isFullyQualified(to) {
		if !o.validateAgentExists(to) {
			return "", fmt.Errorf("unknown agent: %s", to)
		}
		return to, nil
	}

	var callerODU string
	if from == "user" || from == "system" {
		o.mu.Lock()
		for odu := range o.oduFactories {
			callerODU = odu
			break
		}
		o.mu.Unlock()
		if callerODU == "" {
			callerODU = "nexus"
		}
	} else {
		callerODU = o.getODUName(from)
	}
	expanded := callerODU + "-ea-" + to
	if !o.validateAgentExists(expanded) {
		return "", fmt.Errorf("unknown agent: %s (expanded from %s)", expanded, to)
	}
	return expanded, nil
}

func (o *Orchestrator) isFullyQualified(name string) bool {
	parts := strings.Split(name, "-")
	if len(parts) < 2 {
		return false
	}
	return parts[1] == "ia" || parts[1] == "ea"
}

func (o *Orchestrator) validateAgentExists(agentID string) bool {
	o.mu.Lock()
	_, isIA := o.registeredIA[agentID]
	_, running := o.running[agentID]
	_, queued := o.queues[agentID]
	odu := o.getODUName(agentID)
	_, hasFactory := o.oduFactories[odu]
	o.mu.Unlock()
	return isIA || running || queued || hasFactory
}

func (o *Orchestrator) trackExternalCaller(from string, to string) {
	from = strings.TrimSpace(from)
	to = strings.TrimSpace(to)
	if from == "" || to == "" || from == to || from == "user" || from == "system" {
		return
	}
	o.mu.Lock()
	callers := o.external[to]
	if callers == nil {
		callers = map[string]struct{}{}
		o.external[to] = callers
	}
	callers[from] = struct{}{}
	o.mu.Unlock()
}

func (o *Orchestrator) lookupIA(agentID string) InteractionAgent {
	agentID = strings.TrimSpace(agentID)
	o.mu.Lock()
	ia := o.registeredIA[agentID]
	o.mu.Unlock()
	return ia
}

func (o *Orchestrator) handleCollectMode(msg AgentMessage) {
	target := msg.To
	o.mu.Lock()
	buffer := o.collectionBuffers[target]
	buffer = append(buffer, msg)
	o.collectionBuffers[target] = buffer
	if timer := o.collectionTimers[target]; timer != nil {
		timer.Stop()
	}
	if len(buffer) >= o.opts.CollectMaxMessages {
		o.mu.Unlock()
		o.flushCollectionBuffer(target)
		return
	}
	timer := time.AfterFunc(o.opts.CollectDebounce, func() {
		o.flushCollectionBuffer(target)
	})
	o.collectionTimers[target] = timer
	o.mu.Unlock()
}

func (o *Orchestrator) flushCollectionBuffer(target string) {
	target = strings.TrimSpace(target)
	if target == "" {
		return
	}
	o.mu.Lock()
	buffer := append([]AgentMessage(nil), o.collectionBuffers[target]...)
	delete(o.collectionBuffers, target)
	if timer := o.collectionTimers[target]; timer != nil {
		timer.Stop()
		delete(o.collectionTimers, target)
	}
	o.mu.Unlock()

	for _, msg := range buffer {
		_ = o.enqueue(msg)
	}
	o.maybeStartProcessing(target)
}

func (o *Orchestrator) enqueue(msg AgentMessage) error {
	if err := o.persistQueueEnqueue(msg); err != nil {
		return err
	}

	o.mu.Lock()
	queue := append(o.queues[msg.To], msg)
	if o.opts.Features.EnablePriorityQueue {
		sort.Slice(queue, func(i, j int) bool {
			pi := priorityOrder(queue[i].Priority)
			pj := priorityOrder(queue[j].Priority)
			if pi != pj {
				return pi < pj
			}
			if !queue[i].Timestamp.Equal(queue[j].Timestamp) {
				return queue[i].Timestamp.Before(queue[j].Timestamp)
			}
			return queue[i].ID < queue[j].ID
		})
	}
	o.queues[msg.To] = queue
	queueSize := len(queue)
	o.mu.Unlock()

	o.emit(BrokerEventMessageQueued, map[string]any{
		"message_id": msg.ID,
		"from":       msg.From,
		"to":         msg.To,
		"priority":   msg.Priority,
		"timestamp":  msg.Timestamp.UnixMilli(),
		"queue_size": queueSize,
	})
	return nil
}

func priorityOrder(p MessagePriority) int {
	switch p {
	case PriorityUrgent:
		return 0
	case PriorityHigh:
		return 1
	case PriorityNormal:
		return 2
	case PriorityLow:
		return 3
	default:
		return 2
	}
}

func (o *Orchestrator) shouldInterrupt(msg AgentMessage) bool {
	if !o.opts.Features.EnableInterruptMode {
		return false
	}
	if msg.DeliveryMode == QueueModeInterrupt {
		return true
	}
	if msg.Priority == PriorityUrgent {
		return true
	}
	if msg.Priority == PriorityHigh {
		o.mu.Lock()
		running := o.running[msg.To]
		o.mu.Unlock()
		if running != nil && time.Since(running.startedAt) > o.opts.HighPriorityInterruptAfter {
			return true
		}
	}
	return false
}

func (o *Orchestrator) maybeStartProcessing(agentID string) {
	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		return
	}
	o.mu.Lock()
	if _, ok := o.registeredIA[agentID]; ok {
		o.mu.Unlock()
		return
	}
	if o.running[agentID] != nil || o.starting[agentID] || len(o.queues[agentID]) == 0 {
		o.mu.Unlock()
		return
	}
	o.starting[agentID] = true
	o.mu.Unlock()

	go func() {
		defer func() {
			o.mu.Lock()
			delete(o.starting, agentID)
			o.mu.Unlock()
		}()
		_ = o.processNextBatch(agentID)
	}()
}

func (o *Orchestrator) processNextBatch(agentID string) error {
	batch := o.dequeueBatch(agentID)
	if len(batch) == 0 {
		return nil
	}
	if err := o.startAgentWithBatch(agentID, batch); err != nil {
		for _, msg := range batch {
			completed := nowUnixMilli()
			_ = o.persistQueueStatus(msg.ID, "failed", nil, &completed, err.Error())
		}
		return err
	}
	return nil
}

func (o *Orchestrator) dequeueBatch(agentID string) []AgentMessage {
	o.mu.Lock()
	defer o.mu.Unlock()

	queue := o.queues[agentID]
	if len(queue) == 0 {
		return nil
	}
	deliveryMode := o.deliveryMode[agentID]
	if deliveryMode == "" {
		deliveryMode = "batch"
	}
	if deliveryMode == "single" || !o.opts.Features.EnableBatching || len(queue) == 1 {
		msg := queue[0]
		o.queues[agentID] = append([]AgentMessage(nil), queue[1:]...)
		return []AgentMessage{msg}
	}

	firstSender := queue[0].From
	idx := 0
	for idx < len(queue) && queue[idx].From == firstSender {
		idx++
	}
	batch := append([]AgentMessage(nil), queue[:idx]...)
	o.queues[agentID] = append([]AgentMessage(nil), queue[idx:]...)
	return batch
}

func (o *Orchestrator) startAgentWithBatch(agentID string, batch []AgentMessage) error {
	oduName := o.getODUName(agentID)

	o.mu.Lock()
	registration := o.oduFactories[oduName]
	o.mu.Unlock()
	if registration.Factory == nil {
		return fmt.Errorf("odu not registered: %s (for agent %s)", oduName, agentID)
	}

	task := formatBatchTask(batch, o.getDeliveryMode(agentID))
	_ = o.registerEA(agentID, o.getDisplayName(agentID), task)
	history := o.loadHistory(agentID)

	worker, err := registration.Factory(agentID, task, history)
	if err != nil {
		return err
	}
	if worker == nil {
		return fmt.Errorf("agent factory returned nil worker")
	}

	ctx, cancel := context.WithCancelCause(context.Background())
	rw := &runningWorker{
		agentID:   agentID,
		worker:    worker,
		startedAt: time.Now().UTC(),
		status:    SessionStatusActive,
		ctx:       ctx,
		cancel:    cancel,
		done:      make(chan struct{}),
		queueIDs:  batchMessageIDs(batch),
	}

	var (
		statusChanged bool
		oldStatus     SessionStatus
	)
	o.mu.Lock()
	o.running[agentID] = rw
	oldStatus, statusChanged = o.setAgentStatusLocked(agentID, SessionStatusActive)
	o.mu.Unlock()
	if statusChanged {
		o.emit(BrokerEventAgentStatusChanged, map[string]any{
			"agent_id":   agentID,
			"old_status": oldStatus,
			"new_status": SessionStatusActive,
			"timestamp":  nowUnixMilli(),
		})
	}

	startedAt := nowUnixMilli()
	for _, msg := range batch {
		_ = o.persistQueueStatus(msg.ID, "processing", &startedAt, nil, "")
	}

	o.emit(BrokerEventAgentStarted, map[string]any{
		"agent_id":   agentID,
		"odu_name":   oduName,
		"timestamp":  rw.startedAt.UnixMilli(),
		"queue_size": len(batch),
	})

	go o.runWorker(rw, batch)
	return nil
}

func (o *Orchestrator) runWorker(rw *runningWorker, batch []AgentMessage) {
	defer close(rw.done)

	output, err := rw.worker.Execute(rw.ctx)
	completedAt := time.Now().UTC()

	preempted := false
	statusChanged := false
	oldStatus := SessionStatusIdle
	o.mu.Lock()
	if live := o.running[rw.agentID]; live == rw {
		preempted = live.preempted
		delete(o.running, rw.agentID)
		oldStatus, statusChanged = o.setAgentStatusLocked(rw.agentID, SessionStatusIdle)
	}
	o.mu.Unlock()
	if statusChanged {
		o.emit(BrokerEventAgentStatusChanged, map[string]any{
			"agent_id":   rw.agentID,
			"old_status": oldStatus,
			"new_status": SessionStatusIdle,
			"timestamp":  nowUnixMilli(),
		})
	}

	status := "completed"
	errText := ""
	if err != nil {
		if preempted || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			status = "cancelled"
			errText = "interrupted"
		} else {
			status = "failed"
			errText = err.Error()
		}
	}

	completedMS := completedAt.UnixMilli()
	for _, msg := range batch {
		_ = o.persistQueueStatus(msg.ID, status, nil, &completedMS, errText)
	}

	result := AgentResult{
		AgentID:      rw.agentID,
		SessionLabel: rw.agentID,
		Status:       status,
		Output:       strings.TrimSpace(output),
		Error:        errText,
		StartedAt:    rw.startedAt,
		CompletedAt:  completedAt,
	}
	o.emit(BrokerEventAgentCompleted, map[string]any{
		"agent_id":   rw.agentID,
		"odu_name":   o.getODUName(rw.agentID),
		"timestamp":  completedMS,
		"success":    status == "completed",
		"error":      errText,
		"preempted":  preempted,
		"output_len": len(result.Output),
	})
	o.notifyCompletion(rw.agentID, result)
	o.maybeStartProcessing(rw.agentID)
}

func (o *Orchestrator) interruptAndRestart(agentID string) {
	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		return
	}
	o.mu.Lock()
	rw := o.running[agentID]
	if rw != nil {
		rw.preempted = true
	}
	o.mu.Unlock()
	if rw == nil {
		o.maybeStartProcessing(agentID)
		return
	}

	if interruptible, ok := rw.worker.(InterruptibleWorker); ok {
		interruptible.Interrupt()
	}
	rw.cancel(errors.New("interrupted by newer message"))
}

func (o *Orchestrator) deliverToIA(msg AgentMessage, ia InteractionAgent) {
	started := nowUnixMilli()
	_ = o.persistQueueStatus(msg.ID, "processing", &started, nil, "")
	ia.QueueMessage(msg.Content, msg.Priority, msg.From)

	if proc, ok := ia.(ProcessQueueAgent); ok {
		go func() {
			if _, err := proc.ProcessQueue(context.Background()); err != nil {
				completed := nowUnixMilli()
				_ = o.persistQueueStatus(msg.ID, "failed", nil, &completed, err.Error())
				return
			}
			completed := nowUnixMilli()
			_ = o.persistQueueStatus(msg.ID, "completed", nil, &completed, "")
		}()
		return
	}
	if syncer, ok := ia.(ChatSyncAgent); ok {
		go func() {
			if err := syncer.ChatSync(context.Background(), ""); err != nil {
				completed := nowUnixMilli()
				_ = o.persistQueueStatus(msg.ID, "failed", nil, &completed, err.Error())
				return
			}
			completed := nowUnixMilli()
			_ = o.persistQueueStatus(msg.ID, "completed", nil, &completed, "")
		}()
		return
	}
	completed := nowUnixMilli()
	_ = o.persistQueueStatus(msg.ID, "completed", nil, &completed, "")
}

func (o *Orchestrator) registerEA(agentID string, displayName string, task string) error {
	if o.broker == nil {
		return nil
	}
	if o.broker.ledgerDB() == nil {
		_, err := o.broker.RegisterOrUpdateAgent(agentID, RoleLeafMapper, "")
		return err
	}
	_, err := o.broker.CreateSession(agentID, SessionOptions{
		PersonaID:       firstNonBlank(displayName, "agent"),
		TaskDescription: strings.TrimSpace(task),
		TaskStatus:      "running",
		Origin:          "orchestrator",
		Status:          "active",
	})
	return err
}

func (o *Orchestrator) loadHistory(agentID string) []AgentHistoryEntry {
	if o.broker == nil || o.broker.ledgerDB() == nil {
		return nil
	}
	turns, err := o.broker.GetSessionHistory(agentID)
	if err != nil || len(turns) == 0 {
		return nil
	}
	history := make([]AgentHistoryEntry, 0, len(turns)*2)
	for _, turn := range turns {
		if turn == nil {
			continue
		}
		_, messages, _, err := o.broker.GetTurnDetails(turn.ID)
		if err != nil {
			continue
		}
		for _, msg := range messages {
			if msg == nil || strings.TrimSpace(msg.Content) == "" {
				continue
			}
			history = append(history, AgentHistoryEntry{
				Role:      msg.Role,
				Content:   msg.Content,
				Timestamp: msg.CreatedAt,
			})
		}
	}
	return history
}

func (o *Orchestrator) notifyCompletion(agentID string, result AgentResult) {
	o.mu.Lock()
	waiters := append([]chan AgentResult(nil), o.completionWaiters[agentID]...)
	delete(o.completionWaiters, agentID)
	o.mu.Unlock()

	for _, ch := range waiters {
		select {
		case ch <- result:
		default:
		}
		close(ch)
	}
}

func (o *Orchestrator) emit(event string, payload any) {
	event = strings.TrimSpace(event)
	if event == "" {
		return
	}
	o.mu.Lock()
	handlers := append([]orchestratorEventHandler(nil), o.eventHandlers[event]...)
	o.mu.Unlock()
	for _, item := range handlers {
		func(h func(any)) {
			defer func() { _ = recover() }()
			h(payload)
		}(item.handler)
	}
}

func (o *Orchestrator) setAgentStatusLocked(agentID string, status SessionStatus) (SessionStatus, bool) {
	old := o.agentStatus[agentID]
	o.agentStatus[agentID] = status
	return old, old != status
}

func (o *Orchestrator) getODUName(agentID string) string {
	parts := strings.Split(strings.TrimSpace(agentID), "-")
	if len(parts) < 2 {
		return ""
	}
	return parts[0]
}

func (o *Orchestrator) getDisplayName(agentID string) string {
	parts := strings.Split(strings.TrimSpace(agentID), "-")
	if len(parts) >= 3 && parts[1] == "ea" {
		return strings.Join(parts[2:], "-")
	}
	return strings.TrimSpace(agentID)
}

func (o *Orchestrator) getDeliveryMode(agentID string) string {
	o.mu.Lock()
	mode := o.deliveryMode[agentID]
	o.mu.Unlock()
	if mode == "" {
		return "batch"
	}
	return mode
}

func formatBatchTask(batch []AgentMessage, mode string) string {
	if len(batch) == 0 {
		return ""
	}
	mode = strings.ToLower(strings.TrimSpace(mode))
	if mode == "single" || len(batch) == 1 {
		return batch[0].Content
	}
	parts := make([]string, 0, len(batch))
	for i, msg := range batch {
		parts = append(parts, fmt.Sprintf("Message %d:\n%s", i+1, msg.Content))
	}
	return strings.Join(parts, "\n\n---\n\n")
}

func batchMessageIDs(batch []AgentMessage) []string {
	out := make([]string, 0, len(batch))
	for _, msg := range batch {
		if strings.TrimSpace(msg.ID) != "" {
			out = append(out, msg.ID)
		}
	}
	return out
}

func (o *Orchestrator) persistQueueEnqueue(msg AgentMessage) error {
	if o.broker == nil || o.broker.ledgerDB() == nil {
		return nil
	}
	_, _ = o.broker.CreateSession(msg.To, SessionOptions{
		PersonaID: firstNonBlank(o.getDisplayName(msg.To), "agent"),
		Origin:    "queue",
		Status:    "active",
	})
	payload := map[string]any{
		"id":              msg.ID,
		"from":            msg.From,
		"to":              msg.To,
		"content":         msg.Content,
		"priority":        msg.Priority,
		"delivery_mode":   msg.DeliveryMode,
		"timestamp_unix":  msg.Timestamp.UnixMilli(),
		"conversation_id": msg.ConversationID,
		"metadata":        msg.Metadata,
	}
	raw, _ := json.Marshal(payload)
	return o.broker.enqueue(QueueItemWrite{
		ID:           msg.ID,
		SessionLabel: msg.To,
		MessageJSON:  string(raw),
		Mode:         string(msg.DeliveryMode),
		Status:       "queued",
		EnqueuedAt:   msg.Timestamp.UnixMilli(),
	})
}

func (o *Orchestrator) persistQueueStatus(id string, status string, startedAt *int64, completedAt *int64, errText string) error {
	if o.broker == nil || o.broker.ledgerDB() == nil {
		return nil
	}
	return o.broker.updateQueueItemStatus(id, status, startedAt, completedAt, errText)
}

func (o *Orchestrator) loadPersistedQueues() {
	if o == nil || o.broker == nil || o.broker.ledgerDB() == nil {
		return
	}
	var pending []AgentMessage
	loadByStatus := func(status string) {
		items, err := o.broker.listQueueItems(QueueFilter{
			Status: status,
			Limit:  10000,
		})
		if err != nil {
			return
		}
		for _, item := range items {
			msg, ok := parsePersistedQueueMessage(item)
			if !ok {
				continue
			}
			if status == "processing" {
				// Process died mid-run; reset the durable item back to queued.
				_ = o.persistQueueStatus(msg.ID, "queued", nil, nil, "")
			}
			pending = append(pending, msg)
		}
	}
	loadByStatus("queued")
	loadByStatus("processing")

	if len(pending) == 0 {
		return
	}

	o.mu.Lock()
	for _, msg := range pending {
		o.queues[msg.To] = append(o.queues[msg.To], msg)
	}
	for target, queue := range o.queues {
		if o.opts.Features.EnablePriorityQueue {
			sort.Slice(queue, func(i, j int) bool {
				pi := priorityOrder(queue[i].Priority)
				pj := priorityOrder(queue[j].Priority)
				if pi != pj {
					return pi < pj
				}
				if !queue[i].Timestamp.Equal(queue[j].Timestamp) {
					return queue[i].Timestamp.Before(queue[j].Timestamp)
				}
				return queue[i].ID < queue[j].ID
			})
		}
		o.queues[target] = queue
	}
	o.mu.Unlock()

	for target := range o.queues {
		o.maybeStartProcessing(target)
	}
}

func parsePersistedQueueMessage(item *QueueItem) (AgentMessage, bool) {
	if item == nil {
		return AgentMessage{}, false
	}
	msg := AgentMessage{
		ID:           strings.TrimSpace(item.ID),
		To:           strings.TrimSpace(item.SessionLabel),
		SessionLabel: strings.TrimSpace(item.SessionLabel),
		DeliveryMode: QueueMode(strings.TrimSpace(item.Mode)),
		Mode:         strings.TrimSpace(item.Mode),
		Timestamp:    item.EnqueuedAt.UTC(),
		Priority:     PriorityNormal,
	}
	var payload struct {
		ID             string                 `json:"id"`
		From           string                 `json:"from"`
		To             string                 `json:"to"`
		Content        string                 `json:"content"`
		Priority       string                 `json:"priority"`
		DeliveryMode   string                 `json:"delivery_mode"`
		TimestampUnix  int64                  `json:"timestamp_unix"`
		ConversationID string                 `json:"conversation_id"`
		Metadata       map[string]interface{} `json:"metadata"`
	}
	if err := json.Unmarshal([]byte(item.MessageJSON), &payload); err == nil {
		if strings.TrimSpace(payload.ID) != "" {
			msg.ID = strings.TrimSpace(payload.ID)
		}
		if strings.TrimSpace(payload.From) != "" {
			msg.From = strings.TrimSpace(payload.From)
		}
		if strings.TrimSpace(payload.To) != "" {
			msg.To = strings.TrimSpace(payload.To)
			msg.SessionLabel = msg.To
		}
		if strings.TrimSpace(payload.Content) != "" {
			msg.Content = strings.TrimSpace(payload.Content)
		}
		switch MessagePriority(strings.ToLower(strings.TrimSpace(payload.Priority))) {
		case PriorityUrgent, PriorityHigh, PriorityNormal, PriorityLow:
			msg.Priority = MessagePriority(strings.ToLower(strings.TrimSpace(payload.Priority)))
		}
		if mode := strings.ToLower(strings.TrimSpace(payload.DeliveryMode)); mode != "" {
			msg.DeliveryMode = QueueMode(mode)
			msg.Mode = mode
		}
		if payload.TimestampUnix > 0 {
			msg.Timestamp = fromUnixMilli(payload.TimestampUnix).UTC()
		}
		msg.ConversationID = strings.TrimSpace(payload.ConversationID)
		msg.Metadata = payload.Metadata
	}
	if strings.TrimSpace(msg.ID) == "" {
		msg.ID = "queue:" + uuid.NewString()
	}
	if strings.TrimSpace(msg.Content) == "" {
		// Legacy payloads may only have {"content": "..."} with no typed envelope.
		var legacy map[string]any
		if err := json.Unmarshal([]byte(item.MessageJSON), &legacy); err == nil {
			if raw, ok := legacy["content"]; ok {
				msg.Content = strings.TrimSpace(fmt.Sprintf("%v", raw))
			}
		}
	}
	if strings.TrimSpace(msg.Content) == "" || strings.TrimSpace(msg.To) == "" {
		return AgentMessage{}, false
	}
	if msg.Timestamp.IsZero() {
		msg.Timestamp = time.Now().UTC()
	}
	if strings.TrimSpace(msg.From) == "" {
		msg.From = "user"
	}
	return msg, true
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
