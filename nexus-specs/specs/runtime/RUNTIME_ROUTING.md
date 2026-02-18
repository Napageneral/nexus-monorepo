# Runtime Routing

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-17
**Resolves:** LIVE_E2E_HARNESS.md Bundle B (Items 3, 4)
**Related:** `broker/SESSION_LIFECYCLE.md`, `../data/cortex/v2/UNIFIED_ENTITY_STORE.md`, `../data/cortex/v2/MEMORY_SYSTEM_V2.md`, `adapters/ADAPTER_SYSTEM.md`

---

## Overview

This document defines how messages flow from inbound delivery to session routing once a Nexus workspace is alive. It covers:

1. **Contacts** — the delivery-driven directory that maps `(channel, sender_id)` to entities
2. **Identity resolution** — how the pipeline resolves a sender to a principal at pipeline speed
3. **Session key generation** — how sessions are keyed to identities
4. **Entity merge propagation** — what happens to contacts and sessions when entities merge
5. **Adapters-only runtime** — removing legacy channels in favor of the adapter system

---

## Design Principles

1. **Identity-driven sessions.** Sessions belong to people (entities), not channels. Two channels, same person, same session.
2. **Pipeline-speed resolution.** Identity resolution is synchronous, zero-LLM, sub-millisecond. The memory-writer does the smart work asynchronously.
3. **Every sender has an entity from message one.** No "unknown sender" state for session routing. First message creates both a contact and an entity. Session key is always entity-based.
4. **Contacts are infrastructure. Entities are knowledge.** Contacts answer "how to reach someone." Entities answer "who someone is." Different write paths, different concerns, linked by ID.
5. **Don't merge turn trees.** When identities merge, sessions alias. History stays intact. Memory bridges the knowledge gap.

---

## Contacts

### What Contacts Are

A contact is a delivery endpoint — a `(channel, identifier)` pair representing one way to reach or be reached by someone. Every inbound message creates or updates a contact automatically at pipeline time. No LLM involved.

Contacts are the pipeline-speed lookup index. Given a delivery context, the contacts table answers: "what entity is this sender?"

### Schema

Contacts live in `identity.db`:

```sql
CREATE TABLE contacts (
    channel         TEXT NOT NULL,              -- 'discord', 'slack', 'imessage', 'gmail', 'control-plane', 'webchat'
    identifier      TEXT NOT NULL,              -- platform-specific sender ID
    entity_id       TEXT NOT NULL,              -- FK → cortex entities table (by convention, cross-db)
    first_seen      INTEGER NOT NULL,           -- unix ms
    last_seen       INTEGER NOT NULL,           -- unix ms
    message_count   INTEGER DEFAULT 0,
    display_name    TEXT,                       -- last known display name from platform
    avatar_url      TEXT,                       -- last known avatar from platform
    PRIMARY KEY (channel, identifier)
);

CREATE INDEX idx_contacts_entity ON contacts(entity_id);
CREATE INDEX idx_contacts_last_seen ON contacts(last_seen DESC);
```

### What identity.db Contains

With this design, `identity.db` simplifies to two concerns:

1. **Contacts** — delivery-driven directory (as above)
2. **Auth** — tokens (`auth_tokens`) and passwords (`auth_passwords`)

The following tables are **removed from identity.db**:

| Table | Disposition |
|-------|------------|
| `entities` | Moved to cortex.db (Unified Entity Store) |
| `identity_mappings` | Replaced by `contacts.entity_id` direct link |
| `entity_tags` | Moved to cortex.db |

### Auto-Create Entity on First Contact

When a new `(channel, identifier)` pair is seen for the first time, the pipeline:

1. **Creates a contact row** in `identity.db` with a new `entity_id`
2. **Creates a corresponding entity** in `cortex.db` with:
   - `name`: `{channel}:{identifier}` (e.g., `discord:tyler#1234`)
   - `type`: channel-specific (e.g., `discord_handle`, `phone`, `email`, `slack_user`)
   - `source`: `'delivery'`
   - `merged_into`: `NULL` (canonical root — this IS the identity until merged)

