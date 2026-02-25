# Unified Entity Store

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-24
**Supersedes:** ../../_archive/IDENTITY_GRAPH.md, entities/entity_aliases/persons tables in ../../_archive/MEMORY_SYSTEM.md
**Related:** MEMORY_SYSTEM.md, MEMORY_WRITER.md, ../iam/IDENTITY_RESOLUTION.md
**Routing integration:** ../nex/RUNTIME_ROUTING.md

> **Canonical reference:** See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) for the authoritative database layout. Entity tables (`entities`, `entity_tags`, `entity_cooccurrences`, `merge_candidates`), contacts, groups, directory, and auth tables all live in `identity.db`. This means `contacts.entity_id` -> `entities.id` is a same-database JOIN -- no cross-DB boundary.

---

## Overview

The Unified Entity Store collapses three prior entity systems (Identity Graph entities, legacy memory system entities, Hindsight entities) into a single table with a union-set (union-find) structure for identity resolution.

**Core principle:** An entity represents any "who" or "what" worth remembering — people, organizations, groups, projects, concepts, locations, pets, documents, events. An entity is never a reachable address. Phone numbers, email addresses, and platform handles are **contact identifiers**, not entities. They live in the `contacts` table as bindings between platform-specific addresses and the entities they belong to. Any entity can have contacts; some naturally will (people, agents) and some naturally won't (concepts, locations), but there is no schema-level restriction.

**Design philosophy:** Maximally simple. The agent does the hard work of resolution, deduplication, and merging. The table is a flexible canvas, not a constraint system.

### Ontology

This design is informed by industry standards:

- **SCIM (RFC 7642-7644):** Users are identity resources; phone numbers and emails are multi-valued attributes of users, not independent resources. Groups are first-class resources with members.
- **Schema.org:** Person and Organization are entities; ContactPoint is a property of an entity describing how to reach it, not a separate entity.
- **vCard/jCard:** Contact information (phone, email, address) is structured data belonging to a person record.

All standards agree: **identifiers are attributes of identities, not identities themselves.** The contacts table serves as the identifier binding layer (like SCIM's multi-valued attributes or Schema.org's ContactPoint), while the entities table holds actual identities.

---

## Schema

### Entities

```sql
CREATE TABLE entities (
    id              TEXT PRIMARY KEY,       -- ULID
    name            TEXT NOT NULL,          -- human-readable: 'Sarah Chen', 'Anthropic', 'Unknown (iMessage)'
    type            TEXT,                   -- unconstrained; common: person, agent, group, org, service, concept, location, project, event, document, pet
    merged_into     TEXT REFERENCES entities(id),  -- union-set parent pointer (NULL = canonical root)
    normalized      TEXT,                   -- lowercase/stripped name for fast matching
    is_user         BOOLEAN DEFAULT FALSE,  -- is this the Nexus owner?
    source          TEXT DEFAULT 'inferred', -- 'manual', 'imported', 'inferred', 'adapter'
    mention_count   INTEGER DEFAULT 0,      -- times this entity appears in facts
    first_seen      INTEGER,               -- unix ms
    last_seen       INTEGER,               -- unix ms
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_entities_name ON entities(name);
CREATE INDEX idx_entities_normalized ON entities(normalized);
CREATE INDEX idx_entities_merged ON entities(merged_into);
CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_is_user ON entities(is_user) WHERE is_user = TRUE;
```

**Entity types are completely unconstrained.** The `type` column is free-text with no enum or CHECK constraint. The agent chooses whatever type feels right. The system documents common types below, but new types can be introduced freely. To help the agent self-align, expose a `SELECT DISTINCT type FROM entities` query so it can see what types already exist.

| Type | What it represents | Examples |
|------|--------------------|----------|
| `person` | A human being | Sarah Chen, Mom, Unknown (iMessage) |
| `agent` | A Nexus agent | nexus (default), work-assistant |
| `group` | A named group with membership | Family, Book Club, Project Alpha Team |
| `org` | A company, institution, team | Anthropic, MIT, Engineering Team |
| `service` | An external automated system | GitHub Bot, Slack Bot, webhook |
| `concept` | An idea, topic, or abstract thing | machine learning, stoicism, TypeScript |
| `location` | A place | San Francisco, the office, Mom's house |
| `project` | A project or initiative | Project Alpha, nexus-specs, Q2 launch |
| `event` | A named event or occasion | Sarah's birthday, team offsite 2026 |
| `document` | A document or artifact | the PRD, config.json, that email thread |
| `pet` | An animal companion | Luna (the cat), Max (the dog) |

