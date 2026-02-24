# Channel Adapter Migration Tracker

**Status:** ACTIVE IMPLEMENTATION TRACKER  
**Last Updated:** 2026-02-21  
**Related:** `ADAPTER_SYSTEM.md`, `INBOUND_INTERFACE.md`, `OUTBOUND_INTERFACE.md`, `../nex/CONTROL_PLANE.md`

---

## Purpose

Track migration from in-process channel runtimes to **NEX external adapters** (monitor/send/backfill/health/accounts) so all agent work enters through `NexusEvent -> nex.processEvent(...)`.

---

## Canonical Decisions (Locked)

- Single daemon: NEX runtime + control-plane in one process.
- External ingress must be adapters (no privileged bypass path).
- No backward-compat requirement with legacy gateway/openclaw daemon shapes.
- IAM is the only approval/authorization boundary.
- Upstream behavior parity for channel adapters is pinned to OpenClaw baseline commit `fd8c6d1f77a2ab8366a3e02ae1626f3d87c733e9`.
- Adapter parity work must compare against latest upstream OpenClaw channel implementations, not legacy in-process `nex` channel/plugin code.
- Channel policy/gating logic lives in IAM + automation/manager layers, not inside external adapter binaries.

---

## Upstream Baseline Lock

### Canonical Upstream Baseline

- Repo: `openclaw/openclaw`
- Branch: `main`
- Locked baseline SHA: `fd8c6d1f77a2ab8366a3e02ae1626f3d87c733e9`
- Merge-base against current `nex`: `0efaf5aa8215de281ebe6f4097c6e2021a1dc5fe`

### Required Porting Rule

For Discord/Slack/Signal/Telegram parity work:

1. Use `openclaw/src/<channel>` as source-of-truth behavior.
2. Port only IO adapter behavior into external adapter binaries.
3. Do not re-import in-process plugin policy/approval logic into adapters.

### Update Procedure

When baseline is bumped:

1. Record new SHA in this file.
2. Produce adapter delta summary (Discord/Slack/Signal/Telegram/iMessage).
3. Update migration tasks with explicit “upstream delta required” items before code changes.

---

## Current Snapshot

As of 2026-02-21:

- `eve` has a real adapter binary in `home/projects/eve/cmd/eve-adapter/main.go`.
- `gog-adapter` now exists as a **separate wrapper project** at `home/projects/nexus/nexus-adapter-gog/` (shells out to the `gog` binary; does not modify upstream `gogcli`).
- `discord` adapter exists as a standalone project at `home/projects/nexus/nexus-adapter-discord/`.
- `telegram` adapter now exists as a standalone project at `home/projects/nexus/nexus-adapter-telegram/`.
- `whatsapp` adapter now exists as a standalone project at `home/projects/nexus/nexus-adapter-whatsapp/`.
- `nex` adapter protocol parser now enforces strict v2 adapter payloads (canonical flat event + canonical delivery result); legacy adapter output acceptance was removed.
- Telegram and WhatsApp adapter repos include command-level contract smokes (info/send/event-shape/health behavior).
- WhatsApp adapter now requires standard `@whiskeysockets/baileys` dependency resolution (fallback loader removed).
- Telegram/WhatsApp in-process extension monitor startup hooks (`runtime.startAccount`) were removed.
- `config.json` now includes Telegram and WhatsApp adapter bootstrap entries (monitor disabled by default until credentials are configured).
- Clock/timer is implemented as an internal runtime adapter/service (periodic `clock.tick` NexusEvents), not an external process.

---

## Priority Order

1. **Eve (iMessage) adapter runtime cutover**
2. **Gog (Gmail) adapter implementation**
3. **Discord adapter extraction**
4. **Telegram adapter extraction**
5. **WhatsApp adapter extraction**
6. **HTTP ingress adapters (webhook/OpenAI/OpenResponses)**
7. **Clock/timer internal adapter hardening**

