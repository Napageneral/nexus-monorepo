---
summary: "Canonical hosted cleanroom flow for Frontdoor-managed app and adapter packages on sandbox-backed hosted targets, with real cloud reserved for explicit signoff exceptions."
read_when:
  - You are testing a package on a Frontdoor-provisioned hosted cleanroom target
  - You need one procedure that works for both apps and adapters
  - You need to publish, install, authenticate, and validate through Frontdoor and the runtime
title: "Frontdoor Hosted Package Live Testing"
---

# Frontdoor Hosted Package Live Testing

## Purpose

This document is the single active testing entrypoint for hosted cleanroom
package validation through Frontdoor.

Use it when the question is:

- how do I test a package through the canonical hosted cleanroom path
- how do I publish and install an adapter or app on a hosted server
- how do I get from Frontdoor auth to runtime validation without guessing

The default target is:

1. Docker-backed cleanroom executor
2. Frontdoor-provisioned sandbox-backed hosted target
3. durable proof bundle mounted out of the executor

Real cloud remains a provider-specific or compliance-specific signoff path,
not the default hosted integration substrate.

The local hosted cleanroom substrate is now proven with:

1. local Frontdoor host instance
2. Docker-backed executor
3. sandbox-backed hosted target
4. runtime token and runtime health proof
5. real Spike package publish, purchase, install, launch, uninstall, and
   cleanup proof

This document defines the canonical operator/testing flow for both:

- adapters
- apps

Shared operator helper:

- [frontdoor-package-lifecycle-smoke.mjs](/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-package-lifecycle-smoke.mjs)
- [frontdoor-fresh-server-package-lifecycle-smoke.mjs](/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-fresh-server-package-lifecycle-smoke.mjs)
- [frontdoor-fresh-server-adapter-cleanroom-smoke.mjs](/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-fresh-server-adapter-cleanroom-smoke.mjs)
- [frontdoor-fresh-server-one-server-multi-app-smoke.mjs](/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-fresh-server-one-server-multi-app-smoke.mjs)
- [frontdoor-runtime-rpc.mjs](/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-runtime-rpc.mjs)
- [frontdoor-jira-adapter-proof.mjs](/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-jira-adapter-proof.mjs)
- [frontdoor-local-sandbox-runtime-health-pilot.ts](/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-local-sandbox-runtime-health-pilot.ts)
- [frontdoor-local-sandbox-package-lifecycle-pilot.ts](/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-local-sandbox-package-lifecycle-pilot.ts)
- [capture-frontdoor-fresh-server-multi-app-smoke.sh](/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/capture-frontdoor-fresh-server-multi-app-smoke.sh)
- [capture-frontdoor-fresh-server-adapter-cleanroom.sh](/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/capture-frontdoor-fresh-server-adapter-cleanroom.sh)

Use that script for the common hosted package lifecycle proof:

- authenticated Frontdoor API token
- selected or provisioned server
- install or already-installed convergence
- optional upgrade
- runtime token mint
- runtime-token-authenticated runtime health
- runtime-token-authenticated runtime catalog proof for app suites
- optional uninstall

The canonical hosted cleanroom model is:

1. Docker-backed executor cleanroom
2. Frontdoor-provisioned sandbox-backed hosted server target
3. proof bundle mounted outside the container

The current Node scripts in `frontdoor/scripts/` are the inner lifecycle
helpers for that model. The default executor boundary is now the Docker wrapper
at [frontdoor-cleanroom-docker-executor.sh](/Users/tyler/nexus/home/projects/nexus/frontdoor/scripts/frontdoor-cleanroom-docker-executor.sh).

For cleanroom-first hosted validation, the default Docker-backed entrypoints
are now:

- `pnpm smoke:docker:fresh-server-package-lifecycle`
- `pnpm smoke:docker:fresh-server-one-server-multi-app`
- `pnpm smoke:docker:fresh-server-adapter-cleanroom`

Inside that Docker executor, the fresh-server helper still:

- it provisions a fresh server through `POST /api/servers/create`
- waits for the server to reach `running`
- runs the existing package lifecycle smoke against that new server
- then archives or destroys the server according to cleanup mode

For direct multi-app hosted cleanroom proof:

```bash
cd /Users/tyler/nexus/home/projects/nexus/frontdoor

FRONTDOOR_SMOKE_API_TOKEN='<frontdoor api token>' \
FRONTDOOR_SMOKE_CLEANUP_MODE='destroy' \
pnpm smoke:docker:fresh-server-one-server-multi-app
```

That path provisions a fresh hosted target, waits for `running`, invokes the
existing one-server multi-app smoke against that server, and then archives or
destroys the server according to cleanup mode.

The same path can prove a larger representative app set by overriding
`FRONTDOOR_SMOKE_APPS`, for example:

