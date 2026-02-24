# Identity Resolution

**Status:** DESIGN SPEC
**Updated:** 2026-02-23
**Related:** `UNIFIED_ENTITY_STORE.md`, `ACCESS_CONTROL_SYSTEM.md`, `../adapters/INBOUND_INTERFACE.md`, `../nex/NEXUS_REQUEST.md`

## Overview

Identity resolution is Stage 2 of the NEX pipeline. It transforms a raw `(platform, sender_id)` tuple from an adapter into a resolved entity with tags, group memberships, and access context.

For canonical sender+receiver symmetry, account-bound receiver identity, persona binding separation, and continuity transfer behavior, see:
`../nex/ENTITY_SYMMETRIC_ROUTING_AND_PERSONA_BINDING.md`.

The system handles two categories of identifiers:
- **Universal identifiers** — phone numbers and emails that are meaningful across platforms
- **Platform-local identifiers** — opaque IDs meaningful only within one platform (Discord snowflakes, Telegram numeric IDs, Slack user IDs)

## Identifier Classification

Every `sender_id` is classified at ingest time:

| Kind | Description | Cross-platform matchable? | Examples |
|------|-------------|--------------------------|---------|
| `phone` | E.164 phone number | Yes | `+14155550099` |
| `email` | Email address | Yes | `jane@example.com` |
| `shortcode` | SMS shortcode (≤6 digits) | No | `87654` |
| `platform_id` | Opaque platform-specific ID | No | Discord: `123456789012345678`, Telegram: `777` |

### Platform sender_id Formats

| Platform | sender_id format | Identifier kind | Normalization |
|----------|-----------------|----------------|---------------|
| Discord | `"123456789012345678"` (snowflake) | `platform_id` | None needed — globally unique within Discord |
| Telegram | `"777"` (numeric string) | `platform_id` | None needed — globally unique within Telegram |
| Slack | `"U123ABC456"` (user ID) | `platform_id` | Scoped by `space_id` (workspace). Same user ID in different workspaces = different people |
| WhatsApp | `"14155550099@s.whatsapp.net"` (JID) | `phone` (extracted) | Extract digits before `@`, prepend `+`, normalize E.164 |
| iMessage | `"+14155550099"` or `"user@icloud.com"` | `phone` or `email` | Phone: normalize E.164. Email: lowercase trim |
| Gmail | `"jane@example.com"` | `email` | Lowercase trim (gog adapter already does this) |
| Signal | UUID or phone number | `platform_id` or `phone` | Phone: normalize E.164. UUID: lowercase |
| SMS | Phone number or shortcode | `phone` or `shortcode` | Shortcode: ≤6 digits, no normalization. Phone: E.164 |

### Normalization Rules

**Phone (E.164):**
1. Strip all non-digit characters except leading `+`
2. If no country code and 10 digits, prepend `+1` (US default)
3. Prepend `+` if missing
4. Result: `+{country}{number}` e.g. `+14155550099`

**Email:**
1. Lowercase
2. Trim whitespace
3. Result: `jane@example.com`

**Shortcode detection:**
- If `platform` is `"sms"` and `sender_id` is ≤6 digits → `shortcode` kind
- Shortcodes are NOT phone numbers and should not be E.164 normalized

**WhatsApp JID extraction:**
- Strip `@s.whatsapp.net` or `@g.us` suffix
- For `@g.us` (group JIDs): this is a container_id, not a sender_id
- For `@s.whatsapp.net`: extract digits, normalize as E.164 phone

## Contact Resolution Flow

### The Two-Row Pattern for Universal Identifiers

When a message arrives with a universal identifier (phone or email), the system creates TWO contact rows:

1. **Universal contact** — `(platform="phone"/"email", space_id="", sender_id=canonical)` → `entity_id`
2. **Platform contact** — `(platform="imessage"/"whatsapp"/etc, space_id="", sender_id=raw)` → same `entity_id`

The universal contact enables cross-platform matching. The platform contact preserves the raw mapping for delivery routing.

### Lookup Priority

```
1. Classify sender_id → (canonical, kind)
2. If kind is "phone" or "email":
   a. Look up universal contact: (kind, "", canonical) → entity_id?
   b. If found → reuse entity, add platform contact if missing
   c. If not found → create new entity, create BOTH universal + platform contacts
3. If kind is "platform_id" or "shortcode":
   a. Look up platform contact: (platform, space_id, sender_id) → entity_id?
   b. If found → reuse entity
   c. If not found → create new entity, create platform contact only
4. Follow merged_into chain to canonical entity
5. Build SenderContext from resolved entity + tags + group memberships
```

