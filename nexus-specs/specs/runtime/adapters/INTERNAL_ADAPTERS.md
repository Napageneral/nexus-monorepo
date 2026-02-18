# Internal Adapters (In-Process)

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-16  
**Related:** `ADAPTER_SYSTEM.md`, `INBOUND_INTERFACE.md`, `OUTBOUND_INTERFACE.md`, `BUILTIN_ADAPTERS.md`, `../nex/CONTROL_PLANE.md`

---

## Problem

The current adapter system is designed around **external executables** (`<cmd> monitor`, `<cmd> send`, etc.).

Some ingress surfaces and event sources we want to treat as adapters are *best implemented in-process*:

- **clock/timer** events (no need for a separate binary)
- **HTTP ingress** bridges (webhooks, OpenAI/OpenResponses compatibility) that need tight, request-scoped streaming and can’t easily round-trip through a child process

We still want these to be **managed like adapters**:

- enable/disable
- health + status
- consistent IAM boundary (everything becomes `NexusEvent -> nex.processEvent(...)`)
- one place in UI/CLI to see “what ingress points exist and are active”

This spec defines **internal adapter support**: adapters implemented as TypeScript modules inside the daemon but treated as first-class adapters by the runtime.

---

## Goals

- **One ingress rule:** any request that can run an agent must enter as a `NexusEvent` and flow through IAM/pipeline.
- **Single runtime process:** internal adapters are modules, not separate services.
- **Unified management:** internal adapters appear alongside external adapters in:
  - adapter lists/status
  - health output
  - restart/state tracking
- **Clear boundary:** control-plane remains privileged/local-first; external protocol bridges are adapters (even if internal modules).

---

## Non-Goals

- Backward compatibility with “gateway” shapes.
- Forcing every adapter to be internal. External channel adapters (Discord/Telegram/WhatsApp/eve/etc) remain processes.
- Making control-plane WS a “normal external ingress” adapter. Control-plane stays privileged.

---

## Canonical Boundary: Control-Plane vs Adapters

**Control-plane**
- Purpose: local privileged admin surface (CLI/UI/nodes).
- Transport: WebSocket RPC + control-plane HTTP (UI, avatars, health, SSE bus stream).
- Default binding: loopback (local-only) unless explicitly exposed with strict auth.

**Adapters**
- Purpose: ingress/event sources that may be external/untrusted.
- Responsibility: normalize inputs to `NexusEvent` and feed the NEX pipeline.
- Includes: webhooks, OpenAI/OpenResponses compatibility APIs, clock/timer, channel integrations.

**Hard rule**
- Control-plane must not “run agents directly”.
- Control-plane can *request* work by emitting a `NexusEvent` (which then hits IAM).

---

## Adapter Kinds

We support two adapter kinds with the same “instance state” model:

1. **Process adapters** (existing)
   - Spawn external executables.
   - Monitor = JSONL on stdout.
   - Send/stream/backfill/health via CLI protocol.

2. **Internal adapters** (new)
   - Implement adapter semantics as an in-process module.
   - No child process required.
   - Still exposes the same conceptual capabilities (info/health, and optionally monitor/send/stream/backfill).
   - Still tracked + supervised as adapter instances (`adapter/account`).

---

## Internal Adapter Interface (Conceptual)

Internal adapters are registered into an **InternalAdapterRegistry** and instantiated per account.

```ts
type InternalAdapterKind = "event_source" | "ingress_server" | "ingress_surface";

type InternalAdapterDefinition = {
  name: string;     // adapter name (e.g. "clock", "http-ingress")
  channel: string;  // delivery.channel used on emitted events (e.g. "clock", "webhook")
  kind: InternalAdapterKind;
  supports: Array<"monitor" | "health" | "backfill" | "send" | "stream">;
};

type InternalAdapterInstance = {
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<{ connected: boolean; last_event_at?: number; error?: string }>;
};

type InternalAdapterContext = {
  adapter: string;
  account: string;
  emitEvent: (event: NexusEvent) => Promise<void>;   // calls nex.processEvent(...)
  now: () => number;
  log: { info(msg: string): void; warn(msg: string): void; error(msg: string): void };
  // Optional shared services (HTTP host, schedulers, etc) injected by runtime.
};
```

Notes:
- Internal adapters **emit `NexusEvent`**; they do not bypass IAM.
- Internal adapters can be inbound-only (webhooks) or event-source-only (clock).
- Process adapters remain the default for external channels.

