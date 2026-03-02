# Workplan: Frontdoor Architecture Gaps → Target State

Date: 2026-03-02
Status: active
Owners: Nexus Platform

---

## 1) Purpose

This workplan identifies every gap between the current frontdoor codebase and the confirmed target state defined in our spec documents. Each gap is described with its current state, target state, affected files, and implementation approach.

### Reference Specs (Target State)

1. `FRONTDOOR_ARCHITECTURE.md` — Master architecture overview
2. `BILLING_ARCHITECTURE_ACCOUNT_MODEL_2026-03-02.md` — Account entity, server/app subscriptions, Stripe integration
3. `NEX_APP_MANIFEST_AND_LIFECYCLE_2026-03-02.md` — App manifest, lifecycle, runtime processing
4. `CRITICAL_CUSTOMER_FLOWS_2026-03-02.md` — 29 customer flows across 7 categories
5. `FRONTDOOR_APP_FRAME_AND_DOCK_2026-03-02.md` — App frame injection, dock UI, platform navigation
6. `FRONTDOOR_CANONICAL_APP_SLOT_ARCHITECTURE_HARD_CUTOVER_2026-02-27.md` — App slot hosting modes, proxy auth trust chain
7. `SPEC_FRONTDOOR_ONE_SERVER_MULTI_APP_INSTALL_AND_LAUNCH_HARD_CUTOVER_2026-02-27.md` — Multi-app per server UX

### Approach

Hard cutover. No backwards compatibility. We are defining the ideal target state and cutting over to it cleanly. Legacy code, legacy terminology, legacy schema — all replaced.

---

## 2) Gap Inventory

### GAP-01: Account Entity Missing

**Severity:** Critical
**Effort:** Large
**Blocks:** GAP-02, GAP-03, GAP-10

**Current state:**
No account concept exists anywhere in the codebase. Billing is per-workspace. Team membership is per-workspace. There is no entity that represents "the clinic" or "the engineering team" that owns servers and app subscriptions.

**Target state (from BILLING_ARCHITECTURE spec):**
```sql
frontdoor_accounts (account_id, display_name, owner_user_id, status, ...)
frontdoor_account_memberships (account_id, user_id, role, invited_by, joined_at_ms)
```

- Every user belongs to at least one account
- On first signup, an account is auto-created with the user as owner
- Accounts own servers and app subscriptions
- Team members are invited to accounts (not individual servers)
- Roles: owner, admin, member, viewer

**Affected files:**
- `src/workspace-store.ts` — Add account tables, account CRUD methods
- `src/server.ts` — Account resolution in session context, new API endpoints
- `src/tenant-autoprovision.ts` — Create account during provisioning
- `src/types.ts` — Account types
- `public/index.html` — Account context in UI

**Implementation approach:**
1. Add `frontdoor_accounts` and `frontdoor_account_memberships` tables to WorkspaceStore
2. Add account CRUD methods to WorkspaceStore
3. Auto-create account on first user signup (in OIDC callback handler)
4. Add account_id foreign key to servers table
5. Add API endpoints: `GET/POST /api/accounts`, `GET /api/accounts/:id`, `GET /api/accounts/:id/members`, `POST /api/accounts/:id/members/invite`
6. Thread account context through session resolution

---

### GAP-02: Terminology Rename — workspace → server + account

**Severity:** Critical
**Effort:** Large
**Blocks:** GAP-10 (API paths)

**Current state:**
The entire codebase uses "workspace" as the universal entity:

