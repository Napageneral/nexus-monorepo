# Frontdoor Managed Connection Gateway

**Status:** CANONICAL
**Last Updated:** 2026-03-10

---

## Purpose

This document defines how frontdoor acts as the private managed-connection
gateway for tenant runtimes and how frontdoor handles platform-managed provider
profiles.

It exists to preserve this customer experience:

1. a provider such as GitHub or Google feels like one shared platform
   capability
2. an app such as Spike or GlowBot can still present app-branded connection
   options on top of that shared provider
3. users can choose between bring-your-own credentials and app-managed provider
   credentials without the system inventing wrapper adapter packages
4. provider secrets remain outside tenant runtimes and app manifests
5. frontdoor does not become the long-lived secret owner for every app-branded
   managed provider flow

This document is the frontdoor-owned implementation contract for the shared Nex
platform and adapter specs:

- `../../nex/docs/specs/platform/packages-and-control-planes.md`
- `../../nex/docs/specs/platform/managed-connection-gateway.md`
- `../../nex/docs/specs/adapters/adapter-connections.md`

---

## Customer Experience

The customer sees app-owned connection choices, not raw provider mechanics.

Examples:

1. Spike may present:
   - `Connect with Spike GitHub App`
   - `Use my own GitHub App`
   - `Use a PAT`
2. GlowBot may present:
   - `Connect with GlowBot Google`
   - `Upload CSV`

The generic Nex console remains the raw shared-adapter management surface.

Rules:

1. app UIs list only the connection profiles declared by that app
2. frontdoor is always the runtime-facing gateway for managed connection
   operations
3. platform-managed provider profiles may be fulfilled directly by frontdoor
4. app-branded managed provider profiles are fulfilled by the owning product
   control plane through frontdoor's gateway
5. bring-your-own provider options remain available through the generic Nex
   console or through app profiles that intentionally expose them

---

## Design Rules

1. Frontdoor is the runtime-facing managed-connection gateway.
2. Platform-managed profiles are frontdoor-owned.
3. Product-managed profiles are owned by product control planes.
4. A managed connection request is selected by app connection profile, not by
   adapter package alone.
5. Managed connection resolution is tenant-aware and app-aware.
6. Managed connection endpoints are private runtime-facing frontdoor endpoints,
   not public browser endpoints.
7. Frontdoor must authenticate the calling runtime before trusting app/profile
   context.
8. Frontdoor must never expose provider client secrets to browsers or tenant
   runtimes.
9. OAuth-managed requests are first-class in this contract.
10. Managed custom-flow requests use the same selection and trust model, but
    their adapter-specific setup contract is separate from the OAuth exchange
    contract defined here.

---

## Canonical Objects

### Platform-managed connection profile

A frontdoor-owned provider credential/config profile used when the platform
itself is the correct long-lived secret owner.

Examples:

- `generic-google-oauth`
- `platform-shared-provider-profile`

Canonical identity tuple:

- `managed_profile_id`
- `app_id`
- `adapter_id`
- `connection_profile_id`
- `auth_method_id`

### Product-managed connection profile

A product-control-plane-owned provider credential/config profile referenced by
an app-branded connection profile.

Examples:

- `spike-github-app`
- `glowbot-google-oauth`

Frontdoor does not own the long-lived provider secret for these profiles. It
routes the request to the correct product control plane.

### Managed OAuth profile

A managed connection profile for an OAuth-capable shared adapter auth method.

For platform-managed flows it contains:

- provider `service`
- `authorize_url`
- `token_url`
- `client_id`
- `client_secret_ref`
- default `scopes`
- optional `authorize_params`
- optional `token_params`

Product-managed OAuth profiles may live behind product control planes with
different internal storage, but they are still reached through the same
frontdoor gateway contract.

### Runtime-managed connection request

A private request from a tenant runtime to frontdoor asking for either:

- metadata needed to start a managed provider flow
- token exchange or another secret-backed managed provider operation

### Runtime caller identity

The authenticated runtime making the request on behalf of a caller already
authorized inside that tenant.

The runtime asserts:

- `entity_id`
- `app_id`
- `adapter_id`
- `connection_profile_id`
- `auth_method_id`
- `scope`
- optional `managed_profile_id`

Frontdoor authenticates the runtime itself and derives authoritative:

- `server_id`
- `tenant_id`

---

## Trust Model

Managed connection gateway endpoints are private frontdoor runtime endpoints.

Required trust chain:

1. browser or app client authenticates to frontdoor
2. frontdoor mints a runtime access token
3. runtime authorizes the caller for adapter connection operations
4. runtime calls frontdoor managed-connection endpoints using the server's
   private `runtime_auth_token`
5. frontdoor resolves the server from that private runtime credential
6. frontdoor derives the authoritative `tenant_id` from the resolved server
7. frontdoor only then trusts the runtime-provided `x-nexus-*` app/profile
   context as runtime assertions within that tenant boundary
8. frontdoor either serves the request directly or forwards it to the correct
   product control plane

Non-negotiable rules:

1. frontdoor must not trust raw `x-nexus-*` headers from unauthenticated
   network callers
2. frontdoor must not trust a caller-supplied `tenant_id` more than the
   tenant implied by the authenticated runtime credential
3. managed connection endpoints are never browser endpoints
4. provider client secrets are never returned to the runtime

---

## Resolution Rules

When frontdoor resolves a managed connection request, it must use:

- authenticated `server_id`
- authenticated `tenant_id`
- `entity_id`
- `app_id`
- `adapter_id`
- `connection_profile_id`
- `auth_method_id`
- `scope`
- optional `managed_profile_id`

Selection rules:

1. frontdoor resolves the request against the installed app and the full
   app/profile/auth tuple
2. frontdoor first attempts an exact match in the platform-managed profile
   store using:
   - `app_id`
   - `adapter_id`
   - `connection_profile_id`
   - `auth_method_id`
   - optional `managed_profile_id`
3. if that exact platform-managed match exists, owner kind is
   `platform_control_plane` and frontdoor serves the request directly
4. otherwise frontdoor resolves the product control plane route for the
   declaring `app_id`
5. if a product control plane route exists, owner kind is
   `product_control_plane` and frontdoor relays the request there
6. if neither a platform-managed profile nor a product control plane route can
   be resolved, frontdoor rejects the request
7. service-only lookup is invalid
8. adapter-only lookup is invalid
9. frontdoor must reject ambiguous matches

Authorization rules:

1. the resolved server must belong to the authenticated runtime credential
2. the request `tenant_id` must match the tenant routed for that server
3. the target app must be installed on that server
4. the target app connection profile must be compatible with the resolved
   managed connection request
5. if the profile is app-scoped, the calling app id must match the resolved
   profile app id exactly

---

## Data Model

Frontdoor persists:

1. platform-managed connection profiles
2. product control plane routing metadata

Canonical platform-managed table:

```sql
CREATE TABLE frontdoor_platform_managed_connection_profiles (
  managed_profile_id     TEXT PRIMARY KEY,
  app_id                 TEXT NOT NULL,
  adapter_id             TEXT NOT NULL,
  connection_profile_id  TEXT NOT NULL,
  auth_method_id         TEXT NOT NULL,
  flow_kind              TEXT NOT NULL,
  service                TEXT NOT NULL,
  display_name           TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'active',
  authorize_url          TEXT,
  token_url              TEXT,
  client_id              TEXT,
  client_secret_ref      TEXT,
  scopes_json            TEXT,
  authorize_params_json  TEXT,
  token_params_json      TEXT,
  config_json            TEXT,
  created_at_ms          INTEGER NOT NULL,
  updated_at_ms          INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_frontdoor_platform_managed_connection_profiles_tuple
  ON frontdoor_platform_managed_connection_profiles(
    app_id,
    adapter_id,
    connection_profile_id,
    auth_method_id,
    status
  );
```

Field rules:

1. `flow_kind` is the platform-managed flow family
2. `flow_kind = 'oauth2'` requires:
   - `authorize_url`
   - `token_url`
   - `client_id`
   - `client_secret_ref`
3. `client_secret_ref` is a secret pointer, not a browser-visible value
4. `service` names the provider service expected by the shared adapter auth
   method
5. `config_json` may hold additional provider-specific control-plane config
   that is not secret and not part of the canonical OAuth fields

Frontdoor also needs product control plane routing metadata keyed by product or
app so it can dispatch product-managed requests to the correct control plane.

Canonical product control plane routing table:

```sql
CREATE TABLE frontdoor_product_control_plane_routes (
  app_id            TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  base_url          TEXT NOT NULL,
  auth_token_ref    TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at_ms     INTEGER NOT NULL,
  updated_at_ms     INTEGER NOT NULL
);
```

Field rules:

1. `app_id` is the installed app whose app-branded managed profiles resolve
   through this control plane
2. `base_url` is the private HTTPS base URL for the owning product control
   plane service
3. `auth_token_ref` is a frontdoor-side secret pointer used only for
   frontdoor -> product-control-plane private calls
4. this table is routing metadata, not the source of truth for app-managed
   provider profiles themselves

---

## Runtime-Facing HTTP Contract

Base path:

- `GET /api/internal/managed-connections/profile`
- `POST /api/internal/managed-connections/profile/exchange`

These are private control-plane gateway endpoints.

### Shared request headers

Required:

- `Authorization: Bearer <runtime_auth_token>`
- `x-nexus-auth-via`
- `x-nexus-entity-id`
- `x-nexus-app-id`
- `x-nexus-adapter-id`
- `x-nexus-connection-profile-id`
- `x-nexus-auth-method-id`
- `x-nexus-connection-scope`

Optional:

- `x-nexus-managed-profile-id`
- `x-nexus-tenant-id`

Header rules:

1. frontdoor authenticates the runtime from `Authorization`
2. `x-nexus-tenant-id` is advisory only and must match the authenticated
   runtime tenant if present
3. all `x-nexus-*` app/profile headers must agree with the request query/body
   when both are supplied

