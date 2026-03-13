---
summary: "Canonical durable serialization model for repeated Spike code builds."
title: "Spike Code Build Replay Serialization"
---

# Spike Code Build Replay Serialization

## Customer Experience

When the same repository snapshot is requested more than once, the operator
should see one of two truthful outcomes:

1. the existing ready snapshot is reused
2. one build runs and the other callers wait or observe its progress

The operator must not see duplicate-row failures from internal snapshot tables.

## Problem

The current code-intel build path only serializes by `snapshot_id` inside one
Go process. That is not enough for real replay pressure where repeated work can
arrive through separate runtime requests, queue retries, or overlapping hosted
traffic.

## Canonical Rules

1. `spike.code.build` execution is durable and keyed by `snapshot_id`.
2. Every snapshot build has one durable state:
   - `pending`
   - `building`
   - `ready`
   - `failed`
3. Only one active builder may own a given `snapshot_id` across the runtime at
   a time.
4. Repeat callers for the same `snapshot_id` must not start a competing build.
5. Repeat callers must either:
   - reuse an existing ready snapshot
   - observe or wait on the active build
   - retry only after a truthful failed state
6. Snapshot publish for one `snapshot_id` must be atomic from the caller
   perspective.
7. Duplicate `code_files` rows for the same `(snapshot_id, file_path)` must be
   impossible under replay.
8. Failed builds must release or expire their build lease and leave a truthful
   error status.

## Preferred Mechanism

The durable serialization mechanism should live in SQLite, not only in process
memory.

Examples of acceptable implementation shapes:

1. a dedicated build-state row plus build-lease row keyed by `snapshot_id`
2. another durable exclusive-build primitive with the same effect and explicit
   publish state

The important contract is durable serialization plus explicit durable state,
not the exact table name.

## Validation Requirements

This cut is not complete until:

1. repeated build requests for the same `snapshot_id` succeed without duplicate
   `code_files` failures
2. concurrent callers for the same `snapshot_id` produce one ready snapshot
3. replay through queued Spike jobs remains idempotent
4. a failed build leaves a truthful `failed` snapshot state and a later retry
   can recover cleanly
