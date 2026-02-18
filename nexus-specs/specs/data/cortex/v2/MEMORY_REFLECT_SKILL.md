# Memory Reflect Skill

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-16
**Related:** MEMORY_SEARCH_SKILL.md, MEMORY_SYSTEM_V2.md

---

## Overview

The Memory Reflect skill teaches an agent how to perform deep research across memory and persist the results as mental models. It builds on the Memory Search skill, adding the "think deeply and remember what you learned" capability.

**This skill is the successor to Hindsight's `reflect()` agent.** It takes the hierarchical retrieval, evidence guardrails, and structured output patterns from Hindsight and adapts them to the Nexus memory architecture.

---

## When to Import This Skill

Agents that need to do more than simple search:

- **Any agent** that wants to deeply research a topic and produce a synthesized report
- **Any agent** that wants to persist research results for future use
- **Memory-Writer** -- can create its own mental models for self-improvement (entity disambiguation rules, extraction patterns)
- **User-triggered reflection** -- when the user asks "What do you know about X?" and wants a thorough answer

This skill **requires** the Memory Search skill. It uses `recall()` extensively.

---

## What This Skill Adds Over Memory Search

| Memory Search | Memory Reflect |
|---------------|---------------|
| Single-shot searches | Multi-step research loops |
| Returns raw results | Synthesizes results into coherent reports |
| No persistence | Can persist results as mental models |
| Any agent, any context | Deep research and analysis |

---

## The Reflection Process

### Step 1: Assess the Question

Before searching, reason about what kind of research this requires:

```
What is the question really asking?
  |
  v
What entities are involved?
What time periods matter?
What types of knowledge would answer this? (facts, patterns, history, status)
  |
  v
Plan 2-5 targeted searches
```

### Step 2: Hierarchical Search

Follow the Memory Search skill's hierarchical strategy, but with deeper exploration:

```
1. Check mental models first
   - Is there an existing mental model on this topic?
   - Is it fresh or stale?
   - If fresh and comprehensive -> may be sufficient
   - If stale -> use as starting context, verify with lower layers

2. Search observations
   - Multiple queries with different angles
   - Note staleness on each result
   - Gather related observations even if tangential

3. Search raw facts
   - Fill gaps not covered by observations
   - Verify stale observation claims
   - Get specific details, dates, names
   - Use entity filters and time ranges

4. Synthesize
   - Combine findings across all layers
   - Resolve contradictions (prefer more recent facts)
   - Note confidence levels and gaps
```

### Step 3: Synthesis

Combine all search results into a coherent answer:

**Rules for synthesis:**
- **Only use retrieved information.** Never fabricate names, events, or details.
- **Infer and reason.** If memories mention someone attended cooking classes, you can infer they're interested in cooking. Connect related facts into a narrative.
- **Handle contradictions.** When facts conflict, prefer the most recent. Note the change: "Previously X, but as of [date] Y."
- **Acknowledge gaps.** If the search didn't find information about part of the question, say so. Don't fill gaps with guesses.
- **Be specific.** Preserve names, dates, numbers, and details from the source facts. Don't abstract into vague generalizations.

**Synthesis format:**
- Use markdown for structure (headers, lists, bold, tables)
- Organize by topic, not by search call
- Don't include memory IDs or search metadata in the answer
- Focus on answering the question, not describing what you searched

---

## Mental Model Creation

The core capability this skill adds: persisting research results as mental models.

### What is a Mental Model?

A mental model is a high-level report stored in the database. It spans many observations and facts, synthesizing them into a coherent document about a specific topic.

```
Examples:
  - "Tyler's Career" -- work history, current role, career interests
  - "Project Nexus Status" -- what it is, current state, key decisions
  - "Family Relationships" -- who's who, dynamics, important facts
  - "Entity Disambiguation Rules" -- (self-improvement) patterns for resolving ambiguous entities
```

### When to Create a Mental Model

Create a mental model when:

1. **The research produced substantial synthesized knowledge** -- more than a few facts, worth preserving
2. **The topic is likely to be queried again** -- saves future search effort
3. **The user explicitly requests it** -- "Remember this analysis" or "Create a summary of X"
4. **Self-improvement** -- the agent identifies a pattern worth capturing for future use

Do NOT create a mental model for:

1. Simple factual lookups (one-shot answers)
2. Ephemeral questions ("What's the weather?")
3. Topics with very little supporting data
4. Questions that are unlikely to recur

### How to Create a Mental Model

```
create_mental_model(name, description, entity_id?, tags?)

Parameters:
  name          string (required)   Short descriptive title
  description   string (required)   Full report (markdown)
  entity_id     string              Primary entity this model is about
  tags          string[]            ACL tags for scoping
  subtype       string              'structural', 'emergent', 'pinned'

Returns:
  mental_model_id
```

### How to Update a Mental Model

When refreshing an existing mental model with new information:

```
update_mental_model(id, description)

This creates a new version (parent_id chain):
  - Old version preserved for history
  - New version becomes current
  - is_stale set to FALSE on the new version
  - last_refreshed updated
```

### Mental Model Subtypes

| Subtype | Description | Example |
|---------|-------------|---------|
| `structural` | Organized knowledge about a well-defined topic | "Tyler's Career", "Project Nexus Architecture" |
| `emergent` | Patterns discovered through reflection | "Communication Patterns in the Team" |
| `pinned` | User-created, manually maintained | "Important Contacts", "Key Decisions" |

---

## Evidence Guardrails

Adapted from Hindsight's reflect agent. These prevent hallucination and ensure quality.

