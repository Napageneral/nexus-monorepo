# Frontdoor Architecture

Date: 2026-02-27
Status: canonical
Owners: Nexus Platform

---

## 1) What Frontdoor Is

Frontdoor (`frontdoor.nexushub.sh`) is the canonical gateway for the Nexus hosted platform. It is the single entry point for all authenticated user interactions across every product (GlowBot, Spike, and future apps).

Frontdoor owns:

1. **Authentication**: Google OIDC flow, session management (`.nexushub.sh` domain cookies).
2. **Servers**: Provisioning, lifecycle, and management of isolated nex runtime instances.
3. **Apps**: Product registry, entitlements, installation on servers, and launch routing.
4. **Adapters**: Adapter catalog, installation on servers, credential configuration.
5. **Billing**: Product-branded checkout, plan management, entitlement enforcement.
6. **Admin**: Server admin (invites, access, billing per server) and platform operator admin (spending, accounts, usage).

---

## 2) Three Core Primitives

Frontdoor manages three primitives that customers interact with:

### 2.1 Servers

A server is an isolated nex runtime instance. It is the customer's execution environment and data isolation boundary.

1. Servers start as neutral runtime profiles.
2. Apps and adapters install on top of servers.
3. A single server can host multiple apps and adapters.
4. Each server is fully airgapped — no cross-server data access.

### 2.2 Apps

An app is an installable product surface — a UI and control surface that orchestrates the nex runtime to achieve a specific goal.

1. Apps register in the **product registry** with branding (name, tagline, accent color, logo), pricing tiers, and entitlement definitions.
2. App entitlement is account-level: you either own an app or you don't.
3. App installation is server-scoped: you install an app on a specific server.
4. Apps support two hosting modes on the runtime:
   - `kind: "static"` — runtime serves static files from a root directory.
   - `kind: "proxy"` — runtime proxies requests to a tenant-local app server process.
5. Apps register runtime-native method namespaces (`glowbot.*`, `spike.*`).
6. Apps can bundle default adapters that preinstall when the app installs.

Current apps: `glowbot`, `spike`, `control` (platform default).

### 2.3 Adapters

An adapter is a connector binary for external systems — it connects to and controls other apps, platforms, and devices.

1. Adapters use the Nex SDK and communicate via JSONL over stdin/stdout.
2. Adapters declare auth manifests describing what credentials they need.
3. Adapters install on servers similarly to apps.
4. Adapters can be free or paid.
5. When an app preinstalls adapters, users only need to configure credentials on first use.

Examples: Google Ads, Meta Ads, GitHub/Git, Zenoti EMR, Atlassian (Jira/Bitbucket), iOS device adapters.

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

1. **No server + no app entitlement** → Create server, grant app, install app + default adapters, land on dashboard.
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

## 6) Runtime Proxy and Trust Model

Frontdoor proxies all authenticated traffic to tenant runtimes:

1. `/app/<app-id>/*` → tenant runtime (app UIs).
2. `/runtime/*` → tenant runtime (control plane, method calls).
3. `/_next/*` → tenant runtime (Next.js chunk routing via referer-based app inference).

### 6.1 Trust chain

1. Product page → frontdoor (user intent).
2. Frontdoor handles OAuth, mints session.
3. Frontdoor proxies to runtime with bearer token (short-lived, frontdoor-issued).
4. Runtime verifies token signature, issuer, audience, tenant pinning.
5. For proxy-mode apps: runtime forwards to app server with trusted identity headers (`x-nexus-tenant-id`, `x-nexus-entity-id`, `x-nexus-session-id`, `x-nexus-app-id`).
6. App servers trust these headers as authoritative identity. Never trust raw browser identity.

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

1. Wildcard DNS (`*.nexushub.sh`) routes all tenant traffic through frontdoor.
2. Frontdoor terminates TLS, reverse-proxies to tenant VPS over private network.
3. Two-tier auth: platform auth (frontdoor validates) + app-level auth (VPS validates).
4. Full architecture: `TENANT_NETWORKING_AND_ROUTING_2026-03-04.md`

### 8.3 App install flow

1. Validate entitlement and server access.
2. Set install status: `installing`.
3. Apply runtime app-slot config mutation (static root or proxy target).
4. Preinstall bundled adapters.
5. Reconcile runtime app catalog.
6. Set status: `installed` (or `failed` with error).

### 8.3 Adapter install flow

1. Same pattern as app install.
2. Adapter is registered in runtime config.
3. User configures credentials through adapter auth manifest flow.

---

## 9) Related Specs

### Platform specs (in this directory)

1. `FRONTDOOR_CANONICAL_APP_SLOT_ARCHITECTURE_HARD_CUTOVER_2026-02-27.md` — detailed app-slot design with option analysis.
2. `SPEC_FRONTDOOR_SERVER_FIRST_APP_ENTITLEMENT_AND_INSTALL_HARD_CUTOVER_2026-02-27.md` — server-first data model and API contracts.
3. `SPEC_FRONTDOOR_ONE_SERVER_MULTI_APP_INSTALL_AND_LAUNCH_HARD_CUTOVER_2026-02-27.md` — multi-app per server UX and install orchestration.
4. `SPEC_FRONTDOOR_PROXY_NEXT_CHUNK_ROUTING_AND_SIGNED_IN_PRODUCT_PROVISIONING_HARD_CUTOVER_2026-02-27.md` — Next.js chunk routing fix and signed-in product provisioning.
5. `FRONTDOOR_WORKSPACE_ADMIN_CONTROL_PLANE_HARD_CUTOVER_2026-02-27.md` — admin control plane UI spec.
6. `FRONTDOOR_PRODUCT_REGISTRY_AND_BRANDED_BILLING_2026-02-26.md` — product registry and billing design.
7. `FRONTDOOR_SPIKE_E2E_GAP_CLOSURE_TODO_2026-02-27.md` — execution tracker.

### Product specs

1. GlowBot: `home/projects/glowbot/SPEC.md`
2. Spike: `home/projects/spike/docs/specs/SPEC-spike-frontdoor-product-aware-routing-allocation-policy-hard-cutover-2026-02-27.md`

### Runtime specs

1. `nexus-specs/specs/nex/hosted/HOSTED_RUNTIME_PROFILE.md` — hosted runtime invariants.
2. `nexus-specs/specs/nex/hosted/HOSTED_DIRECT_BROWSER_RUNTIME_CONTRACT.md` — direct-mode runtime profile (not canonical for product flows).
3. `nexus-specs/specs/nex/adapters/ADAPTER_CONNECTION_SERVICE.md` — adapter auth manifests and connection lifecycle.

### Infrastructure specs (in this directory)

1. `CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md` — cloud provider abstraction, Hetzner/AWS, snapshot strategy, provisioning/deprovisioning flows.
2. `TENANT_NETWORKING_AND_ROUTING_2026-03-04.md` — DNS, TLS, reverse proxy, two-tier auth, API tokens.

### Future specs (TODO)

1. `ADMIN_SERVER_PATTERN.md` — reusable admin server pattern for product monitoring.
2. Adapter store/library spec.
