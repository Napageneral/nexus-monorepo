# Nexus Fork Workplan

**Goal:** Create a maintainable fork of clawdbot with nexus-specific enhancements.

**Master Plan:** `NEXUS_DELTA_PLAN.md`

**Updated:** 2026-01-22

---

## Bundle Status

| Bundle | Description | Status | Spec |
|--------|-------------|--------|------|
| **1. Branding** | Names, paths, env vars | ✅ DONE | — |
| **2. Workspace** | Init, bootstrap, structure | SPEC IN PROGRESS | `WORKSPACE_INIT_SPEC.md` |
| **3. Agent System** | Broker, MWP, triggers, sessions | DESIGN NEEDED | See below |
| **4. Skills** | Storage, taxonomy, hub | SPEC NEEDED | `SKILLS_TAXONOMY_SPEC.md` |
| **5. Memory** | Remove upstream, Cortex integration | DECISION MADE | — |

### Specs Status

| Spec | Bundle | Status |
|------|--------|--------|
| `WORKSPACE_INIT_SPEC.md` | 2 | ✅ In Progress |
| `AGENT_ORCHESTRATION_SPEC.md` | 3 | ✅ Done |
| `AGENT_BROKER_SPEC.md` | 3 | ✅ Done |
| `SESSION_FORMAT_SPEC.md` | 3 | ✅ Done |
| `UNIFIED_TRIGGERS_SPEC.md` | 3 | **NEEDED** |
| `SKILLS_TAXONOMY_SPEC.md` | 4 | **NEEDED** |

---

## Bundle 1: Branding + Paths

**Status:** ✅ DONE

**Deliverable:** Branding script created by separate agent.

**What it does:**
- `clawdbot` → `nexus` everywhere
- `CLAWDBOT_*` env vars → `NEXUS_*` (with fallback)
- `~/.clawdbot/` → `~/.nexus/` + `~/nexus/state/`
- Package name, binary, help text, etc.

**Conflict Risk:** Low — string replacements, re-run after sync.

---

## Bundle 2: Workspace + Bootstrap

**Status:** SPEC IN PROGRESS

**Spec:** `specs/WORKSPACE_INIT_SPEC.md`

### Work Items

| Item | Description | Status |
|------|-------------|--------|
| 2.1 | `nexus init` command | SPEC DONE |
| 2.2 | `nexus reset` command | SPEC DONE |
| 2.3 | Git setup integration | SPEC DONE |
| 2.4 | Project structure (`~/nexus/home/`, `~/nexus/state/`) | SPEC DONE |
| 2.5 | Bootstrap files (SOUL.md, IDENTITY.md, etc.) | SPEC DONE |

### Key Decisions

- **Keep both:** `nexus init` (structure) AND `nexus onboard` (auth wizard)
- **Bootstrap files:** All are additive, no conflict with upstream
- **Structure:** Two-folder model (`home/` for user content, `state/` for runtime)

### Commits to Port

```
bca132f28 INIT-1 - Add nexus init command
126a6ad45 INIT-2 - Add nexus reset command  
9521a82f4 GIT-1 - Add git repo setup to nexus init
40da022b4 DOC-1 - Document home userspace git setup
```

**Conflict Risk:** Low — additive commands, don't touch core.

---

## Bundle 3: Agent System (THE BIG ONE)

**Status:** DESIGN NEEDED

**Specs:**
- `specs/AGENT_ORCHESTRATION_SPEC.md` — Architecture
- `specs/AGENT_BROKER_SPEC.md` — Implementation

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    Bundle 3: Agent System                        │
├─────────────────────────────────────────────────────────────────┤
│  3.1 Agent Broker      — Message routing layer                  │
│  3.2 MWP Pattern       — Manager/Worker roles and prompts       │
│  3.3 Unified Triggers  — Heartbeat/cron/webhooks → broker       │
│  3.4 Session Storage   — Smart forking support                  │
└─────────────────────────────────────────────────────────────────┘
```

### Work Items

| Item | Description | Status | Priority |
|------|-------------|--------|----------|
| 3.1 | Agent Broker (routing layer) | SPEC DONE | HIGH |
| 3.2 | MWP prompts and tools | DESIGN NEEDED | HIGH |
| 3.3 | Unified triggers | **SPEC NEEDED** | MEDIUM |
| 3.4 | Smart forking metadata | DESIGN NEEDED | MEDIUM |

**Note:** 3.3 requires `UNIFIED_TRIGGERS_SPEC.md` — port magic-toolbox trigger system.

### Key Design Questions

**Q1: How do runs/sessions/turns relate?**
- **Run** = Single invocation (user message → agent response)
- **Session** = Container for multiple runs (one JSONL file)
- **Turn** = aix/cortex terminology for a run

**Q2: How does forking work with JSONL?**

Current: Copy all messages to new file (duplicates data).

Proposed hybrid:
```
sessions/
├── sessions.json     # Index
├── {sessionId}.jsonl # Transcripts
└── forks.json        # Fork metadata
    { "child-id": { "parent": "parent-id", "fork_at": 15 } }
