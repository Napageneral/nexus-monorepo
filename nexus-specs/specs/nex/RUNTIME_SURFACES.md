# Runtime Surfaces Architecture

> Canonical reference for all Nexus runtime access surfaces, the unified event pipeline, and the consolidation plan.

**Status:** ACTIVE
**Last Updated:** 2026-02-20
**Related:**
- [DATABASE_ARCHITECTURE.md](../../DATABASE_ARCHITECTURE.md)
- [ADAPTER_SYSTEM.md](../delivery/ADAPTER_SYSTEM.md)
- [INTERNAL_ADAPTERS.md](../delivery/INTERNAL_ADAPTERS.md)
- [LIVE_E2E_HARNESS.md](../../environment/foundation/harnesses/LIVE_E2E_HARNESS.md)

---

## 1. Overview

Every event in Nexus — chat messages, control operations, platform notifications, system heartbeats — enters through the same unified pipeline. There are no exceptions, no alternate paths, no surface-specific security models.

### Design Principles

1. **One pipeline, no exceptions.** Every event from every source goes through: auth → identify sender → identify receiver → access → log → automations.
2. **Adapters are the only ingress mechanism.** Every source of events is an adapter — WS RPC, HTTP, Discord, Gmail, clock. Some are internal (always-on, in-process), some are external (child processes).
3. **Receiver resolution drives agent execution.** If the resolved receiver is an agent persona, the agent runs. If not, the event is logged and automations decide what happens. No event `kind` field needed.
4. **Everything is logged.** Every event hits `events.db` — messages, control operations, system events. Full audit trail for multi-user deployments.
5. **One SPA, multiple shells.** A single web application serves all human-facing UI needs across browser, desktop, and mobile.

---

## 2. The Unified Event Pipeline

### 2.1 Pipeline Stages

Every event, regardless of source, flows through the 9-stage pipeline:

```
ALL EVENTS (from any adapter)
  │
  │  1. ingest              Normalize event, create NexusRequest
  │  2. resolveIdentity     Contact lookup: (platform, space_id, sender_id) → sender entity
  │  3. resolveReceiver     Contact lookup: who is this addressed to? → receiver entity
  │  4. resolveAccess       Does this sender have permission to reach this receiver?
  │  5. runAutomations      Evaluate all matching automations
  │
  ├── receiver is agent persona?
  │   │
  │   YES ──→ 6. routeSession → 7. runAgent → 8. processResponse → 9. deliverResponse
  │   │
  │   NO ──→ 9. deliverResponse (log + done; automations may have triggered agents independently)
  │
  └── if control operation: execute handler, return result to caller
```

### 2.2 Receiver Resolution — The Core Routing Primitive

The pipeline resolves both **who sent this** and **who is this for** using the same contact/identity system.

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

Agent personas are entities in `identity.db` with contact mappings:

```
Agent "main-agent" contacts:
  (discord, guild_123, nexus-bot#5678)  → entity_id "main-agent"
  (email, *, nexus@example.com)         → entity_id "main-agent"
  (slack, workspace_abc, U_NEXUS)       → entity_id "main-agent"
  (control-plane, *, default)           → entity_id "main-agent"

Agent "support-agent" contacts:
  (discord, guild_123, support-bot#9012) → entity_id "support-agent"
  (email, *, support@example.com)        → entity_id "support-agent"
```

When an event arrives, the adapter provides delivery context including receiver info. The pipeline resolves the receiver contact to an entity. If that entity is an agent persona, the agent runs.

**Examples:**

| Event | Sender resolves to | Receiver resolves to | Agent runs? |
|-------|-------------------|---------------------|-------------|
| Discord DM to bot | tyler (entity) | main-agent (persona) | Yes — main-agent |
| Email to nexus@example.com | someone (entity) | main-agent (persona) | Yes — main-agent |
| Email to tyler@example.com | someone (entity) | tyler (owner, not persona) | No — but automations evaluate |
| Control UI chat | operator (entity) | main-agent (persona) | Yes — main-agent |
| `config.set` from CLI | operator (entity) | system (not a persona) | No — handler executes directly |
| Clock heartbeat | system (entity) | system (not a persona) | No — but automation may trigger agent |
| Slack @nexus in #general | coworker (entity) | main-agent (persona) | Yes — main-agent |
| Slack message in #general (no mention) | coworker (entity) | #general space (not a persona) | No — but "monitor keywords" automation might trigger |
| Random stranger DMs bot on Discord | stranger (entity) | main-agent (persona) | **Only if access check passes** — sender must be authorized |

