# NexusRequest — The Pipeline Data Bus

**Status:** DESIGN (authoritative target)
**Last Updated:** 2026-03-02

---

## Overview

The `NexusRequest` is the single mutable data bus that flows through every pipeline stage. All operations — regardless of type — go through the same pipeline. There is no distinction between "control-plane" and "event" operations. Every field on this bus uses the same models as the underlying ledger tables. Zero translation boundaries.

---

## Pipeline Stages

All operations flow through these stages in order:

```
acceptRequest → resolvePrincipals → resolveAccess → executeOperation → finalizeRequest
```

### Stage Responsibilities

| Stage | Purpose |
|-------|---------|
| `acceptRequest` | Parse and stamp the request envelope. Assign IDs. Normalize transport. Deduplicate. |
| `resolvePrincipals` | Resolve `routing.sender` and `routing.receiver` raw identifiers to canonical Entity objects via the contacts table. Auto-create Entity rows for unknown senders. Resolve recipients for group containers. Hydrate `agent` context (session_key, persona_path) from the receiver Entity via `entity_persona`. Update `container_participants` in identity.db. |
| `resolveAccess` | Evaluate ACL policies against resolved principals and operation. Produce an allow/deny decision with permissions. Internally handles grants, permission requests — none of that leaks onto the bus. |
| `executeOperation` | Dispatch to the operation handler. For `event.ingest`: run the agent via the broker. The agent decides if/when/where to respond using delivery tools. For other operations: execute the handler directly. See [AGENT_DELIVERY.md](./AGENT_DELIVERY.md). |
| `finalizeRequest` | Persist the pipeline trace. Set final status. |

### Automation Hookpoints

Automations are hookpoints at stage boundaries — they can fire before or after any stage. The primary hooks are before and after `executeOperation`, but hooks can exist at other boundaries as well. Automations can inspect the request, contribute context enrichment, override agent configuration, or fully handle a request (skipping the agent entirely).

---

## Data Model

### Entity

The canonical identity object from `identity.db`. Used for **both** sender and receiver — no wrapper types, no discriminated unions. The nex runtime instance itself is registered as an Entity in the identity graph, so the receiver always resolves cleanly.

Unknown senders auto-create an Entity row on first contact. There is never an unresolvable principal when the identity DB is available.

```typescript
type Entity = {
  id: string;
  name: string;
  type: string;              // free-form: "person", "org", "system", "bot", etc.
  normalized?: string;
  is_user: boolean;
  origin?: string;           // who created: "adapter", "writer", "manual"
  persona_path?: string;     // absolute path to persona folder
                              // contains IDENTITY.md, SOUL.md
  tags: string[];             // hydrated from entity_tags table (active rows only)
  merged_into?: string;
  mention_count: number;
  created_at: number;
  updated_at: number;
};
```

`persona_path` is hydrated from the `entity_persona` table during `resolvePrincipals`. The table supports per-sender persona customization, priority ordering, and active/inactive toggling. The bus carries the resolved path; the table tracks history.

`tags` is hydrated from the `entity_tags` table (active rows where `deleted_at IS NULL`). The table tracks full add/remove history via immutable rows with `created_at`/`deleted_at`.

### Attachment

The canonical attachment type used everywhere — adapter protocol, NexusRequest bus, events table JSON, relational attachments table. Zero translation between layers. See [ATTACHMENTS.md](./ATTACHMENTS.md) for the full specification.

```typescript
type Attachment = {
  id: string;
  filename?: string;
  mime_type: string;             // "image/png", "audio/mp3", "application/pdf"
  media_type?: string;           // "image", "video", "audio", "document", "file"
  size?: number;                 // bytes
  url?: string;
  local_path?: string;
  content_hash?: string;
  metadata?: Record<string, unknown>;
};
```

### RoutingParticipant

Symmetric sub-object used for both sender and receiver on the Routing context. Represents a raw platform-level participant before entity resolution.

```typescript
type RoutingParticipant = {
  id: string;                // raw platform identifier
  name?: string;             // display name (untrusted, can change)
  avatar_url?: string;       // avatar URL (untrusted)
  auth?: Record<string, unknown>;  // optional auth context (tokens, credentials)
};
```

Authentication is on the participant because the auth token often IS the sender identity. For many operations there is no auth token — the adapter handles AuthN separately. AuthZ is always handled internally by the nex runtime during `resolveAccess`.

