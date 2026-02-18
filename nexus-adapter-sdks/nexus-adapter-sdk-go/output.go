package nexadapter

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
)

var (
	stdoutMu sync.Mutex
	stderrMu sync.Mutex
)

// writeJSON marshals v to JSON and writes it as a single line to stdout.
// Thread-safe — multiple goroutines can call this concurrently.
func writeJSON(v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("json marshal: %w", err)
	}

	stdoutMu.Lock()
	defer stdoutMu.Unlock()

	_, err = os.Stdout.Write(append(data, '\n'))
	return err
}

// LogError writes a structured error message to stderr.
// All adapter logging goes to stderr; stdout is reserved for protocol data.
func LogError(format string, args ...any) {
	stderrMu.Lock()
	defer stderrMu.Unlock()
	fmt.Fprintf(os.Stderr, "[ERROR] "+format+"\n", args...)
}

// LogInfo writes a structured info message to stderr.
func LogInfo(format string, args ...any) {
	stderrMu.Lock()
	defer stderrMu.Unlock()
	fmt.Fprintf(os.Stderr, "[INFO] "+format+"\n", args...)
}

// LogDebug writes a structured debug message to stderr.
// Only emitted when verbose logging is enabled.
func LogDebug(format string, args ...any) {
	if !verboseLogging {
		return
	}
	stderrMu.Lock()
	defer stderrMu.Unlock()
	fmt.Fprintf(os.Stderr, "[DEBUG] "+format+"\n", args...)
}

var verboseLogging bool

// SetVerbose enables or disables debug-level logging to stderr.
func SetVerbose(v bool) {
	verboseLogging = v
}
