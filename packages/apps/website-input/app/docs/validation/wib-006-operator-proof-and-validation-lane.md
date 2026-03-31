# WIB-006 Operator Proof And Validation Lane

## Purpose

Define the repeatable proof path that validates a customer website install of
`website-input`.

This lane is the operator standard for answering:

- did the browser sender install correctly
- did the collector receive the canonical event contract
- did the install preserve attribution evidence
- did the bridge path work when the site has a handoff surface

## Inputs

- one installed `website_installation_id`
- a site environment: custom code, Wix, or GTM
- one known test URL that can carry UTMs and click identifiers
- one known CTA or funnel surface to trigger
- one expected handoff surface if bridge validation is in scope

## Required Proof Steps

1. Load the test URL with explicit attribution evidence in the query string.
2. Confirm `browser_id` and `session_id` are present when consent allows.
3. Trigger at least one canonical baseline event such as `page_view`,
   `content_view`, or `cta_click`.
4. Confirm the event payload includes `event_id`, `captured_at`,
   `consent_state`, `website_installation_id`, page identity, and source
   evidence when available.
5. If the site has a handoff surface, trigger it and confirm the bridge fields
   are preserved explicitly.
6. Re-send the same event once and confirm dedupe works at
   `website_installation_id + event_id`.
7. Verify the collector returns a durable acceptance response or a clear
   validation failure.

## Custom-Code Sites

For sites like MoonSleep-style custom code:

- validate on a staging or preview URL first
- attach the sender in the app shell or root layout
- confirm route changes do not rotate `session_id` inside the same visit
- confirm the proof path reaches the collector without ad hoc event naming

## Wix Sites

For Wix:

- validate only on a published site with the correct install mode
- distinguish baseline capture from bridge-quality validation
- if the site uses Wix Bookings or another controlled handoff, require the
  platform-specific bridge lane before calling the install complete
- fail the install if the chosen Wix path cannot preserve the required bridge
  identifiers

## Retained Artifacts

The validation lane should retain:

- the test URL used for proof
- the observed event payloads
- the collector acceptance summary
- screenshots or exported logs when the platform makes that easier
- the bridge evidence sample, if applicable

The package-local proof fixture is:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/app/scripts/run-proof-fixture.mjs`

It writes retained package-level artifacts to:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/app/docs/validation/artifacts/latest-proof.json`

## Pass Criteria

The proof passes only when:

- canonical events arrive under one installation scope
- attribution evidence is preserved when observed
- bridge fields are explicit when a handoff exists
- duplicate replays are deduped cleanly
- the operator can explain the install result without reading raw browser logs

## Fail Criteria

The proof fails when:

- events are arriving under the wrong installation scope
- the site is emitting a second event vocabulary
- bridge identifiers are missing or buried in free-form metadata
- the site cannot support the selected install mode
- duplicate ownership exists between pixel paths or bridge paths
