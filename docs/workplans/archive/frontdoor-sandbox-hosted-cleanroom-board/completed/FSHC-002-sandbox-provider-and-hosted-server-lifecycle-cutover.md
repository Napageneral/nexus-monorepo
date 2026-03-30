# FSHC-002 Sandbox Provider And Hosted Server Lifecycle Cutover

## Goal

Add the Frontdoor-side provider and lifecycle substrate needed to provision
disposable sandbox-backed hosted Nex servers while preserving the normal hosted
server contract.

## Scope

- Frontdoor provider abstraction
- server create / ready / archive / destroy lifecycle
- sandbox-backed runtime address and runtime-token assumptions
- bootstrap callback or equivalent authenticated ready signal
- package install compatibility on sandbox-backed hosted targets

## Remaining Gap

Current Frontdoor code supports provider-driven hosted servers, and the
sandbox-backed local validation provider is now landed and proven. The
remaining hosted cleanroom work is no longer in the substrate itself; it is in
the higher-level suites that still need to migrate onto this substrate.

## Completed First Structural Slice

1. remove the hard-wired server-class-to-provider mapping
2. introduce a provider registry so Frontdoor can resolve `sandbox` without
   adding a new customer-facing server class
3. separate provider-neutral hosted bootstrap payload construction from the
   VM-specific cloud-init renderer
4. keep runtime token minting, package install, archive, and destroy semantics
   unchanged from the caller perspective
5. defer recovery-point parity until the basic sandbox-backed lifecycle is
   green

## Acceptance

1. Frontdoor can provision one sandbox-backed hosted server target through the
   normal create/read/token/install lifecycle
2. archive and destroy semantics work for that target
3. runtime token minting and package operator paths stay unchanged from the
   caller perspective
4. hosted cleanroom suites can select this provider without inventing a second
   lifecycle API

## Current Status

This slice is complete.

The landed substrate now:

1. resolves providers through a named registry instead of hard-wiring
   `standard -> hetzner` and `compliant -> aws`
2. passes a provider-neutral hosted bootstrap payload instead of raw VM-only
   cloud-init text
3. creates one disposable sandboxed Nex target per server record
4. phones home through the existing provision callback path
5. maps archive, restore, and destroy onto sandbox lifecycle operations
6. runs hosted proof commands from a Docker-backed executor with an explicit
   auth/env contract
7. supports runtime token mint, runtime health, package purchase, package
   install, app launch, uninstall, and destroy on the sandbox target without a
   second hosted lifecycle API

## Dependencies

- `FSHC-001`

## Validation

- focused Frontdoor provider/lifecycle tests
- one disposable create -> running -> token -> destroy proof on the sandbox
  provider
- Docker executor proof for at least one hosted lane on top of the sandbox
  target

Latest closure proof:

1. local Frontdoor host instance
2. Docker-backed hosted proof executor
3. sandbox-backed hosted target created through the public Frontdoor API
4. real provision callback received
5. runtime token minted through `/api/runtime/token`
6. runtime health passed through the direct sandbox transport selected by the
   cleanroom helper
7. real Spike package release published into the local Frontdoor store as
   `linux/arm64`
8. public app purchase, install, launch, uninstall, and destroy all passed on
   the sandbox-backed hosted target

Follow-on work now belongs to:

1. `FSHC-005` Jira hosted sandbox cleanroom pilot
2. the hosted cleanroom integration board lanes that still need to migrate onto
   this substrate