---

## Channel Status Matrix

| Channel | Adapter Binary | Runtime Integrated as Adapter | In-Process Channel Still Active | Notes |
|--------|----------------|-------------------------------|----------------------------------|------|
| iMessage (eve) | ✅ (`eve-adapter`) | ⚠️ Partial | ✅ | Adapter exists; runtime fallback/default alignment needed per environment |
| Gmail (gog) | ✅ (`gog-adapter` wrapper) | ⚠️ Partial | ⚠️ Hook watcher path | Wrapper exists; requires valid gog OAuth client + account watch state; NEX config + cutover pending |
| Discord | ✅ (`nexus-adapter-discord`) | ⚠️ Partial | ✅ (`extensions/discord`) | Adapter binary exists; cutover parity + config wiring still in progress |
| Telegram | ✅ (`nexus-adapter-telegram`) | ⚠️ Partial | ⚠️ Extension remains for outbound/status only (monitor startup removed) | Adapter binary + contract smokes landed; runtime bootstrap wired; live credentialed E2E pending |
| WhatsApp | ✅ (`nexus-adapter-whatsapp`) | ⚠️ Partial | ⚠️ Extension remains for outbound/status only (monitor startup removed) | Adapter binary + contract smokes landed; runtime bootstrap wired; live credentialed E2E pending |
| Clock/Timer | ✅ (internal `clock` service) | ✅ | ⚠️ Legacy cron concepts remain in docs/tests | Emits periodic `clock.tick` events; scheduler behavior stays in automations |
| HTTP Webhook bridge | ❌ | ❌ | ⚠️ Control-plane routes | Must become adapter process |
| OpenAI/OpenResponses bridge | ❌ | ❌ | ⚠️ Control-plane routes | Must become adapter process |

---

## Workstream A: Eve (P0)

### Baseline

- Adapter implementation present in Eve repo.
- Local machine check:
  - `eve-adapter` was not on PATH.
  - `go build ./cmd/eve-adapter` succeeds from `home/projects/eve`.

### Completed

- NEX fallback default command changed from `eve` -> `eve-adapter`.
  - `nex/src/nex/runtime.ts`
  - `nex/src/nex/nex.ts`
  - tests updated and passing:
    - `nex/src/nex/runtime.test.ts`
    - `nex/src/nex/nex.monitor-bootstrap.test.ts`

### Remaining

- Ensure runtime config (`config.json`) points to correct Eve adapter command/path for target environments.
- Add adapter contract smoke in NEX e2e suite (`info`, monitor startup, send dry-run, health).

---

## Workstream B: Gog (P0)

### Completed

- Created wrapper project in Nexus monorepo:
  - `home/projects/nexus/nexus-adapter-gog/`
- Adapter shells out to `gog` (no `gogcli` source modifications).
- Implemented protocol commands:
  - `info`
  - `monitor --account ... --format jsonl` (polls `gog gmail history` seeded from `gog gmail watch status`)
  - `send --account ... --to ... --text ...` (maps to `gog gmail send`)
  - `health --account ...` (basic Gmail labels list probe)
  - `accounts list` (maps to `gog auth list`)
- Uses `nexus-adapter-sdk-go`.
- Build/test status:
  - `go test ./...` passes in `nexus-adapter-gog`

### Remaining

- Configure `config.json` adapter bootstrap entry for `gog-adapter` accounts in target environments.
- Add NEX e2e contract smoke for Gmail adapter lifecycle (`info`, monitor startup, send dry-run, health).
- Fix/refresh gog OAuth client credentials and re-authorize accounts (currently some environments return `oauth2: "deleted_client"`).
- Ensure `gog gmail watch start` has been run for target accounts (monitor seeds from watch status historyId).
- Remove remaining Gmail hook watcher dependency from runtime once adapter path is confirmed stable.

### Cutover Criteria

- NEX can run Gmail inbound/outbound only via adapter manager (no hook watcher dependency).

