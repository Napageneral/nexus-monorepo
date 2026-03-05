package broker

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"
)

type workerFunc func(ctx context.Context) (string, error)

func (f workerFunc) Execute(ctx context.Context) (string, error) { return f(ctx) }

type steerWorkerStub struct {
	mu      sync.Mutex
	release chan struct{}
	steers  []string
}

func (s *steerWorkerStub) Execute(ctx context.Context) (string, error) {
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case <-s.release:
		return "ok", nil
	}
}

func (s *steerWorkerStub) Steer(_ context.Context, message string) error {
	s.mu.Lock()
	s.steers = append(s.steers, strings.TrimSpace(message))
	s.mu.Unlock()
	return nil
}

func (s *steerWorkerStub) Steers() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]string, len(s.steers))
	copy(out, s.steers)
	return out
}

type iaStub struct {
	mu       sync.Mutex
	messages []string
	ack      string
}

func (i *iaStub) QueueMessage(content string, _ MessagePriority, _ string) {
	i.mu.Lock()
	i.messages = append(i.messages, content)
	i.mu.Unlock()
}

func (i *iaStub) ProcessQueue(context.Context) (string, error) {
	i.mu.Lock()
	defer i.mu.Unlock()
	return i.ack, nil
}

func waitFor(t *testing.T, timeout time.Duration, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("condition not met within %s", timeout)
}

func TestOrchestrator_BatchMode(t *testing.T) {
	db := openLedgerTestDB(t)
	b, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	orch := b.ConfigureOrchestrator(DefaultOrchestratorOpts())

	var (
		mu      sync.Mutex
		tasks   []string
		release []chan struct{}
	)
	err = orch.RegisterODU("test", "", func(_ string, task string, _ []AgentHistoryEntry) (WorkerAgent, error) {
		ch := make(chan struct{})
		mu.Lock()
		tasks = append(tasks, task)
		release = append(release, ch)
		mu.Unlock()
		return workerFunc(func(ctx context.Context) (string, error) {
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-ch:
				return "done", nil
			}
		}), nil
	})
	if err != nil {
		t.Fatalf("register odu: %v", err)
	}

	if err := orch.Send(AgentMessage{From: "user", To: "test-ea-task1", Content: "Message 1"}); err != nil {
		t.Fatalf("send 1: %v", err)
	}
	waitFor(t, 2*time.Second, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return len(tasks) == 1
	})

	if err := orch.Send(AgentMessage{From: "user", To: "test-ea-task1", Content: "Message 2"}); err != nil {
		t.Fatalf("send 2: %v", err)
	}
	if err := orch.Send(AgentMessage{From: "user", To: "test-ea-task1", Content: "Message 3"}); err != nil {
		t.Fatalf("send 3: %v", err)
	}

	mu.Lock()
	close(release[0])
	mu.Unlock()

	waitFor(t, 2*time.Second, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return len(tasks) == 2
	})

	mu.Lock()
	second := tasks[1]
	close(release[1])
	mu.Unlock()
	if second != "Message 1:\nMessage 2\n\n---\n\nMessage 2:\nMessage 3" {
		t.Fatalf("unexpected batched task: %q", second)
	}
}

func TestOrchestrator_SingleMode(t *testing.T) {
	db := openLedgerTestDB(t)
	b, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	orch := b.ConfigureOrchestrator(DefaultOrchestratorOpts())
	orch.SetDeliveryMode("test-ea-task1", "single")

	var (
		mu      sync.Mutex
		tasks   []string
		release []chan struct{}
	)
	err = orch.RegisterODU("test", "", func(_ string, task string, _ []AgentHistoryEntry) (WorkerAgent, error) {
		ch := make(chan struct{})
		mu.Lock()
		tasks = append(tasks, task)
		release = append(release, ch)
		mu.Unlock()
		return workerFunc(func(ctx context.Context) (string, error) {
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-ch:
				return "ok", nil
			}
		}), nil
	})
	if err != nil {
		t.Fatalf("register odu: %v", err)
	}

	if err := orch.Send(AgentMessage{From: "user", To: "test-ea-task1", Content: "A"}); err != nil {
		t.Fatalf("send A: %v", err)
	}
	waitFor(t, 2*time.Second, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return len(tasks) == 1
	})
	if err := orch.Send(AgentMessage{From: "user", To: "test-ea-task1", Content: "B"}); err != nil {
		t.Fatalf("send B: %v", err)
	}
	if err := orch.Send(AgentMessage{From: "user", To: "test-ea-task1", Content: "C"}); err != nil {
		t.Fatalf("send C: %v", err)
	}

	mu.Lock()
	close(release[0])
	mu.Unlock()
	waitFor(t, 2*time.Second, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return len(tasks) == 2
	})
	mu.Lock()
	close(release[1])
	mu.Unlock()
	waitFor(t, 2*time.Second, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return len(tasks) == 3
	})
	mu.Lock()
	third := tasks[2]
	close(release[2])
	mu.Unlock()
	if third != "C" {
		t.Fatalf("expected single message in third task, got %q", third)
	}
}

