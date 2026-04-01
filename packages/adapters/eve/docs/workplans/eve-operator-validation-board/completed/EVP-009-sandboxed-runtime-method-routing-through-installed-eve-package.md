# EVP-009 Sandboxed Runtime Method Routing Through Installed Eve Package

## Goal

Prove a sandboxed `nex-core` can install the Eve adapter package into its own
runtime package surface, then route `imessage.send` through the cleanroom
runtime method catalog to a real paired macOS Eve edge.

## Scope

- cleanroom runtime package install for Eve through the operator package API
- runtime method-catalog visibility for Eve inside the sandbox
- routed `imessage.send` execution from the cleanroom runtime
- watcher-confirmed durable reconciliation of the routed send

## Non-Goals

- private-API parity work
- multi-account proof with a second identity
- bypassing the runtime method surface by calling the edge binary directly

## Why This Exists

The earlier Eve cleanroom proof validated the paired-edge data plane and
canonical record ingest, but it was booted from `nex/` only. That meant the
cleanroom runtime did not have the Eve package installed, so `imessage.send`
could not be exercised truthfully through the runtime method catalog even
though the paired edge itself was healthy.

## Acceptance

- a fresh cleanroom runtime installs Eve through the operator package API
- the cleanroom runtime exposes Eve through its adapter method surface
- a cleanroom-routed `imessage.send` call succeeds against the paired edge
- watcher-confirmed canonical records prove durable outbound truth for that
  routed send

## Validation

- explicit cleanroom package-install transcript
- method-catalog and health proof from the cleanroom runtime
- timestamped routed-send proof through `imessage.send`
- `git diff --check`

## Outcome

Completed on 2026-03-31.

- Fresh cleanroom sandbox:
  `fd783de5-ce7e-49cc-a770-a3da08b61ea3`
- Real paired edge connection:
  `eve-b1076565-229-root`
- Real paired edge session:
  `550ed71c-5a1f-4132-958e-c40adf3a420a`
- Routed send token:
  `EVE INSTALLED METHOD ROUTE PROOF 2026-03-31T23:33:34.529Z 1775000014529`
- Canonical routed-send record ids:
  outbound `imessage:DBEE2342-8D5A-4650-B00C-4FDE44250112`,
  reflected inbound `imessage:EF1F04E7-889A-4213-92E0-C79D0762190D`

The final proof route was:

1. build a Linux Eve release tarball from a disposable package copy
2. bootstrap a fresh `runner-smoke` cleanroom
3. install Eve into the cleanroom runtime through the operator package API
4. pair a real macOS Eve edge into that cleanroom
5. call `imessage.send` through the cleanroom runtime surface
6. confirm durable canonical records through cleanroom `records.list`

One real bug was fixed during this ticket: the paired edge could miss a new
durable `chat.db` row if filesystem-triggered livewatch did not fire after the
send. Eve now runs a low-cost incremental fallback hot sweep so the routed-send
proof is resilient to missed WAL/SHM or modtime events.
