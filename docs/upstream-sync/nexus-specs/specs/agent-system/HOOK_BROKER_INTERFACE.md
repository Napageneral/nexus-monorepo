# Hook → Broker Interface

**Status:** DESIGN SPEC  
**Last Updated:** 2026-01-29  
**Related:** EVENT_SYSTEM_DESIGN.md, BROKER.md, ROUTING_HOOKS.md, UNIFIED_SYSTEM.md

---

## Executive Summary

This document specifies the interface between the **Hook Evaluator** and the **Agent Broker**. When a hook fires, the Event Handler translates the hook result into a `BrokerDispatch` that the Broker can route and execute.

**Key insight:** Hooks return *routing decisions*. The Broker receives *dispatchable messages*. The Event Handler bridges them.

---

## 1. Data Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              EVENT HANDLING FLOW                                 │
│                                                                                  │
│  Event                Hook                      Event                   Broker   │
│  Arrives              Evaluator                 Handler                          │
│     │                    │                         │                       │     │
│     ▼                    ▼                         ▼                       ▼     │
│  ┌──────┐          ┌──────────┐             ┌───────────┐          ┌──────────┐ │
│  │Event │──────────│ Evaluate │─────────────│ Build     │──────────│ Dispatch │ │
│  │stored│          │ ALL hooks│             │ BrokerDis-│          │ to Agent │ │
│  │in    │          │ in       │             │ patch from│          │          │ │
│  │Ledger│          │ parallel │             │ fired     │          │          │ │
│  └──────┘          └──────────┘             │ results   │          └──────────┘ │
│                          │                  └───────────┘                        │
│                          │                        │                              │
│                    Returns:                  Produces:                           │
│                    HookResult[]              BrokerDispatch[]                    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Unified Hook Result Schema

Combining ROUTING_HOOKS.md and EVENT_SYSTEM_DESIGN.md into one schema:

```typescript
/**
 * What a hook returns after evaluating an event.
 * Hooks are TypeScript scripts that decide whether to fire and how to route.
 */
interface HookResult {
  // === Core Decision ===
  fire: boolean;                    // Does this hook want to trigger an agent?
  
  // === Routing (where to send) ===
  routing?: {
    persona: string;                // Which agent persona handles this
    session: string;                // Which session within the persona
    queueMode?: QueueMode;          // How to queue: steer, followup, collect, interrupt
  };
  
  // === Permissions (what the agent can do) ===
  permissions?: PermissionSet;      // Tool/credential restrictions for this invocation
  
  // === Delivery Context (how to respond) ===
  deliveryContext?: DeliveryContext; // Channel, thread, reply-to for response routing
  
  // === Context Enrichment (what to inject) ===
  context?: {
    systemPrompt?: string;          // Additional system prompt to inject
    extracted?: Record<string, any>; // Data extracted from event (structured)
    includeThreadHistory?: boolean;  // Pull in conversation thread history
  };
  
  // === Hook Lifecycle ===
  disableHook?: boolean;            // Self-disable after this invocation (one-shot)
}

type QueueMode = 'steer' | 'followup' | 'collect' | 'interrupt';

interface PermissionSet {
  level: 'full' | 'restricted' | 'group' | 'minimal';
  tools: {
    allow?: string[];               // Whitelist (* = all)
    deny?: string[];                // Blacklist (overrides allow)
  };
  credentials?: string[];           // Which credentials are accessible
}

interface DeliveryContext {
  channel: string;                  // imessage, discord, telegram, etc.
  accountId?: string;               // Which account (multi-account)
  peerId?: string;                  // Group/channel ID
  threadId?: string;                // Thread within group
  replyToId?: string;               // Message to reply to
}
```

---

## 3. Broker Dispatch Schema

What the Event Handler produces for the Broker:

```typescript
/**
 * A dispatchable message for the Broker.
 * Built from the original event + fired hook result.
 */
interface BrokerDispatch {
  // === Message Identity ===
  id: string;                       // Unique dispatch ID (ULID)
  eventId: string;                  // Source event ID (for tracing)
  hookId: string;                   // Which hook fired this
  timestamp: number;                // When dispatch was created
  
  // === Routing Target ===
  target: {
    persona: string;                // Agent persona to invoke
    session: string;                // Session within persona
  };
  
  // === Queue Behavior ===
  queueMode: QueueMode;             // How to handle if agent busy
  
  // === The Message ===
  message: {
    from: string;                   // Original sender ID
    content: string;                // Message content (from event)
    contentType: string;            // text, image, audio, etc.
    metadata?: Record<string, any>; // Original event metadata
  };
  
  // === Permissions for this invocation ===
  permissions: PermissionSet;
  
  // === Context to inject ===
  context: {
    systemPrompt?: string;
    extracted?: Record<string, any>;
    includeThreadHistory: boolean;
  };
  
  // === Response routing ===
  deliveryContext: DeliveryContext;
}
```

