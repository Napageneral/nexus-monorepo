# Nex App Manifest & Lifecycle

Date: 2026-03-02 (archived 2026-03-10)
Status: superseded by `../../../../nex/docs/specs/apps/app-manifest-and-package-model.md`
Updated: 2026-03-02 (reconciled with NEX_ARCHITECTURE_AND_SDK_MODEL; two handler modes; eliminated TS proxy layer for service-backed apps)
Owners: Nexus Platform

> Historical note: this document used to carry frontdoor-local app manifest
> canon. The active manifest and package contract now lives in
> `nex/docs/specs/apps/app-manifest-and-package-model.md`. This archived copy is
> retained only as historical reference.

---

## 1) Overview

A nex app is a self-contained full-stack application that runs entirely inside the nex runtime. Apps are the primary unit of functionality in the Nexus ecosystem — every product (GlowBot, Spike, admin dashboards) is a nex app.

A nex app is composed of:

- **Nex UI** — Pre-built static web frontend (Next.js static export, React SPA, etc.) served by the nex runtime
- **Operation Handlers** — The code that processes the app's operations. Two modes (see below).
- **Nex Adapters** — Optional bundled data adapters (Go binaries using the Nex Adapter SDK) that connect to external data sources
- **Assets** — Icons, logos, and other static resources
- **Lifecycle Hooks** — Install, upgrade, activate, deactivate, uninstall scripts

Apps declare their capabilities in an `app.nexus.json` manifest. The nex runtime discovers, loads, and manages apps based on this manifest.

### Two Handler Modes

Apps handle operations in one of two ways:

| Mode | When | How | Example |
|------|------|-----|---------|
| **Service-routed** | App declares `services` section, methods have no `handler` field | Runtime dispatches operations directly to the service binary via HTTP. The service IS the handler. Language-agnostic. | Spike (Go engine) |
| **Inline-TS** | Methods have a `handler` field pointing to a TS module, no service | Runtime loads TypeScript handler via jiti, executes in-process. | GlowBot (TS handlers) |

**Service-routed mode** is the primary model. The service binary receives operation requests from the runtime, processes them, and returns responses. The binary can be Go, Rust, Python, Node.js — anything that speaks HTTP. The runtime manages the binary's lifecycle. See [NEX_ARCHITECTURE_AND_SDK_MODEL.md](../../nexus-specs/specs/nex/NEX_ARCHITECTURE_AND_SDK_MODEL.md).

**Inline-TS mode** is an optimization for lightweight apps that don't need an external process. The runtime hosts the TypeScript handlers directly in its Node.js process. This is functionally equivalent to "the service is the nex runtime itself."

### Conceptual Model

```
Service-Routed App (Spike):              Inline-TS App (GlowBot):

┌─────────────────────────────┐          ┌─────────────────────────────┐
│        spike-app/           │          │       glowbot-app/          │
│                             │          │                             │
│  ┌───────┐  ┌───────────┐  │          │  ┌───────┐  ┌───────────┐  │
│  │Nex UI │  │ Nex       │  │          │  │Nex UI │  │ Nex       │  │
│  │(dist/)│  │ Adapters  │  │          │  │(dist/)│  │ Adapters  │  │
│  └───┬───┘  └─────┬─────┘  │          │  └───┬───┘  └─────┬─────┘  │
│      │            │         │          │      │            │         │
│  ┌───┴────────────┴──────┐  │          │  ┌───┴────────────┴──────┐  │
│  │   Service Binary      │  │          │  │  Inline TS Handlers   │  │
│  │   (Go, Rust, etc.)    │  │          │  │  (loaded via jiti)    │  │
│  │   IS the handler      │  │          │  │  run in nex process   │  │
│  └───────────────────────┘  │          │  └───────────────────────┘  │
│                             │          │                             │
│  ┌───────────────────────┐  │          │  ┌───────────────────────┐  │
│  │   Lifecycle Hooks     │  │          │  │   Lifecycle Hooks     │  │
│  └───────────────────────┘  │          │  └───────────────────────┘  │
└─────────────────────────────┘          └─────────────────────────────┘
```

### Design Principles

