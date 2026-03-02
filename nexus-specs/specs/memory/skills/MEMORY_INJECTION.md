# Memory Injection — Pre-Execution Meeseeks

**Status:** CANONICAL SPEC
**Last Updated:** 2026-03-02
**Related:** ../MEMORY_SYSTEM.md, MEMORY_SEARCH_SKILL.md

---

## Overview

Memory Injection is a lightweight meeseeks at `worker:pre_execution` that fires on every worker dispatch. It is forked from the primary session, carrying the full context of what's happening. Its job: use memory search to find relevant information that the main session doesn't already know, and either dispatch it or stay silent.

**Two mechanisms for memory access:**
1. **Memory Injection meeseeks** (this doc) — automatic, fires on every worker dispatch
2. **Memory Search skill** — on-demand, any agent imports the skill and searches during its session

---

## How It Works

The injection meeseeks is a **copy of the main session's self**, dispatched with a specific goal: use the memory search functionality to discover relevant information that isn't already understood by the main session.

It knows what the main session is about to do. It's not a dumb search bot — it understands the full situational context (because it's forked from the session) and can reason about what additional context would materially change how the main session responds.

### Architecture

```
Manager dispatches worker
    |
    v
worker:pre_execution hook
    |
    +---> Memory Injection meeseeks forks from session
    |       |
    |       v
    |     Meeseeks has full session context
    |     + task description
    |       |
    |       v
    |     Uses recall() to search memory
    |       |
    |       v
    |     Decision:
    |       |
    |       +-- Nothing useful found → call wait() (don't interrupt)
    |       +-- Found relevant info → call send_message() with discoveries
    |       |
    |       v
    |     Post-processing handles wrapping and injection
    |
    v
Worker runs (with or without memory context)
```

---

## The Meeseeks

### Model

Use a fast, cheap model optimized for speed. The model's job is relevance assessment — not deep synthesis.

Target: gpt-5.3-codex-spark or equivalent fast-inference model (when available in API). Use whatever fast model is available in the meantime.

### Two Exit Paths

The meeseeks has exactly two ways to complete:

1. **`wait()`** — No relevant information found, or everything found is already known by the main session. Don't interrupt. The main session proceeds without memory context.

2. **`send_message()`** — Found relevant information that materially changes or impacts how the main session would respond. Send the raw discovered information back.

### Post-Processing

The meeseeks sends raw information. **Post-processing handles:**
- Wrapping results in `<memory_context>` tags
- Injecting into the main session's context
- Steering the main session to consider the memory context

The meeseeks is NOT responsible for formatting, wrapping, or steering. Keep the agent's job as small and well-scoped as possible.

### Timeout

60 seconds. If exceeded, worker proceeds without memory. Typical latency should be well under 10 seconds with a fast model.

---

## CLI Tools Used

One tool: `recall(query, params)` — the same recall available to all agents.

The meeseeks uses its judgment on how many recall calls to make:
- **Zero** for purely computational tasks or tasks with no personal context
- **One** for straightforward task descriptions with a clear entity or topic
- **Multiple** for entity-rich inputs that span multiple topics or people

---

## Role Prompt Guidance

The injection meeseeks should understand:

1. You are a copy of the main session, dispatched to search memory for relevant context
2. The main session is proceeding with exactly the same context you have
3. Your goal: find information that isn't already understood that would materially improve the response
4. Sometimes there's no additional information needed — that's fine, call `wait()` and don't interrupt
5. When you find relevant information, compile it together and call `send_message()`
6. Be selective: 3-5 highly relevant facts beat 15 tangential ones
7. Include entity identifiers (emails, names) when they help the task
8. Include temporal context (dates) when recent information matters
9. Do NOT synthesize or summarize — just select and return the relevant items

---

## When Agents Need More Memory

Injection provides a lightweight automatic baseline. For deeper memory access during a session, agents import the **Memory Search Skill** which teaches hierarchical retrieval, query decomposition, and budget management. See `MEMORY_SEARCH_SKILL.md`.

---

## See Also

- `MEMORY_SEARCH_SKILL.md` — How agents do deeper search when injection isn't enough
- `MEMORY_REFLECT_SKILL.md` — Deep research and mental model creation
- `../MEMORY_SYSTEM.md` — Full memory architecture
- `../MEMORY_RECALL.md` — Recall API specification