### 2.3 Access Control on Receiver

Just because someone addresses an agent persona doesn't mean the agent runs. The **access** stage checks:

- Is this sender authorized to communicate with this receiver?
- Does the sender's entity have the required permissions?
- Is this platform/channel approved for this agent persona?

If a stranger emails your agent and they're not authorized, the event is logged (you see the attempt in your audit trail) but the agent is NOT invoked. No context assembled, no LLM call, no response. This is critical for security and cost control.

### 2.4 Session Key Construction

Session keys encode the sender-receiver relationship:

```
DM sessions:    dm:{sender_entity}:persona:{receiver_persona}
Group sessions: group:{platform}:{container_id}:persona:{receiver_persona}
Thread sessions: group:{platform}:{container_id}:persona:{receiver_persona}:thread:{thread_id}
Worker sessions: worker:{ulid}
System sessions: system:{purpose}
```

The receiver persona is now part of the session key. This naturally supports multi-agent: two different agent personas communicating with the same sender get separate sessions.

Legacy compatibility note:

- Older labels (`dm:{sender_entity}`, `group:{platform}:{container_id}`) are still resolvable via aliases during migration, but new routing keys should use the persona-scoped form.

Group chats always resolve to a unique group session keyed by container, not individual DM sessions. Everyone in the group shares one session per agent persona.

### 2.5 Automations — The Extension Point

Automations evaluate on **every event** that passes through the pipeline, regardless of whether the receiver is an agent persona. This enables:

- **Ambient monitoring:** "When an email arrives matching pattern X, dispatch agent Y to analyze it."
- **Security audit:** "When an API key is created, dispatch agent Z to review the action."
- **Reactive workflows:** "When config changes, notify the operator via Discord."
- **Scheduled tasks:** "On clock heartbeat matching cron pattern, dispatch agent."

Automations can trigger agent execution on events that would otherwise not run an agent. The automation specifies which agent persona to invoke and with what context.

The base case — "message addressed to agent → agent runs" — is baked into the pipeline as a primitive, not an automation. This is the core product behavior and cannot be accidentally deleted.

---

## 3. Adapters — The Only Ingress Mechanism

Every source of events is an adapter. There are no alternate paths into the pipeline.

### 3.1 WS RPC Adapter (internal, always-on)

The Control Plane WebSocket connection at `:18789`. This is the primary human-facing interface.

**What it handles:**

| Operation | Event type | Pipeline behavior |
|-----------|-----------|-------------------|
| `chat.send` | Message to agent persona | Full pipeline → agent runs |
| `config.set` | Control operation | Full pipeline → handler executes, result returned |
| `sessions.list` | Control operation | Full pipeline → handler executes, result returned |
| `health` | Control operation | Full pipeline → handler executes, result returned |
| `chat.abort` | Control operation | Full pipeline → handler executes, result returned |
| `agents.reload` | Control operation | Full pipeline → handler executes, result returned |

All operations go through auth → identify → access → log → automations. Control operations additionally have their handler execute and return a synchronous result to the caller.

Control operation receiver semantics (normative):

- Control operations resolve `receiver = system` (not persona).
- They MUST still pass through auth/identify/access/log/automations.
- They MUST preserve synchronous request/response behavior for the caller.
- Because receiver is `system`, they take the non-agent branch (no `routeSession → runAgent` path).

**Special properties:**
- Always-on (cannot be disabled — it IS the runtime)
- Synchronous result path for control operations
- Serves the SPA (static file hosting over HTTP on the same port)
- Serves `/health` endpoint

**Who connects:** Control UI (browser), Tauri desktop, mobile WebView, CLI.

**Auth model:**
- Local loopback: auto-trusted (operator is on the same machine)
- Remote: token or password authentication
- Hosted/multi-user: per-connection auth token → entity_id → permission set

### 3.2 HTTP Ingress Adapter (internal, configurable)

Owns its own HTTP listener (`:18790`). Handles protocol bridges for external API consumers.

| Endpoint | Purpose |
|----------|---------|
| `POST /v1/chat/completions` | OpenAI-compatible chat completions |
| `POST /v1/responses` | OpenResponses API |
| Webhook routes | Configurable webhook ingress |
| `POST /api/ingress/webchat/session` | Webchat session bootstrap (cookie minting) |

All requests → auth (bearer token / webhook signature) → pipeline.

Can be enabled/disabled via config. Shows in `nexus adapter status`.

### 3.3 External Adapters (child processes)

Long-running processes that maintain their own connections to external platforms. Communicate via JSONL on stdio.

