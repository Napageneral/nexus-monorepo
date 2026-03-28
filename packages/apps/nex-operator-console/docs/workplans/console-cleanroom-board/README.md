# Console Cleanroom Integration Board

This board tracks the operator console browser-driven cleanroom integration
suite — proving the v2 UI works against a real disposable nex runtime with
video recording, Playwright traces, and screenshots as proof artifacts.

Canonical inputs:

- `docs/specs/OPERATOR_CONSOLE_CLEANROOM_INTEGRATION.md`
- `nex/docs/specs/environment/standalone-clean-room-docker-boot.md`
- `docs/spec-driven-development-workflow.md`
- `nex/scripts/e2e/Dockerfile` (shared Docker cleanroom image)
- `nex/scripts/e2e/runtime-capability-matrix-cleanroom-docker.sh` (boot pattern)
- `nex/scripts/e2e/capture-cleanroom-proof.sh` (shared proof capture)

Scope:

- Playwright browser automation tests for every console page and interaction
- Docker-based disposable runtime + console serving
- Video recording, tracing, and screenshot capture
- Durable proof bundle with structured results + media artifacts
- CI integration via manual dispatch workflow

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

Not Started:

1. `OCI-001` — Docker image and boot infrastructure (nex + console + Playwright)
2. `OCI-002` — Shell, navigation, and settings browser tests
3. `OCI-003` — Connectors and agents browser tests (list, wizard, detail)
4. `OCI-004` — Monitor, jobs, and records browser tests
5. `OCI-005` — Identity and memory browser tests
6. `OCI-006` — CI workflow, proof capture, and documentation
