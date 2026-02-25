# Runtime Surfaces Architecture

> Canonical reference for all Nexus runtime access surfaces, the unified event pipeline, and the consolidation plan.

**Status:** ACTIVE
**Last Updated:** 2026-02-24
**Related:**
- [DATABASE_ARCHITECTURE.md](../../DATABASE_ARCHITECTURE.md)
- [ADAPTER_SYSTEM.md](../delivery/ADAPTER_SYSTEM.md)
- [INTERNAL_ADAPTERS.md](../delivery/INTERNAL_ADAPTERS.md)
- [LIVE_E2E_HARNESS.md](../../environment/foundation/harnesses/LIVE_E2E_HARNESS.md)
- [ENTITY_SYMMETRIC_ROUTING_AND_PERSONA_BINDING.md](./ENTITY_SYMMETRIC_ROUTING_AND_PERSONA_BINDING.md)
- [SURFACE_ADAPTER_V2.md](./SURFACE_ADAPTER_V2.md)

---

## 1. Overview

Nexus uses one runtime with two execution kinds:

1. `event` operations normalize to `NexusEvent` and run the event pipeline.
2. `control` operations run direct handlers with IAM authorization and audit.

Both share one security envelope (AuthN -> sender resolution -> AuthZ -> audit/hooks). `protocol` operations are transport mechanics only.

### Design Principles

1. **Operation-kind taxonomy is canonical.** `protocol | control | event` (hard cutover from `transport | iam | pipeline`).
2. **Adapters own event ingress.** Event ingress is adapter-managed (`http-ingress`, clock, channels, etc.).
3. **Control surfaces stay synchronous.** Control-plane management methods preserve request/response semantics.
4. **Security and audit are uniform.** `control` and `event` operations use the same IAM/audit system.
5. **Receiver resolution drives agent execution.** In the `event` pipeline, agent execution depends on resolved receiver/access.
6. **One SPA, multiple shells/apps.** Runtime serves UI surfaces with app mounts.

---

## 2. Runtime Execution Model

### 2.1 Event Pipeline Stages

`event` operations flow through the 9-stage pipeline:

```
EVENT OPERATIONS
  │
  │  1. receiveEvent              Normalize event, create NexusRequest
  │  2. resolveIdentity     Contact lookup: (platform, space_id, sender_id) → sender entity
  │  3. resolveReceiver     Contact lookup: who is this addressed to? → receiver entity
  │  4. resolveAccess       Does this sender have permission to reach this receiver?
  │  5. runAutomations      Evaluate all matching automations
  │
  ├── receiver is agent?
  │   │
  │   YES ──→ 6. assembleContext → 7. runAgent → 8. deliverResponse → 9. finalize
  │   │
  │   NO ──→ 8. deliverResponse (may be no-op) → 9. finalize
  │
```

`control` operations are not normalized to `NexusEvent`; they run direct handlers after IAM authorization and emit control operation audit/bus records.

### 2.2 Receiver Resolution — The Core Routing Primitive

The pipeline resolves both **who sent this** and **who is this for** through the same identity substrate (`identity.db`), with different trusted ingress facts:

- Sender resolution: contacts path from sender identifiers.
- Receiver resolution: account binding path from trusted `(platform, account_id)`, with optional receiver hints used only for verification.

Implementation contract (normative):

- `DeliveryContext` remains sender/container taxonomy only.
- Resolved receiver state lives on `NexusRequest.receiver` as a sibling to `NexusRequest.sender`.
- `NexusRequest.receiver` is the canonical routing primitive used to decide whether agent execution runs.

```ts
type ReceiverContext =
  | {
      type: "agent";
      agent_id: string;
      entity_id?: string;
      name?: string;
      source?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: "system";
      entity_id?: string;
      name?: string;
      source?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: "entity";
      entity_id: string;
      name?: string;
      source?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: "unknown";
      name?: string;
      source?: string;
      metadata?: Record<string, unknown>;
    };
```

Agents are entities in `identity.db`; adapter accounts bind to receiver entities:

```
Account receiver bindings:
  (discord, atlas-bot-account)  → receiver_entity_id "ent_eve_main"
  (gmail, nexus-primary-inbox)  → receiver_entity_id "ent_eve_main"
  (slack, support-workspace)    → receiver_entity_id "ent_eve_support"
```

When an event arrives, receiver entity is resolved from account binding, canonicalized, then mapped to `(agent_id, persona_ref)` via persona bindings. If receiver resolves to `type=agent`, the agent path runs.

**Examples:**

