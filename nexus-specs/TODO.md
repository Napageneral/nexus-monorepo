# Spec TODOs

Tracking remaining spec work and implementation priorities.

---

## Active Workstreams

### Unified Cutover (Memory + Nex Runtime)

**Source of truth:** `IMPLEMENTATION_PLAN.md`

Hard cutover — no migrations, no backwards compatibility. Unified execution of memory system rewrite + nex runtime redesign through 4 phases (Database Foundations → Types + Tools → Query + Pipeline → Cleanup).

### Device Adapter Migration

**Source of truth:** `specs/nex/workplans/NODE_ECOSYSTEM_REDESIGN_FOR_NEX_CORE_2026-02-26.md`

Nearly complete. Remaining items:
- [ ] App/device E2E: chat/talk subscription parity on iOS/macOS/Android clients
- [ ] True companion-app/device E2E on physical hosts (explicitly deferred)

### Go Port

**Source of truth:** `specs/architecture/LANGUAGE_AND_ARCHITECTURE.md`

TypeScript implementation first, Go port planned. Specs are the build target for the Go port — they must be clean, unambiguous, and canonical.

---

## Remaining Spec Work

| TODO | Priority | Notes |
|------|----------|-------|
| **Automation Skill** | Medium | Create skill spec so agents can write automations |
| **LedgerClient Interface** | Medium | API surface for automation scripts to query ledgers |
| **MemoryClient Interface** | Medium | API surface for semantic search in automations |
| **Model Catalog** | Low | Provider/model registry — figure out during Broker implementation |

---

## Implementation Priorities (Go Port)

| Priority | What | Key Specs | Notes |
|----------|------|-----------|-------|
| **P0** | Data layer (SQLite ledgers) | `data/ledgers/*.md` | Foundation — everything writes here |
| **P0** | Agent engine (pi-coding-agent wrapper) | `agents/AGENT_ENGINE.md` | Core execution |
| **P0** | NEX pipeline (5 stages) | `nex/NEX.md`, `nex/NEXUS_REQUEST_TARGET.md` | Central orchestrator |
| **P0** | Adapter manager | `adapters/ADAPTER_SYSTEM.md` | First I/O channel |
| **P1** | Context assembly | `agents/CONTEXT_ASSEMBLY.md` | Full context building |
| **P1** | Session management | `agents/SESSION_LIFECYCLE.md` | Turn processing, queues, compaction |
| **P1** | IAM (identity + ACL) | `iam/ACCESS_CONTROL_SYSTEM.md` | Who can do what |
| **P1** | Event bus + SSE | `nex/BUS_ARCHITECTURE.md` | Real-time coordination |
| **P1** | Daemon process | `nex/DAEMON.md` | Ties it all together |
| **P2** | Streaming | `STREAMING.md` | Token-level delivery |
| **P2** | Automations | `nex/automations/AUTOMATION_SYSTEM.md` | Proactive/reactive hooks |
| **P2** | Memory System | `memory/MEMORY_SYSTEM.md` | Semantic memory layer |

---

## Upstream Investigations

| TODO | Priority | Notes |
|------|----------|-------|
| **Doctor System** | High | Self-healing diagnostics — health checks, repairs, config validation |
| **Browser Automation** | High | Playwright, CDP, container isolation. Full design review before porting. |
| **Gateway → NEX Adapter** | Medium | How OpenClaw gateway RPC maps to NEX adapter pattern |
| **Plugin System Analysis** | Medium | Map OpenClaw plugin install to NEX adapter + hook install |

---

## Deferred / Dropped

| Item | Reason |
|------|--------|
| ~~Queue Management standalone doc~~ | Covered in `SESSION_LIFECYCLE.md` |
| ~~Config Hot-Reload standalone doc~~ | Covered in `DAEMON.md` |
| ~~nex/INTERFACES.md~~ | Retired — distributed to home specs |
| ~~RPC Interface~~ | Dropped for V1 — CLI + signals sufficient |
| ~~Sandbox~~ | Not V1 |
| ~~Smart Routing~~ | v2 feature |
| Enterprise/Plugin Review | Low — review when Cloud/Hub becomes relevant |

---

*Specs are clean. Build from them.*
