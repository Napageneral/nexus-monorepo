# Adapter System

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-06

---

## Overview

The Adapter System defines how NEX discovers, configures, manages, and communicates with adapters — the external tools that connect Nexus to the outside world (iMessage, Gmail, Discord, etc.).

**Core Principle:** Adapters are external executables that implement a CLI protocol. NEX manages them as processes. The adapter's job is to normalize platform-specific behavior into the unified NexusEvent format inbound, and handle platform-specific formatting outbound. NEX doesn't care what language the adapter is written in.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NEX DAEMON                                      │
│                                                                              │
│   ┌───────────────────────────────────────────────────────────────────┐     │
│   │                     ADAPTER MANAGER                                │     │
│   │                                                                    │     │
│   │   ┌────────────┐  ┌────────────┐  ┌────────────┐                 │     │
│   │   │ gog        │  │ eve        │  │ discord-cli│                 │     │
│   │   │ ┌────────┐ │  │ ┌────────┐ │  │ ┌────────┐ │                 │     │
│   │   │ │ acct 1 │ │  │ │default │ │  │ │echo-bot│ │                 │     │
│   │   │ │ acct 2 │ │  │ └────────┘ │  │ └────────┘ │                 │     │
│   │   │ │ acct 3 │ │  └────────────┘  └────────────┘                 │     │
│   │   │ └────────┘ │                                                   │     │
│   │   └────────────┘                                                   │     │
│   │                                                                    │     │
│   │   Responsibilities:                                                │     │
│   │   • Spawn/supervise adapter processes                             │     │
│   │   • Read JSONL from stdout → NexusEvent → Pipeline                │     │
│   │   • Health monitoring, auto-restart with backoff                  │     │
│   │   • Track runtime state in DB                                     │     │
│   │   • Expose adapter/channel state for context assembly             │     │
│   └───────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│   ┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐         │
│   │   Pipeline   │  │  Broker  │  │   IAM    │  │ Events Ledger │         │
│   └──────────────┘  └──────────┘  └──────────┘  └───────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Adapter Protocol

An adapter is any executable that implements the following CLI protocol. Language doesn't matter — Go, TypeScript, Python, Rust, shell script. NEX invokes it as a command and reads structured output.

### Required Commands

#### `info`

Self-describe the adapter. NEX calls this during registration and periodically for capability refresh.

```bash
<command> info
```

```typescript
interface AdapterInfo {
  // Identity
  channel: string;                    // "gmail", "imessage", "discord", etc.
  name: string;                       // Human-friendly name
  version: string;                    // Semver

  // What this adapter implements
  supports: AdapterCapability[];      // ["monitor", "send", "backfill", "health"]

  // Credential linking
  credential_service?: string;        // Links to credential store service (e.g., "google")
  multi_account: boolean;             // Supports multiple accounts?

  // Channel capabilities (for agent context)
  channel_capabilities: ChannelCapabilities;
}

type AdapterCapability = "monitor" | "send" | "stream" | "backfill" | "health" | "accounts" | "react" | "edit" | "delete" | "poll";
```

#### `monitor`

Stream live events as JSONL on stdout. NEX spawns this as a long-running process.

```bash
<command> monitor --account <account_id> --format jsonl
```

Output: One `NexusEvent` JSON object per line on stdout. Process runs until killed.

```jsonl
{"event_id":"gmail:msg:abc123","timestamp":1707235200000,"content":"Hey Tyler","channel":"gmail",...}
{"event_id":"gmail:msg:def456","timestamp":1707235260000,"content":"Meeting at 3pm","channel":"gmail",...}
```

#### `send`

Deliver a message to the platform. The adapter handles all formatting and chunking internally.

```bash
<command> send --account <account_id> --to <target> [--thread <thread_id>] [--reply-to <reply_to_id>] --text "message content"
<command> send --account <account_id> --to <target> [--thread <thread_id>] [--reply-to <reply_to_id>] --media <path> [--caption "text"]
```

Output: JSON `DeliveryResult` on stdout.

