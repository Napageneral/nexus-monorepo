# Spec TODOs

Tracking remaining spec work and implementation priorities.

---

## Recent Decisions

Captured during spec cohesion reviews:

| Decision | Date | Details |
|----------|------|---------|
| **Streaming consolidated** | 2026-02-06 | Single spec at `runtime/STREAMING.md`. Broker and NEX streaming docs redirect there. |
| **DATA_MODEL.md → Ontology** | 2026-02-06 | Refactored to conceptual reference. Implementation lives in `AGENTS_LEDGER.md`. |
| **5 conceptual → 3 physical layers** | 2026-02-06 | Context Assembly documents both models for LLM caching. |
| **Hooks > Automations** | 2026-02-06 | Hooks are the general mechanism. Automations are the primary hook type at `runAutomations`. |
| **Stage 4 renamed** | 2026-02-06 | `executeTriggers` → `runAutomations` across all non-upstream docs. |
| **8 stages confirmed** | 2026-02-06 | Keeping `runAgent` and `deliverResponse` as separate stages for clarity. |
| **Language: TS primary, Go for Cortex** | 2026-02-06 | TypeScript for core (NEX, Broker, CLI, tools). Go for Cortex. |
| **NexusRequest lifecycle** | 2026-02-06 | Full 8-stage lifecycle, typed schema per stage, NexusRequest↔AssembledContext mappings. |
| **Adapter System is canonical** | 2026-02-06 | `ADAPTER_SYSTEM.md` is source of truth. External CLI executables. |
| **Session keys from ACL** | 2026-02-06 | Entity-based for known, channel-based for unknown. Aliases for promotion. |
| **NEX Daemon spec** | 2026-02-06 | `nex/DAEMON.md` — process lifecycle, signals, health, CLI, crash recovery. |
| **Spec consistency pass** | 2026-02-09 | Full audit and cleanup. NEX.md refreshed, config standardized to `nex.yaml`, cross-refs fixed, Cortex docs consolidated, NEXUS_STRUCTURE.md updated, capabilities coarsened, `platform` over `os`, `session_label` over `session_id`, `NexusEvent` over `AdapterEvent`, `triggers` over `hooks.*`, CLI-based automation registration, Events Ledger `direction` column added. |
| **Upstream checkpoint** | 2026-02-09 | openclaw HEAD at `6397e53f3` (Feb 9, 2026). Key changes since baseline: `dm`→`direct` rename, compaction hardening, context overflow recovery, QMD memory backend. |

---

## Spec Completion Summary

### Core Architecture — DONE

All high-priority specs are complete and aligned. Ready for implementation.

| Area | Key Specs | Status |
|------|-----------|--------|
| **NEX Pipeline** | `nex/NEX.md`, `nex/NEXUS_REQUEST.md`, `nex/DAEMON.md` | ✅ |
| **Plugins & Hooks** | `nex/PLUGINS.md`, `hooks/HOOK_SERVICE.md` | ✅ |
| **Automations** | `nex/automations/AUTOMATION_SYSTEM.md` | ✅ |
| **Event Bus** | `nex/BUS_ARCHITECTURE.md` | ✅ |
| **Adapter System** | `adapters/ADAPTER_SYSTEM.md`, `ADAPTER_INTERFACES.md`, `ADAPTER_SDK.md` | ✅ |
| **Channel Reviews** | `channels/*/UPSTREAM_REVIEW.md` (9 channels) | ✅ |
| **Go Adapter SDK** | `nexus-adapter-sdks/nexus-adapter-sdk-go/` (built, compiles) | ✅ |
| **Context Assembly** | `broker/CONTEXT_ASSEMBLY.md` | ✅ |
| **Agent Engine** | `broker/AGENT_ENGINE.md` | ✅ |
| **Session Lifecycle** | `broker/SESSION_LIFECYCLE.md` | ✅ |
| **Streaming** | `runtime/STREAMING.md` (consolidated) | ✅ |
| **Data Model** | `broker/DATA_MODEL.md` (ontology), `AGENTS_LEDGER.md` (impl) | ✅ |
| **Ledgers** | `AGENTS_LEDGER.md`, `EVENTS_LEDGER.md`, `NEXUS_LEDGER.md`, `IDENTITY_GRAPH.md` | ✅ |
| **IAM** | `iam/ACCESS_CONTROL_SYSTEM.md`, `POLICIES.md`, `GRANTS.md` | ✅ |
| **Language Decision** | `project-structure/LANGUAGE_DECISION.md` | ✅ |
| **Cortex Integration** | `cortex/CORTEX_NEX_MIGRATION.md` (reworked as integration plan) | ✅ |

