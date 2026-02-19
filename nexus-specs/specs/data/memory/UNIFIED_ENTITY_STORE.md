# Unified Entity Store

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-18
**Supersedes:** ../../ledgers/IDENTITY_GRAPH.md, entities/entity_aliases/persons tables in ../MEMORY_SYSTEM.md
**Related:** MEMORY_SYSTEM_V2.md, MEMORY_WRITER_V2.md
**Routing integration:** specs/runtime/RUNTIME_ROUTING.md

> **Canonical reference:** See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) for the authoritative database layout. Entity tables (`entities`, `entity_tags`, `entity_cooccurrences`, `merge_candidates`) live in `identity.db` alongside contacts, directory, and auth tables. This means `contacts.entity_id` -> `entities.id` is a same-database JOIN -- no cross-DB boundary.

---

## Overview

The Unified Entity Store collapses three prior entity systems (Identity Graph entities, Cortex entities, Hindsight entities) into a single table with a union-set (union-find) structure for identity resolution.

**Core principle:** Everything is an entity. Phone numbers, email addresses, Discord handles, nicknames, canonical names, organizations, projects, concepts -- all live in one table. The `merged_into` pointer creates a tree where following the chain leads to the canonical identity.

**Design philosophy:** Maximally simple. The agent does the hard work of resolution, deduplication, and merging. The table is a flexible canvas, not a constraint system.

---

## Schema

### Entities

```sql
CREATE TABLE entities (
    id              TEXT PRIMARY KEY,       -- ULID
    name            TEXT NOT NULL,          -- the identifier: '+15551234567', 'coolgamer42',
                                            -- 'John Smith', 'Anthropic', 'discord:tyler#1234'
    type            TEXT,                   -- free-form: 'person', 'phone', 'email', 'discord_handle',
                                            -- 'slack_user', 'org', 'project', 'concept', 'location'...
    merged_into     TEXT REFERENCES entities(id),  -- union-set parent pointer (NULL = canonical root)
    normalized      TEXT,                   -- lowercase/stripped for fast matching
    is_user         BOOLEAN DEFAULT FALSE,  -- is this the Nexus owner?
    source          TEXT DEFAULT 'inferred', -- 'manual', 'imported', 'inferred'
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

**That's it.** No `platform`, `sender_id`, `mapping_type`, `confidence`, `alias_type`, `display_name`, `relationship`, `notes`, `message_count` columns. Those are either captured by the `type` field, stored as facts in the facts table, or derivable from events.

### Entity Co-occurrences

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

For ACL scoping and classification.

```sql
CREATE TABLE entity_tags (
    entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    tag         TEXT NOT NULL,              -- 'trusted', 'family', 'team:engineering', 'org:anthropic'
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (entity_id, tag)
);

CREATE INDEX idx_entity_tags_tag ON entity_tags(tag);
```

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

See `../../runtime/RUNTIME_ROUTING.md` for the full session-alias lifecycle and routing implications.

---

## How Everything is an Entity: Examples

### Scenario: iMessage contact resolution

```
Day 1: iMessage from +15551234567
  INSERT INTO entities (id, name, type, source, first_seen, last_seen, normalized)
  VALUES ('ent_001', '+15551234567', 'phone', 'imported', $now, $now, '+15551234567');
  -- merged_into = NULL, this IS the canonical identity (all we know)

Day 3: Memory-Writer extracts "Mom called about dinner" from message content
  INSERT INTO entities (id, name, type, source, first_seen, normalized)
  VALUES ('ent_002', 'Mom', 'person', 'inferred', $now, 'mom');
  -- Agent recognizes from context: Mom = the person at +15551234567
  UPDATE entities SET merged_into = 'ent_002' WHERE id = 'ent_001';
  -- Now: +15551234567 -> Mom (Mom is canonical)

Day 7: Email from mom@gmail.com, agent resolves same person
  INSERT INTO entities (id, name, type, source, first_seen, normalized)
  VALUES ('ent_003', 'mom@gmail.com', 'email', 'imported', $now, 'mom@gmail.com');
  UPDATE entities SET merged_into = 'ent_002' WHERE id = 'ent_003';
  -- Now: mom@gmail.com -> Mom, +15551234567 -> Mom
```

Result:
```
Mom (ent_002, type=person, canonical root)
  +-- +15551234567 (ent_001, type=phone, merged_into=ent_002)
  +-- mom@gmail.com (ent_003, type=email, merged_into=ent_002)
```

### Scenario: Discord handle resolution

```
Day 1: Discord message from coolgamer42
  INSERT INTO entities (id, name, type, source, first_seen, normalized)
  VALUES ('ent_010', 'discord:coolgamer42', 'discord_handle', 'imported', $now, 'discord:coolgamer42');
  -- This IS the canonical identity for now

Day 5: Conversation reveals real name is "John Smith"
  INSERT INTO entities (id, name, type, source, first_seen, normalized)
  VALUES ('ent_011', 'John Smith', 'person', 'inferred', $now, 'john smith');
  UPDATE entities SET merged_into = 'ent_011' WHERE id = 'ent_010';
  -- John Smith is now canonical

Day 8: Slack message from jsmith in workspace anthropic
  INSERT INTO entities (id, name, type, source, first_seen, normalized)
  VALUES ('ent_012', 'slack:anthropic:jsmith', 'slack_user', 'imported', $now, 'slack:anthropic:jsmith');
  -- Agent resolves: same person
  UPDATE entities SET merged_into = 'ent_011' WHERE id = 'ent_012';
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

## Entity Resolution Flow

Entity resolution is agentic. The Memory-Writer agent makes all resolution decisions, using:

1. **Exact matching** -- normalized name lookup
2. **Co-occurrence scoring** -- entities that frequently appear together are likely related
3. **Contextual reasoning** -- the agent reads the event content and thread context to disambiguate
4. **PII extraction pipeline** -- existing Cortex PII extraction identifies structured identifiers
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

### Resolution flow for incoming events

```
Event arrives with deliveryContext:
  {
    platform: "imessage",
    sender_id: "+15551234567",
    sender_name: "Mom",
    peer_id: "+15551234567",
    peer_kind: "dm",
    ...
  }

1. Contact lookup in identity.db (sub-millisecond, no LLM):
   SELECT entity_id FROM contacts
   WHERE platform = 'imessage' AND sender_id = '+15551234567';
   -> 'ent_001'

2. Follow merged_into chain in identity.db to canonical entity:
   ent_001 (+15551234567) -> ent_002 (Mom)
   -- Same database — JOINable, no cross-DB boundary

3. Look up tags for canonical entity:
   SELECT tag FROM entity_tags WHERE entity_id = 'ent_002';
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
| `peer_id` | string | Conversation/chat identifier |
| `peer_kind` | enum | 'dm', 'direct', 'group', 'channel' |
| `thread_id` | string? | Thread ID for threaded conversations |
| `reply_to_id` | string? | Message being replied to |
| `capabilities` | object | Platform capabilities (markdown, message length, etc.) |
| `available_channels` | array | Other platforms available for response |

The agent uses these fields to create entities with appropriate types and to provide context for resolution. For example, `sender_id` on Discord might be `coolgamer42#1234` (globally unique with discriminator), which the agent stores as the entity name with type `discord_handle`.

---

## Contacts Integration

### The contacts table (identity.db)

A `contacts` table in `identity.db` maps `(platform, space_id, sender_id)` to `entity_id` in the unified entity store. This is the pipeline-speed lookup for identity resolution -- sub-millisecond, no LLM involvement, pure key-value.

> **Note:** Both `contacts` and `entities` now live in `identity.db`. This means the lookup is a single-database JOIN -- no cross-DB boundary.

```
contacts (identity.db)
  (platform, space_id, sender_id) -> entity_id  -->  entities (identity.db)
                                                        merged_into chain -> canonical root
```

### Auto-creation on inbound messages

Every inbound message auto-creates two things:

1. **A contact row** in `identity.db` -- `(platform, space_id, sender_id)` keyed for fast routing lookup.
2. **A delivery-sourced entity** in `identity.db` -- with type set to the platform-specific handle type (e.g., `'discord_handle'`, `'phone'`, `'email'`) and `source = 'delivery'`.

This happens at delivery time, before any LLM processing, ensuring that every sender has a routable identity from their first message. Both the contact and entity live in the same database (`identity.db`), enabling FK integrity and efficient JOINs.

### Entity merges do NOT require updating contacts

When entities merge via `union()`, the contact rows in `identity.db` are **not** updated. The `entity_id` in the contacts table may point to a non-canonical (merged) entity, but the union-find chain in `identity.db` resolves to the canonical root (same database, JOINable). This means:

- No write-amplification on merges -- contacts are write-once.
- The resolution path is: `contacts.entity_id` -> follow `merged_into` chain -> canonical entity.
- Path compression can shorten chains but is never required for correctness.

### Memory-writer enrichment

The memory-writer discovers delivery-sourced entities (`source = 'delivery'`), enriches them with context from conversations (real names, relationships, organizational affiliations), and merges them into `person` entities via the union-set. A phone number entity created by delivery becomes a child of a person entity once the agent resolves who it belongs to.

### Contacts vs. conversational mentions

**Contacts are only for actual delivery endpoints.** When a user says "my email is tyler@example.com" in conversation, the memory-writer creates an entity in `identity.db` (type `'email'`, source `'inferred'`) but does **not** create a contact row. Contact rows are exclusively created by the delivery pipeline for senders/recipients that have actually exchanged messages through Nexus.

This distinction matters: a contact means "we can route messages to/from this identifier." A conversational mention means "we know this identifier exists." Only the former participates in pipeline-speed routing.

---

## What This Replaces

| Previous System | What Happened |
|----------------|---------------|
| Identity Graph `contacts` table | Replaced by new `contacts` table in `identity.db` with `(platform, space_id, sender_id)` PK |
| Identity Graph `entities` table | Merged into unified entities table in `identity.db` |
| Identity Graph `identity_mappings` table | Replaced by direct `contacts.entity_id` link in identity.db. The separate mapping table with confidence/mapping_type columns is no longer needed -- progressive resolution is handled by entity merges in the union-set |
| Identity Graph `entity_tags` table | Kept as-is, in `identity.db` |
| Cortex `entities` table | Merged into unified entities table, relocated to `identity.db` |
| Cortex `entity_aliases` table | Aliases are entities with merged_into pointing to canonical |
| Cortex `persons` table | Persons are entities with type='person' |
| Cortex `person_contact_links` table | Contacts merged_into persons via union-set |
| Cortex `person_facts` table | Facts about people live in the facts table (in `memory.db`) |
| Cortex `merge_candidates` table | Kept as-is, in `identity.db` |
| Hindsight `entities` table | Merged into unified entities table |
| Hindsight `entity_cooccurrences` table | Kept as-is, in `identity.db` |
| Three separate name-history tables (`delivery_space_names`, `delivery_container_names`, `delivery_thread_names`) | Consolidated into single `names` table in `identity.db`. See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) section 3.3. |

---

## See Also

- `MEMORY_SYSTEM_V2.md` -- Full memory architecture
- `MEMORY_WRITER_V2.md` -- How entity resolution works in the retain flow
- `../../ledgers/IDENTITY_GRAPH.md` -- Previous identity system (superseded)
- `../../runtime/RUNTIME_ROUTING.md` -- Runtime routing and session resolution
