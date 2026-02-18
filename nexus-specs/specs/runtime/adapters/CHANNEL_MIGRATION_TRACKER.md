# Channel Adapter Migration Tracker

**Status:** ACTIVE IMPLEMENTATION TRACKER  
**Last Updated:** 2026-02-16  
**Related:** `ADAPTER_SYSTEM.md`, `ADAPTER_INTERFACES.md`, `../nex/CONTROL_PLANE.md`

---

## Purpose

Track migration from in-process channel runtimes to **NEX external adapters** (monitor/send/backfill/health/accounts) so all agent work enters through `NexusEvent -> nex.processEvent(...)`.

---

## Canonical Decisions (Locked)

- Single daemon: NEX runtime + control-plane in one process.
- External ingress must be adapters (no privileged bypass path).
- No backward-compat requirement with legacy gateway/openclaw daemon shapes.
- IAM is the only approval/authorization boundary.

---

## Current Snapshot

As of 2026-02-16:

- `eve` has a real adapter binary in `home/projects/eve/cmd/eve-adapter/main.go`.
- `gog-adapter` now exists as a **separate wrapper project** at `home/projects/nexus/nexus-adapter-gog/` (shells out to the `gog` binary; does not modify upstream `gogcli`).
- `nex` adapter protocol parser now accepts both modern nested events and legacy flat SDK payloads (compat bridge during migration).
- Discord/Telegram/WhatsApp are still in-process plugin channels under `nex/extensions/*`.
- Clock/timer exists as cron/timer service patterns in runtime code; no adapter process yet.

---

## Priority Order

1. **Eve (iMessage) adapter runtime cutover**
2. **Gog (Gmail) adapter implementation**
3. **Discord adapter extraction**
4. **Telegram adapter extraction**
5. **WhatsApp adapter extraction**
6. **HTTP ingress adapters (webhook/OpenAI/OpenResponses)**
7. **Clock/timer adapter**

---

## Channel Status Matrix

| Channel | Adapter Binary | Runtime Integrated as Adapter | In-Process Channel Still Active | Notes |
|--------|----------------|-------------------------------|----------------------------------|------|
| iMessage (eve) | ✅ (`eve-adapter`) | ⚠️ Partial | ✅ | Adapter exists; runtime fallback/default alignment needed per environment |
| Gmail (gog) | ✅ (`gog-adapter` wrapper) | ⚠️ Partial | ⚠️ Hook watcher path | Wrapper exists; requires valid gog OAuth client + account watch state; NEX config + cutover pending |
| Discord | ❌ | ❌ | ✅ (`extensions/discord`) | Monitor/send currently in plugin runtime |
| Telegram | ❌ | ❌ | ✅ (`extensions/telegram`) | Poll/webhook flows currently plugin runtime |
| WhatsApp | ❌ | ❌ | ✅ (`extensions/whatsapp`) | Web runtime + login methods currently plugin runtime |
| Clock/Timer | ❌ | ❌ | ⚠️ Cron/timer service | Needs explicit adapter shape and cutover |
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

- Ensure runtime config (`nex.yaml`) points to correct Eve adapter command/path for target environments.
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

- Configure `nex.yaml` adapter bootstrap entry for `gog-adapter` accounts in target environments.
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

---

## Workstream D: Ingress Adapters (P1)

Required built-in adapter processes:

- HTTP webhook ingress adapter
- OpenAI compatibility adapter
- OpenResponses compatibility adapter

All inbound payloads normalize to `NexusEvent` and enter pipeline via adapter manager.

---

## Workstream E: Clock/Timer Adapter (P1)

Current state includes cron/timer service behavior in runtime.

Target state:

- Dedicated adapter process emits timer/heartbeat/scheduled `NexusEvent`s.
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

1. Add NEX adapter e2e smoke for `eve-adapter` + config wiring.
2. Add NEX adapter e2e smoke for `gog-adapter` + config wiring.
3. Start Discord adapter extraction plan (monitor + send first, backfill optional).
