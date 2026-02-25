# Built-in & Internal Adapters

**Status:** DESIGN + IMPLEMENTATION TRACKER
**Last Updated:** 2026-02-24
**Related:** `../ADAPTER_SYSTEM.md`, `../INBOUND_INTERFACE.md`, `../OUTBOUND_INTERFACE.md`, `../workplans/CHANNEL_MIGRATION_TRACKER.md`, `./CLOCK_ADAPTER.md`, `../../nex/ingress/CONTROL_PLANE.md`, `../../nex/DAEMON.md`, `../../nex/NEX.md`, `../../nex/SURFACE_ADAPTER_V2.md`

---

## Purpose

Define which integrations are shipped "with NEX" as **built-in event adapters**, clarify the boundary between control surfaces and event ingress, and specify how **internal (in-process) event adapters** work alongside external (process-based) adapters.

---

## Canonical Boundary (Locked)

**Control surface** — privileged runtime interface for user/operator interaction.
- Transport: WebSocket RPC + control-plane HTTP (UI, avatars, health, SSE bus stream).
- Operation kinds: `protocol`, `control`, `event`.
- Default binding: loopback unless explicitly exposed with strict auth.
- Control operations are direct IAM-authorized methods; event operations normalize to `NexusEvent`.

**Event adapters** — supervised integration points that emit normalized `NexusEvent` and receive outbound delivery.
- Any protocol bridge that accepts traffic from "the outside world" is an event adapter: webhooks, OpenAI/OpenResponses compatibility APIs, channel ingress (Discord/Telegram/WhatsApp/etc), scheduled event sources (clock/timer).
- Any agent execution must be reachable as `NexusEvent -> nex.processEvent(...)` (no hidden agent-run paths).
- Built-in event adapters ship alongside NEX but are still managed via the adapter manager (health, restarts, status).

---

## Adapter Kinds

We support two adapter kinds with the same state/supervision model:

### 1. Process adapters (existing)

- Spawn external executables.
- Monitor = JSONL on stdout.
- Send/stream/backfill/health via CLI protocol.

### 2. Internal adapters (new)

- Implement adapter semantics as an in-process TypeScript module inside the daemon.
- No child process required.
- Still exposes the same conceptual capabilities (info/health, and optionally monitor/send/stream/backfill).
- Still tracked + supervised as adapter instances (`adapter/account`).

Both kinds use the same state tracking:

- `status`: running | restarting | errored | stopped
- `health`: healthy | degraded | disconnected | unknown | errored
- `last_event_at`, `events_received`, `events_sent`
- restart policy + backoff (for internal adapters, "restart" means "stop + start instance")

This lets `/health` and UI show a single adapter table regardless of adapter kind.

---

## Internal Adapter Interface

```ts
type InternalAdapterKind = "event_source" | "ingress_server";

type InternalAdapterDefinition = {
  name: string;     // adapter name (e.g. "clock", "http-ingress")
  platform: string; // delivery.platform used on emitted events (e.g. "clock", "webhook")
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
};
```

Notes:
- Internal adapters **emit `NexusEvent`**; they do not bypass IAM.
- Internal adapters can be inbound-only (webhooks) or event-source-only (clock).
- Process adapters remain the default for external channels.

---

## Configuration Model

Internal adapters are configured alongside process adapters. Recommended shape (explicit `kind`):

```yaml
adapters:
  clock:
    kind: internal
    internal: { module: clock }
    platform: clock
    accounts:
      default:
        monitor: true
        config:
          heartbeat_interval_ms: 60000
          cron:
            - expr: "0 8 * * *"
              label: "morning-summary"
```

---

## Target Built-in Adapters

### 1. `clock` (event_source)

Emit time-based `NexusEvent`s (heartbeats, schedule labels) to drive proactive automations.