| Current | Target |
|---------|--------|
| `frontdoor_workspaces` table | `frontdoor_servers` |
| `frontdoor_workspace_memberships` | `frontdoor_account_memberships` (moved to account level) |
| `frontdoor_workspace_billing` | `frontdoor_server_subscriptions` + `frontdoor_app_subscriptions` |
| `frontdoor_workspace_limits` | `frontdoor_server_limits` (or account-level) |
| `frontdoor_workspace_usage_daily` | `frontdoor_server_usage_daily` |
| `frontdoor_workspace_app_installs` | `frontdoor_server_app_installs` |
| `frontdoor_workspace_invoices` | `frontdoor_account_invoices` |
| `frontdoor_billing_events` | `frontdoor_billing_events` (add account_id) |
| `WorkspaceRecord` type | `ServerRecord` |
| `WorkspaceMembershipView` type | `AccountMembershipView` |
| `WorkspaceStore` class | `FrontdoorStore` (manages accounts, servers, billing) |
| `workspace_id` columns/params | `server_id` (for server) or `account_id` (for account) |
| `/api/workspaces/*` routes | `/api/accounts/*` + `/api/servers/*` |
| UI labels "Workspace" | "Server" or "Account" |

**Affected files:**
- `src/workspace-store.ts` — Rename to `frontdoor-store.ts`, rename all tables/types/methods
- `src/server.ts` — All route handlers, type references, variable names
- `src/types.ts` — Type renames
- `src/tenant-autoprovision.ts` — `workspaceToTenantConfig` → `serverToTenantConfig`
- `public/index.html` — All UI labels, JS variable names, API calls

**Implementation approach:**
This is a mechanical rename but touches every file. Best done as a single atomic commit after GAP-01 is in place:
1. Rename `workspace-store.ts` → `frontdoor-store.ts`
2. Rename class `WorkspaceStore` → `FrontdoorStore`
3. Rename all types: `WorkspaceRecord` → `ServerRecord`, etc.
4. Rename all table names in schema DDL
5. Rename all columns: `workspace_id` → `server_id` (or `account_id`)
6. Rename all API routes
7. Rename all UI labels and JS references
8. Add migration that renames tables (or fresh schema since hard cutover)

---

### GAP-03: Billing Schema Mismatch

**Severity:** Critical
**Effort:** Large
**Depends on:** GAP-01

**Current state:**
```sql
-- Current: single billing record per workspace
frontdoor_workspace_billing (
  workspace_id TEXT PRIMARY KEY,  -- can't do multi-product
  plan_id TEXT,
  status TEXT,
  provider TEXT,
  customer_id TEXT,
  subscription_id TEXT,
  product_id TEXT,  -- added via ALTER TABLE
  ...
)
```

Problems:
- PK is `workspace_id` — only one billing record per workspace
- Can't support separate server vs app billing
- Can't support account-level billing
- `product_id` on billing record conflates server billing with app billing

**Target state (from BILLING_ARCHITECTURE spec):**
```sql
frontdoor_server_subscriptions (
  server_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES frontdoor_accounts,
  plan_id TEXT NOT NULL DEFAULT 'server-starter',
  status TEXT NOT NULL DEFAULT 'active',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start_ms INTEGER,
  current_period_end_ms INTEGER,
  ...
)

frontdoor_app_subscriptions (
  account_id TEXT NOT NULL REFERENCES frontdoor_accounts,
  app_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start_ms INTEGER,
  current_period_end_ms INTEGER,
  ...
  PRIMARY KEY(account_id, app_id)
)

frontdoor_account_entitlements (
  account_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  entitlement_key TEXT NOT NULL,
  entitlement_value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'plan',
  ...
  PRIMARY KEY(account_id, app_id, entitlement_key)
)
```

**Affected files:**
- `src/workspace-store.ts` — Drop old billing tables, create new ones
- `src/server.ts` — All billing API handlers
- `src/billing.ts` — Stripe checkout/webhook integration
- `public/index.html` — Billing UI section

**Implementation approach:**
1. Create new billing tables per spec
2. Rewrite billing API handlers for account-level operations
3. Update Stripe integration: separate subscription creation for servers vs apps
4. Update webhook handler to route events to correct subscription type
5. Rewrite billing UI to show account-level billing overview
6. Migrate existing data (or fresh start since hard cutover)

---

### GAP-04: product_id on Workspace/Server

**Severity:** Medium
**Effort:** Small
**Depends on:** GAP-01, GAP-02

