# Phase 3: Full Operation Coverage

**Status:** PENDING (depends on Phase 2)
**Parent:** [GO_MIGRATION_SPEC.md](../GO_MIGRATION_SPEC.md) § Phase 3
**Target project:** `/Users/tyler/nexus/home/projects/nexus/nexgo/`

---

## Scope

Implement all remaining operation handlers, the full adapter lifecycle manager, the complete memory system (retain pipeline, consolidation, embeddings), IAM access control, automations/hookpoints, apps platform, multi-agent orchestration (MA/WA), cron/clock service, and all remaining agent tools. By the end of this phase, the Go binary has full feature parity with the TS runtime for operation handling.

**Does NOT include:** CLI commands beyond `serve`/`chat`/`status` (Phase 4), media understanding (Phase 4), security audit (Phase 4), device pairing (Phase 4), onboarding wizard (Phase 4).

---

## Prerequisite

Phase 2 complete: agent execution, single-agent broker, core tools (memory, web, exec), auth profiles, model selection, skills, streaming.

---

## Task 1: Adapter Lifecycle Manager

**Port from:** `nex/src/nex/adapters/manager.ts` (1,974 lines), `supervision.ts` (448), `protocol.ts` (418), `config.ts` (151), `adapter-state-db.ts` (173), `runtime-context.ts` (585), `inbound-integrity.ts` (161)
**Total:** ~3,910 TS lines → ~2,500 Go lines

### 1.1 Adapter manager

```go
// internal/adapters/manager.go
type Manager struct {
    ledgers   *db.Ledgers
    config    *config.Config
    procs     map[string]*AdapterProcess
    mu        sync.RWMutex
}

func (m *Manager) Start(ctx context.Context, adapterID string) error
func (m *Manager) Stop(adapterID string) error
func (m *Manager) RestartAll(ctx context.Context) error
func (m *Manager) Shutdown(ctx context.Context) error
```

Spawn adapter binaries as child processes. Each adapter gets a stdio JSONL connection. Manager tracks process state, handles crashes with restart policy.

### 1.2 Supervision

**Port from:** `supervision.ts`

- Health monitoring: periodic `health` verb calls to each adapter
- Restart policy: exponential backoff on crashes
- Graceful shutdown: send SIGTERM, wait, SIGKILL fallback

### 1.3 Adapter protocol (full)

**Port from:** `protocol.ts`

Implement all 7 verbs of the stdio JSONL adapter protocol:
- `info` — adapter identity + capabilities
- `monitor` — start event stream from adapter → runtime
- `backfill` — historical event fetch
- `send` — deliver message to external platform
- `stream` — streaming message delivery
- `health` — adapter health check
- `accounts` — list adapter accounts/credentials

### 1.4 Adapter state persistence

**Port from:** `adapter-state-db.ts`

Track adapter state in runtime.db: last seen, connection status, error counts, capabilities.

### 1.5 Inbound integrity

**Port from:** `inbound-integrity.ts`

Validate and deduplicate inbound events from adapters: check required fields, dedup by event ID, normalize timestamps.

### 1.6 Runtime context for adapters

**Port from:** `runtime-context.ts`

Provide adapters with runtime context (config, entity resolution, credential lookup) via protocol calls.

**Acceptance:** Start a Go adapter binary (e.g., discord), it connects via stdio, sends events through the pipeline, agent responds, response is delivered back through the adapter.

---

## Task 2: Full Memory System

**Port from:** `nex/src/memory/` (36 source files, ~11,426 lines total)
**Total:** ~7,200 TS lines (non-test) → ~4,500 Go lines

### 2.1 Memory manager

**Port from:** `manager.ts` (2,188 lines)

```go
// internal/memory/manager.go
type Manager struct {
    ledgers     *db.Ledgers
    embeddings  *EmbeddingService
    config      *config.MemoryConfig
}

func (m *Manager) Initialize(ctx context.Context) error
func (m *Manager) SyncMemoryFiles(ctx context.Context) error
func (m *Manager) GetStatus() MemoryStatus
```

The manager coordinates memory operations: file sync, embedding generation, search, and the retain pipeline.

### 2.2 Recall system

