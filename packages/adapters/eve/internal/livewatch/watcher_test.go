package livewatch

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestWatcherDetectsWalAndShmChanges(t *testing.T) {
	t.Run("wal", func(t *testing.T) {
		dbPath, cleanup := writeWatcherFixture(t)
		defer cleanup()

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		watcher := New(dbPath, WithPollInterval(5*time.Millisecond), WithDebounce(20*time.Millisecond))
		events := watcher.Events(ctx)

		mutateFile(t, dbPath+"-wal", "wal-change-1")

		event := waitForEvent(t, events, 2*time.Second)
		if !event.WALChanged {
			t.Fatalf("expected WAL change, got %#v", event)
		}
		if event.SHMChanged {
			t.Fatalf("did not expect SHM change, got %#v", event)
		}
		if event.DBChanged {
			t.Fatalf("did not expect DB change, got %#v", event)
		}
		if len(event.ChangedPaths) != 1 || event.ChangedPaths[0] != dbPath+"-wal" {
			t.Fatalf("unexpected changed paths: %#v", event.ChangedPaths)
		}
	})

	t.Run("shm", func(t *testing.T) {
		dbPath, cleanup := writeWatcherFixture(t)
		defer cleanup()

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		watcher := New(dbPath, WithPollInterval(5*time.Millisecond), WithDebounce(20*time.Millisecond))
		events := watcher.Events(ctx)

		mutateFile(t, dbPath+"-shm", "shm-change-1")

		event := waitForEvent(t, events, 2*time.Second)
		if !event.SHMChanged {
			t.Fatalf("expected SHM change, got %#v", event)
		}
		if event.WALChanged {
			t.Fatalf("did not expect WAL change, got %#v", event)
		}
		if event.DBChanged {
			t.Fatalf("did not expect DB change, got %#v", event)
		}
		if len(event.ChangedPaths) != 1 || event.ChangedPaths[0] != dbPath+"-shm" {
			t.Fatalf("unexpected changed paths: %#v", event.ChangedPaths)
		}
	})
}

func TestWatcherDebouncesRapidChanges(t *testing.T) {
	dbPath, cleanup := writeWatcherFixture(t)
	defer cleanup()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	watcher := New(dbPath, WithPollInterval(5*time.Millisecond), WithDebounce(100*time.Millisecond))
	events := watcher.Events(ctx)

	mutateFile(t, dbPath, "db-change-1")
	time.Sleep(20 * time.Millisecond)
	mutateFile(t, dbPath, "db-change-2")

	event := waitForEvent(t, events, 2*time.Second)
	if !event.DBChanged {
		t.Fatalf("expected DB change, got %#v", event)
	}
	if event.WALChanged || event.SHMChanged {
		t.Fatalf("did not expect WAL/SHM changes, got %#v", event)
	}
	if len(event.ChangedPaths) != 1 || event.ChangedPaths[0] != dbPath {
		t.Fatalf("unexpected changed paths: %#v", event.ChangedPaths)
	}

	select {
	case extra := <-events:
		t.Fatalf("expected debounced single event, got extra event %#v", extra)
	case <-time.After(150 * time.Millisecond):
	}
}

func writeWatcherFixture(t *testing.T) (string, func()) {
	t.Helper()

	dir := t.TempDir()
	dbPath := filepath.Join(dir, "chat.db")
	if err := os.WriteFile(dbPath, []byte("db-0"), 0o600); err != nil {
		t.Fatalf("write db fixture: %v", err)
	}
	if err := os.WriteFile(dbPath+"-wal", []byte("wal-0"), 0o600); err != nil {
		t.Fatalf("write wal fixture: %v", err)
	}
	if err := os.WriteFile(dbPath+"-shm", []byte("shm-0"), 0o600); err != nil {
		t.Fatalf("write shm fixture: %v", err)
	}

	return dbPath, func() {}
}

func mutateFile(t *testing.T, path, content string) {
	t.Helper()

	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("mutate %s: %v", path, err)
	}
}

func waitForEvent(t *testing.T, events <-chan Event, timeout time.Duration) Event {
	t.Helper()

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case event, ok := <-events:
		if !ok {
			t.Fatal("watcher closed before emitting an event")
		}
		return event
	case <-timer.C:
		t.Fatalf("timed out waiting for event after %s", timeout)
		return Event{}
	}
}
