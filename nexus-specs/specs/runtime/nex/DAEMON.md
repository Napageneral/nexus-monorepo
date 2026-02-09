# NEX Daemon

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-05  
**Related:** NEX.md, ADAPTER_SYSTEM.md, BUS_ARCHITECTURE.md, PLUGINS.md

---

## Overview

The NEX daemon is the persistent process that **is** Nexus at runtime. It boots the system, supervises adapters, runs the pipeline, serves the event bus, and shuts down cleanly.

```
nexus daemon start
     │
     ▼
┌──────────────────────────────────────────────────────────┐
│                      NEX DAEMON                           │
│                                                           │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │  Config   │  │ Ledger DBs   │  │   Event Bus        │ │
│  └──────────┘  └──────────────┘  └────────────────────┘ │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐│
│  │              Adapter Manager                          ││
│  │  eve/default (PID 1234)    ● running                 ││
│  │  gog/tnapathy  (PID 1235)  ● running                ││
│  │  discord/echo  (PID 1236)  ● running                 ││
│  └──────────────────────────────────────────────────────┘│
│                                                           │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────────┐ │
│  │  Pipeline     │  │  Plugins   │  │  HTTP Server     │ │
│  │  (8 stages)   │  │  (loaded)  │  │  (health + SSE)  │ │
│  └──────────────┘  └────────────┘  └──────────────────┘ │
│                                                           │
│  ┌──────────────┐  ┌────────────────────────────────────┐│
│  │  Timer        │  │  Signal Handler                    ││
│  │  (heartbeat)  │  │  SIGTERM → shutdown                ││
│  │              │  │  SIGINT  → shutdown                 ││
│  │              │  │  SIGUSR1 → config reload            ││
│  └──────────────┘  └────────────────────────────────────┘│
│                                                           │
└──────────────────────────────────────────────────────────┘
```

**This spec covers:** How the process starts, what it supervises, how it handles signals, and how it shuts down. The *pipeline* is in `NEX.md`. The *adapter lifecycle* is in `ADAPTER_SYSTEM.md`. The *bus* is in `BUS_ARCHITECTURE.md`.

---

## Startup Sequence

When `nexus daemon start` executes:

```
1. Lock                        Acquire PID lockfile (~/.nexus/nex.pid)
2. Config                      Load nex.yaml, validate schema
3. Logging                     Initialize structured logger
4. Databases                   Open/migrate ledger databases
5. Event Bus                   Initialize in-memory pub/sub
6. Plugin Loader               Load plugins from plugins/ directory
7. Pipeline                    Wire up 8-stage pipeline with loaded plugins
8. HTTP Server                 Start health + SSE endpoint
9. Adapter Manager             Start enabled adapter accounts (spawn processes)
10. Timer                      Start internal heartbeat/cron adapter
11. Ready                      Publish system.started, write ready state
```

### 1. PID Lockfile

Prevents multiple daemon instances:

```typescript
const LOCKFILE = path.join(nexusStateDir, 'nex.pid');

function acquireLock(): void {
  if (fs.existsSync(LOCKFILE)) {
    const existingPid = parseInt(fs.readFileSync(LOCKFILE, 'utf-8'));
    if (isProcessRunning(existingPid)) {
      throw new Error(`NEX daemon already running (PID ${existingPid})`);
    }
    // Stale lockfile — previous crash
    fs.unlinkSync(LOCKFILE);
  }
  fs.writeFileSync(LOCKFILE, String(process.pid));
}
```

On exit (clean or crash handler), the lockfile is removed.

### 2. Configuration

Load from `nex.yaml` (or `config.yaml` with `nex:` key):

```yaml
# nex.yaml
daemon:
  host: "127.0.0.1"           # Bind address for HTTP server
  port: 7400                   # HTTP port (health + SSE)
  log_level: "info"            # debug | info | warn | error

pipeline:
  timeout_ms: 300000           # 5 min max per request

ledgers:
  directory: ./data            # Base path for SQLite databases

adapters:
  # See ADAPTER_SYSTEM.md for full adapter config
  gog:
    command: "gog"
    # ...

plugins:
  directory: ./plugins
  enabled:
    - logging
    - analytics

timer:
  heartbeat_interval_ms: 60000 # 1 minute heartbeat
  cron: []                     # Cron expressions (future)

bus:
  mode: "memory"               # memory | write-through
```

Config validation fails fast — if the config is invalid, the daemon exits with a clear error before touching databases or spawning processes.

### 3. Database Initialization

Open (or create + migrate) all ledger databases:

