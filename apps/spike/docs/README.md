# Spike Docs

This directory is the active documentation tree for Spike.

It follows the canonical workflow in
`docs/governance/spec-driven-development-workflow.md`:

- `specs/` contains active target-state Spike docs only
- `workplans/` contains active gap-closure and alignment plans
- `validation/` contains active validation ladders
- `archive/` contains superseded Spike docs kept only for history

## Active Specs

- `specs/SPIKE_OBJECT_TAXONOMY.md`
- `specs/SPIKE_APP_AND_PACKAGE_MODEL.md`
- `specs/SPIKE_CODE_INTELLIGENCE_ARCHITECTURE.md`
- `specs/SPIKE_CODE_INTELLIGENCE_TOOL_CONTRACT.md`
- `specs/SPIKE_CURRENT_CODE_INDEX_MODEL.md`
- `specs/SPIKE_DATA_MODEL.md`
- `specs/SPIKE_GUIDE_FOR_AGENT_MODEL.md`
- `specs/SPIKE_INVESTIGATION_POLICY_MODEL.md`
- `specs/SPIKE_PRODUCT_CONTROL_PLANE.md`
- `specs/SPIKE_SESSION_AND_EXECUTION_OWNERSHIP.md`
- `specs/SPIKE_STORAGE_BOUNDARY.md`
- `specs/SPIKE_RECURSIVE_GUIDE_ARCHITECTURE.md`
- `specs/SPIKE_INTEGRATIONS_AND_CALLBACK_OWNERSHIP.md`

## Active Workplans

- `workplans/SPIKE_GAP_ANALYSIS.md`
- `workplans/SPIKE_PHASE_2_BROKER_AND_SESSION_OWNERSHIP_CUTOVER_2026-03-08.md`
- `workplans/SPIKE_ASK_SUBTREE_ORCHESTRATION_AND_FINALIZATION_RCA_2026-03-06.md`
- `workplans/SPIKE_CODE_INTELLIGENCE_PLATFORM_WORKPLAN_2026-03-06.md`
- `workplans/SPIKE_CODE_INTELLIGENCE_TOOLING_WORKPLAN_2026-03-06.md`
- `workplans/SPIKE_LANGUAGE_BACKEND_DELIVERY_WORKPLAN_2026-03-06.md`
- `workplans/SPIKE_RECURSIVE_GUIDE_ARCHITECTURE_WORKPLAN_2026-03-06.md`
- `workplans/SPIKE_STRICT_COMPLETE_LIVENESS_AND_STALL_DISTINCTION_WORKPLAN_2026-03-06.md`
- `workplans/SPIKE_WORKPLAN.md`

## Active Validation

- `validation/SPIKE_VALIDATION_LADDER.md`
- `validation/SPIKE_CODE_INTELLIGENCE_VALIDATION_LADDER.md`

## Rules

1. Shared hosted platform rules live in `nexus-specs`, not in Spike-local specs.
2. Spike-local specs describe Spike-specific target state only.
3. Migration notes, residue, and temporary compromises belong in workplans or archive.
