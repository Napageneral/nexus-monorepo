# Routing Hooks & Permission System

**Status:** DESIGN SPEC (DRAFT)  
**Last Updated:** 2026-01-29  
**Related:** EVENT_SYSTEM_DESIGN.md, ONTOLOGY.md

---

## Executive Summary

This document specifies how incoming events are routed to personas and sessions with appropriate permissions. The routing system determines:

1. **Which persona** handles the event
2. **Which session** within that persona
3. **What permissions** the sender has

This enables fine-grained access control where different senders (you, family, strangers) get different capabilities when interacting with your agents.

---

## Core Concepts

### Routing Decision

Every event that triggers an agent must resolve to:

```typescript
interface RoutingDecision {
  persona: string;              // Which agent persona handles this
  session: string;              // Which session within the persona
  permissions: PermissionSet;   // What the sender can do
  deliveryContext: DeliveryContext;  // How to respond
}
```

### Permission Set

```typescript
interface PermissionSet {
  level: 'full' | 'restricted' | 'group' | 'minimal';
  
  tools: {
    allow?: string[];          // Whitelist (use '*' for all)
    deny?: string[];           // Blacklist (overrides allow)
  };
  
  credentials?: string[];      // Which credentials are accessible
  
  // Future: more granular controls
  canReadMessages?: boolean;
  canSendExternal?: boolean;
  canAccessFiles?: string[];   // Glob patterns
}
```

### Delivery Context

Preserved from the original event for response routing:

```typescript
interface DeliveryContext {
  channel: string;             // imessage, discord, telegram, etc.
  accountId?: string;          // Which account (for multi-account)
  peerId?: string;             // Group/channel ID for groups
  threadId?: string;           // Thread within group
  replyToId?: string;          // Message to reply to
}
```

---

## Routing Hook Interface

Routing hooks are TypeScript functions that evaluate events and return routing decisions:

```typescript
interface RoutingHookContext {
  event: CortexEvent;        // The incoming event
  cortex: CortexClient;    // For querying contacts, history
  now: Date;
}

interface RoutingHookResult {
  fire: boolean;               // Whether this hook handles the event
  
  routing?: {
    persona: string;
    session: string;
  };
  
  permissions?: PermissionSet;
  
  deliveryContext?: DeliveryContext;
}
```

---

## Example Routing Hooks

### Owner Full Access (Tyler → Atlas)

Routes the owner's DMs to main session with full permissions.

```typescript
/**
 * @name owner-full-access
 * @description Route owner DMs to main session with full permissions
 * @priority 100
 */
export default async function(ctx: RoutingHookContext): Promise<RoutingHookResult> {
  const { event, cortex } = ctx;
  
  // Only handle DMs
  if (event.peerKind !== 'dm') return { fire: false };
  
  // Check if sender is owner
  // Option 1: Hardcoded IDs
  const ownerIds = [
    'imessage:+17072876731',
    'discord:tyler#1234',
    'telegram:@tyler',
    'whatsapp:+17072876731'
  ];
  
  // Option 2: Query cortex contacts (preferred)
  // const owner = await cortex.query({ 
  //   table: 'people', 
  //   where: { is_user: true } 
  // });
  // const ownerIds = owner.identities;
  
  const senderId = `${event.channel}:${event.from}`;
  
  if (!ownerIds.includes(senderId)) return { fire: false };
  
  return {
    fire: true,
    routing: {
      persona: 'atlas',
      session: 'main',
    },
    permissions: {
      level: 'full',
      tools: { allow: ['*'] },
      credentials: ['*'],
    },
    deliveryContext: {
      channel: event.channel,
      accountId: event.accountId,
      replyToId: event.id,
    }
  };
}
```

### Family Restricted Access

Routes family member DMs with restricted permissions.

