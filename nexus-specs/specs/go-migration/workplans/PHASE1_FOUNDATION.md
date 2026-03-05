# Phase 1: Foundation

**Status:** ACTIVE
**Parent:** [GO_MIGRATION_SPEC.md](../GO_MIGRATION_SPEC.md) § Phase 1
**Target project:** `/Users/tyler/nexus/home/projects/nexus/nexgo/`

---

## Scope

Build the skeleton that everything else plugs into: Go project layout, config loading, SQLite database layer, the 5-stage pipeline, daemon lifecycle, and the HTTP/WS transport surfaces (enough to serve `/health` and accept WebSocket connections).

**Hard rule:** No agent execution in this phase. The pipeline dispatches operations to handlers, but the `event.ingest` handler is a stub that returns "not yet implemented." Agent execution is Phase 2.

---

## Starting State

The nexgo project currently has:
- `cmd/nexus/main.go` — cobra skeleton with stub subcommands (serve, init, status, agent, config, memory, message)
- `go.mod` — `github.com/Napageneral/nexus`, Go 1.24.0, cobra dependency only
- `ui/dist/` — empty directory for embedded Control UI assets

---

## Task 1: Project Layout + Core Types

Create the `internal/` package structure and define the foundational types that everything else depends on.

### 1.1 Create package directories

```
internal/
  config/
  db/
  daemon/
  pipeline/
  operations/
  transport/
    ws/
    http/
    stdio/
  broker/
  agent/
  tools/
  memory/
  iam/
  adapters/
  automations/
  apps/
  media/
  cron/
  security/
```

### 1.2 Define NexusRequest bus type

**Port from:** `nex/src/nex/stages/types.ts`
**Spec:** `NEXUS_REQUEST_TARGET.md`

```go
// internal/pipeline/request.go
type NexusRequest struct {
    ID          string
    Operation   string
    Payload     map[string]any
    Routing     Routing
    Sender      *Entity       // resolved in resolvePrincipals
    Receiver    *Entity       // resolved in resolvePrincipals
    Access      *AccessDecision // set in resolveAccess
    Transport   Transport
    Trace       PipelineTrace
    CreatedAt   time.Time
}

type Routing struct {
    SenderRaw    RawIdentifier
    ReceiverRaw  RawIdentifier
    ContainerID  string
    ChannelID    string
    AdapterID    string
}

type Transport struct {
    Surface   string // "ws", "http", "stdio", "internal"
    AdapterID string
    SessionID string
}
```

### 1.3 Define Entity type

**Port from:** `nex/src/nex/stages/types.ts` (Entity definition)
**Spec:** `NEXUS_REQUEST_TARGET.md` § Entity

```go
// internal/pipeline/entity.go
type Entity struct {
    ID           string
    Name         string
    Type         string
    Normalized   string
    IsUser       bool
    Origin       string
    PersonaPath  string
    Tags         []string
    MergedInto   string
    MentionCount int
    CreatedAt    int64
    UpdatedAt    int64
}
```

### 1.4 Define RuntimeOperationDef

**Port from:** `nex/src/nex/control-plane/runtime-operations.ts`
**Spec:** `OPERATION_TAXONOMY.md`, `ADAPTER_INTERFACE_UNIFICATION.md`

```go
// internal/operations/registry.go
type OperationMode string
const (
    ModeProtocol OperationMode = "protocol"
    ModeControl  OperationMode = "control"
    ModeEvent    OperationMode = "event"
)

type ActionType string
const (
    ActionRead    ActionType = "read"
    ActionWrite   ActionType = "write"
    ActionAdmin   ActionType = "admin"
    ActionApprove ActionType = "approve"
    ActionPair    ActionType = "pair"
)

type OperationDef struct {
    Operation  string
    Mode       OperationMode
    Action     ActionType
    Resource   string
    Handler    OperationHandler
}

type OperationHandler func(ctx context.Context, req *NexusRequest) (any, error)
```

**Acceptance:** Types compile. Operation registry can register and look up operations by name.

---

## Task 2: Configuration

**Port from:** `nex/src/config/schema.ts`, `nex/src/config/io.ts`, `nex/src/config/types.base.ts`
**Spec:** `COMMANDS.md` (config commands)

### 2.1 Define config struct

Map the TS Zod schema to Go structs. Start with the fields needed for Phase 1 (ports, paths, logging). Add remaining fields as later phases need them.

```go
// internal/config/schema.go
type Config struct {
    Runtime   RuntimeConfig   `json:"runtime"`
    Adapters  []AdapterConfig `json:"adapters,omitempty"`
    Memory    MemoryConfig    `json:"memory,omitempty"`
    // ... add fields as phases progress
}

type RuntimeConfig struct {
    Port         int    `json:"port"`
    IngressPort  int    `json:"ingressPort,omitempty"`
    StateDir     string `json:"stateDir"`
    LogLevel     string `json:"logLevel"`
    ControlUI    ControlUIConfig `json:"controlUi,omitempty"`
}
```

### 2.2 Config loader

