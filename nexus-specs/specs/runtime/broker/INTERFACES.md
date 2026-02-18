# Broker Interfaces

**Status:** TODO  
**Last Updated:** 2026-02-16

---

## Overview

This document defines the contracts between the Broker and its neighbors:
- **NEX → Broker:** How NEX invokes the Broker
- **Broker → NEX:** What the Broker returns to NEX
- **Broker ↔ Cortex:** How the Broker queries Cortex for context

---

## NEX → Broker Interface

**TODO:** Define the exact interface.

NEX invokes the Broker during the `assembleContext` and `runAgent` pipeline stages.

### Input: NexusRequest

The Broker receives a `NexusRequest` with:
- Event data (already stored in Events Ledger)
- Identity (resolved by IAM)
- Permissions (resolved by IAM)  
- Routing decision (from hooks or default routing)

```typescript
// TODO: Define exact NexusRequest shape
interface NexusRequest {
  id: string;
  event: NormalizedEvent;
  principal: {
    identity: IdentityLookupResult;
    // ...
  };
  permissions: PermissionGrant;
  routing: RoutingDecision;
  hooks?: HookContext;  // Injected by hooks
  // ...
}
```

### Broker Responsibilities

1. Resolve routing decision to specific session/thread
2. Assemble context (see `CONTEXT_ASSEMBLY.md`)
3. Execute the agent
4. Return response to NEX

---

## Broker → NEX Interface

**TODO:** Define the exact interface.

### Output: AgentResponse

The Broker returns an `AgentResponse` to NEX:

```typescript
// TODO: Define exact shape
interface AgentResponse {
  turn_id: string;
  session_id: string;
  content: string;
  tool_calls?: ToolCall[];
  tokens: {
    prompt: number;
    completion: number;
  };
  // Streaming considerations?
  // ...
}
```

### Questions

1. Does the Broker stream responses to NEX, or buffer?
2. How are partial responses handled?
3. What happens on agent error?

See `STREAMING.md` for streaming considerations.

---

## Broker ↔ Cortex Interface

**TODO:** Define the exact interface.

The Broker queries Cortex for context injection during `assembleContext`.

### Query Interface

```typescript
// TODO: Define exact interface
interface CortexQuery {
  // What to search for
  query: string;
  
  // Scope
  identity?: string;      // Filter by identity
  timeRange?: TimeRange;  // Filter by time
  
  // Limits
  maxTokens?: number;
  maxResults?: number;
}

interface CortexResult {
  episodes: Episode[];
  facets: Facet[];
  // ...
}
```

See `CONTEXT_ASSEMBLY.md` for how Cortex results are used.

---

## Core Types

Types used across broker interfaces:

### Agent Identity

```typescript
interface AgentIdentity {
  personaId: string;         // Behavioral decorator (swappable)
  sessionKey: string;        // Routing key / queue target
  role: 'manager' | 'worker';
}
```

### Agent Message

```typescript
interface AgentMessage {
  id: string;                // Unique message ID
  fromSession: string;       // Sender session label or 'user' or 'system'
  toSession: string;         // Target session label
  content: string;           // Message content
  timestamp: number;
  conversationId?: string;   // Group related messages
  metadata?: Record<string, unknown>;
}
```

### Agent State

```typescript
type AgentState = 
  | 'idle'       // No active run, ready for messages
  | 'running'    // Active run in progress
  | 'streaming'  // Actively generating output
  | 'compacting' // Performing context compaction
  ;
```

### Routing Target

```typescript
interface RoutingTarget {
  // Mutually exclusive - pick one:
  thread?: string;    // Turn/Thread ID (bedrock)
  session?: string;   // Session label → resolves to thread head
  persona?: string;   // Persona ID → resolves to main session → thread head
  
  // Modifier:
  smart?: boolean;    // Use Cortex to find best target first
}
```

### Dispatch Target (agent_send)

```typescript
type DispatchTarget =
  | { kind: "session"; session: string }                     // v1: explicit session routing
  | { kind: "new_session"; labelHint?: string }              // v1: spawn worker
  | { kind: "fork"; fromTurnId: string; labelHint?: string } // v2: true fork from checkpoint
```

---

## Related Documents

- `OVERVIEW.md` — Broker overview
- `CONTEXT_ASSEMBLY.md` — How context is built
- `STREAMING.md` — Streaming considerations
- `../nex/NEX.md` — NEX pipeline
- `../nex/INTERFACES.md` — NEX interface contracts

---

*This document defines interface contracts for the Agent Broker.*
