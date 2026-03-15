package cron

import (
	"context"
	"database/sql"
	"log/slog"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Napageneral/nexus/internal/pipeline"
	_ "github.com/mattn/go-sqlite3"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
}

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "runtime.db")
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=ON")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func testStore(t *testing.T) *Store {
	t.Helper()
	db := testDB(t)
	s := NewStore(db, testLogger())
	ctx := context.Background()
	if err := s.Initialize(ctx); err != nil {
		t.Fatalf("Initialize: %v", err)
	}
	return s
}

func TestStoreCreation(t *testing.T) {
	s := testStore(t)
	if s == nil {
		t.Fatal("testStore returned nil")
	}
}

func TestScheduleCreateAndList(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	nextRun := time.Now().Add(time.Hour).Truncate(time.Millisecond)

	sched := Schedule{
		ID:         "test-1",
		Name:       "hourly-check",
		Expression: "0 * * * *",
		Operation:  "system.health-check",
		Payload:    `{"target":"all"}`,
		AgentID:    "default",
		Enabled:    true,
		NextRun:    &nextRun,
	}
	if err := s.Create(ctx, sched); err != nil {
		t.Fatalf("Create: %v", err)
	}

	list, err := s.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("got %d schedules, want 1", len(list))
	}

	got := list[0]
	if got.ID != "test-1" {
		t.Errorf("ID = %q, want test-1", got.ID)
	}
	if got.Name != "hourly-check" {
		t.Errorf("Name = %q, want hourly-check", got.Name)
	}
	if got.Expression != "0 * * * *" {
		t.Errorf("Expression = %q, want '0 * * * *'", got.Expression)
	}
	if got.Operation != "system.health-check" {
		t.Errorf("Operation = %q, want system.health-check", got.Operation)
	}
	if !got.Enabled {
		t.Error("Enabled = false, want true")
	}
	if got.NextRun == nil {
		t.Error("NextRun is nil")
	}
}

func TestScheduleGetAndUpdate(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	sched := Schedule{
		ID:         "test-2",
		Name:       "daily-report",
		Expression: "0 9 * * *",
		Operation:  "report.generate",
		Payload:    "{}",
		AgentID:    "default",
		Enabled:    true,
	}
	if err := s.Create(ctx, sched); err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := s.Get(ctx, "test-2")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got == nil {
		t.Fatal("Get returned nil")
	}
	if got.Name != "daily-report" {
		t.Errorf("Name = %q, want daily-report", got.Name)
	}

	// Update the schedule.
	got.Name = "weekly-report"
	got.Expression = "0 9 * * 1"
	got.Enabled = false
	if err := s.Update(ctx, *got); err != nil {
		t.Fatalf("Update: %v", err)
	}

	updated, err := s.Get(ctx, "test-2")
	if err != nil {
		t.Fatalf("Get after update: %v", err)
	}
	if updated.Name != "weekly-report" {
		t.Errorf("Name after update = %q, want weekly-report", updated.Name)
	}
	if updated.Expression != "0 9 * * 1" {
		t.Errorf("Expression after update = %q, want '0 9 * * 1'", updated.Expression)
	}
	if updated.Enabled {
		t.Error("Enabled after update = true, want false")
	}

	// Get non-existent should return nil.
	missing, err := s.Get(ctx, "nonexistent")
	if err != nil {
		t.Fatalf("Get nonexistent: %v", err)
	}
	if missing != nil {
		t.Error("Get nonexistent should return nil")
	}
}