This is not exhaustive — the agent may use other types as needed.

Identifiers like `phone`, `email`, and platform handles are modeled as contact identifiers in the `contacts` table rather than standalone entity types.
Any entity may have zero, one, or many contacts over time; there is no schema-level restriction on which types can have contacts.

No `platform`, `sender_id`, `mapping_type`, `confidence`, `alias_type`, `display_name`, `relationship`, `notes`, `message_count` columns. Those are either stored in the contacts table, captured as facts in the facts table, or derivable from events.

### Contacts

The contacts table maps platform-specific identifiers to entities. It serves as the identifier binding layer -- the equivalent of SCIM's multi-valued `emails`/`phoneNumbers` attributes or Schema.org's `ContactPoint`.

```sql
CREATE TABLE contacts (
    platform       TEXT NOT NULL,             -- discord/slack/imessage/telegram/gmail/control-plane/webchat/...
    space_id       TEXT NOT NULL DEFAULT '',  -- Optional scope for platforms where sender_id isn't globally unique (Slack).
    sender_id      TEXT NOT NULL,             -- platform-native sender identity (+15551234567, coolgamer42, etc.)
    entity_id      TEXT NOT NULL,             -- identity.entities id (canonical or merged leaf; resolve via merged_into chain)
    first_seen     INTEGER NOT NULL,          -- unix ms
    last_seen      INTEGER NOT NULL,          -- unix ms
    message_count  INTEGER NOT NULL DEFAULT 0,
    sender_name    TEXT,                      -- best-effort display name from platform (untrusted)
    avatar_url     TEXT,                      -- best-effort (untrusted)
    PRIMARY KEY (platform, space_id, sender_id)
);

CREATE INDEX idx_contacts_entity_id ON contacts(entity_id);
CREATE INDEX idx_contacts_last_seen ON contacts(last_seen DESC);
```

**Key properties:**
- `entity_id` is always NOT NULL. Even for unknown senders, a person entity is created immediately so facts can accumulate.
- `sender_name` caches the platform display name. This is untrusted and may change.

**Universal Identifier Pattern (two-row):** When a message arrives from a phone number or email address, the delivery pipeline creates **two** contact rows pointing to the same entity:

1. **Universal contact:** `(platform="phone"/"email", space_id="", sender_id=canonical_identifier)` -- represents the phone number or email address itself, independent of any messaging platform.
2. **Platform contact:** `(platform="imessage"/"whatsapp"/etc, space_id="", sender_id=raw_sender_id)` -- represents the platform-specific binding used for routing.

Both rows share the same `entity_id`. The universal contact enables cross-platform identity resolution (e.g., an iMessage sender and a WhatsApp sender with the same phone number can be linked). The platform contact enables fast routing lookups for inbound messages.

For example, an iMessage from `+15551234567` creates:
- `("phone", "", "+15551234567")` -> `ent_001` (universal)
- `("imessage", "", "+15551234567")` -> `ent_001` (platform)

A WhatsApp message from `15551234567@s.whatsapp.net` creates:
- `("phone", "", "+15551234567")` -> `ent_001` (universal, already exists -- triggers identity resolution)
- `("whatsapp", "", "15551234567@s.whatsapp.net")` -> `ent_001` (platform)

See [IDENTITY_RESOLUTION.md](IDENTITY_RESOLUTION.md) for the full universal identifier extraction logic and cross-platform resolution flow.

**Contacts can change hands.** A phone number may belong to Sarah today and be reassigned tomorrow. The `entity_id` can be updated when ownership changes. This is different from entity merges (which are permanent).

### Contact Name Observations

Tracks historical display names observed for contacts across platforms.

```sql
CREATE TABLE contact_name_observations (
    platform       TEXT NOT NULL,
    space_id       TEXT NOT NULL DEFAULT '',
    sender_id      TEXT NOT NULL,
    observed_name  TEXT NOT NULL,
    first_seen     INTEGER NOT NULL,
    last_seen      INTEGER NOT NULL,
    seen_count     INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (platform, space_id, sender_id, observed_name)
);
```

### Entity Co-occurrences

