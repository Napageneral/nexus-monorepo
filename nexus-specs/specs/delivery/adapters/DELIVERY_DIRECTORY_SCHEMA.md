# Delivery Directory + Membership Schema (identity.db)

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-18  
**Canonical taxonomy:** `UNIFIED_DELIVERY_TAXONOMY.md`  
**Related:**
- `RUNTIME_ROUTING.md` (contacts + identity resolution)
- `adapters/CHANNEL_DIRECTORY.md` (logical directory model)
- `iam/POLICIES.md` (IAM matching)

---

## Goal

Define the physical SQLite schema that stores delivery-derived directory data used for:

- routing outbound messages to specific spaces/containers/threads
- powering UI "directory" selection and recent targets
- supporting IAM scoping (by stable ids, not display names)
- tracking rename history (space/container/thread names over time)
- tracking observed participants over time (membership approximation)

This schema is designed to be populated passively from inbound events (no active sync required to start).

---

## Where It Lives

All tables in this document live in `identity.db`.

Rationale:

- `identity.db` is already the pipeline-speed lookup store (contacts + auth).
- Directory lookups should be local, fast, and not require cross-DB joins for common UI/IAM operations.

---

## Core Principles

1. **Ids are authoritative.** `*_name` fields are best-effort display strings.
2. **History is tracked as intervals.** Name history tables store `first_seen/last_seen` for each distinct name.
3. **Membership is observed-first.** Start with "observed participant" tracking from messages; add active sync later if needed.
4. **Entities are in identity.db.** `entity_id` references the `entities` table, which lives in the same database as contacts and directory tables. This enables JOINs for identity resolution without cross-DB lookups. See [DATABASE_ARCHITECTURE.md](../data/DATABASE_ARCHITECTURE.md).

---

## Contacts (Delivery Endpoints)

Contacts map a contact identifier to an entity id at pipeline speed.

This is the minimal form required by `RUNTIME_ROUTING.md`, adapted to the unified taxonomy.

```sql
CREATE TABLE IF NOT EXISTS contacts (
  platform       TEXT NOT NULL,             -- discord/slack/imessage/telegram/gmail/control-plane/webchat/...

  -- Optional scoping for platforms where contact_id is not globally unique (Slack).
  -- Use '' when not applicable.
  space_id       TEXT NOT NULL DEFAULT '',

  contact_id     TEXT NOT NULL,             -- platform-native contact identity
  entity_id      TEXT NOT NULL,             -- entity id (canonical or merged leaf; resolve via identity.db merge chain)

  first_seen     INTEGER NOT NULL,          -- unix ms
  last_seen      INTEGER NOT NULL,          -- unix ms
  message_count  INTEGER NOT NULL DEFAULT 0,

  contact_name   TEXT,                      -- best-effort display name (untrusted)
  avatar_url     TEXT,                      -- best-effort (untrusted)

  label          TEXT,                      -- 'personal', 'work', 'shared', 'org' (like SCIM's multi-valued type)
  owner_id       TEXT REFERENCES entities(id), -- org/group entity that owns this contact point, if any

  PRIMARY KEY (platform, space_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_entity_id ON contacts(entity_id);
CREATE INDEX IF NOT EXISTS idx_contacts_last_seen ON contacts(last_seen DESC);
```

Notes:

- For Discord: `space_id` SHOULD be '' for contacts if `contact_id` is globally unique and we want a single contact per user.
  - Per-space nicknames should be tracked in `container_participants.last_sender_name`.
- For Slack: `space_id` SHOULD be the workspace id because `contact_id` is only meaningful within a workspace.
- `space_id` is `NOT NULL` with a default of `''` because SQLite `UNIQUE`/`PRIMARY KEY` constraints treat `NULL` values as distinct.
  - Using `''` ensures `(platform, space_id, contact_id)` is truly unique even when a platform has no `space_id`.