### Routing

Universal request context. Present on every NexusRequest regardless of operation type. Answers: **WHO** is involved, **WHERE** is this happening, and through **WHAT** adapter.

```typescript
type Routing = {
  adapter: string;           // which adapter instance produced this
  platform: string;          // platform namespace: "discord", "telegram",
                              // "control.ws", "ingress.http"

  // WHO — symmetric sender and receiver
  sender: RoutingParticipant;
  receiver: RoutingParticipant;

  // WHERE — platform location hierarchy
  space_id?: string;
  space_name?: string;
  container_kind?: "direct" | "group";
  container_id?: string;
  container_name?: string;
  thread_id?: string;
  reply_to_id?: string;

  // Adapter-specific opaque data (reply tokens, etc.)
  metadata?: Record<string, unknown>;
};
```

For `event.ingest` operations, `container_kind` and `container_id` are always present. For other operations (config, work, acl, etc.), they may be absent.

The location hierarchy is: **platform > space > container > thread**. `space_id` is optional (not all platforms have workspaces). `thread_id` is optional (sub-threads within containers, e.g., Slack threads, Discord threads).

`*_name` fields are untrusted — for display and logging only. IAM matching uses IDs only.

### Event Payload

An Event in the conceptual sense is `Routing + Payload`. On the NexusRequest these are separate fields. In the events table they are flattened together for querying.

For `event.ingest` operations, the payload represents the content of what was communicated:

```typescript
type EventPayload = {
  id: string;
  content: string;
  content_type: "text" | "reaction" | "membership";
  attachments?: Attachment[];
  recipients?: RoutingParticipant[];  // other participants (email CC, small groups)
  timestamp: number;
  metadata?: Record<string, unknown>;
};
```

`content_type` does not include `audio`, `video`, or `file` — those are attachment types, not content types.

`recipients` captures the per-event participant list when provided by the adapter. For email: To/CC/BCC list. For small group chats: current members. For large containers (1000+ members): `null` — the adapter typically doesn't provide full member lists per-event. Full membership is tracked at the container level via `container_participants` in identity.db.

Each operation defines its own payload schema via OpenAPI. The `payload` field on NexusRequest is typed per operation.

### AccessContext

The output of `resolveAccess`. A binary allow/deny decision with attached permissions.

```typescript
type AccessContext = {
  decision: "allow" | "deny";
  matched_policy?: string;
  permissions: {
    tools: { allow: string[]; deny: string[] };
    credentials: string[];
  };
};
```

- `deny` = reject the request entirely. Pipeline skips to `finalizeRequest`.
- `allow` = proceed with the attached permissions.
- Grants, permission requests, and rate limiting are internal mechanics of `resolveAccess`. They do not appear on the bus.
- When a policy returns `"ask"`, it is internally resolved to `"deny"` plus a `permission_request` row for the admin to review. The sender can re-send after approval.

Session routing (session_key, persona_path, queue_mode) lives on `AgentContext`, not here.

### AutomationContext

Results of automation hookpoint evaluation.

```typescript
type AutomationContext = {
  evaluated: string[];           // automation IDs whose triggers were checked
  fired: string[];               // automation IDs that matched and contributed
  handled?: boolean;             // did any automation fully handle this?
  handled_by?: string;           // first automation ID that claimed handled
  enrichment?: Record<string, string>;
  agent_overrides?: {
    session_key?: string;
    persona_path?: string;
    model?: string;
    provider?: string;
    queue_mode?: string;
    role?: string;
  };
  results?: Array<{
    automation_id: string;
    invocation_id: string;       // FK to hook_invocations table
    duration_ms: number;
    error?: string;
  }>;
};
```

**`enrichment`** is a map of named context blocks. Each key becomes an XML tag name when injected into the agent's input. See [Context Enrichment](#context-enrichment).

**`agent_overrides`** allows automations to override agent configuration — session, persona, model, provider, queue mode, role. Session targeting concepts (`target_kind`, `from_turn_id`, `label_hint`, `smart`) are broker-internal mechanics and do not appear on the bus.

**`results`** only includes automations that fired. The `invocation_id` links to the `hook_invocations` table for the detailed execution trace.

### AgentContext

