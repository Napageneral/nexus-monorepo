# Validation Ladder

**Purpose:** Machine-checkable milestones for autonomous agent execution of the Go migration. Each checkpoint has a gate (a command that must exit 0) and a description of what it proves.

**Usage:** An agent working through the workplans MUST run the gate command after completing each checkpoint. If the gate fails, the agent must fix the issue before proceeding.

**Project:** `/Users/tyler/nexus/home/projects/nexus/nexgo/`

---

## How to Use

```bash
# Run a specific checkpoint
make gate-P1.1

# Run all checkpoints for a phase
make gate-phase1

# Run all checkpoints completed so far
make gate-all

# Run tests for a specific package
go test ./internal/pipeline/...

# Run all tests
make test
```

Each gate is defined in the `Makefile` and is a simple pass/fail check.

---

## Phase 1: Foundation

### P1.1 — Project compiles

**After:** Task 1 (Project Layout + Core Types)
**Gate:** `make gate-P1.1`
**Checks:**
- `go build ./...` succeeds
- `go vet ./...` passes
- Core types exist: `NexusRequest`, `Entity`, `OperationDef`, `OperationHandler`
- Operation registry can register and lookup by name

```bash
# Gate implementation
go build ./...
go vet ./...
go test ./internal/pipeline/... -run TestNexusRequestFields
go test ./internal/operations/... -run TestRegistryLookup
```

---

### P1.2 — Config loads

**After:** Task 2 (Configuration)
**Gate:** `make gate-P1.2`
**Checks:**
- Config loads from JSON file
- Config defaults are applied for missing fields
- Invalid config returns validation error
- `--state-dir` flag overrides config

```bash
go test ./internal/config/... -run TestLoad
go test ./internal/config/... -run TestDefaults
go test ./internal/config/... -run TestValidation
```

---

### P1.3 — Databases open

**After:** Task 3 (Database Layer)
**Gate:** `make gate-P1.3`
**Checks:**
- All 7 databases open successfully
- WAL mode is set
- Tables are created on first open
- Can insert and read from each database
- Databases close cleanly

```bash
go test ./internal/db/... -run TestOpenLedgers
go test ./internal/db/... -run TestSchemaBootstrap
go test ./internal/db/... -run TestInsertRead
go test ./internal/db/... -run TestClose
```

---

### P1.4 — Pipeline executes

**After:** Task 4 (5-Stage Pipeline)
**Gate:** `make gate-P1.4`
**Checks:**
- Pipeline executes all 5 stages in order
- `acceptRequest` assigns ID and validates operation
- `resolvePrincipals` resolves/creates Entity
- `resolveAccess` stub allows all
- `executeOperation` dispatches to registered handler
- `finalizeRequest` persists trace to runtime.db
- Unknown operation returns error
- Pipeline trace readable from runtime.db after execution

```bash
go test ./internal/pipeline/... -count=1
```

---

### P1.5 — Daemon starts and stops

**After:** Task 5 (Daemon Lifecycle)
**Gate:** `make gate-P1.5`
**Checks:**
- PID lock acquired on start
- Second start fails with "already running"
- SIGTERM triggers clean shutdown
- Lock released after shutdown
- All DBs closed after shutdown

```bash
go test ./internal/daemon/... -run TestPIDLock
go test ./internal/daemon/... -run TestSignalShutdown
go test ./internal/daemon/... -run TestDoubleStart
```

---

### P1.6 — HTTP health endpoint works

**After:** Task 6 (HTTP Transport)
**Gate:** `make gate-P1.6`
**Checks:**
- HTTP server starts on configured port
- `GET /health` returns 200 with JSON body
- Health response includes `uptime`, `databases`, `status`
- CORS headers present
- Server shuts down cleanly

```bash
go test ./internal/transport/http/... -run TestHealthEndpoint
go test ./internal/transport/http/... -run TestCORS
go test ./internal/transport/http/... -run TestShutdown
```

---

### P1.7 — WebSocket operations work

**After:** Task 7 (WebSocket Transport)
**Gate:** `make gate-P1.7`
**Checks:**
- WS upgrade succeeds
- `connect` operation returns runtime info
- `health` operation returns health data
- `config.get` operation returns config
- Invalid operation returns error
- Multiple concurrent connections work
- Server broadcasts heartbeat

```bash
go test ./internal/transport/ws/... -count=1
```

---

### P1.8 — Full Phase 1 integration