- **Universal identifier contacts:** Contacts with `platform="phone"` or `platform="email"` are pseudo-platform entries that represent cross-platform reachable identifiers (e.g. a phone number usable via iMessage, WhatsApp, and Signal). These are not tied to a specific adapter but serve as canonical contact points for identity resolution. See `UNIFIED_ENTITY_STORE.md` for the full contact model.
- `label` classifies the contact point (like SCIM's `type` on multi-valued attributes). A phone number might be `'personal'` or `'work'` or `'shared'`.
- `owner_id` tracks organizational ownership. A shared phone line or team email can point to the org entity that owns it, even though `entity_id` points to the person currently using it.

---

## Spaces (Servers/Workspaces)

Spaces are the "server/workspace" layer. Not all platforms have spaces.

```sql
CREATE TABLE IF NOT EXISTS spaces (
  platform           TEXT NOT NULL,
  account_id         TEXT NOT NULL,
  space_id           TEXT NOT NULL,

  first_seen         INTEGER NOT NULL,
  last_seen          INTEGER NOT NULL,

  current_name       TEXT,
  current_name_seen  INTEGER,

  metadata_json      TEXT,                  -- JSON object string (platform-specific)

  PRIMARY KEY (platform, account_id, space_id)
);

CREATE INDEX IF NOT EXISTS idx_spaces_last_seen ON spaces(last_seen DESC);
```

> **Note (DATABASE_ARCHITECTURE.md):** The `delivery_` prefix is dropped from all table names. The database name (`identity.db`) provides sufficient context.

### Name History (Unified `names` Table)

All name history for spaces, containers, and threads is stored in a single unified `names` table:

```sql
CREATE TABLE IF NOT EXISTS names (
  kind         TEXT NOT NULL,  -- 'space' | 'container' | 'thread'
  platform     TEXT NOT NULL,
  account_id   TEXT NOT NULL,
  target_id    TEXT NOT NULL,  -- space_id, container_id, or thread_id depending on kind
  parent_id    TEXT NOT NULL DEFAULT '',  -- container_id for threads, '' otherwise
  name         TEXT NOT NULL,
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  PRIMARY KEY (kind, platform, account_id, target_id, parent_id, name)
);

CREATE INDEX IF NOT EXISTS idx_names_last_seen ON names(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_names_target ON names(kind, platform, account_id, target_id);
```

> **Note (DATABASE_ARCHITECTURE.md):** The three separate `delivery_space_names`, `delivery_container_names`, and `delivery_thread_names` tables are consolidated into this single `names` table. The `kind` column discriminates between space, container, and thread names.

Write rule:

- On every inbound event that includes `space_name`, upsert `(kind='space', platform, account_id, target_id=space_id, name=space_name)` and update `last_seen`.
- If the name differs from `spaces.current_name`, set `current_name` and `current_name_seen` and allow the history table to retain both.

---

## Containers (Direct / Group)

Containers are the "place messages happen".

```sql
CREATE TABLE IF NOT EXISTS containers (
  platform              TEXT NOT NULL,
  account_id            TEXT NOT NULL,

  container_id          TEXT NOT NULL,
  container_kind        TEXT NOT NULL,      -- direct | group

  -- Use '' when not applicable.
  space_id              TEXT NOT NULL DEFAULT '',

  first_seen            INTEGER NOT NULL,
  last_seen             INTEGER NOT NULL,

  current_name          TEXT,
  current_name_seen     INTEGER,

  metadata_json         TEXT,

  PRIMARY KEY (platform, account_id, container_id)
);

CREATE INDEX IF NOT EXISTS idx_containers_space ON containers(platform, account_id, space_id);
CREATE INDEX IF NOT EXISTS idx_containers_last_seen ON containers(last_seen DESC);
```

### Container Name History

Container names are stored in the unified `names` table (see above) with `kind = 'container'` and `target_id = container_id`.

Write rule:

- On inbound events with `container_name`, upsert the matching row in `names` with `kind = 'container'`.

---

## Threads / Topics

Threads are optional sub-containers within a container.

```sql
CREATE TABLE IF NOT EXISTS threads (
  platform              TEXT NOT NULL,
  account_id            TEXT NOT NULL,

  container_id          TEXT NOT NULL,
  thread_id             TEXT NOT NULL,

  first_seen            INTEGER NOT NULL,
  last_seen             INTEGER NOT NULL,

  current_name          TEXT,
  current_name_seen     INTEGER,

  metadata_json         TEXT,

  PRIMARY KEY (platform, account_id, container_id, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_threads_container ON threads(platform, account_id, container_id);
CREATE INDEX IF NOT EXISTS idx_threads_last_seen ON threads(last_seen DESC);
```

### Thread Name History

Thread names are stored in the unified `names` table (see above) with `kind = 'thread'`, `target_id = thread_id`, and `parent_id = container_id`.

---

## Observed Participants (Membership Approximation)

This table records "we observed this entity participating in this container/thread" based on inbound events.

It is not a perfect membership list, but it provides:

- "recent participants" for UI
- enough data to support basic IAM scoping ("this person in this container")
- a foundation for later active sync (Slack channel member list, Discord member list, etc)

```sql
CREATE TABLE IF NOT EXISTS container_participants (
  platform          TEXT NOT NULL,
  account_id        TEXT NOT NULL,

  container_id      TEXT NOT NULL,

  -- '' means container-level participation; otherwise thread-level.
  thread_id         TEXT NOT NULL DEFAULT '',

  entity_id         TEXT NOT NULL,

  first_seen        INTEGER NOT NULL,
  last_seen         INTEGER NOT NULL,

  message_count     INTEGER NOT NULL DEFAULT 0,

  -- Best-effort, last observed per container/thread. Useful for Discord nicknames and Slack display names.
  last_sender_name  TEXT,
  last_avatar_url   TEXT,

  PRIMARY KEY (platform, account_id, container_id, thread_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_container_participants_entity ON container_participants(entity_id);
CREATE INDEX IF NOT EXISTS idx_container_participants_container ON container_participants(platform, account_id, container_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_container_participants_last_seen ON container_participants(last_seen DESC);
```

Write rules:

- On every inbound message:
  - resolve `entity_id` via contacts (or token-derived principal for internal ingress)
  - upsert the `(platform, account_id, container_id, thread_id?, entity_id)` row and update `last_seen`, increment `message_count`
  - update `last_sender_name` / `last_avatar_url` if present

---

## Optional: Membership Events (Precise Join/Leave When Available)

If an adapter can emit explicit join/leave events (Discord membership events, Slack channel join/leave), store them here.

```sql
CREATE TABLE IF NOT EXISTS membership_events (
  id             TEXT PRIMARY KEY,          -- ULID/UUID

  platform       TEXT NOT NULL,
  account_id     TEXT NOT NULL,
  space_id       TEXT NOT NULL DEFAULT '',
  container_id   TEXT NOT NULL,
  thread_id      TEXT NOT NULL DEFAULT '',

  entity_id      TEXT NOT NULL,

  action         TEXT NOT NULL,             -- join | leave | invite | kick | ban | unban | ...
  occurred_at    INTEGER NOT NULL,

  source_event_id TEXT,                     -- optional linkage to events ledger
  metadata_json   TEXT
);

CREATE INDEX IF NOT EXISTS idx_membership_events_lookup ON membership_events(platform, account_id, container_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_membership_events_entity ON membership_events(entity_id, occurred_at);
```

This table enables "true membership history" when the platform provides it.

---

## Query Patterns

### 1) List recent containers for an adapter account

```sql
SELECT platform, account_id, container_kind, space_id, container_id, current_name, last_seen
FROM containers
WHERE platform = ? AND account_id = ?
ORDER BY last_seen DESC
LIMIT 50;
```

### 2) List threads for a container

```sql
SELECT thread_id, current_name, last_seen
FROM threads
WHERE platform = ? AND account_id = ? AND container_id = ?
ORDER BY last_seen DESC;
```

### 3) List observed participants for a container

```sql
SELECT entity_id, last_sender_name, message_count, first_seen, last_seen
FROM container_participants
WHERE platform = ? AND account_id = ? AND container_id = ? AND thread_id = ''
ORDER BY last_seen DESC;
```

### 4) Name history for a container

```sql
SELECT name, first_seen, last_seen
FROM names
WHERE kind = 'container' AND platform = ? AND account_id = ? AND target_id = ?
ORDER BY first_seen ASC;
```

---

## Open Questions

1. Should `contacts` be keyed by `(platform, contact_id)` (Discord-style global ids) or `(platform, space_id, contact_id)` (workspace/server scoped)?
   - This spec uses `(platform, space_id, contact_id)` with `space_id=''` as the general solution.
2. Should container primary keys include `space_id` as well, or is `(platform, account_id, container_id)` sufficient?
   - This spec uses `(platform, account_id, container_id)` to keep directory ownership per adapter account.
3. Should we store canonical entity ids (post-merge) in these tables, or store observed ids and resolve via identity.db entity chain at query time?
