# Frontdoor Hosted Access And Routing

**Status:** CANONICAL
**Last Updated:** 2026-03-10
**Related:**
- `FRONTDOOR_ARCHITECTURE.md`
- `FRONTDOOR_OBJECT_TAXONOMY.md`
- `CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md`
- `../../nex/docs/specs/platform/platform-model.md`
- `../../nex/docs/specs/platform/runtime-access-and-routing.md`
- `../../nex/docs/specs/platform/managed-connection-gateway.md`
- `../../nex/docs/specs/adapters/adapter-connections.md`

---

## Purpose

This document defines the frontdoor-specific hosted access model.

It is the frontdoor platform API projection of the shared hosted platform contract. It covers what frontdoor owns for:

- human launch and shell routing
- tenant-origin proxying
- token minting
- DNS and domain classes
- routing-table state
- callback and webhook ingress

---

## Frontdoor Responsibility Boundary

Frontdoor owns:

1. browser session authentication
2. frontdoor API tokens
3. runtime access token minting
4. runtime trusted-token distribution and operator routing
5. shell rendering at `frontdoor.nexushub.sh`
6. tenant runtime request routing
7. private managed-connection gateway routing for shared adapters
8. global webhook dispatch when a provider cannot target a tenant directly

Frontdoor does not redefine runtime method semantics or app manifest semantics. Those belong to shared runtime specs.

---

## Domain Classes

### Platform shell domain

`frontdoor.nexushub.sh`

Used for:

- auth
- billing
- provisioning
- dashboard
- shell-profile app launches

### Tenant runtime domain

`t-<tenantId>.nexushub.sh`

Used for:

- direct runtime origin
- callbacks
- webhooks
- machine-facing traffic
- custom-domain backing origin

### Product marketing domains

Examples:

- `spike.fyi`
- `glowbot.app`

Used for:

- marketing
- onboarding entry

They redirect into frontdoor with app context. They are not runtime origins.

### Custom domains

Custom domains alias tenant origins, not the frontdoor shell itself.

---

## Canonical Routing Profiles

### Platform shell profile

Default human launch path:

`https://frontdoor.nexushub.sh/app/<appId>/`

Optional explicit server deep link:

`https://frontdoor.nexushub.sh/app/<appId>/?server_id=<serverId>`

Behavior:

- frontdoor authenticates the user via session cookie
- frontdoor resolves the server and tenant target
- frontdoor owns the top-level shell document and shell navigation
- app content renders inside a frontdoor-owned embedded boundary in the shell profile
- frontdoor proxies app UI and runtime traffic to the tenant runtime

### Tenant origin profile

Direct runtime origin:

`https://t-<tenantId>.nexushub.sh`

Behavior:

- used for direct runtime transport
- used for callbacks and webhooks
- used for machine-facing callers
- used for future custom-domain routing

---

## Path Contract

Frontdoor preserves the shared hosted path contract:

- public app entry path: `/app/<appId>/`
- app-internal browser routes: `/app/<appId>/...`
- app-owned HTTP namespace: `/api/<appId>/...`
- runtime HTTP: `/runtime/...`
- runtime WebSocket: `/runtime/ws`
- adapter auth/setup callbacks: `/auth/<service>/...`
- adapter-owned reusable webhooks: `/adapters/<service>/webhooks/...`
- app-owned callbacks: `/app/<appId>/callbacks/...`
- app-owned webhooks: `/app/<appId>/webhooks/...`

Frontdoor may serve either the shell profile or the tenant-origin profile, but the path contract stays the same.

Rules:

- each app exposes exactly one public browser entry path
- internal app pages live beneath that root
- app-owned HTTP namespace is derived from `appId`, not separately authored in the manifest
- shell-internal embed routes are implementation detail, not public contract

---

## Authentication Layers

### Frontdoor session cookie

Used for browser access to frontdoor-owned surfaces.

### Frontdoor API token

Used for headless frontdoor-managed APIs and MCP-style hosted runtime API access.

### Runtime access token

Minted by frontdoor for a specific runtime target.

Used by browsers and clients for:

- runtime HTTP
- runtime WebSocket
- direct tenant-origin access

### Runtime trusted token

Used only by frontdoor when calling runtime operator endpoints.

---

## Frontdoor Routing State

Frontdoor maintains routing records keyed by `tenant_id`.

