# MHAR-006 Hosted Website Installation And Shadow Site Proof

## Goal

Create the hosted `website-input` installation for MoonSleep and prove the safe
shadow site against the hosted collector before using the real MoonSleep
website.

## Scope

- hosted collector allowlist and website installation
- fresh sender token
- safe shadow-site env gate
- browser-led proof against the hosted collector
- attribution UI review for the hosted MoonSleep scope

## Acceptance

1. the safe MoonSleep shadow site sends events to the hosted collector
2. the full website-to-checkout chain is visible on the hosted runtime
3. the attribution app reads that hosted scope successfully
4. no local tunnel or local-only collector dependency remains in the proof path

## Findings

Hosted website-input installations created:

- safe shadow site:
  `c65523a0-5cb9-4564-bdc5-b740abade563`
- demo shadow site:
  `1d64a0ae-78eb-4951-8cb2-a5dc3e862813`
- real `https://www.moonsleep.co` prod-shadow:
  `d6938cce-7180-4a76-8727-c8666d5a03e3`

Hosted browser-side proof is green:

- demo browser proof:
  `/Users/tyler/nexus/home/projects/state/artifacts/validation/moonsleep-hosted-demo-shadow-browser/demo-shadow-2026-04-06T01-07-12-200Z/browser-proof.json`
- real prod-origin preflight:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime/moonsleep-prod-shadow-preflight-2026-04-06T01-09-27-908Z.json`

Collector allowlist now explicitly permits:

- `https://moonsleep-attribution-demo.vercel.app`
- `https://moonsleep-attribution-shadow.vercel.app`
- `https://www.moonsleep.co`

This closes the hosted website proof lane. The remaining open work is hosted
materialization and soak, not browser transport.
