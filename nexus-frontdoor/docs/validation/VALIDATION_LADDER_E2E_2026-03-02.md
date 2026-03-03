# E2E Validation Ladder

Date: 2026-03-02
Status: active
Purpose: Incrementally validate the Nexus platform from isolated components up to a complete end-to-end user flow.

---

## Philosophy

Each rung of the ladder validates a specific layer. You can't advance until the previous rung passes. Failures at lower rungs are fixed before attempting higher rungs.

**Target E2E flow:**
```
User visits product website → clicks "Get Started"
  → Frontdoor signup (create account)
  → Choose product plan (GlowBot or Spike)
  → Frontdoor provisions a server
  → Frontdoor installs app on server
  → User sees app UI in the frontdoor app frame (44px top bar)
  → User interacts with app (call methods, see data)
```

---

## The Ladder

### Rung 1: Frontdoor Boots Clean

**What:** The frontdoor server starts without errors. The new `frontdoor-store.ts` (account model) initializes its SQLite database. No "workspace" terminology in any active code path.

**Validation:**
- [ ] `npm run build` succeeds (TypeScript compiles)
- [ ] `npm start` boots without crash
- [ ] Health endpoint responds: `GET /health` → 200
- [ ] Database tables created: `frontdoor_accounts`, `frontdoor_servers`, `frontdoor_products`, `frontdoor_product_plans`, `frontdoor_server_app_installs`
- [ ] No "workspace" in any SQL table name or active route handler

**Blockers to expect:** Compile errors from the massive `frontdoor-store.ts` and `server.ts` rewrites. Missing imports, type mismatches, function signature changes.

---

### Rung 2: Product Website Renders

**What:** The frontdoor serves the product website (public/index.html) and it renders correctly.

**Validation:**
- [ ] `GET /` → serves public/index.html → 200
- [ ] Page renders in browser (no blank page, no JS errors)
- [ ] Product branding visible (GlowBot, Spike cards with plans)
- [ ] "Get Started" / signup button visible and clickable
- [ ] Static assets (CSS, JS) load correctly

**Blockers to expect:** Broken asset paths, missing CSS, JS errors in the rewritten HTML.

---

### Rung 3: Account Signup Flow

**What:** A user can create an account through the frontdoor signup flow.

**Validation:**
- [ ] Signup form renders (email, password, account name)
- [ ] Form submission creates account in `frontdoor_accounts`
- [ ] Session cookie set after signup
- [ ] Redirect to dashboard/onboarding after signup
- [ ] Account record has correct fields (no "workspace" columns)

**Blockers to expect:** Auth flow broken by store rewrite, session management issues, OIDC integration gaps.

---

### Rung 4: Product Sync (Manifest → Database)

**What:** The `product-sync.ts` tool reads app manifests and syncs product data to frontdoor's database.

**Validation:**
- [ ] Sync tool reads `apps/glowbot-app/app.nexus.json` product section
- [ ] Upserts GlowBot product in `frontdoor_products`
- [ ] Upserts GlowBot plans (starter, clinic, multi) in `frontdoor_product_plans`
- [ ] Sync tool reads `apps/spike-app/app.nexus.json` product section
- [ ] Upserts Spike product and plans
- [ ] Product data matches manifest (display name, accent color, tagline, plan pricing)
- [ ] Re-running sync is idempotent (no duplicate records)

**Blockers to expect:** Manifest format differences between what the sync tool expects and what the actual manifests contain. Schema column mismatches.

---

### Rung 5: Server Provisioning

**What:** An authenticated user can provision a server (nex runtime instance).

**Validation:**
- [ ] Logged-in user sees "Servers" tab/page
- [ ] "Add Server" creates a record in `frontdoor_servers` linked to the account
- [ ] Server has a unique ID and connection URL
- [ ] Server status shows as "pending" or "active"

**Blockers to expect:** UI routing issues, server provisioning API not wired up.

---

### Rung 6: Nex Runtime Boots + App Discovery

**What:** The nex runtime starts, discovers app packages from the apps directory, and builds the app registry.

**Validation:**
- [ ] Runtime starts without crash
- [ ] Discovery scans the configured apps directory
- [ ] GlowBot manifest parsed and validated
- [ ] Spike manifest parsed and validated (service-routed mode detected)
- [ ] Both apps registered in AppRegistry
- [ ] Handler mode correctly identified: GlowBot = inline-TS, Spike = service-routed
- [ ] IAM entries auto-generated for all methods (13 GlowBot + 34 Spike)

