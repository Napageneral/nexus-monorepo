# Eve Operator Validation Board

## Purpose

This board owns the proof campaign for the Eve edge architecture after the
implementation board closed.

It exists to answer one question truthfully:

- does Eve actually work as a macOS edge paired to a Linux-hosted Nex core
  under real operator conditions

This board is for proof, not architecture invention.

## Canonical Inputs

1. [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
2. [ADAPTER_SPEC_EVE.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/specs/ADAPTER_SPEC_EVE.md)
3. [EVE_TAXONOMY.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/specs/EVE_TAXONOMY.md)
4. [EVE_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/validation/EVE_ADAPTER_VALIDATION.md)
5. [Eve Edge Architecture Board](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/README.md)

## Scope

In scope:

1. Linux cleanroom `nex-core` proof
2. real macOS edge pairing proof
3. real inbound and outbound iMessage proof using the operator's own number
4. attachment, backfill, and live-latency proof
5. restart, recovery, and replay-safety proof
6. multi-connection proof planning and execution prerequisites
7. golden-journey artifacts and validation-script capture

Out of scope:

1. redesigning the Eve architecture again
2. treating fixture tests as a substitute for operator proof
3. proving unsupported rich actions as if they were shipped
4. claiming multi-connection parity without a second real identity surface

## Ticket Order

1. [EVP-001](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board/completed/EVP-001-linux-cleanroom-core-and-proof-harness.md)
2. [EVP-002](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board/completed/EVP-002-macos-edge-pairing-to-linux-core.md)
3. [EVP-003](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board/completed/EVP-003-real-self-loop-imessage-inbound-and-outbound-proof.md)
4. [EVP-004](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board/completed/EVP-004-attachment-backfill-and-live-latency-proof.md)
5. [EVP-005](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board/completed/EVP-005-restart-recovery-and-replay-safety-proof.md)
6. [EVP-006](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board/blocked/EVP-006-multi-connection-proof-plan-and-prerequisites.md)
7. [EVP-007](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board/completed/EVP-007-golden-journey-artifacts-and-closeout.md)
8. [EVP-008](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board/completed/EVP-008-image-proof-and-attachment-replay-stability.md)
9. [EVP-009](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board/completed/EVP-009-sandboxed-runtime-method-routing-through-installed-eve-package.md)
10. [EVP-010](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board/completed/EVP-010-sandboxed-cleanroom-method-surface-projection-for-eve.md)
11. [EVP-011](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board/completed/EVP-011-no-sweep-startup-window-watcher-proof.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board/blocked/README.md)

## Live Snapshot

Completed now:

- `EVP-001` Linux cleanroom core and proof harness
- `EVP-002` macOS edge pairing to Linux core
- `EVP-003` real self-loop iMessage inbound and outbound proof
- `EVP-004` attachment, backfill, and live-latency proof
- `EVP-005` restart, recovery, and replay-safety proof
- `EVP-007` golden-journey artifacts and closeout
- `EVP-008` image proof and attachment replay stability
- `EVP-009` sandboxed runtime method routing through installed Eve package
- `EVP-010` sandboxed cleanroom method-surface projection for Eve
- `EVP-011` no-sweep startup-window watcher proof

Blocked now:

- `EVP-006` multi-connection proof plan and prerequisites
