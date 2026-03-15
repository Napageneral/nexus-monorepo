# Workplan: Frontdoor Canon And Tracking Hygiene

**Date:** 2026-03-10
**Status:** COMPLETED (archived 2026-03-10)
**Spec:** `/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md`
**Depends on:** `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/platform-model.md`
**Approach:** HARD CUTOVER — active frontdoor docs must reflect current canon and current implementation state only

---

## Objective

> Archived 2026-03-10 after:
> 1. retargeting active frontdoor canon to `nex/docs/specs/*`
> 2. archiving the frontdoor-local app manifest spec
> 3. rewriting active billing canon around credits + app subscriptions
> 4. archiving stale package/MCP/credits workplans and proposals
> 5. validating the cleaned tree structurally plus focused frontdoor tests

Clean the active `nexus-frontdoor` specs, workplans, validation entrypoints, and
proposal references so they align with:

1. the new runtime-owned canon in `nex/docs/specs/*`
2. the spec-driven workflow governance rules
3. the current frontdoor implementation state

After this workplan is complete:

1. active frontdoor specs point at the correct current upstream canon
2. frontdoor does not keep a second active canonical app-manifest spec
3. active frontdoor billing and customer-flow specs tell the current hosted story
4. stale `NOT STARTED` workplans are no longer left active when the code already landed
5. frontdoor validation entrypoints point at the current `nex/docs/validation/*` proofs

## Customer Experience Goal

The active frontdoor docs should let a reader understand one coherent hosted
product story:

1. frontdoor owns account access, server lifecycle, billing, package planning,
   the human shell, and the private managed-connection gateway
2. apps launch under one public entry path beneath a durable shell
3. server runtime access follows one public `/runtime/...` contract
4. server billing uses credits and free-tier logic, not legacy per-server
   subscriptions
5. frontdoor work tracking reflects what is actually open, not what used to be
   open

## Research Findings

1. Active frontdoor canonical specs still cite the older
   `nexus-specs/specs/nex/*` packet even though the current runtime-owned canon
   now lives in `nex/docs/specs/*`.
2. `docs/specs/NEX_APP_MANIFEST_AND_LIFECYCLE_2026-03-02.md` is no longer the
   correct owner of the app manifest contract; that canon now belongs to
   `nex/docs/specs/apps/app-manifest-and-package-model.md`.
3. `docs/specs/BILLING_ARCHITECTURE_ACCOUNT_MODEL_2026-03-02.md` is internally
   inconsistent: it declares credits as canon but still specifies legacy
   server-subscription behavior.
4. `docs/specs/CRITICAL_CUSTOMER_FLOWS_2026-03-02.md` still contains stale
   injection-era "app frame/dock" language and legacy server-subscription
   references.
5. Active workplans for package installation, MCP, and credits still say
   `NOT STARTED`, but the codebase already contains the corresponding
   implementation surfaces and tests.
6. The active frontdoor validation entrypoint still points at the older
   `nexus-specs/specs/nex/validation/HOSTED_PLATFORM_VALIDATION_LADDER.md`
   instead of the current `nex/docs/validation/*` ladder and signoff docs.

## Phase 1: Canon Retargeting

### Goal

Retarget active frontdoor specs and validation docs to the current runtime-owned
canon.

### Changes

1. Update active spec `Related` and cross-reference sections to point at:
   - `nex/docs/specs/platform/*`
   - `nex/docs/specs/apps/app-manifest-and-package-model.md`
   - `nex/docs/specs/adapters/adapter-connections.md`
2. Update the frontdoor hosted validation entrypoint to point at:
   - `nex/docs/validation/canonical-api-validation-ladder.md`
   - `nex/docs/validation/package-operator-frontdoor-cutover-validation-ladder.md`
   - `nex/docs/validation/canonical-api-full-system-signoff-report-2026-03-10.md`

### Exit Criteria

No active frontdoor canonical doc should depend on the older
`nexus-specs/specs/nex/*` paths as the primary upstream canon for hosted
platform behavior.

## Phase 2: Canon Ownership Cleanup

### Goal

Remove active frontdoor docs that no longer own canonical truth and correct
stale canonical language in the remaining frontdoor-owned specs.

### Changes

1. Archive the frontdoor-local app manifest spec.
2. Rewrite the active frontdoor billing spec around:
   - accounts
   - server credits
   - credit transactions
   - free tier
   - app subscriptions
3. Update critical customer flows so they describe:
   - shell profile and embedded boundary
   - credits instead of server subscriptions
   - shell navigation instead of injected frame/dock wording
4. Fix smaller stale wording in infrastructure specs where billing or shell
   terms drifted.

### Exit Criteria

The active frontdoor specs no longer contradict current hosted canon or current
frontdoor implementation state.

## Phase 3: Tracking Hygiene

### Goal

Make the active frontdoor workplans and proposals reflect reality.

### Changes

1. Archive or complete stale active workplans for:
   - package installation pipeline
   - MCP server
   - credit system and free tier
2. Archive proposal docs whose work has landed and whose content is now
   historical rather than exploratory.
3. Update architecture/index docs so active, proposal, and archived materials
   are classified correctly.

### Exit Criteria

No active frontdoor workplan should claim `NOT STARTED` for work that is already
implemented in code.

## Phase 4: Validation

### Goal

Prove the cleaned frontdoor docs tree satisfies the workflow rules and still
matches the code at a high level.

### Validation

1. Scan active `docs/specs/` for:
   - stale `nexus-specs/specs/nex/*` primary references
   - stale `app frame` injection language
   - stale server-subscription billing language
2. Scan active `docs/workplans/` for misleading `NOT STARTED` status
3. Run focused frontdoor tests that cover:
   - package install operator flow
   - MCP route/tooling
   - credits/account endpoints
4. Confirm archived/superseded docs moved out of active paths

### Exit Criteria

1. active frontdoor specs and workplans are workflow-clean
2. active frontdoor canon matches the current runtime-owned canon
3. focused frontdoor tests still pass after the hygiene pass
