# Access Control System

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-23  
**Related:** ../../OVERVIEW.md, ../nex/EVENT_SYSTEM_DESIGN.md, ../broker/OVERVIEW.md, POLICY_ARCHITECTURE_UNIFICATION.md, ../nex/ENTITY_SYMMETRIC_ROUTING_AND_PERSONA_BINDING.md

---

## Executive Summary

The Access Control Layer (ACL) is a declarative system that sits in front of hooks and the agent broker. It determines:

1. **WHO** can send messages to the system
2. **WHAT** permissions they have (tools, credentials, data access)
3. **WHERE** their messages route (receiver entity + agent/persona binding + session label)

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

## Canonical Authorization Envelope

IAM outputs a single `AuthorizationEnvelope` that all downstream runtime paths must consume:

- `decision`: allow | deny | ask
- `permissions`: tools allow/deny, credentials, data_access
- `routing`: agent_id, persona_ref, session_label, queue_mode
- `provenance`: matched policies, denied policies, grants applied, deny reason

This is the only source of truth for runtime authorization decisions.

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
| **Sender** | The sender of a message (person, system, webhook, agent) |
| **Policy** | A rule that matches senders/conditions and assigns permissions |
| **Grant** | A dynamic, temporary permission given via approval flow |
| **Effect** | Allow or Deny |
| **Resources** | Tools, credentials, data access levels |
| **Session** | The resolved session label where messages route, independent of persona binding |

---

## Senders

Senders are WHO is sending a message. They map to identities in your ledger.

### Sender Types

| Type | Description | Matching |
|------|-------------|----------|
| **Owner** | The user (you) | `is_user: true` in ledger |
| **Known Contact** | Person in your ledger | Query by tags, groups, ID |
| **Unknown** | Sender not in contacts | `unknown: true` |
| **System** | Timer, cron, internal events | `system: true` |
| **Webhook** | External service calling in | `webhook: {source}` |
| **Agent** | Agent-to-agent communication | `agent: {id}` |

### Identity Resolution

When an event arrives, we resolve the sender via the **Identity Ledger**:

```
Event: { platform: "imessage", sender_id: "+15551234567" }
                    │
                    ▼
         ┌──────────────────────────────┐
         │  identity.db Contact Lookup  │
         │                              │
         │  SELECT c.entity_id          │
         │  FROM contacts c             │
         │  WHERE c.platform =          │
         │  'imessage' AND              │
         │  c.contact_id =             │
         │  '+15551234567'              │
         │                              │
         │  → Then resolve entity via   │
         │    merged_into chain         │
         └──────────────────────────────┘
                    │
                    ▼
         SenderContext: {
           entity_id: "entity_abc",
           type: "person",
           name: "Casey",
           is_user: false,
           tags: ["trusted", "family", "relationship:partner"],
           groups: ["family"]
         }
```

If no match: `SenderContext: { unknown: true }`

> **Note:** Use entity tags (e.g., `relationship:partner`) and group memberships instead of a dedicated relationship field.

**Note:** The Identity Ledger is conceptually separate from the Event Ledger. See `../../README.md` for the System of Record.

---

## Resources

Resources are WHAT senders can access.

### Resource Categories

| Category | Examples | Notes |
|----------|----------|-------|
| **Tools** | `web_search`, `shell`, `send_email`, `read_file` | Agent capabilities |
| **Credentials** | `google`, `github`, `stripe` | API keys, OAuth tokens |
| **Data Access** | `full`, `contextual`, `minimal`, `none` | Level of private data access |

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
| **platform** | Communication platform | `imessage`, `discord`, `slack` |
| **container_kind** | Conversation type | `direct`, `group` |
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
    sender:
      # Sender matching criteria
    conditions:
      # Context conditions
  
  effect: allow | deny
  
  permissions:
    tools:
      allow: [...]
      deny: [...]
    credentials: [...]
    data: full | contextual | minimal | none
  
  session:
    persona: atlas
    key: "template:{variable}"
  
  priority: 0-100
```

### Evaluation Order

IAM evaluation is layered in this order:

1. Resolve sender (identity lookup)
2. Evaluate ACL policies (match, priority, deny precedence, permission merge)
3. Apply grants
4. Apply role caps (manager/worker/unified restrictions)
5. Apply execution caps (sandbox/runtime)
6. Apply optional profile overlays (agent/provider/group/subagent)
7. Normalize final allow/deny envelope and enforce

### Priority Rules

| Aspect | Resolution |
|--------|------------|
| **Session** | Highest priority policy wins |
| **Permissions (allow)** | Union of all ACL allows, then capped by downstream layers |
| **Permissions (deny)** | Union of all denies; deny overrides allow |

### Old vs New Precedence Diff

| Area | Old layered behavior | New canonical behavior |
|------|-----------------------|------------------------|
| Runtime access source | `resolveAccess` plus manual overrides in some paths | Single compiler output for all paths |
| Tool filtering | Multiple filters at different points (`assembleContext`, `runAgent`, `tool-invoke`) | Single normalized tool allow/deny envelope |
| Legacy synthetic requests | Some paths injected `request.access` directly | Synthetic requests still allowed, but authorization must be compiled |
| Explainability | Fragmented, path-dependent | One provenance chain per decision |

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
       sender: casey,
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
    sender: { system: true }
    conditions:
      - hook_id: daily-backup
  permissions:
    tools: [read_file, write_file]  # Just what it needs
    credentials: [google-drive]

# Less trusted hook
- name: web-scraper-hook
  match:
    sender: { system: true }
    conditions:
      - hook_id: web-scraper
  permissions:
    tools: [web_search]  # Minimal - could be hijacked
    credentials: []
```

