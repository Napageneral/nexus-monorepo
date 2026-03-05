# Workplan: Adapters, Channels, and Delivery Domain Unification
**Status:** COMPLETED — commit 2bcadaa4e
**Created:** 2026-03-04
**Spec References:**
- [API_DESIGN_BATCH_2.md](../API_DESIGN_BATCH_2.md) (channel data model: channels, channel_participants tables, contacts with entity_id)
- [API_DESIGN_BATCH_5.md](../API_DESIGN_BATCH_5.md) (adapter connections 13 ops, channel delivery 7 ops, event ingestion 2 ops)
- [ADAPTER_INTERFACE_UNIFICATION.md](../ADAPTER_INTERFACE_UNIFICATION.md) (unified adapter interface, SDK contract)
- [CREDENTIAL_AND_ADAPTER_CONNECTION_SYSTEM.md](../CREDENTIAL_AND_ADAPTER_CONNECTION_SYSTEM.md) (adapter_connections table, credential-to-connection linking)
- [MANAGER_AGENT_COMMUNICATIONS.md](../MANAGER_AGENT_COMMUNICATIONS.md) (sender identity decisions, channel authorization model)
- [RESOLVED_DECISIONS.md](../RESOLVED_DECISIONS.md) (channels deduplicated union 12 ops, Channel->Account Resolution Option C)
**Dependencies:**
- WP_IDENTITY_DB_OVERHAUL (channels, channel_participants, contacts tables in identity.db)
- WP_CREDENTIAL_SYSTEM (credentials, vault, adapter_connections tables in identity.db; credential resolution pipeline)

---

## Goal

Unify channels data, channel delivery, adapter connections, and event ingestion into a coherent domain model. Channels become the single abstraction for both "what communication paths exist" (data) and "how to send messages on them" (delivery). The `delivery.*` namespace is eliminated entirely. Adapter connections move from file-based state to database-backed operations. Event operations get plural naming. The adapter SDK contract remains internal (subprocess protocol) and is never directly exposed in the Nex operation taxonomy. Hard cutover -- no backwards compatibility.

End state:
- **channels.\*** is ONE unified domain with 12 operations spanning data queries and message delivery
- **adapters.connections.\*** has 13 operations backed by the `adapter_connections` table (from WP_CREDENTIAL_SYSTEM)
- **events.\*** has 5 operations with plural naming
- `channels.send` orchestrates: channel lookup -> adapter resolution -> credential resolution -> adapter binary spawn
- Channel records carry `account_id` from adapter discovery (Option C resolution)
- Pipeline and external callers use the same APIs

---

## Current State

### Channels (Plugin-Based Architecture)
**File:** `nex/src/nex/control-plane/server-methods/channels.ts`
- `channels.status` handler — builds channel account snapshots from plugin system
- `channels.logout` handler — delegates to plugin logout
- Both rely on the channel plugin architecture (`src/channels/plugins/`)
- Plugin-based: each channel (Discord, Slack, iMessage, etc.) registers a `ChannelPlugin` with config, status, runtime, and outbound interfaces
- Channel identity tied to config-based plugin IDs, NOT database records
- No database-backed channel records — everything lives in config and runtime state

**File:** `nex/src/nex/control-plane/protocol/schema/channels.ts`
- TypeBox schemas: `ChannelsStatusParamsSchema`, `ChannelAccountSnapshotSchema`, `ChannelsStatusResultSchema`, `ChannelsLogoutParamsSchema`
- Also contains `WebLoginStartParamsSchema`, `WebLoginWaitParamsSchema` (to be dropped)
- Also contains `TalkModeParamsSchema` (misplaced, unrelated to channels)

### Send/Delivery (Direct Channel Plugin Dispatch)
**File:** `nex/src/nex/control-plane/server-methods/send.ts`
- `send` handler — resolves outbound target via channel plugin, delivers via `deliverOutboundPayloads()`
- `poll` handler — sends polls via channel plugin's `outbound.sendPoll()`
- Uses `channelInput -> normalizeChannelId -> getChannelPlugin -> resolveOutboundTarget -> deliverOutboundPayloads` chain
- No credential resolution, no adapter binary spawning — delivery is entirely in-process through plugins
- Idempotency via `context.dedupe` map

### Adapter Connections (File-Based State)
**File:** `nex/src/nex/control-plane/server-methods/adapter-connections.ts` (~1800 lines)
- 12 handler functions covering OAuth, API key, file upload, custom setup flows
- **File-based storage:**
  - `~/nexus/state/adapter-connections/connections.json` — connection records
  - `~/nexus/state/adapter-connections/oauth-pending.json` — in-progress OAuth flows (10min TTL)
  - `~/nexus/state/adapter-connections/custom-setup-pending.json` — in-progress custom setups (24h TTL)
- Credential secrets written to hierarchical file store: `~/nexus/state/credentials/{service}/accounts/{account}/secrets/*.json`
- Uses `adapter.info` to discover adapter manifest, `adapter.health` to test connections, `adapter.setup.*` for custom flows
- All operations registered under `adapter.connections.*` (singular)

