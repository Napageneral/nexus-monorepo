# Canonical Decisions

This doc tracks the umbrella‑level decisions that must remain consistent across
repos and docs.

## Skills

- **Layout**: `skills/{tools,connectors,guides}` (no `skills/managed` folder).
- **Usage**: `nexus skill use <name>` returns SKILL.md; tools run directly.
- **Types**: `metadata.nexus.type` is required for hub installs.
- **Connectors**: represent credential setup, not execution.

## Identity + Memory

- **User identity**: `state/user/IDENTITY.md`.
- **Agent identity**: `state/agents/{name}/IDENTITY.md`.
- **Bootstrap**: Cursor hooks inject identity + memory at session start.

## Credentials

- Stored as **pointers** (env, keychain, 1password).
- Verified per‑service with `nexus credential verify`.

## Capabilities

- **Source of truth**: `nexus-website` owns taxonomy + registry.
- **Distribution**: CLI consumes published snapshots (planned).
- **Local view**: CLI merges local skill readiness with registry taxonomy.

## Open Questions

- Snapshot cadence and rollback strategy for taxonomy updates.
- Capability naming guarantees vs emergent proposals.
- How to validate hub‑published skills against taxonomy changes.