func TestScheduleDelete(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	sched := Schedule{
		ID:         "test-3",
		Name:       "to-delete",
		Expression: "* * * * *",
		Operation:  "test.op",
		Payload:    "{}",
		Enabled:    true,
	}
	if err := s.Create(ctx, sched); err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := s.Delete(ctx, "test-3"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	got, err := s.Get(ctx, "test-3")
	if err != nil {
		t.Fatalf("Get after delete: %v", err)
	}
	if got != nil {
		t.Error("schedule should be nil after delete")
	}

	// Delete non-existent should error.
	err = s.Delete(ctx, "nonexistent")
	if err == nil {
		t.Error("Delete nonexistent should return error")
	}
}

func TestScheduleMarkRun(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	sched := Schedule{
		ID:         "test-4",
		Name:       "mark-run-test",
		Expression: "every 5m",
		Operation:  "test.op",
		Payload:    "{}",
		Enabled:    true,
		RunCount:   0,
	}
	if err := s.Create(ctx, sched); err != nil {
		t.Fatalf("Create: %v", err)
	}

	nextRun := time.Now().Add(5 * time.Minute)
	if err := s.MarkRun(ctx, "test-4", nextRun); err != nil {
		t.Fatalf("MarkRun: %v", err)
	}

	got, err := s.Get(ctx, "test-4")
	if err != nil {
		t.Fatalf("Get after MarkRun: %v", err)
	}
	if got.RunCount != 1 {
		t.Errorf("RunCount = %d, want 1", got.RunCount)
	}
	if got.LastRun == nil {
		t.Error("LastRun is nil after MarkRun")
	}
	if got.NextRun == nil {
		t.Error("NextRun is nil after MarkRun")
	}

	// Mark again.
	if err := s.MarkRun(ctx, "test-4", nextRun); err != nil {
		t.Fatalf("MarkRun (second): %v", err)
	}
	got, _ = s.Get(ctx, "test-4")
	if got.RunCount != 2 {
		t.Errorf("RunCount = %d, want 2", got.RunCount)
	}
}

func TestParseCron(t *testing.T) {
	// Use a fixed reference time: 2025-01-15 10:30:00 UTC (Wednesday).
	ref := time.Date(2025, 1, 15, 10, 30, 0, 0, time.UTC)

	tests := []struct {
		name string
		expr string
		want time.Time
	}{
		{
			name: "every minute",
			expr: "* * * * *",
			want: time.Date(2025, 1, 15, 10, 31, 0, 0, time.UTC),
		},
		{
			name: "hourly at minute 0",
			expr: "0 * * * *",
			want: time.Date(2025, 1, 15, 11, 0, 0, 0, time.UTC),
		},
		{
			name: "daily at 9:00",
			expr: "0 9 * * *",
			want: time.Date(2025, 1, 16, 9, 0, 0, 0, time.UTC),
		},
		{
			name: "specific minute and hour",
			expr: "15 14 * * *",
			want: time.Date(2025, 1, 15, 14, 15, 0, 0, time.UTC),
		},
		{
			name: "every 5 minutes",
			expr: "*/5 * * * *",
			want: time.Date(2025, 1, 15, 10, 35, 0, 0, time.UTC),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseCron(tt.expr, ref)
			if err != nil {
				t.Fatalf("ParseCron(%q): %v", tt.expr, err)
			}
			if !got.Equal(tt.want) {
				t.Errorf("ParseCron(%q, %v) = %v, want %v", tt.expr, ref, got, tt.want)
			}
		})
	}

	// Test invalid expressions.
	_, err := ParseCron("invalid", ref)
	if err == nil {
		t.Error("expected error for invalid expression")
	}

	_, err = ParseCron("* * *", ref)
	if err == nil {
		t.Error("expected error for 3-field expression")
	}
}

func TestParseInterval(t *testing.T) {
	ref := time.Date(2025, 1, 15, 10, 0, 0, 0, time.UTC)

	tests := []struct {
		name string
		expr string
		want time.Time
	}{
		{
			name: "every 5 minutes",
			expr: "every 5m",
			want: ref.Add(5 * time.Minute),
		},
		{
			name: "every 1 hour",
			expr: "every 1h",
			want: ref.Add(time.Hour),
		},
		{
			name: "every 30 seconds",
			expr: "every 30s",
			want: ref.Add(30 * time.Second),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseInterval(tt.expr, ref)
			if err != nil {
				t.Fatalf("ParseInterval(%q): %v", tt.expr, err)
			}
			if !got.Equal(tt.want) {
				t.Errorf("ParseInterval(%q, %v) = %v, want %v", tt.expr, ref, got, tt.want)
			}
		})
	}

	// Invalid interval.
	_, err := ParseInterval("not-an-interval", ref)
	if err == nil {
		t.Error("expected error for invalid interval")
	}
}

