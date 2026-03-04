# Phase 3: Provisioning Flow Rewrite

**Status:** NOT STARTED
**Last Updated:** 2026-03-04
**Depends On:** Phase 1 (schema), Phase 2 (cloud provider)
**Enables:** Phase 4 (routing — needs running VPSes to route to)
**Specs:** [CLOUD_PROVISIONING_ARCHITECTURE §7, §8](../specs/CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md)

---

## Goal

Replace the local provisioning system with real Hetzner Cloud VPS provisioning. When a user creates a server, a real Hetzner VPS is spun up, bootstraps the nex runtime, and phones home to frontdoor.

---

## Current State

- `POST /api/entry/execute` triggers auto-provisioning via `tenant-autoprovision.ts`
- `tenant-autoprovision.ts` runs `provision-tenant-local.mjs` as a shell command
- `provision-tenant-local.mjs` spawns a local nex runtime process, allocates ports from 32000+
- Everything runs on the same VPS — no cloud API calls
- Blocking: the entry/execute handler blocks until provisioning completes (or times out at 90s)

---

## Tasks

### 3.1 — Add `POST /api/servers/create` endpoint

**File:** `src/server.ts`

New endpoint that replaces the old entry/execute provisioning path:

```typescript
// POST /api/servers/create
// Body: { display_name?: string, plan?: string }
// Returns: { ok: true, server_id, tenant_id, status: "provisioning" }

1. Validate session, resolve account
2. Generate identifiers:
   - server_id: `srv-${randomId()}`
   - tenant_id: `t-${randomId()}`
   - provision_token: `prov-${crypto.randomBytes(32).toString('hex')}`
   - runtime_auth_token: `rt-${crypto.randomBytes(32).toString('hex')}`
   - generated_name: randomFriendlyName() (e.g., "Coral Meadow")
3. Determine plan: body.plan || 'cax11'
4. Determine display_name: body.display_name || generated_name
5. Create server record in DB:
   store.createServer({
     serverId, accountId, tenantId, displayName, generatedName,
     plan, provider: 'hetzner', provisionToken, runtimeAuthToken
   })
6. Determine apps to install: user's entitled apps
7. Render cloud-init script:
   renderCloudInitScript({ tenantId, serverId, authToken: runtimeAuthToken,
     provisionToken, frontdoorUrl, appsToInstall })
8. Call cloud provider (non-blocking):
   const result = await cloudProvider.createServer({
     tenantId, plan, userData: cloudInitScript,
     networkId, firewallId, sshKeyIds,
     labels: { "server-id": serverId }
   })
9. Update server record with provider result:
   store.updateServer(serverId, {
     providerServerId: result.providerServerId,
     privateIp: result.privateIp,
     publicIp: result.publicIp,
   })
10. Return: { ok: true, server_id: serverId, tenant_id: tenantId, status: "provisioning" }
```

**Key design decision:** The createServer call to Hetzner API returns quickly (~2-5 seconds) with the server ID and IPs. The VPS then takes 30-60 seconds to boot from snapshot. We return to the frontend immediately after step 9 — the frontend polls for status updates.

### 3.2 — Add provision callback endpoint

**File:** `src/server.ts`

```typescript
// POST /api/internal/provision-callback
// Authorization: Bearer <provision_token>
// Body: { tenant_id, server_id, status, private_ip, runtime_port }

1. Extract provision_token from Authorization header
2. Look up server: store.getServerByProvisionToken(provisionToken)
3. If not found → 401 { error: "invalid_provision_token" }
4. If server.status !== "provisioning" → 409 { error: "server_not_provisioning" }
5. Validate tenant_id and server_id match the record
6. Update server record:
   store.updateServer(serverId, {
     status: "running",
     privateIp: body.private_ip,   // may update from initial assignment
     runtimePort: body.runtime_port,
     provisionToken: null,          // invalidate — one-time use
   })
7. Add to routing table:
   routingTable.set(server.tenantId, {
     tenantId: server.tenantId,
     serverId: server.serverId,
     privateIp: body.private_ip,
     runtimePort: body.runtime_port,
     status: "running",
   })
8. Return { ok: true }
```