```typescript
/**
 * @name family-restricted-access
 * @description Route family DMs with restricted permissions
 * @priority 90
 */
export default async function(ctx: RoutingHookContext): Promise<RoutingHookResult> {
  const { event, cortex } = ctx;
  
  if (event.peerKind !== 'dm') return { fire: false };
  
  // Family identity mapping
  // Could also query: await cortex.query({ table: 'people', where: { relationship: 'family' } })
  const familyIdentities: Record<string, string[]> = {
    'casey': ['imessage:+15551234567', 'telegram:@casey', 'whatsapp:+15551234567'],
    'mom': ['imessage:+15559876543'],
    'dad': ['imessage:+15558765432'],
  };
  
  const senderId = `${event.channel}:${event.from}`;
  
  // Find which family member this is
  const familyMember = Object.entries(familyIdentities)
    .find(([_, ids]) => ids.includes(senderId))?.[0];
  
  if (!familyMember) return { fire: false };
  
  return {
    fire: true,
    routing: {
      persona: 'atlas',
      session: `family:${familyMember}`,  // Isolated session per family member
    },
    permissions: {
      level: 'restricted',
      tools: {
        allow: ['web_search', 'read_file', 'weather', 'calendar_read'],
        deny: ['send_email', 'read_messages', 'credentials_*', 'shell', 'write_file'],
      },
      credentials: [],  // No credential access
      canReadMessages: false,
      canSendExternal: false,
    },
    deliveryContext: {
      channel: event.channel,
      accountId: event.accountId,
      replyToId: event.id,
    }
  };
}
```

### Group Chat Routing

Routes group chats to isolated sessions with context-aware permissions.

```typescript
/**
 * @name group-chat-routing
 * @description Route group chats to isolated sessions
 * @priority 80
 */
export default async function(ctx: RoutingHookContext): Promise<RoutingHookResult> {
  const { event, cortex } = ctx;
  
  if (event.peerKind !== 'group') return { fire: false };
  
  // Build session key from channel + group ID
  const sessionKey = `${event.channel}:group:${event.peerId}`;
  
  // Check if sender is owner (for permission level)
  const ownerIds = ['discord:tyler#1234', 'telegram:@tyler'];
  const senderId = `${event.channel}:${event.from}`;
  const isOwner = ownerIds.includes(senderId);
  
  // Owner gets more permissions even in groups
  const permissions: PermissionSet = isOwner ? {
    level: 'full',
    tools: { allow: ['*'] },
    credentials: ['*'],
  } : {
    level: 'group',
    tools: {
      allow: ['web_search', 'read_file', 'weather'],
      deny: ['send_email', 'credentials_*', 'read_messages', 'shell'],
    },
    credentials: [],
    canReadMessages: false,
    canSendExternal: false,
  };
  
  return {
    fire: true,
    routing: {
      persona: 'atlas',
      session: sessionKey,
    },
    permissions,
    deliveryContext: {
      channel: event.channel,
      peerId: event.peerId,
      threadId: event.threadId,
      replyToId: event.id,
    }
  };
}
```

### Work Context Routing

Routes work-related channels to work persona/session.

```typescript
/**
 * @name work-context-routing
 * @description Route work Slack/Discord to work session
 * @priority 85
 */
export default async function(ctx: RoutingHookContext): Promise<RoutingHookResult> {
  const { event } = ctx;
  
  // Work channel detection
  const workChannels = [
    { channel: 'slack', accountId: 'company-workspace' },
    { channel: 'discord', guildId: '987654321' },  // Work Discord server
  ];
  
  const isWorkChannel = workChannels.some(w => 
    w.channel === event.channel && 
    (w.accountId === event.accountId || w.guildId === event.guildId)
  );
  
  if (!isWorkChannel) return { fire: false };
  
  return {
    fire: true,
    routing: {
      persona: 'atlas',
      session: 'work',  // Dedicated work session
    },
    permissions: {
      level: 'full',  // Full access for work
      tools: { allow: ['*'] },
      credentials: ['github', 'jira', 'slack'],  // Work credentials only
    },
    deliveryContext: {
      channel: event.channel,
      accountId: event.accountId,
      peerId: event.peerId,
      threadId: event.threadId,
    }
  };
}
```

### Unknown Sender Fallback

Catch-all for unknown senders with minimal permissions.

