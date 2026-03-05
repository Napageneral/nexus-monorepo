// Package nexadapter provides shared infrastructure for building Nexus adapters.
//
// Instead of each adapter reimplementing operation dispatch, JSONL emission,
// signal handling, NexusEvent construction, text chunking, and streaming
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
//	            AdapterMonitorStart: myMonitor, // or nexadapter.PollMonitor(config)
//	            DeliverySend: mySend,
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

	// AdapterMonitorStart streams live events and should block until ctx is cancelled.
	AdapterMonitorStart func(ctx context.Context, account string, emit EmitFunc) error

	// DeliverySend delivers a message to the platform.
	DeliverySend func(ctx context.Context, req SendRequest) (*DeliveryResult, error)

	// EventBackfill emits historical events and exits when history is exhausted.
	EventBackfill func(ctx context.Context, account string, since time.Time, emit EmitFunc) error

	// AdapterHealth reports account connection status.
	AdapterHealth func(ctx context.Context, account string) (*AdapterHealth, error)

	// AdapterAccountsList lists configured accounts for the adapter.
	AdapterAccountsList func(ctx context.Context) ([]AdapterAccount, error)

	// AdapterSetupStart starts adapter-defined onboarding/setup.
	AdapterSetupStart func(ctx context.Context, req AdapterSetupRequest) (*AdapterSetupResult, error)

	// AdapterSetupSubmit submits additional data for an in-progress setup session.
	AdapterSetupSubmit func(ctx context.Context, req AdapterSetupRequest) (*AdapterSetupResult, error)

	// AdapterSetupStatus checks status for an in-progress setup session.
	AdapterSetupStatus func(ctx context.Context, req AdapterSetupRequest) (*AdapterSetupResult, error)

	// AdapterSetupCancel cancels an in-progress setup session.
	AdapterSetupCancel func(ctx context.Context, req AdapterSetupRequest) (*AdapterSetupResult, error)

	// AdapterControlStart starts a long-lived duplex control session.
	AdapterControlStart func(ctx context.Context, account string, session *ControlSession) error

	// DeliveryStream configures streaming delivery support.
	DeliveryStream *StreamConfig
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
	case "adapter.control.start":
		err = runControl(adapter, filteredArgs)
	case "delivery.send":
		err = runSend(adapter, filteredArgs)
	case "event.backfill":
		err = runBackfill(adapter, filteredArgs)
	case "adapter.health":
		err = runHealth(adapter, filteredArgs)
	case "adapter.accounts.list":
		err = runAccounts(adapter, filteredArgs)
	case "adapter.setup.start":
		err = runSetup(adapter, filteredArgs, OpAdapterSetupStart)
	case "adapter.setup.submit":
		err = runSetup(adapter, filteredArgs, OpAdapterSetupSubmit)
	case "adapter.setup.status":
		err = runSetup(adapter, filteredArgs, OpAdapterSetupStatus)
	case "adapter.setup.cancel":
		err = runSetup(adapter, filteredArgs, OpAdapterSetupCancel)
	case "delivery.stream":
		err = runStream(adapter, filteredArgs)
	case "help", "--help", "-h":
		printUsage()
		os.Exit(0)
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", command)
		printUsage()
		os.Exit(1)
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
	fmt.Fprintf(os.Stderr, "  adapter.monitor.start --account <id>\n")
	fmt.Fprintf(os.Stderr, "  adapter.control.start --account <id>\n")
	fmt.Fprintf(os.Stderr, "  delivery.send --account <id> --to <target> --text \"...\"\n")
	fmt.Fprintf(os.Stderr, "  event.backfill --account <id> --since <date>\n")
	fmt.Fprintf(os.Stderr, "  adapter.health --account <id>\n")
	fmt.Fprintf(os.Stderr, "  adapter.accounts.list\n")
	fmt.Fprintf(os.Stderr, "  adapter.setup.start [--account <id>] [--session-id <id>] [--payload-json <json>]\n")
	fmt.Fprintf(os.Stderr, "  adapter.setup.submit --session-id <id> [--account <id>] [--payload-json <json>]\n")
	fmt.Fprintf(os.Stderr, "  adapter.setup.status --session-id <id> [--account <id>]\n")
	fmt.Fprintf(os.Stderr, "  adapter.setup.cancel --session-id <id> [--account <id>]\n")
	fmt.Fprintf(os.Stderr, "  delivery.stream --account <id>\n")
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
	if adapter.Operations.AdapterMonitorStart == nil {
		return fmt.Errorf("adapter.monitor.start not supported by this adapter")
	}

	fs := flag.NewFlagSet("adapter.monitor.start", flag.ContinueOnError)
	account := fs.String("account", "", "Account ID")
	_ = fs.String("format", "jsonl", "Output format (always jsonl)")
	if err := fs.Parse(args); err != nil {
		return err
	}

	ctx := signalContext()

	emit := makeEmitFunc()

	LogInfo("monitor starting for account %q", *account)
	err := adapter.Operations.AdapterMonitorStart(ctx, *account, emit)
	if err != nil {
		return fmt.Errorf("adapter.monitor.start: %w", err)
	}
	LogInfo("monitor stopped cleanly")
	return nil
}

