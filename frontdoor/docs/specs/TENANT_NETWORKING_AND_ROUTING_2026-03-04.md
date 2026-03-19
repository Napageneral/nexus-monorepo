# Tenant Networking and Routing

**Status:** CANONICAL
**Last Updated:** 2026-03-06
**Related:** FRONTDOOR_AWS_HOSTING_AND_SERVER_CLASS_MODEL.md, CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md, FRONTDOOR_ARCHITECTURE.md, FRONTDOOR_HOSTED_ACCESS_AND_ROUTING.md, FRONTDOOR_SHELL_AND_EMBEDDED_APP_MODEL.md, CRITICAL_CUSTOMER_FLOWS_2026-03-02.md, `nex/docs/specs/platform/server-lifecycle-and-durability.md`

---

## 1) Overview

Frontdoor is the single entry point for all tenant traffic. It terminates TLS,
resolves the target tenant, and reverse-proxies requests to the tenant runtime
over private provider-backed transport.

**Infrastructure context:**
- Frontdoor backend runs in AWS as the canonical hosted control plane
- `compliant` servers run in AWS and are reached over AWS-private networking
- `standard` servers may run in Hetzner and are reached from AWS frontdoor over
  Tailscale-backed private transport
- provider selection is an internal `server_class` policy, not a user-facing
  cloud-vendor choice

**Core decisions:**
- Wildcard DNS (`*.nexushub.sh`) with all traffic routed through frontdoor
- Wildcard TLS certificate on the frontdoor ingress layer
- provider-private transport for compliant servers and Tailscale-backed private
  transport for Hetzner standard servers
- Two-tier auth: platform auth (frontdoor validates) + app-level auth (VPS validates, frontdoor passes through)
- API tokens for programmatic/MCP access
- WebSocket support for Operator Console and real-time app features
- Custom domains as a future capability (not in v1)

---

## 2) DNS Strategy

### 2.1 Wildcard DNS

A single wildcard DNS record routes all tenant subdomains to frontdoor:

```
*.nexushub.sh    A    <frontdoor-public-ip>
nexushub.sh      A    <frontdoor-public-ip>
```

**How it works:**
- When frontdoor provisions a tenant with ID `t-a3f9c2`, the URL `t-a3f9c2.nexushub.sh` immediately resolves to frontdoor's IP — no DNS record creation needed.
- Frontdoor reads the `Host` header, extracts the tenant ID, looks up the tenant's VPS IP in its routing table, and proxies the request.

**Why wildcard:**
- Zero DNS propagation delay on new tenant creation
- No DNS API calls during provisioning — one less thing to fail
- No DNS cleanup during archive, restore, or final destroy because wildcard routing stays stable
- Single TLS cert to manage
- Simple and deterministic

### 2.2 URL Structure

```
Tenant access:
  https://t-<tenantId>.nexushub.sh/app/<appId>/         — app UI
  https://t-<tenantId>.nexushub.sh/app/<appId>/mcp      — app MCP endpoint
  https://t-<tenantId>.nexushub.sh/runtime/              — Nex runtime API
  https://t-<tenantId>.nexushub.sh/_next/...             — Next.js chunks (app inference from referer)

Platform access:
  https://frontdoor.nexushub.sh/                         — dashboard, auth, billing
  https://frontdoor.nexushub.sh/api/...                  — platform API
  https://nexushub.sh/                                   — landing page / redirect to frontdoor
```

### 2.3 Custom Domains (Future)

When a user wants `api.theircompany.com` for their tenant:

1. User adds custom domain in dashboard settings
2. User creates CNAME: `api.theircompany.com → t-xyz.nexushub.sh`
3. Frontdoor verifies the CNAME exists (DNS lookup)
4. Frontdoor provisions a TLS cert for the custom domain via Let's Encrypt HTTP-01 challenge
5. Frontdoor adds the custom domain to its routing table alongside the subdomain
6. Traffic to `api.theircompany.com` is handled identically to `t-xyz.nexushub.sh`

Not in v1 — adding this later requires only a domain registry table and cert provisioning logic.

---

## 3) TLS Strategy

### 3.1 TLS Terminator

Frontdoor uses one wildcard-capable TLS terminator for:

1. `frontdoor.nexushub.sh`
2. `*.nexushub.sh`
3. future custom domains

The exact ingress implementation may evolve, but the canonical behavior is:

1. TLS terminates at the frontdoor ingress layer
2. frontdoor receives the resolved host and forwards the request to the target
   runtime over private transport
3. customer-facing routing semantics are independent of whether the target
   runtime lives on AWS or Hetzner

### 3.2 TLS Termination Architecture

```
Internet → frontdoor TLS ingress → frontdoor backend (AWS)
                                → AWS private transport → compliant runtime
                                → Tailscale-backed private transport → standard runtime
```

---

## 4) Private Networking

### 4.1 Provider-private transport

Compliant AWS-hosted servers use AWS-private networking from frontdoor to the
runtime.

Standard Hetzner-hosted servers use Tailscale-backed private transport from AWS
frontdoor to the runtime.

The canonical rule is:

1. frontdoor never depends on public runtime ingress for normal hosted routing
2. provider-specific transport may differ beneath the routing contract
3. the customer-facing DNS and path contract stay identical
4. frontdoor persists provider-private addressing separately from transport
   addressing
5. `transport_host` is the address used for runtime HTTP, runtime WS, and
   operator SSH
6. for Hetzner standard servers, `transport_host` is the Tailscale address
7. for compliant AWS servers, `transport_host` is the AWS private address

### 4.2 Firewall Rules (Tenant VPS)

A single Hetzner Cloud Firewall is created once and applied to all tenant VPSes:

```
Inbound rules:
  - Allow TCP from 10.0.0.0/16 (any port) — frontdoor proxy traffic over private network
  - Allow TCP port 22 from 10.0.0.0/16 — SSH from frontdoor only (over private network)
  - Drop all other inbound (including all public internet traffic)

Outbound rules:
  - Allow all — VPS needs to reach package repos, external APIs, etc.
```

Tenant VPSes are NOT directly reachable from the public internet. All traffic must flow through frontdoor via the Cloud Network.

### 4.3 Cross-provider implication

Because frontdoor is AWS-hosted while standard servers may stay in Hetzner,
frontdoor must maintain private transport across providers. The canonical
cross-provider transport for that path is Tailscale.

---

## 5) Reverse Proxy Architecture

### 5.1 Routing Table

Frontdoor maintains an in-memory routing table mapping tenant IDs to VPS endpoints:

```typescript
interface TenantRoute {
  tenantId: string;
  serverId: string;
  transportHost: string;
  runtimePort: number;
  status: "running" | "stopping";
}

// In-memory map, populated from DB on startup,
// updated on provision-callback and server deletion
const routingTable = new Map<string, TenantRoute>();
```

### 5.2 Request Flow

```
1. Inbound request arrives at frontdoor
   Host: t-a3f9c2.nexushub.sh
   Path: /app/spike/mcp
   Authorization: Bearer sk-team-abc123

2. Extract tenant ID from Host header
   tenantId = "t-a3f9c2"

3. Look up route in routing table
   route = routingTable.get("t-a3f9c2")
   → { privateIp: "10.0.1.5", runtimePort: 8080, status: "running" }

4. If no route or status != "running"
   → Return 503 Service Unavailable
   → Body: { error: "server_not_available", message: "This server is not running." }

5. Proxy the request
   Target: http://10.0.1.5:8080/app/spike/mcp
   Forward all headers (including Authorization)
   Forward request body
   Stream response back to client
```

### 5.3 WebSocket Proxying

The proxy must handle WebSocket upgrade requests for:
- Operator Console (runtime API WebSocket)
- App-specific WebSocket connections (e.g., real-time data feeds)

```typescript
// When an Upgrade: websocket header is detected:
// 1. Establish TCP connection to tenant VPS
// 2. Forward the HTTP upgrade request
// 3. Once upgraded, pipe data bidirectionally
// 4. Handle close/error on both sides

// Node.js approach: listen for the 'upgrade' event on the HTTP server
server.on('upgrade', (req, socket, head) => {
  const tenantId = extractTenantId(req.headers.host);
  const route = routingTable.get(tenantId);
  if (!route) {
    socket.destroy();
    return;
  }

  // Create connection to tenant VPS
  const proxySocket = net.connect(route.runtimePort, route.privateIp, () => {
    // Forward the original upgrade request
    proxySocket.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
      Object.entries(req.headers).map(([k,v]) => `${k}: ${v}`).join('\r\n') +
      '\r\n\r\n'
    );
    proxySocket.write(head);
    // Pipe bidirectionally
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
});
```

