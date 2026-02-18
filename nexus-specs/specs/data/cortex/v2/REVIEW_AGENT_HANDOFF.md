# Review Agent Handoff

**Role:** You are a design reviewer and implementation manager. You are NOT the implementing agent — a separate agent is doing the build work. Your job is to:

1. Deeply understand the Memory System V2 spec suite
2. Review the implementing agent's code for spec compliance, correctness, and quality
3. Answer the user's questions about design decisions
4. Catch drift between specs and implementation
5. Suggest spec updates when implementation reveals gaps

---

## Step 1: Read All Specs (Do This First)

Read these files in order. Do not skim — read them fully.

**Architecture + Schema:**
1. `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/MEMORY_SYSTEM_V2.md` — Master architecture doc. 4-layer memory stack, recall() API, trigger mechanism, schema, implementation hints. This is the source of truth.
2. `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/UNIFIED_ENTITY_STORE.md` — Entity resolution via union-find. Everything is an entity. merged_into pointer chains.

**Write Path:**
3. `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/MEMORY_WRITER_V2.md` — Writer meeseeks spec: tools, hooks, two trigger paths (agent turn complete vs eventIngested).
4. `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/MEMORY_WRITER_ROLE.md` — The actual system prompt for the writer agent. Extraction rules, workflow, entity resolution.

**Read Path:**
5. `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/MEMORY_INJECTION.md` — Lightweight reader meeseeks at worker:pre_execution. Fast model triage, 3s timeout.
6. `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/MEMORY_SEARCH_SKILL.md` — Pure search skill. recall() API, hierarchical retrieval, entity scope, budget, query decomposition.
7. `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/MEMORY_REFLECT_SKILL.md` — Deep research + mental model persistence. Multi-step loops, evidence guardrails.

**Implementation Plan:**
8. `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/WORKPLAN.md` — 8-phase sequential build plan. Schema → recall() → embeddings → writer → consolidation → injection → skills → cleanup/backfill.
9. `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/v2/HANDOFF.md` — The orientation doc that was given to the implementing agent. Read this to understand what they were told.

---

## Step 2: Understand Current Implementation State

The implementing agent has completed **Phase 1 (schema) and Phase 2 (recall)** and is about to start **Phase 3 (embeddings)**.

**Code already written (review these when asked):**

Schema:
- `/Users/tyler/nexus/home/projects/nexus/nex/cortex/internal/db/schema.sql` — Full V2 schema. Big-bang drop of legacy tables, all new tables created.

Recall:
- `/Users/tyler/nexus/home/projects/nexus/nex/cortex/internal/recall/types.go` — Request/Response/Result type definitions, Budget/Scope/ResultType enums.
- `/Users/tyler/nexus/home/projects/nexus/nex/cortex/internal/recall/recall.go` — Main recall() function, hydration, filtering, entity loading with alias traversal.
- `/Users/tyler/nexus/home/projects/nexus/nex/cortex/internal/recall/strategies.go` — 4 retrieval strategies: semantic (sqlite-vec), keyword (FTS5), entity traversal, causal traversal. Plus entity lexical search, canonical ID resolution, blob encoding.
- `/Users/tyler/nexus/home/projects/nexus/nex/cortex/internal/recall/fusion.go` — RRF (k=60) and MMR (λ=0.7) implementations.
- `/Users/tyler/nexus/home/projects/nexus/nex/cortex/internal/recall/recall_test.go` — Unit tests: default scope, entity scope, entity filter, channel filter, semantic ranking.

HTTP layer:
- `/Users/tyler/nexus/home/projects/nexus/nex/cortex/cmd/cortex/serve.go` — POST /recall endpoint alongside /health and /search.
- `/Users/tyler/nexus/home/projects/nexus/nex/cortex/cmd/cortex/serve_test.go` — HTTP handler tests with fakes.

---

## Step 3: Know the Reference Project

The Memory System V2 design is heavily influenced by the **Hindsight** project (vectorize-io/hindsight). The implementing agent was told to reference Hindsight code for patterns.