1. **Self-describing** — The manifest declares everything the runtime needs to know
2. **Self-contained** — All app code, assets, and binaries are in one package
3. **Namespaced** — App methods are namespaced by app ID; apps never touch core runtime methods
4. **Full access to nex SDK** — Apps can use any platform capability through the SDK
5. **Static UI served by nex** — All UIs are pre-built static files served by the nex runtime; app services provide backend compute, not UI serving
6. **OpenAPI schemas** — Method inputs/outputs are fully schema-defined (JSON Schema)
7. **Hard cutover** — No backwards compatibility with legacy config-based app registration; config-driven `runtime.apps` is killed for product apps
8. **Language-agnostic** — Apps handle operations via service binaries in any language. Inline-TS is an optimization for lightweight apps, not the primary model.

### What is NOT a nex app

- **The Control app** — The nex runtime's built-in management UI. It stays special-cased: no manifest, no billing, no lifecycle hooks, no product registry entry. It is the platform itself, not a product running on the platform.
- **Adapters** — Standalone data connectors are not apps. They exist inside apps (bundled in the manifest) or as platform-level adapters managed by the runtime config.

---

## 2) The Manifest (`app.nexus.json`)

```jsonc
{
  // =========================================================================
  // Identity
  // =========================================================================
  "id": "glowbot",                    // unique app identifier, used in method namespacing
  "version": "1.2.0",                 // semver
  "displayName": "GlowBot",
  "description": "Growth Intelligence for Aesthetic Clinics",
  "icon": "./assets/icon.svg",        // path to SVG icon within the package

  // =========================================================================
  // UI (Nex UI)
  // =========================================================================
  "ui": {
    "root": "./dist",                  // directory containing pre-built static files
    "entryPath": "/app/glowbot/",      // URL path where the app is served
    "spa": true                        // enable SPA fallback (serve index.html for all sub-paths)
  },

  // =========================================================================
  // Handler Mode (exactly one of these two patterns)
  // =========================================================================

  // INLINE-TS MODE (GlowBot pattern): handler field present, no services
  "handler": "./methods/index.ts",     // TS module exporting handler map (inline-TS mode)

  // SERVICE-ROUTED MODE (Spike pattern): services section present, no handler field
  // "services": { ... }               // see Section 2.1 below
  //
  // Rule: if "services" is declared and "handler" is absent, ALL methods
  // route to the app's primary service. If "handler" is present, methods
  // are loaded in-process via jiti. You cannot mix modes in V1.

  // =========================================================================
  // Methods (OpenAPI-style JSON Schema definitions)
  // =========================================================================
  "methods": {
    "glowbot.overview": {
      "action": "read",
      "description": "Get clinic overview dashboard data",
      "params": {
        "type": "object",
        "properties": {
          "period": {
            "type": "string",
            "description": "Time period in YYYY-MM format"
          },
          "clinic_id": {
            "type": "string",
            "description": "Optional clinic filter"
          }
        }
      },
      "response": {
        "type": "object",
        "properties": {
          "hero_stat": { "$ref": "#/definitions/HeroStat" },
          "top_actions": {
            "type": "array",
            "items": { "$ref": "#/definitions/GrowthAction" }
          },
          "driver_models": {
            "type": "array",
            "items": { "$ref": "#/definitions/DriverModel" }
          }
        }
      }
    },
    "glowbot.funnel": {
      "action": "read",
      "description": "Get funnel analysis data",
      "params": {
        "type": "object",
        "properties": {
          "period": { "type": "string" }
        }
      },
      "response": {
        "type": "object",
        "properties": {
          "steps": { "type": "array", "items": { "$ref": "#/definitions/FunnelStep" } },
          "drop_off": { "$ref": "#/definitions/DropOffAnalysis" }
        }
      }
    },
    "glowbot.modeling": {
      "action": "read",
      "description": "Get trend modeling data"
    },
    "glowbot.agents": {
      "action": "read",
      "description": "Get agent status and recommendations"
    },
    "glowbot.agents.recommendations": {
      "action": "read",
      "description": "Get detailed growth recommendations"
    },
    "glowbot.integrations": {
      "action": "read",
      "description": "List adapter connections and their status"
    },
    "glowbot.integrations.connect.oauth.start": {
      "action": "write",
      "description": "Start OAuth flow for an adapter connection"
    },
    "glowbot.integrations.connect.apikey": {
      "action": "write",
      "description": "Connect an adapter via API key"
    },
    "glowbot.integrations.connect.upload": {
      "action": "write",
      "description": "Connect an adapter via CSV data upload"
    },
    "glowbot.integrations.test": {
      "action": "write",
      "description": "Test an adapter connection"
    },
    "glowbot.integrations.disconnect": {
      "action": "write",
      "description": "Disconnect an adapter"
    },
    "glowbot.pipeline.status": {
      "action": "read",
      "description": "Get pipeline execution status"
    },
    "glowbot.pipeline.trigger": {
      "action": "write",
      "description": "Manually trigger a pipeline run"
    }
  },

  // =========================================================================
  // Shared Type Definitions (referenced by method schemas)
  // =========================================================================
  "definitions": {
    "HeroStat": {
      "type": "object",
      "properties": {
        "label": { "type": "string" },
        "value": { "type": "number" },
        "delta": { "type": "number" },
        "trend": { "type": "string", "enum": ["up", "down", "flat"] }
      }
    },
    "GrowthAction": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "title": { "type": "string" },
        "description": { "type": "string" },
        "impact": { "type": "string", "enum": ["high", "medium", "low"] },
        "category": { "type": "string" }
      }
    },
    "DriverModel": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "series": { "type": "array" },
        "correlation": { "type": "number" }
      }
    },
    "FunnelStep": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "value": { "type": "number" },
        "conversion_rate": { "type": "number" },
        "peer_median": { "type": "number" }
      }
    },
    "DropOffAnalysis": {
      "type": "object",
      "properties": {
        "weakest_step": { "type": "string" },
        "gap_vs_peer": { "type": "number" },
        "recommendation": { "type": "string" }
      }
    }
  },

  // =========================================================================
  // Adapters (Nex Adapters — bundled with this app)
  // =========================================================================
  "adapters": [
    {
      "id": "google-ads",
      "command": "gog-ads-adapter",
      "platform": "google-ads",
      "binary": "./bin/gog-ads-adapter"
    },
    {
      "id": "google-business-profile",
      "command": "gog-places-adapter",
      "platform": "google-business-profile",
      "binary": "./bin/gog-places-adapter"
    },
    {
      "id": "meta-ads",
      "command": "meta-ads-adapter",
      "platform": "meta-ads",
      "binary": "./bin/meta-ads-adapter"
    },
    {
      "id": "patient-now-emr",
      "command": "patient-now-emr-adapter",
      "platform": "patient-now-emr",
      "binary": "./bin/patient-now-emr-adapter"
    },
    {
      "id": "zenoti-emr",
      "command": "zenoti-emr-adapter",
      "platform": "zenoti-emr",
      "binary": "./bin/zenoti-emr-adapter"
    },
    {
      "id": "apple-maps",
      "command": "apple-maps-adapter",
      "platform": "apple-maps",
      "binary": "./bin/apple-maps-adapter"
    }
  ],

  // =========================================================================
  // Lifecycle Hooks
  // =========================================================================
  "hooks": {
    "onInstall": "./hooks/install.ts",
    "onUninstall": "./hooks/uninstall.ts",
    "onUpgrade": "./hooks/upgrade.ts",
    "onActivate": "./hooks/activate.ts",
    "onDeactivate": "./hooks/deactivate.ts"
  },

  // =========================================================================
  // Entitlement Keys (what this app's plans gate)
  // =========================================================================
  "entitlements": {
    "clinics.max_count": {
      "type": "number",
      "description": "Maximum number of clinics"
    },
    "adapters.max_count": {
      "type": "number",
      "description": "Maximum adapter connections"
    },
    "pipeline.runs_monthly": {
      "type": "number",
      "description": "Pipeline runs per month"
    },
    "agents.enabled": {
      "type": "boolean",
      "description": "AI agent recommendations enabled"
    },
    "benchmarking.enabled": {
      "type": "boolean",
      "description": "Peer benchmarking access"
    },
    "members.max_count": {
      "type": "number",
      "description": "Maximum team members"
    }
  },

  // =========================================================================
  // Product Registry (synced to frontdoor at publish time)
  // =========================================================================
  "product": {
    "tagline": "Growth Intelligence for Aesthetic Clinics",
    "accentColor": "#d4a853",
    "logoSvg": "./assets/logo.svg",
    "homepageUrl": "https://glowbot.app",
    "onboardingOrigin": "https://glowbot.app",
    "plans": [
      {
        "id": "glowbot-starter",
        "displayName": "Starter",
        "priceMonthly": 0,
        "isDefault": true,
        "sortOrder": 0,
        "features": [
          "1 clinic",
          "2 adapters (CSV only)",
          "Manual pipeline runs",
          "Basic funnel view"
        ],
        "limits": {
          "clinics.max_count": "1",
          "adapters.max_count": "2",
          "pipeline.runs_monthly": "10",
          "agents.enabled": "false",
          "benchmarking.enabled": "false",
          "members.max_count": "1"
        }
      },
      {
        "id": "glowbot-clinic",
        "displayName": "Clinic",
        "priceMonthly": 14900,
        "priceYearly": 149000,
        "sortOrder": 1,
        "features": [
          "1 clinic",
          "All 6 adapters (API + CSV)",
          "Automated pipeline (every 6h)",
          "AI growth recommendations",
          "Peer benchmarking",
          "Up to 5 team members"
        ],
        "limits": {
          "clinics.max_count": "1",
          "adapters.max_count": "6",
          "pipeline.runs_monthly": "120",
          "agents.enabled": "true",
          "benchmarking.enabled": "true",
          "members.max_count": "5"
        }
      },
      {
        "id": "glowbot-multi",
        "displayName": "Multi-Clinic",
        "priceMonthly": 39900,
        "priceYearly": 399000,
        "sortOrder": 2,
        "features": [
          "Up to 10 clinics",
          "All 6 adapters per clinic",
          "Automated pipeline (every 6h)",
          "AI growth recommendations",
          "Cross-clinic benchmarking",
          "Up to 25 team members"
        ],
        "limits": {
          "clinics.max_count": "10",
          "adapters.max_count": "6",
          "pipeline.runs_monthly": "500",
          "agents.enabled": "true",
          "benchmarking.enabled": "true",
          "members.max_count": "25"
        }
      }
    ]
  },

  // =========================================================================
  // Requirements
  // =========================================================================
  "requires": {
    "nex": ">=0.9.0"
  }
}
```

