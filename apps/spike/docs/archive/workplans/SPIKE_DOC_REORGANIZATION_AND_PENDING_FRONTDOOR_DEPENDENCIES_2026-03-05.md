# Spike Doc Reorganization And Pending Frontdoor Dependencies

**Status:** ARCHIVED
**Last Updated:** 2026-03-06

> Archived 2026-03-06 after the Spike docs tree, hosted transport cutover, and
> frontdoor canonical replacements landed. Kept only as historical coordination
> context.

---

## Purpose

This workplan records the Spike doc-system cleanup completed on 2026-03-05 and
the remaining dependency points that still need frontdoor-side replacements
before full code gap analysis.

It is not a target-state product spec. It is a coordination artifact.

---

## Completed In This Reorganization Pass

1. Created a canonical Spike docs tree under `apps/spike/docs/`.
2. Moved active target-state Spike docs under `docs/specs/`.
3. Moved active execution planning under `docs/workplans/`.
4. Moved the active validation ladder under `docs/validation/`.
5. Moved historical Spike material under `docs/archive/`.
6. Archived the two mixed-state Spike docs that were carrying proxy-mode and
   migration residue:
   - `docs/archive/specs/SPIKE_FRONTDOOR_INTEGRATION.md`
   - `docs/archive/specs/SPIKE_NEX_APP_SPEC.md`
7. Replaced those archived docs with clean active specs:
   - `docs/specs/SPIKE_APP_AND_PACKAGE_MODEL.md`
   - `docs/specs/SPIKE_INTEGRATIONS_AND_CALLBACK_OWNERSHIP.md`

---

## Active Spike Doc Set After Reorganization

### Active specs

- `docs/specs/SPIKE_APP_AND_PACKAGE_MODEL.md`
- `docs/specs/SPIKE_DATA_MODEL.md`
- `docs/specs/SPIKE_INTEGRATIONS_AND_CALLBACK_OWNERSHIP.md`

### Active workplans

- `docs/workplans/SPIKE_WORKPLAN.md`
- `docs/workplans/SPIKE_DOC_REORGANIZATION_AND_PENDING_FRONTDOOR_DEPENDENCIES_2026-03-05.md`

### Active validation

- `docs/validation/SPIKE_VALIDATION_LADDER.md`

---

## What Still Depends On Frontdoor Follow-Through

The frontdoor-specific replacement docs now exist:

- `nexus-frontdoor/docs/specs/FRONTDOOR_HOSTED_ACCESS_AND_ROUTING.md`
- `nexus-frontdoor/docs/specs/FRONTDOOR_PACKAGE_REGISTRY_AND_LIFECYCLE.md`

That means Spike no longer has to wait on stable frontdoor doc names for the
core routing and lifecycle contracts.

What still remains is frontdoor-side follow-through on the older docs and on
implementation alignment.

### 1. Downstream frontdoor spec revisions

These docs still need to be revised against the new stable frontdoor
replacements:

- `nexus-frontdoor/docs/specs/FRONTDOOR_ARCHITECTURE.md`
- `nexus-frontdoor/docs/specs/CRITICAL_CUSTOMER_FLOWS_2026-03-02.md`
- `nexus-frontdoor/docs/specs/CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md`

### 2. Legacy frontdoor docs still awaiting archive/supersession

These older docs still exist and should not be treated as the target-state
source of truth once the frontdoor follow-through pass completes:

- `nexus-frontdoor/docs/specs/APP_INSTALLATION_PIPELINE_2026-03-04.md`
- `nexus-frontdoor/docs/specs/TENANT_NETWORKING_AND_ROUTING_2026-03-04.md`
- `nexus-frontdoor/docs/specs/NEX_APP_MANIFEST_AND_LIFECYCLE_2026-03-02.md`

### 3. Frontdoor/runtime implementation alignment

The live/runtime implementation still needs to catch up to the new lifecycle
docs. The immediate known seam is runtime lifecycle/operator API coverage and
release handling behavior in deployed environments.

---

## First-Pass Code-vs-Spec Gaps Already Visible

These are visible now from the current Spike codebase and live-platform review.

### 1. Runtime transport contract drift

- Spike UI originally hardcoded runtime connection details in `app/dist/index.html`
- active Spike app spec now requires shared canonical runtime transport behavior
- this gap is now closed in code: both `app/dist/index.html` and
  `app/dist/inspector.html` call the shared `window.NexusRuntimeBridge`
  surface instead of shipping per-page WebSocket handshake logic
- remaining follow-through is validation through the hosted shell profile and
  keeping active docs/workplans aligned to the shared bridge model

### 2. Callback path drift

- legacy Spike code/docs use bespoke callback routes such as
  `/connectors/github/install/callback`
- legacy Spike code/docs use bespoke webhook routes such as `/github/webhook`
- active Spike integration spec now requires shared adapter-owned ingress for
  generic GitHub auth/setup and reusable GitHub webhooks
- Spike should only keep Spike-specific binding behavior in app-owned surfaces

### 3. Published artifact vs active spec drift

- published frontdoor package contents
- tenant-installed package contents
- local repo package contents

These must converge to one faithful release story.

### 4. Manifest schema drift

- active Spike package spec now follows the canonical app manifest model
- the actual Spike manifest and runtime implementation need to be checked against
  that canonical contract
- immediate visible mismatches include:
  - object-form `services` instead of canonical array form
  - manifest-level `port`
  - manifest-level `protocol`

### 5. Runtime lifecycle drift

- repo code references upgrade/operator lifecycle surfaces
- the live tenant runtime may still expose an older lifecycle API surface
- published package and tenant-installed package behavior are not yet a single
  deterministic release story

### 6. Credential contract drift

- Spike service code currently reads provider credentials from direct process env
- active Spike integration spec no longer treats undocumented frontdoor env
  inheritance as the canonical contract

### 7. Session and execution ownership drift

- Spike still owns a large `internal/broker` subsystem and exposes
  `spike.sessions.*`
- the desired long-term ownership boundary with canonical Nex agent/session
  storage is still an explicit architectural decision to be made

These gaps should drive the next formal code-vs-spec review pass.
