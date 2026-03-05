# Nex API Spec Index

**Purpose:** Single-page map of the entire Nex API target state. Navigate from here to detailed specs.
**Last Updated:** 2026-03-04

---

## Quick Stats

| Metric | Count |
|--------|-------|
| **Total domains** | 22 |
| **Total operations** | ~196 |
| **Spec documents** | 16 (batch specs + architectural specs) |
| **Supporting specs** | 10+ (memory, agents, adapters, workplans) |
| **Databases** | 7 SQLite (events, memory, identity, agents, nexus, embeddings, + unified work/jobs) |

---

## All Domains by Category

### Core Runtime

| Domain | Ops | Batch | Spec | Notes |
|--------|-----|-------|------|-------|
| `status` | 1 | B5 | [Batch 5](./API_DESIGN_BATCH_5.md) | THE agent sitrep command (bare top-level) |
| `runtime.health` | 1 | B5 | [Batch 5](./API_DESIGN_BATCH_5.md) | Lightweight liveness probe |
| `pubsub.*` | 3 | B1 | [Batch 1](./API_DESIGN_DECISIONS.md) | Internal event bus (subscribe, publish, unsubscribe) |

### Events & Chat

| Domain | Ops | Batch | Spec | Notes |
|--------|-----|-------|------|-------|
| `events.*` | 5 | B1 | [Batch 1](./API_DESIGN_DECISIONS.md) | Ingest, list, get, search, stream |
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
| `entities.*` | 14 | B2 | [Batch 2](./API_DESIGN_BATCH_2.md) | CRUD + tags + merge + persona binding |
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

### Jobs, Cron & DAGs (Unified Work Domain)

| Domain | Ops | Batch | Spec | Notes |
|--------|-----|-------|------|-------|
| `jobs.*` | 8 | B6 | [Batch 6](./API_DESIGN_BATCH_6.md) | Unified job definitions + runs. Replaces automations, work tasks, memory jobs |
| `cron.*` | 6 | B6 | [Batch 6](./API_DESIGN_BATCH_6.md) | Time-based scheduling. Replaces clock.schedule |
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
| **Immutable-first** | [Batch 1](./API_DESIGN_DECISIONS.md), [Immutable Row Pattern](./IMMUTABLE_ROW_PATTERN.md) | Append-only where possible. Events, turns, messages immutable. |
| **Pipeline = same API as external** | [Batch 1](./API_DESIGN_DECISIONS.md) | Internal pipeline uses same operations as external callers |
| **Nex API vs Adapter SDK** | [Batch 5](./API_DESIGN_BATCH_5.md) | Two distinct taxonomies. Adapter SDK verbs NOT in Nex operation taxonomy. |
| **Channels as delivery abstraction** | [Batch 5](./API_DESIGN_BATCH_5.md), [MA Communications](./MANAGER_AGENT_COMMUNICATIONS.md) | Send on channels, not adapters. Channel resolves to adapter+account. |
| **Persona / Role / Job trinity** | [Work Unification](./WORK_DOMAIN_UNIFICATION.md) | Persona = WHO (workspace), Role = HOW (agent config), Job = WHAT (task) |
| **Job as universal primitive** | [Work Unification](./WORK_DOMAIN_UNIFICATION.md) | Everything is a job: automations, work items, memory jobs, cron tasks |
| **DAG as workflow primitive** | [Work Unification](./WORK_DOMAIN_UNIFICATION.md) | Nodes = job definitions, edges = dependencies. Replaces workflows/sequences. |
| **Triggers collapse to cron** | [Work Unification](./WORK_DOMAIN_UNIFICATION.md) | Event-reactive behavior in script code, not config JSON. Only cron needs a record. |
| **Job runs ARE the audit trail** | [Work Unification](./WORK_DOMAIN_UNIFICATION.md) | No separate audit table. Job run records = complete execution history. |
| **Script hash versioning** | [Work Unification](./WORK_DOMAIN_UNIFICATION.md) | Hash change → auto-create new version with immutable lineage chain |
| **Agent config in database** | [Batch 6](./API_DESIGN_BATCH_6.md) | Named presets, immutable snapshots, A/B testing, attribution via config_id on turns |
| **TTS extracted to package** | [TTS Extraction](./TTS_EXTRACTION.md) | Not core. Standalone tool, accessed via skill document. |
| **Wizard deferred** | [Wizard Redesign](./WIZARD_REDESIGN.md) | Full redesign after runtime solidifies. 4 RPC ops kept. |

