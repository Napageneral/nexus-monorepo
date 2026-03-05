# Workplan: Drops, Extractions, and Namespace Renames

**Status:** COMPLETED — commit 213d119a0
**Created:** 2026-03-04
**Spec References:**
- [API_DESIGN_BATCH_6.md](../API_DESIGN_BATCH_6.md) (TTS extraction, wizard deferred, browser deferred)
- [TTS_EXTRACTION.md](../TTS_EXTRACTION.md) (standalone package extraction seed spec)
- [WIZARD_REDESIGN.md](../WIZARD_REDESIGN.md) (deferred redesign seed spec)
- [API_DESIGN_BATCH_5.md](../API_DESIGN_BATCH_5.md) (dropped operations: usage, capabilities, packs, devices, skills deferred)
- [CUTOVER_06_REPLY_DELETION_AND_CLEANUP.md](./CUTOVER_06_REPLY_DELETION_AND_CLEANUP.md) (Part E: SenderContext/ReceiverContext removal)
- [RESOLVED_DECISIONS.md](../RESOLVED_DECISIONS.md) (plural naming everywhere)
- [API_DESIGN_BATCH_2.md](../API_DESIGN_BATCH_2.md) (data_access purge)

**Dependencies:** None. This workplan can start anytime, but should finish LAST after all other workplans land so that removed operations are not accidentally re-introduced and renames are applied to the final codebase state.

---

## Goal

Clean sweep of everything being dropped, extracted, or renamed that is not covered by other workplans. This is the cleanup workplan. Categories:

1. **TTS Extraction** -- remove 8 operations and source code from Nex, extract to standalone npm package
2. **Dropped Operations** -- fully remove all dead operations (usage, capabilities, packs, devices, skills deferred, delivery.poll, system-presence, etc.)
3. **Namespace Renames** -- singular-to-plural domain names across the entire codebase
4. **Legacy Purge Verification** -- confirm zero functional references to data_access, events.stream handler, system-presence
5. **Dead Code Removal** -- voicewake, talk mode, clock.schedule (superseded by cron), work.* (superseded by jobs/cron/dags)
6. **CUTOVER_06 Part E Completion** -- SenderContext/ReceiverContext removal (cross-referenced, tracked there)

---

## Current State

### TTS / Speech Code

8 operations registered in `STATIC_RUNTIME_OPERATION_TAXONOMY`:
- `tts.status`, `tts.enable`, `tts.disable`, `tts.convert`, `tts.setProvider`, `tts.providers`
- `talk.config` (NOT currently registered, but referenced in TTS_EXTRACTION.md), `talk.mode`

Source files:
- `nex/src/tts/tts.ts` -- TTS service (Edge TTS, OpenAI, ElevenLabs providers, auto-fallback)
- `nex/src/tts/tts.test.ts` -- TTS tests
- `nex/src/nex/control-plane/server-methods/tts.ts` -- TTS RPC handlers (tts.status, tts.enable, tts.disable, tts.convert, tts.setProvider, tts.providers)
- `nex/src/nex/control-plane/server-methods/talk.ts` -- Talk mode RPC handlers (talk.mode, talk.config)
- `nex/src/nex/control-plane/server-methods/voicewake.ts` -- Voice wake handlers (voicewake.get, voicewake.set)
- Agent tool registered as `tts` in agent tool registry

Taxonomy entries in `runtime-operations.ts` (lines 356-364):
```
"talk.mode", "tts.status", "tts.providers", "tts.enable", "tts.disable",
"tts.convert", "tts.setProvider", "voicewake.get", "voicewake.set"
```

Runtime events referencing speech: `"talk.mode"`, `"voicewake.changed"` in `RUNTIME_EVENTS` array.

### Usage Operations

5 operations registered in `STATIC_RUNTIME_OPERATION_TAXONOMY` (lines 209-213):
- `usage.status`, `usage.cost`, `sessions.usage`, `sessions.usage.timeseries`, `sessions.usage.logs`

Source files:
- `nex/src/nex/control-plane/server-methods/usage.ts` -- Usage RPC handlers
- `nex/src/nex/control-plane/server-methods/usage.test.ts` -- Usage handler tests
- `nex/src/nex/control-plane/server-methods/usage.sessions-usage.test.ts` -- Sessions usage tests

### Capabilities Operations

