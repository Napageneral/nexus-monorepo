# Access Control Comparison

**Status:** COMPLETE  
**Last Updated:** 2026-02-04

---

## Summary

OpenClaw has **no unified access control system**. Instead, permissions, routing, and identity checks are scattered across multiple subsystems that evolved organically. Nexus replaces this with a **declarative IAM layer** — a single policy file that answers "who can do what" with full auditability.

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Architecture** | 7+ separate systems | Single ACL layer |
| **Configuration** | Scattered JSON | Declarative YAML |
| **Identity** | Raw IDs in config | Semantic identity via ledger |
| **Tool access** | Separate from routing | Unified in policies |
| **Audit trail** | None | Full decision logging |
| **Dynamic access** | None | Grants with approval |

---

## The Fundamental Difference

### OpenClaw: "Where Do I Configure This?"

```
"Who can message?"      → channels.{channel}.allowFrom
"What tools can run?"   → agents.{id}.tools + tools.* + channels.*.groups.*.tools
"Which agent handles?"  → routing.bindings[]
"Who gets elevated?"    → tools.elevated.allowFrom
"Who can run commands?" → commands.allowFrom + channels.*.commands.allowFrom
"Is this sender safe?"  → security audit checks (runtime)
"What about groups?"    → channels.*.groups.{id}.* (nested per-group)
```

**Seven different places.** No single view of "who can do what."

### Nexus: "Read One File"

```yaml
# ~/nexus/state/acl/policies.yaml
- name: partner-access
  match:
    principal:
      relationship: partner
  permissions:
    tools:
      allow: [web_search, calendar_read, smart_home]
      deny: [shell, send_email]
    data: restricted
  session:
    persona: atlas
    key: "partner:{principal.name}"
```

**One policy file.** Every access decision in one place.

---

## Side-by-Side: Scattered Config vs Declarative Policies

### Example 1: Allowing a Trusted Person

**OpenClaw** — Configure in 3+ places:

```json
// config.json - routing
{
  "routing": {
    "bindings": [{
      "agentId": "main",
      "match": { 
        "channel": "telegram", 
        "peer": { "kind": "dm", "id": "123456789" }
      }
    }]
  }
}
```

```json
// config.json - allowlists
{
  "channels": {
    "telegram": {
      "dmPolicy": "allowlist",
      "allowFrom": ["123456789"]
    }
  }
}
```

```json
// config.json - elevated access (optional)
{
  "tools": {
    "elevated": {
      "enabled": true,
      "allowFrom": { "telegram": ["123456789"] }
    }
  }
}
```

**Nexus** — One policy:

```yaml
- name: casey-access
  match:
    principal:
      person_id: casey  # Resolved from ledger
  effect: allow
  permissions:
    tools:
      allow: [web_search, calendar_read, smart_home]
      deny: [shell]
    data: restricted
  session:
    persona: atlas
    key: "partner:casey"
  priority: 80
```

### Example 2: Restricting Group Chats

**OpenClaw** — Configure per-channel, per-group:

```json
{
  "channels": {
    "telegram": {
      "groupPolicy": "allowlist",
      "groups": {
        "-1001234567890": {
          "requireMention": true,
          "tools": {
            "deny": ["shell", "exec", "send_email"]
          },
          "skills": ["chat", "web_search"]
        },
        "*": {
          "requireMention": true,
          "tools": {
            "deny": ["shell", "exec"]
          }
        }
      }
    },
    "discord": {
      "guilds": {
        "987654321": {
          "channels": {
            "*": {
              "tools": { "deny": ["shell"] }
            }
          }
        }
      }
    }
  }
}
```

**Nexus** — One policy covers all groups:

```yaml
- name: group-chat-restrictions
  match:
    conditions:
      - peer_kind: group
  effect: allow
  permissions:
    tools:
      allow: [web_search, weather]
      deny: [shell, send_email, credentials_*]
    data: none
  session:
    persona: atlas
    key: "{channel}:group:{peer_id}"
  priority: 90
```

