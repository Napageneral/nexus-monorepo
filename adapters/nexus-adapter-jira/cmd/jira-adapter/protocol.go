package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"
)

var recordStdoutMu sync.Mutex

func preprocessCLIArgs(args []string) []string {
	if len(args) < 2 {
		return args
	}

	rewritten := append([]string(nil), args...)
	switch rewritten[1] {
	case "info":
		rewritten[1] = "adapter.info"
	case "monitor":
		rewritten[1] = "adapter.monitor.start"
	case "health":
		rewritten[1] = "adapter.health"
	case "connections.list":
		rewritten[1] = "adapter.accounts.list"
	case "backfill":
		rewritten[1] = "records.backfill"
	}

	return rewritten
}

func hasFlag(args []string, flag string) bool {
	for _, arg := range args {
		if arg == flag {
			return true
		}
	}
	return false
}

func writeRecord(record adapterInboundRecord) error {
	data, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("marshal record.ingest: %w", err)
	}

	recordStdoutMu.Lock()
	defer recordStdoutMu.Unlock()
	_, err = os.Stdout.Write(append(data, '\n'))
	return err
}

func logEmitError(recordType, externalRecordID string, err error) {
	if strings.TrimSpace(externalRecordID) == "" {
		externalRecordID = "unknown"
	}
	fmt.Fprintf(os.Stderr, "[ERROR] emit %s %s: %v\n", recordType, externalRecordID, err)
}

func runRecordsBackfill(args []string) error {
	fs := flag.NewFlagSet("records.backfill", flag.ContinueOnError)
	connection := fs.String("connection", "", "Connection ID")
	legacyAccount := fs.String("account", "", "Legacy account ID alias")
	sinceValue := fs.String("since", "", "Backfill lower bound (RFC3339 or YYYY-MM-DD)")
	_ = fs.String("format", "jsonl", "Output format")
	if err := fs.Parse(args); err != nil {
		return err
	}

	if strings.TrimSpace(*sinceValue) == "" {
		*sinceValue = "1970-01-01"
	}

	since, err := parseBackfillSince(*sinceValue)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return backfill(ctx, firstNonBlank(*connection, *legacyAccount), since, nil)
}

func parseBackfillSince(value string) (time.Time, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return time.Time{}, fmt.Errorf("missing --since")
	}
	if parsed, err := time.Parse(time.RFC3339, trimmed); err == nil {
		return parsed, nil
	}
	if parsed, err := time.Parse("2006-01-02", trimmed); err == nil {
		return parsed, nil
	}
	return time.Time{}, fmt.Errorf("invalid --since %q", value)
}
