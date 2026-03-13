# Hosted Product Control Planes

**Status:** CANONICAL
**Last Updated:** 2026-03-06

---

## Purpose

This document defines the target-state role of product-specific control planes
inside the hosted Nexus platform.

It exists to keep three boundaries clean:

1. what belongs to frontdoor as the platform control plane
2. what belongs to a product-specific control plane such as Spike or GlowBot
3. how app-branded managed provider connections work without turning frontdoor
   into the long-lived secret owner for every product

This document defines a hosted ownership and relay pattern.

It does **not** introduce a fifth top-level API contract beyond:

1. Frontdoor API
2. Nex API
3. App API
4. Adapter API

---

## Customer Experience

The customer experience should feel simple:

1. the user signs into frontdoor and launches an app through the frontdoor shell
2. the app shows curated connection choices such as:
   - `Connect with Spike GitHub App`
   - `Use my own GitHub App`
   - `Connect with GlowBot Google`
3. the generic Nex console still exposes raw shared-adapter connection options
4. app-branded managed provider connections work without the tenant runtime
   storing long-lived app private keys or provider client secrets
5. operators manage product-wide settings through a separate product admin
   surface without frontdoor owning every product secret

The customer should not need to understand the control-plane split.

The platform still must.

---

## Design Rules

1. Frontdoor is the platform control plane.
2. Each product may have its own product control plane.
3. A product control plane owns app-specific shared backend behavior and
   app-specific managed provider credentials.
4. The admin app is operator UI. It is not the canonical secret owner.
5. The product control plane service is the canonical owner of product-managed
   provider secrets and token-minting logic.
6. Shared adapters remain generic even when an app offers product-managed
   connection profiles.
7. Tenant runtimes always use a private frontdoor gateway for managed
   connection operations.
8. Frontdoor may fulfill a managed connection request itself when the profile is
   platform-managed.
9. Frontdoor must relay a managed connection request to the product control
   plane when the selected profile is product-managed.
10. Frontdoor may also fulfill a product control plane operation itself when
    the requested data is platform-owned hosted metadata rather than
    product-owned secret-backed state.
11. App manifests must stay simple: when an app connection profile includes
    `managedProfileId`, that id is resolved against the declaring app's product
    control plane.
12. App manifests do not point directly at frontdoor-managed profiles.
13. Long-lived app-specific provider secrets must not live in tenant runtimes
    or app manifests.

---

## API Contract Separation

`productControlPlane` is a hosted relay and ownership concept.

It is **not** a fifth public API category.

The canonical split remains:

1. Frontdoor API for hosted platform and relay behavior
2. Nex API for canonical runtime methods
3. App API for product-specific methods and product-owned routes
4. Adapter API for reusable provider/protocol bridges

Product control plane explains:

1. who owns long-lived product-managed secrets
2. which private hosted relay path frontdoor uses
3. where product-owned shared backend behavior runs

It does not redefine the public API taxonomy.

---

## Canonical Objects

### Platform control plane

Frontdoor.

It owns:

- accounts
- servers
- routing
- billing
- package registry
- install and upgrade orchestration
- runtime access token minting
- the private managed-connection gateway used by tenant runtimes
- platform-owned managed connection profiles when the platform itself is the
  right secret owner

It does not own every product's provider secret inventory.

It may directly answer app-scoped hosted metadata reads when the requested data
belongs to the platform control plane.

### Product control plane

A product-specific shared backend that serves all installations of one product.

Examples:

- Spike product control plane
- GlowBot product control plane

It owns:

- product-wide operator and support APIs
- product-wide configuration
- product-managed provider credential profiles
- product-specific secret-backed provider operations
- short-lived token minting or signing for shared adapters when required by the
  product-managed connection contract

It is not a second platform control plane.

### Admin app

The operator-facing UI for a product control plane.

It owns:

- dashboards
- support tools
- product configuration forms
- operator workflows

It does not own long-lived provider secrets directly.

### Product hub service

A product-specific shared service package.

When a product uses a `hub` package, that package may be the product control
plane service if it also owns product-managed provider credentials and
secret-backed provider operations.

### Platform-managed connection profile

A managed connection profile owned directly by frontdoor.

Use this only when the platform itself is the right long-lived secret owner.

### Product-managed connection profile

A managed connection profile owned by a product control plane.

Examples:

- Spike GitHub App registration
- GlowBot Google OAuth client

This is the canonical owner model for app-branded managed connection profiles.

---

## Ownership Split

| Layer | Owns |
|---|---|
| Frontdoor | platform accounts, servers, routing, registry, billing, lifecycle orchestration, runtime token minting, private managed-connection gateway, platform-managed profiles |
| Hosted runtime | package activation, shared adapter execution, connection persistence, reusable callbacks/webhooks, jobs, local data |
| Shared adapter | provider protocol behavior, reusable auth methods, reusable callbacks/webhooks, connection execution logic |
| Product control plane | product-wide shared APIs, product-managed profiles, product-owned provider secrets, token minting/signing for product-managed flows |
| Product admin app | operator UX for the product control plane |
| Installed app | customer-facing UX, app-owned connection profiles, app-owned bindings to shared `connection_id` values |