**Current state:**
`frontdoor_workspaces` has `product_id TEXT` added via ALTER TABLE. This field implies a server "belongs to" a product — but in the multi-app model, servers are neutral and apps install on them.

The provisioner also writes `productId` during tenant creation:
```typescript
// tenant-autoprovision.ts
// Creates workspace with productId = appId
```

**Target state:**
Remove `product_id` from servers table entirely. The relationship is:
- `frontdoor_app_subscriptions` — account owns app access
- `frontdoor_server_app_installs` — server has apps installed
- No product coupling on the server itself

**Affected files:**
- `src/workspace-store.ts` — Remove product_id column from workspace/server schema
- `src/server.ts` — Remove all references to workspace.product_id
- `src/tenant-autoprovision.ts` — Stop writing product_id on tenant
- `public/index.html` — Remove product_id from workspace display, operator inventory

**Implementation approach:**
1. Drop column from schema DDL
2. Remove from all types (WorkspaceRecord.productId)
3. Remove from provisioner
4. Remove from API responses
5. Remove from UI rendering

---

### GAP-05: Hardcoded App Entry Paths

**Severity:** Medium
**Effort:** Small

**Current state:**
```typescript
// server.ts line ~491
function defaultEntryPathForApp(appId: string): string {
  if (appId === "control") return "/app/control/chat";
  if (appId === "glowbot") return "/app/glowbot/";
  if (appId === "spike") return "/app/spike";
  return `/app/${encodeURIComponent(appId)}`;
}
```

Switch statement that will grow with every new app.

**Target state:**
Entry paths come from the product registry (`frontdoor_products` table) or the app manifest (`app.nexus.json` → `ui.entry_path`). The `frontdoor_server_app_installs.entry_path` column already exists — it just needs to be populated from the registry instead of this hardcoded function.

**Affected files:**
- `src/server.ts` — Replace `defaultEntryPathForApp()` with registry lookup

**Implementation approach:**
1. Add `entry_path` column to `frontdoor_products` table (or use existing app install record)
2. Populate entry_path from product registry seed data
3. Replace `defaultEntryPathForApp()` with a lookup: `workspaceStore.getProductEntryPath(appId)`
4. Fallback to `/app/${appId}/` if not in registry

---

### GAP-06: Hardcoded Control UI Detection

**Severity:** Medium
**Effort:** Small

**Current state:**
```typescript
// server.ts line ~369
function isLikelyControlUiDocumentPath(pathname: string): boolean {
  if (pathname === "/app" || pathname === "/app/") return true;
  if (pathname === "/app/control" || pathname.startsWith("/app/control/")) return true;
  return false;
}
```

Only the control app gets special treatment (bootstrap injection). All other apps get nothing.

**Target state (from APP_FRAME spec):**
ALL app document requests get the app frame injected. The detection function becomes:

```typescript
function isAppDocumentRequest(req: IncomingMessage, pathname: string): boolean {
  if (req.method !== "GET") return false;
  if (!prefersHtmlResponse(req)) return false;
  if (path.extname(pathname) !== "") return false; // has file extension
  const appMatch = pathname.match(/^\/app\/([^/]+)/);
  return Boolean(appMatch);
}
```

**Affected files:**
- `src/server.ts` — Replace `isLikelyControlUiDocumentPath` with `isAppDocumentRequest`; replace `injectControlUiBootstrap` with `injectAppFrame`

**Implementation approach:**
1. Write `isAppDocumentRequest()` function
2. Write `injectAppFrame()` function per app frame spec
3. Update proxy path to use new functions for all apps
4. Remove `injectControlUiBootstrap()` entirely

---

### GAP-07: Entry Intent Parameter Naming

**Severity:** Low
**Effort:** Small

**Current state:**
Multiple competing parameter names for the same concept:

| Parameter | Used where | Meaning |
|-----------|-----------|---------|
| `app_id` | Entry intent API, UI JS | App to launch/install |
| `product` | OIDC start, URL params | Same as app_id (legacy product concept) |
| `flavor` | OIDC start | Same as product/app_id (even older name) |
| `workspace_id` | Proxy paths, UI | Server to target |
| `server_id` | Server list API, entry intent | Same as workspace_id |

The UI reads both `app_id` and `product` from URL params:
```javascript
const initialAppHint = asText(initialUrlParams.get('app_id') || '').toLowerCase();
const initialProductHint = normalizeProductHint(initialUrlParams.get('product'));
```

The OIDC start sends both `product` and `flavor`:
```javascript
q.set('product', product);
q.set('flavor', product);
```

**Target state:**
Canonical parameter names:
- `app_id` — always means the app identifier (replaces `product` and `flavor`)
- `server_id` — always means the server identifier (replaces `workspace_id` in URL params)
- `account_id` — account context (new)
- `entry_source` — attribution/source tracking (unchanged)
- `create_new_server` — explicit new server intent (unchanged)

Entry URL from product pages:
```
frontdoor.nexushub.sh/?app_id=glowbot&entry_source=homepage
```

**Affected files:**
- `src/server.ts` — OIDC start handler, entry resolve/execute handlers
- `public/index.html` — URL param reading, OIDC start builder

**Implementation approach:**
1. Remove `product` and `flavor` parameter support from OIDC start
2. Use only `app_id` in entry URLs
3. Rename `workspace_id` to `server_id` in all URL params
4. Update product page CTAs to use new param names
5. Keep old params as aliases during brief transition (or hard cutover, remove immediately)

---

### GAP-08: Provisioner Product Coupling

**Severity:** Medium
**Effort:** Medium

**Current state:**
`TenantAutoProvisioner` in `tenant-autoprovision.ts` has explicit product-specific branching:
- `product_id === "spike"` → binds to shared Spike runtime
- Default → provisions dedicated tenant runtime with GlowBot app slot pre-configured
- Writes `productId` on the workspace record
- Tenant naming encodes the product (`glowbot-<user>`, `spike-<user>`)

**Target state:**
Provisioning creates neutral server runtime profiles:
1. No product-shaped branching
2. No product encoding in server names
3. App installation is a separate step after server provisioning
4. Server naming uses the deterministic generator (`Amber Beacon`, etc.) or user-provided name

**Affected files:**
- `src/tenant-autoprovision.ts` — Remove product branching, neutral provisioning
- `src/server.ts` — Entry execute handler separates provision from install

**Implementation approach:**
1. Refactor `TenantAutoProvisioner.provision()` to create neutral server profile
2. Remove product_id parameter from provisioning
3. Remove product-specific tenant naming
4. After provisioning, call app install flow as a separate step
5. Entry execute flow: `create_server()` → `install_app(server_id, app_id)` as two sequential operations

---

### GAP-09: App Frame Injection Missing

**Severity:** Critical
**Effort:** Medium
**Depends on:** GAP-06

**Current state:**
The proxy handler only injects bootstrap for control UI:
```typescript
if (isAppRoute && method === "GET" && prefersHtmlResponse(req) && isLikelyControlUiDocumentPath(pathname)) {
  await proxyRuntimeDocumentWithBootstrap({ ... });
  return;
}
// All other app routes: proxy as-is, no frame
```

**Target state (from APP_FRAME spec):**
All app HTML document responses get the app frame injected:
```typescript
if (isAppRoute && isAppDocumentRequest(req, pathname)) {
  await proxyRuntimeDocumentWithAppFrame({
    req, res, url,
    session, principal, runtime,
    appId, serverId,
    workspaceStore, // for looking up frame data
  });
  return;
}
```

The `proxyRuntimeDocumentWithAppFrame()` function:
1. Proxies to runtime and buffers HTML response
2. Looks up app metadata, server list, installed apps from frontdoor store
3. Calls `injectAppFrame()` to inject the frame
4. Returns modified HTML to browser

