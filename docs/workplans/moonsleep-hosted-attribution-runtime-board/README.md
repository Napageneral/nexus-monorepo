# MoonSleep Hosted Attribution Runtime Board

This board tracks the promotion of the MoonSleep attribution stack from local
cleanroom proof to a dedicated Frontdoor-managed MoonSleep runtime on Hetzner
before any real `https://www.moonsleep.co` shadow deployment.

This is the current goal.

The local sandbox-managed cleanroom lane already proved that the MoonSleep
attribution stack works end to end. The next milestone is to stand up the same
stack on a durable hosted runtime, backfill real MoonSleep data there, verify
monitor freshness over time, and only then point the real MoonSleep website at
that hosted collector.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/validation/attribution-golden-journey-validation.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/validation/moonsleep-live-shadow-rollout-runbook.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/validation/moonsleep-hosted-attribution-runtime-runbook.md`
- `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/runbooks/platform/prod-runtime-package-deployment-procedure.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/web-signals-control-plane-and-web-adapter-family.md`

Scope:

- provision one dedicated MoonSleep hosted Nex runtime through Frontdoor on
  Hetzner
- install the blocking MoonSleep attribution packages there:
  `meta-ads`, `google-ads`, `tiktok-business`, `shopify`, `web-journey`,
  `web-signals`, `attribution`
- connect the real MoonSleep upstreams on that hosted runtime
- complete full backfills and establish freshness baselines there
- prove safe shadow-site browser and collector flow against that hosted runtime
- prove live-monitor continuity there before using it for the real MoonSleep
  production website shadow window

Out of scope:

- Google Business Profile
- immediate live-site cutover or replacement of MoonSleep's existing tracking
- `tiktok-display` as a blocker for the MoonSleep paid-core shadow lane
- using a local cleanroom plus tunnel as the long-running production-shadow
  environment

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

In Progress:

1. `MHAR-007`

Not Started:

1. `MHAR-008`

Completed:

1. `MHAR-001`
2. `MHAR-002`
3. `MHAR-003`
4. `MHAR-004`
5. `MHAR-005`
5. `MHAR-006`

## Current Hosted Runtime

Current retained hosted MoonSleep runtime:

- server id: `srv-1c4b077a-1f2`
- tenant id: `t-e86786c3-537`
- runtime base URL: `https://t-e86786c3-537.nexushub.sh`

Current installed package set:

- adapters:
  `meta-ads`, `google-ads`, `tiktok-business`, `shopify`, `web-journey`
- apps:
  `web-signals`, `attribution`

Current hosted proof artifacts:

- runtime setup summary:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime/moonsleep-hosted-runtime-setup-2026-04-05.json`
- hosted demo browser proof:
  `/Users/tyler/nexus/home/projects/state/artifacts/validation/moonsleep-hosted-demo-shadow-browser/demo-shadow-2026-04-06T01-07-12-200Z/browser-proof.json`
- hosted prod-origin preflight:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime/moonsleep-prod-shadow-preflight-2026-04-06T01-09-27-908Z.json`
- latest hosted snapshot baseline:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-snapshots/moonsleep-shadow-snapshot-latest.json`

Current reality:

- hosted package install is working
- hosted adapter connections are working and records are flowing
- hosted collector CORS now allows:
  - `https://moonsleep-attribution-demo.vercel.app`
  - `https://moonsleep-attribution-shadow.vercel.app`
  - `https://www.moonsleep.co`
- safe hosted browser proof is green
- real `https://www.moonsleep.co` prod-origin preflight is green
- hosted attribution baseline now exists after explicit replay
- hosted soak is still the remaining open gating work before the real MoonSleep
  website deploy
- that soak is currently blocked on
  `/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-live-sync-efficiency-board/README.md`
  because the hosted tenant runtime is too slow under current adapter live-sync
  load

## Goal State

The hosted MoonSleep attribution runtime is only considered ready when all of
the following are true:

1. Frontdoor provisions a dedicated MoonSleep runtime on Hetzner and runtime
   health is stable.
2. The blocking package set installs there through the canonical hosted package
   seams.
3. Meta Ads, Google Ads, TikTok Business, and Shopify are connected there with
   real MoonSleep credentials.
4. Full backfills converge there and the attribution app materializes the same
   core facts the cleanroom lane already proved.
5. The hosted `web-signals` / `web-journey` collector accepts a safe MoonSleep shadow-site
   run and the attribution UI renders the resulting scope correctly.
6. The hosted runtime survives a meaningful monitor/freshness window before the
   real `https://www.moonsleep.co` site is pointed at it.

## Execution Order

1. lock the hosted MoonSleep target, proof contract, and package set
2. verify the package release and hosted install boundary is ready for the full
   MoonSleep stack
3. provision one dedicated Frontdoor-managed MoonSleep runtime on Hetzner
4. install the blocking packages and prove runtime convergence
5. connect MoonSleep upstreams and run full backfills
6. create the hosted website installation and prove the safe shadow site
   against it
7. soak the hosted runtime long enough to trust live monitors and freshness
8. only then enable the real MoonSleep production website shadow window

## Relationship To Other Boards

- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-golden-journey-board/README.md`
  remains the local cleanroom readiness proof for the stack
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/moonsleep-shadow-attribution-rollout-board/README.md`
  is now downstream of this board and should not be treated as ready for real
  production website enablement until this hosted board reaches the website and
  soak milestones
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-live-sync-efficiency-board/README.md`
  is the active blocking lane for the hosted soak and side-by-side readiness