```bash
cd /Users/tyler/nexus/home/projects/nexus/frontdoor

FRONTDOOR_SMOKE_API_TOKEN='<frontdoor api token>' \
FRONTDOOR_SMOKE_APPS='glowbot,spike,aix,dispatch' \
FRONTDOOR_SMOKE_CLEANUP_MODE='destroy' \
pnpm smoke:capture:fresh-server-multi-app
```

That capture path writes a durable cleanroom proof bundle under the shared
cleanroom artifact root while running the proof from the Docker executor
cleanroom rather than the host shell.
The default proof location is:

- `/Users/tyler/nexus/state/artifacts/validation/cleanroom/frontdoor-fresh-server-multi-app/latest/`

Override it with `NEXUS_CLEANROOM_PROOF_ROOT` when you need a different capture
root.

If you need deeper per-app behavior proof on top of install, catalog presence,
and launch validation, set `FRONTDOOR_SMOKE_APP_PROOF_COMMAND`. The wrapper
will run it once per app with the same `server_id`, app id, runtime bearer
token, and runtime descriptor env vars.

Then layer package-specific live validation on top.

## Adapter Cleanroom Proof Path

For the first reusable hosted adapter cleanroom suite, use the fresh-server
adapter wrapper through the Docker executor:

```bash
cd /Users/tyler/nexus/home/projects/nexus/frontdoor

FRONTDOOR_SMOKE_API_TOKEN='<frontdoor api token>' \
FRONTDOOR_SMOKE_ADAPTERS='jira' \
FRONTDOOR_SMOKE_ADAPTER_PROOF_COMMAND='pnpm smoke:proof:jira-adapter' \
JIRA_SITE='<jira site slug>' \
JIRA_EMAIL='<jira email>' \
JIRA_API_TOKEN='<jira api token>' \
JIRA_PROJECT_KEY='VT' \
FRONTDOOR_SMOKE_CLEANUP_MODE='destroy' \
pnpm smoke:capture:fresh-server-adapter-cleanroom
```

That path provisions one fresh hosted target, installs the requested adapters,
probes runtime health through the real hosted seams, and leaves a cleanroom
proof bundle behind. Jira is the first concrete automation lane because it can
prove custom-flow connection setup, health, outbound write, backfill, and
record reappearance entirely through explicit runtime operations.

For a non-capturing Docker-executor run of the same lane:

```bash
cd /Users/tyler/nexus/home/projects/nexus/frontdoor

FRONTDOOR_SMOKE_API_TOKEN='<frontdoor api token>' \
FRONTDOOR_SMOKE_ADAPTERS='jira' \
FRONTDOOR_SMOKE_ADAPTER_PROOF_COMMAND='pnpm smoke:proof:jira-adapter' \
JIRA_SITE='<jira site slug>' \
JIRA_EMAIL='<jira email>' \
JIRA_API_TOKEN='<jira api token>' \
JIRA_PROJECT_KEY='VT' \
FRONTDOOR_SMOKE_CLEANUP_MODE='destroy' \
pnpm smoke:docker:fresh-server-adapter-cleanroom
```

If you need adapter-specific proof on top of install and runtime access, set
`FRONTDOOR_SMOKE_ADAPTER_PROOF_COMMAND` to a command that uses the same
`server_id` and adapter context. The wrapper now exports these env vars to that
proof command:

- `FRONTDOOR_SMOKE_RUNTIME_ACCESS_TOKEN`
- `FRONTDOOR_SMOKE_RUNTIME_BASE_URL`
- `FRONTDOOR_SMOKE_RUNTIME_HTTP_BASE_URL`
- `FRONTDOOR_SMOKE_RUNTIME_WS_URL`
- `FRONTDOOR_SMOKE_RUNTIME_SSE_URL`
- `FRONTDOOR_SMOKE_RUNTIME_ENTITY_ID`
- `FRONTDOOR_SMOKE_RUNTIME_TENANT_ID`

The easiest way to consume that env contract from a proof command is:

```bash
cd /Users/tyler/nexus/home/projects/nexus/frontdoor

pnpm smoke:runtime-rpc -- \
  --method adapters.connections.status \
  --params '{"connectionId":"<connection-id>"}'
```

For Jira specifically, the reusable proof command is already wired:

```bash
pnpm smoke:proof:jira-adapter
```

It expects:

- `JIRA_SITE`
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `JIRA_PROJECT_KEY`

and uses the fresh-server runtime bearer token plus hosted runtime descriptor
env vars that the wrapper injects automatically.

Jira-specific setup quirk:

- one `adapters.connections.custom.submit` should complete the setup
- do not use `adapters.connections.custom.status` as the readiness gate for
  this proof

For GOG/Gmail hosted install and restart durability, the reusable proof
command is:

```bash
pnpm smoke:proof:gog-hosted-install-restart
```

It expects the fresh-server wrapper env vars, or an explicit
`FRONTDOOR_SMOKE_SERVER_ID` plus Frontdoor API token. It verifies:

1. `gog` adapter install status
2. runtime health before and after archive/restore
3. the 13 Gmail package methods through `adapters.methods`
4. required adapter operations through `adapter.info`
5. Gmail-root public connection count preservation across restore

The current hosted GOG proof does not import a Gmail OAuth credential into the
hosted runtime. Live Gmail backfill, monitor soak, and agent-use are covered by
the adapter package cleanroom proof.

Latest MoonSleep GOG proof:

- proof artifacts:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/gog-hosted-moonsleep-install-restart/20260429T202232Z`
- hosted Linux arm64 archive sha256:
  `4b3d99bd01e0daedc80783b40e0d86f56771d4a7675030129e720d9850c0c68e`
- result: `gog@0.1.0` remained installed across archive/restore, runtime
  health stayed healthy, all 13 Gmail methods stayed registered, and
  Gmail-root connection count stayed `1`

The adapter suite is intentionally reusable before it is fully automated:

1. adapter install plus runtime-token-authenticated runtime access are proven
   through the fresh-server path
2. Jira now has a reusable connection/health/ingest proof command on top of the
   same fresh server
3. other adapters can layer equivalent proof commands onto the same seam
4. cleanup remains explicit and disposable by default

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
4. Canonical hosted testing must use a Docker-backed executor and a
   Frontdoor-managed sandbox-backed hosted target, not a host-runtime shortcut.
5. Real cloud is reserved for explicit provider or compliance signoff when that
   infrastructure difference is the thing being proved.
5. Do not skip package publication state just because the tarball exists on disk.
6. For adapters, durable connection state belongs to the runtime after install.

## Preconditions

Before running this ladder, confirm:

1. a real Frontdoor-managed server exists for the target account
2. the target package tarball and manifest exist for the server platform
3. Frontdoor package registry tables contain the release metadata
4. you have a valid Frontdoor API token:
   - `nex_t_...`

For fresh-server cleanroom validation, also decide the cleanup policy:

- `destroy` for a fully disposable proof
- `archive` for a reversible but non-running cleanup
- `retain` only when actively debugging a failed run

## Canonical Live Flow

### Step 1: Identify the target server

You need:

- `server_id`
- `tenant_id`
- account ownership
- runtime origin or runtime token mint path

In production or hosted cleanroom validation, the public API server is
Frontdoor:

- `https://frontdoor.nexushub.sh`

For cleanroom-first hosted validation, the preferred path is to let the helper
create a fresh server instead of reusing an already-lived-in one:

```bash
cd /Users/tyler/nexus/home/projects/nexus/frontdoor

FRONTDOOR_SMOKE_API_TOKEN='<frontdoor api token>' \
FRONTDOOR_SMOKE_KIND='adapter' \
FRONTDOOR_SMOKE_ADAPTER_ID='confluence' \
FRONTDOOR_SMOKE_CLEANUP_MODE='destroy' \
pnpm smoke:docker:fresh-server-package-lifecycle
```

That path exercises the same public server create, runtime token, install, and
cleanup seams that Frontdoor uses in production.

For the local substrate pilot that proves the same purchase/install/launch/
uninstall path against the sandbox-backed hosted target without leaving the
machine, use:

```bash
cd /Users/tyler/nexus/home/projects/nexus/frontdoor

FRONTDOOR_CLEANROOM_IMAGE='frontdoor-cleanroom-executor:local-pkg' \
pnpm smoke:local:sandbox-package-lifecycle-pilot
```

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

Canonical cleanroom auth choice:

- Frontdoor API token (`nex_t_...`)

For repeatable operator and agent testing, the required path is a Frontdoor API
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

The hosted helper scripts now consume this token directly:

- runtime health is checked with `Authorization: Bearer <access_token>`
- multi-app app-catalog proof is checked through the runtime HTTP base URL with
  that same token
- adapter proof commands inherit the same runtime token and descriptor env vars
  instead of reminting them ad hoc

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
  [server.frontdoor-confluence-adapter.live.test.ts](/Users/tyler/nexus/home/projects/nexus/nex/src/api/server.frontdoor-confluence-adapter.live.test.ts)

## Operational Notes

1. Staged tarball presence on the Frontdoor host is not enough by itself. The
   release must exist in Frontdoor registry state.
2. For production automation, API token auth is usually easier than interactive
   browser login.
3. Adapter package health and adapter connection health are separate checks.
4. For Confluence specifically, monitor is the freshness proof path. Historical
   backfill may lag very recent writes because provider search indexing is not
   immediate.
