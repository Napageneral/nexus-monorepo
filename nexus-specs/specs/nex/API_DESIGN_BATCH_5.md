# API Design: Batch 5 — Adapters, Channels, Runtime, Skills, Models, Apps

**Status:** COMPLETE — all decisions locked
**Last Updated:** 2026-03-04

---

## Overview

Batch 5 covers the remaining core platform domains: adapter connection management, channel-based delivery, runtime introspection, skills, models, and the apps domain. This batch also establishes the clean separation between the Nex operation taxonomy (external API) and the Adapter SDK contract (internal subprocess protocol).

**Cross-references:**
- Credentials: [API_DESIGN_BATCH_2.md](./API_DESIGN_BATCH_2.md) (Batch 2)
- Identity/Contacts/Channels (data model): Batch 2
- Agents & Workspaces: [API_DESIGN_BATCH_4.md](./API_DESIGN_BATCH_4.md) (Batch 4)
- Adapter Interface Unification: [ADAPTER_INTERFACE_UNIFICATION.md](./ADAPTER_INTERFACE_UNIFICATION.md)
- Credential & Connection System: [CREDENTIAL_AND_ADAPTER_CONNECTION_SYSTEM.md](./CREDENTIAL_AND_ADAPTER_CONNECTION_SYSTEM.md)
- Adapter Connection Service: [adapters/ADAPTER_CONNECTION_SERVICE.md](./adapters/ADAPTER_CONNECTION_SERVICE.md)
- Manager Agent Communications: [MANAGER_AGENT_COMMUNICATIONS.md](./MANAGER_AGENT_COMMUNICATIONS.md)
- Batch 6 (Jobs, Cron, DAGs, Agent Config, Browser, TTS, Wizard): [API_DESIGN_BATCH_6.md](./API_DESIGN_BATCH_6.md)
- Work Domain Unification: [WORK_DOMAIN_UNIFICATION.md](./WORK_DOMAIN_UNIFICATION.md)

---

## Key Architectural Decision: Nex API vs Adapter SDK

### The Two Taxonomies

There are two distinct operation surfaces that must not be conflated:

**1. Nex Operation Taxonomy (External API)**
- Operations callable by external clients (UI, CLI, apps, agents, other services)
- Accessed via WebSocket or HTTP through the Nex control plane
- Flow through the 5-stage pipeline (acceptRequest → resolvePrincipals → resolveAccess → executeOperation → finalizeRequest)
- Subject to IAM, audit, and hooks

**2. Adapter SDK Contract (Internal Subprocess Protocol)**
- Operations implemented by adapter binaries
- Invoked by the Nex runtime via subprocess spawn (JSONL over stdin/stdout)
- NOT directly callable by external clients
- Credentials injected via `NEXUS_ADAPTER_CONTEXT_PATH` environment variable

### Where They Overlap

Some Nex API operations delegate to adapter SDK operations:

| Nex API Operation | Delegates To | Adapter SDK Verb |
|-------------------|-------------|-----------------|
| `adapters.connections.test` | Runtime spawns adapter | `adapter.health` |
| `adapters.connections.custom.start` | Runtime orchestrates | `adapter.setup.start` |
| `channels.send` | Runtime resolves adapter+account | `delivery.send` |
| `channels.stream` | Runtime resolves adapter+account | `delivery.stream` |

The Nex API adds orchestration logic: credential resolution, connection state tracking, channel routing, IAM enforcement, audit logging. The adapter SDK is the raw subprocess contract.

### Decision

**Adapter SDK operations are NOT in the Nex operation taxonomy.** They are documented separately in the Adapter SDK spec. The Nex taxonomy only contains operations callable by external clients. Adapter SDK verbs (`adapter.info`, `adapter.health`, `delivery.send`, etc.) appear in the taxonomy ONLY as the implementation detail behind a Nex API operation — never as directly exposed operations.

