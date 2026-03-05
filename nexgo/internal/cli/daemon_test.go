package cli

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDaemonStatus(t *testing.T) {
	// Create a temp directory with no PID file.
	dir := t.TempDir()

	status, err := DaemonStatus(dir)
	if err != nil {
		t.Fatalf("DaemonStatus error: %v", err)
	}
	if status != "stopped" {
		t.Errorf("DaemonStatus = %q, want %q", status, "stopped")
	}
}

func TestDaemonStatusStalePID(t *testing.T) {
	// Create a temp directory with a PID file containing a non-existent PID.
	dir := t.TempDir()
	pidFile := filepath.Join(dir, "nex.pid")
	// Use a very high PID that is very unlikely to exist.
	if err := os.WriteFile(pidFile, []byte("9999999\n"), 0o644); err != nil {
		t.Fatalf("writing PID file: %v", err)
	}

	status, err := DaemonStatus(dir)
	if err != nil {
		t.Fatalf("DaemonStatus error: %v", err)
	}
	if status != "stopped" {
		t.Errorf("DaemonStatus = %q, want %q (stale PID)", status, "stopped")
	}
}

func TestDaemonStopNoPID(t *testing.T) {
	dir := t.TempDir()

	err := DaemonStop(dir)
	if err == nil {
		t.Error("DaemonStop should error when no PID file exists")
	}
}

func TestDaemonStopInvalidPID(t *testing.T) {
	dir := t.TempDir()
	pidFile := filepath.Join(dir, "nex.pid")
	if err := os.WriteFile(pidFile, []byte("not-a-number\n"), 0o644); err != nil {
		t.Fatalf("writing PID file: %v", err)
	}

	err := DaemonStop(dir)
	if err == nil {
		t.Error("DaemonStop should error when PID file contains invalid data")
	}
}