func TestOrchestrator_InterruptMode(t *testing.T) {
	db := openLedgerTestDB(t)
	b, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	orch := b.ConfigureOrchestrator(DefaultOrchestratorOpts())

	var (
		mu         sync.Mutex
		started    int
		releaseRun = make(chan struct{})
	)
	err = orch.RegisterODU("test", "", func(_ string, _ string, _ []AgentHistoryEntry) (WorkerAgent, error) {
		mu.Lock()
		started++
		runNo := started
		mu.Unlock()
		return workerFunc(func(ctx context.Context) (string, error) {
			if runNo == 1 {
				select {
				case <-ctx.Done():
					return "", ctx.Err()
				case <-releaseRun:
				}
			}
			return "ok", nil
		}), nil
	})
	if err != nil {
		t.Fatalf("register odu: %v", err)
	}

	if err := orch.Send(AgentMessage{
		ID:      "m1",
		From:    "user",
		To:      "test-ea-task1",
		Content: "slow work",
	}); err != nil {
		t.Fatalf("send m1: %v", err)
	}
	waitFor(t, 2*time.Second, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return started == 1
	})

	if err := orch.Send(AgentMessage{
		ID:           "m2",
		From:         "user",
		To:           "test-ea-task1",
		Content:      "urgent work",
		DeliveryMode: QueueModeInterrupt,
		Priority:     PriorityUrgent,
	}); err != nil {
		t.Fatalf("send m2: %v", err)
	}

	waitFor(t, 2*time.Second, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return started >= 2
	})
	close(releaseRun)
}

func TestOrchestrator_SteerMode_InFlightSteeringWorker(t *testing.T) {
	db := openLedgerTestDB(t)
	b, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	orch := b.ConfigureOrchestrator(DefaultOrchestratorOpts())

	var (
		mu      sync.Mutex
		started int
		workers []*steerWorkerStub
	)
	err = orch.RegisterODU("test", "", func(_ string, _ string, _ []AgentHistoryEntry) (WorkerAgent, error) {
		w := &steerWorkerStub{release: make(chan struct{})}
		mu.Lock()
		started++
		workers = append(workers, w)
		mu.Unlock()
		return w, nil
	})
	if err != nil {
		t.Fatalf("register odu: %v", err)
	}

	if err := orch.Send(AgentMessage{
		ID:      "s1",
		From:    "user",
		To:      "test-ea-task1",
		Content: "initial run",
	}); err != nil {
		t.Fatalf("send s1: %v", err)
	}
	waitFor(t, 2*time.Second, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return started == 1 && len(workers) == 1
	})

	if err := orch.Send(AgentMessage{
		ID:           "s2",
		From:         "user",
		To:           "test-ea-task1",
		Content:      "steer this now",
		DeliveryMode: QueueModeSteer,
	}); err != nil {
		t.Fatalf("send steer: %v", err)
	}
	waitFor(t, 2*time.Second, func() bool {
		mu.Lock()
		if len(workers) == 0 {
			mu.Unlock()
			return false
		}
		w := workers[0]
		mu.Unlock()
		return len(w.Steers()) == 1
	})

	mu.Lock()
	w := workers[0]
	mu.Unlock()
	steers := w.Steers()
	if len(steers) != 1 || steers[0] != "steer this now" {
		t.Fatalf("unexpected steer payloads: %#v", steers)
	}

	close(w.release)
	time.Sleep(150 * time.Millisecond)
	mu.Lock()
	gotStarted := started
	mu.Unlock()
	if gotStarted != 1 {
		t.Fatalf("expected no restart for in-flight steer, started=%d", gotStarted)
	}
}

func TestOrchestrator_SteerMode_FallsBackToInterruptWhenUnsupported(t *testing.T) {
	db := openLedgerTestDB(t)
	b, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	orch := b.ConfigureOrchestrator(DefaultOrchestratorOpts())

	var (
		mu         sync.Mutex
		started    int
		releaseRun = make(chan struct{})
	)
	err = orch.RegisterODU("test", "", func(_ string, _ string, _ []AgentHistoryEntry) (WorkerAgent, error) {
		mu.Lock()
		started++
		runNo := started
		mu.Unlock()
		return workerFunc(func(ctx context.Context) (string, error) {
			if runNo == 1 {
				select {
				case <-ctx.Done():
					return "", ctx.Err()
				case <-releaseRun:
				}
			}
			return "ok", nil
		}), nil
	})
	if err != nil {
		t.Fatalf("register odu: %v", err)
	}

	if err := orch.Send(AgentMessage{
		ID:      "f1",
		From:    "user",
		To:      "test-ea-task1",
		Content: "slow work",
	}); err != nil {
		t.Fatalf("send f1: %v", err)
	}
	waitFor(t, 2*time.Second, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return started == 1
	})

	if err := orch.Send(AgentMessage{
		ID:           "f2",
		From:         "user",
		To:           "test-ea-task1",
		Content:      "steer fallback",
		DeliveryMode: QueueModeSteer,
	}); err != nil {
		t.Fatalf("send f2 steer fallback: %v", err)
	}

	waitFor(t, 2*time.Second, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return started >= 2
	})
	close(releaseRun)
}