No standalone `capabilities.*` operations currently registered (already absent from taxonomy). Verify no handler code exists.

Source files to check:
- `nex/src/nex/control-plane/server-methods/adapter-capabilities.ts` -- May contain leftover capability logic

### Packs Operations

No `packs.*` operations currently registered. Verify no handler code or CLI commands remain.

### Device Operations

8 operations registered in `STATIC_RUNTIME_OPERATION_TAXONOMY` (lines 338-345):
- `device.pair.list`, `device.pair.approve`, `device.pair.reject`
- `device.token.rotate`, `device.token.revoke`
- `device.host.list`, `device.host.describe`, `device.host.invoke`

Source files:
- `nex/src/nex/control-plane/server-methods/devices.ts` -- Device pairing handlers
- `nex/src/nex/control-plane/server-methods/devices.test.ts` -- Device tests
- `nex/src/nex/control-plane/server-methods/device-host.ts` -- Device host handlers
- `nex/src/nex/control-plane/server-methods/device-host.test.ts` -- Device host tests
- `nex/src/nex/control-plane/server-methods/nodes.helpers.ts` -- Node/device helper functions

Runtime events referencing devices: `"device.pair.requested"`, `"device.pair.resolved"` in `RUNTIME_EVENTS` array.

### Skills Deferred Operations

3 operations currently registered in `STATIC_RUNTIME_OPERATION_TAXONOMY` (lines 240-242):
- `skills.status`, `skills.install`, `skills.update`

Per Batch 5, `skills.install` and `skills.update` are dropped/deferred. `skills.status` needs renaming to align with the new taxonomy (`skills.list`, `skills.use`, `skills.search`).

Source files:
- `nex/src/nex/control-plane/server-methods/skills.ts` -- Skills RPC handlers

### delivery.poll

1 operation registered (line 146): `"delivery.poll"`

Also in `EXTERNAL_ADAPTER_OPERATION_IDS` array (line 39): `"delivery.poll"`

Source files:
- `nex/src/nex/control-plane/server-methods/adapter-capabilities.ts` -- References delivery.poll

### system-presence

2 operations registered (lines 89-95): `"system-presence"`, `"system.presence"`

Source files (10 files reference system-presence):
- `nex/src/infra/system-presence.ts` -- System presence module
- `nex/src/infra/system-presence.test.ts` -- Tests
- `nex/src/nex/control-plane/server-methods/system.ts` -- System handler
- `nex/src/nex/control-plane/runtime-operations.ts` -- Taxonomy entries
- `nex/src/nex/control-plane/server.health.e2e.test.ts`
- `nex/src/nex/control-plane/server/ws-connection/message-handler.ts`
- `nex/src/nex/control-plane/server/ws-connection.ts`
- `nex/src/cli/runtime-cli/register.ts`
- `nex/src/cli/system-cli.ts`
- `nex/src/nex/control-plane/server/health-state.ts`
- `nex/src/nex/control-plane/probe.ts`

### events.stream

1 operation registered (lines 96-101): `"events.stream"`

Target: replaced by `pubsub.subscribe` (WP11). Verify handler removal.

### Singular Namespace Operations (Current)

Operations using singular domain names that must be renamed to plural:

| Current (singular) | Target (plural) |
|-------------------|-----------------|
| `event.ingest` | `events.ingest` |
| `event.backfill` | `events.backfill` |
| `agent.identity.get` | `agents.identity.get` |
| `agent.wait` | `agents.wait` |
| `adapter.connections.*` (13 ops) | `adapters.connections.*` (13 ops) |

These are registered in `STATIC_RUNTIME_OPERATION_TAXONOMY` and referenced across:
- Operation registry (`runtime-operations.ts`)
- RPC handler dispatch (message handler, HTTP control handlers)
- IAM resource definitions (authz-taxonomy)
- CLI commands (runtime-cli, system-cli)
- Test files (e2e and unit tests)
- `HTTP_INGRESS_OPERATION_IDS` (`"event.ingest"`)
- `EXTERNAL_ADAPTER_OPERATION_IDS` (`"event.backfill"`)

### Work Operations (Superseded by Jobs/Cron/DAGs)

