# Spec TODOs

Tracking remaining spec work and implementation priorities.

---

## Recent Decisions (2026-02-06)

Captured during full spec cohesion review:

| Decision | Details |
|----------|---------|
| **Streaming consolidated** | Single spec at `runtime/STREAMING.md`. Broker and NEX streaming docs now redirect there. |
| **DATA_MODEL.md → Ontology** | Refactored to conceptual reference. Implementation lives in `AGENTS_LEDGER.md`. |
| **5 conceptual → 3 physical layers** | Context Assembly now documents both the 5-layer conceptual model AND the 3-layer physical model for LLM caching. |
| **Hooks > Automations** | Hooks are the general mechanism. Automations are the primary hook type at `runAutomations`. Both docs updated. |
| **Stage 4 renamed** | `executeTriggers` → `runAutomations` across all non-upstream docs. |
| **8 stages confirmed** | Keeping `runAgent` and `deliverResponse` as separate stages for clarity. |
| **Language: TS primary, Go for Cortex** | TypeScript for core (NEX, Broker, CLI, tools). Go for Cortex. See `project-structure/LANGUAGE_DECISION.md`. |
| **NexusRequest lifecycle** | Full 8-stage lifecycle, typed schema per stage, NexusRequest↔AssembledContext mappings, Nexus Ledger schema. |
| **Sandbox not V1** | Agent execution isolation deferred to later phase. |
| **Adapter System is canonical** | `ADAPTER_SYSTEM.md` is the source of truth for adapter operations. Other adapter docs align with it. |
| **Session keys from ACL** | Entity-based for known senders, channel-based for unknown. ACL policies determine format. |
| **Session aliases** | Promote channel-based → entity-based sessions via aliases. Don't merge turn trees. Cortex bridges history. |
| **Eager session creation** | Sessions created at `assembleContext` (stage 5). Needed for queue lock before execution. |
| **Interrupt for user→MA** | Default queue mode. New user message cancels current generation. |
| **Compaction wraps pi-agent** | Trust upstream algorithm. We add proactive budget check + rich metadata capture. |
| **nex/INTERFACES.md retired** | Useful bits distributed to IDENTITY_GRAPH, cortex/README, EVENTS_LEDGER. |
| **NEX Daemon spec** | `nex/DAEMON.md` — process lifecycle, signals, health, CLI, crash recovery. |

---

## Spec Completion Summary

### Core Architecture — DONE

All high-priority specs are complete. The Nexus architecture is fully specced and ready for implementation.

| Area | Key Specs | Status |
|------|-----------|--------|
| **NEX Pipeline** | `nex/NEX.md`, `nex/NEXUS_REQUEST.md`, `nex/DAEMON.md` | ✅ |
| **Plugins & Hooks** | `nex/PLUGINS.md`, `hooks/HOOK_SERVICE.md` | ✅ |
| **Automations** | `nex/automations/AUTOMATION_SYSTEM.md` | ✅ |
| **Event Bus** | `nex/BUS_ARCHITECTURE.md` | ✅ |
| **Adapter System** | `adapters/ADAPTER_SYSTEM.md`, `ADAPTER_INTERFACES.md`, `ADAPTER_SDK.md` | ✅ |
| **Channel Reviews** | `channels/*/UPSTREAM_REVIEW.md` (9 channels) | ✅ |
| **Go Adapter SDK** | `nexus-adapter-sdk-go/` (built, compiles) | ✅ |
| **Context Assembly** | `broker/CONTEXT_ASSEMBLY.md` | ✅ |
| **Agent Engine** | `broker/AGENT_ENGINE.md` | ✅ |
| **Session Lifecycle** | `broker/SESSION_LIFECYCLE.md` | ✅ |
| **Streaming** | `runtime/STREAMING.md` (consolidated) | ✅ |
| **Data Model** | `broker/DATA_MODEL.md` (ontology), `AGENTS_LEDGER.md` (impl) | ✅ |
| **Ledgers** | `AGENTS_LEDGER.md`, `EVENTS_LEDGER.md`, `NEXUS_LEDGER.md`, `IDENTITY_GRAPH.md` | ✅ |
| **IAM** | `iam/ACCESS_CONTROL_SYSTEM.md`, `POLICIES.md`, `GRANTS.md` | ✅ |
| **Language Decision** | `project-structure/LANGUAGE_DECISION.md` | ✅ |

---

## Implementation Phase

### Active

| Task | Location | Notes |
|------|----------|-------|
| **Eve Adapter** | `channels/imessage/EVE_ADAPTER_PLAN.md` | 🔄 First adapter — spec complete, implementing now |

### Port Priorities

Pull latest OpenClaw upstream and begin porting, spec by spec:

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
| **P2** | Cortex integration | `data/cortex/README.md` | Semantic memory layer |

---

## Remaining Spec Work

Small items to fill in during implementation — none are blocking.

| TODO | Priority | Notes |
|------|----------|-------|
| **Automation Skill** | Medium | Create `skills/guides/automations/SKILL.md` so agents can write automations |
| **LedgerClient Interface** | Medium | Define API surface for automation scripts to query ledgers |
| **CortexClient Interface** | Medium | Define API surface for semantic search in automations |
| **Model Catalog** | Low | Provider/model registry — figure out during Broker implementation |
| **Config consistency** | Low | Ensure all docs say `nex.yaml` not `config.json` — quick pass |
| **TS Adapter SDK** | Medium | `@nexus/adapter-sdk` npm package — after Eve proves the pattern |

---

## Upstream Investigations

Deep dives into OpenClaw functionality. Important but not blocking V1.

| TODO | Priority | Notes |
|------|----------|-------|
| **Doctor System** | High | Self-healing diagnostics — health checks, repairs, config validation |
| **Browser Automation** | High | Major subsystem — Playwright, CDP, container isolation. Needs full design review before porting. |
| **Gateway → NEX Adapter** | Medium | How OpenClaw gateway RPC maps to NEX adapter pattern |
| **Exec Approvals** | Medium | Human-in-the-loop approval queue. Check IAM spec coverage. |
| **Plugin System Analysis** | Medium | Map OpenClaw plugin install to NEX adapter + hook install |
| **Node Execution** | Low | Multi-device orchestration — future |

---

## Security & Infrastructure

Fill in as implementation reveals gaps. None blocking V1.

| TODO | Priority | Notes |
|------|----------|-------|
| **Adapter Input Validation** | Medium | Per-channel sanitization patterns |
| **Rate Limiting** | Medium | Per-sender, per-channel limits |
| **Audit Logging** | Medium | What gets logged, format, retention |
| **TLS Configuration** | Low | TLS 1.3+ for non-loopback — matters when exposing externally |
| **Sandbox Spec** | Low (not V1) | Agent execution isolation — deferred |

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

*Architecture is specced. Time to build.*