**Port from:** `recall.ts` (2,394 lines), `recall/graph.ts` (124), `recall/link_expansion.ts` (115), `recall/temporal.ts` (225)

```go
// internal/memory/recall.go
func (m *Manager) Recall(ctx context.Context, req RecallRequest) (*RecallResult, error)
```

Multi-strategy recall:
- FTS5 full-text search over memory.db elements
- Embedding-based semantic search via sqlite-vec
- Entity-aware filtering (element_entities join)
- Link expansion (follow element_links)
- Graph traversal (related entities)
- Temporal recall (time-range queries)
- Result ranking and deduplication

### 2.3 Embedding service

**Port from:** `embeddings.ts` (248 lines), `embeddings-voyage.ts` (100), `embeddings-openai.ts` (92), `embeddings-gemini.ts` (165), `sqlite-vec.ts` (24), `kg-embeddings.ts` (194), `batch-*.ts` (~1,202 lines total)

```go
// internal/memory/embeddings.go
type EmbeddingService struct {
    provider    EmbeddingProvider
    vecDB       *sql.DB  // embeddings.db with sqlite-vec
}

type EmbeddingProvider interface {
    Embed(ctx context.Context, texts []string) ([][]float32, error)
}
```

Multi-provider embedding generation:
- Voyage AI (primary)
- OpenAI embeddings
- Google Gemini embeddings
- Batch processing support
- sqlite-vec storage and search

### 2.4 Retain pipeline

**Port from:** `retain-live.ts` (519 lines), `retain-dispatch.ts` (358), `retain-episodes.ts` (374)

```go
// internal/memory/retain.go
func (m *Manager) RetainFromTurn(ctx context.Context, turnData TurnData) error
func (m *Manager) RetainFromEpisode(ctx context.Context, episode Episode) error
```

The retain pipeline extracts memory from agent interactions:
1. **Live retain** — process agent turn output, extract facts/entities/links
2. **Episode retain** — process conversation episodes for longer-form extraction
3. **Dispatch** — route retain jobs to appropriate handlers

### 2.5 Consolidation

**Port from:** `nex/src/nex/automations/meeseeks/memory-consolidate-episode.ts` (470 lines)

Merge duplicate/overlapping memory elements, update entity links, resolve conflicts.

### 2.6 Memory file sync

**Port from:** `sync-memory-files.ts` (102 lines), `qmd-manager.ts` (1,008 lines)

Sync markdown memory files (`.qmd`) from disk into memory.db elements. Parse frontmatter, extract metadata, generate embeddings.

### 2.7 Search manager

**Port from:** `manager-search.ts` (187 lines), `search-manager.ts` (223 lines)

Coordinate search across FTS5 and embeddings, merge and rank results.

### 2.8 Backend config

**Port from:** `backend-config.ts` (299 lines)

Configure embedding provider, model, dimensions, batch sizes per deployment.

**Acceptance:** Memory recall returns results from FTS5 + embeddings. Retain pipeline processes agent turns and extracts facts. Memory files sync from disk. Consolidation merges duplicates.

---

## Task 3: IAM (Access Control)

**Port from:** `nex/src/iam/` (17 source files, ~4,051 lines total)
**Total:** ~3,050 TS lines (non-test) → ~2,000 Go lines

### 3.1 Grants store

**Port from:** `grants.ts` (817 lines)

```go
// internal/iam/grants.go
type GrantStore struct {
    db *sql.DB  // runtime.db
}

func (s *GrantStore) Create(ctx context.Context, grant Grant) error
func (s *GrantStore) Revoke(ctx context.Context, grantID string) error
func (s *GrantStore) ListForEntity(ctx context.Context, entityID string) ([]Grant, error)
func (s *GrantStore) Evaluate(ctx context.Context, entityID string, operation string, resource string) (*AccessDecision, error)
```

Grants are stored in runtime.db. Each grant specifies: entity, operation pattern, resource pattern, effect (allow/deny), conditions.

### 3.2 Policy system

**Port from:** `policies.ts` (754 lines), `compiler.ts` (56 lines), `policy-loader.ts` (27 lines)