**Affected files:**
- `src/server.ts` — New `proxyRuntimeDocumentWithAppFrame()`, update proxy routing logic

**Implementation approach:**
1. Write `injectAppFrame()` per app frame spec (CSS + HTML + JS)
2. Write `proxyRuntimeDocumentWithAppFrame()` that buffers and injects
3. Add data lookup methods to FrontdoorStore for frame context
4. Add in-memory cache for frame data (30-60s TTL)
5. Replace control-only injection with universal injection in proxy path
6. Test with GlowBot and Spike app UIs

---

### GAP-10: Missing API Endpoints

**Severity:** High
**Effort:** Large
**Depends on:** GAP-01, GAP-02

**Current state:**
API endpoints use workspace terminology and don't support account-level operations:

```
Current routes:
  GET    /api/workspaces
  POST   /api/workspaces
  GET    /api/workspaces/:id/settings
  PATCH  /api/workspaces/:id/settings
  GET    /api/workspaces/:id/members
  POST   /api/workspaces/:id/invites
  GET    /api/workspaces/provisioning/status
  POST   /api/workspaces/select
  GET    /api/servers
  GET    /api/servers/:id/apps
  POST   /api/servers/:id/apps/:appId/install
  GET    /api/billing/:workspaceId/subscription
  GET    /api/billing/:workspaceId/plan
  GET    /api/billing/:workspaceId/entitlements
  POST   /api/billing/:workspaceId/checkout-session
  GET    /api/billing/:workspaceId/invoices
  GET    /api/apps/owned
  GET    /api/apps/catalog
  GET    /api/products/:productId/plans
  GET    /api/entry/resolve
  POST   /api/entry/execute
  POST   /api/auth/oidc/start
  GET    /api/auth/oidc/callback
  GET    /api/auth/session
  POST   /api/auth/logout
  GET    /api/operator/workspaces
```

**Target API structure:**

```
Account APIs:
  GET    /api/accounts                              — list user's accounts
  POST   /api/accounts                              — create account
  GET    /api/accounts/:accountId                    — account details
  PATCH  /api/accounts/:accountId                    — update account
  GET    /api/accounts/:accountId/members            — list team members
  POST   /api/accounts/:accountId/members/invite     — invite member
  DELETE /api/accounts/:accountId/members/:userId     — remove member
  PATCH  /api/accounts/:accountId/members/:userId     — update member role

Server APIs:
  GET    /api/accounts/:accountId/servers            — list account's servers
  POST   /api/accounts/:accountId/servers            — create server
  GET    /api/servers/:serverId                       — server details
  PATCH  /api/servers/:serverId                       — update server settings
  DELETE /api/servers/:serverId                       — decommission server
  POST   /api/servers/select                          — set active server (session)
  GET    /api/servers/:serverId/apps                  — list apps on server
  POST   /api/servers/:serverId/apps/:appId/install   — install app on server
  POST   /api/servers/:serverId/apps/:appId/uninstall — uninstall app from server
  GET    /api/servers/:serverId/status                — runtime health check

Billing APIs (account-level):
  GET    /api/accounts/:accountId/billing             — billing overview
  GET    /api/accounts/:accountId/billing/server-subscriptions  — server subscriptions
  GET    /api/accounts/:accountId/billing/app-subscriptions     — app subscriptions
  POST   /api/accounts/:accountId/billing/checkout    — start Stripe checkout
  GET    /api/accounts/:accountId/billing/invoices    — invoice history
  GET    /api/accounts/:accountId/billing/entitlements — resolved entitlements

App Catalog APIs:
  GET    /api/apps/catalog                            — public app store catalog
  GET    /api/apps/:appId                             — app details + plans
  GET    /api/apps/:appId/plans                       — app pricing plans
  POST   /api/accounts/:accountId/apps/:appId/subscribe — subscribe to app

Entry Intent APIs:
  GET    /api/entry/resolve                           — resolve entry intent (unchanged)
  POST   /api/entry/execute                           — execute entry intent (unchanged)

Auth APIs:
  POST   /api/auth/oidc/start                         — start OIDC flow (unchanged)
  GET    /api/auth/oidc/callback                      — OIDC callback (unchanged)
  GET    /api/auth/session                            — session info (add account context)
  POST   /api/auth/logout                             — logout (unchanged)

Operator APIs:
  GET    /api/operator/accounts                       — all accounts
  GET    /api/operator/servers                         — all servers
  GET    /api/operator/usage                           — platform usage
```

