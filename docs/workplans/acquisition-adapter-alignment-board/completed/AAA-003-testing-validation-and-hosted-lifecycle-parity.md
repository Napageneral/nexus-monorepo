# AAA-003 Testing Validation And Hosted Lifecycle Parity

## Goal

Bring `google-ads` and `meta-ads` testing and validation docs up to the same
package-contract and hosted-lifecycle bar as the newer canonical adapters.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/acquisition-adapter-package-alignment.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-author-experience.md`
- `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md`

## Current Gap

- `google-ads` testing and validation docs are thinner than the newer package
  family
- `google-ads` validation does not currently put the shared hosted lifecycle
  gate first
- package-contract checks are not documented at the same level as GitHub,
  Bitbucket, Jira, or Confluence

## Acceptance

1. both packages have active validation ladders that start with the shared
   hosted lifecycle gate
2. both packages have active testing docs that include package-contract checks
3. both packages document the same minimum local build, package, and hosted
   proof ladder
4. active docs no longer rely on archived validation/workplan residue to
   explain current readiness

## Completion Notes

- `google-ads` validation now starts with the shared hosted lifecycle gate and
  uses the same ladder shape as the newer package family
- `google-ads` and `meta-ads` testing guides now include package-contract
  checks and `nexus package validate .`
- both packages now document the same local build, package, and hosted proof
  posture
