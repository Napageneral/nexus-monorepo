# FSHC-003 Docker Executor Wrapper And Proof Bundle Contract

## Goal

Wrap the hosted Frontdoor smoke lanes in Docker so the executor is isolated and
proof bundles are mounted out deterministically.

## Acceptance

1. hosted cleanroom suites run from Docker by default
2. proof artifacts are mounted outside the container
3. host ambient auth is not required
4. the wrapper is reusable across app and adapter hosted suites

## Status

Completed.

The default Frontdoor hosted cleanroom capture wrappers now run through
`frontdoor-cleanroom-docker-executor.sh`, which:

1. builds or reuses a dedicated Frontdoor executor image
2. runs the hosted proof command inside Docker instead of the host shell
3. mounts only the cleanroom proof bundle root
4. rewrites localhost Frontdoor origins for the container boundary
5. requires explicit `FRONTDOOR_SMOKE_API_TOKEN`
6. supports the shared package, app, and adapter hosted smoke lanes

The active wrapper-backed entrypoints are:

1. `pnpm smoke:docker:fresh-server-package-lifecycle`
2. `pnpm smoke:docker:fresh-server-one-server-multi-app`
3. `pnpm smoke:docker:fresh-server-adapter-cleanroom`
4. `pnpm smoke:capture:fresh-server-multi-app`
5. `pnpm smoke:capture:fresh-server-adapter-cleanroom`

## Validation

1. shell syntax validation for the Docker executor and capture wrappers
2. package manifest validation for the new script entrypoints
3. one real Docker dry run proving:
   - image build
   - explicit env injection only
   - localhost origin rewrite to `host.docker.internal`
   - proof bundle mount at `/proof-bundle`
