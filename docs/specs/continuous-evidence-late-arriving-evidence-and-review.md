---
title: Continuous Evidence Late-Arriving Evidence and Human Review
summary: The canonical time, replay, history, and review contract for evidence that can arrive after its business date.
status: proposed
---

# Continuous Evidence Late-Arriving Evidence and Human Review

## Decision

Nex processes each subject in business-time order, but it never assumes that records arrive in that order. A newly connected source, a historical backfill, a corrected document, or a delayed provider event may add evidence anywhere in a subject's history.

The system therefore keeps two clocks:

- **Effective time** records when the source says an event or claim was true.
- **Learned time** records when Nex first committed the exact source revision or derived element.

Both are required. Effective time gives the correct business history. Learned time preserves the audit history of what MoonSleep knew and when it knew it.

## Canonical pipeline

```text
provider record
  -> immutable source revision
  -> typed, source-bound facts
  -> sealed subject input set
  -> deterministic subject resolver
  -> versioned observation head
  -> idempotent domain projection
  -> human review receipt when policy requires it
```

Records retain provider evidence. Facts state exact extracted claims. A sealed set names the complete evidence snapshot used for one resolver attempt. An observation records the resulting domain understanding. A projection is the domain-specific operational or analytical view built from reviewed observation heads.

## Initial history build

An initial backfill is processed oldest-first within each stable subject key. Subjects may run in parallel. A single global serial queue is neither required nor desirable.

Each domain defines:

- its stable subject key;
- the fact profiles relevant to that subject;
- its evidence precedence rules;
- its deterministic resolver version;
- whether a candidate can promote automatically or requires review;
- its projection applier and replay key.

If authoritative evidence does not reach the true beginning of a subject, the domain records a coverage floor or an explicit bootstrap snapshot. It must not imply that earlier history is complete.

## Late-arriving evidence

When new evidence has an effective time earlier than a subject's current processing frontier:

1. Commit the source revision and derived facts append-only.
2. Identify every affected subject key through explicit fact-to-entity and fact-to-subject links.
3. Record the earliest changed effective time as that subject's dirty-from point.
4. Rebuild deterministic sealed inputs from the dirty-from point through the current frontier.
5. Replay the resolver in effective-time order.
6. Reuse an existing observation when its canonical payload and exact input digest match.
7. Create a successor observation only when the canonical understanding changes.
8. Apply projection corrections idempotently from the new canonical heads.
9. Preserve all prior source revisions, facts, sets, observations, projection receipts, and review decisions.

The replay does not rewrite history. It adds a new audit-visible understanding of history.

## Corrections and identity changes

A corrected provider object is a new source revision. It does not mutate the prior revision.

An identity merge, split, or reviewed rebinding can change which subject histories a fact belongs to. Such a change creates a replay trigger for every impacted subject from the earliest affected effective time. Similar names, email addresses, or addresses alone never grant merge authority.

## Head and concurrency rules

- Observation promotion uses compare-and-set against the expected canonical head.
- A stale writer fails closed and retries from the new head.
- A subject has one canonical successor at a time unless its domain explicitly declares branch semantics.
- Sealed input membership and digest never change after sealing.
- Projection applies use a stable observation-and-projection replay key.
- Failed applies enter a bounded retry and dead-letter path without losing the canonical observation.

## Review ordering

The bootstrap review queue may be oldest-first so humans can watch the subject history accumulate naturally. Steady-state review is prioritized by operational importance, not globally oldest-first.

Late evidence is inserted at its effective position, replayed forward, and surfaced as one focused change review:

- what new source appeared;
- which facts it added or contradicted;
- which observation heads changed;
- which projections will be corrected;
- what remained unchanged.

This prevents a newly connected historical source from forcing a human to re-review every unaffected item.

## Evidence inbox interaction contract

The review workspace presents three coordinated surfaces:

1. A queue of review batches and subject items.
2. Original source records, attachment previews, extracted facts, and observation history.
3. Blind candidate analyses, meaningful field differences, and sticky decision controls.

The default view uses human labels. Internal identifiers, hashes, schema bindings, and raw payloads live in explicit technical disclosures.

Every displayed fact must trace to an exact source revision and, when available, a source fragment or attachment region. When an attachment body is not in artifact custody, the interface says so directly and does not imply that the file was inspected.

## Minimum production proof

Before a domain enables continuous promotion, it must prove:

- oldest-first bootstrap produces deterministic heads;
- exact replay creates no new logical state;
- out-of-order insertion replays only impacted subjects;
- a correction preserves prior history and advances the head once;
- an identity rebinding triggers the correct bounded replay;
- stale-head promotion fails closed;
- projection retry and dead-letter recovery are idempotent;
- effective and learned timestamps survive API and UI readback;
- review decisions bind exact candidate, input-set, profile, and policy digests;
- all action authority remains false unless a separate domain contract grants it.

## Explicit non-goals

- No global chronological lock across unrelated subjects.
- No destructive rewrite of old facts or observations.
- No inferred identity merge from similarity alone.
- No automatic provider, payment, journal, tax, or communication authority from evidence ingestion.
- No claim that a source attachment was parsed when its artifact is unavailable.
