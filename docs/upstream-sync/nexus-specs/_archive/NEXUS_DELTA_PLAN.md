# Nexus Delta Plan: What We Change from Upstream

**Status:** MASTER PLANNING DOC  
**Last Updated:** 2026-01-22

This document consolidates all behavioral differences between Nexus and upstream Clawdbot into coherent bundles.

---

## Bundle Overview

| Bundle | Complexity | Conflict Risk | Status |
|--------|------------|---------------|--------|
| **1. Branding** | Low | Low | ✅ DONE (script created) |
| **2. Workspace** | Medium | Low | SPEC IN PROGRESS |
| **3. Agent System** | HIGH | HIGH | DESIGN NEEDED |
| **4. Skills** | Medium | Low | DESIGN NEEDED |
| **5. Memory** | REMOVAL | Medium | DECISION MADE |

---

## Bundle 5: Memory System (REMOVAL)

**Decision:** Remove upstream memory system entirely, replace with Mnemonic.

**What we're removing:**
- `MEMORY.md` file-based memory
- `memory/*.md` daily logs
- Vector indexing of memory files
- Session transcript indexing (experimental)
- `memory_search` and `memory_get` tools
- File watching for memory updates
- Memory plugin system (`memory-core`, `memory-lancedb`)

**What replaces it:**
- Mnemonic ingests ALL agent turns automatically
- Entity extraction + knowledge graph
- BM25 + vector search over ALL history
- Graph traversal for relationship queries
- Bi-temporal tracking for fact evolution

**Why:**
| Aspect | Upstream | Mnemonic |
|--------|----------|--------|
| Agent burden | Must write to MEMORY.md | Zero — auto-captured |
| Cross-agent | Per-agent isolation | Unified knowledge |
| Relationships | None | Full knowledge graph |
| Temporal | None | Bi-temporal bounds |
| Contradiction | None | Auto-invalidates stale facts |

**Files to remove from upstream:**
- `src/memory/` directory
- `extensions/memory-core/`
- `extensions/memory-lancedb/`
- Memory tools from `src/agents/tools/`
- Memory CLI from `src/cli/memory-cli.ts`
- Memory config from `src/config/types.tools.ts`

**Bootstrap file changes:**
- Remove `MEMORY.md` from workspace bootstrap
- Remove `memory/` directory creation
- Keep `HEARTBEAT.md` → but convert to trigger system (see Bundle 3)

**Integration point:** Mnemonic provides `mnemonic_query` tool that replaces `memory_search`.

---

## Bundle 1: Branding + Paths

**What changes:** Names, env vars, default paths.

**Conflict risk:** Low — mostly string replacements.

**Status:** ✅ DONE — branding script created by another agent.

**Key changes:**
- `clawdbot` → `nexus` everywhere
- `CLAWDBOT_*` env vars → `NEXUS_*`
- `~/.clawdbot/` → `~/.nexus/`
- Package name, binary name, etc.

---

## Bundle 2: Workspace + Bootstrap

**What changes:** Init behavior, bootstrap files, project structure.

**Conflict risk:** Low — mostly additive, doesn't touch core agent logic.

**Spec:** `specs/WORKSPACE_INIT_SPEC.md`

### 2.1 Init Command

| Aspect | Upstream | Nexus |
|--------|----------|-------|
| Command | `onboard` (wizard) | `nexus init` + `nexus onboard` |
| Creates | `~/.clawdbot/clawdbot.json` | `~/nexus/home/` + `~/.nexus/` |
| Bootstrap files | `AGENTS.md` only | `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `BOOTSTRAP.md`, etc. |
| Git init | No | Yes (optional) |

### 2.2 Project Structure

```
Upstream:
~/.clawdbot/
├── clawdbot.json
├── sessions.json
├── sessions/
│   └── {sessionId}.jsonl
└── subagents/
    └── runs.json