```

Read: If has parent, read parent[1..N] + self[N+1..].

**Q3: What parameters does spawn need?**

Upstream's `sessions_spawn` is powerful:
```typescript
sessions_spawn({
  task: string,              // The task
  label?: string,            // Human name
  agentId?: string,          // Target agent
  model?: string,            // Model override (!)
  thinking?: string,         // Thinking level override (!)
  runTimeoutSeconds?: number, // Timeout
  cleanup: "delete"|"keep"
})
```

**We should adopt these.** Model override for browser tasks, thinking override for analysis.

**Q4: Should subagents be in separate folder?**

Upstream: `~/.clawdbot/subagents/runs.json` (separate tracking)

Decision: Keep upstream's structure. Subagent runs.json tracks spawn relationships. Session transcripts still in main sessions folder.

### What We Change from Upstream

| Aspect | Upstream | Nexus |
|--------|----------|-------|
| Nested spawning | Forbidden | Allowed |
| Mid-task messaging | Not supported | Via broker |
| Trigger routing | Direct to session | Via broker |
| Queue persistence | In-memory | Durable |
| WA prompt | "Be ephemeral" | "Session persists" |

**Conflict Risk:** HIGH — touches core agent behavior. Need careful design.

---

## Bundle 4: Skills

**Status:** SPEC NEEDED

**Spec needed:** `specs/SKILLS_TAXONOMY_SPEC.md`

### Work Items

| Item | Description | Status |
|------|-------------|--------|
| 4.0 | Write `SKILLS_TAXONOMY_SPEC.md` | TODO |
| 4.1 | Skills storage structure + taxonomy | TODO |
| 4.2 | Hub system (no bundled skills) | TODO |
| 4.3 | Nexus CLI for skills | TODO |
| 4.4 | Port skills content | TODO |

### Key Decisions

| Decision | Choice |
|----------|--------|
| Storage | Single location: `~/nexus/skills/` |
| Taxonomy | Subdirs: `tools/`, `connectors/`, `guides/` |
| Bundled skills | **NONE** — start minimal, install via hub |
| Tracking | Managed (from hub) vs local (user-created) |
| CLI | `nexus skill list|use|info|install|update` |

**Conflict Risk:** Low — additive.

---

## Bundle 5: Memory (REMOVAL)

**Status:** DECISION MADE

**Decision:** Remove upstream memory system entirely, replace with Cortex.

### What We Remove

| Component | Location |
|-----------|----------|
| Memory manager | `src/memory/` |
| Memory plugins | `extensions/memory-core/`, `extensions/memory-lancedb/` |
| Memory tools | `src/agents/tools/memory-tool.ts` |
| Memory CLI | `src/cli/memory-cli.ts` |
| Memory config | `src/config/types.tools.ts` (memorySearch section) |
| MEMORY.md bootstrap | workspace bootstrap |
| memory/ daily logs | workspace bootstrap |
| HEARTBEAT.md | workspace bootstrap (replaced by triggers) |

### What Replaces It

| Upstream | Cortex |
|----------|--------|
| `memory_search` tool | `cortex_query` tool |
| MEMORY.md file-based | Automatic turn ingestion |
| Per-agent isolation | Unified knowledge graph |
| Text chunks only | Entities + relationships |

### Work Items

| Item | Description | Status |
|------|-------------|--------|
| 5.1 | Remove memory system from codebase | TODO |
| 5.2 | Stub `cortex_query` tool | TODO |
| 5.3 | Update workspace bootstrap (no memory files) | TODO |
| 5.4 | Remove HEARTBEAT.md (→ triggers) | TODO |

**Conflict Risk:** Medium — removing code is easier than adding, but need to ensure nothing depends on it.

---

## Consolidated Specs

| Spec | Bundle | Purpose |
|------|--------|---------|
| `NEXUS_DELTA_PLAN.md` | All | Master overview of all changes |
| `WORKSPACE_INIT_SPEC.md` | 2 | Init, structure, bootstrap |
| `AGENT_ORCHESTRATION_SPEC.md` | 3 | Architecture overview |
| `AGENT_BROKER_SPEC.md` | 3 | Implementation details |
| `SESSION_FORMAT_SPEC.md` | 3 | Session storage, forking |

### Deprecated/Superseded

| Doc | Status |
|-----|--------|
| `FRESH_FORK_PLAN.md` | Superseded by `NEXUS_DELTA_PLAN.md` |
| `BULK_SYNC_PLAN.md` | Obsolete (old approach) |
| `BULK_SYNC_MANIFEST.md` | Obsolete (old approach) |

---

## Execution Order

### Phase 1: Foundation ✅
- [x] Branding script (Bundle 1)
- [x] Session format research
- [x] Agent system research

### Phase 2: Workspace + Memory Removal (Bundle 2 + 5)
- [ ] Apply branding to fresh fork
- [ ] Port init commands
- [ ] Set up project structure
- [ ] Remove memory system from codebase
- [ ] Update bootstrap files (no MEMORY.md, HEARTBEAT.md)
- [ ] Stub `cortex_query` tool

### Phase 3: Skills (Bundle 4)
- [ ] Write `SKILLS_TAXONOMY_SPEC.md`
- [ ] Skills storage structure + taxonomy
- [ ] Hub system (no bundled skills)
- [ ] Nexus CLI for skills

### Phase 4: Agent System (Bundle 3)
- [ ] Write `UNIFIED_TRIGGERS_SPEC.md`
- [ ] Agent Broker (routing layer)
- [ ] MWP prompts and tools
- [ ] Unified triggers (scheduler + executor)
- [ ] Smart forking metadata

---

## Next Actions

### Specs to Write
1. **`UNIFIED_TRIGGERS_SPEC.md`** — Port magic-toolbox trigger system design
2. **`SKILLS_TAXONOMY_SPEC.md`** — Define taxonomy, hub system, no bundled skills

### Questions Resolved
- ✅ Memory: Remove upstream, replace with Cortex
- ✅ Heartbeat: Remove from AGENTS.md, replace with triggers
- ✅ Skills: Single location, taxonomy subdirs, hub-based packs

### Open Questions
1. **Trigger scheduler ownership:** Part of broker or separate service?
2. **Cortex timeline:** When is `cortex_query` ready?
3. **Skills priority:** Can skills wait until after agent system?

---

*Updated 2026-01-22 — Added Bundle 5 (Memory), spec requirements, execution order*
