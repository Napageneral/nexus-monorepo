# OCI-006 CI Workflow and Proof Capture

## Goal

Wire the browser cleanroom suite into CI with manual dispatch, durable proof
capture with video/traces/screenshots, and documentation.

## Scope

1. `nex/scripts/e2e/operator-console-cleanroom-capture.sh` — wraps the Docker
   script with `capture-cleanroom-proof.sh` for durable proof bundles that
   include videos, traces, and screenshots

2. GitHub Actions workflow (`.github/workflows/console-cleanroom.yml`):
   - Manual dispatch trigger (`workflow_dispatch`)
   - Builds the multi-stage Docker image
   - Runs the full Playwright browser suite
   - Uploads proof bundle as workflow artifact (videos, traces, screenshots,
     results.json)
   - Separate job or step to upload trace as its own artifact for easy
     Trace Viewer access

3. Documentation updates:
   - Add cleanroom test instructions to operator console README or TESTING.md
   - Link from the board README to the proof capture command
   - Update validation docs to reference the browser cleanroom suite

4. Proof bundle packaging:
   - Ensure `capture-cleanroom-proof.sh` correctly captures the nested
     Playwright output (videos/ traces/ screenshots/) into the proof bundle
   - Add `metadata.json` with: nex version, console version, Playwright version,
     browser version, viewport size, test count, pass/fail counts, total duration

## Dependencies

- OCI-001 through OCI-005 (all browser tests passing)

## Acceptance

1. `./operator-console-cleanroom-capture.sh` produces a complete proof bundle
2. Proof bundle contains videos, traces, screenshots, and structured results
3. GitHub Actions manual dispatch workflow runs successfully
4. Proof bundle is uploaded as a downloadable workflow artifact
5. A reviewer can download the artifact and:
   - Watch the video
   - Open the trace with `npx playwright show-trace`
   - Review screenshots
   - Check results.json for pass/fail

## Validation

- Proof bundle directory structure matches the spec
- `metadata.json` has all required fields
- Videos are playable
- Traces are openable in Playwright Trace Viewer
- GitHub Actions workflow completes and artifact is downloadable
