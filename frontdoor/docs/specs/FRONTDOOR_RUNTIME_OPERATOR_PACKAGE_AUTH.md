# Frontdoor Runtime Operator Package Auth

## Customer experience

When an operator installs, upgrades, or uninstalls an app or adapter from
Frontdoor, the action must succeed through the same package operator lane that
the hosted platform uses in production. The request must not fail because
Frontdoor used the wrong kind of runtime token.

The operator experience is:

1. authenticate to Frontdoor
2. choose a server
3. install, upgrade, or uninstall a package
4. Frontdoor relays that request to the tenant runtime
5. the runtime accepts the request as trusted operator work
6. Frontdoor reports the real package result

## Canonical behavior

Frontdoor package lifecycle calls to Nex private operator endpoints:

- `POST /api/operator/packages/install`
- `POST /api/operator/packages/upgrade`
- `POST /api/operator/packages/uninstall`

must authenticate with a **trusted runtime bearer token**, not the legacy
server `runtimeAuthToken`.

That trusted runtime bearer token must be minted from Frontdoor's runtime token
signing config and must target the selected server tenant.

## Principal model

For public operator actions initiated from a signed-in user or API token:

- Frontdoor must mint the runtime bearer token from the **acting principal**
- the token must carry the selected server's:
  - `tenant_id`
  - `server_id`
  - derived `entity_id`
- the token must carry operator-authorized scopes

For internal package flows that do not originate from a persistent user
session:

- Frontdoor may fall back to a **server-owner principal**
- the fallback principal must be derived from:
  - the server's owning account
  - that account's owner user
  - the selected server tenant

## Non-goals

- do not use `server.runtimeAuthToken` for private operator package endpoints
- do not reintroduce SSH as the canonical hosted install path when direct
  runtime HTTP is available
- do not widen package operator auth to anonymous or session-cookie-less
  requests inside the runtime

## Validation requirements

The hosted production proof must show:

1. Frontdoor public install/upgrade/uninstall APIs succeed against a production
   server using direct runtime HTTP.
2. The runtime accepts the relayed bearer token for operator package endpoints.
3. Frontdoor no longer returns `runtime_*_failed` with runtime body
   `Unauthorized` for a valid operator action.
