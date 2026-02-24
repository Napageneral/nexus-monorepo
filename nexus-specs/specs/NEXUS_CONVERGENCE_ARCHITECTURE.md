> **Status:** ARCHIVED — Design exploration for Go convergence. See `specs/project-structure/LANGUAGE_AND_ARCHITECTURE.md` for canonical architecture decision.

# Nexus Convergence Architecture — ABC, Seeds, and the Software Factory

**Status:** DESIGN SPEC
**Date:** 2026-02-22
**Bundle:** Cross-cutting (nexus runtime, code-cartographer/oracle, memory system, broker)
**Related:** runtime/broker/QUEUE_MANAGEMENT.md, data/memory/MEMORY_SYSTEM.md, memory/skills/MEMORY_INJECTION.md, data/DATABASE_ARCHITECTURE.md, runtime/broker/MEESEEKS_PATTERN.md, runtime/adapters/ADAPTER_PROTOCOL.md
**See also:** code-cartographer docs/PRLM.md, docs/specs/SPEC-oracle-server-v2.md, docs/PRLM-seams.md, docs/PRLM-terrain-history.md

---

## Overview

This spec captures the convergence of the Nexus runtime and Code Cartographer into a unified architecture where:

1. **Nexus is the universal runtime shell** — broker, memory, adapters, automations, event pipeline
2. **Code Cartographer (PRLM/Oracle) is a plugin** — a specialized agent topology running inside the nex runtime
3. **Seeds** are purpose-built nexus configurations for specific use cases (oracle server, openclaw, etc.)
4. **The ABC architecture** (Agent B-Tree over Context) names the core data structure underlying the oracle tree
5. **A two-phase memory reader** replaces blocking injection with fast recall + async steer-based interrupt
6. **Shared memory** spans the entire agent tree with topology-scoped queries
7. **The Software Factory** pipeline chains research → planning → implementation → validation → deployment

This document consolidates design decisions made during the Feb 2026 architecture sessions and provides the reference spec for implementation.

---

## 1. Agent B-Tree over Context (ABC)

### Naming

The PRLM oracle tree is fundamentally a **B-tree index over context**. Each node in the tree:
- Owns a slice of the corpus (its extent)
- Maintains routing knowledge about its children (via memory: observations, mental models)
- Prunes search at each level — only relevant subtrees are queried

This is B-tree traversal applied to natural language context. The name **ABC** (Agent B-Tree over Context) captures this.

### How It Works

```
Root (mental models of all top-level subtrees)
├── Subtree A: "handles authentication and authorization"
│   ├── Leaf: auth/handler.go, auth/middleware.go
│   └── Leaf: auth/jwt.go, auth/refresh.go
├── Subtree B: "payment processing and billing"
│   ├── Leaf: billing/stripe.go, billing/invoices.go
│   └── Leaf: billing/webhooks.go
└── Subtree C: "API gateway and routing"
    └── ...
```

A query like "how does token refresh work?" hits the root, which checks its mental models, routes to Subtree A (not B or C), which routes to the JWT leaf. Cost: 3 nodes queried instead of all leaves.

### Tree Pruning via Memory

The root doesn't dispatch to all children — it checks its **observations and mental models** to route. This is the key cost optimization:

| Approach | 100M token corpus | Cost per query |
|----------|-------------------|----------------|
| Naive (query everything) | All leaves | ~$450 |
| Tree-pruned (ABC) | 2-5 nodes | ~$0.36 |
| Pruned + prompt cached | 2-5 nodes, warm | ~$0.05 |

The routing intelligence comes from the shared memory system (§3).

---

## 2. Two-Phase Memory Reader (Steer-Based Interrupt Pattern)

### Problem

The current Memory-Injection Meeseeks (memory/skills/MEMORY_INJECTION.md) runs as a blocking `worker:pre_execution` hook with a 60-second timeout. This adds latency to every request, even when memory has nothing relevant.

### Solution: Fast Recall + Async Deep Search

Split memory injection into two phases:

**Phase 1: Fast Recall (blocking, < 1 second)**

