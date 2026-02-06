# Hook Service Specification

**Status:** DRAFT  
**Last Updated:** 2026-01-29  
**Related:** ../nex/EVENT_SYSTEM_DESIGN.md, ../broker/OVERVIEW.md, ../broker/DATA_MODEL.md

---

## Executive Summary

This document specifies the **Hook Service** — the general extensibility mechanism for the NEX pipeline. Hooks are scripts that can run at any pipeline stage, registered via CLI for explicit control and rich metadata capture.

**Hooks are the general mechanism. Automations are the primary hook type.** The most important pipeline stage for hooks is `runAutomations`, where **automations** evaluate incoming events and decide whether to invoke agents. See `../nex/automations/AUTOMATION_SYSTEM.md` for the full automation specification.

```
Pipeline Hooks (this doc — general mechanism)
├── Stage hooks: afterReceiveEvent, afterResolveIdentity, etc.
└── Automations (../nex/automations/ — event-triggered agent invocation)
```

The Hook Service is part of the NEX daemon process that handles:
- Hook registration and lifecycle
- Hook evaluation at pipeline stages
- Automation trigger matching
- Agent Broker dispatch (when automations fire)

---

## 1. Design Principles

### CLI-Based Registration (Not File Watching)

**Why not file watching?**
- No metadata about who created the hook
- No version tracking
- Magic behavior is harder to debug
- Agents can't manage hook lifecycle

**CLI approach benefits:**
- Agent explicitly registers after writing script
- Captures agent_id, persona, thread context
- Enables versioning, enable/disable, stats
- Agents can query their own hooks

### Unified Service

Instead of multiple daemons, a single **Nexus Service** handles:
- Hook evaluation (on event arrival)
- Broker dispatch (routing to agents)
- Cortex event ingestion
- Session state management

This aligns with the architectural unification happening across specs.

---

## 2. Hook Lifecycle (Agent Experience)

### Step 1: Agent Writes Hook Script

Agent writes a TypeScript file (location is flexible):

```typescript
// ~/nexus/state/hooks/casey-safety-check.ts

/**
 * @name Casey Safety Check
 * @description Check if Casey texted home safe by 3am
 * @mode one-shot
 */

import Database from 'better-sqlite3';

export default async function(ctx: HookContext): Promise<HookResult> {
  // ... hook logic
}
```

### Step 2: Agent Registers Hook via CLI

```bash
nexus hooks register ./casey-safety-check.ts \
  --name "Casey Safety Check" \
  --mode one-shot \
  --description "Fire if Casey hasn't confirmed home safe by 3am"
```

**What happens:**
1. CLI validates the script (parses, checks signature)
2. CLI reads agent context from environment/session:
   - `NEXUS_AGENT_ID` — Which agent is running
   - `NEXUS_SESSION_ID` — Current session
   - `NEXUS_THREAD_ID` — Current thread (if any)
3. CLI inserts into `hooks` table with full metadata
4. CLI copies/links script to canonical location if needed
5. Returns hook ID and status

**Output:**
```
✓ Hook registered: casey-safety-check
  ID: hook_01HQXYZ...
  Status: active
  Mode: one-shot
  Created by: atlas (session: abc123)
```

### Step 3: Agent Manages Hook Lifecycle

**List hooks:**
```bash
nexus hooks list
nexus hooks list --status active
nexus hooks list --created-by atlas
```

**Get hook details:**
```bash
nexus hooks info casey-safety-check
```
```
Hook: casey-safety-check
  ID: hook_01HQXYZ...
  Status: active
  Mode: one-shot
  
  Created: 2026-01-28T01:30:00Z
  Created by: atlas
  Session: abc123
  
  Stats (last 24h):
    Invocations: 47
    Fires: 0
    Errors: 0
    Avg latency: 12ms
  
  Script: ~/nexus/state/hooks/casey-safety-check.ts
```

**Disable/enable:**
```bash
nexus hooks disable casey-safety-check --reason "Testing"
nexus hooks enable casey-safety-check
```

**Update hook:**
```bash
nexus hooks update casey-safety-check ./casey-safety-check-v2.ts
```
- Creates new version
- Preserves history
- Atomic swap

**Delete hook:**
```bash
nexus hooks delete casey-safety-check
```
- Soft delete (preserves invocation history)
- Can be restored within retention period

### Step 4: View Invocation History

