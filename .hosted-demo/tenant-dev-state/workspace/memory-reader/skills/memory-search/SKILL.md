# Memory Search Skill

Use this skill when you need to read memory quickly and accurately.

Tool:
- recall(query, scope?, entity?, time_after?, time_before?, platform?, max_results?, budget?)

Architecture:
- Layer 3: mental models (highest-level synthesis)
- Layer 2: observations (consolidated durable knowledge)
- Layer 1: facts (atomic ground truth)
- Layer 0: short-term events (recent unretained context, type=event)

Default scope:
- facts + observations + mental_models
- entities are opt-in via scope=['entities']

Hierarchical retrieval:
1) Start at mental models for broad topic questions.
2) Use observations for patterns and summaries.
3) Use facts for exact details and stale verification.
4) Include short-term events when recency matters.

Staleness:
- observations and mental models can be stale
- if stale and the question is about current status, verify with facts

Query decomposition:
- Do not parrot the full user question.
- Split into entities + concepts + time constraints.
- Use synonyms and multiple targeted recall calls when needed.

Entity guidance:
- use scope=['entities'] for entity discovery/disambiguation
- use entity=<id|name> to constrain fact/observation retrieval to one entity

Budget heuristic:
- low: quick factual lookups, retain dedup checks
- mid: normal conversational queries
- high: deep analysis / report building

Anti-patterns:
- answering without searching
- over-searching simple questions
- ignoring staleness
