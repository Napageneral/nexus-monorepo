---
summary: "Workplan for durable Spike code-build serialization under replay."
title: "Spike Code Build Replay Serialization Workplan"
---

# Spike Code Build Replay Serialization Workplan

## Goal

Replace process-local build locking with durable snapshot serialization so
replay and concurrent requests cannot corrupt `code_files`.

## Current Gap

The existing lock is a `sync.Map` inside `codeintel.Service`, but
`spike-engine` constructs a fresh `codeintel.Service` per request. In practice
that means the current lock is request-local and does not serialize real replay
traffic.

## Phase 1: Durable Build Coordination

1. add a durable build-state primitive keyed by `snapshot_id`
2. add a durable builder lease keyed by `snapshot_id`
3. make builders acquire that coordination primitive before mutating snapshot
   rows

## Phase 2: Wait/Reuse Semantics

1. if a ready snapshot already exists for the same identity, reuse it
2. if another builder already owns the snapshot, wait or observe rather than
   racing
3. if the snapshot is in `failed`, require an explicit retry path instead of
   pretending it is reusable

## Phase 3: Atomic Snapshot Replacement

1. stage file, chunk, symbol, import, reference, call, and capability rows
   under one durable build owner
2. publish the staged snapshot atomically
3. guarantee no second builder can insert competing `code_files` rows for the
   same snapshot during that window

## Phase 4: Replay Validation

1. reproduce the current duplicate-row failure shape
2. prove the new durable serialization path removes it
3. rerun queued Spike replay against the same commit more than once
4. prove a failed build can be retried into `ready`
