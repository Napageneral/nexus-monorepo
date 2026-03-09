# Evidence Bundle: Frontdoor App-Slot E2E Hard Cutover

Date: 2026-02-27  
Status: evidence captured for `E07` through `E10` (platform gates complete; external live-data credentials pending)

## 1) Hosted Environment

1. Frontdoor host: Hetzner `46.225.118.74`
2. Service: `spike-frontdoor.service` (active)
3. Canonical domain: `https://frontdoor.nexushub.sh`
4. Validation workspace: `tenant-tnapathy-gmail-com-1a51e3ec`

## 2) E07 Tenant App Deployment Correctness

### 2.1 Hosted endpoint checks

1. `GET https://frontdoor.nexushub.sh/health` -> `{"ok":true,...}`
2. `GET https://frontdoor.nexushub.sh/api/products` -> includes `glowbot`, `spike`
3. Authenticated `GET /runtime/api/apps?workspace_id=tenant-tnapathy-gmail-com-1a51e3ec` -> includes:
   - `glowbot`
   - `kind: "proxy"`
   - `entry_path: "/app/glowbot/"`

### 2.2 Launch identity smoke

Command:

```bash
GLOWBOT_SMOKE_FRONTDOOR_ORIGIN='https://frontdoor.nexushub.sh' \
GLOWBOT_SMOKE_WORKSPACE_ID='tenant-tnapathy-gmail-com-1a51e3ec' \
GLOWBOT_SMOKE_SESSION_COOKIE='<session>' \
node /Users/tyler/nexus/home/projects/nexus/apps/glowbot/scripts/glowbot-frontdoor-launch-identity-smoke.mjs
```

Result:

1. `ok: true`
2. `launch_url: /app/glowbot/?workspace_id=...`
3. `matched_markers` contains GlowBot business markers
4. No Control markers detected

## 3) E08 UX Resilience + Diagnostics

Code changes:

1. `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor-web/app.js`
2. `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor-web/test/e2e-server.js`
3. `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor-web/test/e2e/shell.spec.js`

Added/validated scenarios:

1. No workspace + provisioning in progress
2. Workspace with no launchable app
3. Runtime unhealthy
4. Explicit blocker shown before launch click (no silent button reset)

Validation commands:

```bash
cd /Users/tyler/nexus/home/projects/nexus/nexus-frontdoor-web
pnpm -s lint
pnpm -s test
pnpm -s test:e2e
```

Result:

1. Unit/route tests: `22 passed`
2. Playwright e2e tests: `9 passed`

## 4) E09 Migration/Backfill

Implemented:

1. Script: `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/scripts/backfill-product-mappings.mjs`
2. Tests: `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/src/backfill-product-mappings.test.ts`
3. Package scripts:
   - `migrate:product-mappings:dry-run`
   - `migrate:product-mappings`

Behavior:

1. Dry-run by default
2. Repairs stale `user_id + product_id -> tenant_id` rows when tenant is missing but user has default workspace
3. Backfills `frontdoor_workspaces.product_id` only when deterministic
4. Reports unresolved ambiguous cases

Validation:

```bash
cd /Users/tyler/nexus/home/projects/nexus/nexus-frontdoor
pnpm -s lint
pnpm -s test
```

Result: `47 passed`

Hosted run:

```bash
sudo -u spike node /opt/spike/frontdoor/scripts/backfill-product-mappings.mjs \
  --workspace-db /var/lib/spike-frontdoor/frontdoor-workspaces.db \
  --autoprovision-db /var/lib/spike-frontdoor/frontdoor-autoprovision.db
```

Hosted result:

1. `ok: true`
2. `mode: dry-run`
3. `action_counts: {}`
4. `applied_actions: 0`

Apply mode returned the same (`applied_actions: 0`), confirming no pending legacy repairs on current hosted data.

## 5) E10 Production E2E Certification (Platform)

### 5.1 Root-cause fix captured

Issue discovered during smoke:

1. Tenant runtime process had `NEXUS_DISABLE_NEX_ADAPTERS=1`
2. This forced `nex_runtime_unavailable` for runtime methods/health in diagnostics path

Fix:

1. Restarted tenant runtime without `NEXUS_DISABLE_NEX_ADAPTERS`
2. Verified runtime process env no longer includes this flag
3. Verified `http://127.0.0.1:32003/health` returns `status: "healthy"`
4. Added provisioner guard in `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/scripts/provision-tenant-local.mjs` so `FRONTDOOR_TENANT_DISABLE_NEX_ADAPTERS=1` fails unless explicit override (`FRONTDOOR_TENANT_ALLOW_DISABLED_NEX_ADAPTERS=1`) is provided.

### 5.2 Hosted smokes

1. Frontdoor launch smoke:

```bash
FRONTDOOR_SMOKE_ORIGIN='https://frontdoor.nexushub.sh' \
FRONTDOOR_SMOKE_WORKSPACE_ID='tenant-tnapathy-gmail-com-1a51e3ec' \
FRONTDOOR_SMOKE_SESSION_COOKIE='<session>' \
FRONTDOOR_SMOKE_APP_ID='glowbot' \
node /Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/scripts/frontdoor-launch-smoke.mjs
```

Result:

1. `ok: true`
2. `launch_ready: true`
3. `runtime_status: healthy`
4. `launch_status: 200`

2. GlowBot production smoke:

```bash
GLOWBOT_SMOKE_SHELL_ORIGIN='https://frontdoor.nexushub.sh' \
GLOWBOT_SMOKE_FRONTDOOR_ORIGIN='https://frontdoor.nexushub.sh' \
GLOWBOT_SMOKE_APP_ORIGIN='https://glowbot-demo.vercel.app' \
GLOWBOT_SMOKE_WORKSPACE_ID='tenant-tnapathy-gmail-com-1a51e3ec' \
GLOWBOT_SMOKE_SESSION_COOKIE='<session>' \
node /Users/tyler/nexus/home/projects/nexus/apps/glowbot/scripts/glowbot-production-smoke.mjs
```

Result:

1. `ok: true`
2. `launch_status: 200`
3. Session/diagnostics/runtime apps resolved through canonical frontdoor endpoints

## 6) Remaining External Gate

`L7/L9` final live-data proof remains blocked on external credentials/contracts:

1. `GLOWBOT_SMOKE_HUB_API_KEY` not available in current environment
2. Partner adapter credentials for full connect -> backfill -> live monitoring -> normalized-metrics proof are pending

Platform path is now ready for manual owner walkthrough as soon as those credentials are available.

## 7) E12 One-Server Multi-App Cutover (2026-02-28 update)

### 7.1 Local contract + integration evidence

Touched implementation:

1. `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/src/server.ts`
2. `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/src/server.test.ts`
3. `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/scripts/provision-tenant-local.mjs`
4. `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/public/index.html`

Hard-cutover behavior now validated:

1. Shell exposes explicit split actions: `Install app on selected server` vs `Create another server + install app`.
2. `POST /api/servers/:serverId/apps/:appId/install` uses runtime-truth install orchestration (`installing -> installed|failed`) with persisted `last_error`.
3. `POST /api/apps/:appId/purchase` with `server_id + install=true` now uses the same runtime-truth orchestration path (no DB-only false install).
4. Canonical app identity no longer aliases `spike-runtime -> spike` for launch readiness.

Validation commands:

```bash
cd /Users/tyler/nexus/home/projects/nexus/nexus-frontdoor
pnpm -s lint
pnpm -s test
```

Result:

1. `57 passed`

Additional shell/proxy test surface:

```bash
cd /Users/tyler/nexus/home/projects/nexus/nexus-frontdoor-web
pnpm -s lint
pnpm -s test
```

Result:

1. `22 passed`

Provisioner smoke (with explicit proxy base env in this local run):

```bash
cd /Users/tyler/nexus/home/projects/nexus/nexus-frontdoor
FRONTDOOR_TENANT_SPIKE_PROXY_BASE_URL='https://spike.fyi' \
FRONTDOOR_TENANT_GLOWBOT_PROXY_BASE_URL='https://glowbot.app' \
node ./scripts/provisioner-smoke.mjs
```

Result:

1. `ok: true`
2. Both `glowbot` and `spike` dry-run payloads returned valid runtime descriptors.

### 7.2 Hosted public API checks completed

1. `GET https://frontdoor.nexushub.sh/health` -> `ok:true`
2. `GET https://frontdoor.nexushub.sh/api/products` -> includes `glowbot`, `spike`
3. `GET https://frontdoor.nexushub.sh/api/apps/catalog` -> includes `glowbot`, `spike`
4. `GET https://frontdoor.nexushub.sh/api/auth/session` (no cookie) -> `authenticated:false`

### 7.3 Remaining hosted certification blocker

Final E12 hosted same-server dual-app proof is pending because this environment does not currently hold an authenticated production session/cookie to execute:

1. install `glowbot` and `spike` on one existing server in production,
2. capture `/api/servers` + `/api/servers/:id/apps` + `/runtime/api/apps` authenticated snapshots,
3. capture browser launch proof for both apps from the same server.

Prepared cert command (ready to run once session cookie is provided):

```bash
FRONTDOOR_SMOKE_ORIGIN='https://frontdoor.nexushub.sh' \
FRONTDOOR_SMOKE_SESSION_COOKIE='<session>' \
node /Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/scripts/frontdoor-one-server-dual-app-smoke.mjs
```