---

## Managed Connection Routing Model

The runtime always talks to frontdoor for managed connection operations.

Frontdoor acts as the private managed-connection gateway.

### Platform-managed path

If the selected managed profile is platform-managed:

1. runtime authenticates to frontdoor with the server's private runtime auth
   token
2. frontdoor resolves the managed profile itself
3. frontdoor performs the required metadata lookup, token exchange, or other
   platform-owned secret-backed action

### Product-managed path

If the selected managed profile is product-managed:

1. runtime authenticates to frontdoor with the server's private runtime auth
   token
2. frontdoor first checks for an exact platform-managed profile match for the
   full app/profile/auth tuple
3. if no exact platform-managed match exists, frontdoor resolves the owning
   product control plane from the declaring `app_id`
4. frontdoor forwards the private request to the product control plane over a
   private HTTP contract
5. the product control plane performs the required secret-backed action
6. frontdoor returns the response to the runtime

This keeps one runtime-facing gateway while keeping app-specific secret
ownership out of frontdoor.

The owner-resolution algorithm is:

1. exact platform-managed tuple match in frontdoor
2. otherwise app-id-based product control plane routing
3. otherwise reject as unresolved

### Platform-owned product control plane operations

Some app operations need frontdoor-owned hosted metadata rather than a
product-managed secret-backed service.

Canonical example:

- `aix.hostedContext.get`

This operation returns hosted routing metadata needed to build an AIX setup
bundle for machine upload.

Rules:

1. the runtime still calls the private frontdoor product control plane gateway
2. frontdoor authenticates the runtime with the server's private runtime auth
   token
3. frontdoor resolves the selected server and tenant from that trusted context
4. frontdoor returns the hosted metadata directly
5. no external product control plane route is required for this class of
   operation

This path is allowed only when the requested data is platform-owned hosted
metadata. It must not be used to smuggle long-lived product-managed secrets
back into frontdoor.

---

## App Manifest Rule

The app manifest stays simple.

If an app connection profile contains:

```json
{
  "id": "spike-managed-github-app",
  "authMethodId": "github_app_managed",
  "scope": "app",
  "managedProfileId": "spike-github-app"
}
```

then the canonical meaning is:

1. this is an app-branded managed connection choice
2. the shared adapter remains generic
3. the selected `managedProfileId` belongs to the declaring app's product
   control plane
4. the runtime asks frontdoor's private managed-connection gateway for the
   operation
5. frontdoor routes that request to the product control plane

The manifest does not need an extra field to say whether the owner is
frontdoor or the product control plane.

App-managed profiles are product-control-plane-managed by definition.

Platform-managed profiles belong to frontdoor and are not declared as
app-branded `managedProfileId` values in app manifests.

The same rule applies to platform-owned hosted metadata reads such as
`aix.hostedContext.get`: the app asks frontdoor through the private gateway,
and frontdoor fulfills the request directly because the data is platform-owned.

---

## Product Control Plane Responsibilities For Managed Provider Flows

When an app offers a product-managed provider connection, the product control
plane owns:

- long-lived provider client secrets
- private keys
- provider app registrations
- provider-specific install or authorization metadata
- short-lived token minting or signing for shared adapters when needed

The shared adapter still owns:

- the reusable provider auth method
- the connection execution state machine
- callback completion behavior
- webhook verification and parsing
- connection testing and account discovery

The product control plane supplies secret-backed inputs and secret-backed remote
operations. It does not become a wrapper adapter package.

---

## Examples

### Spike GitHub App

Canonical flow:

1. Spike declares `spike-managed-github-app`
2. user chooses `Connect with Spike GitHub App`
3. runtime starts the shared `github` adapter flow
4. runtime calls frontdoor's private managed-connection gateway
5. frontdoor forwards the request to the Spike product control plane
6. Spike product control plane provides GitHub App install metadata and later
   mints short-lived installation tokens as needed
7. shared `github` adapter completes the connection and stores a shared
   `connection_id`
8. Spike binds repos and sync behavior to that `connection_id`

### GlowBot Google OAuth

Canonical flow:

1. GlowBot declares `glowbot-managed-google`
2. user chooses `Connect with GlowBot Google`
3. runtime starts the shared `google` adapter flow
4. runtime calls frontdoor's private managed-connection gateway
5. frontdoor forwards the request to the GlowBot product control plane
6. GlowBot product control plane provides OAuth metadata and performs
   secret-backed token exchange if the profile is product-managed
7. shared `google` adapter stores a shared `connection_id`
8. GlowBot binds reporting or pipeline behavior to that `connection_id`

---

## Non-Negotiable Rules

1. Frontdoor is the platform control plane, not the universal product-secret
   store.
2. Product-managed connection profiles are owned by product control planes.
3. Admin apps are operator surfaces, not the canonical secret owner.
4. The runtime-facing managed-connection gateway stays frontdoor-anchored.
5. Shared adapters stay generic.
6. App manifests remain declarative and simple.
7. Tenant runtimes never persist long-lived app-specific provider secrets as
   reusable local configuration.