func TestOrchestrator_CollectMode(t *testing.T) {
	db := openLedgerTestDB(t)
	b, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	opts := DefaultOrchestratorOpts()
	opts.CollectDebounce = 40 * time.Millisecond
	orch := b.ConfigureOrchestrator(opts)

	var (
		mu    sync.Mutex
		tasks []string
	)
	err = orch.RegisterODU("test", "", func(_ string, task string, _ []AgentHistoryEntry) (WorkerAgent, error) {
		mu.Lock()
		tasks = append(tasks, task)
		mu.Unlock()
		return workerFunc(func(context.Context) (string, error) { return "ok", nil }), nil
	})
	if err != nil {
		t.Fatalf("register odu: %v", err)
	}

	if err := orch.Send(AgentMessage{From: "user", To: "test-ea-task1", Content: "one", DeliveryMode: QueueModeCollect}); err != nil {
		t.Fatalf("send collect one: %v", err)
	}
	if err := orch.Send(AgentMessage{From: "user", To: "test-ea-task1", Content: "two", DeliveryMode: QueueModeCollect}); err != nil {
		t.Fatalf("send collect two: %v", err)
	}

	waitFor(t, 2*time.Second, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return len(tasks) == 1
	})

	mu.Lock()
	got := tasks[0]
	mu.Unlock()
	if got != "Message 1:\none\n\n---\n\nMessage 2:\ntwo" {
		t.Fatalf("unexpected collect batch task: %q", got)
	}
}

func TestOrchestrator_RoutingAndExternalCallers(t *testing.T) {
	db := openLedgerTestDB(t)
	b, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	orch := b.ConfigureOrchestrator(DefaultOrchestratorOpts())

	var (
		mu      sync.Mutex
		agentID string
	)
	err = orch.RegisterODU("test", "", func(id string, _ string, _ []AgentHistoryEntry) (WorkerAgent, error) {
		mu.Lock()
		agentID = id
		mu.Unlock()
		return workerFunc(func(context.Context) (string, error) { return "ok", nil }), nil
	})
	if err != nil {
		t.Fatalf("register odu: %v", err)
	}

	if err := orch.Send(AgentMessage{
		From:    "test-ea-alpha",
		To:      "beta",
		Content: "hello",
	}); err != nil {
		t.Fatalf("send routed message: %v", err)
	}

	waitFor(t, 2*time.Second, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return agentID != ""
	})
	mu.Lock()
	got := agentID
	mu.Unlock()
	if got != "test-ea-beta" {
		t.Fatalf("expected routed id test-ea-beta, got %q", got)
	}
	callers := orch.GetExternalCallers("test-ea-beta")
	if len(callers) != 1 || callers[0] != "test-ea-alpha" {
		t.Fatalf("unexpected external callers: %#v", callers)
	}
}

func TestOrchestrator_SendAndWaitForAck(t *testing.T) {
	db := openLedgerTestDB(t)
	b, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	orch := b.ConfigureOrchestrator(DefaultOrchestratorOpts())
	ia := &iaStub{ack: "ack"}
	if err := orch.RegisterIA("test-ia", ia); err != nil {
		t.Fatalf("register ia: %v", err)
	}

	ack, err := orch.SendAndWaitForAck(context.Background(), AgentMessage{
		ID:      "ack-1",
		From:    "user",
		To:      "test-ia",
		Content: "ping",
	})
	if err != nil {
		t.Fatalf("send and wait: %v", err)
	}
	if ack != "ack" {
		t.Fatalf("unexpected ack: %q", ack)
	}
}

func TestOrchestrator_SpawnMeeseeks(t *testing.T) {
	db := openLedgerTestDB(t)
	b, err := NewWithDB(db)
	if err != nil {
		t.Fatalf("new broker: %v", err)
	}
	b.SetEngine(&fakeEngine{})
	_, err = b.CreateSession("base-session", SessionOptions{PersonaID: "main", SessionDir: t.TempDir()})
	if err != nil {
		t.Fatalf("create base session: %v", err)
	}
	_, err = b.Execute(context.Background(), "base-session", "seed")
	if err != nil {
		t.Fatalf("seed execute: %v", err)
	}

	orch := b.ConfigureOrchestrator(DefaultOrchestratorOpts())
	out, err := orch.SpawnMeeseeks(context.Background(), MeeseeksOpts{
		BaseSessionLabel: "base-session",
		Task:             "do thing",
		Ephemeral:        true,
	})
	if err != nil {
		t.Fatalf("spawn meeseeks: %v", err)
	}
	if out == nil || out.SessionLabel == "" || out.TurnID == "" {
		t.Fatalf("unexpected meeseeks result: %#v", out)
	}
	sess, err := b.GetSession(out.SessionLabel)
	if err != nil {
		t.Fatalf("load meeseeks session: %v", err)
	}
	if sess.Status != "ephemeral" {
		t.Fatalf("expected ephemeral status, got %q", sess.Status)
	}
}
