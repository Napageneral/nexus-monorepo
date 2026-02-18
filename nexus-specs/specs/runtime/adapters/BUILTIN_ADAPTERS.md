# Built-in Adapters (Ingress + Event Sources)

**Status:** DESIGN + IMPLEMENTATION TRACKER  
**Last Updated:** 2026-02-16  
**Related:** `./ADAPTER_SYSTEM.md`, `./INBOUND_INTERFACE.md`, `./OUTBOUND_INTERFACE.md`, `./CHANNEL_MIGRATION_TRACKER.md`, `../nex/CONTROL_PLANE.md`, `../nex/DAEMON.md`, `../nex/NEX.md`

---

## Purpose

Define which integrations are shipped "with NEX" as **built-in adapters** and clarify the boundary between:

- the **control-plane** (privileged local UI/CLI surface)
- **external ingress** (protocol bridges that must enter via the adapter system)

This doc also tracks current implementation reality in `nex/` vs the target adapter architecture.

---

## Definitions

- **Control-plane**: privileged local interfaces for the user + agents to operate the runtime (WS RPC, local UI hosting, health/SSE, privileged tool services).
- **Adapter**: a supervised integration point (normally an external process) that emits normalized `NexusEvent` and receives outbound `send/stream` delivery.
- **Built-in adapter**: an adapter shipped alongside NEX (still managed like any other adapter; not a "bypass").

---

## Canonical Boundary (Locked)

- Control-plane WS RPC is **not** an adapter. It is the privileged control plane for local CLI/UI/nodes.
- Control-plane HTTP is **not** an adapter. It hosts UI, avatars/media, health, and the bus SSE stream.
- Any protocol bridge that accepts traffic from "the outside world" is an **adapter**:
  - webhooks (hooks, Slack, etc)
  - OpenAI/OpenResponses compatibility APIs
  - channel ingress (Discord/Telegram/WhatsApp/etc)
  - scheduled event sources (clock/timer)
- Any agent execution must be reachable as `NexusEvent -> nex.processEvent(...)` (no hidden agent-run paths).

---

## Current State (Implementation Snapshot)

The real long-running runtime is implemented in `nex/src/nex/control-plane/` and its HTTP server:

- Control-plane HTTP:
  - `GET /health`
  - `GET /api/events/stream` (SSE from the NEX bus)
  - Control UI hosting + avatars
  - Canvas/A2UI endpoints
- Control-plane WS:
  - local privileged RPC and push events (CLI/UI/nodes)

Additionally, the control-plane HTTP server currently still hosts **several protocol bridges** that should become adapters:

| Bridge | Current Location (Implementation) | Current Behavior | Target |
| --- | --- | --- | --- |
| Hooks webhook endpoints | `nex/src/nex/control-plane/server/hooks.ts`, `nex/src/nex/control-plane/server-http.ts` | Normalizes payload + dispatches into NEX pipeline | Move to a webhook ingress adapter |
| OpenAI compat (`/v1/chat/completions`) | `nex/src/nex/control-plane/openai-http.ts` | Normalizes request + dispatches into NEX pipeline + streams response | Move to OpenAI compat adapter |
| OpenResponses compat (`/v1/responses`) | `nex/src/nex/control-plane/openresponses-http.ts` | Normalizes request + dispatches into NEX pipeline + streams response | Move to OpenResponses compat adapter |
| Tools invoke (`POST /tools/invoke`) | `nex/src/nex/control-plane/tools-invoke-http.ts` | Dispatches into NEX pipeline as a `tool_invoke` request | May remain control-plane (privileged tool service), but must remain IAM-gated + audited |
| Slack inbound webhook routing | `nex/src/slack/http/registry.ts` + registrations from `nex/src/slack/monitor/provider.ts` | In-process Slack runtime ingress | Replace with Slack adapter |
| Cron/timer scheduling | `nex/src/cron/*` + wiring in `nex/src/nex/control-plane/server-cron.ts` | In-process scheduler; main jobs enqueue ephemeral system events; isolated jobs run pipeline | Replace with clock adapter + automations (cron service becomes optional UI sugar) |