```go
// internal/iam/policies.go
type PolicyEngine struct {
    grants  *GrantStore
    roles   *RoleStore
}

func (e *PolicyEngine) Evaluate(ctx context.Context, req AccessRequest) *AccessDecision
```

Compile and evaluate access policies: match grants against request, evaluate conditions, combine effects.

### 3.3 Authorization

**Port from:** `authorize.ts` (236 lines), `access-resolution.ts` (79 lines), `access-permissions.ts` (68 lines)

Wire IAM into the pipeline's `resolveAccess` stage. Replace Phase 1's stub with real evaluation.

### 3.4 Role capabilities

**Port from:** `role-caps.ts` (60 lines)

Map roles to capability sets for quick authorization checks.

### 3.5 Runtime tool policies

**Port from:** `runtime-tool-policies.ts` (231 lines)

Per-agent tool allow/deny lists. Evaluated when assembling tool registry for an agent run.

### 3.6 Audit logging

**Port from:** `audit.ts` (437 lines)

```go
// internal/iam/audit.go
func (a *AuditLogger) Log(ctx context.Context, entry AuditEntry) error
func (a *AuditLogger) Query(ctx context.Context, filter AuditFilter) ([]AuditEntry, error)
```

Write audit trail to runtime.db audit_log table. Every access decision, grant mutation, and sensitive operation gets logged.

### 3.7 Identity management

**Port from:** `identity.ts` (591 lines), `identity-entities.ts` (79 lines), `bootstrap-identities.ts` (262 lines), `device-entities.ts` (88 lines), `password-auth.ts` (163 lines)

Entity CRUD, contact management, entity tag operations (Phase 0 semantics from work-system), device entity registration, password authentication.

**Acceptance:** Pipeline `resolveAccess` stage evaluates real grants. Grant CRUD works via operations. Audit log captures access decisions. Tool policies filter agent tools.

---

## Task 4: Automations / Hookpoints

**Port from:** `nex/src/nex/automations/` (~4,426 lines), `nex/src/hooks/` (~2,621 lines)
**Total:** ~4,800 TS lines (non-test) → ~3,000 Go lines

### 4.1 Hooks runtime

**Port from:** `automations/hooks-runtime.ts` (1,995 lines)

```go
// internal/automations/hooks.go
type HooksRuntime struct {
    registry   map[string][]HookHandler
    ledgers    *db.Ledgers
    config     *config.Config
}

func (h *HooksRuntime) Fire(ctx context.Context, hookpoint string, data HookData) error
func (h *HooksRuntime) Register(hookpoint string, handler HookHandler) error
```

The hooks runtime evaluates hookpoints at pipeline stage boundaries and other lifecycle events.

### 4.2 Bundled automations

**Port from:** `automations/bundled/registry.ts` (187 lines) + individual handlers

Built-in automations:
- `boot-md` — inject workspace NOTES.md into agent context
- `command-logger` — log commands for auditing
- `memory-retain-episode` — trigger retain pipeline after episodes
- `memory-consolidator` — periodic memory consolidation
- `memory-reader` — inject memory context into prompts

### 4.3 Meeseeks (automation executors)

**Port from:** `automations/meeseeks/` (~1,009 lines)

Automation executors for memory operations:
- `memory-retain-episode.ts` (377 lines) — extract memory from conversation episodes
- `memory-consolidate-episode.ts` (470 lines) — consolidate episode memories
- `memory-injection.ts` (56 lines) — inject memory into agent context
- `stream-params.ts` (103 lines) — streaming parameter extraction

### 4.4 Automation seeder

**Port from:** `automations/seeder.ts` (575 lines)

Seed default automations on first boot. Ensure bundled automations are registered.

### 4.5 Automation services

**Port from:** `automations/services.ts` (591 lines)

Service layer for automation CRUD, enable/disable, scheduling.

### 4.6 Hook system (skills/workspace)

**Port from:** `hooks/hooks-runtime.ts`, `loader.ts` (146), `config.ts` (164), `workspace.ts` (295), `install.ts` (499), `internal-hooks.ts` (183), `plugin-hooks.ts` (116)

Workspace-level hooks: load from hooks directory, parse frontmatter, evaluate eligibility, install/uninstall hooks.