Nexus:
~/nexus/
├── home/           # User workspace (versioned)
│   ├── AGENTS.md
│   ├── skills/
│   └── projects/
└── state/          # Runtime state (gitignored)
    ├── agents/{agentId}/
    │   ├── sessions.json
    │   └── sessions/{sessionId}.jsonl
    └── credentials/
~/.nexus/           # Config only
    └── nexus.json
```

### 2.3 Bootstrap Files

| File | Purpose | Upstream Has? | Nexus Decision |
|------|---------|---------------|----------------|
| `AGENTS.md` | System behavior | ✅ Yes | Keep (nexus-specific content) |
| `SOUL.md` | Agent personality | ❌ No | Add |
| `IDENTITY.md` | Agent identity | ❌ No | Add |
| `BOOTSTRAP.md` | Session context | ✅ Yes | Keep in state/, not workspace |
| `HEARTBEAT.md` | Heartbeat instructions | ✅ Yes | **REMOVE** — replaced by triggers |
| `MEMORY.md` | Memory storage | ✅ Yes | **REMOVE** — replaced by Mnemonic |
| `memory/` | Daily logs | ✅ Yes | **REMOVE** — replaced by Mnemonic |

**Trigger system replaces HEARTBEAT.md:**
- Remove heartbeat content from AGENTS.md
- WA prompt teaches agents how to set triggers via `create_trigger` tool
- Triggers flow through Agent Broker → appropriate session
- More flexible: cron, event-based, one-shot, recurring

---

## Bundle 3: Agent System (THE BIG ONE)

**What changes:** Multi-agent orchestration, triggers, session storage.

**Conflict risk:** HIGH — touches core agent behavior.

**Specs:**
- `specs/AGENT_ORCHESTRATION_SPEC.md` — Architecture overview
- `specs/AGENT_BROKER_SPEC.md` — Implementation details

### 3.0 Understanding Upstream Sessions

**Critical context:** Upstream sessions are ISOLATED conversation histories.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SESSION KEY FORMAT                               │
│                                                                      │
│   agent:{agentId}:{context}                                         │
│                                                                      │
│   agent:main:main                          ← Default DM session     │
│   agent:main:telegram:dm:12345             ← DM with user on Tg     │
│   agent:main:discord:group:98765           ← Discord server         │
│   agent:main:imessage:dm:+17072876731      ← iMessage with Tyler    │
│   agent:main:subagent:task-uuid            ← Spawned worker         │
└─────────────────────────────────────────────────────────────────────┘
```

**Key insight: Sessions are ISOLATED by default.**
- Discord chat history ≠ iMessage chat history
- Each session = separate JSONL file
- One agent, MANY sessions, NO automatic context sharing

**What IS shared across sessions:**
- `MEMORY.md` (vector search for knowledge)
- Tools and capabilities
- System prompt (AGENTS.md)
- Workspace files

**What is NOT shared:**
- Conversation history (each session is independent)
- Session-specific settings (model override, queue mode)

**Cross-session communication:**
- `sessions_send(sessionKey, message)` — send to another session
- But no automatic "what did I say on Discord?" capability

### 3.1 Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    NEXUS AGENT SYSTEM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐│
│  │  Agent Broker    │  │  MWP Pattern     │  │  Triggers      ││
│  │  (routing layer) │  │  (MA/WA roles)   │  │  (unified)     ││
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬────────┘│
│           │                     │                     │         │
│           └─────────────────────┴─────────────────────┘         │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────────┐
│  │              Session Storage + Smart Forking                 │
│  │  (JSONL → SQLite? for efficient forking)                    │
│  └──────────────────────────────────────────────────────────────┘
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Agent Broker

**What it does:** Routes messages between agents, manages queues, tracks relationships.

| Capability | Upstream | Nexus |
|------------|----------|-------|
| Agent-to-agent messaging | Via tool call only | Native via broker |
| Mid-task communication | Not supported | Supported |
| Priority queues | No | Yes (low/normal/high/urgent) |
| Nested spawning | Forbidden | Allowed (with depth tracking) |
| External caller tracking | No | Yes |
| Queue persistence | In-memory | Durable (disk) |