```typescript
interface DeliveryResult {
  success: boolean;
  message_ids: string[];       // Platform message IDs (one per chunk)
  chunks_sent: number;
  total_chars?: number;        // Optional metrics field
  error?: DeliveryError;
}

interface DeliveryError {
  type: 'rate_limited' | 'permission_denied' | 'not_found' | 'content_rejected' | 'network' | 'unknown';
  message: string;
  retry: boolean;
  retry_after_ms?: number;
  details?: Record<string, unknown>;
}
```

#### `stream`

Handle real-time streaming delivery. A long-running bidirectional process (like `monitor`). NEX pipes `StreamEvent` JSONL to stdin; the adapter emits delivery status JSONL on stdout.

```bash
<command> stream --account <account_id> --format jsonl
```

**Stdin:** StreamEvents as JSONL from NEX:

```jsonl
{"type":"stream_start","runId":"run_abc","target":{"channel":"discord","account_id":"echo-bot","to":"channel:123","thread_id":"123456789012345678","reply_to_id":"987654321098765432"},"sessionLabel":"main"}
{"type":"token","text":"Hello "}
{"type":"token","text":"world!"}
{"type":"tool_status","toolName":"Read","toolCallId":"tc_1","status":"started"}
{"type":"tool_status","toolName":"Read","toolCallId":"tc_1","status":"completed","summary":"Read file.ts"}
{"type":"token","text":"\n\nHere are the results..."}
{"type":"stream_end","runId":"run_abc","final":true}
```

**Stdout:** Delivery status as JSONL:

```jsonl
{"type":"message_created","messageId":"abc123"}
{"type":"message_updated","messageId":"abc123","chars":12}
{"type":"delivery_complete","messageIds":["abc123"]}
```

The stream process is long-running and handles multiple deliveries (each `stream_start`/`stream_end` pair is one delivery). The adapter internally handles platform-specific rendering — edit throttling for Discord/Telegram, SSE for web/API, etc.

**Only required if adapter declares `"stream"` in supports.** Adapters without `stream` support fall back to NEX's block pipeline, which coalesces tokens into blocks and delivers via `send`. See `broker/STREAMING.md` for the full streaming architecture.

---

### Optional Commands

#### `backfill`

Emit historical events. Same JSONL format as `monitor`.

```bash
<command> backfill --account <account_id> --since <ISO-date> --format jsonl
```

Terminates when backfill is complete (exit 0). Events are idempotent — re-running is safe.

#### `health`

Report current connection/account status.

```bash
<command> health --account <account_id>
```

```typescript
interface AdapterHealth {
  connected: boolean;
  account: string;
  last_event_at?: number;          // Unix ms
  error?: string;
  details?: Record<string, unknown>;  // Platform-specific
}
```

#### `accounts`

List and manage configured accounts.

```bash
<command> accounts list              # JSON array of account objects
<command> accounts add <account_id>  # Interactive or flag-based setup
```

```typescript
interface AdapterAccount {
  id: string;                    // Account identifier
  display_name?: string;         // Human-friendly name
  credential_ref?: string;       // "google/tnapathy@gmail.com"
  status: "ready" | "active" | "error";
}
```

---

## Channel Capabilities & Agent Context

### The Problem

When an agent generates a response, it needs to know what it's writing FOR. You don't write markdown tables if the output goes to WhatsApp. You don't write HTML if the output goes to Discord. But the agent writes markdown as its natural output — the adapter converts.

### Two-Layer Solution

**Layer 1: Agent Awareness (context assembly)**

The agent is told about channel capabilities so it can tailor its writing style. This is injected into context by the Broker during assembly.

```typescript
// Injected into event context (dynamic, per-turn)
interface ChannelContext {
  // Where the message came from / where the reply goes
  channel: string;                       // "discord", "imessage", "gmail"
  account: string;                       // "echo-bot", "default"

  // What the channel supports
  capabilities: ChannelCapabilities;

  // Available channels for explicit sends (all active outbound adapters)
  available_channels: AvailableChannel[];
}

interface AvailableChannel {
  channel: string;
  accounts: string[];
  capabilities: ChannelCapabilities;
}
```