```
data/
├── events.db        # Events Ledger — inbound/outbound events
├── agents.db        # Agents Ledger — sessions, turns, messages, tool_calls
├── identity.db      # Identity Graph — entities, identities, union-find
├── nexus.db         # Nexus Ledger — nex_traces, adapter_instances, config
└── cortex/          # Cortex DBs (per-agent, managed by Cortex)
    └── {agentId}.db
```

Migration strategy: each database has a `schema_version` table. On open, check version and apply any pending migrations. If migration fails, daemon exits with error — never run with stale schema.

### 4. Adapter Manager Boot

The Adapter Manager reads the `adapters:` config and the `adapter_instances` DB table, then starts enabled accounts:

```
For each adapter in config:
  For each account with monitor: true OR backfill pending:
    1. Verify credential (if credential_ref set)
    2. Spawn monitor: <command> monitor --account <id> --format jsonl
    3. Begin reading JSONL stdout → pipeline
    4. Update adapter_instances: status=running, pid=<pid>
    5. If backfill enabled and not completed → spawn backfill
    6. Start health check loop
```

Adapters start in parallel (no ordering dependency between adapters). Each adapter's stdout reader runs in its own async loop.

**Startup order within an adapter account is sequential:** credential check → spawn → confirm stdout is readable → mark running.

See `ADAPTER_SYSTEM.md` for full adapter lifecycle, restart policy, health monitoring.

### 5. Timer Adapter

The timer adapter is internal (not an external process). It generates synthetic events at configured intervals:

```typescript
interface TimerEvent {
  event_id: string;        // "timer:heartbeat:<timestamp>"
  channel: "timer";
  content_type: "system/heartbeat";
  content: "";
  timestamp: number;
  sender_id: "system";
  peer_id: "system";
  peer_kind: "dm";
}
```

Timer events enter the full pipeline like any other event. Automations can match on `channel: "timer"` for scheduled tasks (daily summaries, periodic checks, etc.).

```yaml
timer:
  heartbeat_interval_ms: 60000    # Fire every 60s
  cron:
    - expr: "0 8 * * *"           # Daily at 8am
      label: "morning-summary"
    - expr: "*/30 * * * *"        # Every 30 min
      label: "email-check"
```

Cron events carry the label in metadata so automations can distinguish them:

```typescript
// Timer cron event
{
  event_id: "timer:cron:morning-summary:1707235200000",
  channel: "timer",
  content_type: "system/cron",
  content: "",
  metadata: { cron_label: "morning-summary", cron_expr: "0 8 * * *" }
}
```

### 6. HTTP Server

Minimal HTTP server for health checks and SSE streaming:

```
GET /health              → Health check (for doctor system, monitoring)
GET /api/events/stream   → SSE event stream (bus subscriber)
```

Binds to `daemon.host:daemon.port` (default `127.0.0.1:7400`). Loopback only by default — no external exposure without explicit config.

#### Health Endpoint

```
GET /health
```

```typescript
interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime_ms: number;
  pid: number;

  adapters: {
    total: number;
    running: number;
    errored: number;
    details: Array<{
      adapter: string;
      account: string;
      status: string;
      health: string;
      last_event_age_ms: number | null;
    }>;
  };

  pipeline: {
    active_requests: number;
    total_processed: number;
    avg_latency_ms: number;
  };

  ledgers: {
    events_db: "ok" | "error";
    agents_db: "ok" | "error";
    identity_db: "ok" | "error";
    nexus_db: "ok" | "error";
  };
}
```

Overall status logic:
- **healthy** — all adapters running, all DBs ok, pipeline processing
- **degraded** — some adapters errored or degraded, but pipeline functional
- **unhealthy** — pipeline broken or critical DB inaccessible

#### SSE Endpoint

See `BUS_ARCHITECTURE.md` for full SSE spec. The daemon starts the SSE endpoint as part of the HTTP server, subscribing to all bus events.

### 7. Ready State

Once all subsystems are initialized:

1. Publish `system.started` bus event with version info
2. Log startup summary:

```
[NEX] Daemon started (v0.1.0)
  PID:       12345
  HTTP:      127.0.0.1:7400
  Adapters:  3 running, 0 errored
    eve/default           imessage  ● running
    gog/tnapathy@gmail.com gmail   ● running
    discord-cli/echo-bot  discord   ● running
  Plugins:   2 loaded (logging, analytics)
  Timer:     heartbeat every 60s
  Ledgers:   4/4 ok
```

---

## Signal Handling

| Signal | Action |
|--------|--------|
| `SIGTERM` | Graceful shutdown (standard process termination) |
| `SIGINT` | Graceful shutdown (Ctrl+C) |
| `SIGUSR1` | Config hot-reload |
| `SIGUSR2` | Reserved (future: dump diagnostics to file) |

