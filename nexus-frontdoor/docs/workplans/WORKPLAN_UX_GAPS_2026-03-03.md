# Frontdoor UX Gap Closure: Spec, Workplan & Validation Ladder

**Date**: 2026-03-03
**Status**: Approved
**Scope**: End-to-end user experience from product page through app launch

---

## 1. Expected User Flow (North Star)

### 1.1 New User — Product Sign-Up Flow

```
1. User visits product page (e.g. spike.fyi or nexushub.sh/products/spike)
2. Clicks "Sign in with Google"
3. Google OAuth completes (~2-3 seconds)
4. INSTANT redirect to Nexus Dashboard (/?product=spike&provisioning=1)
   - Session created with OIDC identity (no tenant yet)
   - Dashboard shows provisioning banner: "Setting up your server..."
5. Background provisioning runs (~30-60 seconds):
   a. Auto-provisioner creates tenant runtime
   b. Runtime starts, loads config with ALL configured apps
   c. Server record created in frontdoor DB
   d. App subscriptions auto-granted for ALL configured apps
   e. ALL apps auto-installed on the new runtime
   f. Session principal updated with tenantId
6. Dashboard polls /api/auth/session every 3 seconds
7. When provisioning completes:
   - Provisioning banner disappears
   - "App Ready" modal appears: "Spike is ready! [Open App] [Stay on Dashboard]"
8. User clicks "Open App" → navigated to /app/spike/
9. Spike app loads inside the Nexus App Frame (44px header bar)
   - Header shows: Nexus logo | "Spike" badge | Server selector | Apps switcher | User menu
```

### 1.2 Returning User — Direct Login

```
1. User visits product page or frontdoor.nexushub.sh
2. Clicks "Sign in with Google"
3. OIDC resolves existing account + tenant instantly
4. Redirect to /app/spike/ (or last-used app)
5. App loads inside the Nexus App Frame
```

### 1.3 Dashboard Navigation

```
Dashboard (/):
  ├── Servers tab (default)
  │   ├── Server list with status badges
  │   └── Click server → Server Detail view
  │       ├── Server name + status + tier
  │       ├── Installed Apps grid (with Launch buttons)
  │       │   ├── Control Panel [● Always available] [Launch] → /app/control/chat  (SLOT 1 ALWAYS)
  │       │   ├── Spike [● Installed] [Launch] → /app/spike/
  │       │   └── GlowBot [● Installed] [Launch] → /app/glowbot/
  │       └── "Install an App" section → uninstalled owned apps
  ├── Apps tab
  │   ├── Library sub-tab: owned apps with install status
  │   └── Store sub-tab: browse/purchase new apps
  │       ├── Spike — AI-powered code intelligence [Get / Owned]
  │       └── GlowBot — AI-powered growth intelligence [Get / Owned]
  └── Admin tab (account settings)
```

### 1.4 App Frame (wraps all /app/* pages)

```
┌─────────────────────────────────────────────────────────────────┐
│ [Nexus] │ ● Spike ▾ │ [Server: Onyx Bridge ▾] │ [Tyler B. ▾] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                    App Content (proxied)                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

- Nexus logo → links to dashboard (/)
- App badge → dropdown to switch between installed apps
- Server selector → switch between servers
- User menu → account info, sign out
- MUST show even on error pages (404, 503) so user can navigate away
```

### 1.5 Nex Proxy Model for Apps

The nex runtime proxy strips the `/app/<appId>` prefix and forwards the rest to the upstream.
Apps MUST serve their content from the ROOT path `/`.

```
Request:  /app/spike/
Proxy:    strips /app/spike → sends "/" to upstream
Upstream: http://127.0.0.1:7422/ → must serve HTML at "/"

Request:  /app/spike/ask
Proxy:    strips /app/spike → sends "/ask" to upstream
Upstream: http://127.0.0.1:7422/ask → must handle API at "/ask"

SPA API calls must use /app/<appId>/<path> as the API prefix when running
inside the nex proxy (detected via window.location.pathname starting with /app/<appId>).
```

---

## 2. Gap Analysis — Current vs Expected

### GAP-1: `/app/spike/` Returns 404 (CRITICAL)

