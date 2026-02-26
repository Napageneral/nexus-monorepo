# NEX — Nexus Event Exchange

**Status:** ACTIVE  
**Last Updated:** 2026-02-25

---

## Overview

This folder contains the core NEX orchestrator specifications — the central pipeline that processes all events in Nexus.

---

## Documents

| Spec | Status | Description |
|------|--------|-------------|
| **`UNIFIED_RUNTIME_OPERATION_MODEL.md`** | 🧭 Design | **START HERE (authoritative)** — single runtime operation model, `NexusEvent` envelope with `operation`, unified pipeline, operation registry, adapter inventory, and hard-cutover removals |
| **`ADAPTER_INTERFACE_UNIFICATION.md`** | 🧭 Design | **Authoritative adapter contract** — one adapter interface, one SDK contract, merged operation set, and cron->clock scheduling cutover |
| **`NEX.md`** | ✅ Complete | Legacy baseline for core orchestrator internals (kept for migration context) |
| `DAEMON.md` | ✅ Complete | Process lifecycle — startup, signals, shutdown, supervision |
| `ingress/CONTROL_PLANE.md` | 🧭 Design | Single-daemon control-plane (Gateway removal) — WS RPC + HTTP endpoints live inside NEX |
| `ingress/SINGLE_TENANT_MULTI_USER.md` | 🧭 Design | Single-tenant, multi-user runtime — trust zones, auth, identity mapping, and anti-spoofing requirements |
| `ingress/INGRESS_CREDENTIALS.md` | 🧭 Design | Customer ingress credentials — API keys + persistent anonymous webchat sessions (entity-per-visitor) |
| `ingress/INGRESS_INTEGRITY.md` | 🧭 Design | Field stamping contract (daemon-stamped vs adapter/client claims) to prevent identity/policy spoofing |
| `workplans/INGRESS_CONTROL_PLANE_UNIFICATION_PLAN.md` | 🚧 Plan | Concrete build plan for control-plane IAM credential ops + internal `http-ingress` adapterization |
| `ingress/CONTROL_PLANE_AUTHZ_TAXONOMY.md` | ✅ Implemented | Control-plane action/resource taxonomy + enforcement (Option A authz) — maps WS methods to IAM permissions |
| `../_archive/HOSTED_FRONTDOOR_CONFIDENCE_WORKPLAN.md` | 🗃️ Archive | Historical phased confidence plan for hosted frontdoor |
| `hosted/HOSTED_DIRECT_BROWSER_RUNTIME_CONTRACT.md` | 🧭 Design | Canonical hosted direct browser -> tenant runtime contract (frontdoor auth/token APIs + runtime HTTP/WS/SSE auth and schema fields) |
| `hosted/HOSTED_DIRECT_BROWSER_RUNTIME_WORKPLAN.md` | 🚧 Plan | Phased implementation guide for direct browser -> tenant runtime cutover (contracts, CORS/origin, UI client bootstrap, e2e, rollout) |
| `hosted/HOSTED_ORACLE_MULTI_UI_INTEGRATION.md` | 🧭 Design | Canonical Oracle + multi-UI architecture: frontdoor auth/routing only, tenant-owned Oracle GitHub App/data plane, runtime app mounts, and NexusEvent/IAM execution model |
| `hosted/ORACLE_GITHUB_APP_INTEGRATION.md` | 🚧 Plan | Tenant-scoped Oracle GitHub App onboarding and webhook integration contract |
| `hosted/ORACLE_RUNTIME_MODULE.md` | 🚧 Plan | Oracle app package/runtime module contract for tenant install/mount/lifecycle |
| `hosted/ORACLE_E2E_VALIDATION_PLAN.md` | 🚧 Plan | End-to-end hosted validation matrix for Oracle onboarding + runtime integration |
| `workplans/RUNTIME_MULTI_UI_CUTOVER.md` | 🚧 Plan | Phase 1 runtime app-model implementation: `/app/<app_id>` mount contract, `/api/apps` catalog, and hard cutover away from bare `/app/*` |
| `hosted/FRONTDOOR_MULTI_UI_LAUNCH.md` | 🚧 Plan | Phase 2 frontdoor shell implementation: workspace+app selection, runtime-driven app catalog, and app-aware launch routing |
| `SURFACE_ADAPTER_V2.md` | 🧭 Design | Historical migration record only (dual-role model). Superseded by `UNIFIED_RUNTIME_OPERATION_MODEL.md` + `ADAPTER_INTERFACE_UNIFICATION.md` |
| `ENTITY_SYMMETRIC_ROUTING_AND_PERSONA_BINDING.md` | 🧭 Design | Canonical sender/receiver symmetry, entity-based session identity, no-atlas-fallback routing, persona binding model, and mandatory continuity transfer rules |
| `AGENT_ENTITY_AND_PERSONA_LANGUAGE_ALIGNMENT_CUTOVER_2026-02-26.md` | 🚧 Plan | Hard-cutover language alignment: `agent_id` as receiver identity alias, `persona_ref` as persona selector, and policy/runtime cleanup |
| `CANONICAL_SESSION_ROUTING_CONTROL_PLANE_CUTOVER_2026-02-26.md` | 🚧 Plan | Hard-cutover control-plane routing alignment: stop synthesizing `agent:*` defaults, route canonically by resolved identities, keep explicit session targeting only |
| `AGENT_INGEST_PERSONA_REF_CUTOVER_2026-02-26.md` | 🚧 Plan | Hard-cutover API language alignment for `event.ingest` (`ingress_type:"agent"`): replace selector key `agentId` with `personaRef` |
| `workplans/ENTITY_SYMMETRIC_ROUTING_AND_PERSONA_BINDING_WORKPLAN.md` | 🚧 Plan | Detailed hard-cutover execution plan: schema, runtime stage changes, migration, and validation matrix |
| `workplans/SESSION_IMPORT_SERVICE.md` | 🧭 Design | Gateway-free AIX import adapter plan — NEX-owned session import/chunk service |
| `NEXUS_REQUEST.md` | ✅ Complete | The data bus that accumulates context through pipeline |
| `PLUGINS.md` | ✅ Complete | NEX plugin system (hook points) |
| `../delivery/STREAMING.md` | ✅ Complete | Canonical runtime streaming architecture |
| `BUS_ARCHITECTURE.md` | ✅ Complete | Internal real-time pub/sub |
| `../_archive/AUTOMATION_SYSTEM.md` | 🗃️ Archive | Historical automation system spec (superseded by runtime + hooks/automations docs) |