> **Status: Deferred.** Write-side implemented (link_fact_entity updates counts). Read-side merge scoring not yet implemented. Data accumulates for future use by consolidation agent.

Tracks which entities appear together in facts. Feeds into entity resolution scoring.

```sql
CREATE TABLE entity_cooccurrences (
    entity_id_1     TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    entity_id_2     TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    count           INTEGER DEFAULT 1,
    last_cooccurred INTEGER NOT NULL,       -- unix ms
    PRIMARY KEY (entity_id_1, entity_id_2),
    CHECK (entity_id_1 < entity_id_2)       -- canonical ordering
);

CREATE INDEX idx_entity_cooccurrences_e1 ON entity_cooccurrences(entity_id_1);
CREATE INDEX idx_entity_cooccurrences_e2 ON entity_cooccurrences(entity_id_2);
CREATE INDEX idx_entity_cooccurrences_count ON entity_cooccurrences(count DESC);
```

### Entity Tags

For ACL scoping and lightweight classification.

```sql
CREATE TABLE entity_tags (
    entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    tag         TEXT NOT NULL,              -- 'trusted', 'family', 'team:engineering', 'org:anthropic'
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (entity_id, tag)
);

CREATE INDEX idx_entity_tags_tag ON entity_tags(tag);
```

Tags are for lightweight classification and ACL anchoring. For structured membership with roles and nesting, use Groups (below).

### Groups

First-class group model for structured membership, nesting, and metadata. Every group also has a corresponding row in `entities` with `type='group'` so it can participate in facts, tags, and the memory system.

```sql
CREATE TABLE groups (
    id              TEXT PRIMARY KEY,         -- matches entities.id for this group
    name            TEXT NOT NULL,
    description     TEXT,
    parent_group_id TEXT REFERENCES groups(id), -- nesting: team:frontend ⊂ team:engineering
    owner_id        TEXT REFERENCES entities(id), -- who manages this group
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE TABLE group_members (
    group_id        TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    entity_id       TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'member', -- 'admin', 'member', 'viewer'
    added_at        INTEGER NOT NULL,
    PRIMARY KEY (group_id, entity_id)
);

CREATE INDEX idx_group_members_entity ON group_members(entity_id);
CREATE INDEX idx_groups_parent ON groups(parent_group_id);
```

**Groups vs. Tags:**
- **Tags** are lightweight labels for classification and ACL. No metadata, no membership roles, no nesting. Good for: `'trusted'`, `'family'`, `'org:anthropic'`.
- **Groups** are first-class entities with membership lists, roles, nesting, and metadata. Good for: "Engineering Team" (with admin/member roles), "Project Alpha Team" (nested under Engineering), "Book Club" (with description and owner).

A group entity can also have tags. "Engineering Team" (group) might be tagged `'team:engineering'` (tag) for ACL purposes.

### Merge Candidates

Proposed entity merges awaiting review or auto-approval.

```sql
CREATE TABLE merge_candidates (
    id              TEXT PRIMARY KEY,       -- ULID
    entity_a_id     TEXT NOT NULL REFERENCES entities(id),
    entity_b_id     TEXT NOT NULL REFERENCES entities(id),
    confidence      REAL NOT NULL,          -- 0.0-1.0
    reason          TEXT NOT NULL,          -- human-readable explanation
    status          TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    created_at      INTEGER NOT NULL,
    resolved_at     INTEGER,
    UNIQUE(entity_a_id, entity_b_id)
);

CREATE INDEX idx_merge_candidates_status ON merge_candidates(status);
CREATE INDEX idx_merge_candidates_pending ON merge_candidates(confidence DESC) WHERE status = 'pending';
```

---

## Union-Set Operations

### find(entity_id) -> canonical entity

Follow the `merged_into` chain to the root:

```sql
WITH RECURSIVE entity_chain AS (
    SELECT * FROM entities WHERE id = $1
    UNION ALL
    SELECT e.* FROM entities e JOIN entity_chain ec ON e.id = ec.merged_into
)
SELECT * FROM entity_chain WHERE merged_into IS NULL;
```

In practice, chains are shallow (usually 1-2 hops). Path compression can be applied periodically.

### union(entity_a, entity_b) -> merge