**Layer 2: Adapter Formatting (delivery time)**

The adapter handles platform-specific conversion when `send` is called. The agent writes content naturally (markdown), and the adapter converts:

```
Agent writes:  "Here's the **summary**:\n\n| Item | Status |\n|------|--------|\n| Deploy | ✅ |"

Discord adapter: Keeps markdown, converts table to code block
Telegram adapter: Converts to HTML (<b>summary</b>, table as <pre>)
WhatsApp adapter: Strips markdown, renders table as plain text
iMessage adapter: Strips markdown, plain text
```

The adapter owns the conversion logic because it knows platform quirks intimately. NEX doesn't need to know that Telegram uses HTML parse mode or that Discord suppresses link embeds with `<>`.

### ChannelCapabilities

Reported by each adapter via `info`, stored by NEX, served to context assembly:

```typescript
interface ChannelCapabilities {
  // Text limits
  text_limit: number;                    // Max chars per message
  caption_limit?: number;                // Max chars for media caption

  // Formatting
  supports_markdown: boolean;
  markdown_flavor?: "standard" | "discord" | "telegram_html" | "slack_mrkdwn";
  supports_tables: boolean;              // Render or must convert?
  supports_code_blocks: boolean;

  // Features
  supports_embeds: boolean;
  supports_threads: boolean;
  supports_reactions: boolean;
  supports_polls: boolean;
  supports_buttons: boolean;
  supports_edit: boolean;
  supports_delete: boolean;
  supports_media: boolean;
  supports_voice_notes: boolean;

  // Behavioral
  supports_streaming_edit: boolean;      // Can "stream" by editing message
}
```

### Formatting Guidance for Agents

The agent knows capabilities from context. For simple cases (text limit, markdown yes/no), this is enough. For complex platform-specific formatting (Telegram inline keyboards, Discord embeds, Slack Block Kit), the agent needs deeper guidance.

**Strategy:** The `message` tool's response can include formatting hints when the agent is sending to a specific channel. This avoids polluting the system prompt (which would break caching) while providing just-in-time guidance.

```typescript
// When agent calls the message tool, the tool implementation can inject
// platform-specific guidance based on the target channel
function getFormattingGuidance(channel: string): string | null {
  // Only inject for channels with complex formatting
  if (channel === "telegram") return TELEGRAM_HTML_GUIDE;
  if (channel === "discord") return DISCORD_FORMATTING_GUIDE;
  if (channel === "slack") return SLACK_MRKDWN_GUIDE;
  return null; // Simple channels don't need guidance
}
```

**See:** `upstream/TOOL_HOOK_MECHANISM.md` for deeper investigation of this pattern.

---

## Registration

### Registering an Adapter

Registration tells NEX that an adapter exists and how to invoke it.

```bash
# Binary on PATH
nexus adapter register --name gog --command "gog"

# Explicit path
nexus adapter register --name my-adapter --command "/home/tyler/bin/my-adapter"

# Multi-word command (script, npx, etc.)
nexus adapter register --name foobar --command "python3 ~/projects/foobar-adapter/main.py"

# With npx
nexus adapter register --name discord --command "npx @nexus/discord-adapter"
```

### What Happens on Register

1. NEX executes `<command> info`
2. Validates JSON response matches `AdapterInfo` schema
3. Stores adapter definition in config
4. If `credential_service` is set, checks credential store for matching accounts
5. Reports available accounts to user

```
$ nexus adapter register --name gog --command "gog"

✓ gog registered (gmail adapter v1.2.0)
  Supports: monitor, send, backfill, health
  Credential service: google

  Found 3 accounts in credential store:
    • tnapathy@gmail.com
    • tyler@work.com
    • tyler@sideproject.com

  Run `nexus adapter enable gog/<account>` to activate.
```

### Registration Without Credentials

Some adapters don't need credentials:

