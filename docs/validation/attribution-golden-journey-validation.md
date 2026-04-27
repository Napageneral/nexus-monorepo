# Attribution Golden Journey Validation

This document is the durable closeout for the full MoonSleep attribution port
through the sandbox-managed cleanroom lane under the hard-cut `web-signals` /
`web-journey` family.

It is the local readiness proof, not the final long-running environment for the
real MoonSleep website shadow rollout.

That hosted next step is now tracked in:

- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/moonsleep-hosted-attribution-runtime-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/validation/moonsleep-hosted-attribution-runtime-runbook.md`

Canonical launcher and proof entry:

- `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/attribution-golden-journey-cleanroom-live.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/attribution-golden-journey-proof.ts`

Relevant family canon:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/web-signals-control-plane-and-web-adapter-family.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/source-adapters-control-plane-and-proof-standard.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/web-signals/app/docs/validation/WEB_SIGNALS_CONTROL_PLANE_VALIDATION.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/docs/validation/web-journey-source-adapter-validation.md`

Passing artifact set:

- durable latest:
  `/Users/tyler/nexus/state/artifacts/validation/attribution-golden-journey/golden-journey-proof-latest.json`
- durable pinned current rerun:
  `/Users/tyler/nexus/state/artifacts/validation/attribution-golden-journey/golden-journey-proof-20260405T210911Z.json`
- current cleanroom bundle:
  `/Users/tyler/nexus/state/sandboxes/0b7a2289-3fca-4c24-9a25-260c47eb6bfa/artifacts/validation/attribution-golden-journey-shadow-refresh-20260405c/20260405T210911Z`
- current bootstrap bundle:
  `/Users/tyler/nexus/state/sandboxes/0b7a2289-3fca-4c24-9a25-260c47eb6bfa/artifacts/validation/attribution-golden-journey-shadow-refresh-20260405c-bootstrap/20260405T210749Z`
- historical full-surface proof:
  `/Users/tyler/nexus/state/artifacts/validation/attribution-golden-journey/golden-journey-proof-20260401T010427Z.json`

Review artifacts:

- demo site before CTA:
  `/Users/tyler/nexus/state/sandboxes/0b7a2289-3fca-4c24-9a25-260c47eb6bfa/artifacts/validation/attribution-golden-journey-shadow-refresh-20260405c/20260405T210911Z/screenshots/demo-site-before-cta.png`
- demo site after CTA:
  `/Users/tyler/nexus/state/sandboxes/0b7a2289-3fca-4c24-9a25-260c47eb6bfa/artifacts/validation/attribution-golden-journey-shadow-refresh-20260405c/20260405T210911Z/screenshots/demo-site-after-cta.png`
- attribution UI summary:
  `/Users/tyler/nexus/state/sandboxes/0b7a2289-3fca-4c24-9a25-260c47eb6bfa/artifacts/validation/attribution-golden-journey-shadow-refresh-20260405c/20260405T210911Z/screenshots/attribution-ui-summary.png`
- attribution UI inspector:
  `/Users/tyler/nexus/state/sandboxes/0b7a2289-3fca-4c24-9a25-260c47eb6bfa/artifacts/validation/attribution-golden-journey-shadow-refresh-20260405c/20260405T210911Z/screenshots/attribution-ui-inspector.png`
- demo site trace:
  `/Users/tyler/nexus/state/sandboxes/0b7a2289-3fca-4c24-9a25-260c47eb6bfa/artifacts/validation/attribution-golden-journey-shadow-refresh-20260405c/20260405T210911Z/traces/demo-site-trace.zip`
- attribution UI trace:
  `/Users/tyler/nexus/state/sandboxes/0b7a2289-3fca-4c24-9a25-260c47eb6bfa/artifacts/validation/attribution-golden-journey-shadow-refresh-20260405c/20260405T210911Z/traces/attribution-ui-trace.zip`

Proof scope:

- current rollout-readiness rerun installed and backfilled the blocking MoonSleep
  attribution core in one fresh cleanroom Nex runtime:
  `meta-ads`, `google-ads`, `tiktok-business`, `shopify`
- current rerun also installed and exercised:
  `web-signals`, `web-journey`, `attribution`
- current review-safe public shadow site:
  [moonsleep-attribution-shadow.vercel.app](https://moonsleep-attribution-shadow.vercel.app)
- current website collector tunnel:
  `https://loved-moss-losses-friday.trycloudflare.com`
- `tiktok-display` was intentionally excluded in the 2026-04-05 rerun through
  `AGJV_INCLUDE_TIKTOK_DISPLAY=0` because the MoonSleep production shadow lane
  is validating the paid + website + Shopify attribution core
- the historical 2026-04-01 proof remains the full-surface retained proof for:
  `meta-ads`, `google-ads`, `tiktok-business`, `tiktok-display`, `shopify`

Observed proof outcomes:

- provider ingest passed for the four blocking adapter lanes on current Nex:
  Meta, Google Ads, TikTok Business, and Shopify
- one fresh website installation was created successfully for the current
  shadow-site origin under one `web_installation_id`
- `web-signals` proved installation lifecycle and trust-termination proxy
  routing into `web-journey`
- `web-journey` proved canonical middle-funnel `record.ingest` under the new
  source-adapter contract
- attribution bindings were created for `meta`, `google`, `tiktok`, `shopify`,
  and `website`
- the UI opened successfully and rendered both aggregate views and one
  row-level evidence inspector against the same cleanroom scope
- the launcher returned cleanly with:
  `recovered_from_artifact=false`
  and `transport_error=null`

Selected proof details from the current passing summary:

- Meta records stable: `245`
- Google Ads records stable: `192`
- TikTok Business records stable: `800`
- Shopify records stable: `6388`
- website installation id:
  `679d1eba-b127-48ec-96fe-b69559e685ef`
- UI review:
  `binding_count="5 bindings"`

Latest launcher result:

- `recovered_from_artifact=false`
- `transport_error=null`

Root cause that blocked this lane:

- the earlier blocker was not a provider-specific crash and not a fresh cleanroom
  runtime death during adapter ingest
- the bootstrap command ran under `capture-cleanroom-proof.sh`, which wraps
  stdout and stderr with process-substitution `tee`
- `fresh-nex-bootstrap-sandbox.sh` launched the detached sandbox runtime in a
  way that inherited those extra pipe descriptors
- the runtime process kept the write ends open, the `tee` processes never saw
  EOF, and the outer `sandboxes.exec` looked hung forever even though bootstrap
  had already passed

Fixes that closed the lane:

- `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/fresh-nex-bootstrap-sandbox.sh`
  now starts the detached runtime through a small exec shim that closes
  inherited file descriptors before `exec node nexus.mjs runtime run`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/runtime/domains/sandboxes/service.ts`
  was already hardened to make `sandboxes.destroy` more reliable and to repair
  orphan running `sandbox_execs` rows on startup
- stale sandboxes were destroyed through Nex runtime surfaces before the final
  passing rerun

Residual note:

- the current canonical rerun exits cleanly with no artifact-recovery fallback
- the earlier artifact-recovered run is now superseded by the clean rerun above

Closure:

- this validation closes the golden-journey lane in
  `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-golden-journey-board/README.md`
- this validation also closes the adapter-set acceptance gap in
  `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-adapter-packages-board/completed/AAP-005-cross-provider-validation.md`