| Event | Sender resolves to | Receiver resolves to | Agent runs? |
|-------|-------------------|---------------------|-------------|
| Discord DM to bot | tyler (entity) | main-agent (agent) | Yes — main-agent |
| Email to nexus@example.com | someone (entity) | main-agent (agent) | Yes — main-agent |
| Email to tyler@example.com | someone (entity) | tyler (owner, not an agent) | No — but automations evaluate |
| Control UI chat | operator (entity) | main-agent (agent) | Yes — main-agent |
| `config.set` from CLI | operator (entity) | system (not an agent) | No — handler executes directly |
| Clock heartbeat | system (entity) | system (not an agent) | No — but automation may trigger agent |
| Slack @nexus in #general | coworker (entity) | main-agent (agent) | Yes — main-agent |
| Slack message in #general (no mention) | coworker (entity) | #general space (not an agent) | No — but "monitor keywords" automation might trigger |
| Random stranger DMs bot on Discord | stranger (entity) | main-agent (agent) | **Only if access check passes** — sender must be authorized |

### 2.3 Access Control on Receiver

Just because someone addresses an agent doesn't mean the agent path runs. The **access** stage checks:

- Is this sender authorized to communicate with this receiver?
- Does the sender's entity have the required permissions?
- Is this platform/channel approved for this agent?

If a stranger emails your agent and they're not authorized, the event is logged (you see the attempt in your audit trail) but the agent is NOT invoked. No context assembled, no LLM call, no response. This is critical for security and cost control.

### 2.4 Session Key Construction

Session keys encode the sender-receiver relationship:

```
DM sessions:    dm:{sender_entity_id}:{receiver_entity_id}
Group sessions: group:{platform}:{container_id}:{receiver_entity_id}
Worker sessions: worker:{ulid}
System sessions: system:{purpose}
```

The receiver entity is part of the session key. This supports multiple receiver entities without coupling session identity to runtime persona choice.

Group thread messages route to the parent group session by default; `thread_id` remains metadata and does not create a canonical separate session key.

### 2.5 Automations — The Extension Point

Automations evaluate on **every event** that passes through the pipeline, regardless of whether the receiver is an agent. This enables:

- **Ambient monitoring:** "When an email arrives matching pattern X, dispatch agent Y to analyze it."
- **Security audit:** "When an API key is created, dispatch agent Z to review the action."
- **Reactive workflows:** "When config changes, notify the operator via Discord."
- **Scheduled tasks:** "On clock heartbeat matching cron pattern, dispatch agent."

Automations can trigger agent execution on events that would otherwise not run an agent. The automation specifies which agent to invoke and with what context.

The base case — "message addressed to agent → agent runs" — is baked into the pipeline as a primitive, not an automation. This is the core product behavior and cannot be accidentally deleted.

---

## 3. Surface Roles and Adapter Classes

### 3.1 Control Surface (internal, always-on)

The control-plane WS/HTTP surface is runtime-core and uses `protocol | control | event` classification.

| Method | Kind | Behavior |
|-----------|-----------|-------------------|
| `chat.send` | `event` | Normalize to `NexusEvent` -> event pipeline |
| `config.set` | `control` | IAM authorize -> direct handler -> sync response |
| `sessions.list` | `control` | IAM authorize -> direct handler -> sync response |
| `health` | `control` | IAM authorize -> direct handler -> sync response |
| `chat.abort` | `control` | IAM authorize -> direct handler -> sync response |
| `agents.reload` | `control` | IAM authorize -> direct handler -> sync response |

Rules:

1. `protocol` methods are transport/session mechanics only.
2. `control` and `event` methods share AuthN + sender resolution + IAM + audit/hook prelude.
3. `event` methods enter `nex.processEvent(...)`.
4. `control` methods preserve synchronous request/response behavior.

### 3.2 Event Ingress Adapters

Event ingress is adapter-managed and emits canonical `NexusEvent`.

Internal adapter example:

| Adapter | Purpose |
|----------|---------|
| `http-ingress` | OpenAI/OpenResponses/webhooks/webchat session bootstrap ingress |

External adapter examples (child processes over JSONL stdio):

| Adapter | Platform | Transport |
|---------|----------|-----------|
| `nexus-adapter-discord` | Discord | Discord Gateway WebSocket |
| `nexus-adapter-gog` | Gmail | IMAP |
| `eve` | iMessage | AppleScript / native |
| `nexus-adapter-slack` | Slack | Socket mode / webhook callbacks |

### 3.3 System Event Adapters

| Adapter | Purpose |
|---------|---------|
| `clock` | Timer/heartbeat/scheduled event source |

System adapters emit reserved system events and still use event pipeline policy/audit behavior.

### 3.4 Summary

```
CLIENTS
  -> Control Surface (protocol/control/event)
      -> control handler path (kind=control)
      -> event pipeline path (kind=event)

EXTERNAL/INTERNAL INGRESS ADAPTERS
  -> NexusEvent
      -> event pipeline (9 stages)
```