```
$ nexus adapter register --name eve --command "eve"

✓ eve registered (imessage adapter v0.9.0)
  Supports: monitor, send, backfill
  No credentials required.

  Default account: default
  Run `nexus adapter enable eve/default` to activate.
```

---

## Account Management

### The Account Model

Accounts are the operational unit. Each adapter can have multiple accounts. Each account is independently startable, stoppable, monitorable.

```
Adapter (executable)
  └── Account (configured instance)
        ├── credential_ref?      Optional link to credential system
        ├── config               Adapter-specific settings
        ├── modes                monitor: bool, backfill: bool
        └── state (DB)           running/stopped, PID, health, event counts
```

### Account Discovery

When an adapter has `credential_service` set, NEX auto-discovers accounts from the credential store:

```
Adapter: gog
  credential_service: "google"
  ↓
Credential Store: state/credentials/google/
  tnapathy@gmail.com.json  →  account: tnapathy@gmail.com
  tyler@work.com.json      →  account: tyler@work.com
  tyler@sideproject.com.json → account: tyler@sideproject.com
```

Accounts can also be added manually:

```bash
# Add account with credential link
nexus adapter account add gog/new-account --credential google/new@gmail.com

# Add account without credentials (adapter handles auth internally)
nexus adapter account add eve/default
```

### Enabling Accounts

Discovered accounts aren't active by default. Enable with desired modes:

```bash
# Enable with live monitoring and backfill
nexus adapter enable gog/tnapathy@gmail.com --monitor --backfill

# Enable monitoring only
nexus adapter enable gog/tyler@work.com --monitor

# Enable backfill only (no live monitoring)
nexus adapter enable gog/tyler@sideproject.com --backfill

# Enable with defaults (monitor=true, backfill=false)
nexus adapter enable discord-cli/echo-bot
```

---

## Lifecycle

### Startup Sequence

When `nexus adapter start` is called (or NEX daemon starts):

```
For each enabled adapter account with monitor=true:

1. Resolve credential (if credential_ref set)
   └── Verify credential is valid (not broken/expired)

2. Spawn monitor process
   └── <command> monitor --account <id> --format jsonl

3. Begin reading JSONL from stdout
   └── Each line → parse NexusEvent → push to NEX pipeline

4. Update DB: status=running, pid=<pid>, started_at=now

5. If backfill=true AND not previously completed:
   └── Spawn background backfill process (see Backfill section)

6. Begin health monitoring loop
```

### Monitor → Pipeline Flow

```
Adapter stdout (JSONL)
     │
     │ parse line → NexusEvent
     ▼
Write to Events Ledger (async, idempotent)
     │
     ▼
Create NexusRequest
     │
     ▼
NEX Pipeline: receiveEvent → resolveIdentity → resolveAccess → ...
```

Every JSONL line from the adapter becomes a NexusEvent, gets written to the Events Ledger, and enters the full NEX pipeline.

### Backfill

Backfill runs as a background process after monitoring starts. The adapter emits historical events in the same JSONL format.

```
1. Spawn: <command> backfill --account <id> --since <date> --format jsonl

2. Read JSONL from stdout
   └── Each line → NexusEvent → write to Events Ledger
   └── Identity resolution runs (contact upserts)
   └── NO hooks, NO broker, NO agent responses

3. On process exit (code 0): mark backfill complete in DB
4. On process exit (non-zero): mark backfill failed, log error

5. Idempotent: Events Ledger has UNIQUE(source, source_id)
   └── Re-running backfill for same period is safe
```

**Why backfill skips the pipeline:** You don't want to generate agent responses for 10,000 old emails. Backfill populates the Events Ledger and Identity Graph (contacts), providing historical context for Cortex and future queries. The pipeline is for live events only.

### Shutdown

```
1. Send SIGTERM to all adapter monitor processes
2. Wait up to 5s for graceful shutdown
3. Send SIGKILL if still running
4. Update DB: status=stopped
5. Backfill processes: SIGTERM (can be resumed later)
```

### Process Supervision & Restart

NEX supervises adapter processes with auto-restart and exponential backoff:

```typescript
interface RestartPolicy {
  max_restarts: number;          // Max restarts before marking errored (default: 5)
  backoff_base_ms: number;       // Initial backoff (default: 1000)
  backoff_multiplier: number;    // Multiplier per restart (default: 2)
  backoff_max_ms: number;        // Max backoff (default: 300000 = 5 min)
  reset_after_ms: number;        // Reset restart count after healthy period (default: 600000 = 10 min)
}
```

**Restart flow:**

```
Process exits unexpectedly
     │
     ▼
Increment restart count
     │
     ├── restart_count <= max_restarts?
     │     │
     │     ▼
     │   Wait: backoff_base_ms * (backoff_multiplier ^ restart_count)
     │     │
     │     ▼
     │   Respawn process
     │     │
     │     ▼
     │   If healthy for reset_after_ms → reset restart count
     │
     └── restart_count > max_restarts?
           │
           ▼
         Mark status = "error"
         Log error for user attention
         Stop retrying
```

**Recovery:** User can manually restart errored adapters:

```bash
nexus adapter restart gog/tnapathy@gmail.com
```

---

## State Management

### Config (Desired State)

Lives in `nex.yaml`. Human-editable, version-controllable. Defines what should exist and how it should run.

```yaml
adapters:
  gog:
    command: "gog"
    channel: gmail
    credential_service: google
    accounts:
      tnapathy@gmail.com:
        credential: google/tnapathy@gmail.com
        monitor: true
        backfill: true
      tyler@work.com:
        credential: google/tyler@work.com
        monitor: true
      tyler@sideproject.com:
        credential: google/tyler@sideproject.com
        backfill: true   # history only, no live monitoring

  eve:
    command: "eve"
    channel: imessage
    accounts:
      default:
        monitor: true
        backfill: true

  discord-cli:
    command: "discord-cli"
    channel: discord
    credential_service: discord
    accounts:
      echo-bot:
        credential: discord/echo-bot
        monitor: true
```

### Database (Runtime State)

Lives in `runtime.db` (formerly `nexus.db`). Machine-managed. Tracks what IS happening.

```sql
CREATE TABLE adapter_instances (
    -- Identity
    adapter TEXT NOT NULL,              -- 'gog', 'eve', 'discord-cli'
    account TEXT NOT NULL,              -- 'tnapathy@gmail.com', 'default', 'echo-bot'
    channel TEXT NOT NULL,              -- 'gmail', 'imessage', 'discord'

    -- Process state
    status TEXT NOT NULL DEFAULT 'stopped',
        -- 'stopped', 'starting', 'running', 'error', 'backfilling'
    pid INTEGER,                        -- OS process ID (monitor)
    backfill_pid INTEGER,               -- OS process ID (backfill, if running)

    -- Health
    health_status TEXT DEFAULT 'unknown',
        -- 'healthy', 'degraded', 'disconnected', 'unknown'
    last_event_at INTEGER,              -- Unix ms of last event received
    last_health_check_at INTEGER,       -- Unix ms of last health probe
    error_message TEXT,                 -- Last error if any

    -- Restart tracking
    restart_count INTEGER DEFAULT 0,
    last_restart_at INTEGER,

    -- Stats
    events_received INTEGER DEFAULT 0,  -- Total events from monitor
    events_backfilled INTEGER DEFAULT 0,-- Total events from backfill
    backfill_status TEXT,               -- 'pending', 'running', 'completed', 'failed'
    backfill_since TEXT,                -- ISO date of backfill start point
    backfill_completed_at INTEGER,      -- When backfill finished

    -- Timing
    started_at INTEGER,
    updated_at INTEGER NOT NULL,

    PRIMARY KEY (adapter, account)
);

CREATE INDEX idx_adapter_instances_status ON adapter_instances(status);
CREATE INDEX idx_adapter_instances_channel ON adapter_instances(channel);
```

### Config vs DB Responsibilities

