# Context Assembly

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-06

---

## Overview

Context assembly is how the Broker builds the full context for agent execution before delegating to the agent engine (`pi-coding-agent`). This is a critical piece that significantly impacts agent performance and cost (via prompt caching).

**Key Principle:** Context is assembled from five conceptual layers that map to three physical layers with different caching properties. The conceptual model helps reason about *what goes where*. The physical model optimizes for *LLM prompt caching*.

---

## Context Layers: Conceptual → Physical

### Five Conceptual Layers

Context comes from five distinct sources, each changing at a different rate:

| # | Conceptual Layer | What It Contains | Change Frequency |
|---|------------------|------------------|-----------------|
| 1 | **Workspace** | AGENTS.md, rules, static runtime info (host, os, arch) | Rarely (config changes) |
| 2 | **Persona** | SOUL.md, IDENTITY.md, user IDENTITY.md, permissions | Rarely (identity changes) |
| 3 | **Session** | Conversation history from Agents Ledger (turns, compaction summaries) | Every turn (grows incrementally) |
| 4 | **Memory** | Injected memories, relevant skill context, semantic matches | Per-event (varies by content) |
| 5 | **Event** | Current time, channel, hook injections, user message | Every turn (fully dynamic) |

### Three Physical Layers

These five conceptual layers get assembled into three physical layers in the LLM API call, optimized for prompt caching:

```
messages: [
  { role: "system", content: "..." },          // Physical Layer 1: System Prompt (static)
  { role: "user", content: "turn 1 query" },   // Physical Layer 2: Conversation History
  { role: "assistant", content: "turn 1 resp" },//   (grows incrementally)
  { role: "user", content: "turn 2 query" },   //
  { role: "assistant", content: "turn 2 resp" },//
  { role: "user", content: "event ctx + msg" } // Physical Layer 3: Current Event (dynamic)
]
```

### Mapping: Conceptual → Physical

| Conceptual Layer | Physical Layer | Caching Behavior |
|------------------|---------------|-----------------|
| **Workspace** | System Prompt (static) | Full cache hit — identical between turns |
| **Persona** | System Prompt (static) | Full cache hit — identical between turns |
| **Session** | Conversation History (incremental) | Prefix cache — extends each turn, only new exchange is uncached |
| **Memory** | Current Event (dynamic) | Never cached — varies per event |
| **Event** | Current Event (dynamic) | Never cached — changes every turn |

**Why this mapping matters for cost:**

```
Turn N:   [system] [history_1..N-1] [user_N]         → cache: system + history
Turn N+1: [system] [history_1..N]   [user_N+1]       → cache extends (only user_N+1 is new)
After compaction: [system] [summary] [kept] [user_M]  → cache miss (new prefix, acceptable)
```

Workspace and Persona are static — they form the system prompt that gets cached perfectly. Session history extends incrementally — Anthropic's prefix caching means only the newest exchange is uncached. Memory and Event are dynamic — they go in the final message and are never cached, but they're typically small relative to history.

---

## Physical Layer 1: System Prompt (Static)

The first message. Rarely changes between turns. Fully cacheable.

**Conceptual layers baked in:** Workspace + Persona

**Contains:**
- Workspace rules (AGENTS.md)
- User identity (IDENTITY.md)
- Agent identity (SOUL.md, IDENTITY.md)
- Persona permissions
- Nexus environment (capabilities, skills summary)
- Static runtime info (host, os, arch)

**Caching:** Identical between turns → full cache hit every time. Only changes when workspace config, persona, or capabilities change.

## Physical Layer 2: Conversation History (Incremental)

The messages array between system prompt and current event. Grows by one exchange per turn.

**Conceptual layer:** Session

**Contains:**
- Previous turn messages from Agents Ledger (query + response pairs)
- Compaction summaries (if applicable, injected as first history message)
- Tool call results from previous turns

**Caching:** Anthropic caches based on the message array prefix. Each turn EXTENDS the prefix — previous history is already cached, only the most recent exchange is new. Compaction resets the cache (new prefix), but that's infrequent.

## Physical Layer 3: Current Event (Dynamic)

