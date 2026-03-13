# Nex API Spec Index

**Purpose:** Single-page map of the entire Nex API target state. Navigate from here to detailed specs.
**Last Updated:** 2026-03-08

---

## Quick Stats

| Metric | Count |
|--------|-------|
| **Total domains** | 23 |
| **Total operations** | ~196 |
| **Spec documents** | 17 (batch specs + architectural specs) |
| **Supporting specs** | 10+ (memory, agents, adapters, hosted) |
| **Databases** | 7 SQLite ledgers (records, agents, identity, memory, embeddings, runtime, work) |

---

## All Domains by Category

### Core Runtime

| Domain | Ops | Batch | Spec | Notes |
|--------|-----|-------|------|-------|
| `status` | 1 | B5 | [Batch 5](./API_DESIGN_BATCH_5.md) | THE agent sitrep command (bare top-level) |
| `runtime.health` | 1 | B5 | [Batch 5](./API_DESIGN_BATCH_5.md) | Lightweight liveness probe |
| `pubsub.*` | 3 | B1 | [Batch 1](./API_DESIGN_DECISIONS.md) | Internal event bus (subscribe, publish, unsubscribe) |

### Records & Chat

| Domain | Ops | Batch | Spec | Notes |
|--------|-----|-------|------|-------|
| `record.ingest` | 1 | B1 | [Batch 1](./API_DESIGN_DECISIONS.md) | Canonical live ingress for one external record |
| `records.*` | 4 | B1+B5 | [Batch 1](./API_DESIGN_DECISIONS.md) | List, get, search, backfill for persisted records |
| `chat.*` | 3 | B1 | [Batch 1](./API_DESIGN_DECISIONS.md) | Send, history, abort |

### Agents & Sessions

| Domain | Ops | Batch | Spec | Notes |
|--------|-----|-------|------|-------|
| `agents.*` (CRUD) | 7 | B4 | [Batch 4](./API_DESIGN_BATCH_4.md) | Agent lifecycle + identity + wait |
| `agents.sessions.*` | 11 | B1 | [Batch 1](./API_DESIGN_DECISIONS.md) | Session CRUD, fork, archive, transfer, import |
| `agents.turns.*` | 2 | B1 | [Batch 1](./API_DESIGN_DECISIONS.md) | List, get |
| `agents.messages.*` | 2 | B1 | [Batch 1](./API_DESIGN_DECISIONS.md) | List, get |
| `agents.sessions.queue.*` | 2 | B1 | [Batch 1](./API_DESIGN_DECISIONS.md) | List, cancel |
| `agents.configs.*` | 5 | B6 | [Batch 6](./API_DESIGN_BATCH_6.md) | Named config presets (Role primitive) |

### Identity & Access

| Domain | Ops | Batch | Spec | Notes |
|--------|-----|-------|------|-------|
| `entities.*` | 14 | B2 | [Batch 2](./API_DESIGN_BATCH_2.md) | CRUD + tags + merge |
| `contacts.*` | 7 | B2 | [Batch 2](./API_DESIGN_BATCH_2.md) | Platform identity bindings |
| `groups.*` | 8 | B2 | [Batch 2](./API_DESIGN_BATCH_2.md) | Hierarchical groups + membership |
| `auth.*` | 6 | B2 | [Batch 2](./API_DESIGN_BATCH_2.md) | Tokens + passwords + login |
| `credentials.*` | 9 | B2 | [Batch 2](./API_DESIGN_BATCH_2.md) | Outbound secret management |
| `acl.*` | 20 | B2 | [Batch 2](./API_DESIGN_BATCH_2.md) | Policies (7) + grants (4) + requests (5) + audit (3) + evaluate (1) |

### Memory

| Domain | Ops | Batch | Spec | Notes |
|--------|-----|-------|------|-------|
| `memory.elements.*` | 11 | B3 | [Batch 3](./API_DESIGN_BATCH_3.md) | Knowledge CRUD + links + traversal |
| `memory.recall` | 1 | B3 | [Batch 3](./API_DESIGN_BATCH_3.md) | Unified multi-layer search |
| `memory.sets.*` | 5 | B3 | [Batch 3](./API_DESIGN_BATCH_3.md) | Polymorphic data collections |
| Special agent tools | 3 | B3 | [Batch 3](./API_DESIGN_BATCH_3.md) | memory.entities.create/confirm, memory.consolidate |

### Workspaces