---

## Workstream C: Discord / Telegram / WhatsApp (P1)

### Baseline

- Current channel implementations are in-process plugins (`nex/extensions/*`).
- Inbound flows still go through legacy auto-reply dispatch paths.

### Completed (This Pass)

- Added standalone Telegram adapter project:
  - `home/projects/nexus/nexus-adapter-telegram/`
  - Implements: `info`, `monitor`, `send`, `health`, `accounts list`
  - Outbound thread + reply handling wired (`--thread` -> `message_thread_id`, `--reply-to` -> `reply_to_message_id`)
  - Contract smokes added and passing (`npm test`)
- Added standalone WhatsApp adapter project:
  - `home/projects/nexus/nexus-adapter-whatsapp/`
  - Implements: `info`, `monitor`, `send`, `health`, `accounts list`
  - Outbound reply handling wired (`--reply-to` best-effort quoted message mapping)
  - Contract smokes added and passing (`npm test`)
  - Removed fallback module loading; requires standard `@whiskeysockets/baileys` dependency
- Tightened NEX adapter boundary parsing to strict v2:
  - Removed legacy adapter payload acceptance in `nex/src/nex/adapters/protocol.ts`
  - Updated adapter parser tests and monitor supervision fixtures to canonical v2 output
- Wired runtime bootstrap entries in `config.json` for Telegram + WhatsApp (`/Users/tyler/nexus/bin/nexus-adapter-telegram`, `/Users/tyler/nexus/bin/nexus-adapter-whatsapp`)
- Removed in-process Telegram + WhatsApp monitor startup hooks in extension plugins:
  - `nex/extensions/telegram/src/channel.ts`
  - `nex/extensions/whatsapp/src/channel.ts`

### Strategy

- Extract each channel to adapter binaries with same monitor/send semantics.
- Reuse existing normalization/outbound logic from extension internals where possible.
- Keep control-plane channel UI/account management until adapter parity is complete.

### Per-Channel Minimum Contract

- `info`
- `monitor` (JSONL NexusEvent)
- `send`
- `health`
- `accounts list`

### Deletion Target

- Remove corresponding in-process `runtime.startAccount` monitor path after adapter parity.

### Remaining

- Run live credentialed E2E for Telegram + WhatsApp via adapter manager path.
- Remove residual Telegram/WhatsApp extension monitor-era codepaths once outbound/status parity is fully migrated.

---

## Workstream D: Ingress Adapters (P1)

Required built-in adapter processes:

- HTTP webhook ingress adapter
- OpenAI compatibility adapter
- OpenResponses compatibility adapter

All inbound payloads normalize to `NexusEvent` and enter pipeline via adapter manager.

---

## Workstream E: Clock/Timer Internal Adapter (P1)

Current state includes cron/timer service behavior in runtime.

Target state:

- Internal clock service emits periodic `clock.tick` `NexusEvent`s.
- No external clock process is required.
- IAM policies for `system`/`timer` principals gate automation execution.
- Automations/hooks are the behavior layer; scheduler emits events only.

---

## Validation Checklist (Global)

- [ ] Adapter contract test for each migrated adapter (`info`, `monitor`, `send`, `health`, `accounts list`)
- [ ] Inbound events recorded in `events.db` with correct source/channel metadata
- [ ] Access decisions logged in ACL audit for adapter-originated requests
- [ ] Agent execution trace visible in `nexus_requests` for adapter-originated requests
- [ ] No direct legacy agent-execution bypass path remains for migrated channels

---

## Immediate Next Execution Targets

1. Run live credentialed Telegram monitor/send E2E (monitor currently disabled pending token).
2. Run live credentialed WhatsApp monitor/send E2E (monitor currently disabled pending linked auth dir).
3. Continue Discord parity hardening (upstream deltas + config cutover).
4. Remove residual extension monitor-era codepaths after adapter-only runtime parity pass.
