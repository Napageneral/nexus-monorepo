# Workplan: App Installation Pipeline

**Date:** 2026-03-04
**Status:** NOT STARTED
**Spec:** `docs/specs/APP_INSTALLATION_PIPELINE_2026-03-04.md`
**Depends on:** Cloud Provisioning (completed), Runtime App Management API (exists)
**Approach:** HARD CUTOVER — no backwards compatibility, no parallel legacy paths

---

## Objective

Delete the legacy config injection pattern and replace it with HTTP API-based app installation: SCP app tarballs to tenant VPSes via private network, then call the runtime's native `POST /api/apps/install` endpoint. Hard cutover — config injection code is deleted, not deprecated.

After this workplan is complete:
- GlowBot can be installed on any tenant VPS via API
- Apps auto-install when a VPS finishes provisioning
- Dashboard shows installed apps per server
- All config injection code is deleted (not deprecated, not feature-flagged — gone)

---

## Current State Analysis

### What EXISTS Today

| Component | Status | Location |
|-----------|--------|----------|
| `ensureRuntimeAppInstalled()` | Legacy config injection | `server.ts:2349` |
| `attachRuntimeAppOnServer()` | Writes config.json + restarts runtime | `server.ts:1724` |
| `resolveManagedRuntimeAppConfig()` | Hardcoded env-var-based config per app | `server.ts:1468` |
| `frontdoor_server_app_installs` table | Exists with status tracking | `frontdoor-store.ts:497` |
| `frontdoor_app_subscriptions` table | Exists with entitlement data | `frontdoor-store.ts:462` |
| `upsertServerAppInstall()` | Store method exists | `frontdoor-store.ts:2435` |
| `getAppSubscriptionsForAccount()` | Store method exists | `frontdoor-store.ts` |
| Provision callback handler | Exists but no auto-install | `server.ts:5299` |
| `appsToInstall` in cloud-init | Already queries entitled apps | `server.ts:5253-5274` |
| Runtime `POST /api/apps/install` | Fully implemented | `nex/src/apps/management-api.ts:172` |
| Runtime `POST /api/apps/uninstall` | Fully implemented | `nex/src/apps/management-api.ts:335` |
| Runtime `POST /api/apps/upgrade` | Fully implemented | `nex/src/apps/management-api.ts:429` |
| GlowBot consumer package | Complete with manifest + dist | `apps/glowbot/consumer/` |
| SSH key on VPSes | `nexus-operator` key deployed via Hetzner | `cloud-provider.ts:172` |

### What's MISSING

| Gap | Description | Complexity |
|-----|-------------|------------|
| SSH/SCP library | No `ssh2` or equivalent in package.json | Small |
| SSH helper functions | Connect, SCP file, exec command on VPS | Medium |
| App package storage | No `/opt/nexus/frontdoor/apps/` directory or management | Medium |
| Tarball packaging | No script to create GlowBot `.tar.gz` | Small |
| Install API route | No `POST /api/servers/{id}/apps/{appId}/install` | Medium |
| Uninstall API route | No `POST /api/servers/{id}/apps/{appId}/uninstall` | Small |
| Upgrade API route | No `POST /api/servers/{id}/apps/{appId}/upgrade` | Small |
| Auto-install on provision callback | Callback handler doesn't install apps | Medium |
| Config injection removal | Legacy code still present | Small |
| App catalog enhancement | `/api/apps/catalog` returns products, not app packages | Small |

---

## Implementation Phases

### Phase 1: SSH Infrastructure & Package Storage

**Goal:** Add SSH/SCP capability and set up app tarball storage.

#### 1.1 Add ssh2 dependency

```bash
cd nexus-frontdoor && pnpm add ssh2 && pnpm add -D @types/ssh2
```

- **File:** `package.json`
- **Change:** Add `ssh2` to dependencies

#### 1.2 Create SSH helper module

- **File:** NEW `src/ssh-helper.ts`
- **Functions:**
  ```typescript
  export async function connectToVPS(opts: {
    host: string;       // Private IP (10.0.0.x)
    privateKeyPath: string;
    username?: string;   // default: "root"
    port?: number;       // default: 22
    timeoutMs?: number;  // default: 10000
  }): Promise<ssh2.Client>;

  export async function scpFile(opts: {
    client: ssh2.Client;
    localPath: string;
    remotePath: string;
  }): Promise<void>;

  export async function execCommand(opts: {
    client: ssh2.Client;
    command: string;
    timeoutMs?: number;  // default: 30000
  }): Promise<{ stdout: string; stderr: string; code: number }>;
  ```