---

## 4. Event Handler Translation

The Event Handler bridges hooks and broker:

```typescript
class EventHandler {
  
  /**
   * Process a new event through hook evaluation.
   * Returns dispatches for the broker to execute.
   */
  async processEvent(event: MnemonicEvent): Promise<BrokerDispatch[]> {
    
    // 1. Load all enabled hooks
    const hooks = await this.loadEnabledHooks();
    
    // 2. Evaluate ALL hooks in PARALLEL
    const results = await Promise.all(
      hooks.map(hook => this.evaluateHook(hook, event))
    );
    
    // 3. Collect fired hooks
    const firedResults = results.filter(r => r.result.fire);
    
    // 4. Record invocations for all hooks
    await this.recordInvocations(results);
    
    // 5. Build dispatches from fired results
    const dispatches = firedResults.map(({ hook, result }) => 
      this.buildDispatch(event, hook, result)
    );
    
    return dispatches;
  }
  
  /**
   * Build a BrokerDispatch from event + hook result.
   * Applies defaults where hook didn't specify.
   */
  buildDispatch(
    event: MnemonicEvent, 
    hook: Hook, 
    result: HookResult
  ): BrokerDispatch {
    
    return {
      // Identity
      id: generateULID(),
      eventId: event.id,
      hookId: hook.id,
      timestamp: Date.now(),
      
      // Routing (with defaults)
      target: {
        persona: result.routing?.persona ?? 'default',
        session: result.routing?.session ?? this.deriveSessionKey(event),
      },
      
      // Queue mode (default: followup)
      queueMode: result.routing?.queueMode ?? 'followup',
      
      // Message from event
      message: {
        from: event.from,
        content: event.content,
        contentType: event.contentType ?? 'text',
        metadata: event.metadata,
      },
      
      // Permissions (default: full for owner, minimal for unknown)
      permissions: result.permissions ?? this.defaultPermissions(event),
      
      // Context
      context: {
        systemPrompt: result.context?.systemPrompt,
        extracted: result.context?.extracted,
        includeThreadHistory: result.context?.includeThreadHistory ?? true,
      },
      
      // Delivery context (from event if not specified)
      deliveryContext: result.deliveryContext ?? {
        channel: event.channel,
        accountId: event.accountId,
        peerId: event.peerId,
        threadId: event.threadId,
        replyToId: event.id,
      },
    };
  }
  
  /**
   * Derive session key from event if not specified by hook.
   * Follows upstream pattern: DMs collapse to main, groups isolated.
   */
  deriveSessionKey(event: MnemonicEvent): string {
    if (event.peerKind === 'dm') {
      return 'main';  // DMs collapse to main session
    }
    // Groups get isolated sessions
    return `${event.channel}:group:${event.peerId}`;
  }
  
  /**
   * Default permissions based on sender.
   */
  defaultPermissions(event: MnemonicEvent): PermissionSet {
    // This would query mnemonic for sender identity
    // Simplified: assume minimal permissions
    return {
      level: 'minimal',
      tools: { allow: ['web_search'] },
      credentials: [],
    };
  }
}
```

---

## 5. Broker Reception

The Broker receives `BrokerDispatch` and handles routing:

```typescript
class AgentBroker {
  
  /**
   * Receive a dispatch from the Event Handler.
   * Routes to the appropriate session and executes agent.
   */
  async dispatch(d: BrokerDispatch): Promise<void> {
    
    // 1. Resolve session (create if needed)
    const session = await this.resolveSession(d.target.persona, d.target.session);
    
    // 2. Apply queue mode
    await this.enqueue(session, d);
    
    // 3. Process queue (serially per session)
    await this.processSessionQueue(session.label);
  }
  
  /**
   * Process queued dispatches for a session.
   * Critical: one at a time, fresh session lookup each time.
   */
  async processSessionQueue(sessionLabel: string): Promise<void> {
    if (this.processing.has(sessionLabel)) return;
    this.processing.add(sessionLabel);
    
    try {
      while (this.hasQueued(sessionLabel)) {
        const dispatch = this.dequeue(sessionLabel);
        
        // Fresh session lookup (critical!)
        const session = await this.db.getSession(sessionLabel);
        
        // Build context
        const context = await this.assembleContext(session, dispatch);
        
        // Execute agent
        const response = await this.executeAgent(session, dispatch, context);
        
        // Write turn to Agent Ledger
        await this.writeTurn(session, dispatch, response);
        
        // Update session pointer
        await this.updateSessionHead(sessionLabel, response.turnId);
        
        // Deliver response
        await this.deliverResponse(response, dispatch.deliveryContext);
      }
    } finally {
      this.processing.delete(sessionLabel);
    }
  }
  
  /**
   * Assemble context for agent invocation.
   */
  async assembleContext(
    session: Session, 
    dispatch: BrokerDispatch
  ): Promise<AgentContext> {
    
    const context: AgentContext = {
      systemPrompt: this.buildSystemPrompt(session, dispatch),
      messages: [],
      tools: this.filterTools(dispatch.permissions),
    };
    
    // Include thread history if requested
    if (dispatch.context.includeThreadHistory) {
      context.messages = await this.getThreadHistory(session.threadId);
    }
    
    // Add the new message
    context.messages.push({
      role: 'user',
      content: dispatch.message.content,
    });
    
    // Inject extracted data if present
    if (dispatch.context.extracted) {
      context.systemPrompt += `\n\n## Extracted Context\n${JSON.stringify(dispatch.context.extracted, null, 2)}`;
    }
    
    return context;
  }
  
  /**
   * Filter available tools based on permissions.
   */
  filterTools(permissions: PermissionSet): Tool[] {
    const allTools = this.getAvailableTools();
    
    return allTools.filter(tool => {
      // Check deny list first
      if (permissions.tools.deny?.some(pattern => 
        this.matchPattern(pattern, tool.name)
      )) {
        return false;
      }
      
      // Check allow list
      if (permissions.tools.allow?.includes('*')) {
        return true;
      }
      
      return permissions.tools.allow?.some(pattern => 
        this.matchPattern(pattern, tool.name)
      ) ?? false;
    });
  }
}
```

---

## 6. Multiple Hooks Firing

When multiple hooks fire for the same event, each produces a separate dispatch:

```
Event: iMessage from Mom

Hook 1: "family-routing" → fires
  - routing: { persona: 'atlas', session: 'family:mom' }
  - permissions: restricted

Hook 2: "2fa-helper" → fires (Mom is asking about 2FA code)
  - routing: { persona: 'atlas', session: 'family:mom' }
  - permissions: restricted + 2fa tools

Result: 2 dispatches to broker

Broker behavior:
  - Both target same session
  - Queue mode determines handling (followup = queue second one)
  - Or: merge? (future consideration)
```

**Current behavior:** Each dispatch is independent. Queue modes handle overlap.

**Future consideration:** Dispatch merging for same session.

---

## 7. Ledger Integration

### Where Data Lives

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              TWO LEDGERS                                         │
│                                                                                  │
│  ┌───────────────────────────────────┐  ┌───────────────────────────────────┐  │
│  │         EVENT LEDGER               │  │         AGENT LEDGER              │  │
│  │                                    │  │                                    │  │
│  │  • events (all normalized events)  │  │  • agent_sessions                 │  │
│  │  • threads (event groupings)       │  │  • agent_turns                    │  │
│  │  • persons (contacts)              │  │  • agent_messages                 │  │
│  │  • event_participants              │  │  • agent_tool_calls               │  │
│  │  • event_state                     │  │                                    │  │
│  │  • event_tags                      │  │                                    │  │
│  │                                    │  │                                    │  │
│  │  Written by: Adapters              │  │  Written by: Broker (direct)      │  │
│  │  Never compacted                   │  │  Subject to compaction            │  │
│  └───────────────────────────────────┘  └───────────────────────────────────┘  │
│                                                                                  │
│                                 ┌────────────────┐                               │
│                                 │     INDEX      │                               │
│                                 │   (derived)    │                               │
│                                 │                │                               │
│                                 │  • episodes    │                               │
│                                 │  • facets      │                               │
│                                 │  • embeddings  │                               │
│                                 └────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Write Paths

| Writer | Target | Path |
|--------|--------|------|
| **Adapters** (iMessage, Discord, Gmail, etc.) | Event Ledger | Adapter → events table |
| **AIX** (external harnesses) | Agent Ledger | Cursor/Codex/Claude → AIX → agent_* tables |
| **Broker** (Nexus agents) | Agent Ledger | Broker → agent_* tables (direct, no files) |

### Critical: No File Loop

```
❌ WRONG (creates duplication):
   Broker → JSONL files → AIX → Agent Ledger → Smart Fork → Broker → ...

