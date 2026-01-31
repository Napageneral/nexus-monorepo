# Access Control System

**Status:** DESIGN SPEC  
**Last Updated:** 2026-01-30  
**Related:** UNIFIED_SYSTEM.md, agent-system/EVENT_SYSTEM_DESIGN.md, agent-system/BROKER.md

---

## Executive Summary

The Access Control Layer (ACL) is a declarative system that sits in front of hooks and the agent broker. It determines:

1. **WHO** can send messages to the system
2. **WHAT** permissions they have (tools, credentials, data access)
3. **WHERE** their messages route (persona + session)

This separation provides clear visibility into access rules, enables GUI-based management, and short-circuits unauthorized requests before any hook or agent runs.

---

## Architecture Position

```
                                 ┌─────────────────────────────────────────┐
                                 │              NEXUS                       │
                                 │                                          │
 Event arrives                   │  ┌──────────────┐                       │
      │                          │  │ EVENT LEDGER │                       │
      ▼                          │  └──────┬───────┘                       │
 ┌─────────────┐                 │         │                               │
 │  Identity   │                 │         ▼                               │
 │ Resolution  │◄────────────────│  ┌──────────────┐                       │
 │ (via Ledger)│                 │  │     ACL      │ ◄── You are here      │
 └─────────────┘                 │  │   LAYER      │                       │
                                 │  │              │                       │
                                 │  │ • Policies   │                       │
                                 │  │ • Grants     │                       │
                                 │  │ • Audit log  │                       │
                                 │  └──────┬───────┘                       │
                                 │         │                               │
                                 │    ALLOW│DENY                           │
                                 │         │                               │
                                 │         ▼                               │
                                 │  ┌──────────────┐                       │
                                 │  │    HOOKS     │                       │
                                 │  │   (WHAT +    │                       │
                                 │  │    HOW)      │                       │
                                 │  └──────┬───────┘                       │
                                 │         │                               │
                                 │         ▼                               │
                                 │  ┌──────────────┐                       │
                                 │  │   BROKER     │                       │
                                 │  └──────────────┘                       │
                                 └─────────────────────────────────────────┘
```

**Key insight:** ACL runs BEFORE hooks. If a sender is not allowed, we never run any hook code. This is efficient and secure.

---

## Core Concepts

### The Three Questions

| Layer | Question | Mechanism |
|-------|----------|-----------|
| **ACL** | WHO is this? Are they allowed? What can they do? | Declarative policies |
| **Hooks** | WHAT patterns match? | Programmatic scripts |
| **Broker** | HOW do we execute? | Agent invocation |

### Key Terms

| Term | Definition |
|------|------------|
| **Principal** | The identity making a request (person, system, webhook, agent) |
| **Policy** | A rule that matches principals/conditions and assigns permissions |
| **Grant** | A dynamic, temporary permission given via approval flow |
| **Effect** | Allow or Deny |
| **Resources** | Tools, credentials, data access levels |
| **Session** | The persona + session key where messages route |

---

## Principals

Principals are WHO is making a request. They map to identities in your ledger.

### Principal Types

| Type | Description | Matching |
|------|-------------|----------|
| **Owner** | The user (you) | `is_user: true` in ledger |
| **Known Contact** | Person in your ledger | Query by relationship, tags, ID |
| **Unknown** | Sender not in contacts | `unknown: true` |
| **System** | Timer, cron, internal events | `system: true` |
| **Webhook** | External service calling in | `webhook: {source}` |
| **Agent** | Agent-to-agent communication | `agent: {id}` |

### Identity Resolution

When an event arrives, we resolve the sender via the **Identity Ledger**:

```
Event: { channel: "imessage", from: "+15551234567" }
                    │
                    ▼
         ┌─────────────────────────┐
         │  Identity Ledger Lookup │
         │                         │
         │  SELECT e.*, ei.*       │
         │  FROM entities e        │
         │  JOIN entity_identities │
         │    ei ON e.id =         │
         │    ei.entity_id         │
         │  WHERE ei.channel =     │
         │  'imessage' AND         │
         │  ei.identifier =        │
         │  '+15551234567'         │
         └─────────────────────────┘
                    │
                    ▼
         Principal: {
           entity_id: "entity_abc",
           type: "person",
           name: "Casey",
           is_user: false,
           relationship: "partner",
           tags: ["trusted", "family"]
         }
```

If no match: `Principal: { unknown: true }`

**Note:** The Identity Ledger is conceptually separate from the Event Ledger. See `UNIFIED_SYSTEM.md` for the three-ledger model.

---

## Resources

Resources are WHAT principals can access.

### Resource Categories

| Category | Examples | Notes |
|----------|----------|-------|
| **Tools** | `web_search`, `shell`, `send_email`, `read_file` | Agent capabilities |
| **Credentials** | `google`, `github`, `stripe` | API keys, OAuth tokens |
| **Data Access** | `full`, `restricted`, `none` | Level of private data access |

### Tool Categories

