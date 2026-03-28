# OCI-001 Harness and Boot Infrastructure

## Goal

Create the Docker wrapper script and Node.js test runner that boots a disposable
nex runtime and provides the `callRuntime()` WebSocket RPC function for all
subsequent domain tests.

## Scope

- `nex/scripts/e2e/operator-console-integration-docker.sh` — Docker wrapper
  following the existing pattern from `owner-first-agent-cleanroom-docker.sh`
- `nex/scripts/e2e/operator-console-integration.mts` — Node.js test runner with:
  - WebSocket connection and auth handshake
  - `callRuntime(method, params)` helper
  - Domain test registration and sequential execution
  - Structured JSON result output
  - Exit code 0/1 based on pass/fail
- `nex/scripts/e2e/operator-console-integration-capture.sh` — Proof capture wrapper

## Dependencies

- Working `nex/scripts/e2e/Dockerfile` (already exists)
- `capture-cleanroom-proof.sh` (already exists)

## Acceptance

1. `./operator-console-integration-docker.sh` boots nex in Docker and runs the
   test runner
2. The test runner connects via WebSocket, authenticates, and calls at least
   `runtime.hello` successfully
3. Results are written to stdout as structured JSON
4. The capture wrapper produces a proof bundle directory

## Validation

- The harness script runs to completion without errors
- `runtime.hello` returns a valid response with runtime version
- The proof bundle contains `metadata.json`, `results.json`, `stdout.log`