---

## Target Built-in Adapters

These are "batteries included" adapters that should ship with NEX, but still be managed via the adapter manager (health, restarts, status).

### 1. `clock` (Timer / Scheduled Events)

Purpose:
- Emit time-based `NexusEvent`s (heartbeats, schedule labels) to drive proactive automations.

Notes:
- Specs currently disagree on naming (`timer` internal vs `clock` external). Implementation already special-cases `delivery.channel === "clock"` for system identity.
- Canonical direction: treat this as a **built-in adapter** and standardize on `channel: "clock"` for scheduled events.

### 2. `webhook` (Generic HTTP Webhook Ingress)

Purpose:
- Accept inbound HTTP payloads and normalize them to `NexusEvent`.
- Provide a config-driven mapping layer (route -> normalization -> metadata).

This becomes the foundational ingress for:
- hooks
- third-party webhooks (GitHub/Stripe/etc)
- any new HTTP-based ingress without adding daemon routes

### 3. `openai-compat` (OpenAI HTTP Compatibility)

Purpose:
- Serve `/v1/chat/completions` and translate requests into `NexusEvent`s.
- Stream responses back to the HTTP caller (SSE).

Implementation constraint:
- Cross-process request/response streaming requires a stable local IPC mechanism inside the adapter (monitor/serve process owns the HTTP connection; `send/stream` invocations must reach it).

### 4. `openresponses-compat` (OpenResponses HTTP Compatibility)

Same as `openai-compat`, targeting `/v1/responses`.

---

## Legacy Usage (Why This Is Confusing Today)

The runtime currently mixes two "shapes" of ingress:

1. Control-plane surfaces (correct): privileged local UI/CLI.
2. External protocol bridges (incorrect placement): implemented as daemon routes for convenience.

The second category *functions*, but it:
- is not supervised/configured like other adapters
- blurs the security boundary (external ingress vs privileged control-plane)
- makes it harder to reason about "what counts as a channel"

Moving bridges into built-in adapters makes ingress points consistent with Discord/Telegram/etc adapters.

---

## Clock/Timer: Spec + Implementation Reality

### Specs today (inconsistent)

- `../nex/DAEMON.md` describes an **internal** `timer` adapter with `channel: "timer"`.
- `../nex/NEX.md` describes an **external** `clock` adapter with `channel: "clock"`.

### Implementation today (partial)

- `nex` recognizes `delivery.channel === "clock"` as a system principal ("Clock Adapter") for IAM identity resolution.
- There is no adapter process emitting clock/timer events yet.
- There is an in-process cron scheduler under `nex/src/cron/*` (not adapter-shaped).

### Canonical target (proposed)

- Use `delivery.channel: "clock"` for all scheduled events.
- Emit events as normal `NexusEvent` objects via the adapter system.
- Encode event intent in `event.metadata`:
  - `type: "clock.heartbeat"` or `type: "clock.tick"`
  - `cron_label`, `cron_expr`, `schedule_id`, etc

---

## Validation Checklist

- Clock adapter emits events and they show up in:
  - `events.db` (events ledger)
  - `nexus_requests` (trace ledger)
  - IAM audit logs (where relevant)
- Webhook/OpenAI/OpenResponses ingress works end-to-end **with the bridge moved out of control-plane routes**.
- Control-plane server remains local-first and does not host external ingress.

---

## Open Questions

- Do we want one **unified HTTP ingress adapter** (webhooks + openai + openresponses) or separate adapters per protocol?
- How should OpenAI/OpenResponses adapters implement streaming IPC while staying inside the existing adapter manager contract?
- Should "hooks" be a mapping config inside `webhook`, or a distinct `hooks` adapter for ergonomics?

