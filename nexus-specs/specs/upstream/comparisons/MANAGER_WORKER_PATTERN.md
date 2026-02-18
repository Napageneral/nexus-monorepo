# Manager-Worker Pattern Comparison

**Status:** ANALYSIS  
**Last Updated:** 2026-02-04  
**References:**
- OpenClaw: `specs/runtime/broker/upstream/UPSTREAM_AGENT_SYSTEM.md`
- Nexus: `specs/runtime/broker/AGENTS.md`

---

## Summary

OpenClaw and Nexus both support multi-agent orchestration, but with fundamentally different philosophies:

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Model** | Flat subagent spawning | Hierarchical Manager-Worker |
| **Nesting** | Forbidden | Allowed (depth limit) |
| **Communication** | Completion-only, via gateway | Bidirectional, via Broker |
| **Worker role** | Background task runner | Collaborative agent |
| **Hierarchy** | One level max | Multi-level (default: 3) |

**Bottom line:** OpenClaw treats subagents as isolated fire-and-forget tasks. Nexus treats workers as first-class collaborators that can communicate, nest, and orchestrate.

---

## OpenClaw Approach

### Spawn Mechanism

OpenClaw uses `sessions_spawn` tool to create subagents:

```typescript
SessionsSpawnToolSchema = {
  task: string,           // Required task description
  label?: string,         // Human-readable label
  agentId?: string,       // Cross-agent spawn target
  model?: string,         // Model override
  thinking?: string,      // Thinking level
  runTimeoutSeconds?: number,
  cleanup: "delete" | "keep"
}
```

### Nested Spawn: FORBIDDEN

This is the critical restriction. OpenClaw explicitly forbids subagents from spawning:

```typescript
// sessions-spawn-tool.ts lines 109-114
if (isSubagentSessionKey(requesterSessionKey)) {
  return jsonResult({
    status: "forbidden",
    error: "sessions_spawn is not allowed from sub-agent sessions",
  });
}
```

**Detection:** Any session key containing `subagent:` prefix is blocked from spawning.

### Cross-Agent Spawn: Requires Allowlist

Even single-level spawns to different agent IDs require explicit configuration:

```typescript
const allowAgents = resolveAgentConfig(cfg, requesterAgentId)?.subagents?.allowAgents ?? [];
if (!allowAny && !allowSet.has(normalizedTargetId)) {
  return jsonResult({
    status: "forbidden",
    error: `agentId is not allowed for sessions_spawn`,
  });
}
```

### Subagent Restrictions

The subagent system prompt makes constraints explicit:

```
## Rules
1. Stay focused - Do your assigned task, nothing else
2. Complete the task - Final message is automatically reported to main agent
3. Don't initiate - No heartbeats, no proactive actions, no side quests
4. Be ephemeral - You may be terminated after task completion

## What You DON'T Do
- NO user conversations (that's main agent's job)
- NO external messages unless explicitly tasked
- NO cron jobs or persistent state
- NO pretending to be the main agent
```

### Communication Flow

Subagents communicate back to the main agent only at completion:

```
Main Agent → sessions_spawn() → Gateway creates subagent session
                                        ↓
                         Subagent executes task (isolated)
                                        ↓
                         Subagent completes → runSubagentAnnounceFlow()
                                        ↓
                         Gateway routes announce to main session
                                        ↓
                         Main Agent receives: "Background task X completed"
```

**Key limitations:**
- No mid-task communication from subagent
- No ability for main agent to query subagent status during execution
- No collaborative back-and-forth
- Announce is post-hoc summary, not interactive

### Why These Restrictions Exist

OpenClaw's design optimizes for:
1. **Safety** — Subagents can't escalate or cascade unpredictably
2. **Simplicity** — Flat hierarchy is easier to reason about
3. **Isolation** — Subagent failure doesn't cascade upward
4. **Gateway architecture** — All routing through central gateway

---

## Nexus Approach

### Manager-Worker Pattern (MWP)

Nexus makes hierarchical orchestration a first-class concept:

```
                    NEX Pipeline
                         ↓
                   AGENT BROKER
                    ↓         ↓
            Manager Agent   Worker Agent
                              ↓
                         Sub-Worker
                              ↓
                         Sub-Sub-Worker
```

### Nested Spawning: ALLOWED

Workers can spawn their own workers. This is intentional and tracked:

```
WA executes complex task
  ↓
WA needs specialized help → agent_send({ op: "dispatch", target: { session: "worker:sub-worker" }, ... })
  ↓
Sub-WA executes, can spawn further if needed
  ↓
Results bubble up through hierarchy
```

**Depth limit:** Configurable, default 3 levels. Broker tracks spawn depth and enforces.

### Bidirectional Communication

Unlike OpenClaw's completion-only model, Nexus workers can message back anytime:

```typescript
// Worker tools include:
agent_send({
  op: "message",
  text: "Need clarification on X...",
  target: { session: "parent" }
})
```

**Communication scenarios:**
- Progress updates during long tasks
- Clarifying questions that need user input  
- Partial results before full completion
- Status checks from manager

### Permission Inheritance

Workers inherit their spawner's permissions (scoped):

```
Manager Agent (full permissions)
  ↓ spawns
Worker Agent (inherits MA permissions, possibly scoped)
  ↓ spawns  
Sub-Worker (inherits WA permissions, further scoped)
```

This enables delegation without re-specifying access at each level.

### Broker-Mediated Communication

All inter-agent communication goes through the Broker (fast path):

```
Agent A → Broker → Agent B
              ↓
        Agents Ledger (persisted)
```

**Benefits over gateway RPC:**
- Direct routing, no gateway round-trip
- Durable message queues in SQLite
- Relationship tracking (who spawned whom)
- Unified queue management (same modes: steer, followup, collect)

### Agent Persistence

All agents are persistent. There are no ephemeral subagents:

> "Every agent session is persisted to the Agents Ledger. There are no 'ephemeral' agents. Any session can be resumed with its full context."

This means:
- Worker context survives across interactions
- Workers can be re-engaged without re-spawning
- Historical worker sessions are queryable

---

## Why Nested Spawning Matters

### Real-World Task Decomposition

Complex tasks naturally decompose into hierarchies:

**Example 1: Research → Analyze → Summarize**
```
User: "Research competitors and give me a strategic summary"

Manager Agent
  ↓ spawns
Research Worker
  ↓ (finds 5 competitors, spawns specialists for each)
  ├── Competitor-A Analyst
  ├── Competitor-B Analyst  
  ├── Competitor-C Analyst
  ├── Competitor-D Analyst
  └── Competitor-E Analyst
       ↓ (analysts complete)
Research Worker aggregates
  ↓
Manager summarizes for user
```

**With OpenClaw:** Research Worker cannot spawn analysts. Must do serial analysis in one session, or main agent must coordinate all spawns.

**Example 2: Code Review with Multiple Concerns**
```
User: "Review this PR"

Manager Agent
  ↓ spawns
Code Review Worker
  ↓ (identifies concerns, spawns specialists)
  ├── Security Reviewer (specific expertise)
  ├── Performance Reviewer (specific expertise)
  └── Style Reviewer (specific expertise)
       ↓ (all complete)
Code Review Worker synthesizes
  ↓
Manager presents unified review
```

**With OpenClaw:** Must run security/performance/style as separate subagents from main agent, coordinating in the main session.

### Why OpenClaw's Restriction Hurts

1. **Centralized coordination overhead** — Main agent must manage all spawns, breaking encapsulation

2. **Context pollution** — Main agent's context fills with worker management instead of user interaction

3. **No specialist composition** — Cannot have a "research expert" that internally delegates; must flatten to single level

4. **Parallel execution complexity** — Orchestrating parallel subtasks from main requires explicit fan-out/fan-in

### What Nexus Enables

1. **Encapsulated delegation** — "Research this" means the research worker owns the strategy, including sub-delegation

2. **Specialist workers** — Build workers that are themselves orchestrators (e.g., "code analysis worker" that internally uses security/perf/style workers)

