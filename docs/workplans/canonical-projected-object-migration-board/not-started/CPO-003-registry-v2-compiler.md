# CPO-003 — Registry v2 Compiler

**State:** not started
**Depends on:** CPO-002
**Repository:** nexus umbrella

## Goal

Replace object-registry v1 with a canonical-only registry contract and
deterministic generated catalogs.

## Scope

- Define the v2 schema for canonical subject types only.
- Embed preferred names, accepted packet terms, search terms, retired terms,
  identity contracts, attribute schemas, relationship slots, and implementation
  bindings.
- Remove planned entries, read models, compatibility objects, physical storage
  ownership, open-gap rows, and per-object target states from target schema.
- Generate the historical vocabulary decoder and runtime dispatch catalog from
  one registry digest.
- Reject duplicates, alias ambiguity, cycles, chains, incomplete entries, and
  MoonSleep per-object resolver bindings.

## Acceptance

- A registry entry is either complete and canonical or absent.
- Every `moonsleep.*` entry binds to the generic projected-object
  implementation.
- Generated artifacts are deterministic and digest-pinned.
- V1 remains available only as migration input until CPO-019.

## Validation

- Schema positive/negative fixtures.
- Determinism test across repeated generation.
- Exhaustive current-vocabulary coverage report with no unknown accepted term.
