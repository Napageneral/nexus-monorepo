# Phase 2 — Identity Schema Rename & Ripple

**Status:** ACTIVE
**Created:** 2026-03-01
**Phase:** 2 (parallel-safe with Phase 3)
**Spec:** ../UNIFIED_ENTITY_STORE.md
**Primary File:** `nex/src/db/identity.ts`

---

## Overview

Rename `sender_id` → `contact_id` and `sender_name` → `contact_name` in the contacts table and all references throughout the codebase. This is a naming alignment — the schema shape stays the same, but the field names change to match the canonical spec terminology.

**Hard cutover.** Drop and recreate the contacts table. No column rename migration.

---

## Current State

### `db/identity.ts` — Contacts Table (Actual Current Schema)

```sql
CREATE TABLE IF NOT EXISTS contacts (
    platform       TEXT NOT NULL,
    space_id       TEXT NOT NULL DEFAULT '',
    sender_id      TEXT NOT NULL,
    entity_id      TEXT NOT NULL,
    source         TEXT NOT NULL,             -- 'adapter' | 'observed' | 'manual'
    first_seen     INTEGER NOT NULL,          -- unix ms
    last_seen      INTEGER NOT NULL,          -- unix ms
    message_count  INTEGER NOT NULL DEFAULT 0,
    sender_name    TEXT,
    avatar_url     TEXT,
    label          TEXT,                      -- 'personal', 'work', 'shared', 'org'
    owner_id       TEXT REFERENCES entities(id),
    PRIMARY KEY (platform, space_id, sender_id)
);
```

### `ContactRow` Interface (Actual Current)

```typescript
export interface ContactRow {
    platform: string;
    space_id: string;
    sender_id: string;
    entity_id: string;
    source: "adapter" | "observed" | "manual";
    first_seen: number;
    last_seen: number;
    message_count: number;
    sender_name: string | null;
    avatar_url: string | null;
    label: string | null;
    owner_id: string | null;
}
```

### Target Contacts Schema (Locked-In)

```sql
CREATE TABLE contacts (
    id            TEXT PRIMARY KEY,
    entity_id     TEXT NOT NULL REFERENCES entities(id),
    platform      TEXT NOT NULL,
    space_id      TEXT NOT NULL DEFAULT '',
    contact_id    TEXT NOT NULL,
    contact_name  TEXT,
    avatar_url    TEXT,
    origin        TEXT NOT NULL,           -- 'adapter' | 'writer' | 'manual'
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER,
    metadata      TEXT,
    UNIQUE(platform, space_id, contact_id)
);
```

### Diff: Current → Target

This is a **hard cutover** — drop the existing table and recreate from scratch. No migration, no data preservation. All existing contact rows are destroyed and will be re-seeded organically as messages flow through adapters.

**Columns renamed:**
- `sender_id` → `contact_id`
- `sender_name` → `contact_name`
- `source` → `origin` (with value mapping: `"observed"` → `"writer"`)

**Columns dropped (not carried forward):**
- `first_seen` — replaced by `created_at`
- `last_seen` — no equivalent; stats tracking removed from contacts
- `message_count` — removed; contacts are identity mappings, not counters
- `label` — removed
- `owner_id` — removed

**Columns added:**
- `id TEXT PRIMARY KEY` — surrogate PK replaces the composite PK `(platform, space_id, sender_id)`
- `metadata TEXT` — JSON blob for extensible per-contact data
- `created_at INTEGER NOT NULL` — replaces `first_seen`
- `updated_at INTEGER` — new

**Primary key change:**
- Current: composite `PRIMARY KEY (platform, space_id, sender_id)`
- Target: surrogate `id TEXT PRIMARY KEY` with `UNIQUE(platform, space_id, contact_id)` constraint

**`origin` field on entities:**
The entities table currently has no `origin` column. This workplan adds one. Since the contacts table is nuked and rebuilt, there is no existing `source` data to migrate. New contacts will be created with `origin` set by context: adapters set `"adapter"`, writer tools set `"writer"`, manual creation sets `"manual"`. The old `"observed"` value does not exist in the target schema — any code path that previously wrote `"observed"` must write `"writer"` instead.

---

## Changes

### I1. Rewrite contacts table to locked-in schema

```sql
CREATE TABLE contacts (
    id            TEXT PRIMARY KEY,
    entity_id     TEXT NOT NULL REFERENCES entities(id),
    platform      TEXT NOT NULL,
    space_id      TEXT NOT NULL DEFAULT '',
    contact_id    TEXT NOT NULL,            -- was: sender_id
    contact_name  TEXT,                     -- was: sender_name
    avatar_url    TEXT,
    origin        TEXT NOT NULL,            -- 'adapter' | 'writer' | 'manual'
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER,
    metadata      TEXT,
    UNIQUE(platform, space_id, contact_id)
);
```

