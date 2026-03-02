# Work System

**Status:** ACTIVE
**Last Updated:** 2026-03-02

---

## Overview

The work system adds proactive behavior to Nexus — tracking future work, follow-ups, task sequences, workflows, and campaigns. It builds on top of the existing entity/contact/memory system (which already functions as a CRM data layer) by adding the **work.db** database with work items, sequences, workflows, and campaigns.

Work items execute through the standard NEX pipeline via `dispatchNexusEvent()` with `platform: "work"`, following the same pattern as clock and cron adapters.

---

## Document Index

### Canonical Specs

| Document | Purpose |
|----------|---------|
| [`CRM_ANALYSIS_AND_WORK_SYSTEM.md`](./CRM_ANALYSIS_AND_WORK_SYSTEM.md) | **Master design spec** — CRM analysis, work.db schema, four-model pattern, execution model |
| [`ENTITY_ACTIVITY_DASHBOARD.md`](./ENTITY_ACTIVITY_DASHBOARD.md) | Deterministic aggregate queries over entities, events, contacts, and work data |

### Workplans

| Document | Purpose |
|----------|---------|
| [`workplans/WORKPLAN.md`](./workplans/WORKPLAN.md) | **Master workplan** — phased implementation plan with validation ladder |
| [`workplans/PHASE0_IMPLEMENTATION_SPEC.md`](./workplans/PHASE0_IMPLEMENTATION_SPEC.md) | Phase 0: Entity tag extensions (identity.db) |
| [`workplans/PHASE1_IMPLEMENTATION_SPEC.md`](./workplans/PHASE1_IMPLEMENTATION_SPEC.md) | Phase 1: work.db schema + data access |
| [`workplans/PHASE2_IMPLEMENTATION_SPEC.md`](./workplans/PHASE2_IMPLEMENTATION_SPEC.md) | Phase 2: Work scheduler + NEX pipeline dispatch |
| [`workplans/PHASE3_IMPLEMENTATION_SPEC.md`](./workplans/PHASE3_IMPLEMENTATION_SPEC.md) | Phase 3: Sequences + workflows |
| [`workplans/PHASE4_IMPLEMENTATION_SPEC.md`](./workplans/PHASE4_IMPLEMENTATION_SPEC.md) | Phase 4: Campaigns |
| [`workplans/PHASE5_IMPLEMENTATION_SPEC.md`](./workplans/PHASE5_IMPLEMENTATION_SPEC.md) | Phase 5: Dashboard aggregates |
| [`workplans/PHASE6_IMPLEMENTATION_SPEC.md`](./workplans/PHASE6_IMPLEMENTATION_SPEC.md) | Phase 6: Recurrence support |
| [`workplans/TRUE_E2E_INTEGRATION_SPEC.md`](./workplans/TRUE_E2E_INTEGRATION_SPEC.md) | True E2E integration spec (runtime API, SDK, UI, validation) |
| [`workplans/TRUE_E2E_TODO.md`](./workplans/TRUE_E2E_TODO.md) | E2E integration checklist (**COMPLETE** — all phases checked) |

### Related Specs (other directories)

| Document | Purpose |
|----------|---------|
| [`../memory/UNIFIED_ENTITY_STORE.md`](../memory/UNIFIED_ENTITY_STORE.md) | Entity/contact identity layer that work system builds on |
| [`../memory/FACT_GRAPH_TRAVERSAL.md`](../memory/FACT_GRAPH_TRAVERSAL.md) | Relationship graph queries used by entity activity dashboard |
| [`../iam/ACCESS_CONTROL_SYSTEM.md`](../iam/ACCESS_CONTROL_SYSTEM.md) | ACL system that governs work item access |
| [`../environment/foundation/WORKSPACE_SYSTEM.md`](../environment/foundation/WORKSPACE_SYSTEM.md) | 7-database model including work.db |
