# Eve Action Parity Board

## Purpose

This board owns the gap closure between Eve's current `applescript_send_only`
executor and the full iMessage action parity the product now requires.

It exists to answer one question truthfully:

- can Eve match BlueBubbles-class iMessage behavior while preserving Eve's
  warehouse-first ingest, contact matching, and Nex-native canonical records

This board is for implementation and proof, not for redefining Eve's overall
edge architecture.

## Canonical Inputs

1. [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)
2. [ADAPTER_SPEC_EVE.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/specs/ADAPTER_SPEC_EVE.md)
3. [EVE_ACTION_EXECUTION_BOUNDARIES.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/specs/EVE_ACTION_EXECUTION_BOUNDARIES.md)
4. [EVE_TAXONOMY.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/specs/EVE_TAXONOMY.md)
5. [EVE_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/validation/EVE_ADAPTER_VALIDATION.md)
6. [Eve Edge Architecture Board](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-edge-architecture-board/README.md)
7. [Eve Operator Validation Board](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board/README.md)

## Scope

In scope:

1. truthful action capability surfaces for Eve executors
2. AppleScript-reachable action improvements beyond the current
   `applescript_send_only` baseline
3. private-API-required companion planning for behaviors AppleScript cannot
   truthfully provide
4. native inline media send parity for photos and videos
5. provider-native reply and reaction execution
6. provider-native edit and unsend execution
7. thread mutation parity: create, rename, add participants, remove
   participants
8. parity-proof validation lanes and golden-journey evidence

Out of scope:

1. weakening watcher-confirmed durable truth
2. replacing the warehouse-first ingest model with direct client APIs
3. pretending declared methods are the same thing as supported methods
4. treating generic file-tile send as inline media parity
5. UI automation as a canonical parity answer

## Execution Lanes

Active now:

1. AppleScript-reachable lane
   - `EAP-001` capability truth
   - `EAP-002` inline media reachability and parity

Parked until a dedicated parity host exists:

1. private-API-required lane
   - `EAP-003` reply and reaction parity
   - `EAP-004` edit and unsend parity
   - `EAP-005` thread mutation parity
   - `EAP-006` full golden parity journey

## Ticket Order

1. [EAP-001](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-action-parity-board/completed/EAP-001-enhanced-executor-contract-and-capability-truth.md)
2. [EAP-002](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-action-parity-board/completed/EAP-002-native-inline-media-send-parity.md)
3. [EAP-003](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-action-parity-board/blocked/EAP-003-reply-and-reaction-parity.md)
4. [EAP-004](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-action-parity-board/blocked/EAP-004-edit-and-unsend-parity.md)
5. [EAP-005](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-action-parity-board/blocked/EAP-005-thread-mutation-parity.md)
6. [EAP-006](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-action-parity-board/blocked/EAP-006-operator-proof-and-golden-parity-journey.md)

## Status

- [Not Started](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-action-parity-board/not-started/README.md)
- [In Progress](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-action-parity-board/in-progress/README.md)
- [Completed](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-action-parity-board/completed/README.md)
- [Blocked](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-action-parity-board/blocked/README.md)

## Live Snapshot

In progress now:

- none

Blocked now:

- `EAP-003` through `EAP-006`

Completed now:

- `EAP-001` enhanced executor contract and capability truth
- `EAP-002` AppleScript inline media reachability and parity
