# Frontdoor Architecture

Date: 2026-02-27 (updated 2026-03-10)
Status: canonical
Owners: Nexus Platform

---

## 1) What Frontdoor Is

Frontdoor (`frontdoor.nexushub.sh`) is the canonical gateway for the Nexus hosted platform. It is the single entry point for all authenticated user interactions across every product (GlowBot, Spike, and future apps).

Frontdoor owns:

1. **Authentication**: Google OIDC flow, session management (`.nexushub.sh` domain cookies), API token auth (`nex_t_...`).
2. **Servers**: Provisioning, lifecycle, durability, recovery, and management of isolated nex runtime instances on cloud provider VMs.
3. **Apps**: Product catalog, entitlements, package distribution, installation planning, and launch routing.
4. **Adapters**: Adapter catalog, adapter package dependencies, installation planning, and credential configuration.
5. **Billing**: Prepaid credits, Stripe payment integration, hourly usage billing, 7-day free tier, product-branded checkout.
6. **Admin**: Server admin (invites, access, billing per server) and platform operator admin (spending, accounts, usage).
7. **Programmatic Access**: MCP server for AI agent platform management, API token system for headless workflows.

---

## 2) Three Core Primitives

Frontdoor manages three primitives that customers interact with:

### 2.1 Servers

A server is the customer's durable execution environment and data isolation boundary. The backing provider VM is replaceable infrastructure, not the customer-facing machine identity.

1. Servers start as neutral runtime profiles.
2. Apps and adapters install on top of servers.
3. A single server can host multiple apps and adapters.
4. Each server is fully airgapped — no cross-server data access.
5. Servers are durable customer assets with archive and restore semantics; destroy is exceptional rather than the default lifecycle.

### 2.2 Apps

An app is an installable product surface — a UI and control surface that orchestrates the nex runtime to achieve a specific goal.

1. Apps register in the **product registry** with branding (name, tagline, accent color, logo), pricing tiers, and entitlement definitions.
2. App entitlement is account-level: you either own an app or you don't.
3. App installation is server-scoped: you install an app on a specific server.
4. Apps are manifest-driven packages hosted by the nex runtime.
5. Apps may be inline or service-routed, and may declare multiple services.
6. Apps may depend on separately installable adapter and service packages.

Current apps: `glowbot`, `spike`, `control` (platform default).

### 2.3 Adapters

An adapter is a connector binary for external systems — it connects to and controls other apps, platforms, and devices.

1. Adapters use the Nex SDK and communicate via JSONL over stdin/stdout.
2. Adapters declare auth manifests describing what credentials they need.
3. Adapters are first-class installable packages in the shared package registry.
4. Adapters can be free or paid.
5. Apps may require adapters, but those adapters remain independently installable and removable at the server level.

Examples: Google Ads, Meta Ads, GitHub/Git, Zenoti EMR, Atlassian (Jira/Bitbucket), iOS device adapters.

Managed provider connection routing and platform-managed profiles are specified
in:

- `FRONTDOOR_MANAGED_CONNECTION_PROFILES.md`

App-branded managed provider secrets belong to product control planes, not to
frontdoor.

---

## 3) Product Owned Signup UX (Thin Product Domains)

Each product has its own public domain that serves as a branded entry point:

1. `glowbot-demo.vercel.app` — GlowBot marketing and branding.
2. `spike.fyi` — Spike marketing and branding.

Product pages are thin. They own branding and marketing copy. They do NOT own:

1. Authentication (frontdoor does).
2. Pricing (frontdoor does — product pages link to frontdoor pricing pages).
3. Signup flow mechanics (frontdoor does).

Product page CTA links to `frontdoor.nexushub.sh/?app=<app_id>&entry=<source>`. Frontdoor shows a product-branded conversion page, handles auth, and completes onboarding.

---

## 4) Entry Intent Resolution

When a user arrives (from a product page or directly), frontdoor resolves what to do based on their state.

### 4.1 Entry intent contract

Product pages link to frontdoor with:

1. `app_id` (required): `glowbot` or `spike`.
2. `entry_source` (optional): attribution slug.
3. `server_id` (optional): explicit target server.
4. `create_new_server` (optional): explicit new-server intent.

### 4.2 Resolution outcomes

1. **No server + no app entitlement** → Create server, grant app, install the app and its required packages, land on dashboard.
2. **Has server + no app entitlement** → Grant app, install on existing server (default), land on dashboard.
3. **Has server + has app** → Land on dashboard, user launches.
4. **Explicit new server intent** → Create additional server regardless of existing servers.

### 4.3 Frictionless onboarding

First-time users never need to understand servers or installs. They click "Get Started" on the product page, sign in with Google on frontdoor, and end up in the app.