### 5.4 Frontdoor Shell Boundary

For human launch at `frontdoor.nexushub.sh/app/<appId>/`, frontdoor owns the
top-level browser document and renders app content inside a dedicated
iframe-backed embedded boundary.

The proxy flow for shell-profile HTML responses:
1. Frontdoor renders the shell document
2. The shell loads the tenant app document inside the embedded boundary
3. Shell chrome and platform navigation remain frontdoor-owned

The runtime app document is not mutated via DOM injection. The canonical shell
contract is defined in `FRONTDOOR_SHELL_AND_EMBEDDED_APP_MODEL.md`.

For non-shell traffic such as JS, CSS, images, API calls, and WebSocket
requests, frontdoor proxies the request without shell-specific document
mutation.

### 5.5 Proxy Headers

Frontdoor adds standard proxy headers to forwarded requests:

```
X-Forwarded-For: <client-ip>
X-Forwarded-Proto: https
X-Forwarded-Host: t-a3f9c2.nexushub.sh
X-Nexus-Tenant-Id: t-a3f9c2
X-Nexus-Server-Id: srv-xyz
```

These headers allow the nex runtime to know the original request context. The `X-Nexus-*` headers are trusted because they come from frontdoor over the private network.

---

## 6) Two-Tier Authentication Model

### 6.1 Architecture

Authentication is split into two tiers:

```
┌─────────────────────────────────────────────────┐
│ Tier 1: Platform Auth (Frontdoor validates)      │
│                                                   │
│ - Dashboard access (session cookies)              │
│ - Platform API (server mgmt, billing, installs)  │
│ - Frontdoor-issued API tokens                     │
│                                                   │
│ Frontdoor VALIDATES these credentials and         │
│ proxies with trusted identity headers.            │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Tier 2: App-Level Auth (VPS validates)           │
│                                                   │
│ - MCP connections from local dev tools            │
│ - App API calls from team members                 │
│ - Tokens issued by apps running on the VPS        │
│                                                   │
│ Frontdoor PASSES THROUGH these credentials to    │
│ the VPS. The nex runtime / app validates them.    │
└─────────────────────────────────────────────────┘
```

### 6.2 How Frontdoor Decides Which Tier

When a request hits a tenant subdomain (`t-xyz.nexushub.sh`):

```
1. Does the request have a valid frontdoor session cookie?
   YES → Tier 1. Frontdoor validates session, adds X-Nexus-* headers, proxies.
   NO  → continue

2. Does the request have an Authorization header with a frontdoor API token?
   YES → Tier 1. Frontdoor validates token, adds X-Nexus-* headers, proxies.
   NO  → continue

3. Does the request have any Authorization header (unrecognized by frontdoor)?
   YES → Tier 2. Frontdoor passes through to VPS. VPS validates.
   NO  → continue

4. No credentials at all.
   → Frontdoor still proxies to VPS. VPS can serve public content or return 401.
```

**Key principle:** For tenant subdomain requests, frontdoor always proxies (as long as the tenant is `status: "running"`). It enriches with identity headers if it recognizes the credentials, and passes through if it doesn't. The VPS is the final authority on whether a request is authorized for app-level operations.

### 6.3 Platform Requests (Tier 1)

For `frontdoor.nexushub.sh` (no tenant subdomain), all requests are Tier 1:

- Session cookie validation for browser requests
- API token validation for programmatic requests
- Unauthenticated requests get the auth page or 401

### 6.4 VPS-Issued Tokens (Tier 2)

Apps running on a tenant VPS can issue their own tokens for team access:

**Example: Spike MCP access for a team member**

1. Admin user logs into Spike on their VPS via frontdoor (Tier 1)
2. In Spike admin UI, creates an API token: `sk-team-abc123`
3. Spike stores this token in its own database on the VPS
4. Admin gives `sk-team-abc123` to a team member
5. Team member configures their local MCP client:
   ```json
   {
     "mcpServers": {
       "spike": {
         "url": "https://t-xyz.nexushub.sh/app/spike/mcp",
         "headers": { "Authorization": "Bearer sk-team-abc123" }
       }
     }
   }
   ```
6. MCP client sends request → frontdoor receives it
7. Frontdoor: doesn't recognize `sk-team-abc123` as a platform token
8. Frontdoor: tenant `t-xyz` is running → proxy to VPS
9. VPS/Spike: validates `sk-team-abc123` → serves MCP response