**Tools exposed:**
- `send_message_to_agent(to, content, priority)`
- `create_trigger(type, target_session, payload)`

### 3.3 MWP Pattern (Manager-Worker)

| Role | Upstream | Nexus |
|------|----------|-------|
| Manager Agent (MA) | "main session" | Explicit MA with limited tools |
| Worker Agent (WA) | Subagent (one level) | WAs can spawn sub-WAs |
| Communication | Completion announce only | Anytime via broker |
| System prompt | Generic subagent prompt | Role-specific prompts |

**WA System Prompt comparison:**

```markdown
# Upstream Subagent Prompt
You are a **subagent** spawned by the main agent for a specific task.
- Complete this task. That's your entire purpose.
- Be ephemeral - You may be terminated after completion.
- NO user conversations
- NO cron jobs or persistent state

# Nexus WA Prompt (proposed)
You are a **Worker Agent** in the Manager-Worker pattern.
- You were dispatched by the Manager to handle: [TASK]
- You CAN message the Manager mid-task for clarification or updates.
- You CAN spawn sub-workers for subtasks.
- Your session persists — you are NOT ephemeral.
- Report results via `send_message_to_agent(manager, result)`.
```

### 3.4 Unified Triggers

**Spec needed:** `specs/UNIFIED_TRIGGERS_SPEC.md`

**Core concept:** Replace heartbeat + cron + webhooks with single trigger abstraction.

| Trigger Type | Upstream | Nexus |
|--------------|----------|-------|
| Heartbeat | Config-based, → main session | → Broker → best session |
| Cron | Separate system, → main or isolated | → Broker → target session |
| Webhooks | Not built-in | → Broker → target session |
| File watch | Not built-in | → Broker → target session |
| Completion callback | Via announce | → Broker → original session |
| Event-based | Not built-in | → Broker → target session |

**Trigger interface (from magic-toolbox):**
```typescript
interface Trigger {
  id: string;
  agentId: string;            // Which agent to invoke
  type: 'cron' | 'event';     // Time-based or event-based
  schedule: string;           // Cron expr OR event name OR ISO timestamp
  action: string;             // "send_message:content"
  nextRun?: number;
  lastRun?: number;
  enabled: boolean;
}
```

**Key insight:** All triggers become messages to the broker. Broker routes based on:
- Explicit target (if specified)
- Session affinity (e.g., WA set a completion trigger)
- Default (MA)

**Removes from AGENTS.md:** Heartbeat behavior section — agents learn to create triggers via WA prompt instead.

**Agent learns via prompt:**
```markdown
## Triggers

Use `create_trigger` to schedule future actions:

create_trigger({
  type: "cron",
  schedule: "0 9 * * 1-5",  // Weekdays at 9am
  action: "send_message:Good morning! Here's your daily briefing..."
})

Triggers route through the broker to your session.
```

### 3.5 Session Storage + Smart Forking

**The Problem:**

Upstream uses JSONL files. Forking requires copying all messages.

```
Fork from message N:
1. Read original JSONL (all messages)
2. Create new session
3. Copy messages 1..N to new file
4. Continue from there
```

**Smart Forking Needs:**

```
Ideal:
1. Create new session with pointer: "parent=X, fork_at=N"
2. New session stores only delta (messages after N)
3. Read reconstructs: parent[1..N] + self[N+1..]
```

**Options:**

| Approach | Pros | Cons |
|----------|------|------|
| Keep JSONL | Compatible with upstream | Forking duplicates data |
| SQLite per agent | Efficient forking, rich queries | Diverges from upstream |
| Hybrid (JSONL + fork metadata) | Compatible + forkable | Complex |

**Proposed: Hybrid approach**

