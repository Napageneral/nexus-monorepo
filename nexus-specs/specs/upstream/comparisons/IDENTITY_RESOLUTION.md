# Identity Resolution Comparison

**Status:** COMPLETE  
**Last Updated:** 2026-02-04  
**Related:** `../iam/ACCESS_CONTROL_SYSTEM.md`, `../iam/upstream/SENDER_IDENTITY.md`

---

## Summary

OpenClaw and Nexus take fundamentally different approaches to identity resolution.

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Architecture** | Part of channel normalization | Dedicated pipeline stage |
| **Storage** | Config file links | Database ledger |
| **Cross-platform** | Manual YAML configuration | Structural (ledger relationships) |
| **Query model** | None — identity resolved inline | Full query capability |
| **Relationship tracking** | None | First-class (`partner`, `family`, `friend`) |
| **Learning** | Static | Cortex can update ledger over time |

**Key insight:** OpenClaw asks "what did this platform tell us about the sender?" Nexus asks "who IS this person, across all platforms?"

---

## How Identity Flows

### OpenClaw: Channel Normalization

Identity is extracted per-channel during message normalization:

```
Message arrives (Telegram)
        │
        ▼
┌───────────────────────┐
│  Channel Normalizer   │
│                       │
│  • Extract SenderId   │
│  • Extract Username   │
│  • Extract Name       │
│  • Normalize format   │
└───────────────────────┘
        │
        ▼
MsgContext: {
  SenderId: "123456789",
  SenderUsername: "casey_a",
  SenderName: "Casey Adams",
  Channel: "telegram"
}
        │
        ▼
┌───────────────────────┐
│  Allowlist Check      │
│                       │
│  • Check SenderId     │
│  • Check @username    │
│  • Check identity     │
│    links (if config'd)│
└───────────────────────┘
        │
        ▼
Session key generation
```

Each channel has its own normalization logic. Cross-channel identity requires explicit configuration:

```yaml
# openclaw.config.yaml
session:
  identityLinks:
    tyler:
      - telegram:123456789
      - whatsapp:+14155551234
      - discord:987654321
    casey:
      - telegram:111222333
      - imessage:casey@example.com
```

**Limitation:** Identity links are purely for session collapsing. They don't answer "who is this person?" or "what's our relationship?"

---

### Nexus: Dedicated Resolution Stage

Identity resolution is an explicit pipeline stage BEFORE access control:

```
Event arrives
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│                    resolveIdentity()                       │
│                                                            │
│   Event: { channel: "telegram", from: "123456789" }        │
│                           │                                │
│                           ▼                                │
│   ┌─────────────────────────────────────────────┐          │
│   │           Identity Ledger Query             │          │
│   │                                             │          │
│   │   SELECT e.*, ei.*                          │          │
│   │   FROM entities e                           │          │
│   │   JOIN entity_identities ei                 │          │
│   │     ON e.id = ei.entity_id                  │          │
│   │   WHERE ei.channel = 'telegram'             │          │
│   │     AND ei.identifier = '123456789'         │          │
│   └─────────────────────────────────────────────┘          │
│                           │                                │
│                           ▼                                │
│   Principal: {                                             │
│     entity_id: "entity_casey",                             │
│     type: "person",                                        │
│     name: "Casey",                                         │
│     is_user: false,                                        │
│     relationship: "partner",                               │
│     tags: ["trusted", "family"]                            │
│   }                                                        │
└───────────────────────────────────────────────────────────┘
        │
        ▼
Access Control (uses Principal)
        │
        ▼
Hooks + Broker
```

**Key difference:** Identity resolution is structural and queryable, not just a normalization artifact.

---

## The Identity Ledger Model

Nexus uses a three-layer identity model:

### Layer 1: Contacts (Raw Platform Identifiers)

```sql
entity_identities (
  entity_id TEXT,
  channel TEXT,           -- telegram, discord, imessage, etc.
  identifier TEXT,        -- Platform-specific: +1555..., 123456789
  account_id TEXT,        -- For multi-account: which bot/account
  is_owned INTEGER,       -- Does entity OWN this identity?
  PRIMARY KEY (channel, identifier)
);
```

This is where platform identifiers live. Each row is one identifier on one platform.

### Layer 2: Entities (Canonical Identities)

```sql
entities (
  id TEXT PRIMARY KEY,
  type TEXT,              -- 'person' | 'persona'
  name TEXT,
  is_user INTEGER,        -- True for owner
  relationship TEXT,      -- partner, family, friend, work, etc.
  created_at INTEGER,
  updated_at INTEGER
);
```

Entities are the "real" people (or personas). One entity can have many platform identities.

### Layer 3: Mappings (Tags + Attributes)

```sql
entity_tags (
  entity_id TEXT,
  tag TEXT,
  PRIMARY KEY (entity_id, tag)
);
```

Additional attributes and categorizations beyond the core relationship field.

### The Three Layers Together

```
           CONTACTS                    ENTITIES                  MAPPINGS
    (platform identifiers)        (canonical identity)         (attributes)
    
    telegram:123456789 ─┐
    discord:987654321  ─┼──────▶  Casey (person)  ──────▶  tags: [trusted, family]
    imessage:+1555...  ─┘         relationship: partner
    
    telegram:111222333 ─┐
    whatsapp:+1707...  ─┴──────▶  Mom (person)    ──────▶  tags: [family]
                                  relationship: family
    
    discord:atlas-bot  ─┐
    telegram:atlas-bot ─┴──────▶  Atlas (persona) ──────▶  tags: []
                                  is_owned: true
```