### 4.7 Hooks mapping

**Port from:** `control-plane/hooks-mapping.ts` (509 lines), `control-plane/hooks.ts` (226 lines)

Map operation taxonomy events to hook points. Wire hooks into the control plane lifecycle.

**Acceptance:** Hookpoints fire at pipeline boundaries. Memory retain triggers after agent turns. Bundled automations work. Workspace hooks load and execute.

---

## Task 5: Multi-Agent Orchestration (MA/WA)

**Port from:** `nex/src/agents/subagent-registry.ts` (454 lines), `subagent-announce.ts` (597), `subagent-announce-queue.ts` (191), `subagent-registry.store.ts` (118), `nex/src/agents/queue/` (~723 lines), `nex/src/agents/tools/mwp-tools.ts` (274), `nex/src/nex/broker/` (85 lines)
**Total:** ~2,442 TS lines → ~1,500 Go lines

### 5.1 Broker (full)

Extend Phase 2's single-agent broker to support multi-agent dispatch:

```go
// internal/broker/broker.go (extend)
func (b *Broker) DispatchToSubAgent(ctx context.Context, req SubAgentRequest) error
func (b *Broker) HandleSubAgentResult(ctx context.Context, result SubAgentResult) error
```

### 5.2 Sub-agent registry

**Port from:** `subagent-registry.ts` (454 lines), `subagent-registry.store.ts` (118 lines)

```go
// internal/broker/subagent.go
type SubAgentRegistry struct {
    agents map[string]*SubAgentState
    mu     sync.RWMutex
}

func (r *SubAgentRegistry) Register(agentID string, parentSession string) error
func (r *SubAgentRegistry) GetStatus(agentID string) *SubAgentState
func (r *SubAgentRegistry) ListForSession(sessionKey string) []*SubAgentState
```

Track active sub-agents, their parent sessions, and completion status.

### 5.3 Sub-agent announce

**Port from:** `subagent-announce.ts` (597 lines), `subagent-announce-queue.ts` (191 lines)

When a sub-agent completes, announce its result back to the parent agent's session. Queue announcements if the parent is busy.

### 5.4 Message queue (full)

**Port from:** `queue/` directory (~723 lines total)

Extend Phase 2's simple queue with full modes:
- **steer** — interrupt current run with new instruction
- **followup** — queue for after current run completes
- **collect** — batch messages for next run
- **interrupt** — cancel current run and start new one

### 5.5 MWP tools

**Port from:** `tools/mwp-tools.ts` (274 lines)

Agent tools for multi-agent work:
- `agent_send` — dispatch work to a sub-agent
- `get_agent_status` — check sub-agent status
- `get_agent_logs` — read sub-agent output
- `wait_for_agent` — block until sub-agent completes
- `reply_to_parent` — send result back to parent

**Acceptance:** Agent can use `agent_send` to dispatch to a sub-agent. Sub-agent runs independently. Result is announced back to parent session. Queue handles concurrent messages in all modes.

---

## Task 6: Remaining Agent Tools

**Port from:** `nex/src/agents/tools/` (remaining tools not done in Phase 2)

### 6.1 Message tool

**Port from:** `message-tool.ts` (484 lines)

```go
// internal/tools/message.go
```

Send/reply/react/edit/thread messages through adapters. Uses `delivery.send` operation.

### 6.2 Browser tool

**Port from:** `browser-tool.ts` (724 lines), `browser-tool.schema.ts` (112 lines)

```go
// internal/tools/browser.go
```

HTTP client to the external browser automation server. Actions: navigate, screenshot, click, type, extract, execute JS, etc.

### 6.3 Nodes tool

**Port from:** `nodes-tool.ts` (517 lines), `nodes-utils.ts` (249 lines)

```go
// internal/tools/nodes.go
```

IoT/device control. Query device state, send commands, read sensors.

### 6.4 Cron tool

**Port from:** `cron-tool.ts` (450 lines)

```go
// internal/tools/cron.go
```

Schedule/list/cancel/modify cron jobs from within agent context.

### 6.5 Sessions tools