```
sessions/
├── sessions.json          # Index (same as upstream)
├── {sessionId}.jsonl      # Transcript (same as upstream)
└── forks.json             # Fork metadata (new)
    {
      "session-uuid-2": {
        "parent": "session-uuid-1",
        "fork_at_message": 15,
        "created_at": 1234567890
      }
    }
```

Read logic:
1. Check if session has parent in `forks.json`
2. If yes: read parent up to `fork_at_message`, then read self
3. If no: read self only

This maintains upstream compatibility while enabling forking.

**Future:** Migrate to SQLite when mnemonic is ready.

### 3.6 Two Routing Modes

**We will implement BOTH, starting with explicit.**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ROUTING MODES                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  EXPLICIT ROUTING (v1 — implement first)                            │
│  ────────────────────────────────────────                           │
│  • Caller specifies target: send(to: "worker-123", msg)             │
│  • Deterministic: you know exactly where it goes                    │
│  • Good for: MA → WA delegation, structured workflows               │
│                                                                      │
│  SMART ROUTING (v2 — add later via mnemonic)                         │
│  ──────────────────────────────────────────                         │
│  • System finds best match: route("fix auth bug") → checkpoint      │
│  • Uses: semantic search + facets + quality signals                 │
│  • Good for: "continue what I was working on", discovery            │
│  • Enables: fork from ANY turn, not just session heads              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Explicit routing interface:**
```typescript
broker.send({ from: "manager", to: "code-worker", content: "Review auth module" });
```

**Smart routing interface (future):**
```typescript
const route = await mnemonic.route("Review auth module for security issues");
// Returns: { segmentId: "seg-123", checkpoint: {...}, confidence: 0.87 }
broker.forkFrom(route.checkpoint, { content: "Continue review" });
```

**Why both?**
- Explicit is simpler to debug, predictable
- Smart enables "resume relevant work" without knowing session keys
- A/B testable: compare effectiveness for different use cases

---

## Bundle 4: Skills

**What changes:** Skill storage, taxonomy, CLI interface, hub system.

**Conflict risk:** Low — mostly additive.

**Spec needed:** `specs/SKILLS_TAXONOMY_SPEC.md`

### 4.1 Skills Storage

| Aspect | Upstream | Nexus |
|--------|----------|-------|
| Locations | Multiple (`~/.clawdbot/skills/`, bundled, extraDirs) | Single (`~/nexus/skills/`) |
| Bundled | Yes (many skills included by default) | **NO** — start minimal, install via hub |
| Format | SKILL.md files (flat) | SKILL.md (categorized: tools/guides/connectors) |
| Discovery | Via config | Via `nexus skills list` |
| Tracking | None | Managed vs local tracking |

### 4.2 Taxonomy

```
~/nexus/skills/
├── tools/              # CLI tool wrappers (gog, tmux, peekaboo)
│   └── {name}/SKILL.md
├── connectors/         # Auth/credential setup (google-oauth, anthropic)
│   └── {name}/SKILL.md
└── guides/             # Pure documentation (filesystem, weather)
    └── {name}/SKILL.md
```

### 4.3 Hub System (No Bundled Skills)

**Philosophy:** Don't drown users in skills. Start minimal, expand via hub.

**Flow:**
1. `nexus init` creates empty `~/nexus/skills/` with subdirs
2. `nexus onboard` suggests skill packs based on OS/platform
3. User installs packs: `nexus skills install pack:macos-essentials`
4. Skills marked as `managed` (from hub) vs `local` (user-created)

**Skill packs (examples):**
- `macos-essentials` — peekaboo, tmux, filesystem
- `google-suite` — gog, google-oauth
- `messaging` — imsg, discord, telegram

### 4.4 Nexus CLI for Skills

```bash
nexus skills list                    # List all skills
nexus skills list --type tools       # Filter by type
nexus skills use <name>              # Get skill guide
nexus skills info <name>             # Skill metadata + status
nexus skills install <pack|name>     # Install from hub
nexus skills update                  # Update managed skills
```