---

## 5) Frontdoor UI Information Architecture

### 5.1 Servers (sidebar tab, default view)

Card list of all servers with status badges (`ready`, `provisioning`, `degraded`, `failed`).

Click a server → popover/modal with:
1. Server details and status.
2. Installed app cards with states (`installed`, `installing`, `not_installed`, `blocked`, `failed`).
3. Launch button for installed apps.
4. Install button for owned-but-not-installed apps.

### 5.2 Apps (sidebar tab)

Two subtabs in the main panel:

1. **Library** — apps you own and where they're installed across servers.
2. **Store** — discover and purchase new apps. Purchase grants account-level entitlement.

### 5.3 Adapters (sidebar tab, same pattern as Apps)

1. **Library** — adapters installed on your servers.
2. **Store** — discover and install adapters (free or paid).

### 5.4 Admin (sidebar tab)

1. **Server admin**: Invite users, manage access/roles, billing per server.
2. **Platform operator admin**: Spending, server counts, accounts, usage across the whole platform.

---

## 6) Hosted Access and Trust Model

Frontdoor serves two hosted routing profiles:

1. **Platform shell profile** — human launch at `frontdoor.nexushub.sh/app/<appId>/`
2. **Tenant origin profile** — direct runtime origin at `t-<tenantId>.nexushub.sh`

In the platform shell profile, frontdoor owns the top-level browser document and
renders app content inside a dedicated iframe-backed embedded boundary. HTML
injection is not the canonical shell model.

The shared path contract remains:

1. `/app/<app-id>/*`
2. `/runtime/*`
3. `/auth/<service>/callback`

### 6.1 Trust chain

1. Product page → frontdoor (user intent).
2. Frontdoor handles OAuth, mints session.
3. Frontdoor mints runtime access tokens for browser and client runtime access.
4. Frontdoor uses runtime trusted credentials for private operator traffic.
5. Runtime verifies runtime access and tenant pinning.

### 6.2 Non-negotiable constraints

1. Hard cutover only — no backwards-compat behavior.
2. Airgapped tenant isolation is mandatory.
3. No silent fallback from requested app to control UI.
4. Expired/invalid tokens are rejected with explicit auth errors.

---

## 7) Product Registry

The product registry stores per-app metadata that powers product-branded experiences.

Per app:
1. `app_id`, `display_name`, `tagline`.
2. `accent_color`, `logo_svg`.
3. `homepage_url` (product page domain).
4. Pricing tiers and entitlement definitions.

This registry drives:
1. Product-branded conversion pages on frontdoor.
2. Product-branded checkout (GlowBot gold, Spike green).
3. Product-branded billing/plan management.
4. App store listings.

---

## 8) Provisioning Model

### 8.1 Server provisioning (Cloud VPS)

1. Each server maps to a dedicated cloud VPS (one VPS per tenant).
2. Frontdoor is the provisioning orchestrator — creates VPS via cloud provider API.
3. Golden snapshot images have nex runtime pre-installed; cloud-init handles tenant-specific config.
4. VPS phones home to frontdoor when ready (provision callback with one-time token).
5. Frontdoor adds VPS to routing table and marks server as "running".
6. Full architecture: `CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md`

### 8.2 Tenant networking and routing

1. Frontdoor owns the human shell profile at `frontdoor.nexushub.sh`.
2. Tenant origins (`t-<tenantId>.nexushub.sh`) remain the direct runtime origin for callbacks, webhooks, machine-facing traffic, and custom domains.
3. Frontdoor terminates TLS and routes traffic to tenant runtimes over private network.
4. Full architecture: `FRONTDOOR_HOSTED_ACCESS_AND_ROUTING.md`

### 8.3 App install flow

1. Validate entitlement (active subscription in `frontdoor_app_subscriptions`) and server access.
2. Resolve the target app release and all required package dependencies.
3. Stage package artifacts on the VPS via the private network.
4. Call the runtime operator lifecycle endpoints in dependency order.
5. Runtime validates, activates, and health-checks the releases.
6. Frontdoor records desired and active package state.
7. On new server provisioning: auto-install uses the same package lifecycle system.
8. Full architecture: `FRONTDOOR_PACKAGE_REGISTRY_AND_LIFECYCLE.md`

### 8.4 Adapter install flow

1. Same package lifecycle pattern as app install.
2. Adapters may be installed directly or pulled in as app dependencies.
3. User configures credentials through the shared adapter connection system.

---

## 9) Related Specs

### Platform specs (in this directory)

