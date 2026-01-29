# Feature Inventory Overview

> Scope: Nexus CLI repo (`/home/projects/nexus`) + Nexus Website repo (`/home/projects/nexus-website`)  
> Includes Rust cloud engine under `native/nexus-cloud`.  
> Last updated: 2026-01-17

This is the canonical inventory of **all functionality and flows** built across Nexus.
Use it to guide stabilization, documentation, and test planning.

## CLI Feature Map (Nexus repo)

### Core commands (base CLI)
- `nexus init [workspace]` — create workspace
- `nexus status` — onboarding/status overview, filters
- `nexus capabilities` / `nexus map` — capabilities registry
- `nexus quest` — onboarding quests
- `nexus suggestions` — next‑action suggestions
- `nexus identity [user|agent]` — identity files
- `nexus config` — config path/status
- `nexus update` — updater
- `nexus log` — CLI log/diagnostic surface

### Cloud Sync (TypeScript wrapper + Rust engine)
- `nexus cloud init/login/push/pull/status/log/reset/guide`
- Rust engine: `native/nexus-cloud/cli/src/main.rs`
- TS wrapper: `src/cli/cloud-cli.ts`
- State path:
  - `$NEXUS_HOME/state/cloud` (preferred)  
  - `~/.nexus-rs/state/cloud` (fallback)

### Collaboration / Shared Spaces (Cloud)
- `nexus cloud collab keys/auth/spaces/invite-links`
- `nexus cloud spaces list/mount/unmount/push/pull`

### Skills (Local)
- `nexus skill list/info/use/verify/stats`

### Skills Hub (Remote)
- `nexus skills search/publish/install`

### Credentials & Connectors
- `nexus credential list/get/add/remove/import/scan/verify`
- `nexus connector verify/accounts`

### Usage & Telemetry
- `nexus usage upload/tracking`

### Gateway / Daemon / RPC
- `nexus gateway *` (start/stop/status/call/agent/health/wake)

### DNS / Discovery
- `nexus dns setup`

### Devices / Nodes / Browser / Canvas
- Browser CLI: `src/cli/browser-cli.ts` (+ inspect/manage/observe/actions)
- Nodes CLI: `src/cli/nodes-cli.ts` (+ camera/screen/canvas)
- Canvas CLI: `src/cli/canvas-cli.ts`

### Other CLI Modules
- Cron: `src/cli/cron-cli.ts`
- Hooks: `src/cli/hooks-cli.ts`
- Models: `src/cli/models-cli.ts`
- Pairing: `src/cli/pairing-cli.ts`
- Profile: `src/cli/profile.ts`
- Prompt: `src/cli/prompt.ts`
- TUI: `src/cli/tui-cli.ts`
- Telegram: `src/cli/telegram-cli.ts`
- Upstream sync: `src/cli/upstream-sync-cli.ts`
- Wait: `src/cli/wait.ts`

## Cloud Engine (Rust /native/nexus-cloud)

Crates:
- `api`, `core`, `crypto`, `storage`, `sync`, `chunker`, `cli`, `daemon`

State files (encrypted unless noted):
- `keys.enc`, `auth-keypair.enc`, `collab-keys.enc`, `space-secrets.enc`
- `website-auth.enc`
- `config.json`, `index.db`, `spaces/*.json`

Key behaviors:
- All encryption keys remain local; server never receives plaintext.
- Space keys are per‑member and must be resealed on key rotation.

## Website Feature Map (nexus-website repo)

### Auth & Sessions
- `/api/auth/*` Auth.js handlers  
- `/login` (magic links, OAuth)
- CLI auth flow: `/auth/cli`, `/api/cli/token`
- Token validation: `/api/validate-token`

### Dashboard & Account
- `/dashboard` main UI
- `/dashboard/settings` (profile, recovery phrase, usage tracking)
- `/dashboard/tokens` (API tokens)
- `/dashboard/skills` + admin panels

### Cloud Sync
- `/api/cloud/token` (cloud token exchange)
- `/api/usage/upload`
- `/api/usage/settings`

### Collaboration
- `/api/spaces` (list/create)
- `/api/spaces/$id/key`
- `/api/spaces/$id/members/*`
- `/api/spaces/$id/invite-links/*`
- `/api/connections/*`
- `/api/invite-links/$token/accept`
- `/invite/$token` UI flow

### Skills Hub
- `/skills` browse/search
- `/skills/$slug` detail
- `/skills/$slug/audits` audit report
- `/api/skills/*` search/detail/download/version/review/star/flag/moderate
- `/api/skills/audits/run`
- `/api/skills/$slug/audits/rescan`
- `/api/skills/capabilities*` registry & proposals
- `/api/skills/registry/refresh`
- `/api/skills/blobs/$sha`

### Audit, Policy, Moderation
Key files:
- `app/lib/skills-audit-runner.ts`
- `app/lib/skills-policy.ts`
- `app/lib/skills-events.ts`

### Admin / Ops
- `/dashboard/admin` (usage ingestion metrics, events, opt‑outs)
- gated by `isNexusAdminEmail()` (`app/lib/skills-admin.ts`)

## Manual End‑to‑End Flows (Summary)

- Auth: magic link, OAuth, logout, CLI device auth
- Personal workspace: init/login/push/log/pull/reset
- Collaboration: create space, invite, accept, mount, push/pull, key rotation
- Skills Hub: publish, search, install, audits, review/flag
- Usage: upload, settings, admin monitoring
- Gateway/DNS/Tools: service health, discovery, verification
