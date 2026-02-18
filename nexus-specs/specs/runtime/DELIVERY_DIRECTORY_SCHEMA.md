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
- Directory lookups should be local, fast, and not require cortex joins for common UI/IAM operations.

---

## Core Principles

1. **Ids are authoritative.** `*_name` fields are best-effort display strings.
2. **History is tracked as intervals.** Name history tables store `first_seen/last_seen` for each distinct name.
3. **Membership is observed-first.** Start with "observed participant" tracking from messages; add active sync later if needed.
4. **No hard FKs to cortex.** `entity_id` references cortex entities by convention (cross-db).

---

## Contacts (Delivery Endpoints)

Contacts map a sender identifier to an entity id at pipeline speed.

This is the minimal form required by `RUNTIME_ROUTING.md`, adapted to the unified taxonomy.

```sql
CREATE TABLE IF NOT EXISTS contacts (
  platform       TEXT NOT NULL,             -- discord/slack/imessage/telegram/gmail/control-plane/webchat/...

  -- Optional scoping for platforms where sender_id is not globally unique (Slack).
  -- Use '' when not applicable.
  space_id       TEXT NOT NULL DEFAULT '',

  sender_id      TEXT NOT NULL,             -- platform-native sender identity
  entity_id      TEXT NOT NULL,             -- cortex entity id (canonical or merged leaf; resolve via cortex chain)

  first_seen     INTEGER NOT NULL,          -- unix ms
  last_seen      INTEGER NOT NULL,          -- unix ms
  message_count  INTEGER NOT NULL DEFAULT 0,

  sender_name    TEXT,                      -- best-effort display name (untrusted)
  avatar_url     TEXT,                      -- best-effort (untrusted)

  PRIMARY KEY (platform, space_id, sender_id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_entity_id ON contacts(entity_id);
CREATE INDEX IF NOT EXISTS idx_contacts_last_seen ON contacts(last_seen DESC);
```

Notes:

- For Discord: `space_id` SHOULD be '' for contacts if `sender_id` is globally unique and we want a single contact per user.
  - Per-space nicknames should be tracked in `delivery_container_participants.last_sender_name`.
- For Slack: `space_id` SHOULD be the workspace id because `sender_id` is only meaningful within a workspace.
- `space_id` is `NOT NULL` with a default of `''` because SQLite `UNIQUE`/`PRIMARY KEY` constraints treat `NULL` values as distinct.
  - Using `''` ensures `(platform, space_id, sender_id)` is truly unique even when a platform has no `space_id`.

---

## Spaces (Servers/Workspaces)

Spaces are the "server/workspace" layer. Not all platforms have spaces.

```sql
CREATE TABLE IF NOT EXISTS delivery_spaces (
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

CREATE INDEX IF NOT EXISTS idx_delivery_spaces_last_seen ON delivery_spaces(last_seen DESC);
```

### Space Name History

```sql
CREATE TABLE IF NOT EXISTS delivery_space_names (
  platform     TEXT NOT NULL,
  account_id   TEXT NOT NULL,
  space_id     TEXT NOT NULL,
  name         TEXT NOT NULL,

  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,

  PRIMARY KEY (platform, account_id, space_id, name)
);

CREATE INDEX IF NOT EXISTS idx_delivery_space_names_last_seen ON delivery_space_names(last_seen DESC);
```

Write rule:

- On every inbound event that includes `space_name`, upsert `(platform, account_id, space_id, space_name)` and update `last_seen`.
- If the name differs from `delivery_spaces.current_name`, set `current_name` and `current_name_seen` and allow the history table to retain both.

---

## Containers (DMs / Groups / Channels)

Containers are the "place messages happen".

```sql
CREATE TABLE IF NOT EXISTS delivery_containers (
  platform              TEXT NOT NULL,
  account_id            TEXT NOT NULL,

  container_id          TEXT NOT NULL,
  container_kind        TEXT NOT NULL,      -- dm | group | channel | direct

  -- Use '' when not applicable.
  space_id              TEXT NOT NULL DEFAULT '',

  first_seen            INTEGER NOT NULL,
  last_seen             INTEGER NOT NULL,

  current_name          TEXT,
  current_name_seen     INTEGER,

  metadata_json         TEXT,

  PRIMARY KEY (platform, account_id, container_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_containers_space ON delivery_containers(platform, account_id, space_id);
CREATE INDEX IF NOT EXISTS idx_delivery_containers_last_seen ON delivery_containers(last_seen DESC);
```

