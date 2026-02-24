# OpenClaw Route Resolution

**Status:** REFERENCE  
**Last Updated:** 2026-02-04  
**Source:** `src/routing/resolve-route.ts`, `src/routing/bindings.ts`, `src/routing/session-key.ts`

---

## Overview

Route resolution determines which agent handles an incoming message and what session context it runs in. This document covers the resolution priority chain, binding evaluation, and session key generation.

---

## Route Resolution Priority Chain

When a message arrives, OpenClaw resolves the route through a cascading priority system:

```
┌─────────────────────────────────────────┐
│            Incoming Message             │
│  channel, accountId, peer, guild, team  │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│  Filter bindings by channel + account   │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐     ┌───────────────┐
│  1. Match peer (dm/group/channel + id)  │────▶│ binding.peer  │
└──────────────────┬──────────────────────┘ yes └───────────────┘
                   │ no
                   ▼
┌─────────────────────────────────────────┐     ┌────────────────────┐
│  2. Match parent peer (for threads)     │────▶│ binding.peer.parent│
└──────────────────┬──────────────────────┘ yes └────────────────────┘
                   │ no
                   ▼
┌─────────────────────────────────────────┐     ┌───────────────┐
│  3. Match guildId (Discord)             │────▶│ binding.guild │
└──────────────────┬──────────────────────┘ yes └───────────────┘
                   │ no
                   ▼
┌─────────────────────────────────────────┐     ┌───────────────┐
│  4. Match teamId (Slack)                │────▶│ binding.team  │
└──────────────────┬──────────────────────┘ yes └───────────────┘
                   │ no
                   ▼
┌─────────────────────────────────────────┐     ┌─────────────────┐
│  5. Match specific accountId            │────▶│ binding.account │
└──────────────────┬──────────────────────┘ yes └─────────────────┘
                   │ no
                   ▼
┌─────────────────────────────────────────┐     ┌─────────────────┐
│  6. Match wildcard accountId (*)        │────▶│ binding.channel │
└──────────────────┬──────────────────────┘ yes └─────────────────┘
                   │ no
                   ▼
┌─────────────────────────────────────────┐     ┌───────────────┐
│  7. Fall back to default agent          │────▶│   default     │
└─────────────────────────────────────────┘     └───────────────┘
```

### Priority Order (Most to Least Specific)

1. **Peer-specific** — Exact DM/group ID match
2. **Parent peer** — Thread inherits from parent channel
3. **Guild** — Discord server-wide binding
4. **Team** — Slack workspace-wide binding
5. **Account** — Specific bot account binding
6. **Channel (wildcard)** — Channel-wide binding with `accountId: "*"`
7. **Default** — Fall back to default agent

---

## Binding Structure

Bindings map channel/account/peer combinations to agents:

```typescript
type AgentBinding = {
  agentId: string;
  match: {
    channel?: string;           // telegram, discord, slack, etc.
    accountId?: string;         // Specific account or "*" for any
    peer?: {
      kind?: "dm" | "group" | "channel";
      id?: string;              // Peer ID
      parent?: string;          // Parent channel (for threads)
    };
    guildId?: string;           // Discord-specific
    teamId?: string;            // Slack-specific
  };
};
```

### Configuration Example

```json
{
  "routing": {
    "bindings": [
      {
        "agentId": "work",
        "match": {
          "channel": "slack",
          "teamId": "T12345678"
        }
      },
      {
        "agentId": "personal",
        "match": {
          "channel": "telegram",
          "peer": { "kind": "dm", "id": "+15551234567" }
        }
      },
      {
        "agentId": "gaming",
        "match": {
          "channel": "discord",
          "guildId": "987654321"
        }
      },
      {
        "agentId": "main",
        "match": {
          "channel": "telegram",
          "accountId": "*"
        }
      }
    ]
  }
}
```

---

## Route Resolution Result

```typescript
type ResolvedAgentRoute = {
  agentId: string;          // Resolved agent ID
  channel: string;          // Normalized channel
  accountId: string;        // Normalized account ID
  sessionKey: string;       // Internal session key
  mainSessionKey: string;   // Agent main session key
  matchedBy:                // How the match was made
    | "binding.peer"
    | "binding.peer.parent"
    | "binding.guild"
    | "binding.team"
    | "binding.account"
    | "binding.channel"
    | "default";
};
```

### Resolution Logic

