# CPO-001 — Canonical Spec Lock

**State:** completed
**Depends on:** none
**Repository:** nexus umbrella

## Goal

Lock the simple, generative target state before implementation planning.

## Delivered

- Canonical target-state spec at
  `docs/specs/canonical-projected-objects.md`.
- Core Graph spec defers to the new spec for MoonSleep domain-object mechanics.
- Object-registry v1 is labeled current implementation and migration input, not
  target architecture.
- This executable board separates gap closure from target-state canon.

## Acceptance

- The spec contains no migration phases or temporary compatibility design.
- Registration is binary and grants uniform object behavior.
- Every MoonSleep object uses one generic projected-object implementation.
- Native Nex objects stay native behind the shared resolver interface.
- Read views, receipts, evidence custody, and incomplete proposals remain
  outside the canonical registry.
- No production, schema, cursor, or historical packet state was mutated.

## Validation

- Markdown links and Mermaid blocks render.
- Spec/workplan corpus rules pass.
- Independent alignment is deliberately owned by CPO-002.
