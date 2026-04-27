# Google Business Profile Row Parity Board

This board tracks the implementation and validation work needed to land a
shared `google-business-profile` adapter package in Nex.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-business-profile-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/acquisition-adapter-package-alignment.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`

Scope:

- isolate Google Business Profile from the mixed legacy `google` package
- lock the GBP auth and provider-access model
- emit row-shaped account, location, performance, and review families
- preserve immutable-arrival identity and replay-safe sync behavior
- validate against real Google credentials if available

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

In Progress:

- `GBP-001`
- `GBP-005`

Not Started:

1. `GBP-002`
2. `GBP-003`
3. `GBP-004`
4. `GBP-006`

Current blocker:

- live Google OAuth now includes `business.manage`, but Google Business
  Profile Account Management still returns `429 RESOURCE_EXHAUSTED` with
  `quota_limit_value = 0` for project `822804320930`, so credential proof is
  blocked on GBP project access rather than adapter code

## Execution Order

The default sequence for this board is:

1. lock the package boundary, auth model, and official provider surfaces
2. scaffold the dedicated package and health path
3. land account, location, performance, and review row families
4. implement replay-safe backfill and monitor semantics
5. validate with cleanroom and sampled upstream parity
6. sync docs, validation corpus, and signoff
