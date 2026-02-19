# Clock Adapter

**Status:** DESIGN LOCKED + IMPLEMENTED (V1)  
**Last Updated:** 2026-02-19  
**Related:** `BUILTIN_ADAPTERS.md`, `UNIFIED_DELIVERY_TAXONOMY.md`, `nex/CONTROL_PLANE.md`, `nex/automations/AUTOMATION_SYSTEM.md`

---

## Purpose

The clock adapter is a minimal time source for NEX.

It does exactly one thing:

- emit periodic `NexusEvent` ticks into the normal pipeline.

It does **not**:

- run agents directly
- own a cron registry
- store per-job schedules
- perform outbound delivery

Scheduling behavior lives in automations and automation state.

---

## Design Decisions

1. The ingress is called **clock**, not cron.
2. Clock is intentionally dumb: fixed periodic ticks.
3. Default tick interval is **30 seconds**.
4. Runtime maintenance timers remain separate and internal.
5. If users want heartbeat-like or scheduled behavior, they build it with automations triggered by `clock.tick`.

---

## Event Contract

Clock emits canonical `NexusEvent` payloads.

```ts
{
  event: {
    event_id: "clock:tick:<unique>",
    timestamp: <unix-ms>,
    content: "",
    content_type: "text",
    metadata: {
      type: "clock.tick",
      clock_tick_interval_ms: 30000,
      _nex_ingress: {
        source: "clock",
        request_id: "clock:tick:<unique>",
        skip_delivery: true
      }
    }
  },
  delivery: {
    platform: "clock",
    account_id: "default",
    sender_id: "clock:tick",
    sender_name: "Clock",
    container_kind: "channel",
    container_id: "clock:tick",
    capabilities: { supports_streaming: false },
    available_channels: []
  }
}
```

Notes:

- `skip_delivery` is always true.
- Empty content prevents accidental normal agent message handling.
- The event still flows through IAM + automations + ledger/audit pipeline.

---

## Configuration

Top-level config:

```json5
{
  clock: {
    enabled: true,         // default true
    tickIntervalMs: 30000, // default 30000
  },
}
```

Constraints:

- `tickIntervalMs` must be positive.
- Runtime clamps to sane bounds for safety.

CLI path (no dedicated clock command required):

```bash
nexus config set clock.enabled true
nexus config set clock.tickIntervalMs 30000
```

---

## Boundary With Runtime Internals

These remain internal timers, not clock adapter events:

- runtime keepalive tick broadcasts
- health cache refresh
- dedupe cleanup
- audit maintenance
- adapter supervision/restart timers

Clock exists only for event-driven automation scheduling.

---

## Future Extension (Deferred)

If needed later, an optional one-shot or schedule API can be layered on top of clock + automations.
That is explicitly out of scope for V1.