---

## Supersession Map

What Batch 6 changes about earlier batches:

| Earlier Spec | What Changed | Details |
|-------------|-------------|---------|
| **Batch 3** `memory.jobs.*` (4 ops) | Absorbed into unified `jobs.*` | Memory pipeline uses unified job definitions. memory.jobs.list → jobs.runs.list with filters. |
| **Batch 4** `automations.*` (11 ops) | Replaced by `jobs.*` (8 ops) | Automations table → job_definitions + job_runs. Hook invocations → job_runs. |
| **Batch 4** `cron.*` (10 ops) | Simplified to `cron.*` (6 ops) | Schedule format simplified (expression + date range). cron_jobs table replaced. |
| **Batch 5** `tts.*` + `talk.*` (8 ops) | Removed from core | Extracted to standalone package. |

---

## Unified Schemas (Batch 6 Work Domain)

7 tables replacing ~15 across 4 databases. Full schemas in [WORK_DOMAIN_UNIFICATION.md](./WORK_DOMAIN_UNIFICATION.md).

| Table | Fields | Replaces |
|-------|--------|----------|
| `job_definitions` | 14 | automations, tasks, job_types, cron_jobs (def part) |
| `cron_schedules` | 11 | cron_jobs (schedule part), clock tick, work scheduler |
| `job_runs` | 13 | hook_invocations, work_items, jobs (memory), processing_log, work_item_events |
| `dag_definitions` | 5 | workflows |
| `dag_nodes` | 7 | workflow_steps |
| `dag_runs` | 10 | sequences |
| `agent_configs` | 12 | hardcoded role-caps.ts, effective_config_json on turns |

---

## All Spec Documents

### Batch Specs (API Design)

| Document | Status | Domains |
|----------|--------|---------|
| [API_DESIGN_DECISIONS.md](./API_DESIGN_DECISIONS.md) | COMPLETE | Batch 1: Events, PubSub, Sessions, Chat |
| [API_DESIGN_BATCH_2.md](./API_DESIGN_BATCH_2.md) | COMPLETE | Entities, Contacts, Auth, Credentials, ACL, Groups |
| [API_DESIGN_BATCH_3.md](./API_DESIGN_BATCH_3.md) | COMPLETE | Memory: Elements, Recall, Sets, Jobs, Agent Tools |
| [API_DESIGN_BATCH_4.md](./API_DESIGN_BATCH_4.md) | COMPLETE | Agents, Workspaces, Automations*, Cron* |
| [API_DESIGN_BATCH_5.md](./API_DESIGN_BATCH_5.md) | COMPLETE | Adapters, Channels, Runtime, Skills, Models, Apps |
| [API_DESIGN_BATCH_6.md](./API_DESIGN_BATCH_6.md) | COMPLETE | Jobs, Cron, DAGs, Agent Config, Browser, TTS, Wizard |

*Automations and Cron in Batch 4 are superseded by Batch 6 unification.

### Architectural Specs

