# Agent Orchestration Architecture Spec

**Status:** SUPERSEDED  
**Work Item:** WI-3  
**Last Updated:** 2026-01-22

> **⚠️ Deprecation Notice:** This document has been superseded by UNIFIED_ARCHITECTURE.md and EVENT_SYSTEM_DESIGN.md. The concepts here informed the final design, but readers should consult the current specs for the authoritative architecture.

---

## 1. Naming the Architecture

**Final Name: Manager-Worker Pattern (MWP)**

- **Manager Agent (MA)**: The single agent that interacts with the user. Responsible for conversation continuity AND delegation. Limited tools: dispatch workers, respond to user, basic routing.
- **Worker Agent (WA)**: Task-focused agents. Heavy context, specialized tools. Can themselves spawn sub-workers (nested delegation allowed).

Key insight: **MA maintains conversation continuity while WAs handle context-heavy execution. All agents are persistent — no ephemeral agents exist.**

**Central Component: Agent Broker**

The Agent Broker is the message routing layer that enables:
- Manager ↔ Worker communication
- Worker ↔ Worker communication (including nested delegation)
- External triggers → Agent routing
- Mid-task communication
- Unified entity illusion (optional)

---

## 2. Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                   User / External Triggers                          │
│          (Messages, Heartbeats, Cron, Webhooks, File Events)       │
└────────────────────────────────────────────┬───────────────────────┘
                                             │
                                             ▼
┌────────────────────────────────────────────────────────────────────┐
│                        AGENT BROKER                                 │
│                                                                     │
│  • Routes messages to appropriate agent sessions                   │
│  • Manages message queues with priorities                          │
│  • Tracks external callers (who talked to whom)                    │
│  • Handles trigger → session routing                               │
│  • Persists queue state (durable across restarts)                  │
│                                                                     │
└────────────────┬──────────────────────────────────┬────────────────┘
                 │                                   │
                 ▼                                   ▼
┌────────────────────────────┐   ┌────────────────────────────────────┐
│     Manager Agent (MA)     │   │      Worker Agent (WA)             │
│                            │   │                                    │
│  • User conversation       │   │  • Task execution                  │
│  • Intent understanding    │   │  • Heavy project context           │
│  • Delegation decisions    │   │  • Specialized tools               │
│  • Limited tools           │   │  • Can spawn sub-workers           │
│                            │   │                                    │
│  Tools:                    │   │  Can message back to MA:           │
│  - send_message_to_agent   │   │  - Progress updates                │
│  - respond_to_user         │   │  - Clarifying questions            │
│                            │   │  - Partial results                 │
└────────────────────────────┘   └────────────────────────────────────┘
                                             │
                                             │ nested spawn
                                             ▼
                              ┌────────────────────────────────────────┐
                              │      Sub-Worker Agent                  │
                              │      (WAs can spawn their own WAs)     │
                              └────────────────────────────────────────┘
```

### Key Principles

1. **No ephemeral agents**: All agent sessions are persisted. Any persisted session can be resumed.
2. **Nested delegation allowed**: WAs can spawn their own sub-workers (upstream forbids this — we remove that restriction).
3. **Bidirectional communication**: WAs can message back mid-task, not just at completion.
4. **Unified triggers**: Cron/heartbeat/webhooks/file events all route through Agent Broker.
5. **Session = Persistent Worker**: With smart forking (mnemonic), any session history constitutes a resumable worker.

---

## 3. Deep Comparison: Upstream vs Manager-Worker

### 3.1 Upstream Subagent Model (Detailed)

#### `sessions_spawn` Tool Parameters

```typescript
sessions_spawn({
  task: string,           // The task description - becomes child's prompt
  label?: string,         // Human-readable name for the task
  agentId?: string,       // Target agent (default: same as parent)
  model?: string,         // Model override (e.g., "anthropic/claude-3-haiku")
  thinking?: string,      // Thinking level override
  runTimeoutSeconds?: number,  // Max runtime before timeout
  cleanup: "delete"|"keep"     // What to do with session after completion
})
```

**This is powerful:** You can spawn a fast model for browser tasks, a thinking model for complex reasoning, etc.

#### Session Key Structure

```
# Main session
agent:default:main

