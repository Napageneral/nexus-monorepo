# Cloud Provisioning — Validation Ladder

**Status:** ACTIVE
**Last Updated:** 2026-03-04
**Workplan:** [WORKPLAN_CLOUD_PROVISIONING_OVERVIEW](WORKPLAN_CLOUD_PROVISIONING_OVERVIEW_2026-03-04.md)
**Specs:** [CLOUD_PROVISIONING_ARCHITECTURE](../specs/CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md), [TENANT_NETWORKING_AND_ROUTING](../specs/TENANT_NETWORKING_AND_ROUTING_2026-03-04.md)

---

## How to Use This Document

Each rung is a set of pass/fail checks. Rungs are sequential — you cannot pass rung N without passing all checks in rungs 0 through N-1. As you work through the [workplan phases](WORKPLAN_CLOUD_PROVISIONING_OVERVIEW_2026-03-04.md), validate progress by running through the checks for the relevant rung.

When a check passes, mark it `[x]` with the date. If a check fails, note the failure reason and fix before proceeding.

---

## Rung 0 — Infrastructure Foundation

**Phase:** [Phase 0 — Infrastructure Setup](WORKPLAN_PHASE_0_INFRASTRUCTURE_SETUP_2026-03-04.md)
**Goal:** All Hetzner Cloud resources exist and frontdoor is running on a dedicated VPS.

| # | Check | Status | Date | Notes |
|---|-------|--------|------|-------|
| 0.1 | `frontdoor-1` VPS exists in Hetzner (`hcloud server list` shows it) | | | |
| 0.2 | Can SSH to frontdoor-1: `ssh root@<frontdoor-1-ip>` works | | | |
| 0.3 | Hetzner Cloud Network `nexus-net` exists (`hcloud network list`) | | | |
| 0.4 | `frontdoor-1` is attached to `nexus-net` (has a `10.0.0.x` private IP) | | | |
| 0.5 | Hetzner Cloud Firewall `nexus-tenant-fw` exists with correct inbound rules | | | |
| 0.6 | `nexus-operator` SSH key exists in Hetzner (`hcloud ssh-key list`) | | | |
| 0.7 | `nexus-operator` private key is on frontdoor-1 at `/root/.ssh/nexus-operator` | | | |
| 0.8 | Golden snapshot `nex-golden-v1` exists (`hcloud image list --type snapshot`) | | | |
| 0.9 | `*.nexushub.sh` DNS resolves to frontdoor-1 IP: `dig A test.nexushub.sh` | | | |
| 0.10 | `frontdoor.nexushub.sh` DNS resolves to frontdoor-1 IP | | | |
| 0.11 | Wildcard TLS works: `curl -s -o /dev/null -w "%{http_code}" https://test.nexushub.sh` returns non-SSL-error | | | |
| 0.12 | Caddy is running and proxying to port 4789 | | | |
| 0.13 | Frontdoor Node.js service is running: `systemctl status nexus-frontdoor` | | | |
| 0.14 | Frontdoor responds: `curl http://localhost:4789/health` (or similar) | | | |

---

## Rung 1 — Cloud Provider Smoke Test

**Phase:** [Phase 2 — Cloud Provider](WORKPLAN_PHASE_2_CLOUD_PROVIDER_2026-03-04.md)
**Goal:** The HetznerProvider can create and destroy real VPSes.

| # | Check | Status | Date | Notes |
|---|-------|--------|------|-------|
| 1.1 | `HetznerProvider.createServer()` returns a valid `providerServerId` | | | |
| 1.2 | Created VPS appears in `hcloud server list` with label `managed-by: nexus-frontdoor` | | | |
| 1.3 | Created VPS is attached to `nexus-net` private network | | | |
| 1.4 | Created VPS has `nexus-tenant-fw` firewall applied | | | |
| 1.5 | Created VPS has `nexus-operator` SSH key authorized | | | |
| 1.6 | Frontdoor can reach the VPS via private IP: `ssh -i /root/.ssh/nexus-operator root@10.0.0.x` from frontdoor-1 | | | |
| 1.7 | VPS boots from golden snapshot (Node.js is installed, `/opt/nex/` exists) | | | |
| 1.8 | `HetznerProvider.getServerStatus()` returns `state: "running"` after boot | | | |
| 1.9 | `HetznerProvider.destroyServer()` deletes the VPS | | | |
| 1.10 | VPS is gone from `hcloud server list` after destruction | | | |
| 1.11 | `listPlans()` returns 3 plans: cax11, cax21, cax31 | | | |