**Security:** This endpoint is called by the VPS over the public internet (the VPS's cloud-init calls the frontdoor URL). The provision token is the authentication — it's a 256-bit random secret that only the VPS knows (delivered via cloud-init user-data, which Hetzner encrypts at rest).

### 3.3 — Add provisioning timeout handler

**File:** `src/server.ts` (run in startup)

```typescript
// Every 30 seconds, check for stuck provisioning
setInterval(async () => {
  const timeoutMs = Number(process.env.PROVISION_TIMEOUT_MS) || 300000; // 5 min
  const stuckServers = store.getStuckProvisioningServers(timeoutMs);

  for (const server of stuckServers) {
    console.error(`[provision-timeout] Server ${server.serverId} timed out after ${timeoutMs}ms`);

    // Mark as failed
    store.updateServer(server.serverId, { status: "failed" });

    // Attempt to clean up the VPS
    if (server.providerServerId) {
      try {
        await cloudProvider.destroyServer(server.providerServerId);
        console.log(`[provision-timeout] Cleaned up VPS ${server.providerServerId}`);
      } catch (err) {
        console.error(`[provision-timeout] Failed to clean up VPS ${server.providerServerId}:`, err);
      }
    }
  }
}, 30000);
```

**New store method needed:**
```typescript
getStuckProvisioningServers(timeoutMs: number): ServerRecord[]
// SELECT * FROM frontdoor_servers
// WHERE status = 'provisioning' AND created_at_ms < (now - timeoutMs)
```

### 3.4 — Update server deletion handler

**File:** `src/server.ts`

Replace the current soft-delete-only handler:

```typescript
// DELETE /api/servers/:id
1. Validate session, admin access
2. Remove from routing table immediately:
   routingTable.delete(server.tenantId)
3. Set status → "deprovisioning":
   store.updateServer(serverId, { status: "deprovisioning" })
4. Destroy cloud VPS:
   if (server.providerServerId) {
     await cloudProvider.destroyServer(server.providerServerId)
   }
5. Set final status:
   store.updateServer(serverId, { status: "deleted", deletedAtMs: Date.now() })
6. Reset app install records:
   // Mark all installs as not_installed for this server
7. Return { ok: true }
```

### 3.5 — Update auto-provisioning trigger

**File:** `src/tenant-autoprovision.ts`

The OIDC auto-provisioning flow currently runs the local script. Update to:

1. Remove the shell command execution (`execProvisionCommand`)
2. Instead, call the same logic as `POST /api/servers/create` internally:
   - Generate identifiers
   - Create server record
   - Call cloud provider
   - Return immediately (non-blocking)
3. The OIDC callback flow should:
   - Create user + account (existing)
   - Create server via cloud provider (new)
   - Create session and redirect to dashboard (existing)
   - Dashboard shows provisioning progress (frontend polling)

### 3.6 — Update GET /api/servers

```typescript
// GET /api/servers
// Returns: servers for the user, excluding deleted ones

const servers = store.getActiveServersForUser(session.principal.userId);
// getActiveServersForUser filters: status NOT IN ('deleted')
// Include 'provisioning', 'running', 'failed', 'deprovisioning' — they all show in UI
```

### 3.7 — Add GET /api/plans endpoint

```typescript
// GET /api/plans
// Returns: available server plans with pricing
// No auth required — public endpoint for store/pricing page

const plans = cloudProvider.listPlans();
sendJson(res, 200, { plans });
```

### 3.8 — Update server status polling

The frontend needs a way to poll for provisioning status:

```typescript
// GET /api/servers/:id
// Already exists — ensure it returns current status including "provisioning", "failed"
// Frontend polls this every 3 seconds during provisioning
```

---

## Verification

- [ ] `POST /api/servers/create` → creates Hetzner VPS, returns immediately
- [ ] VPS boots from snapshot, runs cloud-init, phones home
- [ ] `POST /api/internal/provision-callback` → updates server to "running", adds to routing table
- [ ] Frontend can poll status: provisioning → running
- [ ] Provisioning timeout: VPS destroyed after 5 min if no callback
- [ ] `DELETE /api/servers/:id` → calls Hetzner API to destroy VPS
- [ ] Auto-provisioning (OIDC flow) uses cloud provider instead of local script
- [ ] `GET /api/plans` returns plan list
