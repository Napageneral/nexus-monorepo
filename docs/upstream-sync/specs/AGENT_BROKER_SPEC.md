# Agent Broker Spec: Multi-Agent Routing Layer

**Status:** DESIGN SPEC  
**Work Item:** WI-4  
**Last Updated:** 2026-01-22

---

## 1. Executive Summary

This spec defines a **thin multi-agent routing layer** that adds Manager-Worker communication to upstream's existing session/queue infrastructure.

**Key Principle:** Minimize custom code. Leverage upstream's mature systems for lifecycle, queuing, and delivery modes. Add only what's missing: **agent-to-agent message routing**.

### Two Routing Modes (Future)

1. **Explicit Routing (v1)** — Direct MA ↔ WA communication with `from`/`to` addressing
2. **Smart Routing (v2)** — Cortex-powered semantic routing to best checkpoint (A/B testable)

This spec focuses on v1 (explicit routing). Smart routing integrates with cortex and will be added as an alternative routing strategy.

---

## 2. What Upstream Already Provides

### 2.1 Agent Lifecycle (`pi-embedded-runner/runs.ts`)

| Capability | Upstream Implementation |
|------------|-------------------------|
| Active run tracking | `ACTIVE_EMBEDDED_RUNS` Map by sessionId |
| State queries | `isActive()`, `isStreaming()`, `isCompacting()` |
| Wait for completion | `waitForEmbeddedPiRunEnd(sessionId, timeout)` → returns boolean |
| Abort | `abortEmbeddedPiRun(sessionId)` |

**Decision:** Adopt upstream's registry pattern. Enhancements:
- Add explicit `isIdle` state (clearer than `!isStreaming && !isCompacting`)
- Combine wait-for-completion: timeout-based (upstream) + error info return (ours)
- Distinguish `abort()` (stop and done) from `interrupt(msg)` (stop and redirect)

**Note:** Upstream's `interrupt` queue mode already handles stop-and-redirect — we use that.

### 2.2 Message Queuing (`auto-reply/reply/queue/`)

| Capability | Upstream Implementation |
|------------|-------------------------|
| Queue storage | `FOLLOWUP_QUEUES` Map per session key |
| Queue state | `FollowupQueueState` (items, draining, debounce, cap, dropPolicy) |
| Enqueue | `enqueueFollowupRun()` with deduplication |
| Drain | `scheduleFollowupDrain()` with debounce/batching |
| Settings | Per-channel, per-session, inline overrides |

**Decision:** Adopt upstream's queue state tracking (richer than ours). Add:
- **Durability layer:** SQLite backing store for queue persistence across restarts
- **Agent-addressed routing:** Map agent IDs to session keys

```
┌─────────────────────────────────────────────┐
│          AgentBroker Queue Layer            │
│                                             │
│  ┌─────────────┐      ┌─────────────────┐  │
│  │ In-Memory   │ ←──► │ SQLite Backing  │  │
│  │ Map (fast)  │      │ Store (durable) │  │
│  └─────────────┘      └─────────────────┘  │
│         │                                   │
│         ▼                                   │
│  Upstream FOLLOWUP_QUEUES                   │
│  (queue mode processing)                    │
└─────────────────────────────────────────────┘
```

This keeps upstream's mature queue processing while adding durability for the broker package.

### 2.3 Delivery/Queue Modes

| Mode | Behavior | Keep? |
|------|----------|-------|
| `steer` | Abort current run, start new | ✅ |
| `followup` | Queue without interrupting | ✅ |
| `collect` | Buffer + debounce + batch | ✅ |
| `steer-backlog` | Steer + queue remaining | ✅ |
| `steer+backlog` | Same as above | ✅ |
| `queue` | Simple FIFO | ✅ |
| `interrupt` | Clear queue + abort | ✅ |

**Decision:** Use upstream's modes entirely. Drop custom priority system.

### 2.4 Session Storage

| Component | Upstream Format |
|-----------|-----------------|
| Index | `sessions.json` (flat file, all sessions) |
| Transcripts | `{sessionId}/transcript.jsonl` |
| Metadata | Rich: tokens, model, origin, skills, systemPrompt |
| Locking | `proper-lockfile` for concurrency |

**Decision:** Use upstream format. Compatible with aix.

---

## 3. What's Missing: Multi-Agent Routing

Upstream has no concept of **agent-to-agent communication**. Messages go to sessions, not agents. The subagent system uses tool calls, not message routing.

### The Gap

```
Current Upstream:
  User → Session → Agent (1:1:1)
  Subagent spawns via tool call, returns via announce

Manager-Worker Pattern Needs:
  User → MA Session → Manager Agent
                         ↓ send_message_to_agent(workerId, task)
                    WA Session → Worker Agent
                         ↓ send_message_to_agent(managerId, result)
                    MA Session → Manager Agent
                         ↓ respond to user
```