The final user message. Changes every turn. Never cached.

**Conceptual layers baked in:** Memory + Event

**Contains:**
- Current time and timezone
- Channel and channel actions (for MA)
- Memory injections (future: relevant memories, skill context)
- Event-specific metadata
- Hook injections
- The actual user message / event content

---

## System Prompt Components

The system prompt is a single string assembled from static sources:

### 1. Workspace Context

- `AGENTS.md` — System behavior rules, safety rules, social behavior
- User identity (IDENTITY.md — name, timezone, preferences)
- Workspace rules and configuration

### 2. Persona Context

- Agent identity (SOUL.md — personality, values, boundaries)
- Agent identity (IDENTITY.md — name, emoji, vibe)
- Permissions and constraints

### 3. Nexus Environment

The agent needs awareness of available capabilities without having full skill guides loaded. The Broker injects a condensed snapshot of the Nexus environment:

```
## Nexus Environment

You have the `nexus` CLI for skill discovery and credential management.

### Capabilities
Communication: email-read, email-send, messaging-read ✅ | chat-read, chat-send ⭐ (ready)
Social: social-x ✅ | news 🔧 (needs API key)
[...condensed by category...]

### Using Skills
Run `nexus skill use <name>` to get the full guide for any capability.

### Credentials
12 configured | 1 broken (twitter)
```

**How this is generated:** The Broker calls Nexus CLI internals (or reads state directly) to produce a condensed capability summary. This is equivalent to `nexus status --json --brief` rendered as context.

**Why not inject full skill guides?** Skill guides are loaded on-demand via `nexus skill use <name>`. Injecting all of them would waste tokens. The summary tells the agent what's available; the agent loads what it needs.

**Future:** Cortex will auto-inject relevant skill guides based on event content. For now, the agent discovers and loads skills via CLI.

### 4. Static Runtime Info

| Field | In System Prompt | Rationale |
|-------|-----------------|-----------|
| `host`, `os`, `arch` | Yes | Static per machine |
| `model`, `provider` | No (logged in turn) | Changes per turn, not useful as context |
| `platform`, `platformActions` | No (event context) | Varies by event |
| `time`, `timezone` | No (event context) | Changes every turn |

### System Prompt Construction

```typescript
function buildSystemPrompt(params: {
  workspace: WorkspaceContext;
  persona: PersonaContext;
  nexusEnv: NexusEnvironment;
  runtime: { host: string; os: string; arch: string };
  role: 'manager' | 'worker' | 'unified';
}): string {
  const sections = [
    // Always included
    renderWorkspaceRules(params.workspace),
    renderIdentity(params.persona),
    renderNexusEnvironment(params.nexusEnv),
    renderRuntimeInfo(params.runtime),
    
    // Role-specific
    params.role === 'manager' && renderMessagingRules(),
    params.role === 'worker' && renderTaskInstructions(),
  ];
  
  return sections.filter(Boolean).join('\n\n');
}
```

---

## Conversation History Assembly

History is read from the Agents Ledger, NOT JSONL files like upstream.

### Reading from Agents Ledger

```typescript
async function buildHistoryMessages(threadId: string): Promise<Message[]> {
  // Get thread ancestry (ordered root → current)
  const thread = await getThread(threadId);
  const turnIds: string[] = JSON.parse(thread.ancestry);
  const turns = await getTurnsByIds(turnIds);
  
  // Find the LATEST compaction (not first!)
  const latestCompaction = findLatestCompaction(turns);
  
  if (latestCompaction) {
    return buildCompactedHistory(latestCompaction, turns);
  }
  
  // No compaction — full history
  return buildFullHistory(turns);
}
```

### Compaction-Aware History