### 2.1 Services Section (Service-Routed Mode)

The `services` section declares the app's backend process. In service-routed mode, the service binary IS the handler — the runtime dispatches operations directly to it. No intermediate TypeScript proxy layer.

```jsonc
// Example: Spike app — Go engine handles ALL operations directly
{
  "id": "spike",
  // NOTE: no "handler" field — this is service-routed mode

  "services": {
    "engine": {
      "command": "./bin/spike-engine",       // binary path relative to app package
      "args": ["serve", "--port", "{{port}}"], // {{port}} is substituted by runtime
      "port": 0,                              // 0 = runtime assigns a free port
      "protocol": "http",                     // communication protocol (http only for V1)
      "healthCheck": "/health"                // HTTP GET endpoint for health monitoring
    }
  },

  "methods": {
    "spike.ask": {
      // NOTE: no "handler" field — routed to the service binary
      "action": "write",
      "description": "Ask a question about code in a repository tree",
      "params": { ... }
    }
  }
}
```

**How service routing works:**

1. Runtime receives `spike.ask` operation
2. Pipeline runs: auth → IAM → validate params
3. Runtime dispatches to Spike's engine service: `POST http://localhost:{port}/operations/spike.ask`
4. Service binary processes the request, returns response
5. Runtime forwards response through pipeline to caller

