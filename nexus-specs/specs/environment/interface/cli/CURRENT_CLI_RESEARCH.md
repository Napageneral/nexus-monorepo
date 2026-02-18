# Current `nex` CLI Research

**Generated:** 2026-02-12  
**Source:** `nex/src/cli/`, `nex/src/config/paths.ts`

---

## Scope

This document records the current implementation snapshot in `nex` and highlights drift from canonical environment specs.

It is descriptive, not normative.

---

## Registration Surfaces

### Primary program registry

`src/cli/program/command-registry.ts` registers:
- `init`
- `setup`
- `onboard`
- `configure`
- `config`
- `credential`
- `capabilities`
- `identity`
- `maintenance`
- `message`
- `memory`
- `agent`
- `status` / `health` / `sessions` routes
- `browser`
- lazy subcommand loader via `subclis`

### Lazy subcommand registry

`src/cli/program/register.subclis.ts` currently includes:
- `acp`
- `runtime`
- `daemon`
- `nex`
- `logs`
- `system`
- `models`
- `approvals`
- `nodes`
- `devices`
- `node`
- `sandbox`
- `tui`
- `cron`
- `dns`
- `docs`
- `hooks`
- `acl`
- `automation`
- `webhooks`
- `pairing`
- `plugins`
- `channels`
- `directory`
- `security`
- `skills`
- `update`
- `completion`

---

## Runtime Naming Snapshot

Current implementation exposes `runtime` as the canonical command group, with major user-facing wording now shifted to runtime/control-plane language.

Relevant file:
- `src/cli/gateway-cli/register.ts`
- `src/wizard/onboarding.gateway-config.ts`
- `src/commands/configure.wizard.ts`

Spec drift:
- canonical docs use `runtime` / `control-plane`
- implementation still has mixed runtime + gateway wording in some legacy subcommand surfaces and internals (notably gateway-status/status-all/health-adjacent paths and some onboarding option names)

---

## Config Path Snapshot

Current config defaults in `src/config/paths.ts`:
- state dir default: `~/nexus/state`
- config filename: `config.json` under `state/nexus/`
- default config path: `~/nexus/state/nexus/config.json`

Current drift:
- default path aligns with canonical path
- legacy env aliases and legacy state directory fallback logic still exist in path resolution

Related implementation touchpoints:
- `src/config/paths.ts`
- `src/cli/profile.ts`
- tests under `src/config/*` and `src/cli/*` that assert `nexus.json`

---

## Drift Summary vs Canonical Spec

| Area | Canonical | Current Snapshot |
|------|-----------|------------------|
| Runtime command namespace | `runtime` | `runtime` (with gateway legacy internals) |
| Config path default | `state/nexus/config.json` | `state/nexus/config.json` (plus legacy fallbacks) |
| Root orientation commands | `status/capabilities/identity/credential/config/init` | implemented in root registry (including `config list/get/set`) |
| Status JSON naming | runtime/control-plane terms | now emits `runtime` / `runtimeService` keys (not `gateway*`) |
| Terminology in help/docs | runtime/control-plane | substantial runtime wording pass complete (status/config/runtime/doctor/onboarding/channels/daemon + key CLI surfaces); residual gateway-heavy wording remains in legacy gateway-status/status-all/health-adjacent surfaces and deeper internals |

---

## Alignment Work (Implementation)

1. Complete gateway -> runtime terminology cleanup across remaining user-facing text (focused on legacy gateway-status and status-all/health-adjacent output).
2. Remove legacy path/env alias behavior under big-bang contract.
3. Align config schema top-level domains to canonical contract.
4. Keep this research doc updated as the implementation converges.
