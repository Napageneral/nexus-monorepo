# Go Migration Conventions

**Purpose:** Coding patterns, dependency choices, and architectural rules for the nexgo port. An autonomous agent MUST follow these conventions to produce consistent, idiomatic Go code.

---

## 1. Project Layout

```
nexgo/
├── cmd/nexus/main.go          # entrypoint only — create cobra, call internal/
├── internal/                   # all business logic (unexported outside module)
│   ├── pipeline/               # NexusRequest bus + 5 stages
│   ├── operations/             # operation registry + handlers
│   ├── broker/                 # agent session routing
│   ├── agent/                  # go-coding-agent wrapper
│   ├── tools/                  # Nexus-specific agent tools
│   ├── memory/                 # memory recall/retain/embeddings
│   ├── db/                     # 7 SQLite databases
│   ├── iam/                    # grants, policies, audit
│   ├── config/                 # config loading + schema
│   ├── daemon/                 # PID lock, signal handling
│   ├── transport/
│   │   ├── http/               # HTTP server
│   │   ├── ws/                 # WebSocket server
│   │   └── stdio/              # adapter protocol
│   ├── adapters/               # adapter lifecycle manager
│   ├── automations/            # hookpoint system
│   ├── apps/                   # app platform
│   ├── cron/                   # clock/scheduler
│   ├── media/                  # media store + understanding
│   ├── security/               # security audit
│   ├── cli/                    # cobra command implementations
│   └── testutil/               # shared test infrastructure
├── ui/dist/                    # go:embed Control UI assets
├── Makefile
├── go.mod
└── go.sum
```

**Rules:**
- ALL business logic goes in `internal/`. Nothing is exported outside the module.
- `cmd/nexus/main.go` only creates the cobra root command and calls into `internal/cli/`.
- Package names are singular nouns: `pipeline`, `broker`, `agent` (not `pipelines`, `brokers`).
- No `pkg/` directory. This is a single binary, not a library.

---

## 2. Dependencies

### 2.1 Required Dependencies

| Import | Purpose | go get |
|--------|---------|--------|
| `github.com/spf13/cobra` | CLI framework | already in go.mod |
| `github.com/mattn/go-sqlite3` | SQLite driver (CGo) | `go get github.com/mattn/go-sqlite3` |
| `github.com/gorilla/websocket` | WebSocket server | `go get github.com/gorilla/websocket` |
| `github.com/fsnotify/fsnotify` | Config file watcher | `go get github.com/fsnotify/fsnotify` |
| `github.com/badlogic/pi-mono/go-coding-agent` | Agent runtime library | local replace in go.mod |

### 2.2 go-coding-agent as Local Dependency

The go-coding-agent is not published to a Go module proxy. Use a `replace` directive:

```go
// go.mod
require github.com/badlogic/pi-mono/go-coding-agent v0.0.0

replace github.com/badlogic/pi-mono/go-coding-agent => ../../pi-mono/go-coding-agent
```

The relative path resolves because the repo layout is:
```
/Users/tyler/nexus/home/projects/nexus/nexgo/       ← nexgo
/Users/tyler/nexus/home/projects/pi-mono/go-coding-agent/  ← go-coding-agent
```

So the replace path is `../../../pi-mono/go-coding-agent`.

### 2.3 Prefer stdlib

Use the Go standard library wherever possible:
- `net/http` for HTTP server (no chi, no gin, no echo)
- `encoding/json` for JSON (no jsoniter, no easyjson)
- `context` for request scoping (replaces AsyncLocalStorage)
- `os/exec` for process management
- `database/sql` for SQLite access
- `log/slog` for structured logging
- `testing` for tests (no testify, no gomega)
- `embed` for static assets

### 2.4 Do NOT use

| Package | Reason |
|---------|--------|
| `testify` | Use stdlib `testing` with simple helper functions |
| `gin` / `chi` / `echo` | Use `net/http` stdlib mux |
| `gorm` / `sqlx` | Use `database/sql` directly |
| `logrus` / `zap` | Use `log/slog` |
| `viper` | Use custom config loader |
| `wire` / `fx` | Use explicit dependency injection |