| Data | Location | Why |
|------|----------|-----|
| Adapter command/binary | Config | User configures, persists across restarts |
| Account credential ref | Config | User links, human-readable |
| Monitor/backfill modes | Config | User controls what runs |
| Process PID | DB | Ephemeral, changes every restart |
| Health status | DB | Updates frequently, machine-managed |
| Event counts | DB | Runtime metric |
| Restart count | DB | Ephemeral, resets on config change |
| Backfill progress | DB | Runtime tracking |
| Channel capabilities | DB (cached) | From adapter `info`, refreshed periodically |

---

## Outbound Delivery

### Two Delivery Paths

Agent responses reach the platform via one of two paths, based on adapter capability:

```
Agent generates response
     │
     ▼
Broker streams raw token events to NEX
     │
     ▼
NEX resolves outbound adapter from NexusRequest.delivery
     │
     ├── Adapter supports "stream"?
     │
     │   YES → Pipe StreamEvents to adapter's stream process (stdin JSONL)
     │         Adapter handles: formatting, edit throttling, platform delivery
     │         Adapter reports: delivery status on stdout
     │
     │   NO → NEX Block Pipeline coalesces tokens into blocks
     │         NEX calls: <command> send --account <id> --to <target> [--thread <thread_id>] [--reply-to <reply_to_id>] --text "block"
     │         Repeated for each block with human-like delays
     │
     ▼
NEX reads delivery status
     │
     ├── Write outbound event to Events Ledger (closes the loop)
     ├── Update NexusRequest with delivery_result
     └── Continue to finalize stage
```

### Streaming Path (adapters with `stream` support)

Token events flow from Broker → NEX → adapter stream process in real time. The adapter owns platform-specific rendering: Discord edits a message every ~300ms, Telegram uses `editMessageText`, API adapters forward raw SSE events.

See `broker/STREAMING.md` for the full streaming architecture.

### Block Fallback Path (adapters with `send` only)

For platforms that can't stream (iMessage, WhatsApp), NEX coalesces tokens into paragraph-sized blocks (~800-1200 chars) and delivers each block via the adapter's `send` command with human-like delays between blocks.

### Direct Send (non-streaming context)

For explicit agent sends via the `message` tool (not in response to streaming), the flow is direct:

```
Agent calls message tool → NEX resolves adapter → <command> send --account <id> --to <target> [--thread <thread_id>] [--reply-to <reply_to_id>] --text "content"
```

No streaming is involved — the message content is complete when the tool is called.

### Explicit Sends (Agent → Different Channel)

When the agent uses the `message` tool to send to a channel other than the originating one:

```
Agent calls: message({ action: "send", channel: "discord", to: "channel:123", text: "..." })
     │
     ▼
Message tool resolves: adapter=discord-cli, account=echo-bot
     │
     ▼
NEX calls: discord-cli send --account echo-bot --to "channel:123" [--thread <thread_id>] [--reply-to <reply_to_id>] --text "..."
     │
     ▼
Same flow as above
```

The agent knows what channels are available because `ChannelContext.available_channels` was injected during context assembly.

### Target Resolution

The `--to` parameter uses a consistent format across adapters:

```
<command> send --account <id> --to "<target>" [--thread <thread_id>] [--reply-to <reply_to_id>] --text "..."
```

Target format is adapter-specific but follows conventions:

| Channel | Target Format | Examples |
|---------|---------------|----------|
| gmail | Email address | `tyler@example.com` |
| imessage | Phone or email | `+14155551234`, `tyler@icloud.com` |
| discord | `channel:<id>` or `user:<id>` | `channel:123456789` |
| telegram | `chat:<id>` | `chat:-1001234567` |
| slack | `channel:<id>` or `user:<id>` | `channel:C1234567` |

---

## CLI Commands

### Adapter Management

```bash
# Registration
nexus adapter register --name <name> --command "<command>"
nexus adapter unregister <name>

# List adapters
nexus adapter list                     # All registered adapters
nexus adapter list --running           # Only running
nexus adapter list --channel gmail     # Filter by channel

# Adapter info
nexus adapter info <name>              # Show adapter details + accounts
```

### Account Management

