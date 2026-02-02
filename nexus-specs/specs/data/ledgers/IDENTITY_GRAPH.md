# Identity Graph Schema

**Status:** DESIGN COMPLETE  
**Last Updated:** 2026-02-02

---

## Overview

The Identity Graph manages **who** is involved in Nexus interactions. It consists of three layers:

| Layer | Purpose | Mutability |
|-------|---------|------------|
| **Contacts** | All unique (channel, identifier) pairs we've seen | Derived from events |
| **Entities** | People, personas, organizations we know about | User-defined, mutable |
| **Identity Mappings** | Links contacts → entities (with confidence) | Fuzzy, mutable |

**Key insight:** Contacts are hard facts (derived from events). Entities are user-defined. The *mapping* between them is the fuzzy part that can be confirmed, inferred, or pending review.

---

## Data Model

```
┌─────────────────────────────────────────────────────────────────┐
│                        EVENTS LEDGER                             │
│                                                                  │
│  event: { from_channel: 'imessage', from_identifier: '+1555...' }│
│  event: { from_channel: 'gmail', from_identifier: 'alice@...' } │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ aggregated
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CONTACTS                                 │
│                       (hard facts)                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ channel: imessage  │ identifier: +15551234567           │   │
│  │ first_seen: ...    │ last_seen: ...  │ message_count: 47│   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ channel: gmail     │ identifier: alice@example.com      │   │
│  │ first_seen: ...    │ last_seen: ...  │ message_count: 12│   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ identity mappings (fuzzy)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         ENTITIES                                 │
│                     (user-defined)                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ id: ent_001  │ type: person  │ name: "Mom"              │   │
│  │ relationship: family         │ tags: [trusted]          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ▲                                   │
│                              │                                   │
│            ┌─────────────────┴─────────────────┐                │
│            │                                   │                │
│  ┌─────────────────────┐         ┌─────────────────────┐       │
│  │ imessage:+1555...   │         │ gmail:mom@...       │       │
│  │ type: confirmed     │         │ type: confirmed     │       │
│  └─────────────────────┘         └─────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Schema

### Contacts

Aggregated from Events Ledger — all unique (channel, identifier) pairs we've interacted with.

```sql
CREATE TABLE contacts (
    -- Composite primary key
    channel TEXT NOT NULL,            -- 'imessage', 'gmail', 'discord', etc.
    identifier TEXT NOT NULL,         -- '+15551234567', 'alice@example.com', etc.
    
    -- Derived stats (updated on event insert)
    first_seen INTEGER NOT NULL,      -- Unix ms of first interaction
    last_seen INTEGER NOT NULL,       -- Unix ms of most recent interaction
    message_count INTEGER DEFAULT 0,  -- Total messages sent/received
    
    -- Display (optional, from platform)
    display_name TEXT,                -- Name from platform (e.g., contact card)
    avatar_url TEXT,                  -- Profile picture if available
    
    PRIMARY KEY (channel, identifier)
);

CREATE INDEX idx_contacts_last_seen ON contacts(last_seen DESC);
```

**Properties:**
- Derived from events (could be materialized view or trigger-updated)
- No entity linkage here — just raw facts
- One row per unique (channel, identifier) pair

### Entities

People, personas, and organizations that we know about.

```sql
CREATE TABLE entities (
    id TEXT PRIMARY KEY,              -- ULID
    
    -- Classification
    type TEXT NOT NULL,               -- 'person', 'persona', 'organization'
    
    -- Display
    name TEXT,                        -- Human-friendly name
    display_name TEXT,                -- How to address them
    avatar_url TEXT,                  -- Profile picture
    
    -- User relationship
    is_user BOOLEAN NOT NULL DEFAULT FALSE,  -- Is this the Nexus owner?
    relationship TEXT,                -- 'family', 'friend', 'work', 'acquaintance', etc.
    
    -- Metadata
    notes TEXT,                       -- Freeform notes
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    
    -- Source
    source TEXT NOT NULL DEFAULT 'manual',  -- 'manual', 'imported', 'inferred'
    source_ref TEXT                   -- Reference to import source
);

CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_relationship ON entities(relationship);
CREATE INDEX idx_entities_is_user ON entities(is_user);
```

**Properties:**
- User-defined (manual creation) or imported (from system contacts)
- Mutable (name, relationship, notes can change)
- Can exist without any linked contacts (e.g., a persona you haven't used yet)

### Identity Mappings

The fuzzy layer — links contacts to entities with confidence levels.

```sql
CREATE TABLE identity_mappings (
    id TEXT PRIMARY KEY,              -- ULID
    
    -- The contact being mapped
    channel TEXT NOT NULL,
    identifier TEXT NOT NULL,
    
    -- The entity it maps to (NULLABLE for unresolved)
    entity_id TEXT,
    
    -- Confidence
    mapping_type TEXT NOT NULL DEFAULT 'unknown',  
        -- 'confirmed': User explicitly confirmed
        -- 'inferred': Cortex inferred with high confidence
        -- 'pending': Cortex suggested, awaiting review
        -- 'unknown': No mapping yet
    confidence REAL,                  -- 0.0-1.0 for inferred/pending
    
    -- Metadata
    label TEXT,                       -- 'personal', 'work', etc.
    is_primary BOOLEAN DEFAULT FALSE, -- Primary contact for this entity on this channel
    
    -- Timing
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    
    -- One mapping per contact
    UNIQUE(channel, identifier),
    FOREIGN KEY (channel, identifier) REFERENCES contacts(channel, identifier),
    FOREIGN KEY (entity_id) REFERENCES entities(id)
);

CREATE INDEX idx_identity_mappings_entity ON identity_mappings(entity_id);
CREATE INDEX idx_identity_mappings_type ON identity_mappings(mapping_type);
```

**Properties:**
- Every contact CAN have a mapping (but doesn't have to)
- `entity_id` is NULLABLE — allows tracking "seen but unknown" contacts
- `mapping_type` captures confidence: confirmed > inferred > pending > unknown
- Cortex can create `pending` mappings for human review

### Entity Tags

Arbitrary labels for entities.

```sql
CREATE TABLE entity_tags (
    entity_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    
    PRIMARY KEY (entity_id, tag),
    FOREIGN KEY (entity_id) REFERENCES entities(id)
);

CREATE INDEX idx_entity_tags_tag ON entity_tags(tag);
```

---

## Resolution Flow

When an event arrives, IAM resolves the sender:

```
1. Event arrives: { from_channel: 'imessage', from_identifier: '+15551234567' }

2. Upsert contact (update last_seen, message_count)

3. Query identity_mappings:
   SELECT entity_id, mapping_type 
   FROM identity_mappings 
   WHERE channel = 'imessage' AND identifier = '+15551234567'

4. If mapping_type = 'confirmed' or 'inferred':
   → Fetch entity, return as principal

5. If mapping_type = 'pending' or 'unknown' or no mapping:
   → Return unknown principal
   → Cortex may later suggest a mapping
```

---

## Example Data

### Contact (Raw Fact)

```json
{
    "channel": "imessage",
    "identifier": "+15551234567",
    "first_seen": 1706800000000,
    "last_seen": 1706889600000,
    "message_count": 47,
    "display_name": "Mom"
}
```

### Entity (User-Defined)

```json
{
    "id": "ent_001",
    "type": "person",
    "name": "Susan Chen",
    "display_name": "Mom",
    "is_user": false,
    "relationship": "family",
    "notes": "Prefers text over calls. Often asks for 2FA codes.",
    "source": "manual"
}
```

### Identity Mapping (Confirmed)

```json
{
    "id": "map_001",
    "channel": "imessage",
    "identifier": "+15551234567",
    "entity_id": "ent_001",
    "mapping_type": "confirmed",
    "confidence": null,
    "label": "mobile",
    "is_primary": true
}
```

### Identity Mapping (Pending Review)

```json
{
    "id": "map_002",
    "channel": "imessage",
    "identifier": "+15559876543",
    "entity_id": "ent_001",
    "mapping_type": "pending",
    "confidence": 0.85,
    "label": null,
    "is_primary": false
}
```

Cortex noticed this number texting about similar topics and suggested it might be Mom's new number. Awaiting user confirmation.

---

## Cortex Integration

Cortex can suggest identity mappings:

```typescript
interface IdentityEnrichment {
    // The contact to map
    channel: string;
    identifier: string;
    
    // Suggested entity
    suggested_entity_id: string;
    
    // Confidence
    confidence: number;              // 0-1
    reasoning: string;               // Why Cortex thinks this
    
    source: 'cortex_analysis';
}
```

**Rules:**
- High confidence (>0.9): Auto-create as `mapping_type = 'inferred'`
- Medium confidence (0.7-0.9): Create as `mapping_type = 'pending'` for review
- Low confidence (<0.7): Log but don't create mapping

---

## Invariants

1. **Unique contacts** — Each (channel, identifier) appears once in contacts table
2. **Unique mappings** — Each contact has at most one identity mapping
3. **User entity exists** — Exactly one entity has `is_user = true`
4. **Confirmed trumps inferred** — User confirmation always wins
5. **Contacts from events** — Contacts table is derived from Events Ledger

---

## Related Documents

- `README.md` — System of Record overview
- `EVENTS_LEDGER.md` — Source of contact data
- `../iam/` — IAM uses identity resolution for access control
- `../cortex/` — Cortex proposes identity enrichments
- `../nex/INTERFACES.md` — IdentityLookup interface contract
