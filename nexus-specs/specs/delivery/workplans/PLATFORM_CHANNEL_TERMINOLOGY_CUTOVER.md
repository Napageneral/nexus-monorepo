# Platform/Channel Terminology Cutover

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-24  
**Scope:** Runtime terminology normalization across NEX, IAM, control-plane, and memory ledgers  
**Related:**
- `UNIFIED_DELIVERY_TAXONOMY.md`
- `UNIFIED_DELIVERY_TAXONOMY_WORKPLAN.md`
- `RUNTIME_ROUTING.md`
- `iam/POLICY_ARCHITECTURE_UNIFICATION.md`

---

## 1. Why This Exists

Runtime currently overloads the word `channel` for multiple unrelated meanings:

1. **Platform alias** (`from_channel`, `message_channel`, `requester_channel`)  
2. **Domain container kind** (`container_kind = "channel"`)  
3. **Vendor/API noun** (`channelAccessToken`, update channel)

This causes implementation drift, audit ambiguity, and recurring prompt/runtime confusion.

This spec defines a **hard cutover** to canonical names with no legacy alias behavior.

---

## 2. Canonical Vocabulary (Normative)

### 2.1 Delivery Surface

- Use `platform` for transport system identity (`discord`, `slack`, `imessage`, `gmail`, etc.).
- Use `container_kind` for location kind (`dm`, `group`, `channel`, `direct`).
- Use `container_id` for platform-native destination id.

### 2.2 Keep as Domain Terms (Do NOT Rename)

These are semantically correct and remain:

- `container_kind = "channel"` (taxonomy value)
- `MessagingTargetKind = "channel"` (target type)
- Discord/Slack concept names that genuinely refer to channel containers

### 2.3 Keep as Vendor/API Terms (Do NOT Rename)

These remain because they are external contract language:

- `channelAccessToken` (LINE)
- update `channel` (`stable|beta|dev`)
- image alpha channel terminology

---

## 3. Hard-Cutover Policy

1. No read/write compatibility aliases for renamed platform fields.
2. No fallback parsing of legacy request keys (for renamed keys in this spec).
3. Runtime reset/migration is required at deployment boundary.
4. Domain `channel` semantics (container kind/target kind) are preserved.

---

## 4. Rename Matrix (Authoritative)

## 4.1 Events Ledger (`events.db`)

| Current | Canonical | Meaning |
|---|---|---|
| `events.from_channel` | `events.platform` | Sender platform id |
| `threads.channel` | `threads.platform` | Thread platform |
| `event_participants.channel` | `event_participants.platform` | Participant platform |
| `to_recipients[].channel` (JSON) | `to_recipients[].platform` | Recipient platform |
| `idx_events_from` | `idx_events_platform` | Index rename |
| `idx_threads_channel` | `idx_threads_platform` | Index rename |
| `idx_event_participants_lookup(channel, identifier)` | `idx_event_participants_lookup(platform, identifier)` | Index rename |

## 4.2 Memory Ledger (`memory.db`)

| Current | Canonical | Meaning |
|---|---|---|
| `episodes.channel` | `episodes.platform` | Episode platform |
| `episode_definitions.channel` | `episode_definitions.platform` | Definition scope platform |
| `idx_episodes_channel` | `idx_episodes_platform` | Index rename |

## 4.3 IAM Ledger (`identity.db`)

| Current | Canonical | Meaning |
|---|---|---|
| `permission_requests.requester_channel` | `permission_requests.requester_platform` | Request origin platform |
| `permission_requests.response_channel` | `permission_requests.response_platform` | Response platform |
| `access_log.channel` | **REMOVE** (retain only `platform`) | Duplicate alias column |
| `idx_access_log_channel` | **REMOVE** | Duplicate alias index |

## 4.4 Runtime Session/Ingress Models

| Current | Canonical | Meaning |
|---|---|---|
| `DeliveryContext.channel` (session helper model) | `DeliveryContext.platform` | Last delivery platform |
| `lastChannel` | `lastPlatform` | Last platform |
| `message_channel` | `message_platform` | Requested delivery platform |
| agent API `channel` | `platform` | Requested platform |
| agent API `replyChannel` | `replyPlatform` | Reply platform |

---

## 5. Explicit Non-Renames

The following are intentionally unchanged:

- `delivery.container_kind === "channel"`
- `MessagingTargetKind = "user" | "channel"`
- Config namespace `channels.*` (separate architecture decision; not part of this cutover)
- Plugin registry terms under `src/platforms/*` (adapter/plugin domain naming)

Note: config namespace consolidation (`channels` -> `platforms`) is a separate major refactor and not required for this cutover.

---

## 6. Required Code Touchpoints

Minimum impacted areas (non-exhaustive):

1. Event schema + triggers:
   - `nex/src/db/events.ts`
2. Memory schema + queries:
   - `nex/src/db/memory.ts`
   - `nex/src/memory/recall.ts`
   - `nex/src/memory/retain-live.ts`
   - `nex/src/memory/retain-episodes.ts`
   - `nex/src/cli/memory-backfill-cli.ts`