---

## OpenClaw's Binding Priority Chain (7 Levels)

OpenClaw resolves routing through a hardcoded priority cascade:

```
1. Peer-specific binding     → binding.peer
2. Parent peer (threads)     → binding.peer.parent  
3. Guild (Discord)           → binding.guild
4. Team (Slack)              → binding.team
5. Specific account          → binding.account
6. Channel wildcard          → binding.channel (accountId: "*")
7. Default agent             → fallback
```

**Problem:** Priority order is hardcoded. Can't express "work Slack overrides family member."

**Nexus:** Priority is explicit per-policy (0-100), user-configurable:

```yaml
- name: work-slack
  match:
    conditions:
      - channel: slack
        team: company-workspace
  priority: 85  # Higher than relationship-based policies

- name: family-access
  match:
    principal:
      relationship: family
  priority: 70  # Lower — work context wins
```

---

## Tool Configuration: The Hidden Complexity

### OpenClaw: 6-Level Resolution

Tool access in OpenClaw traverses multiple layers:

```
1. Agent-specific tools.deny     → DENY if matched
2. Agent-specific tools.allow    → ALLOW if matched
3. Channel/group tools.deny      → DENY if matched
4. Global tools.deny             → DENY if matched
5. Global tools.allow            → ALLOW if matched
6. Profile defaults              → Based on "minimal"|"coding"|"full"
7. Default                       → DENY
```

**Config sprawl:**

```json
{
  "tools": {
    "profile": "full",
    "allow": ["read", "write"],
    "deny": ["dangerous_tool"],
    "byProvider": {
      "anthropic/claude-opus-4-5": { "allow": ["*"] }
    }
  },
  "agents": {
    "list": [{
      "id": "public",
      "tools": {
        "allowlist": ["web_search"],
        "denylist": ["shell"]
      }
    }]
  },
  "channels": {
    "telegram": {
      "groups": {
        "-123": {
          "tools": { "deny": ["exec"] }
        }
      }
    }
  }
}
```

### Nexus: Tools Are Just Resources

Tools are unified under the same policy system as other resources:

```yaml
- name: public-restricted
  match:
    conditions:
      - account: public-bot
  permissions:
    tools:
      allow: [web_search, weather]
      deny: ["*"]  # Deny all others
    credentials: []
    data: none
```

**No separate tool configuration.** Same policy governs:
- Who can access
- What tools they can use
- What credentials they can use
- What data level they get

---

## Identity: Raw IDs vs Semantic Resolution

### OpenClaw: Matching Raw Identifiers

```json
{
  "allowFrom": ["123456789", "@johndoe", "+14155551234"]
}
```

Problems:
- No semantic meaning ("who is this?")
- Cross-platform linking requires separate `identityLinks` config
- Can't query relationships
- Display names change, IDs scattered

### Nexus: Identity Ledger

```yaml
match:
  principal:
    relationship: partner      # Query by relationship
    # OR
    tags: [elevated, family]   # Query by tags
    # OR
    person_id: casey           # Query specific entity
```

Resolution flow:

```
Message: { channel: "telegram", from: "123456789" }
                    │
                    ▼
         ┌──────────────────────────┐
         │  Identity Ledger Lookup  │
         │                          │
         │  channel = telegram      │
         │  identifier = 123456789  │
         └──────────────────────────┘
                    │
                    ▼
         Principal: {
           entity_id: "casey",
           name: "Casey",
           relationship: "partner",
           tags: ["trusted", "family"]
         }
```

**Advantage:** Policies express intent ("partners can...") not implementation ("telegram:123 can...").

---

## Dynamic Permissions: Grants

### OpenClaw: Static Only

Permissions are fixed in config. No runtime escalation.

If Casey needs calendar access:
1. You edit config
2. Restart the bot
3. Hope you remember to revert later

### Nexus: Approval-Based Grants

