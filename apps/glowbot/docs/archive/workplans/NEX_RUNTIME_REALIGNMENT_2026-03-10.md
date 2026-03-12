# GlowBot — Nex Runtime Realignment (2026-03-10)

> Focused cutover plan for bringing GlowBot code into parity with the March 10
> Nex canon and validation packet.
>
> **Status:** COMPLETE
> **Approach:** hard cutover, no backwards compatibility

## Customer Outcome

The clinic-facing GlowBot experience should behave like this:

1. shared adapters emit canonical `record.ingest` envelopes
2. Nex persists records and emits durable `record.ingested`
3. GlowBot wakes durable work from `events.subscriptions.*`, not live in-memory
   adapter callbacks
4. GlowBot extracts canonical metric elements from stored records
5. GlowBot schedules runtime work through canonical `schedules.*`
6. clinic-facing product-control-plane calls go through the runtime-owned
   product-control-plane gateway

This workplan exists because GlowBot had already aligned its docs to that
customer story, but parts of the code were still on the older seams.

## Locked Inputs

- [spec-driven-development-workflow.md](/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md)
- [Jobs, Schedules, and DAGs](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/work/jobs-schedules-and-dags.md)
- [Daemon and Runtime Dispatch](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/work/daemon-and-runtime-dispatch.md)
- [Adapter Protocol](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/adapter-protocol.md)
- [Managed Connection Gateway](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/managed-connection-gateway.md)
- [canonical-api-full-system-signoff-report-2026-03-10.md](/Users/tyler/nexus/home/projects/nexus/nex/docs/validation/canonical-api-full-system-signoff-report-2026-03-10.md)

## Proven Current Drift

- GlowBot app code still calls `cron.*` in install, upgrade, registry, and
  read-model code.
- GlowBot activation still uses `ctx.nex.adapters.onEvent()` and app-local
  transient callbacks.
- `metric_extract` still expects app-local adapter event blobs rather than the
  canonical `record.ingested` -> `records.get` pattern.
- GlowBot app code calls `productControlPlane.call`, but the obvious Nex runtime
  source path does not yet register that method.

## Workstreams

### R1. Runtime Product Control Plane Gateway

Land or verify the exact runtime method that clinic-facing app code calls.

Scope:

- register canonical runtime operation `productControlPlane.call`
- bridge runtime -> frontdoor `/api/internal/product-control-plane/call`
- carry authoritative app and caller identity headers
- keep clinic runtimes free of direct hub URLs and hub auth secrets

Exit:

- GlowBot app method code can call `productControlPlane.call`
- the runtime is the only tenant-side caller of the product-control-plane
  gateway

### R2. Schedule Cutover

Hard-cut GlowBot from `cron.*` to `schedules.*`.

Scope:

- registry resource discovery and ensure/update calls
- install/upgrade audit payloads and naming
- read-model schedule status lookup

Exit:

- GlowBot no longer calls `cron.*`
- schedule status and manual trigger surfaces reflect canonical `schedules.*`

### R3. Durable Ingest Wake-up

Replace transient adapter callbacks with durable event subscriptions.

Scope:

- seed `events.subscriptions.*` rows for `record.ingested`
- disable them on deactivate
- remove them on uninstall
- remove app-local `adapters.onEvent()` wake-up code

Exit:

- `metric_extract` is woken by durable `record.ingested` subscriptions
- no active GlowBot code depends on `ctx.nex.adapters.onEvent()`

### R4. Metric Extract Canonical Record Input

Rewrite `metric_extract` to consume the canonical stored record.

Scope:

- accept `record.ingested` event input
- fetch the real record via `records.get`
- extract metric metadata from canonical record metadata
- preserve `connection_id` provenance from the stored record identity
- enrich metrics with available connection metadata from runtime connection
  state when present

Exit:

- `metric_extract` no longer depends on app-local adapter event shape
- canonical records are sufficient to create canonical metric elements

### R5. W12 Recheck

Re-open persisted derived outputs against the current Nex work runtime rather
than the older “upstream blocked” assumption.

Scope:

- verify current Nex work runtime behavior against GlowBot needs
- update the active GlowBot workplan if W12 is now unblocked

Exit:

- W12 is either moved into active implementation or narrowed to a concrete
  remaining blocker

## Validation Plan

1. targeted Nex runtime tests for:
   - `productControlPlane.call`
   - `schedules.*` registration surface
2. targeted GlowBot tests for:
   - `metric_extract` consuming `record.ingested`
   - read-model schedule status via `schedules.list`
   - lifecycle seeding/disabling/removal of durable subscriptions
3. source scans proving:
   - no active GlowBot code calls `cron.*`
   - no active GlowBot code depends on `ctx.nex.adapters.onEvent()`
4. workplan refresh after the code lands
