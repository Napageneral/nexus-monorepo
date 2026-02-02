# Identity Graph Schema

**Status:** DESIGN COMPLETE  
**Last Updated:** 2026-02-02

---

## Overview

The Identity Graph stores entities (people, personas, organizations) and their identities across platforms. Unlike the append-only ledgers, this is mutable primary data — relationships change, new identities are discovered.

**Note:** The Identity Graph sits at the boundary between System of Record and Cortex. Entities and manually-set relationships are primary data. Identity *resolution* (inferring that a new phone number belongs to an existing person) is derived/fuzzy and proposed by Cortex for human review.

---

## Entity Model

```
Entity (person, persona, org)
    ├── Identity (phone, email, discord handle, etc.)
    │     └── identity_type: 'confirmed' | 'inferred' | 'pending'
    ├── Relationship (to user: family, friend, work, etc.)
    └── Tags (arbitrary labels)
```

---

## Schema

### Entities

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

### Identities

```sql
CREATE TABLE identities (
    id TEXT PRIMARY KEY,              -- ULID
    entity_id TEXT NOT NULL,          -- Parent entity
    
    -- Identity info
    channel TEXT NOT NULL,            -- 'imessage', 'gmail', 'discord', etc.
    identifier TEXT NOT NULL,         -- '+15551234567', 'user#1234', etc.
    
    -- Confidence
    identity_type TEXT NOT NULL DEFAULT 'confirmed',  -- 'confirmed', 'inferred', 'pending'
    confidence REAL,                  -- 0.0-1.0 for inferred
    
    -- Metadata
    label TEXT,                       -- 'personal', 'work', etc.
    is_primary BOOLEAN DEFAULT FALSE, -- Primary identity for this channel
    
    -- Timing
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    
    -- Unique constraint: one entity per channel+identifier
    UNIQUE(channel, identifier),
    FOREIGN KEY (entity_id) REFERENCES entities(id)
);

CREATE INDEX idx_identities_entity ON identities(entity_id);
CREATE INDEX idx_identities_channel ON identities(channel, identifier);
CREATE INDEX idx_identities_type ON identities(identity_type);
```

### Entity Tags

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

## Identity Resolution Flow

### 1. Confirmed (Manual)

User explicitly links identity to entity:

```sql
INSERT INTO identities (entity_id, channel, identifier, identity_type)
VALUES ('entity_mom', 'imessage', '+15551234567', 'confirmed');
```

### 2. Imported (From Contacts)

Synced from system contacts or external sources:

```sql
INSERT INTO identities (entity_id, channel, identifier, identity_type, label)
VALUES ('entity_mom', 'gmail', 'mom@example.com', 'confirmed', 'personal');
```

### 3. Inferred (By Cortex)

Cortex proposes a mapping based on patterns:

```sql
-- Cortex notices same person texting from new number
INSERT INTO identities (entity_id, channel, identifier, identity_type, confidence)
VALUES ('entity_mom', 'imessage', '+15559876543', 'pending', 0.85);
```

User reviews and confirms:

```sql
UPDATE identities SET identity_type = 'confirmed', confidence = NULL
WHERE channel = 'imessage' AND identifier = '+15559876543';
```

---

## Example Data

### Entity (Person)

```json
{
    "id": "01HQENT001",
    "type": "person",
    "name": "Susan Chen",
    "display_name": "Mom",
    "is_user": false,
    "relationship": "family",
    "notes": "Prefers text over calls. Often asks for 2FA codes.",
    "created_at": 1706889600000,
    "updated_at": 1706889600000,
    "source": "manual"
}
```

### Entity (Persona)

```json
{
    "id": "01HQENT100",
    "type": "persona",
    "name": "Atlas",
    "display_name": "Atlas",
    "is_user": true,
    "relationship": null,
    "notes": "Primary agent persona",
    "created_at": 1706800000000,
    "updated_at": 1706800000000,
    "source": "manual"
}
```

### Identities for Mom

```json
[
    {
        "id": "01HQID001",
        "entity_id": "01HQENT001",
        "channel": "imessage",
        "identifier": "+15551234567",
        "identity_type": "confirmed",
        "is_primary": true,
        "label": "mobile"
    },
    {
        "id": "01HQID002",
        "entity_id": "01HQENT001",
        "channel": "gmail",
        "identifier": "susan.chen@gmail.com",
        "identity_type": "confirmed",
        "is_primary": true,
        "label": "personal"
    },
    {
        "id": "01HQID003",
        "entity_id": "01HQENT001",
        "channel": "imessage",
        "identifier": "+15559876543",
        "identity_type": "pending",
        "confidence": 0.85,
        "label": null
    }
]
```

---

## IAM Integration

The Identity Graph is queried during the `resolveIdentity` stage of the NEX pipeline:

```typescript
interface IdentityLookupRequest {
    channel: string;
    identifier: string;
}

interface IdentityLookupResult {
    found: boolean;
    entity?: {
        id: string;
        type: 'person' | 'persona';
        name?: string;
        is_user: boolean;
        relationship?: string;
        tags: string[];
    };
}
```

If no entity is found, NEX proceeds with an unknown principal.

---

## Cortex Enrichment

Cortex can propose updates to the Identity Graph:

```typescript
interface IdentityEnrichment {
    entity_id: string;
    
    // Proposed updates
    relationship?: string;           // Learned from conversation patterns
    tags_add?: string[];
    tags_remove?: string[];
    
    // New identities discovered
    new_identities?: {
        channel: string;
        identifier: string;
    }[];
    
    // Confidence
    confidence: number;              // 0-1
    source: 'cortex_analysis';
}
```

**Rules:**
- High confidence (>0.9): Auto-apply with `identity_type = 'inferred'`
- Medium confidence (0.7-0.9): Add as `pending` for human review
- Low confidence (<0.7): Log but don't add

---

## Invariants

1. **Unique identities** — Each (channel, identifier) maps to at most one entity
2. **User entity exists** — Exactly one entity has `is_user = true`
3. **No orphan identities** — Every identity has valid entity_id
4. **Confirmed trumps inferred** — Manual confirmation overrides Cortex inference

---

## Related Documents

- `README.md` — System of Record overview
- `../iam/` — IAM policies use identity for access control
- `../cortex/` — Cortex proposes identity enrichments
- `../nex/INTERFACES.md` — IdentityLookup interface contract