---

## 4. Observability — Contact & Interaction Tracking

Because every event is logged to `events.db` with resolved sender and receiver entities, the system automatically builds a complete interaction graph:

- **Per-agent:** All contacts who have messaged this agent, when, on which platforms, how many interactions.
- **Per-user entity:** All agents and platforms this user has interacted with, full communication history.
- **Per-operator:** Audit trail of all control operations (config changes, API key issuance, permission modifications).
- **Cross-platform:** A single entity may interact with the same agent via Discord, email, and the Control UI — all tracked and linked through the entity system.

This data enables:
- Audit dashboards for multi-user/business deployments
- Contact/relationship visualization per agent
- Security monitoring (unauthorized access attempts are logged even when denied)
- Usage analytics (which agents are most active, which platforms, which users)

---

## 5. One SPA, Multiple Shells

All human-facing UI is a single web application.

### 5.1 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ONE SPA                                │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │  Chat / Agent    │  │  Agent Canvas                 │ │
│  │  Interface       │  │                               │ │
│  │                  │  │  JSON-defined UI components   │ │
│  │  Messages        │  │  Agent-generated pages        │ │
│  │  Tool calls      │  │  Interactive widgets          │ │
│  │  Streaming       │  │  User-prompted UI generation  │ │
│  │  File artifacts  │  │  Sandboxed rendering          │ │
│  └──────────────────┘  └──────────────────────────────┘ │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │  Sessions /      │  │  Settings / Config           │ │
│  │  History         │  │  Agents / Skills / Adapters  │ │
│  └──────────────────┘  └──────────────────────────────┘ │
└─────────────────────────┬────────────────────────────────┘
                          │
              Served by Control Surface (HTTP + WS on :18789)
                          │
          ┌───────────────┼───────────────┐
          │               │               │
     ┌────▼────┐   ┌─────▼──────┐  ┌─────▼──────┐
     │ Browser │   │ Tauri      │  │ Mobile     │
     │ Tab     │   │ Desktop    │  │ WebView    │
     │         │   │ App Shell  │  │ + Native   │
     │         │   │ + System   │  │   Bridge   │
     │         │   │   Tray     │  │   Shim     │
     └─────────┘   └────────────┘  └────────────┘
