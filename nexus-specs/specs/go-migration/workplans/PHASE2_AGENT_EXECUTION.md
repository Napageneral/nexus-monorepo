# Phase 2: Agent Execution

**Status:** PENDING (depends on Phase 1)
**Parent:** [GO_MIGRATION_SPEC.md](../GO_MIGRATION_SPEC.md) § Phase 2
**Target project:** `/Users/tyler/nexus/home/projects/nexus/nexgo/`

---

## Scope

Wire go-coding-agent into the pipeline so that an inbound event triggers an agent run with Nexus-specific tools. By the end of this phase, you can send a message via the adapter protocol and get an intelligent agent response that can use memory, web search, and other Nexus tools.

**Does NOT include:** Multi-agent orchestration (MA/WA), sub-agent dispatch, full tool coverage. Those are Phase 3.

---

## Prerequisite

Phase 1 complete: pipeline running, databases open, HTTP/WS transport serving, config loading.

---

## Task 1: go-coding-agent Integration

**Port from:** `nex/src/agents/pi-embedded-runner/run.ts`, `run/attempt.ts`
**Library:** `github.com/badlogic/pi-mono/go-coding-agent`

### 1.1 Add go-coding-agent dependency

```bash
cd nexgo && go get github.com/badlogic/pi-mono/go-coding-agent
```

Or if local: use `replace` directive in `go.mod` pointing to `../../pi-mono/go-coding-agent`.

### 1.2 Agent engine wrapper

```go
// internal/agent/engine.go
type Engine struct {
    ledgers    *db.Ledgers
    config     *config.Config
    authMgr    *AuthManager
    modelMgr   *ModelManager
    skillsMgr  *SkillsManager
}

type RunRequest struct {
    SessionKey  string
    Prompt      string
    Attachments []Attachment
    Model       string
    Provider    string
    APIKey      string
    AgentID     string
    SystemPrompt string
    Tools       []types.ToolExecutor
    OnStream    func(event agent.RuntimeEvent)
}

type RunResult struct {
    Response   string
    ToolCalls  []ToolCallRecord
    TokensUsed TokenUsage
    Aborted    bool
}

func (e *Engine) Run(ctx context.Context, req RunRequest) (*RunResult, error)
```

The `Run` method:
1. Resolves model + API key (from auth profiles or config)
2. Builds system prompt (Nexus-specific sections)
3. Assembles tool registry (go-coding-agent builtins + Nexus tools)
4. Creates `agent.NewRuntime()` with the resolved config
5. Calls `runtime.Run()` with the prompt
6. Translates result back to `RunResult`

### 1.3 Session persistence

go-coding-agent has its own `session.Manager`. Bridge it to write to agents.db:
- Map go-coding-agent sessions → agents.db `sessions` table
- Map turns → `turns` table
- Map messages → `messages` table
- Map tool calls → `tool_calls` table

**Port from:** `nex/src/db/agents.ts` (session/turn/message insert functions)

### 1.4 Streaming bridge

go-coding-agent fires `RuntimeEvent`s. Translate these into Nexus streaming events that get broadcast to WS clients:

```go
// internal/agent/streaming.go
func (e *Engine) translateEvent(event agent.RuntimeEvent) NexusStreamEvent {
    // Map go-coding-agent events to Nexus "agent" and "chat" WS broadcast events
}
```

**Acceptance:** Can call `engine.Run()` in a test with a prompt, get a response from Claude/OpenAI. Session persisted to agents.db.

---

## Task 2: Auth Profiles

**Port from:** `nex/src/agents/auth-profiles/store.ts`, `order.ts`, `usage.ts`, `oauth.ts`

### 2.1 Auth profile store

```go
// internal/agent/auth.go
type AuthManager struct {
    storePath string
    mu        sync.Mutex
}

type AuthProfile struct {
    ID         string
    Provider   string
    Type       string  // "api_key", "token", "oauth", "external_cli"
    Credential string
    BaseURL    string
    Usage      ProfileUsage
}

type ProfileUsage struct {
    LastUsed    time.Time
    LastGood    time.Time
    ErrorCount  int
    CooldownUntil time.Time
}
```

### 2.2 Profile ordering + rotation

