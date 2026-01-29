# Nexus vs Clawdbot: Complete Feature Delta

**Purpose:** Single source of truth for ALL differences between Nexus and upstream clawdbot.

**Last Updated:** 2026-01-22

---

## Quick Reference

| Lane | What Changes | Upstream Conflict Risk |
|------|--------------|------------------------|
| 1. Branding | Names, paths, env vars | Low — automated script |
| 2. Workspace | Init, structure, bootstrap, agent bindings | Low — additive |
| 3. Agent System | Broker, MWP, triggers, sessions | HIGH — core changes |
| 4. Skills | Schema, CLI, hub, content | Low — additive |
| 5. Memory | REMOVAL + Mnemonic replacement | Medium — deletion |
| 6. Cloud | Nexus Cloud sync service | Low — new feature |
| 7. Collab | Multi-user collaboration | Low — new feature |
| 8. CLI & Capabilities | `nexus` CLI, capability abstraction, credentials | N/A — entirely new |

---

## Lane 1: Branding

**Status:** ✅ DONE (script created)

**What Changes:**
- `clawdbot` → `nexus` everywhere
- `CLAWDBOT_*` env vars → `NEXUS_*` (with fallback)
- `~/.clawdbot/` → `~/nexus/state/`
- Package name, binary name, help text

**Implementation:** Automated `scripts/rebrand.sh` — re-run after each upstream sync.

**Spec:** `specs/BRANDING.md`

---

## Lane 2: Workspace

**Status:** IN PROGRESS

**Spec:** `specs/workspace/`

### 2.1 Init Command

| Aspect | Upstream | Nexus |
|--------|----------|-------|
| Command | `onboard` (wizard) | `nexus init` + `nexus onboard` |
| Structure | `~/.clawdbot/` (hidden) | `~/nexus/` (visible, `home/` + `state/`) |
| Bootstrap | AGENTS.md only | AGENTS.md, SOUL.md, IDENTITY.md, BOOTSTRAP.md |
| Git init | No | Optional |

**Key Decision:** Separate `init` (structure) from `onboard` (identity ritual + auth).

### 2.2 Project Structure

```
~/nexus/                          # NEXUS_ROOT (visible)
├── AGENTS.md                     # System behavior (nexus-specific)
├── skills/                       # User skill definitions
│   ├── tools/                    # CLI tool wrappers
│   ├── connectors/               # Auth/credential connectors
│   └── guides/                   # Pure documentation
├── state/                        # Runtime state
│   ├── nexus.json                # Main config
│   ├── user/IDENTITY.md          # User profile
│   ├── agents/{name}/            # Per-agent identity + sessions
│   ├── credentials/              # Credential pointers
│   └── sessions/                 # Session transcripts
└── home/                         # User's personal space
```

vs Upstream:
```
~/.clawdbot/                      # Hidden
├── clawdbot.json
├── sessions.json
├── sessions/{id}.jsonl
└── subagents/runs.json
```

### 2.3 Bootstrap Files

| File | Upstream | Nexus | Notes |
|------|----------|-------|-------|
| AGENTS.md | Yes | Yes (richer) | CLI reference, skill taxonomy, social behavior |
| SOUL.md | No | Yes | Agent persona & boundaries |
| IDENTITY.md (agent) | No | Yes | Name, emoji, vibe |
| IDENTITY.md (user) | No | Yes | User profile |
| BOOTSTRAP.md | Yes (deleted after) | Yes (kept as template) | First-run ritual |
| HEARTBEAT.md | Yes | Yes (optional) | Heartbeat checklist |
| MEMORY.md | Yes | **REMOVED** | Replaced by Mnemonic |
| memory/ | Yes | **REMOVED** | Replaced by Mnemonic |

### 2.4 Access Plane Bindings

**New concept:** Configure IDE/harness integrations via `nexus setup <plane>`.

| Plane | Command | Creates |
|-------|---------|---------|
| Cursor | `nexus setup cursor` | `.cursor/rules`, `.cursor/hooks.json` |
| Claude Code | `nexus setup claude-code` | `CLAUDE.md` |
| Codex | `nexus setup codex` | `CODEX_INSTRUCTIONS.md` |
| OpenCode | `nexus setup opencode` | `.opencode/` |
| Aider | `nexus setup aider` | `.aider/` |