The service binary receives a standard operation request:
```json
{
  "operation": "spike.ask",
  "payload": { "query": "...", "tree_id": "..." },
  "user": { "userId": "...", "accountId": "..." },
  "requestId": "req_abc123"
}
```

**Service semantics:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `command` | string | yes | Binary path relative to app package directory |
| `args` | string[] | no | Command-line arguments. `{{port}}` substituted with assigned port. `{{dataDir}}` substituted with app data directory. |
| `port` | number | yes | Port the service listens on. `0` = runtime assigns a free port. |
| `protocol` | string | yes | Communication protocol. V1: `"http"` only |
| `healthCheck` | string | no | HTTP GET path for health monitoring. Runtime calls this periodically. |
| `env` | object | no | Additional environment variables. Supports `{{port}}` and `{{dataDir}}` substitution. |

**Service lifecycle:**

- Started on `onActivate` (after lifecycle hook runs)
- Health-checked periodically (configurable interval, default 30s)
- Restarted automatically on crash (up to 3 retries, then marked unhealthy)
- Stopped on `onDeactivate` (before lifecycle hook runs)
- Bound to localhost — only the runtime can reach the service

**Service callback to runtime:**

Service binaries can call back into the runtime to use platform capabilities:

```
Service binary → Nex SDK (HTTP/gRPC/stdio) → Runtime pipeline
                 e.g., check entitlements, emit events, audit log
```