```bash
nexus hooks invocations casey-safety-check --last 10
```
```
ID          Event              Fired  Latency  LLM Calls  Error
inv_001     timer:tick:123...  no     8ms      0          -
inv_002     timer:tick:124...  no     9ms      0          -
inv_003     timer:tick:125...  yes    145ms    1          -
```

---

## 3. Hook Database Schema

### hooks Table

```sql
CREATE TABLE hooks (
  id TEXT PRIMARY KEY,              -- ULID or slug
  name TEXT NOT NULL,
  description TEXT,
  mode TEXT NOT NULL,               -- 'persistent' | 'one-shot'
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'paused' | 'disabled' | 'errored'
  
  -- Script location
  script_path TEXT NOT NULL,        -- Canonical path to .ts file
  script_hash TEXT,                 -- SHA256 for change detection
  
  -- Ownership (captured at registration)
  created_by_agent TEXT,            -- Agent ID that registered
  created_by_session TEXT,          -- Session ID
  created_by_thread TEXT,           -- Thread ID (optional)
  
  -- Versioning
  version INTEGER DEFAULT 1,
  previous_version_id TEXT,         -- FK to prior version (if updated)
  
  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  disabled_at INTEGER,
  disabled_reason TEXT,
  
  -- Runtime state
  last_triggered INTEGER,
  trigger_count INTEGER DEFAULT 0,
  last_error TEXT,
  consecutive_errors INTEGER DEFAULT 0,
  
  -- Circuit breaker
  circuit_state TEXT DEFAULT 'closed',  -- 'closed' | 'open' | 'half-open'
  circuit_opened_at INTEGER
);

CREATE INDEX idx_hooks_status ON hooks(status);
CREATE INDEX idx_hooks_created_by ON hooks(created_by_agent);
```

### hook_invocations Table

```sql
CREATE TABLE hook_invocations (
  id TEXT PRIMARY KEY,
  hook_id TEXT NOT NULL,
  event_id TEXT NOT NULL,           -- FK to Cortex events
  
  -- Timing
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  
  -- Outcome
  fired INTEGER NOT NULL,           -- 0 or 1
  result_json TEXT,                 -- Full HookResult if fired
  
  -- Resource usage
  llm_calls INTEGER DEFAULT 0,
  llm_tokens_in INTEGER DEFAULT 0,
  llm_tokens_out INTEGER DEFAULT 0,
  search_calls INTEGER DEFAULT 0,
  
  -- Errors
  error TEXT,
  stack_trace TEXT,
  
  FOREIGN KEY (hook_id) REFERENCES hooks(id)
);

CREATE INDEX idx_invocations_hook ON hook_invocations(hook_id);
CREATE INDEX idx_invocations_event ON hook_invocations(event_id);
CREATE INDEX idx_invocations_time ON hook_invocations(started_at);
```

---

## 4. Unified Nexus Service

### Service Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NEXUS SERVICE                                        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    EVENT INGESTION                                   │    │
│  │                                                                      │    │
│  │  Cortex Adapters → Normalize → Store in events table              │    │
│  │  Timer Adapter → Tick event every 60s                               │    │
│  │                                                                      │    │
│  │  On new event → Publish to Hook Evaluator                           │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │                                            │
│                                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    HOOK EVALUATOR                                    │    │
│  │                                                                      │    │
│  │  • Load enabled hooks from DB (cached in memory)                    │    │
│  │  • Build HookContext (dbPath, search, llm)                          │    │
│  │  • Execute ALL hooks in PARALLEL                                    │    │
│  │  • Record invocations, update health                                │    │
│  │  • Apply circuit breaker logic                                      │    │
│  │                                                                      │    │
│  │  On fire → Dispatch to Broker                                       │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │                                            │
│                                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    AGENT BROKER                                      │    │
│  │                                                                      │    │
│  │  • Resolve agent from routing                                       │    │
│  │  • Assemble context (thread history, system prompt)                 │    │
│  │  • Manage queues (steer, followup, collect)                        │    │
│  │  • Execute agent                                                    │    │
│  │  • Handle response → Outbound adapters                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    SHARED INFRASTRUCTURE                             │    │
│  │                                                                      │    │
│  │  • SQLite DB (events, hooks, sessions, entities)                   │    │
│  │  • Embeddings client (Gemini)                                       │    │
│  │  • LLM client (Gemini 3 Flash)                                      │    │
│  │  • Hook runtime (Bun)                                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Event Flow