```typescript
function ensureContact(
  identityDb: DatabaseSync,
  cortexDb: DatabaseSync,
  delivery: DeliveryContext,
  timestamp: number,
): { entity_id: string; is_new: boolean } {
  // Check existing
  const existing = identityDb
    .prepare('SELECT entity_id FROM contacts WHERE channel = ? AND identifier = ?')
    .get(delivery.channel, delivery.sender_id) as { entity_id: string } | undefined;

  if (existing) {
    // Update last_seen, message_count
    identityDb.prepare(`
      UPDATE contacts SET last_seen = ?, message_count = message_count + 1,
        display_name = COALESCE(?, display_name),
        avatar_url = COALESCE(?, avatar_url)
      WHERE channel = ? AND identifier = ?
    `).run(timestamp, delivery.sender_name ?? null, null, delivery.channel, delivery.sender_id);

    return { entity_id: existing.entity_id, is_new: false };
  }

  // New contact: create entity in cortex, then contact
  const entityId = generateULID();
  const entityName = `${delivery.channel}:${delivery.sender_id}`;
  const entityType = inferEntityType(delivery.channel); // discord_handle, phone, email, etc.

  cortexDb.prepare(`
    INSERT INTO entities (id, name, type, source, normalized, first_seen, last_seen, created_at, updated_at)
    VALUES (?, ?, ?, 'delivery', ?, ?, ?, ?, ?)
  `).run(entityId, entityName, entityType, entityName.toLowerCase(), timestamp, timestamp, timestamp, timestamp);

  identityDb.prepare(`
    INSERT INTO contacts (channel, identifier, entity_id, first_seen, last_seen, message_count, display_name)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `).run(delivery.channel, delivery.sender_id, entityId, timestamp, timestamp, delivery.sender_name ?? null);

  return { entity_id: entityId, is_new: true };
}
```

### The Owner Contact

The owner (Nexus user) is a special case. At init/boot time, the owner entity is seeded in cortex (per `WORKSPACE_LIFECYCLE.md`). The `control-plane` and `webchat` channels use a well-known entity ID (`entity-owner` or the configured owner entity). No contact lookup needed — the `chat.send` code path sets `entity_id` directly from the auth token.

For external channels where the owner is also a sender (e.g., outbound messages captured by adapters), the contact is created normally and the memory-writer merges it with the owner entity when it recognizes the pattern.

---

## Identity Resolution (Pipeline Stage 2)

### Flow

```
Message arrives with DeliveryContext:
  { channel: "discord", sender_id: "tyler#1234", sender_name: "Tyler", ... }

Stage 2: resolveIdentity
  │
  ├── System/webhook channel? → system/webhook principal (no contact lookup)
  │
  ├── Control-plane/webchat? → owner principal from auth token entity_id
  │
  └── External adapter channel:
      │
      ├── ensureContact(delivery) → { entity_id, is_new }
      │
      ├── Follow merged_into chain in cortex → canonical_entity_id
      │     (recursive CTE, typically 0-2 hops)
      │
      ├── Look up canonical entity details (name, type, is_user, tags)
      │
      └── Build PrincipalContext:
            type: is_user ? "owner" : "known"  // always "known" or "owner", never "unknown"
            entity_id: canonical_entity_id
            name: entity.name
            tags: entity_tags
            identities: [{ channel, identifier }]  // from contacts table
```

**Key change from old system:** There is no `unknown` principal type for external senders. Every sender gets an entity on first contact. The principal is always `known` (or `owner` if `is_user = true`). The entity may be sparse (just a channel handle, no real name), but it exists.

The `unknown` principal type still exists for edge cases:
- Delivery context missing sender_id
- System error during contact/entity creation
- Explicit policy to deny un-enriched entities

### Cross-DB Lookup

Contacts live in `identity.db`. Entities live in `cortex.db`. The resolution crosses databases:

```typescript
// 1. Contact lookup (identity.db)
const contact = identityDb
  .prepare('SELECT entity_id FROM contacts WHERE channel = ? AND identifier = ?')
  .get(channel, senderId);

// 2. Entity chain walk (cortex.db)
const canonical = cortexDb.prepare(`
  WITH RECURSIVE chain AS (
    SELECT * FROM entities WHERE id = ?
    UNION ALL
    SELECT e.* FROM entities e JOIN chain c ON e.id = c.merged_into
  )
  SELECT * FROM chain WHERE merged_into IS NULL