**What frontdoor doesn't need to know:**
- What tokens the VPS has issued
- What permissions those tokens grant
- What apps are validating them
- When tokens are revoked

**What frontdoor does enforce:**
- The tenant VPS must exist and be `status: "running"`
- Traffic flows through frontdoor (rate limiting, logging, circuit breaking)
- TLS is terminated at frontdoor

---

## 7) API Tokens (Platform-Level)

### 7.1 Purpose

Platform API tokens allow programmatic access to frontdoor's APIs:
- Server management (create, delete, list)
- App management (install, uninstall)
- Account management

These are separate from VPS-issued tokens (which are for app-level access).

### 7.2 Token Schema

```sql
CREATE TABLE frontdoor_api_tokens (
  token_id      TEXT PRIMARY KEY,
  token_hash    TEXT NOT NULL,           -- bcrypt hash of the token
  user_id       TEXT NOT NULL REFERENCES frontdoor_users(user_id),
  account_id    TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
  display_name  TEXT NOT NULL,           -- user-chosen name (e.g., "CI/CD Token")
  scopes        TEXT NOT NULL DEFAULT '*',  -- future: comma-separated scopes
  last_used_ms  INTEGER,
  expires_at_ms INTEGER,                 -- null = never expires
  created_at_ms INTEGER NOT NULL,
  revoked_at_ms INTEGER                  -- null = active
);
```

### 7.3 Token API

```
POST /api/tokens/create
  { "display_name": "My CI Token", "expires_in_days": 90 }
  → { "token": "nex_t_abc123...", "token_id": "tok-...", "expires_at": "..." }
  NOTE: full token is only shown once at creation time

GET /api/tokens
  → [{ "token_id": "tok-...", "display_name": "My CI Token", "last_used": "...", "expires_at": "..." }]

DELETE /api/tokens/tok-...
  → { "ok": true }
```

### 7.4 Token Format

```
nex_t_<base64url-encoded-random-32-bytes>

Example: nex_t_8f3a9c2b7d1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f
```

Prefix `nex_t_` makes tokens easily identifiable and scannable (for secret detection tools).

### 7.5 Token Validation

```typescript
// In the request pipeline:
const authHeader = req.headers['authorization'];
if (authHeader?.startsWith('Bearer nex_t_')) {
  // Platform API token — Tier 1
  const token = authHeader.slice(7);
  const tokenRecord = store.validateApiToken(token);
  if (!tokenRecord) {
    return sendJson(res, 401, { error: "invalid_token" });
  }
  // Set session-like context from token
  req.session = { userId: tokenRecord.userId, accountId: tokenRecord.accountId };
  // Continue to handler
}
```

---

## 8) Request Routing Decision Tree

Complete decision tree for every inbound request:

```
Request arrives at frontdoor
  │
  ├─ Host: frontdoor.nexushub.sh (or nexushub.sh)
  │   → Platform request
  │   → Validate session cookie or API token
  │   → Route to platform handlers (dashboard, API, auth)
  │
  ├─ Host: t-<tenantId>.nexushub.sh
  │   → Tenant request
  │   │
  │   ├─ Tenant not found in routing table
  │   │   → 503 { error: "server_not_found" }
  │   │
  │   ├─ Tenant status != "running"
  │   │   → 503 { error: "server_not_available" }
  │   │
  │   ├─ Tenant is running
  │   │   │
  │   │   ├─ Has frontdoor session cookie (valid)?
  │   │   │   → Tier 1: add X-Nexus-* headers, proxy to VPS
  │   │   │
  │   │   ├─ Has Bearer nex_t_... token (valid)?
  │   │   │   → Tier 1: add X-Nexus-* headers, proxy to VPS
  │   │   │
  │   │   ├─ Has other Authorization header?
  │   │   │   → Tier 2: pass through to VPS (VPS validates)
  │   │   │
  │   │   └─ No credentials
  │   │       → Proxy to VPS (VPS decides: public content or 401)
  │   │
  │   └─ WebSocket upgrade?
  │       → Same auth logic, then bidirectional pipe to VPS
  │
  └─ Host: <custom-domain> (future)
      → Look up custom domain → resolve to tenant
      → Same flow as tenant request
```

---

## 9) Health Checking and Circuit Breaking (Future)

### 9.1 Health Checks