### 4.5 Skills Content

Custom nexus skills (not in upstream):
- `nexus-cloud` — sync service
- `gog` — Google OAuth gateway
- System skills for nexus workspace management

---

## Implementation Order

### Phase 1: Foundation (Low Risk)
1. ✅ Branding script
2. Workspace structure + init command
3. Bootstrap files (minus MEMORY.md, HEARTBEAT.md)

### Phase 2: Memory Removal (Medium Risk)
4. Remove upstream memory system from codebase
5. Stub `mnemonic_query` tool for future integration
6. Update workspace bootstrap (no memory files)

### Phase 3: Skills (Low Risk)
7. Skills taxonomy spec
8. Skills storage structure (`~/nexus/skills/` with subdirs)
9. Hub system (no bundled skills)
10. Nexus CLI for skills

### Phase 4: Agent System (High Risk)
11. Unified triggers spec
12. Agent Broker (routing layer)
13. MWP prompts and tools
14. Trigger scheduler + executor
15. Smart forking metadata

---

## Open Questions

### Q1: SQLite vs JSONL for sessions?

**Trade-offs:**

| JSONL | SQLite |
|-------|--------|
| Upstream compatible | Efficient forking |
| Human readable | Rich queries |
| Simple | Complex migration |

**Recommendation:** Start with hybrid (JSONL + fork metadata), migrate to SQLite when mnemonic is ready.

### Q2: How to handle upstream updates?

**Strategy:**
1. Bundle 1 (branding): Automated script, rerun on sync
2. Bundle 2 (workspace): Additive, rarely conflicts
3. Bundle 3 (agent system): Manual review, careful merge
4. Bundle 4 (skills): Additive, rarely conflicts
5. Bundle 5 (memory): We removed it — no upstream conflict

### Q3: What's the minimum viable agent system?

**MVP:**
1. Agent Broker with basic routing
2. MA/WA prompts (use upstream spawn)
3. Mid-task communication via `sessions_send`
4. Skip: triggers unification, smart forking

### Q4: Mnemonic integration timeline?

**Dependencies:**
- Mnemonic must be ready before memory removal is complete
- Need `mnemonic_query` tool that provides:
  - Text search (replaces `memory_search`)
  - Entity queries ("who is X?")
  - Relationship traversal ("who does X know?")
  - Temporal queries ("where did X work in 2024?")

**Stub strategy:** Implement `mnemonic_query` as a no-op or basic search until Mnemonic is ready.

### Q5: Trigger scheduler ownership?

**Options:**
1. Part of Agent Broker (simpler, coupled)
2. Separate service (cleaner, more complex)

**Recommendation:** Part of Agent Broker initially. Extract later if needed.

---

## Related Docs

### Active Specs
| Spec | Bundle | Status |
|------|--------|--------|
| `specs/WORKSPACE_INIT_SPEC.md` | 2 | In Progress |
| `specs/AGENT_ORCHESTRATION_SPEC.md` | 3 | Done |
| `specs/AGENT_BROKER_SPEC.md` | 3 | Done |
| `specs/SESSION_FORMAT_SPEC.md` | 3 | Done |
| `specs/UNIFIED_TRIGGERS_SPEC.md` | 3 | **NEEDED** |
| `specs/SKILLS_TAXONOMY_SPEC.md` | 4 | **NEEDED** |

### Superseded Docs
- `FRESH_FORK_PLAN.md` — Original thin fork strategy (superseded by this)
- `NEXUS_FORK_WORKPLAN.md` — Work items (consolidated into this)

### External References
- `/Users/tyler/nexus/home/projects/cortex/docs/MEMORY_SYSTEM_SPEC.md` — Mnemonic memory design (project being renamed from "cortex" to "mnemonic")
- `/Users/tyler/nexus/home/projects/magic-toolbox/agentkit/triggers/` — Trigger system reference