17 operations in `WORK_CONTROL_OPERATION_IDS` and `STATIC_RUNTIME_OPERATION_TAXONOMY` (lines 279-308):
- `work.tasks.list`, `work.tasks.create`
- `work.entities.seed`
- `work.workflows.list`, `work.workflows.create`, `work.workflows.instantiate`
- `work.campaigns.instantiate`
- `work.items.list`, `work.items.get`, `work.items.create`, `work.items.events.list`, `work.items.assign`, `work.items.snooze`, `work.items.complete`, `work.items.cancel`
- `work.sequences.list`, `work.sequences.get`
- `work.dashboard.summary`

Source files:
- `nex/src/nex/control-plane/server-methods/work.ts` -- Work CRM handlers
- `nex/src/nex/control-plane/server-methods/work.test.ts` -- Work CRM tests

Note: work.* operations are being REPLACED by jobs.*, cron.*, and dags.* domains in WP_WORK_DOMAIN_UNIFICATION. The removal of work.* registrations is tracked HERE; the addition of new domains is tracked THERE.

### Clock Schedule Operations (Superseded by Cron)

8 operations registered (lines 328-335):
- `clock.schedule.wake`, `clock.schedule.list`, `clock.schedule.status`
- `clock.schedule.create`, `clock.schedule.update`, `clock.schedule.remove`
- `clock.schedule.run`, `clock.schedule.runs`

Source files:
- `nex/src/nex/control-plane/server-methods/clock-schedule.ts` -- Clock schedule handlers

Note: clock.schedule.* operations are being REPLACED by cron.* in WP_WORK_DOMAIN_UNIFICATION. Removal tracked here.

### config.* Operations

5 operations registered (lines 216-220):
- `config.get`, `config.schema`, `config.set`, `config.patch`, `config.apply`

Source files:
- `nex/src/nex/control-plane/server-methods/config.ts` -- Config RPC handlers

Decision: These stay as-is. Not being dropped or renamed at this time.

### update.run

1 operation registered (line 381): `"update.run"`

Source files:
- `nex/src/nex/control-plane/server-methods/update.ts` -- Update handler

Decision: Review needed. Likely stays for now (self-update mechanism) but should be revisited.

### data_access Purge Status

Per Batch 2: "data_access level REMOVED. Fully purged from codebase (2026-03-03). Zero functional references remain."

Remaining references are in spec documents only:
- `nexus-specs/specs/nex/automations/examples/types.ts` (example code, not production)
- Archived workplans and specs

### Web Login Operations (Dropped)

Unregistered handlers per Batch 5:
- `web.login.start` -- Legacy web channel login
- `web.login.wait` -- Legacy web channel login wait

Source files:
- `nex/src/nex/control-plane/server-methods/web.ts` -- Web handler (may contain these)

### channels.logout (Dropped)

Per Batch 5: superseded by `adapters.connections.disconnect`.

Source files:
- `nex/src/nex/control-plane/server-methods/channels.ts` -- May contain logout handler

---

## Target State

### Gone (Fully Removed)

**Operations deleted from taxonomy:**

| Category | Operations | Count |
|----------|-----------|-------|
| TTS/Speech | `tts.status`, `tts.enable`, `tts.disable`, `tts.convert`, `tts.setProvider`, `tts.providers`, `talk.mode`, `voicewake.get`, `voicewake.set` | 9 |
| Usage | `usage.status`, `usage.cost`, `sessions.usage`, `sessions.usage.timeseries`, `sessions.usage.logs` | 5 |
| Devices | `device.pair.list`, `device.pair.approve`, `device.pair.reject`, `device.token.rotate`, `device.token.revoke`, `device.host.list`, `device.host.describe`, `device.host.invoke` | 8 |
| Skills (deferred) | `skills.install`, `skills.update` | 2 |
| Delivery | `delivery.poll` | 1 |
| Runtime | `system-presence`, `system.presence`, `events.stream` | 3 |
| Work (superseded) | All 17 `work.*` operations | 17 |
| Clock (superseded) | All 8 `clock.schedule.*` operations | 8 |
| Web (legacy) | `web.login.start`, `web.login.wait` | 2 |
| **Total** | | **55** |

**Files deleted:**

