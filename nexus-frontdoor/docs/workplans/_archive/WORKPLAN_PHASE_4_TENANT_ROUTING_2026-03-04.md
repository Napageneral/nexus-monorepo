# Phase 4: Tenant Subdomain Routing

**Status:** NOT STARTED
**Last Updated:** 2026-03-04
**Depends On:** Phase 3 (provisioning flow — need running VPSes with private IPs)
**Enables:** Phase 5 (API tokens — used in subdomain auth), Phase 6 (UI — subdomain URLs for users)
**Specs:** [TENANT_NETWORKING_AND_ROUTING §5, §6, §8](../specs/TENANT_NETWORKING_AND_ROUTING_2026-03-04.md)

---

## Goal

Route tenant subdomain requests (`t-xyz.nexushub.sh`) to the correct tenant VPS via the Hetzner Cloud Network. Support both the new subdomain-based routing and existing path-based routing (for dashboard compatibility).

---

## Current State

- All routing is **path-based**: `/app/<appId>/` and `/runtime/*` on `frontdoor.nexushub.sh`
- Tenant resolved from user's session → selected server → `config.tenants[tenantId].runtimeUrl`
- `config.tenants` is an in-memory map loaded from config file + populated by provisioning
- Proxy uses `http-proxy` library
- WebSocket upgrade handler exists and works

---

## Tasks

### 4.1 — Build in-memory routing table

**File:** `src/server.ts` (or new `src/routing-table.ts`)

```typescript
interface TenantRoute {
  tenantId: string;
  serverId: string;
  privateIp: string;
  runtimePort: number;
  runtimeAuthToken: string | null;
  status: "running" | "stopping";
}

// Global routing table
const routingTable = new Map<string, TenantRoute>();

// Initialize on startup
function initRoutingTable(store: FrontdoorStore): void {
  const servers = store.getRunningServers();
  for (const server of servers) {
    if (server.privateIp && server.runtimePort) {
      routingTable.set(server.tenantId, {
        tenantId: server.tenantId,
        serverId: server.serverId,
        privateIp: server.privateIp,
        runtimePort: server.runtimePort,
        runtimeAuthToken: server.runtimeAuthToken,
        status: "running",
      });
    }
  }
  console.log(`[routing] Initialized ${routingTable.size} tenant routes`);
}
```

Called during server startup, after DB is initialized.

### 4.2 — Add subdomain extraction

**File:** `src/server.ts`

At the top of the main request handler, before any route matching:

```typescript
function extractTenantId(host: string | undefined): string | null {
  if (!host) return null;
  // Strip port if present
  const hostname = host.split(":")[0];
  // Match t-<id>.nexushub.sh
  const match = hostname.match(/^(t-[a-z0-9-]+)\.nexushub\.sh$/);
  return match ? match[1] : null;
}

// In the request handler:
const tenantId = extractTenantId(req.headers.host);
if (tenantId) {
  return handleTenantRequest(req, res, tenantId);
}
// ... existing platform request handling continues
```

### 4.3 — Implement tenant request handler

**File:** `src/server.ts`

```typescript
async function handleTenantRequest(
  req: IncomingMessage,
  res: ServerResponse,
  tenantId: string
): Promise<void> {
  // 1. Look up route
  const route = routingTable.get(tenantId);
  if (!route || route.status !== "running") {
    sendJson(res, 503, {
      error: "server_not_available",
      message: "This server is not currently running.",
    });
    return;
  }

  // 2. Determine auth tier
  const authResult = await resolveTenantAuth(req, route);

  // 3. Set proxy headers
  const targetUrl = `http://${route.privateIp}:${route.runtimePort}`;

  // 4. Add forwarding headers
  req.headers["x-forwarded-for"] = getClientIp(req);
  req.headers["x-forwarded-proto"] = "https";
  req.headers["x-forwarded-host"] = req.headers.host || "";
  req.headers["x-nexus-tenant-id"] = route.tenantId;
  req.headers["x-nexus-server-id"] = route.serverId;

  // 5. If Tier 1 (platform auth recognized), add identity headers
  if (authResult.tier === 1 && authResult.session) {
    req.headers["x-nexus-user-id"] = authResult.session.userId;
    req.headers["x-nexus-account-id"] = authResult.session.accountId;
    // Add runtime auth token if available
    if (route.runtimeAuthToken) {
      req.headers["authorization"] = `Bearer ${route.runtimeAuthToken}`;
    }
  }
  // If Tier 2, leave Authorization header as-is (pass through to VPS)

  // 6. Proxy the request
  proxy.web(req, res, { target: targetUrl, changeOrigin: true });
}
```

### 4.4 — Implement two-tier auth resolution

Per spec §6:

```typescript
interface TenantAuthResult {
  tier: 1 | 2;
  session?: { userId: string; accountId: string };
}