| Risk Level | Tools | Notes |
|------------|-------|-------|
| **Safe** | `web_search`, `weather`, `calculator` | Read-only, no private data |
| **Sensitive** | `calendar_read`, `read_file`, `read_messages` | Access to private data |
| **Dangerous** | `shell`, `send_email`, `write_file`, `credentials_*` | Side effects, impersonation |

---

## Conditions

Conditions are additional context that modifies which policies match.

| Condition | Description | Examples |
|-----------|-------------|----------|
| **channel** | Communication platform | `imessage`, `discord`, `slack` |
| **peer_kind** | DM vs group | `dm`, `group` |
| **account** | Multi-account contexts | `slack:company-workspace` |
| **guild** | Discord server | `discord:guild-123` |
| **time** | Time-based rules | `23:00-08:00`, `weekends` |

---

## Policies

Policies are the rules. See `POLICIES.md` for full schema and examples.

### Policy Structure

```yaml
- name: policy-name
  description: What this policy does
  
  match:
    principal:
      # Principal matching criteria
    conditions:
      # Context conditions
  
  effect: allow | deny
  
  permissions:
    tools:
      allow: [...]
      deny: [...]
    credentials: [...]
    data: full | restricted | none
  
  session:
    persona: atlas
    key: "template:{variable}"
  
  priority: 0-100
```

### Evaluation Order

1. Resolve principal (identity lookup)
2. Collect all matching policies (principal + conditions)
3. Sort by priority (highest first)
4. Check for explicit denies (any deny → DENY)
5. Merge permissions from all allowing policies
6. Apply result

### Priority Rules

| Aspect | Resolution |
|--------|------------|
| **Session** | Highest priority policy wins |
| **Permissions (allow)** | Union of all allows |
| **Permissions (deny)** | Union of all denies; deny overrides allow |

---

## Grants

Grants are dynamic, temporary permissions. See `GRANTS.md` for full spec.

### Use Cases

1. **Privilege escalation request** — Casey asks for calendar access, Tyler approves
2. **Tool permission request** — Mom wants to send email, Tyler approves the draft
3. **Temporary access** — Grant expires after 24 hours

### Flow

```
Casey: "Can you check Tyler's calendar?"
           │
           ▼
     ACL: Casey can't access calendar_read
           │
           ▼
     Atlas → Tyler: "Casey wants calendar access. Approve?"
           │
           ▼
     Tyler: "Yes, for today"
           │
           ▼
     Grant created: {
       principal: casey,
       resources: [calendar_read],
       expires: 24h,
       granted_by: tyler
     }
           │
           ▼
     Atlas → Casey: "Tyler is free at 3pm tomorrow"
```

---

## Agent Permissions

### Owner-Triggered Agent Work

When Tyler triggers an agent (directly or via message):
- Agent runs with Tyler's permissions (full)
- Worker agents inherit full permissions

### Other-Triggered Agent Work

When Casey triggers an agent:
- Agent runs with Casey's permissions (restricted)
- Worker agents inherit Casey's permissions
- WA cannot escalate beyond MA's permissions

### System-Triggered Agent Work (Hooks)

When a timer/cron triggers agent work:
- Permissions defined by the hook's policy
- Can be scoped per-hook:

```yaml
# Trusted system hook
- name: daily-backup-hook
  match:
    principal: { system: true }
    conditions:
      - hook_id: daily-backup
  permissions:
    tools: [read_file, write_file]  # Just what it needs
    credentials: [google-drive]

# Less trusted hook
- name: web-scraper-hook
  match:
    principal: { system: true }
    conditions:
      - hook_id: web-scraper
  permissions:
    tools: [web_search]  # Minimal - could be hijacked
    credentials: []
```

### Permission Inheritance

```
Principal permissions
        │
        ▼
   MA permissions (= principal permissions)
        │
        ▼
   WA permissions (= intersection of MA + WA request)
        │
        ▼
   WA can't exceed MA
```

---

## Session Assignment

Policies assign sessions via templating:

```yaml
session:
  persona: atlas
  key: "family:{principal.name}"  # → "family:casey"
```

### Template Variables

| Variable | Description |
|----------|-------------|
| `{principal.name}` | Person's name |
| `{principal.id}` | Person's ID |
| `{channel}` | Channel name |
| `{peer_id}` | Group/peer ID |
| `{account}` | Account ID |

### Session Isolation Examples

| Pattern | Session Key | Use Case |
|---------|-------------|----------|
| `main` | `main` | Owner DMs collapse |
| `family:{principal.name}` | `family:casey` | Per-family-member isolation |
| `{channel}:group:{peer_id}` | `discord:group:123` | Per-group isolation |
| `work` | `work` | Work context unified |
| `unknown:{channel}:{principal.id}` | `unknown:email:xyz` | Unknown sender isolation |

---

## Audit Logging

Every access decision is logged. See `AUDIT.md` for full spec.

### What's Logged

- Event details (channel, sender)
- Resolved principal
- Matching policies
- Effect (allow/deny)
- Resulting permissions
- Session assignment
- Grants applied
- Processing time

### Query Examples

```bash
nexus acl audit --denied --last 100
nexus acl audit --principal casey --since yesterday
nexus acl audit --policy "group-chat-restrictions"
```