**Implementation approach:**
1. Define all new route handlers in server.ts
2. Add corresponding store methods in FrontdoorStore
3. Add account context to session resolution (which account is active)
4. Implement account-scoped authorization checks
5. Rewrite billing handlers for account-level operations

---

### GAP-11: UI Overhaul — Dashboard

**Severity:** Medium
**Effort:** Large
**Depends on:** GAP-01, GAP-02, GAP-09, GAP-10

**Current state:**
`public/index.html` is an 1858-line single HTML file with:
- Sidebar: Servers, Server Apps, My Apps, App Store, Settings, Access Keys, Members, Invites, Billing, Operator
- All terminology says "workspace"
- Apps shown as dropdown selectors (not app cards)
- No product branding on app cards
- No account context
- Title says "Nexus — Workspace Dashboard"
- Provisioning section still visible

**Target state (from FRONTDOOR_ARCHITECTURE spec):**
- **Servers tab** (default): Card list of servers with status badges. Click → server detail with installed app cards.
- **Apps tab**: Library (owned apps + install footprint) and Store (discover + purchase) subtabs.
- **Admin tab**: Team management, billing overview, account settings.
- All terminology uses "server" and "account"
- App cards show product branding (accent color, logo, display name)
- Server detail shows app cards with states (installed, installing, not_installed, blocked, failed)
- Account context visible (account name, role)

**Affected files:**
- `public/index.html` — Complete UI rewrite

**Implementation approach:**
This is best done as a ground-up rewrite of the dashboard UI rather than incremental patches:
1. New information architecture: Servers | Apps (Library + Store) | Admin
2. Server cards with status badges and app counts
3. Server detail view with app cards (product-branded)
4. App store with product registry data (branding, plans, entitlements)
5. Account/billing management under Admin
6. Replace all "workspace" terminology
7. Potentially move to a build step (React/Svelte SPA) instead of single HTML file

---

### GAP-12: User App Entitlements → Account App Subscriptions

**Severity:** Medium
**Effort:** Medium
**Depends on:** GAP-01, GAP-03

**Current state:**
App entitlements are per-user:
```sql
frontdoor_user_app_entitlements (
  user_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'purchase',
  ...
  PRIMARY KEY(user_id, app_id)
)
```

**Target state:**
App subscriptions are per-account:
```sql
frontdoor_app_subscriptions (
  account_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  stripe_subscription_id TEXT,
  ...
  PRIMARY KEY(account_id, app_id)
)
```

When checking if a user can use an app:
1. Look up which account the user is operating in
2. Check if that account has an active app subscription
3. Check if the app is installed on the target server

**Affected files:**
- `src/workspace-store.ts` — Replace user_app_entitlements with app_subscriptions
- `src/server.ts` — Update entitlement checks to be account-scoped
- Entry resolve/execute flow — Check account subscription, not user entitlement

---

### GAP-13: Server Display Names

**Severity:** Low
**Effort:** Small

**Current state:**
`deterministicServerNameFromId()` generates names like "Amber Beacon" from server IDs. This exists and works. But:
- Workspace display names are set during provisioning and often just echo the workspace ID
- The generated name is only used in `/api/servers` response
- Users can't rename servers through the UI (settings page has "Display name" but it's the workspace display name)

**Target state:**
- Servers get generated display names on creation (existing behavior, good)
- Server display name is user-editable through Settings
- Both the dashboard and app frame use the display name consistently