```typescript
function resolveAgentRoute(params: {
  channel: string;
  accountId?: string;
  peerKind?: "dm" | "group" | "channel";
  peerId?: string;
  guildId?: string;
  teamId?: string;
  parentId?: string;
  bindings: AgentBinding[];
  defaultAgentId: string;
}): ResolvedAgentRoute {
  const { channel, accountId, peerKind, peerId, guildId, teamId, parentId } = params;
  
  // Filter bindings to matching channel
  const channelBindings = params.bindings.filter(b => 
    !b.match.channel || b.match.channel === channel
  );
  
  // Filter by account (specific or wildcard)
  const accountBindings = channelBindings.filter(b => {
    if (!b.match.accountId) return true;
    if (b.match.accountId === "*") return true;
    return normalizeAccountId(b.match.accountId) === normalizeAccountId(accountId);
  });
  
  // 1. Try peer-specific binding
  if (peerId) {
    const peerBinding = accountBindings.find(b =>
      b.match.peer?.id === peerId &&
      (!b.match.peer?.kind || b.match.peer.kind === peerKind)
    );
    if (peerBinding) {
      return buildResult(peerBinding, "binding.peer");
    }
  }
  
  // 2. Try parent peer binding (for threads)
  if (parentId) {
    const parentBinding = accountBindings.find(b =>
      b.match.peer?.parent === parentId
    );
    if (parentBinding) {
      return buildResult(parentBinding, "binding.peer.parent");
    }
  }
  
  // 3. Try guild binding (Discord)
  if (guildId) {
    const guildBinding = accountBindings.find(b =>
      b.match.guildId === guildId
    );
    if (guildBinding) {
      return buildResult(guildBinding, "binding.guild");
    }
  }
  
  // 4. Try team binding (Slack)
  if (teamId) {
    const teamBinding = accountBindings.find(b =>
      b.match.teamId === teamId
    );
    if (teamBinding) {
      return buildResult(teamBinding, "binding.team");
    }
  }
  
  // 5. Try specific account binding
  const specificBinding = channelBindings.find(b =>
    b.match.accountId && 
    b.match.accountId !== "*" &&
    normalizeAccountId(b.match.accountId) === normalizeAccountId(accountId)
  );
  if (specificBinding) {
    return buildResult(specificBinding, "binding.account");
  }
  
  // 6. Try channel wildcard binding
  const wildcardBinding = channelBindings.find(b =>
    b.match.accountId === "*"
  );
  if (wildcardBinding) {
    return buildResult(wildcardBinding, "binding.channel");
  }
  
  // 7. Fall back to default
  return buildResult({ agentId: params.defaultAgentId }, "default");
}
```

---

## Session Key Generation

Session keys uniquely identify conversation contexts for state management.

### Key Format

```
agent:{agentId}:{scope}

Examples:
- agent:main:main                              (main session)
- agent:main:dm:+14155551234                   (per-peer DM)
- agent:main:telegram:group:12345678           (group)
- agent:main:discord:channel:987654321         (channel)
- agent:main:slack:default:dm:U12345           (per-account DM)
- agent:main:telegram:default:thread:12345:99  (thread)
```

### DM Session Scope Options

```typescript
type DmScope = 
  | "main"                      // All DMs share main session
  | "per-peer"                  // Per sender, cross-channel
  | "per-channel-peer"          // Per channel + sender
  | "per-account-channel-peer"; // Per account + channel + sender
```

### Scope Examples

| Scope | Key Pattern | Use Case |
|-------|-------------|----------|
| `main` | `agent:main:main` | All DMs collapse to single session |
| `per-peer` | `agent:main:dm:tyler` | Same session for person across channels |
| `per-channel-peer` | `agent:main:telegram:dm:123` | Separate per channel |
| `per-account-channel-peer` | `agent:main:telegram:bot1:dm:123` | Separate per bot account |

### Key Building Logic

```typescript
function buildAgentPeerSessionKey(params: {
  agentId: string;
  mainKey?: string;
  channel: string;
  accountId?: string | null;
  peerKind?: "dm" | "group" | "channel" | null;
  peerId?: string | null;
  dmScope?: DmScope;
  identityLinks?: Record<string, string[]>;
}): string {
  const { agentId, channel, accountId, peerKind, peerId, dmScope } = params;
  const normalizedPeerKind = peerKind ?? "dm";
  
  if (normalizedPeerKind === "dm") {
    const effectiveScope = dmScope ?? "main";
    
    // Resolve linked identity for cross-platform sessions
    let resolvedPeerId = resolveLinkedPeerId(params) || peerId;
    resolvedPeerId = resolvedPeerId?.toLowerCase() || "";
    
    switch (effectiveScope) {
      case "per-account-channel-peer":
        if (resolvedPeerId) {
          const normalizedAccount = normalizeAccountId(accountId);
          return `agent:${agentId}:${channel}:${normalizedAccount}:dm:${resolvedPeerId}`;
        }
        break;
        
      case "per-channel-peer":
        if (resolvedPeerId) {
          return `agent:${agentId}:${channel}:dm:${resolvedPeerId}`;
        }
        break;
        
      case "per-peer":
        if (resolvedPeerId) {
          return `agent:${agentId}:dm:${resolvedPeerId}`;
        }
        break;
    }
    
    // Fall through to main session
    return buildAgentMainSessionKey({ agentId, mainKey: params.mainKey });
  }
  
  // Group/channel sessions always isolated
  const normalizedChannel = channel || "unknown";
  const normalizedPeerId = peerId?.toLowerCase() || "unknown";
  return `agent:${agentId}:${normalizedChannel}:${normalizedPeerKind}:${normalizedPeerId}`;
}

function buildAgentMainSessionKey(params: {
  agentId: string;
  mainKey?: string;
}): string {
  const mainKey = params.mainKey || "main";
  return `agent:${params.agentId}:${mainKey}`;
}
```