```sql
-- Make entity_b point to entity_a (entity_a becomes canonical)
UPDATE entities SET merged_into = $entity_a_id, updated_at = $now
WHERE id = $entity_b_id;

-- Merge tags (union of both sets)
INSERT INTO entity_tags (entity_id, tag, created_at)
SELECT $entity_a_id, tag, $now FROM entity_tags WHERE entity_id = $entity_b_id
ON CONFLICT DO NOTHING;

-- Update co-occurrences to point to canonical entity
-- (handled by the agent or a background cleanup job)
```

### aliases(entity_id) -> all identities

```sql
SELECT * FROM entities WHERE merged_into = $entity_id
UNION ALL
SELECT * FROM entities WHERE id = $entity_id;
```

### Session Propagation

When `union(entity_a, entity_b)` executes, `propagateMergeToSessions()` **MUST** be called synchronously before the merge transaction completes. This function creates session aliases in `agents.db` so that routing can find active sessions for the newly-merged identity without re-querying identity.db.

If session propagation is skipped or deferred, inbound messages for the merged entity may fail to route to existing conversations until the next session lookup cache refresh.

See `../nex/RUNTIME_ROUTING.md` for the full session-alias lifecycle and routing implications.

---

## Entity and Contact Creation: Examples

### Scenario: iMessage contact resolution (universal identifier pattern)

```
Day 1: iMessage from +15551234567 (sender_name: "Mom")
  -- Delivery pipeline creates a person entity using sender_name:
  INSERT INTO entities (id, name, type, source, first_seen, last_seen, normalized)
  VALUES ('ent_001', 'Mom', 'person', 'delivery', $now, $now, 'mom');

  -- TWO contact rows created (universal identifier pattern):
  -- 1. Universal contact (phone number, platform-independent):
  INSERT INTO contacts (platform, sender_id, entity_id, first_seen, last_seen, sender_name)
  VALUES ('phone', '+15551234567', 'ent_001', $now, $now, 'Mom');

  -- 2. Platform contact (iMessage-specific, used for routing):
  INSERT INTO contacts (platform, sender_id, entity_id, first_seen, last_seen, sender_name)
  VALUES ('imessage', '+15551234567', 'ent_001', $now, $now, 'Mom');

  -- The phone number lives in contacts.sender_id, NOT as an entity.
  -- The entity is immediately a 'person' that can accumulate facts.

Day 3: Memory-Writer extracts "Mom called about dinner plans for Saturday"
  -- Links the fact to the existing entity ent_001 (Mom).
  -- No new entity needed. The person entity already exists.

Day 7: WhatsApp from 15551234567@s.whatsapp.net (sender_name: "Mom")
  -- Delivery pipeline extracts phone from JID: +15551234567
  -- Universal contact ("phone", "+15551234567") already exists -> entity ent_001
  -- Only the platform contact is new:
  INSERT INTO contacts (platform, sender_id, entity_id, first_seen, last_seen, sender_name)
  VALUES ('whatsapp', '15551234567@s.whatsapp.net', 'ent_001', $now, $now, 'Mom');

  -- No new entity needed! The universal phone contact already resolved to Mom.
  -- Cross-platform identity resolution happened automatically via the two-row pattern.

Day 10: Email from mom@gmail.com (sender_name: "Mom")
  -- Delivery pipeline creates universal + platform contacts:
  INSERT INTO entities (id, name, type, source, first_seen, last_seen, normalized)
  VALUES ('ent_002', 'Mom', 'person', 'delivery', $now, $now, 'mom');

  INSERT INTO contacts (platform, sender_id, entity_id, first_seen, last_seen, sender_name)
  VALUES ('email', 'mom@gmail.com', 'ent_002', $now, $now, 'Mom');
  INSERT INTO contacts (platform, sender_id, entity_id, first_seen, last_seen, sender_name)
  VALUES ('gmail', 'mom@gmail.com', 'ent_002', $now, $now, 'Mom');

  -- Memory-Writer later resolves: same person!
  -- propose_merge(ent_001, ent_002, confidence=0.95, reason="same display name Mom, iMessage + Gmail")
  -- Auto-merge: ent_002 merged_into ent_001
```

Result:
```
Mom (ent_001, type=person, canonical root)
  Contacts:
    +-- phone: +15551234567          (universal)
    +-- imessage: +15551234567       (platform)
    +-- whatsapp: 15551234567@s.whatsapp.net  (platform, resolved via universal phone match)
    +-- email: mom@gmail.com         (universal)
    +-- gmail: mom@gmail.com         (platform)
  Merged entities:
    +-- ent_002 (Mom, merged_into=ent_001)
```