| Document | Scope |
|----------|-------|
| [WORK_DOMAIN_UNIFICATION.md](./WORK_DOMAIN_UNIFICATION.md) | Job/DAG/Cron unification. Primitives, schemas, old→new mapping. |
| [OPERATION_TAXONOMY.md](./OPERATION_TAXONOMY.md) | Full 147-operation pre-redesign taxonomy (reference/baseline) |
| [NEX_ARCHITECTURE_AND_SDK_MODEL.md](./NEX_ARCHITECTURE_AND_SDK_MODEL.md) | Nex runtime architecture |
| [CREDENTIAL_AND_ADAPTER_CONNECTION_SYSTEM.md](./CREDENTIAL_AND_ADAPTER_CONNECTION_SYSTEM.md) | Credential storage, adapter connections, encrypted store |
| [MANAGER_AGENT_COMMUNICATIONS.md](./MANAGER_AGENT_COMMUNICATIONS.md) | MA communication chain, sender identity resolution |
| [SESSION_ROUTING_UNIFICATION.md](./SESSION_ROUTING_UNIFICATION.md) | Unified session key derivation |
| [HOOK_SYSTEM_UNIFICATION.md](./HOOK_SYSTEM_UNIFICATION.md) | 4 hook systems → 1 |
| [WORKSPACE_PRIMITIVE.md](./WORKSPACE_PRIMITIVE.md) | Workspace as identity/config anchor |
| [IMMUTABLE_ROW_PATTERN.md](./IMMUTABLE_ROW_PATTERN.md) | Append-only data patterns |
| [ADAPTER_INTERFACE_UNIFICATION.md](./ADAPTER_INTERFACE_UNIFICATION.md) | One adapter interface, one SDK |

### Seed Specs (TODO — Deferred)

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
| ADAPTER_CONNECTION_SERVICE.md | `specs/nex/adapters/` | Adapter auth manifests, setup flows |

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
| `work.*` (18 ops) | Absorbed into jobs/dags/cron | B6 |
| `automations.*` (11 ops) | Absorbed into jobs | B6 |
| `memory.jobs.*` (4 ops) | Absorbed into jobs | B6 |
| Old `cron.*` (10 ops) | Simplified cron (6 ops) | B6 |
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
| `pubsub.publish` — client-facing or internal-only? | B1 | Deep pass |
| Singular vs plural domain names (final decision) | B1 | Deep pass |
| `events.emit` for internal subsystem events | B1 | Deep pass |

---

## Gap Analysis Targets

For the systematic code walkthrough, these are the codebase locations to compare against specs:

| Domain | Code Location | Database |
|--------|--------------|----------|
| Events | `nex/src/nex/control-plane/server-methods/events.ts` | events.db |
| Sessions/Turns | `nex/src/nex/control-plane/server-methods/sessions.ts` | agents.db |
| Chat | `nex/src/nex/control-plane/server-methods/chat.ts` | agents.db |
| Entities/Contacts | `nex/src/nex/control-plane/server-methods/identity.ts` | identity.db |
| Auth/ACL | `nex/src/nex/control-plane/server-methods/auth.ts`, `nex/src/iam/` | identity.db |
| Credentials | `nex/src/nex/control-plane/server-methods/credentials.ts` | nexus.db |
| Memory | `nex/src/nex/control-plane/server-methods/memory.ts` | memory.db |
| Agents | `nex/src/nex/control-plane/server-methods/agents.ts` | agents.db |
| Workspaces | *(may not exist yet)* | nexus.db |
| Automations → Jobs | `nex/src/nex/control-plane/server-methods/automations.ts`, `nex/src/db/hooks.ts` | events.db |
| Cron | `nex/src/cron/service.ts`, `nex/src/nex/control-plane/server-cron.ts` | nexus.db |
| Work CRM → Jobs/DAGs | `nex/src/nex/control-plane/server-methods/work.ts` | work.db |
| Adapters | `nex/src/nex/control-plane/server-methods/adapters.ts` | nexus.db |
| Channels | `nex/src/nex/control-plane/server-methods/channels.ts` | identity.db |
| Skills | `nex/src/nex/control-plane/server-methods/skills.ts` | — |
| Apps | `nex/src/nex/control-plane/server-methods/apps.ts` | nexus.db |
| Browser | `nex/src/nex/browser/` | — |
| TTS | `nex/src/nex/tts/` | — |
| Agent Config | `nex/src/config/`, `.nex.yaml` | — (moving to DB) |
| Broker/Roles | `nex/src/nex/broker/`, `nex/src/iam/role-caps.ts` | agents.db |
