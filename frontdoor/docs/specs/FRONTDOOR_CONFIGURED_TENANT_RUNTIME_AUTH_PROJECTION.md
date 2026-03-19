---
title: "Frontdoor Configured Tenant Runtime Auth Projection"
summary: "Canonical runtime-auth projection rules for local and loopback Frontdoor stacks."
---

# Frontdoor Configured Tenant Runtime Auth Projection

## Customer experience

On a local or single-machine stack, the operator should be able to:

1. boot a runtime locally
2. boot Frontdoor locally
3. install an app through Frontdoor
4. launch that app through `/app/<appId>/` and same-origin `/runtime/...`

If the runtime is configured with a direct shared runtime auth token, Frontdoor
may still need that token for server-authenticated flows. Shell-profile browser
launch must continue to preserve the signed-in human principal. Install success
with broken launch/runtime proxy behavior is not acceptable.

## Canonical rule

When Frontdoor has both:

- a persisted `frontdoor_servers` row for a server
- a configured tenant entry in `config.tenants` for the same `tenant_id`

the effective server-auth projection is:

1. persisted `server.runtimeAuthToken`, if present
2. otherwise configured `tenant.runtimeAuthToken`, if present
3. otherwise no effective server-auth token

This applies to:

- local direct package install/upgrade/uninstall calls that use runtime HTTP
- runtime-initiated product-control-plane traffic
- other server-authenticated direct runtime calls

## Why this rule exists

Local and loopback runtimes are commonly started in shared-token mode rather
than hosted trusted-token mode. Frontdoor still needs a correct effective
server-auth projection for install and runtime-initiated flows. Separately,
shell-profile `/runtime/...` and `/app/...` traffic must use frontdoor-minted,
session-bound runtime access tokens so the runtime sees the human principal
rather than a server token.

That produces a broken customer state:

- app install reports success
- runtime actually has the app active
- `/runtime/*` returns unauthorized
- `/app/<appId>/` fails even though the app is installed

## Projection behavior

Frontdoor startup must reconcile configured tenants into the active server
projection:

1. if a persisted server row exists for a configured tenant and the server row
   is missing `runtimeAuthToken`, Frontdoor must hydrate the effective runtime
   projection from the configured tenant token
2. Frontdoor may persist that hydrated token back into the durable server row
   for local/dev consistency
3. Frontdoor must not overwrite a non-empty persisted server token with a
   configured token

## Scope

This rule is for local/dev and other direct runtime-token stacks. Hosted
production stacks that use trusted runtime access tokens remain unchanged.

Browser shell traffic is a different contract:

1. shell-profile `/runtime/...`
2. shell-profile `/app/...`

Those surfaces must always use a frontdoor-minted, session-bound runtime access
token, even when a configured/persisted `runtimeAuthToken` exists for
server-authenticated flows.
