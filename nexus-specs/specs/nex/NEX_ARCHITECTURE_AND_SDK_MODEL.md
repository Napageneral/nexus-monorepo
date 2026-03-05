# Nex Architecture: Operations, Surfaces, Apps, and SDKs

**Status:** DESIGN (authoritative target)
**Last Updated:** 2026-03-02

---

## Overview

This document defines the conceptual architecture of the Nex runtime as a layered system. It establishes the mental model for how all pieces fit together — the core operation pipeline, the transport surfaces, the client ecosystem, and the SDK contracts.

Every design decision in the Nex ecosystem should be traceable back to this model.

---

## The Four Layers

Nex is organized into four conceptual layers. Each layer has a single responsibility.

```
┌─────────────────────────────────────────────────────────┐
│  4. SDK Layer          Typed client libraries            │
│     (developer         (TypeScript, Go, etc.)            │
│      ergonomics)       Generated from operation schemas  │
├─────────────────────────────────────────────────────────┤
│  3. Client Layer       CLI, Control UI, App UIs,         │
│     (callers)          App Services, Agents, MCP Tools,  │
│                        External integrations             │
├─────────────────────────────────────────────────────────┤
│  2. Transport Layer    WebSocket, HTTP, gRPC, stdio      │
│     (surfaces)         Different wire protocols,         │
│                        same operations                   │
├─────────────────────────────────────────────────────────┤
│  1. Core Layer         Operation taxonomy + pipeline     │
│     (the runtime)      Auth, IAM, execution, tracing     │
│                        Ledgers, adapters, automations    │
└─────────────────────────────────────────────────────────┘
```

### Layer 1: Core (The Operation Pipeline)

The core layer IS the Nex runtime. It consists of:

- **The operation taxonomy** — A catalog of every operation the runtime supports. Each operation has a name (e.g., `health`, `config.get`, `adapter.connections.list`), defined input/output schemas, a mode, an action type, and a resource for IAM.

- **The 5-stage pipeline** — Every operation, regardless of source, flows through the same pipeline: `acceptRequest → resolvePrincipals → resolveAccess → executeOperation → finalizeRequest`. See [NEXUS_REQUEST_TARGET.md](./NEXUS_REQUEST_TARGET.md).

- **The NexusRequest bus** — The single mutable data object that flows through the pipeline. It carries the operation name, payload, routing, principals, access decisions, and stage traces.

- **Operation handlers** — The code that executes when an operation is dispatched. Handlers read and write to ledgers (events.db, identity.db, memory.db, etc.), interact with adapters, manage agent runs, and return results.

- **Automation hookpoints** — Hooks at pipeline stage boundaries that allow automations to observe, enrich, override, or handle requests.

The core layer does not know or care how a request arrived. A `NexusRequest` is a `NexusRequest` whether it came from a terminal, a browser, an adapter binary, or a cron timer.

**The operation taxonomy is the single source of truth for what Nex can do.** Everything above this layer is just a way to invoke these operations.

### Layer 2: Transport (Surfaces)

The transport layer provides different wire protocols for sending operation requests to the core pipeline and receiving responses. Each transport is a **surface** — a projection of the same core operations over a specific protocol.

Surfaces exist because different callers have different protocol needs:

| Surface | Protocol | Why It Exists |
|---------|----------|---------------|
| **WebSocket** | Persistent bidirectional JSON-RPC | Primary surface. Supports streaming, push events, persistent auth sessions. Natural for interactive clients (CLI, UIs). |
| **HTTP** | Stateless request/response | Universal protocol. Required for health probes (load balancers expect `GET /health`), stateless API calls, SSE event streams, and callers that don't want WebSocket lifecycle. |
| **stdio JSONL** | Newline-delimited JSON over stdin/stdout | Process-to-process IPC. Used for communication between the runtime and managed child processes (adapter binaries, potentially app service binaries). Simple, no port management, natural parent-child lifecycle. |
| **gRPC** | HTTP/2 + protobuf (future consideration) | Strongly typed, multi-language, bidirectional streaming. Potential future replacement for stdio and/or HTTP for internal process communication. Not required for V1. |