```bash
# List accounts
nexus adapter accounts <adapter>       # List accounts for adapter

# Add/remove accounts
nexus adapter account add <adapter>/<account> [--credential <ref>]
nexus adapter account remove <adapter>/<account>

# Enable/disable
nexus adapter enable <adapter>/<account> [--monitor] [--backfill]
nexus adapter disable <adapter>/<account>
```

### Lifecycle

```bash
# Start/stop
nexus adapter start <adapter>/<account>    # Start specific account
nexus adapter start --all                  # Start all enabled
nexus adapter stop <adapter>/<account>     # Stop specific
nexus adapter stop --all                   # Stop all
nexus adapter restart <adapter>/<account>  # Restart (clears error state)

# Backfill
nexus adapter backfill <adapter>/<account> --since <date>
nexus adapter backfill <adapter>/<account> --status  # Check progress
```

### Status & Health

```bash
# Overview
nexus adapter status                   # All adapter/account status

# Example output:
# Adapters:
#   gog/tnapathy@gmail.com       gmail     running  healthy  last: 2s ago     events: 1,247
#   gog/tyler@work.com           gmail     running  healthy  last: 45s ago    events: 892
#   gog/tyler@sideproject.com    gmail     stopped  -        backfill only
#   eve/default                  imessage  running  healthy  last: 12s ago    events: 3,891
#   discord-cli/echo-bot         discord   running  healthy  last: 3m ago     events: 156

# Detailed health
nexus adapter health <adapter>/<account>
```

---

## Health Monitoring

NEX monitors adapter health through two mechanisms:

### 1. Process Liveness

- Monitor process PID is checked periodically (every 10s)
- If PID is gone → process died → trigger restart policy
- If stdout hasn't produced output in `stale_threshold` → run active health check

### 2. Active Health Check

NEX calls `<command> health --account <id>` periodically:

```
Healthy: { connected: true, last_event_at: <recent> }
  → status remains "running", health="healthy"

Degraded: { connected: true, last_event_at: <stale> }
  → status "running", health="degraded"

Disconnected: { connected: false, error: "..." }
  → status "running", health="disconnected"
  → Adapter may self-recover, NEX waits before intervention

Health check fails (timeout/error):
  → health="unknown"
```

### Health Intervals

| Condition | Check Interval |
|-----------|---------------|
| Healthy, events flowing | 60s |
| Healthy, no events for 5m | 30s |
| Degraded | 15s |
| Disconnected | 10s |
| Unknown | 10s |

---

## Context Assembly Integration

The Adapter Manager exposes state to the Broker for context assembly.

### What the Broker Queries

```typescript
interface AdapterManagerQuery {
  // For context assembly
  getActiveChannels(): ActiveChannel[];
  getChannelCapabilities(channel: string): ChannelCapabilities;

  // For outbound delivery
  getOutboundAdapter(channel: string, account?: string): ResolvedAdapter;

  // For status display
  getAdapterStatus(): AdapterInstanceStatus[];
}

interface ActiveChannel {
  channel: string;                    // "gmail", "discord", "imessage"
  adapter: string;                    // "gog", "discord-cli", "eve"
  accounts: string[];                 // Active accounts for this channel
  capabilities: ChannelCapabilities;
  direction: "inbound" | "outbound" | "both";
}
```

### What Goes Into Agent Context

During context assembly, the Broker injects channel information into the **event context** (dynamic, per-turn):

```typescript
// Injected into event context alongside time, timezone, etc.
const channelContext = {
  // Current channel (where this message came from)
  channel: "imessage",
  peer: "+14155551234",
  capabilities: { text_limit: 4000, supports_markdown: false, ... },

  // All channels available for explicit sends
  available_channels: [
    { channel: "gmail", accounts: ["tnapathy@gmail.com", "tyler@work.com"] },
    { channel: "imessage", accounts: ["default"] },
    { channel: "discord", accounts: ["echo-bot"], capabilities: { text_limit: 2000, supports_markdown: true, ... } },
  ],
};
```

