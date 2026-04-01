# EVP-010 Sandboxed Cleanroom Method-Surface Projection For Eve

## Goal

Prove that a fresh sandboxed `nex-core` cleanroom used for Eve validation can
expose `imessage.send` through its authz taxonomy and method surface once the
Eve adapter package is installed into the runtime package surface.

## Scope

- cleanroom package projection for the Eve adapter
- authz taxonomy visibility for `imessage.send`
- method-catalog visibility for the installed Eve package
- routed `imessage.send` execution from the sandboxed runtime
- watcher-confirmed durable reconciliation of the routed send

## Non-Goals

- private-API parity work
- multi-account proof with a second identity
- bypassing the runtime method surface by calling the edge binary directly
- changing Eve's AppleScript executor behavior

## Why This Exists

The cleanroom pair-up proved the edge-to-core data plane, but a fresh sandboxed
runtime booted without Eve package projection still could not route
`imessage.send` through its authz taxonomy even though the paired edge was
healthy. That makes the runtime surface incomplete for operator validation.

## Acceptance

- a fresh cleanroom runtime installs or projects the Eve adapter package into
  its runtime package surface
- the cleanroom runtime exposes `imessage.send` in its authz taxonomy and
  adapter method surface
- a cleanroom-routed `imessage.send` call succeeds against the paired edge
- watcher-confirmed canonical records prove durable outbound truth for that
  routed send

## Validation

- explicit cleanroom package-install or package-projection transcript
- method-catalog and authz-taxonomy proof from the cleanroom runtime
- timestamped routed-send proof through `imessage.send`
- paired-edge health proof before and after the routed send
- `git diff --check`

## Outcome

Completed on 2026-03-31.

- `adapters.methods` exposed Eve as `registered` with:
  `imessage.message.edit`, `imessage.message.unsend`, `imessage.reaction.add`,
  `imessage.reaction.remove`, `imessage.reply`, `imessage.send`,
  `imessage.thread.create`, `imessage.thread.participants.add`,
  `imessage.thread.participants.remove`, `imessage.thread.rename`, and
  `records.backfill.stage`
- `orientation.taxonomy` included `imessage.send`
- A real cleanroom-routed `imessage.send` succeeded against the paired edge and
  later appeared in canonical cleanroom records

This ticket is closed by the same cleanroom proof bundle as `EVP-009`:

- bootstrap bundle:
  `/Users/tyler/nexus/state/sandboxes/fd783de5-ce7e-49cc-a770-a3da08b61ea3/artifacts/validation/eve-installed-method-routing-live/20260331T233345Z`
- routed-send bundle:
  `/Users/tyler/nexus/state/sandboxes/fd783de5-ce7e-49cc-a770-a3da08b61ea3/artifacts/validation/eve-installed-method-routing-live/20260331T233504Z`