### Must Search Before Answering

The agent **must** perform at least one search before providing an answer. If the agent attempts to answer without searching:

```
Error: "You must search for information first. Use recall() before providing your final answer."
```

This prevents the agent from answering from its training data instead of from stored memory.

### Citation Tracking

Track which facts, observations, and mental models support the answer:

```
The agent maintains three sets during research:
  - available_fact_ids      -- facts retrieved by recall()
  - available_observation_ids -- observations retrieved
  - available_mental_model_ids -- mental models retrieved

When producing the final answer:
  - Only cite IDs that were actually retrieved
  - Silently drop any hallucinated IDs
  - Citations enable provenance tracking
```

### Staleness Verification

When an observation or mental model has `is_stale = true`:

1. Don't treat it as current truth
2. Use it as context for further searching
3. Search raw facts to verify or update key claims
4. Note any contradictions in the synthesized answer

---

## Budget-Aware Research

The reflection depth should match the budget:

### Low Budget Reflection

```
- 1-2 search calls
- Check mental models and observations only
- Accept results without deep verification
- Produce a brief answer
- Don't create a mental model (not enough depth)
```

### Mid Budget Reflection

```
- 3-5 search calls
- Follow the full hierarchical strategy
- Verify stale results if central to the answer
- Produce a thorough answer
- Create a mental model if the topic warrants it
```

### High Budget Reflection

```
- 5-10 search calls
- Comprehensive exploration with multiple query angles
- Verify all stale results
- Cross-reference across entities and time ranges
- Produce a detailed, well-structured report
- Create or refresh a mental model
```

---

## Self-Improvement via Mental Models

Agents can use the reflect skill to create mental models that improve their own future performance.

### Memory-Writer Self-Improvement

The Memory-Writer meeseeks can create mental models like:

```
"Entity Disambiguation Rules"
  - When "Tyler" appears, check context for work vs personal
  - Tyler Shaver (is_user=TRUE) vs Tyler Johnson (friend)
  - Discord handle coolgamer42 -> resolved to John Smith on Day 5

"Common False Positive Patterns"
  - Greetings ("hey how are you") rarely contain extractable facts
  - Automated messages (bot notifications) should be skipped
  - "I'll do X" is a plan, not a fact -- extract cautiously

"Channel-Specific Extraction Rules"
  - Discord: messages are short, context from thread is essential
  - Email: subject line often contains the key topic
  - iMessage: sender_id is a phone number, resolve via entity store
```

These mental models persist across invocations, making the writer more effective over time. The writer can search its own mental models at the start of each invocation to load its learned patterns.

### Any Agent Self-Improvement

Any agent that imports this skill can create mental models for its own use:

```
"User Preferences for Code Reviews"
  - Prefers functional style over OOP
  - Wants tests for all public methods
  - Uses TypeScript strict mode

"Project Architecture Decisions"
  - Chose SQLite over Postgres for simplicity
  - Union-set for entity resolution
  - Agentic extraction over fixed pipelines
```

---

## Workflow Example

```
User: "What do you know about Tyler's relationship with the engineering team?"

Agent imports: Memory Search Skill + Memory Reflect Skill

Step 1: Assess
  - Entities: Tyler, engineering team (and individual members)
  - Concepts: relationship, collaboration, communication
  - Budget: mid (conversational question, moderate depth)

Step 2: Search
  recall("Tyler engineering team", scope=['mental_models'])
    -> No mental model found

  recall("Tyler engineering team", scope=['observations'])
    -> 2 observations found (1 stale)

  recall("Tyler engineering collaboration", entity="Tyler")
    -> 5 facts about Tyler working with engineers

  recall("engineering team members", scope=['facts'])
    -> 3 facts about team composition

Step 3: Synthesize
  Combine observations + facts into coherent narrative:
  - Tyler works closely with the engineering team on Project Nexus
  - Regular standups on Mondays
  - Collaborates most with Sarah (design) and Mike (backend)
  - [Stale observation noted Tyler's role as "tech lead" -- verified by recent fact confirming this]

Step 4: Decide on persistence
  - Moderate amount of information gathered
  - Topic likely to recur
  -> Create mental model: "Tyler's Engineering Team Relationships"

Output: Synthesized markdown answer + mental model created
```

---

## Differences from Hindsight reflect()

| Aspect | Hindsight reflect() | Nexus Memory Reflect |
|--------|--------------------|--------------------|
| **Architecture** | Standalone agent with 5 fixed tools | Reusable skill, composes with recall() |
| **Search tools** | 3 separate tools (search_mental_models, search_observations, recall) | Single recall() with scope parameter |
| **Expand** | expand(memory_ids, depth) for chunk/document context | Not needed -- facts are self-contained sentences |
| **Done tool** | Structured done() with answer + ID arrays | Agent produces answer naturally, skill teaches citation |
| **Mental model creation** | Separate API, not part of reflect | Integrated: create_mental_model() is part of the skill |
| **Directives** | Injected as hard rules with compliance checking | Handled by the agent's role, not the skill |
| **Budget** | Guidance in system prompt | Explicit parameter, skill teaches depth calibration |
| **Self-improvement** | Not supported | Core feature -- agents create mental models for themselves |

---

## See Also

- `MEMORY_SEARCH_SKILL.md` -- The search foundation this skill builds on
- `MEMORY_SYSTEM_V2.md` -- Full memory architecture (mental models schema)
- `MEMORY_WRITER_V2.md` -- How the Memory-Writer uses these skills for self-improvement
