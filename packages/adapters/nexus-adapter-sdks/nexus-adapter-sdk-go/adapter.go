// Package nexadapter provides shared infrastructure for building Nexus adapters.
//
// Instead of each adapter reimplementing operation dispatch, JSONL emission,
// signal handling, record emission, text chunking, and streaming
// protocol support, this SDK handles all of it. Adapter authors write only the
// platform-specific logic.
//
// # Quick Start
//
//	package main
//
//	import nexadapter "github.com/nexus-project/adapter-sdk-go"
//
//	func main() {
//	    nexadapter.Run(nexadapter.Adapter{
//	        Operations: nexadapter.AdapterOperations{
//	            AdapterInfo: myInfo,
//	            MonitorStart: myMonitor, // or nexadapter.PollMonitor(config)
//	            Methods: map[string]func(ctx context.Context, req nexadapter.AdapterMethodRequest) (any, error){
//	                "slack.send": mySlackSend,
//	            },
//	        },
//	    })
//	}
//
// The SDK parses CLI arguments, routes to your handlers, manages JSONL output,
// and handles signals for graceful shutdown.
package nexadapter

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

// AdapterOperations defines operation handlers for a Nexus adapter.
type AdapterOperations struct {
	// AdapterInfo returns adapter identity and supported operations.
	// Required for all adapters.
	AdapterInfo func(ctx context.Context) (*AdapterInfo, error)

	// MonitorStart streams live records and should block until ctx is cancelled.
	MonitorStart func(ctx context.Context, connectionID string, emit EmitFunc) error

	// RecordsBackfill emits historical records and exits when history is exhausted.
	RecordsBackfill func(ctx context.Context, connectionID string, since time.Time, emit EmitFunc) error

	// AdapterHealth reports connection health.
	AdapterHealth func(ctx context.Context, connectionID string) (*AdapterHealth, error)

	// AdapterConnectionsList lists configured connections for the adapter.
	AdapterConnectionsList func(ctx context.Context) ([]AdapterConnectionIdentity, error)

	// AdapterSetupStart starts adapter-defined onboarding/setup.
	AdapterSetupStart func(ctx context.Context, req AdapterSetupRequest) (*AdapterSetupResult, error)

	// AdapterSetupSubmit submits additional data for an in-progress setup session.
	AdapterSetupSubmit func(ctx context.Context, req AdapterSetupRequest) (*AdapterSetupResult, error)

	// AdapterSetupStatus checks status for an in-progress setup session.
	AdapterSetupStatus func(ctx context.Context, req AdapterSetupRequest) (*AdapterSetupResult, error)

	// AdapterSetupCancel cancels an in-progress setup session.
	AdapterSetupCancel func(ctx context.Context, req AdapterSetupRequest) (*AdapterSetupResult, error)

	// ServeStart starts a long-lived duplex serve session.
	ServeStart func(ctx context.Context, connectionID string, session *ServeSession) error

	// Methods executes provider-native namespaced adapter methods.
	Methods map[string]func(ctx context.Context, req AdapterMethodRequest) (any, error)
}

type AdapterMethodRequest struct {
	ConnectionID string         `json:"connection_id,omitempty"`
	Payload      map[string]any `json:"payload,omitempty"`
}

// Adapter defines the operation handlers for a Nexus adapter.
type Adapter struct {
	Operations AdapterOperations
}

