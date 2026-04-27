# Web Signals Control-Plane App

## Purpose

`web-signals` is the shared control-plane app for Nex web-signal
installations.

It exists to give one durable installation and trust model to multiple web
source adapters without collapsing those adapters into one hybrid package.

## Package Subtype

- package subtype: `app`
- package role: control plane for the web-signal family

## What This App Owns

`web-signals` owns:

- `web_installation_id` lifecycle
- installation listing, lookup, and rotation
- sender-token issuance and rotation
- origin and runtime bootstrap configuration
- enablement and binding of adapter connections per installation
- operator-facing QA reads over ingested web records

## What This App Does Not Own

`web-signals` does not own:

- canonical journey-event normalization
- canonical RUM-event normalization
- adapter connection health semantics for a signal family
- attribution logic
- ad-platform ingest
- backend outcome truth

Those belong to source adapters such as `web-journey` and `web-rum`, and to
consuming apps such as `attribution`.

## Control-Plane Proxy Rule

`web-signals` may expose browser-facing collector entrypoints only as a
trust-termination proxy.

That means:

1. `web-signals` validates sender-token binding and installation scope
2. `web-signals` enforces installation trust before forwarding
3. the forwarded payload preserves the source adapter's canonical contract
4. the source adapter remains the owner of source truth

`web-signals` must not:

1. define a second competing normalization model for the same source family
2. redefine source-family vocabulary
3. claim ownership of the canonical source contract

## Current Proxy Surface

The supported proxy surface today is:

- `web-signals.web-journey.collect`
- `web-signals.web-journey.collect.batch`

These methods exist so the control plane can terminate trust through the shared
installation model while routing canonical `web-journey` payloads into the
`web-journey` adapter.

They are not the canonical source contract themselves.

## Runtime Contract

One `web_installation_id` may bind multiple web-signal adapters.

Today, `web-signals` creates and maintains the adapter binding for
`web-journey` by:

- minting the sender token
- creating or updating the `web-journey` adapter connection
- starting the adapter serve session
- routing validated browser payloads into that adapter connection

The app then reads records back through Nex to provide installation-scoped QA
inspection.

## QA And Inspection Model

`web-signals` does not keep a competing canonical event ledger.

Its QA surface reads the canonical ingested records emitted by the installed
adapter family and filters them by `web_installation_id`.

That keeps the control plane adjacent to, but not in place of, the adapter
truth path.

## Dependencies

`web-signals` depends on:

- the Nex app runtime surface
- runtime token issuance
- entity creation for sender identity
- adapter connection creation and serve invocation for `web-journey`
- records reads for QA inspection

## Related Canon

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/web-signals-control-plane-and-web-adapter-family.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/source-adapters-control-plane-and-proof-standard.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/apps-adapters-and-method-surfaces.md`
