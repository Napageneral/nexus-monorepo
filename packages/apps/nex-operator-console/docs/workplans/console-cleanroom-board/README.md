# Console Cleanroom Integration Board

This board is now the historical baseline board for the operator-console
browser proof lane.

The foundational cleanroom/browser work is complete. The live representative
lane now runs as a runtime-managed sandbox proof on the shared validation
substrate and produces whole-session recordings plus browser artifacts in the
shared proof bundle model.

Remaining scenario-expansion dogfood work is no longer owned here. It now rolls
up under [GJV-006](/Users/tyler/nexus/home/projects/nexus/docs/workplans/golden-journey-validation-board/not-started/GJV-006-first-dogfood-ticket-through-the-golden-journey.md)
on the golden-journey board.

This board tracks the operator console browser-driven cleanroom integration
suite — proving the v2 UI works against a real disposable nex runtime with
video recording, Playwright traces, and screenshots as proof artifacts.

Canonical inputs:

- `docs/specs/OPERATOR_CONSOLE_CLEANROOM_INTEGRATION.md`
- `nex/docs/specs/environment/layered-validation-substrates-and-sandbox-managed-cleanrooms.md`
- `nex/docs/specs/environment/cleanroom-proof-capture-and-demo-artifacts.md`
- `docs/spec-driven-development-workflow.md`
- `nex/scripts/e2e/operator-console-browser-proof.sh` (runtime-managed proof lane)
- `nex/scripts/e2e/operator-console-cleanroom-capture.sh` (shared proof capture wrapper)

Historical scope delivered here:

- Playwright browser automation tests for every console page and interaction
- runtime-backed disposable proof execution
- full-session recording, tracing, and screenshot capture
- Durable proof bundle with structured results + media artifacts
- representative proof-lane dogfooding before broader scenario expansion

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

Completed baseline:

1. `OCI-001` — proof harness and boot infrastructure
2. `OCI-002` — Shell, navigation, and settings browser tests
3. `OCI-003` — Connectors and agents browser tests
4. `OCI-004` — Monitor, jobs, and records browser tests
5. `OCI-005` — Identity and memory browser tests

Still deferred here:

1. `OCI-006` — optional GitHub workflow/manual-dispatch packaging

Current live owner for remaining console dogfood verification:

1. `GJV-006` — next real console/runtime-backed dogfood ticket through the
   whole-session review flow
