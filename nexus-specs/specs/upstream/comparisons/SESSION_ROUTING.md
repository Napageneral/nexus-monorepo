# Session Routing: OpenClaw vs Nexus

**Status:** COMPARISON  
**Last Updated:** 2026-02-04  
**References:**
- OpenClaw: `specs/runtime/iam/upstream/ROUTING_RESOLUTION.md`, `specs/runtime/broker/upstream/SESSION_MANAGEMENT.md`
- Nexus: `specs/runtime/iam/ACCESS_CONTROL_SYSTEM.md`, `specs/runtime/iam/POLICIES.md`, `specs/runtime/broker/DATA_MODEL.md`

---

## Summary

OpenClaw routes messages through a **7-level binding priority chain** — an imperative, config-driven system that checks each level in order until a match is found. Nexus replaces this with **policy-driven session assignment** where routing is part of access resolution, not a separate system.

**The key difference:** OpenClaw asks "which binding matches first?" while Nexus asks "which policy applies, and what session does it assign?"

---

## OpenClaw: The 7-Level Binding Chain

When a message arrives, OpenClaw cascades through binding levels until one matches:

```
┌─────────────────────────────────────────┐
│            Incoming Message             │
│  channel, accountId, peer, guild, team  │
└──────────────────┬──────────────────────┘
                   ▼
        Filter bindings by channel + account
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  PRIORITY 1: Peer binding                                    │
│  Match: peer.id + peer.kind (dm/group/channel)              │
│  Result: Most specific — DM or group session                 │
└──────────────────────────────────────────────────────────────┘
                   ▼ (no match)
┌──────────────────────────────────────────────────────────────┐
│  PRIORITY 2: Parent peer binding (threads)                   │
│  Match: peer.parent (parent channel ID)                      │
│  Result: Thread inherits from parent channel's binding       │
└──────────────────────────────────────────────────────────────┘
                   ▼ (no match)
┌──────────────────────────────────────────────────────────────┐
│  PRIORITY 3: Guild binding (Discord)                         │
│  Match: guildId                                              │
│  Result: Discord server-wide binding                         │
└──────────────────────────────────────────────────────────────┘
                   ▼ (no match)
┌──────────────────────────────────────────────────────────────┐
│  PRIORITY 4: Team binding (Slack)                            │
│  Match: teamId                                               │
│  Result: Slack workspace-wide binding                        │
└──────────────────────────────────────────────────────────────┘
                   ▼ (no match)
┌──────────────────────────────────────────────────────────────┐
│  PRIORITY 5: Account binding                                 │
│  Match: specific accountId                                   │
│  Result: All messages to a specific bot account              │
└──────────────────────────────────────────────────────────────┘
                   ▼ (no match)
┌──────────────────────────────────────────────────────────────┐
│  PRIORITY 6: Channel binding (wildcard)                      │
│  Match: channel + accountId: "*"                             │
│  Result: Channel-wide default                                │
└──────────────────────────────────────────────────────────────┘
                   ▼ (no match)
┌──────────────────────────────────────────────────────────────┐
│  PRIORITY 7: Default                                         │
│  Match: (always)                                             │
│  Result: Fall back to default agent                          │
└──────────────────────────────────────────────────────────────┘
```

### Binding Configuration Example

```json
{
  "routing": {
    "bindings": [
      {
        "agentId": "work",
        "match": { "channel": "slack", "teamId": "T12345678" }
      },
      {
        "agentId": "personal",
        "match": { "channel": "telegram", "peer": { "kind": "dm", "id": "+15551234567" } }
      },
      {
        "agentId": "gaming",
        "match": { "channel": "discord", "guildId": "987654321" }
      },
      {
        "agentId": "main",
        "match": { "channel": "telegram", "accountId": "*" }
      }
    ]
  }
}
```

### Problems with This Approach

1. **Hardcoded priority** — Can't express "team binding should override guild binding for this user"
2. **Routing separate from access** — Two systems to understand and debug
3. **Not auditable** — Bindings are config, not logged decisions
4. **Agent-centric** — Routes to agents, not sessions with permissions

---

## Nexus: Policy-Driven Session Assignment

Nexus collapses routing into the ACL policy system. Policies match principals and conditions, then assign session routing directly:

```yaml
- name: work-slack-routing
  description: Work Slack gets work context
  
  match:
    principal:
      is_user: true
    conditions:
      - channel: slack
        account: company-workspace
  
  effect: allow
  
  permissions:
    tools: [web_search, github, jira]
    credentials: [github, jira]
  
  session:
    persona: atlas
    key: work
  
  priority: 85
```

### How Policies Replace Bindings

| OpenClaw Binding | Nexus Policy Equivalent |
|------------------|-------------------------|
| Peer binding | `conditions: [{ channel: X, peer_id: Y }]` + `session.key` template |
| Guild binding | `conditions: [{ channel: discord, guild: X }]` |
| Team binding | `conditions: [{ channel: slack, account: X }]` |
| Account binding | `conditions: [{ account: X }]` |
| Channel binding | `conditions: [{ channel: X }]` |
| Default | Low-priority catch-all policy |

### Example: Guild Binding as Policy

OpenClaw:
```json
{
  "agentId": "gaming",
  "match": { "channel": "discord", "guildId": "987654321" }
}
```

Nexus:
```yaml
- name: gaming-discord
  match:
    conditions:
      - channel: discord
        guild: "987654321"
  effect: allow
  session:
    persona: atlas
    key: "discord:guild:987654321"
  priority: 70
```

### Advantages

1. **Configurable priority** — `priority: 70` can be tuned per-policy
2. **Unified with access control** — One system for WHO, WHAT, and WHERE
3. **Auditable** — Every routing decision is logged with matching policies
4. **Principal-aware** — Can route differently for owner vs friends vs unknown

---

## Session Key Format (Keeping What Works)

Both systems use similar session key formats. This is a battle-tested pattern worth preserving.

### Key Structure

```
agent:{agentId}:{scope}

Examples:
- agent:main:main                           # Main session
- agent:main:dm:tyler                       # Per-peer DM
- agent:main:telegram:dm:123456789          # Per-channel-peer DM
- agent:main:discord:group:987654321        # Group session
- agent:main:slack:channel:C12345           # Channel session
- agent:main:telegram:thread:123:456        # Thread session
```

### Nexus Equivalent

Policies use templated `session.key` values:

```yaml
session:
  persona: atlas
  key: "{channel}:group:{peer_id}"    # → "discord:group:987654321"
```

The underlying key format remains compatible:

```
{persona}:{key}

Examples:
- atlas:main
- atlas:family:casey
- atlas:discord:group:987654321
```

### Template Variables

| Variable | Source | Example |
|----------|--------|---------|
| `{principal.name}` | Identity ledger lookup | `casey` |
| `{principal.id}` | Entity ID | `entity_abc123` |
| `{channel}` | Event channel | `discord` |
| `{peer_id}` | Group/channel ID | `987654321` |
| `{account}` | Account identifier | `work-slack` |
| `{guild}` | Discord guild ID | `987654321` |

---

## DM Scoping: Does Nexus Keep This?

**Yes, but it's expressed through policies rather than config.**

### OpenClaw DM Scopes

```yaml
session:
  dmScope: "per-peer"  # main | per-peer | per-channel-peer | per-account-channel-peer
```

| Scope | Session Key Pattern | Behavior |
|-------|---------------------|----------|
| `main` | `agent:main:main` | All DMs share one session |
| `per-peer` | `agent:main:dm:{peerId}` | Isolated per person, cross-channel |
| `per-channel-peer` | `agent:main:{channel}:dm:{peerId}` | Isolated per channel + person |
| `per-account-channel-peer` | `agent:main:{account}:{channel}:dm:{peerId}` | Full isolation |

### Nexus Policy-Based Scoping

Instead of a config option, you express scoping intent through session key templates:

**Main (all DMs collapse):**
```yaml
- name: owner-main-session
  match:
    principal:
      is_user: true
    conditions:
      - peer_kind: dm
  session:
    persona: atlas
    key: main
  priority: 100
```

**Per-peer (cross-channel identity):**
```yaml
- name: friend-per-peer-session
  match:
    principal:
      relationship: friend
    conditions:
      - peer_kind: dm
  session:
    persona: atlas
    key: "friend:{principal.name}"
  priority: 60
```

**Per-channel-peer (full isolation):**
```yaml
- name: unknown-isolated-session
  match:
    principal:
      unknown: true
    conditions:
      - peer_kind: dm
  session:
    persona: atlas
    key: "unknown:{channel}:{principal.id}"
  priority: 20
```

### Identity Links

OpenClaw's identity links (mapping platform IDs to canonical identities) maps to Nexus's Identity Ledger:

OpenClaw:
```yaml
session:
  identityLinks:
    tyler:
      - telegram:12345678
      - discord:987654321
```

Nexus:
```sql
-- Identity Ledger handles this
entity_identities (
  entity_id: "entity_tyler",
  channel: "telegram", identifier: "12345678"
);
entity_identities (
  entity_id: "entity_tyler",
  channel: "discord", identifier: "987654321"
);
```

When resolving a principal, the ledger query returns the canonical identity, which policies can then reference via `{principal.name}` or `{principal.id}`.

---

## Why This Matters

### 1. Routing Becomes Auditable

Every access decision is logged:

```json
{
  "event_id": "evt_123",
  "principal": { "name": "Casey", "relationship": "partner" },
  "matching_policies": ["partner-access", "group-chat-restrictions"],
  "effect": "allow",
  "session": { "persona": "atlas", "key": "discord:group:123" },
  "matched_by": "group-chat-restrictions (priority 90)"
}
```

You can query: "Why did Casey's message go to this session?"

### 2. Policies Express Intent Clearly

OpenClaw binding:
```json
{ "agentId": "work", "match": { "channel": "slack", "teamId": "T12345" } }
```

This tells you WHERE but not WHY or WHAT permissions apply.

Nexus policy:
```yaml
- name: work-context
  description: Work Slack gets work-scoped access
  match:
    conditions:
      - channel: slack
        account: company-workspace
  effect: allow
  permissions:
    tools: [github, jira, web_search]
    credentials: [github, jira]
  session:
    persona: atlas
    key: work
```

This tells you WHO, WHAT, WHERE, and WHY in one place.

### 3. Simpler Mental Model

**OpenClaw:**
- Bindings system (7 priority levels) → Determines agent
- Session key building (dmScope, identityLinks) → Determines session
- Config-based, procedural resolution

**Nexus:**
- Policy system → Determines access + permissions + session
- Single declarative system with configurable priority

### 4. Principal-Aware Routing

OpenClaw bindings don't consider WHO is sending — they route based on channel/account/peer structure only.

Nexus policies can route differently based on principal:

```yaml
# Owner in Discord group: full access, main session
- name: owner-discord-group
  match:
    principal:
      is_user: true
    conditions:
      - channel: discord
        peer_kind: group
  session:
    key: main
  priority: 100

# Friend in same group: restricted, isolated session
- name: friend-discord-group
  match:
    principal:
      relationship: friend
    conditions:
      - channel: discord
        peer_kind: group
  session:
    key: "discord:group:{peer_id}"
  priority: 70
```

Same channel, different routing based on who's talking.

---

## Migration Path

| OpenClaw Concept | Nexus Equivalent | Action |
|------------------|------------------|--------|
| Binding priority chain | Policy priority | Convert bindings to policies with explicit priorities |
| `dmScope` config | Session key templates | Express scoping through `{principal.name}`, `{channel}`, etc. |
| `identityLinks` | Identity Ledger | Migrate to `entity_identities` table |
| Agent routing | Persona + session routing | Route to persona with session key |
| Session key format | Keep format, generate via templates | Session keys remain compatible |

---

## Comparison Table

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Resolution type** | Procedural (check each level) | Declarative (match policies) |
| **Priority system** | Hardcoded 7 levels | Configurable 0-100 |
| **Principal awareness** | No | Yes |
| **Routes to** | Agent | Persona + Session |
| **Permissions** | Separate config | Same policy |
| **Auditability** | Config-based, not logged | Every decision logged |
| **Session keys** | Procedural building | Template-based |
| **Identity links** | Config file | Identity Ledger |
| **DM scoping** | `dmScope` enum | Session key templates |

---

## What We're Keeping

1. **Session key format** — The `agent:{id}:{scope}` pattern is battle-tested and works well
2. **DM scoping concepts** — The main/per-peer/per-channel-peer model is sound
3. **Identity linking** — Cross-platform identity resolution is valuable (moved to ledger)
4. **Thread handling** — Thread sessions inheriting from parent is useful

## What We're Replacing

1. **Binding priority chain** — Replaced by policy priorities
2. **Separate routing system** — Merged into ACL policies
3. **Config-driven** — Replaced by policy-driven
4. **Agent-centric routing** — Replaced by persona + session routing

---

*This comparison documents the session routing evolution from OpenClaw to Nexus. The key insight: routing is access control, not a separate system.*