**Key principles:**

1. **All operations are available on all surfaces.** The surface determines the wire protocol, not the available operations. IAM controls access, not surface membership.

2. **Surfaces are transport, not API.** The operation schemas are defined once in the core layer. Each surface serializes/deserializes the same schemas over its wire protocol.

3. **Adding a new surface doesn't change the core.** If you need a new transport (e.g., gRPC, Unix domain sockets, MQTT), you add a surface that translates wire protocol to `NexusRequest` and feeds the pipeline. Zero changes to operation handlers.

**Authentication differs by surface** but the result is the same — a resolved identity attached to the `NexusRequest`:

| Surface | Auth Mechanism |
|---------|---------------|
| WebSocket | Persistent session: `connect` operation with token on handshake |
| HTTP | Stateless: Bearer token in `Authorization` header per request |
| stdio | Implicit trust: child process was spawned by runtime, identity is the adapter/service |
| gRPC | Per-call metadata or channel credentials |

**Streaming behavior** adapts to the surface's capabilities:

| Surface | Streaming |
|---------|-----------|
| WebSocket | Push messages on the connection |
| HTTP | Server-Sent Events (SSE) |
| stdio | Streaming JSONL lines |
| gRPC | Server streaming or bidirectional streaming |

**Internal triggers** (cron timers, automation hookpoints) are not surfaces. They are internal mechanisms that dispatch operations directly into the pipeline without an external transport. The operation still flows through all 5 pipeline stages.

### Layer 3: Client (Callers)

Callers are the programs and systems that use the transport surfaces to dispatch operations. Each caller uses one or more surfaces depending on its needs.

| Caller | Surface(s) | Description |
|--------|------------|-------------|
| **CLI** (`nex` command) | WebSocket | Human-friendly terminal interface. Maps subcommands to operations. Formats output for the terminal. |
| **Control Panel UI** | WebSocket | Web-based admin dashboard. React SPA that sends operations over WebSocket. |
| **App UIs** (GlowBot, Spike, etc.) | WebSocket | App-specific SPAs served by the runtime. Each sends operations over WebSocket. |
| **App Service Binaries** | stdio / HTTP / gRPC | Managed child processes that handle app-specific operations. The runtime dispatches operations to them; they can also call back into the runtime to use platform capabilities. |
| **Adapter Binaries** | stdio | Managed child processes that implement adapter protocol operations. Bidirectional: push events to runtime, receive commands from runtime. |
| **Agents** | Internal dispatch | Agent runs execute within the pipeline. They invoke operations (tools, delivery, memory) via internal dispatch — no transport layer needed since they're already inside the runtime. |
| **Automation Hookpoints** | Internal dispatch | Hookpoint handlers dispatch sub-operations directly. |
| **Health Probes** | HTTP | Load balancers, monitoring systems. `GET /health`. |
| **External Tools** | HTTP | MCP servers, webhooks, third-party integrations calling in via HTTP API. |
| **Cron Scheduler** | Internal dispatch | Timer-based operation dispatch. Not a surface — the scheduler lives inside the runtime. |

**Note on app service binaries:** These are the only callers that are **bidirectional**. The runtime dispatches operations TO them (e.g., `spike.hydrate`), and they dispatch operations BACK to the runtime (e.g., to check entitlements, emit events, log audit entries). The return path uses the SDK (see Layer 4).

### Layer 4: SDK (Typed Client Libraries)

The SDK layer provides typed, ergonomic client libraries for calling operations. SDKs are generated from the operation taxonomy's schemas.

**The SDK does not add capabilities.** Every SDK method maps to an operation dispatch. The SDK provides:

1. **Discoverability** — IDE autocomplete, documentation, method signatures
2. **Type safety** — Compile-time validation of inputs and outputs
3. **Abstraction stability** — If operation names change, the SDK absorbs the change
4. **Multi-language support** — Same schemas, generated for TypeScript, Go, Python, etc.

**Two SDK directions:**

| SDK | Direction | Purpose |
|-----|-----------|---------|
| **Nex SDK** (client) | Caller → Runtime | "Here are the operations Nex provides. Call them." Used by app UIs, app services, CLI, and any external caller. |
| **Adapter SDK** (server) | Runtime → Adapter | "Here are the operations Nex expects you to implement. Handle them." Used by adapter binary authors. |

Both SDKs are derived from the same operation taxonomy. The Nex SDK wraps operation dispatch. The Adapter SDK wraps operation handling.

**SDK generation pipeline:**

```
Operation Taxonomy (JSON Schema / OpenAPI)
    │
    ├── Generate TypeScript SDK  (@nex/sdk)
    ├── Generate Go SDK          (nex-sdk-go)
    ├── Generate Python SDK      (nex-sdk-python, if needed)
    │
    ├── Generate TypeScript Adapter SDK  (@nex/adapter-sdk)
    └── Generate Go Adapter SDK          (nex-adapter-sdk-go)
```

**App-specific operations and SDKs:**

Apps declare their own operations in their manifest. These operations extend the taxonomy at runtime but are NOT part of the core SDK. Apps may optionally publish their own SDK for their operations:

```
Core Operation Taxonomy
    │
    ├── Core Nex SDK (health, config, adapters, events, etc.)
    │
    ├── Spike declares: spike.hydrate, spike.ask, spike.repos.list, ...
    │   └── Optional: @spike/sdk with typed wrappers
    │
    └── GlowBot declares: glowbot.overview, glowbot.funnel, ...
        └── Optional: @glowbot/sdk with typed wrappers
```

Any caller can dispatch any operation by name using the core SDK's generic `dispatch(operation, payload)`. The app-specific SDKs are convenience — they provide types and autocomplete for the app's operations.

For agent tool use, the operation's JSON Schema (from the manifest or taxonomy) serves as the tool definition. No separate SDK is needed — the schema IS the contract.

---

## The App Model

A Nex App is a standalone package that extends the runtime with purpose-built capabilities.

### Anatomy of a Nex App

```
my-app/
  app.nexus.json          # Manifest: declares operations, UI, services, adapters
  ui/                     # Optional: static SPA files served by runtime
    index.html
    assets/
  bin/                    # Optional: service binary (Go, Rust, Python, etc.)
    my-app-engine
  adapters/               # Optional: adapter binaries
    my-adapter
```

### What an App Is (Precisely)

An app is:

1. **A manifest** (`app.nexus.json`) — Declares the app's operations (name, input/output schema, IAM), UI entry point, service binaries, adapter binaries, configuration schema, and lifecycle hooks.

2. **A service binary** — Any executable that implements the app's operations. The runtime manages its lifecycle (spawn, health-check, restart, stop). The service receives operation requests from the runtime and returns responses. It can call back into the runtime via the SDK.

3. **Optional UI** — Static files (HTML, JS, CSS) served by the runtime. The UI is a Single Page Application that calls operations via WebSocket using the SDK. The runtime hosts it in the app frame (navigation bar, app switching).

4. **Optional adapters** — Adapter binaries that follow the adapter protocol. Declared in the manifest, managed by the runtime's adapter system.

### How an App Handles a Request