### I2. Update `ContactRow` interface

```typescript
interface ContactRow {
    id: string;                       // NEW — PK
    entity_id: string;                // was: nullable, now NOT NULL
    platform: string;
    space_id: string;
    contact_id: string;               // was: sender_id
    contact_name: string | null;      // was: sender_name
    avatar_url: string | null;        // NEW
    origin: string;                   // NEW — 'adapter' | 'writer' | 'manual'
    created_at: number;
    updated_at: number | null;
    metadata: string | null;          // NEW — JSON blob
}
```

### I3. Ripple through identity.ts

Every function in `identity.ts` that reads or writes `sender_id`/`sender_name`:

| Function / Location | What Changes |
|---|---|
| `ensureContactsSchema()` | Table CREATE uses `contact_id`, `contact_name` |
| `upsertContact()` | Parameter names, INSERT/UPDATE SQL column names |
| `findContact()` | WHERE clause uses `contact_id` |
| `resolveContactEntity()` | Column references |
| `listContacts()` / any query functions | SELECT column names |
| All prepared statements | Column name strings |

**Approach:** Do a global find-replace within `identity.ts`:
- `sender_id` → `contact_id` (in SQL strings and TypeScript)
- `sender_name` → `contact_name` (in SQL strings and TypeScript)

Then verify each usage is correct in context.

### I4. Ripple through codebase

Files outside `identity.ts` that reference `sender_id` or `sender_name` in the identity/contact context. These need updating:

**Expected files (verify with grep):**

| File Pattern | What Changes |
|---|---|
| `retain-episodes.ts` | `EpisodeParticipant` interface: `participant_id` maps from old `sender_id` |
| `retain-dispatch.ts` | Contact seeding during episode retention |
| `memory-retain-episode.ts` | Episode payload construction — `sender_id` field in events |
| `memory-writer-tools.ts` | Contact lookup during entity creation/linking |
| `recall.ts` | Contact resolution in recall results |
| Adapter files | Each adapter seeds contacts — `sender_id` → `contact_id` in seeding calls |
| Test files | Contact fixtures and assertions |

**Important distinction:** Not ALL `sender_id` references change. Only those that refer to the **contacts table column**. The event-level `sender_id` in `events.db` is a different concept (it's the raw platform sender identifier on the event, not the contacts table column). That field stays as `sender_id` on events — the contact lookup maps `event.sender_id` to `contacts.contact_id`.

### I5. Add `origin` field to entities table

**Spec:** UNIFIED_ENTITY_STORE.md — Entities have `origin TEXT` ('adapter', 'writer', 'manual').

The entities table in `identity.ts` currently lacks an `origin` column.

```sql
-- Add to entities table definition:
origin TEXT  -- 'adapter', 'writer', 'manual'
```

- `create_entity` tool (writer tools) sets `origin = 'writer'`
- Adapter contact seeding sets `origin = 'adapter'` when auto-creating entities
- Manual creation (if any CLI path exists) sets `origin = 'manual'`

---

## Grep Audit Checklist

Before starting, run these greps to identify all touch points:

```bash
# Contact-related sender_id references (identity context)
rg "sender_id" --type ts -l
rg "sender_name" --type ts -l

# ContactRow interface consumers
rg "ContactRow" --type ts -l

# Contact table SQL references
rg "contacts" --type ts --glob "!*.test.*" -l
```

Review each hit to classify:
- **Identity context** (contacts table) → rename to `contact_id`/`contact_name`
- **Event context** (event sender) → leave as `sender_id`
- **Both** (mapping event sender to contact) → update the contact side only

---

## Implementation Steps

1. Run greps to build the complete list of files to modify
2. Update `db/identity.ts`:
   - Rename columns in CREATE TABLE
   - Update `ContactRow` interface
   - Update all functions and prepared statements
3. Update `retain-episodes.ts`:
   - `EpisodeParticipant` interface fields
   - Participant resolution logic
4. Update `retain-dispatch.ts`:
   - Contact seeding calls
5. Update `memory-writer-tools.ts`:
   - Contact lookup during entity operations
6. Update `memory-retain-episode.ts`:
   - Payload construction
7. Update adapter files:
   - Contact seeding calls use `contact_id`
8. Add `origin` column to entities table
9. Update entity creation paths to set `origin`
10. Run `npm run build` to verify

---

## Validation

- `npm run build` — zero compilation errors
- `npm test` — passes (test fixtures updated)
- Contacts table uses `contact_id`/`contact_name` column names
- Entities table has `origin` column
- Events table still uses `sender_id` (unchanged)
- No remaining `sender_name` or `sender_id` references in identity context