func runSend(adapter Adapter, args []string) error {
	if adapter.Operations.DeliverySend == nil {
		return fmt.Errorf("delivery.send not supported by this adapter")
	}

	fs := flag.NewFlagSet("delivery.send", flag.ContinueOnError)
	account := fs.String("account", "", "Account ID")
	to := fs.String("to", "", "Target (email, phone, channel:id)")
	text := fs.String("text", "", "Message text")
	media := fs.String("media", "", "Media file path")
	caption := fs.String("caption", "", "Media caption")
	replyTo := fs.String("reply-to", "", "Reply to event ID")
	threadID := fs.String("thread", "", "Thread ID")
	if err := fs.Parse(args); err != nil {
		return err
	}

	ctx := signalContext()

	req := SendRequest{
		Account:   *account,
		To:        *to,
		Text:      *text,
		Media:     *media,
		Caption:   *caption,
		ReplyToID: *replyTo,
		ThreadID:  *threadID,
	}

	result, err := adapter.Operations.DeliverySend(ctx, req)
	if err != nil {
		// Return error as a structured DeliveryResult rather than crashing
		return writeJSON(&DeliveryResult{
			Success: false,
			Error: &DeliveryError{
				Type:    "unknown",
				Message: err.Error(),
				Retry:   false,
			},
		})
	}

	return writeJSON(result)
}

func runBackfill(adapter Adapter, args []string) error {
	if adapter.Operations.EventBackfill == nil {
		return fmt.Errorf("event.backfill not supported by this adapter")
	}

	fs := flag.NewFlagSet("event.backfill", flag.ContinueOnError)
	account := fs.String("account", "", "Account ID")
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

	LogInfo("backfill starting for account %q since %s", *account, sinceTime.Format(time.RFC3339))
	err = adapter.Operations.EventBackfill(ctx, *account, sinceTime, emit)
	if err != nil {
		return fmt.Errorf("event.backfill: %w", err)
	}
	LogInfo("backfill completed")
	return nil
}

func runHealth(adapter Adapter, args []string) error {
	if adapter.Operations.AdapterHealth == nil {
		return fmt.Errorf("adapter.health not supported by this adapter")
	}

	fs := flag.NewFlagSet("adapter.health", flag.ContinueOnError)
	account := fs.String("account", "", "Account ID")
	if err := fs.Parse(args); err != nil {
		return err
	}

	ctx := context.Background()
	health, err := adapter.Operations.AdapterHealth(ctx, *account)
	if err != nil {
		// Return structured health error rather than crashing
		return writeJSON(&AdapterHealth{
			Connected: false,
			Account:   *account,
			Error:     err.Error(),
		})
	}

	return writeJSON(health)
}

func runAccounts(adapter Adapter, args []string) error {
	if adapter.Operations.AdapterAccountsList == nil {
		return fmt.Errorf("adapter.accounts.list not supported by this adapter")
	}

	if len(args) > 0 {
		return fmt.Errorf("adapter.accounts.list accepts no arguments")
	}

	ctx := context.Background()
	accounts, err := adapter.Operations.AdapterAccountsList(ctx)
	if err != nil {
		return fmt.Errorf("adapter.accounts.list: %w", err)
	}
	return writeJSON(accounts)
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
	account := fs.String("account", "", "Account ID")
	sessionID := fs.String("session-id", "", "Setup session ID")
	payloadJSON := fs.String("payload-json", "", "JSON object payload")
	if err := fs.Parse(args); err != nil {
		return err
	}

	req := AdapterSetupRequest{}
	if trimmed := strings.TrimSpace(*account); trimmed != "" {
		req.Account = trimmed
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
	if adapter.Operations.AdapterControlStart == nil {
		return fmt.Errorf("adapter.control.start not supported by this adapter")
	}

	fs := flag.NewFlagSet("adapter.control.start", flag.ContinueOnError)
	account := fs.String("account", "", "Account ID")
	_ = fs.String("format", "jsonl", "Output format (always jsonl)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*account) == "" {
		return fmt.Errorf("missing required flag: --account")
	}

	ctx := signalContext()
	session := NewControlSession(os.Stdin, os.Stdout)

	LogInfo("control session starting for account %q", *account)
	if err := adapter.Operations.AdapterControlStart(ctx, strings.TrimSpace(*account), session); err != nil {
		return fmt.Errorf("adapter.control.start: %w", err)
	}
	LogInfo("control session stopped cleanly")
	return nil
}

func runStream(adapter Adapter, args []string) error {
	if adapter.Operations.DeliveryStream == nil {
		return fmt.Errorf("delivery.stream not supported by this adapter")
	}

	fs := flag.NewFlagSet("delivery.stream", flag.ContinueOnError)
	_ = fs.String("account", "", "Account ID")
	_ = fs.String("format", "jsonl", "Output format (always jsonl)")
	if err := fs.Parse(args); err != nil {
		return err
	}

	ctx := signalContext()

	LogInfo("stream handler starting")
	err := handleStream(ctx, adapter.Operations.DeliveryStream)
	if err != nil {
		return fmt.Errorf("delivery.stream: %w", err)
	}
	LogInfo("stream handler stopped cleanly")
	return nil
}

// --- Helpers ---

// signalContext returns a context that cancels on SIGTERM or SIGINT.
func signalContext() context.Context {
	ctx, _ := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	return ctx
}

// makeEmitFunc creates an EmitFunc that writes NexusEvents as JSONL to stdout.
func makeEmitFunc() EmitFunc {
	return func(event NexusEvent) {
		if err := writeJSON(event); err != nil {
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
