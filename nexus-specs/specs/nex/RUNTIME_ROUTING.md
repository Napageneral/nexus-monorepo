# Runtime Routing

**Status:** DESIGN SPEC (legacy routing baseline; operation model superseded in direction)
**Last Updated:** 2026-02-26
**Resolves:** LIVE_E2E_HARNESS.md Bundle B (Items 3, 4)
**Related:** `../agents/SESSION_LIFECYCLE.md`, `../../DATABASE_ARCHITECTURE.md`, `../../memory/MEMORY_SYSTEM.md`, `../delivery/ADAPTER_SYSTEM.md`

---

## Supersession Note

Runtime operation semantics are now governed by:

1. `UNIFIED_RUNTIME_OPERATION_MODEL.md`
2. `ADAPTER_INTERFACE_UNIFICATION.md`

Use this document for routing-specific details, but apply unified operation terminology:

1. `resolvePrincipals` instead of split sender/receiver stage naming
2. `event.ingest` as canonical ingress operation
3. `auth.tokens.ingress.*` naming for ingress token management
4. no dual adapter-role terminology
5. clock scheduling via `clock.schedule.*` (not `cron.*`/`wake`)

If this document conflicts with `UNIFIED_RUNTIME_OPERATION_MODEL.md`, the unified model wins.

---

## Overview

This document defines how messages flow from inbound delivery to session routing once a Nexus workspace is alive. It covers:

1. **Contacts** — the delivery-driven directory that maps `(platform, space_id, sender_id)` to entities
2. **Identity resolution** — how the pipeline resolves a sender at pipeline speed
3. **Session key generation** — how sessions are keyed to identities
4. **Entity merge propagation** — what happens to contacts and sessions when entities merge
5. **Adapters-only runtime** — removing legacy platform plugins in favor of the adapter system

Receiver model note:

- `DeliveryContext` is sender/container taxonomy only.
- Receiver resolution output is stored separately on `NexusRequest.receiver`.
- `NexusRequest.receiver` determines whether the pipeline executes agent turns (`type=agent`) or takes the non-agent path (`type=system/entity/unknown`).

---

## Design Principles

1. **Identity-driven sessions.** Sessions belong to people (entities), not platforms. Two platforms, same person, same session.
2. **Pipeline-speed resolution.** Identity resolution is synchronous, zero-LLM, sub-millisecond. The memory-writer does the smart work asynchronously.
3. **Every sender has an entity from message one.** No "unknown sender" state for session routing. First message creates both a contact and an entity. Session key is always entity-based.
4. **Contacts are infrastructure. Entities are knowledge.** Contacts answer "how to reach someone." Entities answer "who someone is." Different write paths, different concerns, linked by ID.
5. **Don't merge turn trees.** When identities merge, sessions alias. History stays intact. Memory bridges the knowledge gap.

---

## Contacts

### What Contacts Are

A contact is a delivery endpoint — a `(platform, space_id, sender_id)` tuple representing one way to reach or be reached by someone. Every inbound message creates or updates a contact automatically at pipeline time. No LLM involved.

Contacts are the pipeline-speed lookup index. Given a delivery context, the contacts table answers: "what entity is this sender?"

### Schema

Contacts live in `identity.db`:

```sql
CREATE TABLE contacts (
    platform        TEXT NOT NULL,              -- 'discord', 'slack', 'imessage', 'gmail', 'control-plane', 'webchat'
    space_id        TEXT NOT NULL DEFAULT '',   -- optional scoping (e.g., Slack workspace); '' when N/A
    sender_id       TEXT NOT NULL,              -- platform-specific sender ID
    entity_id       TEXT NOT NULL,              -- FK to entities.id (same DB)
    first_seen      INTEGER NOT NULL,           -- unix ms
    last_seen       INTEGER NOT NULL,           -- unix ms
    message_count   INTEGER NOT NULL DEFAULT 0,
    sender_name     TEXT,                       -- best-effort display name (untrusted)
    avatar_url      TEXT,                       -- best-effort (untrusted)
    PRIMARY KEY (platform, space_id, sender_id)
);

CREATE INDEX idx_contacts_entity_id ON contacts(entity_id);
CREATE INDEX idx_contacts_last_seen ON contacts(last_seen DESC);
```

### What identity.db Contains

With the new database architecture, `identity.db` is the unified identity, directory, and access control store:

1. **Contacts** — delivery-driven directory (as above)
2. **Directory** — spaces, containers, threads, participants (see `../delivery/adapters/DELIVERY_DIRECTORY_SCHEMA.md`)
3. **Entities & Knowledge Graph** — entities, entity_tags, entity_cooccurrences, merge_candidates (relocated per DATABASE_ARCHITECTURE.md). `contacts.entity_id` → `entities.id` within the same DB, enabling JOINs.
4. **Auth** — tokens (`auth_tokens`) and passwords (`auth_passwords`)
5. **Access Control** — grants, grant_log, access_log, permission_requests (relocated from nexus.db, `acl_` prefix dropped)

### Auto-Create Entity on First Contact

When a new `(platform, space_id, sender_id)` tuple is seen for the first time, the pipeline:

1. **Creates a corresponding entity** in `identity.db` with:
   - `name`: `{platform}:{sender_id}` (e.g., `discord:tyler#1234`)
     - If `space_id` is used for uniqueness (Slack), the name SHOULD include it: `{platform}:{space_id}:{sender_id}`
   - `type`: `'person'` (adapter-sourced entities default to person type)
   - `source`: `'adapter'`
   - `merged_into`: `NULL` (canonical root — this IS the identity until merged)
2. **Creates a contact row** in `identity.db` linking that delivery endpoint to the entity id

```typescript
function ensureContact(
  identityDb: DatabaseSync,
  delivery: DeliveryContext,
  timestamp: number,
): { entity_id: string; is_new: boolean } {
  const platform = delivery.platform;
  const spaceId = delivery.space_id ?? '';
  const senderId = delivery.sender_id;

  // Check existing
  const existing = identityDb
    .prepare('SELECT entity_id FROM contacts WHERE platform = ? AND space_id = ? AND sender_id = ?')
    .get(platform, spaceId, senderId) as { entity_id: string } | undefined;

  if (existing) {
    // Update last_seen, message_count
    identityDb.prepare(`
      UPDATE contacts SET last_seen = ?, message_count = message_count + 1,
        sender_name = COALESCE(?, sender_name),
        avatar_url = COALESCE(?, avatar_url)
      WHERE platform = ? AND space_id = ? AND sender_id = ?
    `).run(timestamp, delivery.sender_name ?? null, null, platform, spaceId, senderId);

    return { entity_id: existing.entity_id, is_new: false };
  }

  // New contact: create entity + contact row in identity.db (same DB).
  const entityId = generateULID();
  const entityName = spaceId ? `${platform}:${spaceId}:${senderId}` : `${platform}:${senderId}`;
  const entityType = 'person'; // adapter-sourced entities default to person; memory-writer may reclassify

  identityDb.prepare(`
    INSERT INTO entities (id, name, type, source, normalized, first_seen, last_seen, created_at, updated_at)
    VALUES (?, ?, ?, 'adapter', ?, ?, ?, ?, ?)
  `).run(entityId, entityName, entityType, entityName.toLowerCase(), timestamp, timestamp, timestamp, timestamp);

  identityDb.prepare(`
    INSERT INTO contacts (platform, space_id, sender_id, entity_id, first_seen, last_seen, message_count, sender_name)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run(platform, spaceId, senderId, entityId, timestamp, timestamp, delivery.sender_name ?? null);

  return { entity_id: entityId, is_new: true };
}
```

### The Owner Contact

The owner (Nexus user) is a special case. At init/boot time, the owner entity is seeded in `identity.db` (per `WORKSPACE_LIFECYCLE.md`). The `control-plane` and `webchat` platforms use a well-known entity ID (`entity-owner` or the configured owner entity). No contact lookup needed — the `chat.send` code path sets `entity_id` directly from the auth token.

For external platforms where the owner is also a sender (e.g., outbound messages captured by adapters), the contact is created normally and the memory-writer merges it with the owner entity when it recognizes the pattern.

---

## Identity Resolution (`resolvePrincipals` sender sub-step)

### Flow

```
Message arrives with DeliveryContext:
  { platform: "discord", sender_id: "tyler#1234", sender_name: "Tyler", ... }

Stage 2: resolvePrincipals (sender branch)
  │
  ├── System/webhook platform? → system/webhook sender (no contact lookup)
  │
  ├── Control-plane/webchat? → owner sender from auth token entity_id
  │
  └── External adapter platform:
      │
      ├── ensureContact(delivery) → { entity_id, is_new }
      │
      ├── Follow merged_into chain in identity.db → canonical_entity_id
      │     (recursive CTE, typically 0-2 hops, same DB as contacts)
      │
      ├── Look up canonical entity details in identity.db (name, type, is_user, tags)
      │
      └── Build SenderContext:
            type: is_user ? "owner" : "known"  // always "known" or "owner", never "unknown"
            entity_id: canonical_entity_id
            name: entity.name
            tags: entity_tags
            identities: [{ platform, identifier: sender_id }]  // from contacts table