**After:** Task 8 (Wire It All Together)
**Gate:** `make gate-phase1`
**Checks:**
- `go build -o /tmp/nexus-test ./cmd/nexus` succeeds
- Binary runs `version` command
- Binary runs `init` and creates state directory
- Binary runs `serve` and boots full stack (test with timeout)
- HTTP health endpoint works against running binary
- WS connect works against running binary
- Clean shutdown on SIGTERM
- `go test ./... -count=1` all pass
- `go vet ./...` clean

```bash
# Build
go build -o /tmp/nexus-test ./cmd/nexus

# Unit + integration tests
go test ./... -count=1 -timeout 120s

# Vet
go vet ./...

# Binary smoke test (spawn, probe, kill)
/tmp/nexus-test init --state-dir /tmp/nexus-test-state
timeout 10 /tmp/nexus-test serve --state-dir /tmp/nexus-test-state --port 13284 &
SERVE_PID=$!
sleep 2
curl -sf http://localhost:13284/health | jq .status
kill $SERVE_PID
wait $SERVE_PID 2>/dev/null
rm -rf /tmp/nexus-test-state /tmp/nexus-test
```

---

## Phase 2: Agent Execution

### P2.1 — go-coding-agent integrates

**After:** Task 1 (go-coding-agent Integration)
**Gate:** `make gate-P2.1`
**Checks:**
- `go-coding-agent` imported as Go library dependency
- Engine wraps runtime creation
- Can create a session with mock provider
- Tool executor interface implemented for Nexus tools

```bash
go test ./internal/agent/... -run TestEngineCreate
go test ./internal/agent/... -run TestToolRegistration
```

---

### P2.2 — Auth and model selection work

**After:** Tasks 2-3 (Auth Profiles, Model Selection)
**Gate:** `make gate-P2.2`
**Checks:**
- Auth profiles load from config
- Multi-provider credentials stored
- Model catalog populated
- Fallback chain resolves correctly
- Provider for a given model resolved

```bash
go test ./internal/agent/... -run TestAuthProfile
go test ./internal/agent/... -run TestModelSelection
go test ./internal/agent/... -run TestFallbackChain
```

---

### P2.3 — System prompt and skills load

**After:** Tasks 4-5 (System Prompt, Skills)
**Gate:** `make gate-P2.3`
**Checks:**
- System prompt assembled with sections (identity, workspace, memory, skills)
- Skills loaded from directory
- Frontmatter parsed
- Skill eligibility filtering works

```bash
go test ./internal/agent/... -run TestSystemPrompt
go test ./internal/agent/... -run TestSkillLoad
go test ./internal/agent/... -run TestSkillEligibility
```

---

### P2.4 — Core tools execute

**After:** Task 6 (Core Nexus Tools)
**Gate:** `make gate-P2.4`
**Checks:**
- `cortex_recall` tool returns memory results (with mock DB)
- `memory_search` tool returns search results (with mock)
- `web_search` tool executes (with mock HTTP)
- `web_fetch` tool executes (with mock HTTP)
- `exec` tool runs a command in sandbox
- Each tool implements `ToolExecutor` interface

```bash
go test ./internal/tools/... -count=1
```

---

### P2.5 — Broker dispatches agent runs

**After:** Task 7 (Broker)
**Gate:** `make gate-P2.5`
**Checks:**
- Broker receives event, creates session
- Session key resolved from event context
- Agent run dispatched to engine
- Streaming events flow through broker
- Queue accepts followup messages

```bash
go test ./internal/broker/... -count=1
```

---

### P2.6 — event.ingest flows end-to-end

**After:** Task 8 (event.ingest Handler)
**Gate:** `make gate-P2.6`
**Checks:**
- `event.ingest` operation registered
- Pipeline dispatches to broker
- Broker creates session and runs agent (with mock LLM)
- Agent response persisted to agents.db
- Event persisted to events.db

```bash
go test ./internal/operations/... -run TestEventIngest
```

---

### P2.7 — Interactive chat works

**After:** Task 9 (Interactive Chat CLI)
**Gate:** `make gate-P2.7`
**Checks:**
- `nexus chat` command exists and parses flags
- Chat sends `event.ingest` to daemon
- Streaming tokens display (test with mock)
- `/exit` terminates session

```bash
go test ./internal/cli/... -run TestChatCommand
```

---

### P2.8 — Full Phase 2 integration

**After:** All Phase 2 tasks
**Gate:** `make gate-phase2`
**Checks:**
- All Phase 1 gates still pass
- All Phase 2 unit tests pass
- Integration test: spawn daemon → send event.ingest via WS → receive agent response → verify DB writes
- `go test ./... -count=1 -timeout 180s` all pass

