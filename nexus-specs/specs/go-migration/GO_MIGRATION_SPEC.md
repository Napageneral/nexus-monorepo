# Go Migration Specification

**Status:** DESIGN
**Last Updated:** 2026-03-02
**Related:** [LANGUAGE_AND_ARCHITECTURE.md](./architecture/LANGUAGE_AND_ARCHITECTURE.md), [NEX_ARCHITECTURE_AND_SDK_MODEL.md](./nex/NEX_ARCHITECTURE_AND_SDK_MODEL.md), [NEXUS_REQUEST_TARGET.md](./nex/NEXUS_REQUEST_TARGET.md)
**Supersedes:** `_archive/GO_MIGRATION_SPEC.md` (stale — assumed 8-stage pipeline, pi-coding-agent as RPC subprocess)

---

## 1. Executive Summary

Nexus is being migrated from a single TypeScript process (Bun runtime, forked from OpenClaw) to a **single Go binary with zero Node.js dependency**. The Go port of pi-coding-agent (`go-coding-agent`) already exists as a Go library, eliminating the largest dependency on Node.js.

### What Changes

| Before (TypeScript) | After (Go) |
|---------------------|------------|
| Bun/Node.js runtime | Single Go binary (`nexus`) |
| pi-coding-agent (TS) embedded in-process | go-coding-agent as a Go library call |
| pnpm workspace, 266K TS lines | `go.mod`, estimated 50-70K Go lines |
| Zod/TypeBox runtime validation | Go structs + `encoding/json` |
| Commander.js CLI (54K lines) | cobra CLI |
| In-process TS channel plugins | All channels are external adapter processes (already done) |

### What Stays the Same

- **7 SQLite databases** — byte-identical schemas, WAL mode, same file paths under `state/data/`
- **Adapter protocol** — stdio JSONL, same 7-verb CLI bridge. Existing Go and TS adapter binaries work unchanged.
- **5-stage pipeline** — `acceptRequest → resolvePrincipals → resolveAccess → executeOperation → finalizeRequest`
- **Operation taxonomy** — Same operation names, same schemas, same IAM model
- **Transport surfaces** — WebSocket + HTTP + stdio. Same wire protocols.
- **Config format** — `state/config.json` with same schema
- **Native apps** — iOS/Android/macOS apps connect via the same WS/HTTP control plane

### What Gets Eliminated

- Node.js / Bun runtime entirely
- TypeScript build toolchain (tsc, tsconfig, bundler, source maps)
- pnpm workspace + node_modules
- Zod / TypeBox runtime validation (~5K lines)
- pi-embedded-runner / pi-embedded-helpers / pi-extensions (~7.5K lines) — replaced by go-coding-agent library
- pi-embedded-subscribe + streaming layer (~2.5K lines) — replaced by go-coding-agent callbacks
- cli-runner fallback (~900 lines) — no longer needed
- Commander.js CLI framework overhead
- `src/infra/` platform scaffolding (~19K lines) — Go stdlib handles this natively

---

## 2. Target Architecture

### 2.1 The 4-Layer Model (Unchanged)

The Go binary implements the same 4-layer architecture defined in `NEX_ARCHITECTURE_AND_SDK_MODEL.md`:

```
┌─────────────────────────────────────────────────────────┐
│  4. SDK Layer          Typed client libraries            │
│     (Go + TS)          Generated from operation schemas  │
├─────────────────────────────────────────────────────────┤
│  3. Client Layer       CLI, Control UI, App UIs,         │
│     (callers)          App Services, Agents, Adapters    │
├─────────────────────────────────────────────────────────┤
│  2. Transport Layer    WebSocket, HTTP, stdio JSONL       │
│     (surfaces)         Same operations on all surfaces   │
├─────────────────────────────────────────────────────────┤
│  1. Core Layer         Operation taxonomy + 5-stage       │
│     (the runtime)      pipeline, ledgers, broker, IAM    │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Go Project Structure

```
nexus/
├── cmd/nexus/main.go                    # cobra entrypoint
├── internal/
│   ├── pipeline/                         # 5-stage NEX pipeline
│   │   ├── pipeline.go                   #   request bus, stage orchestration
│   │   ├── accept.go                     #   acceptRequest
│   │   ├── principals.go                 #   resolvePrincipals (identity lookup)
│   │   ├── access.go                     #   resolveAccess (IAM evaluation)
│   │   ├── execute.go                    #   executeOperation (handler dispatch)
│   │   ├── finalize.go                   #   finalizeRequest (trace persist)
│   │   └── request.go                    #   NexusRequest bus type
│   │
│   ├── operations/                       # operation taxonomy + handlers
│   │   ├── registry.go                   #   operation catalog (from OPERATION_TAXONOMY.md)
│   │   ├── health.go                     #   health, status, logs.tail
│   │   ├── config.go                     #   config.get, config.set, config.patch
│   │   ├── agents.go                     #   agents.*, sessions.*
│   │   ├── events.go                     #   event.ingest, event.backfill
│   │   ├── delivery.go                   #   delivery.send, delivery.stream
│   │   ├── clock.go                      #   clock.schedule.*
│   │   ├── adapters.go                   #   adapter.info, adapter.health, etc.
│   │   ├── memory.go                     #   memory.review.*
│   │   ├── work.go                       #   work.items.*, work.workflows.*
│   │   ├── acl.go                        #   acl.requests.*, acl.approval.*
│   │   ├── device.go                     #   device.host.*, device.pair.*
│   │   └── models.go                     #   models.list, usage.*
│   │
│   ├── broker/                           # agent orchestration (MA/WA)
│   │   ├── broker.go                     #   session routing, context assembly
│   │   ├── router.go                     #   session key resolution
│   │   ├── queue.go                      #   per-session message queue (steer/followup/collect)
│   │   ├── context.go                    #   agent context (AsyncLocalStorage equivalent)
│   │   └── subagent.go                   #   sub-agent registry + announce
│   │
│   ├── agent/                            # go-coding-agent integration
│   │   ├── engine.go                     #   wraps go-coding-agent as library
│   │   ├── tools.go                      #   Nexus tool assembly + policy filtering
│   │   ├── prompt.go                     #   system prompt construction
│   │   ├── auth.go                       #   multi-provider auth profile management
│   │   ├── models.go                     #   model selection, catalog, fallback
│   │   ├── skills.go                     #   skill loading, frontmatter, eligibility
│   │   ├── sandbox.go                    #   sandbox config + tool policy
│   │   └── streaming.go                  #   streaming event translation
│   │
│   ├── tools/                            # Nexus-specific agent tools
│   │   ├── mwp.go                        #   agent_send, get_agent_status/logs, wait, reply
│   │   ├── message.go                    #   message (send/reply/react/edit/thread)
│   │   ├── browser.go                    #   browser automation (HTTP client to browser server)
│   │   ├── nodes.go                      #   IoT/device control
│   │   ├── memory_recall.go              #   cortex_recall
│   │   ├── memory_writer.go              #   cortex_* (12 writer tools)
│   │   ├── memory_search.go              #   memory_search
│   │   ├── cron.go                       #   cron/scheduler tool
│   │   ├── web_search.go                 #   web search
│   │   ├── web_fetch.go                  #   URL fetch with readability
│   │   ├── image.go                      #   vision/image analysis
│   │   ├── sessions.go                   #   sessions_list, sessions_history, session_status
│   │   ├── runtime.go                    #   runtime management tool
│   │   ├── exec.go                       #   bash/exec with sandbox + approval
│   │   └── canvas.go                     #   canvas/UI tool
│   │
│   ├── memory/                           # memory system
│   │   ├── recall.go                     #   recall with FTS5 + embeddings
│   │   ├── writer.go                     #   element/entity/set/job writes
│   │   ├── search.go                     #   semantic search over memory files
│   │   ├── entities.go                   #   entity store operations
│   │   ├── embeddings.go                 #   embedding generation + sqlite-vec
│   │   ├── consolidation.go              #   fact consolidation
│   │   └── retain.go                     #   retain pipeline (hookpoint-driven)
│   │
│   ├── db/                               # 7 SQLite databases
│   │   ├── conn.go                       #   connection pool, WAL mode, pragmas
│   │   ├── events.go                     #   events.db access
│   │   ├── agents.go                     #   agents.db access
│   │   ├── identity.go                   #   identity.db access (entities, contacts)
│   │   ├── memory.go                     #   memory.db access (elements, sets, jobs)
│   │   ├── embeddings.go                 #   embeddings.db access (sqlite-vec)
│   │   ├── runtime.go                    #   runtime.db access (IAM, automations, adapters)
│   │   ├── work.go                       #   work.db access
│   │   └── migrations/                   #   schema migration files
│   │
│   ├── iam/                              # access control
│   │   ├── grants.go                     #   grant evaluation
│   │   ├── compiler.go                   #   policy compilation
│   │   └── audit.go                      #   audit logging
│   │
│   ├── transport/                        # Layer 2: surfaces
│   │   ├── ws/                           #   WebSocket surface
│   │   │   ├── server.go                 #     gorilla/websocket, JSON-RPC
│   │   │   ├── session.go                #     connection state, auth
│   │   │   └── events.go                 #     push event broadcasting
│   │   ├── http/                         #   HTTP surface
│   │   │   ├── server.go                 #     net/http, chi or stdlib mux
│   │   │   ├── health.go                 #     GET /health
│   │   │   ├── sse.go                    #     GET /api/events/stream (SSE)
│   │   │   ├── apps.go                   #     /app/<id>/* static serving
│   │   │   └── cors.go                   #     CORS handling
│   │   └── stdio/                        #   stdio JSONL surface (adapter protocol)
│   │       ├── adapter.go                #     adapter process management
│   │       └── protocol.go               #     JSONL frame encoding/decoding
│   │
│   ├── adapters/                         # adapter lifecycle management
│   │   ├── manager.go                    #   spawn, supervise, restart, shutdown
│   │   ├── protocol.go                   #   adapter protocol (info/monitor/send/stream/...)
│   │   └── connections.go                #   adapter connection state
│   │
│   ├── automations/                      # hookpoint system
│   │   ├── hooks.go                      #   hookpoint evaluation
│   │   └── runner.go                     #   automation execution
│   │
│   ├── apps/                             # app platform
│   │   ├── manifest.go                   #   app.nexus.json parsing
│   │   ├── registry.go                   #   app lifecycle (discovered→active)
│   │   ├── discovery.go                  #   directory scanning
│   │   ├── services.go                   #   service process management
│   │   └── methods.go                    #   operation dispatch to app services
│   │
│   ├── config/                           # configuration
│   │   ├── schema.go                     #   config struct definitions
│   │   ├── loader.go                     #   file loading + validation
│   │   └── watcher.go                    #   hot-reload via fsnotify
│   │
│   ├── media/                            # media handling
│   │   ├── store.go                      #   download, save, serve, cleanup
│   │   └── understanding.go              #   AI media analysis (multi-provider)
│   │
│   ├── cron/                             # clock/scheduler
│   │   ├── service.go                    #   schedule management
│   │   └── runner.go                     #   job execution + delivery
│   │
│   ├── security/                         # security audit
│   │   └── audit.go                      #   comprehensive security checks
│   │
│   ├── daemon/                           # process lifecycle
│   │   ├── daemon.go                     #   PID lock, signal handling
│   │   └── reload.go                     #   config hot-reload
│   │
│   └── cli/                              # cobra commands
│       ├── root.go
│       ├── daemon.go                     #   nexus daemon start/stop/restart
│       ├── config.go                     #   nexus config get/set/edit
│       ├── agents.go                     #   nexus agents list/create/...
│       ├── sessions.go                   #   nexus sessions list/inspect/...
│       ├── memory.go                     #   nexus memory recall/insert-fact/...
│       ├── adapters.go                   #   nexus adapters list/start/stop
│       ├── clock.go                      #   nexus clock schedule/list/run
│       ├── security.go                   #   nexus security audit/fix
│       ├── wizard.go                     #   nexus setup (onboarding)
│       └── chat.go                       #   nexus chat (interactive)
│
├── ui/dist/                              # go:embed static web assets (Control UI)
├── go.mod
└── go.sum
```

### 2.3 Key Go Dependencies

| Dependency | Purpose | Replaces |
|------------|---------|----------|
| `go-coding-agent` | Agent execution (LLM calls, session, compaction, tools) | pi-coding-agent + pi-embedded-runner + pi-ai |
| `github.com/spf13/cobra` | CLI framework | Commander.js (24K lines) |
| `github.com/gorilla/websocket` | WebSocket server | ws (Node.js) |
| `github.com/mattn/go-sqlite3` or `modernc.org/sqlite` | SQLite driver | better-sqlite3 |
| `github.com/asg017/sqlite-vec` | Vector embeddings | sqlite-vec (same C extension) |
| `github.com/fsnotify/fsnotify` | Config file watching | chokidar |
| Go stdlib `net/http` | HTTP server | Express / Bun.serve |
| Go stdlib `encoding/json` | JSON handling | Zod + TypeBox + JSON.parse |
| Go stdlib `os/exec` | Process management | child_process |
| Go stdlib `context` | Request scoping | AsyncLocalStorage |

---

## 3. Migration Inventory

### 3.1 Source Codebase Summary

| Directory | Source Files | Lines | Go Classification |
|-----------|-------------|-------|-------------------|
| `src/nex/` | 212 | 55,591 | **PORT** — pipeline, broker, control plane, adapters, automations |
| `src/agents/` | 231 | 48,372 | **MIXED** — 27K PORT (tools, auth, skills, queue, sandbox, system prompt), 12K REPLACED (agent loop), 1.5K DROPS |
| `src/commands/` | 177 | 29,991 | **PORT** — CLI commands → cobra |
| `src/cli/` | 143 | 24,278 | **DROPS** — Commander.js framework overhead; cobra replaces |
| `src/infra/` | 119 | 19,625 | **DROPS** — Go stdlib replaces (paths, platform, env, etc.) |
| `src/memory/` | 36 | 11,426 | **PORT** — memory system (recall, search, embeddings, writer) |
| `src/config/` | 72 | 10,477 | **PORT** — config schema → Go structs, loader, validation |
| `src/browser/` | 52 | 10,469 | **EXTERNAL** — stays as Node/Playwright HTTP server |
| `src/db/` | 10 | 6,201 | **PORT** — SQLite access layer |
| `src/plugins/` | 29 | 5,341 | **PORT** — app/plugin loading (now the app platform framework) |
| `src/iam/` | 17 | 4,051 | **PORT** — access control, grants, audit |
| `src/channels/` | 50 | 3,654 | **PARTIAL** — channel framework ports, plugin loader drops |
| `src/cron/` | 21 | 3,670 | **PORT** — scheduler service |
| `src/security/` | 8 | 3,633 | **PORT** — security audit |
| `src/apps/` | 14 | 3,516 | **PORT** — app manifest, registry, service manager |
| `src/media-understanding/` | 25 | 3,436 | **PORT** — AI media analysis |
| `src/media/` | 12 | 2,048 | **PORT** — media store/serve |
| `src/hooks/` | 18 | 2,621 | **PORT** — hookpoint system |
| `src/daemon/` | 19 | 3,554 | **PORT** — daemon lifecycle |
| `src/wizard/` | 7 | 1,668 | **PORT** — onboarding |
| `src/tts/` | 1 | 1,567 | **LATER** — TTS stays TS for V1 |
| `src/sessions/` | 9 | 1,268 | **PORT** — session metadata |
| `src/terminal/` | 10 | 744 | **PORT** — terminal formatting |
| `src/canvas-host/` | 2 | 735 | **LATER** — canvas stays TS for V1 |
| `src/pairing/` | 3 | 516 | **PORT** — device pairing |
| Everything else | ~95 | ~8,000 | **MIXED** |
| **Total** | **1,373** | **266,244** | |

### 3.2 Classification Totals

| Classification | Approx TS Lines | Estimated Go Lines |
|----------------|----------------|--------------------|
| **PORT** (must be reimplemented in Go) | ~145,000 | ~40-50K |
| **REPLACED** (go-coding-agent handles) | ~12,000 | 0 (library) |
| **DROPS** (no longer needed) | ~50,000 | 0 |
| **EXTERNAL** (stays as separate process) | ~12,000 | ~500 (HTTP client) |
| **LATER** (V2, stays TS for now) | ~5,000 | 0 |

The ~145K TS → ~40-50K Go reduction comes from:
- Go structs replace Zod/TypeBox runtime validation
- cobra replaces Commander.js CLI framework overhead
- Go stdlib replaces `src/infra/` platform scaffolding
- Go's concurrency model simplifies async/await patterns
- No TypeScript type gymnastics (discriminated unions, type guards, etc.)

---

## 4. go-coding-agent Integration

### 4.1 Architecture

go-coding-agent is a Go library, not a subprocess. The broker calls it as a function:

```go
// internal/agent/engine.go
func RunAgent(ctx context.Context, req AgentRunRequest) (*AgentRunResult, error) {
    session := gocodingagent.NewSession(gocodingagent.SessionConfig{
        Model:       req.Model,
        Provider:    req.Provider,
        APIKey:      req.APIKey,
        SystemPrompt: req.SystemPrompt,
        Tools:       req.Tools,
        MaxTokens:   req.MaxTokens,
    })

    result, err := session.Run(ctx, req.Prompt, gocodingagent.RunOptions{
        OnStream: req.StreamCallback,
    })

    return translateResult(result), err
}
```

### 4.2 What go-coding-agent Provides

- LLM API client (Anthropic, OpenAI, Google, Bedrock, etc.)
- Agent tool loop (call LLM → parse tool calls → execute tools → return results)
- Session management (message history, turns)
- Compaction (context window management, summarization)
- Built-in coding tools (read, write, edit, glob, grep, exec)
- Streaming (token-by-token callbacks)

### 4.3 What Nexus Adds on Top

The Nexus Go binary wraps go-coding-agent with:

1. **Custom tools** (~10K TS lines → ~5-7K Go) — message, browser, nodes, cron, memory/cortex, web, image, mwp-tools, sessions, runtime, canvas
2. **Tool policy** — per-agent allow/deny lists, sandbox restrictions, approval workflows
3. **Auth profiles** (~2.7K TS → ~1.5K Go) — multi-provider credential rotation, OAuth refresh, cooldowns, external CLI sync
4. **Model selection** (~3.3K TS → ~2K Go) — multi-provider catalog, fallback chains, bedrock discovery
5. **System prompt** (~650 TS → ~400 Go) — Nexus-specific prompt sections (skills, memory, identity, workspace)
6. **Skills** (~2.3K TS → ~1.5K Go) — markdown skill loading, frontmatter parsing, eligibility filtering
7. **Sandbox** (~700 TS → ~400 Go) — isolation policy resolution, tool filtering
8. **Queue** (~700 TS → ~500 Go) — per-session message queue with modes (steer, followup, collect, interrupt)
9. **Sub-agent registry** (~1.2K TS → ~800 Go) — MA/WA orchestration, sub-agent tracking, result announcement

---

## 5. What Stays External

These components are NOT part of the Go binary. They communicate over defined protocols.

### 5.1 Browser Automation Server

The browser module (`src/browser/`, 10.5K lines) stays as a **Node.js/Playwright process**. The Go binary:
- Spawns it as a child process on demand
- Communicates via HTTP (same as today)
- The `browser` agent tool in Go is an HTTP client

**Why external:** Playwright is a Node.js library with no Go equivalent. Browser automation requires a full JS runtime for CDP interaction.

### 5.2 Adapter Binaries

All existing adapters (Go and TS) continue to work unchanged:
- 12 Go adapters (device-*, github, gog-*, meta-ads, apple-maps, EMR adapters)
- 3 TS adapters (telegram, whatsapp, discord)
- Adapter SDK (Go + TS versions)

Protocol: stdio JSONL, same 7-verb CLI bridge (`info`, `monitor`, `backfill`, `send`, `stream`, `health`, `accounts`).

### 5.3 App Service Binaries

Apps (GlowBot, Spike, etc.) run as separate processes. The Go runtime:
- Discovers app manifests (`app.nexus.json`)
- Spawns app service binaries
- Dispatches operations to them via stdio/HTTP
- Serves their static UI assets via `/app/<id>/*`

### 5.4 Native Clients

iOS, Android, macOS apps are separate builds. They connect via the same WS/HTTP control plane.

### 5.5 TTS (V1: External, V2: Consider Port)

TTS (`src/tts/`, 1.6K lines) stays as a TS process for V1. Multi-provider TTS (ElevenLabs, OpenAI, Edge TTS) with caching and telephony output.

### 5.6 Frontdoor

The frontdoor (`nexus-frontdoor/`) is a separate service for hosted deployments. It handles OIDC auth, workspace routing, runtime token minting, and HTTP/WS/SSE proxying. It may be ported to Go separately, merged into the nexus binary as a mode, or remain Node.js — this is independent of the runtime port.

---

## 6. Database Compatibility

### 6.1 Zero-Migration Requirement

The Go binary MUST read existing SQLite databases without migration. Schemas are byte-identical. The Go binary writes to the same tables with the same column types.

### 6.2 The 7 Databases

| Database | Tables (key) | Go Access Pattern |
|----------|-------------|-------------------|
| **events.db** | events, attachments, attachment_interpretations, events_fts | High-write (every inbound/outbound event). FTS5 for search. |
| **agents.db** | sessions, turns, messages, tool_calls, compactions, artifacts | High-write during agent runs. Session lifecycle. |
| **identity.db** | entities, contacts, entity_tags, entity_persona, entity_links | Read-heavy during `resolvePrincipals`. Write on new sender. |
| **memory.db** | elements, element_entities, element_links, sets, set_members, jobs, processing_log | Write during retain pipeline. Read during recall. |
| **embeddings.db** | embeddings (sqlite-vec) | Write during embedding generation. Read during semantic search. |
| **runtime.db** | pipeline_requests, automations, grants, audit_log, adapter_state, import_jobs | Write during pipeline. IAM evaluation. |
| **work.db** | work_items, sequences, workflows, campaigns | CRM/work system reads and writes. |

### 6.3 SQLite Driver Choice

Two options:
- **`mattn/go-sqlite3`** — CGo binding. Production-proven. Supports sqlite-vec extension loading.
- **`modernc.org/sqlite`** — Pure Go translation of SQLite C code. No CGo. Simpler cross-compilation. May not support sqlite-vec.

**Recommendation:** Use `mattn/go-sqlite3` for sqlite-vec compatibility. Cross-compilation handled via `CGO_ENABLED=1` with musl for static builds.

---

## 7. V1 Definition: Full Self-Hosted Runtime

V1 produces a Go binary that fully replaces the TypeScript nex process for self-hosted deployments.

### 7.1 V1 Must Work

| Capability | What It Means |
|------------|---------------|
| **CLI** | All `nexus` subcommands: daemon, config, agents, sessions, memory, adapters, clock, security, chat, setup |
| **Daemon** | PID lock, signal handling (SIGTERM/SIGINT/SIGUSR1), config hot-reload, clean shutdown |
| **5-stage pipeline** | All operations flow through acceptRequest → resolvePrincipals → resolveAccess → executeOperation → finalizeRequest |
| **Agent execution** | Single agent runs via go-coding-agent. All Nexus tools available. System prompt. Skills. |
| **Multi-agent** | MA/WA pattern. Broker routing. Sub-agent dispatch. Queue management. |
| **All 7 databases** | Read/write all ledgers. Schema migration on startup. |
| **Adapters** | Spawn/supervise adapter binaries. Adapter protocol. Connection management. |
| **Control plane** | HTTP server (health, SSE, app serving) + WebSocket server (full operation taxonomy) |
| **Memory system** | Recall, search, writer tools, entities, embeddings, retain pipeline, consolidation |
| **IAM** | Grants, policies, access control evaluation, audit logging |
| **Automations** | Hookpoint system, automation evaluation at stage boundaries |
| **Cron/Clock** | Schedule management, job execution, delivery |
| **App platform** | Manifest discovery, service management, UI serving, method dispatch |
| **Device pairing** | Pairing flow, device host WS registry |
| **Security audit** | `nexus security audit` and `nexus security fix` |
| **Browser tools** | HTTP client to browser automation server (browser server stays Node.js) |
| **Media** | Media store, serve, download, AI media understanding |
| **Config** | Load, validate, hot-reload, schema |

### 7.2 V1 Deferred

| Capability | Why Deferred |
|------------|-------------|
| TTS | Rich but not core. Stays as TS extension. |
| Canvas host | UI presentation layer. Not core. |
| Frontdoor | Separate deployment concern. Independent port decision. |
| gRPC surface | Future transport option. Not needed for V1. |
| SDK generation | Can happen after V1 stabilizes the operation schemas. |

### 7.3 V1 Success Criteria

1. `nexus daemon start` boots and serves on the same ports as the TS version
2. Existing adapter binaries connect and work without modification
3. Existing config.json loads without modification
4. Existing SQLite databases are read/written correctly
5. Native apps (iOS/macOS/Android) connect via WS/HTTP and work
6. Agent runs produce identical behavior (same tools, same policies, same streaming)
7. All operation taxonomy operations are implemented and routable
8. `brew install nexus` installs a single binary with zero runtime dependencies

---

## 8. Migration Phasing

### Phase 1: Foundation (Core + Pipeline + DB)

Build the skeleton that everything else plugs into.

**Deliverables:**
- `cmd/nexus/main.go` with cobra
- `internal/pipeline/` — 5-stage pipeline with NexusRequest bus
- `internal/operations/registry.go` — operation catalog
- `internal/db/` — all 7 database connections with migrations
- `internal/config/` — config loading and validation
- `internal/daemon/` — PID lock, signal handling, startup sequence
- `internal/transport/http/` — health endpoint, basic HTTP server
- `internal/transport/ws/` — WebSocket server, connect operation, auth

**Test:** `nexus daemon start` boots, serves `/health`, accepts WS connections.

### Phase 2: Agent Execution

Wire go-coding-agent into the pipeline.

**Deliverables:**
- `internal/agent/` — go-coding-agent integration (engine, auth, models, prompt, skills)
- `internal/tools/exec.go` — bash/exec with sandbox and approval
- `internal/broker/` — session routing, queue management
- `internal/tools/` — core tools (memory_recall, memory_writer, web_search, web_fetch, image)
- Agent runs execute via `event.ingest` → pipeline → broker → go-coding-agent

**Test:** Send a message via adapter protocol, get an agent response with tool use.

### Phase 3: Full Operation Coverage

Implement all remaining operations and tools.

**Deliverables:**
- `internal/tools/` — remaining tools (message, browser, nodes, cron, mwp, sessions, runtime, canvas)
- `internal/iam/` — full access control
- `internal/automations/` — hookpoint system
- `internal/adapters/` — adapter lifecycle management
- `internal/memory/` — full memory system (retain pipeline, consolidation, embeddings)
- `internal/cron/` — clock/scheduler service
- `internal/apps/` — app platform
- `internal/transport/stdio/` — adapter protocol surface
- All operation handlers in `internal/operations/`

**Test:** Full operation taxonomy works. Adapters connect. Multi-agent orchestration.

### Phase 4: CLI + Polish

Complete the user-facing interface.

**Deliverables:**
- `internal/cli/` — all cobra commands
- `internal/media/` — media store/serve/understanding
- `internal/security/` — security audit
- `internal/pairing/` — device pairing
- `internal/wizard/` — onboarding
- Control UI static serving (`go:embed`)
- SSE endpoint for browser streaming

**Test:** Full CLI parity. `nexus setup` works. `nexus chat` works. Control UI loads.

### Phase 5: Validation + Distribution

Prove it works and ship it.

**Deliverables:**
- Behavioral test suite ported from TS (4,852 tests)
- Performance benchmarks (startup time, memory, throughput)
- `brew install nexus` formula
- Migration guide for existing users
- Binary size optimization

**Test:** All behavioral tests pass. Existing users can switch binaries transparently.

---

## 9. Open Questions

1. **sqlite-vec in Go** — Does `mattn/go-sqlite3` reliably load the sqlite-vec extension? If not, do we use `modernc.org/sqlite` with a custom vec implementation, or embed the vec extension?

2. **go-coding-agent API stability** — What is the current API surface? Does it support all providers Nexus needs (Anthropic, OpenAI, Google, Bedrock, etc.)? Does it support custom tool injection?

3. **Control UI embedding** — The Control UI is a React SPA. Is it built separately and embedded via `go:embed`, or served from disk? `go:embed` simplifies distribution but increases binary size.

4. **Plugin system in Go** — The current `src/plugins/` handles app manifest loading, service management, and method dispatch. In Go, do we use Go plugins (`plugin` package), or keep everything as external process communication?

5. **Browser server lifecycle** — In V1, who manages the browser server process? Does the Go binary spawn it on demand, or is it a separate `nexus browser-server start` command?
