# CPB-002 Owner Bootstrap And First-Agent Cleanroom Proof

## Goal

Prove the owner bootstrap, bootstrap-pending canonical primary agent, and
first-agent finalization flow in a disposable cleanroom.

## Acceptance

1. owner-only boot is proven in a disposable cleanroom
2. the canonical primary agent exists and is bootstrap-pending before onboarding
3. first-agent onboarding finalizes that same canonical slot in place
4. guarded runtime behavior fails before finalization and succeeds after

## Validation

- Docker-backed owner-first-agent cleanroom script
- validation ladder update for the current bootstrap model
