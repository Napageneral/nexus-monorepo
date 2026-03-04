# Phase 7: Codebase Cleanup

**Status:** NOT STARTED
**Last Updated:** 2026-03-04
**Depends On:** All previous phases (cleanup happens after everything works)
**Enables:** Clean codebase for future development
**Specs:** All specs — this phase aligns the codebase with the canonical vision

---

## Goal

Remove all local provisioning code, stale config patterns, and backwards-compatibility artifacts. The codebase should reflect the cloud provisioning architecture with no dead code paths.

---

## Tasks

### 7.1 — Delete local provisioning script

**Delete:** `scripts/provision-tenant-local.mjs`

This script spawned local nex runtime processes. It's fully replaced by `HetznerProvider.createServer()`.

### 7.2 — Remove local provisioning env vars

**File:** `src/config.ts`, env file references

Remove handling of:
- `FRONTDOOR_AUTOPROVISION_COMMAND` — was the shell command to run
- `FRONTDOOR_TENANT_ROOT` — was the base directory for local tenant state
- `FRONTDOOR_TENANT_BASE_PORT` — was the starting port for local allocation
- `FRONTDOOR_TENANT_NEXUS_BIN` — was the path to nexus binary for local spawning
- `FRONTDOOR_TENANT_BUILD_UI_IF_MISSING` — local build flag
- `FRONTDOOR_TENANT_REQUIRE_CONTROL_UI` — local control UI flag
- `FRONTDOOR_TENANT_ENABLE_GLOWBOT_APP` — was per-app toggle for local provisioning
- `FRONTDOOR_TENANT_ENABLE_SPIKE_APP` — same
- `FRONTDOOR_TENANT_GLOWBOT_APP_KIND` — local app config
- `FRONTDOOR_TENANT_GLOWBOT_PROXY_BASE_URL` — local proxy URL
- `FRONTDOOR_TENANT_SPIKE_PROXY_BASE_URL` — local proxy URL
- `FRONTDOOR_TENANT_CONTROL_UI_ROOT` — local control UI path

These are all artifacts of the local provisioning model.

### 7.3 — Remove config.tenants pattern

**File:** `src/server.ts`, `src/config.ts`

The `config.tenants` in-memory map was populated by:
1. Loading from `frontdoor.config.json` on startup
2. Adding entries when local provisioning completed
3. Removing entries when servers were deleted

This is now replaced by:
1. `routingTable` Map populated from DB on startup (Phase 4.1)
2. Updated on provision-callback (Phase 3.2)
3. Updated on server deletion (Phase 3.4)

Remove:
- `config.tenants` type definitions and loading
- `addTenantToConfig()` function
- `removeTenantFromConfig()` function
- `frontdoor.config.json` tenant entries (keep other config)
- Any code that reads `config.tenants[id].runtimeUrl`

### 7.4 — Remove stale tenant-autoprovision.ts code

**File:** `src/tenant-autoprovision.ts`

Remove:
- `execProvisionCommand()` — ran shell command
- Port allocation logic
- `.tenants/` directory management
- Local state directory creation
- stdout JSON parsing from local provisioning script

Replace with:
- Call to the new cloud provisioning logic (shared with `POST /api/servers/create`)
- This should be a small function that creates a server via the cloud provider

### 7.5 — Clean up server.ts proxy references

**File:** `src/server.ts`

Search and replace all instances of:
- `server.runtimeUrl` → `getServerRuntimeUrl(server)`
- `server.runtimePublicBaseUrl` → `getServerPublicUrl(server)`
- `server.runtimeWsUrl` → `getServerRuntimeWsUrl(server)`
- `server.runtimeSseUrl` → remove (SSE uses same HTTP endpoint)
- `config.tenants[` → routing table lookup
- `server.tier` → `server.plan`
- `status === "active"` → `status === "running"`
- `status === "disabled"` → `status === "deleted"` or `status === "deprovisioning"`

### 7.6 — Remove .tenants directory and local state

On the new frontdoor-1 VPS, there should be no `.tenants/` directory. On the old oracle-1, it can remain (legacy).

### 7.7 — Clean up frontdoor.config.json

**File:** `config/frontdoor.config.json`

Remove:
- `tenants` section (replaced by DB-backed routing table)
- `autoProvision.command` (replaced by cloud provider)
- Local provisioning settings

Keep:
- Product manifest paths
- OIDC configuration
- Session settings
- Billing settings
- Any other non-provisioning config

Add:
- Provisioning section referencing env vars:
```json
{
  "provisioning": {
    "enabled": true,
    "defaultProvider": "hetzner",
    "timeoutMs": 300000
  }
}
```

### 7.8 — Update entry/execute flow

The `POST /api/entry/execute` endpoint was the old provisioning trigger from product pages. Options:

**Option A:** Remove it entirely — product pages link to frontdoor, OIDC handles auto-provisioning.
**Option B:** Keep it but have it call `POST /api/servers/create` internally.

Recommend **Option A** if the OIDC auto-provisioning flow handles everything. The entry/execute was a workaround.

### 7.9 — Verify no dead code paths

Run a search for all removed identifiers to ensure no dangling references:
- `runtimeUrl` (should only appear in `getServerRuntimeUrl` helper)
- `runtimePublicBaseUrl` (should only appear in `getServerPublicUrl` helper)
- `provision-tenant-local`
- `execProvisionCommand`
- `config.tenants`
- `FRONTDOOR_TENANT_`

---

## Verification

- [ ] `provision-tenant-local.mjs` is deleted
- [ ] No references to removed env vars in code
- [ ] `config.tenants` pattern is fully removed
- [ ] Proxy uses routing table + private IPs (not runtime URLs)
- [ ] `tenant-autoprovision.ts` uses cloud provider
- [ ] No `.tenants/` directory on frontdoor-1
- [ ] `frontdoor.config.json` is clean
- [ ] All status value references use new set
- [ ] `grep` for removed identifiers returns zero results
- [ ] Frontdoor starts cleanly and handles all flows