**Symptom**: After provisioning completes and user clicks "Open App", they get a plain-text `404 page not found` at `frontdoor.nexushub.sh/app/spike/`.

**Root Cause (CONFIRMED)**: The nex runtime correctly finds spike as a proxy app and proxies the request to spike at `http://127.0.0.1:7422`. The proxy strips `/app/spike` and sends just `/` to spike. Spike's Go `http.ServeMux` has handlers for `/app` and `/app/` but **no handler for `/`**, so Go's default handler returns `"404 page not found"`.

Confirmed via direct curl:
- `curl http://127.0.0.1:7422/` → `404 page not found` ❌
- `curl http://127.0.0.1:7422/app/spike/` → HTML ✅
- `curl http://127.0.0.1:7422/status` → JSON ✅

**Sub-issue (API routing)**: Spike's SPA uses `/runtime/*` prefix for API calls when behind frontdoor. But in nex proxy mode, `/runtime/*` goes to the nex runtime (not spike). The SPA needs to use `/app/spike/*` for API calls instead, since the nex proxy correctly forwards all `/app/spike/*` requests to spike.

**Fix (spike-side — separate agent)**:
1. Add root `/` handler in spike's Go mux → serves runtime app HTML
2. Update SPA `apiPath()` to detect `/app/<id>` URL prefix and use it for API paths
3. Update SPA `inspectorPath()` similarly

**Fix (frontdoor-side — no changes needed)**: The proxy logic is correct as-is.

---

### GAP-2: No Frontdoor App Frame on Error Pages (HIGH)

**Symptom**: When `/app/spike/` returns 404, the user sees a bare white page with just "404 page not found" — no navigation, no way to get back to the dashboard.

**Root Cause**: `proxyRuntimeDocumentWithAppFrame()` in server.ts only injects the app frame when the runtime response is 200 + HTML. Non-200 responses pass through unchanged (line ~2458-2466).

**Fix**: For error responses (4xx, 5xx), generate a friendly error page WITH the app frame injected:
- The Nexus App Frame header (so user can navigate)
- A centered error message: "This app couldn't be loaded" + status code
- A "Back to Dashboard" button
- The original error details in a collapsible section (for debugging)

**Files**: `nexus-frontdoor/src/server.ts:2458-2466` — `proxyRuntimeDocumentWithAppFrame()`

---

### GAP-3: App Store Is Empty + No Auto-Sync (HIGH)

**Symptom**: Dashboard → Apps → Store shows "No apps available in the store."

**Root Cause**: The `frontdoor_products` table has no records. Product sync tool exists but was never run after data wipe. No auto-sync mechanism.

**Fix**:
1. Add a `productManifests` config array to frontdoor config (or env `FRONTDOOR_PRODUCT_MANIFEST_PATHS`)
2. On startup, sync all configured manifests to the products table
3. This makes product catalog resilient to data wipes

**Files**:
- `nexus-frontdoor/src/product-sync.ts` — Existing sync logic (extract into importable function)
- `nexus-frontdoor/src/server.ts` — Add startup sync call
- `apps/glowbot-app/app.nexus.json` — GlowBot manifest
- `apps/spike-app/app.nexus.json` — Spike manifest

---

### GAP-4: Only Intent App Gets Entitlement (MEDIUM)

**Symptom**: GlowBot shows "Not Installed" / "Entitlement: Inactive" on server detail, even though the runtime has it configured.

**Root Cause**: Background provisioning only creates subscription + install for the intent app (the product from the signup URL). Other configured apps get no subscription.

**Concrete scenario**: User signs up via spike.fyi → `productId = "spike"`.
- Spike: gets `createAppSubscription()` + `ensureRuntimeAppInstalled()` ✅
- GlowBot: configured in runtime but NO subscription, NO install record ❌

**Fix**:
1. Add `configured_apps` to provision command JSON output (e.g. `["spike", "glowbot"]`)
2. Store this in the provision result (add field to `ProvisionCommandResult` type)
3. In background provisioning, loop through ALL configured apps and create subscriptions + installs