### Edge Cases

**Same phone across multiple platforms:**
```
iMessage message from +14155550099:
  → universal: ("phone", "", "+14155550099") → entity_A (created)
  → platform: ("imessage", "", "+14155550099") → entity_A

WhatsApp message from 14155550099@s.whatsapp.net:
  → extract phone: +14155550099
  → universal: ("phone", "", "+14155550099") → entity_A (found!)
  → platform: ("whatsapp", "", "14155550099@s.whatsapp.net") → entity_A
```
Result: ONE entity, three contact rows.

**Phone number format variations:**
```
iMessage message from "4155550099" (no country code):
  → normalize E.164: +14155550099
  → universal: ("phone", "", "+14155550099") → matches existing entity
```
Result: Format variations collapse to same entity.

**iMessage dual identity (phone + email):**
```
Message from "+14155550099":
  → universal: ("phone", "", "+14155550099") → entity_A

Message from "sarah@icloud.com" (same person, different handle):
  → universal: ("email", "", "sarah@icloud.com") → entity_B (new entity)
```
Result: Two entities. Phone ↔ email matching requires the merge system (LLM-driven or co-occurrence-scored). This is by design — we cannot automatically know a phone and email belong to the same person.

**SMS shortcodes:**
```
SMS from "87654" (Uber notifications):
  → ≤6 digits → kind=shortcode
  → platform contact only: ("sms", "", "87654") → entity for Uber shortcode
  → NOT treated as a phone number, no E.164 normalization
```

**Slack workspace scoping:**
```
Slack workspace A: sender_id="U123ABC", space_id="T111"
  → platform_id, scoped: ("slack", "T111", "U123ABC") → entity_X

Slack workspace B: sender_id="U123ABC", space_id="T222"
  → platform_id, scoped: ("slack", "T222", "U123ABC") → entity_Y
```
Result: Two entities. Same Slack user ID across workspaces may be different people.

## Sender Name Change Tracking

`sender_name` is treated as mutable, untrusted display metadata.

Required behavior:
1. Contacts keep the latest seen name (`contacts.sender_name`) for fast reads.
2. Name history is retained in `contact_name_observations` with first_seen/last_seen/seen_count.
3. Name changes do not create new entities and do not affect canonicalization.
4. Merge and policy logic uses entity identity; display names are observational metadata only.

## Entity Types

Entity type is intentionally flexible. The delivery path defaults new external senders to `type = 'person'`, but entities are not restricted to a fixed closed set and can be re-typed as better information is learned.

Common types in active use:

| Type | Typical creator | Description |
|------|-----------|-------------|
| `person` | Delivery pipeline, memory writer, manual | A human being (includes mentioned people who never send messages) |
| `agent` | Bootstrap, agent registration | An AI agent (Eve, Atlas, etc.) |
| `group` | Manual, control plane | A group of entities (also has a row in `groups` table) |
| `organization` | Memory writer, manual | A company, team, or institution |
| `service` | Manual, delivery pipeline | External services and bots (GitHub Bot, Slack Bot, webhooks) |

Additional domain-specific types are allowed when they improve modeling fidelity.

## Bootstrap Entities

On startup, the runtime creates:

| Entity | entity_id | type | is_user | Tags | Purpose |
|--------|-----------|------|---------|------|---------|
| Owner | `entity-owner` | `person` | `true` | `owner` | The human user of this Nexus instance |
| Receiver entities | runtime-defined stable IDs | `agent` | `false` | `agent` | Local receiver identities bound to adapter accounts |

**Owner contact (auth path only):**
- `(login, "", "owner")` → `entity-owner`

System-origin platforms (cron, runtime, boot, restart, node, clock) do NOT get contacts. They are resolved directly to `entity-owner` at the `resolveIdentity` stage without a contacts table lookup. See **System-Origin Resolution** below.

**Receiver bootstrap:**

For each configured adapter account, runtime must seed deterministic account receiver bindings:

1. **Entity row:** stable receiver entity (`type='agent'`, source bootstrap/import/manual).
2. **Account binding row:** `(platform, account_id) -> receiver_entity_id`.
3. Optional contact aliases may exist, but account binding is authoritative for receiver resolution.

Persona is a binding on top of receiver entity identity, not the identity key itself.

## SenderContext (replaces PrincipalContext)