```

**Key change from old system:** There is no `unknown` sender type for external senders. Every sender gets an entity on first contact. The sender is always `known` (or `owner` if `is_user = true`). The entity may be sparse (just a channel handle, no real name), but it exists.

The `unknown` sender type still exists for edge cases:
- Delivery context missing sender_id
- System error during contact/entity creation
- Explicit policy to deny un-enriched entities

### Same-DB Lookup (identity.db)

Contacts and entities both live in `identity.db` (entities relocated per DATABASE_ARCHITECTURE.md). Identity resolution is a single-DB operation -- contact lookup and entity chain walk are in the same database, enabling JOINs.

```typescript
// Contact lookup + entity chain walk (both identity.db)
const canonical = identityDb.prepare(`
  WITH contact AS (
    SELECT entity_id FROM contacts
    WHERE platform = ? AND space_id = ? AND sender_id = ?
  ),
  RECURSIVE chain AS (
    SELECT e.* FROM entities e JOIN contact c ON e.id = c.entity_id
    UNION ALL
    SELECT e2.* FROM entities e2 JOIN chain ch ON e2.id = ch.merged_into
  )
  SELECT * FROM chain WHERE merged_into IS NULL
`).get(platform, spaceId, senderId);
```

Because both tables are in the same SQLite database, this is a single synchronous query with no cross-db overhead.

### Contacts After Merge (Optional Optimization)

Correctness does **not** require rewriting contacts on merge: the pipeline can resolve canonical identity by following the `merged_into` chain in identity.db.

For performance and convenience (directory queries, proactive reachability), merge code MAY "compress" contacts by updating any contacts that point at merged leaf entities:

```sql
-- Executed by merge code that knows the leaf ids it merged.
UPDATE contacts
SET entity_id = ?canonical_entity_id
WHERE entity_id IN (?merged_leaf_entity_ids...);
```

---

## Session Key Generation (`resolveAccess` routing output)

### Format

Session keys are produced by `buildSessionKey()` at `resolveAccess`:

| Scenario | Format | Example |
|----------|--------|---------|
| DM | `dm:{sender_entity_id}:{receiver_entity_id}` | `dm:ent_mom:ent_eve` |
| Shared container (`group`) | `group:{platform}:{container_id}:{receiver_entity_id}` | `group:discord:general:ent_eve` |
| Email thread container | `email:{platform}:{container_id}:{receiver_entity_id}` | `email:gmail:189a2d...:ent_eve` |
| Worker/meeseeks | `worker:{ulid}` | `worker:01HWXYZ...` |
| System | `system:{purpose}` | `system:compaction` |

**Key change:** Canonical session identity uses three key families (`dm`, `group`, `email`). `:agent:` and ad-hoc `:thread:` suffixes are not part of canonical keys.

Group thread messages route to the same group session key as the parent container.

Email note:

- Email always uses the `email:` key family with `container_id = thread_id`.
- This prevents unrelated 1:1 email threads from collapsing into a single DM entity-pair session.

Hard cutover:

- New writes must use canonical entity-based keys only.
- Legacy labels may be read only during one-time migration/reconciliation jobs, not as runtime routing formats.

### Session Key Resolution

```typescript
export function buildSessionKey(input: SessionKeyInput): string {
  const { sender, delivery, receiver } = input;
  const receiverEntity = receiver?.entity_id?.trim();

  // System senders
  if (sender.type === "system" || sender.type === "webhook") {
    const purpose = sender.source ?? delivery.platform;
    return `system:${purpose}`;
  }

  // Agent (subagent) senders
  if (sender.type === "agent") {
    return sender.entity_id ? `worker:${sender.entity_id}` : `system:agent`;
  }

  if (!receiverEntity) {
    return `system:${receiver?.source ?? delivery.platform}`;
  }

  // Email is always thread/container scoped regardless of direct/group classification.
  if (delivery.platform === "gmail" || delivery.platform === "email") {
    return `email:${delivery.platform}:${delivery.container_id}:${receiverEntity}`;
  }

  // Shared conversations (threads collapse into container session)
  if (delivery.container_kind === "group") {
    return `group:${delivery.platform}:${delivery.container_id}:${receiverEntity}`;
  }

  // DM: sender/receiver entity pair
  return `dm:${sender.entity_id}:${receiverEntity}`;
}
```

---

## Entity Merge Propagation

When the memory-writer (or any agent) merges two entities in identity.db, three systems are affected:

### 1. Contacts: No Update Needed

Contacts point to their original `entity_id`. The union-find chain in identity.db resolves to the canonical root. No contact rows need updating for correctness.

```
Contact: (discord, tyler#1234) → entity_id = ent_001
Entity: ent_001.merged_into = ent_002
Entity: ent_002.merged_into = NULL  ← canonical root

Pipeline resolves: contact → ent_001 → chain walk in identity.db → ent_002
Session key: dm:ent_002:ent_eve
```

### 2. Sessions: Alias Creation

When entities merge, existing sessions may need canonicalization. The merge operation must:

1. choose a primary session (latest activity; tie-break by turn count),
2. generate continuity summary for each retired session,
3. inject those summaries into the primary session,
4. create aliases retired->primary,
5. archive retired sessions.

Summary injection is mandatory. If model summarization fails, runtime must use deterministic fallback summary generation.

```typescript
function propagateMergeToSessions(
  agentsDb: DatabaseSync,
  canonicalSenderEntityId: string,
  mergedEntityIds: string[],
): void {
  const allSenderEntityIds = [canonicalSenderEntityId, ...mergedEntityIds];

  // Find all DM sessions for involved sender entities.
  // Group by receiver_entity_id so each receiver keeps its own continuity.
  const groupedByReceiver = findDMSessionsBySenderSet(agentsDb, allSenderEntityIds);

  for (const [receiverEntityId, sessionKeys] of groupedByReceiver) {
    if (sessionKeys.length === 0) {
      continue;
    }
    const primary = pickPrimarySession(agentsDb, sessionKeys); // latest activity, tie-break by turns
    const canonicalKey = `dm:${canonicalSenderEntityId}:${receiverEntityId}`;
    if (canonicalKey !== primary) {
      createSessionAlias(agentsDb, canonicalKey, primary, "identity_merge");
    }
    for (const key of sessionKeys) {
      if (key !== primary) {
        createSessionAlias(agentsDb, key, primary, "identity_merge");
      }
    }
  }
}
```

**This function is called synchronously from the merge operation.** Session aliasing is critical for routing correctness — it must not be deferred to an async job.

### 3. Conversation History: Bridge Through Memory, Don't Merge Trees

When sessions alias after an entity merge, the non-primary sessions stop receiving new messages. Their turn trees remain intact and queryable. The system bridges knowledge across sessions through two mechanisms:

**A. Memory system (automatic):**
Facts extracted from all sessions are linked to entities via `fact_entities` in memory.db (referencing entity IDs in identity.db by convention). Since the entities are now merged, all facts resolve to the same canonical entity. The memory-reader naturally surfaces relevant facts from all sessions when building context for the primary session.

**B. Merge notification (one-time):**
When the merge creates session aliases, the system injects a context note into the primary session:

```
[System] Identity merge: {entity_name} was also chatting via {platform}
(session {old_session_key}, {turn_count} turns). Memory system has
indexed that conversation. Use session history tools if you need
specific details from those conversations.
```

This gives the agent awareness that other conversations exist without polluting the turn tree.

**What this means in practice:**

```
Before merge:
  dm:ent_001:ent_eve (Discord, 20 turns about project planning)
  dm:ent_003:ent_eve (Slack, 10 turns about weekend plans)

After merge (ent_001 and ent_003 → canonical ent_002):
  dm:ent_002:ent_eve → alias → dm:ent_001:ent_eve (primary, keeps receiving messages)
  dm:ent_003:ent_eve → alias → dm:ent_001:ent_eve (redirected)

  Next message from Slack:
    Contact (slack, tshaver) → ent_003 → merged_into → ent_002
    Session key: dm:ent_002:ent_eve → alias → dm:ent_001:ent_eve
    Memory-reader finds facts from both conversations
    Agent responds via Slack adapter (outbound uses inbound delivery context)
```

### Outbound Delivery After Merge

Responses always go back through the adapter the message came from, not the adapter the session was originally created on. The `deliverResponse` stage uses the inbound `DeliveryContext` on the current `NexusRequest` to determine the outbound adapter.

This means a session originally created from Discord can receive a message from Slack and respond on Slack — because it's the same person, just a different platform.

### Reachability

The contacts table answers "what platforms can I reach this entity on?" for proactive outreach:

```sql
-- Recommended: keep contacts.entity_id compressed to the canonical entity id on merge (see "Contacts After Merge").
SELECT platform, space_id, sender_id, sender_name, avatar_url, last_seen
FROM contacts
WHERE entity_id = ?canonical_entity_id
ORDER BY last_seen DESC;
```

If contacts are not compressed, NEX must resolve canonicalization via the `merged_into` chain in identity.db (contacts and entities are in the same DB, so this is a straightforward JOIN).

---

## Adapters-Only Runtime

### Decision

Big-bang cutover. No migration story. Remove all legacy ingest/delivery systems.

### What Gets Removed

| Component | Path | Reason |
|-----------|------|--------|
| Legacy platform plugins | `nex/src/platforms/` | Replaced by adapter system |
| Gmail watcher | `nex/src/hooks/gmail-watcher.ts` | Replace with email adapter |
| Channel initialization | in `server-startup.ts` | No longer needed |
| Cron/scheduler (legacy) | various | Replaced by clock adapter or automations |

### What Remains

| Component | Role |
|-----------|------|
| **Adapter Manager** | Sole inbound/outbound path for external platforms. Adapters run as supervised child processes, communicate via JSON-line protocol. |
| **`chat.send` (control-plane)** | Direct dispatch into NEX pipeline for local CLI and web UI. NOT an adapter — it's inside the runtime process. Constructs its own DeliveryContext. |
| **NEX Pipeline** | Unchanged. Receives `NexusEvent` from both adapters and `chat.send`. Doesn't care about the source. |

### Startup Sequence (Post-Cleanup)

```
nexus start
  → Boot runtime
  → Open databases
  → Seed automations
  → External CLI credential sync
  → Start adapter manager
  → Register configured adapters (from config)
  → Start control-plane server (HTTP/WS)
  → Ready (/health 200)
```

### Adapter Configuration

Adapter config lives in `config.json` (or `NEXUS_NEX_CONFIG_PATH`, adapter-specific config, distinct from the main `state/config.json` / `NEXUS_CONFIG_PATH`). Already specced and implemented:

```yaml
adapters:
  - name: discord-main
    command: nexus-adapter-discord
    platform: discord
    account: my-server
    credentials:
      token: ${DISCORD_BOT_TOKEN}
  - name: slack-work
    command: nexus-adapter-slack
    platform: slack
    account: anthropic
    credentials:
      token: ${SLACK_BOT_TOKEN}
```

### Harness Implications

The E2E harness uses `chat.send` directly — it does not need external adapters for v1 scenarios. Adapter E2E testing is Phase 6 in the harness workplan.

---

## Impact on Memory System V2

The contacts table and auto-entity-creation pattern interact with the memory system in specific ways. This section documents the contract between the routing system and the memory system.

### What the Routing System Creates

On first contact from a new sender:
- A contact row in `identity.db`
- An entity in `identity.db` with `source = 'adapter'`, `type` = platform-specific handle type

These adapter-sourced entities are **sparse** — they have a platform handle as a name and no enrichment. They exist so that:
1. Session routing works from message one
2. Facts extracted from the conversation can be linked to an entity
3. The memory-writer can discover and enrich them

### What the Memory-Writer Does With Contacts

The memory-writer's entity resolution flow should be aware of adapter-sourced entities:

1. **Discovery:** When extracting entities from a conversation, the writer should check for existing adapter-sourced entities (e.g., `discord:tyler#1234`) and link facts to them rather than creating duplicates.

2. **Enrichment:** When the writer learns a real name ("that Discord user is my friend Tyler"), it creates a `person` entity and merges the adapter entity into it:
   ```
   Before: discord:tyler#1234 (type=discord_handle, source=adapter)
   After:  Tyler (type=person, source=inferred, merged_into=NULL)
           discord:tyler#1234 (merged_into=Tyler)
   ```

3. **Cross-channel merge:** When the writer discovers two contacts are the same person (e.g., "my Discord friend Tyler is also tshaver on Slack"), it merges their entities and calls `propagateMergeToSessions()`.

4. **Conversational contact discovery:** When someone says "my email is abc@gmail.com", the memory-writer should:
   - Create an entity for the email (`abc@gmail.com`, type=email, source=inferred)
   - Merge it into the sender's canonical entity
   - **Do NOT create a contact row** — contacts are only created by actual delivery events, not by conversational mentions. The email becomes a known alias of the entity, but it's not a delivery endpoint until a message actually arrives from it.

### What the Memory-Writer Must Call After Merge

When the memory-writer executes an entity merge (union operation), it **must** call `propagateMergeToSessions()` synchronously. This is not optional — session routing depends on it.

The function signature and behavior are defined above in the "Entity Merge Propagation" section.

### What Does NOT Change in Memory System V2

The memory system V2 memory tables (facts, fact_entities, episodes, etc. in memory.db) are unchanged by this spec. The entity store tables (entities, merge_candidates, entity_cooccurrences, entity_tags) are relocated to `identity.db` per DATABASE_ARCHITECTURE.md, enabling same-DB JOINs with contacts. This spec adds:

1. A contacts table in `identity.db` that links to entities (same DB -- JOINable)
2. A requirement that entity merges propagate to session aliases
3. A contract about adapter-sourced entities and how the memory-writer should handle them

---

## Required Code Changes

### identity.db Schema Update

```diff
- contacts table (old: channel, identifier, first_seen, last_seen, message_count, display_name, avatar_url)
+ contacts table (new: platform, space_id, sender_id, entity_id NOT NULL, sender_name, ...)

- identity_mappings table
+ REMOVED (replaced by contacts.entity_id direct link)

+ delivery directory tables (spaces/containers/threads/names/participants) — see `../delivery/adapters/DELIVERY_DIRECTORY_SCHEMA.md`

  auth_tokens table — UNCHANGED
  auth_passwords table — UNCHANGED
```

### Pipeline Stage Updates

- `resolveIdentity.ts`: Continue delivery-driven sender resolution via contacts + canonicalization; keep sender/receiver substrate symmetry.
- `resolveReceiver.ts`: Resolve receiver from `(platform, account_id)` account binding first, verify optional receiver hints, remove implicit default/atlas fallback paths.
- `resolveAccess.ts`: Route by canonical key families only (`dm:{sender_entity}:{receiver_entity}`, `group:{platform}:{container}:{receiver_entity}`, and `email:{platform}:{container_id}:{receiver_entity}`).
- `session.ts`: Replace `:agent:` grouping logic with receiver-entity grouping and make continuity transfer + aliasing mandatory on canonicalization.
- `assembleContext.ts` / `runAgent.ts`: require resolved agent/persona binding; no implicit atlas fallback.

### server-startup.ts Cleanup

- Remove legacy channel initialization
- Remove Gmail watcher initialization
- Remove cron/scheduler setup (if legacy-only)
- Keep: adapter manager, control-plane server, automation seeding, credential sync

---

## E2E Harness Assertions (Bundle B)

### Scenario 5: Adapter E2E (Extended, Phase 6)

1. Configure a test adapter (EVE or mock adapter).
2. Send inbound message via adapter with `(platform='test', sender_id='user-001')`.
3. **Assert:**
   - Contact row created in `identity.db` with `entity_id` set
   - Entity created in `identity.db` with `name='test:user-001'`, `type='test_handle'`, `source='adapter'`
   - Session created with label `dm:{sender_entity_id}:{receiver_entity_id}`
   - Sender resolved as `known` (not `unknown`)
   - Response delivered back through the test adapter

### Scenario 7: Identity Merge + Session Aliasing (Extended, Phase 7+)

1. Send messages via two different test adapters for two different sender IDs.
2. Trigger an entity merge (simulate memory-writer merge).
3. Send a message from the second sender.
4. **Assert:**
   - Message routes to the primary session (via alias)
   - Session alias rows exist with `reason = 'identity_merge'`
   - Both original sessions still exist with their turn history
   - New turns append to the primary session only

---

## See Also

- `../agents/SESSION_LIFECYCLE.md` — Session creation, turn processing, queue management, forking
- `../../DATABASE_ARCHITECTURE.md` — 6-database layout, entity relocation to identity.db
- `../../memory/MEMORY_SYSTEM.md` — Memory architecture, retain flow, consolidation
- `../../memory/MEMORY_WRITER.md` — Memory-writer entity resolution and merge behavior
- `../delivery/ADAPTER_SYSTEM.md` — Adapter protocol, manager, configuration
- `../../environment/foundation/WORKSPACE_LIFECYCLE.md` — Init, boot, onboarding lifecycle
- `../../environment/foundation/harnesses/LIVE_E2E_HARNESS.md` — E2E harness scenarios

---

*This document defines the runtime routing architecture for Nexus. It resolves Bundle B (Items 3, 4) from the LIVE_E2E_HARNESS.md clarification workplan.*