| Adapter | Platform | Transport |
|---------|----------|-----------|
| `nexus-adapter-discord` | Discord | Discord Gateway WebSocket |
| `nexus-adapter-gog` | Gmail | IMAP |
| `eve` | iMessage | AppleScript / native |
| `slack` | Slack | Slack Socket Mode / HTTP callbacks |

CLI protocol: `<command> monitor --account <id> --format jsonl` emits events on stdout. `<command> send --to <target> --text "..."` delivers outbound.

Each adapter is individually configurable, supervised with restart policies, health-monitored, and visible in `nexus adapter status`.

### 3.4 System Adapters (internal, always-on)

| Adapter | Purpose |
|---------|---------|
| `clock` | Timer/heartbeat events for cron-like scheduling |

System adapters emit events with sender = "system". No external auth needed (they are the system itself). Automations evaluate on their events to trigger scheduled agent work.

### 3.5 Adapter Summary

```
     CLIENTS                         ADAPTERS                        PIPELINE
┌─────────────┐
│ Browser Tab  │──┐
│ Tauri App    │  ├── WS ──→  WS RPC Adapter ─────────────┐
│ Mobile App   │  │           (internal, always-on)        │
│ CLI          │──┘                                        │
└─────────────┘                                            │
                                                           │
┌─────────────┐                                            │
│ OpenAI API  │── HTTP ──→  HTTP Ingress Adapter ──────────┤
│ Webhooks    │            (internal, configurable)        │
│ Webchat     │                                            │
└─────────────┘                                            ▼
                                                ┌──────────────────┐
┌─────────────┐                                 │                  │
│ Discord     │── JSONL ──→ Discord Adapter ───→│    PIPELINE      │
│ Gmail       │── JSONL ──→ Gmail Adapter ─────→│  (9 stages)      │
│ Slack       │── JSONL ──→ Slack Adapter ─────→│                  │
│ iMessage    │── JSONL ──→ iMessage Adapter ──→│  1. ingest       │
└─────────────┘                                 │  2. resolveId    │
                                                │  3. resolveRecv  │
┌─────────────┐                                 │  4. resolveAccess│
│ System      │── internal → Clock Adapter ────→│  5. runAutomate  │
└─────────────┘                                 │    │             │
                                                │    ▼             │
                                                │  receiver is     │
                                                │  agent persona?  │
                                                │    │       │     │
                                                │   YES     NO     │
                                                │    │       │     │
                                                │  6.route   9.    │
                                                │  Session deliver  │
                                                │  7.runAgent Resp │
                                                │  8.process       │
                                                │    Response      │
                                                │  9.deliver       │
                                                │    Response      │
                                                └──────────────────┘
```

---

## 4. Observability — Contact & Interaction Tracking

Because every event is logged to `events.db` with resolved sender and receiver entities, the system automatically builds a complete interaction graph:

- **Per-agent persona:** All contacts who have messaged this agent, when, on which platforms, how many interactions.
- **Per-user entity:** All agents and platforms this user has interacted with, full communication history.
- **Per-operator:** Audit trail of all control operations (config changes, API key issuance, permission modifications).
- **Cross-platform:** A single entity may interact with the same agent via Discord, email, and the Control UI — all tracked and linked through the entity system.

This data enables:
- Audit dashboards for multi-user/business deployments
- Contact/relationship visualization per agent persona
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
              Served by WS RPC Adapter (HTTP + WS on :18789)
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

### 6.1 Ingress Listener (`:18790`) → HTTP Ingress Adapter

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
| **18789** | WS RPC Adapter (SPA + WS + health) | Runtime core (always-on) |
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
- Make `routeSession → runAgent` conditional on receiver being an agent persona
- Update session key format to include receiver persona: `dm:{sender}:persona:{persona}`

### Phase 3: WS RPC as Adapter
- Refactor control-plane WS RPC to emit events through the pipeline for all operations
- Control operations go through auth → identify → access → log → automations → handler
- Remove per-method auth checks in RPC handlers (pipeline handles auth/access)

### Phase 4: Internal Adapter Infrastructure
- Implement internal adapter registry in the adapter manager
- Define `InternalAdapterInstance` interface
- Migrate HTTP ingress from standalone listener to `http-ingress` internal adapter
- Add internal adapter health/status to `nexus adapter status`

### Phase 5: Clean Up
- Remove standalone ingress listener creation
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
| **WS RPC Adapter** (:18789) | Primary human interface (SPA + WS + control ops) | Core, always-on |
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
| **Ingress Listener** | Separate HTTP server for protocol bridges | Migrating to adapter |
