# Nexus Fork Plan

**Goal:** Build Nexus using openclaw as a foundation, guided by our comprehensive specs.

**Created:** 2026-01-21  
**Updated:** 2026-02-09

---

## Overview

Nexus is a personal AI ecosystem forked from **openclaw** (formerly moltbot/clawdbot). We fork the upstream codebase, rebrand it, then systematically transform it component-by-component using our detailed specifications as the authoritative guide. Upstream code serves as battle-tested reference for implementation patterns and edge cases.

---

## Repository Layout

| Repo | Location | Purpose |
|------|----------|---------|
| **nex** | `~/nexus/home/projects/nexus/nex` | Nexus implementation (fresh fork) |
| **nexus-specs** | `~/nexus/home/projects/nexus/nexus-specs` | Specifications (authoritative) |
| **openclaw** | `~/nexus/home/projects/openclaw` | Upstream reference (read-only) |
| **nexus-adapter-sdk-go** | `~/nexus/home/projects/nexus/nexus-adapter-sdk-go` | Go adapter SDK |

### Fork Baseline

- **Upstream commit:** `0efaf5aa8` (openclaw HEAD, Feb 9, 2026)
- **Upstream remote:** `https://github.com/openclaw/openclaw.git`
- **Origin:** `https://github.com/Napageneral/nex.git`

---

## Key Architectural Differences

| Aspect | Openclaw | Nexus |
|--------|----------|-------|
| **Data model** | JSONL session files | SQLite ledgers (System of Record) |
| **Memory** | File-based (MEMORY.md) | Cortex (Go, derived layer) |
| **Access control** | Per-call permissions | Upfront IAM policies |
| **Event flow** | Direct handling | NEX pipeline (8 stages) |
| **Workspace** | Hidden `~/.openclaw/` | Visible `~/nexus/` |
| **Skills** | Bundled plugins | Hub-based (no bundled skills) |
| **Adapters** | In-process | External CLI executables |
| **Config** | `openclaw.json` | `nex.yaml` |
| **Language** | TypeScript | TypeScript core + Go Cortex |

---

## Implementation Sequence

### Step 0: Fork + Rebrand (DONE)

- [x] Fresh clone from openclaw HEAD (`0efaf5aa8`)
- [x] Set up remotes (origin → Napageneral/nex, upstream → openclaw)
- [x] Run `rebrand-nexus.sh` (all 9 phases pass)
- [ ] `pnpm install && pnpm build && pnpm test` — verify rebrand didn't break anything
- [ ] Push to GitHub (pending GitHub recovery from 500 errors)
- [ ] Commit rebranded state as baseline

### Step 1: Scaffold the Nexus Structure

Map the current openclaw file structure to the target Nexus structure. This is a reorganization pass — move files into the right places, establish the module boundaries.

**Before (openclaw):**
```
src/
├── agents/          → src/broker/ (agent execution)
├── auto-reply/      → src/broker/ (session/queue management)
├── channels/        → src/nex/adapters/ (adapter protocol types)
├── config/          → src/config/ (keep, adapt for nex.yaml)
├── daemon/          → src/nex/daemon/ (NEX daemon lifecycle)
├── commands/        → src/cli/ (CLI commands)
├── discord/         → extensions/discord/ (already there)
├── sessions/        → src/broker/sessions/ (session management)
├── routing/         → src/iam/ + src/broker/ (split: ACL vs routing)
├── tools/           → src/tools/ (keep)
├── bus/             → src/nex/bus/ (event bus)
├── plugins/         → src/nex/plugins/ (plugin system)
├── gateway/         → src/gateway/ (keep for now, eventual NEX HTTP)
├── memory/          → DROP (replaced by Cortex)
├── browser/         → defer (not V1)
extensions/          → extensions/ (external adapter processes)
packages/            → DROP (legacy package names)
```

