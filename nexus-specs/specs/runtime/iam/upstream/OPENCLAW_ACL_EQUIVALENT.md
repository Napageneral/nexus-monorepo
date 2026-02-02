# OpenClaw (Upstream) ACL Equivalent Behavior

**Status:** REFERENCE  
**Last Updated:** 2026-01-29  
**Source:** OpenClaw (formerly moltbot) codebase

---

## Overview

OpenClaw does NOT have a unified ACL system. Instead, access control and routing are handled through:

1. **Routing Bindings** — Match channel/account/peer to agentId
2. **Channel Policies** — Per-channel access rules (`allowFrom`, `dmPolicy`, `groupPolicy`)
3. **Agent Tool Restrictions** — Per-agent tool allowlists/denylists

This document maps OpenClaw's approach to our ACL design.

---

## 1. Routing Bindings

**Location:** `config.json` → `routing.bindings[]`

```json
{
  "routing": {
    "bindings": [
      {
        "agentId": "work",
        "match": {
          "channel": "whatsapp",
          "accountId": "business",
          "peer": { "kind": "dm", "id": "+15551234567" }
        }
      },
      {
        "agentId": "personal",
        "match": {
          "channel": "discord",
          "guildId": "123456789"
        }
      }
    ]
  }
}
```

**Matching Priority:**
1. Peer-specific (`binding.peer`)
2. Guild/Team (`binding.guild`, `binding.team`)
3. Account (`binding.account`)
4. Channel (`binding.channel`)
5. Default agent fallback

**Nexus ACL Equivalent:**

```yaml
# Our ACL policy achieves the same routing
- name: work-whatsapp
  match:
    principal:
      person_id: work-contact  # Resolved from ledger
    conditions:
      - channel: whatsapp
        account: business
  session:
    persona: work
    key: "whatsapp:{principal.name}"
```

---

## 2. Channel Policies

**Location:** `config.json` → `channels.{channel}.*`

### allowFrom

```json
{
  "channels": {
    "discord": {
      "allowFrom": {
        "mode": "allowlist",
        "list": ["123456789", "987654321"]
      }
    }
  }
}
```

**Nexus ACL Equivalent:**

```yaml
# Explicit allowlist = match principal
- name: discord-allowed-users
  match:
    principal:
      person_id_in: [user-123, user-456]  # From ledger
    conditions:
      - channel: discord
  effect: allow
```

### dmPolicy / groupPolicy

```json
{
  "channels": {
    "telegram": {
      "dmPolicy": "auto",      // auto, manual, none
      "groupPolicy": "none"    // Don't respond in groups
    }
  }
}
```

**Nexus ACL Equivalent:**

```yaml
# Block Telegram groups
- name: telegram-no-groups
  match:
    conditions:
      - channel: telegram
        peer_kind: group
  effect: deny
  priority: 90
```

---

## 3. Agent Tool Restrictions

**Location:** `config.json` → `agents.list[].tools`

```json
{
  "agents": {
    "list": [
      {
        "id": "public",
        "tools": {
          "allowlist": ["web_search", "weather"],
          "denylist": ["shell", "send_email"]
        }
      }
    ]
  }
}
```

**Nexus ACL Equivalent:**

```yaml
# Tools are part of ACL permissions
- name: public-restricted
  match:
    conditions:
      - channel: discord
        account: public-bot
  permissions:
    tools:
      allow: [web_search, weather]
      deny: [shell, send_email, credentials_*]
```

---

## 4. Session Keys

**Source:** `src/routing/session-key.ts`, `src/routing/resolve-route.ts`

OpenClaw session key format:
```
agent:{agentId}:{context}
```

Examples:
- `agent:main:main` — Default DM session
- `agent:main:discord:group:123` — Discord group session
- `agent:work:whatsapp:dm:+15551234567` — Work WhatsApp DM

**Key behavior:**
- DMs collapse to main by default (`dmScope: "main"`)
- Groups always isolated per provider + group ID
- Can configure custom scopes

**Nexus ACL Equivalent:**

```yaml
# Session key templating
session:
  persona: atlas
  key: main                           # DM collapse

session:
  persona: atlas  
  key: "{channel}:group:{peer_id}"    # Group isolation
```

---

## 5. Identity Resolution

**OpenClaw approach:** No unified identity system. Sender matched by raw identifiers in bindings.

**Nexus improvement:** Unified `entities` table with identity resolution:
- Query `entity_identities` by `channel:identifier`
- Get `entity_id` with `type`, `relationship`, `is_user`
- ACL policies match on semantic identity, not raw IDs

---

## 6. Persona Handling

**Source:** `src/agents/identity.ts`, `src/agents/workspace.ts`

OpenClaw personas defined in:
- `config.json` → `agents.list[].identity` (name, emoji, avatar)
- Workspace files: `SOUL.md`, `IDENTITY.md`

**Key insight:** One agent = one persona (no multi-persona per agent).

**Nexus approach:**
- Personas tracked in `entities` table with `type: 'persona'`
- Persona workspace files remain in `~/nexus/state/agents/{id}/`
- ACL routes TO personas based on policies

---

## 7. Permission Grants

**OpenClaw:** No equivalent. Permissions are static per agent/channel.

**Nexus addition:** Dynamic grants with approval workflow:
- Temporary permissions with expiration
- Owner approval flow
- Audit logging

---

## 8. Audit Logging

**OpenClaw:** No comprehensive ACL audit. Some logging in gateway.

**Nexus addition:** Full audit log:
- Every access decision logged
- Principal, policies matched, effect, permissions
- Queryable via CLI

---

## Mapping Summary

| OpenClaw | Nexus ACL |
|----------|-----------|
| `routing.bindings[]` | ACL policies with `match.conditions` |
| `channels.*.allowFrom` | ACL policies with `match.principal` |
| `channels.*.dmPolicy` | ACL policies with `effect: allow/deny` |
| `channels.*.groupPolicy` | ACL policies with `peer_kind: group` |
| `agents.*.tools.allowlist/denylist` | ACL `permissions.tools.allow/deny` |
| Session key construction | ACL `session.key` templating |
| No identity resolution | Unified `entities` table lookup |
| No permission grants | Dynamic grants with approval |
| No audit logging | Full audit log |

---

## Key Improvements Over Upstream

1. **Unified identity** — Query semantic identity, not raw identifiers
2. **Declarative policies** — YAML instead of scattered config
3. **Dynamic grants** — Temporary permissions with approval
4. **Audit trail** — Full visibility into access decisions
5. **GUI-friendly** — Easy to display "who has access"

---

*This document maps OpenClaw's access control to our ACL design for reference.*
