# Memory Reflect Skill

**Status:** CANONICAL
**Last Updated:** 2026-03-02
**Related:** MEMORY_SEARCH_SKILL.md, ../MEMORY_SYSTEM.md, ../MEMORY_RECALL.md

---

## Overview

The Memory Reflect skill teaches an agent how to perform deep research across the full memory graph and persist results as mental models. It builds on the Memory Search skill, adding the "think deeply and remember what you learned" capability.

**This is a skill prompt, not a meeseeks.** It runs within the importing agent's session. It does not have self-improvement capability (only meeseeks have persistent workspaces).

---

## What This Skill Adds Over Memory Search

| Memory Search | Memory Reflect |
|---|---|
| Single-shot searches | Multi-step research loops |
| Returns raw results | Synthesizes into coherent reports |
| No persistence | Persists results as mental models |
| Any agent, any context | Deep research and pattern identification |

---

## When to Import This Skill

This is the deep pattern-identification layer. It's not about recalling a specific fact or observation — it's about **identifying patterns across entities, facts, episodes, observations, and the full memory graph.**

- **Deep research** — "What do you know about Tyler's career trajectory?"
- **Pattern discovery** — "What communication patterns does the team have?"
- **Synthesis** — "What are the key decisions made on Project Nexus?"
- **User-triggered reflection** — "What do you know about X?" requiring a thorough answer

---

## The Reflection Process

### Step 1: Assess the Question

Before searching, reason about what kind of research this requires:
- What entities are involved?
- What time periods matter?
- What types of knowledge would answer this? (facts, patterns, history, status)
- Plan 2-5 targeted searches

### Step 2: Hierarchical Search

Follow the Memory Search skill's hierarchical strategy with deeper exploration:

1. **Check mental models first** — is there an existing model on this topic? Is it current?
2. **Search observations** — multiple queries with different angles. Note staleness (follow revision chains to heads).
3. **Search raw facts** — fill gaps not covered by observations. Get specific details, dates, names. Use entity filters and time ranges.
4. **Synthesize** — combine findings across all layers. Resolve contradictions (prefer more recent facts). Note confidence levels and gaps.

### Step 3: Synthesis

Combine all search results into a coherent answer.

**Rules:**
- **Only use retrieved information.** Never fabricate names, events, or details.
- **Infer and reason.** If memories mention someone attended cooking classes, you can infer they're interested in cooking. Connect related facts into a narrative.
- **Handle contradictions.** When facts conflict, prefer the most recent. Note the change.
- **Acknowledge gaps.** If the search didn't find information about part of the question, say so.
- **Be specific.** Preserve names, dates, numbers, and details from source facts.

---

## Mental Model Creation

The core capability this skill adds: persisting research results as mental models.

### What is a Mental Model?

A high-level report stored in the database that spans many observations and facts, synthesizing them into a coherent document about a specific topic.

Examples:
- "Tyler's Career" — work history, current role, career interests
- "Project Nexus Status" — what it is, current state, key decisions
- "Family Relationships" — who's who, dynamics, important facts

### When to Create a Mental Model

Create when:
1. Research produced substantial synthesized knowledge worth preserving
2. The topic is likely to be queried again (saves future search effort)
3. The user explicitly requests it ("Remember this analysis")

Do NOT create for:
1. Simple factual lookups (one-shot answers)
2. Ephemeral questions
3. Topics with very little supporting data

### How to Create / Update

Invoked as `nexus memory create-mental-model` and `nexus memory update-mental-model` CLI commands. The function signatures below describe the core contract; the CLI maps parameters to `--flag` arguments (see `environment/interface/cli/COMMANDS.md`).

```
create_mental_model(name, content, entity_id?, pinned?)
update_mental_model(id, content)
```

Update creates a new version (parent_id chain). Old versions preserved for history. New version becomes the current head.

### Pinned Attribute

Mental models have one special attribute: **`pinned`** (boolean).
- `pinned = false` (default) — agent-created, can be auto-refreshed
- `pinned = true` — user-created or user-curated, shown specially in UI, not auto-overwritten

---

## Evidence Guardrails

### Must Search Before Answering

The agent MUST perform at least one search before providing an answer. This prevents answering from training data instead of stored memory.

### Citation Tracking

Track which facts, observations, and mental models support the answer. Only cite IDs that were actually retrieved. Citations enable provenance tracking.

### Staleness Verification

When an observation has a `successor_id` (meaning a newer revision exists):
1. Use `resolve_element_head` to follow the chain to the current head
2. Use the head version as context for further searching if needed
3. Note any contradictions in the synthesized answer

---

## Budget-Aware Research

| Budget | Behavior | Mental Model? |
|---|---|---|
| `low` | 1-2 searches. Mental models and observations only. Brief answer. | No |
| `mid` | 3-5 searches. Full hierarchical strategy. Verify stale results. | If warranted |
| `high` | 5-10 searches. Comprehensive exploration. Cross-reference everything. | Yes, create or refresh |

---

## See Also

- `MEMORY_SEARCH_SKILL.md` — The search foundation this skill builds on
- `../MEMORY_SYSTEM.md` — Full memory architecture
- `../MEMORY_RECALL.md` — Recall API and strategies