See [IDENTITY_RESOLUTION.md](IDENTITY_RESOLUTION.md) for details on universal identifier extraction from platform-specific sender IDs (e.g., WhatsApp JID -> E.164 phone number).

### Scenario: Discord handle — unknown sender

```
Day 1: Discord message from coolgamer42 (no sender_name available)
  -- Delivery pipeline creates a person entity with placeholder name:
  INSERT INTO entities (id, name, type, source, first_seen, normalized)
  VALUES ('ent_010', 'Unknown (discord:coolgamer42)', 'person', 'delivery', $now, 'unknown (discord:coolgamer42)');

  INSERT INTO contacts (platform, sender_id, entity_id, first_seen, last_seen, sender_name)
  VALUES ('discord', 'coolgamer42', 'ent_010', $now, $now, NULL);

Day 5: Conversation reveals real name is "John Smith"
  -- Memory-Writer updates the entity name (or creates a new entity and merges):
  UPDATE entities SET name = 'John Smith', normalized = 'john smith', updated_at = $now
  WHERE id = 'ent_010';

Day 8: Slack message from jsmith in workspace anthropic
  INSERT INTO entities (id, name, type, source, first_seen, normalized)
  VALUES ('ent_012', 'jsmith', 'person', 'delivery', $now, 'jsmith');

  INSERT INTO contacts (platform, space_id, sender_id, entity_id, first_seen, last_seen)
  VALUES ('slack', 'anthropic', 'jsmith', 'ent_012', $now, $now);

  -- Agent resolves: same person as John Smith
  -- propose_merge(ent_010, ent_012, confidence=0.9, reason="context match")
  -- Auto-merge: ent_012 merged_into ent_010
```

Result:
```
John Smith (ent_010, type=person, canonical root)
  Contacts:
    +-- discord: coolgamer42
    +-- slack/anthropic: jsmith
```

### Scenario: Ambiguous names

```
Two different Tylers exist:
  ent_020: "Tyler Shaver" (type=person, is_user=TRUE)  -- the Nexus owner
  ent_021: "Tyler Johnson" (type=person)                -- a friend

When "Tyler" appears in a message, the agent:
1. Searches entities with normalized LIKE '%tyler%'
2. Finds both Tyler Shaver and Tyler Johnson
3. Uses context (who's the message from, what's the topic) to resolve
4. Links the fact to the correct entity via fact_entities
5. If uncertain, creates a merge_candidate for human review
```

---

## Bootstrap Entities

On startup, the runtime ensures certain foundational entities exist before any messages are processed:

1. **Entity-owner** -- A `person` entity with `is_user=true` representing the Nexus owner. This is the identity that all owner-originated messages resolve to, and the anchor for personal memory. A single contact is seeded for the auth login path: `(login, "", "owner")` → `entity-owner`. System-origin platforms (cron, runtime, boot, restart, node, clock) do NOT get contacts — they resolve directly to entity-owner at the `resolveIdentity` stage without a contacts lookup.

2. **Agent persona entities** -- One `agent` entity per configured agent persona (e.g., the default "nexus" agent, "eve", "atlas"). These have `type='agent'` and `source='bootstrap'`. Each persona also gets a contact row: `("agent", "", "{persona_id}")` → `"entity-{persona_id}"`. This makes the system symmetric — every message has both a sender entity and a receiver entity in the same identity graph.

Bootstrap entities are created idempotently (no duplicates on restart). They are always canonical roots (`merged_into IS NULL`).

See [IDENTITY_RESOLUTION.md](IDENTITY_RESOLUTION.md) for details on how bootstrap entities participate in the identity resolution flow, system-origin resolution, and how the owner entity is matched to inbound self-messages.

---

## Entity Resolution Flow

Entity resolution is agentic. The Memory-Writer agent makes all resolution decisions, using:

1. **Exact matching** -- normalized name lookup
2. **Co-occurrence scoring** -- entities that frequently appear together are likely related
3. **Contextual reasoning** -- the agent reads the event content and thread context to disambiguate
4. **PII extraction pipeline** -- PII extraction identifies structured identifiers (which become facts about entities, not entities themselves)
5. **Merge candidate creation** -- when uncertain, the agent proposes merges for review