---

## Rung 2 — Provisioning Lifecycle

**Phase:** [Phase 3 — Provisioning Flow](WORKPLAN_PHASE_3_PROVISIONING_FLOW_2026-03-04.md)
**Goal:** Full create → boot → phone-home → running lifecycle works.

| # | Check | Status | Date | Notes |
|---|-------|--------|------|-------|
| 2.1 | `POST /api/servers/create` returns `{ ok: true, server_id, status: "provisioning" }` | | | |
| 2.2 | Server record created in DB with `status: "provisioning"` and `provision_token` set | | | |
| 2.3 | Hetzner VPS is created (visible in `hcloud server list`) | | | |
| 2.4 | Cloud-init script runs on VPS (check: `/opt/nex/config/tenant.json` exists on VPS) | | | |
| 2.5 | Nex runtime starts on VPS (check: `curl http://10.0.0.x:8080/health` from frontdoor) | | | |
| 2.6 | VPS phones home: frontdoor receives `POST /api/internal/provision-callback` | | | |
| 2.7 | Provision token validated correctly (rejects bad tokens with 401) | | | |
| 2.8 | Server status transitions from `"provisioning"` → `"running"` in DB | | | |
| 2.9 | Provision token is nullified after successful callback (one-time use) | | | |
| 2.10 | Routing table contains the new tenant entry | | | |
| 2.11 | `GET /api/servers` shows the server with `status: "running"` | | | |
| 2.12 | Total time from `POST /api/servers/create` to `status: "running"`: < 90 seconds | | | |
| 2.13 | `GET /api/plans` returns plan list with correct pricing | | | |

---

## Rung 3 — Tenant Routing

**Phase:** [Phase 4 — Tenant Routing](WORKPLAN_PHASE_4_TENANT_ROUTING_2026-03-04.md)
**Goal:** Requests to tenant subdomains are proxied to the correct VPS.

| # | Check | Status | Date | Notes |
|---|-------|--------|------|-------|
| 3.1 | `curl https://t-<tenantId>.nexushub.sh/` → returns response from tenant VPS (not 503) | | | |
| 3.2 | `curl https://t-<tenantId>.nexushub.sh/app/control/` → Control UI HTML loads | | | |
| 3.3 | WebSocket via tenant subdomain connects: `wss://t-<tenantId>.nexushub.sh/runtime/control/ws` | | | |
| 3.4 | Dashboard path-based proxy still works: `frontdoor.nexushub.sh/app/control/` (with session) | | | |
| 3.5 | Non-existent tenant: `curl https://t-nonexistent.nexushub.sh/` → 503 | | | |
| 3.6 | Session cookie domain is `.nexushub.sh` (works across subdomains) | | | |
| 3.7 | Tier 1 auth: session cookie on tenant subdomain → `X-Nexus-User-Id` header added | | | |
| 3.8 | Tier 2 auth: unknown `Authorization` header → passed through to VPS unchanged | | | |
| 3.9 | No auth: request proxied to VPS, VPS decides (returns its own 401 or serves public content) | | | |
| 3.10 | Proxy headers present: `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Nexus-Tenant-Id`, `X-Nexus-Server-Id` | | | |
| 3.11 | Proxy error (VPS unreachable) → 502 with helpful error message (not crash) | | | |
| 3.12 | Frontdoor restart → routing table rebuilt from DB, all existing tenants still reachable | | | |

---

## Rung 4 — Deprovisioning

