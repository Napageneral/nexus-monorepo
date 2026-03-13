# Hosted Product Control Plane Shell

**Status:** CANONICAL
**Last Updated:** 2026-03-08

---

## Purpose

This document defines the reusable target-state shell for product control plane
services and their operator-facing admin apps.

It exists to prevent each product from reinventing the same hosted
service/admin shell badly.

The reusable shell must keep four boundaries clean:

1. frontdoor remains the platform control plane
2. each product gets its own product control plane service
3. each product gets its own admin app on top of that service
4. product-specific logic plugs into a shared service/admin shell rather than
   leaking into frontdoor, tenant runtimes, or one-off operator scripts

This document is a reusable pattern for products such as:

- Spike
- GlowBot
- future hosted products

It does not redefine product-specific business logic.

---

## Customer And Operator Experience

The intended experience is:

1. the customer signs into frontdoor and launches a product app
2. the product app exposes product-specific connection options and product UX
3. when the app needs app-managed provider behavior, the runtime still talks to
   frontdoor
4. frontdoor forwards that private request to the owning product control plane
5. product operators use a separate admin app for diagnostics, configuration,
   managed provider setup, support, and rollout controls

The customer should experience one coherent product.

The operator should experience a consistent product admin shell across products.

---

## Design Rules

1. A product control plane service is the canonical owner of product-managed
   provider secrets.
2. An admin app is operator UX on top of the product control plane service. It
   is not the canonical secret owner.
3. Frontdoor remains the only runtime-facing gateway for managed connection
   operations.
4. A product control plane must expose a private HTTP contract that frontdoor
   can call.
5. Product-specific modules plug into the shell. They do not replace the shell.
6. The shell must support both provider-management concerns and non-provider
   product control concerns.
7. The shell must not become a second frontdoor or a second tenant runtime.
8. Long-lived product secrets must not live in tenant runtimes, app manifests,
   or admin app browser code.
9. Shared adapters remain generic. Product control planes provide secret-backed
   inputs and secret-backed remote operations, not wrapper adapters.
10. Every product control plane should feel structurally familiar even when the
    product modules differ.

---

## API Contract Boundary

This shell is not a fifth API contract.

It is the hosted deployment pattern for product-owned behavior that sits behind:

1. Frontdoor API relays
2. App API methods and product-specific routes

It must not blur the distinction between:

1. Frontdoor API
2. Nex API
3. App API
4. Adapter API

---

## Reusable Shell Model

Each product gets two reusable shell roles:

### 1. Product control plane service shell

A private/shared backend service that owns:

- managed provider profile storage
- secret references and secret-backed operations
- frontdoor relay handlers
- product-wide diagnostics
- product-wide flags/config
- operator-safe audit trails
- extension points for product-specific modules

### 2. Product admin app shell

An operator-facing app that owns:

- operator login/session UX
- navigation and layout
- diagnostics views
- managed profile management views
- rollout/configuration views
- support workflows
- extension points for product-specific operator pages

The admin shell talks to the product control plane service shell.

---

## Responsibility Split

| Layer | Owns |
|---|---|
| Frontdoor | platform accounts, servers, billing, routing, package registry, runtime token minting, managed-connection gateway |
| Product control plane service shell | private frontdoor relay ingress, managed profile registry, secret-backed operations, product config, diagnostics, audit trail |
| Product-specific service modules | product-owned provider behaviors, product-specific operator APIs, product-specific aggregate/shared data |
| Product admin app shell | operator UI shell, auth/session UX, generic admin views, product-specific operator modules |
| Product app | customer-facing UX and product behavior inside tenant runtimes |

---

## Mandatory Service Shell Capabilities

Every product control plane service shell must provide these capabilities.

### Private frontdoor ingress

Required private HTTP surfaces:

- `GET /api/internal/frontdoor/managed-connections/profile`
- `POST /api/internal/frontdoor/managed-connections/profile/exchange`

These endpoints:

- authenticate frontdoor
- accept authoritative server/tenant/app/profile context
- perform secret-backed product-managed operations
- return the runtime-facing contract expected by shared adapters

### Managed profile registry

The service shell must provide a durable registry for product-managed profiles.

Examples:

- Spike GitHub App registration
- GlowBot Google OAuth client

Canonical stored identity:

- `managed_profile_id`
- `app_id`
- `adapter_id`
- `connection_profile_id`
- `auth_method_id`

### Secret reference resolution

The service shell must resolve secret references server-side.

Examples:

- env-backed secret refs
- KMS-backed refs
- vault-backed refs

The shell resolves secrets.
It does not return long-lived secrets to frontdoor, the runtime, or the admin
browser.

### Diagnostics and audit trail

The service shell must emit and persist enough information to answer:

- did frontdoor reach us
- which app/profile was requested
- which managed profile was selected
- which operation succeeded or failed
- what failed and when

### Product config and flags

The service shell must provide a stable home for:

- product rollout flags
- product-wide thresholds
- product-wide support/configuration values

Not every product will use every feature, but every product should have one
canonical place for them.

---

## Mandatory Admin App Shell Capabilities

Every product admin app shell must provide these capabilities.

### Operator identity and session

The admin app shell must support operator authentication and session state for
the product control plane.

The exact identity provider may vary.
The shell role does not.

### Shared operator navigation

The admin app shell should expose consistent sections such as:

- overview
- managed profiles
- diagnostics
- product flags/config
- audit/support

Products can add custom sections, but the base shape should remain familiar.

### Managed profile views

The admin app shell must provide operator UX for:

- listing managed profiles
- inspecting status/health
- creating or rotating product-managed provider configuration
- disabling or archiving profiles

### Diagnostics views

The admin app shell must provide operator UX for:

- health status
- recent relay activity
- recent failures
- integration freshness or support summaries when applicable

### Product extension slots

The admin shell must allow product-specific operator modules such as:

- GlowBot benchmark network controls
- Spike repo sync diagnostics
- future product-specific support tools

---

## Canonical Service Shell Modules

The reusable shell should be thought of as these modules:

### `ingress`

Owns:

- frontdoor-authenticated private endpoints
- request normalization
- authoritative context parsing
- routing to the correct internal service module

### `managedProfiles`

Owns:

- managed profile CRUD
- profile lookup by canonical tuple
- profile status
- profile metadata shaping for relay responses

### `secretOps`

Owns:

- secret ref resolution
- token exchange
- token minting
- signing
- provider-specific secret-backed remote operations

### `diagnostics`

Owns:

- service health
- relay trace summaries
- product support summaries
- operator-visible error history

### `config`

Owns:

- flags
- thresholds
- product-wide settings

### `audit`

Owns:

- structured event logging
- operator-safe history
- support/debug traces

### `productModules`

Owns:

- product-specific shared logic that is not generic shell behavior

Examples:

- GlowBot benchmark aggregation
- Spike GitHub App installation support

---

## Canonical Admin Shell Modules

The reusable admin shell should be thought of as these modules:

### `auth`

Owns operator session/bootstrap behavior.

### `layout`

Owns:

- navigation
- product switcher or section nav when applicable
- top-level diagnostics indicators

### `managedProfiles`

Owns generic managed-profile operator UI.

### `diagnostics`

Owns generic health/error/operator insight UI.

### `config`

Owns generic flags/settings UI.

### `productViews`

Owns product-specific admin pages and tools.

---

## Private Contract Between Frontdoor And The Service Shell

The reusable shell assumes this contract:

1. frontdoor authenticates the tenant runtime first
2. frontdoor resolves `server_id` and `tenant_id`
3. frontdoor forwards the authoritative context to the product control plane
4. the product control plane authenticates frontdoor
5. the product control plane performs the required secret-backed action
6. the product control plane returns the adapter-facing response shape
7. frontdoor returns that response to the runtime

Required forwarded context:

- `server_id`
- `tenant_id`
- `entity_id`
- `app_id`
- `adapter_id`
- `connection_profile_id`
- `auth_method_id`
- `scope`
- optional `managed_profile_id`

The service shell must treat frontdoor as the caller.
It must not assume direct browser or tenant-runtime access.

---

## Canonical Product Instantiations

### GlowBot

Reusable shell instantiation:

- service shell: `glowbot-hub`
- admin shell: `glowbot-admin`

Product modules:

- benchmark aggregation
- cohort rules
- benchmark seed data
- GlowBot-managed OAuth profiles

### Spike

Reusable shell instantiation:

- service shell: `spike-hub`
- admin shell: `spike-admin`

Product modules:

- Spike-managed GitHub App profiles
- installation-token minting/signing
- repo sync diagnostics
- support-safe import/hydration summaries

---

## What This Shell Is Not

This shell is not:

- frontdoor
- a tenant runtime
- a wrapper adapter package
- an app manifest escape hatch
- an operator-only browser app with direct secret ownership

This shell is also not a mandate to prematurely share all implementation code.

The canonical requirement is:

- shared shape first
- product instantiation second
- shared implementation only where the shared shape is stable enough to justify
  it

---

## Recommended Next Step

Before building more product-specific service/admin shell code, each product should
converge to this shell:

1. implement the private service shell ingress
2. implement managed profile registry and secret-backed operations
3. implement a real admin shell on top
4. add product-specific modules only after the shell boundary is in place

This gives future products a repeatable service/admin shell pattern instead of
another round of frontdoor leakage and one-off admin tooling.
