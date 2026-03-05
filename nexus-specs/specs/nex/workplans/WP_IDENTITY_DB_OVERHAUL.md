# Workplan: Identity DB Overhaul
**Status:** READY FOR EXECUTION
**Created:** 2026-03-04
**Spec References:**
- [API_DESIGN_BATCH_2.md](../API_DESIGN_BATCH_2.md) (entities, contacts, groups, auth, credentials, ACL)
- [IMMUTABLE_ROW_PATTERN.md](../IMMUTABLE_ROW_PATTERN.md)
- [RESOLVED_DECISIONS.md](../RESOLVED_DECISIONS.md)
**Dependencies:** None (foundational workplan)

---

## Goal

Transform identity.db from its current 8-table contact system + static YAML policies into a clean, fully database-backed identity core with 3-table contacts, dynamic policies, groups, and full CRUD operations. Database models ARE the objects — pipeline and external callers use the same APIs.

---

## Current State

### Tables
- **8 contact tables:** contacts, contact_name_observations, spaces, containers, threads, names, membership_events, container_participants
- **entities table:** Has first_seen/last_seen, missing is_agent
- **entity_tags/entity_persona:** Exist but may not fully enforce immutable row pattern
- **auth_tokens:** Has audience field
- **policies:** Do NOT exist in DB — stored as YAML files, loaded via policy-loader.ts

### Code
- `src/db/identity.ts` — Schema definitions, contact insertion (8 tables)
- `src/iam/identity.ts` — Entity resolution, contact lookups
- `src/iam/identity-entities.ts` — Entity management (limited CRUD)
- `src/iam/policies.ts` — Policy matching engine (in-memory)
- `src/iam/policy-loader.ts` — Loads from YAML or bootstrap

### Operations
- No entity CRUD operations exposed
- No groups tables or operations
- No policy CRUD operations (policies are static YAML)
- No ACL audit operations

---

## Target State

### Database Schema

**contacts** (replaces 8 tables):
```sql
CREATE TABLE contacts (
    id              TEXT PRIMARY KEY,
    entity_id       TEXT NOT NULL REFERENCES entities(id),
    platform        TEXT NOT NULL,
    space_id        TEXT NOT NULL DEFAULT '',
    contact_id      TEXT NOT NULL,
    contact_name    TEXT,
    avatar_url      TEXT,
    origin          TEXT NOT NULL,     -- 'adapter', 'writer', 'manual'
    created_at      INTEGER NOT NULL,
    deleted_at      INTEGER,          -- immutable row pattern
    UNIQUE(platform, space_id, contact_id, created_at)
);
CREATE INDEX idx_contacts_identity ON contacts(platform, space_id, contact_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_entity ON contacts(entity_id) WHERE deleted_at IS NULL;
```

**channels** (NEW, replaces spaces/containers/threads/names):
```sql
CREATE TABLE channels (
    id              TEXT PRIMARY KEY,
    platform        TEXT NOT NULL,
    account_id      TEXT NOT NULL,
    space_id        TEXT,
    space_name      TEXT,
    container_id    TEXT NOT NULL,
    container_kind  TEXT NOT NULL,     -- 'direct', 'group'
    container_name  TEXT,
    thread_id       TEXT,
    thread_name     TEXT,
    created_at      INTEGER NOT NULL,
    deleted_at      INTEGER,          -- immutable row pattern (name changes)
    metadata_json   TEXT,
    UNIQUE(platform, account_id, container_id, thread_id, created_at)
);
CREATE INDEX idx_channels_identity ON channels(platform, account_id, container_id, thread_id) WHERE deleted_at IS NULL;
```

**channel_participants** (renamed from container_participants):
```sql
CREATE TABLE channel_participants (
    id              TEXT PRIMARY KEY,
    channel_id      TEXT NOT NULL REFERENCES channels(id),
    contact_id      TEXT NOT NULL REFERENCES contacts(id),
    entity_id       TEXT,             -- resolved entity (may be NULL initially)
    role            TEXT,
    message_count   INTEGER DEFAULT 0,
    status          TEXT DEFAULT 'active',  -- 'active', 'left'
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_channel_participants_channel ON channel_participants(channel_id);
CREATE INDEX idx_channel_participants_contact ON channel_participants(contact_id);
```

