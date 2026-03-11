# App Installation Pipeline Architecture

**Date:** 2026-03-04
**Status:** ARCHIVED 2026-03-10

> Historical note: this exploratory proposal predates the runtime-owned package
> operator canon and is retained only as historical context.
**Author:** System Architecture Team

## Overview

This specification defines the architecture for installing, managing, and distributing nex apps across tenant VPS instances in the cloud-provisioned Nexus platform. The design replaces the legacy config injection pattern with a proper HTTP API-based installation flow, treating the frontdoor as a lightweight app registry and leveraging the nex runtime's native app management capabilities.

### Goals

1. Enable automated app installation on newly provisioned tenant VPSes
2. Support marketplace app distribution without rebuilding golden snapshots
3. Enforce subscription-based entitlements at install time
4. Provide upgrade/update capabilities for deployed apps
5. Maintain clean separation between platform control plane (frontdoor) and tenant runtime

### Key Design Decisions

- **Control app baked into golden snapshot**: The platform control app ships with the runtime image, no installation required
- **Marketplace apps distributed as tarballs**: Apps like GlowBot, Spike stored on frontdoor, pulled on-demand by VPS
- **Frontdoor as app registry**: Lightweight catalog and package distribution, no complex registry infrastructure
- **No snapshot rebuilds for app updates**: Apps updated in-place on running VPSes
- **Simple bootstrap process**: VPS bootstrap script starts runtime and phones home; frontdoor orchestrates installations
- **Auto-install entitled apps**: After provisioning, frontdoor automatically installs apps the account is subscribed to

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontdoor Control Plane (178.104.21.207)                       │
│                                                                 │
│  ┌────────────────────┐        ┌─────────────────────────┐    │
│  │  App Registry      │        │  Provisioning Service   │    │
│  │                    │        │                         │    │
│  │  /api/apps/        │◄───────│  - Provision callback   │    │
│  │    catalog         │        │  - Auto-install apps    │    │
│  │    {appId}/package │        │  - Entitlement check    │    │
│  │    {appId}/manifest│        └─────────┬───────────────┘    │
│  │                    │                  │                     │
│  │  Storage:          │                  │                     │
│  │  /opt/nexus/       │                  ▼                     │
│  │    frontdoor/apps/ │        ┌─────────────────────────┐    │
│  │    {appId}/        │        │  Installation API       │    │
│  │      {version}/    │        │                         │    │
│  │        pkg.tar.gz  │        │  POST /api/servers/     │    │
│  └────────────────────┘        │    {serverId}/apps/     │    │
│                                │    {appId}/install      │    │
│                                └─────────┬───────────────┘    │
└────────────────────────────────────────────┼───────────────────┘
                                            │
                            Private Network │ 10.0.0.x
                                            │
                    ┌───────────────────────┼───────────────────┐
                    │                       ▼                   │
                    │  ┌─────────────────────────────────┐     │
                    │  │  SSH/SCP (provisioner key)      │     │
                    │  │  - Copy tarball to VPS          │     │
                    │  │  - Extract to /opt/nex/apps/    │     │
                    │  └─────────────┬───────────────────┘     │
                    │                ▼                          │
┌───────────────────┼──────────────────────────────────────────┼───┐
│ Tenant VPS        │  (10.0.0.x)                              │   │
│                   │                                          │   │
│  ┌────────────────▼──────────────────┐                      │   │
│  │  Nex Runtime (:18789)             │                      │   │
│  │                                   │                      │   │
│  │  POST /api/apps/install           │◄─────────────────────┘   │
│  │    { appId, packageRef }          │                          │
│  │                                   │                          │
│  │  POST /api/apps/uninstall         │                          │
│  │  POST /api/apps/upgrade           │                          │
│  │                                   │                          │
│  │  App Storage:                     │                          │
│  │  /opt/nex/apps/{appId}/           │                          │
│  │    app.nexus.json                 │                          │
│  │    handlers/                      │                          │
│  │    dist/                          │                          │
│  └───────────────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

## App Package Lifecycle

### Development and Publishing