```
Casey: "Can you check Tyler's calendar?"
           │
           ▼
     ACL: Casey lacks calendar_read
           │
           ▼
     Atlas → Tyler: "Casey wants calendar access. Approve?"
           │
           ▼
     Tyler: "Yes, for today"
           │
           ▼
     Grant created:
       principal: casey
       resources: [calendar_read]  
       expires: 24h
       granted_by: owner
```

Grants are:
- Time-limited (auto-expire)
- Audited (who approved what)
- Revocable (owner can cancel)
- First-class (same evaluation as policies)

---

## Audit Trail: The Missing Piece

### OpenClaw: No Comprehensive Audit

- Some logging in gateway
- No queryable access decisions
- Can't answer "why was this denied?"
- No visibility into permission merging

### Nexus: Full Decision Logging

Every access decision logged:

```sql
acl_audit_log (
  timestamp INTEGER,
  event_id TEXT,
  principal_id TEXT,
  principal_name TEXT,
  channel TEXT,
  effect TEXT,              -- allow/deny
  policies_matched TEXT,    -- JSON array
  permissions_result TEXT,  -- Final merged permissions
  session_assigned TEXT,
  grants_applied TEXT,
  processing_ms INTEGER
)
```

Queryable via CLI:

```bash
# Recent denials
nexus acl audit --denied --last 100

# Casey's access history
nexus acl audit --principal casey --since yesterday

# What triggered a specific policy
nexus acl audit --policy "group-chat-restrictions"
```

**Use cases:**
- Debug "why can't X do Y?"
- Security review of access patterns
- Compliance/audit requirements
- Track grant usage

---

## Policy Translation Examples

### Translation 1: Elevated Access

**OpenClaw:**

```json
{
  "tools": {
    "elevated": {
      "enabled": true,
      "allowFrom": {
        "telegram": ["123456789"],
        "discord": ["987654321"]
      }
    }
  }
}
```

**Nexus:**

```yaml
- name: elevated-access
  match:
    principal:
      tags: [elevated]  # Tag set on entities
  permissions:
    tools:
      allow: [shell, exec, write_file]
    credentials: ["*"]
    data: full
  priority: 95
```

### Translation 2: Per-Agent Tool Restrictions

**OpenClaw:**

```json
{
  "agents": {
    "list": [
      {
        "id": "public",
        "tools": {
          "allow": ["web_search", "weather"],
          "deny": ["shell", "exec", "send_email"]
        }
      }
    ]
  }
}
```

**Nexus:**

```yaml
- name: public-persona-defaults
  match:
    conditions:
      - account: public-bot
  permissions:
    tools:
      allow: [web_search, weather]
      deny: ["*"]
  session:
    persona: public
    key: "public:{principal.id}"
  priority: 50
```

### Translation 3: DM Policy

**OpenClaw:**

```json
{
  "channels": {
    "telegram": {
      "dmPolicy": "pairing",
      "allowFrom": ["trusted-user"]
    }
  }
}
```

**Nexus:**

```yaml
# Default deny for unknowns
- name: block-unknown
  match:
    principal:
      unknown: true
  effect: deny
  priority: 10

# Known contacts allowed
- name: known-contacts
  match:
    principal:
      unknown: false
    conditions:
      - peer_kind: dm
  effect: allow
  permissions:
    tools:
      allow: [web_search]
  priority: 50
```

---

## Security Considerations

### OpenClaw's Security Audit System

OpenClaw has runtime security checks, but they're **advisory**:

```typescript
// Finds issues but doesn't enforce
const findings = runSecurityAudit(config);
// findings: [{
//   checkId: "channels.telegram.dm.open",
//   severity: "critical",
//   title: "Telegram DMs are open to everyone"
// }]
```

### Nexus: Security-First by Design

- **Default deny** — No policy match = deny
- **Deny overrides allow** — Any deny wins
- **Pre-hook evaluation** — ACL runs before any code
- **Audit everything** — Every decision logged