✅ CORRECT:
   External harnesses → AIX → Agent Ledger
   Nexus Broker → Agent Ledger (direct, no AIX)
```

**AIX only ingests from external harnesses** (Cursor, Codex, Claude Code). Nexus Broker writes directly to Agent Ledger.

---

## 8. Complete Flow Example

**Scenario:** Tyler's mom sends an iMessage asking about a 2FA code.

```
1. EVENT INGESTION
   ─────────────────
   iMessage Adapter receives message from chat.db
   → Normalizes to MnemonicEvent:
     {
       id: "imessage:abc123",
       channel: "imessage",
       from: "+15559876543",
       content: "Can you help me with this Apple code? 123456",
       peerKind: "dm",
       timestamp: 1738180000000
     }
   → Writes to Event Ledger (events table)

2. HOOK EVALUATION
   ────────────────
   Event Handler loads all enabled hooks, evaluates in parallel:
   
   Hook: "family-routing" (priority 90)
   → Matches: sender is family (mom)
   → Returns: { fire: true, routing: { persona: 'atlas', session: 'family:mom' }, permissions: restricted }
   
   Hook: "2fa-helper" (priority 85)
   → Matches: content mentions "code" + digits
   → Returns: { fire: true, routing: { persona: 'atlas', session: 'family:mom' }, context: { extracted: { code: '123456' } } }
   
   Both fire!

3. DISPATCH BUILDING
   ──────────────────
   Event Handler builds BrokerDispatch for each:
   
   Dispatch 1 (from family-routing):
   {
     id: "dispatch-001",
     eventId: "imessage:abc123",
     target: { persona: 'atlas', session: 'family:mom' },
     queueMode: 'followup',
     permissions: { level: 'restricted', ... },
     ...
   }
   
   Dispatch 2 (from 2fa-helper):
   {
     id: "dispatch-002",
     eventId: "imessage:abc123",
     target: { persona: 'atlas', session: 'family:mom' },
     queueMode: 'followup',
     context: { extracted: { code: '123456' } },
     ...
   }

4. BROKER ROUTING
   ───────────────
   Broker receives both dispatches:
   
   - Dispatch 1 queued for session 'family:mom'
   - Dispatch 2 queued for session 'family:mom' (same session)
   
   Process queue serially:
   
   a) Resolve session 'family:mom' → get current head turn
   b) Assemble context (history + new message)
   c) Execute agent with restricted permissions
   d) Write turn to Agent Ledger
   e) Update session head
   f) Deliver response via iMessage

5. AGENT LEDGER WRITES
   ────────────────────
   Broker writes directly to Agent Ledger:
   
   agent_sessions: { id: 'family:mom', persona: 'atlas', thread_id: 'turn-xyz' }
   agent_turns: { id: 'turn-xyz', parent: 'turn-abc', ... }
   agent_messages: { turn_id: 'turn-xyz', role: 'user', content: '...' }
   agent_messages: { turn_id: 'turn-xyz', role: 'assistant', content: '...' }

6. RESPONSE DELIVERY
   ──────────────────
   Broker uses deliveryContext to route response:
   
   → iMessage outbound adapter
   → Reply to original message thread
   → Agent response sent to Mom
```

---

## 9. Open Questions

1. **Dispatch Merging:** When multiple hooks fire for same session, should we merge dispatches or queue separately?

2. **Permission Conflicts:** If two hooks return different permissions, which wins? (Currently: each dispatch has its own permissions)

3. **Hook Priority for Routing:** Should higher-priority hooks override lower-priority routing decisions?

4. **Dispatch Ordering:** When multiple dispatches target same session, order by hook priority or dispatch creation time?

---

## 10. Related Documents

- **UNIFIED_SYSTEM.md** — High-level architecture, ledger separation
- **EVENT_SYSTEM_DESIGN.md** — Hook evaluation pipeline, hook schemas
- **BROKER.md** — Broker internals, queue management, session pointers
- **ROUTING_HOOKS.md** — Routing hook examples and permission system
- **HOOK_SERVICE.md** — Hook registration and lifecycle management
- **ONTOLOGY.md** — Turn, Thread, Session data model

---

*This document specifies the interface between Hook Evaluator and Agent Broker.*