```bash
go test ./... -count=1 -timeout 180s
go vet ./...
```

---

## Phase 3: Full Operations

### P3.1 — Adapters connect

**After:** Task 1 (Adapter Lifecycle Manager)
**Gate:** `make gate-P3.1`
**Checks:**
- Adapter manager spawns a mock adapter binary
- stdio JSONL protocol encodes/decodes correctly
- `info` verb returns adapter identity
- `monitor` verb starts event stream
- `send` verb delivers message
- `health` verb returns status
- Supervision restarts crashed adapter
- Multiple adapters run simultaneously

```bash
go test ./internal/adapters/... -count=1
```

---

### P3.2 — Memory system works

**After:** Task 2 (Full Memory System)
**Gate:** `make gate-P3.2`
**Checks:**
- Recall returns FTS5 results
- Recall returns embedding results (with mock embeddings)
- Retain pipeline processes a turn and extracts facts
- Elements written to memory.db
- Entity-element links created
- Consolidation merges duplicates
- Memory file sync loads .qmd files
- Search manager merges FTS5 + embedding results

```bash
go test ./internal/memory/... -count=1
```

---

### P3.3 — IAM evaluates access

**After:** Task 3 (IAM)
**Gate:** `make gate-P3.3`
**Checks:**
- Grant CRUD works (create, revoke, list)
- Policy evaluation: allow, deny, conditions
- Pipeline `resolveAccess` stage uses real IAM (no more stub)
- Denied operation returns 403 equivalent
- Audit log written for every access decision
- Tool policies filter agent tools

```bash
go test ./internal/iam/... -count=1
go test ./internal/pipeline/... -run TestResolveAccessReal
```

---

### P3.4 — Automations fire

**After:** Task 4 (Automations / Hookpoints)
**Gate:** `make gate-P3.4`
**Checks:**
- Hookpoints fire at pipeline stage boundaries
- Bundled automations registered on boot
- Memory retain triggers after agent turns
- Automation CRUD works (create, enable, disable)

```bash
go test ./internal/automations/... -count=1
```

---

### P3.5 — Multi-agent orchestration works

**After:** Task 5 (Multi-Agent MA/WA)
**Gate:** `make gate-P3.5`
**Checks:**
- `agent_send` dispatches to sub-agent
- Sub-agent registry tracks active sub-agents
- Sub-agent result announced to parent
- Queue handles steer/followup/collect/interrupt modes

```bash
go test ./internal/broker/... -run TestMultiAgent
go test ./internal/tools/... -run TestMWPTools
```

---

### P3.6 — All tools work

**After:** Task 6 (Remaining Agent Tools)
**Gate:** `make gate-P3.6`
**Checks:**
- message tool sends via delivery
- browser tool calls mock HTTP server
- nodes tool returns mock device data
- cron tool creates schedule
- sessions tools list/inspect sessions
- runtime tool returns status
- canvas tool returns structured content
- Each tool returns valid ToolResult

```bash
go test ./internal/tools/... -count=1
```

---

### P3.7 — Cron fires jobs

**After:** Task 7 (Cron / Clock)
**Gate:** `make gate-P3.7`
**Checks:**
- Schedule CRUD works
- Timer fires due jobs
- Job execution dispatches to pipeline
- Cron expression parsing works
- Schedule normalization works

```bash
go test ./internal/cron/... -count=1
```

---

### P3.8 — Apps platform works

**After:** Task 8 (Apps Platform)
**Gate:** `make gate-P3.8`
**Checks:**
- Manifest parsing works
- Discovery finds manifests in directory
- App registry tracks lifecycle
- Service manager spawns mock service
- Method dispatch routes to service
- Management API (apps.list, etc.) works

```bash
go test ./internal/apps/... -count=1
```

---

### P3.9 — All operations registered

**After:** Task 9 (All Operation Handlers)
**Gate:** `make gate-P3.9`
**Checks:**
- Every operation from the taxonomy is registered in the registry
- Each handler is callable (at minimum, returns a result or structured error)
- Operation count matches expected taxonomy size

```bash
go test ./internal/operations/... -run TestAllOperationsRegistered
go test ./internal/operations/... -count=1
```

---

### P3.10 — Full Phase 3 integration