**Port from:** `nex/src/agents/auth-profiles/order.ts`

Resolve which profiles to try for a given provider:
- Round-robin among profiles with same provider
- Skip profiles in cooldown
- Prioritize last-good profile
- Exponential backoff on failures

### 2.3 External CLI credential sync

**Port from:** `nex/src/agents/cli-credentials.ts`

Read credentials from Claude Code, Codex, Qwen CLI config files.

**Acceptance:** Auth manager loads profiles from disk, returns ordered credential list for a provider, tracks usage/failures, syncs from external CLIs.

---

## Task 3: Model Selection

**Port from:** `nex/src/agents/model-selection.ts`, `model-catalog.ts`, `model-auth.ts`

### 3.1 Model catalog

```go
// internal/agent/models.go
type ModelManager struct {
    catalog  []ModelEntry
    config   *config.Config
    authMgr  *AuthManager
}

type ModelEntry struct {
    ID            string
    Provider      string
    API           string
    BaseURL       string
    ContextWindow int
    Reasoning     bool
    Aliases       []string
}
```

### 3.2 Model resolution

Given a model name/alias, resolve to a concrete `types.Model` with API key:
1. Check config overrides
2. Match against catalog (exact, then alias)
3. Resolve API key via auth manager
4. Return fully resolved model + key

**Acceptance:** `modelMgr.Resolve("claude-sonnet-4-5")` returns a Model with provider=anthropic, API key from auth profile.

---

## Task 4: System Prompt

**Port from:** `nex/src/agents/system-prompt.ts`

### 4.1 Prompt builder

```go
// internal/agent/prompt.go
func BuildSystemPrompt(ctx PromptContext) string

type PromptContext struct {
    AgentIdentity  AgentIdentity  // name, personality
    Skills         []Skill        // loaded skill content
    MemoryContext  string         // injected memory summary
    UserIdentity   string         // sender entity info
    DateTime       string         // timezone-aware
    WorkspaceNotes string         // workspace NOTES.md
    SandboxInfo    string         // sandbox status if applicable
    ToolSummary    string         // available tools description
}
```

Assembles sections in order: identity → skills → memory → tools → user context → time → workspace notes.

**Acceptance:** Prompt builder produces a complete system prompt string with all sections populated.

---

## Task 5: Skills System

**Port from:** `nex/src/agents/skills/workspace.ts`, `config.ts`, `frontmatter.ts`

### 5.1 Skill loader

```go
// internal/agent/skills.go
type SkillsManager struct {
    bundledDir   string
    workspaceDir string
}

type Skill struct {
    Name        string
    Content     string
    Frontmatter SkillFrontmatter
    Commands    []SkillCommand
}

type SkillFrontmatter struct {
    Name        string
    Description string
    OS          []string
    RequiredBins []string
}
```

### 5.2 Loading pipeline

1. Scan bundled skills directory
2. Scan workspace skills directory
3. Parse frontmatter from each `.md` file
4. Filter by OS requirements and required bins
5. Filter by config allow/deny lists

**Acceptance:** Skill loader finds and parses skill files, filters by platform, returns content for system prompt injection.

---

## Task 6: Core Nexus Tools

Implement the most essential agent tools. Not all tools — just enough for a useful agent session.

### 6.1 Tool registration

```go
// internal/tools/registry.go
func BuildNexusTools(ctx ToolContext) []types.ToolExecutor

type ToolContext struct {
    Ledgers   *db.Ledgers
    Config    *config.Config
    Broker    *broker.Broker  // nil in Phase 2 (no MA/WA yet)
    SessionKey string
    AgentID    string
    SandboxCfg *SandboxConfig
}
```

### 6.2 Phase 2 tools (implement these)

| Tool | Port From | Priority |
|------|-----------|----------|
| `cortex_recall` | `nex/src/agents/tools/memory-recall-tool.ts` | P0 — core memory |
| `cortex_*` (writers) | `nex/src/agents/tools/memory-writer-tools.ts` | P0 — core memory |
| `memory_search` | `nex/src/agents/tools/memory-tool.ts` | P0 — file search |
| `web_search` | `nex/src/agents/tools/web-search.ts` | P1 — useful but not blocking |
| `web_fetch` | `nex/src/agents/tools/web-fetch.ts` | P1 — useful |
| `image` | `nex/src/agents/tools/image-tool.ts` | P2 — can defer |