**Affected files:**
- `src/server.ts` — Ensure display name is settable via PATCH
- `public/index.html` — Use display name everywhere

**Implementation approach:**
Mostly already works. Just need to ensure consistency and editability.

---

## 3) Implementation Phases

### Phase 1: Foundation — Account Entity + Schema

**Goal:** Introduce the account entity and restructure the data model.

| Task | Gap | Estimate |
|------|-----|----------|
| Create `frontdoor_accounts` table and CRUD | GAP-01 | 1 day |
| Create `frontdoor_account_memberships` table and CRUD | GAP-01 | 1 day |
| Auto-create account on first user signup | GAP-01 | 0.5 day |
| Create `frontdoor_server_subscriptions` table | GAP-03 | 0.5 day |
| Create `frontdoor_app_subscriptions` table | GAP-03 | 0.5 day |
| Create `frontdoor_account_entitlements` table | GAP-03 | 0.5 day |
| Remove product_id from servers | GAP-04 | 0.5 day |
| Thread account context through session | GAP-01 | 1 day |

**Exit criteria:**
- Account is created when user signs up
- Account owns servers and subscriptions
- Session contains account context
- New tables exist and are populated

### Phase 2: Terminology Rename

**Goal:** Nuke "workspace" from orbit. Replace with "server" + "account".

| Task | Gap | Estimate |
|------|-----|----------|
| Rename `workspace-store.ts` → `frontdoor-store.ts` | GAP-02 | 0.5 day |
| Rename all tables: `frontdoor_workspaces` → `frontdoor_servers` etc. | GAP-02 | 1 day |
| Rename all types: `WorkspaceRecord` → `ServerRecord` etc. | GAP-02 | 0.5 day |
| Rename all API routes | GAP-02, GAP-10 | 1 day |
| Rename UI labels and JS | GAP-02 | 0.5 day |
| Unify entry intent params (`app_id` only, kill `product`/`flavor`) | GAP-07 | 0.5 day |

**Exit criteria:**
- Zero occurrences of "workspace" in code/UI (except maybe comments referencing migration)
- All APIs use new paths
- All types use new names

### Phase 3: Provisioner + Entry Intent Cleanup

**Goal:** Neutral server provisioning, clean entry intent flow.

| Task | Gap | Estimate |
|------|-----|----------|
| Remove product-specific branching from provisioner | GAP-08 | 1 day |
| Separate server provisioning from app installation | GAP-08 | 0.5 day |
| Remove product-encoded tenant naming | GAP-08 | 0.5 day |
| Update entry execute: `create_server()` → `install_app()` as two steps | GAP-08 | 0.5 day |
| Remove hardcoded `defaultEntryPathForApp()` | GAP-05 | 0.5 day |
| Populate entry paths from product registry | GAP-05 | 0.5 day |

**Exit criteria:**
- Provisioner creates neutral server profiles
- App install is always a separate step
- No product-specific code in provisioner
- Entry paths come from product registry

### Phase 4: API Restructure

**Goal:** New API surface matching target architecture.

| Task | Gap | Estimate |
|------|-----|----------|
| Account APIs (CRUD, members, invites) | GAP-10 | 2 days |
| Server APIs (scoped under account) | GAP-10 | 1 day |
| Billing APIs (account-level, server + app subscriptions) | GAP-10 | 2 days |
| App subscription APIs (subscribe, check entitlement) | GAP-10, GAP-12 | 1 day |
| Update session API to include account context | GAP-10 | 0.5 day |
| Operator APIs (accounts, servers, usage) | GAP-10 | 0.5 day |

**Exit criteria:**
- All target API endpoints exist and function
- Account-scoped authorization works
- Billing operations are account-level
- Operator can view all accounts/servers

### Phase 5: App Frame

**Goal:** Persistent platform navigation when inside any app.

