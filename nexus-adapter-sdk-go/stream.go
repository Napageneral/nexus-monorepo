package nexadapter

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
)

// StreamConfig configures the streaming delivery handler.
// Only needed for adapters that declare "stream" in their supports.
type StreamConfig struct {
	// OnStreamStart is called when a new streaming delivery begins.
	// The adapter should create a platform message and prepare for token accumulation.
	OnStreamStart func(ctx context.Context, event StreamEvent) error

	// OnToken is called for each token in the stream.
	// The adapter should buffer tokens and periodically update the platform message
	// (e.g., Discord edits every ~300ms, Telegram editMessageText).
	OnToken func(ctx context.Context, event StreamEvent) error

	// OnToolStatus is called when a tool execution status changes.
	// The adapter can optionally display tool activity indicators.
	OnToolStatus func(ctx context.Context, event StreamEvent) error

	// OnReasoning is called for reasoning/thinking tokens.
	// The adapter can optionally display these (e.g., in a spoiler block).
	OnReasoning func(ctx context.Context, event StreamEvent) error

	// OnStreamEnd is called when the streaming delivery is complete.
	// The adapter should finalize the message and report delivery status.
	OnStreamEnd func(ctx context.Context, event StreamEvent) error

	// OnStreamError is called when an error occurs during streaming.
	// The adapter should handle partial delivery gracefully.
	OnStreamError func(ctx context.Context, event StreamEvent) error
}

// EmitStreamStatus writes an AdapterStreamStatus to stdout.
// Call this from stream callbacks to report delivery progress to NEX.
func EmitStreamStatus(status AdapterStreamStatus) error {
	return writeJSON(status)
}

// handleStream reads StreamEvent JSONL from stdin and dispatches to callbacks.
// This is the main loop for the `stream` command.
func handleStream(ctx context.Context, config *StreamConfig) error {
	scanner := bufio.NewScanner(os.Stdin)
	// Increase buffer size for potentially large events
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			LogInfo("stream shutting down (context cancelled)")
			return nil
		default:
		}

		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var event StreamEvent
		if err := json.Unmarshal(line, &event); err != nil {
			LogError("stream: failed to parse event: %v", err)
			continue
		}

		var err error
		switch event.Type {
		case "stream_start":
			if config.OnStreamStart != nil {
				err = config.OnStreamStart(ctx, event)
			}
		case "token":
			if config.OnToken != nil {
				err = config.OnToken(ctx, event)
			}
		case "tool_status":
			if config.OnToolStatus != nil {
				err = config.OnToolStatus(ctx, event)
			}
		case "reasoning":
			if config.OnReasoning != nil {
				err = config.OnReasoning(ctx, event)
			}
		case "stream_end":
			if config.OnStreamEnd != nil {
				err = config.OnStreamEnd(ctx, event)
			}
		case "stream_error":
			if config.OnStreamError != nil {
				err = config.OnStreamError(ctx, event)
			}
		default:
			LogDebug("stream: unknown event type: %s", event.Type)
		}

		if err != nil {
			LogError("stream handler error for %s: %v", event.Type, err)
			_ = EmitStreamStatus(AdapterStreamStatus{
				Type:     "delivery_error",
				ErrorMsg: err.Error(),
			})
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("stream: stdin read error: %w", err)
	}

	return nil
}