---

## Implementation Phase

### Active

| Task | Location | Notes |
|------|----------|-------|
| **Eve Adapter** | `channels/imessage/EVE_ADAPTER_PLAN.md` | First adapter — implementing now |
| **Channel Adapter Cutover** | `runtime/adapters/CHANNEL_MIGRATION_TRACKER.md` | Priority order: eve -> gog -> discord/telegram/whatsapp -> ingress + clock |

### Next Steps

1. **Fresh fork** from openclaw HEAD (`6397e53f3`) + branding script
2. **Scaffold** — Set up Nexus project structure per `project-structure/NEXUS_STRUCTURE.md`
3. **Map before/after** — Document exactly what files/folders exist before and after the transformation
4. **Execute port** — Spec by spec, component by component (see priorities below)

### Port Priorities

| Priority | What | Nexus Spec | Notes |
|----------|------|------------|-------|
| **P0** | Data layer (SQLite ledgers) | `data/ledgers/*.md` | Foundation — everything writes here |
| **P0** | Agent engine (pi-coding-agent wrapper) | `broker/AGENT_ENGINE.md` | Core execution — need this to run agents |
| **P0** | NEX pipeline (8 stages) | `nex/NEX.md`, `nex/NEXUS_REQUEST.md` | Central orchestrator |
| **P0** | Adapter manager + Eve | `adapters/ADAPTER_SYSTEM.md` | First I/O channel |
| **P1** | Context assembly | `broker/CONTEXT_ASSEMBLY.md` | Full context building |
| **P1** | Session management | `broker/SESSION_LIFECYCLE.md` | Turn processing, queues, compaction |
| **P1** | IAM (identity + ACL) | `iam/ACCESS_CONTROL_SYSTEM.md` | Who can do what |
| **P1** | Event bus + SSE | `nex/BUS_ARCHITECTURE.md` | Real-time coordination |
| **P1** | Daemon process | `nex/DAEMON.md` | Ties it all together |
| **P2** | Streaming | `runtime/STREAMING.md` | Token-level delivery |
| **P2** | Automations | `nex/automations/AUTOMATION_SYSTEM.md` | Proactive/reactive hooks |
| **P2** | Cortex integration | `data/cortex/README.md` | Semantic memory layer (Go) |

---

## Remaining Spec Work

Small items — none blocking implementation.

| TODO | Priority | Notes |
|------|----------|-------|
| **Clock Adapter** | Medium | Timer/cron/scheduled events adapter — needs spec. Events flow through full pipeline. |
| **Automation Skill** | Medium | Create `skills/guides/automations/SKILL.md` so agents can write automations |
| **LedgerClient Interface** | Medium | Define API surface for automation scripts to query ledgers |
| **CortexClient Interface** | Medium | Define API surface for semantic search in automations |
| **Model Catalog** | Low | Provider/model registry — figure out during Broker implementation |
| **TS Adapter SDK** | Medium | `@nexus/adapter-sdk` npm package — after Eve proves the pattern |

---

## Upstream Investigations

Deep dives into OpenClaw functionality. Important but not blocking V1.

| TODO | Priority | Notes |
|------|----------|-------|
| **Doctor System** | High | Self-healing diagnostics — health checks, repairs, config validation |
| **Browser Automation** | High | Playwright, CDP, container isolation. Full design review before porting. |
| **Gateway → NEX Adapter** | Medium | How OpenClaw gateway RPC maps to NEX adapter pattern |
| **Exec Approvals → IAM Tool Approvals** | High | **Parity shipped:** `exec.approval.*` is IAM-backed and `exec` consults IAM grants so “allow always” suppresses future prompts. **Strictly-better shipped:** structured permission request fields, generic approvals RPC (`acl.approval.request`, `acl.requests.*`), Control UI approvals inbox, and `acl.approval.*` broadcast events. **Runtime shipped:** exec/node no longer consult `exec-approvals.json` allowlists/defaults for authorization; legacy exec-approvals RPC/UI/CLI retired. **Remaining:** optionally import old allowlist entries into IAM grants. Spec: `runtime/iam/TOOL_APPROVALS.md`. |
| **Plugin System Analysis** | Medium | Map OpenClaw plugin install to NEX adapter + hook install |
| **`dm` → `direct` rename** | Medium | Upstream renamed peer kind. Adopt in our session key formats. |

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
| ~~Config consistency~~ | Done (2026-02-09) — all docs say `nex.yaml` |
| Enterprise/Plugin Review | Low — review when Cloud/Hub becomes relevant |

---

*Specs are clean. Fork fresh, scaffold, build.*