| File | Reason |
|------|--------|
| `nex/src/tts/tts.ts` | TTS extraction |
| `nex/src/tts/tts.test.ts` | TTS extraction |
| `nex/src/nex/control-plane/server-methods/tts.ts` | TTS extraction |
| `nex/src/nex/control-plane/server-methods/talk.ts` | TTS extraction |
| `nex/src/nex/control-plane/server-methods/voicewake.ts` | TTS extraction |
| `nex/src/nex/control-plane/server-methods/usage.ts` | Usage dropped |
| `nex/src/nex/control-plane/server-methods/usage.test.ts` | Usage dropped |
| `nex/src/nex/control-plane/server-methods/usage.sessions-usage.test.ts` | Usage dropped |
| `nex/src/nex/control-plane/server-methods/devices.ts` | Devices folded into adapters |
| `nex/src/nex/control-plane/server-methods/devices.test.ts` | Devices folded into adapters |
| `nex/src/nex/control-plane/server-methods/device-host.ts` | Devices folded into adapters |
| `nex/src/nex/control-plane/server-methods/device-host.test.ts` | Devices folded into adapters |
| `nex/src/nex/control-plane/server-methods/nodes.helpers.ts` | Device/node helpers dead |
| `nex/src/nex/control-plane/server-methods/work.ts` | Work superseded by jobs/cron/dags |
| `nex/src/nex/control-plane/server-methods/work.test.ts` | Work superseded |
| `nex/src/nex/control-plane/server-methods/clock-schedule.ts` | Clock superseded by cron |
| `nex/src/infra/system-presence.ts` | System presence dropped |
| `nex/src/infra/system-presence.test.ts` | System presence dropped |

**Runtime events removed from `RUNTIME_EVENTS` array:**
- `"talk.mode"`
- `"voicewake.changed"`
- `"device.pair.requested"`
- `"device.pair.resolved"`

### Extracted (TTS Standalone Package)

TTS logic moves to a standalone npm package (separate repo / separate package in monorepo). NOT part of this workplan to build the package -- this workplan only handles the REMOVAL from Nex. The extraction target is documented in [TTS_EXTRACTION.md](../TTS_EXTRACTION.md).

What moves:
- `nex/src/tts/tts.ts` core logic (Edge TTS, OpenAI, ElevenLabs providers)
- Agent tool definition (becomes a skill document)
- Provider credential resolution (becomes credential-pass-through)

### Renamed (Singular to Plural)

| Old Operation ID | New Operation ID |
|-----------------|-----------------|
| `event.ingest` | `events.ingest` |
| `event.backfill` | `events.backfill` |
| `agent.identity.get` | `agents.identity.get` |
| `agent.wait` | `agents.wait` |
| `adapter.connections.list` | `adapters.connections.list` |
| `adapter.connections.status` | `adapters.connections.status` |
| `adapter.connections.oauth.start` | `adapters.connections.oauth.start` |
| `adapter.connections.oauth.complete` | `adapters.connections.oauth.complete` |
| `adapter.connections.apikey.save` | `adapters.connections.apikey.save` |
| `adapter.connections.upload` | `adapters.connections.upload` |
| `adapter.connections.custom.start` | `adapters.connections.custom.start` |
| `adapter.connections.custom.submit` | `adapters.connections.custom.submit` |
| `adapter.connections.custom.status` | `adapters.connections.custom.status` |
| `adapter.connections.custom.cancel` | `adapters.connections.custom.cancel` |
| `adapter.connections.test` | `adapters.connections.test` |
| `adapter.connections.disconnect` | `adapters.connections.disconnect` |

Also rename in:
- `HTTP_INGRESS_OPERATION_IDS`: `"event.ingest"` -> `"events.ingest"`
- `EXTERNAL_ADAPTER_OPERATION_IDS`: `"event.backfill"` -> `"events.backfill"`
- IAM resource strings (e.g., `resource: "adapter.connections"` -> `resource: "adapters.connections"`)

### Kept As-Is (No Changes)

| Operations | Reason |
|-----------|--------|
| `wizard.start`, `wizard.next`, `wizard.cancel`, `wizard.status` | Wizard ops kept, content redesign deferred |
| `browser.request` | Browser kept, full redesign deferred |
| `config.get`, `config.schema`, `config.set`, `config.patch`, `config.apply` | Config stays as-is |
| `update.run` | Under review, stays for now |
| `skills.status` | Will be renamed to `skills.list` in a future pass (Batch 5 taxonomy alignment) |

---

## Changes Required

