# OpenClaw (Upstream) IAM Reference

**Status:** REFERENCE  
**Last Updated:** 2026-02-04  
**Source:** OpenClaw codebase (`~/nexus/home/projects/openclaw/src/`)

---

## Overview

This directory documents OpenClaw's access control and routing mechanisms as reference material for Nexus IAM design. OpenClaw does NOT have a unified IAM system—instead, access control is distributed across several interconnected subsystems.

### OpenClaw's Approach

OpenClaw handles access control through **inline configuration** rather than **declarative policies**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    OpenClaw Access Control                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │    Allowlists    │  │   DM/Group       │  │   Mention    │  │
│  │   (per-channel)  │  │    Policies      │  │    Gating    │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────┬───────┘  │
│           │                     │                    │          │
│           └─────────────────────┼────────────────────┘          │
│                                 ▼                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Routing Bindings                       │  │
│  │            (channel/account/peer → agent)                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                 │                               │
│                                 ▼                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Per-Agent Tool Restrictions              │  │
│  │                  (allowlist/denylist per agent)           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Nexus IAM Improvement

Nexus consolidates these into a **declarative policy layer**:

| OpenClaw | Nexus IAM |
|----------|-----------|
| Scattered config across `channels.*`, `routing.*`, `agents.*` | Unified YAML policies |
| Match by raw identifiers | Match by semantic identity (via ledger) |
| No permission grants | Dynamic grants with approval workflow |
| Minimal audit logging | Full audit trail |
| GUI-unfriendly | Designed for visual management |

---

## Documents in This Directory

| Document | Description |
|----------|-------------|
| **[ALLOWLIST_SYSTEM.md](./ALLOWLIST_SYSTEM.md)** | Allowlist matching algorithm, DM/group policy modes, pattern formats |
| **[SENDER_IDENTITY.md](./SENDER_IDENTITY.md)** | How sender identity is resolved per channel, normalization, identity links |
| **[ROUTING_RESOLUTION.md](./ROUTING_RESOLUTION.md)** | Route resolution priority chain, session key generation, binding evaluation |
| **[OPENCLAW_ACL_EQUIVALENT.md](./OPENCLAW_ACL_EQUIVALENT.md)** | Mapping OpenClaw config to Nexus ACL policies |
| **[ROUTING_HOOKS.md](./ROUTING_HOOKS.md)** | TypeScript routing hooks for programmatic access control |

---

## Key Concepts

### 1. Allowlists

OpenClaw uses per-channel allowlists to control who can interact:

```json
{
  "channels": {
    "telegram": {
      "allowFrom": ["123456789", "@username"],
      "dmPolicy": "allowlist"
    }
  }
}
```

**Matching priority:** Direct ID → Normalized → Parent (thread→channel) → Wildcard

See [ALLOWLIST_SYSTEM.md](./ALLOWLIST_SYSTEM.md) for full algorithm.

### 2. DM/Group Policies

Four policy modes control response behavior:

| Mode | DM Behavior | Group Behavior |
|------|-------------|----------------|
| `pairing` | Unknown senders get pairing code | N/A |
| `allowlist` | Only allowed senders | Only allowed groups |
| `open` | Accept all | Accept all (requires explicit config) |
| `disabled` | Block all | Block all |

### 3. Routing Bindings

Bindings map channel contexts to specific agents:

```json
{
  "routing": {
    "bindings": [
      {
        "agentId": "work",
        "match": { "channel": "slack", "teamId": "T12345" }
      }
    ]
  }
}
```

See [ROUTING_RESOLUTION.md](./ROUTING_RESOLUTION.md) for priority chain.

### 4. Sender Identity

Each channel resolves sender identity differently:

| Channel | Primary ID | Secondary | Normalization |
|---------|-----------|-----------|---------------|
| Telegram | User ID | @username | Lowercase |
| Discord | User ID | Username#tag | Discord slug |
| WhatsApp | E.164 phone | — | Phone normalization |
| Slack | User ID | Display name | Slack slug |
| Signal | E.164 phone | — | Phone normalization |
| iMessage | Phone/email | — | E.164 or lowercase email |

See [SENDER_IDENTITY.md](./SENDER_IDENTITY.md) for details.

### 5. Session Keys

Sessions isolate conversation contexts:

```
agent:{agentId}:{scope}

Examples:
- agent:main:main              (collapsed DM session)
- agent:main:dm:+14155551234   (per-peer DM)
- agent:main:discord:group:123 (group session)
```

---

## Source Files Reference

### Channels Layer

| File | Purpose |
|------|---------|
| `src/channels/registry.ts` | Channel ID ordering, aliases |
| `src/channels/dock.ts` | Channel capabilities metadata |
| `src/channels/allowlist-match.ts` | Allowlist match types |
| `src/channels/channel-config.ts` | Channel entry matching algorithm |
| `src/channels/mention-gating.ts` | Mention requirement logic |
| `src/channels/command-gating.ts` | Command authorization |
| `src/channels/sender-identity.ts` | Sender validation |

### Routing Layer

| File | Purpose |
|------|---------|
| `src/routing/bindings.ts` | Agent-channel bindings |
| `src/routing/resolve-route.ts` | Route resolution |
| `src/routing/session-key.ts` | Session key generation |

### Security Layer

| File | Purpose |
|------|---------|
| `src/security/audit.ts` | Security auditing |
| `src/security/external-content.ts` | Untrusted content handling |
| `src/security/fix.ts` | Automated security fixes |

### Configuration

| File | Purpose |
|------|---------|
| `src/config/types.channels.ts` | Channel config types |
| `src/config/types.tools.ts` | Tool restriction types |
| `src/config/zod-schema.providers.ts` | Channel validation |

---

## The Shift: Inline → Declarative

### Before (OpenClaw)

Access control is scattered:

```json
{
  "channels": {
    "telegram": {
      "allowFrom": ["123456"],
      "dmPolicy": "allowlist",
      "groups": {
        "-100123": { "requireMention": true }
      }
    }
  },
  "routing": {
    "bindings": [{ "agentId": "main", "match": {...} }]
  },
  "agents": {
    "list": [{
      "id": "main",
      "tools": { "deny": ["shell"] }
    }]
  }
}
```

### After (Nexus IAM)

Unified declarative policies:

```yaml
policies:
  - name: telegram-dm-access
    match:
      principal:
        person_id_in: [user-123, user-456]
      conditions:
        - channel: telegram
          peer_kind: dm
    effect: allow
    permissions:
      tools:
        allow: [web_search, weather]
        deny: [shell, send_email]
    session:
      persona: atlas
      key: "telegram:{principal.name}"
```

### Benefits

1. **Single source of truth** — All access rules in one place
2. **Identity-based matching** — Query semantic identity, not raw IDs
3. **Composable permissions** — Multiple policies merge predictably
4. **Audit trail** — Every decision logged
5. **GUI-friendly** — Easy to visualize "who has access"
6. **Dynamic grants** — Temporary permissions with approval

---

## Related Specs

| Spec | Relationship |
|------|--------------|
| **../README.md** | Nexus IAM overview |
| **../ACCESS_CONTROL_SYSTEM.md** | Unified access control design |
| **../POLICIES.md** | Nexus policy schema |
| **../../upstream/CHANNELS_ACCESS.md** | Comprehensive channel/access reference |
| **../../upstream/CONFIGURATION.md** | OpenClaw config structure |

---

*This directory serves as upstream reference for Nexus IAM design. The goal is to understand OpenClaw's approach to inform a cleaner, unified system.*
