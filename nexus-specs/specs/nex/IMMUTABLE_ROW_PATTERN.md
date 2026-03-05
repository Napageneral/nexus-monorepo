# Immutable Row Pattern

**Status:** DESIGN (convention)
**Last Updated:** 2026-03-03

---

## Overview

Several tables in the Nexus system use an **immutable row pattern** to preserve full history while maintaining a clean "current state" view. Instead of UPDATE-ing a row in place, the system soft-closes the old row and inserts a new one.

This document defines the pattern so it can be applied consistently across all tables that need history tracking.

---

## The Pattern

### Schema Requirements

Any table using this pattern must have:

```sql
created_at  INTEGER NOT NULL    -- when this row became active
deleted_at  INTEGER             -- when this row was superseded (NULL = current)
```

The "identity" of the logical record is defined by one or more columns that stay the same across versions. The "mutable" columns are the ones that change between versions.

### Write Operations

**Create:** Insert a new row. `deleted_at` is NULL.

**Update:** In a single transaction:
1. Set `deleted_at = now()` on the current row (WHERE identity columns match AND `deleted_at IS NULL`)
2. Insert a new row with the updated values. `created_at = now()`, `deleted_at = NULL`.

**Delete:** Set `deleted_at = now()` on the current row. No hard deletes.

### Read Operations

**Current state:** `WHERE deleted_at IS NULL` — returns only the active version of each record.

**History:** `WHERE identity_columns = ? ORDER BY created_at DESC` — returns all versions, most recent first. The current version has `deleted_at IS NULL`, all prior versions have `deleted_at` set to when they were superseded.

**Point-in-time:** `WHERE identity_columns = ? AND created_at <= ? AND (deleted_at IS NULL OR deleted_at > ?)` — returns the version active at a specific timestamp.

---

## Tables Using This Pattern

### `entity_tags` (identity.db)

**Identity columns:** `entity_id`, `tag`
**Mutable columns:** (none — a tag either exists or doesn't)
**Usage:** Adding a tag inserts a row. Removing a tag sets `deleted_at`. Re-adding inserts a new row. Full tag history is preserved.

### `entity_persona` (identity.db)

**Identity columns:** `receiver_entity_id`
**Mutable columns:** `persona_ref`
**Usage:** Changing an entity's persona binding soft-closes the old row and inserts a new one. Persona binding history shows how entity routing evolved.

### `contacts` (identity.db)

**Identity columns:** `platform`, `space_id`, `contact_id`
**Mutable columns:** `contact_name`, `avatar_url`
**Usage:** When a contact's display name changes on a platform, the old row is soft-closed and a new row is inserted with the new name. Walking the history for a (platform, space_id, contact_id) tuple shows the full name evolution.

### `channels` (identity.db — target schema)

**Identity columns:** `platform`, `account_id`, `container_id`, `thread_id`
**Mutable columns:** `space_name`, `container_name`, `thread_name`
**Usage:** When a channel/space/thread is renamed on a platform, the old row is soft-closed and a new row is inserted. Full naming history is preserved in a single table.

---

## Querying Patterns

### Get current state for an entity's tags

```sql
SELECT tag FROM entity_tags
WHERE entity_id = ? AND deleted_at IS NULL;
```

### Get full name history for a contact

```sql
SELECT contact_name, created_at, deleted_at
FROM contacts
WHERE platform = ? AND space_id = ? AND contact_id = ?
ORDER BY created_at DESC;
```

### Get a channel's state at a point in time

```sql
SELECT * FROM channels
WHERE platform = ? AND container_id = ? AND thread_id = ?
  AND created_at <= ?
  AND (deleted_at IS NULL OR deleted_at > ?)
LIMIT 1;
```

---

## Why This Pattern

**Full history:** Every change is preserved. Nothing is lost. Name changes, tag changes, persona rebinds — all recoverable.

**Simple queries:** Current state is always `WHERE deleted_at IS NULL`. No joins, no version tables, no separate history tables.

**Consistent:** The same pattern works for any table where we want history. Learn it once, apply everywhere.

**Audit-friendly:** Every row has `created_at` — you can see exactly when every change happened. Combined with `deleted_at`, you can reconstruct the state at any point in time.

**No separate observation tables:** Instead of `contact_name_observations`, `names`, or other history-tracking side tables, the main table IS the history. One table serves both current-state reads and historical queries.