---

## Thread Session Keys

Threads have special handling:

```typescript
function buildThreadSessionKey(params: {
  agentId: string;
  channel: string;
  accountId?: string;
  parentId: string;
  threadId: string;
}): string {
  const account = normalizeAccountId(params.accountId) || "default";
  return `agent:${params.agentId}:${params.channel}:${account}:thread:${params.parentId}:${params.threadId}`;
}
```

### Thread Inheritance

Threads can inherit from parent channel sessions:

```
Parent channel: agent:main:discord:channel:123
Thread:         agent:main:discord:default:thread:123:456
```

Thread sessions are isolated but can reference parent context.

---

## Identity Links for Session Routing

Identity links enable cross-platform session continuity:

```yaml
session:
  dmScope: "per-peer"
  identityLinks:
    tyler:
      - telegram:12345678
      - whatsapp:+14155551234
      - discord:987654321
```

### Resolution

```typescript
function resolveLinkedPeerId(params: {
  channel: string;
  peerId?: string;
  identityLinks?: Record<string, string[]>;
}): string | null {
  if (!params.identityLinks || !params.peerId) return null;
  
  const fullId = `${params.channel}:${params.peerId.toLowerCase()}`;
  
  for (const [canonical, identities] of Object.entries(params.identityLinks)) {
    if (identities.map(i => i.toLowerCase()).includes(fullId)) {
      return canonical;
    }
  }
  
  return null;
}
```

### Effect on Session Keys

```
Without identity links:
- Telegram DM from 123: agent:main:telegram:dm:123
- Discord DM from 987:  agent:main:discord:dm:987
(Two separate sessions)

With identity links (canonical: "tyler"):
- Telegram DM from 123: agent:main:dm:tyler
- Discord DM from 987:  agent:main:dm:tyler
(Same session - continuous conversation)
```

---

## Mapping to Nexus IAM

### Route Resolution → Policy Matching

OpenClaw:
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

Nexus IAM:
```yaml
- name: work-slack-routing
  match:
    conditions:
      - channel: slack
        account: T12345
  effect: allow
  session:
    persona: work
    key: work
  priority: 85
```

### Session Key → Policy Session Assignment

OpenClaw builds session keys procedurally. Nexus assigns via policy:

```yaml
session:
  persona: atlas
  key: "{channel}:group:{peer_id}"   # Template-based
```

### Key Differences

| Aspect | OpenClaw | Nexus IAM |
|--------|----------|-----------|
| Resolution | Procedural code | Declarative policies |
| Priority | Hardcoded order | Configurable priority |
| Session assignment | Computed | Policy template |
| Identity links | Config-based | Ledger-based |

---

## Binding Lookup Utilities

### List Bound Account IDs

```typescript
function listBoundAccountIds(cfg: Config, channelId: string): string[] {
  const ids = new Set<string>();
  
  for (const binding of listBindings(cfg)) {
    if (binding.match.channel === channelId) {
      const accountId = binding.match.accountId?.trim();
      if (accountId && accountId !== "*") {
        ids.add(normalizeAccountId(accountId));
      }
    }
  }
  
  return Array.from(ids).sort();
}
```

### Check if Agent Has Binding

```typescript
function agentHasBinding(
  bindings: AgentBinding[],
  agentId: string,
  channel: string
): boolean {
  return bindings.some(b =>
    b.agentId === agentId &&
    (!b.match.channel || b.match.channel === channel)
  );
}
```

---

## Recommendations for Nexus

1. **Unified resolution** — Combine identity + routing in single policy pass
2. **Explicit priority** — User-configurable priority beats hardcoded order
3. **Audit routing decisions** — Log why each route was selected
4. **Template-based sessions** — More flexible than procedural key building
5. **Persona-aware routing** — Route to persona, not just agent

---

*This document maps OpenClaw's route resolution for Nexus IAM reference.*
