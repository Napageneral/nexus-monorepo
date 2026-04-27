# AAA-007 Cross-Package Hosted Cleanroom Signoff

## Goal

Close the alignment board with one clean hosted and cleanroom signoff lane
that proves the acquisition adapter set tells one coherent story.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/acquisition-adapter-package-alignment.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/validation/acquisition-adapters-hosted-cleanroom-signoff.md`
- `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-author-experience.md`

## Current Gap

- Google Ads and Meta Ads package alignment work is not yet captured by one
  shared signoff proof lane
- hosted install proof, package-contract proof, provider-native read proof,
  and projection proof are not yet tied together as one closeout step
- execution is blocked on `AAA-004` until the compliant hosted runtime proves
  current adapter-contract parity again

## Acceptance

1. both packages pass the shared hosted lifecycle gate
2. both packages pass package-contract checks and adapter.info contract checks
3. both packages prove representative provider-native read methods in a
   cleanroom lane
4. both packages prove projection/backfill/monitor behavior against the same
   active package shape
5. the active validation corpus links one reviewable signoff path for the
   aligned package set