**Exception:** `event.ingest` and `event.backfill` remain in the Nex taxonomy because they are genuinely external-facing — adapters emit events INTO Nex, and backfill can be triggered by external callers.

### Adapter SDK Contract (Reference)

The adapter SDK defines these verbs (documented in the Adapter SDK spec, NOT in the Nex operation taxonomy):

| SDK Verb | Direction | Protocol |
|----------|-----------|----------|
| `adapter.info` | Nex → Adapter | One-shot spawn, read stdout JSON |
| `adapter.health` | Nex → Adapter | One-shot spawn, read stdout JSON |
| `adapter.accounts.list` | Nex → Adapter | One-shot spawn, read stdout JSON |
| `adapter.monitor.start` | Nex → Adapter | Long-running, read stdout JSONL events |
| `adapter.control.start` | Nex → Adapter | Long-running bidirectional JSONL |
| `adapter.setup.start` | Nex → Adapter | One-shot spawn |
| `adapter.setup.submit` | Nex → Adapter | One-shot spawn |
| `adapter.setup.status` | Nex → Adapter | One-shot spawn |
| `adapter.setup.cancel` | Nex → Adapter | One-shot spawn |
| `delivery.send` | Nex → Adapter | One-shot spawn |
| `delivery.stream` | Nex → Adapter | Long-running stdin/stdout JSONL |
| `delivery.react` | Nex → Adapter | One-shot spawn |
| `delivery.edit` | Nex → Adapter | One-shot spawn |
| `delivery.delete` | Nex → Adapter | One-shot spawn |
| `delivery.poll` | Nex → Adapter | One-shot spawn |
| `event.backfill` | Nex → Adapter | Long-running, read stdout JSONL |

---

## Domain: Adapter Connections

**Database:** `nexus.db` (`adapter_connections` table, `credentials` table)

### Decisions

**Plural naming: `adapters.connections.*`.** Consistent with `agents.*`, `credentials.*`.

**Nex API orchestrates adapter lifecycle.** External callers (control panel UI, CLI) call `adapters.connections.*` operations. The Nex runtime handles credential storage, connection state tracking, OAuth flow management, and health monitoring. Under the hood, it spawns adapter binaries for health checks and setup flows.

**Upload stays as a connection operation.** Adapters that declare `file_upload` as an auth method (e.g., CRM data import, ad platform CSV export) accept file uploads through the adapter connection card UI. The upload is received by Nex, validated against the adapter's manifest `accept` list, then passed to the adapter for processing and event ingestion.

**Connection = adapter + credential link.** The `adapter_connections` table links an adapter to a credential and tracks health state. Not all credentials have adapter connections — API keys for LLM providers (Anthropic, OpenAI) are credentials without adapter connections, since there's no adapter process for them.

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `adapters.connections.list` | read | List all adapter connections with status |
| `adapters.connections.get` | read | Get single adapter connection details |
| `adapters.connections.status` | read | Get connection health for a specific adapter |
| `adapters.connections.test` | read | Test connection (delegates to adapter health check) |
| `adapters.connections.disconnect` | write | Disconnect adapter (revoke credential, update status) |
| `adapters.connections.upload` | write | Upload file for file-based adapter import |
| `adapters.connections.oauth.start` | write | Start OAuth flow (returns redirect URL) |
| `adapters.connections.oauth.complete` | write | Complete OAuth flow (exchange code for tokens) |
| `adapters.connections.apikey.save` | write | Save API key credentials for adapter |
| `adapters.connections.custom.start` | write | Start adapter-guided custom setup flow |
| `adapters.connections.custom.submit` | write | Submit step in custom setup flow |
| `adapters.connections.custom.status` | read | Check custom setup flow status |
| `adapters.connections.custom.cancel` | write | Cancel custom setup flow |

**Total: 13 operations**

### Naming Changes from Current Taxonomy

| Current | Target | Reason |
|---------|--------|--------|
| `adapter.connections.*` | `adapters.connections.*` | Plural for consistency |

---

## Domain: Channels

