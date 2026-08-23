# CPO-002 — Independent Canon Alignment

**State:** not started
**Depends on:** CPO-001
**Repositories:** nexus umbrella, Nex core, MoonSleep

## Goal

Independently prove that the active spec set tells one coherent target-state
story and enumerate every current contract that must defer, migrate, or archive.

## Scope

- Compare the new spec with Core Graph, continuous evidence, current object
  registry, Observation-adapter contracts, Nex context, and MoonSleep context
  maps.
- Classify conflicts as spec correction or workplan gap.
- Update active neighboring specs only where they restate contradictory target
  behavior.
- Produce an exact current-code delta inventory for CPO-003 through CPO-010.

## Acceptance

- A reviewer independent of the spec author records no unresolved target-state
  contradiction.
- All per-object resolver, partial-status, read-model-entry, and compatibility
  architecture is assigned to an explicit deletion or migration ticket.
- No implementation begins from an unresolved semantic conflict.

## Validation

- Standards review against `docs/spec-driven-development-workflow.md` and
  `docs/spec-standards.md`.
- Spec review against exact then-current main in all three repositories.
