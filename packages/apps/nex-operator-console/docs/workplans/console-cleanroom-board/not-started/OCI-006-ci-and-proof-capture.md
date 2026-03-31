# OCI-006 CI Workflow Packaging

## Goal

Package the already-working operator-console proof lane into an optional
GitHub/manual-dispatch workflow.

This lane is about packaging the operator-console producer cleanly inside the
shared cleanroom proof bundle model, not about making browser recording or
whole-session recording an operator-console-only special case.

## Scope

1. GitHub Actions workflow (`.github/workflows/console-cleanroom.yml` or an
   equivalent package-validation lane):
   - Manual dispatch trigger (`workflow_dispatch`)
   - Reuses the already-working proof entrypoint rather than re-implementing it
   - Runs the runtime-managed operator-console browser proof
   - Uploads proof bundle as workflow artifact
   - Preserves the shared cleanroom root files plus the browser producer
     namespace and shared review media
   - Separate job or step to upload trace as its own artifact for easy
     Trace Viewer access

2. Documentation updates:
   - Add cleanroom test instructions to operator console README or TESTING.md
   - Link from the board README to the proof capture command
   - Update validation docs to reference the browser cleanroom suite

3. Artifact packaging:
   - publish the proof bundle as a downloadable workflow artifact
   - optionally publish the primary review artifact separately for quick access

## Dependencies

- OCI-001 through OCI-005 (all browser tests passing)

## Acceptance

1. the operator-console proof entrypoint already produces a complete proof
   bundle locally
2. GitHub Actions manual dispatch workflow runs successfully
3. proof bundle is uploaded as a downloadable workflow artifact
4. a reviewer can download the artifact and:
   - Watch the video
   - Open the trace with `npx playwright show-trace`
   - Review screenshots
   - Check `playwright/results.json` for pass/fail

## Validation

- GitHub Actions workflow completes and artifact is downloadable
- shared proof bundle contents remain intact in the uploaded artifact