---

## Unified Supervision + State

Both adapter kinds should use the same state tracking:

- `status`: running | restarting | errored | stopped
- `health`: healthy | degraded | disconnected | unknown | errored
- `last_event_at`, `events_received`, `events_sent`
- restart policy + backoff (for internal adapters, “restart” means “stop + start instance”)

This lets `/health` and UI show a single adapter table regardless of adapter kind.

---

## Configuration Model

Adapters are still configured under the adapter bootstrap config (currently `~/nex.yaml`).

We need a way to describe internal adapters. Two viable shapes:

### Option A (Recommended): Explicit `kind`

```yaml
adapters:
  clock:
    kind: internal
    internal: { module: clock }
    channel: clock
    accounts:
      default:
        monitor: true
        config:
          heartbeat_interval_ms: 60000
          cron:
            - expr: "0 8 * * *"
              label: "morning-summary"
```

### Option B (Minimal parser changes): `command: internal:<module>`

```yaml
adapters:
  clock:
    command: "internal:clock"
    channel: clock
    accounts:
      default:
        monitor: true
        heartbeat_interval_ms: 60000
```

Option B keeps the existing schema mostly intact but is less explicit.

Either option must support per-account config (routes, ports, schedules, tokens).

---

## Built-in Internal Adapters

### 1. `clock` (event_source)

Purpose:
- emit scheduled events so automations can do proactive work.

Canonical event shape (example):

```ts
{
  event: {
    event_id: "clock:heartbeat:1700000000000",
    timestamp: 1700000000000,
    content: "",
    content_type: "text",
    metadata: { type: "clock.heartbeat" }
  },
  delivery: {
    channel: "clock",
    account_id: "default",
    sender_id: "clock:tick",
    sender_name: "Clock",
    peer_id: "clock:tick",
    peer_kind: "channel",
    capabilities: {},
    available_channels: []
  }
}
```

Notes:
- Automations match on `event.metadata.type` and/or `delivery.channel === "clock"`.
- The clock adapter should *not* run agents itself; it emits events only.

### 2. `http-ingress` (ingress_server)

Purpose:
- provide a single managed HTTP listener for external protocol bridges.

Responsibilities:
- bind host/port (separate from control-plane)
- route to enabled “bridge modules”
- normalize each inbound request into `NexusEvent` (with `_nex_ingress` metadata)
- run it through pipeline (`nex.processEvent`)
- return appropriate HTTP responses

Bridge modules to host inside `http-ingress`:
- `webhook` bridge (generic route mappings + hooks-like endpoints)
- `openai-compat` bridge (`/v1/chat/completions`)
- `openresponses-compat` bridge (`/v1/responses`)

Important:
- These bridges are treated as adapters for management purposes, but **do not need to use adapter send/stream** unless we decide to unify OpenAI-style responses through `deliverResponse`.
  - The simplest model: request handler calls pipeline and returns the pipeline result directly.

### 3. `runtime` (ingress_surface) (Optional but matches “everything is adapter”)

Purpose:
- represent local UI/webchat “messages to agents” as an adapter-managed ingress surface.

This keeps the control-plane as management transport, while the `runtime` internal adapter is the canonical “local message ingress” source (with IAM applied).

---

## IAM Expectations

- Every internal adapter must emit `NexusEvent` with an appropriate `delivery.channel`.
- `resolveIdentity` should produce correct principals:
  - `clock` should resolve to system principal `source=timer`.
  - `webhook` should resolve to webhook principal (not system).
  - local `runtime` should resolve to owner/known where appropriate (may require revisiting “system ingress channel” classification for `runtime`).

---

## Migration Plan (from current in-tree routes)

1. Implement internal adapter registry + runtime support.
2. Implement internal `clock` adapter emitting events (heartbeat first).
3. Implement internal `http-ingress` adapter (new bind/port) and port:
   - hooks webhooks
   - OpenAI/OpenResponses routes
4. Remove those endpoints from the control-plane HTTP router (control-plane returns to privileged/local).
5. (Optional) model local webchat ingress via internal `runtime` adapter.

---

## Acceptance Criteria

- `nexus status` / runtime health shows internal adapters as adapter instances with health/state.
- `clock` emits events that appear in events ledger + nexus_requests.
- `http-ingress` can accept a webhook/OpenAI request and the agent run is visible as a NEX pipeline trace (IAM + audit included).
- Control-plane remains local-first and does not host external ingress by default.