Hydrated progressively through the pipeline. `resolvePrincipals` sets session_key and persona_path from the receiver Entity via `entity_persona`. `resolveAccess` may contribute queue_mode from policy evaluation. Automations can override any field via `agent_overrides`.

```typescript
type AgentContext = {
  session_key: string;
  persona_path?: string;
  queue_mode?: "steer" | "followup" | "collect" | "queue" | "interrupt";
  model: string;
  provider: string;
  role: "manager" | "worker" | "unified";
};
```

All agent execution details (turn_id, token_budget, compaction, tools, etc.) are internal to `executeOperation` and persisted to `agents.db` by the broker. They do not appear on the bus.

### StageTrace

Per-stage timing and error tracking.

```typescript
type StageTrace = {
  stage: string;
  started_at: number;
  duration_ms: number;
  error?: string;
};
```

### RequestStatus

```typescript
type RequestStatus =
  | "processing"    // in-flight through pipeline stages
  | "completed"     // done (by agent or automation)
  | "denied"        // access denied
  | "skipped"       // duplicate detection
  | "failed";       // error during processing
```

When an automation handles a request, the status is `"completed"` with `automations.handled === true`.

---

## NexusRequest

```typescript
type NexusRequest = {
  request_id: string;
  created_at: number;
  operation: string;

  // Universal request context
  routing: Routing;

  // Operation-specific input (typed per operation via OpenAPI)
  payload: unknown;

  // Enriched through pipeline stages
  principals?: {
    sender: Entity;
    receiver: Entity;
    recipients?: Entity[];   // resolved from payload.recipients
  };
  access?: AccessContext;
  automations?: AutomationContext;
  agent?: AgentContext;

  // Pipeline trace
  stages: StageTrace[];
  status: RequestStatus;
};
```

Every operation defines its own input and output schemas via OpenAPI. The `payload` field carries the operation-specific input. The `routing` context is universal — always present, always the same shape.

Agent responses, tool calls, and delivery results are internal details of `executeOperation`. They are persisted in `agents.db` and the events ledger, not on the NexusRequest bus. Delivery is initiated by the agent via tools, not by the pipeline. See [AGENT_DELIVERY.md](./AGENT_DELIVERY.md).

---

## Events Table

The persistent event ledger. An event in the table is the flattened combination of Routing context + Event payload. The memory system builds off this table.

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,              -- adapter's original event identifier

  -- Content (from payload)
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  attachments TEXT,                     -- JSON: Attachment[]
  recipients TEXT,                      -- JSON: RoutingParticipant[] (per-event, nullable)
  timestamp INTEGER NOT NULL,
  received_at INTEGER NOT NULL,

  -- Routing context (platform > space > container > thread)
  platform TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  space_id TEXT,
  container_kind TEXT NOT NULL DEFAULT 'direct',
  container_id TEXT NOT NULL,
  thread_id TEXT,
  reply_to_id TEXT,

  -- Pipeline link
  request_id TEXT,

  metadata TEXT,

  UNIQUE(platform, event_id)
);

CREATE INDEX idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX idx_events_platform_sender ON events(platform, sender_id);
CREATE INDEX idx_events_platform_receiver ON events(platform, receiver_id);
CREATE INDEX idx_events_container ON events(platform, container_id);
CREATE INDEX idx_events_thread ON events(thread_id);
CREATE INDEX idx_events_request ON events(request_id);
```

### Deduplication

`UNIQUE(platform, event_id)` provides idempotency. The `event_id` is the adapter's original identifier for the event. The `id` column is a generated UUID used as the primary key. This ensures:
- Same event from the same platform is never stored twice
- Cross-platform events with colliding IDs don't conflict
- Outbound events (agent replies) get generated UUIDs with no collision risk

### Recipients Column

`recipients` captures the per-event participant list as JSON. Populated by the adapter for platforms that provide it (email To/CC/BCC, small group members). `NULL` for large containers or platforms that don't provide per-event membership. Full membership tracked at container level in identity.db.

### No SQL Triggers for Attachments

Attachments are written to the relational `attachments` table via application code in the same transaction as the event INSERT. No SQL trigger auto-population. See [ATTACHMENTS.md](./ATTACHMENTS.md).

### FTS

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
    event_id UNINDEXED,
    content,
    tokenize='porter unicode61'
);
```

FTS triggers updated for new column names.