---

## 4. Proposed Interface: AgentBroker

A thin layer that adds agent-addressed routing on top of upstream's session infrastructure.

### 4.1 Core Types

```typescript
/**
 * Agent identity - maps to a persistent session
 */
export interface AgentIdentity {
  agentId: string;           // Unique identifier (e.g., "manager", "code-worker")
  sessionKey: string;        // Underlying session key
  role: 'manager' | 'worker';
}

/**
 * Message between agents
 * Simpler than upstream's FollowupRun - just routing + content
 */
export interface AgentMessage {
  id: string;                // Unique message ID
  from: string;              // Sender agent ID or 'user' or 'system'
  to: string;                // Target agent ID
  content: string;           // Message content
  timestamp: number;
  conversationId?: string;   // Group related messages
  metadata?: Record<string, unknown>;
}

/**
 * Agent state - extends upstream's run state
 */
export type AgentState = 
  | 'idle'       // No active run, ready for messages
  | 'running'    // Active run in progress
  | 'streaming'  // Actively generating output
  | 'compacting' // Performing context compaction
  ;

/**
 * Agent registration info
 */
export interface RegisteredAgent {
  identity: AgentIdentity;
  state: AgentState;
  lastActivity: number;
  queueDepth: number;
}
```

### 4.2 AgentBroker Interface

```typescript
export interface AgentBroker {
  // === Agent Registry ===
  
  /**
   * Register an agent with the broker.
   * Creates underlying session if needed.
   */
  registerAgent(identity: AgentIdentity): Promise<void>;
  
  /**
   * Get registered agent by ID
   */
  getAgent(agentId: string): RegisteredAgent | undefined;
  
  /**
   * List all registered agents
   */
  listAgents(): RegisteredAgent[];
  
  // === Message Routing ===
  
  /**
   * Send message to an agent.
   * Uses upstream's queue system for delivery.
   * 
   * @param message - The message to send
   * @param queueMode - How to deliver (default: session's configured mode)
   */
  send(message: AgentMessage, queueMode?: QueueMode): Promise<void>;
  
  /**
   * Send and wait for agent to complete processing.
   * Useful for synchronous MA → WA → MA flow.
   */
  sendAndWait(
    message: AgentMessage, 
    options?: { timeoutMs?: number }
  ): Promise<{ success: boolean; error?: string }>;
  
  // === State Management ===
  
  /**
   * Get current state of an agent.
   * Queries upstream's run tracking.
   */
  getState(agentId: string): AgentState;
  
  /**
   * Wait for agent to reach idle state.
   */
  waitForIdle(agentId: string, timeoutMs?: number): Promise<boolean>;
  
  /**
   * Abort agent's current run.
   * Does NOT send followup message.
   */
  abort(agentId: string): boolean;
  
  /**
   * Interrupt agent with a new message.
   * Aborts current run AND queues the message.
   */
  interrupt(agentId: string, message: AgentMessage): Promise<void>;
  
  // === Queue Inspection ===
  
  /**
   * Get queue depth for an agent
   */
  getQueueDepth(agentId: string): number;
  
  /**
   * Clear an agent's message queue
   */
  clearQueue(agentId: string): number;
}
```

### 4.3 Tool Interface (for agents)

Agents interact with the broker via tools:

```typescript
// Tool: send_message_to_agent
{
  name: "send_message_to_agent",
  description: "Send a message to another agent",
  parameters: {
    to: { type: "string", description: "Target agent ID" },
    content: { type: "string", description: "Message content" },
    waitForReply: { type: "boolean", default: false }
  }
}

// Tool: get_agent_status  
{
  name: "get_agent_status",
  description: "Check if an agent is available",
  parameters: {
    agentId: { type: "string" }
  }
}
```

---

## 5. Integration with Upstream

### 5.1 Session Mapping

Each registered agent maps to an upstream session:

```typescript
// AgentBroker maintains this mapping
const agentToSession = new Map<string, string>();

// "manager" → "dm:user@default"
// "code-worker" → "agent:code-worker:session-123"
```

### 5.2 Message → FollowupRun Translation

When `send()` is called, translate to upstream's queue system:

```typescript
async send(message: AgentMessage, queueMode?: QueueMode): Promise<void> {
  const agent = this.getAgent(message.to);
  if (!agent) throw new Error(`Unknown agent: ${message.to}`);
  
  // Translate to upstream's FollowupRun format
  const followupRun: FollowupRun = {
    prompt: this.formatMessageAsPrompt(message),
    messageId: message.id,
    summaryLine: message.content.slice(0, 100),
    enqueuedAt: message.timestamp,
    run: this.getRunContext(agent)  // Reuse from session
  };
  
  // Use upstream's queue system
  const settings = this.resolveQueueSettings(agent, queueMode);
  enqueueFollowupRun(agent.identity.sessionKey, followupRun, settings);
  
  // Trigger drain if not already draining
  scheduleFollowupDrain(agent.identity.sessionKey, (run) => 
    this.runAgentWithMessage(agent, run)
  );
}
```