**Key Decision:** Not created by default. Opt-in during onboard or via CLI.

### 2.5 Onboarding Flow

**Upstream:** Security warning → Gateway config → Auth → Channels → Skills → Done (~5-10 min)

**Nexus:** BOOTSTRAP ritual → Identity files → Access planes → Channels → Done (~2-3 min)

**Key Decisions:**
- Identity-first, not config-first
- Reasonable defaults (no gateway/auth questions upfront)
- Skills installed separately via hub

---

## Lane 3: Agent System

**Status:** DESIGN DONE, implementation needed

**Specs:** `specs/agent-system/`

### 3.1 Unified Triggers

**Concept:** Replace heartbeat + cron + webhooks with single trigger abstraction.

| Trigger Type | Upstream | Nexus |
|--------------|----------|-------|
| Heartbeat | Config-based → main session | → Broker → best session |
| Cron | Separate system | → Broker → target session |
| Webhooks | Not built-in | → Broker → target session |
| File watch | Not built-in | → Broker → target session |
| Completion | Via announce | → Broker → original session |

**Key Decision:** All triggers flow through Agent Broker. Removes HEARTBEAT behavior from AGENTS.md — agents learn to create triggers via `create_trigger` tool.

**Spec Needed:** `specs/agent-system/UNIFIED_TRIGGERS.md`

### 3.2 Agent Broker

**Concept:** Message routing layer for multi-agent communication.

| Capability | Upstream | Nexus |
|------------|----------|-------|
| Agent-to-agent messaging | Via tool call only | Native via broker |
| Mid-task communication | Not supported | Supported |
| Priority queues | No | Yes (via upstream queue modes) |
| Nested spawning | Forbidden | Allowed (with depth tracking) |
| External caller tracking | No | Yes |
| Queue persistence | In-memory | Durable (SQLite) |

