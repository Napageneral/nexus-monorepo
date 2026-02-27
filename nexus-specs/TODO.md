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
| **9 stages confirmed** | 2026-02-06 | Keeping `runAgent` and `deliverResponse` as separate stages for clarity. `resolveReceiver` added. |
| **Language: TypeScript (Go port planned)** | 2026-02-06 | TypeScript for everything. Go port planned for later. |
| **NexusRequest lifecycle** | 2026-02-06 | Full 9-stage lifecycle, typed schema per stage, NexusRequest↔AssembledContext mappings. |
| **Adapter System is canonical** | 2026-02-06 | `ADAPTER_SYSTEM.md` is source of truth. External CLI executables. |
| **Session keys from ACL** | 2026-02-06 | Entity-based for known, channel-based for unknown. Aliases for promotion. |
| **NEX Daemon spec** | 2026-02-06 | `nex/DAEMON.md` — process lifecycle, signals, health, CLI, crash recovery. |
| **Spec consistency pass** | 2026-02-09 | Full audit and cleanup. NEX.md refreshed, config standardized to `config.json`, cross-refs fixed, Memory System docs consolidated, NEXUS_STRUCTURE.md updated, capabilities coarsened, `platform` over `os`, `session_key` over `session_id`, `NexusEvent` over `AdapterEvent`, `triggers` over `hooks.*`, CLI-based automation registration, Events Ledger `direction` column added. |
| **Upstream checkpoint** | 2026-02-09 | openclaw HEAD at `6397e53f3` (Feb 9, 2026). Key changes since baseline: `dm`→`direct` rename, compaction hardening, context overflow recovery, QMD memory backend. |

---

## Active Hard Cutover TODO: Node -> Device Adapter Model

Source of truth:

1. `specs/nex/workplans/NODE_ECOSYSTEM_REDESIGN_FOR_NEX_CORE_2026-02-26.md`

Execution checklist:

- [x] Phase A: spec/contract freeze
- [x] Add canonical runtime operations: `device.host.list`, `device.host.describe`, `device.host.invoke`
- [x] Add canonical external adapter control-session operation: `adapter.control.start`
- [x] Align `specs/nex/UNIFIED_RUNTIME_OPERATION_MODEL.md` to new device-host surface
- [x] Align `specs/nex/ADAPTER_INTERFACE_UNIFICATION.md` to new device-host surface
- [x] Align `specs/delivery/sdk/ADAPTER_SDK_OPERATION_MODEL_CUTOVER.md` to include device-control session
- [x] Align IAM + identity specs to device entities (`type='device'`) and remove `node` system-origin shortcut
- [x] Phase B: runtime implementation (`device.host.*` handlers + adapter-control session manager)
  - [x] `device.host.*` handlers implemented and wired through control-plane taxonomy
  - [x] `adapter.control.start` runtime handler + adapter manager control-session path implemented
- [x] Phase C: IAM/entity implementation (device entity creation on pair approval + contact bindings)
  - [x] Replace node-pair persistence usage with device-pair persistence
  - [x] Create/update device entities + `platform=device` contacts on pairing approval (manual + silent)
  - [x] Remove `node` from IAM system-origin shortcut set
  - [x] Remove bootstrap identity seeding from legacy node-pair store
- [x] Phase D: SDK implementation (TS + Go control-session APIs + conformance tests)
- [ ] Phase E: adapter project split and migration (`ios`, `macos`, `android`, `headless`)
  - [x] Create dedicated device adapter projects:
    - [x] `nexus-adapter-device-headless`
    - [x] `nexus-adapter-device-ios`
    - [x] `nexus-adapter-device-macos`
    - [x] `nexus-adapter-device-android`
  - [x] Implement canonical operation surface in each device adapter project (`adapter.info`, `adapter.health`, `adapter.accounts.list`, `adapter.control.start`, `adapter.setup.*`)
  - [x] Validate adapter repo suites:
    - [x] `go test ./...` passes in each dedicated device adapter project
    - [x] CLI smoke for `adapter.info` + `adapter.control.start` invoke lifecycle per project
  - [x] Migrate app-side runtime clients off legacy WS `node.invoke.request/result` + `node.event` wire semantics
  - [x] Replace in-app `role=node` command/control coupling with dedicated device adapter control sessions
  - [ ] Validate parity for chat/talk subscriptions and invoke response lifecycle on canonical adapter-control path
    - [x] Runtime e2e: ws-host `device.host.invoke` -> `invoke.request` -> `invoke.result` lifecycle
    - [x] Runtime e2e: dedicated adapter projects matrix (`ios`/`macos`/`android`/`headless`) covering `adapter.info`, `adapter.setup.*`, `adapter.control.start`, `device.host.list/describe/invoke`
    - [ ] App/device e2e: chat/talk subscription parity on iOS/macOS/Android clients
