# Package Release And Publish Smoke Test Ladder

## Customer Experience

The package system is only credible if a package author can expect this to work cleanly:

1. a package validates as package-shaped
2. a release artifact is built without bespoke manual steps
3. the artifact publishes into Frontdoor without mutating the real registry
4. the published record is queryable and structurally correct
5. failures are isolated to the package that failed, not hand-waved away as platform drift

The user-facing bar for this ladder is:

1. every discovered package root is exercised
2. the smoke test uses one controlled Frontdoor store
3. hosted cleanroom smoke can prove a released package on a fresh Frontdoor-created server
4. only failing packages are patched
5. after fixes, the same ladder reruns to green

## Scope

This ladder targets every package root discovered by:

- `packages/scripts/discover-package-roots.py`

That currently includes:

1. app package roots under `packages/apps/*`
2. adapter package roots under `packages/adapters/*`

## Hard Rules

1. No backwards compatibility layer.
2. No package-specific publish logic outside the existing shared package and Frontdoor tooling.
3. The controlled publish target must not be the live Frontdoor store.
4. Failures are fixed only where they occur.
5. The same shared ladder must be rerunnable after each fix.
6. Hosted live smoke should prefer a fresh Frontdoor-created server rather than an already-lived-in server.

## Controlled Publish Target

The controlled publish target is a temporary Frontdoor SQLite database passed with:

- `--frontdoor-db <abs-path>`

This allows real publication writes through the existing Frontdoor publishing scripts without touching the default registry path.

## Release Ladder

For each discovered package root:

1. run the package-local `scripts/package-release.sh`
2. require a `dist/<package-id>-<version>.tar.gz` artifact unless the package release path documents a different produced tarball name
3. record:
   - package id
   - package kind
   - package root
   - artifact path
   - release exit status
   - stderr/stdout

If a package fails here, stop publish for that package and classify the failure as one of:

1. validation failure
2. build failure
3. packaging failure
4. artifact naming/path mismatch

## Publish Ladder

For each package that released successfully:

1. call `packages/scripts/publish-package.sh <package-root> --frontdoor-db <controlled-db>`
2. capture the returned JSON
3. verify Frontdoor now contains:
   - package row
   - package release row
   - package release variant row
4. for apps, verify product sync completed successfully

If a package fails here, classify the failure as one of:

1. manifest/product sync failure
2. tarball path mismatch
3. Frontdoor publish script failure
4. Frontdoor store consistency failure

## Hosted Cleanroom Ladder

For packages that need real hosted proof, continue with the shared hosted
cleanroom wrapper:

- `packages/scripts/hosted-cleanroom-package-smoke.py`

The canonical hosted cleanroom flow is:

1. release the package from its package root
2. optionally publish it through the existing shared Frontdoor publish path
3. provision a fresh server through Frontdoor
4. run package install and runtime smoke on that fresh server
5. destroy or archive the server as cleanup

For durable proof capture, prefer the shared wrapper:

- `packages/scripts/capture-hosted-cleanroom-package-smoke.sh`

The green bar is:

1. the package releases successfully
2. hosted smoke runs on a fresh Frontdoor-created server
3. app installs launch and runtime-token-authenticated runtime health and
   catalog proof pass, or adapter installs converge and runtime-token-authenticated
   runtime health passes
4. cleanup succeeds and the server does not remain stranded by default

## Fix Policy

Only fix packages that fail the ladder.

Allowed fixes:

1. package release wrapper corrections
2. package manifest corrections
3. package artifact path corrections
4. shared publish script issues discovered by real package failures
5. Frontdoor publish path issues that block valid packages

Not allowed:

1. speculative cleanup of packages that already pass
2. unrelated repo cleanup
3. introducing alternate transitional publish paths

## Validation

Success requires all of the following:

1. package root discovery succeeds
2. every discovered package root passes release
3. every released package publishes into the controlled Frontdoor DB
4. the controlled Frontdoor DB contains the expected package, release, and variant records
5. hosted cleanroom smoke passes for the packages being actively certified for hosted operation
6. a rerun after fixes remains green

## Deliverables

This ladder produces:

1. one shared batch release smoke-test script
2. one shared batch publish smoke-test script
3. one controlled Frontdoor DB for the smoke run
4. a per-package result summary for release and publish
5. one shared hosted cleanroom smoke wrapper for fresh-server package proof
6. optional cleanroom proof bundles with command, stdout, stderr, and result metadata
7. only the minimal package/shared fixes required to make the ladder pass