**Database:** `nexus.db` (channels from Batch 2 identity model)

### Decisions

**Channels ARE the delivery abstraction.** Message delivery operations live on channels, not on adapters or a standalone `delivery.*` namespace. A channel is the nexus of "who you're talking to" + "how to reach them." It binds to an adapter and account under the hood.

**Channel-based routing.** When an agent calls `channels.send`, the channel knows which adapter backs it and which account to use. The caller specifies channel + message, not adapter + account + recipient.

**The delivery chain:**
```
Contact Resolution → Channel Selection → Identity Decision → Channel Send

1. contacts.search("Casey") → Contact with channel references
2. Pick channel (iMessage, Discord DM, etc.)
3. Decide sender identity (as user or as agent) — see MA Communications spec
4. channels.send(channel_id, message, { account: ... })
```

**Manager Agent handles sender identity.** See [MANAGER_AGENT_COMMUNICATIONS.md](./MANAGER_AGENT_COMMUNICATIONS.md). The MA clarifies with the user whether to send as the user or as the agent, records preferences, and applies them automatically going forward.

**Unimplemented delivery verbs are stubs.** `channels.react`, `channels.edit`, `channels.delete` are registered but return `UNAVAILABLE` until adapter support is added. They're in the taxonomy to reserve the namespace.

**`channels.status` absorbs the unregistered handler.** The existing `channels.status` handler code (currently unregistered) becomes a formal operation.

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `channels.list` | read | List configured channels with adapter/account bindings |
| `channels.status` | read | Channel health (delegates to adapter health for backing adapter) |
| `channels.send` | write | Send a message on a channel |
| `channels.stream` | write | Stream a response on a channel (for live typing indicators) |
| `channels.react` | write | React to a message on a channel (stub) |
| `channels.edit` | write | Edit a message on a channel (stub) |
| `channels.delete` | write | Delete a message on a channel (stub) |

**Total: 7 operations**

### Naming Changes from Current Taxonomy

| Current | Target | Reason |
|---------|--------|--------|
| `delivery.send` | `channels.send` | Delivery is a channel operation |
| `delivery.stream` | `channels.stream` | Same |
| `delivery.react` | `channels.react` | Same |
| `delivery.edit` | `channels.edit` | Same |
| `delivery.delete` | `channels.delete` | Same |
| `delivery.poll` | **DROPPED** | No clear channel-level equivalent |

---

## Domain: Core Runtime

### Decisions

**`status` is THE command.** Bare top-level, not namespaced under `runtime.*`. This is the agent orientation command — the one thing AGENTS.md tells agents to use. Returns a full sitrep: identity, connected adapters, channels, credentials, skills, scheduled jobs, memory status, available capabilities.

**`runtime.health` is the lightweight probe.** For monitoring, heartbeats, and liveness checks. Returns `{ ok: true, ts: ... }` and basic health info. Not the agent sitrep.

**`system-presence` DROPPED.** Device presence tracking is folded into adapter health. Each device is its own adapter; the adapter manages its connection state. No standalone presence tracking operation.

**`events.stream` → `pubsub.subscribe`.** Already captured in Batch 1. The SSE/WebSocket event stream is the pubsub subscription mechanism.

**Capabilities are a computed view.** No `capabilities.*` operations. The `status` command computes capability status from connected adapters, active credentials, installed skills, and installed apps. The capabilities abstraction remains as a concept for the status display, but there are no managed capability objects.

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `status` | read | The agent sitrep — full orientation summary of all domains |
| `runtime.health` | read | Lightweight liveness probe for monitoring |

**Total: 2 operations**

### `status` Output Shape (Target)

