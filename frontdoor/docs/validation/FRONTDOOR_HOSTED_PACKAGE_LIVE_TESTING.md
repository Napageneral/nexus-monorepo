---
summary: "Canonical hosted live testing flow for Frontdoor-managed app and adapter packages on real servers."
read_when:
  - You are testing a package on a real Frontdoor-managed server
  - You need one procedure that works for both apps and adapters
  - You need to publish, install, authenticate, and validate through Frontdoor and the runtime
title: "Frontdoor Hosted Package Live Testing"
---

# Frontdoor Hosted Package Live Testing

## Purpose

This document is the single active testing entrypoint for live hosted package
validation on real Frontdoor-managed servers.

Use it when the question is:

- how do I test a package in production through Frontdoor
- how do I publish and install an adapter or app on a hosted server
- how do I get from Frontdoor auth to runtime validation without guessing

This document defines the canonical operator/testing flow for both:

- `kind = "adapter"`
- `kind = "app"`

Shared operator helper:

- [frontdoor-package-lifecycle-smoke.mjs](/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-package-lifecycle-smoke.mjs)

Use that script for the common hosted package lifecycle proof:

- authenticated Frontdoor API token or session cookie
- selected server
- install or already-installed convergence
- optional upgrade
- runtime token mint
- runtime health
- optional uninstall

Then layer package-specific live validation on top.

## Customer Experience

The customer-facing experience being proven is:

1. the customer has a server in Frontdoor
2. Frontdoor knows about an installable package release
3. Frontdoor installs that package onto the selected server
4. the runtime activates it
5. the customer uses the installed package through normal runtime surfaces

For adapters, that means:

1. install adapter on server
2. create connection
3. health
4. backfill and/or monitor
5. use send/delete if supported

For apps, that means:

1. install app on server
2. launch app or call app-owned runtime surfaces
3. validate app health and behavior

## Non-Negotiable Rules

1. Frontdoor is the public control plane boundary.
2. Package install must go through Frontdoor-managed package state.
3. Runtime operator install is below the Frontdoor API boundary.
4. Real hosted testing must use a real server, not a local-only shortcut.
5. Do not skip package publication state just because the tarball exists on disk.
6. For adapters, durable connection state belongs to the runtime after install.

## Preconditions

Before running this ladder, confirm:

1. a real Frontdoor-managed server exists for the target account
2. the target package tarball and manifest exist for the server platform
3. Frontdoor package registry tables contain the release metadata
4. you have a valid Frontdoor auth surface:
   - browser session, or
   - `nex_t_...` Frontdoor API token

## Canonical Live Flow

### Step 1: Identify the target server

You need:

- `server_id`
- `tenant_id`
- account ownership
- runtime origin or runtime token mint path

In production, the public API server is Frontdoor:

- `https://frontdoor.nexushub.sh`

### Step 2: Ensure the package is published in Frontdoor

Frontdoor install depends on registry state, not just files on disk.

For a release to be installable, Frontdoor must have:

- `frontdoor_packages` row
- `frontdoor_package_releases` row
- `frontdoor_release_variants` row

Required release data:

- package id
- package kind
- version
- manifest JSON
- target OS / arch
- tarball path or durable blob pointer

Canonical operator publish path:

```bash
cd /Users/tyler/nexus/home/projects/nexus/frontdoor

pnpm exec tsx ./scripts/publish-adapter-release.ts \
  --config /etc/nexus-frontdoor/frontdoor.config.json \
  --package-root /opt/nexus/frontdoor/packages/<adapter-id>/<version> \
  --tarball /opt/nexus/frontdoor/packages/<adapter-id>/<version>/<adapter-id>-<version>-linux-arm64.tar.gz \
  --target-os linux \
  --target-arch arm64 \
  --channel stable
```

For app packages, use the corresponding app publish flow. The critical point is
the same: package files on disk are not enough until Frontdoor registry state is
published.

### Step 3: Authenticate to Frontdoor

Canonical public auth choices:

- browser session cookie
- Frontdoor API token (`nex_t_...`)

For repeatable operator and agent testing, the preferred path is a Frontdoor API
token scoped to the target user/account.

### Step 4: Install the package through Frontdoor

Use the public Frontdoor route:

- `POST /api/servers/:serverId/apps/:appId/install` for apps
- `POST /api/servers/:serverId/adapters/:adapterId/install` for adapters

For already-installed packages, use the lifecycle route instead of forcing a
fresh server:

- `POST /api/servers/:serverId/apps/:appId/upgrade`
- `POST /api/servers/:serverId/adapters/:adapterId/upgrade`
- `DELETE /api/servers/:serverId/apps/:appId/install`
- `DELETE /api/servers/:serverId/adapters/:adapterId/install`

Pass the desired package version.

Pass when:

- Frontdoor returns success
- install status becomes `installed`
- the active version matches the requested release

### Step 5: Mint a runtime token through Frontdoor

