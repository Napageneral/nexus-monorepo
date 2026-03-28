# OCI-007 CI Workflow and Proof Capture

## Goal

Wire the operator console integration suite into CI with manual dispatch and
durable proof capture.

## Scope

- `nex/scripts/e2e/operator-console-integration-capture.sh` — wraps the Docker
  script with `capture-cleanroom-proof.sh` for durable proof bundles
- GitHub Actions workflow addition: manual dispatch trigger that builds the
  Docker image, runs the integration suite, and uploads the proof bundle as an
  artifact
- Documentation update: add the cleanroom suite to the operator console's
  validation docs and link from the board README

## Dependencies

- OCI-001 through OCI-006 (all domain tests passing)

## Acceptance

1. `./operator-console-integration-capture.sh` produces a proof bundle
2. The GitHub Actions manual dispatch workflow runs successfully
3. The proof bundle is uploaded as a workflow artifact
4. Validation docs reference the cleanroom suite

## Validation

- Proof bundle contains `metadata.json`, `results.json`, `stdout.log`
- `results.json` has entries for every domain
- GitHub Actions workflow completes and artifact is downloadable