Canonical event shape:

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
    platform: "clock",
    account_id: "default",
    sender_id: "clock:tick",
    sender_name: "Clock",
    container_id: "clock:tick",
    container_kind: "channel",
    capabilities: {},
    available_platforms: []
  }
}
```

Notes:
- Automations match on `event.metadata.type` and/or `delivery.platform === "clock"`.
- The clock adapter emits events only; it does not run agents itself.
- See `CLOCK_ADAPTER.md` for detailed design.

### 2. `http-ingress` (ingress_server)

A single managed HTTP listener (separate from control-plane) for external protocol bridges.

Bridge modules hosted inside `http-ingress`:
- **webhook** bridge — generic route mappings + hooks-like endpoints
- **openai-compat** bridge — `/v1/chat/completions`
- **openresponses-compat** bridge — `/v1/responses`

Each bridge normalizes inbound requests into `NexusEvent` (with `_nex_ingress` metadata) and runs them through the pipeline.

### 3. `webchat` ingress module (optional)

Local/hosted webchat ingress can be implemented as an `http-ingress` submodule that emits `NexusEvent`. Control-plane chat methods remain control-surface event operations.

---

## Current State (Implementation Snapshot)

The control-plane HTTP server currently hosts several protocol bridges that should become adapters:

| Bridge | Current Location | Target |
| --- | --- | --- |
| Hooks webhook endpoints | `server/hooks.ts`, `server-http.ts` | `http-ingress` webhook bridge |
| OpenAI compat (`/v1/chat/completions`) | `openai-http.ts` | `http-ingress` openai-compat bridge |
| OpenResponses compat (`/v1/responses`) | `openresponses-http.ts` | `http-ingress` openresponses-compat bridge |
| Tools invoke (`POST /tools/invoke`) | `tools-invoke-http.ts` | May remain control-plane (privileged tool service) |
| Slack inbound webhook routing | `slack/http/registry.ts` | Slack adapter |
| Cron/timer scheduling | `cron/*` + `server-cron.ts` | Clock adapter + automations |

### Clock/Timer Spec Inconsistency

- `../../nex/DAEMON.md` describes an internal `timer` adapter with `platform: "timer"`.
- `../../nex/NEX.md` describes an external `clock` adapter with `platform: "clock"`.
- Implementation recognizes `delivery.platform === "clock"` for system identity.
- **Canonical target:** standardize on `platform: "clock"` for all scheduled events.

---

## IAM Expectations

- Every internal adapter must emit `NexusEvent` with an appropriate `delivery.platform`.
- `resolveIdentity` should produce correct sender contexts:
  - `clock` → system sender `source=timer`
  - `webhook` → webhook sender (not system)
  - local `runtime` → owner/known where appropriate

---

## Migration Plan

1. Implement internal adapter registry + runtime support.
2. Implement internal `clock` adapter emitting events (heartbeat first).
3. Implement internal `http-ingress` adapter (new bind/port) and port hooks webhooks, OpenAI/OpenResponses routes.
4. Remove those endpoints from the control-plane HTTP router (control-plane returns to privileged/local).
5. (Optional) Add local webchat ingress as an `http-ingress` submodule.

---

## Acceptance Criteria

- `nexus status` / runtime health shows internal adapters as adapter instances with health/state.
- `clock` emits events that appear in events ledger + nexus_requests.
- `http-ingress` can accept a webhook/OpenAI request and the agent run is visible as a NEX pipeline trace (IAM + audit included).
- Webhook/OpenAI/OpenResponses ingress works end-to-end with the bridge moved out of control-plane routes.
- Control-plane remains local-first and does not host external ingress by default.

---

## Open Questions

- Do we want one **unified HTTP ingress adapter** (webhooks + openai + openresponses) or separate adapters per protocol?
- How should OpenAI/OpenResponses adapters implement streaming IPC while staying inside the existing adapter manager contract?
- Should "hooks" be a mapping config inside `webhook`, or a distinct `hooks` adapter for ergonomics?