**After (nexus):**
```
src/
├── nex/             # NEX orchestrator
│   ├── pipeline.ts  # 8-stage pipeline
│   ├── request.ts   # NexusRequest types
│   ├── daemon/      # Process lifecycle
│   ├── bus/         # Event bus + SSE
│   ├── plugins/     # Plugin system
│   ├── adapters/    # Adapter Manager
│   └── stages/      # Pipeline stage implementations
├── broker/          # Agent execution
│   ├── engine.ts    # pi-coding-agent wrapper
│   ├── context.ts   # Context assembly
│   ├── sessions/    # Session lifecycle + queue
│   └── ledger.ts    # Agents Ledger writes
├── iam/             # Identity & Access Management
│   ├── identity.ts  # Identity Graph resolution
│   ├── policies.ts  # ACL policy evaluation
│   ├── grants.ts    # Dynamic grants
│   └── audit.ts     # Audit logging
├── db/              # Database layer
│   ├── ledgers.ts   # SQLite connections
│   ├── events.ts    # Events Ledger (raw SQL)
│   ├── agents.ts    # Agents Ledger (raw SQL)
│   ├── identity.ts  # Identity Ledger (raw SQL)
│   └── nexus.ts     # Nexus Ledger (raw SQL)
├── cli/             # nexus CLI
├── tools/           # Tool registry
├── config/          # Config system (nex.yaml)
└── gateway/         # HTTP/SSE server
extensions/          # External adapter processes
cortex/              # Go process (separate, later)
```

**Deliverable:** A document (`SCAFFOLD_MAP.md`) listing every file move/rename/delete from current → target. This becomes the progress tracker.

### Step 2: Data Foundation (P0)

Port the SQLite ledger layer. This is the bedrock everything writes to.

| Task | Spec | Notes |
|------|------|-------|
| Events Ledger schema + queries | `data/ledgers/EVENTS_LEDGER.md` | Raw SQL, no ORM |
| Agents Ledger schema + queries | `data/ledgers/AGENTS_LEDGER.md` | Sessions, turns, messages, tool_calls, compactions |
| Identity Ledger schema + queries | `data/ledgers/IDENTITY_GRAPH.md` | Contacts, entities, mappings |
| Nexus Ledger schema + queries | `data/ledgers/NEXUS_LEDGER.md` | Pipeline traces |
| Schema migrations | `nex/DAEMON.md` (schema_version) | Version table + migration runner |

**Verification:** Schema creates, inserts, queries all work. Unit tests for each ledger.

### Step 3: NEX Pipeline Skeleton (P0)

The 8-stage pipeline with stub implementations.

| Task | Spec | Notes |
|------|------|-------|
| NexusRequest type definitions | `nex/NEXUS_REQUEST.md` | Zod schemas for each stage |
| Pipeline executor (8 stages) | `nex/NEX.md` | Stages are function calls, sync |
| Stub stage implementations | `nex/NEX.md` | Pass-through, accumulate NexusRequest |
| Nexus Ledger writes | `nex/NEXUS_REQUEST.md` | Trace each request |
| NEXPlugin interface | `nex/PLUGINS.md` | Hook points at each stage |

**Verification:** Synthetic event traverses all 8 stages, NexusRequest accumulates correctly, trace written to Nexus Ledger.

### Step 4: Agent Engine (P0)

Port the pi-coding-agent wrapper. This is the hardest part — lots of upstream logic.

| Task | Spec | Notes |
|------|------|-------|
| pi-coding-agent integration | `broker/AGENT_ENGINE.md` | Wrap `runEmbeddedPiAgent()` |
| Context assembly (3 layers) | `broker/CONTEXT_ASSEMBLY.md` | System prompt, history, current event |
| Session/turn management | `broker/SESSION_LIFECYCLE.md` | Create, resume, queue, compact |
| Agents Ledger writes | `data/ledgers/AGENTS_LEDGER.md` | Turns, messages, tool_calls |
| Compaction | `broker/AGENT_ENGINE.md` | Trust upstream, add metadata |

**Verification:** Hardcoded context → agent executes → response captured in Agents Ledger.

### Step 5: Adapter System (P0)

Wire up real I/O. Eve adapter is already in progress separately.

| Task | Spec | Notes |
|------|------|-------|
| Adapter Manager | `adapters/ADAPTER_SYSTEM.md` | Spawn/supervise adapter processes |
| Adapter CLI protocol | `adapters/ADAPTER_SYSTEM.md` | info, monitor, send, stream, health |
| Eve integration | `channels/imessage/EVE_ADAPTER_PLAN.md` | First real adapter |
| Events Ledger writes | `data/ledgers/EVENTS_LEDGER.md` | Inbound + outbound events |

