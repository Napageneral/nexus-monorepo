# Attribution Golden Journey Board

This board tracks the cleanroom-first end-to-end proof lane for the MoonSleep
attribution port.

It is not a replacement for the adapter parity boards, the web-signals board,
or the attribution app board.

Those boards built and validated the pieces. This board proves the whole system
as one golden journey in the sandbox-managed cleanroom model.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/web-signals-control-plane-and-web-adapter-family.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/validation/attribution-intelligence-click-to-outcome-proof-ladder.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-adapter-packages-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/web-signals-and-web-adapters-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-intelligence-app-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/golden-journey-validation-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/real-adapter-golden-journey-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/real-adapter-validation-profiles-and-cleanroom-projection.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/sandbox-managed-validation-campaigns-and-fresh-server-provisioning.md`

Scope:

- define one attribution-specific golden-journey validation profile
- run the proof in a fresh Nex server inside a sandbox-managed cleanroom
- explicitly project the installable adapters and apps into that cleanroom
- explicitly project the real MoonSleep connections and credentials into that
  cleanroom by reference
- bind one review-safe website resource set for first-party tracking proof
- install `web-signals` and `attribution` together
- backfill the relevant acquisition and backend inputs inside the cleanroom
- drive a browser-led first-party journey and prove row-level inspection in the
  operator UI
- close the remaining cross-provider validation gap for the attribution stack

Out of scope:

- hosted Frontdoor proof as the default lane
- live local runtime dogfood as the primary proof
- Google Business Profile, which is not part of the MoonSleep attribution core
- inventing a second validation substrate outside the existing cleanroom model

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

Completed:

1. `AGJV-001`
2. `AGJV-002`
3. `AGJV-003`
4. `AGJV-004`
5. `AGJV-005`
6. `AGJV-006`
7. `AGJV-007`
8. `AGJV-008`

Latest passing proof:

- durable latest: `/Users/tyler/nexus/state/artifacts/validation/attribution-golden-journey/golden-journey-proof-latest.json`
- durable pinned current rerun: `/Users/tyler/nexus/state/artifacts/validation/attribution-golden-journey/golden-journey-proof-20260405T210911Z.json`
- cleanroom proof bundle: `/Users/tyler/nexus/state/sandboxes/0b7a2289-3fca-4c24-9a25-260c47eb6bfa/artifacts/validation/attribution-golden-journey-shadow-refresh-20260405c/20260405T210911Z`
- bootstrap bundle: `/Users/tyler/nexus/state/sandboxes/0b7a2289-3fca-4c24-9a25-260c47eb6bfa/artifacts/validation/attribution-golden-journey-shadow-refresh-20260405c-bootstrap/20260405T210749Z`
- validation doc: `/Users/tyler/nexus/home/projects/nexus/docs/validation/attribution-golden-journey-validation.md`

Latest scope note:

- the current 2026-04-05 rerun is the rollout-readiness proof for the blocking
  MoonSleep paid core:
  `meta-ads`, `google-ads`, `tiktok-business`, `shopify`, `web-journey`,
  `web-signals`, and `attribution`
- `tiktok-display` is intentionally excluded from that rerun through
  `AGJV_INCLUDE_TIKTOK_DISPLAY=0`
- the earlier 2026-04-01 proof remains the retained historical full-surface
  proof including `tiktok-display`

Resolved blocker:

- the earlier “runtime crash” in this lane was a sandbox bootstrap exec hang,
  not a fresh runtime death during provider ingest
- `capture-cleanroom-proof.sh` wrapped the bootstrap command with
  process-substitution `tee` pipes
- the detached sandbox runtime inherited those extra pipe descriptors from
  `fresh-nex-bootstrap-sandbox.sh`, which kept the `tee` processes alive and
  prevented the enclosing `sandboxes.exec` from ever seeing completion
- the bootstrap launcher now starts the detached runtime through an exec shim
  that closes inherited file descriptors before `exec node nexus.mjs runtime run`
- `sandboxes.destroy` and sandbox exec repair were also hardened in the core
  runtime so stale containers and orphan running exec rows are cleared

Latest launcher posture:

- the latest rerun exited cleanly with `recovered_from_artifact=false`
- `transport_error=null`

## Execution Order

The default sequence for this board is:

1. lock the attribution validation profile and proof contract
2. project the exact package artifacts into the cleanroom
3. project the named MoonSleep connections and credential references into the
   cleanroom
4. choose and bind the review-safe website proof resource set
5. run full adapter backfill and freshness checks inside the cleanroom
6. drive the browser-led website and handoff journey
7. inspect the attribution UI and row-level evidence in the same proof run
8. publish one durable proof corpus that closes the cross-provider gap