### 5.3 State Synchronization

Agent state derived from upstream's tracking:

```typescript
getState(agentId: string): AgentState {
  const agent = this.getAgent(agentId);
  if (!agent) return 'idle';
  
  const sessionId = this.getSessionId(agent);
  
  if (isEmbeddedPiRunActive(sessionId)) {
    if (isEmbeddedPiRunStreaming(sessionId)) return 'streaming';
    // Could check isCompacting if exposed
    return 'running';
  }
  
  return 'idle';
}
```

---

## 6. Durability Enhancements

### 6.1 SQLite Backing Store

Use SQLite for durability (packageable with the broker library):

```sql
-- broker.db schema
CREATE TABLE agents (
  agent_id TEXT PRIMARY KEY,
  session_key TEXT NOT NULL,
  role TEXT NOT NULL,  -- 'manager' | 'worker'
  registered_at INTEGER NOT NULL,
  last_activity INTEGER
);

CREATE TABLE queue_items (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  message_json TEXT NOT NULL,  -- AgentMessage serialized
  enqueued_at INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',  -- 'pending' | 'delivered' | 'failed'
  FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);

CREATE INDEX idx_queue_agent ON queue_items(agent_id, status);
```

**Pattern:** Write-through cache
- In-memory Map for fast access
- SQLite for durability
- On startup: load from SQLite
- On enqueue: write to both
- On delivery: update status in SQLite

### 6.2 Agent Registry Persistence

```typescript
// On register
await db.run(`INSERT INTO agents VALUES (?, ?, ?, ?)`, [...]);

// On startup
const agents = await db.all(`SELECT * FROM agents`);
```

---

## 7. Smart Routing (v2 — Future)

### 7.1 The Vision

Instead of explicit `send(to: "worker-id", msg)`, the system can intelligently route:

```typescript
// Explicit routing (v1)
broker.send({ from: "manager", to: "code-worker", content: "Review auth module" });

// Smart routing (v2 — via cortex)
const route = await cortex.route("Review the authentication module for security issues");
// Returns: { segmentId: "seg-123", checkpoint: {...}, confidence: 0.87 }

// Then fork from that checkpoint
broker.forkFrom(route.checkpoint, { content: "Continue: Review auth module" });
```

### 7.2 How Smart Routing Works (cortex)

```
┌─────────────────────────────────────────────────────────────────┐
│                      cortex route "task"                        │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  Stage 1: Candidate Generation                                  │
│  - Embedding similarity (semantic match)                        │
│  - Facet overlap (files, entities, topics)                     │
│  - Recency filter                                               │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  Stage 2: Scoring                                               │
│  - Turn quality signals (from analysis)                        │
│  - Thread continuity bonus                                      │
│  - Freshness (file state hashes)                               │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  Stage 3: Decision                                              │
│  - Route to best segment if score > threshold                  │
│  - OR create new session if no good match                      │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Interface Extension

```typescript
interface AgentBroker {
  // ... existing explicit routing ...
  
  // === Smart Routing (v2) ===
  
  /**
   * Route to best checkpoint using cortex.
   * Returns routing decision with confidence.
   */
  routeSmart(task: string): Promise<SmartRouteResult>;
  
  /**
   * Fork from a checkpoint (resume from historical context).
   */
  forkFrom(checkpoint: Checkpoint, message: AgentMessage): Promise<void>;
  
  /**
   * Set routing mode for A/B testing.
   */
  setRoutingMode(mode: 'explicit' | 'smart' | 'hybrid'): void;
}

interface SmartRouteResult {
  mode: 'existing' | 'new';
  checkpoint?: Checkpoint;
  confidence: number;
  alternatives: Checkpoint[];
}