**Key Decisions:**
- Build ON TOP of upstream's session system
- Use upstream's queue modes (steer, followup, collect, interrupt)
- Add: agent registry, message routing, durability
- Drop: custom priority system (use upstream's)

**Spec:** `specs/agent-system/AGENT_BROKER.md`

### 3.3 MWP Pattern (Manager-Worker)

**Concept:** Clear role separation for multi-agent orchestration.

| Role | Upstream | Nexus |
|------|----------|-------|
| Manager Agent (MA) | "main session" | Explicit MA with limited tools |
| Worker Agent (WA) | Subagent (one level) | WAs can spawn sub-WAs |
| Communication | Completion announce only | Anytime via broker |
| System prompt | Generic subagent prompt | Role-specific prompts |

**Key Decisions:**
- All agents persistent (no ephemeral agents)
- Nested spawning allowed (configurable depth limit)
- Mid-task communication is critical
- Unified entity illusion: nice to have, not required

**Spec:** `specs/agent-system/ORCHESTRATION.md`

### 3.4 Session Storage + Forking

**Concept:** Prepare for smart forking via mnemonic.

| Aspect | Upstream | Nexus |
|--------|----------|-------|
| Format | JSONL | JSONL (same) |
| Path | `~/.clawdbot/sessions/` | `~/nexus/state/sessions/` |
| Forking | Copy all messages | Hybrid: JSONL + fork metadata |

**Key Decisions:**
- Keep upstream's JSONL format (aix compatible)
- Add `forks.json` for pointer-based forking
- Future: migrate to SQLite when mnemonic ready

**Spec:** `specs/agent-system/SESSION_FORMAT.md`

### 3.5 How It Fits Together

```
┌─────────────────────────────────────────────────────────────────┐
│                      EXTERNAL TRIGGERS                           │
│  (User messages, Heartbeat, Cron, Webhooks, File watchers)      │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT BROKER                              │
│  • Routes messages to appropriate session                       │
│  • Manages queues (using upstream queue modes)                  │
│  • Tracks relationships (who spawned whom)                      │
│  • Persists state (SQLite backing store)                        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       ┌────────────┐   ┌────────────┐   ┌────────────┐
       │ Manager    │   │ Worker     │   │ Worker     │
       │ Agent (MA) │   │ Agent (WA) │   │ Agent (WA) │
       │            │   │            │   │            │
       │ User conv  │   │ Task exec  │   │ Can spawn  │
       │ Delegation │   │ Heavy ctx  │   │ sub-WAs    │
       └────────────┘   └────────────┘   └────────────┘
              │                │                │
              └────────────────┼────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                  UPSTREAM GATEWAY/SESSIONS                       │
│  (Session storage, transcripts, spawn params, queue modes)      │
└─────────────────────────────────────────────────────────────────┘
```

**Upstream sync strategy:** High conflict risk. Manual review on each sync.

---

## Lane 4: Skills

**Status:** SPEC NEEDED

**Specs:** `specs/skills/`

### 4.1 Extended Schema + Storage

| Aspect | Upstream | Nexus |
|--------|----------|-------|
| Locations | Multiple (bundled, extraDirs) | Single (`~/nexus/skills/`) |
| Bundled | Yes (many by default) | **NONE** — hub-based |
| Format | SKILL.md (flat) | SKILL.md (categorized) |
| Taxonomy | None | `tools/`, `connectors/`, `guides/` |
| Tracking | None | Managed vs local, usage tracking |

### 4.2 Nexus CLI for Skills

```bash
nexus skills list                    # List all skills
nexus skills list --type tools       # Filter by type
nexus skills use <name>              # Get skill guide
nexus skills info <name>             # Skill metadata + status
nexus skills install <pack|name>     # Install from hub
nexus skills update                  # Update managed skills
```

**Key Decision:** CLI provides access, router, and usage tracking.

### 4.3 Nexus Hub

**Concept:** Central registry for skill discovery, installation, publishing.

| Feature | Description |
|---------|-------------|
| Search | Find skills by name, type, capability |
| Install | `nexus skills install gog` or `nexus skills install pack:macos-essentials` |
| Publish | Push local skills to hub |
| Packs | Curated bundles (e.g., macos-essentials, google-suite, messaging) |
| Taxonomy | Capability categories, kept in sync with hub |

**Spec Needed:** `specs/skills/HUB.md`

### 4.4 Skill Content Reconciliation

**Task:** Compare nexus skill versions to clawdbot versions, merge where appropriate.

**Scope:** This is a content task, not architectural. Can be done much later.

**Spec Needed:** `specs/skills/CONTENT_RECONCILIATION.md`

---

## Lane 5: Memory System

**Status:** DECISION MADE

**Spec:** `specs/memory/MNEMONIC_INTEGRATION.md`

### Decision: Remove Upstream Memory, Replace with Mnemonic

**What We Remove:**
- `MEMORY.md` file-based memory
- `memory/*.md` daily logs
- `memory_search` and `memory_get` tools
- Memory plugin system (`memory-core`, `memory-lancedb`)
- Memory CLI (`src/cli/memory-cli.ts`)
- Memory config section

**What Replaces It:**
- Mnemonic ingests ALL agent turns automatically
- Entity extraction + knowledge graph
- BM25 + vector search over ALL history
- `mnemonic_query` tool replaces `memory_search`

**Why:**

| Aspect | Upstream | Mnemonic |
|--------|----------|--------|
| Agent burden | Must write to MEMORY.md | Zero — auto-captured |
| Cross-agent | Per-agent isolation | Unified knowledge |
| Relationships | None | Full knowledge graph |
| Temporal | None | Bi-temporal bounds |
| Contradiction | None | Auto-invalidates stale facts |

**Bootstrap Changes:**
- Remove MEMORY.md from workspace bootstrap
- Remove memory/ directory creation
- Keep HEARTBEAT.md (optional) — convert to trigger system later

**Stub Strategy:** Implement `mnemonic_query` as no-op until Mnemonic is ready.

---

## Lane 6: Nexus Cloud

**Status:** SPEC NEEDED

**Spec:** `specs/cloud/NEXUS_CLOUD.md`

### Concept

Encrypted backup and sync of user's `home/` directory.

| Feature | Description |
|---------|-------------|
| Encryption | Keys stay local, server never sees plaintext |
| Scope | Everything in `home/` EXCEPT patterns in `.nexusignore` |
| Ignored | Git repos, node_modules, .venv, build artifacts |
| Sync | Push/pull on demand, optional auto-sync |

**What Gets Synced:**
- `home/` directory (user's personal space)
- NOT: `state/` (sessions, credentials — too sensitive)
- NOT: `skills/` (managed via hub)

**Skill:** `nexus-cloud` skill provides usage guide.

---

## Lane 7: Nexus Collab

**Status:** SPEC NEEDED

**Spec:** `specs/collab/NEXUS_COLLAB.md`

### Concept

Multi-user collaboration features.

**Potential Features:**
- Shared workspaces
- Agent sharing
- Skill sharing
- Session sharing/forking between users

**Status:** Early ideation. Needs requirements gathering.

---

## Lane 8: CLI & Capabilities

**Status:** ✅ SPEC COMPLETE

**Spec:** `specs/cli/`

### Concept

The `nexus` CLI is **entirely new** — no upstream equivalent. It's the agent's interface to the Nexus ecosystem.

**Core Components:**

| Component | Description |
|-----------|-------------|
| **CLI Commands** | `nexus status`, `nexus skills use`, `nexus credential`, etc. |
| **Capabilities** | Abstract goals mapped to concrete providers |
| **Credentials** | Secure storage with keychain/1password/env backends |
| **Onboarding** | Progressive capability expansion journey |

### Capabilities System

```
Capability (abstract)  →  Provider (concrete)
     email-read        →  gog + google-oauth
     messaging-read    →  eve, imsg, wacli
     chat-send         →  discord, slack
```

**Status Levels:** ✅ active, ⭐ ready, 🔧 needs-setup, 📥 needs-install, ⛔ unavailable, ❌ broken

### Why This Matters

1. **Agent-first design** — Built for AI agents, not just humans
2. **Capability abstraction** — Swap providers without changing skills
3. **Integrated credentials** — Secure by default
4. **Progressive onboarding** — Zero to full power journey

**Source Material:** `nexus-cli/.intent/specs/01-06_*.md`

---

## Implementation Order

### Phase 1: Foundation (Low Risk)
1. ✅ Branding script
2. Workspace structure + init command
3. Bootstrap files (minus MEMORY.md)
4. Access plane bindings

### Phase 2: Memory Removal (Medium Risk)
5. Remove upstream memory system
6. Stub `mnemonic_query` tool
7. Update workspace bootstrap

### Phase 3: CLI & Capabilities (New)
8. Nexus CLI core (status, skill use, credential)
9. Capabilities system implementation
10. Credential management system

### Phase 4: Skills (Low Risk)
11. Skills taxonomy + storage structure
12. Hub system (no bundled skills)

### Phase 5: Agent System (High Risk)
13. Unified triggers spec
14. Agent Broker implementation
15. MWP prompts and tools
16. Session forking prep

### Phase 6: Cloud + Collab (Low Risk)
17. Nexus Cloud service
18. Nexus Collab features

---

## Open Questions

| Question | Status | Notes |
|----------|--------|-------|
| Mnemonic timeline | OPEN | When is `mnemonic_query` ready? |
| Trigger scheduler ownership | DECIDED | Part of Agent Broker initially |
| Skills priority | OPEN | Can skills wait until after agent system? |
| SQLite vs JSONL for sessions | DECIDED | Hybrid (JSONL + fork metadata), SQLite later |

---

## Related Docs (Superseded)

These docs are superseded by this folder:

| Old Doc | Status | Content Moved To |
|---------|--------|------------------|
| `NEXUS_DELTA_PLAN.md` | Superseded | `OVERVIEW.md` |
| `NEXUS_FORK_WORKPLAN.md` | Superseded | `OVERVIEW.md` |
| `FRESH_FORK_PLAN.md` | Moved | `FORK_PLAN.md` |

---

*This document is the single source of truth for nexus-unique features. Update here first.*