```typescript
{
  ts: EpochMs;
  identity: {
    user: { name: string; entity_id: string };
    agent: { name: string; agent_id: string; emoji?: string; avatar?: string };
  };
  adapters: Array<{
    name: string;
    platform: string;
    status: "connected" | "disconnected" | "error" | "expired";
    channels: number;
  }>;
  channels: {
    total: number;
    active: number;
    byPlatform: Record<string, number>;
  };
  credentials: {
    total: number;
    active: number;
    broken: number;
    byService: Record<string, number>;
  };
  skills: {
    total: number;
    active: number;
    needsSetup: number;
  };
  memory: {
    entities: number;
    facts: number;
    lastRetainAt: EpochMs | null;
  };
  cron: {
    enabled: boolean;
    jobs: number;
    nextRunAt: EpochMs | null;
  };
  apps: {
    installed: number;
    running: number;
  };
  capabilities: Array<{
    name: string;
    status: "active" | "ready" | "needs-setup" | "unavailable";
    providers: string[];
  }>;
  suggestedActions: Array<{
    action: string;
    description: string;
    unlocks?: string[];
  }>;
}
```

### Naming Changes from Current Taxonomy

| Current | Target | Reason |
|---------|--------|--------|
| `health` | `runtime.health` | Namespaced for clarity |
| `status` | `status` | Stays bare top-level — THE command |
| `system-presence` | **DROPPED** | Folded into adapter health |
| `events.stream` | `pubsub.subscribe` | Already in Batch 1 |

---

## Domain: Skills

### Decisions

**Cooked down to 3 operations.** The original skills specs defined 11+ CLI commands plus hub/packs infrastructure. With adapters and apps as the primary distribution primitives, skills become a simpler tool-discovery layer. Hub and packs are superseded.

**`skills.list` includes metadata.** Returns all skill metadata (version, requirements, capabilities, status). No need for a separate `skills.info` operation.

**`skills.use` returns SKILL.md.** The primary agent-facing operation. Agents call this to get the human-readable guide for a specific skill. This is how agents learn to use tools.

**`skills.search` for discovery.** Search local skills by name, capability, or domain. Hub search is deferred — adapters and apps are the distribution mechanism.

**Packs dropped.** Adapters and apps are the new packaging primitive.

**Capabilities layer dropped as managed domain.** Capabilities remain as a concept (computed view in `status` output) but there are no `capabilities.*` operations. The value was always in orientation UX, not data management. The capability specs remain as reference material.

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `skills.list` | read | List installed skills with status, requirements, capabilities |
| `skills.use` | read | Get SKILL.md content for agent consumption |
| `skills.search` | read | Search local skills by name, capability, or domain |

**Total: 3 operations**

### Dropped from Original Skills Spec

| Original | Disposition |
|----------|-------------|
| `skills.install` | Deferred — adapters/apps are the distribution mechanism |
| `skills.update` | Deferred |
| `skills.updates` | Deferred |
| `skills.reset` | Dropped — modification tracking is overkill for current scope |
| `skills.diff` | Dropped |
| `skills.verify` | Folded into `skills.list` (status field shows requirement gaps) |
| `skills.scan` | Deferred |
| `skills.info` | Folded into `skills.list` (includes all metadata) |
| `packs.*` | Dropped — superseded by adapters/apps |
| `capabilities.*` | Dropped — computed view in `status`, not managed objects |

---

## Domain: Models

### Decisions

**Models as a computed view.** Available models are dictated by which LLM provider credentials are active. If you have an Anthropic credential → Claude models available. OpenAI credential → GPT models. No credential → nothing.

**LLM providers are just credentials.** An Anthropic API key is a credential with `service: "anthropic"`, `kind: "api_key"`. There's no adapter process for it. The credential unlocks model access. This is already handled by the `credentials.*` domain in Batch 2.

**Usage tracking moves to agents.db.** Per-turn token counts and cost are tracked on the turn record in agents.db. The separate `usage.*` and `sessions.usage.*` operations from the legacy taxonomy are dropped. Usage analytics are derived from turn data.

**Model assignment is minimal.** Where models are used is an agent/session-level concern:
- Default model: set on agent config
- Session override: `agents.sessions.patch` can set a model override
- Turn-level: each turn records which model was actually used

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `models.list` | read | List available models (computed from active LLM provider credentials) |
| `models.get` | read | Get model details (context window, capabilities, pricing) |

