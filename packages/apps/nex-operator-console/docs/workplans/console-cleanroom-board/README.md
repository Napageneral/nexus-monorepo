# Console Cleanroom Integration Board

This board tracks the operator console cleanroom integration test suite — proving
that every controller-to-runtime RPC path works against a real disposable nex
instance.

Canonical inputs:

- `docs/specs/OPERATOR_CONSOLE_CLEANROOM_INTEGRATION.md`
- `nex/docs/specs/environment/standalone-clean-room-docker-boot.md`
- `docs/spec-driven-development-workflow.md`
- `nex/scripts/e2e/Dockerfile` (shared Docker cleanroom image)
- `nex/scripts/e2e/capture-cleanroom-proof.sh` (shared proof capture)

Scope:

- WebSocket RPC integration tests for every console controller domain
- Docker-based disposable runtime boot
- Durable proof bundle capture
- CI integration via manual dispatch workflow

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

Not Started:

1. `OCI-001` — Harness and boot infrastructure
2. `OCI-002` — System and config domain tests
3. `OCI-003` — Agents and chat domain tests
4. `OCI-004` — Integrations, channels, and apps domain tests
5. `OCI-005` — Identity, memory, and schedules domain tests
6. `OCI-006` — Monitor and credentials domain tests
7. `OCI-007` — CI workflow and proof capture