---

## Cross-Channel Resolution: Example

### OpenClaw Approach

Casey messages from Telegram. Later, same person messages from Discord.

**Without identity links:**
```
Telegram message → session: agent:main:telegram:dm:123456789
Discord message  → session: agent:main:discord:dm:987654321
(Two separate sessions — no continuity)
```

**With identity links configured:**
```yaml
identityLinks:
  casey:
    - telegram:123456789
    - discord:987654321
```

```
Telegram message → session: agent:main:dm:casey
Discord message  → session: agent:main:dm:casey
(Same session — but only because manually configured)
```

**Limitation:** OpenClaw doesn't know Casey is your partner. It just knows to use the same session.

---

### Nexus Approach

Casey messages from Telegram. Later, same person messages from Discord.

```
┌─────────────────────────────────────────────────────────────┐
│  Telegram: from 123456789                                   │
│                                                             │
│  Ledger lookup:                                             │
│    entity_identities WHERE channel='telegram'               │
│      AND identifier='123456789'                             │
│        → entity_id: "entity_casey"                          │
│                                                             │
│  Entity lookup:                                             │
│    entities WHERE id='entity_casey'                         │
│        → name: "Casey", relationship: "partner"             │
│                                                             │
│  Principal: {                                               │
│    entity_id: "entity_casey",                               │
│    name: "Casey",                                           │
│    relationship: "partner",                                 │
│    tags: ["trusted", "family"]                              │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Discord: from 987654321                                    │
│                                                             │
│  Ledger lookup:                                             │
│    entity_identities WHERE channel='discord'                │
│      AND identifier='987654321'                             │
│        → entity_id: "entity_casey"                          │
│                                                             │
│  → Same principal, same Casey                               │
└─────────────────────────────────────────────────────────────┘
```

**Result:** Both messages resolve to the same entity with full context (name, relationship, tags).

---

## Why This Enables Better IAM

### Relationship-Based Policies

Because identity resolution produces relationship context, policies can use it:

```yaml
- name: partner-access
  match:
    principal:
      relationship: partner
  
  permissions:
    tools:
      allow: [web_search, weather, calendar_read, smart_home]
      deny: [shell, send_email, read_messages]
    data: restricted
```

OpenClaw can't do this because it doesn't track relationships — only platform IDs.

### Tag-Based Policies

```yaml
- name: trusted-contacts
  match:
    principal:
      tags: [trusted]
  
  permissions:
    tools:
      allow: [calendar_read, weather]
```

### Queryable Identity Graph

```sql
-- Who is this person across all platforms?
SELECT e.name, ei.channel, ei.identifier
FROM entities e
JOIN entity_identities ei ON e.id = ei.entity_id
WHERE e.id = 'entity_casey';

-- All my family members
SELECT * FROM entities WHERE relationship = 'family';

-- All identities for trusted people
SELECT ei.* FROM entity_identities ei
JOIN entity_tags et ON ei.entity_id = et.entity_id
WHERE et.tag = 'trusted';
```

OpenClaw can't query identity — it's embedded in config, not data.

### Better Agent Context

When the agent receives a message, it knows:

```typescript
{
  event: { ... },
  principal: {
    entity_id: "entity_casey",
    name: "Casey",
    relationship: "partner",
    tags: ["trusted", "family"]
  },
  permissions: { ... }
}
```

The agent understands WHO it's talking to, not just which platform account sent the message.

---

## Learning and Evolution

### OpenClaw: Static

Identity links must be manually configured. No mechanism to learn or update.

### Nexus: Cortex Integration

The Cortex can analyze conversation patterns and suggest entity updates:

```
Cortex observes:
  - New sender: telegram:555444333
  - Sender says "hey, this is casey's mom"
  - Multiple messages from this number
  
Cortex suggests:
  - Create entity: "Casey's Mom"
  - Link: telegram:555444333
  - Relationship: family (via Casey)
  
User confirms → Ledger updated
```

The Identity Ledger becomes richer over time without manual configuration.

---

## Comparison Summary

| Feature | OpenClaw | Nexus |
|---------|----------|-------|
| Identity extraction | Per-channel normalizers | Per-channel normalizers |
| Cross-channel linking | Manual config | Ledger relationships |
| Relationship tracking | ❌ | ✅ First-class |
| Tags/attributes | ❌ | ✅ `entity_tags` |
| Queryable | ❌ | ✅ SQL |
| Policy integration | ID/username allowlists | Full principal matching |
| Learning | ❌ Static | ✅ Cortex enrichment |
| "Who is this person?" | ❌ Can't answer | ✅ Single query |

---

## What Nexus Inherits from OpenClaw

The channel normalization logic is still valuable:

- E.164 phone normalization
- Platform-specific ID extraction
- Username/display name handling
- Per-channel validation rules

This becomes the INPUT to `resolveIdentity()`, not the final identity.

---

## The Architectural Difference

**OpenClaw:** Identity is a side effect of message normalization.

**Nexus:** Identity resolution is a first-class pipeline stage that produces a Principal used by all downstream systems (ACL, hooks, broker, agent context).

This enables:
1. Consistent identity across channels
2. Relationship-based access control
3. Queryable identity graph
4. Agent understanding of WHO they're talking to
5. Learning and evolution over time

---

*Identity is foundational. OpenClaw treats it as normalization. Nexus treats it as data.*