// Run is the main entry point for an adapter binary.
// It parses CLI arguments, routes to the appropriate handler, and manages
// JSONL output, signal handling, and process lifecycle.
//
// Call this from your main() function. Run handles os.Exit internally —
// it does not return on success, and exits with code 1 on error.
func Run(adapter Adapter) {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	// Check for --verbose flag before the subcommand
	for _, arg := range os.Args[1:] {
		if arg == "--verbose" || arg == "-v" {
			SetVerbose(true)
		}
	}

	command := os.Args[1]
	args := os.Args[2:]

	// Filter out global flags from args passed to subcommands
	var filteredArgs []string
	for _, arg := range args {
		if arg != "--verbose" && arg != "-v" {
			filteredArgs = append(filteredArgs, arg)
		}
	}

	var err error
	switch command {
	case "adapter.info":
		err = runInfo(adapter)
	case "adapter.monitor.start":
		err = runMonitor(adapter, filteredArgs)
	case "adapter.serve.start":
		err = runControl(adapter, filteredArgs)
	case "records.backfill":
		err = runBackfill(adapter, filteredArgs)
	case "adapter.health":
		err = runHealth(adapter, filteredArgs)
	case "adapter.connections.list":
		err = runConnections(adapter, filteredArgs)
	case "adapter.setup.start":
		err = runSetup(adapter, filteredArgs, OpAdapterSetupStart)
	case "adapter.setup.submit":
		err = runSetup(adapter, filteredArgs, OpAdapterSetupSubmit)
	case "adapter.setup.status":
		err = runSetup(adapter, filteredArgs, OpAdapterSetupStatus)
	case "adapter.setup.cancel":
		err = runSetup(adapter, filteredArgs, OpAdapterSetupCancel)
	case "help", "--help", "-h":
		printUsage()
		os.Exit(0)
	default:
		err = runMethod(adapter, command, filteredArgs)
	}

	if err != nil {
		LogError("%v", err)
		os.Exit(1)
	}
}

func printUsage() {
	name := "adapter"
	if len(os.Args) > 0 {
		name = os.Args[0]
	}
	fmt.Fprintf(os.Stderr, "Usage: %s <operation> [flags]\n\n", name)
	fmt.Fprintf(os.Stderr, "Operations:\n")
	fmt.Fprintf(os.Stderr, "  adapter.info\n")
	fmt.Fprintf(os.Stderr, "  adapter.monitor.start --connection <id>\n")
	fmt.Fprintf(os.Stderr, "  adapter.serve.start --connection <id>\n")
	fmt.Fprintf(os.Stderr, "  records.backfill --connection <id> --since <date>\n")
	fmt.Fprintf(os.Stderr, "  adapter.health --connection <id>\n")
	fmt.Fprintf(os.Stderr, "  adapter.connections.list\n")
	fmt.Fprintf(os.Stderr, "  adapter.setup.start [--connection <id>] [--session-id <id>] [--payload-json <json>]\n")
	fmt.Fprintf(os.Stderr, "  adapter.setup.submit --session-id <id> [--connection <id>] [--payload-json <json>]\n")
	fmt.Fprintf(os.Stderr, "  adapter.setup.status --session-id <id> [--connection <id>]\n")
	fmt.Fprintf(os.Stderr, "  adapter.setup.cancel --session-id <id> [--connection <id>]\n")
	fmt.Fprintf(os.Stderr, "  <adapter-native-method> [--connection <id>] [--payload-json <json>]\n")
	fmt.Fprintf(os.Stderr, "\nGlobal flags:\n")
	fmt.Fprintf(os.Stderr, "  --verbose, -v                     Enable debug logging\n")
}

// --- Command Handlers ---

func runInfo(adapter Adapter) error {
	if adapter.Operations.AdapterInfo == nil {
		return fmt.Errorf("adapter.info handler not implemented")
	}
	info, err := adapter.Operations.AdapterInfo(context.Background())
	if err != nil {
		return err
	}
	return writeJSON(info)
}

func runMonitor(adapter Adapter, args []string) error {
	if adapter.Operations.MonitorStart == nil {
		return fmt.Errorf("adapter.monitor.start not supported by this adapter")
	}

	fs := flag.NewFlagSet("adapter.monitor.start", flag.ContinueOnError)
	connection := fs.String("connection", "", "Connection ID")
	_ = fs.String("format", "jsonl", "Output format (always jsonl)")
	if err := fs.Parse(args); err != nil {
		return err
	}

	ctx := signalContext()

	emit := makeEmitFunc()

	LogInfo("monitor starting for connection %q", *connection)
	err := adapter.Operations.MonitorStart(ctx, *connection, emit)
	if err != nil {
		return fmt.Errorf("adapter.monitor.start: %w", err)
	}
	LogInfo("monitor stopped cleanly")
	return nil
}