```

### 5.2 Agent Canvas (Generated UI)

The Agent Canvas is a section of the SPA where agents can generate, display, and iteratively build custom UIs for the user.

**Rendering approach:** JSON-defined UI components (using a library like [JSON Render](https://json-render.dev/) or similar) allow agents to produce structured UI definitions that the SPA renders dynamically.

**Flow:**
1. Agent produces a JSON UI definition (components, layout, data bindings, action handlers)
2. Definition is delivered as a message artifact through the WS RPC
3. SPA renders the JSON into interactive HTML in the canvas section
4. User interactions fire events back through the WS RPC to the agent
5. Agent can update the JSON definition to modify the UI reactively

**Sandboxing:** Agent-generated HTML (when raw HTML is needed rather than JSON-defined components) renders in sandboxed iframes using `srcdoc`. The iframe boundary provides DOM isolation, script isolation, and prevents generated content from accessing the parent SPA's state or auth tokens.

**Benefits over the old Canvas Host approach:**
- No separate file server or directory to manage
- No live-reload WebSocket (the WS RPC handles updates)
- Same rendering on all shells (browser, desktop, mobile)
- Agent UIs are message artifacts with full history, versioning, and context
- The agent canvas is part of the SPA's navigation, not a separate URL

### 5.3 Shell-Specific Capabilities

Each shell wraps the same SPA but provides additional native capabilities:

| Shell | Extra Capabilities |
|-------|-------------------|
| **Browser tab** | None (pure web) |
| **Tauri desktop** | System tray, native notifications, global hotkeys, file system access, auto-update |
| **Mobile WebView** | Push notifications, camera, haptics, biometrics, background fetch, share sheet |

The mobile native bridge shim exposes these capabilities via `window.Nexus.*` APIs that the SPA can feature-detect and use when available.

---

## 6. Eliminated Surfaces

These surfaces exist in the current codebase (inherited from openclaw) and are being eliminated or superseded.

### 6.1 Standalone Ingress Server (`:18790`) -> HTTP Ingress Adapter

**Current state:** Separate HTTP server for protocol bridges. Calls `dispatchNexusEvent()` directly.

**Resolution:** Becomes the `http-ingress` internal adapter. Same port, same routes, but managed as an adapter with lifecycle, health, status. Appears in `nexus adapter status`.

### 6.2 Canvas Host (`/__nexus__/canvas/`) → SPA Inline Rendering

**Current state:** Static file server for agent-generated HTML with live-reload.

**Resolution:** Superseded. Agent-generated UIs render inline in the SPA via JSON Render / sandboxed iframes.

### 6.3 A2UI Bridge → Mobile Native Shim

**Current state:** JS bridge injected into canvas HTML for iOS/Android WebViews.

**Resolution:** Mobile shell injects a thin native capability shim when loading the SPA. Not a separate serving system.

### 6.4 TUI (Terminal UI) → Drop

**Current state:** Terminal chat interface connecting via WS.

**Resolution:** Drop. CLI remains for scripting. Interactive chat happens in the SPA.

### 6.5 Standalone Canvas Server (`:18793`) → Eliminated

**Resolution:** Eliminated along with Canvas Host.

---

## 7. Browser Control — Deferred

### 7.1 Current State

Full browser automation system (10,500 lines production code) with Playwright + CDP, two drivers (managed Chrome, extension relay), multi-profile management, 30+ REST API endpoints.

### 7.2 Decision: Keep and Defer

The browser automation space is rapidly evolving. Building and maintaining a bespoke solution is premature.

**Actions:**
- Keep existing upstream code config-gated and dormant (`browser.enabled = false`)
- Zero runtime cost when disabled (lazy-loaded)
- No workspace lifecycle changes, no E2E assertions
- Re-evaluate when core runtime is hardened, considering: upstream openclaw browser control, Vercel `agent-browser`, Anthropic computer-use, Playwright MCP

### 7.3 Unique Value If Retained

- **Chrome Extension Relay** — control user's real browser (unique capability)
- **Profile management** — multiple isolated browser contexts
- **Deep runtime integration** — identity resolution, event bus hooks

---

## 8. Port Allocation (Target State)

| Port | Surface | Owner |
|------|---------|-------|
| **18789** | Control surface (SPA + WS + health) | Runtime core (always-on) |
| **18790** | HTTP Ingress Adapter (OpenAI compat, webhooks) | Internal adapter (configurable) |
| **18791** | Browser Control REST API | Browser subsystem (deferred, opt-in) |
| **18792** | Chrome Extension Relay | Browser subsystem (deferred, opt-in) |

Ports 18791-18792 are only used when `browser.enabled = true`.

---

## 9. Migration Path

### Phase 1: Document (current)
- This document captures all architectural decisions
- LIVE_E2E_HARNESS Bundle C references this document

### Phase 2: Unified Pipeline
- Add receiver resolution to the pipeline (identify receiver entity from delivery context)
- Add event logging for all event types (control ops included) to `events.db`
- Make `assembleContext → runAgent` conditional on receiver being an agent
- Update session key format to canonical entity-based routing: `dm:{sender_entity}:{receiver_entity}` and `group:{platform}:{container}:{receiver_entity}`

### Phase 3: Surface Taxonomy Cutover
- Replace legacy `transport|iam|pipeline` names with `protocol|control|event`
- Keep control-plane as control surface (not channel-style event adapter)
- Enforce shared AuthN/sender/AuthZ/audit envelope before kind-specific execution

### Phase 4: Internal Event Adapter Infrastructure
- Implement internal adapter registry in the adapter manager
- Define `InternalAdapterInstance` interface
- Migrate HTTP ingress from standalone listener to `http-ingress` internal adapter
- Add internal adapter health/status to `nexus adapter status`

### Phase 5: Clean Up
- Remove standalone ingress fallback behavior
- Drop TUI code
- Drop canvas host server (`src/canvas-host/`)
- Drop A2UI injection system

### Phase 6: Agent Canvas (SPA)
- Implement JSON Render (or similar) component in Control UI
- Define artifact message format for agent-generated UIs
- Wire user interaction events back through WS RPC
- Implement sandboxed iframe rendering for raw HTML artifacts

---

## 10. Summary

| Surface | Role | Status |
|---------|------|--------|
| **Control surface** (:18789) | Primary human interface (SPA + WS + control ops) | Core, always-on |
| **HTTP Ingress Adapter** (:18790) | External API bridges (OpenAI, webhooks) | Internal adapter, configurable |
| **External Adapters** | Platform connections (Discord, Gmail, Slack, iMessage) | Core, per-platform |
| **Clock Adapter** | System timer/heartbeat events | Internal adapter, always-on |
| **SPA (Control UI)** | One web app for all human UI needs | Core, evolving |
| **Agent Canvas** | Agent-generated UI rendering in SPA | Planned (JSON Render) |
| **Browser Control** | Agent browser automation | Deferred, opt-in |
| **Node Registry** | Mobile/remote device management | Deferred |
| **TUI** | Terminal chat interface | Dropped |
| **Canvas Host** | Standalone file server for agent HTML | Superseded |
| **A2UI Bridge** | WebView injection system | Superseded |
| **Ingress surface** | Adapter-owned external protocol bridges | Active |