**Port from:** `nex/src/config/io.ts`

- Load from `state/config.json`
- Validate required fields
- Resolve `stateDir` (default: `~/.nexus/state/` or `NEXUS_STATE_DIR` env)
- Support `--config` and `--state-dir` CLI flags

### 2.3 Config file watcher (stub)

Register `fsnotify` watcher on config file. For Phase 1, just log on change. Hot-reload implementation comes in Phase 3.

**Acceptance:** `nexus serve --config ./test-config.json` loads config and logs it. Invalid config prints validation error and exits.

---

## Task 3: Database Layer

**Port from:** `nex/src/db/ledgers.ts`, `nex/src/db/events.ts`, `nex/src/db/identity.ts`, `nex/src/db/memory.ts`, `nex/src/db/nexus.ts`, `nex/src/db/work.ts`, `nex/src/db/agents.ts`, `nex/src/db/embeddings.ts`
**Spec:** `DATABASE_ARCHITECTURE.md`

### 3.1 Connection manager

```go
// internal/db/conn.go
type Ledgers struct {
    Events     *sql.DB
    Agents     *sql.DB
    Identity   *sql.DB
    Memory     *sql.DB
    Embeddings *sql.DB
    Runtime    *sql.DB
    Work       *sql.DB
}

func OpenLedgers(stateDir string) (*Ledgers, error)
func (l *Ledgers) Close() error
```

- Open all 7 databases under `stateDir/data/`
- Set WAL mode, busy timeout, foreign keys pragmas
- Run schema bootstrap (CREATE TABLE IF NOT EXISTS)

### 3.2 Schema definitions

Port the SQL schemas from each `*_SCHEMA_SQL` constant in the TS `src/db/*.ts` files. These define the CREATE TABLE statements.

**Key schemas:**
- `events.db` — events, attachments, attachment_interpretations, events_fts (FTS5)
- `agents.db` — sessions, turns, messages, tool_calls, compactions, artifacts
- `identity.db` — entities, contacts, entity_tags, entity_persona, entity_links, contact_participants
- `memory.db` — elements, element_entities, element_links, sets, set_members, jobs, processing_log (14 tables per hard cutover)
- `embeddings.db` — embeddings (sqlite-vec)
- `runtime.db` — pipeline_requests, automations, grants, audit_log, adapter_state, import_jobs
- `work.db` — work_items, sequences, workflows, campaigns, dependencies

### 3.3 Basic query helpers

For Phase 1, implement only what the pipeline stages and health check need:
- `InsertPipelineRequest()`
- `ResolveEntityBySenderID()` / `AutoCreateEntity()`
- `ListAdapterState()`

**Acceptance:** `nexus serve` opens all 7 databases, creates tables if missing, and the health endpoint can report DB status.

---

## Task 4: 5-Stage Pipeline

**Port from:** `nex/src/nex/stages/acceptRequest.ts`, `resolvePrincipals.ts`, `resolveAccess.ts`, `executeOperation.ts`, `finalizeRequest.ts`, `index.ts`
**Spec:** `NEXUS_REQUEST_TARGET.md`

### 4.1 Pipeline orchestrator

```go
// internal/pipeline/pipeline.go
type Pipeline struct {
    operations *operations.Registry
    ledgers    *db.Ledgers
    iam        *iam.Engine  // nil in Phase 1, stub allows-all
}

func (p *Pipeline) Execute(ctx context.Context, req *NexusRequest) (*NexusResult, error) {
    if err := p.acceptRequest(ctx, req); err != nil { return nil, err }
    if err := p.resolvePrincipals(ctx, req); err != nil { return nil, err }
    if err := p.resolveAccess(ctx, req); err != nil { return nil, err }
    result, err := p.executeOperation(ctx, req)
    if err != nil { return nil, err }
    p.finalizeRequest(ctx, req, result)
    return result, nil
}
```

### 4.2 Stage implementations

| Stage | Phase 1 Implementation |
|-------|----------------------|
| `acceptRequest` | Assign request ID, validate operation exists in registry, stamp timestamps, deduplicate by request_id |
| `resolvePrincipals` | Resolve sender entity from identity.db contacts table. Auto-create Entity for unknown senders. Resolve receiver (the runtime entity). |
| `resolveAccess` | **Stub: allow all.** Real IAM evaluation is Phase 3. |
| `executeOperation` | Look up handler in operation registry, call it. |
| `finalizeRequest` | Persist pipeline trace to runtime.db. Set final status. |

### 4.3 Operation registry bootstrap

Register the Phase 1 operations:
- `health` — returns runtime health (DB status, adapter status, uptime)
- `connect` — WebSocket handshake (auth stub)
- `config.get` — return current config
- `status` — runtime status summary

**Acceptance:** Can construct a `NexusRequest` in a test, feed it through the pipeline, and get a result from the `health` handler. Pipeline trace persisted to runtime.db.

---

## Task 5: Daemon Lifecycle

**Port from:** `nex/src/daemon/daemon.ts`, `nex/src/macos/runtime-daemon.ts`
**Spec:** `DAEMON.md`

