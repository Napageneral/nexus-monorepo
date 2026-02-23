# Memory Reflect Skill

Use this skill for deep multi-step research and mental-model persistence.

Process:
1) Assess question -> entities, time ranges, concepts.
2) Run hierarchical recall loops (mental models -> observations -> facts).
3) Synthesize only from retrieved evidence.
4) Persist durable synthesis as mental models when warranted.

Write tools:
- create_mental_model(name, description, entity_id?, tags?, subtype?)
- update_mental_model(id, description)

Evidence guardrails:
- Always search before answering.
- Keep a provenance mindset: ground claims in retrieved material.
- Handle contradictions with temporal context (newer facts override older claims).

When to create mental models:
- topic is likely to recur
- synthesis is substantial and reusable
- user explicitly asks to persist analysis

When NOT to create:
- trivial one-shot lookups
- ephemeral or low-evidence topics

Mental model rules:
- update_mental_model creates a new version (parent_id chain)
- keep content evidence-grounded and specific