### Category 1: TTS Extraction (Remove from Nex)

**1.1 Delete source files:**
- `nex/src/tts/tts.ts`
- `nex/src/tts/tts.test.ts`
- `nex/src/nex/control-plane/server-methods/tts.ts`
- `nex/src/nex/control-plane/server-methods/talk.ts`
- `nex/src/nex/control-plane/server-methods/voicewake.ts`

**1.2 Remove from operation taxonomy** (`nex/src/nex/control-plane/runtime-operations.ts`):

Delete these entries from `STATIC_RUNTIME_OPERATION_TAXONOMY`:
```
"talk.mode"
"tts.status"
"tts.providers"
"tts.enable"
"tts.disable"
"tts.convert"
"tts.setProvider"
"voicewake.get"
"voicewake.set"
```

**1.3 Remove from `RUNTIME_EVENTS` array:**
```
"talk.mode"
"voicewake.changed"
```

**1.4 Remove TTS agent tool registration:**

Grep for: `tts` tool registration in agent tool registry / tool definitions. Remove the tool entry.

**1.5 Remove all imports and references:**

Grep across `nex/src/` for:
```
from.*tts
from.*talk
from.*voicewake
tts\.status|tts\.enable|tts\.disable|tts\.convert|tts\.setProvider|tts\.providers
talk\.mode|talk\.config
voicewake\.get|voicewake\.set
```

Fix all broken imports and remove dead code paths.

**1.6 Remove CLI commands:**

Check `nex/src/cli/` for any TTS/talk/voicewake CLI registration and remove.

### Category 2: Dropped Operations

**2.1 Usage (5 ops):**

Delete files:
- `nex/src/nex/control-plane/server-methods/usage.ts`
- `nex/src/nex/control-plane/server-methods/usage.test.ts`
- `nex/src/nex/control-plane/server-methods/usage.sessions-usage.test.ts`

Remove from taxonomy:
```
"usage.status"
"usage.cost"
"sessions.usage"
"sessions.usage.timeseries"
"sessions.usage.logs"
```

Remove all imports and handler wiring referencing usage methods.

**2.2 Devices (8 ops):**

Delete files:
- `nex/src/nex/control-plane/server-methods/devices.ts`
- `nex/src/nex/control-plane/server-methods/devices.test.ts`
- `nex/src/nex/control-plane/server-methods/device-host.ts`
- `nex/src/nex/control-plane/server-methods/device-host.test.ts`
- `nex/src/nex/control-plane/server-methods/nodes.helpers.ts`

Remove from taxonomy:
```
"device.pair.list"
"device.pair.approve"
"device.pair.reject"
"device.token.rotate"
"device.token.revoke"
"device.host.list"
"device.host.describe"
"device.host.invoke"
```

Remove from `RUNTIME_EVENTS`:
```
"device.pair.requested"
"device.pair.resolved"
```

Remove all imports, handler wiring, and CLI commands referencing device operations.

**2.3 Skills Deferred (2 ops):**

Remove from taxonomy:
```
"skills.install"
"skills.update"
```

Trim handler code in `nex/src/nex/control-plane/server-methods/skills.ts` to only retain `skills.status` (which will be aligned to `skills.list` in a future pass). Remove install/update handler functions.

**2.4 delivery.poll (1 op):**

Remove from taxonomy:
```
"delivery.poll"
```

Remove from `EXTERNAL_ADAPTER_OPERATION_IDS`:
```
"delivery.poll"
```

Remove any handler code in adapter capabilities or delivery handlers that references poll.

**2.5 system-presence (2 ops + module):**

Delete files:
- `nex/src/infra/system-presence.ts`
- `nex/src/infra/system-presence.test.ts`

Remove from taxonomy:
```
"system-presence"
"system.presence"
```

Remove all references (10 files identified):
- `nex/src/nex/control-plane/server-methods/system.ts` -- Remove presence handler
- `nex/src/nex/control-plane/server/ws-connection/message-handler.ts` -- Remove presence message handling
- `nex/src/nex/control-plane/server/ws-connection.ts` -- Remove presence references
- `nex/src/cli/runtime-cli/register.ts` -- Remove presence CLI command
- `nex/src/cli/system-cli.ts` -- Remove presence CLI
- `nex/src/nex/control-plane/server/health-state.ts` -- Decouple from presence
- `nex/src/nex/control-plane/probe.ts` -- Remove presence probe
- `nex/src/nex/control-plane/server.health.e2e.test.ts` -- Update tests