#### 1.3 Add SSH key path configuration

- **File:** `src/config.ts`
- **Change:** Add `FRONTDOOR_VPS_SSH_KEY_PATH` env var (default: `/root/.ssh/nexus-operator`)
- **File:** `config/frontdoor.config.json`
- **Change:** Add `vpsAccess.sshKeyPath` field

#### 1.4 Create GlowBot tarball packaging script

- **File:** NEW `scripts/package-app.sh`
- **Usage:** `./scripts/package-app.sh glowbot /path/to/consumer /opt/nexus/frontdoor/apps/glowbot/1.0.0/`
- **Steps:**
  1. `cd /path/to/consumer`
  2. `tar -czf pkg.tar.gz app.nexus.json methods/ hooks/ dist/ pipeline/ assets/ shared/`
  3. Copy to storage dir
  4. Extract and cache `manifest.json`

#### 1.5 Set up app storage directory on frontdoor-1

```bash
ssh root@178.104.21.207 "mkdir -p /opt/nexus/frontdoor/apps/glowbot/1.0.0"
```

- Deploy GlowBot tarball to frontdoor server

**Validation:**
- [ ] `ssh2` installed and TypeScript types work
- [ ] SSH helper can connect to a tenant VPS via private IP
- [ ] SCP can transfer a file to VPS
- [ ] GlowBot tarball exists at `/opt/nexus/frontdoor/apps/glowbot/1.0.0/pkg.tar.gz`

---

### Phase 2: App Installation API

**Goal:** Implement the frontdoor-side installation flow that replaces config injection.

#### 2.1 Implement `installAppOnServer()` core function

