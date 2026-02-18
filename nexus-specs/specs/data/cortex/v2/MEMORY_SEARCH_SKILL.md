# Memory Search Skill

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-17
**Related:** MEMORY_SYSTEM_V2.md, MEMORY_WRITER_V2.md, MEMORY_REFLECT_SKILL.md

---

## Overview

The Memory Search skill teaches any agent how to search Nexus memory effectively. It provides the hierarchical retrieval strategy, query decomposition techniques, staleness awareness, and budget management.

**This is a pure search skill.** It does not create or modify memory -- it only reads. Any agent that needs context from memory imports this skill. The separate Memory Reflect skill handles deep research and mental model persistence.

---

## When to Import This Skill

Any agent that needs to answer questions using stored memory:

- **Conversational agents** -- answering user questions with personal context
- **Memory-Writer** -- deduplication checks and entity resolution during retain
- **Task agents** -- gathering context before executing work
- **Any meeseeks** -- that needs to know things about the user's world

---

## The Tool: recall()

A single search interface with tunable parameters. All memory search goes through this one tool.

```
recall(query, params)

Parameters:
  query       string (required)   Natural language search query
  scope       string[]            What to search: ['facts', 'observations', 'mental_models', 'entities']
                                  Default: facts+observations+mental_models (entities only when explicitly requested)
  entity      string              Filter by entity name or ID
  time_after  integer             Only results after this timestamp (unix ms)
  time_before integer             Only results before this timestamp (unix ms)
  channel     string              Filter by source channel
  max_results integer             Maximum results (default: 20)
  budget      string              Search depth: 'low', 'mid', 'high'

Returns:
  results[]   Array of matched items with:
    - id, text, type ('fact' | 'observation' | 'mental_model' | 'entity')
    - as_of (when it happened), relevance score
    - is_stale (for observations/mental models)
    - entity_ids[] (linked entities)
    - source metadata
    - For entity results: name, type, aliases[], mention_count
```

---

## Hierarchical Retrieval Strategy

Memory is organized in layers of increasing abstraction. **Search top-down** -- start with the highest-quality, most synthesized knowledge and drill down only when needed.

### Layer 3: Mental Models (Highest Quality)

```
recall(query, scope=['mental_models'])
```

- User-curated or agent-generated reports about specific topics
- Highest quality -- manually created, periodically refreshed
- If a relevant mental model exists and is **fresh**, it may fully answer the question
- Check `is_stale` -- if stale, verify key claims against lower layers

**When to start here:** Broad questions about a topic, person, or project. "What's the status of Project X?" or "Tell me about Tyler's career."

### Layer 2: Observations (Consolidated Knowledge)

```
recall(query, scope=['observations'])
```

- Auto-consolidated durable knowledge synthesized from facts
- Good for patterns, summaries, and synthesized understanding
- Check `is_stale` -- if stale, also search raw facts to verify
- Each observation tracks its contributing facts via `observation_facts`

**When to start here:** Questions about patterns, preferences, or consolidated knowledge. "What does Tyler like to eat?" or "How does the team communicate?"

### Layer 1: Facts (Ground Truth)

```
recall(query, scope=['facts'])
```

- Atomic extracted knowledge from source events
- Immutable -- never changes once written
- This is the source of truth that all higher layers are built from
- Use for specific details, recent information, or verification

**When to start here:** Specific factual questions, recent events, or verifying stale higher-layer data. "When did Tyler last meet with Sarah?" or "What was discussed in yesterday's standup?"

### Choosing Your Entry Point

```
Is the question about a broad topic with a known mental model?
  YES -> Start at Layer 3 (mental models)
  NO  -> Is it about a pattern or consolidated knowledge?
           YES -> Start at Layer 2 (observations)
           NO  -> Start at Layer 1 (facts)

Did the result have is_stale = true?
  YES -> Drill down to verify against the next layer
  NO  -> Use the result
```

---

## Query Decomposition

recall() uses semantic search. **Never just echo the user's question.** Break complex questions into targeted component searches.

### Bad: Parroting

```
User: "What are the recurring themes in Tyler's conversations with Sarah?"

BAD:  recall("recurring themes in Tyler's conversations with Sarah")
```

This searches for a single semantic embedding that matches the entire question. It will miss relevant results that use different phrasing.

### Good: Decompose Into Components

```
User: "What are the recurring themes in Tyler's conversations with Sarah?"

GOOD:
  1. recall("Tyler Sarah conversations", entity="Sarah")
  2. recall("Tyler Sarah discussions topics")
  3. recall("Sarah meetings", time_after=<last_month>)
```

### Decomposition Rules

1. **Identify entities** -- search for each entity separately when useful
2. **Identify concepts** -- search for each key concept with varied phrasing
3. **Use filters** -- entity, time range, and channel filters narrow results better than cramming everything into the query string
4. **Try synonyms** -- "meeting" vs "discussion" vs "call" vs "conversation"
5. **Start broad, then narrow** -- a broad search followed by a filtered one is better than one overly-specific search

### Examples

```
Question: "What projects is the engineering team working on?"
Searches:
  1. recall("engineering team projects")
  2. recall("current projects", entity="engineering")
  3. recall("sprint work in progress")

Question: "Has Tyler mentioned anything about moving?"
Searches:
  1. recall("Tyler moving", entity="Tyler")
  2. recall("Tyler relocation apartment house")
  3. recall("Tyler new place", time_after=<3_months_ago>)

Question: "What happened in the last team standup?"
Searches:
  1. recall("team standup", time_after=<last_week>, channel="slack")
  2. recall("standup meeting updates")
```

---

## Staleness Awareness

Observations and mental models can become stale as new facts arrive. The `is_stale` field indicates that new information has been added since the last consolidation or refresh.