# Subagent session
agent:default:subagent:550e8400-e29b-41d4-a716-446655440000

# Cross-agent spawn
agent:browser-bot:subagent:550e8400-...
```

- `sessionId`: UUID for the session (used for transcript filename)
- `runId`: UUID for a specific agent run within a session
- Sessions can have multiple runs (resume capability)

#### subagent-registry.ts — Tracking

Persists to `~/.clawdbot/subagents/runs.json`:

```typescript
type SubagentRunRecord = {
  runId: string;              // Unique run identifier
  childSessionKey: string;    // The spawned session
  requesterSessionKey: string; // Who spawned it
  requesterOrigin?: DeliveryContext; // Channel/account context
  task: string;               // Original task
  cleanup: "delete"|"keep";
  label?: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  outcome?: { status: "ok"|"error"|"timeout", error?: string };
  archiveAtMs?: number;       // Auto-cleanup time
};
```

**Lifecycle events** via `onAgentEvent`:
- `phase: "start"` — run started
- `phase: "end"` — run completed
- `phase: "error"` — run failed

#### subagent-announce.ts — Result Delivery

When subagent completes:

1. **Build trigger message** for parent:
   ```
   A background task "code review" just completed successfully.
   
   ## Result
   [Child's final assistant reply]
   
   Stats: runtime 45s • tokens 12.5k (in 8.2k / out 4.3k) • est $0.12
   ```

2. **Check queue mode** of parent session:
   - `steer`: Inject into active run (if parent is running)
   - `followup`: Queue for parent's next turn
   - `collect`: Batch with other results
   - `interrupt`: Force new parent turn immediately

3. **Deliver** via `maybeQueueSubagentAnnounce()`

#### System Prompt for Subagents

```markdown
# Subagent Context

You are a **subagent** spawned by the main agent for a specific task.

## Your Role
- You were created to handle: [TASK]
- Complete this task. That's your entire purpose.

## Rules
1. Stay focused - Do your assigned task, nothing else
2. Complete the task - Your final message will be automatically reported
3. Don't initiate - No heartbeats, no proactive actions
4. Be ephemeral - You may be terminated after completion

## What You DON'T Do
- NO user conversations
- NO external messages (unless explicitly tasked)
- NO cron jobs or persistent state
- NO pretending to be the main agent
```

#### Why Upstream Forbids Nested Spawning

```typescript
// sessions-spawn-tool.ts line 109-113
if (isSubagentSessionKey(requesterSessionKey)) {
  return jsonResult({
    status: "forbidden",
    error: "sessions_spawn is not allowed from sub-agent sessions",
  });
}
```

**Reasoning:** Prevents runaway spawn chains, simplifies cleanup, avoids complex dependency graphs.

**Our position:** Remove this restriction. With proper broker tracking, nested spawning is manageable.

---

#### Upstream Proactive Triggers

**Heartbeat System:**
```typescript
// config.agents.defaults.heartbeat
{
  every: "30m",           // Interval
  activeHours: {          // Only run during these hours
    start: "08:00",
    end: "22:00",
    timezone: "user"
  },
  model: "anthropic/claude-3-haiku",  // Fast model for heartbeats
  session: "main",        // Which session gets the prompt
  target: "last",         // Where to deliver (last channel used)
  prompt: "Read HEARTBEAT.md if it exists...",
  ackMaxChars: 30         // If reply is just "HEARTBEAT_OK", don't deliver
}
```

**Heartbeat prompt** (injected as user message):
```
Read HEARTBEAT.md if it exists (workspace context). 
Follow it strictly. Do not infer or repeat old tasks from prior chats. 
If nothing needs attention, reply HEARTBEAT_OK.
```

**Cron System:**
```typescript
type CronJob = {
  id: string;
  name: string;
  schedule: CronSchedule;  // "at", "every", or cron expression
  sessionTarget: "main" | "isolated";  // Run in main or spawn new
  wakeMode: "next-heartbeat" | "now";
  payload: {
    kind: "systemEvent" | "agentTurn";
    message: string;
    model?: string;        // Model override
    deliver?: boolean;     // Send result to channel
    channel?: string;
  };
  isolation?: {
    postToMainMode: "summary" | "full";  // What to post back to main
  };
};
```

**Key insight:** Upstream's cron can:
- Run in isolated session (like a worker)
- Post summary back to main (like announce)
- Use different models per job

---

### 3.1.1 Upstream Strengths

- ✅ Simple mental model (spawn → run → announce)
- ✅ Clean session isolation with proper keys
- ✅ Built-in persistence (subagents/runs.json)
- ✅ Flexible queue modes for result timing
- ✅ Model/thinking overrides per spawn
- ✅ Heartbeat + Cron for proactive work
- ✅ Already integrated with clawdbot session system

### 3.1.2 Upstream Weaknesses

- ❌ Child cannot message parent mid-task
- ❌ No nested spawning (WA can't spawn sub-WA)
- ❌ No message queuing with priorities
- ❌ No broker abstraction (spawn logic in tool)
- ❌ Triggers (heartbeat/cron) don't route through unified layer
- ❌ No external caller tracking

---

### 3.2 Manager-Worker Model (Agent Broker)

**Implementation:**
- Central `AgentBroker` class managing all agent communication
- Tool: `send_message_to_agent(to, content, priority)`
- Durable message queues per agent (persisted to disk)
- All agents are session-backed (no special "always-on" concept)

**Clarification: "Always On" vs Session-Based**

There's no special "always on" agent. Here's what actually happens:

```
Upstream "main session":
- Just a session key (agent:default:main)
- Persisted transcript like any other session
- Receives messages, loads context from transcript, runs, saves

Agent Broker "Manager Agent":
- Also just a session (with special role in system prompt)
- Persisted transcript
- Receives messages via broker routing
- Loads context from transcript, runs, saves
```

**The difference is routing, not persistence.** The MA gets user messages by default. WAs get messages when explicitly addressed. Both are persistent sessions that can be resumed.

**Different sessions for different contexts:**

Upstream has many sessions:
- Main session (direct messages)
- Per-group sessions (Discord/Slack channels)
- Per-DM sessions (WhatsApp contacts)
- Subagent sessions (spawned tasks)

Agent Broker adds:
- Unified routing layer
- Cross-session messaging
- Priority-based delivery

**Flow:**
```
1. Trigger arrives (user message, heartbeat, cron, webhook)
2. Agent Broker routes to appropriate session:
   - User message → MA session
   - Heartbeat → MA session (or specific session)
   - Cron job → Target session (main or isolated)
   - WA result → MA session (or parent session)
3. Target session is loaded/resumed with context from transcript
4. Agent runs, can send messages to other agents via broker
5. Broker delivers to target, queues if busy
6. Session transcript persisted
```

**Strengths:**
- ✅ Unified message routing (all triggers → broker → agent)
- ✅ Workers can message back mid-task
- ✅ Message queuing with priorities (low/normal/high/urgent)
- ✅ Delivery modes (batch/single/interrupt)
- ✅ External caller tracking (who talked to whom)
- ✅ Durable queue state (survives restarts)
- ✅ Context injection hooks
- ✅ "Unified entity illusion" (optional)
- ✅ Nested spawning allowed

**Weaknesses:**
- ❌ Additional layer of complexity
- ❌ Needs integration with upstream session system
- ❌ Queue persistence needs implementation

---

### 3.3 Feature Comparison Matrix

| Feature | Upstream | Agent Broker | Winner |
|---------|----------|--------------|--------|
| **Simplicity** | Spawn tool + announce | Broker + routing | Upstream |
| **Session isolation** | Built-in | Uses upstream's | Tie |
| **All agents persistent** | Yes (sessions) | Yes (sessions) | Tie |
| **Mid-task communication** | No (completion only) | Yes | **Broker** |
| **Message queuing** | Result queue via announce | Full priority queue | **Broker** |
| **Proactive triggers** | Heartbeat + Cron | Unified trigger layer | **Broker** |
| **Context injection** | System prompt only | Broker hooks | **Broker** |
| **Queue modes** | 6 modes (steer, followup...) | Priority + delivery mode | Tie |
| **Nested spawning** | Forbidden | Allowed | **Broker** |
| **Cross-agent messaging** | Via allowlist | Full routing | **Broker** |
| **External caller tracking** | No | Yes | **Broker** |
| **Model override per spawn** | Yes | Should adopt | Upstream |
| **Subagent registry** | Built-in persistence | Needs implementation | Upstream |
| **Upstream compatibility** | Native | Needs adaptation | Upstream |

### 3.4 What We Take From Each

**From Upstream:**
- Session key structure (`agent:{id}:subagent:{uuid}`)
- `sessions_spawn` tool with model/thinking/timeout params
- Subagent registry persistence pattern
- Queue modes (steer, followup, collect, interrupt)
- Heartbeat + Cron infrastructure

**From Agent Broker:**
- Unified trigger routing
- Mid-task communication (worker → parent anytime)
- Message priorities (low/normal/high/urgent)
- External caller tracking
- Nested spawning permission
- Durable queue state

---

## 4. Design Decisions (Resolved)

### Q1: Are agents ephemeral or persistent?

**Decision: All agents are persistent.**

Every agent session is persisted. Any persisted session can be resumed with its full context. There is no concept of "ephemeral" agents. Even a WA spawned for a single task has a persistent session that can be resumed if needed.

This aligns with the mnemonic smart-forking model where any session history can become a resumable worker.

---

### Q2: How important is mid-task communication?

**Decision: Critical.**

Mid-task communication enables:
- User asks MA "how's it going?" → MA messages WA, interrupts work, gets status, WA continues
- WA encounters ambiguity → messages MA for clarification → MA asks user → response flows back
- WA finds early result → messages MA immediately → MA can respond to user before WA finishes

**Implementation:** WAs can call `send_message_to_agent(parent)` at any point. Broker routes to parent session.

---

### Q3: Should WAs be able to spawn sub-WAs?

**Decision: Yes, nested delegation allowed.**

We remove upstream's restriction. Use cases:
- WA doing complex task spawns specialized sub-WAs
- Browser WA spawns vision-model WA for screenshot analysis
- Research WA spawns multiple parallel sub-WAs

**Guard rails:** Broker tracks spawn depth. Configurable max depth (default: 3).

---

### Q4: Unified entity illusion — important?

**Decision: Nice to have, not critical.**

The MA can reformulate WA results before presenting to user, making it seem like one agent. But exposing the structure ("I asked my browser agent to check...") is also fine.

Upstream's `subagent-announce` already formats results nicely. We can enhance with MA reformulation later.

---

### Q5: How do proactive triggers work?

**Decision: Unified Trigger abstraction.**

All proactive triggers route through Agent Broker:

```
┌─────────────────────────────────────────────────────────────────┐
│                      TRIGGER SOURCES                             │
├──────────┬──────────┬──────────┬──────────┬───────────┬────────┤
│ Heartbeat│   Cron   │ Webhook  │  File    │ Completion│  User  │
│  Timer   │   Job    │  Event   │  Watch   │  Callback │ Message│
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴─────┬─────┴────┬───┘
     │          │          │          │           │          │
     └──────────┴──────────┴──────────┴───────────┴──────────┘
                              │
                              ▼
               ┌─────────────────────────────┐
               │        AGENT BROKER         │
               │                             │
               │  Routes trigger to most     │
               │  relevant session based on: │
               │  - Trigger metadata         │
               │  - Session affinity         │
               │  - Explicit target          │
               └──────────────┬──────────────┘
                              │
                              ▼
               ┌─────────────────────────────┐
               │      TARGET SESSION         │
               │  (resumes with context)     │
               └─────────────────────────────┘
```

**Example flow:**
1. WA kicks off long-running job, sets completion trigger with its session ID
2. WA finishes, returns control to MA
3. Job completes, fires trigger
4. Broker routes trigger to WA's session (not main)
5. WA resumes, processes result, notifies MA

---

## 5. Proposed Design: Agent Broker Layer

### Core Principle

**Build Agent Broker as a layer ON TOP of upstream's session system.** If upstream changes, we adapt the broker. If broker needs to diverge, we define clean interface and swap.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL TRIGGERS                               │
│  (User messages, Heartbeat, Cron, Webhooks, File watchers)         │
└────────────────────────────────────────────┬────────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         AGENT BROKER                                 │
│                                                                      │
│  Responsibilities:                                                   │
│  • Route messages/triggers to appropriate session                   │
│  • Manage priority queues per session                               │
│  • Track session relationships (who spawned whom)                   │
│  • Enable mid-task communication (worker → parent)                  │
│  • Persist queue state for durability                               │
│                                                                      │
│  Tools exposed to agents:                                            │
│  • send_message_to_agent(to, content, priority)                     │
│  • create_trigger(type, target_session, payload)                    │
│                                                                      │
└────────────────────────────────────────────┬────────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    UPSTREAM GATEWAY/SESSIONS                         │
│  (Existing clawdbot - handles session store, transcripts, runs)     │
│                                                                      │
│  We use:                                                             │
│  • sessions_spawn (with model/thinking/timeout)                     │
│  • Session transcript persistence                                    │
│  • Queue modes (steer, followup, collect, interrupt)                │
│  • Subagent registry (tracking spawned runs)                        │
└─────────────────────────────────────────────────────────────────────┘
```

### What Agent Broker Adds

| Capability | How |
|------------|-----|
| Mid-task messaging | Broker accepts messages from any session, routes to target |
| Priority queues | Broker maintains queue per session, processes by priority |
| Nested spawning | Broker tracks spawn hierarchy, allows depth |
| External caller tracking | Broker records message provenance |
| Unified triggers | All triggers flow through broker before routing |
| Durable queues | Broker persists queue state to disk |

### What We Delegate to Upstream

| Capability | Why |
|------------|-----|
| Session storage | Their format works, no reason to diverge |
| Transcript persistence | JSONL format is good, aix compatible |
| `sessions_spawn` | Their tool has good params (model, thinking, timeout) |
| Subagent registry | They already persist spawn records |
| Heartbeat/Cron | Their system works, broker just routes results |

### Implementation Plan

**Phase 1: Broker as routing layer**
- Implement AgentBroker class
- Message routing (send_message_to_agent)
- Priority queues (in-memory initially)
- Track spawn relationships

**Phase 2: Integrate with upstream spawn**
- Wrap `sessions_spawn` to register with broker
- Hook subagent-announce to flow through broker
- Enable mid-task communication

**Phase 3: Unified triggers**
- Route heartbeat through broker
- Route cron through broker
- Add webhook/file-watch handlers

**Phase 4: Durability**
- Persist queue state
- Handle process restart
- Resume pending work

### Interface Definition

If broker needs to fully replace upstream, this is the interface:

```typescript
interface AgentBrokerInterface {
  // Message routing
  sendMessage(from: string, to: string, content: string, priority: Priority): Promise<void>;
  
  // Session management
  spawnSession(params: SpawnParams): Promise<SessionInfo>;
  resumeSession(sessionId: string): Promise<void>;
  
  // Triggers
  registerTrigger(trigger: TriggerDef): Promise<string>;
  fireTrigger(triggerId: string, payload: unknown): Promise<void>;
  
  // Queries
  getSessionStatus(sessionId: string): SessionStatus;
  getSpawnTree(rootSessionId: string): SpawnTree;
  getQueueDepth(sessionId: string): number;
}
```

If upstream can fulfill this interface, we use their implementation. If not, we implement our own.

---

## 6. Open Questions (Remaining)

1. **MA Tool Restrictions**: How minimal should MA's toolset be? Just spawn + message + respond? Or some read-only tools for quick answers?

2. **Worker Session Cleanup**: Default to `cleanup: "keep"` (persistence) or `cleanup: "delete"` (space)? Recommendation: Keep by default, clean up via archiveAfterMinutes.

3. **Spawn Depth Limit**: What's reasonable max depth for nested spawning? Recommendation: 3 levels default, configurable.

4. **Queue Persistence Format**: JSON file? SQLite? Recommendation: JSON file in `~/.nexus/broker/queues.json` (simple, readable).

5. **Trigger Association**: How to associate triggers with specific sessions vs main? Recommendation: Triggers include `targetSession` field.

---

## 7. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-22 | Adopt "Manager-Worker Pattern" naming | MA manages + delegates, clearer than "Router" |
| 2026-01-22 | Use "Agent Broker" (not ActiveMessageBroker) | Cleaner name |
| 2026-01-22 | All agents persistent | No ephemeral agents, aligns with mnemonic |
| 2026-01-22 | Allow nested spawning | Remove upstream restriction, track depth |
| 2026-01-22 | Mid-task communication is critical | Enables status queries, clarification |
| 2026-01-22 | Unified trigger abstraction | All triggers → broker → session |
| 2026-01-22 | Layer broker ON TOP of upstream | Minimize divergence, use their session system |

---

## Appendix A: Upstream Code References

**Subagent System:**
- `src/agents/tools/sessions-spawn-tool.ts` — Spawn implementation with params
- `src/agents/subagent-registry.ts` — Tracking spawned runs, persistence
- `src/agents/subagent-registry.store.ts` — Disk persistence format
- `src/agents/subagent-announce.ts` — Result delivery to parent
- `src/agents/subagent-announce-queue.ts` — Queue management

**Proactive Triggers:**
- `src/infra/heartbeat-runner.ts` — Heartbeat scheduler
- `src/cron/types.ts` — Cron job types
- `src/cron/service.ts` — Cron scheduler
- `src/cron/isolated-agent/` — Isolated session for cron

**Session System:**
- `src/config/sessions/types.ts` — SessionEntry type
- `src/config/sessions/transcript.ts` — JSONL persistence
- `src/auto-reply/reply/queue.ts` — Queue modes (steer, followup, etc.)

**Config:**
- `src/config/types.agents.ts` — Agent config with subagents
- `src/config/types.agent-defaults.ts` — Heartbeat, subagent defaults

## Appendix B: Agent Broker Code References

**From Tyler's implementation (commit f78834e08):**
- `src/control-plane/broker/broker.ts` — ActiveMessageBroker class

**Key Types:**
```typescript
interface AgentMessage {
  id: string;
  from: string;      // Agent ID or 'user' or 'system'
  to: string;        // Target agent ID
  content: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  deliveryMode?: 'batch' | 'single' | 'interrupt';
  timestamp: number;
  conversationId?: string;
  metadata?: { source?: string; taskName?: string; };
}
```

**Key Methods:**
- `send(message)` — Route message to target
- `sendAndWaitForAck(message)` — Synchronous call
- `routeMessage(from, to)` — Resolve short names
- `registerIA(iaId, instance)` — Register manager agent

## Appendix C: Comparison Summary

| Aspect | Upstream | Agent Broker | Combined |
|--------|----------|--------------|----------|
| Spawning | `sessions_spawn` | `send_message_to_agent` | Use upstream tool |
| Tracking | subagent-registry | broker tracks | Use both |
| Results | subagent-announce | broker routes | Route through broker |
| Queue modes | steer/followup/etc | priority/delivery | Complement each other |
| Triggers | heartbeat + cron | unified abstraction | Broker unifies |
| Session storage | sessions.json | delegates | Use upstream |
| Mid-task comm | Not supported | Native | Add via broker |
| Nested spawn | Forbidden | Allowed | Remove restriction |