**Phase:** [Phase 3 — Provisioning Flow](WORKPLAN_PHASE_3_PROVISIONING_FLOW_2026-03-04.md) (deletion path)
**Goal:** Deleting a server destroys the Hetzner VPS and cleans up all state.

| # | Check | Status | Date | Notes |
|---|-------|--------|------|-------|
| 4.1 | `DELETE /api/servers/{id}` → returns `{ ok: true }` | | | |
| 4.2 | Server immediately removed from routing table (subsequent requests → 503) | | | |
| 4.3 | Server status transitions: `"running"` → `"deprovisioning"` → `"deleted"` | | | |
| 4.4 | Hetzner VPS is destroyed (`hcloud server list` no longer shows it) | | | |
| 4.5 | `deleted_at_ms` set in DB | | | |
| 4.6 | Server no longer appears in `GET /api/servers` response | | | |
| 4.7 | Tenant subdomain returns 503 after deletion | | | |
| 4.8 | No orphaned Hetzner resources (network attachment, firewall association auto-cleaned by Hetzner on server delete) | | | |
| 4.9 | App install records reset to `not_installed` for deleted server | | | |

---

## Rung 5 — Provisioning Resilience

**Phase:** [Phase 3 — Provisioning Flow](WORKPLAN_PHASE_3_PROVISIONING_FLOW_2026-03-04.md) (timeout/failure paths)
**Goal:** Provisioning failures are handled gracefully.

| # | Check | Status | Date | Notes |
|---|-------|--------|------|-------|
| 5.1 | Provisioning timeout: VPS fails to phone home within 5 min → server status set to `"failed"` | | | |
| 5.2 | Timed-out VPS is destroyed by the timeout handler (cleanup) | | | |
| 5.3 | Failed server visible in `GET /api/servers` with `status: "failed"` | | | |
| 5.4 | User can retry: create a new server after a failed one | | | |
| 5.5 | Delete during provisioning: `DELETE /api/servers/{id}` while status is `"provisioning"` → VPS destroyed | | | |
| 5.6 | Invalid provision callback (wrong token) → 401 (server stays in `"provisioning"`) | | | |
| 5.7 | Duplicate provision callback (same server already running) → 409 (idempotent, no state change) | | | |

---

## Rung 6 — API Tokens + Programmatic Access

**Phase:** [Phase 5 — API Tokens](WORKPLAN_PHASE_5_API_TOKENS_2026-03-04.md)
**Goal:** Users can create tokens and use them for MCP/API access.

| # | Check | Status | Date | Notes |
|---|-------|--------|------|-------|
| 6.1 | `POST /api/tokens/create` → returns `{ token: "nex_t_...", token_id: "tok-..." }` | | | |
| 6.2 | Token only shown once (subsequent `GET /api/tokens` returns list without hashes) | | | |
| 6.3 | Platform API auth: `curl -H "Authorization: Bearer nex_t_..." /api/servers` → 200 | | | |
| 6.4 | Tenant subdomain with platform token: request proxied with `X-Nexus-User-Id` header | | | |
| 6.5 | Revoked token: `DELETE /api/tokens/{id}` then use token → 401 | | | |
| 6.6 | Expired token → 401 | | | |
| 6.7 | `last_used_ms` updated on each token use | | | |
| 6.8 | Dashboard: token list renders correctly | | | |
| 6.9 | Dashboard: create token modal works, shows token once with copy button | | | |
| 6.10 | Dashboard: revoke token button works | | | |
| 6.11 | MCP integration test: configure MCP client with token + tenant URL → connection works | | | |

---

## Rung 7 — Server Creation UI

**Phase:** [Phase 6 — Server Creation UI](WORKPLAN_PHASE_6_SERVER_CREATION_UI_2026-03-04.md)
**Goal:** Full server creation UX with plan selection and progress feedback.