### How to Handle Stale Results

```
Got a result with is_stale = true?
  |
  v
Is the staleness likely to affect the answer?
  |
  +-- YES (e.g., "current status", "latest update")
  |     -> Search facts to verify/supplement
  |     -> Use the stale result as context, facts as ground truth
  |     -> Note any contradictions
  |
  +-- NO (e.g., "what is X's birthday", historical fact)
        -> Use the stale result as-is
        -> Staleness doesn't affect immutable information
```

### Staleness Matters Most For

- Current status questions ("What is Tyler working on?")
- Relationship questions ("Who does Tyler work with?")
- Preference questions ("What does Tyler like?")
- Project status ("What's the state of Project X?")

### Staleness Matters Least For

- Historical facts ("When did Tyler start at Anthropic?")
- Definitions ("What is Project Nexus?")
- Biographical facts ("Where did Tyler go to school?")

---

## Budget Management

The `budget` parameter controls search depth. Use it to balance thoroughness against speed and cost.

### Low Budget (Quick Response)

```
recall(query, budget='low')
```

- Prioritize speed over completeness
- If the first result looks good, stop there
- Don't drill down through multiple layers unless clearly necessary
- Good for: simple factual lookups, context gathering, dedup checks

### Mid Budget (Balanced)

```
recall(query, budget='mid')
```

- Check multiple sources when the question warrants it
- Verify stale data if it's central to the answer
- Don't over-explore, but ensure reasonable coverage
- Good for: most conversational queries, entity resolution

### High Budget (Thorough)

```
recall(query, budget='high')
```

- Explore comprehensively before answering
- Search across all layers
- Use multiple query variations for coverage
- Verify information across layers
- Good for: complex questions, building mental models, deep reflection

### Budget Selection Heuristic

```
Is this a simple factual lookup?           -> low
Is this a conversational question?         -> mid
Is this building a report or analysis?     -> high
Is this a dedup check during retain?       -> low
Is this entity resolution during retain?   -> mid
```

---

## Searching Entities

Use `scope=['entities']` to search the entity store directly. This returns entity records — useful for finding related or similar entities, resolving identities, and understanding who/what exists in memory.

```
recall("Tyler", scope=['entities'])
  -> Tyler Shaver (person, is_user=TRUE, mention_count=842)
  -> Tyler Johnson (person, mention_count=15)
  -> tyler@anthropic.com (email, merged_into -> Tyler Shaver)

recall("engineering team", scope=['entities'])
  -> Engineering (org, mention_count=200)
  -> Sarah Chen (person, tagged 'team:engineering')
  -> Mike Torres (person, tagged 'team:engineering')
```

### When to Search Entities

- **Entity resolution during retain** — finding if an entity already exists before creating a new one
- **Disambiguation** — multiple entities share a name, need to see all candidates
- **Exploration** — "who are all the people linked to this project?"
- **Merge candidate discovery** — finding entities that might be the same person/thing

Entity search uses name matching (normalized) and semantic similarity on entity names. It follows `merged_into` chains to return canonical entities. Results include aliases (all entities merged into the canonical one).

**Entity search is NOT in the default scope.** You must explicitly request `scope=['entities']`. This keeps normal recall() queries focused on knowledge (facts/observations/models) rather than identity records.

---

## Entity-Scoped Search

Use the `entity` parameter to search within a specific entity's context. This is more precise than including the entity name in the query string.

```
# These are different:
recall("projects", entity="Tyler")           # Facts linked to Tyler about projects
recall("Tyler's projects")                   # Semantic search for "Tyler's projects"

# The entity filter uses the fact_entities junction:
#   facts -> fact_entities -> entities WHERE entity.name = "Tyler"
# This is exact, not semantic.
```

### When to Use Entity Filters

- When you know the exact entity and want their facts
- When the entity name is common and would pollute semantic search
- When you want to find all knowledge about a specific person/project

### When to Use Query-Only

- When exploring broadly
- When the entity relationship is uncertain
- When you want semantically similar results even about other entities

---

## Combining Parameters

Parameters compose naturally:

```
# Recent facts about Tyler from Slack
recall("standup updates",
       scope=['facts'],
       entity="Tyler",
       channel="slack",
       time_after=1707955200000)

# Observations about the engineering team
recall("engineering team dynamics",
       scope=['observations'],
       entity="engineering")

# Everything about a project in the last month
recall("Project Nexus",
       time_after=1705363200000,
       budget='high')
```

---

## Anti-Patterns

### Don't Hallucinate Before Searching

```
BAD:  "Tyler likes pizza" (without searching first)
GOOD: recall("Tyler food preferences") -> then answer based on results
```

**Always search before claiming knowledge.** If no results come back, say you don't have that information.

### Don't Over-Search

```
BAD:  10 recall() calls for "What's Tyler's favorite color?"
GOOD: 1-2 recall() calls, then answer or say "I don't know"
```

Match search effort to question complexity and budget.

### Don't Ignore Staleness

```
BAD:  Return a stale observation as current fact
GOOD: Note that the observation may be outdated, verify if needed
```

### Don't Echo Questions as Queries

```
BAD:  recall("Can you tell me about the relationship between Tyler and Sarah?")
GOOD: recall("Tyler Sarah relationship") or recall("Tyler Sarah", entity="Tyler")
```

Strip conversational framing. Search for entities and concepts, not questions.

---

## See Also

- `MEMORY_SYSTEM_V2.md` -- Full memory architecture and schemas
- `MEMORY_REFLECT_SKILL.md` -- Deep research and mental model creation
- `MEMORY_WRITER_V2.md` -- How memory is written (uses this skill for dedup)