`).get(contact.entity_id);
```

Both are SQLite, both are local, both are fast. The cross-db aspect is two sequential queries, not a network hop.

### Path Compression (Optional Optimization)

Over time, merged_into chains can grow (though typically shallow). Periodic path compression updates contacts to point directly to the canonical root:

```sql
-- Run periodically (e.g., on startup or after a merge batch)
UPDATE contacts SET entity_id = (
  WITH RECURSIVE chain AS (
    SELECT id, merged_into FROM entities WHERE id = contacts.entity_id
    UNION ALL
    SELECT e.id, e.merged_into FROM entities e JOIN chain c ON e.id = c.merged_into
  )
  SELECT id FROM chain WHERE merged_into IS NULL
)
WHERE entity_id IN (SELECT id FROM entities WHERE merged_into IS NOT NULL);
```

This is an optimization, not a requirement. The chain walk is correct without it.

---

## Session Key Generation (Pipeline Stage 3)

### Format

Session keys are produced by `buildSessionKey()` at `resolveAccess`:

| Scenario | Format | Example |
|----------|--------|---------|
| DM (any channel) | `dm:{canonical_entity_id}` | `dm:ent_002` |
| Group/channel | `group:{channel}:{peer_id}` | `group:discord:general` |
| Group thread | `group:{channel}:{peer_id}:thread:{id}` | `group:slack:eng:thread:ts123` |
| Worker/meeseeks | `worker:{ulid}` | `worker:01HWXYZ...` |
| System | `system:{purpose}` | `system:compaction` |

**Key change:** There is no `dm:{channel}:{sender_id}` fallback format. Because every sender has an entity from message one, all DM sessions are entity-based from the start.

### Session Key Resolution

```typescript
export function buildSessionKey(input: SessionKeyInput): string {
  const { principal, delivery } = input;

  // System principals
  if (principal.type === "system" || principal.type === "webhook") {
    const purpose = principal.source ?? delivery.channel;
    return `system:${purpose}`;
  }

  // Agent (subagent) principals
  if (principal.type === "agent") {
    return principal.entity_id ? `worker:${principal.entity_id}` : `system:agent`;
  }

  // Group / channel conversations
  if (delivery.peer_kind === "group" || delivery.peer_kind === "channel") {
    const base = `group:${delivery.channel}:${delivery.peer_id}`;
    return delivery.thread_id ? `${base}:thread:${delivery.thread_id}` : base;
  }

  // DM: always entity-based (every sender has an entity)
  return `dm:${principal.entity_id}`;
}
```

---

## Entity Merge Propagation

When the memory-writer (or any agent) merges two entities in cortex, three systems are affected:

### 1. Contacts: No Update Needed

Contacts point to their original entity_id. The union-find chain in cortex resolves to the canonical root. No contact rows need updating.

```
Contact: (discord, tyler#1234) → entity_id = ent_001
Entity: ent_001.merged_into = ent_002
Entity: ent_002.merged_into = NULL  ← canonical root

Pipeline resolves: contact → ent_001 → chain walk → ent_002
Session key: dm:ent_002
```

### 2. Sessions: Alias Creation

When entities merge, existing sessions may need aliasing. The merge operation synchronously creates session aliases so that the new canonical session key resolves to the primary session.