A direct `recall()` call — no LLM involved. Pure database query against the Go recall system with `BudgetLow`. Returns top 3-5 results. Injected as `<memory_context>` into the agent's first message. Agent starts immediately.

```go
// Phase 1: direct recall, no agent, sub-second
results := recall.Execute(ctx, recall.Request{
    Query:      message.Content,
    Budget:     recall.BudgetLow,
    MaxResults: 5,
    Scope:      []recall.Scope{recall.ScopeFacts, recall.ScopeObservations},
})
// Inject into message, start agent
```

**Phase 2: Deep Memory Meeseeks (async, steer-based interrupt)**

The full Memory-Injection Meeseeks fires in parallel. It uses `BudgetHigh`, does entity resolution, causal traversal, the full strategy suite. When it finishes, it decides whether to interrupt the main agent.

```
Timeline:
[fast recall <1s][──────agent generating──────────────────]
[────deep meeseeks searching (3-60s)────]
                                         └─ steer! inject context ─┘
```

### The Steer Interrupt Mechanism

When the memory meeseeks finds relevant context and decides to interrupt:

1. Broker fires `steer` on the main agent's session
2. The active LLM API call is cancelled
3. The agent's **partial output is preserved** (not discarded)
4. The memory context is appended to the partial output within the same assistant turn
5. A new API call is made with the concatenated content as the assistant prefix
6. The agent continues generating from that point

**Single turn, single message.** The memory appears mid-stream as if the agent thought of it naturally. From the user's perspective, the stream may pause briefly then continue — possibly shifting direction based on what surfaced.

```
API Call 1 (cancelled after partial generation):
  assistant: "The authentication system uses JWT tokens with a refresh flow. The main entry..."

--- steer fires, memory injected into same turn ---

API Call 2 (continuation with prefix):
  assistant: "The authentication system uses JWT tokens with a refresh flow. The main entry...
  <memory_context>
  Auth was refactored from session-based to JWT in commit abc123 (2026-01-15).
  Known issue: token expiry doesn't propagate to WebSocket connections (2026-02-10).
  </memory_context>
  [agent continues generating from here, incorporating the memory]"
```

The agent's system prompt includes awareness of this pattern:
> "A memory system runs in parallel. It may inject relevant context mid-response via `<memory_context>` blocks. Incorporate naturally and adjust your response if the memory changes what you would say."

### Relevance Threshold

The memory meeseeks decides whether to interrupt. No hardcoded threshold — the agent makes the judgment call, and the **self-improvement loop** tunes this over time. The meeseeks can observe whether the main agent actually incorporated its injections or ignored them, and adjust its interrupt criteria accordingly.

### Reader Tunes Fast Recall

The memory reader meeseeks can also learn to tune Phase 1 parameters:
- Token budget for fast recall results
- Relevance score cutoff
- Which scopes to include (facts only? observations too?)
- Max results count

This is part of the meeseeks self-improvement workspace.

### Toggleable Modes

Different use cases need different latency/accuracy tradeoffs:

| Mode | Phase 1 | Phase 2 | Use Case |
|------|---------|---------|----------|
| `fast+slow` | BudgetLow recall (blocking, <1s) | Full meeseeks (async, steer interrupt) | Nex chat — liveness matters |
| `slow` | Full meeseeks (blocking, up to 60s) | None | Oracle queries — accuracy matters, don't care about latency |
| `none` | Skip | Skip | Implementation agents that already have their spec injected |

Configured per session, per persona, or per agent type.

### Applicability

This pattern applies to **both** nexus chat (personal assistant) and the oracle tree (code queries). In nexus, it improves conversational responsiveness. In the oracle tree, the `slow` mode ensures the most accurate answer for code questions. Same broker, same memory system, different mode.

---

## 3. Shared Memory with Tree-Scoped Queries

### Problem

In the current PRLM spec, each node is somewhat isolated. The memory system in Nexus is designed for a single agent's context. For the ABC architecture, we need **one memory store, many readers, scoped by tree topology**.