**2.6 events.stream (1 op):**

Remove from taxonomy:
```
"events.stream"
```

Verify the SSE/WebSocket handler is rewired to `pubsub.subscribe` (per WP11). If the old handler still exists, remove it.

**2.7 Work CRM (17 ops):**

Delete files:
- `nex/src/nex/control-plane/server-methods/work.ts`
- `nex/src/nex/control-plane/server-methods/work.test.ts`

Remove from taxonomy: all 17 `work.*` entries (lines 279-308).

Remove the `WORK_CONTROL_OPERATION_IDS` constant entirely from `runtime-operations.ts`.

Remove all imports and handler wiring referencing work operations.

**2.8 Clock Schedule (8 ops):**

Delete file:
- `nex/src/nex/control-plane/server-methods/clock-schedule.ts`

Remove from taxonomy: all 8 `clock.schedule.*` entries (lines 328-335).

Remove all imports and handler wiring referencing clock schedule operations.

**2.9 Web Login (unregistered handlers):**

Check `nex/src/nex/control-plane/server-methods/web.ts` for `web.login.start` and `web.login.wait` handlers. Remove dead handler code. If the file becomes empty, delete it.

**2.10 channels.logout (unregistered handler):**

Check `nex/src/nex/control-plane/server-methods/channels.ts` for a `channels.logout` handler. Remove dead handler code.

### Category 3: Namespace Renames (Singular to Plural)

**3.1 Operation taxonomy (`runtime-operations.ts`):**

Rename keys in `STATIC_RUNTIME_OPERATION_TAXONOMY`:
- `"event.ingest"` -> `"events.ingest"`
- `"event.backfill"` -> `"events.backfill"`
- `"agent.identity.get"` -> `"agents.identity.get"`
- `"agent.wait"` -> `"agents.wait"`
- `"adapter.connections.*"` (13 entries) -> `"adapters.connections.*"` (13 entries)

Update IAM resource strings for renamed operations:
- `resource: "adapter.connections"` -> `resource: "adapters.connections"`
- `resource: "adapter.connections.oauth"` -> `resource: "adapters.connections.oauth"`
- `resource: "adapter.connections.credentials"` -> `resource: "adapters.connections.credentials"`
- `resource: "adapter.connections.upload"` -> `resource: "adapters.connections.upload"`
- `resource: "adapter.connections.custom"` -> `resource: "adapters.connections.custom"`
- `resource: "ingress.event"` -> `resource: "ingress.events"` (or keep as-is if resource naming is separate)
- `resource: "ingress.backfill"` -> `resource: "ingress.backfill"` (no change needed)
- `resource: "agents.identity"` -- already correct

**3.2 Constant arrays:**

In `HTTP_INGRESS_OPERATION_IDS`:
```typescript
// Old:
export const HTTP_INGRESS_OPERATION_IDS = ["event.ingest"] as const;
// New:
export const HTTP_INGRESS_OPERATION_IDS = ["events.ingest"] as const;
```

In `EXTERNAL_ADAPTER_OPERATION_IDS`:
```typescript
// Old: "event.backfill"
// New: "events.backfill"
```

**3.3 RPC handler dispatch:**

Update all dispatch tables / switch statements that match on operation IDs:
- `nex/src/nex/control-plane/server/ws-connection/message-handler.ts`
- `nex/src/nex/control-plane/http-control-handlers.ts`
- `nex/src/nex/control-plane/http-control-routes.ts`
- `nex/src/nex/control-plane/server-methods/event-ingest.ts`
- `nex/src/nex/control-plane/server-methods/agent.ts`
- `nex/src/nex/control-plane/server-methods/adapter-connections.ts`

Grep for exact strings: `"event.ingest"`, `"event.backfill"`, `"agent.identity.get"`, `"agent.wait"`, `"adapter.connections.` and update to plural form.

**3.4 IAM / authz taxonomy:**

- `nex/src/nex/control-plane/authz-taxonomy.test.ts` -- Update test expectations
- Any IAM policy files that reference operation IDs by name

**3.5 CLI commands:**

Grep for CLI command registrations that use singular operation names and update:
- `nex/src/cli/runtime-cli/register.ts`
- Any other CLI files that dispatch to these operations

