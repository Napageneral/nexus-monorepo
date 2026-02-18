# Nexus Go Migration Specification

> **Status**: Draft
> **Created**: 2025-02-16
> **Baseline**: TypeScript codebase at nexus v2026.2.6-3, forked from OpenClaw commit `0efaf5aa8`
> **Cortex baseline**: `github.com/Napageneral/nex/cortex` (Go 1.24.0, already Go)

---

## 1. Executive Summary

Nexus is being migrated from a split TypeScript + Go architecture into a **Go binary + pi-coding-agent RPC subprocess**. The current system runs a Node.js TypeScript process for the core runtime, agent orchestration, CLI, and control plane, with a separate Go process (`cortex`) for the derived knowledge layer. The migration moves everything except the LLM agent loop into a single `nexus` Go binary, with `pi-coding-agent` retained as an RPC subprocess for agent execution.

### Core Principles

1. **Pure behavioral port** — no functionality is cut. Every feature, every edge case, every tool policy layer is preserved identically. The 6,995 existing tests serve as the behavioral specification.
2. **pi-coding-agent stays as a dependency** — the `@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`, and `@mariozechner/pi-coding-agent` packages are NOT ported to Go. They are invoked via pi-coding-agent's existing RPC mode (`pi --mode rpc`), communicating over JSON-lines on stdin/stdout. This preserves the upstream agent's full capabilities and reduces maintenance burden.
3. **Cortex becomes a library** — the cortex Go code moves from a subprocess communicating over HTTP to direct function calls within the same process.
4. **Adapters stay external** — adapter processes (Eve, Telegram, Discord, etc.) remain separate binaries speaking the 7-command CLI protocol over stdin/stdout. The Go binary spawns and supervises them.
5. **Swift apps are unchanged** — iOS/macOS apps continue to communicate over the same HTTP/WebSocket control plane endpoints.
6. **The web UI stays JavaScript** — Lit web components are embedded via `go:embed` and served as static files.

### What This Eliminates

