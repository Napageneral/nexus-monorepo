# Memory Injection (Memory Reader V2)

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-17
**Supersedes:** ../roles/MEMORY_READER.md
**Related:** MEMORY_SYSTEM_V2.md, MEMORY_SEARCH_SKILL.md, MEMORY_WRITER_V2.md

---

## Overview

Memory Injection is a lightweight meeseeks at `worker:pre_execution` that decides what memory context to inject into a worker's session. It replaces the V1 Memory Reader — still a meeseeks, but radically simpler: a fast cheap model, one tool (recall), and a single job: "is any of this worth injecting?"

**Two mechanisms for memory access:**

1. **Memory Injection meeseeks** (this doc) — automatic, fires on every worker dispatch, uses a fast model to triage recall results
2. **Memory Search skill** — on-demand, any agent imports the skill and searches directly during its session

---

## Why Still a Meeseeks?

The pure function-call approach (just run recall on the task description and inject whatever comes back) risks injecting junk — irrelevant facts that pollute the agent's context and waste tokens. A lightweight LLM triage step solves this:

- Runs recall() on the latest message / task description
- Looks at what came back
- Decides: "Is any of this actually relevant? Which items are worth injecting?"
- Returns only the useful items, or nothing if recall returned noise

This is a small fast model with zero chain-of-thought reasoning. Just pattern match on relevance. Think gpt-5.3-codex-spark or equivalent — optimized for speed, not deep thinking.

---

## Architecture

```
MA dispatches worker
    |
    v
assembleContext(workerRequest)
    |
    v
worker:pre_execution hook
    |
    +---> Memory Injection meeseeks forks
    |       |
    |       v
    |     Fast model receives: latest message + task description
    |       |
    |       v
    |     recall(task_description, budget='low')
    |       |
    |       v
    |     Model triages results: relevant? worth injecting?
    |       |
    |       +-- YES: returns selected items as <memory_context>
    |       +-- NO:  returns nothing (no injection)
    |       |
    |       v
    |     Enrichment injected into worker's currentMessage
    |
    v
startBrokerExecution(enrichedContext)
    |
    v
Worker runs (with or without memory context)
    |
    (if worker needs more memory, it uses the Memory Search skill)
```

---

## The Meeseeks

### Model

Use a fast, cheap model optimized for speed over reasoning depth. Zero thinking budget. The model's only job is relevance triage — not synthesis, not reasoning, not search strategy.

Target: gpt-5.3-codex-spark or equivalent fast-inference model.

### Tool

One tool: `recall(query, params)`

The meeseeks calls recall() 1-3 times based on the task, then decides what to inject.

### Role Prompt (Minimal)

```
You are the Memory Injection agent. Your job:

1. Read the worker's task description
2. Search memory with recall() for relevant context
3. Decide which results are worth injecting
4. Return ONLY facts that are directly relevant to the task

Rules:
- If nothing relevant comes back, return empty. Do NOT inject noise.
- Be selective. 3-5 highly relevant facts beat 15 tangential ones.
- Include entity identifiers (emails, names) when they help the task.
- Include temporal context (dates) when recent information matters.
- Do NOT synthesize or summarize. Just select and return the relevant items.
```

### Max Turns

2-3 turns max. Typically:
1. Initial recall on task description
2. Optional targeted recall on a specific entity or topic
3. Triage and return

### Timeout

3 seconds. If exceeded, worker proceeds without memory. The fast model should complete in < 1 second.

---

## Output Format

```xml
<memory_context>
Tyler works at Anthropic building Nexus (2026-02-01)
Sarah leads the engineering team on Project X (2026-02-10)
Project X deadline is March 15, scope was cut to meet timeline (2026-02-11)
</memory_context>
```

Or if nothing relevant:

```
(no enrichment returned — worker proceeds without memory context)
```

Injected as a prefix to `currentMessage`, same as V1.

---

## Differences from Memory Reader V1

| Aspect | Memory Reader V1 | Memory Injection V2 |
|--------|-----------------|---------------------|
| **Architecture** | Full meeseeks, heavy model | Lightweight meeseeks, fast model |
| **Model** | Same as main session | Fast cheap model (gpt-5.3-codex-spark) |
| **Latency** | 3-10 seconds | < 1 second target |
| **Search strategy** | Agentic: SQL, cortex-search, multiple iterations | Simple: 1-3 recall() calls + triage |
| **Output** | Synthesized narrative with headers and sections | Flat list of selected facts with timestamps |
| **Iteration** | Up to 3 turns of complex search | 2-3 turns of recall + triage |
| **Self-improvement** | SKILLS.md, PATTERNS.md, ERRORS.md | Minimal — fast model, simple task |
| **Timeout** | 10 seconds | 3 seconds |
| **Junk filtering** | N/A (always injects something) | Core feature — returns nothing if irrelevant |

---

## When Agents Need More Memory

The injection provides a lightweight baseline. For agents that need deeper memory access:

### Import the Memory Search Skill

Any agent can import `MEMORY_SEARCH_SKILL.md` which teaches:
- How to use recall() with all parameters (scope, entity, time, channel, budget)
- Hierarchical retrieval (mental models -> observations -> facts)
- Query decomposition (break complex questions into targeted searches)
- Staleness awareness
- Budget management

The agent uses recall() as a tool during its execution, same as any other tool. This is the "pull" model — the agent actively searches when it knows it needs more context.

### Example: Agent Needs More

```
Worker receives task: "Plan Tyler's birthday dinner"

Memory injection provides:
  <memory_context>
  Tyler's birthday is March 12 (2025-06-01)
  Tyler likes Italian food (2025-08-15)
  </memory_context>

Agent thinks: "I need more about dietary restrictions and favorite restaurants"

Agent calls: recall("Tyler dietary restrictions allergies", entity="Tyler")
  -> "Tyler is lactose intolerant (2025-09-20)"

Agent calls: recall("Tyler favorite restaurants", entity="Tyler")
  -> "Tyler loves Osteria Mozza, went there for anniversary (2025-11-10)"

Now the agent has enough context to plan the dinner.
```

---

## Hook Registration

```sql
INSERT INTO automations (
  name, hook_point, mode, status, blocking, script_path,
  workspace_dir, timeout_ms
) VALUES (
  'memory-injection',
  'worker:pre_execution',
  'persistent',
  'active',
  1,                                                     -- blocking
  '~/.nexus/state/hooks/scripts/memory-injection.ts',
  '~/.nexus/state/meeseeks/memory-injection/',
  3000                                                   -- 3s timeout
);
```

---

## What This Replaces

| Previous Component | Status |
|-------------------|--------|
| Memory Reader meeseeks (heavy) | **Replaced** by lightweight injection meeseeks |
| `memory-reader/` workspace (full) | **Replaced** by minimal `memory-injection/` workspace |
| `MEMORY_READER.md` role spec | **Superseded** by this document |
| `cortex-search.sh` script | **Absorbed** into recall() implementation |
| Reader's SKILLS.md, PATTERNS.md | **Simplified** — fast model, minimal workspace |

---

## See Also

- `MEMORY_SEARCH_SKILL.md` -- How agents do deeper search when injection isn't enough
- `MEMORY_REFLECT_SKILL.md` -- Deep research and mental model creation
- `MEMORY_SYSTEM_V2.md` -- Full memory architecture
- `MEMORY_WRITER_V2.md` -- How memory gets written