Frontdoor periodically pings each running tenant VPS:

```
Every 30 seconds:
  GET http://<private-ip>:<port>/health
  → 200: healthy
  → timeout/error: mark unhealthy

After 3 consecutive failures:
  → Mark server as "degraded" in routing table
  → Continue proxying (but may show warning in dashboard)

After 10 consecutive failures:
  → Mark server as "unreachable"
  → Return 503 for requests to this tenant
  → Alert operator
```

### 9.2 Circuit Breaking

If a tenant VPS starts returning errors (5xx) at a high rate:
- Track error rate per tenant (sliding window)
- If error rate > 50% over 60 seconds → circuit breaker opens
- Return 503 with retry-after header
- Continue health checking
- When health check succeeds → close circuit breaker

### 9.3 Operator Monitoring

Frontdoor exposes internal metrics:
- Per-tenant request count, latency, error rate
- Routing table size
- Provisioning queue depth
- Health check status per tenant

Exposed via internal admin API (Tier 1, operator-only).

---

## 10) Logging and Observability

### 10.1 Access Logs

Every proxied request is logged:

```json
{
  "timestamp": "2026-03-04T12:34:56Z",
  "tenant_id": "t-a3f9c2",
  "server_id": "srv-xyz",
  "method": "GET",
  "path": "/app/spike/",
  "status": 200,
  "duration_ms": 45,
  "auth_tier": "platform",
  "user_id": "u-abc",
  "client_ip": "1.2.3.4"
}
```

### 10.2 Provisioning Logs

Every provisioning event is logged:

```json
{
  "event": "server_provisioning_started",
  "server_id": "srv-xyz",
  "tenant_id": "t-a3f9c2",
  "provider": "hetzner",
  "plan": "cax11",
  "region": "nbg1"
}
```

Events: `server_provisioning_started`, `server_provision_callback`, `server_provisioning_complete`, `server_provisioning_failed`, `server_archive_started`, `server_archive_complete`, `server_recovery_started`, `server_recovery_complete`, `server_destroy_started`, `server_destroy_complete`.

---

## 11) Security Considerations

### 11.1 Threat Model

| Threat | Mitigation |
|--------|-----------|
| Tenant A accesses Tenant B's VPS | Routing table strictly maps tenant ID → VPS. No cross-tenant routing possible. |
| Attacker spoofs provision callback | One-time provision token required. Token generated by frontdoor, delivered via cloud-init. |
| MITM between frontdoor and VPS | Private network (Hetzner Cloud Network) is isolated. Future: mTLS. |
| DDoS on frontdoor | Standard DDoS mitigation (Cloudflare, rate limiting). Affects all tenants equally. |
| Compromised VPS attacks other VPSes | Cloud Firewall blocks all inbound between VPSes. Only frontdoor can initiate connections. |
| Stolen VPS-issued token | Token only grants access to that one VPS's apps. No cross-tenant impact. VPS owner can revoke. |

### 11.2 Rate Limiting

Frontdoor applies per-tenant rate limits:
- Default: 100 requests/second per tenant subdomain
- Burstable to 500 requests/second for 10 seconds
- WebSocket connections: 50 concurrent per tenant
- Configurable per-tenant overrides for high-traffic tenants

### 11.3 Request Size Limits

- Max request body: 10 MB (configurable per-tenant)
- Max URL length: 8 KB
- Max header size: 32 KB
- WebSocket frame size: 1 MB

---

## 12) Implementation Priority

For the initial implementation (getting Hetzner provisioning working end-to-end):

### Phase 1: Core Routing (Required)
1. Wildcard TLS cert on frontdoor
2. Tenant subdomain extraction from Host header
3. In-memory routing table
4. HTTP reverse proxy to VPS private IP
5. WebSocket upgrade proxying

### Phase 2: Cloud Provisioning (Required)
6. Hetzner provider implementation (createServer plus durable lifecycle provider actions)
7. Cloud-init template rendering
8. Provision callback endpoint
9. Provisioning timeout handler

### Phase 3: Auth Delegation (Required)
10. Two-tier auth logic (recognize platform credentials, pass through others)
11. Proxy headers (X-Forwarded-*, X-Nexus-*)

### Phase 4: API Tokens (Can defer)
12. Token create/list/revoke API
13. Token validation in auth pipeline

### Phase 5: Observability (Can defer)
14. Access logging
15. Health checks
16. Rate limiting
