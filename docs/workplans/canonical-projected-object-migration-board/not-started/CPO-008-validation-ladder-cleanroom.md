# CPO-008 — Validation Ladder and Cleanroom

**State:** not started
**Depends on:** CPO-002
**Repositories:** Nex core, nexus umbrella, MoonSleep

## Goal

Create the durable proof contract before any semantic cutover.

## Scope

- Publish an active validation ladder under `docs/validation/`.
- Define registry, storage, publication, targeting, graph, resolver, replay,
  alias, backend-parity, restart, and deletion-residue proof profiles.
- Provide a fresh containerized substrate proof and a runtime-managed sandbox
  golden journey.
- Define candidate artifact and signoff evidence requirements.

## Acceptance

- Every later cutover ticket names a reusable validation profile rather than an
  ad hoc command list.
- The golden journey demonstrates Record → Fact → Observation → projected
  object → revision → graph → resolve across restart.
- The harness proves exact replay and late-arriving evidence behavior.

## Validation

- Self-test the validation runner with one intentionally failing fixture.
- Independent review of pass/fail completeness before CPO-013.