---

## 3. Coding Patterns

### 3.1 Error handling

```go
// DO: wrap errors with context
if err := db.Open(path); err != nil {
    return fmt.Errorf("open events.db: %w", err)
}

// DO: define sentinel errors for known failure modes
var ErrAlreadyRunning = errors.New("daemon: already running")
var ErrOperationNotFound = errors.New("pipeline: operation not found")

// DO NOT: panic on recoverable errors
// DO NOT: ignore errors with _
// DO NOT: return raw errors without context
```

### 3.2 Context propagation

```go
// DO: thread context through all calls
func (p *Pipeline) Execute(ctx context.Context, req *NexusRequest) (*NexusResult, error)

// DO: use context for cancellation and timeouts
ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
defer cancel()

// DO: store request-scoped data in context (sparingly)
type contextKey string
const requestIDKey contextKey = "request_id"
```

### 3.3 Concurrency

```go
// DO: use sync.RWMutex for shared state
type Registry struct {
    ops map[string]*OperationDef
    mu  sync.RWMutex
}

// DO: use channels for event broadcasting
type EventBus struct {
    subscribers map[string]chan Event
    mu          sync.RWMutex
}

// DO: use errgroup for concurrent operations
g, ctx := errgroup.WithContext(ctx)
g.Go(func() error { return startHTTP(ctx) })
g.Go(func() error { return startWS(ctx) })
if err := g.Wait(); err != nil { ... }

// DO NOT: use global variables for shared state
// DO NOT: use sync.Map (use typed maps with mutex)
```

### 3.4 Dependency injection (explicit)

```go
// DO: pass dependencies as constructor arguments
func NewPipeline(ops *operations.Registry, ledgers *db.Ledgers, iam *iam.Engine) *Pipeline

// DO: use interfaces for testability
type EntityResolver interface {
    Resolve(ctx context.Context, raw RawIdentifier) (*Entity, error)
}

// DO NOT: use global singletons
// DO NOT: use dependency injection frameworks
```

### 3.5 Testing

```go
// DO: use table-driven tests
func TestResolveEntity(t *testing.T) {
    tests := []struct {
        name    string
        input   RawIdentifier
        want    *Entity
        wantErr bool
    }{
        {name: "known contact", input: RawIdentifier{...}, want: &Entity{...}},
        {name: "unknown auto-create", input: RawIdentifier{...}, want: &Entity{...}},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := resolver.Resolve(ctx, tt.input)
            if (err != nil) != tt.wantErr {
                t.Fatalf("error = %v, wantErr = %v", err, tt.wantErr)
            }
            if !reflect.DeepEqual(got, tt.want) {
                t.Errorf("got %+v, want %+v", got, tt.want)
            }
        })
    }
}

// DO: use t.TempDir() for file system tests
// DO: use in-memory SQLite (":memory:") for DB tests
// DO: write _test.go files next to source files
// DO: name test functions TestXxx matching the function they test

// DO NOT: use testify assertions
// DO NOT: use mock generation frameworks
// Write mock implementations manually as simple structs
```

### 3.6 Database access

```go
// DO: use database/sql with mattn/go-sqlite3
import _ "github.com/mattn/go-sqlite3"

db, err := sql.Open("sqlite3", filepath.Join(dir, "events.db"))

// DO: set pragmas immediately after opening
for _, pragma := range []string{
    "PRAGMA journal_mode = WAL",
    "PRAGMA synchronous = NORMAL",
    "PRAGMA foreign_keys = ON",
    "PRAGMA busy_timeout = 5000",
} {
    if _, err := db.Exec(pragma); err != nil {
        return fmt.Errorf("pragma %s: %w", pragma, err)
    }
}

// DO: use prepared statements for repeated queries
stmt, err := db.PrepareContext(ctx, "SELECT id, name FROM entities WHERE normalized = ?")

// DO: use transactions for multi-table writes
tx, err := db.BeginTx(ctx, nil)
defer tx.Rollback()
// ... writes ...
return tx.Commit()

// DO NOT: use an ORM
// DO NOT: use string concatenation for SQL (use ? placeholders)
```

