# OCI-001 Docker Image and Boot Infrastructure

## Goal

Create the Docker image and wrapper script that boots nex + serves the console
+ runs Playwright as a browser-proof producer with video recording, tracing,
+ and screenshots.

This ticket is not inventing a console-only proof concept. It is implementing
the first producer that plugs browser review artifacts into the shared
cleanroom proof bundle model.

## Existing Infrastructure (reuse, don't duplicate)

- `nex/scripts/e2e/Dockerfile` — nex build image
- `nex/scripts/e2e/runtime-capability-matrix-cleanroom-docker.sh` — boot pattern
- `nex/src/api/call.ts` — `callRuntime()` for test data seeding
- `nex/scripts/e2e/capture-cleanroom-proof.sh` — proof capture wrapper

## Scope

1. `nex/scripts/e2e/Dockerfile.console-cleanroom` — Multi-stage Docker image:
   - Stage 1: Build nex (reuse existing Dockerfile as base or copy pattern)
   - Stage 2: Build console UI (`pnpm build` in operator-console/app)
   - Stage 3: Playwright runner (`mcr.microsoft.com/playwright`) with nex
     binaries, built console, and test files

2. `nex/scripts/e2e/operator-console-cleanroom-docker.sh` — Docker wrapper:
   - Builds the multi-stage image
   - Runs the container with proof bundle mount
   - Inside container: init → seed owner → onboard → start runtime → start
     static server for console → seed test data via callRuntime() → run
     Playwright tests → collect browser proof artifacts through the shared
     cleanroom bundle model

3. `packages/apps/nex-operator-console/e2e/playwright.config.ts`:
   - Video: `'on'` for every test
   - Trace: `'on'` with screenshots + snapshots + sources
   - Viewport: 1400x900
   - Base URL: `http://localhost:5173`
   - Output dir mapped to a producer-local namespace inside the proof bundle

4. `packages/apps/nex-operator-console/e2e/setup.ts` — Global setup:
   - Seeds test data via `callRuntime()`: 2-3 agents, a schedule, an ingress
     credential, so the UI has real data to display

5. `nex/scripts/e2e/operator-console-cleanroom-capture.sh` — Proof capture
   wrapper

6. Producer artifact conventions:
   - Shared review media lands in `videos/`, `traces/`, and `screenshots/`
   - Playwright-specific logs/results stay under `playwright/`
   - The bundle root remains owned by the shared cleanroom wrapper

## Dependencies

- Working `nex/scripts/e2e/Dockerfile`
- Playwright npm package

## Acceptance

1. `./operator-console-cleanroom-docker.sh` builds the image and runs
2. Nex boots, console is served, Playwright connects
3. A minimal smoke test (navigate to console, verify nav renders) passes
4. Video file is produced in the proof bundle
5. Playwright trace is produced and openable with `npx playwright show-trace`
6. At least one screenshot is captured
7. Playwright-specific outputs do not overwrite generic bundle root files

## Validation

- Docker build completes without errors
- Container runs to completion
- Proof bundle contains: `videos/*.webm`, `traces/trace.zip`,
  `screenshots/*.png`, and `playwright/results.json`
