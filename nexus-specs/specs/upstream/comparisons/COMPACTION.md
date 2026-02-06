# Compaction System Comparison

**Status:** COMPLETE  
**Last Updated:** 2026-02-03

---

## Overview

Compaction is context management — summarizing older messages to fit within model context windows. OpenClaw has a sophisticated system here that's worth understanding.

---

## OpenClaw's Compaction System

### Triggers

**1. Context Overflow (Auto)**
- Detected when prompt exceeds context window
- Triggers auto-compaction, then retries

**2. Threshold-Based**
- Managed by `pi-coding-agent` library
- Checks `contextTokens > contextWindow - reserveTokens`
- Default reserve: 20,000 tokens

**3. Manual**
- `/compact` command with optional instructions
- Example: `/compact Focus on decisions and open questions`

### Pre-Compaction Memory Flush

Before compacting, system can flush memories to disk:
- Triggers when within soft threshold (default: 4,000 tokens before limit)
- Prompts agent: "Store durable memories now"
- Uses `memory/YYYY-MM-DD.md` for storage
- Only runs once per compaction cycle

**This is clever:** Don't lose important context before summarizing.

### Summarization Modes

**Default Mode:**
1. Library determines what to summarize vs keep
2. `generateSummary()` creates summary
3. Summary stored in JSONL
4. Older messages removed from active history

**Safeguard Mode:**
More sophisticated for large contexts:

1. Check if new content exceeds history budget (50% of context)
2. If exceeded, prune oldest chunks first
3. Adaptive chunk ratio (40% → 15% based on message sizes)
4. Summarize each chunk sequentially
5. Handle split turns specially
6. Merge partial summaries
7. Progressive fallback if summarization fails

### Prompts Used

**Turn prefix (for split turns):**
> "This summary covers the prefix of a split turn. Focus on the original request, early progress, and any details needed to understand the retained suffix."

**Merge summaries:**
> "Merge these partial summaries into a single cohesive summary. Preserve decisions, TODOs, open questions, and any constraints."

**Fallback:**
> "Context contained X messages (Y oversized). Summary unavailable due to size limits."

### Compaction Entry Structure

```json
{
  "type": "compaction",
  "id": "uuid",
  "parentId": "uuid",
  "summary": "Previous conversation summary...",
  "firstKeptEntryId": "uuid",
  "tokensBefore": 150000,
  "tokensAfter": 50000,
  "details": { ... }
}
```

### Plugin Hooks

- `before_compaction` — fire before (parallel)
- `after_compaction` — fire after (parallel)
- `session_before_compact` — pi-extensions can override behavior

---

## What About Nexus?

### Pre-Compaction Memory Flush: NOT NEEDED

See `MEMORY_PHILOSOPHY.md` for the full rationale.

OpenClaw needs this because their memory is file-based — context summarized away is "lost" to memory. Nexus stores all turns in the Agents Ledger forever. Cortex derives memory from this complete System of Record.

No live saving required. No information loss. Better foundation.

### Adaptive Chunking / Safeguard Mode: PROBABLY NOT NEEDED

These handle edge cases (context too large to summarize in one call). The complexity may not be worth it.

**Alternative approach:**
- Keep turns reasonably sized (don't bundle too much)
- Use a single reliable compaction approach
- Handle failures gracefully (don't crash)
- Document the constraint

### Progressive Fallback: MAYBE

The resilience is nice — never fail hard. But the layered complexity is concerning. 

**Simpler alternative:** Single approach that handles the common case well. Log and surface errors for the rare edge cases. Don't over-engineer.

### Split Turn Handling: WORTH UNDERSTANDING

The problem: A single turn with massive tool results exceeds summarization capacity.

**Questions to answer first:**
- How common is this really?
- Can we avoid it by structuring turns better?
- What's the elegant solution within Nexus's data model?

Don't copy the solution. Understand the problem.

---

## What Nexus Does Differently

### Storage

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| Where | JSONL file entry | Agents Ledger row |
| Query | Read whole file | SQL query |
| Audit | None | Full trace |

### Context Assembly

OpenClaw: Walk JSONL tree, apply compaction summaries.

Nexus: Query Agents Ledger with proper indexes. Can efficiently get "last N turns plus any compaction summaries."

### Derived Understanding

OpenClaw's compaction is just compression — make it fit.

Nexus's Cortex goes further:
- Episodes summarize interactions
- Facets extract entity attributes
- Embeddings enable semantic search
- Analyses aggregate insights

Compaction is one tool. Cortex is a system.

---

## Implementation Notes

### Compaction Trigger Points

For NEX pipeline:
- `assembleContext` stage checks token budget
- If over threshold, trigger compaction before `runAgent`
- Store compaction entry in Agents Ledger
- Continue with compacted context

### Suggested Schema Addition

```sql
-- Compaction entries in Agents Ledger
CREATE TABLE compactions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  first_kept_turn_id TEXT NOT NULL,
  tokens_before INTEGER,
  tokens_after INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

### Memory Flush Integration

Before compaction:
1. Check if approaching threshold (configurable soft limit)
2. If so, inject a "memory flush" turn
3. Agent writes important context to Cortex
4. Proceed with compaction

This keeps the good pattern while integrating with Nexus's derived layer.

---

## Summary

OpenClaw's compaction handles many edge cases:
- Multiple triggers (overflow, threshold, manual)
- Pre-compaction memory flush
- Adaptive chunking
- Progressive fallback
- Plugin extensibility

**But many are patches for a fragile foundation:**
- Pre-compaction flush → unnecessary with Nexus's System of Record
- Adaptive chunking → complexity for edge cases
- Progressive fallback → over-engineering?

**Nexus advantages make some patterns unnecessary:**
- SQLite storage → all turns preserved forever
- Cortex → derives memory from complete history
- No information loss → no need for live saving

**Study, don't copy:**
- Understand why they built each feature
- Decide if Nexus has the same problem
- Design elegant solutions if needed

---

## The Philosophy

> "We will not be greedily taking the next solution, we will be carefully thinking through all of the problems and only acting when we can fully articulate the problem space and design a single elegant solution to it."

OpenClaw added solutions as problems arose (organic growth).

Nexus designs the foundation first (architectural approach).

Many of OpenClaw's compaction features are patches. A better foundation needs fewer patches.

---

*Compaction is worth studying. But Nexus may need less of it because the architecture is sounder.*