---

## Integration with Personas

Personas and ACL are separate but connected:

| Concept | What It Is | Relationship to ACL |
|---------|------------|---------------------|
| **Persona** | Identity (name, soul, accounts) | ACL routes TO personas |
| **ACL Policy** | Access rules | Determines permissions + session |

### Personas in Ledger

Personas should be tracked similarly to people:

```
persons table:
  - id: "tyler"
    is_user: true
    ...
  - id: "casey"
    relationship: "partner"
    ...

personas table:  (or same table with type)
  - id: "atlas"
    type: "persona"
    accounts: [discord:atlas-bot, telegram:atlas-bot]
    ...
```

This enables:
- Unified identity resolution
- Personas owning their own accounts
- ACL routing based on which persona's account received the message

---

## Comparison to AWS IAM

| IAM Concept | Nexus ACL | Notes |
|-------------|-----------|-------|
| Principal | Principal | Same concept |
| Action | Tools | What they can invoke |
| Resource | Credentials, Data | What they can access |
| Condition | Conditions | Context modifiers |
| Effect | Effect | Allow/Deny |
| Policy | Policy | Same structure |
| Role | — | Not needed (principals have relationships) |
| Permission Boundary | — | Not needed yet |
| STS/AssumeRole | — | Not needed (no cross-account) |

We're simpler than IAM but capture what we need.

---

## Relationship to Hooks

```
EVENT → ACL (WHO) → HOOKS (WHAT/HOW) → BROKER
```

- **ACL** is declarative (YAML policies)
- **Hooks** are programmatic (TypeScript scripts)
- **ACL runs first** — if denied, no hooks run
- **Hooks receive permissions** — can use in their logic

```typescript
// Hook receives ACL context
export default async function(ctx: HookContext): Promise<HookResult> {
  const { event, permissions } = ctx;
  
  // Permissions already resolved by ACL
  if (!permissions.tools.includes('calendar_read')) {
    // Don't try to access calendar
  }
  
  // ...
}
```

---

## Relationship to Broker

ACL determines the **dispatch context** sent to Broker:

```typescript
interface BrokerDispatch {
  event: Event;
  principal: Principal;
  permissions: PermissionSet;
  session: {
    persona: string;
    key: string;
  };
  deliveryContext: DeliveryContext;
}
```

Broker uses this to:
- Route to correct session
- Enforce tool restrictions during agent execution
- Preserve delivery context for response

---

## Files in This Spec

| File | Description |
|------|-------------|
| **ACCESS_CONTROL_SYSTEM.md** | This file — unified overview |
| **POLICIES.md** | Policy schema, examples, evaluation |
| **GRANTS.md** | Dynamic permission grants |
| **AUDIT.md** | Audit logging |

---

## Resolved Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Policy storage** | YAML files for now, DB later | Human-editable, understand before formalizing |
| **Policy editing** | Owner or owner-permissioned agents only | Prevent privilege escalation |
| **Default policies** | Ship with owner-only defaults | Secure by default, loosen as needed |
| **Persona accounts** | Track in unified entities ledger | Identity resolution for personas via same system |
| **Agent-created hooks** | Yes, by owner-permissioned agents only | Agents are primary authors |

---

## ACL Position in Event Flow

ACL sits **inside** the Event Handler, before hooks:

```
Event Ledger → Event Handler [ ACL → Hooks ] → Broker
                               ↑
                               │
                    Identity resolution via
                    persons/entities table
```

- **If ACL denies:** Event dropped, logged to audit
- **If ACL allows:** Event passed to hooks with `{ principal, permissions, session }`
- **Hooks receive pre-resolved context** — no need to re-check identity

---

## Identity Ledger Schema

The Identity Ledger stores entities (persons and personas) with their contact identities:

```sql
-- IDENTITY LEDGER
entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- 'person' | 'persona'
  name TEXT,
  is_user INTEGER,              -- True for owner (person only)
  relationship TEXT,            -- family, partner, etc. (person only)
  created_at INTEGER,
  updated_at INTEGER
);

entity_identities (
  entity_id TEXT,
  channel TEXT,                 -- imessage, discord, etc.
  identifier TEXT,              -- +1234567, @atlas_bot
  account_id TEXT,              -- For personas: which bot account
  is_owned INTEGER DEFAULT 0,   -- True if entity OWNS this identity
  PRIMARY KEY (channel, identifier),
  FOREIGN KEY (entity_id) REFERENCES entities(id)
);

entity_tags (
  entity_id TEXT,
  tag TEXT,
  PRIMARY KEY (entity_id, tag),
  FOREIGN KEY (entity_id) REFERENCES entities(id)
);
```

**Key insight:** Personas are entities that OWN identities (bot accounts). People HAVE identities (contact info).

**Index enrichment:** The Index can learn relationships over time from conversation patterns and update the Identity Ledger.

Persona workspace files (`SOUL.md`, credentials, etc.) remain managed by Nexus workspace — the Identity Ledger handles principal resolution for ACL routing.

---

*This document provides the unified overview of the Access Control System. See individual spec files for detailed schemas and examples.*
