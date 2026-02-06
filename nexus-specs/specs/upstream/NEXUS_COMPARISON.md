# OpenClaw → Nexus Comparison

**Status:** COMPLETE  
**Last Updated:** 2026-02-03

---

## Overview

This document maps OpenClaw concepts to Nexus equivalents at a high level. For detailed analysis, see the `comparisons/` folder:

- `comparisons/ARCHITECTURAL_PHILOSOPHY.md` — Design philosophy differences
- `comparisons/SYSTEMS_COMPARISON.md` — System-by-system breakdown
- `comparisons/COMPACTION.md` — Context management deep dive
- `comparisons/WHAT_TO_PORT.md` — Specific patterns worth adopting

---

## Architectural Differences

| Aspect | OpenClaw | Nexus | Why Changed |
|--------|----------|-------|-------------|
| **Core location** | `src/` at root | `packages/core/` | Cleaner monorepo separation |
| **Data storage** | JSONL files + JSON index | SQLite ledgers (System of Record) | Structured queries, atomic transactions, no file sprawl |
| **Session tree** | `id`/`parentId` in JSONL | Turn tree in Agents Ledger | Same concept, better queryability |
| **Memory** | File-based (MEMORY.md) + SQLite vectors | Cortex (derived layer) | Unified semantic search, episodes, facets |
| **Access control** | Per-channel config, inline | Declarative YAML policies (IAM) | Security first, auditable, composable |
| **Event flow** | Per-channel monitor → dispatch | NEX pipeline (8 stages) | Central orchestration, observable |
| **Workspace** | Hidden `~/.openclaw/` | Visible `~/nexus/` | Transparency, discoverability |
| **Skills** | Bundled in repo | Hub-based, user installs | User choice, no bloat |
| **Agent execution** | External `pi-coding-agent` | Broker component | More control, ledger integration |
| **Plugins** | Many specific hooks | 8-stage pipeline + automations | Organized, predictable |
| **Config** | Single `config.json` | Split by domain | Clear separation of concerns |

---

## Component Mapping

| OpenClaw | Nexus | Notes |
|----------|-------|-------|
| `src/gateway/` | NEX + Gateway | Central server, but NEX is the orchestrator |
| `src/agents/` | Broker | Agent execution, session management |
| `src/sessions/` | Agents Ledger | Session/turn storage |
| `src/auto-reply/` | NEX pipeline | Message dispatch and reply |
| `src/channels/` | Adapters (in/out) | Platform integrations |
| `src/plugins/` | NEX Plugins | Extensibility mechanism |
| `src/hooks/` | NEX Pipeline hooks + Automations | Lifecycle events |
| `src/memory/` | Cortex | Semantic search, embeddings |
| `src/config/` | Split configs in `state/` | Per-domain configuration |
| `src/routing/` | IAM + Session routing | Access control and routing |
| `sessions.json` | Agents Ledger (sessions table) | Session metadata |
| `*.jsonl` transcripts | Agents Ledger (turns, messages) | Conversation history |
| `extensions/` | `skills/` + adapters | Channels and capabilities |

---

## Concept Mapping

| OpenClaw Term | Nexus Term | Difference |
|---------------|------------|------------|
| Session | Session | Same concept, stored in SQLite |
| Transcript | Turn history | Same data, different storage |
| SessionEntry | Session row | Same metadata |
| Message | Message | Same structure |
| Compaction | Compaction | Same concept |
| Plugin | NEX Plugin | Narrower scope, specific hook points |
| Hook | Pipeline stage hook | Organized into 8 stages |
| Tool | Tool | Minimal built-in set |
| Gateway | NEX + Gateway | NEX orchestrates, Gateway serves |
| Channel | Adapter | Separate in/out interfaces |
| Allowlist | IAM Policy | Declarative YAML |
| Session key | Session key | Same format |
| Binding | IAM routing rules | Declarative policies |

---

## What Nexus Keeps

### Patterns to Adopt

1. **Session key format** — `agent:{agentId}:{scope}` works well
2. **Compaction approach** — Summary + kept messages
3. **Tree structure for turns** — Supports branching/forking
4. **Streaming phases** — Tool → block → final
5. **Channel abstraction** — Monitor + sender pattern
6. **Plugin API design** — `register(api)` pattern is clean

### Code to Port

1. **Outbound formatting/chunking** — Per-channel logic
2. **Compaction prompts** — Summary generation
3. **Provider integrations** — Model SDK wrappers
4. **Media handling** — Image/audio processing

---

## What Nexus Drops

### Removed Patterns