**entities** (modified):
```sql
-- ADD COLUMN:
ALTER TABLE entities ADD COLUMN is_agent INTEGER DEFAULT 0;

-- DROP COLUMNS (via migration):
-- Remove first_seen, last_seen (trivially queryable from events)
```

**groups** (NEW):
```sql
CREATE TABLE groups (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    description     TEXT,
    parent_group_id TEXT REFERENCES groups(id),
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    deleted_at      INTEGER
);
CREATE INDEX idx_groups_parent ON groups(parent_group_id) WHERE deleted_at IS NULL;
```

**group_members** (NEW):
```sql
CREATE TABLE group_members (
    id              TEXT PRIMARY KEY,
    group_id        TEXT NOT NULL REFERENCES groups(id),
    entity_id       TEXT NOT NULL REFERENCES entities(id),
    role            TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    UNIQUE(group_id, entity_id)
);
CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_entity ON group_members(entity_id);
```

**policies** (NEW):
```sql
CREATE TABLE policies (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    description     TEXT,
    match_json      TEXT NOT NULL,        -- JSON blob (sender, conditions)
    effect          TEXT NOT NULL,        -- 'allow', 'deny', 'ask'
    permissions_json TEXT,                -- JSON blob (tools + credentials)
    session_json    TEXT,                 -- persona_ref, key template
    modifiers_json  TEXT,                 -- queue_mode, delay_response
    priority        INTEGER NOT NULL DEFAULT 0,
    is_builtin      INTEGER DEFAULT 0,
    enabled         INTEGER DEFAULT 1,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    deleted_at      INTEGER
);
CREATE INDEX idx_policies_enabled ON policies(enabled, priority DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_policies_name ON policies(name) WHERE deleted_at IS NULL;
```

**Existing tables verified:**
- `entity_tags` — Already uses immutable row pattern (created_at, deleted_at)
- `entity_persona` — Already uses immutable row pattern (created_at, deleted_at)
- `merge_candidates` — No changes needed

---

## Changes Required

### Database Schema Changes

**File:** `src/db/identity.ts`

1. **Drop 7 contact-related tables:**
   - contact_name_observations
   - spaces
   - containers
   - threads
   - names
   - membership_events
   - container_participants (will be replaced by channel_participants)

2. **Add channels table** with schema above

3. **Add channel_participants table** with schema above

4. **Modify contacts table:**
   - Change schema to target state (simpler, immutable row pattern)
   - Add indexes for performance

5. **Add groups table** with schema above

6. **Add group_members table** with schema above

7. **Add policies table** with schema above

8. **Modify entities table:**
   - Add `is_agent INTEGER DEFAULT 0` column
   - Create migration to drop `first_seen` and `last_seen` columns

9. **Update ensureIdentitySchema()** to create all new tables and apply migrations

### New Code

**File:** `src/iam/entities-operations.ts` (NEW)
- Full entity CRUD operations (14 ops):
  - `entities.list` — List entities with filters
  - `entities.get` — Get entity by ID (resolves through merge chain)
  - `entities.create` — Create new entity
  - `entities.update` — Update entity name, type, metadata
  - `entities.resolve` — Resolve canonical entity ID through merge chain
  - `entities.tags.list` — List active tags for an entity
  - `entities.tags.add` — Add tag (immutable row insert)
  - `entities.tags.remove` — Remove tag (soft-close via deleted_at)
  - `entities.merge` — Merge two entities (sets merged_into, cascades)
  - `entities.merge.propose` — Propose merge candidate with confidence
  - `entities.merge.candidates` — List pending merge candidates
  - `entities.merge.resolve` — Approve/reject merge candidate
  - `entities.persona.list` — List persona bindings for entity
  - `entities.persona.set` — Set persona binding (immutable row insert)

**File:** `src/iam/contacts-operations.ts` (NEW)
- Contact operations (7 ops):
  - `contacts.list` — List contacts with filters
  - `contacts.get` — Get single contact (current state)
  - `contacts.create` — Create contact binding
  - `contacts.update` — Update name/avatar (immutable row: soft-close + insert)
  - `contacts.search` — Search contacts by name, platform, entity
  - `contacts.history` — Get name history for a contact identity
  - `contacts.import` — Bulk import contacts

