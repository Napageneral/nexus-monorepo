# Spike Docs

This directory is the active documentation tree for Spike.

It owns Spike-specific product docs.

Shared governance and platform docs live in:

- [/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md](/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md)
- [/Users/tyler/nexus/home/projects/nexus/nex/docs/index.md](/Users/tyler/nexus/home/projects/nexus/nex/docs/index.md)
- [/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/README.md](/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/README.md)

It follows the canonical workflow in
`docs/governance/spec-driven-development-workflow.md`:

- `specs/` contains active target-state Spike docs only
- `workplans/` contains active gap-closure and alignment plans
- `validation/` contains active validation ladders
- `archive/` contains superseded Spike docs kept only for history

## Active Specs

- `specs/SPIKE_OBJECT_TAXONOMY.md`
- `specs/SPIKE_APP_AND_PACKAGE_MODEL.md`
- `specs/SPIKE_DOWNSTREAM_API_AND_SDK_CONTRACT.md`
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

- `workplans/SPIKE_CODE_APP_WORKPLAN.md`

## Active Validation

- `validation/SPIKE_VALIDATION_LADDER.md`
- `validation/SPIKE_CODE_INTELLIGENCE_VALIDATION_LADDER.md`

## Current Status

The major Spike cutovers are complete:

- PRLM/broker removal
- record-driven git reconcile
- private repo clone/fetch through Nex-managed `connection_id`
- PR head durability and source-archive-backed replay
- replay-safe code snapshot builds
- agent-facing Spike skill creation

The main remaining Spike-local follow-up items are:

- final package/manifest alignment after the shared Nex `connection_id` cutover
- downstream contract publication and maintenance

## Rules

1. Shared platform rules live in the active Nex and Frontdoor docs, not in Spike-local specs.
2. Spike-local specs describe Spike-specific target state only.
3. Migration notes, residue, and temporary compromises belong in workplans or archive.
