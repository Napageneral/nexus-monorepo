# Unified Entity Store — Identity Layer Dependency

**Status:** CANONICAL
**Last Updated:** 2026-03-02
**Related:** MEMORY_SYSTEM.md, MEMORY_WRITER.md

---

## Overview

The entity store is part of the **identity layer** (`identity.db`), not the memory system. The memory system depends on it — facts link to entities, and entity resolution quality directly determines memory quality.

This document describes the entity and contact schemas, the hybrid identifier policy, merge chains, and the adapter contact seeding contract that memory depends on.

---

## Entities

Entities represent the WHO and WHAT that facts are about. People, organizations, projects, locations, concepts.

**Entities are identities, not identifiers.** A phone number is not an entity — it's a contact binding to a person entity. When someone's phone number appears in conversation, it's stored as a fact about the person ("Tyler's phone is +1555..."), not as a separate entity.

### Schema (identity.db)

```sql
CREATE TABLE entities (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    type          TEXT NOT NULL,        -- person, organization, project, location, concept, group
    normalized    TEXT,                 -- canonical lowercase name for dedup
    is_user       INTEGER DEFAULT 0,   -- TRUE for the system owner
    merged_into   TEXT REFERENCES entities(id),  -- union-find: points to canonical entity
    origin        TEXT,                 -- who created: 'adapter', 'writer', 'manual'
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER
);
```

### Entity Types

| Type | Description | Examples |
|---|---|---|
| `person` | Individual people | Tyler Brandt, Casey Adams |
| `organization` | Companies, teams, departments | Anthropic, Engineering Team |
| `project` | Named initiatives | Project Nexus |
| `location` | Cities, venues, addresses | Austin TX, Comedy Mothership |
| `concept` | Topic-defining concepts only | Machine Learning, Wedding Planning |
| `group` | Named groups with membership | Book Club, Fantasy Football League |

---

## Contacts

Contacts bind platform identifiers to entities. This is the bridge between delivery/routing and memory.

### Schema (identity.db)

```sql
CREATE TABLE contacts (
    id            TEXT PRIMARY KEY,
    entity_id     TEXT NOT NULL REFERENCES entities(id),
    platform      TEXT NOT NULL,
    space_id      TEXT NOT NULL DEFAULT '',
    contact_id    TEXT NOT NULL,           -- raw platform identifier (no prefix)
    contact_name  TEXT,                    -- display name from the platform/contact list
    avatar_url    TEXT,                    -- avatar URL from the platform
    origin        TEXT NOT NULL,           -- 'adapter' | 'writer' | 'manual'
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER,
    metadata      TEXT,
    UNIQUE(platform, space_id, contact_id)
);
```

**Three levels of identity on a contact:**
- `contact_id` — the raw platform identifier (`+16319056994`, `U01ABCDEF`). Used for routing/delivery and provenance.
- `contact_name` — the display name FROM the platform or contact list ("Casey A." in iMessage, "CaseyA_99" in Discord). What the platform shows.
- `entity_id` → `entities.name` — the canonical identity name ("Casey Adams"). What the memory system uses.

The `contact_name` is useful metadata but the memory system operates on `entity_name` (via the entity_id join). When building episode payloads, both are shown in the participants legend, but events use only the canonical entity name.

A single person entity can have multiple contact bindings across platforms — the same person might have an iMessage contact, a Discord contact, and a Gmail contact all pointing to one entity.

> **Design Decision: `space_id` for workspace-scoped platforms.**
>
> Most platforms have globally unique user identifiers — Discord snowflakes, phone numbers, email addresses. But Slack user IDs (`U123ABC`) are only unique within a workspace. The same ID in workspace `T111` and `T222` can be completely different humans. The `space_id` column handles this: it defaults to `''` for most platforms (effectively a two-part key) but is populated with the workspace ID for Slack and any future workspace-scoped platform. The compound unique `(platform, space_id, contact_id)` prevents collisions without adding complexity to the 99% case.