**Total: 2 operations**

### Dropped from Current Taxonomy

| Current | Disposition |
|---------|-------------|
| `usage.status` | Dropped — provider usage limits are a credential concern |
| `usage.cost` | Dropped — derived from turn data in agents.db |
| `sessions.usage` | Dropped — derived from turn data |
| `sessions.usage.timeseries` | Dropped — derived from turn data |
| `sessions.usage.logs` | Dropped — derived from turn data |

---

## Domain: Apps

**Database:** `nexus.db` (app registry), app-specific databases in app data directories

### Decisions

**Apps are self-contained packages.** An app bundles UI (static SPA), operations (TS handlers or service binaries), and optionally adapters. The `app.nexus.json` manifest declares everything.

**Two handler modes:**
- **Inline-TS:** Handler loaded in-process via jiti. Fast, simple. (GlowBot pattern)
- **Service-routed:** Runtime spawns service binary. Language-agnostic, process-isolated. (Spike pattern)

**App operations are namespaced.** Each method in the manifest auto-registers as `{app_id}.{method}` in the operation taxonomy with auto-generated IAM entries.

**Store/hub is frontdoor-side.** Product registry, billing, installation authorization, and entitlement management live in the frontdoor platform, not in the Nex runtime. Nex handles the runtime lifecycle only.

**Frontdoor-side operations (NOT in Nex taxonomy):**
- `apps.store.search` — browse app catalog
- `apps.store.info` — app listing details
- `apps.store.purchase` — billing/entitlement
- `apps.store.entitlements` — check what user owns

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `apps.list` | read | List installed apps with status |
| `apps.get` | read | Get app details (manifest, registered operations, service state) |
| `apps.install` | admin | Install app from package |
| `apps.uninstall` | admin | Remove app (runs onUninstall hook, cleans up) |
| `apps.start` | admin | Start app services |
| `apps.stop` | admin | Stop app services |
| `apps.status` | read | App health + service state |
| `apps.logs` | read | App-specific logs (service stdout/stderr) |
| `apps.operations` | read | List registered operations from this app |

**Total: 9 operations**

---

## Domain: Event Ingestion

### Decisions

**`event.ingest` and `event.backfill` stay in the Nex taxonomy.** These are external-facing — adapters emit events INTO Nex, and backfill can be triggered by external callers.

**Already captured in Batch 1.** `event.ingest` was covered in Batch 1 with the `ingress_type` discrimination (`chat`, `agent`, `system`). `event.backfill` is triggered via the Nex API and delegates to the adapter SDK.

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `event.ingest` | write | Ingest an event (chat, agent, or system) — Batch 1 |
| `event.backfill` | write | Trigger historical event backfill from an adapter |

**Total: 2 operations** (already counted in Batch 1)

---

## Misc: Unregistered Handlers

### Decisions

| Handler | Decision | Reason |
|---------|----------|--------|
| `channels.status` | **REGISTERED** as `channels.status` | Absorbed into new channels domain |
| `channels.logout` | **DROPPED** | Superseded by `adapters.connections.disconnect` |
| `web.login.start` | **DROPPED** | Legacy web channel login, not needed |
| `web.login.wait` | **DROPPED** | Same |
| `tools.invoke` | **REGISTERED** | Formal registration as HTTP-only tool invocation endpoint |

---

## Cross-Batch Update: `is_agent` Boolean on Entities

### Decision

**Add `is_agent` boolean to the entities table.** Rather than inferring agent status from the freeform `type` field or `workspace_id` presence, an explicit boolean flag marks entities that represent agents controlled by this runtime. This eliminates fuzzy edge cases.

```sql
ALTER TABLE entities ADD COLUMN is_agent BOOLEAN DEFAULT FALSE;
```

**Applies to:** Batch 2 identity model (entities table). This is a retroactive addition.

---

## Cross-Batch Update: Device Pairing → Adapter Fold-In