func runBackfill(adapter Adapter, args []string) error {
	if adapter.Operations.RecordsBackfill == nil {
		return fmt.Errorf("records.backfill not supported by this adapter")
	}

	fs := flag.NewFlagSet("records.backfill", flag.ContinueOnError)
	connection := fs.String("connection", "", "Connection ID")
	since := fs.String("since", "", "Backfill start date (ISO 8601 or YYYY-MM-DD)")
	_ = fs.String("format", "jsonl", "Output format (always jsonl)")
	if err := fs.Parse(args); err != nil {
		return err
	}

	sinceTime, err := parseDate(*since)
	if err != nil {
		return fmt.Errorf("invalid --since date %q: %w", *since, err)
	}

	ctx := signalContext()
	emit := makeEmitFunc()

	LogInfo("backfill starting for connection %q since %s", *connection, sinceTime.Format(time.RFC3339))
	err = adapter.Operations.RecordsBackfill(ctx, *connection, sinceTime, emit)
	if err != nil {
		return fmt.Errorf("records.backfill: %w", err)
	}
	LogInfo("backfill completed")
	return nil
}

func runHealth(adapter Adapter, args []string) error {
	if adapter.Operations.AdapterHealth == nil {
		return fmt.Errorf("adapter.health not supported by this adapter")
	}

	fs := flag.NewFlagSet("adapter.health", flag.ContinueOnError)
	connection := fs.String("connection", "", "Connection ID")
	if err := fs.Parse(args); err != nil {
		return err
	}

	ctx := context.Background()
	health, err := adapter.Operations.AdapterHealth(ctx, *connection)
	if err != nil {
		// Return structured health error rather than crashing
		return writeJSON(&AdapterHealth{
			Connected:    false,
			ConnectionID: strings.TrimSpace(*connection),
			Error:        err.Error(),
		})
	}

	return writeJSON(health)
}

func runConnections(adapter Adapter, args []string) error {
	if adapter.Operations.AdapterConnectionsList == nil {
		return fmt.Errorf("adapter.connections.list not supported by this adapter")
	}

	if len(args) > 0 {
		return fmt.Errorf("adapter.connections.list accepts no arguments")
	}

	ctx := context.Background()
	connections, err := adapter.Operations.AdapterConnectionsList(ctx)
	if err != nil {
		return fmt.Errorf("adapter.connections.list: %w", err)
	}
	return writeJSON(connections)
}

func runSetup(adapter Adapter, args []string, operation AdapterOperation) error {
	var handler func(ctx context.Context, req AdapterSetupRequest) (*AdapterSetupResult, error)
	switch operation {
	case OpAdapterSetupStart:
		handler = adapter.Operations.AdapterSetupStart
	case OpAdapterSetupSubmit:
		handler = adapter.Operations.AdapterSetupSubmit
	case OpAdapterSetupStatus:
		handler = adapter.Operations.AdapterSetupStatus
	case OpAdapterSetupCancel:
		handler = adapter.Operations.AdapterSetupCancel
	default:
		return fmt.Errorf("unsupported setup operation: %s", operation)
	}
	if handler == nil {
		return fmt.Errorf("%s not supported by this adapter", operation)
	}

	fs := flag.NewFlagSet(string(operation), flag.ContinueOnError)
	connection := fs.String("connection", "", "Connection ID")
	sessionID := fs.String("session-id", "", "Setup session ID")
	payloadJSON := fs.String("payload-json", "", "JSON object payload")
	if err := fs.Parse(args); err != nil {
		return err
	}

	req := AdapterSetupRequest{}
	if trimmed := strings.TrimSpace(*connection); trimmed != "" {
		req.ConnectionID = trimmed
	}
	if trimmed := strings.TrimSpace(*sessionID); trimmed != "" {
		req.SessionID = trimmed
	}

	if operation != OpAdapterSetupStart && strings.TrimSpace(req.SessionID) == "" {
		return fmt.Errorf("--session-id is required for %s", operation)
	}

	if raw := strings.TrimSpace(*payloadJSON); raw != "" {
		var payload map[string]any
		if err := json.Unmarshal([]byte(raw), &payload); err != nil {
			return fmt.Errorf("--payload-json must be a valid JSON object: %w", err)
		}
		if payload == nil {
			return fmt.Errorf("--payload-json must decode to a JSON object")
		}
		req.Payload = payload
	}

	result, err := handler(signalContext(), req)
	if err != nil {
		return fmt.Errorf("%s: %w", operation, err)
	}
	return writeJSON(result)
}