1. **Developer builds app**: Creates nex app package with `app.nexus.json` manifest
2. **Package creation**: Developer runs build tool to create tarball (e.g., `glowbot-v1.2.3.tar.gz`)
3. **Upload to registry**: Tarball uploaded to frontdoor at `/opt/nexus/frontdoor/apps/{appId}/{version}/pkg.tar.gz`
4. **Manifest extraction**: Frontdoor extracts and caches manifest metadata for catalog display
5. **Catalog update**: App appears in `GET /api/apps/catalog` response

### Package Storage Structure

```
/opt/nexus/frontdoor/apps/
├── glowbot/
│   ├── 1.0.0/
│   │   ├── pkg.tar.gz
│   │   └── manifest.json
│   ├── 1.1.0/
│   │   ├── pkg.tar.gz
│   │   └── manifest.json
│   └── latest -> 1.1.0
├── spike/
│   └── 1.0.0/
│       ├── pkg.tar.gz
│       └── manifest.json
└── control/
    └── 1.0.0/
        └── baked-into-runtime
```

### Package Tarball Structure

```
pkg.tar.gz
├── app.nexus.json          # Manifest
├── handlers/               # Server-side code
│   ├── http.js
│   └── events.js
├── dist/                   # UI assets (optional)
│   ├── index.html
│   └── static/
├── migrations/             # Database migrations (optional)
└── config/                 # Default config templates (optional)
```

## Installation Flow

### 1. User-Initiated Installation

```
User/Admin → POST /api/servers/{serverId}/apps/{appId}/install
```

#### Request Flow

```
1. API Gateway
   ├─ Authenticate request
   ├─ Validate serverId belongs to account
   └─ Route to Installation Service

2. Installation Service
   ├─ Check entitlement (frontdoor_app_subscriptions)
   │  └─ Verify account has active subscription for appId
   ├─ Check installation status (frontdoor_server_app_installs)
   │  └─ Prevent duplicate installs
   ├─ Resolve package version (default: latest)
   └─ Initiate installation

3. Package Delivery (SSH/SCP approach)
   ├─ Connect to VPS via SSH (private key: nexus-operator)
   ├─ SCP tarball to VPS: /tmp/{appId}-{version}.tar.gz
   ├─ SSH command: mkdir -p /opt/nex/apps/{appId}
   └─ SSH command: tar -xzf /tmp/{appId}-{version}.tar.gz -C /opt/nex/apps/{appId}

4. Runtime Installation (HTTP API)
   ├─ POST http://10.0.0.x:18789/api/apps/install
   │  Body: {
   │    "appId": "glowbot",
   │    "packageRef": "/opt/nex/apps/glowbot"
   │  }
   └─ Runtime processes:
      ├─ Read app.nexus.json manifest
      ├─ Validate manifest schema
      ├─ Register HTTP handlers
      ├─ Register event handlers
      ├─ Run migrations (if any)
      ├─ Initialize app state
      └─ Mark app as installed

5. Post-Installation
   ├─ Update frontdoor_server_app_installs
   │  └─ SET status = 'installed', installed_at = NOW()
   └─ Return success response
```

#### API Specification

**Request:**
```http
POST /api/servers/{serverId}/apps/{appId}/install
Authorization: Bearer {token}
Content-Type: application/json

{
  "version": "latest",  // Optional, defaults to "latest"
  "config": {           // Optional initial config
    "webhookUrl": "https://..."
  }
}
```

**Response (Success):**
```json
{
  "ok": true,
  "status": "installed",
  "appId": "glowbot",
  "version": "1.1.0",
  "installedAt": "2026-03-04T10:30:00Z"
}
```

**Response (Entitlement Failure):**
```json
{
  "ok": false,
  "error": "not_entitled",
  "message": "Account does not have an active subscription for app 'glowbot'"
}
```

**Response (Already Installed):**
```json
{
  "ok": false,
  "error": "already_installed",
  "message": "App 'glowbot' is already installed on this server",
  "currentVersion": "1.0.0"
}
```

### 2. Auto-Install on Provisioning

When a new VPS is provisioned and phones home, the frontdoor automatically installs entitled apps.

