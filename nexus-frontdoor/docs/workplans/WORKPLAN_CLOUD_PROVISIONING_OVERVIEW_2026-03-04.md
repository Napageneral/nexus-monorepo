# Cloud Provisioning — Master Workplan

**Status:** IN PROGRESS
**Last Updated:** 2026-03-04
**Specs:** [CLOUD_PROVISIONING_ARCHITECTURE](../specs/CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md), [TENANT_NETWORKING_AND_ROUTING](../specs/TENANT_NETWORKING_AND_ROUTING_2026-03-04.md)

---

## Objective

Replace local provisioning with real Hetzner Cloud VPS provisioning. Each user server becomes a dedicated Hetzner VPS, provisioned via API, routed through frontdoor via private network, with full lifecycle management (create, route, delete).

---

## Phase Summary

| Phase | Name | Depends On | Est. Lines | Description |
|-------|------|-----------|------------|-------------|
| **0** | [Infrastructure Setup](WORKPLAN_PHASE_0_INFRASTRUCTURE_SETUP_2026-03-04.md) | — | Manual | New VPS, network, firewall, SSH keys, snapshot, DNS, TLS |
| **1** | [Database Schema](WORKPLAN_PHASE_1_DATABASE_SCHEMA_2026-03-04.md) | Phase 0 | ~200 | Clean-slate server schema, API token table, store methods |
| **2** | [Cloud Provider](WORKPLAN_PHASE_2_CLOUD_PROVIDER_2026-03-04.md) | Phase 1 | ~250 | CloudProvider interface, HetznerProvider, cloud-init renderer |
| **3** | [Provisioning Flow](WORKPLAN_PHASE_3_PROVISIONING_FLOW_2026-03-04.md) | Phase 1, 2 | ~300 | Server create/delete API, provision callback, timeout handler |
| **4** | [Tenant Routing](WORKPLAN_PHASE_4_TENANT_ROUTING_2026-03-04.md) | Phase 3 | ~200 | Subdomain routing, routing table, two-tier auth, WebSocket proxy |
| **5** | [API Tokens](WORKPLAN_PHASE_5_API_TOKENS_2026-03-04.md) | Phase 1, 4 | ~200 | Token CRUD, validation pipeline, dashboard UI |
| **6** | [Server Creation UI](WORKPLAN_PHASE_6_SERVER_CREATION_UI_2026-03-04.md) | Phase 2, 3 | ~200 | Plan selection modal, provisioning progress, server detail |
| **7** | [Codebase Cleanup](WORKPLAN_PHASE_7_CODEBASE_CLEANUP_2026-03-04.md) | All | ~100 | Remove local provisioning, stale config, dead code |

---

## Dependency Graph

```
Phase 0 (Infra)
    ↓
Phase 1 (Schema) ──────────────────┐
    ↓                               ↓
Phase 2 (Provider)            Phase 5 (API Tokens)
    ↓                               ↑
Phase 3 (Provisioning) ──→ Phase 4 (Routing)
    ↓                               ↓
Phase 6 (UI)                  Phase 5 (API Tokens)
    ↓                               ↓
              Phase 7 (Cleanup)
```

**Critical path for E2E test:** 0 → 1 → 2 → 3 → 4 → test

Phases 5 (API Tokens) and 6 (UI) can run in parallel after their dependencies are met.

Phase 7 (Cleanup) runs last after everything works.

---

## Infrastructure Details

| Resource | Current | Target |
|----------|---------|--------|
| Frontdoor VPS | `oracle-1` (cax31, legacy) | `frontdoor-1` (cax11, dedicated) |
| Cloud Network | None | `nexus-net` (10.0.0.0/16) |
| Cloud Firewall | None | `nexus-tenant-fw` |
| SSH Keys | `tyler-mbp` only | + `nexus-operator` |
| Snapshots | None | `nex-golden-v1` |
| DNS | Vercel DNS, no wildcard | + `*.nexushub.sh` wildcard A record |
| TLS | Stock Caddy, per-domain certs | Wildcard cert via certbot DNS-01 |
| Tenant VPS type | N/A (local processes) | CAX11/21/31 (ARM64) in nbg1 |

---

## Key Design Decisions

1. **One VPS per tenant** — full VM isolation, not containers
2. **All Hetzner, same datacenter (nbg1)** — private networking, low latency
3. **Frontdoor as provisioning service** — no separate provisioning service
4. **Wildcard DNS** — zero DNS management per tenant
5. **Two-tier auth** — platform auth (frontdoor validates) + app-level auth (VPS validates)
6. **Golden snapshots** — fast boot, deterministic, manually built per provider
7. **Provision callback** — VPS phones home with one-time token
8. **Dual routing** — path-based (dashboard) + subdomain-based (programmatic)
9. **Hard cutover** — no backwards compatibility with local provisioning
10. **Caddy + certbot** — certbot manages wildcard cert, Caddy uses cert files

---

## E2E Test Criteria

The implementation is complete when:

1. User logs into `frontdoor.nexushub.sh`
2. Clicks "New Server" → sees plan selection modal
3. Selects plan → clicks "Create"
4. Server appears with "Provisioning..." badge
5. Within 60 seconds, VPS boots from snapshot, starts nex runtime, phones home
6. Server status transitions to "Running"
7. User can launch an app → `t-xyz.nexushub.sh/app/spike/` loads
8. Control UI WebSocket connects through frontdoor to VPS
9. User can delete server → Hetzner VPS is destroyed
10. API token can be created and used for MCP access via tenant subdomain