1. **JSONL file storage** — Replaced by SQLite ledgers
2. **Per-channel inline config** — Replaced by declarative IAM
3. **Hidden workspace** — Everything visible in `~/nexus/`
4. **Single config file** — Split by domain
5. **Bundled skills** — Hub-based instead
6. **External agent library** — Broker owns execution
7. **Complex routing cascades** — Simplified IAM policies

### Removed Complexity

1. **Multiple allowlist formats** — Unified in IAM
2. **Mention gating variants** — Policy-based
3. **Send policy rules** — IAM handles this
4. **Device pairing complexity** — Simplified (or removed)

---

## What Nexus Adds

### New Concepts

1. **NEX (8-stage pipeline)** — Central orchestrator with defined stages
2. **System of Record** — Four ledgers (Events, Agents, Identity, Nexus)
3. **Cortex (derived layer)** — Episodes, facets, embeddings, analyses
4. **Identity Graph** — Contacts → Entities → Mappings
5. **Declarative IAM** — YAML policies for access control
6. **Automations** — Proactive/reactive agent invocations
7. **NexusRequest** — Data bus flowing through pipeline
8. **Audit trail** — Full traces in Nexus Ledger
9. **Skills Hub** — Curated, installable capabilities

### New Architectural Properties

1. **Observable** — Every request traced
2. **Auditable** — All access decisions logged
3. **Declarative** — Policies over code
4. **Queryable** — SQLite enables analysis
5. **Modular** — Clear component boundaries

---

## Teardown Narrative (Draft)

### The Story

**OpenClaw does well:**
- Multi-platform support (19+ channels)
- Robust agent execution via `pi-coding-agent`
- Flexible plugin system with many hooks
- Working compaction and context management
- Active development, battle-tested

**But has limitations:**
- JSONL files don't scale (no queries, file sprawl)
- Access control is scattered (per-channel, per-group, inline)
- No central orchestrator (each channel has its own flow)
- Hidden workspace makes debugging hard
- Bundled skills create bloat
- No audit trail for access decisions

**Nexus redesigns with:**
- SQLite ledgers as System of Record
- Cortex for semantic understanding
- NEX as central orchestrator (8 stages)
- Declarative IAM policies
- Visible workspace structure
- Hub-based skills

**Result:**
- Queryable history and sessions
- Auditable access decisions
- Predictable event flow
- Easier debugging
- User choice over bundled defaults
- Foundation for multi-agent and collaboration

---

## Migration Considerations

For users moving from OpenClaw to Nexus:

| Aspect | Migration Path |
|--------|----------------|
| Sessions | Import JSONL → Agents Ledger |
| Config | Map to split config files |
| Channels | Adapters should be compatible |
| Plugins | Rewrite for NEX pipeline |
| Skills | Install from Hub |
| Memory | Rebuild Cortex from events |

---

## Additional Differences

Beyond the tables above, key philosophical differences:

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Workspace visibility** | Hidden `~/.openclaw/` | Visible `~/nexus/` |
| **Config structure** | Single `config.json` (JSON5) | Split by domain (YAML) |
| **Adapter abstraction** | Channels embedded in core | Adapters are separate in/out interfaces |
| **Central orchestrator** | None — each channel has own flow | NEX 8-stage pipeline |
| **Event tracing** | None — events fire and disappear | Nexus Ledger for audit trail |
| **Identity management** | Ad-hoc `identityLinks` in config | Identity Graph (contacts → entities → mappings) |
| **Skill status** | Computed at runtime from filesystem | First-class status tracking (✅⭐🔧📥⛔❌) |
| **Trigger system** | Internal hooks (many, scattered) | NEX Automations (organized, predictable) |
| **Session routing** | Binding cascade (peer → guild → team) | IAM policies |
| **Context assembly** | Per-channel, each does its own thing | `assembleContext` stage in NEX |
| **Multi-agent** | Ad-hoc delegation (`sessions_spawn`) | Manager-Worker Pattern (MWP) |
| **Commands** | Mixed with skills | Separate concept (skills ≠ commands) |

---

## The Meta-Difference

**OpenClaw:** "Grow as needed" — add features where needed, when needed.

**Nexus:** "Architect first" — define the foundation, then grow on it.

OpenClaw's organic growth produced a working, battle-tested system with impressive breadth. But sprawl eventually inhibits growth past a certain scale. Getting foundational things like IAM right becomes nearly impossible without a massive refactor.

Nexus bets that structured foundation enables sustainable growth.

---

## Summary

**Nexus is:** Safer, more modular, more extensible, more durable.

**The bet:** Once you have SQLite as System of Record, you can build whatever memory system you want on top — not rely on files which have problems solved better by a proper data layer.

See `comparisons/` for detailed analysis of each system.

---

*This document and `comparisons/` inform the teardown blog post and migration guide.*