### Solution: Single Shared Memory Store with Topology Fields

All tree nodes share one memory store. Every fact, observation, and mental model is tagged with tree topology metadata enabling scoped queries.

```
┌─────────────────────────────────────────────────┐
│              SHARED MEMORY STORE                │
│   (events → facts → observations → models)      │
│                                                 │
│   Query scoping fields:                         │
│   ├── node_id          (who created this)       │
│   ├── extent_paths[]   (file/dir scope)         │
│   ├── tree_level       (depth in ABC tree)      │
│   ├── ancestor_chain[] (full path to root)      │
│   ├── episode_id       (conversation grouping)  │
│   └── timestamp        (temporal scoping)       │
└─────────────────────────────────────────────────┘
```

### Scoped Query Examples

**Leaf node:** "show me observations where extent overlaps my files"
```go
recall.Request{
    Query:       "authentication middleware",
    ExtentPaths: []string{"auth/middleware.go", "auth/handler.go"},
    Budget:      recall.BudgetMid,
}
```

**Mid-level node:** "show me observations from my children and my level"
```go
recall.Request{
    Query:       "authentication patterns",
    AncestorChain: []string{"root", "auth-subtree"},
    TreeLevel:     2,
    IncludeChildren: true,
    Budget:         recall.BudgetHigh,
}
```

**Root node:** "show me mental models across all top-level subtrees"
```go
recall.Request{
    Query:  "high-level architecture",
    Scope:  []recall.Scope{recall.ScopeMentalModels},
    TreeLevel: 1,
    Budget:    recall.BudgetLow,
}
```

### Extended Recall Request

```go
type TreeScopedRequest struct {
    recall.Request                       // existing recall fields
    NodeID          string               // which node is asking
    ExtentPaths     []string             // scope to these file paths
    TreeLevel       int                  // depth filter (0=root)
    AncestorChain   []string             // only facts from these ancestors
    IncludeChildren bool                 // include descendant nodes' facts
    Provenance      bool                 // return full event→episode→fact→observation chain
}
```

### Provenance Queries

The full chain — events → episodes → facts → observations — is queryable for debugging and tracing:

> "What observations came from facts extracted during the auth refactor episode?"

This traces: observation → `observation_facts` → fact → `source_event_id` → event → `episode_events` → episode.

When a node makes a bad routing decision, you can trace *why* it thought auth lived in subtree B instead of subtree C — which observation, which facts, which commits.

### Cross-Cutting Concern Resolution

If a refactor touches 5 subtrees, facts get extracted in each node's scope. But the **consolidation pipeline** clusters related facts across the shared store, creating cross-cutting observations visible to parent nodes. The parent sees the cross-cutting observation without querying all 5 children directly.

---

## 4. Git Events → Memory Pipeline

### Problem

The oracle tree needs to accumulate intelligence from git history. Currently the PRLM has a History Agent as a peer service with statistical tools (co-change matrix, velocity, churn). But this is disconnected from the memory system.

### Solution: Git Adapter → Events → Memory Pipeline

Git commits flow through the standard nex adapter protocol, entering the system as events:

```
Git Adapter (watches repos)
  → Commit event (diff, message, author, files changed)
    → Events Ledger (raw, immutable)
      → Memory-Writer Meeseeks (extracts facts)
        → "Module X now depends on Y" (fact)
        → "Auth was refactored from sessions to JWT" (fact)
        → "Tyler" entity, "auth module" entity (entities)
          → Consolidation pipeline
            → "The auth subsystem is being migrated from REST to gRPC" (observation)
            → "This subtree handles all payment processing" (mental model)
```

Each commit is an event. Episodes group related commits (same PR, same feature branch, same time window). Facts are extracted from diffs and commit messages. Observations cluster facts across time. Mental models provide the high-level routing intelligence for ABC tree pruning.

### Git Adapter Spec

The git adapter follows the standard nex adapter protocol:

- **Auth:** GitHub/GitLab/Bitbucket OAuth, or direct git clone URL
- **Monitor:** Watch for new commits (webhook or polling)
- **Ingest:** For each commit, emit an event with:
  - `source: "git"`
  - `source_id: "{repo}:{commit_sha}"`
  - `content: {commit_message, diff_summary, files_changed}`
  - `metadata: {author, branch, repo, timestamp, parent_sha}`
- **Backfill:** Walk git log to ingest historical commits

### Statistical Tools as Memory Queries

The History Agent's statistical tools (co-change matrix, velocity, churn hotspots) become **queries over the shared memory store** rather than separate computations:

- **Co-change matrix:** Query fact co-occurrences where facts share temporal episodes and overlapping extent_paths
- **Velocity:** Query fact density per extent_path over time windows
- **Churn hotspots:** Query access_count and fact frequency per file path

---

## 5. Seam Prediction → High-Leverage Change Detection

### Current Approach

The PRLM seam system uses 6 signal categories (filesystem structure, volume, conventions, dependencies, naming, history) with agent-driven analysis. The spec explicitly states: "The framework does not detect seams — the agent does."

### Extension: Ask the Tree for High-Leverage Changes

After hydration, every node has internalized its slice. The root has mental models of all subtrees. High-leverage change detection is simply a query to the tree:

> "Based on your understanding of this codebase, what are the highest-leverage changes for maintainability, performance, or correctness? Consider coupling patterns, code smells, architectural misalignment, and missing abstractions."

The co-change data from git history provides evidence. The memory system surfaces observations about patterns over time. But the agent makes the judgment.

### Scheduled Automation

Run after every commit (or daily, configurable):

```yaml
automation:
  name: seam-analysis
  trigger:
    event: git.commit
    # or: cron: "0 6 * * *"  (daily at 6am)
  action:
    type: meeseeks
    prompt: |
      Analyze recent changes and the current state of the tree.
      Identify the top 5 highest-leverage improvements.
      Consider: decoupling opportunities, churn hotspots,
      missing abstractions, architectural misalignment.
    tools: [recall, ask_tree]
    output: observation  # results feed back into memory
```

Results are observations in the shared memory store — queryable, versionable, traceable.

---

## 6. Nexus Seeds

### Concept

A **seed** is a purpose-built nexus instance. The runtime is identical — same broker, same memory, same adapter protocol, same event pipeline. What differs is the configuration:

- Which **adapters** are pre-installed
- Which **automations** run by default
- Which **plugins** extend the runtime (e.g., PRLM)
- Which **personas/agents** are shaped for the use case
- Which **server interfaces** are exposed

### Seed: Oracle Server

```
oracle-seed/
├── adapters/
│   ├── git/          # Clone, pull, watch commits (GitHub/GitLab/Bitbucket)
│   └── http/         # Oracle API: /ask, /status, /sync, /trees
├── plugins/
│   └── prlm/         # Tree management, hydrate, partition, fork, sync
├── automations/
│   ├── on-commit-sync.yaml       # Incremental tree sync on push
│   ├── on-commit-extract.yaml    # Memory-writer on new commits
│   └── daily-seam-analysis.yaml  # High-leverage change detection
├── personas/
│   └── oracle.yaml   # The oracle agent persona
└── config.json       # Seed-level configuration
```

Ships with everything a user needs:
1. Auth their git provider
2. Server clones repos, builds trees, hydrates
3. Webhook adapter listens for pushes, triggers incremental sync
4. Memory accumulates facts from every commit across every repo
5. HTTP adapter exposes the oracle API
6. Automations run seam analysis, surface high-leverage changes

### Seed: OpenClaw

```
openclaw-seed/
├── adapters/
│   ├── http/         # Web UI adapter
│   └── ...           # Use-case specific adapters
├── automations/
│   └── ...
├── personas/
│   └── ...
└── config.json
```

### Other Seeds

The nexus runtime is generic enough that any use case can be a seed. Each seed is just a configuration layer on top of the universal runtime.

---

## 7. Frontdoor Architecture

### Problem

Multiple nexus seeds need to be served through a single unified frontend/domain.

