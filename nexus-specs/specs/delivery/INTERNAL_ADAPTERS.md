# Internal Event Adapters

**Status:** ACTIVE  
**Last Updated:** 2026-02-24  
**Related:** `ADAPTER_SYSTEM.md`, `adapters/BUILTIN_ADAPTERS.md`, `INBOUND_INTERFACE.md`, `../nex/SURFACE_ADAPTER_V2.md`

---

## Purpose

Define the contract for **internal event adapters** (in-process adapters) that are managed like normal adapters but run inside the NEX runtime process.

This document is authoritative for:

1. lifecycle semantics (`start/stop/health/state`)
2. ingress normalization (`NexusEvent`)
3. ownership boundaries with control surfaces

---

## Canonical Boundary

1. Internal event adapters are event ingress components.
2. Control-plane WS/HTTP methods are control-surface operations, not internal event adapters.
3. Anything that can trigger agent work from an internal event adapter must emit `NexusEvent` and enter `nex.processEvent(...)`.

---

## Internal Adapter Kinds

```ts
type InternalAdapterKind = "event_source" | "ingress_server";
```

Examples:

1. `clock` (`event_source`)
2. `http-ingress` (`ingress_server`)

---

## Runtime Contract

```ts
type InternalAdapterDefinition = {
  name: string;
  platform: string;
  kind: InternalAdapterKind;
  supports: Array<"monitor" | "health" | "backfill" | "send" | "stream">;
};

type InternalAdapterContext = {
  adapter: string;
  account: string;
  emitEvent: (event: NexusEvent) => Promise<void>;
  now: () => number;
  log: { info(msg: string): void; warn(msg: string): void; error(msg: string): void };
};
```

Rules:

1. `emitEvent` is the only path for event ingress side effects.
2. Internal adapters must follow ingress-integrity rules (`../nex/ingress/INGRESS_INTEGRITY.md`).
3. Internal adapters are visible in adapter supervision/status endpoints.

---

## Implementation Notes

For built-in adapter inventory and migration details, see `adapters/BUILTIN_ADAPTERS.md`.