| Domain | Ops | Batch | Spec | Notes |
|--------|-----|-------|------|-------|
| `workspaces.*` | 10 | B4 | [Batch 4](./API_DESIGN_BATCH_4.md) | Manifest-driven workspace primitive |

### Adapters & Channels

| Domain | Ops | Batch | Spec | Notes |
|--------|-----|-------|------|-------|
| `adapters.connections.*` | 13 | B5 | [Batch 5](./API_DESIGN_BATCH_5.md) | Connection lifecycle, OAuth, API key, custom setup |
| `channels.*` (data) | 6 | B2 | [Batch 2](./API_DESIGN_BATCH_2.md) | Channel records, participants, history |
| `channels.*` (delivery) | 7 | B5 | [Batch 5](./API_DESIGN_BATCH_5.md) | Send, stream, react, edit, delete |

### Jobs, Schedules & DAGs (Unified Work Domain)

| Domain | Ops | Batch | Spec | Notes |
|--------|-----|-------|------|-------|
| `jobs.*` | 8 | B6 | [Batch 6](./API_DESIGN_BATCH_6.md) | Unified job definitions + runs. Replaces automations, work tasks, memory jobs |
| `schedules.*` | 6 | B6 | [Batch 6](./API_DESIGN_BATCH_6.md) | Time-based scheduling using cron expressions. Replaces clock.schedule |
| `dags.*` | 10 | B6 | [Batch 6](./API_DESIGN_BATCH_6.md) | Workflow DAGs with dependencies, conditions, delays |

### Skills, Models & Apps

| Domain | Ops | Batch | Spec | Notes |
|--------|-----|-------|------|-------|
| `skills.*` | 3 | B5 | [Batch 5](./API_DESIGN_BATCH_5.md) | List, use, search |
| `models.*` | 2 | B5 | [Batch 5](./API_DESIGN_BATCH_5.md) | Computed from credentials |
| `apps.*` | 9 | B5 | [Batch 5](./API_DESIGN_BATCH_5.md) | Runtime lifecycle |

### Browser & Wizard

| Domain | Ops | Batch | Spec | Notes |
|--------|-----|-------|------|-------|
| `browser.*` | 1 | B6 | [Batch 6](./API_DESIGN_BATCH_6.md) | Proxy to internal HTTP API. Full redesign deferred. |
| `wizard.*` | 4 | B6 | [Batch 6](./API_DESIGN_BATCH_6.md) | RPC protocol (start/next/cancel/status). Content redesign deferred. |

### Misc

| Domain | Ops | Batch | Spec | Notes |
|--------|-----|-------|------|-------|
| `tools.invoke` | 1 | B5 | [Batch 5](./API_DESIGN_BATCH_5.md) | HTTP-only tool invocation endpoint |

---

## Key Architectural Decisions

