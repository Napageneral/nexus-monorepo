# Upstream Reference Documents

This folder contains documentation of **upstream clawdbot/moltbot behavior** for reference when designing Nexus systems.

These documents capture how the upstream codebase works, not how Nexus should work.

## Documents

| Document | Description |
|----------|-------------|
| `UPSTREAM_WORKSPACE.md` | Workspace structure, bootstrap files, onboarding flow |
| `UPSTREAM_GATEWAY_CHANNELS.md` | Gateway server, channel plugins, service management |

## Usage

These documents are **reference only**. The authoritative Nexus specs are in the parent folder:
- `WORKSPACE_SYSTEM.md` — Nexus workspace spec
- `../harnesses/HARNESS_BINDINGS.md` — Nexus harness bindings
- etc.

## Note on Drift

The upstream codebase evolves independently. These documents may become outdated.

- **Source commit:** `80c1edc3ff43b3bd3b7b545eed79f303d992f7dc` (as of 2026-01-22)
- **Upstream repo:** `moltbot` / `pi-mono/packages/coding-agent`

When upstream behavior changes significantly, update these documents.