#### Provisioning Callback Flow

```
1. VPS Bootstrap
   ├─ Bootstrap script starts nex-runtime
   ├─ Runtime starts on port 18789
   └─ POST {frontdoorUrl}/api/servers/provision-callback
      Body: {
        "serverId": "srv_xyz",
        "status": "running",
        "privateIp": "10.0.0.15",
        "publicIp": "203.0.113.45"
      }

2. Frontdoor Provisioning Service
   ├─ Validate serverId and callback signature
   ├─ Update server status: 'running'
   ├─ Add routing table entry (private IP mapping)
   └─ Trigger auto-install flow

3. Auto-Install Flow
   ├─ Query: SELECT app_id FROM frontdoor_app_subscriptions
   │         WHERE account_id = {accountId} AND status = 'active'
   ├─ For each entitled appId:
   │  ├─ Create server_app_installs record (status: 'installing')
   │  ├─ Execute installation flow (same as user-initiated)
   │  └─ Update server_app_installs (status: 'installed' or 'failed')
   └─ Log installation summary

4. Error Handling
   ├─ Installation failures are logged but don't block provisioning
   ├─ Failed installs can be retried via admin API
   └─ User sees installation status in dashboard
```

#### Auto-Install Configuration

Auto-install behavior can be controlled per app subscription:

```sql
-- frontdoor_app_subscriptions
{
  "app_id": "glowbot",
  "account_id": "acc_123",
  "status": "active",
  "auto_install": true,  -- Install on new servers automatically
  "auto_upgrade": false  -- Auto-upgrade on new versions (future)
}
```

## Uninstall Flow

### API Specification

**Request:**
```http
POST /api/servers/{serverId}/apps/{appId}/uninstall
Authorization: Bearer {token}
```

**Flow:**
```
1. Frontdoor
   ├─ Validate serverId and appId
   ├─ Check installation status (must be installed)
   └─ Call runtime uninstall API

2. Runtime Uninstall
   ├─ POST http://10.0.0.x:18789/api/apps/uninstall
   │  Body: { "appId": "glowbot", "cleanData": false }
   └─ Runtime processes:
      ├─ Deregister HTTP handlers
      ├─ Deregister event handlers
      ├─ Stop background jobs
      ├─ Optionally clean app data
      └─ Mark app as uninstalled

3. Post-Uninstall
   ├─ Update frontdoor_server_app_installs
   │  └─ SET status = 'not_installed', uninstalled_at = NOW()
   ├─ Optionally: SSH to VPS and rm -rf /opt/nex/apps/{appId}
   └─ Return success response
```

**Response:**
```json
{
  "ok": true,
  "status": "not_installed",
  "appId": "glowbot",
  "uninstalledAt": "2026-03-04T11:00:00Z"
}
```

## App Update/Upgrade Flow

### Triggered Upgrade (Admin or User)

**Request:**
```http
POST /api/servers/{serverId}/apps/{appId}/upgrade
Authorization: Bearer {token}
Content-Type: application/json

{
  "version": "1.2.0"  // Optional, defaults to latest
}
```

**Flow:**
```
1. Frontdoor
   ├─ Validate app is currently installed
   ├─ Resolve target version (default: latest)
   ├─ Check if target version > current version
   └─ Initiate upgrade

2. Package Delivery
   ├─ SCP new tarball to VPS: /tmp/{appId}-{version}.tar.gz
   ├─ Backup current installation (optional):
   │  └─ mv /opt/nex/apps/{appId} /opt/nex/apps/{appId}.bak
   ├─ Extract new package to /opt/nex/apps/{appId}
   └─ Clean up temp files

3. Runtime Upgrade
   ├─ POST http://10.0.0.x:18789/api/apps/upgrade
   │  Body: {
   │    "appId": "glowbot",
   │    "packageRef": "/opt/nex/apps/glowbot",
   │    "fromVersion": "1.0.0",
   │    "toVersion": "1.2.0"
   │  }
   └─ Runtime processes:
      ├─ Read new manifest
      ├─ Run upgrade migrations
      ├─ Hot-reload handlers (or restart app context)
      ├─ Validate upgrade success
      └─ Update installed version

4. Post-Upgrade
   ├─ Update frontdoor_server_app_installs
   │  └─ SET version = '1.2.0', upgraded_at = NOW()
   ├─ Remove backup (if upgrade succeeded)
   └─ Return success response
```