**File:** `nex/src/nex/control-plane/protocol/schema/adapter-connections.ts`
- TypeBox schemas for all adapter connection operations (list, status, OAuth, API key, upload, custom flow, test, disconnect)

### Adapter Protocol (Subprocess Interface)
**File:** `nex/src/nex/adapters/protocol.ts`
- Zod schemas for adapter info, health, accounts, events, delivery results, setup results, stream status
- `parseAdapterEventLine()` — parses adapter JSONL event output into `NexusInput` with `operation: "event.ingest"` (singular)
- `parseAdapterDeliveryResultLine()`, `parseAdapterStreamStatusLine()`, `parseAdapterSetupResultLine()`, `parseAdapterHealthLine()`
- Types: `AdapterSendInput`, `AdapterStreamInput`, `AdapterMonitorInput`, `AdapterBackfillInput`, `AdapterHealthInput`

### Adapter Capabilities (Runtime Bridge)
**File:** `nex/src/nex/control-plane/server-methods/adapter-capabilities.ts`
- Handlers for `adapter.info`, `adapter.health`, `adapter.accounts.list`, `adapter.monitor.start/stop`, `adapter.control.start`
- Handlers for `delivery.send`, `delivery.stream` — delegate to adapter manager subprocess spawning
- These are the in-taxonomy wrappers around adapter SDK verbs

### Event Ingestion
**File:** `nex/src/nex/control-plane/server-methods/event-ingest.ts`
- Single handler: `event.ingest` — delegates to `handleEventIngest()` from agent.ts
- Operation registered under singular `event.ingest`

### Runtime Operations Taxonomy
**File:** `nex/src/nex/control-plane/runtime-operations.ts`
- `EXTERNAL_ADAPTER_OPERATION_IDS` — lists adapter SDK verbs including `delivery.send`, `delivery.stream`, `delivery.react`, `delivery.edit`, `delivery.delete`, `delivery.poll`
- `STATIC_RUNTIME_OPERATION_TAXONOMY` — contains:
  - `delivery.send/stream/react/edit/delete/poll` operations (to be renamed to `channels.*`)
  - `adapter.connections.*` operations (singular, to be renamed to `adapters.connections.*`)
  - `event.ingest`, `event.backfill` (singular, to be pluralized)
  - `channels.status` is NOT in the taxonomy (currently unregistered, handled as ad-hoc)
  - `channels.logout` is NOT in the taxonomy (to be dropped)

### HTTP Ingress
**Files:** `nex/src/nex/control-plane/http-ingress/`
- `hooks-http.ts`, `openai-http.ts`, `openresponses-http.ts`, `webchat-session-http.ts`
- `HTTP_INGRESS_OPERATION_IDS` currently contains only `["event.ingest"]` (singular)

### Events Database
**File:** `nex/src/db/events.ts`
- Events table with full event rows (id, event_id, content, routing fields, etc.)
- Insert/query functions for events
- No `events.list`, `events.get`, `events.search` operations exposed yet

---

## Target State

### Channels Domain (12 Operations — Unified Data + Delivery)