```
User clicks "Hydrate Repo" in Spike UI
    │
    │  SDK call: dispatch("spike.hydrate", { repo: "foo/bar" })
    │  → sent over WebSocket
    │
    ▼
Nex Runtime Pipeline
    │  acceptRequest:      parse, validate, assign request_id
    │  resolvePrincipals:  user is Tyler, account is Tyler's account
    │  resolveAccess:      IAM check — Tyler has "write" on "apps.spike.repos"
    │  executeOperation:   look up handler for "spike.hydrate"
    │                      → routed to Spike service binary
    │
    ▼
Spike Service Binary (Go, listening on localhost:3100)
    │  receives: { operation: "spike.hydrate", payload: { repo: "foo/bar" }, user: {...} }
    │
    │  // App logic:
    │  1. Call back to nex: dispatch("entitlements.check", { key: "repos.max_count" })
    │     → runtime checks frontdoor billing, returns limit
    │  2. Enforce limit (if currentCount >= limit, return error)
    │  3. Clone repo, build PRLM, index code
    │  4. Call back to nex: dispatch("audit.log", { action: "spike.hydrate", repo: "foo/bar" })
    │  5. Return { status: "ok", indexed_files: 1247 }
    │
    ▼
Response flows back through pipeline to browser
```

### The Service IS the Handler

There is no separate "method handler" layer. The service binary IS the handler. When the runtime receives `spike.hydrate`, it routes the request to the Spike service binary. The binary processes it and returns the result.

