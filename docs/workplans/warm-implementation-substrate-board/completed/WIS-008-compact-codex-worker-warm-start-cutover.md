# WIS-008 Compact Codex Worker Warm-Start Cutover

## Goal

Make compact sandbox-hosted Codex workers assume warm startup instead of
spending their budget on environment repair or dependency bring-up.

## Scope

- align the compact worker startup posture to warm substrate assumptions
- keep auth seeding and runtime-home behavior compatible with warm startup
- remove avoidable worker-side install or provisioning expectations from the
  implementation hot path
- preserve compact prompt hygiene while reducing startup waste

## Acceptance

- compact implementation workers start with dependencies and core repo tooling
  already ready
- worker startup receipts show warm substrate provenance
- the implementation worker budget is spent primarily on code work and focused
  checks rather than substrate triage
