# API Design: Batch 2 — Identity, Contacts, Auth, Credentials, ACL, Groups

**Status:** COMPLETE — all decisions locked
**Last Updated:** 2026-03-03

---

## Domain: Entities

**Database:** `identity.db` — 4 tables (entities, entity_tags, merge_candidates, entity_persona)

### Decisions

**Full CRUD operations.** Entities are the identity core — every person, agent, service, device. The pipeline should use the same entity operations that external callers use. No parallel internal-only paths.

**Union-find merge is a first-class operation.** `merged_into` implements union-find for dedup. Merges cascade to sessions (continuity transfers), memory (element re-linking), contacts (re-association).

**entity_tags uses [immutable row pattern](./IMMUTABLE_ROW_PATTERN.md).** `created_at` + `deleted_at`, no UPDATEs.

**entity_persona uses [immutable row pattern](./IMMUTABLE_ROW_PATTERN.md).** Persona binding history preserved.

**Drop first_seen/last_seen.** Trivial to query from events. Applies to all tables system-wide.

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `entities.list` | read | List entities (filter by type, tags, is_user, merged status) |
| `entities.get` | read | Get entity by ID (resolves through merge chain to canonical) |
| `entities.create` | write | Create a new entity |
| `entities.update` | write | Update entity name, type, metadata |
| `entities.resolve` | read | Resolve canonical entity ID through merge chain |
| `entities.tags.list` | read | List active tags for an entity |
| `entities.tags.add` | write | Add tag (immutable row insert) |
| `entities.tags.remove` | write | Remove tag (soft-close via deleted_at) |
| `entities.merge` | write | Merge two entities (sets merged_into, cascades) |
| `entities.merge.propose` | write | Propose a merge candidate with confidence score and evidence |
| `entities.merge.candidates` | read | List pending merge candidates with confidence |
| `entities.merge.resolve` | write | Approve or reject a merge candidate |
| `entities.persona.list` | read | List persona bindings for an entity |
| `entities.persona.set` | write | Set persona binding (immutable row insert) |

---

## Domain: Contacts

**Database:** `identity.db` — 3 tables (consolidated from 8)

### Decisions

**Massive consolidation: 8 tables → 3.** Eliminated: contact_name_observations, spaces, containers, threads, names, membership_events. Membership events are already in events.db. Name history captured via immutable row pattern.

**`contacts` uses [immutable row pattern](./IMMUTABLE_ROW_PATTERN.md).** Identity columns: `(platform, space_id, contact_id)`. When a name changes, soft-close old row, insert new. Full name history in one table.

**`channels` is the new unified platform topology table.** Replaces spaces, containers, threads, and names. One row per unique `(platform, account_id, container_id, thread_id)`. Space info denormalized. Uses immutable row pattern for name changes.

**`channel_participants` renamed from container_participants.** Who's in which channel, message counts, status.

**A space only exists if we've observed a container in it.** No standalone space records. We learn about spaces through activity.

### Target Schema

**contacts:**

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
    deleted_at      INTEGER           -- immutable row pattern
);
-- Current state: WHERE deleted_at IS NULL
-- History: walk by (platform, space_id, contact_id) ordered by created_at DESC
```

**channels:**

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
    metadata_json   TEXT
);
```