**Verification:** Real iMessage → NEX pipeline → agent response → reply sent back.

### Step 6: IAM (P1)

Identity resolution and access control.

| Task | Spec | Notes |
|------|------|-------|
| Identity Graph resolution | `data/ledgers/IDENTITY_GRAPH.md` | contacts → mappings → entities |
| ACL policy evaluation | `iam/ACCESS_CONTROL_SYSTEM.md` | YAML policies → permissions |
| Session key assignment | `broker/SESSION_LIFECYCLE.md` | Entity-based vs channel-based |
| Grants system | `iam/GRANTS.md` | Dynamic permissions |

### Step 7: Daemon + Bus (P1)

Tie the system together as a managed process.

| Task | Spec | Notes |
|------|------|-------|
| Daemon lifecycle | `nex/DAEMON.md` | PID lock, signals, startup sequence |
| Event bus | `nex/BUS_ARCHITECTURE.md` | In-memory pub/sub, SSE |
| Health endpoint | `nex/DAEMON.md` | HTTP at 127.0.0.1:7400 |
| CLI commands | `nex/DAEMON.md` | start, stop, restart, status |

### Step 8: Streaming + Automations (P2)

| Task | Spec | Notes |
|------|------|-------|
| Streaming pipeline | `runtime/STREAMING.md` | Token-level delivery |
| Automations | `nex/automations/AUTOMATION_SYSTEM.md` | Proactive/reactive hooks |

### Step 9: Cortex Integration (P2, Go)

Separate Go process, integrates via HTTP API.

---

## Parallelization Strategy

After Step 1 (scaffold) and Step 2 (data layer), work can be parallelized:

| Workstream | Steps | Dependencies |
|------------|-------|-------------|
| **A: Pipeline** | 3 (NEX skeleton) + 7 (daemon/bus) | Step 2 (ledgers) |
| **B: Broker** | 4 (agent engine) | Step 2 (ledgers) |
| **C: Adapters** | 5 (adapter system + Eve) | Step 2 (ledgers) |
| **D: IAM** | 6 (identity + ACL) | Step 2 (ledgers) |

Shared types (NexusRequest, NexusEvent, StreamEvent) defined in Step 1 scaffold enable all workstreams to code against the same interfaces.

---

## Verification Gates

Each step has a concrete test before proceeding:

| Step | Gate |
|------|------|
| **0** | `pnpm test` passes on rebranded fork |
| **1** | Scaffold document maps every file; modules compile |
| **2** | All 4 ledger schemas create; CRUD tests pass |
| **3** | Synthetic event → 8 stages → Nexus Ledger trace |
| **4** | Agent executes, response in Agents Ledger |
| **5** | Real iMessage → full pipeline → reply delivered |
| **6** | Unknown sender → identity created; known sender → permissions applied |
| **7** | `nexus daemon start/stop/status` works |
| **8** | Token streaming to a real adapter |

---

## Upstream Sync Strategy

### What We Track

- Bug fixes and edge case handling (especially compaction, context overflow)
- Provider SDK updates (new models, API changes)
- Performance optimizations

### How We Incorporate

1. `cd ~/nexus/home/projects/openclaw && git pull`
2. Review changes: `git log --oneline upstream/main..origin/main`
3. Evaluate fit against our specs
4. Port selectively into `nex/`

### Key Upstream Changes Since Baseline

- `dm` → `direct` rename (ChatType refactor) — adopt when we implement session keys
- Compaction hardening (staged pruning, context overflow recovery) — port to Broker
- QMD memory backend — study but our Cortex is different
- Gateway agents CRUD — relevant for daemon management

---

## Related Documents

- `specs/README.md` — System architecture overview
- `specs/project-structure/NEXUS_STRUCTURE.md` — Target codebase layout
- `specs/project-structure/FORK_MAPPING.md` — Detailed component mapping
- `specs/project-structure/BRANDING.md` — Branding transformation rules
- `specs/runtime/nex/NEX.md` — NEX pipeline spec
- `TODO.md` — Remaining spec work and implementation priorities

---

*Fork is live. Rebrand applied. Time to scaffold and build.*
