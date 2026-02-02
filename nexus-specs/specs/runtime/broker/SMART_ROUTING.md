# Smart Routing

**Status:** TODO (Not Fully Integrated)  
**Last Updated:** 2026-02-02

---

## Overview

Smart routing uses Cortex to intelligently route messages to the best context, rather than explicit addressing.

**This is a v2 feature.** Explicit routing (direct session/thread addressing) is v1.

---

## The Vision

Instead of explicit routing:

```typescript
// Explicit routing (v1)
broker.send({ to: "code-worker", content: "Review auth module" });
```

Smart routing finds the best context:

```typescript
// Smart routing (v2)
const route = await broker.routeSmart("Review the authentication module");
// Returns: { checkpoint: {...}, confidence: 0.87 }

// Then fork from that checkpoint
broker.forkFrom(route.checkpoint, message);
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    Smart Routing Pipeline                        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Stage 1: Candidate Generation                                   │
│  - Embedding similarity (semantic match)                         │
│  - Facet overlap (files, entities, topics)                      │
│  - Recency filter                                                │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Stage 2: Scoring                                                │
│  - Turn quality signals (from analysis)                         │
│  - Thread continuity bonus                                       │
│  - Freshness (file state hashes)                                │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Stage 3: Decision                                               │
│  - Route to best segment if score > threshold                   │
│  - OR create new session if no good match                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Interface

```typescript
interface AgentBroker {
  // ... existing explicit routing ...
  
  // === Smart Routing (v2) ===
  
  /**
   * Route to best checkpoint using Cortex.
   * Returns routing decision with confidence.
   */
  routeSmart(task: string): Promise<SmartRouteResult>;
  
  /**
   * Fork from a checkpoint (resume from historical context).
   */
  forkFrom(checkpoint: Checkpoint, message: Message): Promise<void>;
  
  /**
   * Set routing mode for A/B testing.
   */
  setRoutingMode(mode: 'explicit' | 'smart' | 'hybrid'): void;
}

interface SmartRouteResult {
  mode: 'existing' | 'new';
  checkpoint?: Checkpoint;
  confidence: number;
  alternatives: Checkpoint[];
}

interface Checkpoint {
  segmentId: string;
  sessionKey: string;
  turnId: string;
  context: string;   // What was being worked on
}
```

---

## Use Cases

| Use Case | Best Mode |
|----------|-----------|
| Known hierarchies (MA delegates to specific WAs) | Explicit |
| "Continue what I was working on" | Smart |
| Structured workflows | Explicit |
| Discovery / exploration | Smart |
| A/B testing effectiveness | Both |

---

## Requirements

Smart routing requires:
1. **Cortex populated** with session history and facets
2. **Embedding index** for semantic matching
3. **Quality signals** on turns (from analysis)
4. **Scoring algorithm** (threshold tuning)

---

## Open Questions

1. **Threshold tuning:** What confidence score is "good enough"?
2. **Stale context:** How to handle context that references changed files?
3. **A/B testing:** Metrics for comparing explicit vs smart routing
4. **Hybrid mode:** When to use which?

---

## Related Documents

- `OVERVIEW.md` — Broker overview
- `CONTEXT_ASSEMBLY.md` — How forked context is assembled
- `../cortex/` — Cortex system

---

*This document defines smart routing for the Nexus agent system.*