### 3.7 HTTP handlers

```go
// DO: use net/http stdlib
mux := http.NewServeMux()
mux.HandleFunc("GET /health", s.handleHealth)
mux.HandleFunc("POST /api/operations", s.handleOperation)

// DO: use slog for request logging
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
    slog.Info("health check", "remote", r.RemoteAddr)
    // ...
}

// DO: return JSON with helper
func writeJSON(w http.ResponseWriter, status int, v any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(v)
}
```

### 3.8 WebSocket messages

```go
// DO: use gorilla/websocket
// DO: JSON-RPC style messages
type WSMessage struct {
    ID        string `json:"id"`
    Operation string `json:"operation,omitempty"`
    Payload   any    `json:"payload,omitempty"`
    Result    any    `json:"result,omitempty"`
    Error     *WSError `json:"error,omitempty"`
}

type WSError struct {
    Code    string `json:"code"`
    Message string `json:"message"`
}
```

### 3.9 Logging

```go
// DO: use log/slog throughout
import "log/slog"

slog.Info("nexus ready", "port", cfg.Runtime.Port, "databases", 7)
slog.Error("pipeline failed", "operation", req.Operation, "error", err)
slog.Debug("stage complete", "stage", "resolvePrincipals", "entity", entity.ID)

// DO: create child loggers for subsystems
logger := slog.Default().With("component", "broker")
logger.Info("session created", "key", sessionKey)

// DO NOT: use fmt.Println for operational logging
// DO NOT: use log.Fatal (it calls os.Exit, skipping deferred cleanup)
```

---

## 4. Type Mapping (TS → Go)

| TypeScript | Go |
|------------|-----|
| `string` | `string` |
| `number` (int) | `int64` |
| `number` (float) | `float64` |
| `boolean` | `bool` |
| `Date` / `number` (epoch ms) | `int64` (epoch ms) or `time.Time` |
| `null \| T` | `*T` (pointer) |
| `T \| undefined` | omit field or `*T` |
| `Record<string, T>` | `map[string]T` |
| `T[]` | `[]T` |
| `interface` | `interface` with methods |
| `type` (discriminated union) | interface + concrete types |
| `enum` | `type X string` + `const (...)` |
| `Map<K, V>` | `map[K]V` |
| `Set<T>` | `map[T]struct{}` |
| `Promise<T>` | `(T, error)` return |
| `async function` | regular function (Go is sync-by-default) |
| `AsyncLocalStorage` | `context.Context` |
| `EventEmitter` | channels or callback functions |
| `Zod schema` | Go struct with json tags |
| `TypeBox schema` | Go struct with json tags |

---

## 5. File Naming

```
internal/pipeline/
  pipeline.go          # main Pipeline type + Execute
  pipeline_test.go     # tests for pipeline.go
  request.go           # NexusRequest type
  request_test.go      # tests for request.go
  accept.go            # acceptRequest stage
  principals.go        # resolvePrincipals stage
  access.go            # resolveAccess stage
  execute.go           # executeOperation stage
  finalize.go          # finalizeRequest stage
  entity.go            # Entity type
```

**Rules:**
- One primary type per file (file named after the type, lowercase)
- Test files are `*_test.go` next to source
- No `I` prefix for interfaces (use descriptive names: `EntityResolver`, not `IEntityResolver`)
- Acronyms are all-caps in Go names: `ID`, `HTTP`, `WS`, `URL`, `DB`, `SQL`, `IAM`, `FTS`

---

## 6. Operation Handler Pattern

Every operation handler follows the same signature and registration pattern:

```go
// internal/operations/health.go
package operations

import (
    "context"
    "github.com/Napageneral/nexus/internal/pipeline"
)

func RegisterHealthOps(r *Registry, deps *Dependencies) {
    r.Register(OperationDef{
        Operation: "health",
        Mode:      ModeControl,
        Action:    ActionRead,
        Resource:  "system",
        Handler:   handleHealth(deps),
    })
}

func handleHealth(deps *Dependencies) pipeline.OperationHandler {
    return func(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
        return map[string]any{
            "status":    "ok",
            "uptime":    deps.Uptime(),
            "databases": deps.Ledgers.Status(),
        }, nil
    }
}
```

The `Dependencies` struct provides access to all subsystems:

```go
// internal/operations/deps.go
type Dependencies struct {
    Ledgers    *db.Ledgers
    Config     *config.Config
    Broker     *broker.Broker
    Adapters   *adapters.Manager
    Memory     *memory.Manager
    IAM        *iam.Engine
    Cron       *cron.Service
    Apps       *apps.Registry
    StartTime  time.Time
}

func (d *Dependencies) Uptime() time.Duration {
    return time.Since(d.StartTime)
}
```

---

## 7. Tool Implementation Pattern

Every Nexus agent tool implements the go-coding-agent `ToolExecutor` interface:

```go
// internal/tools/web_search.go
package tools

import (
    "context"
    "encoding/json"
    agenttools "github.com/badlogic/pi-mono/go-coding-agent/pkg/tools"
    "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"
)

type WebSearchTool struct {
    // dependencies injected at creation
}

func NewWebSearchTool(/* deps */) *WebSearchTool {
    return &WebSearchTool{/* ... */}
}

func (t *WebSearchTool) Definition() types.Tool {
    return types.Tool{
        Name:        "web_search",
        Label:       "Web Search",
        Description: "Search the web for information",
        Parameters: map[string]any{
            "type": "object",
            "properties": map[string]any{
                "query": map[string]any{
                    "type":        "string",
                    "description": "Search query",
                },
            },
            "required": []string{"query"},
        },
    }
}

func (t *WebSearchTool) Execute(ctx context.Context, toolCallID string, args json.RawMessage) (types.ToolResult, error) {
    var params struct {
        Query string `json:"query"`
    }
    if err := json.Unmarshal(args, &params); err != nil {
        return types.ToolResult{}, fmt.Errorf("parse args: %w", err)
    }

    // ... implementation ...

    return types.ToolResult{
        Content: resultText,
    }, nil
}
```

---

## 8. TS Source Reference

When porting a TS file, always:

1. **Read the TS source first** — the file path is in the workplan's "Port from:" field
2. **Extract the behavior, not the syntax** — don't transliterate TypeScript line-by-line
3. **Check for tests** — if `foo.test.ts` exists alongside `foo.ts`, read it for expected behavior
4. **Check the spec** — if the workplan references a spec, read it for the architectural intent

TS source lives at: `/Users/tyler/nexus/home/projects/nexus/nex/src/`
Specs live at: `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/`

---

## 9. Commit Messages

Follow this format:

```
gate P1.3: databases open with schemas

- Implemented OpenLedgers(), Close()
- All 7 SQLite databases with WAL mode
- Schema bootstrap for events, agents, identity, memory, embeddings, runtime, work
- Tests: TestOpenLedgers, TestSchemaBootstrap, TestInsertRead, TestClose
```

Format: `gate <ID>: <what it proves>`

Always commit after each gate passes. Never commit with failing tests.

---

## 10. When Stuck

If a task is unclear or blocked:

1. **Read the TS source** — path in workplan "Port from:"
2. **Read the spec** — path in workplan header or GO_MIGRATION_SPEC.md references
3. **Read existing Go code** — look at go-coding-agent for patterns (types, tools, providers)
4. **Check the schema** — look at CREATE TABLE in the corresponding `src/db/*.ts` file
5. **Leave a TODO** — `// TODO(blocked): reason` and move to next task
6. **Never guess at wire formats** — adapter protocol, WS message format, DB schema must match TS exactly