```
Event arrives (iMessage, timer tick, webhook, etc.)
        │
        ▼
Store in Cortex events table
        │
        ▼
Publish to Hook Evaluator (internal)
        │
        ▼
Load enabled hooks (from memory cache)
        │
        ▼
For each hook IN PARALLEL:
        │
        ├─ Build HookContext
        │    • event: the event
        │    • dbPath: path to Cortex DB
        │    • search(): semantic search function
        │    • llm(): Gemini 3 Flash call function
        │    • now: current time
        │    • hook: this hook's metadata
        │
        ├─ Execute hook script (in Bun isolate)
        │
        ├─ Record invocation metrics
        │
        └─ If fired → dispatch to Broker
```

### Performance Requirements

**Hook evaluation must be fast:**
- Target: < 10ms for deterministic hooks
- Target: < 500ms for LLM-using hooks
- Parallel execution (all hooks at once)
- Memory-cached hook registry
- Circuit breaker prevents slow hooks from blocking

**Scalability:**
- Start simple (single process, Bun)
- If needed: worker pool for hook execution
- If needed: separate process for LLM-heavy hooks

---

## 5. CLI Commands

### `nexus hooks` Subcommands

```
nexus hooks
├── register <script>       # Register a new hook
│   ├── --name <name>       # Human-readable name (optional, parsed from JSDoc)
│   ├── --mode <mode>       # persistent | one-shot
│   └── --description <d>   # Description (optional)
│
├── list                    # List all hooks
│   ├── --status <status>   # Filter by status
│   ├── --created-by <agent># Filter by creator
│   └── --json              # JSON output
│
├── info <hook-id>          # Get hook details
│   └── --json
│
├── update <hook-id> <script>  # Update hook script
│
├── enable <hook-id>        # Enable a paused/disabled hook
│
├── disable <hook-id>       # Disable a hook
│   └── --reason <reason>
│
├── delete <hook-id>        # Soft delete a hook
│
├── invocations <hook-id>   # View invocation history
│   ├── --last <n>          # Last N invocations
│   ├── --since <time>      # Since timestamp
│   └── --errors-only       # Only show errors
│
└── stats                   # Overall hook system stats
    └── --json
```

### Environment Variables for Agent Context

When agents run CLI commands, these capture context:

```bash
NEXUS_AGENT_ID=atlas           # Current agent identity
NEXUS_SESSION_ID=sess_abc123   # Current session
NEXUS_THREAD_ID=thread_xyz     # Current thread (optional)
NEXUS_PERSONA=default          # Current persona
```

These are set by the agent harness and captured at hook registration.

---

## 6. Hook Skill for Agents

The skill doc (in hook-examples/README.md) teaches agents:

1. **How to write hook scripts** — HookContext, patterns, examples
2. **How to register hooks** — CLI commands
3. **How to manage lifecycle** — Enable, disable, update, delete
4. **How to debug** — View invocations, check stats

Example skill usage:

```
Agent receives: "Remind me to check on Casey tonight"

Agent thinks:
1. This needs a one-shot scheduled hook
2. I'll write the script using the hook patterns
3. I'll register it with `nexus hooks register`
4. I'll confirm to the user

Agent writes: casey-safety-check.ts
Agent runs: nexus hooks register ./casey-safety-check.ts --mode one-shot
Agent says: "Done! I've set up a safety check for Casey."
```

---

## 7. Open Questions

### Resolved

| Question | Decision |
|----------|----------|
| Daemon vs CLI | CLI-based registration |
| Metadata capture | Agent context from env vars |
| Script location | Canonical path stored in DB |
| Unified service | Yes, single Nexus Service |

### To Resolve (In Other Specs)

| Question | Where |
|----------|-------|
| How does service receive events? | Cortex adapter spec |
| How does Broker assemble context? | BROKER.md / Context Assembly spec |
| Session state management? | SESSION_FORMAT.md |
| Outbound response adapters? | Response Adapter spec |

### Future Considerations

- **Hook permissions** — Can any agent create hooks? Scoping?
- **Hook quotas** — Limit hooks per agent?
- **Hook templates** — Pre-built hooks for common patterns?
- **Hook sharing** — Can hooks be shared across workspaces?

---

## 8. References

- **../nex/EVENT_SYSTEM_DESIGN.md** — Hook schema, HookContext, examples
- **hook-examples/** — Example hooks and skill doc
- **../broker/OVERVIEW.md** — Agent dispatch and routing
- **../broker/DATA_MODEL.md** — Thread, session, message primitives

---

*This spec captures the Hook Service design. It should be unified with ongoing Broker and Cortex specs as those evolve.*