- [x] Phase F: legacy deletion (`node.*` handlers, node-pair store, node-only CLI/tool residue)
  - [x] Delete legacy node-pair store module (`src/infra/node-pairing.ts`)
  - [x] Remove runtime startup wiring to legacy remote skill/node-pair probing
  - [x] Migrate remaining user-facing `/ptt` runtime callsite from `node.*` to `device.host.*`/`device.pair.*`
  - [x] Delete unreachable in-tree `nexus node` CLI + `src/node-host/*` legacy host stack
  - [x] Remove orphaned `nodeHost` config schema/types surface
  - [x] Remove legacy runtime node command allow/deny policy (`runtime.nodes.allowCommands` / `runtime.nodes.denyCommands`) and onboarding seeding
  - [x] Migrate Control UI node inventory fetch from `node.list` to `device.host.list`
  - [x] Remove macOS legacy node pairing approval path (`node.pair.*`) and keep canonical `device.pair.*` prompter flow
  - [x] Migrate macOS node inventory polling from `node.list` to `device.host.list`
  - [x] Remove dead legacy node event plumbing (`server-node-events*`) from control-plane core
  - [x] Remove legacy `Node*` protocol schema/validator exports from runtime protocol surface
  - [x] Remove legacy node subscription manager (`server-node-subscriptions*`) and replace runtime hooks with explicit no-op stubs
  - [x] Remove runtime `NodeRegistry`/legacy node invoke fallback and keep `device.host.*` on canonical adapter-control endpoints only
- [ ] End-to-end validation across all device adapter targets
  - [x] Non-live validation matrix complete (runtime e2e + dedicated adapter repo unit/smoke suites)
  - [ ] True companion-app/device E2E on physical hosts (explicitly deferred for now)

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
| **Language Decision** | `project-structure/LANGUAGE_AND_ARCHITECTURE.md` | ✅ |
| **Memory System Integration** | `data/memory/` (Memory System docs) | ✅ |

---

## Implementation Phase

### Active