| Decision | Where | Summary |
|----------|-------|---------|
| **Database models ARE the objects** | [Batch 1](./API_DESIGN_DECISIONS.md) | API is a typed projection of ~75 tables, not an abstraction above them |
| **CRUD verbs on objects** | [Batch 1](./API_DESIGN_DECISIONS.md) | Standard verb set: list, get, create, update, delete, search + domain-specific |
| **Ideal end state, not migration** | [Batch 1](./API_DESIGN_DECISIONS.md) | Hard cutover. No backwards compat. |
| **Immutable-first** | [Batch 1](./API_DESIGN_DECISIONS.md), [Immutable Row Pattern](./IMMUTABLE_ROW_PATTERN.md) | Append-only where possible. Records, turns, messages immutable. |
| **Records vs events** | [Communication Model](./COMMUNICATION_MODEL.md) | External persisted inputs are `records`; `events` are internal runtime notifications only. |
| **Conversation vs session** | [Communication Model](./COMMUNICATION_MODEL.md) | `conversation` is the immutable public communication boundary; `session` is the internal agent continuity derived from it. |
| **Persona vs workspace** | [Communication Model](./COMMUNICATION_MODEL.md), [Workspace Primitive](./WORKSPACE_PRIMITIVE.md) | `persona` remains the conceptual identity/voice contract, but persisted bindings use `workspace_id`; workspaces are the file-backed context surfaces. |
| **Pipeline = same API as external** | [Batch 1](./API_DESIGN_DECISIONS.md) | Internal pipeline uses the same canonical operations and event contracts as external callers |
| **Four API contracts** | [API Contract Model](./API_CONTRACT_MODEL.md) | Top-level API split is Frontdoor API, Nex API, Adapter API, and App API. Route families and transports do not create new API categories. |
| **Adapter package contract boundary** | [Adapter API Capture And Publication Model](./ADAPTER_API_CAPTURE_AND_PUBLICATION_MODEL.md) | Adapter API means the adapter-owned package contract, not the Nex runtime `adapter.*` wrapper API. First-wave per-adapter OpenAPI publishes ordinary JSON request/response package operations only. |
| **OpenAPI is a projection** | [OpenAPI Contract Artifact Model](./OPENAPI_CONTRACT_ARTIFACT_MODEL.md) | Machine-readable API artifacts are generated from the owning contract model and published centrally under `contracts/`. |
| **Plural by default, singular for one-record ingress** | [Communication Model](./COMMUNICATION_MODEL.md), [Nexus Request Target](./NEXUS_REQUEST_TARGET.md) | `record.ingest` is the deliberate single-record exception; collection and batch operations stay plural (`records.*`). |
| **Nex API vs Adapter SDK** | [Batch 5](./API_DESIGN_BATCH_5.md) | Two distinct taxonomies. Adapter SDK verbs NOT in Nex operation taxonomy. |
| **Channels as delivery abstraction** | [Batch 5](./API_DESIGN_BATCH_5.md), [MA Communications](./MANAGER_AGENT_COMMUNICATIONS.md) | Send on channels, not adapters. Channel resolves to adapter+account. |
| **Persona / Role / Job split** | [Work Unification](./WORK_DOMAIN_UNIFICATION.md), [Communication Model](./COMMUNICATION_MODEL.md) | Persona = WHO, role = HOW, job = WHAT. Persisted bindings use `workspace_id`; `agent_configs` own role/execution behavior. |
| **Job as universal primitive** | [Work Unification](./WORK_DOMAIN_UNIFICATION.md) | Jobs are the durable execution primitive across automations, work items, memory processing, and scheduled work. |
| **Subscriptions vs queue vs runs** | [Work Unification](./WORK_DOMAIN_UNIFICATION.md), [Job Runtime Proposal](./workplans/JOB_RUNTIME_AND_DAG_ENGINE.md) | `event_subscriptions` match internal runtime events, `job_queue` is mutable durable execution state, and `job_runs` are immutable audit history. |
| **DAG as workflow primitive** | [Work Unification](./WORK_DOMAIN_UNIFICATION.md) | Nodes = job definitions, edges = dependencies. Replaces workflows/sequences. |
| **Time vs event triggers** | [Work Unification](./WORK_DOMAIN_UNIFICATION.md) | Time-based work uses `job_schedules` exposed through `schedules.*`; non-blocking reactive work uses `event_subscriptions` over internal runtime events. |
| **Job runs ARE the audit trail** | [Work Unification](./WORK_DOMAIN_UNIFICATION.md) | `job_queue` handles mutable operational state; `job_runs` remain the immutable execution history. |
| **Script hash versioning** | [Work Unification](./WORK_DOMAIN_UNIFICATION.md) | Hash change → auto-create new version with immutable lineage chain |
| **Agent config in database** | [Batch 6](./API_DESIGN_BATCH_6.md) | Named presets, immutable snapshots, A/B testing, attribution via config_id on turns |
| **Connection architecture precedence** | [ADAPTER_CONNECTION_ARCHITECTURE.md](./adapters/ADAPTER_CONNECTION_ARCHITECTURE.md), [ADAPTER_CONNECTION_PROFILES_AND_CALLBACKS.md](./adapters/ADAPTER_CONNECTION_PROFILES_AND_CALLBACKS.md) | `connection_id`, `authMethodId`, app/server scope, managed profiles, and callback ownership live in the newer adapter docs. |
| **TTS extracted to package** | [TTS Extraction](./TTS_EXTRACTION.md) | Not core. Standalone tool, accessed via skill document. |
| **Wizard deferred** | [Wizard Redesign](./WIZARD_REDESIGN.md) | Full redesign after runtime solidifies. 4 RPC ops kept. |

---

## Supersession Map

What Batch 6 changes about earlier batches:

| Earlier Spec | What Changed | Details |
|-------------|-------------|---------|
| **Batch 3** `memory.jobs.*` (4 ops) | Absorbed into unified `jobs.*` | Memory pipeline uses unified job definitions. memory.jobs.list → jobs.runs.list with filters. |
| **Batch 4** `automations.*` (11 ops) | Replaced by `jobs.*` (8 ops) | Automations collapse into `job_definitions` + `event_subscriptions` + `job_queue` + `job_runs`. |
| **Batch 4** `cron.*` (10 ops) | Replaced by `schedules.*` (6 ops) | Schedule format simplified (expression + date range). Legacy cron naming is collapsed into the schedule model. |
| **Batch 5** `tts.*` + `talk.*` (8 ops) | Removed from core | Extracted to standalone package. |

---

## Unified Schemas (Batch 6 Work Domain)

9 tables replacing ~15 across the prior automation and work surfaces. Full schemas in [WORK_DOMAIN_UNIFICATION.md](./WORK_DOMAIN_UNIFICATION.md).

| Table | Fields | Replaces |
|-------|--------|----------|
| `job_definitions` | 15 | automations, tasks, memory job type registry, cron_jobs (def part) |
| `event_subscriptions` | 6 | event-triggered automation bindings, hook matcher config |
| `job_schedules` | 11 | cron_jobs (schedule part), clock tick, work scheduler |
| `job_queue` | 16 | mutable taskengine-style queue state, retry bookkeeping, lease state |
| `job_runs` | 16 | hook_invocations, work_items, memory-local jobs, work_item_events |
| `dag_definitions` | 5 | workflows |
| `dag_nodes` | 7 | workflow_steps |
| `dag_runs` | 10 | sequences |
| `agent_configs` | 12 | canonical role/execution profiles, replaces hardcoded role-caps.ts and turn-local effective_config_json |

---

## All Spec Documents

### Batch Specs (API Design)

| Document | Status | Domains |
|----------|--------|---------|
| [API_DESIGN_DECISIONS.md](./API_DESIGN_DECISIONS.md) | COMPLETE | Batch 1 rationale: Records, PubSub, Sessions, Chat |
| [API_DESIGN_BATCH_2.md](./API_DESIGN_BATCH_2.md) | COMPLETE | Entities, Contacts, Auth, Credentials, ACL, Groups |
| [API_DESIGN_BATCH_3.md](./API_DESIGN_BATCH_3.md) | COMPLETE | Memory: Elements, Recall, Sets, Jobs, Agent Tools |
| [API_DESIGN_BATCH_4.md](./API_DESIGN_BATCH_4.md) | COMPLETE | Agents, Workspaces, Automations*, Cron* |
| [API_DESIGN_BATCH_5.md](./API_DESIGN_BATCH_5.md) | COMPLETE | Adapters, Channels, Runtime, Skills, Models, Apps |
| [API_DESIGN_BATCH_6.md](./API_DESIGN_BATCH_6.md) | COMPLETE | Jobs, Schedules, DAGs, Agent Config, Browser, TTS, Wizard |

*Automations and legacy cron naming in Batch 4 are superseded by Batch 6 unification.

### Architectural Specs