### Bulk Upgrade (Platform-Wide)

When a new app version is published, admins can trigger bulk upgrades:

```
POST /api/apps/{appId}/bulk-upgrade
Authorization: Bearer {adminToken}
Content-Type: application/json

{
  "targetVersion": "1.2.0",
  "filter": {
    "currentVersion": "<1.2.0",  // Only upgrade older versions
    "accountTier": "premium"      // Optional filtering
  },
  "rollout": {
    "strategy": "canary",         // canary | rolling | immediate
    "batchSize": 10,              // For rolling strategy
    "delaySeconds": 60            // Delay between batches
  }
}
```

**Response:**
```json
{
  "ok": true,
  "upgradeJobId": "upg_abc123",
  "serversQueued": 150,
  "estimatedDuration": "25 minutes"
}
```

## App Registry on Frontdoor

### Catalog API

Lists all available apps with metadata for marketplace display.

**Request:**
```http
GET /api/apps/catalog
Authorization: Bearer {token}
```

**Response:**
```json
{
  "apps": [
    {
      "appId": "glowbot",
      "name": "GlowBot",
      "description": "Intelligent AI assistant for your Nexus workspace",
      "icon": "https://cdn.nexus.com/apps/glowbot/icon.png",
      "category": "productivity",
      "latestVersion": "1.1.0",
      "versions": ["1.0.0", "1.0.1", "1.1.0"],
      "plans": [
        {
          "planId": "glowbot-free",
          "name": "Free",
          "price": 0,
          "features": ["Basic AI", "5 queries/day"]
        },
        {
          "planId": "glowbot-pro",
          "name": "Professional",
          "price": 29,
          "currency": "USD",
          "billingPeriod": "month",
          "features": ["Advanced AI", "Unlimited queries", "Priority support"]
        }
      ],
      "permissions": ["http:read", "db:read_write", "events:emit"],
      "installed": false  // For current user's active server
    },
    {
      "appId": "spike",
      "name": "Spike",
      "description": "PRLM-based codebase oracle",
      "latestVersion": "1.0.0",
      "installed": true,
      "installedVersion": "1.0.0"
    }
  ]
}
```

### Package Download API

Serves app tarballs for installation (internal use only, requires special auth).

**Request:**
```http
GET /api/apps/{appId}/package?version=latest
Authorization: Bearer {internalToken}
```

**Response:**
```
HTTP/1.1 200 OK
Content-Type: application/gzip
Content-Disposition: attachment; filename="glowbot-1.1.0.tar.gz"
X-App-Version: 1.1.0
X-Manifest-Hash: sha256:abc123...

[binary tarball data]
```

**Access Control:**
- Only accessible from frontdoor services and VPS private network
- Requires internal service token or VPS authentication
- Rate-limited per account

### Manifest API

Returns parsed manifest JSON for an app version.

**Request:**
```http
GET /api/apps/{appId}/manifest?version=1.1.0
Authorization: Bearer {token}
```

**Response:**
```json
{
  "appId": "glowbot",
  "version": "1.1.0",
  "manifest": {
    "id": "glowbot",
    "name": "GlowBot",
    "version": "1.1.0",
    "runtime": {
      "type": "node",
      "version": ">=18.0.0"
    },
    "handlers": {
      "http": "./handlers/http.js",
      "events": "./handlers/events.js"
    },
    "routes": [
      { "path": "/glowbot/*", "handler": "http" }
    ],
    "permissions": [
      "http:read",
      "db:read_write",
      "events:emit"
    ],
    "ui": {
      "mountPath": "/apps/glowbot",
      "staticDir": "./dist"
    }
  }
}
```

## Entitlement Enforcement

### Subscription Checking

Before installing an app, the frontdoor validates the account has an active subscription.

