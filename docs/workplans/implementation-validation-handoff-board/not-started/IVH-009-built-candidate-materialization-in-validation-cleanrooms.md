# IVH-009 Built Candidate Materialization In Validation Cleanrooms

## Goal

Teach the validation runner to install and execute build-backed candidate
artifacts inside fresh cleanrooms.

## Scope

- materialize installable runtime bundles or container images in validation
  cleanrooms
- launch the candidate runtime from the built artifact rather than from the
  source tree
- keep adapter, connection, and credential projection intact
- preserve the same recording and proof-bundle behavior used for
  source-snapshot proof

## Acceptance

- validation can run from a build-backed candidate artifact in a fresh
  cleanroom
- the runner no longer depends on a source-tree install path for signoff proof
- the same profile-backed real-adapter journey works against the built
  candidate

