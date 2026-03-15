// Package daemon implements the Nexus daemon lifecycle: PID locking,
// signal handling, startup and shutdown sequences.
package daemon

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

// PIDLock manages a PID lockfile for the daemon.
type PIDLock struct {
	path string
	file *os.File
}

// AcquirePIDLock creates or acquires the PID lock at the given path.
// Returns ErrAlreadyRunning if another process holds the lock.
func AcquirePIDLock(pidPath string) (*PIDLock, error) {
	dir := filepath.Dir(pidPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("creating pid directory: %w", err)
	}

	// Check if a process is already running
	if existing, err := readPID(pidPath); err == nil && existing > 0 {
		if processExists(existing) {
			return nil, fmt.Errorf("%w: pid %d", ErrAlreadyRunning, existing)
		}
		// Stale PID file — previous process died without cleanup
		_ = os.Remove(pidPath)
	}

	f, err := os.OpenFile(pidPath, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o644)
	if err != nil {
		if os.IsExist(err) {
			return nil, fmt.Errorf("%w: lock file exists", ErrAlreadyRunning)
		}
		return nil, fmt.Errorf("creating pid file: %w", err)
	}

	pid := os.Getpid()
	if _, err := fmt.Fprintf(f, "%d\n", pid); err != nil {
		f.Close()
		os.Remove(pidPath)
		return nil, fmt.Errorf("writing pid: %w", err)
	}

	return &PIDLock{path: pidPath, file: f}, nil
}

// Release removes the PID lock file and closes the file handle.
func (l *PIDLock) Release() error {
	if l.file != nil {
		l.file.Close()
	}
	return os.Remove(l.path)
}

// Path returns the lockfile path.
func (l *PIDLock) Path() string {
	return l.path
}

// readPID reads a PID from a lockfile.
func readPID(path string) (int, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		return 0, err
	}
	return pid, nil
}

// processExists checks if a process with the given PID is running.
func processExists(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// On Unix, FindProcess always succeeds. Send signal 0 to check.
	err = process.Signal(syscall.Signal(0))
	return err == nil
}

// ErrAlreadyRunning is returned when another daemon instance is running.
var ErrAlreadyRunning = fmt.Errorf("nexus is already running")