```typescript
function findLatestCompaction(turns: Turn[]): CompactionTurn | null {
  // Walk backwards through ancestry to find most recent compaction
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].turn_type === 'compaction') {
      return turns[i] as CompactionTurn;
    }
  }
  return null;
}

async function buildCompactedHistory(
  compaction: CompactionTurn, 
  turns: Turn[]
): Promise<Message[]> {
  // Get compaction details from compactions table
  const details = await getCompaction(compaction.id);
  
  // Start with compaction summary
  const messages: Message[] = [{
    role: 'user',
    content: `[Previous conversation summary]\n${details.summary}`,
  }];
  
  // Add kept turns (everything after the compaction turn in ancestry)
  const compactionIdx = turns.findIndex(t => t.id === compaction.id);
  const keptTurns = turns.slice(compactionIdx + 1);
  
  for (const turn of keptTurns) {
    const turnMessages = await getMessagesByTurnId(turn.id);
    messages.push(...turnMessages);
  }
  
  return messages;
}

async function buildFullHistory(turns: Turn[]): Promise<Message[]> {
  const messages: Message[] = [];
  for (const turn of turns) {
    const turnMessages = await getMessagesByTurnId(turn.id);
    messages.push(...turnMessages);
  }
  return messages;
}
```

**Note on compaction summary role:** We inject the summary as `role: 'user'` with a clear `[Previous conversation summary]` marker rather than `role: 'system'`, since multiple system messages have inconsistent behavior across providers. The marker makes it clear to the model that this is a summary, not a live message.

---

## Current Event Assembly

The current event is the final user message. Dynamic context is prepended to the actual content.

```typescript
function buildCurrentMessage(event: NexusEvent, role: AgentRole): Message {
  const contextParts: string[] = [];
  
  // Time (always)
  contextParts.push(`Current time: ${new Date().toISOString()}`);
  contextParts.push(`Timezone: ${event.timezone || 'UTC'}`);
  
  // Platform context (MA only)
  if (role === 'manager' && event.platform) {
    contextParts.push(`Platform: ${event.platform}`);
    if (event.platformActions?.length) {
      contextParts.push(`Available actions: ${event.platformActions.join(', ')}`);
    }
  }
  
  // Hook injections
  if (event.hookData) {
    contextParts.push(renderHookData(event.hookData));
  }
  
  // Assemble
  const eventContext = contextParts.join('\n');
  const content = `${eventContext}\n\n${event.content}`;
  
  return { role: 'user', content, source: event.source };
}
```

---

## AssembledContext Output

Context Assembly produces an `AssembledContext` that the Broker hands to the agent engine. This is the contract between Context Assembly and execution.

```typescript
interface AssembledContext {
  // The three layers
  systemPrompt: string;              // Layer 1: static system prompt
  history: Message[];                // Layer 2: conversation history from ledger
  currentMessage: Message;           // Layer 3: event context + user message
  
  // Tool configuration
  tools: AgentTool[];                // Available tools (IAM-filtered)
  
  // Model configuration
  model: string;                     // e.g., 'claude-sonnet-4-20250514'
  provider: string;                  // e.g., 'anthropic'
  modelConfig: ModelConfig;          // temperature, maxTokens, thinking, etc.
  
  // Token budget (for the agent engine to respect)
  tokenBudget: TokenBudget;
  
  // Metadata (for ledger writes after execution)
  sessionLabel: string;              // Which session this turn belongs to
  parentTurnId: string;              // Parent turn in the tree
  role: AgentRole;                   // 'manager' | 'worker' | 'unified'
  toolsetName: string;               // Named toolset applied
  permissionsGranted: Permission[];  // IAM permissions snapshot
  sourceEventId?: string;            // NEX event that triggered this
  workspacePath: string;             // Workspace root
}

// What the agent engine returns (see AGENT_ENGINE.md)
interface AgentResult {
  messages: Message[];               // All messages produced (including tool calls)
  toolCalls: ToolCall[];             // Tool invocations with results
  usage: TokenUsage;                 // Actual token consumption
  stopReason: string;                // Why the agent stopped
  error?: string;                    // If the turn failed
}
```

**This interface is critical.** It connects Context Assembly → Agent Engine → Ledger Writes → Streaming. See `AGENT_ENGINE.md` for the full execution interface.

---

## Token Budget Management

### Budget Calculation