interface Checkpoint {
  segmentId: string;
  sessionKey: string;
  position: number;  // Turn index in segment
  context: string;   // What was being worked on
}
```

### 7.4 Why Both Modes?

| Use Case | Best Mode |
|----------|-----------|
| Known hierarchies (MA delegates to specific WAs) | Explicit |
| "Continue what I was working on" | Smart |
| Structured workflows | Explicit |
| Discovery / exploration | Smart |
| A/B testing effectiveness | Both |

**Start with explicit.** Add smart routing when cortex's routing decision logic is ready. A/B test to compare.

---

## 8. Implementation Plan

### Phase 1: Explicit Routing (MVP)

1. **AgentBroker class** implementing core interface
2. **Agent registry** with SQLite persistence
3. **Message routing** via upstream queue system
4. **`send_message_to_agent` tool** for agents
5. **State queries** wrapping upstream (add explicit `isIdle`)
6. **Wait-for-completion** combining timeout + error info

**Deliverable:** MA can spawn WA, WA can message back to MA. Survives restarts.

### Phase 2: Durability + Steering

1. **SQLite queue persistence** (write-through cache)
2. **Adopt upstream steering/processing** (use `scheduleFollowupDrain`)
3. **Recovery on restart** (load queues, resume agents)
4. **Message history table** (who talked to whom, for debugging)

### Phase 3: Smart Routing (v2)

1. **cortex integration** via `cortex route` API
2. **`routeSmart()` method** returning checkpoint candidates
3. **`forkFrom()` method** to resume from checkpoint
4. **A/B routing mode** (`explicit` | `smart` | `hybrid`)

**Requires:** cortex routing decision logic (scoring, thresholds)

---

## 8. What We're NOT Building

| Feature | Reason |
|---------|--------|
| Custom queue modes | Upstream's are sufficient |
| Priority system | Adds complexity, little value |
| Custom session format | Upstream's works, aix compatible |
| Custom lifecycle tracking | Wrap upstream's instead |
| Separate broker process | Run in-process with gateway |

---

## 9. Migration from Existing Broker Code

If porting from `control-plane/broker/broker.ts`:

| Old | New |
|----|-----|
| `ActiveMessageBroker` | `AgentBroker` |
| `registeredIAs` | `agentRegistry` (role=manager) |
| `agentFactories` | Remove (use upstream spawn) |
| `runningAgents` | Delegate to upstream tracking |
| `queues` | Delegate to upstream `FOLLOWUP_QUEUES` |
| `priority` field | Remove |
| `deliveryMode` | Map to `QueueMode` |
| `sendAndWaitForAck` | `sendAndWait` |

---

## 10. Open Questions

1. **Agent naming convention:** Should agent IDs be hierarchical? `manager.tyler`, `worker.code.project-x`?

2. **Default MA:** Should there always be a default Manager Agent, or explicit registration required?

3. **Cross-workspace:** Can MA in workspace A spawn WA for workspace B? (Upstream supports via agentId)

4. **Tool restrictions:** Should WAs have `send_message_to_agent` or only MA?

---

## 11. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-22 | Use upstream queue modes | Mature, tested, sufficient |
| 2026-01-22 | Drop priority system | Complexity vs value |
| 2026-01-22 | Wrap upstream lifecycle | Don't reinvent |
| 2026-01-22 | Add `isIdle` state | Clearer than !streaming && !compacting |
| 2026-01-22 | MA/WA terminology | Clear, no "ODU" jargon |
| 2026-01-22 | Persist agent registry | Survive restarts |
| 2026-01-22 | Persist queue state | Durability for reliability |
| 2026-01-22 | Adopt upstream registry | Functional goals met without fighting upstream |
| 2026-01-22 | Combined wait-for-completion | Timeout-based (upstream) + error info (ours) |
| 2026-01-22 | Use upstream `interrupt` queue mode | Already handles stop-and-redirect |
| 2026-01-22 | SQLite for durability | Simple, packageable with broker library |
| 2026-01-22 | Adopt upstream steering | Use `scheduleFollowupDrain` |
| 2026-01-22 | Two routing modes | Explicit first, smart (cortex) later, A/B testable |

---

## Appendix A: Message Format Examples

### MA → WA Task Delegation

```typescript
{
  id: "msg-001",
  from: "manager",
  to: "code-worker",
  content: "Review the authentication module for security issues. Focus on: 1) SQL injection, 2) XSS, 3) CSRF. Report findings.",
  timestamp: 1737500000000,
  conversationId: "task-security-review-001"
}
```

### WA → MA Progress Update

```typescript
{
  id: "msg-002",
  from: "code-worker",
  to: "manager",
  content: "Progress: Reviewed 3/8 files. Found 2 potential SQL injection issues in user-routes.ts. Continuing...",
  timestamp: 1737500060000,
  conversationId: "task-security-review-001"
}
```

### WA → MA Completion

```typescript
{
  id: "msg-003",
  from: "code-worker", 
  to: "manager",
  content: "Task complete. Found 4 issues: 2 SQL injection (HIGH), 1 XSS (MEDIUM), 1 CSRF (LOW). Full report attached in metadata.",
  timestamp: 1737500120000,
  conversationId: "task-security-review-001",
  metadata: {
    taskComplete: true,
    findings: [...]
  }
}
```