The agent has access to the full entity store and can search, create, and merge entities.

**Hindsight's 3-signal scorer** (name similarity 0.5, co-occurrence 0.3, temporal 0.2, threshold 0.6) can serve as an algorithmic baseline that the agent can reference, but the agent makes the final call.

---

## IAM / ACL Integration

### How permissions work

1. **Entity tags are the permission anchors.** Tags like `'trusted'`, `'family'`, `'team:engineering'`, `'org:anthropic'` are assigned to canonical entities.

2. **Agent scoping.** When an agent queries memory, it specifies its scope (e.g., "work" or "personal"). Only facts linked to entities with matching tags are returned.

3. **Tag inheritance on merge.** When two entities merge, their tags are unioned. The canonical entity gets all tags from both.

4. **Facts inherit ACL from their entities.** A fact linked to entity "Mom" (tagged `'family'`) is visible to agents scoped to `'family'`.

5. **Group membership for structured access.** Groups provide role-based membership (admin/member/viewer) and nesting. A group entity can be tagged for ACL, and all members inherit the group's access scope via the tag.

### Resolution flow for incoming events

```
Event arrives with deliveryContext:
  {
    platform: "imessage",
    sender_id: "+15551234567",
    sender_name: "Mom",
    container_id: "+15551234567",
    container_kind: "direct",
    ...
  }

1. Contact lookup in identity.db (sub-millisecond, no LLM):
   SELECT entity_id FROM contacts
   WHERE platform = 'imessage' AND sender_id = '+15551234567';
   -> 'ent_001'

2. Follow merged_into chain in identity.db to canonical entity:
   ent_001 (Mom) -> canonical root (or ent_001 if already canonical)
   -- Same database -- JOINable, no cross-DB boundary

3. Look up tags for canonical entity:
   SELECT tag FROM entity_tags WHERE entity_id = 'ent_001';
   -> ['family', 'trusted']

4. Apply permissions based on tags.
```

### DeliveryContext Fields Available

From the NexusEvent deliveryContext (Zod schema):

| Field | Type | Description |
|-------|------|-------------|
| `platform` | string | Platform: 'slack', 'discord', 'imessage', 'gmail' |
| `account_id` | string | Which Nexus account received this |
| `sender_id` | string | Platform-specific unique sender ID |
| `sender_name` | string? | Display name from platform |
| `space_id` | string? | Server/workspace identifier |
| `container_id` | string | Conversation/chat identifier |
| `container_kind` | enum | 'direct', 'group', 'channel' |
| `thread_id` | string? | Thread ID for threaded conversations |
| `reply_to_id` | string? | Message being replied to |
| `capabilities` | object | Platform capabilities (markdown, message length, etc.) |
| `available_platforms` | array | Other platforms available for response |

The delivery pipeline uses `sender_name` to name the auto-created person entity. The `sender_id` is stored only in the contacts table, not as an entity name. If no `sender_name` is available, the entity is named with a placeholder like `Unknown (discord:coolgamer42)`.

---

## Contacts Integration

### The contacts table (identity.db)

The `contacts` table in `identity.db` maps `(platform, space_id, sender_id)` to `entity_id` in the unified entity store. This is the pipeline-speed lookup for identity resolution -- sub-millisecond, no LLM involvement, pure key-value.

> **Note:** Both `contacts` and `entities` live in `identity.db`. This means the lookup is a single-database JOIN -- no cross-DB boundary.

```
contacts (identity.db)
  (platform, space_id, sender_id) -> entity_id  -->  entities (identity.db)
                                                        merged_into chain -> canonical root
```

### Auto-creation on inbound messages

Every inbound message from an unknown sender auto-creates two things:

1. **A person entity** in `identity.db` -- with `type = 'person'`, `source = 'adapter'`, and `name` set to `sender_name` from the delivery context (or a placeholder like `'Unknown (platform:sender_id)'` if no name is available). The entity is always a person, never a phone number or handle.
2. **A contact row** in `identity.db` -- `(platform, space_id, sender_id)` keyed for fast routing lookup, pointing to the new entity.

This happens at delivery time, before any LLM processing, ensuring that every sender has a routable identity from their first message. Both the contact and entity live in the same database (`identity.db`), enabling FK integrity and efficient JOINs.