3. **Natural decomposition** — Task structure maps directly to agent hierarchy

4. **Manager simplicity** — Manager focuses on user, not on worker internals

---

## Communication Patterns Compared

### OpenClaw: Completion-Only

```
Main ───spawn───► Subagent ───(isolated execution)───► announce ───► Main
                                   ↑
                              No mid-task
                              communication
```

- Subagent cannot ask questions
- Main cannot check progress
- Result is final output only

### Nexus: Anytime Communication

```
Manager ◄────► Worker ◄────► Sub-Worker
         │           │
     progress    questions
     updates     requests
     queries      results
```

- Worker asks: "This file is ambiguous, which interpretation?"
- Manager queries: "How far along are you?"
- Worker reports: "Found 3 critical issues, still checking 2 more files"

---

## Permission Model Comparison

### OpenClaw

- Subagents are explicitly restricted:
  - No `message` tool (unless explicitly tasked with target)
  - No heartbeats
  - No cron jobs
  - No persistent state
  - No cross-agent spawning without allowlist

### Nexus

- Workers inherit Manager permissions (scoped down, not up)
- Workers can use `agent_send` (`op="message"`) to communicate
- Workers can spawn sub-workers (within depth limit)
- Workers share behavioral constraints of their Manager
- Explicit permission escalation/restriction is a design question (not yet specified)

---

## Technical Implementation Differences

| Component | OpenClaw | Nexus |
|-----------|----------|-------|
| **Spawn tool** | `sessions_spawn` | `agent_send` (`op="dispatch"`) |
| **Spawn tracking** | `subagent-registry.ts` (JSON file) | Agents Ledger (SQLite) |
| **Session keys** | `agent:{id}:subagent:{uuid}` | Managed by Broker |
| **Result routing** | `subagent-announce.ts` via gateway | Broker direct routing |
| **Queue storage** | In-memory `Map<string, FollowupQueueState>` | SQLite (durable) |
| **Mid-task msgs** | Not supported | Native via Broker |
| **Nested detect** | `isSubagentSessionKey()` check | Broker tracks spawn depth |

---

## What This Unlocks

### 1. Real Orchestration

Nexus MWP enables true orchestration patterns:
- Map-reduce over documents
- Parallel specialist analysis
- Hierarchical research/synthesis
- Expert routing within domains

### 2. Scalable Complexity

Tasks can scale to arbitrary complexity without main agent context pollution:
- "Analyze this codebase" can internally spawn per-module workers
- Each module worker can spawn per-concern analyzers
- Results compose upward

### 3. Reusable Worker Agents

Because workers are persistent and can orchestrate internally:
- Build a "research agent" that knows how to delegate internally
- Build a "code review agent" that has its own specialist sub-agents
- Compose agents like services

### 4. Interactive Long Tasks

Workers that take minutes can:
- Report progress
- Ask clarifying questions
- Deliver partial results
- Be queried for status

---

## Migration Considerations

If porting from OpenClaw to Nexus MWP:

1. **Replace `sessions_spawn`** with `agent_send` (`op="dispatch"`)
2. **Remove nested spawn checks** — Nexus Broker handles depth limits
3. **Add bidirectional communication** — Workers can use `agent_send` (`op="message"`)
4. **Rethink announce flow** — Results route through Broker, not gateway announce
5. **Update subagent prompts** — Remove "no spawning" restriction, add "can delegate if needed"
6. **Migrate queue state** — From in-memory Map to Agents Ledger

---

## Open Questions

1. **Depth limit tuning** — Is 3 levels universally sufficient? Should some workspaces go deeper?

2. **Cross-Manager spawning** — Can Worker A spawn a worker under Manager B? (Probably no for isolation)

3. **Worker lifecycle** — When is a worker "done"? Keep-alive vs cleanup semantics?

4. **Permission scoping** — How exactly are permissions narrowed at each spawn level?

---

*This document compares OpenClaw's flat subagent model with Nexus's hierarchical Manager-Worker Pattern.*