### Graceful Shutdown (SIGTERM / SIGINT)

```
Signal received
     │
     ▼
1. Publish system.stopping bus event
2. Stop accepting new adapter events (close JSONL readers)
3. Drain active pipeline requests (wait up to 30s)
4. Stop timer adapter
5. Send SIGTERM to all adapter processes
6. Wait up to 5s for adapter processes to exit
7. SIGKILL any remaining adapter processes
8. Close HTTP server (stop accepting new connections, drain active)
9. Flush async ledger writes
10. Close database connections
11. Remove PID lockfile
12. Exit 0
```

**Key principle:** Don't lose data. Active pipeline requests finish. Pending ledger writes flush. Only then do we exit.

**Timeout behavior:**
- Active requests get 30s to complete. After that, they're cancelled and logged as interrupted.
- Adapter processes get 5s after SIGTERM. This matches `ADAPTER_SYSTEM.md` shutdown spec.
- HTTP server gets 5s to drain active SSE connections.

### Config Hot-Reload (SIGUSR1)

```
SIGUSR1 received
     │
     ▼
1. Re-read nex.yaml
2. Validate new config against schema
3. If invalid → log error, keep running with old config
4. Diff old vs new config
5. Apply changes that don't require restart:
     │
     ├── adapter added/removed → start/stop adapter processes
     ├── adapter account enabled/disabled → start/stop monitor
     ├── timer intervals changed → reschedule
     ├── plugin enabled/disabled → load/unload
     ├── log level changed → update logger
     ├── bus mode changed → switch write-through on/off
     │
     └── Changes that DO require restart (logged as warning):
           ├── daemon.port changed
           ├── ledgers.directory changed
           └── pipeline.timeout_ms changed (applies to new requests only)
6. Publish system.config_reloaded bus event
```

CLI trigger:

```bash
# Send SIGUSR1 to running daemon
nexus daemon reload

# Equivalent to:
kill -USR1 $(cat ~/.nexus/nex.pid)
```

---

## Process Model

### What Runs Inside the Daemon

| Component | Thread/Async Model | Notes |
|-----------|-------------------|-------|
| Pipeline stages | Async functions (event loop) | All in-process, no network hops |
| Adapter stdout readers | One async loop per adapter | Reads JSONL, pushes to pipeline |
| Adapter stream writers | One async loop per streaming adapter | Writes StreamEvent JSONL to stdin |
| Health check loops | One timer per adapter | Periodic health probes |
| Timer adapter | Single interval/cron scheduler | Generates synthetic events |
| HTTP server | Async (Hono/native) | Health + SSE |
| Event Bus | In-memory pub/sub | Sync publish, async subscribers |
| Async ledger writes | Background write queue | Batched/coalesced |

### What Runs as Child Processes

| Process | Managed By | Lifecycle |
|---------|-----------|-----------|
| Adapter `monitor` | Adapter Manager | Long-running, auto-restart |
| Adapter `stream` | Adapter Manager | Long-running, auto-restart |
| Adapter `backfill` | Adapter Manager | Terminates on completion |
| Adapter `health` | Adapter Manager | Short-lived per check |
| Adapter `send` | Pipeline (stage 7) | Short-lived per delivery |

All child processes are tracked by PID. On daemon shutdown, all children are cleaned up.

---

## CLI Commands

### `nexus daemon start`

Start the NEX daemon:

```bash
# Foreground (default for development)
nexus daemon start

# Background (detached)
nexus daemon start --detach

# With specific config
nexus daemon start --config ./custom-nex.yaml

# With log level override
nexus daemon start --log-level debug
```

Flags:
- `--detach` / `-d` — Run in background, write logs to `~/.nexus/logs/nex.log`
- `--config <path>` — Config file path (default: `~/nexus/nex.yaml`)
- `--log-level <level>` — Override config log level
- `--port <port>` — Override config HTTP port

### `nexus daemon stop`

Graceful shutdown:

```bash
nexus daemon stop
# Sends SIGTERM to daemon PID, waits for exit
# Timeout: 45s (30s drain + 15s cleanup)
```

### `nexus daemon restart`

Stop + start:

```bash
nexus daemon restart
# Equivalent to: nexus daemon stop && nexus daemon start
```

### `nexus daemon status`

Show current daemon state:

```bash
nexus daemon status

# Output:
# NEX Daemon: running (PID 12345, uptime 4h 23m)
# HTTP: 127.0.0.1:7400
#
# Adapters:
#   eve/default            imessage  ● running   healthy   last: 12s ago    events: 3,891
#   gog/tnapathy@gmail.com gmail     ● running   healthy   last: 2s ago     events: 1,247
#   discord-cli/echo-bot   discord   ● running   healthy   last: 3m ago     events: 156
#
# Pipeline:
#   Active requests: 0
#   Total processed: 847
#   Avg latency: 1,234ms
#
# Plugins: logging, analytics
# Timer: heartbeat 60s, 2 cron jobs
# Ledgers: 4/4 ok
```

