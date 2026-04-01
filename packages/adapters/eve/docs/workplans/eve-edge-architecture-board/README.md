# Eve Edge Architecture Board

## Purpose

This board owns the gap between the current packaged Eve adapter and the
canonical long-term Eve architecture: a macOS `eve-edge` paired with Nex core,
fast watcher-backed ingest, routed remote actions, and Linux-friendly Nex
deployment.

The goal is to move Eve from:

1. a local packaged adapter with a broad hot sync loop
2. one default-slot mental model
3. basic local send

to a truthful edge architecture covering:

1. low-latency watcher-backed ingest
2. explicit macOS edge to Nex core transport
3. remote client access through Nex alone
4. richer capability-gated iMessage actions
5. multi-user and multi-host routing

## Canonical Inputs

Every ticket on this board inherits:

1. [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
2. [EVE_TAXONOMY.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/specs/EVE_TAXONOMY.md)
3. [ADAPTER_SPEC_EVE.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/specs/ADAPTER_SPEC_EVE.md)
4. [EVE_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/validation/EVE_ADAPTER_VALIDATION.md)

Comparative implementation inputs for this board include the old ChatStats
watcher and BlueBubbles product behavior, but the target state is owned by the
active Eve canon above, not by historical implementation copies.

## Baseline Truth

Already present before this board:

1. packaged Eve adapter identity and local setup flow
2. warehouse-backed backfill and monitor surfaces
3. canonical record ingest for messages, reactions, and membership events
4. baseline `imessage.send`
5. active Eve canon for the long-term edge architecture

## Scope

In scope:

1. hot watcher replacement for the current broad monitor loop
2. replay-safe delta ETLs and bounded reconciliation
3. separation of hot-path ingest from slow maintenance and repair work
4. macOS edge pairing and transport to Nex core
5. attachment object delivery and remote fetch surfaces through Nex
6. Nex-core routing and client-visible Eve state
7. richer capability-gated iMessage action surfaces
8. multi-user and multi-host connection routing
9. cleanroom-backed validation and golden-journey proof

Out of scope:

1. making Linux itself a direct iMessage provider
2. making BlueBubbles a hard runtime dependency for Nex
3. letting clients talk directly to the macOS host
4. treating command receipts as durable history

## Execution Posture

This board is intended to be burned down in manager mode.

Rules:

1. the manager thread owns ticket movement, integration, and validation truth
2. only one ticket should normally live in `in-progress/` at a time
3. subagents may parallelize work inside the active ticket when write scopes do
   not overlap
4. downstream tickets may run in parallel only when they are genuinely
   independent and do not block the active integration step
5. moving the file between folders is the status change

The first honest parallel split on this board is after `EEA-005`, where
`EEA-006` and `EEA-007` can proceed concurrently while `EEA-008` waits on both.

## Ticket Lifecycle

Tickets live in exactly one folder:

1. `not-started/`
2. `in-progress/`
3. `completed/`
4. `blocked/`

## Current Status Snapshot

Completed:

- [EEA-001](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-001-hot-watcher-kernel-and-watermark-ledger-cutover.md) - replace the broad hot monitor loop with a watcher kernel and restart-safe watermark ledger
- [EEA-002](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-002-replay-safe-delta-etls-and-bounded-reconciliation.md) - harden the hot delta ETLs and reconciliation rules now that the watcher kernel is live
- [EEA-003](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-003-slow-maintenance-loops-and-warehouse-repair-split.md) - split slow maintenance and warehouse repair out of the watcher hot path
- [EEA-004](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-004-eve-edge-pairing-transport-session-and-health-capability-advertisement.md) - teach Eve to behave like a paired macOS edge with explicit health and capability truth
- [EEA-005](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-005-canonical-record-stream-attachment-object-flow-and-command-receipts.md) - land the paired-edge data and receipt plane so live Eve state can flow through Nex cleanly
- [EEA-006](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-006-nex-core-eve-connection-ledger-and-command-routing.md) - make Nex core route Eve commands to the correct paired edge with capability-aware failure behavior
- [EEA-007](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-007-remote-client-thread-attachment-and-live-state-surfaces-through-nex.md) - expose Eve threads, attachments, and live state through Nex-native client surfaces
- [EEA-008](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-008-rich-macos-action-surface-with-watcher-confirmed-outbound-reconciliation.md) - expand Eve into a richer capability-gated action plane with watcher-confirmed reconciliation
- [EEA-009](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-009-multi-user-and-multi-host-connection-model.md) - replace the default-slot model with per-session connection truth and deterministic multi-host routing
- [EEA-010](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-010-cleanroom-validation-ladder-golden-journey-proof-and-cutover-closeout.md) - close the board with the active proof ladder, golden-journey coverage, and doc alignment

In Progress:

- none

Blocked:

- none

Not Started:

1. none

## Ticket Order

1. [EEA-001](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-001-hot-watcher-kernel-and-watermark-ledger-cutover.md)
2. [EEA-002](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-002-replay-safe-delta-etls-and-bounded-reconciliation.md)
3. [EEA-003](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-003-slow-maintenance-loops-and-warehouse-repair-split.md)
4. [EEA-004](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-004-eve-edge-pairing-transport-session-and-health-capability-advertisement.md)
5. [EEA-005](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-005-canonical-record-stream-attachment-object-flow-and-command-receipts.md)
6. [EEA-006](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-006-nex-core-eve-connection-ledger-and-command-routing.md)
7. [EEA-007](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-007-remote-client-thread-attachment-and-live-state-surfaces-through-nex.md)
8. [EEA-008](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-008-rich-macos-action-surface-with-watcher-confirmed-outbound-reconciliation.md)
9. [EEA-009](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-009-multi-user-and-multi-host-connection-model.md)
10. [EEA-010](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/EEA-010-cleanroom-validation-ladder-golden-journey-proof-and-cutover-closeout.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/blocked/README.md)
