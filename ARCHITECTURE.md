# Nexus Cross-Repo Architecture

This document explains how the Nexus repos fit together. Treat it as the
cross-repo source of truth for system boundaries, data flow, and ownership.

## Repo Map (Umbrella)

- `nexus-cli`
  - Local CLI + workspace bootstrap
  - Skill loading + capability detection
  - Cursor hooks and session binding
  - Gateway, usage, and local tooling

- `nexus-cloud`
  - Encrypted sync engine + daemon (Rust + TS)
  - Personal workspace backup + shared spaces
  - Cloud token exchange and local key handling

- `nexus-website`
  - Nexus Hub (skills registry + publishing)
  - Capability taxonomy registry + proposals
  - Auth, workspace tokens, usage telemetry
  - Admin/audit pipelines

- `nexus-collab`
  - Realtime collaboration layer (PartyKit + Yjs)
  - Shared spaces presence + encrypted document sync

## System Boundaries

1. **Local workspace + identity** (CLI)
   - Cursor sessionStart hook injects identity + memory.
   - `nexus status` is the bootstrap contract.
   - Skills are guides, not execution wrappers.

2. **Skills + capabilities** (Hub)
   - Canonical registry of capabilities lives in `nexus-website`.
   - Skills (local + hub) declare `metadata.nexus.provides`.
   - CLI consumes a published registry snapshot (planned).

3. **Cloud sync + collaboration** (Cloud + Collab)
   - `nexus-cloud` handles encrypted backup + shared spaces.
   - `nexus-collab` handles realtime presence + shared state.

## Shared Contracts

- **Workspace root**: `NEXUS_ROOT` (default `~/nexus`)
- **State root**: `NEXUS_STATE_DIR` (default `~/nexus/state`)
- **Identity files**: `state/user/IDENTITY.md`, `state/agents/{id}/IDENTITY.md`
- **Skills layout**: `skills/{tools,connectors,guides}`

## Integration Points

- CLI → Hub API:
  - Skill search/install/publish
  - Capability registry snapshots (planned)

- CLI → Cloud:
  - `nexus cloud` forwards to Rust CLI
  - Tokens provisioned via Hub

- Website → Collab:
  - Shared space provisioning and presence

## Source of Truth (Planned)

- **Skills + capability taxonomy**: `nexus-website`
- **Local runtime state**: `nexus-cli`
- **Encrypted sync format**: `nexus-cloud`
- **Realtime shared state**: `nexus-collab`

## Next Consolidation Targets

- Publish capability registry from `nexus-website` and consume in `nexus-cli`.
- Unify skill manifests across CLI + Hub (format + validation).
- Formalize CLI grammar vs implemented commands (core vs extended).

## Umbrella Docs

See `docs/README.md` for the cohesive story, flows, and roadmap.
