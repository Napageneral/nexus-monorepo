# Delivery + Adapters Spec

**Status:** CANONICAL
**Last Updated:** 2026-02-24

---

## Overview

Event adapters connect Nexus to external platforms (and internal event sources). They handle:
- **Inbound:** Receiving messages, normalizing to `NexusEvent`
- **Outbound:** Formatting and delivering responses

Runtime operation semantics are specified in `../nex/NEXUS_REQUEST_TARGET.md` (canonical pipeline and data bus).

---

## Documents

### Nexus Interface Specs

| Spec | Status | Description |
|------|--------|-------------|
| `ADAPTER_SYSTEM.md` | ✅ Done | **Operational system** — registration, accounts, lifecycle, process management, health, context integration |
| `INBOUND_INTERFACE.md` | ✅ Done | Receiving events, NexusEvent schema |
| `OUTBOUND_INTERFACE.md` | ✅ Done | Delivery, formatting, chunking |
| `sdk/OUTBOUND_TARGETING.md` | ✅ Done | Targeting semantics for threads + replies (`thread_id`, `reply_to_id`) |
| `adapters/BUILTIN_ADAPTERS.md` | 🚧 Active | Which integrations ship as built-in adapters (ingress + clock) and how they relate to the control-plane |
| `INTERNAL_ADAPTERS.md` | 🚧 Active | Add first-class support for internal (in-process) adapters like clock + HTTP ingress bridges |
| `workplans/CHANNEL_MIGRATION_TRACKER.md` | ✅ Active | Platform-by-platform execution tracker for adapter cutover |
| `adapters/CHANNEL_DIRECTORY.md` | ✅ Active | Per-platform directory of outbound targets (separate from identity directory) |
| `platforms/` | ✅ Done | Per-platform specs (9 platforms) |
| `sdk/ADAPTER_CREDENTIALS.md` | ✅ Active | How adapter accounts link to credentials + how NEX injects secrets |
| `sdk/ADAPTER_SDK_TYPESCRIPT.md` | ✅ Active | Detailed spec for the TypeScript adapter SDK |
| `../nex/NEXUS_REQUEST_TARGET.md` | ✅ Locked | Canonical NexusRequest data bus, 5-stage pipeline, and boundary between runtime and event adapters |

### Upstream Reference

| Spec | Description |
|------|-------------|
| `../upstream/delivery/CHANNEL_INVENTORY.md` | All channels in OpenClaw |
| `../upstream/delivery/TOOL_HOOK_MECHANISM.md` | How tool hooks work (and don't) |
| `../upstream/delivery/OPENCLAW_INBOUND.md` | OpenClaw inbound patterns |
| `../upstream/delivery/OPENCLAW_OUTBOUND.md` | OpenClaw outbound patterns |

---

## Quick Start

**Read `ADAPTER_SYSTEM.md`** for the full event-adapter operational system (registration, lifecycle, accounts).  
**Read `INBOUND_INTERFACE.md`** and **`OUTBOUND_INTERFACE.md`** for data contracts (NexusEvent, DeliveryResult, ChannelCapabilities).
**Read `../nex/NEXUS_REQUEST_TARGET.md`** for runtime operation semantics and the pipeline data bus.

---

## Key Concepts

### 1. Event Adapter Classes

Event adapters come in two classes:

1. Process adapters (external binaries)
2. Internal event adapters (in-process modules managed with adapter lifecycle semantics)

Process adapter example:

```bash
# Inbound: tool emits events
eve monitor --format jsonl

# Outbound: tool sends messages
eve send --chat-id "+1234567890" --text "Hello"
```

### 2. Separate Surface vs Adapter Interfaces

Inbound and outbound are separate for event adapters. One adapter can implement both, or use different tools:

| Tool | Inbound | Outbound | Channel |
|------|---------|----------|---------|
| `eve` | ✅ | ✅ | iMessage |
| `gog` | ✅ | ✅ | Gmail |
| `aix` | ✅ | ❌ | AI sessions |

Control-plane management operations are runtime operations through the unified registry and are not channel-style monitor/send adapter methods.

### 3. Capabilities

Each platform exposes capabilities for agent context:

```typescript
capabilities: {
  text_limit: 2000,          // Discord
  supports_markdown: true,
  supports_embeds: true,
  // ...
}
```

### 4. NexusEvent Envelope Integration

Adapters create/consume `NexusEvent` envelopes:
- Inbound adapter emits canonical event payloads (typically `operation=event.ingest`)
- Outbound adapter consumes runtime delivery requests to route/send responses

---

## Platform Support

### Per-Platform Specs

Per-platform details are consolidated in:

1. `platforms/CHANNEL_CATALOG.md`
2. `platforms/README.md`

---

## Open Questions

1. **Formatting guidance injection** — Just-in-time guidance when message tool is called. Strategy defined in `ADAPTER_SYSTEM.md` (tool response hints). See `../upstream/delivery/TOOL_HOOK_MECHANISM.md` for deeper investigation.

2. **Webhook adapters** — Adapters that need to receive webhooks (Telegram, LINE) run their own HTTP server. NEX connects to them for health but doesn't manage the listener port.

3. **Media handling** — Per-platform media limits and formats. See `platforms/` for current specs.

4. **Rate limiting** — Should NEX enforce outbound rate limits globally, or leave to adapters? Currently adapter-managed.

---

## Related Specs

- `../nex/NEXUS_REQUEST_TARGET.md` — Canonical NexusRequest data bus and pipeline
- `../nex/AGENT_DELIVERY.md` — Agent-driven delivery model
- `../iam/` — IAM processes events from adapters
- `../agents/` — Broker orchestrates agent execution
