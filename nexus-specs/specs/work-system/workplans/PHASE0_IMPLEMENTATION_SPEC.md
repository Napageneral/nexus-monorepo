# Work System Phase 0 Implementation Spec

## Scope

This document covers only **Phase 0: Entity Tag Extensions (identity.db)** from:
- `WORK_SYSTEM_WORKPLAN.md`
- `CRM_ANALYSIS_AND_WORK_SYSTEM.md` §3

Hard cutover rule for this phase:
- Active tags are defined as `entity_tags.deleted_at IS NULL`.
- Tag mutations must go through Phase 0 semantics (soft-delete + audit trail).
- No backwards-compat behavior layer is added.

## Customer Experience First

The customer-facing goal of Phase 0 is predictable, auditable identity tagging:

1. Tags that are removed should actually disappear from user/entity views.
2. Re-adding a removed tag should restore it cleanly (no duplicate rows).
3. Every meaningful tag change should be explainable later (who changed what and why).

Why this matters before work.db:
- Workflows, campaigns, and follow-up automation will depend on reliable entity segmentation.
- If tag state is stale or untraceable, CRM behavior becomes surprising and hard to trust.

## Research Findings (Current Code State)

### Already implemented

1. `entity_tags.deleted_at` exists in schema:
   - `nex/src/db/identity.ts` (`IDENTITY_SCHEMA_SQL`)
2. `entity_tag_events` table + indexes exist in schema:
   - `nex/src/db/identity.ts` (`IDENTITY_SCHEMA_SQL`)
3. `ensureIdentitySchema()` calls `ensureEntityTagExtensions()` for existing DBs.
4. New helpers exist in `nex/src/db/identity.ts`:
   - `addEntityTag`
   - `removeEntityTag`
   - `listActiveEntityTags`
   - `listEntityTagEvents`

### Remaining gaps

1. Multiple call sites still write `entity_tags` directly (bypassing helper semantics and/or audit events).
2. Some readers still query all tags, not only active tags (`deleted_at IS NULL`).
3. No dedicated Phase 0 helper behavior test file yet (`entity-tag-events.test.ts` in workplan).
4. Existing migration tests do not yet verify `deleted_at` + `entity_tag_events` extension behavior.

## Detailed File Plan

### A) Helper semantics and call-site cutover

1. `nex/src/iam/identity-entities.ts`
   - Update `ensureIdentityEntityTag()` to delegate to `addEntityTag()` (or equivalent active-tag-safe semantics).

2. `nex/src/iam/bootstrap-identities.ts`
   - Replace direct `INSERT INTO entity_tags` with `addEntityTag()`.

3. `nex/src/nex/workspace-lifecycle/runtime-boot.ts`
   - Replace direct `INSERT INTO entity_tags` with `addEntityTag()`.

4. `nex/src/nex/control-plane/server-methods/auth-users.ts`
   - Replace direct inserts for relationship/custom tags with `addEntityTag()`.
   - Replace local tag listing query with `listActiveEntityTags()` (or SQL with `deleted_at IS NULL`).

5. `nex/src/nex/control-plane/server-methods/ingress-credentials.ts`
   - Replace hard delete role-sync path with `removeEntityTag()` for policy role tags.
   - Use `addEntityTag()` for normalized role tag set.

6. `nex/src/agents/tools/memory-writer-tools.ts`
   - Update merge tag-union SQL to Phase 0 semantics:
     - reactivate soft-deleted tags on canonical entity
     - append audit events for meaningful added/reactivated tags
   - Keep transaction boundaries intact with current attached-db pattern.

### B) Active-tag read consistency

1. `nex/src/iam/identity.ts`
   - Ensure tag reads return active tags only.

2. `nex/src/nex/control-plane/server-methods/auth-users.ts`
   - Ensure tag reads return active tags only.

### C) Tests

1. Add `nex/src/db/entity-tag-events.test.ts` with:
   - add tag -> active tag + added event
   - remove tag -> inactive tag + removed event
   - re-add removed tag -> active tag restored + added event
   - listActiveEntityTags excludes soft-deleted rows
   - listEntityTagEvents ordering and filters

2. Extend `nex/src/db/identity-schema-migration.test.ts` with:
   - pre-extension schema simulation (missing `deleted_at`, missing `entity_tag_events`)
   - rerun `ensureIdentitySchema()`
   - assert new column/table/indexes exist and prior data survives

## Validation Plan (Phase 0)

Primary validation commands (targeted):

1. `pnpm vitest src/db/entity-tag-events.test.ts`
2. `pnpm vitest src/db/identity-schema-migration.test.ts`
3. `pnpm vitest src/iam/identity.test.ts src/nex/stages/resolveIdentity.test.ts`
4. `pnpm vitest src/nex/control-plane/server-methods/auth-users.ts --run` (or nearest existing auth-users tests)

Phase 0 done criteria:

1. No direct production `INSERT/DELETE/UPDATE entity_tags` remains outside:
   - schema migration/bootstrapping internals
   - explicitly justified transaction-local merge logic that preserves Phase 0 semantics
2. Active tag reads consistently exclude soft-deleted tags.
3. `entity_tag_events` audit rows exist for add/remove operations.
4. All targeted tests pass.

## Tracker

- [x] Research completed
- [x] Phase 0 spec written
- [x] Implementation complete
- [x] Validation complete
- [ ] Ready to start Phase 1