```typescript
interface TokenBudget {
  modelLimit: number;           // Model's context window (e.g., 200_000)
  reserveResponse: number;      // Reserved for output (~4k-8k)
  reserveTools: number;         // Reserved for tool results (~8k-16k)
  available: number;            // modelLimit - reserves
  
  // Current allocation
  used: {
    systemPrompt: number;       // Measured once, cached
    history: number;            // Sum of turn token counts from ledger
    event: number;              // Estimated from event content
    total: number;
  };
  
  remaining: number;            // available - used.total
}
```

### Token Counting Strategy

We don't need a tokenizer for v1. We have better:

- **System prompt:** Estimate once on construction, cache until it changes. Use `~4 chars/token` as rough estimate.
- **History turns:** Exact token counts already stored in Agents Ledger (`turns.total_tokens`). Use these directly.
- **Current event:** Estimate from content length. Add safety margin.

This gives us accurate-enough budgets since history (the biggest variable) uses real numbers from the ledger.

### Overflow Prevention (Proactive)

Before each turn, check the budget:

```typescript
async function ensureBudget(
  budget: TokenBudget, 
  sessionLabel: string
): Promise<{ compacted: boolean }> {
  if (budget.remaining > 0) {
    return { compacted: false };  // We're fine
  }
  
  // Need to compact — trigger before sending to model
  await triggerCompaction(sessionLabel, {
    targetTokens: budget.available * 0.6,  // Compact to 60% of available
    trigger: 'context_limit',
  });
  
  return { compacted: true };
}
```

**Why proactive?** No wasted API calls, no latency from failed requests, predictable behavior.

### Overflow Recovery (Reactive Fallback)

If the model still returns a context overflow error (our estimate was wrong):

```typescript
async function handleOverflow(
  sessionLabel: string, 
  budget: TokenBudget
): Promise<void> {
  // More aggressive compaction — keep fewer turns
  await triggerCompaction(sessionLabel, {
    targetTokens: budget.available * 0.4,  // Compact to 40%
    trigger: 'overflow_recovery',
  });
  
  // Retry once. If still failing, propagate error.
}
```

**This should be rare.** If it's happening frequently, our token estimates need calibration.

### Compression Priority

When tokens are tight, compress in this order:

1. **Memory injection** — Reduce to 0 (not implemented yet)
2. **Conversation history** — Trigger compaction, summarize old turns
3. **NEVER cut:**
   - System prompt (workspace rules, persona identity, nexus environment)
   - Current event/user message
   - Recent history (keep last N turns even during aggressive compaction)

### Token Limits by Model

```typescript
const MODEL_LIMITS: Record<string, number> = {
  'claude-sonnet-4': 200_000,
  'claude-opus-4': 200_000,
  'gpt-4o': 128_000,
  'o1': 200_000,
  'o3': 200_000,
};

function getModelLimit(model: string): number {
  // Handle date-suffixed model names (e.g., 'claude-sonnet-4-20250514')
  const base = model.replace(/-\d{8}$/, '');
  return MODEL_LIMITS[base] ?? 128_000;
}
```

---

## MA vs WA Context Differences

Different agent roles get different context:

| Layer | Manager Agent | Worker Agent |
|-------|---------------|--------------|
| Workspace (AGENTS.md) | Full | Full |
| Persona identity | Own identity | Inherits from MA |
| Nexus environment | Full capabilities | Scoped to task-relevant |
| Platform context | Yes (platform, actions) | No (internal only) |
| Session history | Full MA thread | Only WA task context |
| Memory injection | Future: relevant memories | Future: task-specific only |
| Spawning capability | Can spawn workers | Can spawn nested workers |
| Messaging tools | Full platform access | Reply to MA only |

### Worker Agent System Prompt

Workers get a stripped-down system prompt focused on their task:

```typescript
function buildWorkerSystemPrompt(params: {
  workspace: WorkspaceContext;
  persona: PersonaContext;         // Inherited from MA
  task: string;                    // Task description from spawn
  nexusEnv: NexusEnvironment;      // Scoped subset
  runtime: RuntimeInfo;
}): string {
  return `
# Subagent Context

You are a **worker agent** spawned for a specific task.

## Your Task
${params.task}

## Rules
1. Stay focused — do your assigned task, nothing else
2. Complete the task — your final message reports back to the manager
3. Don't initiate — no proactive actions, no side quests
4. Be ephemeral — you may be terminated after completion