Use:

- `POST /api/runtime/token`

This proves Frontdoor can route authenticated runtime access to the selected
server.

For repeatable agent/operator testing, the canonical non-browser path is:

1. authenticate to Frontdoor with a `nex_t_...` API token
2. call `POST /api/runtime/token` with `server_id`
3. use the returned access token against runtime HTTP or WebSocket surfaces

Canonical hosted WebSocket path:

- `wss://frontdoor.nexushub.sh/runtime/ws?server_id=<server-id>`

Use:

- `Authorization: Bearer <frontdoor-api-token>` on the WebSocket upgrade
- runtime `auth.token` from the server's runtime auth token on the `connect`
  payload
- device pairing if the target runtime has not yet paired that client

Pass when:

- Frontdoor returns a runtime access token
- runtime HTTP and WebSocket surfaces accept it

### Step 6A: Adapter-specific validation

For adapters, continue with:

1. connection setup
2. connection health
3. historical ingest (`records.backfill` or canonical equivalent)
4. freshness monitor
5. outbound actions if supported

The green bar is:

1. connection is created against the installed adapter
2. health succeeds
3. records appear in Nex
4. channels and contacts materialize when applicable
5. writes return through ingest when the adapter supports write-read coherence

### Step 6B: App-specific validation

For apps, continue with:

1. app package health
2. launch or route proof
3. app-owned runtime/API behavior
4. uninstall or upgrade when relevant

The green bar is:

1. app package is healthy
2. app launches on the correct server
3. app behavior is reachable through the hosted runtime

## Confluence Adapter Production Checklist

Use this exact flow for `confluence`:

1. publish `confluence@<version>` in Frontdoor registry
2. create or use a Frontdoor API token for the target account
3. install or upgrade `confluence` onto the selected server
4. mint runtime token
5. run Confluence custom setup with live credential
6. run health
7. run historical ingest
8. start monitor
9. run `confluence.pages.create`
10. confirm the written page comes back through monitor as canonical ingest
11. run `confluence.pages.move_to_trash` for cleanup

Concrete operator commands:

```bash
TOKEN='<frontdoor api token>'
SERVER_ID='<server id>'
ADAPTER_ID='confluence'
VERSION='<version>'

curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -X POST \
  "https://frontdoor.nexushub.sh/api/servers/${SERVER_ID}/adapters/${ADAPTER_ID}/install" \
  -d "{\"version\":\"${VERSION}\"}"

curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -X POST \
  "https://frontdoor.nexushub.sh/api/servers/${SERVER_ID}/adapters/${ADAPTER_ID}/upgrade" \
  -d "{\"target_version\":\"${VERSION}\"}"

curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -X POST \
  https://frontdoor.nexushub.sh/api/runtime/token \
  -d "{\"server_id\":\"${SERVER_ID}\"}"
```

Shared smoke script examples:

```bash
cd /Users/tyler/nexus/home/projects/nexus/frontdoor

FRONTDOOR_SMOKE_ORIGIN='https://frontdoor.nexushub.sh' \
FRONTDOOR_SMOKE_API_TOKEN='nex_t_...' \
FRONTDOOR_SMOKE_KIND='app' \
FRONTDOOR_SMOKE_APP_ID='glowbot' \
FRONTDOOR_SMOKE_TARGET_VERSION='2.0.0' \
pnpm smoke:package-lifecycle

FRONTDOOR_SMOKE_ORIGIN='https://frontdoor.nexushub.sh' \
FRONTDOOR_SMOKE_API_TOKEN='nex_t_...' \
FRONTDOOR_SMOKE_KIND='adapter' \
FRONTDOOR_SMOKE_ADAPTER_ID='confluence' \
FRONTDOOR_SMOKE_TARGET_VERSION='0.1.1' \
pnpm smoke:package-lifecycle
```

## Evidence Targets

Use these as the primary live proof references:

- Frontdoor public adapter install behavior:
  [FRONTDOOR_SERVER_ADAPTER_INSTALL_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_SERVER_ADAPTER_INSTALL_VALIDATION.md)
- Nex hosted validation packet:
  [canonical-api-validation-ladder.md](/Users/tyler/nexus/home/projects/nexus/nex/docs/validation/canonical-api-validation-ladder.md)
- Live Frontdoor + Confluence runtime test:
  [server.frontdoor-confluence-adapter.live.test.ts](/Users/tyler/nexus/home/projects/nexus/nex/src/nex/runtime-api/server.frontdoor-confluence-adapter.live.test.ts)

## Operational Notes

1. Staged tarball presence on the Frontdoor host is not enough by itself. The
   release must exist in Frontdoor registry state.
2. For production automation, API token auth is usually easier than interactive
   browser login.
3. Adapter package health and adapter connection health are separate checks.
4. For Confluence specifically, monitor is the freshness proof path. Historical
   backfill may lag very recent writes because provider search indexing is not
   immediate.