```sql
-- Check entitlement query
SELECT s.app_id, s.plan_id, s.status, s.provider
FROM frontdoor_app_subscriptions s
WHERE s.account_id = $1
  AND s.app_id = $2
  AND s.status = 'active';
```

**Entitlement Rules:**
1. **Free tier apps**: Subscription exists with `provider="none"` and `plan="{appId}-free"`
2. **Paid apps**: Valid Stripe subscription with `status="active"`
3. **Trial apps**: Trial period not expired, `trial_ends_at > NOW()`
4. **Control app**: Always entitled (baked into runtime)

### Runtime Entitlement Headers

When frontdoor proxies requests to tenant VPS apps, it injects entitlement context:

```http
X-Nexus-Account-Id: acc_123
X-Nexus-App-Subscription: glowbot-pro
X-Nexus-App-Limits: {"queries_per_day":1000,"storage_mb":500}
```

The nex runtime can enforce these limits at the app level.

## Database Schema

### frontdoor_app_registry

Catalog metadata for available apps (optional, can use existing product tables).

```sql
CREATE TABLE frontdoor_app_registry (
  app_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  icon_url TEXT,
  developer_id TEXT,
  latest_version TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### frontdoor_app_versions

Tracks all published versions of each app.

```sql
CREATE TABLE frontdoor_app_versions (
  id SERIAL PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES frontdoor_app_registry(app_id),
  version TEXT NOT NULL,
  package_path TEXT NOT NULL,  -- /opt/nexus/frontdoor/apps/{appId}/{version}/pkg.tar.gz
  manifest_json JSONB NOT NULL,
  changelog TEXT,
  published_at TIMESTAMP DEFAULT NOW(),
  deprecated BOOLEAN DEFAULT false,
  UNIQUE(app_id, version)
);
```

### frontdoor_server_app_installs

Tracks which apps are installed on which servers.

```sql
CREATE TABLE frontdoor_server_app_installs (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES frontdoor_servers(id),
  app_id TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'installing', 'installed', 'failed', 'not_installed'
  version TEXT,
  installed_at TIMESTAMP,
  uninstalled_at TIMESTAMP,
  last_error TEXT,
  config JSONB,  -- App-specific configuration
  UNIQUE(server_id, app_id)
);
```

### frontdoor_app_subscriptions

Tracks account-level app subscriptions (already exists).

```sql
CREATE TABLE frontdoor_app_subscriptions (
  id SERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'active', 'canceled', 'trial', 'expired'
  provider TEXT,         -- 'stripe', 'none' (for free tier)
  external_subscription_id TEXT,
  trial_ends_at TIMESTAMP,
  auto_install BOOLEAN DEFAULT true,
  auto_upgrade BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(account_id, app_id)
);
```

## Security Considerations

### 1. Package Integrity

- **Manifest validation**: Runtime validates `app.nexus.json` schema before installation
- **Signature verification** (future): Tarballs signed with developer keys, verified before extraction
- **Checksum validation**: Package downloads include SHA-256 checksums in metadata

### 2. Entitlement Bypass Prevention

- **Double-check at runtime**: Runtime verifies entitlement via frontdoor before executing app code
- **Subscription webhooks**: Stripe webhooks immediately revoke access when subscription canceled
- **Periodic sync**: Runtime polls frontdoor every 5 minutes to sync entitlement state

### 3. Tarball Extraction Security

- **Path traversal protection**: Tar extraction validates no `../` paths escape `/opt/nex/apps/{appId}`
- **Symlink prevention**: Extraction ignores or rejects symbolic links
- **Disk quota enforcement**: Extract with size limits to prevent disk exhaustion attacks

### 4. SSH/SCP Security

- **Key-based auth only**: SSH uses `nexus-operator` private key, no password auth
- **Restricted commands**: SSH session runs specific commands only (mkdir, tar, rm)
- **Connection timeout**: SSH sessions timeout after 30 seconds of inactivity

### 5. Internal API Access

- **Private network only**: Package download API only accessible from 10.0.0.0/16
- **Service authentication**: VPS authenticates to frontdoor with server-scoped JWT
- **Rate limiting**: Per-server rate limits prevent abuse

### 6. App Permissions

Apps declare permissions in manifest; runtime enforces:
- `http:read` — can make outbound HTTP requests
- `http:write` — can respond to HTTP requests
- `db:read` — can query account database
- `db:read_write` — can modify account database
- `events:emit` — can publish events
- `events:subscribe` — can subscribe to events
- `storage:read_write` — can use app-scoped storage

## Implementation Notes

**HARD CUTOVER — build the new system, delete the old one. No phased migration.**

### Scope (all delivered in one cut)

1. **Frontdoor changes:**
   - Add SSH/SCP infrastructure (`ssh2` library, helper module)
   - Add app tarball storage at `/opt/nexus/frontdoor/apps/{appId}/{version}/`
   - Add `POST /api/servers/{serverId}/apps/{appId}/install` (SSH/SCP + HTTP flow)
   - Add `POST /api/servers/{serverId}/apps/{appId}/uninstall`
   - Add `POST /api/servers/{serverId}/apps/{appId}/upgrade`
   - Add auto-install on provision callback
   - Delete `attachRuntimeAppOnServer()`, `resolveManagedRuntimeAppConfig()`, all config injection code
   - Delete all `FRONTDOOR_TENANT_*` env var references

2. **Runtime:** Already done — `POST /api/apps/install`, `/uninstall`, `/upgrade` all exist

3. **Database:** Use existing `frontdoor_server_app_installs` + `frontdoor_app_subscriptions` tables

4. **Testing:**
   - Provision new VPS → auto-install → GlowBot accessible at subdomain
   - Manual install/uninstall/reinstall cycle
   - Verify no config injection code paths remain

### Future Work (separate workplans)

1. Multi-app support (Spike in registry)
2. Developer tooling (CLI packaging, manifest validation)
3. Advanced features (rollback, canary deployments, signature verification)

## Hard Cutover from Config Injection

**APPROACH: Hard cutover. No backwards compatibility. No parallel legacy paths.**

**Current state (broken, being deleted):**
- Frontdoor writes app config to `/opt/nex/config.json`
- Frontdoor restarts nex-runtime via SSH
- Runtime reads config and initializes apps

**Target state (only state):**
- Frontdoor never touches config.json
- Frontdoor calls runtime HTTP APIs for installation
- Runtime manages app lifecycle internally

**Cutover steps:**
1. Build new installation flow (SSH/SCP + runtime HTTP API)
2. Delete `attachRuntimeAppOnServer()`, `resolveManagedRuntimeAppConfig()`, and all config injection code
3. Delete all `FRONTDOOR_TENANT_GLOWBOT_*` / `FRONTDOOR_TENANT_SPIKE_*` env var references
4. Existing VPSes get apps reinstalled via new flow (no legacy fallback)
5. Deploy and verify — old code paths simply don't exist

## Open Questions

1. **Package format**: Should we use `.tar.gz` or `.nex` custom format?
   - **Decision**: Use `.tar.gz` for MVP, consider custom format later

2. **Versioning scheme**: Semantic versioning required or flexible?
   - **Decision**: Recommend semver, but don't enforce in manifest

3. **Rollback strategy**: Automatic rollback on upgrade failure?
   - **Decision**: Phase 4 feature, manual rollback for MVP

4. **Registry storage**: Filesystem or S3/object storage?
   - **Decision**: Filesystem for MVP, migrate to S3 when scaling

5. **Hot reload vs restart**: Can runtime hot-reload upgraded apps?
   - **Decision**: Depends on runtime implementation, restart acceptable for MVP

## References

- **Related specs:**
  - `NEX_APP_MANIFEST_AND_LIFECYCLE.md` — App manifest format and lifecycle hooks
  - `NEXUS_RUNTIME_API.md` — Runtime HTTP API specification
  - `FRONTDOOR_ARCHITECTURE.md` — Platform control plane overview

- **External docs:**
  - Nexus App Developer Guide (when published)
  - Platform API Reference (when published)

---

**Changelog:**
- 2026-03-04: Initial draft, SSH/SCP-based installation flow