Canonical routing record:

```ts
interface HostedRoute {
  tenantId: string;
  serverId: string;
  privateIp: string;
  runtimePort: number;
  status:
    | "provisioning"
    | "running"
    | "degraded"
    | "recovering"
    | "suspended"
    | "archived"
    | "destroy_pending"
    | "destroyed";
}
```

This state may be cached in memory for request routing, but the source of truth is persistent frontdoor server metadata.

If the runtime has a narrower internal workspace boundary, that is not part of the frontdoor routing record.

---

## Proxy Behavior

### Shell-profile requests

Frontdoor:

1. authenticates the browser session
2. resolves target server and tenant
3. injects shell UI
4. proxies app and runtime traffic to the tenant runtime

### Tenant-origin requests

Frontdoor:

1. resolves the tenant from the host
2. forwards the request to the target runtime
3. preserves auth headers or runtime access tokens
4. does not require the frontdoor shell

## Shell Document And Embedded Boundary

In the shell profile, frontdoor owns the top-level browser document.

Canonical rules:

1. frontdoor chrome lives outside the app document
2. app content renders inside a dedicated embedded boundary
3. the canonical embedded boundary is iframe-backed
4. HTML injection is not the target-state shell model

The detailed shell model lives in:

- `FRONTDOOR_SHELL_AND_EMBEDDED_APP_MODEL.md`

## Runtime Transport Contract

Frontdoor projects the shared hosted runtime transport contract into the shell
profile.

Rules:

1. shell-profile browser clients use same-origin `/runtime/...` and `/runtime/ws`
2. tenant-origin browser or machine clients use tenant-origin `/runtime/...` and `/runtime/ws`
3. frontdoor may rewrite or proxy internally, but that is not part of the public browser contract
4. frontdoor must not emit private IPs, private runtime origins, or backend-root websocket URLs to browser clients
5. browser-visible runtime endpoint metadata, if emitted, must contain only public profile-correct URLs
6. `connection_mode` is not part of the canonical browser transport contract

### Runtime auth projection

For shell-profile runtime/app proxying, Frontdoor must mint a session-bound
runtime access token for the selected server.

Rules:

1. shell-profile proxy traffic must preserve the human principal bound to the
   current frontdoor session
2. configured `runtimeAuthToken` is not the browser/app proxy credential
3. configured `runtimeAuthToken` remains valid for server-authenticated flows
   such as runtime-initiated product-control-plane calls and direct
   frontdoor-managed server operations
4. browser/app proxy requests must not silently collapse to a server-scoped
   token that drops entity/user attribution

### Trust chain

1. browser authenticates to frontdoor
2. frontdoor mints runtime access token when needed
3. frontdoor proxies to runtime
4. runtime authorizes runtime access

Frontdoor does not create a separate app-server trust layer. App services live behind the runtime boundary.

### Managed connection profile resolution

When the runtime asks frontdoor for managed adapter credential metadata or token exchange, frontdoor resolves the request using:

- `tenant_id`
- `entity_id`
- `app_id`
- `adapter_id`
- `connection_profile_id`
- `auth_method_id`

Service-only lookup is not the canonical contract.

---

## Callback And Webhook Ingress

### Frontdoor-owned auth callbacks

Frontdoor owns:

- `/api/auth/...`

### Runtime-owned reusable adapter ingress

Frontdoor routes:

- `/auth/<service>/...`
- `/adapters/<service>/webhooks/...`

to the target tenant runtime.

### App-owned product callbacks

Frontdoor routes:

- `/app/<appId>/callbacks/...`
- `/app/<appId>/webhooks/...`

to the target tenant runtime or app-owned surface according to the shared hosted contract.

### Global webhook dispatcher

If a provider supports only one webhook URL for the whole platform, frontdoor owns a dispatcher endpoint and resolves the target tenant/app using stable external identifiers. Browser sessions are never part of this routing contract.

---

## Non-Negotiable Frontdoor Rules

1. Human launches default to the frontdoor shell profile.
2. Tenant origins remain first-class for direct runtime traffic.
3. Runtime access uses runtime access tokens, not only frontdoor sessions.
4. Product domains remain onboarding surfaces, not runtime origins.
5. Frontdoor does not reintroduce proxy-mode app hosting as target-state architecture.
