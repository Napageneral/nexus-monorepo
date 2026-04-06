# MHAR-007 Hosted Live Monitor Soak And Side-By-Side Readiness

## Goal

Observe the hosted MoonSleep runtime long enough to trust it as the real shadow
comparison environment.

## Scope

- adapter live-monitor continuity
- freshness drift checks
- attribution pipeline continuity
- repeated hosted snapshots over time
- explicit go or no-go for real MoonSleep production website shadowing

## Acceptance

1. the hosted runtime stays healthy over the soak window
2. the blocking adapter lanes continue to ingest or remain fresh there
3. repeated hosted snapshots show stable attribution app behavior
4. the operator has enough evidence to trust the hosted runtime for the real
   `12h` production comparison window

## Starting Point

The soak now begins from a hosted runtime that already has:

- dedicated retained server:
  `srv-1c4b077a-1f2`
- green hosted demo browser proof:
  `/Users/tyler/nexus/home/projects/state/artifacts/validation/moonsleep-hosted-demo-shadow-browser/demo-shadow-2026-04-06T01-07-12-200Z/browser-proof.json`
- green hosted real prod-origin preflight:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime/moonsleep-prod-shadow-preflight-2026-04-06T01-09-27-908Z.json`
- converged hosted baseline snapshot:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-snapshots/moonsleep-shadow-snapshot-2026-04-06T01-15-44-322Z.json`

## Soak Focus

1. repeat hosted snapshots over time against `moonsleep-prod-shadow`
2. confirm adapter freshness and monitor continuity do not regress
3. confirm attribution summary and outcome attribution counts remain stable or
   evolve explainably
4. decide whether the real `https://www.moonsleep.co` env-gated shadow deploy
   can proceed
