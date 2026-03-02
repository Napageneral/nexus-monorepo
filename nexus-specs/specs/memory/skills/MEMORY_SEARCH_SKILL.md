# Memory Search Skill

**Status:** CANONICAL SPEC
**Last Updated:** 2026-03-02
**Related:** ../MEMORY_SYSTEM.md, ../MEMORY_RECALL.md, MEMORY_REFLECT_SKILL.md

---

## Overview

The Memory Search skill teaches any agent how to search Nexus memory effectively. It provides hierarchical retrieval strategy, query decomposition techniques, staleness awareness, and budget management.

**This is a pure search skill.** It does not create or modify memory — it only reads. Any agent that needs context from memory imports this skill. The separate Memory Reflect skill handles deep research and mental model persistence.

This is a **skill prompt**, not a meeseeks. It runs within the importing agent's session.

---

## When to Import This Skill

Any agent that needs to answer questions using stored memory:
- Conversational agents — answering user questions with personal context
- Memory Writer — entity resolution during retain
- Task agents — gathering context before executing work
- Any meeseeks that needs to know things about the user's world

---

## The Tool: `nexus memory recall`

A single search interface with tunable parameters. Available to all agents as a CLI command (`nexus memory recall`). The CLI sends an IPC request to the NEX daemon, which executes the core recall function and returns JSON to stdout.

The function signature below describes the core contract. The CLI surface maps parameters to `--flag` arguments (see `environment/interface/cli/COMMANDS.md`).

```
recall(query, params)

Parameters:
  query                    string (required)   Natural language search query
  scope                    string[]            What to search: ['facts', 'observations', 'mental_models', 'entities']
                                               Default: facts + observations + mental_models
  entity                   string              Filter by entity name or ID
  time_after               integer             Only results after this timestamp (unix ms)
  time_before              integer             Only results before this timestamp (unix ms)
  platform                 string              Filter by source platform
  thread_id                string              Thread scope hint for event retrieval/lookback
  thread_lookback_events   integer             Include up to N recent prior events from thread
  max_results              integer             Maximum results (default: 20)
  budget                   string              Search depth: 'low', 'mid', 'high'

Returns:
  RecallResult with:
    ranked[]    All result types interleaved by relevance score
    facts[]     FactResult items
    observations[]  ObservationResult items
    mental_models[] MentalModelResult items
    entities[]  EntityResult items
    events[]    EventResult items

  Each result item has:
    - id, content, type ('fact' | 'observation' | 'mental_model' | 'entity' | 'event')
    - score (relevance)
    - as_of (timestamp)
    - entity_ids[]
    - For observations: successor_id (non-null means this version is stale — a newer revision exists)
    - For entity results: name, type, mention_count
    - For event results: raw unretained events from short-term memory
```

---

## Hierarchical Retrieval Strategy

Memory is organized in layers of increasing abstraction. **Search top-down** — start with the highest-quality, most synthesized knowledge and drill down only when needed.

### Layer 3: Mental Models (Highest Quality)

```
recall(query, scope=['mental_models'])
```

- User-curated or agent-generated reports about specific topics
- Highest quality — periodically refreshed
- If a relevant mental model exists and is current, it may fully answer the question

**When to start here:** Broad questions about a topic, person, or project.

### Layer 2: Observations (Consolidated Knowledge)

```
recall(query, scope=['observations'])
```

- Auto-consolidated durable knowledge synthesized from facts
- Good for patterns, summaries, and synthesized understanding
- Check for staleness — if the observation has a `successor_id`, a newer revision exists. Use `resolve_element_head` to follow the chain to the current head.

**When to start here:** Questions about patterns, preferences, or consolidated knowledge.

### Layer 1: Facts (Ground Truth)

```
recall(query, scope=['facts'])
```

- Atomic extracted knowledge from source events
- Immutable — never changes once written
- Source of truth that all higher layers are built from

**When to start here:** Specific factual questions, recent events, verification.

### Layer 0: Short-Term Events (Most Recent)

```
recall(query)  -- event results included automatically
```

- Raw unretained events from episodes that haven't closed yet
- Useful for very recent context before the retain pipeline processes it

### Choosing Your Entry Point

```
Is the question about a broad topic with a known mental model?
  YES → Start at Layer 3 (mental models)
  NO  → Is it about a pattern or consolidated knowledge?
         YES → Start at Layer 2 (observations)
         NO  → Start at Layer 1 (facts)
```

---

## Staleness Awareness

Observations form **revision chains** via `parent_id`. When an observation is updated, the new version is created with `parent_id` pointing to the previous version, and the new version becomes the head. If a recalled observation has a `successor_id` (meaning a newer revision exists that points back to this one), it's stale.

### How to Handle Stale Observations

When you retrieve an observation and it has a more recent revision:
1. Follow the chain to the current head immediately — this tells you what changed
2. If the current head answers your question, use it
3. If the head is also outdated relative to your question, drill down to raw facts to verify

### When Staleness Matters Most

- Current status questions ("What is Tyler working on?")
- Relationship questions ("Who does Tyler work with?")
- Preference questions ("What does Tyler like?")

### When Staleness Matters Least

- Historical facts ("When did Tyler start at Anthropic?")
- Definitions ("What is Project Nexus?")
- Biographical facts ("Where did Tyler go to school?")

---

## Query Decomposition

recall() uses semantic search. **Never just echo the user's question.** Break complex questions into targeted component searches.

### Bad: Parroting

```
User: "What are the recurring themes in Tyler's conversations with Sarah?"
BAD:  recall("recurring themes in Tyler's conversations with Sarah")
```

### Good: Decompose Into Components

```
GOOD:
  1. recall("Tyler Sarah conversations", entity="Sarah")
  2. recall("Tyler Sarah discussions topics")
  3. recall("Sarah meetings", time_after=<last_month>)
```

### Decomposition Rules

1. **Identify entities** — search for each entity separately when useful
2. **Identify concepts** — search for each key concept with varied phrasing
3. **Use filters** — entity, time range, and platform filters narrow results better than cramming everything into the query
4. **Try synonyms** — "meeting" vs "discussion" vs "call" vs "conversation"
5. **Start broad, then narrow** — broad search followed by filtered one beats one overly-specific search

---

## Budget Management

| Budget | Behavior | Use Case |
|---|---|---|
| `low` | Prioritize speed. 1-2 searches. Stop at first good result. | Simple lookups, dedup checks |
| `mid` | Check multiple sources. Verify stale data if central. | Most queries, entity resolution |
| `high` | Explore comprehensively. Multiple query variations. Cross-layer verification. | Complex questions, deep research |

---

## Anti-Patterns

**Don't hallucinate before searching.** Always search before claiming knowledge. If no results, say you don't have that information.

**Don't over-search.** Match search effort to question complexity and budget.

**Don't ignore staleness.** When an observation has a `successor_id`, follow the chain to the head.

**Don't echo questions as queries.** Strip conversational framing. Search for entities and concepts, not questions.

---

## See Also

- `../MEMORY_SYSTEM.md` — Full memory architecture
- `../MEMORY_RECALL.md` — Recall API and strategies
- `MEMORY_REFLECT_SKILL.md` — Deep research and mental model creation