- Node.js as the **primary** runtime (the main process is Go; Node.js only runs as a supervised subprocess for pi-coding-agent)
- The cortex subprocess and its HTTP server on `:4317`
- CortexSupervisor process management
- The deep integration between Nexus TypeScript and pi-agent internals (`pi-embedded-runner`, `commands/agent.ts` bridge layers)
- Zod schemas for pipeline/config (replaced by Go structs)
- TypeBox runtime validation for pipeline/config (replaced by Go's type system + `encoding/json`)
- The pnpm workspace, tsconfig, vitest config, and TypeScript build toolchain for the core runtime

### What This Keeps (as pi-coding-agent RPC subprocess)

- `@mariozechner/pi-ai` (19.8K compiled JS) — multi-provider LLM HTTP client
- `@mariozechner/pi-agent-core` (969 compiled JS) — agent tool loop
- `@mariozechner/pi-coding-agent` (30.9K compiled JS) — session management, tool definitions, skills, compaction, model resolution
- Node.js runtime — required to run pi-coding-agent subprocess
- The pi-coding-agent RPC protocol — JSON-lines over stdin/stdout, typed commands/responses/events

### What This Gains

- Go binary ~28-30MB + pi-coding-agent Node.js subprocess
- Cortex operations become function calls (eliminates subprocess spawn + JSON serialization + HTTP roundtrip per meeseeks hook)
- One SQLite connection pool, one primary process, one memory space for the core runtime
- Distribution via `brew install nexus` + `npm install -g @mariozechner/pi-coding-agent` (or bundled)
- Instant startup for the Go runtime (vs 2-3 second Node.js bootstrap for the full TS app)
- **~35K fewer lines of Go to write** compared to porting pi-agent (10K Go RPC client vs 40-50K Go full port)

---

## 2. Target Architecture

### 2.1 Directory Structure

```
nexus/
├── cmd/nexus/                      ← single main.go entrypoint
│   └── main.go                     ← cobra root command
│
├── internal/
│   ├── pipeline/                   ← the 8-stage NEX pipeline
│   │   ├── pipeline.go             ← stage orchestration, hook points, tracing
│   │   ├── receive.go              ← receiveEvent stage
│   │   ├── identity.go             ← resolveIdentity stage
│   │   ├── access.go               ← resolveAccess stage (IAM evaluation)
│   │   ├── automations.go          ← runAutomations stage (hooks, circuit breakers)
│   │   ├── context.go              ← assembleContext stage (history, token budget, compaction)
│   │   ├── agent.go                ← runAgent stage (delegates to internal/agent)
│   │   ├── deliver.go              ← deliverResponse stage (adapter send/stream)
│   │   └── finalize.go             ← finalize stage (ledger writes, metrics, cleanup)
│   │
│   ├── agent/                      ← RPC client for pi-coding-agent subprocess
│   │   ├── rpc.go                  ← spawn pi --mode rpc, JSON-line protocol client
│   │   ├── rpc_types.go            ← Go structs mirroring pi RPC command/response/event types
│   │   ├── session.go              ← session lifecycle (create, resume, compact, abort)
│   │   ├── streaming.go            ← translate pi RPC events → Nexus streaming events
│   │   ├── tools.go                ← Nexus tool registration + 9-layer policy filtering
│   │   ├── tool_definitions.go     ← built-in tool definitions (read/write/edit/exec/etc)
│   │   ├── auth.go                 ← auth profile rotation, API key injection into pi subprocess
│   │   ├── models.go               ← model selection logic, passes model to pi via set_model RPC
│   │   ├── failover.go             ← 3-level failover (auth profile → thinking level → model)
│   │   └── usage.go                ← usage accumulation from pi RPC usage events
│   │
│   ├── broker/                     ← multi-agent orchestration
│   │   ├── broker.go               ← manager/worker dispatch
│   │   ├── session_queue.go        ← per-session ordered execution queue
│   │   ├── runs.go                 ← active run tracking, abort handles
│   │   ├── run_queue.go            ← broker run queue (enqueue, followup, snapshot)
│   │   ├── context.go              ← broker context (AsyncLocalStorage equivalent)
│   │   └── streaming.go            ← broker-level streaming handles
│   │
│   ├── adapters/                   ← adapter supervisor (external process management)
│   │   ├── supervisor.go           ← health monitoring, restart policy, state persistence
│   │   ├── manager.go              ← spawn/stop/send/stream to adapter processes
│   │   ├── protocol.go             ← 7-command CLI protocol parsing
│   │   └── state.go                ← adapter_instances SQLite persistence
│   │
│   ├── cortex/                     ← cortex as a library (no more HTTP/subprocess)
│   │   ├── search.go               ← entity/episode search (was HTTP /search)
│   │   ├── recall.go               ← memory recall (was HTTP /recall)
│   │   ├── write.go                ← memory write (entity/relationship/episode extraction)
│   │   ├── memory/                 ← memory pipeline (from cortex/internal/memory/)
│   │   ├── compute/                ← embeddings, adaptive compute
│   │   ├── identify/               ← entity resolution
│   │   └── sync/                   ← adapter sync jobs (Eve, Gmail, Calendar)
│   │
│   ├── automations/                ← hooks/automations with embedded JS
│   │   ├── runtime.go              ← evaluateAutomationsAtHook(), circuit breakers
│   │   ├── meeseeks.go             ← memory reader/writer hook implementations
│   │   ├── workspace.go            ← workspace bootstrapping, skill folder seeding
│   │   └── js.go                   ← goja embedded JS runtime for user scripts
│   │
│   ├── iam/                        ← access control system
│   │   ├── policies.go             ← YAML policy loading, allow/deny/ask evaluation
│   │   ├── grants.go               ← grants CRUD, permission requests, approval flow
│   │   ├── audit.go                ← access/grant logging, retention pruning
│   │   └── identity.go             ← principal resolution from 3-layer identity graph
│   │
│   ├── db/                         ← SQLite ledger layer
│   │   ├── ledgers.go              ← open/close 4 ledger databases, connection management
│   │   ├── events.go               ← events.db schema + queries
│   │   ├── agents.go               ← agents.db (turns, threads, sessions, compactions, etc.)
│   │   ├── identity.go             ← identity.db (contacts, entities, mappings, auth_tokens)
│   │   ├── nexus.go                ← nexus.db (requests, hooks, IAM tables, adapter state)
│   │   └── cortex.go               ← cortex.db (entities, relationships, episodes, embeddings)
│   │
│   ├── config/                     ← configuration system
│   │   ├── loader.go               ← YAML config loading, env substitution, $include resolution
│   │   ├── schema.go               ← Go struct definitions for all config sections
│   │   ├── paths.go                ← state dir, config dir, agent dir resolution
│   │   ├── validation.go           ← config validation, legacy detection
│   │   └── migration.go            ← legacy config format auto-migration
│   │
│   ├── server/                     ← control plane HTTP + WebSocket
│   │   ├── server.go               ← HTTP server lifecycle
│   │   ├── api.go                  ← REST endpoints (sessions, agents, config, etc.)
│   │   ├── events_sse.go           ← SSE event stream (/api/events/stream)
│   │   ├── webhooks.go             ← inbound webhook handling
│   │   ├── openresponses.go        ← OpenAI Responses API compatibility layer
│   │   └── canvas.go               ← A2UI / canvas host endpoints
│   │
│   ├── daemon/                     ← OS service management
│   │   ├── launchd.go              ← macOS launchd plist generation + management
│   │   ├── systemd.go              ← Linux systemd unit generation + management
│   │   └── schtasks.go             ← Windows scheduled task management
│   │
│   └── cli/                        ← all CLI commands (cobra)
│       ├── root.go                 ← cobra root command + global flags
│       ├── init.go                 ← nexus init
│       ├── setup.go                ← nexus setup
│       ├── onboard.go              ← nexus onboard
│       ├── config_cmd.go           ← nexus config (get/set/validate)
│       ├── agent.go                ← nexus agent (run/list/config)
│       ├── memory.go               ← nexus memory (status/search/recall)
│       ├── identity.go             ← nexus identity (list/merge/link)
│       ├── message.go              ← nexus message (send)
│       ├── status.go               ← nexus status/health/sessions
│       ├── credential.go           ← nexus credential (add/remove/list)
│       ├── maintenance.go          ← nexus maintenance (vacuum/prune)
│       ├── serve.go                ← nexus serve (starts the daemon)
│       └── browser.go              ← nexus browser
│
├── ui/                             ← web UI (Lit components)
│   └── dist/                       ← pre-built, embedded via go:embed
│
└── go.mod
```

### 2.2 External Processes (NOT in the Go binary)

```
pi-coding-agent                     ← Node.js RPC subprocess (KEPT AS DEPENDENCY)
├── @mariozechner/pi-coding-agent   ← agent session, tools, skills, compaction, RPC server
├── @mariozechner/pi-agent-core     ← agent tool loop (plan → tool → reflect → respond)
└── @mariozechner/pi-ai             ← multi-provider LLM HTTP client (Anthropic, OpenAI, Google, etc.)

adapters/                           ← each is its own repo/binary
├── eve/                            ← Go binary (already exists) — iMessage adapter
├── telegram-adapter/               ← standalone binary
├── discord-adapter/                ← standalone binary
├── slack-adapter/                  ← standalone binary
├── signal-adapter/                 ← standalone binary
├── matrix-adapter/                 ← standalone binary
├── line-adapter/                   ← standalone binary
└── ...

extensions/                         ← optional standalone feature processes
├── browser-ext/                    ← browser automation
├── voice-ext/                      ← voice/TTS
├── canvas-ext/                     ← canvas rendering
└── ...
```

**pi-coding-agent** is spawned by the Go binary via `pi --mode rpc` and communicates over JSON-lines on stdin/stdout. It handles all LLM interaction, the agent tool loop, session management, compaction, and model resolution. The Go binary owns the pipeline, broker, tool policy, ledger writes, and streaming translation.

All adapters speak the 7-command adapter protocol over stdin/stdout. Nexus spawns and supervises them via `internal/adapters/supervisor.go`.

### 2.3 Runtime View (End State)

```
$ nexus serve

[nexus] Pipeline ready (8 stages)
[nexus] Cortex initialized (3 ledgers, 847 entities, 12,431 episodes)
[nexus] pi-coding-agent RPC subprocess ready (PID 42890)
[nexus] Adapter supervisor started
[nexus]   eve (iMessage) — healthy, PID 42891
[nexus]   telegram — healthy, PID 42892
[nexus] Control plane listening on :3284
[nexus] Automations: 4 hooks loaded, 2 with circuit breakers
[nexus] Agent: pi-coding-agent via RPC, anthropic (claude-sonnet-4) primary, openai fallback
[nexus] Ready.

$ ls ~/nexus/state/
events.db           ← event ledger
agents.db           ← agents ledger
identity.db         ← identity ledger
nexus.db            ← nexus ledger (requests, hooks, IAM, adapter state)
cortex.db           ← cortex knowledge graph
config.yaml         ← user configuration
adapters/           ← adapter binaries
workspaces/         ← agent workspaces
```

### 2.4 Agent Call Chain (End State)

```
Go binary                                          Node.js subprocess
─────────────────────────────────────────────────   ──────────────────────────────

Pipeline stage 6 (runAgent)                         pi-coding-agent --mode rpc
  │                                                   │
  ├── Broker dispatch (manager/worker)                │
  ├── Tool policy evaluation (9 layers)               │
  ├── Auth profile selection                          │
  ├── Model selection                                 │
  │                                                   │
  ├──── RPC: prompt(messages, config) ──────────────► │
  │     (JSON-line on stdin)                          ├── LLM API call (pi-ai)
  │                                                   ├── Agent loop (pi-agent-core)
  │ ◄── RPC events (streaming tokens, tool calls) ── ├── Tool execution
  │     (JSON-lines on stdout)                        ├── Session management
  │                                                   ├── Compaction (if needed)
  ├── Ledger writes (turns, messages, tool_calls)     │
  ├── Streaming translation → SSE/WebSocket           │
  ├── Usage accumulation                              │
  │                                                   │
  ├──── RPC: get_state / compact / abort ──────────► │
  │                                                   │
  └── Response assembly                               │
```

**What the Go binary owns (layers 1-2):**
- Pipeline orchestration (`runAgent` stage) — ~3,187 TS → ~2K Go
- Broker dispatch (manager/worker/session queue) — part of runAgent
- Tool policy filtering (9 layers, tool groups)
- Auth profile rotation and failover logic
- Streaming event translation (pi RPC events → Nexus SSE events)
- Ledger writes (turns, messages, tool_calls to agents.db)
- CLI bridge (`nexus agent` command) — ~566 TS → ~400 Go

**What pi-coding-agent owns (layers 3-6, kept as dependency):**
- LLM HTTP client for all providers (~19.8K JS)
- Agent tool loop: plan → tool → reflect → respond (~969 JS)
- Session management, compaction, skills, model resolution (~30.9K JS)
- Total: ~51.7K compiled JS — NOT ported

---

## 3. Migration Inventory

### 3.1 TypeScript Source Analysis

Total TypeScript: **322,069 LOC** (implementation) + **187,209 LOC** (tests) across **1,715 impl files** and **1,013 test files**.

#### Core Runtime — MUST Migrate (~62K LOC → ~35-40K Go)

| Directory | Files | LOC | Description |
|-----------|-------|-----|-------------|
| `src/nex/` | 179 | 47,806 | 8-stage pipeline, broker, adapters, session routing, control plane, streaming |
| `src/db/` | 7 | 2,963 | SQLite ledger schemas + query helpers |
| `src/iam/` | 6 | 1,541 | Policies, grants, audit, identity resolution |
| `src/hooks/` | 22 | 3,899 | Automations runtime, circuit breakers, workspace bootstrap |
| `src/daemon/` | 19 | 3,554 | launchd/systemd/schtasks management |
| `src/sessions/` | 7 | 1,235 | Session resolution, compaction tracking |
| `src/routing/` | 3 | 646 | Request routing logic |
| `src/process/` | 5 | 513 | Child process spawning/supervision, command lanes |
| **Total** | **248** | **62,157** | |

#### Agent System — RPC Client + Broker (~14K LOC → ~8-10K Go)

With pi-coding-agent kept as an RPC subprocess, only the Nexus-side orchestration layers need porting:

| Directory | Files | LOC | What Ports to Go | What Stays in pi |
|-----------|-------|-----|------------------|-----------------|
| `src/nex/stages/runAgent.ts` | 1 | 3,187 | Broker orchestration, ledger writes, streaming translation | — |
| `src/commands/agent.ts` | 1 | 566 | CLI bridge → spawns pi RPC subprocess | — |
| `src/agents/pi-embedded-runner/` | ~10 | 10,100 | RPC client (replaces deep integration) | Agent internals |
| `src/agents/` (tool policy, auth, failover) | ~15 | ~3,500 | Tool policy, auth profiles, failover logic | LLM calls, tool loop |
| **Ported to Go** | | **~14K** | **→ ~8-10K Go** | |
| `src/agents/` (remaining) | ~220 | ~44K | — | Handled by pi-coding-agent |
| `src/auto-reply/` | 121 | 21,218 | — | Reply pipeline stays in pi subprocess |
| `src/memory/` | 27 | 6,872 | — | Memory hooks called by Go (cortex is Go) |
| `src/plugins/` | 29 | 5,778 | — | Plugin execution stays in pi subprocess |

**New Go code needed:** ~1.5K Go for the RPC client (spawn `pi --mode rpc`, JSON-line protocol, typed commands/responses/events).

**Critical: tool policy filtering (9 layers), auth profile rotation, and failover logic MUST be preserved identically in the Go RPC client layer. The pi subprocess handles LLM interaction; Go handles access control and orchestration.**

#### CLI/Config/Infra — Replicate in Go (~89K LOC → ~30-40K Go)

| Directory | Files | LOC | Description |
|-----------|-------|-----|-------------|
| `src/commands/` | 179 | 29,795 | Every CLI subcommand implementation |
| `src/cli/` | 145 | 23,213 | Commander.js program, CLI bootstrap, route handling |
| `src/infra/` | 116 | 21,590 | dotenv, path resolution, platform detection, updater |
| `src/config/` | 88 | 13,913 | YAML config loading, Zod validation, env substitution, includes |
| `src/utils/` | — | 821 | Misc helpers |
| `src/shared/` | — | 123 | Shared constants |
| **Total** | **528+** | **89,455** | |

#### Cross-Cutting — Migrate As Needed (~12K LOC)

| Directory | Files | LOC | Description |
|-----------|-------|-----|-------------|
| `src/security/` | 8 | 4,028 | Exec allowlists, permission checks, sandboxing |
| `src/cron/` | 22 | 3,687 | Scheduled task execution |
| `src/logging/` | — | 1,503 | Structured logging |
| `src/markdown/` | — | 1,461 | Markdown processing |
| `src/acp/` | — | 1,196 | Access control protocol helpers |
| **Total** | **~30+** | **11,875** | |

#### NOT Migrated — Becomes External or Stays As-Is

| Category | LOC | Disposition |
|----------|-----|-------------|
| Channel adapters (discord, telegram, slack, etc.) | 42,078 | Become standalone adapter binaries |
| Extensions (browser, media, TTS, canvas) | 18,533 | Become standalone extension processes |
| Web/TUI/UI | 13,954 TS + 77,285 Swift | Web UI embedded via go:embed; Swift apps unchanged |
| Cortex (Go) | 48,346 | Already Go — absorbed into `internal/cortex/` |

#### Summary

| Bucket | TS LOC | Estimated Go LOC | Priority | Notes |
|--------|--------|-----------------|----------|-------|
| Core Runtime | 62K | ~35-40K | P0 | Full port |
| Agent System (layers 1-3) | 14K | ~8-10K | P0 | RPC client + broker orchestration |
| Agent RPC Client (new) | 0 | ~1.5K | P0 | Spawn pi, JSON-line protocol |
| CLI/Config/Infra | 89K | ~30-40K | P1 | Full port |
| Cross-cutting | 12K | ~6-8K | P1 | Security, cron, logging, markdown |
| Cortex (already Go) | — (48K Go) | 0 (inline) | ✅ | Already Go, becomes library calls |
| **Total to write** | **~177K TS** | **~81-100K Go** | | |
| | | | | |
| pi-* packages (kept) | ~51K JS | 0 | — | RPC subprocess, NOT ported |
| Remaining agents/ code | ~69K TS | 0 | — | Handled by pi subprocess |

**Compared to full port approach:** ~35K fewer lines of Go to write (~110-140K → ~81-100K). The pi-coding-agent's 51K JS of LLM client, agent loop, session management, compaction, and model resolution stays maintained upstream.

### 3.2 External Dependencies

#### Kept as Dependencies (NOT ported)

| Package | Size | Role | Interaction |
|---------|------|------|-------------|
| `@mariozechner/pi-ai` | 19.8K JS | Multi-provider LLM HTTP client | Runs inside pi-coding-agent subprocess |
| `@mariozechner/pi-agent-core` | 969 JS | Agent tool loop | Runs inside pi-coding-agent subprocess |
| `@mariozechner/pi-coding-agent` | 30.9K JS | Session, tools, skills, compaction, RPC | Spawned via `pi --mode rpc`, JSON-lines on stdio |
| Node.js runtime | — | Required to run pi-coding-agent | Subprocess only; Go binary is the primary process |

#### Replaced in Go

| TypeScript Dependency | Go Equivalent | Notes |
|----------------------|---------------|-------|
| Commander.js | `github.com/spf13/cobra` | CLI framework |
| Zod | Go struct tags + `encoding/json` | Schema validation |
| better-sqlite3 / node:sqlite | `modernc.org/sqlite` or `mattn/go-sqlite3` | SQLite driver |
| `@mariozechner/pi-tui` | `github.com/charmbracelet/bubbletea` (optional) | Terminal UI |
| `pi-embedded-runner` (Nexus TS) | `internal/agent/rpc.go` | Deep integration → thin RPC client |

### 3.3 pi-coding-agent RPC Protocol

The Go binary communicates with pi-coding-agent via its built-in RPC mode. Invoked as:

```
pi --mode rpc --provider <provider> --model <model>
```

Protocol: JSON-lines on stdin (commands) / stdout (responses + events).

#### RPC Commands (Go → pi)

| Command | Description | Key Fields |
|---------|-------------|------------|
| `prompt` | Send a prompt to the agent | `messages`, `tools`, `config` |
| `steer` | Inject a steering message during execution | `message`, `images?` |
| `follow_up` | Continue after a completed prompt | `message`, `images?` |
| `abort` | Cancel the current agent execution | — |
| `compact` | Trigger context compaction | — |
| `set_model` | Change the active model/provider | `provider`, `model` |
| `get_state` | Get current session state | — |
| `get_messages` | Retrieve message history | — |
| `get_tools` | List available tools | — |

#### RPC Events (pi → Go)

| Event | Description | Used For |
|-------|-------------|----------|
| `message` | Assistant message (partial or complete) | Streaming tokens → SSE |
| `tool_call` | Tool invocation started | Tool status events |
| `tool_result` | Tool execution completed | Tool status events |
| `thinking` | Reasoning/thinking content | Reasoning stream |
| `usage` | Token usage update | Usage accumulation |
| `error` | Error occurred | Error handling, failover |
| `idle` | Agent finished, waiting for next command | Turn completion |
| `compaction` | Compaction occurred | Compaction ledger writes |

#### Go RPC Client Interface

```go
// PiRPCClient manages a pi-coding-agent subprocess
type PiRPCClient struct {
    cmd      *exec.Cmd
    stdin    io.WriteCloser
    stdout   *bufio.Scanner
    provider string
    model    string
}

// Prompt sends a prompt and streams events back via callback
func (c *PiRPCClient) Prompt(params PromptParams, onEvent func(RPCEvent)) error

// Steer injects a steering message during execution
func (c *PiRPCClient) Steer(message string, images []ImageContent) error

// FollowUp continues after completion
func (c *PiRPCClient) FollowUp(message string, images []ImageContent) error

// Abort cancels current execution
func (c *PiRPCClient) Abort() error

// Compact triggers context compaction
func (c *PiRPCClient) Compact() error

// SetModel changes the active model
func (c *PiRPCClient) SetModel(provider, model string) error

// GetState returns current session state
func (c *PiRPCClient) GetState() (*SessionState, error)

// Close terminates the subprocess
func (c *PiRPCClient) Close() error
```

This is approximately **~1.5K Go** — a thin protocol client, not a reimplementation of pi-coding-agent.

---

## 4. Behavioral Contracts

These contracts define the exact behavior that must be preserved in the Go port. The existing TypeScript test suite (6,995 tests) serves as the primary specification.

### 4.1 Pipeline Stage Contract

The pipeline processes a `NexusRequest` through 8 sequential stages. Each stage mutates the request object, accumulating context.

```
receiveEvent → resolveIdentity → resolveAccess → runAutomations
  → assembleContext → runAgent → deliverResponse → finalize
```

**Stage signatures (Go equivalents):**

```go
type NexusRequest struct { /* see §4.2 */ }
type StageRuntime struct { /* see §4.3 */ }

type ReceiveEventStage    func(req *NexusRequest, event NexusEvent, rt *StageRuntime) error
type ResolveIdentityStage func(req *NexusRequest, rt *StageRuntime) error
type ResolveAccessStage   func(req *NexusRequest, rt *StageRuntime) error
type RunAutomationsStage  func(req *NexusRequest, rt *StageRuntime) error
type AssembleContextStage func(req *NexusRequest, rt *StageRuntime) (*AssembledContext, error)
type RunAgentStage        func(req *NexusRequest, ctx *AssembledContext, rt *StageRuntime) error
type DeliverResponseStage func(req *NexusRequest, rt *StageRuntime) error
type FinalizeStage        func(req *NexusRequest, rt *StageRuntime) error
```

**Hook points between stages:**
- `before:resolveAccess`, `after:resolveAccess`
- `before:runAutomations`, `after:runAutomations`
- `worker:pre_execution` — blocking, before runAgent (Meeseeks memory reader)
- `after:runAgent` — fire-and-forget (Meeseeks memory writer)
- `before:deliverResponse`, `after:deliverResponse`

### 4.2 NexusRequest Schema

The bus object that accumulates context through all 8 pipeline stages:

```go
type NexusRequest struct {
    RequestID  string         `json:"request_id"`
    CreatedAt  int64          `json:"created_at"`
    Event      EventContext   `json:"event"`
    Delivery   DeliveryContext `json:"delivery"`
    Principal  *PrincipalContext `json:"principal,omitempty"`  // set by resolveIdentity
    Access     *AccessContext    `json:"access,omitempty"`     // set by resolveAccess
    Triggers   *TriggerContext   `json:"triggers,omitempty"`   // set by runAutomations
    Agent      *AgentContext     `json:"agent,omitempty"`      // set by assembleContext
    Response   *ResponseContext  `json:"response,omitempty"`   // set by runAgent
    DeliveryResult *DeliveryResultContext `json:"delivery_result,omitempty"` // set by deliverResponse
    Pipeline   []PipelineTrace  `json:"pipeline"`
    Status     RequestStatus    `json:"status"`
}

type EventContext struct {
    EventID     string            `json:"event_id"`
    Timestamp   int64             `json:"timestamp"`
    Content     string            `json:"content"`
    ContentType ContentType       `json:"content_type"` // text|image|audio|video|file|reaction|membership
    Attachments []Attachment      `json:"attachments,omitempty"`
    Metadata    map[string]any    `json:"metadata,omitempty"`
}

type DeliveryContext struct {
    Channel           string            `json:"channel"`
    AccountID         string            `json:"account_id"`
    SenderID          string            `json:"sender_id"`
    SenderName        string            `json:"sender_name,omitempty"`
    PeerID            string            `json:"peer_id"`
    PeerKind          PeerKind          `json:"peer_kind"` // dm|direct|group|channel
    ThreadID          string            `json:"thread_id,omitempty"`
    ReplyToID         string            `json:"reply_to_id,omitempty"`
    Capabilities      ChannelCapabilities `json:"capabilities"`
    AvailableChannels []ChannelInfo     `json:"available_channels"`
}

type PrincipalContext struct {
    Type         PrincipalType  `json:"type"` // owner|known|unknown|system|webhook|agent
    EntityID     string         `json:"entity_id,omitempty"`
    Name         string         `json:"name,omitempty"`
    Relationship string         `json:"relationship,omitempty"`
    Tags         []string       `json:"tags,omitempty"`
    Identities   []ChannelIdentifier `json:"identities,omitempty"`
}

type AccessContext struct {
    Decision      AccessDecision `json:"decision"` // allow|deny|ask
    MatchedPolicy string         `json:"matched_policy,omitempty"`
    Permissions   Permissions    `json:"permissions"`
    Routing       RoutingConfig  `json:"routing"`
    RateLimited   bool           `json:"rate_limited,omitempty"`
}

type RoutingConfig struct {
    Persona      string    `json:"persona"`
    SessionLabel string    `json:"session_label"`
    QueueMode    QueueMode `json:"queue_mode"` // steer|followup|collect|queue|interrupt
}

type TriggerContext struct {
    AutomationsEvaluated []string               `json:"automations_evaluated"`
    AutomationsFired     []string               `json:"automations_fired"`
    Enrichment           map[string]any         `json:"enrichment,omitempty"`
    RoutingOverride      *RoutingOverride       `json:"routing_override,omitempty"`
    Handled              bool                   `json:"handled,omitempty"`
    HandledBy            string                 `json:"handled_by,omitempty"`
}

type AgentContext struct {
    PersonaID         string       `json:"persona_id"`
    Role              AgentRole    `json:"role"` // manager|worker|unified
    SessionLabel      string       `json:"session_label"`
    ParentTurnID      string       `json:"parent_turn_id"`
    TurnID            string       `json:"turn_id"`
    Model             string       `json:"model"`
    Provider          string       `json:"provider"`
    TokenBudget       TokenBudget  `json:"token_budget"`
    SystemPromptHash  string       `json:"system_prompt_hash"`
    HistoryTurnsCount int          `json:"history_turns_count"`
    CompactionApplied bool         `json:"compaction_applied"`
    ToolsetName       string       `json:"toolset_name"`
    ToolsAvailable    []string     `json:"tools_available"`
}

type ResponseContext struct {
    Content    string           `json:"content"`
    ToolCalls  []ToolCallSummary `json:"tool_calls"`
    Usage      TokenUsage       `json:"usage"`
    StopReason StopReason       `json:"stop_reason"` // end_turn|max_tokens|timeout|aborted|error
    DurationMs int64            `json:"duration_ms"`
}

type RequestStatus string
const (
    StatusProcessing          RequestStatus = "processing"
    StatusCompleted           RequestStatus = "completed"
    StatusSkipped             RequestStatus = "skipped"
    StatusDenied              RequestStatus = "denied"
    StatusHandledByAutomation RequestStatus = "handled_by_automation"
    StatusFailed              RequestStatus = "failed"
)
```

### 4.3 Stage Runtime Dependencies

```go
type StageRuntime struct {
    Now          func() int64
    Ledgers      *LedgerConnections
    Policies     []ACLPolicy
    AdapterMgr   *AdapterManager
    Bus          EventBusPublisher
    LedgerClient LedgerClient
    CortexClient CortexClient        // in Go, this is a direct function call
    LLMClient    LLMClient
    AbortSignal  context.Context
    EnqueueEvent func(event any, opts *EnqueueOpts) error
    EnqueueRequest func(req *NexusRequest, opts *EnqueueRequestOpts) error
    PolicyPath   string
    UnknownSenderPolicy string        // "allow" | "deny"
}
```

### 4.4 Agent System Contract

The agent system uses pi-coding-agent as an RPC subprocess. The Go binary handles orchestration (broker, tool policy, failover, streaming translation, ledger writes) while pi handles the actual LLM interaction and agent loop.

**Go-side orchestration contract (preserved from `runEmbeddedPiAgent`):**

The Go `runAgent` stage receives an `AgentRunParams` and must:
1. Evaluate tool policy (9 layers) to determine the allowed toolset
2. Select auth profile and model based on config + failover state
3. Spawn or reuse a pi-coding-agent RPC subprocess
4. Send `prompt` RPC command with messages, tools, and config
5. Translate incoming RPC events into Nexus streaming events + ledger writes
6. Handle failover on errors (auth rotation → thinking fallback → model fallback)
7. Accumulate usage from pi RPC `usage` events
8. Return `AgentRunResult` when pi signals `idle`

```go
type AgentRunParams struct {
    SessionID        string
    SessionKey       string
    AgentID          string
    HistoryMessages  []HistoryMessage
    Prompt           string
    Images           []ImageContent
    WorkspaceDir     string
    Config           *NexusConfig

    // Sender context
    MessageChannel   string
    SenderID         string
    SenderName       string
    SenderIsOwner    bool

    // Tool policy (evaluated in Go, passed to pi as allowed tool list)
    ToolAllowlist    []string
    ToolDenylist     []string
    ClientTools      []ClientToolDefinition
    DisableTools     bool

    // Model selection (Go selects, passes to pi via set_model RPC)
    Provider         string
    Model            string
    AuthProfileID    string
    ThinkLevel       ThinkLevel

    // Execution control
    TimeoutMs        int64
    RunID            string
    AbortSignal      context.Context

    // Streaming callbacks (Go translates pi RPC events → these callbacks)
    OnPartialReply   func(payload ReplyPayload)
    OnBlockReply     func(payload BlockReplyPayload)
    OnReasoningStream func(payload ReplyPayload)
    OnToolResult     func(payload ReplyPayload)
    OnAgentEvent     func(evt AgentEvent)
}
```

**Output contract (unchanged):**
```go
type AgentRunResult struct {
    Payloads              []ReplyPayload
    Meta                  AgentRunMeta
    DidSendViaMessaging   bool
    MessagingSentTexts    []string
    MessagingSentTargets  []MessagingTarget
}

type ReplyPayload struct {
    Text      string   `json:"text,omitempty"`
    MediaURL  string   `json:"mediaUrl,omitempty"`
    MediaURLs []string `json:"mediaUrls,omitempty"`
    ReplyToID string   `json:"replyToId,omitempty"`
    IsError   bool     `json:"isError,omitempty"`
}
```

**Failover behavior (MUST be identical, implemented in Go):**
1. Auth profile rotation — cycle through configured auth profiles on auth errors (pi reports via `error` RPC event, Go rotates and sends `set_model` RPC)
2. Thinking level fallback — reduce thinking level on context overflow (Go adjusts and re-sends `prompt` RPC)
3. Model fallback — try fallback models from config on persistent failures (Go selects fallback, sends `set_model` RPC)

**Failover reason classification (parsed from pi `error` events):**
- `billing` — billing/quota errors
- `rate_limit` — rate limit responses
- `auth` — authentication failures
- `timeout` — request timeouts
- `format` — message format errors
- `unknown` — unclassified errors

**Tool policy filtering (9 layers, evaluated in Go before passing tools to pi):**
Tool groups that can be referenced in policies:
- `group:memory` — memory_search, memory_get
- `group:web` — web_search, web_fetch
- `group:fs` — read, write, edit, apply_patch
- `group:runtime` — exec, process
- `group:sessions` — sessions_list, sessions_history, sessions_send, sessions_spawn, session_status
- `group:ui` — browser, canvas
- `group:automation` — cron, runtime
- `group:messaging` — message
- `group:nodes` — nodes
- `group:nexus` — superset of all nexus-specific tools

**Responsibility split:**

| Concern | Owner | Mechanism |
|---------|-------|-----------|
| Tool policy evaluation | Go | 9-layer filtering before prompt RPC |
| Auth profile rotation | Go | Selects profile, injects API key into pi env |
| Model selection + failover | Go | `set_model` RPC command |
| LLM HTTP calls | pi-coding-agent | pi-ai multi-provider client |
| Agent loop (plan/tool/reflect) | pi-coding-agent | pi-agent-core |
| Session state | pi-coding-agent | In-memory SessionManager |
| Compaction | pi-coding-agent | Triggered by Go via `compact` RPC or auto |
| Streaming events | pi → Go | JSON-line events on stdout |
| Ledger writes | Go | Translates pi events → agents.db writes |
| Broker dispatch | Go | Manager/worker, session queue |

### 4.5 Streaming Contract

```go
type StreamEvent interface{ streamEvent() }

type StreamStartEvent struct {
    Type         string       `json:"type"` // "stream_start"
    RunID        string       `json:"runId"`
    SessionLabel string       `json:"sessionLabel"`
    Target       StreamTarget `json:"target"`
}

type StreamTokenEvent struct {
    Type string `json:"type"` // "token"
    Text string `json:"text"`
}

type StreamToolStatusEvent struct {
    Type       string `json:"type"` // "tool_status"
    ToolName   string `json:"toolName"`
    ToolCallID string `json:"toolCallId"`
    Status     string `json:"status"` // started|completed|failed
    Summary    string `json:"summary,omitempty"`
}

type StreamReasoningEvent struct {
    Type string `json:"type"` // "reasoning"
    Text string `json:"text"`
}

type StreamEndEvent struct {
    Type  string `json:"type"` // "stream_end"
    RunID string `json:"runId"`
    Final bool   `json:"final,omitempty"`
}

type StreamErrorEvent struct {
    Type    string `json:"type"` // "stream_error"
    Error   string `json:"error"`
    Partial bool   `json:"partial"`
}
```

### 4.6 Adapter Protocol Contract

All adapters communicate via JSON-over-stdin/stdout with the nexus binary.

**Commands:**

| Command | Input | Output | Blocking |
|---------|-------|--------|----------|
| `info` | (none) | `AdapterInfo` | Yes |
| `monitor` | `{ account, format? }` | Stream of `NexusEvent` (JSONL) | Long-running |
| `send` | `{ account, to, text, thread_id?, reply_to_id? }` | `DeliveryResult` | Yes |
| `stream` | `{ account, to, text, thread_id?, reply_to_id?, runId?, sessionLabel?, events? }` | Stream of `AdapterStreamStatus` | Long-running |
| `backfill` | `{ account, since, format? }` | Stream of `NexusEvent` (JSONL) | Yes |
| `health` | `{ account }` | `AdapterHealth` | Yes |
| `accounts` | (none) | `[]AdapterAccount` | Yes |

**Capabilities declared by adapters:** monitor, send, stream, backfill, health, react, edit, delete, poll

---

## 5. Database Schemas

All schemas must be **byte-identical** in the Go port. Existing SQLite databases created by the TypeScript version must be readable by the Go binary without migration.

### 5.1 Events Database (`events.db`)

```sql
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    type TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'inbound',
    thread_id TEXT,
    reply_to TEXT,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    attachments TEXT,
    from_channel TEXT NOT NULL,
    from_identifier TEXT NOT NULL,
    to_recipients TEXT,
    timestamp INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    metadata TEXT,
    UNIQUE(source, source_id)
);

CREATE TABLE sync_watermarks (
    adapter TEXT PRIMARY KEY,
    last_sync_at INTEGER NOT NULL,
    last_event_id TEXT
);

CREATE TABLE threads (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    name TEXT,
    is_group INTEGER NOT NULL DEFAULT 0,
    source_adapter TEXT,
    source_id TEXT,
    first_event_at INTEGER,
    last_event_at INTEGER,
    last_event_id TEXT,
    event_count INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(source_adapter, source_id)
);

CREATE TABLE event_participants (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    channel TEXT NOT NULL,
    identifier TEXT NOT NULL,
    position INTEGER,
    metadata_json TEXT,
    PRIMARY KEY (event_id, role, channel, identifier)
);

CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    source_attachment_id TEXT,
    filename TEXT,
    mime_type TEXT,
    media_type TEXT,
    size_bytes INTEGER,
    content_hash TEXT,
    storage_uri TEXT,
    local_path TEXT,
    url TEXT,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(source, source_attachment_id)
);
```

### 5.2 Agents Database (`agents.db`)

```sql
CREATE TABLE turns (
    id TEXT PRIMARY KEY,
    parent_turn_id TEXT,
    turn_type TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'pending',
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    model TEXT,
    provider TEXT,
    role TEXT NOT NULL DEFAULT 'unified',
    toolset_name TEXT,
    tools_available TEXT,
    permissions_granted TEXT,
    permissions_used TEXT,
    effective_config_json TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cached_input_tokens INTEGER,
    cache_write_tokens INTEGER,
    reasoning_tokens INTEGER,
    total_tokens INTEGER,
    query_message_ids TEXT,
    response_message_id TEXT,
    has_children INTEGER DEFAULT 0,
    tool_call_count INTEGER DEFAULT 0,
    source_event_id TEXT,
    workspace_path TEXT,
    FOREIGN KEY (parent_turn_id) REFERENCES turns(id)
);

CREATE TABLE threads (
    turn_id TEXT PRIMARY KEY,
    ancestry TEXT,
    total_tokens INTEGER,
    depth INTEGER,
    persona_id TEXT,
    system_prompt_hash TEXT,
    thread_key TEXT UNIQUE,
    FOREIGN KEY (turn_id) REFERENCES turns(id)
);

CREATE TABLE sessions (
    label TEXT PRIMARY KEY,
    thread_id TEXT,
    persona_id TEXT NOT NULL,
    is_subagent INTEGER DEFAULT 0,
    parent_session_label TEXT,
    parent_turn_id TEXT,
    spawn_tool_call_id TEXT,
    task_description TEXT,
    task_status TEXT,
    routing_key TEXT,
    origin TEXT,
    origin_session_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    FOREIGN KEY (thread_id) REFERENCES threads(turn_id),
    FOREIGN KEY (parent_turn_id) REFERENCES turns(id)
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    turn_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT,
    source TEXT,
    sequence INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    thinking TEXT,
    context_json TEXT,
    metadata_json TEXT,
    FOREIGN KEY (turn_id) REFERENCES turns(id)
);

CREATE TABLE tool_calls (
    id TEXT PRIMARY KEY,
    turn_id TEXT NOT NULL,
    message_id TEXT,
    tool_name TEXT NOT NULL,
    tool_number INTEGER,
    params_json TEXT NOT NULL,
    result_json TEXT,
    error TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    spawned_session_label TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    sequence INTEGER NOT NULL,
    FOREIGN KEY (turn_id) REFERENCES turns(id),
    FOREIGN KEY (message_id) REFERENCES messages(id)
);

CREATE TABLE compactions (
    turn_id TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    summarized_through_turn_id TEXT NOT NULL,
    first_kept_turn_id TEXT,
    turns_summarized INTEGER,
    compaction_type TEXT NOT NULL DEFAULT 'summary',
    model TEXT NOT NULL,
    provider TEXT,
    tokens_before INTEGER,
    tokens_after INTEGER,
    summary_tokens INTEGER,
    summarization_input_tokens INTEGER,
    summarization_output_tokens INTEGER,
    duration_ms INTEGER,
    trigger TEXT,
    metadata_json TEXT,
    FOREIGN KEY (turn_id) REFERENCES turns(id),
    FOREIGN KEY (summarized_through_turn_id) REFERENCES turns(id),
    FOREIGN KEY (first_kept_turn_id) REFERENCES turns(id)
);

CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    storage TEXT NOT NULL DEFAULT 'fs',
    created_at INTEGER NOT NULL,
    bytes INTEGER NOT NULL,
    sha256 TEXT,
    host_path TEXT NOT NULL,
    agent_path TEXT NOT NULL,
    relative_path TEXT,
    content_type TEXT,
    encoding TEXT,
    metadata_json TEXT
);

CREATE TABLE tool_call_artifacts (
    tool_call_id TEXT NOT NULL,
    artifact_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (tool_call_id, artifact_id),
    FOREIGN KEY (tool_call_id) REFERENCES tool_calls(id),
    FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
);

CREATE TABLE session_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_label TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    changed_at INTEGER NOT NULL,
    FOREIGN KEY (session_label) REFERENCES sessions(label),
    FOREIGN KEY (thread_id) REFERENCES threads(turn_id)
);

CREATE TABLE session_aliases (
    alias TEXT PRIMARY KEY,
    session_label TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    reason TEXT,
    FOREIGN KEY (session_label) REFERENCES sessions(label)
);

CREATE TABLE session_imports (
    source TEXT NOT NULL,
    source_provider TEXT NOT NULL,
    source_session_id TEXT NOT NULL,
    source_session_fingerprint TEXT NOT NULL,
    session_label TEXT NOT NULL,
    imported_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_run_id TEXT,
    PRIMARY KEY (source, source_provider, source_session_id),
    FOREIGN KEY (session_label) REFERENCES sessions(label)
);

CREATE TABLE session_import_requests (
    idempotency_key TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    mode TEXT NOT NULL,
    run_id TEXT NOT NULL,
    request_hash TEXT,
    response_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
```

### 5.3 Identity Database (`identity.db`)

```sql
CREATE TABLE contacts (
    channel TEXT NOT NULL,
    identifier TEXT NOT NULL,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    message_count INTEGER DEFAULT 0,
    display_name TEXT,
    avatar_url TEXT,
    PRIMARY KEY (channel, identifier)
);

CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    is_user INTEGER NOT NULL DEFAULT 0,
    relationship TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    source_ref TEXT
);

CREATE TABLE identity_mappings (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    identifier TEXT NOT NULL,
    entity_id TEXT,
    mapping_type TEXT NOT NULL DEFAULT 'unknown',
    confidence REAL,
    label TEXT,
    is_primary INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(channel, identifier),
    FOREIGN KEY (channel, identifier) REFERENCES contacts(channel, identifier),
    FOREIGN KEY (entity_id) REFERENCES entities(id)
);

CREATE TABLE entity_tags (
    entity_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (entity_id, tag),
    FOREIGN KEY (entity_id) REFERENCES entities(id)
);

CREATE TABLE auth_tokens (
    id TEXT PRIMARY KEY,
    audience TEXT NOT NULL,
    token_prefix TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    entity_id TEXT NOT NULL,
    role TEXT NOT NULL,
    scopes TEXT NOT NULL,
    label TEXT,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    expires_at INTEGER,
    revoked_at INTEGER,
    FOREIGN KEY (entity_id) REFERENCES entities(id)
);
```

### 5.4 Nexus Database (`nexus.db`)

```sql
-- Pipeline request tracking
CREATE TABLE nexus_requests (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_source TEXT NOT NULL,
    stage TEXT NOT NULL,
    status TEXT NOT NULL,
    principal_id TEXT,
    principal_type TEXT,
    principal_is_user INTEGER,
    access_decision TEXT,
    access_policy TEXT,
    session_key TEXT,
    session_persona TEXT,
    permissions TEXT,
    hooks_matched TEXT,
    hooks_fired TEXT,
    hooks_handled INTEGER,
    hooks_context TEXT,
    turn_id TEXT,
    agent_model TEXT,
    agent_tokens_prompt INTEGER,
    agent_tokens_completion INTEGER,
    agent_tokens_total INTEGER,
    agent_tool_calls TEXT,
    delivery_channel TEXT,
    delivery_message_ids TEXT,
    delivery_success INTEGER,
    delivery_error TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    stage_timings TEXT,
    error_stage TEXT,
    error_message TEXT,
    error_stack TEXT,
    request_snapshot TEXT
);

-- Automations
CREATE TABLE automations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    mode TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    script_path TEXT NOT NULL,
    script_hash TEXT,
    triggers_json TEXT,
    config_json TEXT,
    created_by_agent TEXT,
    created_by_session TEXT,
    created_by_thread TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    previous_version_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    disabled_at INTEGER,
    disabled_reason TEXT,
    last_triggered INTEGER,
    trigger_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE hook_invocations (
    id TEXT PRIMARY KEY,
    hook_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    fired INTEGER NOT NULL,
    result_json TEXT,
    llm_calls INTEGER NOT NULL DEFAULT 0,
    llm_tokens_in INTEGER NOT NULL DEFAULT 0,
    llm_tokens_out INTEGER NOT NULL DEFAULT 0,
    search_calls INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    stack_trace TEXT,
    FOREIGN KEY (hook_id) REFERENCES automations(id)
);

-- IAM
CREATE TABLE acl_grants (
    id TEXT PRIMARY KEY,
    principal_query TEXT NOT NULL,
    resources TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    revoked_at INTEGER,
    granted_by TEXT NOT NULL,
    reason TEXT,
    request_context TEXT,
    conditions TEXT
);

CREATE TABLE acl_permission_requests (
    id TEXT PRIMARY KEY,
    requester_id TEXT,
    requester_channel TEXT,
    kind TEXT,
    tool_name TEXT,
    tool_call_id TEXT,
    session_key TEXT,
    nexus_request_id TEXT,
    summary TEXT,
    context_json TEXT,
    resources TEXT NOT NULL,
    reason TEXT,
    original_message TEXT,
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at INTEGER NOT NULL,
    responder TEXT,
    response_at INTEGER,
    response_channel TEXT,
    grant_id TEXT REFERENCES acl_grants(id)
);

CREATE TABLE acl_access_log (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    event_id TEXT,
    channel TEXT NOT NULL,
    sender_identifier TEXT NOT NULL,
    peer_kind TEXT,
    account TEXT,
    principal_id TEXT,
    principal_type TEXT NOT NULL,
    principal_name TEXT,
    principal_relationship TEXT,
    policies_evaluated TEXT,
    policies_matched TEXT,
    policies_denied TEXT,
    effect TEXT NOT NULL,
    deny_reason TEXT,
    tools_allowed TEXT,
    tools_denied TEXT,
    credentials_allowed TEXT,
    data_access TEXT,
    persona TEXT,
    session_key TEXT,
    grants_applied TEXT,
    processing_time_ms INTEGER
);

CREATE TABLE acl_grant_log (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    grant_id TEXT NOT NULL,
    activity TEXT NOT NULL,
    actor TEXT,
    reason TEXT,
    access_log_id TEXT
);

-- Adapter state persistence
CREATE TABLE adapter_instances (
    adapter_id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    pid INTEGER,
    health_status TEXT NOT NULL DEFAULT 'unknown',
    last_health_check INTEGER,
    restart_count INTEGER NOT NULL DEFAULT 0,
    last_restart INTEGER,
    consecutive_errors INTEGER NOT NULL DEFAULT 0,
    events_received INTEGER NOT NULL DEFAULT 0,
    events_sent INTEGER NOT NULL DEFAULT 0,
    backfill_cursor TEXT,
    backfill_status TEXT,
    started_at INTEGER,
    stopped_at INTEGER,
    updated_at INTEGER NOT NULL
);

-- Import jobs
CREATE TABLE aix_import_jobs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    requested_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    error_code TEXT,
    error_message TEXT,
    stats_json TEXT
);
```

---

## 6. Embedded JavaScript Runtime (goja)

The automations system runs user-defined JavaScript scripts. In the Go port, these are executed via [goja](https://github.com/nicholasgasior/goja) (pure Go JS interpreter).

### Surface area

The JS runtime only needs to support:

1. **Hook evaluation scripts** — return `{ fire: boolean, enrich?: object }`
2. **Workspace bootstrapping** — shell commands via `os/exec` (not JS)
3. **Cortex skill folder seeding** — file operations (not JS)

The goja VM is created once and reused. Scripts are typically < 50 lines. No npm packages, no async/await, no DOM. Pure data transformation.

### Example hook script

```javascript
// Memory reader hook — evaluates before agent execution
function evaluate(event, context) {
    return {
        fire: true,
        enrich: {
            memories: context.cortex_results || null
        }
    };
}
```

---

## 7. Migration Phasing

### Phase 1: Core Runtime + Agent RPC Client (Weeks 1-6)

Port `internal/pipeline/`, `internal/db/`, `internal/iam/`, `internal/adapters/`, `internal/automations/`, `internal/config/`, `internal/server/`, and `internal/agent/` (RPC client).

**This phase produces a working Go binary** that runs all 8 pipeline stages natively. Stage 6 (runAgent) delegates to pi-coding-agent via the RPC protocol — this is the **permanent architecture**, not a temporary bridge.

Key deliverables:
- 8-stage pipeline in Go
- 4 SQLite ledgers (byte-compatible with existing TS databases)
- Adapter supervisor (spawn/health/restart)
- IAM policy evaluation
- Automations runtime with goja for JS hooks
- pi-coding-agent RPC client (~1.5K Go)
- Broker (manager/worker dispatch, session queue)
- Tool policy filtering (9 layers)
- Auth profile rotation + failover logic
- Streaming translation (pi RPC events → Nexus SSE events)
- Control plane HTTP + WebSocket server

**Validation**: Port the 126 core runtime test files (nex/db/iam/hooks) + the broker/runAgent orchestration tests as Go tests. All must pass with byte-identical SQLite output. Agent RPC tests mock the pi subprocess stdin/stdout.

### Phase 2: CLI/Config/Infra (Weeks 5-10, overlapping)

Port `internal/cli/`, `internal/config/`, `internal/daemon/`.

**Validation**: Port the 214 CLI/config test files. Config parsing tests with temp directories translate cleanly.

### Phase 3: Cortex Unification + Integration (Weeks 8-12, overlapping)

- Move cortex from subprocess to `internal/cortex/` library calls
- Eliminate the cortex HTTP server on `:4317` and CortexSupervisor
- Full integration testing with real adapters + pi-coding-agent subprocess
- End-to-end playtesting

**Validation**: Integration tests with real SQLite databases, real adapter processes, and a real pi-coding-agent subprocess. Verify streaming, failover, compaction, and multi-session scenarios.

### Timeline Comparison

| Approach | Estimated Duration | Go LOC |
|----------|-------------------|--------|
| Full port (port pi-agent to Go) | 14-18 weeks | ~110-140K |
| **RPC approach (keep pi-agent)** | **10-12 weeks** | **~81-100K** |
| Savings | **4-6 weeks** | **~35K fewer lines** |

---

## 8. Test Coverage Baseline

| Subsystem | Test Files | Tests | Mock Usage | Migration Suitability |
|-----------|-----------|-------|------------|----------------------|
| Core Runtime (nex/db/iam/hooks) | 126 | ~2,100 | 37 use vi.mock, 89 use in-memory SQLite | Excellent — behavior tests on DB + pipeline |
| Agent Orchestration (broker/runAgent/tool policy) | ~40 | ~600 | Mocked LLM calls | Good — orchestration logic ports directly |
| CLI/Config/Infra | 214 | ~1,200 | 150+ use vi.mock, temp dirs | Good — config parsing + command behavior |
| Agent Internals (stays in pi) | ~302 | ~2,900 | All LLM calls mocked | NOT ported — stays with pi-coding-agent |
| **Total ported** | **~380** | **~3,900** | | |

### Coverage Gaps (known risks)

- `src/sessions/` — 14% test ratio (1 test file for 7 impl files). Session resolution edge cases may not be captured.
- RPC client — **new code with no existing tests**. Must write Go tests that mock pi-coding-agent stdin/stdout.
- Streaming translation — the Go layer translating pi RPC events → Nexus SSE events needs thorough testing.
- Failover logic — auth rotation + model fallback is reimplemented in Go; must match TS behavior exactly.

### Test Translation Strategy

TypeScript tests using `vi.mock()` → Go tests using interface mocks (no external mocking framework needed; Go interfaces are implicitly satisfied).

TypeScript tests using `DatabaseSync` with `:memory:` → Go tests using `modernc.org/sqlite` with `:memory:`.

TypeScript tests using `vi.fn()` for callbacks → Go tests using function variables or test doubles.

**New test categories needed (no TS equivalent):**
- RPC client protocol tests (mock stdin/stdout, verify JSON-line serialization)
- RPC event → streaming event translation tests
- Pi subprocess lifecycle tests (spawn, health check, restart on crash)

---

## 9. Key Go Dependencies

| Purpose | Package | Notes |
|---------|---------|-------|
| CLI framework | `github.com/spf13/cobra` | |
| Config loading | `gopkg.in/yaml.v3` | |
| SQLite | `modernc.org/sqlite` (pure Go) or `github.com/mattn/go-sqlite3` (CGO) | Cortex currently uses mattn; consider unifying |
| HTTP framework | `net/http` (stdlib) | No external framework needed |
| WebSocket | `github.com/gorilla/websocket` or `nhooyr.io/websocket` | For control plane |
| JS runtime | `github.com/dop251/goja` | For automations hook scripts |
| UUID | `github.com/google/uuid` | Already used in cortex |
| Structured logging | `log/slog` (stdlib) | |
| Env loading | `github.com/joho/godotenv` | |
| TUI (optional) | `github.com/charmbracelet/bubbletea` | If terminal UI desired |
| Embed web UI | `embed` (stdlib) | `go:embed ui/dist` |

### External Runtime Dependencies

| Dependency | Required By | Notes |
|-----------|-------------|-------|
| **Node.js** (v22+) | pi-coding-agent subprocess | NOT bundled in Go binary. User must have Node.js installed. |
| **pi-coding-agent** | Agent execution | Installed via `npm install -g @mariozechner/pi-coding-agent` or bundled alongside |
| **Adapter binaries** | Messaging | Eve (Go), Telegram, Discord, etc. — spawned as child processes |

### Distribution Strategy

The Go binary itself is a single static file. But the full Nexus installation requires:

```
brew install nexus              # installs the Go binary
npm install -g pi               # installs pi-coding-agent + pi-ai + pi-agent-core
nexus init                      # configures adapters, config.yaml, state directory
```

Alternative: bundle pi-coding-agent's node_modules alongside the Go binary in the distribution package, eliminating the npm install step (user still needs Node.js runtime).

---

## 10. Go Module Structure

Single `go.mod` at repository root:

```
module github.com/Napageneral/nexus

go 1.24

require (
    github.com/spf13/cobra v1.10.2
    github.com/google/uuid v1.6.0
    github.com/mattn/go-sqlite3 v1.14.33  // or modernc.org/sqlite
    gopkg.in/yaml.v3 v3.0.1
    github.com/dop251/goja v0.x.x
    github.com/joho/godotenv v1.5.x
    // ... websocket, etc
)
```

The existing cortex code at `github.com/Napageneral/nex/cortex` gets reorganized into `internal/cortex/` within this module.

---

## 11. Backwards Compatibility

### SQLite Database Compatibility

The Go binary MUST read SQLite databases created by the TypeScript version without any migration step. All schemas are identical — they use the same `CREATE TABLE IF NOT EXISTS` statements. The Go binary uses the same column names, types, and constraints.

### Config File Compatibility

`config.yaml` format is identical. The Go binary reads the same YAML config, supports the same `$include` directives, the same env variable substitution (`${VAR}`), and the same legacy config detection + migration.

### Adapter Binary Compatibility

Existing adapter binaries (Eve, etc.) continue to work unchanged. The adapter protocol is the same 7-command stdin/stdout JSON protocol.

### Control Plane API Compatibility

HTTP endpoints serve identical request/response shapes. Swift apps and web UI work without changes.
