# HCI-002 Multi-App Hosted Fresh-Server Suite

## Goal

Build and prove one reusable fresh-server hosted suite that can install and
launch a representative app set through real Frontdoor and runtime seams from a
Docker-backed executor against a sandbox-backed hosted target while emitting a
durable cleanroom proof bundle.

## Initial Targets

- Glowbot
- Spike
- Aix
- Dispatch

## Current Status

The reusable harness is now landed:

- fresh-server create/read/cleanup is shared in `frontdoor-smoke-lib.mjs`
- the multi-app entrypoint is
  `frontdoor-fresh-server-one-server-multi-app-smoke.mjs`
- the suite now validates the minted runtime token against runtime health and
  runtime app inventory instead of relying only on the Frontdoor shell session
- every requested app must now appear in runtime inventory, not just the
  aggregate count
- optional `FRONTDOOR_SMOKE_APP_PROOF_COMMAND` can layer per-app proof on top
  of the shared fresh-server lane
- proof capture is available through
  `capture-frontdoor-fresh-server-multi-app-smoke.sh`

The registry/bootstrap substrate slice is landed. What remains is the actual
sandbox provider backend plus Docker executor wrapping so the executor and
target are both isolated. The current fresh-server helper is the inner proof
command that will run inside that substrate, not the final executor boundary by
itself.

## Acceptance

1. one reusable Docker-backed command provisions a fresh sandbox-backed hosted
   target through Frontdoor and emits a cleanroom proof bundle for a
   representative app set
2. app install, launch, and per-requested-app runtime inventory are validated
   through real hosted routes
3. cleanup leaves no stranded server by default
4. board and validation docs point at the same command and proof path
5. durable proof output is discoverable at
   `~/nexus/state/artifacts/validation/cleanroom/frontdoor-fresh-server-multi-app/latest/`
   unless `NEXUS_CLEANROOM_PROOF_ROOT` overrides it

## Validation

- syntax checks for the new frontdoor scripts
- `git diff --check`
- pending migration to the Docker-executed sandbox-hosted substrate and then
  cleanroom proof capture there