This tells the agent:
- "You're responding on iMessage (no markdown, 4000 char limit)"
- "You can also send to gmail and discord if needed"
- "Discord has a 2000 char limit and supports markdown"

The agent adapts its writing style accordingly without needing to know platform-specific syntax.

---

## Adapter Compliance Levels

Not all adapters need to implement everything. Define compliance levels:

| Level | Requirements | Example |
|-------|-------------|---------|
| **Basic** | `info` + `monitor` | Read-only adapter (e.g., webhook receiver) |
| **Standard** | Basic + `send` | Full bidirectional adapter |
| **Complete** | Standard + `backfill` + `health` | Full-featured adapter with history |

An adapter declares its level implicitly via the `supports` array in `info`.

---

## Relationship to Existing Specs

### Adapter Interfaces (ADAPTER_INTERFACES.md, INBOUND_INTERFACE.md, OUTBOUND_INTERFACE.md)

Those specs define the **data contracts** — NexusEvent schema, DeliveryResult schema, ChannelCapabilities shape. This spec defines the **operational system** — how NEX manages adapters as processes.

### Credential System (CREDENTIAL_SYSTEM.md)

Adapters link to credentials via `credential_service`. The credential store's `Service → Account → Credentials[]` hierarchy maps naturally to adapter accounts.

### Adapter Credentials (ADAPTER_CREDENTIALS.md)

Defines how NEX resolves credential pointers and injects usable secrets into adapter processes (without argv leakage).

### Outbound Targeting (OUTBOUND_TARGETING.md)

Defines the canonical semantics for `thread_id` / `reply_to_id` and the required adapter protocol support (`--thread`, `--reply-to`, `stream_start.target`).

### NEX Pipeline (OVERVIEW.md)

Adapter events enter the pipeline at `receiveEvent`. Outbound delivery happens at `deliverResponse`. This spec defines how events get from adapter to pipeline and back.

### Context Assembly (broker/CONTEXT_ASSEMBLY.md)

Channel capabilities and available channels are injected into event context during assembly. This spec defines where that data comes from (Adapter Manager).

---

## Open Questions

1. **Config location** — Resolved: adapter config lives in `nex.yaml` under the `adapters:` key.

2. **Adapter updates** — How to handle adapter binary updates? Restart required? Hot-reload capabilities?

3. **Multi-host adapters** — Some adapters might run on different machines (e.g., eve on a Mac, discord-cli on a server). Future consideration for remote adapter management.

4. **Webhook adapters** — Some platforms require receiving webhooks (Telegram, LINE). The adapter would need to run an HTTP server. NEX would need to know the adapter's listen address for health checks. This works with the current model (adapter process manages its own HTTP server) but may need explicit documentation.

5. **Rate limiting** — Should NEX enforce outbound rate limits, or leave it to adapters? Currently adapters handle their own platform rate limits. NEX might want global rate limiting for cost/abuse control.

---

## Related Documents

- `ADAPTER_INTERFACES.md` — Data contracts (NexusEvent, DeliveryResult)
- `INBOUND_INTERFACE.md` — Inbound event schema and normalization
- `OUTBOUND_INTERFACE.md` — Delivery interface, formatting, chunking
- `OUTBOUND_TARGETING.md` — Threading + reply semantics
- `CHANNEL_DIRECTORY.md` — Directory of outbound targets per channel/account
- `channels/` — Per-channel capability specs
- `../nex/NEXUS_REQUEST.md` — Request object adapters create/consume
- `../broker/CONTEXT_ASSEMBLY.md` — How channel context feeds into agent prompts
- `../../environment/capabilities/credentials/CREDENTIAL_SYSTEM.md` — Credential linking
- `upstream/CHANNEL_INVENTORY.md` — OpenClaw channel implementations
- `upstream/OPENCLAW_INBOUND.md` — OpenClaw inbound patterns
- `upstream/OPENCLAW_OUTBOUND.md` — OpenClaw outbound patterns

---

*This document defines the operational adapter system for Nexus — how adapters are registered, configured, managed, and monitored by NEX.*