This means apps are **language-agnostic**. The service binary can be:
- A Go binary (Spike's PRLM engine)
- A Python server (ML pipeline)
- A Rust binary (high-performance data processing)
- A Node.js/TypeScript process (if preferred)
- Anything that speaks the agreed request/response protocol

The runtime doesn't care what language the binary is written in. It cares that the binary:
1. Listens on the configured port
2. Accepts operation requests in the agreed format
3. Returns operation responses in the agreed format
4. Reports health when asked

### Apps as Ecosystem Citizens

The power of building on Nex is composability. An app's operations become first-class citizens in the ecosystem:

- **Agents can call them** — An agent can invoke `spike.ask` as a tool, just like it invokes `delivery.send` or `memory.search`.
- **Automations can trigger them** — "When a GitHub push event arrives, dispatch `spike.hydrate` for the affected repo."
- **Other apps can use them** — A future app could call `spike.ask` to get code context as part of its own workflow.
- **The CLI exposes them** — `nex spike hydrate --repo foo/bar` works automatically because the operation is in the taxonomy.

Apps can also use the SDK to set up automations during their lifecycle hooks:

```
// During onActivate:
dispatch("automation.create", {
  trigger: { event: "github.push", filter: { adapter: "github-code" } },
  action: { operation: "spike.hydrate", payload_template: { repo: "{{event.repo}}" } }
});
```

This allows apps to wire themselves into the event flow without hardcoded integrations.

---

## The Two SDKs

### Nex SDK (Client Direction)

The Nex SDK is a typed client library for calling runtime operations. It wraps `dispatch(operation, payload)` with typed methods.

**Used by:** App UIs, app services, the CLI, external tools, agents — anything that calls INTO the runtime.

```typescript
// TypeScript example
import { NexClient } from "@nex/sdk";

const nex = new NexClient({ endpoint: "ws://localhost:4000" });

// Typed method (generated from operation schema)
const health = await nex.health();
const adapters = await nex.adapters.connections.list();
const config = await nex.config.get();

// Generic dispatch (for app-specific or dynamic operations)
const result = await nex.dispatch("spike.hydrate", { repo: "foo/bar" });
```

```go
// Go example
import nex "github.com/nexus/nex-sdk-go"

client := nex.NewClient("ws://localhost:4000")

health, err := client.Health()
adapters, err := client.Adapters.Connections.List()
result, err := client.Dispatch("spike.hydrate", map[string]any{"repo": "foo/bar"})
```

**The SDK structure mirrors the operation taxonomy.** Operations are organized into namespaces (adapters, config, auth, events, etc.) and the SDK reflects this grouping.

### Adapter SDK (Server Direction)

The Adapter SDK is a framework for building adapter binaries. It provides the protocol handling, event normalization, and lifecycle management — the adapter author just implements the capability handlers.

**Used by:** Adapter binary authors — anyone building a new data connector.

```go
// Go adapter example
import adapter "github.com/nexus/nex-adapter-sdk-go"

func main() {
    a := adapter.New("github-code")

    a.Handle("adapter.health", func(ctx adapter.Context) (any, error) {
        // Check GitHub API connectivity
        return map[string]any{"healthy": true}, nil
    })

    a.Handle("event.backfill", func(ctx adapter.Context) (any, error) {
        // Fetch historical events from GitHub
        // Use ctx.Emit() to push events to runtime
        return map[string]any{"processed": 142}, nil
    })

    a.Handle("delivery.send", func(ctx adapter.Context) (any, error) {
        // Post a comment on a GitHub issue/PR
        return map[string]any{"delivered": true}, nil
    })

    a.Run() // Starts stdio JSONL protocol loop
}
```

**The Adapter SDK defines the operations the adapter must implement.** The runtime dispatches these operations to the adapter; the adapter handles them and returns results.

### Both SDKs From One Source

Both SDKs are generated from the operation taxonomy schemas:

```
Operation Taxonomy (OpenAPI / JSON Schema)
    │
    │  Each operation defines:
    │    - name (e.g., "adapter.connections.list")
    │    - input schema (JSON Schema for payload)
    │    - output schema (JSON Schema for response)
    │    - mode, action, resource (for IAM)
    │
    ├── Nex SDK generation
    │   Takes operations where direction = "client → runtime"
    │   Generates typed CALL methods
    │
    └── Adapter SDK generation
        Takes operations where direction = "runtime → adapter"
        Generates typed HANDLER stubs
```

---

## Relationship to Other Specs

This document defines the conceptual architecture. Other specs define the details:

| Spec | What It Defines | Relationship |
|------|-----------------|--------------|
| [NEXUS_REQUEST_TARGET.md](./NEXUS_REQUEST_TARGET.md) | The pipeline, NexusRequest bus, data model, ledger schemas | Core layer internals |
| [ADAPTER_INTERFACE_UNIFICATION.md](./ADAPTER_INTERFACE_UNIFICATION.md) | Adapter protocol, operation catalog, SDK contract | Adapter SDK details + operation catalog |
| [NEX_APP_MANIFEST_AND_LIFECYCLE](../../nexus-frontdoor/docs/specs/NEX_APP_MANIFEST_AND_LIFECYCLE_2026-03-02.md) | App manifest format, lifecycle hooks, service management | App model details |
| [OPERATION_TAXONOMY.md](./OPERATION_TAXONOMY.md) | Complete operation catalog with input/output schemas (Tier 1 done) | Core layer — the definitive API contract |
| [CONTROL_PLANE_AUTHZ_TAXONOMY.md](./ingress/CONTROL_PLANE_AUTHZ_TAXONOMY.md) | IAM resource/action taxonomy for operations | Core layer — access control |
| [CONTROL_PLANE.md](./ingress/CONTROL_PLANE.md) | WebSocket and HTTP surface implementation | Transport layer details |

---

## Design Decisions (Locked)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **One pipeline for everything.** All operations, all callers, all transports flow through the same 5-stage pipeline. | Eliminates special cases. IAM, tracing, and automations work uniformly. |
| 2 | **Operations are the API.** The operation taxonomy is the single source of truth for what Nex can do. Everything else is a projection. | One contract to maintain. CLI, SDK, UI all derive from the same source. |
| 3 | **Surfaces are transport, not API.** All operations are available on all surfaces. IAM controls access, not surface membership. | Prevents artificial capability restrictions. Simplifies reasoning about what's possible. |
| 4 | **Apps are manifest + service binary + optional UI + optional adapters.** The service binary IS the handler. No separate handler layer. | Language-agnostic. Simple mental model. One thing to deploy, one thing to reason about. |
| 5 | **SDKs are generated from schemas.** The operation taxonomy's JSON Schemas are the source of truth. SDKs are generated artifacts in any language. | One source of truth. SDKs are always in sync with the runtime. |
| 6 | **App operations extend the taxonomy.** An app's declared operations are registered in the taxonomy at runtime. They are first-class — agents, automations, CLI, and other apps can call them. | Composability. Apps are ecosystem citizens, not siloed. |
| 7 | **Hard cutover, no backwards compatibility.** The specs define the ideal target state. Migration pragmatics are handled in workplans, not specs. | Clean architecture. No legacy baggage in the target state. |

---

## Alignment Notes

The following existing specs need updates to align with this architecture model:

| Spec | What Needs Updating | Status |
|------|---------------------|--------|
| [NEX_APP_MANIFEST_AND_LIFECYCLE](../../nexus-frontdoor/docs/specs/NEX_APP_MANIFEST_AND_LIFECYCLE_2026-03-02.md) | Decided Questions #1 and #4 updated to reflect service-binary-as-handler model. Open Questions #2 and #3 resolved. Manifest format itself needs revision: remove `handler` field (TS module path), replace with service binary routing config. | Partially updated |
| [ADAPTER_INTERFACE_UNIFICATION.md](./ADAPTER_INTERFACE_UNIFICATION.md) | `RuntimeOperationRequest.transport` field uses old surface terminology (`"ws" \| "http" \| "internal" \| "adapter-cli"`). Should align with transport layer naming. `OperationMode` uses `"sync"` but runtime code uses `"control"` — reconcile. | Not yet updated |
| [CONTROL_PLANE.md](./ingress/CONTROL_PLANE.md) | Describes WebSocket and HTTP surfaces. Should reference this doc for the transport layer model. Surface-specific operation restrictions should be removed (all ops on all surfaces). | Not yet updated |
| [CONTROL_PLANE_AUTHZ_TAXONOMY.md](./ingress/CONTROL_PLANE_AUTHZ_TAXONOMY.md) | `RuntimeOperationSurface` type needs alignment with transport layer model. | Not yet updated |
| GlowBot operations in runtime taxonomy | `glowbot.*` operations (13 total) need to be removed from the core taxonomy and declared in GlowBot's app manifest instead. | Not yet updated |
| [OPERATION_TAXONOMY.md](./OPERATION_TAXONOMY.md) | Tier 1 (55 ops) complete with full input/output schemas. Tiers 2-4 pending. | Partially complete |

---

## Glossary

| Term | Definition |
|------|------------|
| **Operation** | A named capability of the runtime. Has defined input/output schemas, IAM resource/action, and a handler. Examples: `health`, `config.get`, `spike.hydrate`. |
| **Operation Taxonomy** | The complete catalog of all operations the runtime supports. Core operations are built-in; app operations are registered at runtime from manifests. |
| **Pipeline** | The 5-stage processing pipeline every operation flows through. |
| **NexusRequest** | The mutable data bus that carries an operation through the pipeline. |
| **Surface** | A transport protocol (WebSocket, HTTP, stdio) that feeds operation requests into the pipeline. |
| **Caller** | A program or system that dispatches operations via a surface. |
| **SDK** | A typed client library generated from operation schemas. |
| **Nex SDK** | Client-direction SDK for calling runtime operations. |
| **Adapter SDK** | Server-direction SDK for implementing adapter protocol operations. |
| **App** | A standalone package (manifest + service binary + optional UI + optional adapters) that extends the runtime with purpose-built operations. |
| **Service Binary** | An executable that implements an app's operations. Managed by the runtime. Language-agnostic. |
| **Manifest** | `app.nexus.json` — declares an app's operations, UI, services, adapters, and configuration. |
| **Ledger** | A SQLite database managed by the runtime. Operations read/write to ledgers. (events.db, identity.db, memory.db, etc.) |
| **Adapter** | A binary that implements the adapter protocol — ingests external data into the runtime and delivers outbound messages. |
| **Automation** | A hookpoint handler that triggers operations based on pipeline events. |