1. `CRITICAL_CUSTOMER_FLOWS_2026-03-02.md` — all user flows (F1–F29) from signup through admin.
2. `BILLING_ARCHITECTURE_ACCOUNT_MODEL_2026-03-02.md` — account model, server credits, app subscriptions, and billing separation.
3. `FRONTDOOR_SHELL_AND_EMBEDDED_APP_MODEL.md` — frontdoor-owned shell document, embedded app boundary, and durable platform chrome.
4. `FRONTDOOR_OBJECT_TAXONOMY.md` — canonical frontdoor vocabulary for hosted terms, packages, routing, and connection profiles.
5. `FRONTDOOR_HOSTED_ACCESS_AND_ROUTING.md` — shell profile, tenant-origin profile, DNS, tokens, callback and webhook routing.
6. `FRONTDOOR_PACKAGE_REGISTRY_AND_LIFECYCLE.md` — package registry, releases, dependencies, install and upgrade orchestration.
7. `FRONTDOOR_MANAGED_CONNECTION_PROFILES.md` — frontdoor-owned managed-connection gateway behavior and product-control-plane routing.

### Archived specs (in `_archive/`)

Superseded by the specs above. Kept for historical reference:
1. `FRONTDOOR_CANONICAL_APP_SLOT_ARCHITECTURE_HARD_CUTOVER_2026-02-27.md` — app-slot option analysis (decisions captured in this doc).
2. `SPEC_FRONTDOOR_SERVER_FIRST_APP_ENTITLEMENT_AND_INSTALL_HARD_CUTOVER_2026-02-27.md` — server-first data model (captured in billing spec).
3. `SPEC_FRONTDOOR_ONE_SERVER_MULTI_APP_INSTALL_AND_LAUNCH_HARD_CUTOVER_2026-02-27.md` — multi-app orchestration (captured in customer flows).
4. `SPEC_FRONTDOOR_PROXY_NEXT_CHUNK_ROUTING_AND_SIGNED_IN_PRODUCT_PROVISIONING_HARD_CUTOVER_2026-02-27.md` — implemented bug fixes.
5. `FRONTDOOR_SPIKE_E2E_GAP_CLOSURE_TODO_2026-02-27.md` — completed execution tracker.
6. `CROSS_DOC_ALIGNMENT_FRONTDOOR_APP_SLOT_2026-02-27.md` — alignment directive (decisions baked into architecture).
7. `FRONTDOOR_PRODUCT_REGISTRY_AND_BRANDED_BILLING_2026-02-26.md` — superseded by the active billing spec.
8. `_archive/FRONTDOOR_WORKSPACE_ADMIN_CONTROL_PLANE_HARD_CUTOVER_2026-02-27.md` — archived dashboard cutover plan (completed before the hosted server-first cleanup).
9. `_archive/FRONTDOOR_APP_FRAME_AND_DOCK_2026-03-02.md` — superseded injection-era shell model retained for historical reference only.
10. `_archive/NEX_APP_MANIFEST_AND_LIFECYCLE_2026-03-02.md` — superseded by the runtime-owned app manifest canon in `nex/docs/specs/apps/app-manifest-and-package-model.md`.

### Product specs

1. GlowBot: `apps/glowbot/docs/README.md`
2. Spike: `apps/spike/docs/README.md`

### Runtime specs

1. `nex/docs/specs/platform/platform-model.md` — canonical hosted platform vocabulary and ownership model.
2. `nex/docs/specs/platform/runtime-access-and-routing.md` — canonical hosted access, routing, DNS, and transport contract.
3. `nex/docs/specs/platform/package-registry-and-release-lifecycle.md` — canonical hosted package registry, releases, install, upgrade, and rollback contract.
4. `nex/docs/specs/platform/packages-and-control-planes.md` — canonical package/control-plane ownership split.
5. `nex/docs/specs/platform/product-control-plane-servers-and-admin-apps.md` — canonical deployment and visibility model for operator-only product control plane servers and admin apps.
6. `nex/docs/specs/platform/managed-connection-gateway.md` — canonical runtime-to-frontdoor managed-connection gateway model.
7. `nex/docs/specs/apps/app-manifest-and-package-model.md` — canonical app package and manifest contract.
8. `nex/docs/specs/adapters/adapter-connections.md` — canonical shared adapter connection model.

### Infrastructure specs (in this directory)

1. `CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md` — cloud provider abstraction, Hetzner/AWS, snapshot strategy, and frontdoor infrastructure behavior under the durable server lifecycle.
2. `TENANT_NETWORKING_AND_ROUTING_2026-03-04.md` — frontdoor ingress, wildcard DNS/TLS, private-network routing, and shell-profile boundary behavior.
3. `FRONTDOOR_HOSTED_ACCESS_AND_ROUTING.md` — frontdoor routing, DNS, TLS, token layering, callback and webhook ownership.