| Task | Gap | Estimate |
|------|-----|----------|
| Write `isAppDocumentRequest()` detection | GAP-06 | 0.5 day |
| Write `injectAppFrame()` with full CSS/HTML/JS | GAP-09 | 2 days |
| Write `proxyRuntimeDocumentWithAppFrame()` response buffering | GAP-09 | 1 day |
| Add frame data lookup methods to FrontdoorStore | GAP-09 | 0.5 day |
| Add in-memory cache for frame data | GAP-09 | 0.5 day |
| Remove old `injectControlUiBootstrap()` | GAP-06 | 0.5 day |
| Test with GlowBot, Spike, and Control UIs | GAP-09 | 1 day |

**Exit criteria:**
- Every app shows the Nexus top bar
- Server switching works from within app
- App switching works from within app
- Account menu links to billing/team/settings
- Dashboard link returns to frontdoor
- No style collisions with app CSS
- WebSocket and non-document requests are not affected

### Phase 6: Dashboard UI Overhaul

**Goal:** Dashboard matches target information architecture.

| Task | Gap | Estimate |
|------|-----|----------|
| Rewrite Servers tab (cards with status, click → detail) | GAP-11 | 2 days |
| Server detail view (app cards with product branding) | GAP-11 | 1 day |
| Apps tab: Library + Store subtabs | GAP-11 | 1 day |
| Admin tab: Team, billing, account settings | GAP-11 | 1 day |
| Replace all workspace terminology in UI | GAP-11 | 0.5 day |
| Integrate product registry branding (accent colors, logos) | GAP-11 | 0.5 day |
| Server display name editing | GAP-13 | 0.5 day |

**Exit criteria:**
- Dashboard uses server + account terminology
- Server cards show status and installed app count
- App cards show product branding
- Billing section shows account-level subscriptions
- Team management is account-scoped

---

## 4) Phase Dependencies

```
Phase 1: Foundation
    ↓
Phase 2: Terminology Rename
    ↓
Phase 3: Provisioner Cleanup ←──── (can start in parallel with Phase 2)
    ↓
Phase 4: API Restructure
    ↓
Phase 5: App Frame ←──── (can start after Phase 2, parallel with Phase 4)
    ↓
Phase 6: Dashboard UI ←──── (can start after Phase 4)
```

Critical path: Phase 1 → Phase 2 → Phase 4 → Phase 6

Parallel track: Phase 5 (app frame) can be developed alongside Phase 4 since it primarily touches the proxy path, not the API handlers.

---

## 5) What This Workplan Does NOT Cover

These are tracked as separate spec/workplan items:

1. **Admin server pattern** — Reusable admin server for product monitoring (separate spec pending)
2. **Nex App SDK interface** — SDK for apps to consume nex data (deferred until after core architecture)
3. **App version rollout / blue-green deploys** — Upgrade orchestration (separate spec pending)
4. **SQLCipher encryption** — Core nex runtime encryption strategy (separate spec pending)
5. **Audit logging** — Taxonomy and implementation (separate spec pending)
6. **GlowBot-specific functionality** — LLM skill, dashboard, pipeline (product-level, not platform)
7. **Spike-specific functionality** — Product-level, not platform
8. **Nex runtime app lifecycle** — Covered by NEX_APP_MANIFEST spec, separate implementation workplan needed for nex runtime changes

---

## 6) Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Schema migration destroys production data | Critical | Hard cutover = fresh schema. No migration needed. Backup old DB before cutover. |
| App frame CSS collides with app styles | Medium | All frame styles scoped under `#nexus-app-frame` with `nxf-*` class prefix. High z-index. |
| App frame injection breaks app HTML | Medium | Robust HTML detection. Only inject on successful HTML responses. Fallback: pass through unmodified. |
| Terminology rename is huge mechanical change | Low | Single atomic commit. Search-and-replace + careful type checking. TypeScript compiler catches misses. |
| Account creation on signup adds latency | Low | Single INSERT. Sub-millisecond on SQLite. |
| App frame data lookups add proxy latency | Medium | In-memory cache with 30-60s TTL. Lookups are simple key-value from SQLite. |