```typescript
function propagateMergeToSessions(
  agentsDb: DatabaseSync,
  canonicalEntityId: string,
  mergedEntityIds: string[],
): void {
  const allEntityIds = [canonicalEntityId, ...mergedEntityIds];

  // Find all DM sessions for involved entities
  const sessionLabels = allEntityIds
    .map(id => `dm:${id}`)
    .filter(label => sessionExists(agentsDb, label));

  if (sessionLabels.length <= 1) {
    // 0 or 1 sessions — nothing to alias
    // If 1: create alias from canonical key if different
    if (sessionLabels.length === 1) {
      const canonicalKey = `dm:${canonicalEntityId}`;
      if (sessionLabels[0] !== canonicalKey) {
        createSessionAlias(agentsDb, canonicalKey, sessionLabels[0], 'identity_merge');
      }
    }
    return;
  }

  // Multiple sessions: pick primary (most turns)
  const primary = sessionLabels
    .map(label => ({ label, turns: countSessionTurns(agentsDb, label) }))
    .sort((a, b) => b.turns - a.turns)[0].label;

  // Canonical entity key → primary session
  const canonicalKey = `dm:${canonicalEntityId}`;
  if (canonicalKey !== primary) {
    createSessionAlias(agentsDb, canonicalKey, primary, 'identity_merge');
  }

  // All non-primary sessions → primary session
  for (const label of sessionLabels) {
    if (label !== primary) {
      createSessionAlias(agentsDb, label, primary, 'identity_merge');
    }
  }
}
```

**This function is called synchronously from the merge operation.** Session aliasing is critical for routing correctness — it must not be deferred to an async job.

### 3. Conversation History: Bridge Through Memory, Don't Merge Trees

When sessions alias after an entity merge, the non-primary sessions stop receiving new messages. Their turn trees remain intact and queryable. The system bridges knowledge across sessions through two mechanisms:

**A. Memory system (automatic):**
Facts extracted from all sessions are linked to entities via `fact_entities` in cortex. Since the entities are now merged, all facts resolve to the same canonical entity. The memory-reader naturally surfaces relevant facts from all sessions when building context for the primary session.

**B. Merge notification (one-time):**
When the merge creates session aliases, the system injects a context note into the primary session:

```
[System] Identity merge: {entity_name} was also chatting via {channel}
(session {old_session_label}, {turn_count} turns). Memory system has
indexed that conversation. Use session history tools if you need
specific details from those conversations.
```

This gives the agent awareness that other conversations exist without polluting the turn tree.

**What this means in practice:**

```
Before merge:
  dm:ent_001 (Discord, 20 turns about project planning)
  dm:ent_003 (Slack, 10 turns about weekend plans)

After merge (ent_001 and ent_003 → canonical ent_002):
  dm:ent_002 → alias → dm:ent_001 (primary, keeps receiving messages)
  dm:ent_003 → alias → dm:ent_001 (redirected)

  Next message from Slack:
    Contact (slack, tshaver) → ent_003 → merged_into → ent_002
    Session key: dm:ent_002 → alias → dm:ent_001
    Memory-reader finds facts from both conversations
    Agent responds via Slack adapter (outbound uses inbound delivery context)
```

### Outbound Delivery After Merge

Responses always go back through the adapter the message came from, not the adapter the session was originally created on. The `deliverResponse` stage uses the inbound `DeliveryContext` on the current `NexusRequest` to determine the outbound adapter.

This means a session originally created from Discord can receive a message from Slack and respond on Slack — because it's the same person, just a different channel.

### Reachability

The contacts table answers "what channels can I reach this entity on?" for proactive outreach:

```sql
-- All contacts for an entity (including merged aliases)
SELECT c.channel, c.identifier, c.display_name
FROM contacts c
JOIN entities e ON c.entity_id = e.id
WHERE e.id = ?canonical_entity_id
   OR e.merged_into = ?canonical_entity_id;
```

---

## Adapters-Only Runtime

### Decision

Big-bang cutover. No migration story. Remove all legacy ingest/delivery systems.

### What Gets Removed

| Component | Path | Reason |
|-----------|------|--------|
| Legacy channel plugins | `nex/src/channels/` | Replaced by adapter system |
| Gmail watcher | `nex/src/hooks/gmail-watcher.ts` | Replace with email adapter |
| Channel initialization | in `server-startup.ts` | No longer needed |
| Cron/scheduler (legacy) | various | Replaced by clock adapter or automations |

### What Remains

| Component | Role |
|-----------|------|
| **Adapter Manager** | Sole inbound/outbound path for external channels. Adapters run as supervised child processes, communicate via JSON-line protocol. |
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

Adapter config lives at `~/.nex.yaml` (or `NEXUS_NEX_CONFIG_PATH`). Already specced and implemented:

```yaml
adapters:
  - name: discord-main
    command: nexus-adapter-discord
    channel: discord
    account: my-server
    credentials:
      token: ${DISCORD_BOT_TOKEN}
  - name: slack-work
    command: nexus-adapter-slack
    channel: slack
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
- An entity in `cortex.db` with `source = 'delivery'`, `type` = channel-specific handle type

These delivery-sourced entities are **sparse** — they have a channel handle as a name and no enrichment. They exist so that:
1. Session routing works from message one
2. Facts extracted from the conversation can be linked to an entity
3. The memory-writer can discover and enrich them

### What the Memory-Writer Does With Contacts

The memory-writer's entity resolution flow should be aware of delivery-sourced entities:

1. **Discovery:** When extracting entities from a conversation, the writer should check for existing delivery-sourced entities (e.g., `discord:tyler#1234`) and link facts to them rather than creating duplicates.

2. **Enrichment:** When the writer learns a real name ("that Discord user is my friend Tyler"), it creates a `person` entity and merges the delivery entity into it:
   ```
   Before: discord:tyler#1234 (type=discord_handle, source=delivery)
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

The memory system V2 entity store (entities, fact_entities, merge_candidates, entity_cooccurrences, etc.) is unchanged by this spec. The unified entity store design is correct. This spec adds:

1. A contacts table in `identity.db` that points into the cortex entity store
2. A requirement that entity merges propagate to session aliases
3. A contract about delivery-sourced entities and how the memory-writer should handle them

---

## Required Code Changes

### identity.db Schema Update

```diff
- contacts table (old: channel, identifier, first_seen, last_seen, message_count, display_name, avatar_url)
+ contacts table (new: adds entity_id NOT NULL)

- identity_mappings table
+ REMOVED (replaced by contacts.entity_id direct link)

- entities table
+ REMOVED from identity.db (lives only in cortex.db)

- entity_tags table
+ REMOVED from identity.db (lives only in cortex.db)

  auth_tokens table — UNCHANGED
  auth_passwords table — UNCHANGED
```

### Pipeline Stage Updates

- `resolveIdentity.ts`: Call `ensureContact()` (creates contact + entity if new). Follow merged_into chain to canonical root. Build principal from canonical entity. Remove fallback to `unknown` for external senders.
- `resolveAccess.ts`: `buildSessionKey()` simplified — no `dm:{channel}:{sender_id}` branch.
- `session.ts`: `promoteSessionIdentity()` already exists. Add `propagateMergeToSessions()`.

### server-startup.ts Cleanup

- Remove legacy channel initialization
- Remove Gmail watcher initialization
- Remove cron/scheduler setup (if legacy-only)
- Keep: adapter manager, control-plane server, automation seeding, credential sync

---

## E2E Harness Assertions (Bundle B)

### Scenario 5: Adapter E2E (Extended, Phase 6)

1. Configure a test adapter (EVE or mock adapter).
2. Send inbound message via adapter with `(channel='test', sender_id='user-001')`.
3. **Assert:**
   - Contact row created in `identity.db` with `entity_id` set
   - Entity created in `cortex.db` with `name='test:user-001'`, `type='test_handle'`, `source='delivery'`
   - Session created with label `dm:{entity_id}`
   - Principal resolved as `known` (not `unknown`)
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

- `broker/SESSION_LIFECYCLE.md` — Session creation, turn processing, queue management, forking
- `../data/cortex/v2/UNIFIED_ENTITY_STORE.md` — Entity schema, union-find operations, merge candidates
- `../data/cortex/v2/MEMORY_SYSTEM_V2.md` — Memory architecture, retain flow, consolidation
- `../data/cortex/v2/MEMORY_WRITER_V2.md` — Memory-writer entity resolution and merge behavior
- `adapters/ADAPTER_SYSTEM.md` — Adapter protocol, manager, configuration
- `../environment/foundation/WORKSPACE_LIFECYCLE.md` — Init, boot, onboarding lifecycle
- `../environment/foundation/harnesses/LIVE_E2E_HARNESS.md` — E2E harness scenarios

---

*This document defines the runtime routing architecture for Nexus. It resolves Bundle B (Items 3, 4) from the LIVE_E2E_HARNESS.md clarification workplan.*
