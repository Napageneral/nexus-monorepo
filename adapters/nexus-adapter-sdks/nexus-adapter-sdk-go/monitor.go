package nexadapter

import (
	"context"
	"fmt"
	"time"
)

// EmitFunc is called by monitor/backfill handlers to emit adapter-facing JSON
// records to stdout. The SDK handles JSONL serialization and writing. Thread-safe.
type EmitFunc func(record any)

// PollConfig configures a polling-based monitor.
//
// Use PollMonitor when your adapter reads from a database, API, or any
// other pull-based source. The SDK manages the polling loop, cursor
// advancement, and JSONL emission — you just write the fetch function.
type PollConfig[T any] struct {
	// Interval between polls. Required.
	Interval time.Duration

	// Fetch retrieves events since the given cursor time.
	// Returns the events and the new cursor position.
	// If newCursor is zero, the cursor is not advanced (useful when no events found).
	// The function should respect ctx cancellation.
	Fetch func(ctx context.Context, since time.Time) (records []T, newCursor time.Time, err error)

	// InitialCursor is the starting cursor position.
	// Defaults to time.Now() if zero.
	InitialCursor time.Time

	// ErrorBackoff is how long to wait after a fetch error before retrying.
	// Defaults to the poll Interval if zero.
	ErrorBackoff time.Duration

	// MaxConsecutiveErrors is how many consecutive fetch errors before the
	// monitor exits with an error. 0 means never exit (keep retrying forever).
	MaxConsecutiveErrors int
}

// PollMonitor returns a MonitorFunc that polls at a fixed interval.
// It handles the sleep/poll/emit/cursor-advance cycle. The adapter author
// only provides the Fetch function.
//
// Example:
//
//	adapter := nexadapter.Adapter{
//	    Operations: nexadapter.AdapterOperations{
//	        MonitorStart: nexadapter.PollMonitor(nexadapter.PollConfig[nexadapter.AdapterInboundRecord]{
//	            Interval: 10 * time.Second,
//	            Fetch: func(ctx context.Context, since time.Time) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
//	                rows := queryMessagesAfter(since)
//	                var records []nexadapter.AdapterInboundRecord
//	                var latest time.Time
//	                for _, row := range rows {
//	                    records = append(records, convertToRecord(row))
//	                    if row.Date.After(latest) {
//	                        latest = row.Date
//	                    }
//	                }
//	                return records, latest, nil
//	            },
//	        }),
//	    },
//	}
func PollMonitor[T any](config PollConfig[T]) func(ctx context.Context, connectionID string, emit EmitFunc) error {
	return func(ctx context.Context, connectionID string, emit EmitFunc) error {
		cursor := config.InitialCursor
		if cursor.IsZero() {
			cursor = time.Now()
		}

		errorBackoff := config.ErrorBackoff
		if errorBackoff == 0 {
			errorBackoff = config.Interval
		}

		consecutiveErrors := 0

		for {
			select {
			case <-ctx.Done():
				LogInfo("monitor shutting down (context cancelled)")
				return nil
			default:
			}

			records, newCursor, err := config.Fetch(ctx, cursor)
			if err != nil {
				consecutiveErrors++
				LogError("poll fetch error (%d consecutive): %v", consecutiveErrors, err)

				if config.MaxConsecutiveErrors > 0 && consecutiveErrors >= config.MaxConsecutiveErrors {
					return fmt.Errorf("too many consecutive errors (%d): %w", consecutiveErrors, err)
				}

				// Back off on error
				select {
				case <-ctx.Done():
					return nil
				case <-time.After(errorBackoff):
					continue
				}
			}

			// Reset error counter on success
			consecutiveErrors = 0

			// Emit events
			for _, record := range records {
				emit(record)
			}

			if len(records) > 0 {
				LogDebug("emitted %d records", len(records))
			}

			// Advance cursor
			if !newCursor.IsZero() {
				cursor = newCursor
			}

			// Wait for next poll
			select {
			case <-ctx.Done():
				LogInfo("monitor shutting down (context cancelled)")
				return nil
			case <-time.After(config.Interval):
			}
		}
	}
}
