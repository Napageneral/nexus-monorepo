# Spike Manifest Runtime Canonical Cutover

**Status:** COMPLETED
**Last Updated:** 2026-03-06

---

## Purpose

This workplan defines the first Spike code/spec gap-closure slice after the
legacy repo retirement.

The customer-facing goal is simple:

1. Spike installs as a normal hosted Nex app package.
2. The runtime accepts the canonical manifest contract documented in
   `NEX_APP_MANIFEST_AND_PACKAGE_MODEL.md`.
3. Spike's package manifest uses that same contract without a private
   compatibility dialect.

This is a hard cutover. The old object-form `services` shape, manifest-declared
service `port`, manifest-declared service `protocol`, and object-form
`healthCheck` are removed from the active runtime/app contract.

---

## Current Drift

The active canonical spec says:

- `services` is an array of service descriptors
- each service has an explicit `id`
- runtime allocates service ports
- service `protocol` is not authored in the manifest
- `healthCheck` is an optional path string

The live runtime code in `nex/src/apps` still enforces the deprecated shape:

- `manifest.ts` validates `services` as an object map
- `service-manager.ts` expects `serviceConfig.port`
- `service-dispatch.ts`, `runtime-handlers.ts`, and `management-api.ts` all
  inspect object-form `services`
- `apps/spike/app/app.nexus.json` still ships the deprecated object-form
  service declaration

That means the active spec is currently not a faithful description of the live
runtime or the live Spike package.

---

## Target State

After this cutover:

1. `nex` accepts only canonical array-form `services`.
2. Service descriptors use:
   - `id`
   - `command`
   - optional `args`
   - optional `env`
   - optional string `healthCheck`
3. Runtime-owned service lifecycle allocates the listening port internally and
   supplies it through templated args/env.
4. Spike declares its service manifest in the same canonical form.
5. Focused tests prove the runtime accepts the new contract and rejects the old
   one.

---

## Implementation Scope

### Runtime

Update the Nex app runtime contract in:

- `nex/src/apps/manifest.ts`
- `nex/src/apps/service-manager.ts`
- `nex/src/apps/service-dispatch.ts`
- `nex/src/apps/runtime-handlers.ts`
- `nex/src/apps/management-api.ts`

Required behavior:

1. `services` is validated as an array.
2. Each service requires a unique string `id`.
3. `port` and `protocol` are no longer valid manifest fields.
4. `healthCheck` is validated as a string when present.
5. Service startup iterates the array and allocates a runtime port for every
   service.

### Spike

Update:

- `apps/spike/app/app.nexus.json`

Required behavior:

1. Rewrite the service declaration to canonical array form.
2. Remove `port` and `protocol`.
3. Rewrite `healthCheck` to the canonical string form.

### Tests

Update or add focused tests in:

- `nex/src/apps/manifest.test.ts`
- `nex/src/apps/runtime-handlers.test.ts`

Required coverage:

1. canonical service arrays validate successfully
2. object-form `services` is rejected
3. missing service `id` is rejected
4. service-backed method handlers still resolve the primary service correctly

---

## Explicit Non-Goals

This slice does not yet:

- rename Spike domain identifiers from `tree_id` to `index_id`
- normalize Spike callback/webhook paths
- redesign broker/session ownership
- add adapter dependency wiring or multi-service method routing

Those remain separate gap-closure slices after the manifest/runtime contract is
truthful.

---

## Validation

Minimum validation for this cutover:

1. focused `vitest` coverage for manifest/runtime handler behavior
2. successful manifest parsing/validation for `apps/spike/app/app.nexus.json`
3. no remaining runtime code paths in `nex/src/apps` that assume object-form
   `services`

## Completion Notes

Completed on 2026-03-06.

Validated by:

1. focused `vitest` coverage for `nex/src/apps`
2. successful validation of Spike's canonical service-array manifest
3. direct confirmation that the runtime parser/service manager reject manifest
   `port` and `protocol`