Entity resolution is always performed via the contacts table join — resolved entity IDs are not stored on the events table because entity mappings can change over time.

`request_id` is nullable. Backfill operations produce many events each linked to the parent backfill NexusRequest. Outbound events (agent replies) go in the same table with sender/receiver flipped.

---

## Location Hierarchy (identity.db)

The identity.db maintains the definitive directory of platform locations. The events table references these via ID columns but does NOT maintain its own aggregate tables.

**Hierarchy**: platform > space > container > thread

```sql
-- Workspaces, servers, teams
CREATE TABLE spaces (
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  current_name TEXT,
  metadata_json TEXT,
  PRIMARY KEY (platform, account_id, space_id)
);

-- Channels, DMs, group chats
CREATE TABLE containers (
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  container_id TEXT NOT NULL,
  container_kind TEXT NOT NULL,   -- direct | group
  space_id TEXT NOT NULL DEFAULT '',
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  current_name TEXT,
  metadata_json TEXT,
  PRIMARY KEY (platform, account_id, container_id)
);

-- Sub-threads within containers (Slack threads, Discord threads)
CREATE TABLE threads (
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  container_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  current_name TEXT,
  metadata_json TEXT,
  PRIMARY KEY (platform, account_id, container_id, thread_id)
);
```

The events.db `threads` table (previously auto-populated by SQL triggers) is **dropped**. All location aggregation uses the identity.db hierarchy.

---

## Container Membership

### Current State Materialization: container_participants

```sql
CREATE TABLE container_participants (
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  container_id TEXT NOT NULL,
  thread_id TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',     -- active | left | kicked | banned
  status_changed_at INTEGER,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  last_sender_name TEXT,
  last_avatar_url TEXT,
  PRIMARY KEY (platform, account_id, container_id, thread_id, entity_id)
);
```

Updated by `resolvePrincipals` on every inbound event. `status` is updated when processing `membership` content_type events (join, leave, kick, ban).

### Historic Membership via Events Table

Membership changes are regular events with `content_type: "membership"`. They are stored in the events table like any other event. No separate `membership_events` table.

To reconstruct point-in-time membership, query events with `content_type = 'membership'` for a container and replay the actions. For current state, query `container_participants`.

### On the NexusRequest Bus

Recipients are available on the bus for downstream consumers (especially memory):

```typescript
principals?: {
  sender: Entity;
  receiver: Entity;
  recipients?: Entity[];   // resolved from payload.recipients
};
```

For large containers, `recipients` is `undefined`. The memory retain agent can query `container_participants` via a tool for full membership.

---

## Entity Relationship Tables

### Pattern: Immutable Rows with Lifecycle

Both `entity_tags` and `entity_persona` follow the same pattern: each row is an immutable fact recording a relationship that existed from `created_at` to `deleted_at`.

When a relationship is removed, the row gets `deleted_at` set. When it's re-added later, a **new row** is created. This provides full history with a single table per relationship type.

### entity_tags

```sql
CREATE TABLE entity_tags (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES entities(id),
    tag TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,

    UNIQUE(entity_id, tag) WHERE deleted_at IS NULL
);

CREATE INDEX idx_entity_tags_entity ON entity_tags(entity_id);
CREATE INDEX idx_entity_tags_active ON entity_tags(entity_id) WHERE deleted_at IS NULL;
```

**Hydration**: `SELECT tag FROM entity_tags WHERE entity_id = ? AND deleted_at IS NULL` → `Entity.tags: string[]`

**Full history**: `SELECT * FROM entity_tags WHERE entity_id = ? ORDER BY created_at` shows every add/remove cycle.

### entity_persona (renamed from persona_bindings)

```sql
CREATE TABLE entity_persona (
    id TEXT PRIMARY KEY,
    receiver_entity_id TEXT NOT NULL,
    sender_entity_id TEXT,             -- NULL = default for all senders
    persona_ref TEXT NOT NULL,         -- persona folder name
    priority INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,

    UNIQUE(receiver_entity_id, sender_entity_id, persona_ref) WHERE deleted_at IS NULL
);

CREATE INDEX idx_entity_persona_receiver ON entity_persona(receiver_entity_id);
CREATE INDEX idx_entity_persona_active ON entity_persona(receiver_entity_id) WHERE deleted_at IS NULL;
```

