# OCH-005 Chat Command Path Integration

## Goal

Bind the operator chat commands to canonical Nex execution paths.

## Why

The chat UI should reuse existing Nex primitives for sending, aborting,
approval handling, and delivery routing instead of inventing a side channel.

## Scope

- implement `chat.send` as records-first persistence for durable human-visible
  operator input followed by explicit lane/session continuation
- implement `chat.abort` through the canonical abort path
- implement `chat.approvals.respond` through canonical approval resolution
- implement `chat.delivery.select` through canonical lane routing state
- project final human-visible assistant output into canonical records
- preserve durable linkage between human-visible transcript entries and their
  canonical records
- ensure resulting state changes are emitted into the durable chat event log

## Acceptance

- chat sends persist canonical operator-visible input records before execution
  continuation
- chat aborts use the canonical active-run abort path
- approval decisions map to canonical approval operations
- delivery-target selection affects future lane continuation behavior
- final human-visible assistant output is projected into canonical records
- streaming deltas and lifecycle churn remain in chat events rather than being
  modeled as canonical records

## Completed Reality

- `chat.send` now persists canonical operator-visible input first, continues
  the resolved lane session explicitly, and stamps transcript linkage metadata
- `chat.abort` now uses the canonical queue clear, subagent stop, embedded run
  abort, and active chat-run abort flow
- `chat.approvals.respond` now verifies lane ownership and routes through the
  canonical approval handlers
- `chat.delivery.select` now persists lane bindings and updates the lane
  session route for explicit delivery targets
- final human-visible assistant output is projected into canonical records and
  linked back onto the transcript ledger

## Validation

- targeted runtime and projection validation now passes for:
  - `src/api/server-methods/chat.test.ts`
  - `src/api/server-methods/agent.session-send.test.ts`
  - `src/api/chat-projection.test.ts`
  - `src/storage/agents.chat-projection.test.ts`
  - `src/storage/agents.schema-cutover.test.ts`
  - `src/api/runtime-operations.conformance.test.ts`
  - `src/api/openapi/nex-contract.schema-registry.test.ts`
  - `src/capabilities/chat/index.test.ts`