Hindsight project location: `/Users/tyler/nexus/home/projects/hindsight/`

Key Hindsight reference files:
| File | What it has |
|------|------------|
| `hindsight-api/engine/retain/fact_extraction.py` | Extraction prompts, fact format |
| `hindsight-api/engine/consolidation/prompts.py` | Consolidation/observation prompts |
| `hindsight-api/engine/reflect/agent.py` | Reflect agent loop |
| `hindsight-api/engine/reflect/prompts.py` | Hierarchical retrieval prompts |
| `hindsight-api/engine/reflect/tools_schema.py` | Tool definitions |
| `hindsight-api/engine/memory_engine.py` | recall() implementation, 4-way parallel retrieval, RRF, MMR |
| `hindsight-api/engine/embeddings.py` | Embedding model config, LocalSTEmbeddings class |

Note: The Hindsight directory structure uses `hindsight-api` (with hyphen), not `hindsight_api` (with underscore). Verify paths when reading.

---

## Step 4: Key Design Decisions (Already Made — Don't Re-litigate)

These were debated and decided across multiple sessions:

1. **4 retrieval strategies** (semantic, keyword/FTS5, entity traversal, causal traversal). Temporal proximity is a WHERE clause filter, not a separate strategy.
2. **RRF with k=60** for fusion, **MMR with λ=0.7** for diversity. No cross-encoder reranking initially.
3. **Budget controls strategy selection:** low=semantic only, mid=semantic+keyword+entity, high=all 4.
4. **Entity scope on recall() is opt-in** — not in the default scope set.
5. **Embedding model: BAAI/bge-small-en-v1.5** (384 dimensions). Same as Hindsight. Local, zero API cost.
6. **Observations are analysis_runs** with `analysis_type='observation_v1'`. Text in `output_text`, not facets.
7. **is_stale on analysis_runs** — stored boolean, set by consolidation worker.
8. **memory_processing_log** — separate table tracking which events the writer has processed.
9. **Backfill uses same agentic retain flow** per-episode (not simplified batch). Sequential per channel, parallel across channels. 4-8K token episodes.
10. **Memory injection is a lightweight meeseeks** with fast model (not a raw function call). Triage to avoid injecting junk.
11. **Union-find for entity resolution** via merged_into pointer. Agent makes resolution decisions.
12. **Facts are immutable NL sentences.** No structured JSON output format.
13. **Single recall() tool** collapses Hindsight's 3 separate search tools.
14. **No expand() tool** — facts are self-contained sentences, not document chunks.
15. **observation_facts junction table** (Approach 2) for direct linking between observations and their supporting facts.

---

## Step 5: How to Review

When the user shares the implementing agent's progress or asks you to review code:

1. **Read the actual files** — don't rely on the agent's summary alone.
2. **Check spec compliance** — does the code match what the specs say?
3. **Check correctness** — SQL queries, concurrency, error handling, edge cases.
4. **Check for drift** — if the implementation diverges from spec, is it a reasonable adaptation or a mistake?
5. **Flag but don't block on style** — focus on correctness and design fidelity.
6. **Suggest spec updates** when the implementation reveals a genuine gap or ambiguity.

Previous review found these minor items (may or may not be fixed yet):
- `loadEmbeddings` in strategies.go string-concatenates targetType into SQL (not parameterized)
- `semanticSearch` arg ordering is awkward (builds args then reshuffles)
- Observation AsOf timestamp conversion assumes episodes store end_time in seconds (verify)

---

## Step 6: What's Coming Next

The implementing agent is about to tackle **Phase 3: Embedding Pipeline**. They asked which embedding backend to use:
1. Ollama (local server, HTTP API)
2. node-llama-cpp (GGUF model in Node)
3. Python sentence-transformers (what Hindsight uses)

The user asked us to review what Hindsight actually uses before deciding. That investigation is still pending — check `hindsight-api/engine/embeddings.py` (or similar path under `/Users/tyler/nexus/home/projects/hindsight/`) when you get oriented.