### Solution

A reverse proxy / gateway routes traffic to the appropriate nexus instance:

```
Frontdoor (unified gateway)
├── oracle.domain.com    → Nexus Seed: Oracle Server (VPS A)
├── app.openclaw.com     → Nexus Seed: OpenClaw (VPS B)
├── future.domain.com    → Nexus Seed: ??? (VPS C)
└── ...
```

Each nexus instance runs on its own VPS. The frontdoor handles TLS termination, routing, and load balancing. New seeds deploy by spinning up a new nexus instance and adding a route.

Improvements to the nex runtime benefit **every** seed simultaneously. Better memory → every nexus gets it. Better broker → every nexus gets it. Platform leverage.

---

## 8. Software Factory Pipeline

### Problem

End-to-end software development requires multiple specialized agents working in sequence with different context needs.

### Solution: Staged Pipeline with Clean Context Boundaries

```
Intake (issues, bugs, PM requests, customer requests)
  → Research Agent
      Tools: ask_oracle (queries the ABC tree)
      Output: curated context document
  → Planning Agent
      Input: curated context
      Tools: ask_oracle, recall (memory)
      Output: spec + workplan (may pose questions back to user)
  → Implementation Agent
      Input: single spec document (NOT oracle access — avoids staleness)
      Engine: Codex 5.3 Max or ralph loop
      Output: code changes
  → Validation Harness
      Input: code changes + original spec
      Tools: test runner, type checker, linter
      Output: pass/fail verdict with details
  → Review Agent
      Input: code changes + validation results
      Engine: Greptile / CodeRabbit / custom
      Output: review comments
  → Deploy Agent
      Input: approved changes
      Tools: CI/CD pipeline, infrastructure management
      Output: deployed changes
```

### Key Design Decisions

1. **Planning gets oracle access, implementation does not.** This is the MWP insight — the planner queries a pristine oracle, the implementer uses a stable spec document. If the oracle changes during implementation, the spec doesn't, preventing staleness-induced confusion.

2. **Each stage has a clean context window.** No agent carries the full history of previous stages — only its specific inputs. This keeps each agent focused and within context limits.

3. **The planner can ask the user questions.** When requirements are ambiguous, the planning agent poses clarifying questions. The user answers until satisfied, then the planner consolidates into a complete spec + workplan.

4. **Validation loops.** Implementation → Validation cycles up to N times before escalating. The validation harness is deterministic (tests, types, lint) not just LLM-based.

### Eval Trail

Three variants to measure empirically:
1. **baseline** — Single agent, no structure
2. **baseline-mwp** — Structured Plan → Implement → Validate phases
3. **baseline-mwp-oracle** — Same pipeline + oracle access during planning

This measures: (a) does structured orchestration help? (b) does oracle guidance improve quality?

---

## 9. Convergence: Nex Runtime + Cartographer

### Current State

The cartographer broker is a **direct port** of the nex broker's core infrastructure:

| Component | Status in Cartographer |
|-----------|----------------------|
| SQLite Ledger (sessions, turns, messages, tool_calls) | ✅ Complete |
| Queue Management (steer, interrupt, followup, collect, queue) | ✅ Complete |
| Orchestrator (IA/EA routing, worker management) | ✅ Complete |
| Pi-Agent Engine (RPC, process management) | ✅ Complete |
| Meeseeks Pattern (session forking, one-shot workers) | ✅ Complete |
| Checkpointing & Forking | ✅ Complete |
| Context Assembly (5-layer → 3-layer) | ❌ Missing |
| Memory Integration (memory injection) | ❌ Missing |
| Automations System (meeseeks v2 hooks) | ❌ Missing |
| Streaming Protocol (structured StreamEvent) | ❌ Missing |
| Smart Routing (memory-based thread matching) | ❌ Missing |
| Adapter System | ❌ Missing |

### Path Forward

Rather than maintaining two runtimes, cartographer becomes a **plugin** inside the nex runtime. The missing components (context assembly, memory, automations, streaming, adapters) come from nex — not reimplemented in cartographer.

