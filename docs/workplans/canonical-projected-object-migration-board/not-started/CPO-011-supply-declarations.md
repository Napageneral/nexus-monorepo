# CPO-011 — Canonical Supply Declarations

**State:** not started
**Depends on:** CPO-003, CPO-006, CPO-009, CPO-010
**Repositories:** nexus umbrella, MoonSleep

## Goal

Publish the complete canonical declarations required by the paused Supply
historical slate.

## Scope

- Register Purchase Order, Product Revision, Manufacturing Run, and every
  supporting Supply object explicitly approved by CPO-009.
- Embed historical packet vocabulary and preferred singular/plural names.
- Define stable identity contracts, full attribute schemas, and consolidated
  relationship slots.
- Bind every `moonsleep.*` entry to the generic projected-object
  implementation.
- Keep rejected candidates outside the registry.

## Acceptance

- Each declaration is immediately resolvable and targetable in a clean
  runtime; no planned or partial entry exists.
- The accepted Supplier corpus compiles entirely to canonical types and slots.
- Storage/table names are absent from machine vocabulary.
- Registry publication is deterministic and digest-pinned.

## Validation

- Registry conformance and negative fixtures.
- Exhaustive packet compilation with zero unknown terms.
- Human review of the complete Supply declaration diff.