### 5.1 PID lock

- Acquire lockfile at `stateDir/nex.pid`
- Write PID to file
- Fail with error if lock already held

### 5.2 Signal handling

- `SIGTERM` / `SIGINT` → graceful shutdown (close DBs, stop HTTP server, stop adapters)
- `SIGUSR1` → config reload (Phase 1: just log, actual reload in Phase 3)

### 5.3 Startup sequence

```
1. Parse CLI flags
2. Load config
3. Acquire PID lock
4. Initialize logger
5. Open databases (migrate on first run)
6. Initialize event bus (in-memory pub/sub)
7. Initialize pipeline + operation registry
8. Start HTTP server
9. Start WebSocket server
10. Log "nexus ready" with port info
```

### 5.4 Shutdown sequence

```
1. Stop accepting new connections
2. Drain active requests (timeout 5s)
3. Close HTTP/WS servers
4. Close databases
5. Release PID lock
6. Exit
```

**Acceptance:** `nexus serve` starts, acquires lock, logs ready. Second `nexus serve` fails with "already running." `SIGTERM` shuts down cleanly.

---

## Task 6: HTTP Transport Surface

**Port from:** `nex/src/nex/control-plane/boot.ts`, `nex/src/nex/control-plane/http-control-routes.ts`
**Spec:** `NEX_ARCHITECTURE_AND_SDK_MODEL.md` § Transport Layer

### 6.1 HTTP server

```go
// internal/transport/http/server.go
func NewServer(cfg config.RuntimeConfig, pipeline *pipeline.Pipeline) *Server
func (s *Server) ListenAndServe() error
func (s *Server) Shutdown(ctx context.Context) error
```

### 6.2 Routes (Phase 1)

| Method | Path | Handler |
|--------|------|---------|
| `GET` | `/health` | Dispatch `health` operation through pipeline |
| `GET` | `/api/events/stream` | SSE stub (sends heartbeat pings only, real events in Phase 3) |

### 6.3 CORS

Port CORS middleware from `nex/src/nex/control-plane/boot.ts`. Permissive in self-hosted mode (allow all origins). Headers: `authorization, content-type, x-request-id`.

**Acceptance:** `curl localhost:3284/health` returns JSON health response. CORS headers present.

---

## Task 7: WebSocket Transport Surface

**Port from:** `nex/src/nex/control-plane/client.ts`, `nex/src/nex/control-plane/call.ts`
**Spec:** `NEX_ARCHITECTURE_AND_SDK_MODEL.md` § Transport Layer

### 7.1 WebSocket server

- Mount on same port as HTTP (upgrade handler)
- JSON-RPC style messages: `{ id, operation, payload }` → `{ id, result }` or `{ id, error }`
- Connection state: auth status, session ID

### 7.2 Operations (Phase 1)

| Operation | Handler |
|-----------|---------|
| `connect` | Auth stub (accept all in Phase 1, real auth in Phase 3). Return runtime info. |
| `health` | Same as HTTP health |
| `config.get` | Return current config |
| `status` | Runtime status |

### 7.3 Event broadcasting

Implement the server→client push mechanism:
- `connect.challenge` (on connection)
- `health` (periodic broadcast)

**Acceptance:** WebSocket client connects, sends `{ "id": "1", "operation": "health" }`, receives health response. Server broadcasts heartbeat events.

---

## Task 8: Wire It All Together

### 8.1 Update `cmd/nexus/main.go`

Replace stub subcommands with real implementations that use the internal packages:
- `serve` → starts daemon with config, DBs, pipeline, HTTP, WS
- `status` → connects to running daemon via WS, calls `status` operation
- `config get` → connects to daemon, calls `config.get`

### 8.2 CLI daemon connection helper

```go
// internal/cli/connect.go
func ConnectToDaemon(ctx context.Context) (*ws.Client, error)
```

Reads PID file to find running daemon, connects via WebSocket, returns client for sending operations.

### 8.3 `nexus init`

Create state directory structure:
```
state/
  data/          # databases
  config.json    # default config
  nex.pid        # daemon lock (created on serve)
```

**Acceptance:** `nexus init` creates state dir. `nexus serve` boots full stack. `nexus status` connects and prints status. `nexus config get` returns config JSON.

---

## Done Criteria

Phase 1 is complete when:

1. `nexus init` creates the state directory and default config
2. `nexus serve` boots the daemon:
   - Acquires PID lock
   - Opens all 7 SQLite databases with correct schemas
   - Starts HTTP server on configured port
   - Starts WebSocket server on same port
   - Logs "nexus ready"
3. `GET /health` returns JSON with DB status and uptime
4. WebSocket `connect` + `health` + `config.get` operations work
5. Pipeline traces are persisted to runtime.db
6. `SIGTERM` shuts down cleanly (no leaked goroutines, DBs closed, lock released)
7. Second `nexus serve` fails with "already running"
8. `nexus status` and `nexus config get` work against running daemon
9. All of the above passes `go test ./...`