**Blockers to expect:** Manifest validation errors (the actual manifests may not match the parser's expected format). Apps directory path configuration. Import resolution for dynamic jiti loading.

---

### Rung 7: GlowBot Method Calls (Inline-TS)

**What:** GlowBot's inline-TS handlers are loaded and callable through the runtime.

**Validation:**
- [ ] GlowBot handlers loaded via jiti from `apps/glowbot-app/methods/index.ts`
- [ ] `glowbot.overview` call returns demo data (hero stat, adapter status, pipeline status)
- [ ] `glowbot.agents` call returns agent list
- [ ] IAM check passes for authenticated user
- [ ] IAM check blocks unauthorized user
- [ ] Method params validated against JSON Schema

**Blockers to expect:** jiti import failures, context construction errors, seed data module resolution.

---

### Rung 8: GlowBot UI Serving

**What:** GlowBot's static UI files are served by the runtime.

**Validation:**
- [ ] `GET /app/glowbot/` serves GlowBot's `dist/index.html`
- [ ] SPA fallback works: `GET /app/glowbot/dashboard` serves `index.html`
- [ ] Static assets (JS, CSS) load correctly
- [ ] UI renders in browser without JS errors
- [ ] UI can call GlowBot methods via WebSocket (nex client SDK)

**Blockers to expect:** GlowBot static export may not exist yet (requires `next build` on the GlowBot project). Asset path rewriting issues.

---

### Rung 9: App Frame Injection

**What:** The frontdoor's 44px app frame (top navigation bar) is injected into the app's HTML response.

**Validation:**
- [ ] When frontdoor proxies to app UI, the response includes the app frame HTML
- [ ] App frame shows: current app name, app switcher, account context
- [ ] App frame CSS doesn't break the app's UI
- [ ] App switching works (navigate between GlowBot and Control panel)

**Blockers to expect:** HTML injection logic in server.ts, CSS conflicts, app frame not rendering.

---

### Rung 10: App Install via Frontdoor

**What:** A user can install an app on their server through the frontdoor UI.

**Validation:**
- [ ] User sees "Apps" tab with available apps (GlowBot, Spike)
- [ ] Clicking "Install" sends request to runtime management API
- [ ] `POST /api/apps/install` on runtime succeeds
- [ ] `onInstall` lifecycle hook runs (GlowBot: creates SQLite schema)
- [ ] App status changes to "active" in frontdoor
- [ ] App UI becomes accessible at `/app/glowbot/`

**Blockers to expect:** Management API not connected to frontdoor. Runtime management API auth. Lifecycle hook execution failures.

---

### Rung 11: Spike Service Start (Service-Routed)

**What:** Spike's Go engine binary starts as a managed service and operations dispatch to it.

**Validation:**
- [ ] Runtime spawns `spike-engine` binary on app activate
- [ ] Port assignment works (`{{port}}` substituted)
- [ ] Health check passes (`GET /health`)
- [ ] `spike.status` operation dispatched to engine, response received
- [ ] Standard operation envelope accepted by engine
- [ ] Engine restart on crash (simulate with SIGKILL, verify auto-restart)

**Blockers to expect:** Spike engine binary doesn't exist yet (requires Go build). Port conflicts. Health check endpoint mismatch.

---

### Rung 12: Full E2E — Signup to App Usage

**What:** The complete user journey works end-to-end.

**Validation:**
- [ ] Visit product website
- [ ] Click signup, create account
- [ ] See product options, choose GlowBot
- [ ] Server provisioned
- [ ] GlowBot installed on server
- [ ] Redirected to GlowBot UI
- [ ] App frame visible (44px top bar)
- [ ] GlowBot overview loads with data
- [ ] Navigate to integrations page
- [ ] Navigate to pipeline status
- [ ] Switch to Control panel via app frame
- [ ] Switch back to GlowBot

---

## Rung Dependencies

```
Rung 1: Frontdoor Boots
  ↓
Rung 2: Product Website
  ↓
Rung 3: Account Signup
  ↓
Rung 4: Product Sync ←── (can parallel with 2-3)
  ↓
Rung 5: Server Provisioning
  ↓
Rung 6: Runtime Boots + Discovery ←── (independent of 1-5, can start early)
  ↓
Rung 7: GlowBot Methods ←── (needs Rung 6)
  ↓
Rung 8: GlowBot UI ←── (needs Rung 7 + GlowBot static build)
  ↓
Rung 9: App Frame ←── (needs Rung 1 + Rung 8)
  ↓
Rung 10: App Install ←── (needs Rung 5 + Rung 6)
  ↓
Rung 11: Spike Service ←── (needs Rung 6 + Spike Go build)
  ↓
Rung 12: Full E2E ←── (needs ALL previous rungs)
```

**Fastest path to visible progress:** Rung 6 → Rung 7 (runtime boots, GlowBot methods callable). This is the most independent path — doesn't require frontdoor to work at all.

**Recommended starting order:**
1. Rung 1 + Rung 6 in parallel (frontdoor boots + runtime boots)
2. Rung 2 (product website renders)
3. Rung 4 (product sync)
4. Rung 7 (GlowBot methods)
5. Rung 3 + Rung 5 (account signup + server provisioning)
6. Rung 8 + Rung 9 (UI serving + app frame)
7. Rung 10 + Rung 11 (app install + Spike service)
8. Rung 12 (full E2E)