| # | Check | Status | Date | Notes |
|---|-------|--------|------|-------|
| 7.1 | "New Server" button opens modal (not immediate creation) | | | |
| 7.2 | Modal shows plan cards with correct specs and pricing (cax11/cax21/cax31) | | | |
| 7.3 | Optional server name input with auto-generated placeholder | | | |
| 7.4 | "Create Server" submits to `POST /api/servers/create` with selected plan | | | |
| 7.5 | Modal closes, server appears in list with "Provisioning..." badge | | | |
| 7.6 | Provisioning polling updates UI when status → "running" | | | |
| 7.7 | Failed provisioning shows error state in server list | | | |
| 7.8 | Server detail view shows plan, cost, tenant URL | | | |
| 7.9 | Server delete from detail view → confirmation modal → VPS destroyed | | | |

---

## Rung 8 — Full E2E User Journey

**Phase:** All phases complete
**Goal:** Complete user experience from signup through multi-server management.

| # | Check | Status | Date | Notes |
|---|-------|--------|------|-------|
| 8.1 | Fresh user: OIDC sign-in → auto-provisioned server → dashboard with provisioning progress | | | |
| 8.2 | Server becomes ready → user can launch an app | | | |
| 8.3 | App loads at tenant subdomain: `https://t-xyz.nexushub.sh/app/<appId>/` | | | |
| 8.4 | App frame (44px header) renders correctly on tenant subdomain | | | |
| 8.5 | Control UI WebSocket connects through tenant subdomain | | | |
| 8.6 | User creates second server (different plan) → both appear in dashboard | | | |
| 8.7 | User can switch between servers and launch apps on each | | | |
| 8.8 | Install app on server → works | | | |
| 8.9 | Uninstall app from server → works | | | |
| 8.10 | Delete a server → VPS destroyed, gone from dashboard, tenant subdomain returns 503 | | | |
| 8.11 | Create API token → use for MCP access to a running server → works | | | |
| 8.12 | All server creation/deletion events: no orphaned Hetzner resources | | | |
| 8.13 | Frontdoor restart: all running servers remain accessible, routing table rebuilt | | | |

---

## Rung 9 — Codebase Hygiene

**Phase:** [Phase 7 — Codebase Cleanup](WORKPLAN_PHASE_7_CODEBASE_CLEANUP_2026-03-04.md)
**Goal:** No dead code, no local provisioning remnants.

| # | Check | Status | Date | Notes |
|---|-------|--------|------|-------|
| 9.1 | `provision-tenant-local.mjs` is deleted | | | |
| 9.2 | No references to `FRONTDOOR_AUTOPROVISION_COMMAND` in code | | | |
| 9.3 | No references to `FRONTDOOR_TENANT_BASE_PORT` in code | | | |
| 9.4 | No references to `config.tenants[` in code | | | |
| 9.5 | No references to `runtimeUrl` (except the helper function) | | | |
| 9.6 | No references to `runtimePublicBaseUrl` (except the helper function) | | | |
| 9.7 | No references to `status === "active"` (should be `"running"`) | | | |
| 9.8 | No references to `status === "disabled"` (should be `"deleted"` or `"deprovisioning"`) | | | |
| 9.9 | `frontdoor.config.json` has no `tenants` section | | | |
| 9.10 | Frontdoor starts cleanly with empty databases (no errors) | | | |
| 9.11 | All 8.x E2E checks still pass after cleanup | | | |

---

## Summary: Rung → Phase Mapping

| Rung | Name | Primary Phase(s) | Checks |
|------|------|-----------------|--------|
| 0 | Infrastructure Foundation | Phase 0 | 14 |
| 1 | Cloud Provider Smoke Test | Phase 2 | 11 |
| 2 | Provisioning Lifecycle | Phase 3 | 13 |
| 3 | Tenant Routing | Phase 4 | 12 |
| 4 | Deprovisioning | Phase 3 | 9 |
| 5 | Provisioning Resilience | Phase 3 | 7 |
| 6 | API Tokens | Phase 5 | 11 |
| 7 | Server Creation UI | Phase 6 | 9 |
| 8 | Full E2E User Journey | All | 13 |
| 9 | Codebase Hygiene | Phase 7 | 11 |
| | **Total** | | **110** |