**Port from:** `sessions-list-tool.ts` (232 lines), `sessions-history-tool.ts` (308 lines), `session-status-tool.ts` (418 lines), `sessions-helpers.ts` (485 lines)

```go
// internal/tools/sessions.go
```

List sessions, view session history, check session status, inspect past conversations.

### 6.6 Runtime tool

**Port from:** `runtime-tool.ts` (315 lines)

```go
// internal/tools/runtime.go
```

Runtime management: check status, reload config, list adapters, restart services.

### 6.7 Canvas tool

**Port from:** `canvas-tool.ts` (180 lines)

```go
// internal/tools/canvas.go
```

Canvas/UI rendering tool. Generate structured UI content.

### 6.8 Agents list tool

**Port from:** `agents-list-tool.ts` (91 lines)

List available agents with their configurations.

### 6.9 TTS tool (stub)

**Port from:** `tts-tool.ts` (61 lines)

Stub that delegates to external TTS service. Full TTS is deferred to V2.

**Acceptance:** All agent tools are available and functional. Agent can send messages, control browser, manage cron, query sessions, control nodes.

---

## Task 7: Cron / Clock Service

**Port from:** `nex/src/cron/` (21 source files, ~3,670 lines total)
**Total:** ~3,670 TS lines → ~2,200 Go lines

### 7.1 Clock service

**Port from:** `service/` directory (~1,652 lines)

```go
// internal/cron/service.go
type Service struct {
    store    *Store
    timer    *Timer
    ledgers  *db.Ledgers
    broker   *broker.Broker
}

func (s *Service) Start(ctx context.Context) error
func (s *Service) Stop() error
```

### 7.2 Schedule store

**Port from:** `service/store.ts` (536 lines), `service/state.ts` (92 lines)

CRUD for schedules stored in runtime.db. Schedule normalization, validation.

### 7.3 Timer

**Port from:** `service/timer.ts` (492 lines)

Go `time.Ticker`-based execution. Evaluate schedules, fire due jobs, track execution.

### 7.4 Job execution

**Port from:** `service/jobs.ts` (415 lines), `service/ops.ts` (208 lines)

Execute scheduled jobs: dispatch as pipeline operations, track results, handle failures.

### 7.5 Delivery

**Port from:** `delivery.ts` (77 lines), `isolated-agent/` (~762 lines)

Deliver cron job output: send as events, trigger agent runs, notify via adapters.

### 7.6 Schedule normalization

**Port from:** `normalize.ts` (498 lines), `parse.ts` (31 lines), `validate-timestamp.ts` (66 lines)

Parse cron expressions, natural language schedules, validate timestamps, normalize to internal format.

**Acceptance:** `clock.schedule.create` creates a schedule. Timer fires jobs on time. Delivery sends output through pipeline. `clock.schedule.list` returns all schedules.

---

## Task 8: Apps Platform

**Port from:** `nex/src/apps/` (14 source files, ~3,516 lines total)
**Total:** ~3,516 TS lines → ~2,200 Go lines

### 8.1 App manifest

**Port from:** `manifest.ts` (533 lines), `schema-validator.ts` (111 lines)

```go
// internal/apps/manifest.go
type AppManifest struct {
    ID          string
    Name        string
    Version     string
    Description string
    Services    []ServiceDef
    UI          *UIDef
    Adapters    []AdapterDef
    Methods     []MethodDef
    Hooks       []HookDef
}

func ParseManifest(path string) (*AppManifest, error)
```

Parse `app.nexus.json` manifests. Validate against schema.

### 8.2 Discovery

**Port from:** `discovery.ts` (106 lines)

Scan app directories for manifests. Watch for new/removed apps.

### 8.3 Registry

**Port from:** `registry.ts` (196 lines), `context.ts` (392 lines)

Track app lifecycle: discovered → installed → active → stopped. Provide app context for service processes.

### 8.4 Service manager

**Port from:** `service-manager.ts` (565 lines), `service-client.ts` (142 lines)

Spawn app service binaries as child processes. Manage lifecycle, health checks, restart.

### 8.5 Service dispatch

**Port from:** `service-dispatch.ts` (155 lines), `method-loader.ts` (180 lines)

Route operations to app services. Each app registers methods it handles. Dispatch via stdio/HTTP.