**File:** `src/iam/channels-operations.ts` (NEW)
- Channel operations (6 ops):
  - `channels.list` — List channels with filters
  - `channels.get` — Get single channel
  - `channels.search` — Search channels
  - `channels.history` — Get naming history for a channel
  - `channels.participants.list` — List participants in a channel
  - `channels.participants.get` — Get participant details

**File:** `src/iam/groups-operations.ts` (NEW)
- Group operations (8 ops):
  - `groups.list` — List groups
  - `groups.get` — Get group with member count
  - `groups.create` — Create group
  - `groups.update` — Update group name, description, parent
  - `groups.delete` — Delete group
  - `groups.members.list` — List members of group
  - `groups.members.add` — Add entity to group
  - `groups.members.remove` — Remove entity from group

**File:** `src/iam/policies-operations.ts` (NEW)
- Policy CRUD operations (7 ops):
  - `acl.policies.list` — List policies (filter by enabled, effect, priority)
  - `acl.policies.get` — Get single policy
  - `acl.policies.create` — Create policy
  - `acl.policies.update` — Update policy
  - `acl.policies.delete` — Soft-delete policy
  - `acl.policies.enable` — Enable disabled policy
  - `acl.policies.disable` — Disable policy

**File:** `src/iam/acl-audit-operations.ts` (NEW)
- ACL audit operations (4 ops):
  - `acl.audit.list` — Query access_log (filter by effect, sender, policy, time)
  - `acl.audit.get` — Get single audit entry
  - `acl.audit.stats` — Aggregate stats by sender, channel, or policy
  - `acl.evaluate` — Dry-run policy evaluation (test sender+conditions)

**File:** `src/iam/policy-bootstrap.ts` (NEW)
- `seedBootstrapPolicies(db: DatabaseSync)` — Insert bootstrap policies as DB rows with `is_builtin: 1`
- `ensureBootstrapPolicies(db: DatabaseSync)` — Idempotent bootstrap on schema init

### Modified Files

**File:** `src/db/identity.ts`
- **Remove:** All 7 legacy contact table schemas
- **Add:** channels, channel_participants, groups, group_members, policies table schemas
- **Modify:** contacts table schema to target state
- **Modify:** entities table to add is_agent, drop first_seen/last_seen
- **Add:** Migration logic for schema changes
- **Update:** All contact-related insert/update functions to use new schema
- **Update:** `ensureIdentitySchema()` to create all new tables
- **Add:** Policy insert/update/query functions (CRUD operations)
- **Add:** Group insert/update/query functions (CRUD operations)
- **Add:** Channel insert/update/query functions

**File:** `src/iam/identity.ts`
- **Update:** `resolveExternalSenderContext()` to use new contacts schema
- **Update:** `resolveContactEntity()` to use new contacts schema
- **Update:** All contact lookup queries to use new 3-table schema
- **Remove:** References to dropped tables (spaces, containers, threads, names, etc.)
- **Update:** Channel topology queries to use channels table

**File:** `src/iam/identity-entities.ts`
- **Update:** `ensureIdentityEntity()` to support `is_agent` field
- **Add:** Call to `ensureBootstrapPolicies()` in `openIdentityDb()`