**Files**:
- `nexus-frontdoor/scripts/provision-tenant-local.mjs:719-728` — Add `configured_apps` to output
- `nexus-frontdoor/src/tenant-autoprovision.ts` — Store configured_apps in provision result
- `nexus-frontdoor/src/server.ts:5324-5338` — Loop through all apps for subscriptions + installs

---

### GAP-5: Control Panel Always Available in Slot 1 (MEDIUM)

**Symptom**: No visible way to access the nex control panel from the dashboard.

**Root Cause**: `control` app is filtered out of dashboard at `index.html` line 1348.

**Fix**: Remove the filter. Show Control Panel as the FIRST card (slot 1) in the server detail Installed Apps grid. It should always appear regardless of what other apps are installed. It is the core nex platform offering.

Display:
- Name: "Control Panel"
- Badge: ● Always available (or just ● Installed)
- Launch → `/app/control/chat`

**Files**: `nexus-frontdoor/public/index.html:1348` — `renderServerApps()`

---

## 3. Workplan — Prioritized Fix Order

### Phase 1: GAP-1 — Spike-Side Fix (Owner: Spike Agent)

Spike needs to serve content from `/` (root) for nex proxy compatibility:
1. Add root `/` handler in Go mux
2. Update SPA `apiPath()` for nexus proxy mode
3. Update SPA `inspectorPath()` for nexus proxy mode
4. Deploy updated spike

### Phase 2: GAP-2 — Error Page with App Frame (Owner: This Agent)

| # | Task | Files | Est |
|---|------|-------|-----|
| 2.1 | In `proxyRuntimeDocumentWithAppFrame()`, generate friendly error page with app frame for non-200 responses | `server.ts:2458-2466` | 30m |
| 2.2 | Deploy + verify error pages show navigation | Build + deploy + test | 10m |

### Phase 3: GAP-3 — Product Auto-Sync on Startup (Owner: This Agent)

| # | Task | Files | Est |
|---|------|-------|-----|
| 3.1 | Extract product-sync logic into an importable `syncProductFromManifest()` function | `product-sync.ts` | 15m |
| 3.2 | Add `FRONTDOOR_PRODUCT_MANIFEST_PATHS` env support + startup sync call | `server.ts`, `config.ts` | 20m |
| 3.3 | Add manifest paths to production env file | `/etc/spike-frontdoor/frontdoor.env` | 5m |
| 3.4 | Deploy + verify App Store populates automatically | Build + deploy + test | 10m |

### Phase 4: GAP-4 — Entitlements for All Configured Apps (Owner: This Agent)

| # | Task | Files | Est |
|---|------|-------|-----|
| 4.1 | Add `configured_apps` array to provision command JSON output | `provision-tenant-local.mjs` | 10m |
| 4.2 | Parse `configured_apps` from provision result in autoprovision store | `tenant-autoprovision.ts` | 10m |
| 4.3 | In background provisioning, loop all configured apps for subscriptions + installs | `server.ts` | 20m |
| 4.4 | Deploy + verify all apps show active entitlements | Build + deploy + test | 10m |

### Phase 5: GAP-5 — Control Panel Card (Owner: This Agent)

| # | Task | Files | Est |
|---|------|-------|-----|
| 5.1 | Remove control app filter, ensure control is slot 1 in server detail | `index.html` | 15m |
| 5.2 | Deploy + verify control panel card shows and launches | Deploy + test | 5m |

### Phase 6: Polish

| # | Task | Files | Est |
|---|------|-------|-----|
| 6.1 | Force Servers tab during provisioning | `index.html` | 15m |
| 6.2 | Use generated server name (e.g. "Onyx Bridge") as primary display | `index.html` | 10m |
| 6.3 | Clean up `provisioning=1` URL param after provisioning completes | `index.html` | 5m |

---

## 4. Validation Ladder

Each rung must PASS before proceeding to the next.
Rungs are ordered by dependency — each rung builds on the previous.

### Rung 0: Spike-Side Gate (Phase 1 — Spike Agent)

**Pre-condition**: Spike agent has deployed root handler + SPA apiPath fix.
**Gate**: This rung must pass before any frontdoor work can be validated E2E.