| Task | Location | Notes |
|------|----------|-------|
| **Eve Adapter** | `channels/imessage/EVE_ADAPTER_PLAN.md` | First adapter — implementing now |
| **Channel Adapter Cutover** | `runtime/adapters/CHANNEL_MIGRATION_TRACKER.md` | Priority order: eve -> gog -> discord/telegram/whatsapp -> ingress + clock |
| **Hosted Frontdoor + Per-Tenant Runtime** | `runtime/nex/HOSTED_FRONTDOOR_PER_TENANT_RUNTIME.md`, `runtime/nex/HOSTED_RUNTIME_PROFILE.md` | Runtime-side hosted profile shipped. Frontdoor scaffold shipped at `home/projects/nexus/nexus-frontdoor` (password auth + OIDC JWK verification + tenant proxy + token mint/refresh/revoke + live-stack + browser smoke e2e). Remaining: key rotation strategy + full hosted Control UI integration. |
| **Hosted Frontdoor Confidence Workplan** | `runtime/nex/HOSTED_FRONTDOOR_CONFIDENCE_WORKPLAN.md` | Execute phased validation: live-stack e2e (real runtime + real frontdoor), cross-tenant isolation, anti-spoof proxy tests, then OIDC verification + browser smoke. |
| **Hosted Frontdoor Multi-Workspace Access** | `runtime/nex/HOSTED_FRONTDOOR_MULTI_WORKSPACE.md` | New design spec for one user -> many workspace memberships with explicit workspace selection before runtime token mint/connect. Review + approve before implementation. |
| **Hosted Workspace UX + Lifecycle** | `runtime/nex/HOSTED_WORKSPACE_UX_LIFECYCLE.md` | Product-level UX + operating model for signup/login, workspace creation policy, invites, switching, and VPS/service/tenant topology. Review and lock before implementation. |
| **Oracle + Multi-UI Tenant Integration** | `specs/nex/HOSTED_ORACLE_MULTI_UI_INTEGRATION.md` | Design lock for Oracle GitHub App + Oracle UI in tenant runtime, runtime multi-app mounts, and frontdoor workspace/app launch model (hard cutover, no frontdoor Oracle data plane). |
| **Runtime Multi-UI Cutover (Phase 1)** | `specs/nex/RUNTIME_MULTI_UI_CUTOVER.md` | Implement runtime app registry + `/api/apps` + strict `/app/<app_id>` mount routing; remove bare `/app/*` fallback. |
| **Frontdoor Multi-UI Launch (Phase 2)** | `specs/nex/FRONTDOOR_MULTI_UI_LAUNCH.md` | Implement workspace+app selector in hosted shell, runtime-driven app catalog fetch, and app-aware launch path (replace hardcoded `/app/chat`). |
| **Legacy Node + Session Surface Hard Cutover** | `specs/nex/workplans/LEGACY_NODE_AND_SESSION_SURFACE_HARD_CUTOVER_2026-02-26.md` | In progress: re-baselined green suites after CLI node quarantine cut (unit 708/4294, e2e 66/268+13 skipped). Top-level `nodes`/`node` CLI exposure removed; remaining node redesign scope is isolated/deferred. |

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
| **P0** | NEX pipeline (9 stages) | `nex/NEX.md`, `nex/NEXUS_REQUEST.md` | Central orchestrator |
| **P0** | Adapter manager + Eve | `adapters/ADAPTER_SYSTEM.md` | First I/O channel |
| **P1** | Context assembly | `broker/CONTEXT_ASSEMBLY.md` | Full context building |
| **P1** | Session management | `broker/SESSION_LIFECYCLE.md` | Turn processing, queues, compaction |
| **P1** | IAM (identity + ACL) | `iam/ACCESS_CONTROL_SYSTEM.md` | Who can do what |
| **P1** | Event bus + SSE | `nex/BUS_ARCHITECTURE.md` | Real-time coordination |
| **P1** | Daemon process | `nex/DAEMON.md` | Ties it all together |
| **P2** | Streaming | `runtime/STREAMING.md` | Token-level delivery |
| **P2** | Automations | `nex/automations/AUTOMATION_SYSTEM.md` | Proactive/reactive hooks |
| **P2** | Memory System integration | `data/memory/README.md` | Semantic memory layer |

---

## Remaining Spec Work

Small items — none blocking implementation.

| TODO | Priority | Notes |
|------|----------|-------|
| **Clock Adapter** | Done | `CLOCK_ADAPTER.md` — DESIGN LOCKED + IMPLEMENTED |
| **Automation Skill** | Medium | Create `skills/guides/automations/SKILL.md` so agents can write automations |
| **LedgerClient Interface** | Medium | Define API surface for automation scripts to query ledgers |
| **MemoryClient Interface** | Medium | Define API surface for semantic search in automations |
| **Model Catalog** | Low | Provider/model registry — figure out during Broker implementation |
| **TS Adapter SDK** | Done | `ADAPTER_SDK_TYPESCRIPT.md` spec complete |

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
| **`dm` → `direct` rename** | Done | Upstream renamed peer kind. Delivery taxonomy handles this. |

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
| ~~Config consistency~~ | Done — all docs say `config.json` |
| Enterprise/Plugin Review | Low — review when Cloud/Hub becomes relevant |

---

*Specs are clean. Fork fresh, scaffold, build.*