**After:** All Phase 3 tasks
**Gate:** `make gate-phase3`
**Checks:**
- All Phase 1 + 2 gates still pass
- All Phase 3 unit tests pass
- Integration: adapter connects → event flows → agent responds → delivery goes back
- Integration: multi-agent flow completes
- Integration: cron fires → agent runs → memory persists
- `go test ./... -count=1 -timeout 300s` all pass

```bash
go test ./... -count=1 -timeout 300s
go vet ./...
```

---

## Phase 4: CLI + Polish

### P4.1 — All CLI commands parse

**After:** Task 1 (CLI Framework)
**Gate:** `make gate-P4.1`
**Checks:**
- Every command in the tree accepts `--help` without error
- No duplicate command registrations
- Flag parsing works for each command

```bash
go build -o /tmp/nexus-test ./cmd/nexus
# Test every top-level command's --help
for cmd in version serve init setup status health doctor config agents sessions memory adapters clock models credential security chat reset uninstall dashboard docs; do
  /tmp/nexus-test $cmd --help || exit 1
done
rm /tmp/nexus-test
```

---

### P4.2 — Daemon lifecycle commands work

**After:** Task 2 (Daemon Commands)
**Gate:** `make gate-P4.2`
**Checks:**
- `nexus daemon start` starts background process
- `nexus daemon stop` stops it
- `nexus daemon restart` cycles it
- Service install writes plist/unit file

```bash
go test ./internal/cli/... -run TestDaemon
```

---

### P4.3 — Status/Health/Doctor produce output

**After:** Task 3 (Status + Health + Doctor)
**Gate:** `make gate-P4.3`
**Checks:**
- Status output includes all subsystems
- Health output has pass/fail for each check
- Doctor runs all diagnostic checks
- Terminal formatting renders tables correctly

```bash
go test ./internal/cli/... -run TestStatus
go test ./internal/cli/... -run TestHealth
go test ./internal/cli/... -run TestDoctor
```

---

### P4.4 — Media processing works

**After:** Task 12 (Media System)
**Gate:** `make gate-P4.4`
**Checks:**
- Media download from URL works (mock HTTP)
- Media store saves file to disk
- Media serve returns correct MIME type
- MIME detection works
- Media understanding processes image (mock LLM provider)

```bash
go test ./internal/media/... -count=1
```

---

### P4.5 — Security audit works

**After:** Task 13 (Security Audit)
**Gate:** `make gate-P4.5`
**Checks:**
- Audit checks file permissions
- Audit checks config security
- Audit produces structured report
- Fix auto-remediates permission issues
- Skill scanner detects test patterns

```bash
go test ./internal/security/... -count=1
```

---

### P4.6 — Onboarding wizard completes

**After:** Task 11 (Onboarding Wizard)
**Gate:** `make gate-P4.6`
**Checks:**
- Wizard creates state directory
- Non-interactive mode works with flags
- Config generated with correct values

```bash
go test ./internal/cli/... -run TestWizard
```

---

### P4.7 — Full Phase 4 integration

**After:** All Phase 4 tasks
**Gate:** `make gate-phase4`
**Checks:**
- All previous phase gates still pass
- All Phase 4 unit tests pass
- Binary smoke test: init → setup (non-interactive) → serve → health → chat → stop
- All CLI commands produce valid output against running daemon
- `go test ./... -count=1 -timeout 300s` all pass

```bash
go test ./... -count=1 -timeout 300s
go vet ./...
```

---

## Phase 5: Validation + Distribution

### P5.1 — Database compatibility verified

**After:** Task 2 (Cross-Database Compatibility)
**Gate:** `make gate-P5.1`
**Checks:**
- Go binary reads databases created by TS (use fixture databases)
- Schema comparison passes (same tables, columns, indexes)
- Data round-trip: write with Go → read with Go → identical

```bash
go test ./internal/db/... -run TestSchemaCompat
go test ./internal/db/... -run TestDataRoundTrip
```

---

### P5.2 — Adapter protocol compatible

**After:** Task 3 (Adapter Compatibility)
**Gate:** `make gate-P5.2`
**Checks:**
- JSONL frames encode identically to TS
- All 7 verbs parse correctly
- Mock adapter binary works with Go runtime

```bash
go test ./internal/adapters/... -run TestProtocolCompat
```

---

### P5.3 — Performance targets met

**After:** Task 4 (Performance Benchmarks)
**Gate:** `make gate-P5.3`
**Checks:**
- Startup < 500ms
- Idle RSS < 50MB
- Pipeline throughput > 10K ops/sec
- Agent overhead < 50ms per turn