**3.6 Test files:**

All test files that reference renamed operations must be updated. Key files:
- `nex/src/nex/control-plane/server.chat.runtime-server-chat-b.e2e.test.ts`
- `nex/src/nex/control-plane/server.chat.runtime-server-chat.e2e.test.ts`
- `nex/src/nex/control-plane/server.agent.runtime-server-agent-a.e2e.test.ts`
- `nex/src/nex/control-plane/server.agent.runtime-server-agent-b.e2e.test.ts`
- `nex/src/nex/control-plane/runtime.e2e.test.ts`
- `nex/src/nex/control-plane/server.health.e2e.test.ts`
- `nex/src/nex/control-plane/server-methods.pipeline-dispatch.test.ts`
- `nex/src/nex/control-plane/authz-taxonomy.test.ts`
- `nex/src/nex/control-plane/http-ingress-adapter.test.ts`
- `nex/src/nex/control-plane/nexus-adapter.test.ts`
- `nex/src/nex/control-plane/http-ingress-dispatcher.test.ts`
- `nex/src/nex/control-plane/http-control-routes.test.ts`
- `nex/src/nex/control-plane/adapter-connections.test.ts`

**3.7 Adapter protocol:**

Check `nex/src/nex/control-plane/protocol/schema/agent.ts` for `event.ingest` / `event.backfill` references and update.

**3.8 Adapter SDK contract:**

`EXTERNAL_ADAPTER_OPERATION_IDS` is the single-source contract for adapter SDK schemas. Updating `"event.backfill"` to `"events.backfill"` here means adapter binaries must also be updated to emit `events.backfill` as the operation name. Coordinate with adapter SDK update.

### Category 4: Legacy Purge Verification

**4.1 data_access:**

Batch 2 says fully purged. Run verification grep:
```
grep -r "data_access" nex/src/ --include="*.ts" | grep -v node_modules | grep -v ".test.ts"
```
Expected: zero results. If any remain, remove.

**4.2 events.stream handler:**

After removing the taxonomy entry, verify no SSE/HTTP handler still serves the old `events.stream` path.

**4.3 system-presence functional code:**

After deleting `nex/src/infra/system-presence.ts`, verify no remaining imports or functional calls.

**4.4 talk.config:**

Not currently in taxonomy but referenced in TTS_EXTRACTION.md. Verify no handler code exists. If a handler exists, delete it.

### Category 5: CUTOVER_06 Part E Cross-Reference

SenderContext/ReceiverContext removal is tracked in [CUTOVER_06_REPLY_DELETION_AND_CLEANUP.md](./CUTOVER_06_REPLY_DELETION_AND_CLEANUP.md) Part E. This workplan does NOT duplicate that work. The status:
- ~52 references across ~15 non-test production files
- SenderContext: 35 occurrences in 13 files
- ReceiverContext: 17 occurrences in 8 files
- Primary consumer: `nex/src/iam/` subsystem

This workplan's dead import sweep (Category 6) should verify CUTOVER_06 Part E is complete.

### Category 6: Final Dead Import / Dead Code Sweep

After all drops and renames are applied, run a comprehensive sweep:

```bash
# Broken imports from deleted files
grep -r "from.*server-methods/tts" nex/src/ --include="*.ts"
grep -r "from.*server-methods/talk" nex/src/ --include="*.ts"
grep -r "from.*server-methods/voicewake" nex/src/ --include="*.ts"
grep -r "from.*server-methods/usage" nex/src/ --include="*.ts"
grep -r "from.*server-methods/devices" nex/src/ --include="*.ts"
grep -r "from.*server-methods/device-host" nex/src/ --include="*.ts"
grep -r "from.*server-methods/nodes" nex/src/ --include="*.ts"
grep -r "from.*server-methods/work" nex/src/ --include="*.ts"
grep -r "from.*server-methods/clock-schedule" nex/src/ --include="*.ts"
grep -r "from.*system-presence" nex/src/ --include="*.ts"

# Old operation string literals
grep -r '"tts\.' nex/src/ --include="*.ts"
grep -r '"talk\.' nex/src/ --include="*.ts"
grep -r '"voicewake\.' nex/src/ --include="*.ts"
grep -r '"usage\.' nex/src/ --include="*.ts"
grep -r '"device\.' nex/src/ --include="*.ts"
grep -r '"delivery\.poll"' nex/src/ --include="*.ts"
grep -r '"system-presence"' nex/src/ --include="*.ts"
grep -r '"system\.presence"' nex/src/ --include="*.ts"
grep -r '"events\.stream"' nex/src/ --include="*.ts"
grep -r '"work\.' nex/src/ --include="*.ts"
grep -r '"clock\.schedule\.' nex/src/ --include="*.ts"

# Old singular operation names (should all be plural now)
grep -r '"event\.ingest"' nex/src/ --include="*.ts"
grep -r '"event\.backfill"' nex/src/ --include="*.ts"
grep -r '"agent\.identity' nex/src/ --include="*.ts"
grep -r '"agent\.wait"' nex/src/ --include="*.ts"
grep -r '"adapter\.connections\.' nex/src/ --include="*.ts"

# Leftover type references (CUTOVER_06 Part E)
grep -r "SenderContext\|ReceiverContext" nex/src/ --include="*.ts" | grep -v ".test.ts"
```