### 6.3 Exec tool (custom)

**Port from:** `nex/src/agents/bash-tools.exec.ts`

The Nexus exec tool wraps go-coding-agent's built-in bash tool with:
- Sandbox path guards
- Approval workflows (for dangerous commands)
- Safe-bin allowlists
- Timeout management
- Background execution support

This is critical because go-coding-agent's built-in bash tool doesn't have Nexus's security layers.

**Acceptance:** Agent can use memory tools to recall/write facts, use web_search to search the web, use exec with sandbox guards.

---

## Task 7: Broker (Single Agent)

**Port from:** `nex/src/nex/broker/broker-context.ts`, `broker-run-queue.ts`

### 7.1 Broker core

```go
// internal/broker/broker.go
type Broker struct {
    engine   *agent.Engine
    ledgers  *db.Ledgers
    sessions map[string]*SessionState  // keyed by session_key
    mu       sync.RWMutex
}

func (b *Broker) HandleEvent(ctx context.Context, req *pipeline.NexusRequest) error
```

### 7.2 Session key resolution

**Port from:** `nex/src/agents/tools/sessions-helpers.ts` (session key resolution)
**Spec:** `SESSION_LIFECYCLE.md`, `BROKER.md`

Resolve inbound event to a session key: `{agent_id}:{channel_id}:{sender_entity_id}` (or similar scheme from the spec).

### 7.3 Single-agent run queue

For Phase 2, implement a simple per-session queue:
- If session is idle: run agent immediately
- If session is running: queue the message (followup mode)
- When run completes: drain queue

MA/WA (multi-agent dispatch, worker agents, `agent_send`) is Phase 3.

**Acceptance:** Inbound event → broker resolves session → agent runs → response streams back over WS.

---

## Task 8: event.ingest Operation Handler

### 8.1 Wire the pipeline to broker

```go
// internal/operations/events.go
func (h *EventHandlers) HandleIngest(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
    // 1. Persist event to events.db
    // 2. Run media understanding (stub for Phase 2)
    // 3. Dispatch to broker
    // 4. Return acknowledgement
}
```

### 8.2 Adapter protocol (minimal)

**Port from:** `nex/src/nex/adapters/protocol.ts`

Implement enough of the stdio JSONL adapter protocol to accept events:
- Parse `NexusInput { operation, routing, payload }` from adapter stdout
- Send `delivery.send` responses back to adapter stdin
- `adapter.info` handshake

This doesn't need the full adapter supervisor yet — just enough to receive events from a single adapter.

**Acceptance:** Start an existing Go adapter (e.g., discord), it connects via stdio, sends events, agent responds, response is sent back to adapter.

---

## Task 9: Interactive Chat (CLI)

### 9.1 `nexus chat` command

A simple interactive CLI chat mode:
1. Connect to running daemon via WS
2. Read user input from stdin
3. Send as `event.ingest` with `surface=internal`
4. Stream agent response tokens to stdout

This is the simplest way to test the full pipeline without needing an adapter.

**Port from:** `nex/src/commands/chat.ts` (interactive mode)

**Acceptance:** `nexus chat` opens interactive prompt, user types message, agent responds with streaming output.

---

## Done Criteria

Phase 2 is complete when:

1. `nexus serve` boots with agent execution capability
2. `nexus chat` opens interactive agent session — user can:
   - Ask questions and get Claude/OpenAI responses
   - Agent uses `cortex_recall` / `cortex_*` writer tools against memory.db
   - Agent uses `web_search` / `web_fetch`
   - Agent uses exec with sandbox guards
3. Auth profiles load from disk and rotate across providers
4. Model selection resolves aliases to concrete models
5. Skills load from disk and appear in system prompt
6. Agent sessions persist to agents.db (sessions, turns, messages, tool_calls)
7. A Go adapter binary can connect via stdio, send events, receive responses
8. Streaming events broadcast to WS clients during agent runs
9. Per-session message queue handles concurrent messages (followup mode)
10. All of the above passes `go test ./...`