---

## Core Concept: NexusRequest (Legacy Baseline)

Note: The evolving canonical target is now in `UNIFIED_RUNTIME_OPERATION_MODEL.md` (single runtime operation model with top-level `NexusEvent.operation`). Keep this section as historical context until full cutover is complete.

Canonical runtime operation contract file in code: `nex/src/nex/control-plane/runtime-operations.ts`.

The `NexusRequest` is an accumulating context object that flows through the entire pipeline. Each stage adds its context, and by the end we have a complete record of everything that happened.

```
Event Arrives
     │
     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  NEXUS REQUEST (accumulates through pipeline)                           │
│                                                                          │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐  │
│  │   EVENT     │ → │    ACL      │ → │   HOOKS     │ → │   BROKER    │  │
│  │             │   │             │   │             │   │             │  │
│  │ + delivery  │   │ + sender    │   │ + fired     │   │ + agent_id  │  │
│  │ + platform  │   │ + perms     │   │ + context   │   │ + turn_id   │  │
│  │ + container │   │ + session   │   │             │   │             │  │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘  │
│                                                                          │
│                              ↓                                           │
│                                                                          │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                    │
│  │   AGENT     │ → │  DELIVERY   │ → │   LEDGER    │                    │
│  │             │   │             │   │             │                    │
│  │ + response  │   │ + result    │   │ (persisted) │                    │
│  │ + tools     │   │ + msg_ids   │   │             │                    │
│  └─────────────┘   └─────────────┘   └─────────────┘                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Benefits

1. **Debuggable** — Full trace of what happened at each stage
2. **Auditable** — Complete record persisted to ledger
3. **Contextual** — Agent sees everything accumulated so far
4. **Cacheable** — System prompt stays static, context passed per-turn

---

## Design Principles

### 1. Accumulate, Don't Replace

Each pipeline stage ADDS to the request, doesn't replace. Previous stages' context remains available.

### 2. Static System Prompt

The system prompt should be static and cacheable. Dynamic context (channel, capabilities, etc.) is passed in the turn, not the system prompt.

### 3. On-Demand Guidance

Instead of bloating the system prompt with all possible formatting rules, provide guidance on-demand when specific tools are called.

### 4. Full Persistence

The complete `NexusRequest` (including all accumulated context) is persisted to the Nexus Ledger for debugging and audit.

---

## Related Specs

- `../delivery/` — Channel/event adapters that populate delivery context
- `../iam/` — IAM that resolves identity and permissions
- `../broker/` — Broker that executes agents
