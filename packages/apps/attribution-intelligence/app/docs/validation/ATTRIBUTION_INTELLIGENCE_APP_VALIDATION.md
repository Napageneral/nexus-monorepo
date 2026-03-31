# Attribution Intelligence App Validation

Date: 2026-03-31

## Focused Package Proof

- `pnpm dlx vitest run pipeline/processor.test.ts`
- result: passed
- coverage: generic backend outcome materialization beyond Shopify, including
  bridge-driven attribution from website session evidence

## Package Contract Validation

- `nexus package validate /Users/tyler/nexus/home/projects/nexus/packages/apps/attribution-intelligence/app`
- result: `ok: true`

## Cleanroom Proof

- command:
  `./node_modules/.bin/tsx /Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/attribution-app-cleanroom-live.ts`
- retained proof bundle:
  `/Users/tyler/nexus/state/sandboxes/a78393c6-1074-4098-8802-f007b4c19d15/artifacts/validation/attribution-app-install-live/20260331T173351Z/attribution-app-proof-summary.json`

## End-To-End Proof

- umbrella validation doc:
  `/Users/tyler/nexus/home/projects/nexus/docs/validation/attribution-intelligence-click-to-outcome-proof-ladder.md`
- durable promoted artifact:
  `/Users/tyler/nexus/state/artifacts/validation/attribution-intelligence/click-to-outcome-proof-latest.json`
- retained passed bundle:
  `/Users/tyler/nexus/state/sandboxes/271f6890-24e2-4d09-95c0-829f1310678d/artifacts/validation/attribution-click-to-outcome-live/20260331T181451Z/attribution-click-to-outcome-proof-summary.json`

## What The Cleanroom Proved

- the app installs and activates successfully through the package operator
- the app healthcheck reports the dedicated storage boundary
- operators can create one scope and explicit acquisition, backend, and website
  bindings
- manual replay materializes ad facts, web events, session-source facts,
  conversion bridges, business outcomes, and outcome attributions
- app reads succeed for:
  - `attribution.summary`
  - `attribution.ad-facts.list`
  - `attribution.funnel`
  - `attribution.outcomes.list`
  - `attribution.outcomes.get`
  - `attribution.pipeline.status`
- event-driven materialization appends a second paid row and updates summary
  totals without requiring manual replay

## Notes

- the final cleanroom proof recovered from the written artifact after a local
  runtime service restart (`transport_error: service restart`), but the proof
  summary completed successfully and the artifact contains the full passed
  result.
- the full AIL-007 click-to-outcome proof is now the canonical end-to-end
  validation corpus for this app family. The install-lane proof above remains
  useful as package-lifecycle evidence, but it is not the only shipped proof
  surface anymore.