The service uses the Nex SDK (available in Go, TypeScript, Python) to dispatch operations back to the runtime. This replaces the old `ctx.nex.*` pattern — the service binary owns its own SDK client.

### 2.2 Stripe Price IDs and Operator Config

Note: The manifest's `product.plans` section declares **logical plan definitions** (name, price, features, limits) but does **not** include Stripe price IDs. Stripe price IDs are environment-specific (test vs live, different Stripe accounts) and are configured by the operator via the frontdoor admin UI or environment config.

The sync pipeline creates plan records from the manifest. Stripe ID mapping is a separate operator step.

---

## 3) App Package Structure

App packages live at `nexus/apps/` — a dedicated top-level directory alongside `nex/`, `nexus-frontdoor/`, etc. Apps are standalone packages decoupled from the runtime.

### 3.1 GlowBot (Inline-TS App — no services)

```
apps/glowbot-app/
├── app.nexus.json              # manifest (required)
├── methods/                    # method handler code (required)
│   ├── index.ts                # exports handler map
│   ├── overview.ts
│   ├── funnel.ts
│   ├── modeling.ts
│   ├── agents.ts
│   ├── integrations.ts
│   └── pipeline.ts
├── pipeline/                   # app-specific business logic
│   ├── schema.ts               # SQLite schema for app data
│   ├── funnel.ts               # funnel computation
│   ├── trends.ts               # trend analysis
│   ├── dropoffs.ts             # drop-off detection
│   └── runtime-store.ts        # pipeline execution engine
├── hooks/                      # lifecycle hooks
│   ├── install.ts              # first-time setup
│   ├── uninstall.ts            # cleanup
│   ├── upgrade.ts              # version migration
│   ├── activate.ts             # runtime start
│   └── deactivate.ts           # runtime shutdown
├── migrations/                 # SQL migration files
│   ├── 001_initial_schema.sql
│   ├── 002_add_modeling.sql
│   └── ...
├── bin/                        # adapter binaries (platform-specific)
│   ├── gog-ads-adapter
│   ├── gog-places-adapter
│   ├── meta-ads-adapter
│   ├── patient-now-emr-adapter
│   ├── zenoti-emr-adapter
│   └── apple-maps-adapter
├── assets/                     # static assets
│   ├── icon.svg
│   └── logo.svg
└── dist/                       # pre-built static UI files
    ├── index.html
    ├── _next/                  # Next.js static chunks
    │   ├── static/
    │   └── ...
    └── ...
```

### 3.2 Spike (Service-Routed App — Go engine handles all operations)

```
spike-app/
├── app.nexus.json              # manifest (required) — NO handler field
├── hooks/                      # lifecycle hooks (TypeScript, loaded via jiti)
│   ├── install.ts              # verify binaries exist
│   ├── activate.ts             # log activation
│   ├── deactivate.ts           # log deactivation
│   ├── upgrade.ts              # Go engine handles its own migrations
│   └── uninstall.ts            # archive data directory
├── bin/                        # binaries
│   ├── spike-engine            # Go PRLM engine (Nex Service — IS the handler)
│   └── github-code-adapter     # GitHub connector (Nex Adapter)
├── assets/
│   ├── icon.svg
│   └── logo.svg
└── dist/                       # pre-built TypeScript static UI
    ├── index.html
    └── ...
```

Note: No `methods/` directory. The Go engine binary handles all operations directly. The runtime dispatches `spike.*` operations to the engine service via HTTP. Lifecycle hooks remain TypeScript (loaded via jiti) because they run at install/activate time, not per-request.

---

## 4) Runtime Processing

### 4.1 App Discovery

1. Runtime scans the apps directory (`<appsDir>/`) for directories containing `app.nexus.json`
2. Reads and validates each manifest
3. Builds an `AppRegistry` containing all discovered apps
4. Apps can also be installed dynamically via the management API

**Hard cutover**: The legacy `config.runtime.apps` config section is no longer used for product apps. All product apps are discovered via manifest only. The Control app remains special-cased and is not manifest-driven.

### 4.2 Method Registration

For each method declared in the manifest:

1. Auto-generate IAM/authz entry: `apps.<appId>.<capability>` with the declared action (read/write)
   - Example: `"glowbot.overview"` → `{ kind: "control", action: "read", resource: "apps.glowbot.overview" }`
2. Validate method name starts with `<appId>.` (enforced namespacing)
3. Register the method's routing target based on handler mode:
   - **Service-routed**: Method routes to the app's service binary via HTTP (`POST /operations/<method>`)
   - **Inline-TS**: Load handler module from `handler` path via jiti, wire to request router