### Container Name History

```sql
CREATE TABLE IF NOT EXISTS delivery_container_names (
  platform     TEXT NOT NULL,
  account_id   TEXT NOT NULL,
  container_id TEXT NOT NULL,
  name         TEXT NOT NULL,
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  PRIMARY KEY (platform, account_id, container_id, name)
);

CREATE INDEX IF NOT EXISTS idx_delivery_container_names_last_seen ON delivery_container_names(last_seen DESC);
```

Write rule:

- On inbound events with `container_name`, upsert the matching row in `delivery_container_names`.

---

## Threads / Topics

Threads are optional sub-containers within a container.

```sql
CREATE TABLE IF NOT EXISTS delivery_threads (
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

CREATE INDEX IF NOT EXISTS idx_delivery_threads_container ON delivery_threads(platform, account_id, container_id);
CREATE INDEX IF NOT EXISTS idx_delivery_threads_last_seen ON delivery_threads(last_seen DESC);
```

### Thread Name History

```sql
CREATE TABLE IF NOT EXISTS delivery_thread_names (
  platform     TEXT NOT NULL,
  account_id   TEXT NOT NULL,
  container_id TEXT NOT NULL,
  thread_id    TEXT NOT NULL,
  name         TEXT NOT NULL,
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  PRIMARY KEY (platform, account_id, container_id, thread_id, name)
);

CREATE INDEX IF NOT EXISTS idx_delivery_thread_names_last_seen ON delivery_thread_names(last_seen DESC);
```

---

## Observed Participants (Membership Approximation)

This table records "we observed this entity participating in this container/thread" based on inbound events.

It is not a perfect membership list, but it provides:

- "recent participants" for UI
- enough data to support basic IAM scoping ("this person in this container")
- a foundation for later active sync (Slack channel member list, Discord member list, etc)

```sql
CREATE TABLE IF NOT EXISTS delivery_container_participants (
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

CREATE INDEX IF NOT EXISTS idx_delivery_container_participants_entity ON delivery_container_participants(entity_id);
CREATE INDEX IF NOT EXISTS idx_delivery_container_participants_container ON delivery_container_participants(platform, account_id, container_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_delivery_container_participants_last_seen ON delivery_container_participants(last_seen DESC);
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
CREATE TABLE IF NOT EXISTS delivery_membership_events (
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

CREATE INDEX IF NOT EXISTS idx_delivery_membership_events_lookup ON delivery_membership_events(platform, account_id, container_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_delivery_membership_events_entity ON delivery_membership_events(entity_id, occurred_at);
```

This table enables "true membership history" when the platform provides it.

---

## Query Patterns

### 1) List recent containers for an adapter account

```sql
SELECT platform, account_id, container_kind, space_id, container_id, current_name, last_seen
FROM delivery_containers
WHERE platform = ? AND account_id = ?
ORDER BY last_seen DESC
LIMIT 50;
```

### 2) List threads for a container

```sql
SELECT thread_id, current_name, last_seen
FROM delivery_threads
WHERE platform = ? AND account_id = ? AND container_id = ?
ORDER BY last_seen DESC;
```

### 3) List observed participants for a container

```sql
SELECT entity_id, last_sender_name, message_count, first_seen, last_seen
FROM delivery_container_participants
WHERE platform = ? AND account_id = ? AND container_id = ? AND thread_id = ''
ORDER BY last_seen DESC;
```

### 4) Name history for a container

```sql
SELECT name, first_seen, last_seen
FROM delivery_container_names
WHERE platform = ? AND account_id = ? AND container_id = ?
ORDER BY first_seen ASC;
```

---

## Open Questions

1. Should `contacts` be keyed by `(platform, sender_id)` (Discord-style global ids) or `(platform, space_id, sender_id)` (workspace/server scoped)?
   - This spec uses `(platform, space_id, sender_id)` with `space_id=''` as the general solution.
2. Should container primary keys include `space_id` as well, or is `(platform, account_id, container_id)` sufficient?
   - This spec uses `(platform, account_id, container_id)` to keep directory ownership per adapter account.
3. Should we store canonical entity ids (post-merge) in these tables, or store observed ids and resolve via cortex at query time?