### Decision

**Device pairing is already folded into adapters.** The specs and code confirm that devices ARE adapters with `adapter.control.start` for duplex control. Legacy `node.*` namespace is gone. `device.pair.*` and `device.host.*` operations are handled through the adapter model.

No separate device pairing operations in the Nex taxonomy. The pairing flow is an adapter connection flow.

---

## Batch 5 Summary

| Domain | Operations | Notes |
|--------|-----------|-------|
| Adapter Connections | 13 | `adapters.connections.*` |
| Channels | 7 | NEW — delivery abstraction |
| Core Runtime | 2 | `status` + `runtime.health` |
| Skills | 3 | Cooked down from 11+ |
| Models | 2 | Computed from credentials |
| Apps | 9 | Runtime lifecycle |
| Event Ingestion | 2 | Already in Batch 1, noted here |
| Misc (tools.invoke) | 1 | Formal registration |
| **Total** | **39** | |

### Naming Changes Summary

| Current | Target |
|---------|--------|
| `adapter.connections.*` | `adapters.connections.*` |
| `delivery.send` | `channels.send` |
| `delivery.stream` | `channels.stream` |
| `delivery.react` | `channels.react` |
| `delivery.edit` | `channels.edit` |
| `delivery.delete` | `channels.delete` |
| `delivery.poll` | DROPPED |
| `health` | `runtime.health` |
| `system-presence` | DROPPED |
| `events.stream` | `pubsub.subscribe` (Batch 1) |
| `usage.*` | DROPPED (agents.db) |
| `sessions.usage.*` | DROPPED (agents.db) |
| `skills.install/update/...` | DROPPED (deferred) |
| `capabilities.*` | DROPPED (computed view) |
| `packs.*` | DROPPED (superseded) |

### Dropped Operations from Current Taxonomy

| Domain | Dropped | Reason |
|--------|---------|--------|
| Delivery | `delivery.poll` | No channel equivalent |
| Runtime | `system-presence` | Folded into adapter health |
| Usage | `usage.status`, `usage.cost`, `sessions.usage`, `sessions.usage.timeseries`, `sessions.usage.logs` | Replaced by per-turn tracking in agents.db |
| Skills | `skills.install`, `skills.update`, `skills.updates`, `skills.reset`, `skills.diff`, `skills.verify`, `skills.scan`, `skills.info` | Deferred or folded |
| Capabilities | All `capabilities.*` ops | Computed view, not managed |
| Packs | All `packs.*` ops | Superseded by adapters/apps |
| Device | `device.pair.*`, `device.host.*`, `device.token.*` | Folded into adapters |

---

## Batch 6 Outline (Deferred)

These domains require deeper design sessions:

| Domain | Estimated Ops | Notes |
|--------|--------------|-------|
| Work CRM | 18+ | May fold into elements/sets/jobs paradigm |
| Browser | 50+ | 54 routes need proper operation design |
| Speech/TTS | ~9 | Provider model + talk mode + voice wake |
| Wizard | ~4 | Full redesign for new runtime |

---

## Resolved Items

### RESOLVED: Adapter SDK Separation
Clean delineation established. Adapter SDK verbs (`adapter.info`, `adapter.health`, `delivery.send`, etc.) are NOT in the Nex operation taxonomy. They are documented as reference in the Adapter SDK spec. The Nex taxonomy contains only orchestrated versions that wrap adapter SDK calls with IAM, audit, credential injection, and connection state tracking. The wrapping is necessary and not duplicative — it's the control plane layer.

### DEFERRED: Deep Pass on `status` Command
The `status` output shape needs alignment with all new domains from Batches 1–6. Deferred to the deep pass across all batches.

### DEFERRED: Channel → Adapter → Account Resolution
The exact resolution chain for `channels.send` needs detailed design: how does a channel reference resolve to adapter + account + credential for the actual delivery? This is the plumbing that makes the channel abstraction work. Deferred to deep pass.