```yaml
# Default secure: nothing allowed without explicit policy
# This is implicit, but conceptually:
- name: default-deny
  match: {}  # Matches everything
  effect: deny
  priority: 0
```

---

## Why This Matters

### 1. Auditability

**OpenClaw:** "Why was this message denied?"  
**Answer:** ¯\\\_(ツ)\_/¯ Check 7 config sections

**Nexus:** "Why was this message denied?"  
**Answer:** `nexus acl audit --event-id xyz`

### 2. Single Source of Truth

**OpenClaw:** Permissions scattered across config.json  
**Nexus:** One policies.yaml file, version-controlled, diffable

### 3. GUI-Manageable

**OpenClaw:** Need to understand config structure  
**Nexus:** "Who can access what?" is a table

| Principal | Tools | Data | Session |
|-----------|-------|------|---------|
| Owner | * | full | main |
| Partner | search, calendar | restricted | partner:name |
| Family | search | none | family:name |
| Unknown | — | — | (denied) |

### 4. Tool Unification

**OpenClaw:** Tool access is a separate system from routing/allowlists  
**Nexus:** Tools are resources, same as credentials and data access

```yaml
permissions:
  tools: [web_search, calendar_read]    # Same format
  credentials: [google]                  # Same format
  data: restricted                       # Same evaluation
```

### 5. Dynamic Permissions

**OpenClaw:** Edit config, restart  
**Nexus:** Approve a grant, auto-expires

---

## Migration Path

### Step 1: Extract Identities

```bash
# Find all allowFrom entries
grep -r "allowFrom" config.json

# Create Nexus entities
nexus entity add --name "Casey" --relationship partner \
  --identity telegram:123456789 \
  --identity whatsapp:+14155551234
```

### Step 2: Convert Allowlists to Policies

```yaml
# From: allowFrom: ["123456789"]
# To: Policy matching entity
- name: casey-access
  match:
    principal:
      person_id: casey
  effect: allow
  # ...
```

### Step 3: Consolidate Tool Restrictions

```yaml
# From: scattered tools.* and agents.*.tools
# To: Unified in permissions
- name: persona-defaults
  match:
    conditions:
      - account: public-bot
  permissions:
    tools:
      allow: [web_search]
      deny: ["*"]
```

### Step 4: Enable Audit

```bash
nexus config set acl.audit.enabled true
nexus config set acl.audit.retention 30d
```

---

## Summary Table

| Capability | OpenClaw | Nexus |
|------------|----------|-------|
| **Access control** | 7+ scattered systems | Single ACL layer |
| **Configuration** | Nested JSON | Flat YAML policies |
| **Identity** | Raw IDs | Semantic ledger |
| **Tool access** | Separate config | Unified resources |
| **Routing** | Bindings + priority chain | Policy sessions |
| **Priority** | Hardcoded cascade | User-defined priority |
| **Dynamic access** | None | Grants |
| **Audit** | Minimal | Full decision log |
| **Default** | Varies by subsystem | Deny |
| **GUI readiness** | Low | High |

---

## References

**OpenClaw (Upstream):**
- `../runtime/iam/upstream/OPENCLAW_ACL_EQUIVALENT.md` — Full mapping
- `../runtime/iam/upstream/ALLOWLIST_SYSTEM.md` — Allowlist algorithm
- `../runtime/iam/upstream/ROUTING_RESOLUTION.md` — Binding priority chain
- `../runtime/iam/upstream/SENDER_IDENTITY.md` — Identity per channel

**Nexus:**
- `../runtime/iam/ACCESS_CONTROL_SYSTEM.md` — Unified overview
- `../runtime/iam/POLICIES.md` — Policy schema and examples
- `../runtime/iam/GRANTS.md` — Dynamic permissions
- `../runtime/iam/AUDIT.md` — Decision logging

---

*OpenClaw evolved access control organically. Nexus designs it declaratively.*
