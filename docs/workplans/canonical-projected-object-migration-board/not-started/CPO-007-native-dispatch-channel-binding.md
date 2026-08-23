# CPO-007 — Native Dispatch and Channel Binding

**State:** not started
**Depends on:** CPO-003, CPO-005, completed native Channel branch
**Repositories:** Nex core, nexus umbrella

## Goal

Dispatch native Nex subjects and projected MoonSleep subjects through one
ordered resolver seam, beginning with the completed native Channel contract.

## Scope

- Integrate or consume the exact-current native Channel implementation from
  `codex/native-channel-cleanup-20260823`.
- Bind the single `nex.channel` registry entry to its native adapter.
- Route every `moonsleep.*` type to the generic projected-object resolver.
- Preserve ordered mixed native/projected batches and explicit misses.
- Keep historical ledger verification generic and read-only.

## Acceptance

- Native Channel row ID remains canonical.
- Deleted Channel rows resolve and the complete row including `deleted_at` is
  digest-bound.
- No route-successor inference, Communication Stream resolver, crosswalk
  fallback, or second Channel declaration exists.
- Runtime source contains no Channel crosswalk-specific resolver lifecycle.

## Validation

- Native Channel targeted suites from the owning branch.
- Mixed native/projected batch ordering and fail-closed tests.
- Cleanroom proof against SQLite and PostgreSQL resolver paths.