### 8.6 App platform hooks

**Port from:** `hooks.ts` (180 lines), `iam-generator.ts` (85 lines), `adapter-registrar.ts` (75 lines), `ui-registrar.ts` (120 lines)

Auto-generate IAM grants for app operations. Register app adapters. Register app UI routes.

### 8.7 Management API

**Port from:** `management-api.ts` (676 lines)

Operations: `apps.list`, `apps.install`, `apps.uninstall`, `apps.start`, `apps.stop`, `apps.status`.

**Acceptance:** App manifests discovered and parsed. App services spawn and respond to method calls. App UIs served via `/app/<id>/*`. App operations work via control plane.

---

## Task 9: All Operation Handlers

Implement every remaining operation handler from the operation taxonomy.

### 9.1 Already done (Phase 1 + 2)

- `health`, `status`, `connect`, `config.get` (Phase 1)
- `event.ingest` (Phase 2)

### 9.2 Config operations

**Port from:** `server-methods/config.ts` (460 lines)

- `config.get` — already done
- `config.set` — full config replacement
- `config.patch` — partial config update

### 9.3 Agent operations

**Port from:** `server-methods/agents.ts` (498), `agent.ts` (660), `agent-job.ts` (135), `agent-timestamp.ts` (80)

- `agents.list` — list configured agents
- `agents.create` / `agents.update` / `agents.delete` — agent CRUD
- `agent.run` — trigger an agent run directly
- `agent.abort` — abort running agent

### 9.4 Session operations

**Port from:** `server-methods/sessions.ts` (438)

- `sessions.list` — list sessions with filters
- `sessions.get` — get session details
- `sessions.patch` — update session metadata
- `sessions.delete` — delete a session

### 9.5 Chat operations

**Port from:** `server-methods/chat.ts` (764), `control-plane/server-chat.ts` (378)

- `chat.send` — send a chat message (triggers agent run)
- `chat.abort` — abort chat in progress
- `chat.history` — get chat history

### 9.6 Delivery operations

**Port from:** `server-methods/send.ts` (333)

- `delivery.send` — send message to adapter for external delivery
- `delivery.stream` — streaming message delivery

### 9.7 Event operations

**Port from:** `server-methods/event-ingest.ts` (54)

- `event.ingest` — already done in Phase 2
- `event.backfill` — historical event import

### 9.8 Adapter operations

**Port from:** `server-methods/adapter-connections.ts` (2,269), `adapter-capabilities.ts` (448), `server-methods/channels.ts` (292)

- `adapter.info` — get adapter details
- `adapter.health` — adapter health
- `adapter.connections.list` — list adapter connections
- `adapter.connections.connect` / `disconnect`
- `adapter.capabilities` — list adapter capabilities

### 9.9 Memory review operations

**Port from:** `server-methods/memory-review.ts` (2,517)

- `memory.review.list` — list memory elements for review
- `memory.review.approve` / `reject` / `edit` — human-in-the-loop memory review
- `memory.review.stats` — memory review statistics

### 9.10 Work operations

**Port from:** `server-methods/work.ts` (883)

- `work.items.list` / `create` / `update` / `delete` — work item CRUD
- `work.workflows.list` / `create` — workflow management
- `work.campaigns.list` / `create` — campaign management

### 9.11 ACL operations

**Port from:** `server-methods/acl-requests.ts` (566)

- `acl.requests.list` / `create` / `approve` / `deny` — access request management

### 9.12 Device operations

**Port from:** `server-methods/devices.ts` (226), `device-host.ts` (288)

- `device.host.register` / `unregister` — device host WS registry
- `device.pair.request` / `approve` / `deny` — pairing flow
- `device.list` — list paired devices

### 9.13 Clock operations

**Port from:** `server-methods/clock-schedule.ts` (227)

- `clock.schedule.create` / `list` / `delete` / `update` — schedule CRUD
- `clock.schedule.run` — trigger schedule manually

### 9.14 Model and usage operations

**Port from:** `server-methods/models.ts` (29), `usage.ts` (1,572)

- `models.list` — list available models
- `usage.summary` — usage statistics
- `usage.sessions` — per-session usage