The resolved identity attached to `NexusRequest.sender`:

```typescript
interface SenderContext {
  type: 'owner' | 'known' | 'unknown' | 'system' | 'webhook' | 'agent';
  entity_id?: string;
  name?: string;
  tags?: string[];
  groups?: string[];           // group IDs the entity belongs to
  identities?: { platform: string; identifier: string }[];
  source?: string;             // for system/webhook senders
}
```

Changes from PrincipalContext:
- Renamed from `principal` → `sender` on NexusRequest
- Removed `relationship` field — use groups and tags instead (e.g., tag `relationship:partner` or group membership)
- Added `groups` field — group IDs from `group_members` table

## ReceiverContext

The resolved target of the message (agent/system/entity), attached to `NexusRequest.receiver`:

```typescript
interface ReceiverContext {
  type: 'agent' | 'system' | 'entity' | 'unknown';
  entity_id?: string;                // Canonical receiver entity ID (required for agent/entity)
  agent_id?: string;                 // Runtime executor ID (when receiver is agent)
  persona_ref?: string;              // Persona identity profile reference
  name?: string;
  source: 'account_binding' | 'hint_verified' | 'override' | 'system';
  metadata?: Record<string, unknown>;
}
```

An agent receiver IS an entity with `type='agent'` in identity.db. `entity_id` identifies the receiver identity. `agent_id` and `persona_ref` come from binding resolution.

Both sender and receiver resolve to entities in identity.db.

## Memory Writer Entity Creation

The memory writer extracts entities from conversation episodes. These are **knowledge entities** — people, organizations, concepts, and other nodes in the knowledge graph. Not all entities need contacts. Entities can be mentioned people, organizations, projects, or concepts that never send messages through an adapter.

The core problem with writer-created entities is **dedup**, not contacts. The `create_entity` tool should:

1. **Fuzzy search existing entities** by normalized name (lowercase/stripped match against `entities.normalized`)
2. **Check embedding similarity** if available — compare the proposed entity name/description against existing entity embeddings
3. **If match above threshold** → return the existing `entity_id` instead of creating a duplicate
4. **Only create if genuinely new** — no normalized name match and no embedding similarity above threshold

Knowledge entities (writer-created, `source = 'inferred'`) and delivery entities (pipeline-created, `source = 'delivery'`) coexist in the same `entities` table. Contacts are optional metadata bindings and may exist for any entity type when operationally useful.

**Co-occurrence data:** `link_fact_entity` records entity co-occurrences in the `entity_cooccurrences` table. This data is available to the consolidation agent for merge decisions (deferred — currently LLM-only merges).

## System-Origin Resolution

System-origin platforms represent internal event sources that are not real external senders. The `resolveIdentity` stage recognizes these platforms and short-circuits the normal contacts lookup.

**System-origin platforms:** `"cron"`, `"runtime"`, `"boot"`, `"restart"`, `"node"`, `"clock"`

**Resolution behavior:**
1. If `delivery.platform` is in the system-origin set, skip the contacts table lookup entirely
2. Resolve directly to `entity-owner` (the Nexus owner entity)
3. Set `sender.type = 'system'` and `sender.source = delivery.platform`

```
resolveIdentity(delivery):
  if delivery.platform in ["cron", "runtime", "boot", "restart", "node", "clock"]:
    return SenderContext {
      type: 'system',
      entity_id: 'entity-owner',
      name: ownerName,
      tags: ownerTags,
      groups: ownerGroups,
      source: delivery.platform
    }
  // ... normal contacts lookup for external platforms
```

This is cleaner than creating fake contacts for internal event sources. Crons and system events inherit the owner's identity because the owner configured them — they act on the owner's behalf, not as independent entities.

## Container Kind

Three canonical values:

| Value | Meaning | Example |
|-------|---------|---------|
| `direct` | 1:1 conversation | iMessage DM, Discord DM, API call, control plane |
| `group` | Multi-party conversation | Group chat, server channel |
| `channel` | Broadcast/public channel | Discord server channel, Slack public channel |

Legacy `"dm"` normalizes to `"direct"` at ingest.

## Adapter Contact Preload

Adapters with access to the user's address book (e.g., iMessage contacts, Google Contacts) can push known contacts during backfill:

```
adapter backfill --account <id> --contacts
```

Emits JSONL contact records alongside NexusEvent records. Each contact is processed through the same normalization and universal identifier logic, pre-populating the contact graph before messages reference those senders. This gives the memory writer a reference set for entity resolution.