func TestNextRun(t *testing.T) {
	ref := time.Date(2025, 1, 15, 10, 30, 0, 0, time.UTC)

	// Cron expression.
	cronNext, err := NextRun("0 * * * *", ref)
	if err != nil {
		t.Fatalf("NextRun cron: %v", err)
	}
	wantCron := time.Date(2025, 1, 15, 11, 0, 0, 0, time.UTC)
	if !cronNext.Equal(wantCron) {
		t.Errorf("NextRun cron = %v, want %v", cronNext, wantCron)
	}

	// Interval expression.
	intervalNext, err := NextRun("every 10m", ref)
	if err != nil {
		t.Fatalf("NextRun interval: %v", err)
	}
	wantInterval := ref.Add(10 * time.Minute)
	if !intervalNext.Equal(wantInterval) {
		t.Errorf("NextRun interval = %v, want %v", intervalNext, wantInterval)
	}
}

// mockDispatcher records dispatched events for testing.
type mockDispatcher struct {
	calls atomic.Int32
}

func (m *mockDispatcher) HandleEvent(_ context.Context, _ *pipeline.NexusRequest) error {
	m.calls.Add(1)
	return nil
}

func TestServiceStartStop(t *testing.T) {
	store := testStore(t)
	dispatcher := &mockDispatcher{}
	svc := NewService(store, dispatcher, testLogger())

	if svc.Name() != "cron" {
		t.Errorf("Name() = %q, want cron", svc.Name())
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := svc.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// Give it a moment to start the goroutine.
	time.Sleep(50 * time.Millisecond)

	if err := svc.Stop(ctx); err != nil {
		t.Fatalf("Stop: %v", err)
	}
}

func TestServiceTick(t *testing.T) {
	store := testStore(t)
	dispatcher := &mockDispatcher{}
	svc := NewService(store, dispatcher, testLogger())

	ctx := context.Background()

	// Create a schedule that is due now.
	pastTime := time.Now().Add(-time.Minute)
	sched := Schedule{
		ID:         "tick-test-1",
		Name:       "due-now",
		Expression: "every 5m",
		Operation:  "test.tick",
		Payload:    "{}",
		Enabled:    true,
		NextRun:    &pastTime,
	}
	if err := store.Create(ctx, sched); err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Manually trigger a tick.
	svc.tick(ctx)

	if dispatcher.calls.Load() != 1 {
		t.Errorf("dispatcher called %d times, want 1", dispatcher.calls.Load())
	}

	// Verify the schedule was updated.
	updated, err := store.Get(ctx, "tick-test-1")
	if err != nil {
		t.Fatalf("Get after tick: %v", err)
	}
	if updated.RunCount != 1 {
		t.Errorf("RunCount = %d, want 1", updated.RunCount)
	}
	if updated.LastRun == nil {
		t.Error("LastRun is nil after tick")
	}

	// A schedule with NextRun in the future should not fire.
	futureTime := time.Now().Add(time.Hour)
	sched2 := Schedule{
		ID:         "tick-test-2",
		Name:       "not-due",
		Expression: "every 1h",
		Operation:  "test.future",
		Payload:    "{}",
		Enabled:    true,
		NextRun:    &futureTime,
	}
	if err := store.Create(ctx, sched2); err != nil {
		t.Fatalf("Create: %v", err)
	}

	dispatcher.calls.Store(0)
	svc.tick(ctx)

	// tick-test-1 might fire again if its new NextRun is in the past (unlikely for 5m).
	// tick-test-2 should not fire.
	got2, _ := store.Get(ctx, "tick-test-2")
	if got2.RunCount != 0 {
		t.Errorf("future schedule RunCount = %d, want 0", got2.RunCount)
	}
}