### Entity merges do NOT require updating contacts

When entities merge via `union()`, the contact rows in `identity.db` are **not** updated. The `entity_id` in the contacts table may point to a non-canonical (merged) entity, but the union-find chain in `identity.db` resolves to the canonical root (same database, JOINable). This means:

- No write-amplification on merges -- contacts are write-once (for routing purposes).
- The resolution path is: `contacts.entity_id` -> follow `merged_into` chain -> canonical entity.
- Path compression can shorten chains but is never required for correctness.

### Memory-writer enrichment

The memory-writer discovers adapter-sourced entities (`source = 'adapter'`) and enriches them with context from conversations (real names, relationships, organizational affiliations). When a real name is discovered for a placeholder entity, the writer can either update the entity's name directly or create a new person entity and merge.

### Memory-writer entity creation (knowledge entities)

The memory writer also creates entities — people, organizations, concepts, locations, projects, and anything else mentioned in conversation that may never send messages through an adapter. These entities are knowledge graph nodes. Contacts are optional bindings and can be attached later when operationally useful.

The core challenge is **dedup at creation time**. The `create_entity` tool should:

1. **Fuzzy search existing entities** by normalized name (lowercase/stripped match against `entities.normalized`)
2. **Check embedding similarity** if available — compare the proposed entity name against existing entity embeddings
3. **If match above threshold** → return the existing `entity_id` instead of creating a duplicate
4. **Only create if genuinely new** — no normalized name match and no embedding similarity above threshold

Knowledge entities (`source = 'inferred'`) and adapter entities (`source = 'adapter'`) coexist in the same `entities` table. The writer should always search existing entities before creating new ones.

### Contacts vs. conversational mentions

Contacts should be created when there is a concrete delivery/runtime identity to bind. When a user says "my email is tyler@example.com" in conversation, the memory-writer stores this as a **fact** about the person entity and links the fact to that entity. Contact creation is a deliberate binding step, not an automatic side effect of text extraction.

Contact rows are primarily created by the delivery pipeline for senders/recipients that have actually exchanged messages through Nexus. The memory-writer should only consider creating a contact when a message contains something that looks like a concrete contact identifier (a phone number, email, handle) AND the context suggests it should be linked to an entity for routing purposes.

This distinction matters: a contact means "we can route messages to/from this identifier." A conversational mention means "we know this identifier exists" and is stored as a fact about the person it belongs to. Only the former participates in pipeline-speed routing.

---

## What This Replaces

| Previous System | What Happened |
|----------------|---------------|
| Identity Graph `contacts` table | Replaced by new `contacts` table in `identity.db` with `(platform, space_id, sender_id)` PK |
| Identity Graph `entities` table | Merged into unified entities table in `identity.db` |
| Identity Graph `identity_mappings` table | Replaced by direct `contacts.entity_id` link in identity.db. The separate mapping table with confidence/mapping_type columns is no longer needed -- progressive resolution is handled by entity merges in the union-set |
| Identity Graph `entity_tags` table | Kept as-is, in `identity.db` |
| Legacy `entities` table | Merged into unified entities table, relocated to `identity.db` |
| Legacy `entity_aliases` table | Aliases are entities with merged_into pointing to canonical |
| Legacy `persons` table | Persons are entities with type='person' |
| Legacy `person_contact_links` table | Contacts table maps identifiers to person entities |
| Legacy `person_facts` table | Facts about people live in the facts table (in `memory.db`) |
| Legacy `merge_candidates` table | Kept as-is, in `identity.db` |
| Hindsight `entities` table | Merged into unified entities table |
| Hindsight `entity_cooccurrences` table | Kept as-is, in `identity.db` |
| Three separate name-history tables (`delivery_space_names`, `delivery_container_names`, `delivery_thread_names`) | Consolidated into single `names` table in `identity.db`. See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) section 3.3. |
| Phone/email/handle entity types | Prefer contact bindings in `contacts.sender_id` instead of separate identifier entities; conversational mentions are stored as facts. |

---

## See Also

- `MEMORY_SYSTEM.md` -- Full memory architecture
- `MEMORY_WRITER.md` -- How entity resolution works in the retain flow
- `../../_archive/IDENTITY_GRAPH.md` -- Previous identity system (superseded)
- `../nex/RUNTIME_ROUTING.md` -- Runtime routing and session resolution
