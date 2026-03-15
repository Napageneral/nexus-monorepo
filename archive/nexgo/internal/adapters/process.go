package adapters

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

// ProcessStatus represents the lifecycle state of an adapter process.
type ProcessStatus string

const (
	StatusStarting ProcessStatus = "starting"
	StatusRunning  ProcessStatus = "running"
	StatusStopping ProcessStatus = "stopping"
	StatusStopped  ProcessStatus = "stopped"
	StatusCrashed  ProcessStatus = "crashed"
)

// AdapterProcess wraps a child process (exec.Cmd) with stdio JSONL protocol.
type AdapterProcess struct {
	ID       string
	Info     AdapterInfo
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	stdout   *bufio.Scanner
	status   ProcessStatus
	restarts int
	lastSeen time.Time
	mu       sync.Mutex

	binaryPath string
	args       []string
}

// NewAdapterProcess creates a new adapter process handle without starting it.
func NewAdapterProcess(id, binaryPath string, args []string) *AdapterProcess {
	return &AdapterProcess{
		ID:         id,
		binaryPath: binaryPath,
		args:       args,
		status:     StatusStopped,
	}
}

// Status returns the current process status.
func (p *AdapterProcess) Status() ProcessStatus {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.status
}

// Start launches the adapter process and performs the info handshake.
func (p *AdapterProcess) Start(ctx context.Context) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.status = StatusStarting
	p.cmd = exec.CommandContext(ctx, p.binaryPath, p.args...)

	stdinPipe, err := p.cmd.StdinPipe()
	if err != nil {
		p.status = StatusCrashed
		return fmt.Errorf("stdin pipe: %w", err)
	}
	p.stdin = stdinPipe

	stdoutPipe, err := p.cmd.StdoutPipe()
	if err != nil {
		p.status = StatusCrashed
		return fmt.Errorf("stdout pipe: %w", err)
	}
	p.stdout = bufio.NewScanner(stdoutPipe)
	// Allow large lines for JSONL messages.
	p.stdout.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	if err := p.cmd.Start(); err != nil {
		p.status = StatusCrashed
		return fmt.Errorf("start process: %w", err)
	}

	p.status = StatusRunning
	p.lastSeen = time.Now()
	return nil
}

// Send writes a ProtocolMessage to the adapter's stdin as a JSONL line.
func (p *AdapterProcess) Send(msg ProtocolMessage) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.stdin == nil {
		return fmt.Errorf("process not started")
	}
	if p.status != StatusRunning {
		return fmt.Errorf("process not running (status: %s)", p.status)
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal message: %w", err)
	}
	data = append(data, '\n')

	if _, err := p.stdin.Write(data); err != nil {
		return fmt.Errorf("write to stdin: %w", err)
	}
	return nil
}

// Stop gracefully stops the adapter process. It sends SIGTERM first, then
// SIGKILL after a timeout.
func (p *AdapterProcess) Stop(ctx context.Context) error {
	p.mu.Lock()
	if p.cmd == nil || p.cmd.Process == nil {
		p.status = StatusStopped
		p.mu.Unlock()
		return nil
	}
	p.status = StatusStopping

	// Close stdin to signal the process to stop.
	if p.stdin != nil {
		p.stdin.Close()
	}

	proc := p.cmd.Process
	p.mu.Unlock()

	// Send SIGTERM.
	if err := proc.Signal(syscall.SIGTERM); err != nil {
		// Process may have already exited.
		p.mu.Lock()
		p.status = StatusStopped
		p.mu.Unlock()
		return nil
	}

	// Wait for process to exit or context to expire.
	done := make(chan error, 1)
	go func() {
		done <- p.cmd.Wait()
	}()

	select {
	case <-done:
		p.mu.Lock()
		p.status = StatusStopped
		p.mu.Unlock()
		return nil
	case <-ctx.Done():
		// Force kill.
		_ = proc.Signal(syscall.SIGKILL)
		<-done
		p.mu.Lock()
		p.status = StatusStopped
		p.mu.Unlock()
		return ctx.Err()
	}
}

// readLoop reads JSONL messages from the adapter's stdout and calls the handler
// for each one. It should be run as a goroutine.
func (p *AdapterProcess) readLoop(handler func(ProtocolMessage)) {
	for p.stdout.Scan() {
		line := p.stdout.Bytes()
		if len(line) == 0 {
			continue
		}

		var msg ProtocolMessage
		if err := json.Unmarshal(line, &msg); err != nil {
			continue // skip malformed lines
		}

		p.mu.Lock()
		p.lastSeen = time.Now()
		p.mu.Unlock()

		handler(msg)
	}

	// Scanner has stopped -- process may have exited.
	p.mu.Lock()
	if p.status == StatusRunning {
		p.status = StatusCrashed
	}
	p.mu.Unlock()
}
