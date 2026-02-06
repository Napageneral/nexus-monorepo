// Package nexadapter provides shared infrastructure for building Nexus adapters.
//
// Instead of each adapter reimplementing CLI parsing, JSONL emission, signal
// handling, NexusEvent construction, text chunking, and streaming protocol
// support, this SDK handles all of it. Adapter authors write only the
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
//	        Info:    myInfo,
//	        Monitor: myMonitor,  // or nexadapter.PollMonitor(config)
//	        Send:    mySend,
//	    })
//	}
//
// The SDK parses CLI arguments, routes to your handlers, manages JSONL output,
// and handles signals for graceful shutdown.
package nexadapter

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// Adapter defines the handler functions for a Nexus adapter.
// Implement the handlers for the capabilities your adapter supports.
//
// At minimum, Info and Monitor are required (Basic compliance).
// Add Send for Standard, plus Backfill/Health/Accounts for Complete.
type Adapter struct {
	// Info returns the adapter's identity and capabilities.
	// Required for all adapters.
	Info func() *AdapterInfo

	// Monitor streams live events. Called with a context that cancels on SIGTERM.
	// Use the emit function to write NexusEvents — the SDK handles JSONL serialization.
	// Should block until ctx is cancelled.
	// Required for Basic+ compliance.
	Monitor func(ctx context.Context, account string, emit EmitFunc) error

	// Send delivers a message to the platform.
	// Required for Standard+ compliance.
	Send func(ctx context.Context, req SendRequest) (*DeliveryResult, error)

	// Backfill emits historical events. Same contract as Monitor but terminates
	// when history is exhausted (exit 0). Events are idempotent — re-running is safe.
	// Optional (Complete compliance).
	Backfill func(ctx context.Context, account string, since time.Time, emit EmitFunc) error

	// Health reports the current connection/account status.
	// Optional (Complete compliance).
	Health func(ctx context.Context, account string) (*AdapterHealth, error)

	// Accounts lists configured accounts for this adapter.
	// Optional (Complete compliance).
	Accounts func(ctx context.Context) ([]AdapterAccount, error)

	// Stream configures streaming delivery support.
	// Only needed if the adapter declares CapStream in its supports.
	// Optional (Extended compliance).
	Stream *StreamConfig
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
	case "info":
		err = runInfo(adapter)
	case "monitor":
		err = runMonitor(adapter, filteredArgs)
	case "send":
		err = runSend(adapter, filteredArgs)
	case "backfill":
		err = runBackfill(adapter, filteredArgs)
	case "health":
		err = runHealth(adapter, filteredArgs)
	case "accounts":
		err = runAccounts(adapter, filteredArgs)
	case "stream":
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
	fmt.Fprintf(os.Stderr, "Usage: %s <command> [flags]\n\n", name)
	fmt.Fprintf(os.Stderr, "Commands:\n")
	fmt.Fprintf(os.Stderr, "  info                              Self-describe this adapter\n")
	fmt.Fprintf(os.Stderr, "  monitor  --account <id>           Stream live events (JSONL)\n")
	fmt.Fprintf(os.Stderr, "  send     --account <id> --to <target> --text \"...\"\n")
	fmt.Fprintf(os.Stderr, "  backfill --account <id> --since <date>\n")
	fmt.Fprintf(os.Stderr, "  health   --account <id>           Check connection status\n")
	fmt.Fprintf(os.Stderr, "  accounts list                     List configured accounts\n")
	fmt.Fprintf(os.Stderr, "  stream   --account <id>           Streaming delivery (stdin/stdout)\n")
	fmt.Fprintf(os.Stderr, "\nGlobal flags:\n")
	fmt.Fprintf(os.Stderr, "  --verbose, -v                     Enable debug logging\n")
}

// --- Command Handlers ---

func runInfo(adapter Adapter) error {
	if adapter.Info == nil {
		return fmt.Errorf("info handler not implemented")
	}
	info := adapter.Info()
	return writeJSON(info)
}

func runMonitor(adapter Adapter, args []string) error {
	if adapter.Monitor == nil {
		return fmt.Errorf("monitor not supported by this adapter")
	}

	fs := flag.NewFlagSet("monitor", flag.ContinueOnError)
	account := fs.String("account", "", "Account ID")
	_ = fs.String("format", "jsonl", "Output format (always jsonl)")
	if err := fs.Parse(args); err != nil {
		return err
	}

	ctx := signalContext()

	emit := makeEmitFunc()

	LogInfo("monitor starting for account %q", *account)
	err := adapter.Monitor(ctx, *account, emit)
	if err != nil {
		return fmt.Errorf("monitor: %w", err)
	}
	LogInfo("monitor stopped cleanly")
	return nil
}

func runSend(adapter Adapter, args []string) error {
	if adapter.Send == nil {
		return fmt.Errorf("send not supported by this adapter")
	}

	fs := flag.NewFlagSet("send", flag.ContinueOnError)
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
		Account:  *account,
		Target:   *to,
		Text:     *text,
		Media:    *media,
		Caption:  *caption,
		ReplyTo:  *replyTo,
		ThreadID: *threadID,
	}

	result, err := adapter.Send(ctx, req)
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
	if adapter.Backfill == nil {
		return fmt.Errorf("backfill not supported by this adapter")
	}

	fs := flag.NewFlagSet("backfill", flag.ContinueOnError)
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
	err = adapter.Backfill(ctx, *account, sinceTime, emit)
	if err != nil {
		return fmt.Errorf("backfill: %w", err)
	}
	LogInfo("backfill completed")
	return nil
}

func runHealth(adapter Adapter, args []string) error {
	if adapter.Health == nil {
		return fmt.Errorf("health not supported by this adapter")
	}

	fs := flag.NewFlagSet("health", flag.ContinueOnError)
	account := fs.String("account", "", "Account ID")
	if err := fs.Parse(args); err != nil {
		return err
	}

	ctx := context.Background()
	health, err := adapter.Health(ctx, *account)
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
	if adapter.Accounts == nil {
		return fmt.Errorf("accounts not supported by this adapter")
	}

	// Handle "accounts list" or bare "accounts"
	subcmd := "list"
	if len(args) > 0 && args[0] != "" && args[0][0] != '-' {
		subcmd = args[0]
	}

	switch subcmd {
	case "list":
		ctx := context.Background()
		accounts, err := adapter.Accounts(ctx)
		if err != nil {
			return fmt.Errorf("accounts list: %w", err)
		}
		return writeJSON(accounts)
	default:
		return fmt.Errorf("unknown accounts subcommand: %s (expected: list)", subcmd)
	}
}

func runStream(adapter Adapter, args []string) error {
	if adapter.Stream == nil {
		return fmt.Errorf("stream not supported by this adapter")
	}

	fs := flag.NewFlagSet("stream", flag.ContinueOnError)
	_ = fs.String("account", "", "Account ID")
	_ = fs.String("format", "jsonl", "Output format (always jsonl)")
	if err := fs.Parse(args); err != nil {
		return err
	}

	ctx := signalContext()

	LogInfo("stream handler starting")
	err := handleStream(ctx, adapter.Stream)
	if err != nil {
		return fmt.Errorf("stream: %w", err)
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