async function resolveTenantAuth(
  req: IncomingMessage,
  route: TenantRoute
): Promise<TenantAuthResult> {
  // Check 1: Valid frontdoor session cookie?
  const sessionCookie = extractSessionCookie(req);
  if (sessionCookie) {
    const session = await sessionStore.getSession(sessionCookie);
    if (session && !session.expired) {
      return { tier: 1, session: { userId: session.userId, accountId: session.accountId } };
    }
  }

  // Check 2: Platform API token (nex_t_...)?
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer nex_t_")) {
    const token = authHeader.slice(7); // "Bearer " prefix
    const tokenRecord = store.validateApiToken(token);
    if (tokenRecord) {
      store.touchApiToken(tokenRecord.tokenId); // update last_used
      return { tier: 1, session: { userId: tokenRecord.userId, accountId: tokenRecord.accountId } };
    }
    // Invalid platform token → still pass through (VPS might have different validation)
  }

  // Check 3: Any other auth → Tier 2 (pass through)
  // Check 4: No auth → Tier 2 (VPS decides)
  return { tier: 2 };
}
```

### 4.5 — Add WebSocket proxy for tenant subdomains

**File:** `src/server.ts`

Extend the existing `server.on("upgrade")` handler:

```typescript
server.on("upgrade", (req, socket, head) => {
  const tenantId = extractTenantId(req.headers.host);

  if (tenantId) {
    // Tenant subdomain WebSocket
    const route = routingTable.get(tenantId);
    if (!route || route.status !== "running") {
      socket.destroy();
      return;
    }

    const targetUrl = `http://${route.privateIp}:${route.runtimePort}`;

    // Add proxy headers
    req.headers["x-nexus-tenant-id"] = route.tenantId;
    req.headers["x-nexus-server-id"] = route.serverId;

    // Proxy WebSocket
    proxy.ws(req, socket, head, { target: targetUrl, changeOrigin: true });
    return;
  }

  // ... existing path-based WebSocket handling for frontdoor.nexushub.sh
});
```

### 4.6 — Keep existing path-based proxy working

The existing proxy logic for `frontdoor.nexushub.sh/app/*` and `/runtime/*` continues to work:
- User is on the dashboard, has a session, has a selected server
- Frontdoor resolves the selected server from the session
- Looks up the server's private_ip + runtime_port (instead of old runtime_url)
- Proxies via the same `http-proxy` library

**Changes needed:**
- Replace `config.tenants[tenantId].runtimeUrl` lookups with:
  ```typescript
  const server = store.getServer(session.selectedServerId);
  const targetUrl = getServerRuntimeUrl(server);
  ```
- This is part of the Phase 1 cleanup (removing runtime_url references)

### 4.7 — Update session cookie domain

**File:** `src/server.ts` or session config

Change cookie domain from `frontdoor.nexushub.sh` to `.nexushub.sh`:

```typescript
// In session cookie settings:
cookieDomain: ".nexushub.sh"  // leading dot = all subdomains
```

This allows the session cookie to be sent on both:
- `frontdoor.nexushub.sh` (dashboard)
- `t-xyz.nexushub.sh` (tenant subdomain)

So a user who is logged into the dashboard can also be recognized when hitting a tenant subdomain in the browser. This enables Tier 1 auth for browser-based tenant access.

### 4.8 — Handle proxy errors

```typescript
proxy.on("error", (err, req, res) => {
  console.error(`[proxy-error] ${req.headers.host}${req.url}:`, err.message);
  if (res instanceof ServerResponse && !res.headersSent) {
    sendJson(res, 502, {
      error: "proxy_error",
      message: "Failed to reach the server. It may be temporarily unavailable.",
    });
  }
});
```

---

## Long-Term: Subdomain as Primary

The dual routing model (path-based + subdomain-based) is a transitional approach:
- **Now:** Dashboard uses path-based, programmatic access uses subdomain-based
- **Later:** Dashboard can redirect to tenant subdomain after server selection, making subdomain the only routing model
- This is a future UI change, not a backend change

---

## Verification

- [ ] `t-xyz.nexushub.sh/app/spike/` → proxies to tenant VPS over private network
- [ ] `t-xyz.nexushub.sh/runtime/control/ws` → WebSocket proxies to tenant VPS
- [ ] `frontdoor.nexushub.sh/app/spike/` → continues to work (path-based, session-based)
- [ ] Tier 1: session cookie on `.nexushub.sh` → recognized on tenant subdomain
- [ ] Tier 1: `Bearer nex_t_...` token → recognized and validated
- [ ] Tier 2: Unknown auth header → passed through to VPS
- [ ] Tier 2: No auth → request forwarded, VPS decides
- [ ] 503 returned for non-existent or non-running tenants
- [ ] Proxy errors return 502 with helpful message
- [ ] Routing table populated from DB on startup
- [ ] Routing table updated on provision callback (add) and server delete (remove)