**Hydration**: Query active bindings for the sender↔receiver pair, ordered by priority. Resolve `persona_ref` to an absolute filesystem path. Set `Entity.persona_path` and `AgentContext.persona_path`.

**Full history**: All binding changes are preserved as immutable rows.

### merge_candidates

Proposed entity merges that haven't been confirmed yet. The memory system's writer and consolidator agents propose merges when they detect that two entities likely refer to the same person/thing. High-confidence merges execute immediately (setting `merged_into` on the entity). Lower-confidence merges are recorded here for operator review.

```sql
CREATE TABLE merge_candidates (
    id          TEXT PRIMARY KEY,
    entity_a_id TEXT NOT NULL REFERENCES entities(id),
    entity_b_id TEXT NOT NULL REFERENCES entities(id),
    confidence  REAL NOT NULL,
    reason      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
    created_at  INTEGER NOT NULL,
    resolved_at INTEGER
);

CREATE INDEX idx_merge_candidates_status ON merge_candidates(status);
```

---

## Context Enrichment

Automations inject context for the agent via the `enrichment` map on `AutomationContext`. Each key names a context block. During context assembly, all enrichment blocks are rendered as XML tags and prepended to the user message:

```xml
<context_enrichment>
  <memories>
    Relevant memory entries retrieved by the memory-injection automation...
  </memories>
  <jira_context>
    PROJ-123: Sprint planning task, assigned to Tyler, due March 1...
  </jira_context>
</context_enrichment>
```

Enrichment is prepended to the **user message**, not injected into the system prompt. System prompt injection busts the prompt cache.

Automations contribute enrichment by returning it from their handler:

```typescript
return {
  fire: true,
  enrich: {
    memories: "relevant memory text...",
    jira_context: "PROJ-123 details...",
  },
};
```

---

## Persona Resolution