| Document | Scope |
|----------|-------|
| [WORK_DOMAIN_UNIFICATION.md](./WORK_DOMAIN_UNIFICATION.md) | Canonical work model: jobs, job schedules, job runs, DAGs, and agent configs. |
| [COMMUNICATION_MODEL.md](./COMMUNICATION_MODEL.md) | Canonical communication nouns and boundaries: record, event, conversation, session, persona, workspace. |
| [API_CONTRACT_MODEL.md](./API_CONTRACT_MODEL.md) | Canonical API ownership split: Frontdoor API, Nex API, Adapter API, App API, plus OpenAPI and SDK projection rules. |
| [ADAPTER_API_CAPTURE_AND_PUBLICATION_MODEL.md](./ADAPTER_API_CAPTURE_AND_PUBLICATION_MODEL.md) | Canonical adapter-owned package contract boundary and first-wave per-adapter OpenAPI publication model. |
| [OPENAPI_CONTRACT_ARTIFACT_MODEL.md](./OPENAPI_CONTRACT_ARTIFACT_MODEL.md) | Canonical central storage and generation model for OpenAPI artifacts across Frontdoor API, Nex API, App API, and Adapter API. |
| [TRANSPORT_SURFACE_MODEL.md](./TRANSPORT_SURFACE_MODEL.md) | Canonical transport model: real wire transports only, internal dispatch is not a surface, browser app launch is not an operation, and ordinary Nex API operations are transport-neutral. |
| [RUNTIME_API_BOUNDARY_AND_EXTENSION_OWNERSHIP.md](./RUNTIME_API_BOUNDARY_AND_EXTENSION_OWNERSHIP.md) | Canonical ownership boundary for the Nex API, browser document routing, App APIs, Adapter APIs, and hosted relays. |
| [RUNTIME_API_AUTHZ_TAXONOMY.md](./RUNTIME_API_AUTHZ_TAXONOMY.md) | Canonical method-based IAM taxonomy for Nex runtime methods and `core.<resource>.<action>` permissions. |
| [OPERATION_TAXONOMY.md](./OPERATION_TAXONOMY.md) | Full 147-operation pre-redesign taxonomy (reference/baseline) |
| [NEX_ARCHITECTURE_AND_SDK_MODEL.md](./NEX_ARCHITECTURE_AND_SDK_MODEL.md) | Nex runtime architecture |
| [CREDENTIAL_AND_ADAPTER_CONNECTION_SYSTEM.md](./CREDENTIAL_AND_ADAPTER_CONNECTION_SYSTEM.md) | Credential storage and credential-resolution access control. Adapter connection architecture is now canonical in the newer adapter docs. |
| [MANAGER_AGENT_COMMUNICATIONS.md](./MANAGER_AGENT_COMMUNICATIONS.md) | MA communication chain, sender identity resolution |
| [SESSION_ROUTING_UNIFICATION.md](./SESSION_ROUTING_UNIFICATION.md) | Superseded historical note. Public routing now lives in the conversation/session split. |
| [HOOK_SYSTEM_UNIFICATION.md](./HOOK_SYSTEM_UNIFICATION.md) | 4 hook systems → 1 |
| [WORKSPACE_PRIMITIVE.md](./WORKSPACE_PRIMITIVE.md) | Workspace as file-backed context surface, separate from persona |
| [IMMUTABLE_ROW_PATTERN.md](./IMMUTABLE_ROW_PATTERN.md) | Append-only data patterns |
| [ADAPTER_INTERFACE_UNIFICATION.md](./ADAPTER_INTERFACE_UNIFICATION.md) | One adapter interface, one SDK |

### Deferred Design Notes

| Document | Scope |
|----------|-------|
| [TTS_EXTRACTION.md](./TTS_EXTRACTION.md) | Extract TTS as standalone package |
| [WIZARD_REDESIGN.md](./WIZARD_REDESIGN.md) | Full wizard ground-up redesign |

### External Spec References

| Document | Location | Scope |
|----------|----------|-------|
| MEMORY_SYSTEM.md | `specs/memory/` | Master memory architecture |
| MEMORY_STORAGE_MODEL.md | `specs/memory/` | Storage schema: elements, sets, jobs |
| MEMORY_RECALL.md | `specs/memory/` | Recall API: strategies, fusion, budget |
| RETAIN_PIPELINE.md | `specs/memory/` | Episode lifecycle, writer dispatch |
| MEMORY_WRITER.md | `specs/memory/` | Writer meeseeks workflow |
| MEMORY_CONSOLIDATION.md | `specs/memory/` | Consolidation meeseeks workflow |
| MEESEEKS_PATTERN.md | `specs/agents/` | Meeseeks automation architecture |
| SESSION_LIFECYCLE.md | `specs/agents/` | Session lifecycle, key formats |
| BROKER.md | `specs/agents/` | Agent broker: routing, context |
| ADAPTER_CONNECTION_ARCHITECTURE.md | `specs/nex/adapters/` | Shared adapter packages, app connection profiles, managed profiles, connection scope |
| ADAPTER_CONNECTION_PROFILES_AND_CALLBACKS.md | `specs/nex/adapters/` | Auth method ids, callback ownership, reusable webhooks, connection start/completion contract |
| HOSTED_PRODUCT_CONTROL_PLANES.md | `specs/nex/hosted/` | Platform control plane vs product control plane, admin apps, managed provider ownership |
| HOSTED_PRODUCT_CONTROL_PLANE_SHELL.md | `specs/nex/hosted/` | Reusable shell for product control plane services and admin apps across products |

---

## Dropped / Removed from Target State

Operations that existed in the pre-redesign taxonomy but are explicitly NOT in the target:

| Dropped | Reason | Batch |
|---------|--------|-------|
| `system-presence` | Folded into adapter health | B5 |
| `delivery.poll` | No channel equivalent | B5 |
| `usage.*` (5 ops) | Per-turn tracking in agents.db | B5 |
| `capabilities.*` | Computed view in status | B5 |
| `packs.*` | Superseded by adapters/apps | B5 |
| `device.pair/host/token.*` | Folded into adapters | B5 |
| `skills.install/update/reset/diff/verify/scan/info` | Deferred or folded | B5 |
| `tts.*` + `talk.*` (8 ops) | Extracted to standalone package | B6 |
| `work.*` (18 ops) | Absorbed into jobs/dags/schedules | B6 |
| `automations.*` (11 ops) | Absorbed into jobs | B6 |
| `memory.jobs.*` (4 ops) | Absorbed into jobs | B6 |
| Old `cron.*` (10 ops) | Replaced by `schedules.*` | B6 |
| `data_access` level | Fully purged | B2 |
| `channels.logout` | Superseded by adapters.connections.disconnect | B5 |
| `web.login.*` | Legacy, dropped | B5 |

---

## Open Items / Deferred Work

| Item | Source | Priority |
|------|--------|----------|
| Deep pass: full input/output schemas for all operations | All batches | Next phase |
| `status` output shape alignment with all Batch 1-6 domains | B5 | Deep pass |
| Channel → Adapter → Account resolution chain detail | B5 | Deep pass |
| Browser full API redesign (44 routes → proper operations) | B6 | Future |
| Wizard content redesign (after runtime solidifies) | B6 | Future |
| TTS package extraction implementation | B6 | Future |
| `pubsub.publish` exposure posture (client-facing vs policy-restricted by default) | B1 | Deep pass |
| Record query operation shape (`records.list/get/search`) full schema alignment | B1 | Deep pass |

---

## Gap Analysis Targets

For the systematic code walkthrough, these are the codebase locations to compare against specs:

| Domain | Code Location | Database |
|--------|--------------|----------|
| Records | `nex/src/nex/runtime-api/server-methods/events.ts` | records.db |
| Sessions/Turns | `nex/src/nex/runtime-api/server-methods/sessions.ts` | agents.db |
| Chat | `nex/src/nex/runtime-api/server-methods/chat.ts` | agents.db |
| Entities/Contacts | `nex/src/nex/runtime-api/server-methods/identity.ts` | identity.db |
| Auth/ACL | `nex/src/nex/runtime-api/server-methods/auth.ts`, `nex/src/iam/` | identity.db |
| Credentials | `nex/src/nex/runtime-api/server-methods/credentials.ts` | runtime.db |
| Memory | `nex/src/nex/runtime-api/server-methods/memory.ts` | memory.db |
| Agents | `nex/src/nex/runtime-api/server-methods/agents.ts` | agents.db |
| Workspaces | *(may not exist yet)* | runtime.db |
| Automations → Jobs | `nex/src/nex/runtime-api/server-methods/automations.ts`, `nex/src/db/hooks.ts` | work.db |
| Schedules | `nex/src/cron/service.ts`, `nex/src/nex/runtime-api/server-cron.ts` | work.db |
| Work CRM → Jobs/DAGs | `nex/src/nex/runtime-api/server-methods/work.ts` | work.db |
| Adapters | `nex/src/nex/runtime-api/server-methods/adapters.ts` | runtime.db |
| Channels | `nex/src/nex/runtime-api/server-methods/channels.ts` | identity.db |
| Skills | `nex/src/nex/runtime-api/server-methods/skills.ts` | — |
| Apps | `nex/src/nex/runtime-api/server-methods/apps.ts` | runtime.db |
| Browser | `nex/src/nex/browser/` | — |
| TTS | `nex/src/nex/tts/` | — |
| Agent Config | `nex/src/nex/runtime-api/server-methods/agent-configs.ts`, `nex/src/db/work.ts` | work.db |
| Broker/Roles | `nex/src/nex/broker/`, `nex/src/iam/role-caps.ts` | agents.db + work.db |

- [ADAPTER_CONSUMER_SDK_OWNERSHIP_AND_GENERATION_MODEL.md](./ADAPTER_CONSUMER_SDK_OWNERSHIP_AND_GENERATION_MODEL.md)

- [ADAPTER_STREAM_SESSION_SDK_MODEL.md](./ADAPTER_STREAM_SESSION_SDK_MODEL.md)

- [workplans/ADAPTER_DISCORD_PUBLISHABILITY_HARD_CUTOVER_2026-03-13.md](./workplans/ADAPTER_DISCORD_PUBLISHABILITY_HARD_CUTOVER_2026-03-13.md)