| # | Check | Expected |
|---|-------|----------|
| 0.1 | `curl http://127.0.0.1:7422/` (direct, with auth header) | Returns spike runtime HTML (not "404 page not found") |
| 0.2 | `curl http://127.0.0.1:7422/status` (direct, with auth header) | Returns JSON `{"trees":[...]}` |
| 0.3 | `curl http://127.0.0.1:7422/ask` (direct, POST) | Returns valid response (not 404) |
| 0.4 | Spike SPA HTML contains updated `apiPath()` with nexus proxy detection | `window.location.pathname.match(/^(\/app\/[^/]+)/)` pattern present |

### Rung 1: Proxy Chain — All Three App Types (Phase 1 + 2)

**Pre-condition**: Rung 0 passes. Tenant runtime running. Frontdoor deployed with error page fix.
Tests the full proxy chain for each distinct app type.

| # | Check | Expected |
|---|-------|----------|
| 1.1 | `GET /app/spike/` via frontdoor (authenticated) | Spike HTML wrapped in Nexus app frame (44px header bar) |
| 1.2 | `GET /app/spike/status` via frontdoor | Spike API JSON (proxied through nex runtime to spike Go service) |
| 1.3 | `GET /app/glowbot/` via frontdoor | GlowBot HTML wrapped in Nexus app frame (proxied to Vercel) |
| 1.4 | `GET /app/control/chat` via frontdoor | Control Panel UI loads (nex runtime built-in, NOT a proxy app) |
| 1.5 | Spike SPA loads at `/app/spike/`, status section shows tree data | SPA renders AND `apiPath()` correctly calls `/app/spike/status` |
| 1.6 | App frame Nexus logo links to dashboard `/` | Clicking logo navigates to dashboard |
| 1.7 | `GET /app/nonexistent/` via frontdoor | Friendly error page WITH app frame header + "Back to Dashboard" |
| 1.8 | `GET /app/spike/` when runtime is down | Friendly error page WITH app frame header (not blank/raw error) |

### Rung 2: Product Catalog (Phase 3)

**Pre-condition**: Frontdoor deployed with auto-sync. Manifest paths configured in env.