Persona resolution uses the `entity_persona` table (see [Entity Relationship Tables](#entity-relationship-tables)). The table supports per-sender persona customization, priority ordering, and active/inactive toggling.

During `resolvePrincipals`:
1. Query `entity_persona` for active bindings matching the receiver entity
2. If a sender-specific binding exists, use it (highest priority first)
3. Otherwise, use the default binding (`sender_entity_id IS NULL`)
4. Resolve `persona_ref` to an absolute filesystem path
5. Set `principals.receiver.persona_path` and `agent.persona_path`

The persona folder contains identity documents (`IDENTITY.md`, `SOUL.md`) used by `executeOperation` to build the agent's system prompt.

---

## Credential Storage

Credentials are stored in `identity.db` in a `credentials` table. The CLI operates directly against this table. The legacy `index.json` and scattered JSON config files are eliminated.

The ACL system references credentials by `service/account` string in `permissions.credentials`. Grants can add credential access via `"credential:service/account"` resources.

---

## Backfill Design

### Design Principle

A backfill is something the **nex runtime does to the adapter** — not the other way around. The nex runtime defines the backfill strategy. The adapter just emits events when asked.

### Operation

```
operation: "event.backfill"
```

A single NexusRequest per backfill. One pipeline pass. The payload describes the job:

```typescript
type BackfillPayload = {
  adapter: string;
  account: string;
  since: string;              // ISO date or relative ("7d", "30d")
  until?: string;             // optional end bound
  batch_size?: number;        // events per batch (default 500)
  options?: {
    skip_duplicates?: boolean;
    dry_run?: boolean;
  };
};
```

### Pipeline Flow

The NexusRequest goes through the standard pipeline. `executeOperation` runs the backfill job:

```
acceptRequest → resolvePrincipals → resolveAccess → executeOperation → finalizeRequest
                                                         │
                                              ┌──────────┴──────────┐
                                              │  Spawn adapter      │
                                              │  Stream JSONL       │
                                              │  For each batch:    │
                                              │    resolve contacts │
                                              │    bulk insert      │
                                              │    checkpoint       │
                                              └─────────────────────┘
```

Automations at `executeOperation` hookpoints fire **once** for the entire backfill job. They do NOT fire per-event.

### Contact Seeding is Interleaved

Contact resolution happens inline as each event is processed in the batch. For each event:

1. Check if `(platform, contact_id)` exists in contacts table
2. If not → create Entity row, create contact mapping
3. Write the event with the resolved association

**Why interleaved, not a separate first pass:**
- You have to resolve principals per-event anyway — an event can't be written without knowing who sent it.
- Doing a separate first pass would mean parsing the adapter's JSONL stream twice (or buffering the whole thing in memory).
- The adapter emits events linearly on stdout. Resolve contacts as you encounter them.
- If a contact already exists (from a prior `contacts.import` or a previous batch), the lookup succeeds immediately.

**Why not independent contact import:**
- Independent contact import (`contacts.import`) is a separate operation for a different use case — importing a contacts directory (Apple Contacts, Google Contacts) as entities, independent of event history.
- That operation exists alongside backfill, not as a replacement for backfill's contact seeding.
- The two are complementary: import contacts first if you have them, then backfill events. The backfill still resolves per-event because some senders may not appear in any contacts directory.

### What Does NOT Happen During Backfill

- **No `processEvent()` per event** — events are bulk-inserted directly to the events table
- **No memory hooks** — no agent turns means no `worker:pre_execution` hook, no episodes to retain
- **No per-event automations** — automations fire once at the job level
- **No per-event access checks** — access is checked once for the backfill operation itself
- **No delivery** — these are historical events, nothing to deliver
- **No agent execution** — no agent to run

### Memory Processing After Backfill

Memory processing is a separate operation that runs after event backfill completes:

```
operation: "memory.backfill"
```

This reads from the events table (the events just backfilled), groups them into episodes using the standard episode strategy, and runs the retain → consolidate pipeline. This is where memory automation hooks fire.

### Durability

Backfills can run for hours (8+ hours for adapters like gogcli). The job must survive crashes.

**Checkpoint-based resume via `backfill_runs` table (runtime.db):**

```sql
CREATE TABLE backfill_runs (
  id TEXT PRIMARY KEY,
  adapter TEXT NOT NULL,
  account TEXT NOT NULL,
  platform TEXT,
  from_time INTEGER,
  to_time INTEGER,
  events_processed INTEGER DEFAULT 0,
  contacts_seeded INTEGER DEFAULT 0,
  last_checkpoint TEXT,           -- timestamp cursor for resume
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running', 'paused', 'completed', 'failed')),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);
```

The `backfill_episodes` table is dropped — episode tracking is internal to the memory backfill operation.

**Resume flow:**
1. Job starts → INSERT with `status='running'`
2. Each batch commits → UPDATE `last_checkpoint`, `events_processed`
3. Crash
4. Resume → query `last_checkpoint` for the running job
5. Re-spawn adapter with `--since=last_checkpoint`

---

## Memory System Integration

### Event-Driven Architecture

The memory system is decoupled from the pipeline. The pipeline stores events. The memory system watches for patterns and acts.

**Flow:**
1. Event ingested → stored in events table
2. Episode detection runs (time-gap + token-budget windowing)
3. When episode boundary detected → `episode-created` event fires
4. `memory-writer` automation subscribes → runs retain
5. After retain → `memory-consolidator` chains off results

### Episode Detection: Hybrid Inline + Cron Timer

During `event.ingest`, after the event is stored, the pipeline slots it into an active episode:

- Look up `pending_retain_triggers` for `(platform, container_id, thread_id)` in runtime.db
- If no active episode: create a new set in memory.db with `definition_id = 'retain'`, insert the event as a `set_member`, insert a `pending_retain_triggers` row with the `set_id`, schedule a 90-minute timer via the cron adapter
- If active episode exists and within gap: add event as `set_member` to the existing set, update trigger row. Check token budget:
  - Under budget: cancel old timer, schedule new 90-minute timer (reset the clock)
  - Over budget: clip immediately — create job with `type_id = 'retain_v1'`, fire `episode-created` hookpoint, delete trigger row. Start fresh episode for this event.
- If gap exceeded (event timestamp > `last_event_at` + 90min): clip old episode, start new one

Events are slotted into sets (open episodes) in real-time. When an episode clips, the set already has all its members.

When the cron timer fires, it invokes the episode timeout handler directly as an internal runtime event — this does NOT go through the full pipeline (no principals to resolve, no access to check). The handler clips the episode: creates the job row, fires `episode-created` hookpoint.

**`pending_retain_triggers` schema (runtime.db):**

```sql
CREATE TABLE pending_retain_triggers (
    platform        TEXT NOT NULL,
    container_id    TEXT NOT NULL,
    thread_id       TEXT NOT NULL DEFAULT '',
    set_id          TEXT NOT NULL,
    first_event_at  INTEGER NOT NULL,
    last_event_at   INTEGER NOT NULL,
    token_estimate  INTEGER NOT NULL DEFAULT 0,
    event_count     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(platform, container_id, thread_id)
);
```

**Token budget:** 10,000 tokens per episode. When `token_estimate` exceeds this threshold, the episode clips immediately.

**Crash recovery:** On startup, scan `pending_retain_triggers`. Clip any where `last_event_at + 90min < now`. Reschedule timers for remaining active triggers.

### Hook Summary

| Hook Point | Automation | When It Fires | Blocking? |
|---|---|---|---|
| `worker:pre_execution` | `memory-injection` | Before every agent execution | Yes |
| `episode-created` | `memory-writer` | When an episode clips (token budget or silence timer) | No |
| `episode-retained` | `memory-consolidator` | After successful retain produces facts | No |

### Backfill Events Bypass Memory Hooks

Since backfill bulk-inserts to the events table without going through the pipeline, no episode events fire. Memory processing for backfilled events happens explicitly via `memory.backfill`.

### Legacy: Memory Flush (DELETE)

The pre-compaction memory flush (`runMemoryFlushIfNeeded()` in `src/reply/reply/agent-runner-memory.ts`) is a legacy holdover from the file-based `memory/*.md` system.

**Status: DELETE.** The V2 event-driven episode system handles this properly.

---

## Architecture Cleanup: Single Agent Invocation Path

### Current State (Legacy)

Two completely separate code paths invoke agents:

1. **Pipeline path** (`src/nex/pipeline.ts`): `processEvent()` → `runNEXPipelineStages()` → `runAgent` stage → `startBrokerExecution()`
2. **Reply agent path** (`src/reply/reply/agent-runner.ts`): `runReplyAgent()` — a separate entry point that independently duplicates automation hooks (`worker:pre_execution`, `after:runAgent`), memory reader injection, and context assembly.

The pipeline does not import the reply agent. They are parallel implementations with duplicated hook evaluation.

### Target State

**One path, one pipeline, always.** The reply agent module is eliminated entirely. All agent invocations go through:

```
acceptRequest → resolvePrincipals → resolveAccess → executeOperation → finalizeRequest
```

No separate agent invocation path. Hooks fire in one place. Delivery is initiated by the agent via tools, not by the pipeline.

**Features migrating from reply agent:**
- **Typing heartbeats** → adapter-internal (each adapter implements its own typing strategy)
- **Block streaming/chunking** → adapter-internal (each adapter chunks for its platform)
- **Followup queuing** → already handled by pipeline's SessionQueue
- **PI steering** → pipeline's abort-and-restart via SessionQueue is sufficient
- **Memory flush** → DELETE (replaced by event-driven episode system)

See [AGENT_DELIVERY.md](./AGENT_DELIVERY.md) for the full delivery architecture.

---

## Session Targeting (Broker-Internal)

Session targeting concepts (`target_kind`, `from_turn_id`, `label_hint`, `smart`) are **internal to the broker** and do not appear on the NexusRequest bus or in AutomationContext.

The `agent_send` tool passes these parameters directly to the broker for session resolution:
- `target_kind: "session"` — reuse existing session
- `target_kind: "new_session"` — always create fresh
- `target_kind: "fork"` — branch from a specific turn (`from_turn_id`)
- `label_hint` — soft suggestion for session naming
- `smart` — flag for intelligent broker routing

These are deferred from the canonical spec. The broker handles them internally during `executeOperation`.

---

## Open Items

- **Operation catalog**: Enumerate all operations with input/output OpenAPI schemas.
- **Agent context fields**: Additional agent configuration fields (thinking, reasoning_mode, timeout, etc.) need to be enumerated and captured.
- **Adapter protocol spec**: Capture the adapter protocol (16 operations, subprocess lifecycle, JSONL format) as a separate spec document.
- **contacts.import operation**: Design the independent contact directory import operation (Apple Contacts, Google Contacts, etc.) as a separate flow from backfill contact seeding.
- **Rate limiting**: Rate limit tracking and `permission_request` system to be designed on top of the simplified AccessContext.
- **Adapter SDK update**: All adapters need updating for new attachment field names and delivery protocol extensions.