func runControl(adapter Adapter, args []string) error {
	if adapter.Operations.ServeStart == nil {
		return fmt.Errorf("adapter.serve.start not supported by this adapter")
	}

	fs := flag.NewFlagSet("adapter.serve.start", flag.ContinueOnError)
	connection := fs.String("connection", "", "Connection ID")
	_ = fs.String("format", "jsonl", "Output format (always jsonl)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*connection) == "" {
		return fmt.Errorf("missing required flag: --connection")
	}

	ctx := signalContext()
	session := NewServeSession(os.Stdin, os.Stdout)

	LogInfo("serve session starting for connection %q", *connection)
	if err := adapter.Operations.ServeStart(ctx, strings.TrimSpace(*connection), session); err != nil {
		return fmt.Errorf("adapter.serve.start: %w", err)
	}
	LogInfo("serve session stopped cleanly")
	return nil
}

func runMethod(adapter Adapter, methodName string, args []string) error {
	if adapter.Operations.AdapterInfo == nil {
		return fmt.Errorf("adapter.info handler not implemented")
	}
	if adapter.Operations.Methods == nil {
		return fmt.Errorf("unknown command: %s", methodName)
	}
	handler, ok := adapter.Operations.Methods[methodName]
	if !ok || handler == nil {
		return fmt.Errorf("unknown command: %s", methodName)
	}

	info, err := adapter.Operations.AdapterInfo(context.Background())
	if err != nil {
		return fmt.Errorf("adapter.info: %w", err)
	}
	method, ok := findDeclaredMethod(info, methodName)
	if !ok {
		return fmt.Errorf("adapter method not declared in adapter.info: %s", methodName)
	}

	fs := flag.NewFlagSet(methodName, flag.ContinueOnError)
	connection := fs.String("connection", "", "Connection ID")
	payloadJSON := fs.String("payload-json", "", "JSON object payload")
	if err := fs.Parse(args); err != nil {
		return err
	}

	req := AdapterMethodRequest{}
	if trimmed := strings.TrimSpace(*connection); trimmed != "" {
		req.ConnectionID = trimmed
	}
	if method.ConnectionRequired && strings.TrimSpace(req.ConnectionID) == "" {
		return fmt.Errorf("--connection is required for %s", methodName)
	}

	if raw := strings.TrimSpace(*payloadJSON); raw != "" {
		var payload map[string]any
		if err := json.Unmarshal([]byte(raw), &payload); err != nil {
			return fmt.Errorf("--payload-json must be a valid JSON object: %w", err)
		}
		if payload == nil {
			return fmt.Errorf("--payload-json must decode to a JSON object")
		}
		req.Payload = payload
	} else {
		req.Payload = map[string]any{}
	}

	result, err := handler(signalContext(), req)
	if err != nil {
		return fmt.Errorf("%s: %w", methodName, err)
	}
	if result == nil {
		result = map[string]any{}
	}
	return writeJSON(result)
}

func findDeclaredMethod(info *AdapterInfo, methodName string) (AdapterMethod, bool) {
	if info == nil {
		return AdapterMethod{}, false
	}
	for _, method := range info.Methods {
		if method.Name == methodName {
			return method, true
		}
	}
	return AdapterMethod{}, false
}

// --- Helpers ---

// signalContext returns a context that cancels on SIGTERM or SIGINT.
func signalContext() context.Context {
	ctx, _ := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	return ctx
}

// makeEmitFunc creates an EmitFunc that writes adapter records as JSONL to stdout.
func makeEmitFunc() EmitFunc {
	return func(record any) {
		if err := writeJSON(record); err != nil {
			LogError("emit error: %v", err)
		}
	}
}

// parseDate tries multiple date formats for the --since flag.
func parseDate(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, fmt.Errorf("date is required")
	}

	// Try common formats
	formats := []string{
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02",
	}

	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t, nil
		}
	}

	return time.Time{}, fmt.Errorf("unrecognized date format (expected ISO 8601 or YYYY-MM-DD)")
}
