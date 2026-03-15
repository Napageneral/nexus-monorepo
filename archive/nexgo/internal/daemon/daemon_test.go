package daemon

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Napageneral/nexus/internal/config"
)

func TestPIDLockAcquireRelease(t *testing.T) {
	tmpDir := t.TempDir()
	pidPath := filepath.Join(tmpDir, "nex.pid")

	lock, err := AcquirePIDLock(pidPath)
	if err != nil {
		t.Fatalf("failed to acquire lock: %v", err)
	}

	// Verify PID file exists and contains our PID
	data, err := os.ReadFile(pidPath)
	if err != nil {
		t.Fatalf("failed to read pid file: %v", err)
	}
	if len(data) == 0 {
		t.Fatal("pid file is empty")
	}

	// Release
	if err := lock.Release(); err != nil {
		t.Fatalf("failed to release lock: %v", err)
	}

	// File should be removed
	if _, err := os.Stat(pidPath); !os.IsNotExist(err) {
		t.Fatal("pid file should be removed after release")
	}
}

func TestPIDLockDoubleAcquire(t *testing.T) {
	tmpDir := t.TempDir()
	pidPath := filepath.Join(tmpDir, "nex.pid")

	lock1, err := AcquirePIDLock(pidPath)
	if err != nil {
		t.Fatalf("failed to acquire first lock: %v", err)
	}
	defer lock1.Release()

	// Second acquire should fail
	_, err = AcquirePIDLock(pidPath)
	if err == nil {
		t.Fatal("expected error for double acquire")
	}
	if !errors.Is(err, ErrAlreadyRunning) {
		t.Fatalf("expected ErrAlreadyRunning, got: %v", err)
	}
}

func TestPIDLockStalePID(t *testing.T) {
	tmpDir := t.TempDir()
	pidPath := filepath.Join(tmpDir, "nex.pid")

	// Write a stale PID (process that doesn't exist)
	if err := os.WriteFile(pidPath, []byte("99999999\n"), 0o644); err != nil {
		t.Fatalf("failed to write stale pid: %v", err)
	}

	// Should succeed because the process doesn't exist
	lock, err := AcquirePIDLock(pidPath)
	if err != nil {
		t.Fatalf("failed to acquire lock with stale pid: %v", err)
	}
	defer lock.Release()
}

// mockService implements Service for testing.
type mockService struct {
	name     string
	started  bool
	stopped  bool
	startErr error
	stopErr  error
}

func (m *mockService) Name() string { return m.name }
func (m *mockService) Start(_ context.Context) error {
	m.started = true
	return m.startErr
}
func (m *mockService) Stop(_ context.Context) error {
	m.stopped = true
	return m.stopErr
}

func TestDaemonStartAndShutdown(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := config.Default()
	paths := config.Paths{
		StateDir: tmpDir,
		PIDFile:  filepath.Join(tmpDir, "nex.pid"),
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	d := New(cfg, paths, logger)

	svc1 := &mockService{name: "test-svc-1"}
	svc2 := &mockService{name: "test-svc-2"}
	d.AddService(svc1)
	d.AddService(svc2)

	// Start in a goroutine with a context we can cancel
	ctx, cancel := context.WithCancel(context.Background())
	errCh := make(chan error, 1)
	go func() {
		errCh <- d.Run(ctx)
	}()

	// Give it time to start
	time.Sleep(100 * time.Millisecond)

	// Services should be started
	if !svc1.started {
		t.Fatal("svc1 should be started")
	}
	if !svc2.started {
		t.Fatal("svc2 should be started")
	}

	// Uptime should be non-zero
	if d.Uptime() == 0 {
		t.Fatal("expected non-zero uptime")
	}

	// Cancel to trigger shutdown
	cancel()

	select {
	case err := <-errCh:
		if err != nil && err != context.Canceled {
			t.Fatalf("unexpected error: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("daemon did not shut down in time")
	}

	// Services should be stopped
	if !svc1.stopped {
		t.Fatal("svc1 should be stopped")
	}
	if !svc2.stopped {
		t.Fatal("svc2 should be stopped")
	}

	// PID file should be cleaned up
	if _, err := os.Stat(paths.PIDFile); !os.IsNotExist(err) {
		t.Fatal("pid file should be removed after shutdown")
	}
}

func TestDaemonServiceStartError(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := config.Default()
	paths := config.Paths{
		StateDir: tmpDir,
		PIDFile:  filepath.Join(tmpDir, "nex.pid"),
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	d := New(cfg, paths, logger)

	failSvc := &mockService{
		name:     "fail-svc",
		startErr: errors.New("start failed"),
	}
	d.AddService(failSvc)

	err := d.Run(context.Background())
	if err == nil {
		t.Fatal("expected error when service fails to start")
	}
}