## What You DON'T Do
- NO user conversations (manager's job)
- NO external messages unless explicitly tasked
- NO persistent state changes outside your task scope

${renderWorkspaceRules(params.workspace)}
${renderIdentity(params.persona)}
${renderNexusEnvironment(params.nexusEnv)}
`;
}
```

---

## Context Assembly Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                       CONTEXT ASSEMBLY                                │
│                                                                       │
│  INPUTS: NexusRequest (event, identity, permissions, routing)        │
│                                                                       │
│  1. Resolve routing → session label → thread head                    │
│     ↓                                                                 │
│  2. Build system prompt (workspace + persona + nexus env + runtime)   │
│     ↓                                                                 │
│  3. Build conversation history from Agents Ledger                    │
│     - Walk thread ancestry                                            │
│     - Apply compaction summaries if present                          │
│     ↓                                                                 │
│  4. Build current event message (time, platform, hooks, content)     │
│     ↓                                                                 │
│  5. Prepare tool set (with IAM-based filtering)                      │
│     ↓                                                                 │
│  6. Calculate token budget                                            │
│     - Check: does it fit? If not, compact first.                     │
│     ↓                                                                 │
│  7. Return AssembledContext → Agent Engine                            │
│                                                                       │
│  OUTPUT: AssembledContext                                              │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Memory System Integration

**STATUS: DEFERRED** — Automatic memory injection is a future enhancement. Initial implementation will NOT have automatic memory/skill injection.

**Current approach:** Agents discover and load skills on-demand via `nexus skill use <name>`. No automatic injection.

**Future approach:** The Memory System reads the event content and automatically injects relevant skill guides and memory into context. This would:
- Replace the manual `nexus skill use` pattern for common skills
- Inject relevant memories/episodes based on conversation topic
- Be budget-aware (allocated from token budget, compressed first when tight)

See `TODO.md` for tracking.

### context_json on Messages

Context tracking lives at the message level (see `AGENTS_LEDGER.md`). Each message's `context_json` field captures what context was injected into or attached to that message:

- **System messages:** Assembled context metadata (workspace version, persona ID, capability snapshot hash)
- **User messages:** Event context details, hook injection records, user-attached file context
- **Assistant messages:** Typically null

```typescript
// Example context_json for a system message
{
  workspace: { agentsMdHash: "abc123", version: 2 },
  persona: { id: "atlas", soulHash: "def456" },
  nexusEnv: { capabilityCount: 18, snapshotAt: 1706000000000 },
  memory: null  // Future: injected memory/skill references
}

// Example context_json for a user message
{
  event: { platform: "imessage", hookCount: 2 },
  attachments: [{ path: "file.ts", lines: [1, 50] }],
  injectedAt: 1706000000000
}
```

---

## Open Questions

1. **Nexus environment injection format:** What exactly gets injected from `nexus status`? Full JSON? Rendered summary? How often do we regenerate it? (Currently proposing: condensed capability summary, regenerated when capabilities change.)
2. **Compaction summary role:** Using `role: 'user'` with marker. Need to validate this works well across providers. Alternative: a dedicated system message.
3. **History window:** How many recent turns to ALWAYS keep, even during aggressive compaction? (Proposal: minimum 3 turns.)
4. **Prompt caching verification:** How do we measure cache hit rates in production? (Check `cached_input_tokens` in API responses and track in ledger.)

---

## Related Documents

- `DATA_MODEL.md` — Turn, Thread, Session primitives
- `AGENT_ENGINE.md` — pi-coding-agent wrapper interface (what goes in, what comes out)
- `SESSION_LIFECYCLE.md` — Compaction details, session management
- `OVERVIEW.md` — Broker overview (wraps pi-coding-agent)
- `../../data/ledgers/AGENTS_LEDGER.md` — Schema for turn/message storage
- `upstream/CONTEXT_ASSEMBLY.md` — OpenClaw reference

---

*This document defines context assembly for the Nexus agent system. See TODO.md for deferred items (Memory injection, auto skill injection).*
