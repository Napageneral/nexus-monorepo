# Web Signals Control-Plane Validation

## Purpose

This document defines the active validation ladder for the `web-signals`
control-plane app.

It proves the control plane works as a control plane.
It does not replace the `web-journey` adapter validation ladder.

## Proof Lanes

### 1. Package and hosted lifecycle proof

Prove:

1. manifest validates
2. build and local tests pass
3. release packaging succeeds
4. the app installs and becomes healthy on a cleanroom or hosted runtime

### 2. Installation and token proof

Prove:

1. `web-signals.installations.create` creates a new `web_installation_id`
2. a sender token is minted and bound to the installation
3. `web-signals.installations.get` and `list` return truthful installation
   state
4. `web-signals.installations.rotate` rotates the active token without
   confusing installation identity

### 3. Adapter binding proof

Prove:

1. installation creation or rotation creates or refreshes the `web-journey`
   adapter connection
2. the bound connection id is stored against the installation
3. the control plane can start the adapter serve session successfully

### 4. Trust-termination proxy proof

Prove:

1. a sender-token-authenticated browser payload can reach
   `web-signals.web-journey.collect`
2. `web-signals` rejects a payload whose explicit installation id does not
   match the sender-token binding
3. the forwarded payload reaches `web-journey` in canonical shape
4. canonical records materialize through the adapter path rather than an
   app-owned shadow path

### 5. QA inspection proof

Prove:

1. `web-signals.events.list` reads records emitted by `web-journey`
2. `web-signals.events.get` returns one installation-scoped event truthfully
3. the QA view shows the ingested event fields needed for operator inspection

## Review Evidence

The review bundle should include:

- installation creation output
- token issuance output
- adapter binding output
- one successful trusted collect path
- one rejected mis-bound collect path
- one QA read proving records-backed inspection

## Related Validation

This app-level validation is paired with:

- `web-journey` install/connect and live-collect proof
- family-level hosted and cleanroom proofs
- consuming-app proof through `attribution`