> **Design Decision: `contact_id` not `sender_id`.**
>
> The previous field name `sender_id` was misleading because the same contact row is used to resolve both senders and receivers. A contact is a platform binding to an entity — it doesn't imply directionality. `contact_id` is neutral and accurate.

> **Design Decision: `origin` not `source`.**
>
> The field was previously named `source`. We renamed to `origin` because `source` is overloaded across the codebase (event source, adapter source, data source). `origin` unambiguously answers "who created this row" — did it come from an adapter seeding its contact catalog, from a writer agent discovering an entity during extraction, or from manual user input?

---

## Merge Chains (Union-Find)

When two entities are discovered to be the same person/thing, one gets `merged_into` pointing at the other. This forms a union-find structure.

**All queries must follow merge chains to the canonical entity.** The canonical entity is the one with `merged_into = NULL` at the end of the chain.

Merges can be:
- **Automatic** — high-confidence merge executed by the writer or consolidator via `propose_merge`
- **Proposed** — lower-confidence merge recorded as a `merge_candidate` for operator review

### Merge Candidates (identity.db)

```sql
CREATE TABLE merge_candidates (
    id          TEXT PRIMARY KEY,
    entity_a_id TEXT NOT NULL REFERENCES entities(id),
    entity_b_id TEXT NOT NULL REFERENCES entities(id),
    confidence  REAL NOT NULL,
    reason      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  INTEGER NOT NULL,
    resolved_at INTEGER,
    UNIQUE(entity_a_id, entity_b_id)
);
```

---

## Identifier Policy

**This policy is owned by the identity layer, not the memory system.**

**The rule: NO platform prefixes.** All identifiers are stored as raw values. The `(platform, space_id, contact_id)` compound unique key in the contacts table prevents collisions. The `platform` column disambiguates — not the identifier itself. For most platforms, `space_id` is `''` and the effective key is `(platform, contact_id)`.

### Universal Identifiers

Phone numbers and email addresses use **abstract platform names** rather than specific services:

| Identifier Type | Platform | contact_id | Example Scenario |
|---|---|---|---|
| Phone | `phone` | `+16319056994` | Same number across iMessage, WhatsApp, Signal |
| Email | `email` | `tyler@anthropic.com` | Same address across Gmail, work email |

**Why `phone`/`email` as platform instead of `imessage`/`gmail`:** The same phone number might appear across iMessage, WhatsApp, and Signal. Using the specific service as platform would create 3 separate contacts for one phone number. Using `phone` as the platform ensures one contact row, one entity link.

### Platform-Local Identifiers

Platform-specific identifiers use their platform name and raw ID:

| Identifier Type | Platform | space_id | contact_id | Example |
|---|---|---|---|---|
| Discord user ID | `discord` | `''` | `123456789` | Raw numeric ID, globally unique |
| Slack member ID | `slack` | `T01WORKSPACE` | `U01ABCDEF` | Scoped by workspace — same user ID in different workspaces = different people |
| Instagram handle | `instagram` | `''` | `tyler_b` | Raw handle |

The compound unique key `(platform, space_id, contact_id)` ensures Discord user `123456789` and Slack user `123456789` are distinct contacts. And Slack user `U01ABCDEF` in workspace `T111` is distinct from `U01ABCDEF` in workspace `T222`.

> **Design Decision: Why no platform prefix on identifiers.**
>
> We considered prefixing platform-local identifiers (e.g., `discord:123456789`). We chose not to because:
> 1. The `(platform, space_id, contact_id)` compound key already prevents collisions — the prefix is redundant.
> 2. Prefixing adds complexity to every lookup (must construct the prefixed form).
> 3. Cross-platform matching for universal identifiers becomes harder with prefixes.
> 4. Platform is always known when you have a platform-local ID — you never look up a Discord ID without knowing it's from Discord.
> 5. The `platform` column was specifically added to avoid these concatenated identifier hacks.

### Contact Resolution