3. IAM schema + audit:
   - `nex/src/db/identity.ts`
   - `nex/src/iam/audit.ts`
   - `nex/src/nex/control-plane/iam-authorize.ts`
4. Session metadata + ingress/control-plane:
   - `nex/src/utils/delivery-context.ts`
   - `nex/src/sessions/ledger-session-meta.ts`
   - `nex/src/config/sessions/store.ts`
   - `nex/src/nex/ingress-metadata.ts`
   - `nex/src/nex/control-plane/protocol/schema/agent.ts`
   - `nex/src/nex/control-plane/server-methods/agent.ts`
   - `nex/src/nex/control-plane/hooks.ts`
   - `nex/src/nex/tool-invoke.ts`

---

## 7. Migration Strategy

### 7.1 Development Cutover (Preferred)

Because this is a hard cutover and local data can be regenerated:

1. Stop runtime.
2. Delete local ledgers (`events.db`, `memory.db`, `identity.db`, `agents.db`, `nexus.db`, `embeddings.db`) in the active state dir.
3. Start runtime on new schema/code.
4. Re-run backfill + conformance tests.

This is the cleanest path and avoids fragile legacy translation code.

### 7.2 SQL Migration Path (If Ledger Preservation Required)

If preserving existing ledgers is required, apply explicit rename migrations and rebuild dependent triggers/indexes.  
For `events.db`, trigger bodies referencing JSON keys must be rebuilt (`$.channel` -> `$.platform`).

Normative requirement: do not leave dual-write or alias columns post-migration.

### 7.3 Concrete SQL Cutover Appendix (Preserve Existing Ledgers)

The following statements are the required baseline.

#### `events.db`

```sql
BEGIN;
ALTER TABLE events RENAME COLUMN from_channel TO platform;
ALTER TABLE threads RENAME COLUMN channel TO platform;
ALTER TABLE event_participants RENAME COLUMN channel TO platform;

DROP INDEX IF EXISTS idx_events_from;
CREATE INDEX IF NOT EXISTS idx_events_platform ON events(platform, from_identifier);

DROP INDEX IF EXISTS idx_threads_channel;
CREATE INDEX IF NOT EXISTS idx_threads_platform ON threads(platform);

DROP INDEX IF EXISTS idx_event_participants_lookup;
CREATE INDEX IF NOT EXISTS idx_event_participants_lookup ON event_participants(platform, identifier);
COMMIT;
```

After column rename, all triggers referencing `from_channel` or JSON key `$.channel` in `to_recipients` must be dropped and recreated against `platform` / `$.platform`.

#### `memory.db`

```sql
BEGIN;
ALTER TABLE episodes RENAME COLUMN channel TO platform;
ALTER TABLE episode_definitions RENAME COLUMN channel TO platform;
DROP INDEX IF EXISTS idx_episodes_channel;
CREATE INDEX IF NOT EXISTS idx_episodes_platform ON episodes(platform);
COMMIT;
```

#### `identity.db`

```sql
BEGIN;
ALTER TABLE permission_requests RENAME COLUMN requester_channel TO requester_platform;
ALTER TABLE permission_requests RENAME COLUMN response_channel TO response_platform;
COMMIT;
```

For `access_log.channel` removal:

- If SQLite build supports `ALTER TABLE ... DROP COLUMN`, drop `channel` and `idx_access_log_channel`.
- Otherwise rebuild `access_log` into a new table without `channel`, copy rows, swap table names, recreate indexes.

---

## 8. Validation Gates (Must Pass)

1. Static search checks:
   - No platform-alias field names remain:
     - `from_channel`, `message_channel`, `requester_channel`, `response_channel`, `lastChannel`, `replyChannel`
   - Domain-only uses of `channel` remain:
     - `container_kind = "channel"`
     - `MessagingTargetKind = "channel"`
2. Schema checks:
   - `events` has `platform`, not `from_channel`
   - `episodes` has `platform`, not `channel`
   - `permission_requests` has `requester_platform` and `response_platform`
   - `access_log` has only `platform` for transport dimension
3. Runtime checks:
   - Inbound/outbound event writes succeed
   - Memory retain/backfill/recall path works with platform filters
   - IAM ask/audit records write/read with platform fields
4. IAM conformance suite remains green.

---

## 9. Rollout Order

1. Land schema + query renames in `events.db` and memory retain/recall path.
2. Land IAM schema/audit rename (`requester_platform`, drop access_log alias).
3. Land control-plane/ingress/session model renames.
4. Execute runtime reset or migration.
5. Run full validation gates and track docs.

---

## 10. Success Criteria

Cutover is complete when:

1. Platform semantics are represented only with `platform`-named fields.
2. `channel` remains only for domain-kind and vendor/API nouns.
3. No compatibility aliasing exists for renamed platform fields.
4. Runtime + memory + IAM tests and backfill smoke are green on the new naming.