### Go Port Strategy

Long-term, the entire nex runtime moves to Go. The cartographer already has the broker in Go. The strategy is to port nex components piece by piece into the cartographer's Go codebase until the full runtime is in Go:

1. **Memory System** — Now in TypeScript (ported from Go `github.com/Napageneral/nex/cortex`). Needs: events abstraction, LLM provider interface, tree topology fields. Extraction complexity: ~3 days for core, ~1 week for full abstraction.

2. **Adapter Protocol** — Port the adapter SDK and create git adapter. The Go adapter SDK already exists (`nexus-adapter-sdk-go`).

3. **Automations** — Port the hook/automation runner. Depends on broker (done) + memory (step 1).

4. **Context Assembly** — Port the 5-layer → 3-layer builder. Depends on memory (step 1).

5. **Streaming** — Port the StreamEvent protocol. Depends on broker (done).

### Memory System Portability Assessment

The memory system Go module (now ported to TS) had moderate coupling to nex:

| Dependency | Coupling | Mitigation |
|-----------|----------|------------|
| events.db (cross-database ATTACH) | Tight | Abstract via event provider interface |
| Gemini client (entity extraction, embeddings) | Tight | LLM provider interface |
| Config paths (~/nexus/state/) | Moderate | Constructor injection |
| Contacts system | Moderate | Already isolated |
| Database layer (SQLite + sqlite-vec) | Loose | Fully portable |
| Memory core (recall, query engine, entity resolution) | Loose | Highly portable |

**Phase 1 (3 days):** Extract db + recall + memory core
**Phase 2 (1 week):** Abstract events, LLM provider
**Phase 3 (2-3 weeks):** Full standalone service with adapters

---

## 10. Design Principles

1. **Nex is the shell.** Every use case runs inside a nexus instance. Broker, memory, adapters, automations — these are the OS-level primitives.

2. **Seeds are applications.** A seed is a nexus configured for a purpose. Same runtime, different shape.

3. **Memory is shared, queries are scoped.** One memory store per nexus instance. Tree topology metadata enables each node to query its relevant slice.

4. **Events are the source of truth.** Git commits, chat messages, API calls — everything enters as an event and flows through the same pipeline: events → facts → observations → mental models.

5. **Agents decide, systems enable.** The framework doesn't detect seams, set relevance thresholds, or choose what to remember. Agents do. Self-improvement loops tune agent judgment over time.

6. **Fast by default, accurate when needed.** Two-phase memory (fast recall + async deep search) optimizes for liveness. Toggle to blocking mode when accuracy matters more than latency.

7. **Platform leverage.** Improvements to the nex runtime benefit every seed simultaneously.

---

## Related Documents

### Nexus Specs
- `runtime/broker/QUEUE_MANAGEMENT.md` — Queue modes (steer, interrupt, collect, etc.)
- `runtime/broker/MEESEEKS_PATTERN.md` — Disposable role forks
- `data/memory/MEMORY_SYSTEM.md` — 4-layer memory architecture
- `memory/skills/MEMORY_INJECTION.md` — Current memory reader meeseeks
- `data/memory/RETAIN_PIPELINE.md` — Episode-based retain pipeline
- `data/DATABASE_ARCHITECTURE.md` — 6-database canonical layout
- `runtime/adapters/ADAPTER_PROTOCOL.md` — Adapter interface

### Code Cartographer Docs
- `docs/PRLM.md` — Persistent Recursive Language Model
- `docs/specs/SPEC-oracle-server-v2.md` — Oracle server specification
- `docs/PRLM-seams.md` — Seam detection signals
- `docs/PRLM-terrain-history.md` — Git history analysis
- `eval/specs/mwp-eval.md` — MWP evaluation plan
- `eval/variants/baseline-mwp.yaml` — MWP eval variant
- `eval/variants/baseline-mwp-oracle.yaml` — MWP + oracle eval variant

### Research
- `research/ai-memory-benchmarks.md` — Hindsight, Supermemory, Mastra OM, RLM, LCM comparison