### Permission Inheritance

```
Sender permissions
        │
        ▼
   MA permissions (= sender permissions)
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
  key: "family:{sender.name}"    # → "family:casey"
```

### Template Variables

| Variable | Description |
|----------|-------------|
| `{sender.name}` | Person's name |
| `{sender.id}` | Person's ID |
| `{sender.groups}` | Sender's group memberships |
| `{platform}` | Platform name |
| `{container_id}` | Group/container ID |
| `{account}` | Account ID |

### Session Isolation Examples

| Pattern | Session Key | Use Case |
|---------|-------------|----------|
| `main` | `main` | Owner DMs collapse |
| `family:{sender.name}` | `family:casey` | Per-family-member isolation |
| `{platform}:group:{container_id}` | `discord:group:123` | Per-group isolation |
| `work` | `work` | Work context unified |
| `unknown:{platform}:{sender.id}` | `unknown:email:xyz` | Unknown sender isolation |

---

## Audit Logging

Every access decision is logged. See `AUDIT.md` for full spec.

### What's Logged

- Event details (platform, sender)
- Resolved sender
- Matching policies
- Effect (allow/deny)
- Resulting permissions
- Session assignment
- Grants applied
- Processing time

### Query Examples

```bash
nexus acl audit --denied --last 100
nexus acl audit --sender casey --since yesterday
nexus acl audit --policy "group-chat-restrictions"
```

---

## Integration with Agents

Agents and ACL are separate but connected:

| Concept | What It Is | Relationship to ACL |
|---------|------------|---------------------|
| **Agent** | Identity (name, SOUL, accounts) | ACL routes TO agents |
| **ACL Policy** | Access rules | Determines permissions + session |

### Agents in Ledger

Agents should be tracked similarly to people:

```
entities table:
  - id: "tyler"
    type: "person"
    is_user: true
    ...
  - id: "casey"
    type: "person"
    tags: ["relationship:partner"]
    groups: ["family"]
    ...
  - id: "atlas"
    type: "agent"
    accounts: [discord:atlas-bot, telegram:atlas-bot]
    ...
```

This enables:
- Unified identity resolution
- Agents owning their own accounts
- ACL routing based on which agent account received the message

---

## Comparison to AWS IAM

| IAM Concept | Nexus ACL | Notes |
|-------------|-----------|-------|
| Principal | Sender | Same concept — "sender" in Nexus ACL context |
| Action | Tools | What they can invoke |
| Resource | Credentials, Data | What they can access |
| Condition | Conditions | Context modifiers |
| Effect | Effect | Allow/Deny |
| Policy | Policy | Same structure |
| Role | — | Not needed (senders have tags and groups) |
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
  sender: SenderContext;
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

`runAgent`, direct tool invocation, control-plane authz, live retain, and backfill retain must all enforce the same compiled envelope.

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
| **Agent accounts** | Track in unified entities ledger | Identity resolution for agents via same system |
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
- **If ACL allows:** Event passed to hooks with `{ sender, permissions, session }`
- **Hooks receive pre-resolved context** — no need to re-check identity

---

## Identity Ledger Schema

The Identity Ledger stores entities (persons and agents) with their contact identities:

```sql
-- identity.db — Entities (relocated per DATABASE_ARCHITECTURE.md)
entities (
  id TEXT PRIMARY KEY,
  name TEXT,
  type TEXT NOT NULL,           -- 'person' | 'agent' | 'group' | 'organization' | 'service'
  merged_into TEXT,             -- union-find merge chain (NULL = canonical root)
  normalized TEXT,
  is_user INTEGER,              -- True for owner
  source TEXT,                  -- 'adapter' | 'inferred' | 'manual'
  mention_count INTEGER,
  first_seen INTEGER,
  last_seen INTEGER
);

-- identity.db — Contacts replace the old entity_identities table
contacts (
  platform TEXT NOT NULL,       -- imessage, discord, etc.
  space_id TEXT NOT NULL DEFAULT '',
  contact_id TEXT NOT NULL,     -- +1234567, @atlas_bot
  entity_id TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  contact_name TEXT,
  avatar_url TEXT,
  PRIMARY KEY (platform, space_id, contact_id),
  FOREIGN KEY (entity_id) REFERENCES entities(id)
);

entity_tags (
  entity_id TEXT,
  tag TEXT,
  PRIMARY KEY (entity_id, tag),
  FOREIGN KEY (entity_id) REFERENCES entities(id)
);
```

> **Note (DATABASE_ARCHITECTURE.md):** The old `entity_identities` table is superseded by the `contacts` table, which uses `(platform, space_id, contact_id)` instead of `(channel, identifier)`. Entities, contacts, and entity_tags all live in `identity.db`.

**Key insight:** Personas are entities that OWN identities (bot accounts). People HAVE identities (contact info).

**Memory System enrichment:** The Memory System can learn relationships over time from conversation patterns and update the entities in identity.db.

Persona workspace files (`SOUL.md`, credentials, etc.) remain managed by Nexus workspace — the Identity Ledger handles sender resolution for ACL routing.

---

*This document provides the unified overview of the Access Control System. See individual spec files for detailed schemas and examples.*