**channel_participants:**

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
```

### Operations

**contacts:**

| Operation | Verb | Description |
|-----------|------|-------------|
| `contacts.list` | read | List contacts (filter by entity_id, platform, origin) |
| `contacts.get` | read | Get a single contact (current state) |
| `contacts.create` | write | Create a contact binding |
| `contacts.update` | write | Update name/avatar (immutable row: soft-close + insert) |
| `contacts.search` | read | Search contacts by name, platform, entity |
| `contacts.history` | read | Get name history for a contact identity |
| `contacts.import` | write | Bulk import contacts |

**channels:**

| Operation | Verb | Description |
|-----------|------|-------------|
| `channels.list` | read | List channels (filter by platform, space, container_kind) |
| `channels.get` | read | Get a single channel |
| `channels.search` | read | Search channels (filter by platform, space, container, thread, participant) |
| `channels.history` | read | Get naming history for a channel |
| `channels.participants.list` | read | List participants in a channel |
| `channels.participants.get` | read | Get participant details |

---

## Domain: Auth

**Database:** `identity.db` — 2 tables (auth_tokens, auth_passwords)

### Decisions

**Unified `auth.tokens.*` domain.** All token management regardless of audience. The `audience` field exists on each token but the API surface is unified.

**auth_passwords stays separate from auth_tokens.** Different schemas, different lifecycles. Passwords are authentication factors (one per entity, hash-verified). Tokens are bearer credentials (many per entity, lookup-resolved, have expiry/revocation/scopes).

### Decisions (continued)

**One unified server. Audience removed.** The two-server split (control-plane:18789, ingress:18790) collapses into a single HTTP server. The `audience` field on tokens is removed entirely. IAM policies + roles/scopes determine what a token can do — not which server it was presented to. Full workplan: [AUDIENCE_REMOVAL_CUTOVER.md](./workplans/AUDIENCE_REMOVAL_CUTOVER.md).

**Loopback bypass gates on role, not audience.** Loopback bypass allowed for `role: "operator"` only.

**Hosted mode gates on auth method, not audience.** In hosted mode, only trusted tokens (frontdoor JWTs) work for operator-level operations. DB tokens work for non-operator roles.

**Customer identity gates on role.** When `role === "customer"`, identity hints are ignored (anti-spoofing). No audience check needed.

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `auth.tokens.list` | read | List tokens (filter by entity, role, status) |
| `auth.tokens.create` | write | Create token (specify role, scopes, expiry) |
| `auth.tokens.revoke` | write | Revoke a token (soft revocation via revoked_at) |
| `auth.tokens.rotate` | write | Atomic rotate: create new + revoke old |
| `auth.passwords.set` | write | Set/change password for an entity |
| `auth.login` | write | Password login → returns token |

---

## Domain: Credentials (Outbound Secrets)

**Current storage:** File-based `~/nexus/state/credentials/index.json`
**Target:** SQLite table in identity.db (or runtime.db)

### Decisions

**Credentials move from JSON file to database.** Replaces two legacy systems (CLI flat index + adapter hierarchical file store) with one DB-backed system. Full spec in [CREDENTIAL_AND_ADAPTER_CONNECTION_SYSTEM.md](./CREDENTIAL_AND_ADAPTER_CONNECTION_SYSTEM.md).

**Credentials are outbound secrets — distinct from auth tokens.** Auth tokens = how callers prove identity TO Nex. Credentials = secrets Nex holds for external services.

**`contact_id` instead of `account`.** A credential links to a contact (optional), which links to an entity. No separate "account" field — the contact IS the account identity. An account on a service = a contact + a credential.

**ACL-gated, no ownership field.** Policies gate credential access via `permissions.credentials` with `service/contact_id` glob patterns. The entity who owns the contact naturally gets access through the identity graph.

**Six storage types:** `nex` (encrypted at-rest), `inline` (plaintext, dev only), `env`, `keychain` (macOS), `1password`, `external` (covers gog and anything else).

**Nex encrypted store** as the production default. AES-256-GCM via `node:crypto`, master key in OS keychain. ~100-150 lines, no dependencies.

**Adapter connections become a DB table** with FK to credentials. Replaces `connections.json`. Adapter setup flows (OAuth, API key, custom) write to the credentials table.

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `credentials.list` | read | List credentials (filter by service, contact_id, kind, status) |
| `credentials.get` | read | Get credential metadata (NOT the secret value) |
| `credentials.create` | write | Store a new credential |
| `credentials.update` | write | Update credential metadata, storage pointer, or note |
| `credentials.delete` | write | Soft-revoke (sets status='revoked') |
| `credentials.resolve` | read | Resolve to actual secret value (privileged, ACL-gated) |
| `credentials.verify` | write | Validate against external service (updates status) |
| `credentials.scan` | write | Scan environment for known credential patterns |
| `credentials.link` | write | Link unlinked credential to a contact_id |

---

## Domain: ACL

**Database:** `identity.db` — tables: policies (NEW), grants, permission_requests, access_log

### Decisions

**Three clean objects: policies, grants, requests.** Full CRUD on all three.

**Policies move from YAML files to SQLite.** Bootstrap policies become seed data. Full CRUD enables runtime policy management.

**data_access level REMOVED.** Fully purged from codebase (2026-03-03). Zero functional references remain.

**Grant log folds into access_log.** Grant lifecycle events (created, used, revoked) become access_log rows with a `kind` field and `grant_id` link. One audit table for all security forensics.

**Drop ingress_integrity_log.** Can be properly designed later if needed.

**Groups integrate with ACL via direct policy matching (Option B).** Policies can match on `sender.groups[]`, not just tags. Groups are structured access control; tags remain for ad-hoc labeling.

### Decisions (continued)

**`match_json` stays as JSON blob.** The match structure is deeply nested (sender has 8 optional fields, conditions is an array of 12-field objects with OR/AND semantics). Column breakdown would require a join table for conditions and still need application code for tag subset matching, time range parsing, etc. Policy count is small (tens to low hundreds) and all are evaluated in memory on every request. SQL filtering adds no value.

**`permissions_json` stays as single blob.** Tools and credentials are always evaluated together in the same policy evaluation pass. The merge semantics are coupled (tools merge via UNION, credentials via INTERSECTION). `json_extract()` handles any admin queries.

**Session routing: pipeline computes, policy overrides.** `buildSessionKey()` produces the canonical session key from resolved principals. If a matched policy has an explicit `session.key` template, it overrides. Automations can override on top. Full spec: [SESSION_ROUTING_UNIFICATION.md](./SESSION_ROUTING_UNIFICATION.md). Workplan: [workplans/SESSION_ROUTING_UNIFICATION.md](./workplans/SESSION_ROUTING_UNIFICATION.md).

### Policy Schema (target)

```sql
CREATE TABLE policies (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    description     TEXT,
    match_json      TEXT NOT NULL,        -- JSON blob, application-level matching
    effect          TEXT NOT NULL,        -- 'allow', 'deny', 'ask'
    permissions_json TEXT,                -- JSON blob (tools + credentials together)
    session_json    TEXT,                 -- persona_ref, key template
    modifiers_json  TEXT,                 -- queue_mode, delay_response
    priority        INTEGER NOT NULL DEFAULT 0,
    is_builtin      INTEGER DEFAULT 0,
    enabled         INTEGER DEFAULT 1,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    deleted_at      INTEGER              -- immutable row pattern
);
```

### Operations

**policies:**

| Operation | Verb | Description |
|-----------|------|-------------|
| `acl.policies.list` | read | List policies (filter by enabled, effect, priority) |
| `acl.policies.get` | read | Get a single policy |
| `acl.policies.create` | write | Create a policy |
| `acl.policies.update` | write | Update a policy |
| `acl.policies.delete` | write | Soft-delete a policy |
| `acl.policies.enable` | write | Enable a disabled policy |
| `acl.policies.disable` | write | Disable a policy |

**grants:**

| Operation | Verb | Description |
|-----------|------|-------------|
| `acl.grants.list` | read | List active grants |
| `acl.grants.get` | read | Get a single grant |
| `acl.grants.create` | write | Create a grant directly |
| `acl.grants.revoke` | write | Revoke a grant |

**requests:**

| Operation | Verb | Description |
|-----------|------|-------------|
| `acl.requests.list` | read | List permission requests (filter by status) |
| `acl.requests.get` | read | Get a single request |
| `acl.requests.create` | write | Create request + blocking poll for resolution (120s timeout) |
| `acl.requests.approve` | write | Approve request (modes: once, day, forever → auto-creates grant) |
| `acl.requests.deny` | write | Deny a request |

**audit:**

| Operation | Verb | Description |
|-----------|------|-------------|
| `acl.audit.list` | read | Query access_log (filter by effect, sender, policy, time) |
| `acl.audit.get` | read | Get single audit entry |
| `acl.audit.stats` | read | Aggregate stats by sender, channel, or policy |

**special:**

| Operation | Verb | Description |
|-----------|------|-------------|
| `acl.evaluate` | read | Dry-run policy evaluation (test a sender+conditions → see decision) |

---

## Domain: Groups

**Database:** `identity.db` — 2 tables (groups, group_members)

### Decisions

**Full CRUD.** Groups will be a key part of ACL — add entities to groups, assign policies to groups via `match.sender.groups`.

**Hierarchical.** `parent_group_id` enables nested groups (org → team → sub-team).

**Option B integration:** Policies match on groups directly (`match.sender.groups[]`), not through tag indirection. Tags remain for ad-hoc labeling.

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `groups.list` | read | List groups (filter by parent) |
| `groups.get` | read | Get a group with member count |
| `groups.create` | write | Create a group |
| `groups.update` | write | Update group name, description, parent |
| `groups.delete` | write | Delete a group |
| `groups.members.list` | read | List members of a group |
| `groups.members.add` | write | Add entity to group (with role) |
| `groups.members.remove` | write | Remove entity from group |

---

## Related Spec Documents

| Document | Scope |
|----------|-------|
| [IMMUTABLE_ROW_PATTERN.md](./IMMUTABLE_ROW_PATTERN.md) | Pattern used by entity_tags, entity_persona, contacts, channels |
| [CREDENTIAL_AND_ADAPTER_CONNECTION_SYSTEM.md](./CREDENTIAL_AND_ADAPTER_CONNECTION_SYSTEM.md) | Unified credential store, adapter connections, nex encrypted store |
| [SESSION_ROUTING_UNIFICATION.md](./SESSION_ROUTING_UNIFICATION.md) | Unified session key derivation system |

## Related Workplans

| Workplan | Scope |
|----------|-------|
| [AUDIENCE_REMOVAL_CUTOVER.md](./workplans/AUDIENCE_REMOVAL_CUTOVER.md) | Remove token audience, collapse to one server (131 occurrences, 28 files) |
| [SESSION_ROUTING_UNIFICATION.md](./workplans/SESSION_ROUTING_UNIFICATION.md) | Unify 3 session key systems (~25 files) |