### 9.15 Auth and credential operations

**Port from:** `server-methods/auth-users.ts` (304), `ingress-credentials.ts` (553)

- `auth.users.list` / `create` / `update` — user management
- `auth.credentials.list` / `create` / `rotate` — ingress credential management

### 9.16 Miscellaneous operations

**Port from:** various
- `logs.tail` — from `server-methods/logs.ts` (180)
- `web.proxy` — from `server-methods/web.ts` (124)
- `skills.list` — from `server-methods/skills.ts` (146)
- `system.info` — from `server-methods/system.ts` (177)
- `wizard.*` — from `server-methods/wizard.ts` (139)
- `update.check` — from `server-methods/update.ts` (131)
- `browser.*` — from `server-methods/browser.ts` (301)

**Acceptance:** All operations from the operation taxonomy are registered and routable. Each returns correct responses. Control UI and CLI can invoke any operation.

---

## Task 10: Control Plane Wiring

**Port from:** `nex/src/nex/control-plane/` (top-level wiring files)

### 10.1 HTTP routing (full)

**Port from:** `http-control-routes.ts`, `http-control-handlers.ts` (340), `http-control-dispatcher.ts`, `http-control-adapter.ts` (206), `http-ingress-adapter.ts` (143), `http-ingress-dispatcher.ts`

Wire all HTTP routes:
- `POST /api/operations` — generic operation dispatch
- `GET /api/events/stream` — SSE event stream
- `POST /api/chat` — chat endpoint
- `/api/adapters/*` — adapter management
- `/app/<id>/*` — app UI serving

### 10.2 WebSocket operations (full)

Wire all operations to the WS handler. Every operation in the taxonomy must be callable via WS.

### 10.3 Auth

**Port from:** `auth.ts` (762 lines), `ingress-auth.ts` (117), `device-auth.ts` (31)

HTTP and WS authentication: token validation, session management, device auth.

### 10.4 Session utilities

**Port from:** `session-utils.ledger.ts` (809 lines), `sessions-patch.ts` (342), `sessions-resolve.ts` (120)

Session lifecycle helpers: create, resolve, patch, list sessions from agents.db.

### 10.5 Server broadcast

**Port from:** `server-broadcast.ts` (118 lines)

Push events to connected WS clients. Agent streaming events, health, status changes.

### 10.6 SSE endpoint

**Port from:** `ws-log.ts` (442 lines)

Server-Sent Events for browser clients. Stream agent responses, status updates.

### 10.7 Config reload

**Port from:** `config-reload.ts` (371 lines)

Hot-reload config file changes. Notify connected clients. Restart affected services.

**Acceptance:** Full HTTP and WS API works. All operations accessible from both surfaces. SSE streaming works. Auth enforced on all endpoints.

---

## Task 11: stdio Transport Surface

### 11.1 Adapter protocol surface

**Port from:** `nex/src/nex/adapters/protocol.ts` (adapter side of stdio)

The stdio surface is how adapter binaries communicate with the runtime. Implement the runtime's side of the JSONL protocol:
- Read adapter stdout (events flowing in)
- Write to adapter stdin (delivery commands flowing out)
- Handle adapter lifecycle (spawn, connect, disconnect)

This connects to Task 1 (Adapter Manager) but is listed separately as a transport surface.

**Acceptance:** Multiple adapters can connect simultaneously via stdio. Events flow in, deliveries flow out.

---

## Done Criteria

Phase 3 is complete when:

1. All adapters connect via stdio JSONL and operate normally
2. Full memory system works: recall (FTS5 + embeddings), retain pipeline, consolidation, file sync
3. IAM evaluates grants in the pipeline's `resolveAccess` stage
4. Hookpoints fire at pipeline boundaries and lifecycle events
5. Multi-agent orchestration works: agent_send → sub-agent → announce result
6. All agent tools from the tool inventory are available and functional
7. Cron service creates/fires/delivers scheduled jobs
8. Apps platform discovers manifests, spawns services, dispatches methods
9. All operations from the taxonomy are registered and callable
10. Full HTTP and WS API works with auth, SSE streaming
11. Config hot-reload works
12. All of the above passes `go test ./...`