4. If the manifest includes JSON Schema for params → validate incoming requests against the schema
5. Core runtime methods are reserved — any app method conflicting with core methods is rejected

**Handler mode detection:**
- If manifest has `services` section AND no `handler` field → **service-routed mode**
- If manifest has `handler` field AND no `services` section → **inline-TS mode**
- If both are present → error (not supported in V1)
- If neither is present → error (app has no handler)

**Service-routed execution:** The runtime dispatches the operation to the service binary, which runs as a separate process. The service can be any language. Process-level isolation is inherent.

**Inline-TS execution:** The handler runs in the nex Node.js process. No sandboxing. All first-party apps using this mode are trusted code.

### 4.3 UI Serving

1. Read `ui.root` directory path from manifest
2. Register HTTP route: `ui.entryPath` + `**` → serve static files from `ui.root`
3. If `ui.spa` is true → any path under `ui.entryPath` that doesn't match a file serves `index.html`
4. Next.js `_next/` static assets are rewritten: `/_next/*` → `/app/<appId>/_next/*`
5. Security headers applied (X-Frame-Options, CSP, etc.)

### 4.4 Service Management (Nex Services)

For each service declared in the manifest's `services` section:

1. Resolve binary path relative to the app package directory
2. Assign port (use declared port, remap if conflicting with another app's service)
3. Substitute `{{port}}` in args with the assigned port
4. Spawn service process as a managed child process
5. Wait for health check to pass (timeout: 30s)
6. Register service endpoint in the app's runtime context (`ctx.app.service(name)`)

**Service lifecycle integration:**

```
App install → onInstall hook
App activate → onActivate hook → start services → health check → ready
App deactivate → stop services → onDeactivate hook
App uninstall → stop services → onDeactivate hook → onUninstall hook
```

**Service monitoring:**

- Health check every 30s (GET to `healthCheck` path)
- On failure: 3 restart attempts with exponential backoff
- After 3 failures: mark service as unhealthy, log error, emit event
- Method handlers calling an unhealthy service get a `ServiceUnavailable` error

### 4.5 Adapter Registration

For each adapter declared in the manifest:

1. Resolve binary path relative to the app package directory
2. Register adapter with the runtime's adapter system (equivalent of nex.yaml config)
3. Adapter process management (start/stop/health) handled by the runtime
4. Adapter events flow through the runtime's event system → available to the app via SDK

### 4.6 Lifecycle Hook Execution

| Hook | When | Purpose |
|------|------|---------|
| `onInstall` | App first installed on this server | Create databases, seed data, register initial config |
| `onUpgrade` | App version changes (new package deployed) | Run migrations, transform data |
| `onActivate` | Every runtime start (if app is installed) | Start background jobs, reconnect adapters, resume pipelines |
| `onDeactivate` | Runtime shutdown | Stop background jobs, flush state, clean shutdown |
| `onUninstall` | App removed from this server | Archive/cleanup data, stop adapter processes |

Hook execution context provides the same `NexAppContext` as method handlers, so hooks can use the full nex SDK.

---

## 5) The Nex App SDK

Apps interact with the platform through a typed SDK interface.

### 5.1 Method Handler Signature

```typescript
import type { NexAppMethodHandler, NexAppMethodContext } from "@nexus/app-sdk";

export const handleOverview: NexAppMethodHandler = async (ctx: NexAppMethodContext) => {
  // Access request parameters (validated against OpenAPI schema)
  const { period, clinic_id } = ctx.params;

  // Access app's data directory (persistent across restarts)
  const db = openDatabase(path.join(ctx.app.dataDir, "glowbot.db"));

  // Access nex platform capabilities
  const adapters = await ctx.nex.adapters.list();

  // Check entitlements
  const maxAdapters = ctx.nex.entitlements.check("adapters.max_count");

  // Return response (validated against OpenAPI schema)
  return {
    hero_stat: computeHeroStat(db, period),
    top_actions: computeTopActions(db, period),
    driver_models: computeDriverModels(db, period),
  };
};
```

### 5.2 Service-Routed Handler (Spike pattern — Go binary)

In service-routed mode, there are NO TypeScript handlers. The Go binary handles operations directly:

```go
// Inside spike-engine Go binary
func handleAsk(w http.ResponseWriter, r *http.Request) {
    var req OperationRequest
    json.NewDecoder(r.Body).Decode(&req)

    // Check entitlements via Nex SDK callback
    limit, _ := nexClient.Dispatch("entitlements.check", map[string]any{
        "key": "asks_per_day",
    })

    // Execute core logic
    result := prlm.Ask(req.Payload.Query, req.Payload.TreeID)

    // Audit log via Nex SDK callback
    nexClient.Dispatch("audit.log", map[string]any{
        "action": "spike.ask",
        "tree_id": req.Payload.TreeID,
    })

    json.NewEncoder(w).Encode(result)
}
```

The service binary owns entitlement checking, audit logging, and all business logic. It calls back to the runtime via the Nex SDK for platform capabilities.

### 5.3 SDK Interface

```typescript
interface NexAppMethodContext {
  // === Request ===
  params: Record<string, unknown>;         // validated against method's params schema

  // === Caller Identity ===
  user: {
    userId: string;
    email: string;
    displayName: string;
    role: string;                           // role within the account
    accountId: string;
  };

  account: {
    accountId: string;
    displayName: string;
  };

  // === App Context ===
  app: {
    id: string;                             // e.g., "glowbot"
    version: string;                        // e.g., "1.2.0"
    dataDir: string;                        // persistent data directory for this app
    packageDir: string;                     // the app package directory (read-only)
    config: Record<string, unknown>;        // app-specific runtime configuration

    // Service access (Nex Services)
    service(name: string): NexServiceClient;
  };

  // === Nex Platform SDK ===
  nex: {
    // Adapter operations
    adapters: {
      list(): Promise<AdapterConnection[]>;
      connect(params: AdapterConnectParams): Promise<AdapterConnection>;
      disconnect(connectionId: string): Promise<void>;
      test(connectionId: string): Promise<AdapterTestResult>;
      backfill(connectionId: string, params: BackfillParams): Promise<BackfillResult>;
      getHealth(connectionId: string): Promise<AdapterHealthStatus>;
      onEvent(handler: (event: AdapterEvent) => void): Unsubscribe;
    };

    // Identity and authentication
    identity: {
      getCurrentUser(): UserInfo;
      getAccountMembers(): Promise<AccountMember[]>;
    };

    // Entitlement checking
    entitlements: {
      check(key: string): string | undefined;
      checkBoolean(key: string): boolean;
      checkNumber(key: string): number;
      enforce(key: string, currentUsage: number): void;  // throws EntitlementExceeded
      getAll(): Record<string, string>;
    };

    // Event system
    events: {
      emit(event: string, data: Record<string, unknown>): void;
      query(filter: EventFilter): Promise<EventRecord[]>;
    };

    // Audit logging
    audit: {
      log(action: string, details: Record<string, unknown>): void;
    };

    // Runtime operations
    runtime: {
      callMethod(method: string, params: unknown): Promise<unknown>;
      getConfig(): RuntimeConfig;
      getHealth(): Promise<RuntimeHealthStatus>;
    };
  };
}

// Service client for calling Nex Services from method handlers
interface NexServiceClient {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
  put(path: string, body: unknown): Promise<unknown>;
  delete(path: string): Promise<unknown>;

  // Health status
  isHealthy(): boolean;
}
```

### 5.4 Lifecycle Hook Signature

```typescript
import type { NexAppHookContext } from "@nexus/app-sdk";

// onInstall hook
export default async function onInstall(ctx: NexAppHookContext): Promise<void> {
  // Create app database schema
  const db = openDatabase(path.join(ctx.app.dataDir, "glowbot.db"));
  db.exec(GLOWBOT_SCHEMA_SQL);

  // Seed initial data
  seedPipelineDefaults(db);
  seedFunnelDefinition(db);

  console.log(`GlowBot v${ctx.app.version} installed successfully`);
}

// onActivate hook (runs on every start)
export default async function onActivate(ctx: NexAppHookContext): Promise<void> {
  // Resume pipeline scheduler
  startPipelineScheduler(ctx);

  // Reconnect adapter monitors
  const adapters = await ctx.nex.adapters.list();
  for (const adapter of adapters) {
    if (adapter.status === "connected") {
      await ctx.nex.adapters.monitor(adapter.id);
    }
  }
}
```

---

## 6) Frontdoor Integration

### 6.1 Product Registry Sync

When an app is published to frontdoor (at publish time):
1. Frontdoor reads the `product` section of `app.nexus.json`
2. Upserts the product in `frontdoor_products` table
3. Upserts plans in `frontdoor_product_plans` table (logical definitions — name, price, features, limits)
4. Operator maps plans to Stripe price IDs via admin UI or environment config (separate step)
5. Product branding (accent color, logo, tagline) becomes available to the billing UI

This replaces the hardcoded `seedProducts()` approach — products are defined by their apps.

### 6.2 App Installation Flow

1. User triggers install via frontdoor UI (Flow F11)
2. Frontdoor validates:
   - Account has an active app subscription
   - Server belongs to the account
   - App is not already installed on the server
3. Frontdoor tells the runtime: `POST /api/apps/install` with `{ appId, packageRef }`
4. Runtime:
   a. Downloads/locates the app package
   b. Validates the manifest
   c. Extracts to `<appsDir>/<appId>/`
   d. Runs `onInstall` hook
   e. Registers methods, adapters, services, UI routes
   f. Reports success/failure to frontdoor
5. Frontdoor updates `frontdoor_server_app_installs` status

No more hardcoded `resolveManagedRuntimeAppConfig()` switch statements.

### 6.3 App Uninstall Flow

1. User triggers uninstall via frontdoor UI (Flow F12)
2. Frontdoor tells runtime: `POST /api/apps/uninstall` with `{ appId }`
3. Runtime:
   a. Stops services
   b. Runs `onDeactivate` hook (stop background jobs)
   c. Runs `onUninstall` hook (cleanup)
   d. Stops adapter processes
   e. Unregisters methods and UI routes
   f. Preserves data directory (soft delete) or removes it (based on request)
4. Frontdoor updates install status

### 6.4 Version Upgrade Flow

1. Operator publishes new app version to frontdoor
2. Frontdoor identifies servers running older version
3. Rolling upgrade (one server at a time):
   a. Tell runtime: `POST /api/apps/upgrade` with `{ appId, packageRef, targetVersion }`
   b. Runtime:
      - Stops services
      - Runs `onDeactivate` on current version
      - Extracts new package
      - Runs `onUpgrade` hook (migrations)
      - Starts services (new version)
      - Runs `onActivate` on new version
      - Verifies health (including service health checks)
   c. If success → mark upgraded
   d. If failure → rollback to previous version, alert operator, stop rollout
4. Operator monitors rollout progress in frontdoor admin

---

## 7) IAM / Authorization

Method authorization is auto-generated from the manifest. Every method gets an IAM entry:

```
Method: "glowbot.overview"
  → Resource: "apps.glowbot.overview"
  → Action: "read"
  → Kind: "control"

Method: "glowbot.pipeline.trigger"
  → Resource: "apps.glowbot.pipeline.trigger"
  → Action: "write"
  → Kind: "control"
```

Role-based access:
- **Owner/Admin** → all read + write methods
- **Member** → all read methods, selective write methods
- **Viewer** → read methods only

Fine-grained per-method permissions can be configured in the runtime's IAM config if needed.

---

## 8) Decided Questions

These questions were raised during design and have been resolved:

1. **Handler execution model**: **UPDATED** — The service binary IS the handler. There is no separate in-process handler layer. App operations are routed to the app's service binary (which can be any language). The service receives operation requests from the runtime over the internal transport (HTTP, gRPC, or stdio) and returns responses. The service can call back into the runtime via the Nex SDK to use platform capabilities. See [NEX_ARCHITECTURE_AND_SDK_MODEL.md](../../nexus-specs/specs/nex/NEX_ARCHITECTURE_AND_SDK_MODEL.md) for the full architecture.

2. **Control app**: Stays special. Not manifest-driven. No billing, no lifecycle hooks, no product registry. It is the platform's built-in management UI.

3. **Config-driven vs manifest-driven**: Hard cutover. `config.runtime.apps` is killed for product apps. All product apps discovered via `app.nexus.json` manifests only. No backwards compatibility, no transition state.

4. **Apps are language-agnostic**: **UPDATED** — The service binary can be Go, Rust, Python, Node.js, or anything that speaks the agreed request/response protocol. There is no requirement for TypeScript handler proxies. The runtime manages the service binary's lifecycle (spawn, health-check, restart, stop) and routes operations to it. This replaces the previous "TypeScript handlers proxy to services" model.

5. **Stripe price IDs**: Not in the manifest. Plans declare logical pricing (name, amount, features, limits). Stripe mapping is operator config, configured via admin UI or environment variables.

---