**File:** `src/iam/policies.ts`
- **Modify:** Policy matching to check `sender.groups[]` field (Option B integration)
- **Add:** `loadPoliciesFromDb(db: DatabaseSync)` — Load enabled policies from DB
- **Update:** `evaluateAccessPolicies()` to accept DB-loaded policies
- **Keep:** Existing matching logic (it's already policy-agnostic)

**File:** `src/iam/policy-loader.ts`
- **Update:** `loadAclPolicies()` to prefer DB policies over YAML
- **Priority:** DB policies → YAML file → bootstrap
- **Remove:** YAML loading once DB migration is complete (can be phased)

**File:** `src/nex/control-plane/server-runtime-state.ts`
- **Add:** Load policies from identity.db on startup
- **Update:** Pass DB-loaded policies to policy evaluation pipeline

### Deleted Files/Code

**Tables deleted from identity.db:**
- `contact_name_observations`
- `spaces`
- `containers`
- `threads`
- `names`
- `membership_events`
- `container_participants` (replaced by channel_participants)

**Functions removed from identity.ts:**
- Any functions that explicitly reference the 7 deleted tables
- Functions that insert into contact_name_observations
- Functions that query spaces/containers/threads tables

**Columns dropped from entities:**
- `first_seen`
- `last_seen`

### Operations to Register

**RPC namespace:** All operations need registration in the nex server method registry.

**Entities domain (14 ops):**
- `entities.list`, `entities.get`, `entities.create`, `entities.update`, `entities.resolve`
- `entities.tags.list`, `entities.tags.add`, `entities.tags.remove`
- `entities.merge`, `entities.merge.propose`, `entities.merge.candidates`, `entities.merge.resolve`
- `entities.persona.list`, `entities.persona.set`

**Contacts domain (7 ops):**
- `contacts.list`, `contacts.get`, `contacts.create`, `contacts.update`
- `contacts.search`, `contacts.history`, `contacts.import`

**Channels domain (6 ops):**
- `channels.list`, `channels.get`, `channels.search`, `channels.history`
- `channels.participants.list`, `channels.participants.get`

**Groups domain (8 ops):**
- `groups.list`, `groups.get`, `groups.create`, `groups.update`, `groups.delete`
- `groups.members.list`, `groups.members.add`, `groups.members.remove`

**ACL domain (11 ops):**
- `acl.policies.list`, `acl.policies.get`, `acl.policies.create`, `acl.policies.update`, `acl.policies.delete`, `acl.policies.enable`, `acl.policies.disable`
- `acl.audit.list`, `acl.audit.get`, `acl.audit.stats`
- `acl.evaluate`

**Total: 46 new operations**

---

## Execution Order

### Phase 1: Schema Migration (CRITICAL PATH)
1. **Backup current identity.db** — Safety first
2. **Add new tables** — channels, channel_participants, groups, group_members, policies
3. **Modify entities table** — Add is_agent, create migration for first_seen/last_seen drop
4. **Migrate data from 8 tables → 3 tables:**
   - contacts: Consolidate from contacts + contact_name_observations using immutable row pattern
   - channels: Extract from spaces + containers + threads + names
   - channel_participants: Rename and link to new channels table
5. **Drop old tables** — After verifying data migration
6. **Add bootstrap policies to DB** — Seed policies table with is_builtin=1

### Phase 2: Code Implementation (PARALLEL)
7. **Implement entity CRUD operations** — entities-operations.ts (14 ops)
8. **Implement contact operations** — contacts-operations.ts (7 ops)
9. **Implement channel operations** — channels-operations.ts (6 ops)
10. **Implement group operations** — groups-operations.ts (8 ops)
11. **Implement policy CRUD operations** — policies-operations.ts (7 ops)
12. **Implement ACL audit operations** — acl-audit-operations.ts (4 ops)

### Phase 3: Integration
13. **Update identity.ts** — Rewrite contact lookups to use new 3-table schema
14. **Update policies.ts** — Add groups matching, DB loading
15. **Update policy-loader.ts** — Prefer DB policies
16. **Update server startup** — Load policies from DB
17. **Register all new operations** — Add to nex server method registry

### Phase 4: Testing & Validation
18. **Unit tests** — All new operations
19. **Integration tests** — Policy evaluation with DB policies, group matching
20. **E2E tests** — Full pipeline with new schema
21. **Migration testing** — Verify data integrity after 8→3 table migration

### Phase 5: Cleanup
22. **Remove YAML policy loading** — Once DB policies are proven stable
23. **Remove legacy table references** — Grep for old table names and purge
24. **Update documentation** — Reflect new schema and operations

---

## Notes

**Immutable row pattern enforcement:** contacts and channels use created_at + deleted_at for full history. Current state = WHERE deleted_at IS NULL. Update operations soft-close old row and insert new row.

**Merge cascading:** When entities.merge is called, cascades must update:
- sessions table (transfer continuity)
- memory elements (re-link to canonical entity)
- contacts table (re-link to canonical entity)

**Groups integration:** Policies match on `sender.groups[]` directly (Option B). During policy evaluation, resolve entity's group memberships from group_members table and populate sender.groups array.

**Bootstrap policies:** The existing bootstrap policies from policies.ts become seed data in the policies table with `is_builtin: 1`. They can be disabled but not deleted. Custom policies have `is_builtin: 0`.

**Hard cutover:** No backwards compatibility. This is a breaking change to identity.db schema. All deployments must migrate.