If not running:

```bash
nexus daemon status

# NEX Daemon: not running
# Last ran: 2026-02-05 14:30 (PID 12340, exited cleanly)
```

### `nexus daemon reload`

Hot-reload config:

```bash
nexus daemon reload
# Sends SIGUSR1, waits for system.config_reloaded bus event
```

### `nexus daemon logs`

Tail daemon logs:

```bash
# Follow logs
nexus daemon logs -f

# Last 100 lines
nexus daemon logs -n 100

# Filter by level
nexus daemon logs --level error
```

---

## Crash Recovery

### On Unexpected Exit

If the daemon crashes (segfault, OOM, uncaught exception):

1. Child adapter processes become orphans — the OS will not automatically kill them
2. On next `nexus daemon start`:
   - Detect stale lockfile (PID not running)
   - Clean up stale lockfile
   - Scan for orphaned adapter processes (check `adapter_instances` DB for PIDs)
   - Kill any orphaned adapter processes
   - Resume normal startup

### On Adapter Crash

Handled by the Adapter Manager's restart policy (see `ADAPTER_SYSTEM.md`):
- Exponential backoff: 1s → 2s → 4s → 8s → ... → 5min max
- Max 5 restarts before marking errored
- Reset restart count after 10min healthy
- Manual recovery: `nexus adapter restart <adapter>/<account>`

### On Pipeline Error

Pipeline errors are per-request, not daemon-level:
- Error logged with full NexusRequest context
- `onError` plugins fire
- Error trace written to Nexus Ledger
- Daemon continues processing other events
- See `NEX.md` for pipeline error handling

### On Database Error

- If a ledger DB is inaccessible at startup → daemon fails to start
- If a ledger DB becomes inaccessible at runtime → affected writes fail, health degrades to "unhealthy"
- Daemon does NOT crash on DB errors — it logs and continues with degraded state
- Fix: resolve DB issue, daemon auto-recovers on next write attempt

---

## Logging

Structured JSON logging to stdout (foreground) or log file (detached):

```jsonl
{"ts":"2026-02-05T14:30:00.123Z","level":"info","msg":"Daemon started","version":"0.1.0","pid":12345}
{"ts":"2026-02-05T14:30:00.456Z","level":"info","msg":"Adapter started","adapter":"eve","account":"default","pid":1234}
{"ts":"2026-02-05T14:30:01.789Z","level":"info","msg":"Pipeline complete","request_id":"req_abc","duration_ms":1234,"stage_count":8}
{"ts":"2026-02-05T14:30:02.012Z","level":"warn","msg":"Adapter health degraded","adapter":"gog","account":"tyler@work.com"}
{"ts":"2026-02-05T14:30:03.345Z","level":"error","msg":"Pipeline error","request_id":"req_def","error":"LLM rate limited","stage":"runAgent"}
```

Log file location (detached mode): `~/.nexus/logs/nex.log`

Log rotation: not handled by daemon — use system logrotate or similar. The daemon reopens log file on SIGHUP (standard pattern).

---

## File Locations

```
~/.nexus/                    # Daemon runtime state
├── nex.pid                  # PID lockfile (created at start, removed at stop)
└── logs/
    └── nex.log              # Log file (detached mode only)

~/nexus/                     # Nexus workspace
├── nex.yaml                 # Daemon configuration
├── plugins/                 # Plugin directory
├── data/                    # Ledger databases
│   ├── events.db
│   ├── agents.db
│   ├── identity.db
│   ├── nexus.db
│   └── cortex/
│       └── {agentId}.db
└── state/
    └── ...                  # Nexus state (managed by CLI)
```

---

## Related Documents

- `NEX.md` — The 8-stage pipeline this daemon runs
- `NEXUS_REQUEST.md` — The data bus flowing through the pipeline
- `PLUGINS.md` — Plugin loading and hook points
- `BUS_ARCHITECTURE.md` — Event bus and SSE streaming
- `../adapters/ADAPTER_SYSTEM.md` — Adapter process supervision, restart, health
- `../broker/SESSION_LIFECYCLE.md` — Session management within the pipeline
- `../../environment/` — Workspace layout and configuration

---

*This document defines how the NEX daemon starts, runs, and stops. The pipeline it executes is in `NEX.md`. The adapters it supervises are in `ADAPTER_SYSTEM.md`.*