The channels domain combines identity data (from WP_IDENTITY_DB_OVERHAUL's channels/channel_participants tables) with delivery operations (from adapter SDK delegation). One domain, one namespace.

**Channel Identity Key:** `(platform, account_id, container_id, thread_id)`

When an adapter connects and discovers channels (via `adapter.monitor.start`), it writes channel records WITH the `account_id` it used to discover them. If multiple accounts reach the same channel, there are multiple channel records.

**Operations:**

| Operation | Source | Verb | Description |
|-----------|--------|------|-------------|
| `channels.list` | B2+B5 | read | List channels with data AND delivery context (adapter/account bindings). Supports filters: platform, account_id, participant_entity_id, container_kind |
| `channels.get` | B2 | read | Get single channel with full record including participants and adapter binding |
| `channels.search` | B2 | read | Search channels by platform, space, container name, participant name |
| `channels.history` | B2 | read | Get naming history for a channel (immutable row pattern -- walk by identity key ordered by created_at DESC) |
| `channels.participants.list` | B2 | read | List participants in a channel with entity resolution |
| `channels.participants.get` | B2 | read | Get participant details (contact, entity, message count, role) |
| `channels.status` | B5 | read | Channel health -- resolves backing adapter, delegates to adapter health check |
| `channels.send` | B5 | write | Send a message on a channel (orchestrates credential resolution + adapter spawn) |
| `channels.stream` | B5 | write | Stream a response on a channel (typing indicators, progressive message updates) |
| `channels.react` | B5 | write | React to a message (stub -- returns UNAVAILABLE until adapter support) |
| `channels.edit` | B5 | write | Edit a message (stub -- returns UNAVAILABLE until adapter support) |
| `channels.delete` | B5 | write | Delete a message (stub -- returns UNAVAILABLE until adapter support) |

### channels.send Orchestration (Option C Resolution)

```
channels.send(channel_id, message, { sender_account_id })
  1. Look up channel record in identity.db → get platform, account_id, container_id, thread_id
  2. Resolve adapter name from platform (adapter registry)
  3. Find adapter_connection for (adapter, account_id) in adapter_connections table
  4. Get credential_id from adapter_connection record
  5. Resolve credential via storage provider (6-step credential resolution pipeline from WP_CREDENTIAL_SYSTEM)
  6. Write credential to temp context file (NEXUS_ADAPTER_CONTEXT_PATH)
  7. Spawn adapter binary with delivery.send verb + injected credential
  8. Parse adapter delivery result (AdapterDeliveryResultSchema)
  9. Return result to caller
```

### channels.list Enhanced Response

```typescript
// channels.list response includes delivery context
{
  channels: Array<{
    id: string;
    platform: string;
    account_id: string;
    space_id: string | null;
    space_name: string | null;
    container_id: string;
    container_kind: "direct" | "group";
    container_name: string | null;
    thread_id: string | null;
    thread_name: string | null;
    // Delivery context (from adapter_connections join)
    adapter: string | null;              // adapter name backing this channel
    adapter_connection_id: string | null; // adapter_connections.id
    adapter_status: string | null;       // 'connected' | 'disconnected' | 'error' | 'expired'
    participant_count: number;
    created_at: number;
    metadata_json: string | null;
  }>;
}
```

### MA Query Flow (Contact -> Channel -> Send)

```
MA: "Send Casey a message on Discord"
  → contacts.search("Casey") → Contact with entity_id
  → channels.list({ participant_entity_id: casey_entity_id, platform: "discord" })
  → Returns channels with their account_ids and adapter_status
  → MA picks channel + account, applies sender preference (from workspace)
  → channels.send(channel_id, message, { sender_account_id: selected_account_id })
```

### Adapter Connections Domain (13 Operations)

These operations are ALREADY defined in WP_CREDENTIAL_SYSTEM's `adapter-connection-operations.ts`. This workplan handles:
1. The namespace rename from `adapter.connections.*` to `adapters.connections.*`
2. Wiring these DB-backed operations into the taxonomy
3. Removing the file-based implementation

| Operation | Verb | Description |
|-----------|------|-------------|
| `adapters.connections.list` | read | List all adapter connections with status |
| `adapters.connections.get` | read | Get single adapter connection details |
| `adapters.connections.status` | read | Get connection health for a specific adapter |
| `adapters.connections.test` | read | Test connection (spawns adapter, runs `adapter.health`) |
| `adapters.connections.disconnect` | admin | Disconnect adapter (revoke credential, update status) |
| `adapters.connections.upload` | write | Upload file for file-based adapter import |
| `adapters.connections.oauth.start` | pair | Start OAuth flow (returns redirect URL) |
| `adapters.connections.oauth.complete` | pair | Complete OAuth flow (exchange code for tokens, write credential + connection) |
| `adapters.connections.apikey.save` | admin | Save API key credentials for adapter |
| `adapters.connections.custom.start` | pair | Start adapter-guided custom setup flow (spawns adapter with `adapter.setup.start`) |
| `adapters.connections.custom.submit` | pair | Submit step in custom setup flow (`adapter.setup.submit`) |
| `adapters.connections.custom.status` | read | Check custom setup flow status (`adapter.setup.status`) |
| `adapters.connections.custom.cancel` | pair | Cancel custom setup flow (`adapter.setup.cancel`) |

### Events Domain (5 Operations -- Plural Rename)

| Operation | Verb | Source | Description |
|-----------|------|--------|-------------|
| `events.ingest` | write | Batch 1+5 | Accept and process inbound event (chat, agent, system) |
| `events.list` | read | Batch 1 | List events with filters (platform, sender, time range, content_type) |
| `events.get` | read | Batch 1 | Get single event by ID |
| `events.search` | read | Batch 1 | Full-text search across events |
| `events.backfill` | write | Batch 5 | Trigger historical event backfill from adapter |

### Adapter SDK Contract (Internal Subprocess Protocol -- NOT in Nex Taxonomy)

These remain as internal verbs invoked by the Nex runtime via subprocess spawn. They are NOT operations in the Nex taxonomy. Documented here for reference only.

| SDK Verb | Direction | Protocol | Delegated From |
|----------|-----------|----------|----------------|
| `adapter.info` | Nex -> Adapter | One-shot spawn | `adapters.connections.get` (for manifest) |
| `adapter.health` | Nex -> Adapter | One-shot spawn | `adapters.connections.test`, `channels.status` |
| `adapter.accounts.list` | Nex -> Adapter | One-shot spawn | Account discovery |
| `adapter.monitor.start` | Nex -> Adapter | Long-running JSONL | Adapter lifecycle |
| `adapter.control.start` | Nex -> Adapter | Bidirectional JSONL | Device adapters |
| `adapter.setup.start` | Nex -> Adapter | One-shot | `adapters.connections.custom.start` |
| `adapter.setup.submit` | Nex -> Adapter | One-shot | `adapters.connections.custom.submit` |
| `adapter.setup.status` | Nex -> Adapter | One-shot | `adapters.connections.custom.status` |
| `adapter.setup.cancel` | Nex -> Adapter | One-shot | `adapters.connections.custom.cancel` |
| `delivery.send` | Nex -> Adapter | One-shot | `channels.send` |
| `delivery.stream` | Nex -> Adapter | Long-running JSONL | `channels.stream` |
| `delivery.react` | Nex -> Adapter | One-shot | `channels.react` |
| `delivery.edit` | Nex -> Adapter | One-shot | `channels.edit` |
| `delivery.delete` | Nex -> Adapter | One-shot | `channels.delete` |
| `delivery.poll` | Nex -> Adapter | One-shot | DROPPED from Nex taxonomy |
| `event.backfill` | Nex -> Adapter | Long-running JSONL | `events.backfill` |

---

## Changes Required

### Runtime Operations Taxonomy

**File:** `nex/src/nex/control-plane/runtime-operations.ts`

**1. Rename `adapter.connections.*` to `adapters.connections.*` (13 entries):**
```
adapter.connections.list         → adapters.connections.list
adapter.connections.status       → adapters.connections.status
adapter.connections.oauth.start  → adapters.connections.oauth.start
adapter.connections.oauth.complete → adapters.connections.oauth.complete
adapter.connections.apikey.save  → adapters.connections.apikey.save
adapter.connections.upload       → adapters.connections.upload
adapter.connections.custom.start → adapters.connections.custom.start
adapter.connections.custom.submit → adapters.connections.custom.submit
adapter.connections.custom.status → adapters.connections.custom.status
adapter.connections.custom.cancel → adapters.connections.custom.cancel
adapter.connections.test         → adapters.connections.test
adapter.connections.disconnect   → adapters.connections.disconnect
```

**2. Add `adapters.connections.get` (missing from current taxonomy):**
```typescript
"adapters.connections.get": { kind: "control", action: "read", resource: "adapters.connections" },
```

**3. Rename `delivery.*` to `channels.*` (5 entries) and DROP `delivery.poll`:**
```
delivery.send   → channels.send   (resource: "channels.delivery")
delivery.stream → channels.stream (resource: "channels.delivery")
delivery.react  → channels.react  (resource: "channels.delivery")
delivery.edit   → channels.edit   (resource: "channels.delivery")
delivery.delete → channels.delete (resource: "channels.delivery")
delivery.poll   → DROPPED
```

**4. Add missing channel data operations (5 entries):**
```typescript
"channels.list":              { kind: "control", action: "read",  resource: "channels" },
"channels.get":               { kind: "control", action: "read",  resource: "channels" },
"channels.search":            { kind: "control", action: "read",  resource: "channels" },
"channels.history":           { kind: "control", action: "read",  resource: "channels.history" },
"channels.participants.list": { kind: "control", action: "read",  resource: "channels.participants" },
"channels.participants.get":  { kind: "control", action: "read",  resource: "channels.participants" },
```

**5. Register `channels.status` formally (currently unregistered):**
```typescript
"channels.status": { kind: "control", action: "read", resource: "channels.status" },
```

**6. Rename `event.*` to `events.*` (2 entries):**
```
event.ingest   → events.ingest   (keep same surfaces)
event.backfill → events.backfill (keep same surfaces)
```

**7. Add missing events operations (3 entries):**
```typescript
"events.list":   { kind: "control", action: "read", resource: "events" },
"events.get":    { kind: "control", action: "read", resource: "events" },
"events.search": { kind: "control", action: "read", resource: "events" },
```

**8. Update `HTTP_INGRESS_OPERATION_IDS`:**
```typescript
export const HTTP_INGRESS_OPERATION_IDS = ["events.ingest"] as const;
```

**9. Remove old operations from taxonomy:**
- Remove all `adapter.connections.*` entries (singular)
- Remove all `delivery.*` entries
- Remove `event.ingest`, `event.backfill` (singular)

### New Code

**File:** `nex/src/nex/control-plane/server-methods/channels-data.ts` (NEW)
- Channel data operations backed by identity.db:
  - `channelsList(db, filters)` — Query channels table with optional joins to adapter_connections for delivery context. Filters: platform, account_id, participant_entity_id, container_kind, space_id
  - `channelsGet(db, id)` — Get single channel with participants and adapter binding
  - `channelsSearch(db, query)` — Search channels by name fragments, platform, participant
  - `channelsHistory(db, platform, account_id, container_id, thread_id)` — Walk immutable rows for naming history
  - `channelsParticipantsList(db, channel_id)` — List participants with entity resolution
  - `channelsParticipantsGet(db, channel_id, participant_id)` — Get single participant details

**File:** `nex/src/nex/control-plane/server-methods/channels-delivery.ts` (NEW)
- Channel delivery operations orchestrating adapter subprocess calls:
  - `channelsSend(db, channel_id, message, opts)` — Full orchestration chain: channel lookup -> adapter resolution -> adapter_connection lookup -> credential resolution -> adapter binary spawn with `delivery.send` -> parse result
  - `channelsStream(db, channel_id, message, opts)` — Same chain but spawns adapter with `delivery.stream`, manages long-running JSONL stream
  - `channelsStatus(db, channel_id)` — Look up channel's adapter, spawn adapter with `adapter.health`, return health
  - `channelsReact(db, channel_id, message_id, reaction)` — Stub returning UNAVAILABLE
  - `channelsEdit(db, channel_id, message_id, content)` — Stub returning UNAVAILABLE
  - `channelsDelete(db, channel_id, message_id)` — Stub returning UNAVAILABLE
- Helper: `resolveChannelDeliveryContext(db, channel_id, sender_account_id?)` — Resolves channel record -> adapter -> adapter_connection -> credential. Returns `{ adapter, account_id, credential, channel }` or error.

**File:** `nex/src/nex/control-plane/server-methods/events-operations.ts` (NEW)
- Events query operations backed by events.db:
  - `eventsList(db, filters)` — List events with filters (platform, sender_id, time range, content_type, container_id). Pagination via cursor.
  - `eventsGet(db, id)` — Get single event by ID with full payload
  - `eventsSearch(db, query)` — Full-text search using events_fts table (if available) or LIKE fallback

**File:** `nex/src/nex/control-plane/protocol/schema/channels-delivery.ts` (NEW)
- TypeBox schemas for delivery operations:
  - `ChannelsSendParamsSchema` — `{ channel_id, message, sender_account_id?, media_urls?, reply_to_id?, idempotency_key }`
  - `ChannelsSendResultSchema` — `{ message_ids, chunks_sent, channel_id }`
  - `ChannelsStreamParamsSchema` — `{ channel_id, message, sender_account_id?, events? }`
  - `ChannelsReactParamsSchema` — `{ channel_id, message_id, reaction }`
  - `ChannelsEditParamsSchema` — `{ channel_id, message_id, content }`
  - `ChannelsDeleteParamsSchema` — `{ channel_id, message_id }`

**File:** `nex/src/nex/control-plane/protocol/schema/channels-data.ts` (NEW)
- TypeBox schemas for channel data operations:
  - `ChannelsListParamsSchema` — `{ platform?, account_id?, participant_entity_id?, container_kind?, space_id?, limit?, cursor? }`
  - `ChannelsGetParamsSchema` — `{ id }`
  - `ChannelsSearchParamsSchema` — `{ query, platform?, limit? }`
  - `ChannelsHistoryParamsSchema` — `{ platform, account_id, container_id, thread_id? }`
  - `ChannelsParticipantsListParamsSchema` — `{ channel_id }`
  - `ChannelsParticipantsGetParamsSchema` — `{ channel_id, participant_id }`

**File:** `nex/src/nex/control-plane/protocol/schema/events.ts` (NEW)
- TypeBox schemas for events query operations:
  - `EventsListParamsSchema` — `{ platform?, sender_id?, after?, before?, content_type?, container_id?, limit?, cursor? }`
  - `EventsGetParamsSchema` — `{ id }`
  - `EventsSearchParamsSchema` — `{ query, platform?, limit? }`

### Modified Files

**File:** `nex/src/nex/control-plane/runtime-operations.ts`
- **Rename:** All `adapter.connections.*` entries to `adapters.connections.*`
- **Add:** `adapters.connections.get` entry
- **Rename:** All `delivery.*` entries to `channels.*`
- **Remove:** `delivery.poll` entry
- **Add:** `channels.list`, `channels.get`, `channels.search`, `channels.history`, `channels.participants.list`, `channels.participants.get`, `channels.status` entries
- **Rename:** `event.ingest` to `events.ingest`, `event.backfill` to `events.backfill`
- **Add:** `events.list`, `events.get`, `events.search` entries
- **Update:** `HTTP_INGRESS_OPERATION_IDS` from `["event.ingest"]` to `["events.ingest"]`
- **Update:** `EXTERNAL_ADAPTER_OPERATION_IDS` remains unchanged (these are adapter SDK verbs, not Nex taxonomy)

**File:** `nex/src/nex/control-plane/server-methods/channels.ts`
- **Rewrite:** `channels.status` handler to use DB-backed channel lookup + adapter health delegation (instead of plugin-based snapshot building)
- **Remove:** `channels.logout` handler (superseded by `adapters.connections.disconnect`)
- **Remove:** All plugin-based channel status infrastructure (replaced by DB queries)

**File:** `nex/src/nex/control-plane/server-methods/send.ts`
- **Remove:** `send` handler (replaced by `channels.send` in channels-delivery.ts)
- **Remove:** `poll` handler (`delivery.poll` is DROPPED)
- **File can be deleted entirely** once channels-delivery.ts is wired

**File:** `nex/src/nex/control-plane/server-methods/adapter-connections.ts`
- **Remove:** All file-based storage code (connections.json, oauth-pending.json, custom-setup-pending.json reads/writes)
- **Rewrite:** All 12 handlers to use adapter_connections table from identity.db (via functions from WP_CREDENTIAL_SYSTEM)
- **Rename:** Handler registration keys from `adapter.connections.*` to `adapters.connections.*`
- **Add:** `adapters.connections.get` handler
- **Update:** OAuth completion to write to credentials + adapter_connections tables (instead of file system)
- **Update:** API key save to write to credentials + adapter_connections tables
- **Update:** Custom setup completion to write to credentials + adapter_connections tables
- **Remove:** `writeSecretRecord()` and all hierarchical file path construction code

**File:** `nex/src/nex/control-plane/server-methods/adapter-capabilities.ts`
- **Keep:** `adapter.info`, `adapter.health`, `adapter.accounts.list`, `adapter.monitor.start/stop`, `adapter.control.start` handlers (these are adapter SDK bridge handlers, separate from taxonomy)
- **Remove:** `delivery.send`, `delivery.stream` handlers (replaced by `channels.send`, `channels.stream` in channels-delivery.ts)
- **These adapter SDK bridge handlers are used internally** by the new channels-delivery orchestration, not registered directly in the taxonomy

**File:** `nex/src/nex/control-plane/server-methods/event-ingest.ts`
- **Rename:** Handler key from `event.ingest` to `events.ingest`
- **Add:** `events.backfill` handler (triggers adapter backfill via adapter manager)

**File:** `nex/src/nex/adapters/protocol.ts`
- **Update:** `parseAdapterEventLine()` to emit `operation: "events.ingest"` (plural) instead of `"event.ingest"`
- **No other changes** — adapter SDK verbs (`delivery.send`, etc.) remain as-is in the subprocess protocol

**File:** `nex/src/nex/control-plane/protocol/schema/channels.ts`
- **Remove:** `ChannelsLogoutParamsSchema` (channels.logout is dropped)
- **Remove:** `WebLoginStartParamsSchema`, `WebLoginWaitParamsSchema` (web.login.* is dropped)
- **Move:** `TalkModeParamsSchema` to appropriate schema file (it's misplaced here)
- **Keep:** `ChannelsStatusParamsSchema`, `ChannelAccountSnapshotSchema` (may still be useful for transition)

**File:** `nex/src/nex/control-plane/protocol/schema/adapter-connections.ts`
- **No schema changes** — TypeBox schemas are the same, only the handler registration keys change

**File:** `nex/src/nex/control-plane/server/ws-connection/message-handler.ts`
- **Update:** Any hardcoded references to `event.ingest` -> `events.ingest`
- **Update:** Any hardcoded references to `adapter.connections.*` -> `adapters.connections.*`

**File:** `nex/src/nex/stages/acceptRequest.ts`
- **Update:** Any references to `event.ingest` -> `events.ingest`

**File:** `nex/src/nex/stages/executeOperation.ts`
- **Update:** Any references to `event.ingest` -> `events.ingest`
- **Update:** Any references to `delivery.*` -> `channels.*`

**File:** `nex/src/nex/control-plane/nexus-event-dispatch.ts`
- **Update:** Any references to `event.ingest` -> `events.ingest`
- **Update:** Any references to `delivery.*` -> route to new channels-delivery handlers

**File:** `nex/src/nex/adapters/manager.ts`
- **Update:** Any references to `event.ingest` -> `events.ingest`
- **Update:** Any references to `delivery.*` in adapter spawning to remain as adapter SDK verbs (these are subprocess protocol, NOT Nex taxonomy)
- **Verify:** Adapter manager still spawns with `delivery.send` as the SDK verb — the rename only affects the Nex API layer, not the subprocess invocation

**File:** `nex/src/iam/audit.ts`
- **Update:** Any hardcoded references to `delivery.*` operation names

**File:** `nex/src/iam/identity.ts`
- **Update:** Any references to `delivery.*` operation names
- **Update:** Any references to `event.ingest` -> `events.ingest`

**File:** `nex/src/nex/control-plane/http-ingress/hooks-http.ts`
- **Update:** Operation dispatch from `event.ingest` to `events.ingest`

**File:** `nex/src/nex/control-plane/http-ingress/openai-http.ts`
- **Update:** Operation dispatch from `event.ingest` to `events.ingest`

**File:** `nex/src/nex/control-plane/http-ingress/openresponses-http.ts`
- **Update:** Operation dispatch from `event.ingest` to `events.ingest`

**File:** `nex/src/nex/control-plane/http-ingress/webchat-session-http.ts`
- **Update:** Operation dispatch from `event.ingest` to `events.ingest`

### Deleted Files/Code

**Files deleted entirely:**
- `nex/src/nex/control-plane/server-methods/send.ts` — replaced by channels-delivery.ts

**Handlers removed:**
- `channels.logout` — superseded by `adapters.connections.disconnect`
- `delivery.send` — renamed to `channels.send`
- `delivery.stream` — renamed to `channels.stream`
- `delivery.react/edit/delete` — renamed to `channels.react/edit/delete`
- `delivery.poll` — DROPPED entirely (no channel-level equivalent)
- `send` (the current `send` handler) — replaced by `channels.send`
- `poll` — DROPPED (`delivery.poll` is dropped)

**Schemas removed:**
- `ChannelsLogoutParamsSchema` from channels.ts
- `WebLoginStartParamsSchema`, `WebLoginWaitParamsSchema` from channels.ts

**File-based storage removed:**
- `~/nexus/state/adapter-connections/connections.json` (replaced by adapter_connections table)
- `~/nexus/state/adapter-connections/oauth-pending.json` (replaced by in-memory or DB ephemeral state)
- `~/nexus/state/adapter-connections/custom-setup-pending.json` (replaced by in-memory or DB ephemeral state)
- All file read/write code in adapter-connections.ts that references these paths

**Operations removed from taxonomy:**
- All `adapter.connections.*` (singular) — replaced by `adapters.connections.*` (plural)
- All `delivery.*` — replaced by `channels.*`
- `event.ingest`, `event.backfill` (singular) — replaced by `events.ingest`, `events.backfill` (plural)
- `channels.logout` — DROPPED
- `web.login.start`, `web.login.wait` — DROPPED

### Operations to Register

**Channels domain (12 ops):**
- `channels.list`, `channels.get`, `channels.search`, `channels.history`
- `channels.participants.list`, `channels.participants.get`
- `channels.status`
- `channels.send`, `channels.stream`, `channels.react`, `channels.edit`, `channels.delete`

**Adapter connections domain (13 ops):**
- `adapters.connections.list`, `adapters.connections.get`, `adapters.connections.status`, `adapters.connections.test`, `adapters.connections.disconnect`
- `adapters.connections.upload`
- `adapters.connections.oauth.start`, `adapters.connections.oauth.complete`
- `adapters.connections.apikey.save`
- `adapters.connections.custom.start`, `adapters.connections.custom.submit`, `adapters.connections.custom.status`, `adapters.connections.custom.cancel`

**Events domain (5 ops):**
- `events.ingest`, `events.backfill`
- `events.list`, `events.get`, `events.search`

**Total: 30 operations**

---

## Execution Order

### Phase 1: Taxonomy Rename (FOUNDATION -- No Logic Changes)
1. **Rename operations in runtime-operations.ts** — `adapter.connections.*` -> `adapters.connections.*`, `delivery.*` -> `channels.*`, `event.*` -> `events.*`. Add missing entries. Remove dropped entries. Update `HTTP_INGRESS_OPERATION_IDS`.
2. **Update all references across codebase** — Grep for every old operation name and update. This includes:
   - `nex/src/nex/adapters/protocol.ts` (`parseAdapterEventLine` operation field)
   - `nex/src/nex/stages/acceptRequest.ts`
   - `nex/src/nex/stages/executeOperation.ts`
   - `nex/src/nex/control-plane/nexus-event-dispatch.ts`
   - `nex/src/nex/adapters/manager.ts`
   - `nex/src/iam/audit.ts`
   - `nex/src/iam/identity.ts`
   - All `nex/src/nex/control-plane/http-ingress/*.ts` files
   - `nex/src/nex/control-plane/server/ws-connection/message-handler.ts`
   - All test files referencing old operation names
3. **Update handler registration keys** — In the server method registry, rename all handler keys to match new operation names
4. **Verify build + existing tests pass** — Ensure rename is complete and nothing references old names

### Phase 2: Channel Data Operations (DEPENDS on WP_IDENTITY_DB_OVERHAUL)
5. **Write channel data schemas** — `protocol/schema/channels-data.ts` (TypeBox schemas for list, get, search, history, participants)
6. **Write channel data handlers** — `server-methods/channels-data.ts` (6 operations querying identity.db channels + channel_participants tables)
7. **Register channel data handlers** — Wire `channels.list`, `channels.get`, `channels.search`, `channels.history`, `channels.participants.list`, `channels.participants.get` into server method registry
8. **Test channel data operations** — Unit tests with seeded identity.db

### Phase 3: Channel Delivery Orchestration (DEPENDS on WP_CREDENTIAL_SYSTEM + Phase 2)
9. **Write delivery schemas** — `protocol/schema/channels-delivery.ts` (TypeBox schemas for send, stream, react, edit, delete)
10. **Write `resolveChannelDeliveryContext()`** — Helper that resolves channel_id -> adapter -> adapter_connection -> credential. This is the core of Option C resolution.
11. **Write `channels.send` handler** — Full orchestration: resolve delivery context, spawn adapter binary with `delivery.send` verb, parse result. Replaces old `send` handler.
12. **Write `channels.stream` handler** — Same orchestration but long-running JSONL stream with adapter `delivery.stream` verb. Replaces delivery.stream from adapter-capabilities.ts.
13. **Write `channels.status` handler** — DB-backed: look up channel's adapter, spawn adapter with `adapter.health`, return health. Replaces plugin-based status handler.
14. **Write stub handlers** — `channels.react`, `channels.edit`, `channels.delete` returning UNAVAILABLE
15. **Register all delivery handlers** — Wire into server method registry
16. **Delete old send.ts** — Remove `send` and `poll` handlers entirely
17. **Remove delivery handlers from adapter-capabilities.ts** — Remove `delivery.send`, `delivery.stream` handlers (moved to channels-delivery.ts)

### Phase 4: Adapter Connections DB Migration (DEPENDS on WP_CREDENTIAL_SYSTEM)
18. **Rewrite adapter-connections.ts** — Replace all file-based storage with adapter_connections table operations from WP_CREDENTIAL_SYSTEM
19. **Rename handler keys** — All `adapter.connections.*` -> `adapters.connections.*` in the handler map
20. **Add `adapters.connections.get` handler** — New handler querying adapter_connections by ID
21. **Update OAuth flow** — Completion writes to credentials + adapter_connections tables instead of filesystem
22. **Update API key flow** — Save writes to credentials + adapter_connections tables instead of filesystem
23. **Update custom setup flow** — Completion writes to credentials + adapter_connections tables
24. **Remove file-based state** — Delete all connections.json, oauth-pending.json, custom-setup-pending.json read/write code
25. **Test all 13 adapter connection operations** — Integration tests with identity.db

### Phase 5: Events Operations (PARALLEL with Phase 2-4)
26. **Write events schemas** — `protocol/schema/events.ts` (TypeBox schemas for list, get, search)
27. **Write events query handlers** — `server-methods/events-operations.ts` (3 query operations against events.db)
28. **Update event-ingest.ts** — Rename handler key to `events.ingest`, add `events.backfill` handler
29. **Register all events handlers** — Wire `events.list`, `events.get`, `events.search`, `events.ingest`, `events.backfill` into server method registry
30. **Test events operations** — Unit tests with seeded events.db

### Phase 6: Cleanup (DEPENDS on Phases 2-5)
31. **Remove channels.logout handler** — Delete from channels.ts
32. **Remove dropped schemas** — `ChannelsLogoutParamsSchema`, `WebLoginStartParamsSchema`, `WebLoginWaitParamsSchema` from channels.ts
33. **Move `TalkModeParamsSchema`** — From channels.ts to a more appropriate schema file
34. **Clean up plugin-based channel status code** — Remove old snapshot-building infrastructure from channels.ts (replaced by DB-backed status)
35. **Remove dead code** — Grep for any remaining references to `delivery.poll`, `channels.logout`, `web.login.*`
36. **Update adapter-connections.test.ts** — Rename all operation references, update to test DB-backed handlers

### Phase 7: Testing & Validation
37. **End-to-end: channels.send flow** — Contact search -> channel list -> channel send -> verify adapter spawned with correct credential
38. **End-to-end: adapter connection setup** — OAuth start -> complete -> verify credential + adapter_connection in DB -> test connection
39. **End-to-end: events pipeline** — Adapter monitor emits event -> events.ingest -> verify in events.db -> events.list returns it
40. **Integration: MA query flow** — contacts.search -> channels.list with participant_entity_id filter -> channels.send with sender_account_id
41. **ACL tests** — Verify channels.send checks permissions, adapters.connections.disconnect requires admin
42. **Stub verification** — channels.react, channels.edit, channels.delete return UNAVAILABLE gracefully

---

## Notes

**Hard cutover:** No backwards compatibility. All `delivery.*` operations are removed. All `adapter.connections.*` (singular) operations are removed. All `event.*` (singular) operations are removed. Any client (UI, CLI, app, agent) using old operation names will get operation-not-found errors.

**Adapter SDK verbs are NOT renamed.** The subprocess protocol still uses `delivery.send`, `delivery.stream`, etc. These are adapter binary CLI verbs, not Nex API operation names. The rename only affects the Nex control plane taxonomy. Adapter binaries do not need any changes.

**Channel plugin system transition:** The existing channel plugin architecture (Discord, Slack, iMessage plugins with config-based identity) is gradually replaced by DB-backed channel records. During transition, the `channels.status` handler may need to fall back to plugin-based status for channels not yet in the DB. However, this is a hard cutover -- plugin-based delivery (the current `send` handler using `deliverOutboundPayloads`) is fully replaced by adapter-based delivery (the new `channels.send` using adapter binary spawning).

**Dependency ordering is critical:**
1. WP_IDENTITY_DB_OVERHAUL must complete first (creates channels, channel_participants tables)
2. WP_CREDENTIAL_SYSTEM must complete first (creates credentials, adapter_connections tables; provides credential resolution pipeline)
3. Phase 1 (taxonomy rename) has no dependencies and can start immediately
4. Phase 5 (events) is parallelizable with Phases 2-4

**channels.list must join adapter_connections.** The key value of the unified channels domain is that `channels.list` returns delivery context alongside data. This requires a JOIN between identity.db's channels table and the adapter_connections table to include adapter status, adapter name, and connection health in the channel list response.

**Idempotency for channels.send:** The current `send` handler uses `context.dedupe` for idempotency. The new `channels.send` must preserve this pattern using the `idempotency_key` parameter.

**Pending OAuth/custom setup flows:** The current implementation stores pending flows in JSON files with TTLs (10min for OAuth, 24h for custom). The new implementation can use in-memory maps with the same TTLs (these are short-lived and don't need crash recovery), or optionally persist to an ephemeral table. Recommendation: in-memory with TTL expiry, matching the current behavior without the file I/O.

**`send` handler backwards compatibility period:** If external callers depend on the bare `send` operation name, it could temporarily be aliased to `channels.send`. However, the hard cutover policy says no backwards compatibility -- clients must update.