When the identity layer encounters a new contact:
1. Canonicalize the identifier (E.164 for phone, lowercase for email, raw for platform-local)
2. Look up existing contact with `(platform, contact_id)`
3. If found → link to existing entity
4. If not found → create new contact and entity

This prevents duplicate contacts. The `UNIQUE(platform, space_id, contact_id)` constraint enforces this at the schema level.

---

## Adapter Contact Seeding

**This is a prerequisite for quality memory extraction.** The memory system depends on contacts existing in the identity store before retain runs.

### When It Happens

Contact seeding is an **adapter lifecycle step**, not a memory system step:
1. When an adapter is connected (e.g., iMessage via Eve)
2. The adapter provides its contact catalog: platform handles → display names → normalized identifiers
3. These are ingested into the identity store: contacts created, entities created or linked
4. This happens **before** any memory backfill starts

### Contract

Adapters must provide:

```typescript
interface AdapterContactSeed {
  platform: string;
  identifier: string;           // raw platform identifier
  display_name?: string;        // human-readable name
  normalized_phone?: string;    // E.164 when applicable
  normalized_email?: string;    // lowercase when applicable
  aliases?: string[];           // alternative identifiers
}
```

The identity layer ingests these seeds:
- Creates or updates contacts with canonical identifiers
- Creates person entities for new contacts
- Links existing entities when canonical identifier matches
- Tags `origin = 'adapter'`

### Why This Matters for Memory

Without contact seeding:
- Writer receives phone numbers instead of names in episode payloads
- Entity resolution fragments across platforms (same person = multiple entities)
- Extracted facts reference "a contact" instead of real people
- Cross-platform knowledge about the same person never connects

With contact seeding:
- Writer sees "Casey Adams" not "+16319056994"
- Facts always reference people by name
- Same person across iMessage + Discord + Email = one entity
- Memory graph is connected and useful

---

## Entity Co-occurrence Queries

Entity co-occurrence (how often two entities appear together in facts) is **derived at query time** from the `element_entities` junction table in `memory.db`. There is no denormalized co-occurrence table.

```sql
-- Co-occurrence count between two entities
SELECT COUNT(DISTINCT ee1.element_id) AS cooccurrence_count
FROM element_entities ee1
JOIN element_entities ee2 ON ee1.element_id = ee2.element_id
WHERE ee1.entity_id = :entity_a AND ee2.entity_id = :entity_b;

-- All entities that co-occur with entity X, ranked by frequency
SELECT ee2.entity_id, COUNT(DISTINCT ee1.element_id) AS cooccurrence_count
FROM element_entities ee1
JOIN element_entities ee2 ON ee1.element_id = ee2.element_id
WHERE ee1.entity_id = :entity_id AND ee2.entity_id != :entity_id
GROUP BY ee2.entity_id
ORDER BY cooccurrence_count DESC;
```

This is used by the writer and consolidator for entity disambiguation and merge detection. With proper indexes on `element_entities`, these queries are fast for interactive use. If performance becomes a concern at scale, a materialized co-occurrence table can be introduced as an optimization — but the clean data model comes first.

See `FACT_GRAPH_TRAVERSAL.md` for the full set of relationship query patterns built on `element_entities`.

---

## Entity Tags

Entities can be tagged for scoping and categorization. Tags follow the **immutable rows with lifecycle** pattern — each row is an immutable fact recording a tag that existed from `created_at` to `deleted_at`. When a tag is removed, the row gets `deleted_at` set. When re-added later, a new row is created. This provides full add/remove history.

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

**Active tags**: `SELECT tag FROM entity_tags WHERE entity_id = ? AND deleted_at IS NULL`

**Full history**: `SELECT * FROM entity_tags WHERE entity_id = ? ORDER BY created_at`

---

## See Also

- `MEMORY_SYSTEM.md` — How memory depends on the entity store
- `MEMORY_WRITER.md` — How the writer creates and resolves entities
- `MEMORY_CONSOLIDATION.md` — How consolidation proposes entity merges
