# Adapter SDK

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-06

---

## Overview

The Adapter SDK provides shared infrastructure for building Nexus adapters. Instead of each adapter reimplementing CLI parsing, JSONL emission, signal handling, NexusEvent construction, text chunking, and streaming protocol support, the SDK handles all of it. Adapter authors write only the platform-specific logic.

**Rationale:** After reviewing 9 upstream channels, every single one shares the same boilerplate gaps — `info` command, `health` command, NexusEvent normalization, CLI routing, JSONL output, graceful shutdown. The SDK eliminates ~30-40% of per-adapter effort by extracting this into a shared library.

---

## Language SDKs

| SDK | Module | Adapters |
|-----|--------|----------|
| **Go** | `github.com/nexus-project/adapter-sdk-go` | eve, gog, AIX, bird, calendar (5) |
| **TypeScript** | `@nexus/adapter-sdk` (see `ADAPTER_SDK_TYPESCRIPT.md`) | Discord, WhatsApp, Slack, Voice (4) |

Each SDK is a **separate repository** — Go modules and npm packages have different tooling, CI, and release cycles. The shared contract (NexusEvent schema, AdapterInfo, DeliveryResult) is defined in the spec docs and implemented idiomatically in each language.

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     ADAPTER BINARY                          │
│                                                             │
│   ┌──────────────────────────────────────────────────────┐ │
│   │              YOUR CODE (platform-specific)            │ │
│   │                                                       │ │
│   │   Monitor: poll chat.db, yield NexusEvents            │ │
│   │   Send: call platform API, return DeliveryResult      │ │
│   │   Backfill: iterate history, yield NexusEvents        │ │
│   │   Health: check connection status                     │ │
│   └──────────────────────────────────────────────────────┘ │
│                          │                                  │
│   ┌──────────────────────▼──────────────────────────────┐  │
│   │             ADAPTER SDK (shared infrastructure)      │  │
│   │                                                      │  │
│   │   CLI Router ─── Parses subcommands + flags          │  │
│   │   JSONL Writer ─ Serializes events to stdout         │  │
│   │   Event Builder ─ Fluent API for NexusEvent          │  │
│   │   PollMonitor ── Polling loop + cursor management    │  │
│   │   ChunkText ──── Smart text splitting for send       │  │
│   │   Stream ─────── stdin/stdout JSONL protocol         │  │
│   │   Signals ────── SIGTERM/SIGINT graceful shutdown     │  │
│   └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## SDK Components

### CLI Router

Parses `os.Args`, routes to the correct handler, manages flags per command.

The adapter binary exposes a fixed set of subcommands matching the adapter protocol:

```
<binary> info                                           → JSON stdout
<binary> monitor --account <id> --format jsonl          → JSONL stdout (long-running)
<binary> send --account <id> --to <target> [--thread <thread_id>] [--reply-to <reply_to_id>] --text "..." → JSON stdout
<binary> backfill --account <id> --since <date> --format jsonl → JSONL stdout (terminates)
<binary> health --account <id>                          → JSON stdout
<binary> accounts list                                  → JSON stdout
<binary> stream --account <id> --format jsonl           → stdin/stdout JSONL (long-running)
```

### NexusEvent Builder

Fluent API for constructing valid events. Catches schema mistakes at build time rather than at NEX ingestion.

```go
event := nexadapter.NewEvent("imessage", "imessage:abc-123").
    WithTimestamp(msg.Date).
    WithContent(msg.Text).
    WithSender(msg.Sender, msg.SenderName).
    WithPeer(msg.ChatID, "dm").
    WithAccount("default").
    Build()
```

### PollMonitor

Pre-built polling loop for adapters that read from databases/APIs (5 of 9 adapters). Handles sleep/poll/emit/cursor-advance cycle. Adapter only writes the fetch function.

```go
nexadapter.PollMonitor(nexadapter.PollConfig{
    Interval: 10 * time.Second,
    Fetch: func(ctx context.Context, cursor time.Time) ([]NexusEvent, time.Time, error) {
        // your platform-specific fetch logic
    },
})
```

### Text Chunking

Smart text splitting for `send` that respects platform character limits. Splits at natural boundaries: paragraph breaks > line breaks > sentence ends > word boundaries. Preserves fenced code blocks (does not split mid-fence; closes and reopens fences when a single block exceeds the limit).