All of the above must return zero results (excluding comments, if any).

---

## Execution Order

### Phase 1: TTS Extraction (Remove from Nex)

Steps 1.1-1.6. Archive TTS source to a reference location first (for standalone package extraction). Then delete all TTS/talk/voicewake code from Nex.

**Verify:** `tsc --noEmit` compiles clean. No broken imports.

### Phase 2: Drop Dead Operations

Steps 2.1-2.10. Delete files and remove taxonomy entries for: usage, devices, skills deferred, delivery.poll, system-presence, events.stream, work CRM, clock schedule, web login, channels.logout.

**Verify:** `tsc --noEmit` compiles clean. Operation count in taxonomy is reduced by the expected amount.

### Phase 3: Namespace Renames (Singular to Plural)

Steps 3.1-3.8. Rename all singular operation IDs to plural across: taxonomy, handler dispatch, IAM, CLI, tests, adapter protocol, constant arrays.

**Verify:** `tsc --noEmit` compiles clean. All tests reference plural names. No singular operation IDs remain in production code.

### Phase 4: Legacy Purge Verification

Steps 4.1-4.4. Grep for data_access, old events.stream handler, system-presence remnants, talk.config orphan.

**Verify:** All verification greps return zero results.

### Phase 5: Dead Code Sweep

Step 6 (Category 6). Comprehensive grep across entire src/ for any remaining references to dropped or renamed operations, deleted files, or legacy types.

**Verify:** All sweep greps return zero results.

### Phase 6: CUTOVER_06 Part E Completion Check

Verify SenderContext/ReceiverContext removal is complete (tracked in CUTOVER_06). If not complete, this does NOT block this workplan, but the final dead code sweep will flag the remaining references.

### Phase 7: Full Test Suite

Run the complete test suite. Fix any failures caused by:
- Missing handler registrations (expected -- operations were dropped)
- Wrong operation ID strings in test expectations (fix to plural)
- Missing imports from deleted files (fix or delete test)

---

## Notes

- **Start anytime.** No dependencies on other workplans.
- **Finish last.** Other workplans may introduce code that references old operation names or imports from files being deleted here. By finishing last, this workplan acts as the final cleanup pass.
- **Hard cutover.** No backward compatibility. No aliases. No deprecation warnings. Old operation IDs stop existing.
- **TTS extraction is removal only.** Building the standalone TTS package is a separate effort. This workplan removes TTS from Nex and archives the source for reference.
- **Work/clock removal coordinates with WP_WORK_DOMAIN_UNIFICATION.** That workplan adds jobs/cron/dags. This workplan removes work/clock. They should land in the same phase to avoid a gap where neither old nor new exists.
- **Adapter SDK impact.** Renaming `event.backfill` to `events.backfill` in `EXTERNAL_ADAPTER_OPERATION_IDS` is a contract change. All adapter binaries must be updated to use the new operation ID. Coordinate with adapter authors.
- **config.* and update.run are NOT being touched.** Config operations stay as-is pending future review. update.run stays pending disposition decision.
- **skills.status -> skills.list rename is deferred.** The Batch 5 taxonomy shows skills.list/use/search as the target, but the handler rewrite is not part of this workplan. Only skills.install and skills.update are dropped here.
