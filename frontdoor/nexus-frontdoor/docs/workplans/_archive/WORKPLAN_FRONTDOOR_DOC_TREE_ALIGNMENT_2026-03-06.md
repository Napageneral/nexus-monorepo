# Workplan: Frontdoor Docs Tree Alignment

**Date:** 2026-03-06
**Status:** COMPLETED
**Spec:** `../../nexus-specs/specs/SPEC_DRIVEN_DEVELOPMENT_WORKFLOW.md`
**Approach:** HARD CUTOVER — active docs must tell one coherent story with no draft, design, seed, TODO, or superseded residue left in `docs/specs/`

---

## Customer Experience

When a human or agent opens `nexus-frontdoor/docs/`, the structure must answer four questions immediately:

1. What is the canonical frontdoor architecture right now?
2. Which documents are still exploratory proposals?
3. What work is actively being executed?
4. Which older documents are historical only?

The active tree itself is part of the product surface. If `docs/specs/` contains draft or superseded material, agents will misread it as canonical truth and implementation will drift.

---

## Research Findings

### Current structural drift

`nexus-frontdoor/docs/` currently has:

- `specs/`
- `workplans/`
- `validation/`

It does **not** have `proposals/`, even though active `specs/` currently contains exploratory material.

### Files in `docs/specs/` that are not canonical

These are the clear mismatches:

1. `APP_INSTALLATION_PIPELINE_2026-03-04.md` — `Status: DRAFT`
2. `FRONTDOOR_MCP_SERVER_AND_AGENTIC_ACCESS_2026-03-04.md` — `Status: DRAFT`
3. `ADMIN_SERVER_PATTERN.md` — `Status: seed — needs detailed design`
4. `TODO_ADMIN_SERVER_PATTERN.md` — `Status: not started`
5. `FRONTDOOR_APP_FRAME_AND_DOCK_2026-03-02.md` — explicitly superseded

### Files in `docs/specs/` that are detailed but still intended target-state

These should remain active, but their status and references need cleanup:

1. `CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md`
2. `TENANT_NETWORKING_AND_ROUTING_2026-03-04.md`

Both are target-state infrastructure specs, but they currently self-label as `DESIGN`. `TENANT_NETWORKING_AND_ROUTING_2026-03-04.md` also still contains old shell-injection language that conflicts with the new iframe shell canon.

### Reference drift that must be fixed

The cleanup cannot be file moves only. These active docs and workplans still point at the non-canonical files above:

1. `FRONTDOOR_ARCHITECTURE.md`
2. `FRONTDOOR_HOSTED_ACCESS_AND_ROUTING.md`
3. `FRONTDOOR_PACKAGE_REGISTRY_AND_LIFECYCLE.md`
4. `FRONTDOOR_SHELL_AND_EMBEDDED_APP_MODEL.md`
5. `BILLING_ARCHITECTURE_ACCOUNT_MODEL_2026-03-02.md`
6. `CRITICAL_CUSTOMER_FLOWS_2026-03-02.md`
7. `WORKPLAN_APP_INSTALLATION_PIPELINE_2026-03-04.md`
8. `WORKPLAN_MCP_SERVER_2026-03-04.md`
9. `WORKPLAN_CREDIT_SYSTEM_AND_FREE_TIER_2026-03-04.md`

---

## Decisions

### 1. Add a real `docs/proposals/` bucket

Frontdoor now uses the same artifact split described in the canonical workflow:

- `docs/specs/` for canonical target-state docs only
- `docs/proposals/` for exploratory drafts and seed specs
- `docs/workplans/` for active execution
- `docs/validation/` for active validation
- `_archive/` subtrees for historical material

### 2. Move true exploratory docs out of `docs/specs/`

Move these files into `docs/proposals/`:

1. `APP_INSTALLATION_PIPELINE_2026-03-04.md`
2. `FRONTDOOR_MCP_SERVER_AND_AGENTIC_ACCESS_2026-03-04.md`
3. `ADMIN_SERVER_PATTERN.md`
4. `TODO_ADMIN_SERVER_PATTERN.md`

### 3. Archive the superseded shell-injection doc

Move this file into `docs/specs/_archive/`:

1. `FRONTDOOR_APP_FRAME_AND_DOCK_2026-03-02.md`

It is historical context only and must not remain in the active spec tree.

### 4. Promote the infrastructure target-state docs into clean active specs

Keep these in `docs/specs/`, but remove `DESIGN` labeling and align them to the current hosted-shell canon:

1. `CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md`
2. `TENANT_NETWORKING_AND_ROUTING_2026-03-04.md`

### 5. Retarget active references

After the moves:

- active architecture/spec docs must reference canonical specs as canonical
- proposal references must be called out explicitly as proposals
- active workplans must not claim proposal files are their canonical spec

---

## Implementation Steps

### Phase 1: Create the missing proposal surface

1. Create `docs/proposals/`.
2. Move exploratory docs into it unchanged.

### Phase 2: Clean the active spec tree

1. Move `FRONTDOOR_APP_FRAME_AND_DOCK_2026-03-02.md` into `docs/specs/_archive/`.
2. Update active spec indexes and supersession references to the archived path.
3. Update `CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md` and `TENANT_NETWORKING_AND_ROUTING_2026-03-04.md` to canonical status and current shell language.

### Phase 3: Repair active references

1. Update `FRONTDOOR_ARCHITECTURE.md` so its active spec list contains only active specs.
2. Add a proposals section to `FRONTDOOR_ARCHITECTURE.md`.
3. Update workplans so `Spec:` points at canonical docs and proposal files appear only as supporting research when needed.
4. Update any active spec text that currently treats a proposal as settled canon.

### Phase 4: Tighten the global workflow rule

Update `SPEC_DRIVEN_DEVELOPMENT_WORKFLOW.md` so it explicitly states:

1. if a repo has exploratory drafts, it should create `docs/proposals/`
2. `docs/specs/` must not contain `DRAFT`, `DESIGN`, `seed`, `TODO`, `not started`, or superseded documents

---

## Validation

The cleanup is complete only when all of the following are true:

1. `nexus-frontdoor/docs/specs/` contains no file labeled `DRAFT`, `DESIGN`, `seed`, `TODO`, `not started`, or `superseded`
2. `nexus-frontdoor/docs/proposals/` exists and contains the exploratory frontdoor docs
3. active frontdoor workplans no longer claim proposal files are their canonical specs
4. `FRONTDOOR_ARCHITECTURE.md` cleanly separates active specs, proposals, and archived material
5. `SPEC_DRIVEN_DEVELOPMENT_WORKFLOW.md` explicitly documents the same rule set