| # | Check | Expected |
|---|-------|----------|
| 2.1 | Frontdoor starts → check DB for products | `frontdoor_products` table has spike + glowbot rows |
| 2.2 | `GET /api/apps/catalog` | Returns 2 items: spike (accent #10b981) + glowbot (accent #6366f1) |
| 2.3 | Dashboard → Apps → Store tab | Shows both products with display name, tagline |
| 2.4 | Restart frontdoor after data wipe | Products re-sync automatically on startup |

### Rung 3: New User Sign-Up E2E (Phase 4 + 5)

**Pre-condition**: Fresh data wipe, all phases deployed, auto-sync configured

| # | Check | Expected |
|---|-------|----------|
| 3.1 | Visit product page → Sign in with Google | OIDC callback < 3s → redirect to `/?product=spike&provisioning=1` |
| 3.2 | Dashboard lands on Servers tab with provisioning banner visible | "Setting up your server..." with spinner |
| 3.3 | Background provisioning completes | < 90 seconds, no errors in frontdoor logs |
| 3.4 | "App Ready" modal appears | Shows "Spike is ready!" + "Open App" button |
| 3.5 | Click "Open App" → spike loads in app frame | HTML renders + SPA status section shows tree data |
| 3.6 | Navigate back to dashboard → server detail page | Server name shows generated name (e.g. "Onyx Bridge"), status "Ready" |
| 3.7 | Server detail: Control Panel card is in slot 1 | Badge: "● Always available", Launch → `/app/control/chat` loads |
| 3.8 | Server detail: Spike card shows Installed + Active | Launch button works |
| 3.9 | Server detail: GlowBot card shows Installed + Active | Entitlement active (not "Inactive"), Launch button works |
| 3.10 | Apps → Store tab shows both products | Already owned indicator on both |
| 3.11 | Apps → Library tab shows both apps as active | Install count shows "Installed on 1 server" |
| 3.12 | URL no longer has `provisioning=1` param | Cleaned up after provisioning completes |

### Rung 4: Returning User

| # | Check | Expected |
|---|-------|----------|
| 4.1 | Sign out, sign back in via same product page | No provisioning banner, instant resolve |
| 4.2 | Redirect to `/app/spike/` (or dashboard) | < 3 seconds total |
| 4.3 | All apps still installed and launchable | Server detail unchanged from Rung 3 |
| 4.4 | Switch between apps via app frame header | App switcher dropdown works |

### Rung 5: Error Recovery

| # | Check | Expected |
|---|-------|----------|
| 5.1 | Navigate to `/app/nonexistent/` | Friendly error page with app frame + "Back to Dashboard" link |
| 5.2 | Kill tenant runtime process, navigate to `/app/spike/` | Error page with app frame (not blank white page) |
| 5.3 | Restart tenant runtime, navigate to `/app/spike/` | App recovers and loads normally |
| 5.4 | Force provisioning failure (e.g. invalid config), attempt sign-up | Dashboard shows "Setup failed" with error details |

---

## 5. Architecture Notes

### Nex Proxy Model for Apps

```
App mounted at /app/<appId>/
Proxy strips prefix, forwards to upstream at root.

/app/spike/          → http://upstream:7422/          (HTML)
/app/spike/ask       → http://upstream:7422/ask       (API)
/app/spike/status    → http://upstream:7422/status    (API)
/app/spike/_next/... → http://upstream:7422/_next/... (assets)

SPA running at /app/spike/ detects prefix via:
  window.location.pathname.match(/^(\/app\/[^/]+)/)
API calls use that prefix:
  fetch("/app/spike/ask", {...})  ← nex proxy forwards to /ask
```

### Background Provisioning Data Flow

```
OIDC Callback (Phase 1 - synchronous, < 1s):
    ├── resolvePrincipal() → principal from OIDC claims (no tenant)
    ├── store.resolveOrCreateOidcUser()
    ├── sessions.createSession(principal)
    ├── setCookie()
    └── res.redirect("/?product=spike&provisioning=1")

OIDC Callback (Phase 2 - background async):
    ├── autoProvisioner.resolveOrProvision()
    │   ├── runProvisionCommand() → spawns provision-tenant-local.mjs
    │   │   ├── Write state/config.json (with ALL apps)
    │   │   ├── Spawn nexus runtime run
    │   │   ├── waitForPort(32000)
    │   │   ├── seedIdentity()
    │   │   └── stdout → JSON {tenant_id, runtime_url, configured_apps, ...}
    │   ├── buildTenantConfigFromCommand()
    │   ├── store.completeProvisionSuccess()
    │   └── setTenantInConfig()
    ├── store.createServer() + updateServer(status: "ready")
    ├── For EACH configured app:
    │   ├── store.createAppSubscription({appId, planId: "default"})
    │   └── ensureRuntimeAppInstalled({appId})
    └── sessions.updateSessionPrincipal() → add tenantId
```

---

## 6. Production Environment Reference

| Component | Location |
|-----------|----------|
| Frontdoor service | `spike-frontdoor.service` → `/opt/spike/frontdoor/dist/index.js` |
| Frontdoor config | `/etc/spike-frontdoor/frontdoor.config.json` |
| Frontdoor env | `/etc/spike-frontdoor/frontdoor.env` |
| Workspace DB | `/var/lib/spike-frontdoor/frontdoor-workspaces.db` |
| Sessions DB | `/var/lib/spike-frontdoor/frontdoor-sessions.db` |
| Autoprovision DB | `/var/lib/spike-frontdoor/frontdoor-autoprovision.db` |
| Tenant dirs | `/opt/spike/frontdoor/.tenants/<tenant-id>/` |
| Nex runtime binary | `/opt/spike/nexus-runtime/node_modules/.bin/nexus` |
| Nex runtime dist | `/opt/spike/nexus-runtime/node_modules/nexus/dist/` |
| Control UI assets | `/opt/spike/nexus-runtime/node_modules/nexus/dist/control-ui/` |
| Frontdoor public | `/opt/spike/frontdoor/public/` |
| Provision script | `/opt/spike/frontdoor/scripts/provision-tenant-local.mjs` |
| Spike app manifest | `/opt/spike/frontdoor/manifests/spike-app/app.nexus.json` (TBD) |
| GlowBot app manifest | `/opt/spike/frontdoor/manifests/glowbot-app/app.nexus.json` (TBD) |