### Metadata request

Query parameters:

- `service`
- `app_id`
- `adapter_id`
- `connection_profile_id`
- `auth_method_id`
- `scope`
- optional `managed_profile_id`

Canonical response for a platform-managed OAuth flow:

```json
{
  "managedProfileId": "generic-google-oauth",
  "service": "google",
  "authUri": "https://accounts.google.com/o/oauth2/v2/auth",
  "clientId": "google-client-id",
  "scopes": ["openid", "email", "profile"],
  "authorizeParams": {
    "access_type": "offline",
    "prompt": "consent"
  }
}
```

Rules:

1. metadata responses never include `client_secret`
2. `token_url` stays server-side and does not need to be returned to the
   runtime because exchange stays inside frontdoor for platform-managed flows
3. for product-managed flows, frontdoor may proxy the product control plane
   response as long as it preserves the runtime-facing contract

### Exchange request

Canonical body:

```json
{
  "service": "google",
  "appId": "glowbot",
  "adapter": "google",
  "connectionProfileId": "glowbot-managed-google-oauth",
  "authMethodId": "google_oauth_managed",
  "scope": "app",
  "managedProfileId": "glowbot-google-oauth",
  "code": "provider-auth-code",
  "state": "opaque-state-token",
  "redirectUri": "https://t-tenant-123.nexushub.sh/auth/google/callback"
}
```

Canonical response:

```json
{
  "access_token": "provider-access-token",
  "refresh_token": "provider-refresh-token",
  "expires_in": 3600,
  "token_type": "Bearer",
  "scope": "openid email profile"
}
```

Rules:

1. frontdoor performs the provider token exchange server-side when the profile
   is platform-managed
2. frontdoor routes the request to the owning product control plane when the
   profile is product-managed
3. the response shape must still contain the fields the shared adapter runtime
   needs to persist credentials

---

## Managed Custom-Flow Requests

Some managed connection experiences are not plain OAuth client exchanges.

Example:

- a Spike GitHub App install flow routed to the Spike product control plane

Rules:

1. managed custom-flow requests use the same:
   - runtime trust model
   - app/profile/auth-method selection tuple
   - frontdoor gateway
2. app-specific managed custom-flow secret material belongs to the owning
   product control plane, not frontdoor
3. managed custom-flow requests do not use the OAuth metadata and OAuth
   exchange contract above unless the adapter auth method itself is OAuth-based
4. adapter-specific managed custom-flow setup contracts must still keep
   reusable provider protocol and callback ownership in the shared adapter
   layer

This document does not redefine adapter-specific custom-flow setup payloads.
It locks the frontdoor gateway, selection, and trust model that those flows
must follow.

---

## Frontdoor -> Product Control Plane Private HTTP Contract

Frontdoor must use private HTTP calls for product-managed relay behavior.

Base paths on the product control plane:

- `GET /api/internal/frontdoor/managed-connections/profile`
- `POST /api/internal/frontdoor/managed-connections/profile/exchange`

Authentication:

- `Authorization: Bearer <product_control_plane_auth_token>`

Required forwarded headers:

- `x-nexus-server-id`
- `x-nexus-tenant-id`
- `x-nexus-entity-id`
- `x-nexus-app-id`
- `x-nexus-adapter-id`
- `x-nexus-connection-profile-id`
- `x-nexus-auth-method-id`
- `x-nexus-connection-scope`

Optional forwarded headers:

- `x-nexus-managed-profile-id`

Rules:

1. frontdoor authenticates the tenant runtime before any relay happens
2. frontdoor forwards authoritative `server_id` and `tenant_id`; it does not
   forward the runtime auth token
3. frontdoor forwards the exact resolved app/profile/auth tuple
4. the product control plane returns the same runtime-facing JSON contract the
   shared adapter layer expects
5. frontdoor may proxy that JSON response as-is when it matches the canonical
   runtime-facing contract

---

## Audit And Logging

Frontdoor must record:

1. managed-connection metadata lookups
2. managed-connection token exchanges
3. managed-connection relays to product control planes
4. rejected lookups
5. rejected exchanges

Each record should include at minimum:

- `server_id`
- `tenant_id`
- `entity_id`
- `app_id`
- `adapter_id`
- `connection_profile_id`
- `auth_method_id`
- optional `managed_profile_id`
- operation
- owner kind
- status
- error code when rejected
- timestamp

Frontdoor logs must never include provider client secrets.

---

## Non-Negotiable Rules

1. Frontdoor is the managed-connection gateway for tenant runtimes.
2. Frontdoor owns only platform-managed profiles.
3. Product control planes own app-managed provider credential profiles.
4. Shared adapters remain generic even when an app uses a managed profile.
5. Managed profile resolution is app/profile aware.
6. Service-only managed credential lookup is not canonical.
7. Runtime-to-frontdoor managed credential calls require private runtime
   authentication.
8. Platform-managed provider secrets remain in frontdoor-owned control-plane
   storage.
9. App UIs expose curated connection profiles; the generic Nex console exposes
   raw shared-adapter connection management.