```go
chunks := nexadapter.ChunkText(longMessage, 2000) // Discord's limit
// Returns ["first chunk...", "second chunk...", ...]
```

### Stream Protocol Handler

Handles the bidirectional JSONL streaming protocol. Parses `StreamEvent` from stdin, provides typed callbacks, emits `AdapterStreamStatus` on stdout.

```go
nexadapter.HandleStream(nexadapter.StreamCallbacks{
    OnStreamStart: func(e StreamStart) { /* create platform message */ },
    OnToken:       func(e Token)       { /* buffer + throttled edit */ },
    OnStreamEnd:   func(e StreamEnd)   { /* finalize message */ },
})
```

### JSONL Output & Signal Handling

Thread-safe JSON line writer to stdout. Structured logging to stderr. SIGTERM/SIGINT handling with context cancellation for graceful shutdown.

---

## Usage

### Minimal Adapter (Basic compliance)

```go
package main

import nexadapter "github.com/nexus-project/adapter-sdk-go"

func main() {
    nexadapter.Run(nexadapter.Adapter{
        Info: func() *nexadapter.AdapterInfo {
            return &nexadapter.AdapterInfo{
                Channel: "myplatform",
                Name:    "myplatform-cli",
                Version: "0.1.0",
                Supports: []nexadapter.Capability{
                    nexadapter.CapMonitor,
                },
            }
        },
        Monitor: func(ctx context.Context, account string, emit nexadapter.EmitFunc) error {
            // poll your platform, call emit(event) for each new message
        },
    })
}
```

### Full Adapter (Complete compliance)

```go
nexadapter.Run(nexadapter.Adapter{
    Info:     myInfo,
    Monitor:  myMonitor,     // or nexadapter.PollMonitor(config)
    Send:     mySend,
    Backfill: myBackfill,
    Health:   myHealth,
    Accounts: myAccounts,
    Stream:   &myStreamConfig, // optional, for streaming delivery
})
```

---

## Outbound: Where Things Live

The boundary between NEX and adapter for outbound delivery:

| Responsibility | Owner | What it does |
|---------------|-------|-------------|
| **Block batching** | NEX | Coalesces streaming tokens into ~800-1200 char blocks, calls `send` per block with delays |
| **Message chunking** | Adapter (SDK) | Splits a single `send` text into platform-sized chunks (e.g., 2000 chars for Discord) |
| **Formatting** | Adapter | Converts markdown → platform format (HTML, mrkdwn, plain text) |
| **Streaming rendering** | Adapter (SDK) | Handles `stream` protocol — token buffering, throttled edits, delivery status |

The SDK provides **ChunkText** for chunking and **StreamHandler** for the streaming protocol. The adapter provides the platform-specific formatting and API calls.

---

## Scaffold / Template

For creating new adapters quickly:

```bash
# Future: CLI scaffolding
nexus adapter init --name my-adapter --lang go --channel myplatform

# Creates:
# my-adapter/
# ├── main.go          # Wired up with SDK
# ├── go.mod           # Depends on adapter-sdk-go
# ├── monitor.go       # Stub: implement polling/watching
# ├── send.go          # Stub: implement delivery
# └── README.md
```

For now: clone a reference adapter (like eve-adapter) and modify.

---

## Repo Structure

```
nexus-adapter-sdks/
├── nexus-adapter-sdk-go/       # Go SDK library (go module)
└── nexus-adapter-sdk-ts/       # TypeScript SDK package (npm)

# Each adapter is its own repo, imports SDK as dependency:
eve/                            # go get github.com/nexus-project/adapter-sdk-go
gog/                            # go get github.com/nexus-project/adapter-sdk-go
discord-adapter/                # npm install @nexus-project/adapter-sdk-ts
```

SDK updates flow via normal dependency management — bump version in `go.mod` or `package.json`.

---

## Relationship to Other Specs

| Spec | Relationship |
|------|-------------|
| `ADAPTER_SYSTEM.md` | Defines the protocol the SDK implements |
| `INBOUND_INTERFACE.md` | Defines NexusEvent schema → SDK's types |
| `OUTBOUND_INTERFACE.MD` | Defines DeliveryResult, streaming types → SDK's types |
| `ADAPTER_INTERFACES.md` | Combined interface overview |
| `channels/` | Per-channel capabilities → adapter's `info` response |

---

*The SDK makes building an adapter a matter of writing platform-specific logic. Everything else is handled.*