```typescript
/**
 * @name unknown-sender-fallback
 * @description Minimal permissions for unknown senders
 * @priority 0
 */
export default async function(ctx: RoutingHookContext): Promise<RoutingHookResult> {
  const { event } = ctx;
  
  // This is the fallback - always fires if nothing else matched
  return {
    fire: true,
    routing: {
      persona: 'atlas',
      session: `unknown:${event.channel}:${event.from}`,
    },
    permissions: {
      level: 'minimal',
      tools: {
        allow: ['web_search'],  // Only web search
        deny: ['*'],
      },
      credentials: [],
      canReadMessages: false,
      canSendExternal: false,
    },
    deliveryContext: {
      channel: event.channel,
      replyToId: event.id,
    }
  };
}
```

---

## Hook Evaluation Order

Hooks are evaluated by priority (highest first). First hook that returns `fire: true` wins.

```
Event arrives
     │
     ▼
┌─────────────────────────────────┐
│ Evaluate hooks by priority      │
│                                 │
│ 100: owner-full-access          │ ← Check first
│  90: family-restricted-access   │
│  85: work-context-routing       │
│  80: group-chat-routing         │
│   0: unknown-sender-fallback    │ ← Catch-all
└─────────────────────────────────┘
     │
     ▼
First hook with fire=true → RoutingDecision
     │
     ▼
Broker routes to persona/session with permissions
```

---

## Integration with Cortex Contacts

For cleaner identity management, hooks can query Cortex's people/contacts tables:

```typescript
// Query owner
const owner = await cortex.query({
  table: 'people',
  where: { is_user: true },
  include: ['identities']
});

// Query by relationship
const family = await cortex.query({
  table: 'people', 
  where: { relationship: 'family' },
  include: ['identities']
});

// Check if sender matches any identity
const person = await cortex.findPersonByIdentity(senderId);
if (person?.relationship === 'family') {
  // Apply family permissions
}
```

This decouples identity management from hook code.

---

## Routing Rules vs Hooks (Future Consideration)

**Current approach:** All routing is done via hooks (TypeScript scripts).

**Potential split:**

| Concern | Mechanism | Format |
|---------|-----------|--------|
| **Routing Rules** | Declarative config | YAML/JSON |
| **Hooks** | Programmatic logic | TypeScript |

Routing rules would handle common patterns:
```yaml
routes:
  - name: owner-access
    match:
      identities: ['imessage:+17072876731']
      peerKind: dm
    route:
      persona: atlas
      session: main
    permissions:
      level: full
```

Hooks would handle complex logic (LLM evaluation, content-based routing, etc.).

**Decision deferred.** Current hook-based approach is flexible enough. May revisit if configuration becomes unwieldy.

---

## Response Formatting

Once the agent responds, the delivery context determines how to format and deliver:

```typescript
async function deliverResponse(
  response: AgentResponse, 
  deliveryContext: DeliveryContext
): Promise<void> {
  const formatter = getFormatter(deliveryContext.channel);
  const formatted = formatter.format(response);
  
  await sendViaChannel(deliveryContext.channel, {
    ...formatted,
    accountId: deliveryContext.accountId,
    peerId: deliveryContext.peerId,
    threadId: deliveryContext.threadId,
    replyToId: deliveryContext.replyToId,
  });
}
```

**See README.md TODO for response formatter specification.**

---

## Open Questions

1. **Hook storage:** File-based (`~/nexus/state/hooks/*.ts`) or database?

2. **Priority conflicts:** What if two hooks have same priority and both fire?

3. **Permission inheritance:** Should group permissions inherit from persona defaults?

4. **Dynamic permissions:** Can permissions change mid-session based on content?

5. **Audit logging:** Should routing decisions be logged for debugging?

---

## Related Documents

- `EVENT_SYSTEM_DESIGN.md` — Event layer and hook evaluation
- `ONTOLOGY.md` — Persona, Session definitions
- `hook-examples/` — More hook patterns

---

*This document defines routing and permission behavior for the Nexus agent system.*
