# Google Ads Row Parity Board

This board tracks the implementation and validation work needed to bring the
shared Google Ads acquisition surface to the row-shaped attribution contract,
while separating it from unrelated Google Business Profile behavior.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-ads-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/google/docs/specs/ADAPTER_SPEC_GOOGLE.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-intelligence-board/in-progress/AIL-002-moonsleep-parity-matrix-for-core-attribution.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-adapter-packages-board/completed/AAP-003-google-ads-acquisition-surface.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`

Scope:

- isolate the Google Ads acquisition contract from Google Business Profile
- lock the provider access and credential model for Google Ads ingest
- expand the fetch surface to MoonSleep-parity Google Ads row families
- preserve provider rows as immutable arrivals with replay-safe identity
- validate backfill and live monitor behavior against real MoonSleep Google Ads
  credentials in cleanroom

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

Completed:

- `GAP-001`
- `GAP-002`
- `GAP-003`
- `GAP-004`
- `GAP-005`
- `GAP-006`

## Execution Order

The default sequence for this board is:

1. lock the Google Ads package boundary, auth model, and provider access path
2. land the required Google Ads fetch surfaces and row-family builders
3. implement revision-aware record identity and canonical row payload mapping
4. align backfill and monitor around replay-safe immutable arrivals
5. validate against real MoonSleep Google Ads credentials and sampled upstream
   provider rows
6. sync package docs, validation corpus, and signoff

## Proof Artifacts

- retained cleanroom proof:
  `/Users/tyler/nexus/state/sandboxes/ded684e9-16fc-48ea-9ba5-c9adfcb03d2d/artifacts/validation/google-ads-row-parity-live/20260331T031508Z/google-ads-proof-summary.json`
- retained cleanroom result:
  `/Users/tyler/nexus/state/sandboxes/ded684e9-16fc-48ea-9ba5-c9adfcb03d2d/artifacts/validation/google-ads-row-parity-live/20260331T031508Z/result.json`
- stable provider spot-check:
  `/Users/tyler/nexus/state/artifacts/validation/google-ads/provider-spotcheck-stable-20260331T032244Z.json`
