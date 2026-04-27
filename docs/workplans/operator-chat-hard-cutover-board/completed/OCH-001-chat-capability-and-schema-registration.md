# OCH-001 Chat Capability And Schema Registration

## Goal

Register the canonical `chat.*` capability surface in Nex so the runtime has
one official operator chat contract.

## Why

No UI cutover should begin before Nex owns the contract the UI will consume.
Without this ticket, the forked chat client would drive the model instead of
the Nex runtime.

## Scope

- add canonical schema definitions for:
  - `chat.snapshot`
  - `chat.replay`
  - `chat.send`
  - `chat.abort`
  - `chat.approvals.respond`
  - `chat.delivery.select`
- register the runtime operation descriptors for those methods
- wire the `chat` websocket broadcast event into the runtime contract surface
- keep the contract aligned with the canonical operator chat specs

## Acceptance

- Nex exposes the full `chat.*` method set in the canonical runtime contract
- the runtime schema registry and operation taxonomy include the new methods
- the websocket event name `chat` is reserved and documented for the operator
  chat surface
- no compatibility aliases or duplicate chat contract names are introduced

## Completed Work

- added the canonical `chat.*` capability family in `nex/`
- registered `chat.*` in the canonical core capability registry
- registered `chat.*` in the runtime operation taxonomy and handler registry
- exported the protocol schemas and OpenAPI schema-name maps for `chat.*`
- reserved the websocket event name `chat` in the canonical runtime event list
- classified the `chat` root as a core capability in the method catalog

## Validation

- `pnpm exec vitest run src/capabilities/chat/index.test.ts src/capabilities/core-runtime.test.ts src/api/runtime-operations.conformance.test.ts src/api/openapi/nex-contract.schema-registry.test.ts`
- `pnpm exec oxfmt --check src/capabilities/chat/index.ts src/capabilities/chat/runtime-bindings.ts src/api/server-methods/chat.ts src/api/protocol/schema/chat.ts src/capabilities/chat/index.test.ts src/capabilities/index.ts src/capabilities/core-runtime.ts src/api/runtime-operations.ts src/api/server-methods.ts src/api/protocol/schema.ts src/api/protocol/schema/protocol-schemas.ts src/api/openapi/nex-contract.ts src/platform/packages/method-catalog.ts src/api/runtime-operations.conformance.test.ts src/capabilities/core-runtime.test.ts src/api/openapi/nex-contract.schema-registry.test.ts src/api/openapi/nex-contract.test.ts`

## Notes

- the registered `chat.*` handlers currently return `UNAVAILABLE` until the
  projection/read-side and command-path tickets land
- `src/api/openapi/nex-contract.test.ts` could not be executed in this local
  environment because `isolated-vm` does not have a matching native build for
  the current Node ABI on this machine