```bash
go test -bench=. -benchmem ./internal/pipeline/...
go test -bench=. -benchmem ./internal/agent/...
go test -bench=. -benchmem ./internal/db/...
# Startup time
time /tmp/nexus-test serve --state-dir /tmp/bench-state &
# (measure time to "nexus ready" log)
```

---

### P5.4 — Binary builds for all platforms

**After:** Task 6 (Cross-Platform Builds)
**Gate:** `make gate-P5.4`
**Checks:**
- `make build-darwin-arm64` succeeds
- `make build-darwin-amd64` succeeds
- `make build-linux-amd64` succeeds
- Each binary runs `--version`

```bash
make build-all
file dist/nexus-*
```

---

### P5.5 — Full validation

**After:** All Phase 5 tasks
**Gate:** `make gate-phase5`
**Checks:**
- All test suites pass
- All benchmarks meet targets
- All platform builds succeed
- Binary size < 30MB
- Full system smoke test passes

```bash
go test ./... -count=1 -timeout 600s
go vet ./...
make build-all
make smoke-test
```

---

## Gate Summary

| Gate | Phase | Proves |
|------|-------|--------|
| `P1.1` | 1 | Types compile, registry works |
| `P1.2` | 1 | Config loads and validates |
| `P1.3` | 1 | All 7 DBs open with schemas |
| `P1.4` | 1 | 5-stage pipeline executes |
| `P1.5` | 1 | Daemon starts/stops cleanly |
| `P1.6` | 1 | HTTP /health works |
| `P1.7` | 1 | WS operations work |
| `P1.8` | 1 | Full Phase 1 integration |
| `P2.1` | 2 | go-coding-agent integrates |
| `P2.2` | 2 | Auth + model selection |
| `P2.3` | 2 | System prompt + skills |
| `P2.4` | 2 | Core tools execute |
| `P2.5` | 2 | Broker dispatches |
| `P2.6` | 2 | event.ingest end-to-end |
| `P2.7` | 2 | Chat CLI works |
| `P2.8` | 2 | Full Phase 2 integration |
| `P3.1` | 3 | Adapters connect |
| `P3.2` | 3 | Memory system works |
| `P3.3` | 3 | IAM evaluates |
| `P3.4` | 3 | Automations fire |
| `P3.5` | 3 | Multi-agent works |
| `P3.6` | 3 | All tools work |
| `P3.7` | 3 | Cron fires |
| `P3.8` | 3 | Apps platform works |
| `P3.9` | 3 | All operations registered |
| `P3.10` | 3 | Full Phase 3 integration |
| `P4.1` | 4 | CLI commands parse |
| `P4.2` | 4 | Daemon commands |
| `P4.3` | 4 | Status/Health/Doctor |
| `P4.4` | 4 | Media processing |
| `P4.5` | 4 | Security audit |
| `P4.6` | 4 | Onboarding wizard |
| `P4.7` | 4 | Full Phase 4 integration |
| `P5.1` | 5 | DB compatibility |
| `P5.2` | 5 | Adapter protocol compat |
| `P5.3` | 5 | Performance targets |
| `P5.4` | 5 | Cross-platform builds |
| `P5.5` | 5 | Full validation |

---

## Agent Execution Protocol

When an autonomous agent is executing this workplan:

1. **Before starting a task:** Read the workplan task description
2. **After completing a task:** Run the corresponding gate
3. **If gate fails:** Fix the issue, do NOT proceed to next task
4. **After completing a phase:** Run the full phase gate (`gate-phaseN`)
5. **If full phase gate fails:** Fix regressions before starting next phase
6. **Periodically:** Run `go vet ./...` and `go test ./... -count=1` to catch drift
7. **On any compilation error:** Fix immediately, do not accumulate tech debt

### Recovery Protocol

If stuck on a gate for more than 3 attempts:
1. Read the relevant TS source file listed in the workplan's "Port from:" section
2. Read the relevant spec file for architectural guidance
3. Check if a dependency is missing from go.mod
4. Check if a type or interface changed in a previously-completed package
5. If truly blocked, leave a `// TODO(blocked): reason` comment and proceed, noting the skip

### Commit Protocol

Commit after each gate passes:
```
git add -A
git commit -m "gate P1.3: databases open with schemas

- Implemented OpenLedgers(), Close()
- All 7 SQLite databases with WAL mode
- Schema bootstrap for events, agents, identity, memory, embeddings, runtime, work
- Tests: TestOpenLedgers, TestSchemaBootstrap, TestInsertRead, TestClose"
```