- **File:** `src/server.ts`
- **Location:** Replace `attachRuntimeAppOnServer()` (line 1724)
- **New function:**
  ```typescript
  async function installAppOnServer(params: {
    serverId: string;
    appId: string;
    version?: string;  // default: "latest"
    accountId: string;
  }): Promise<{ ok: true; version: string } | { ok: false; error: string; detail?: string }> {
    // 1. Check entitlement
    const subscription = store.getAppSubscription(params.accountId, params.appId);
    if (!subscription || subscription.status !== "active") {
      return { ok: false, error: "not_entitled" };
    }

    // 2. Check duplicate install
    const existing = store.getServerAppInstall(params.serverId, params.appId);
    if (existing?.status === "installed") {
      return { ok: false, error: "already_installed" };
    }

    // 3. Mark as installing
    store.upsertServerAppInstall({
      serverId: params.serverId,
      appId: params.appId,
      status: "installing",
      version: params.version ?? "latest",
      source: "api",
    });

    // 4. Resolve server + package paths
    const server = store.getServer(params.serverId);
    const packagePath = `/opt/nexus/frontdoor/apps/${params.appId}/${params.version ?? "latest"}/pkg.tar.gz`;

    // 5. SCP tarball to VPS
    const ssh = await connectToVPS({ host: server.privateIp, privateKeyPath: config.vpsAccess.sshKeyPath });
    await execCommand({ client: ssh, command: `mkdir -p /opt/nex/apps/${params.appId}` });
    await scpFile({ client: ssh, localPath: packagePath, remotePath: `/tmp/${params.appId}.tar.gz` });
    await execCommand({ client: ssh, command: `tar -xzf /tmp/${params.appId}.tar.gz -C /opt/nex/apps/${params.appId}` });
    await execCommand({ client: ssh, command: `rm /tmp/${params.appId}.tar.gz` });
    ssh.end();

    // 6. Call runtime install API
    const runtimeUrl = `http://${server.privateIp}:${server.runtimePort}`;
    const installRes = await fetch(`${runtimeUrl}/api/apps/install`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${server.runtimeAuthToken}`,
      },
      body: JSON.stringify({ appId: params.appId, packageRef: `/opt/nex/apps/${params.appId}` }),
    });

    // 7. Update status
    if (installRes.ok) {
      store.upsertServerAppInstall({ serverId: params.serverId, appId: params.appId, status: "installed", version: params.version ?? "latest", source: "api" });
      return { ok: true, version: params.version ?? "latest" };
    } else {
      const errBody = await installRes.text();
      store.upsertServerAppInstall({ serverId: params.serverId, appId: params.appId, status: "failed", lastError: errBody, source: "api" });
      return { ok: false, error: "runtime_install_failed", detail: errBody };
    }
  }
  ```

#### 2.2 Add `POST /api/servers/{serverId}/apps/{appId}/install` route

- **File:** `src/server.ts`
- **Location:** Near existing server API routes (around line 3700)
- **Auth:** Requires session with server access
- **Body:** `{ version?: string }`
- **Calls:** `installAppOnServer()`

#### 2.3 Add `POST /api/servers/{serverId}/apps/{appId}/uninstall` route

- **File:** `src/server.ts`
- **Flow:**
  1. Verify server ownership
  2. Call runtime `POST /api/apps/uninstall` via private network
  3. Optionally SSH to remove package files
  4. Update `frontdoor_server_app_installs` status

#### 2.4 Add `POST /api/servers/{serverId}/apps/{appId}/upgrade` route

- **File:** `src/server.ts`
- **Flow:**
  1. Verify server ownership + entitlement
  2. SCP new version tarball
  3. Call runtime `POST /api/apps/upgrade`
  4. Update version in database

#### 2.5 Add `GET /api/apps/{appId}/package` route (internal)

- **File:** `src/server.ts`
- **Access:** Internal only (private network or internal token)
- **Response:** Stream tarball file with content-type `application/gzip`

**Validation:**
- [ ] `POST .../install` installs GlowBot on a running VPS
- [ ] App appears in runtime's `GET /api/apps` after install
- [ ] `POST .../uninstall` removes app from runtime
- [ ] Entitlement check blocks install without active subscription
- [ ] Duplicate install returns `already_installed` error

---

### Phase 3: Auto-Install on Provisioning

**Goal:** When a VPS phones home after provisioning, automatically install entitled apps.

#### 3.1 Modify provision callback handler

- **File:** `src/server.ts`
- **Location:** Line 5299 (provision-callback handler)
- **After** updating server status to "running" and adding routing table entry:
  ```typescript
  // After sendJson(res, 200, { ok: true }):
  // Trigger auto-install (async, don't block callback response)
  setImmediate(async () => {
    try {
      const server = store.getServer(cbServer.serverId);
      if (!server?.accountId) return;

      const subs = store.getAppSubscriptionsForAccount(server.accountId);
      const appsToInstall = subs
        .filter(s => s.status === "active")
        .map(s => s.appId);

      for (const appId of appsToInstall) {
        console.log(`[auto-install] Installing ${appId} on ${cbServer.serverId}...`);
        const result = await installAppOnServer({
          serverId: cbServer.serverId,
          appId,
          accountId: server.accountId,
        });
        if (result.ok) {
          console.log(`[auto-install] ${appId} installed successfully on ${cbServer.serverId}`);
        } else {
          console.error(`[auto-install] Failed to install ${appId} on ${cbServer.serverId}: ${result.error}`);
        }
      }
    } catch (err) {
      console.error(`[auto-install] Error during auto-install on ${cbServer.serverId}:`, err);
    }
  });
  ```

#### 3.2 Remove `appsToInstall` from cloud-init script

- **File:** `src/cloud-provider.ts` → `renderCloudInitScript()`
- **Change:** Remove `appsToInstall` parameter — apps are installed by frontdoor after phone-home, not by cloud-init
- **File:** `src/server.ts` line 5253
- **Change:** Remove the entitled-apps query before `renderCloudInitScript` call

#### 3.3 Update bootstrap script expectation

- **File:** Golden snapshot's `/opt/nex/bootstrap.sh`
- **Verify:** Bootstrap only needs to start runtime and phone home — it should NOT try to install apps
- **Note:** If bootstrap currently reads `appsToInstall` from `tenant.json`, remove that logic

**Validation:**
- [ ] Create new server via dashboard
- [ ] VPS provisions, phones home
- [ ] GlowBot auto-installs without manual intervention
- [ ] GlowBot accessible at `t-{tenantId}.nexushub.sh/app/glowbot/`
- [ ] Dashboard shows app as "installed" on server
- [ ] Failed auto-install logged but doesn't crash frontdoor

---

### Phase 4: Delete Config Injection Code (Same Deploy as Phases 2-3)

**Goal:** Delete all config injection code. This is NOT a separate step — it ships in the same deploy as the new install flow. Hard cutover, no coexistence period.

#### 4.1 Delete `attachRuntimeAppOnServer()`

- **File:** `src/server.ts`
- **Lines:** 1724-1771
- **Action:** Delete entire function

#### 4.2 Delete `resolveManagedRuntimeAppConfig()`

- **File:** `src/server.ts`
- **Lines:** 1468-1600+
- **Action:** Delete entire function (hardcoded app configs for glowbot/spike)

#### 4.3 Refactor `ensureRuntimeAppInstalled()`

- **File:** `src/server.ts`
- **Lines:** 2349-2530+
- **Action:** Replace with thin wrapper around `installAppOnServer()`
- **Key change:** Remove the `attachRuntimeAppOnServer` call path, use HTTP API instead

#### 4.4 Update all call sites of `ensureRuntimeAppInstalled()`

Found at:
- Line 1967 (server startup recovery)
- Line 3142, 3153 (purchase flow)
- Line 3465 (manual install)
- Line 3956 (app launch)
- Line 4262 (proxy handler)
- Line 5921, 5947 (billing webhook)

**Each call site** should be reviewed:
- Some can be replaced with `installAppOnServer()`
- Some (like proxy handler line 4262) should just check install status, not trigger installs

#### 4.5 Remove legacy environment variables

- **File:** `src/config.ts`
- **Remove:** `FRONTDOOR_MANAGED_APP_*` environment variables used by `resolveManagedRuntimeAppConfig`

#### 4.6 Clean up `restartTenantRuntimeForServer()`

- **File:** `src/server.ts`
- **Check:** If this function is no longer needed (only used by config injection), delete it

**Validation:**
- [ ] No references to `attachRuntimeAppOnServer` remain
- [ ] No references to `resolveManagedRuntimeAppConfig` remain
- [ ] `grep -r "config.json" src/` shows no app-related config.json writes
- [ ] Build passes: `pnpm build`
- [ ] Tests pass: `pnpm test`
- [ ] Fresh server creation + auto-install works end-to-end

---

### Phase 5: Dashboard Integration

**Goal:** Show app installation status in the dashboard and allow manual install/uninstall.

#### 5.1 Enhance `GET /api/servers/{id}` response

- **File:** `src/server.ts`
- **Change:** Include `installedApps` array in server detail response:
  ```json
  {
    "server": {
      "serverId": "srv-xxx",
      "status": "running",
      "installedApps": [
        { "appId": "glowbot", "status": "installed", "version": "1.0.0", "installedAt": "..." }
      ]
    }
  }
  ```

#### 5.2 Enhance `GET /api/apps/catalog` response

- **File:** `src/server.ts` (line 3329)
- **Change:** Include version info and installation status per server:
  ```json
  {
    "apps": [
      {
        "appId": "glowbot",
        "name": "GlowBot",
        "latestVersion": "1.0.0",
        "installedOn": ["srv-xxx"]
      }
    ]
  }
  ```

#### 5.3 Dashboard UI changes

- **Note:** Dashboard changes are out of scope for this workplan — the API changes enable future dashboard work

**Validation:**
- [ ] `GET /api/servers/{id}` includes installed apps
- [ ] `GET /api/apps/catalog` includes version and install status

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| SSH connection failures | Retry with exponential backoff (3 attempts, 2/4/8 second delays) |
| Tarball corruption | Validate tarball size before SCP, verify extraction exit code |
| Runtime install API timeout | 30-second timeout, mark as "failed" and allow retry |
| Concurrent installs on same server | Use `installing` status as lock — reject if already installing |
| SSH key not available on frontdoor | Verify key exists at startup, log warning if missing |
| Large tarballs slow SCP | GlowBot consumer is ~10MB — acceptable over private network |

---

## Testing Checklist

- [ ] Unit test: SSH helper functions (mock ssh2 client)
- [ ] Unit test: `installAppOnServer` with mocked SSH and fetch
- [ ] Integration test: Create server → auto-install → verify app accessible
- [ ] Integration test: Manual install via API token
- [ ] Integration test: Uninstall → reinstall cycle
- [ ] Integration test: Entitlement check blocks unauthorized install
- [ ] E2E: Full flow — create server → GlowBot auto-installs → accessible at subdomain → uninstall → 404

---

## Estimated Effort

| Phase | Effort | Description |
|-------|--------|-------------|
| Phase 1: SSH + Package Storage | 2-3 hours | Library setup, helper functions, tarball creation |
| Phase 2: Install API | 3-4 hours | Core install function, API routes, error handling |
| Phase 3: Auto-Install | 1-2 hours | Provision callback modification, testing |
| Phase 4: Legacy Removal | 2-3 hours | Delete config injection, refactor call sites |
| Phase 5: Dashboard APIs | 1 hour | Enhance existing endpoint responses |
| **Total** | **9-13 hours** | |

---

## Changelog

- 2026-03-04: Initial workplan created from gap analysis
