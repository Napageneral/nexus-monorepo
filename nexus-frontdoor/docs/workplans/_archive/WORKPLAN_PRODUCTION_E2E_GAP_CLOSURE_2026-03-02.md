# Workplan: Production E2E Gap Closure

Date: 2026-03-02
Status: active
Depends on: All 12 validation rungs passing (confirmed)
References:
  - `docs/specs/CRITICAL_CUSTOMER_FLOWS_2026-03-02.md` (F1, F2, F3, F13, F14)
  - `docs/specs/FRONTDOOR_APP_FRAME_AND_DOCK_2026-03-02.md`
  - `docs/specs/BILLING_ARCHITECTURE_ACCOUNT_MODEL_2026-03-02.md`

---

## Context

All 12 rungs of the E2E validation ladder pass. The system works mechanically:
frontdoor boots, runtime boots, apps discovered, methods dispatch, services start,
UI serving works, app install works, app frame injects.

However, attempting the real user journey reveals gaps. The target flow is:

```
User visits product website
  -> clicks "Get Started"
  -> arrives at frontdoor auth page (product-branded)
  -> signs up (creates account + server)
  -> app auto-installed on new server
  -> lands in app UI with frontdoor navigation frame
  -> uses app
  -> navigates to other app via frame
  -> returns to dashboard via frame
```

## Current State Assessment

| Component | Status | Notes |
|-----------|--------|-------|
| Product website | Working | `GET /` serves `public/index.html` with product cards |
| Auth gate UI | Partial | Renders, has Google button, but NOT product-branded and Google button has hardcoded product param |
| `POST /api/auth/login` | Working | Password-based login for existing users |
| `POST /api/auth/signup` | **Missing** | No registration endpoint exists at all |
| Google OIDC flow | Partial | Full infrastructure exists (`oidc-auth.ts`, `begin()`, `complete()`, `resolveOrCreateOidcUser()`), but needs real Google credentials for production |
| Auto-provision on OIDC | Working | OIDC callback auto-provisions tenant, creates server record, creates account |
| Auto-install on signup | Partial | `create_server_and_install` helper exists and works, but only triggered from the dashboard's "provision" API — not from signup |
| App frame injection | **Working** | `injectAppFrame()` fully implemented at `server.ts:380`, used at `server.ts:2504` |
| Server switcher | Working | Frame includes server dropdown |
| App switcher | Working | Frame includes installed apps grid |
| App UIs serving | Working | control, glowbot, spike all serve at `/app/<id>/` |

## Gaps to Close

### Gap 1: User Registration Endpoint

**Problem:** There is no `POST /api/auth/signup` or `POST /api/auth/register` endpoint. New users cannot create accounts via password. The only user creation path is through OIDC (`resolveOrCreateOidcUser`), which requires real Google credentials.

**What exists:**
- `store.upsertUser()` — creates/updates user records
- `store.createAccount()` — creates billing account
- `store.addAccountMember()` — adds user to account with role
- `authenticatePassword()` — verifies username + bcrypt hash
- `createPasswordHash()` in `crypto.ts` — bcrypt hashing

**What's needed:**
A `POST /api/auth/signup` endpoint that:
1. Accepts `{ email, password, displayName? }` (or `{ username, password, displayName? }`)
2. Validates email not already taken (`store.getUserByEmail()`)
3. Validates password strength (minimum length)
4. Creates user record with password hash
5. Creates account entity (auto-generated name or from displayName)
6. Creates account membership (role: owner)
7. Creates session and sets cookie
8. Returns session info
9. Rate-limited (same as login)

**Files to modify:**
- `src/server.ts` — add route handler after the existing `/api/auth/login` block
- `src/frontdoor-store.ts` — may need a `createUserWithPassword()` convenience method (or just use `upsertUser`)

**Estimated effort:** Small. All building blocks exist. This is wiring.

---

### Gap 2: Product-Branded Auth Gate

**Problem:** The auth gate in `index.html` is always neutral Nexus-branded. When a user arrives from a product page (e.g., `frontdoor.nexushub.sh/?app=glowbot`), the auth page should show that product's branding per spec F1.

**Current state:**
- Auth gate shows Nexus logo, "Sign in to manage your servers, apps, and team."
- Google button passes hardcoded `product=spike` (line 532 of index.html)
- No product lookup from `?app=` URL parameter

**What's needed:**
The auth gate JS (client-side) should:
1. Read `?app=` from the URL on page load
2. If present, call `GET /api/products/{appId}` to get product metadata (display name, accent color, tagline)
3. Replace the auth gate visuals:
   - Swap Nexus logo for product icon/initial with accent color
   - Update heading to product name
   - Update subtext to product tagline (e.g., "Get started with GlowBot")
   - Tint the Google button with the product accent color
4. Pass the correct `product` parameter to the Google OIDC start URL:
   `/api/auth/oidc/start?provider=google&product=<appId>&return_to=/app/<appId>/`

**Also needed — product info API:**
- A `GET /api/products/{appId}` endpoint (or use existing store methods) that returns:
  `{ app_id, display_name, accent_color, tagline }`
- This may already exist via `GET /api/apps/store` — check if it's accessible without auth

**Files to modify:**
- `public/index.html` — auth gate JavaScript + CSS for branded variant
- `src/server.ts` — possibly add an unauthenticated product info endpoint

**Estimated effort:** Small-Medium. Mostly frontend JS in index.html.

---

### Gap 3: Post-Signup Auto-Provision + Auto-Install

**Problem:** After a new user signs up (whether via password or OIDC), they need a server provisioned and the requested app installed automatically. This is the F1 flow: signup → auto-provision → auto-install → land in app.

**Current state:**
- OIDC callback has auto-provision logic using `TenantAutoProvisioner`
- The `executeCreateServerAndInstall()` helper (server.ts ~line 1720) does:
  1. Resolve provisioning identity
  2. Call `autoProvisioner.resolveOrProvision()`
  3. Create server record
  4. Create account membership
  5. Create app subscription
  6. Install app on server
- This helper is currently called from `POST /api/servers/{serverId}/create_server_and_install`
- But it's NOT called after password-based signup (which doesn't exist yet)

**What's needed:**
After registration via `POST /api/auth/signup`:
1. If `?app=` or `intent_app` param is present in the signup request:
   a. Auto-provision a server (use the dev tenant since we're in single-tenant mode)
   b. Create app subscription (free plan)
   c. Install app on the server
   d. Set the response `redirect_to` to `/app/<appId>/`
2. If no `?app=` param:
   a. Auto-provision a server (no app pre-installed)
   b. Set redirect to `/` (dashboard)

**Implementation approach:**
The signup endpoint can reuse `executeCreateServerAndInstall()` directly after creating the user+account. The key insight is that in dev mode, we have a single pre-configured tenant (`tenant-dev`). The auto-provisioner doesn't need to create a VPS — it just maps the user to the existing tenant.

For the OIDC path, the callback already handles auto-provision but needs to:
- Pass the `productId` through to trigger auto-install (it already does via `oidcProductId`)
- Redirect to `/app/<appId>/` instead of `/` when a product was specified

**Files to modify:**
- `src/server.ts` — integrate auto-provision into the new signup handler
- `src/server.ts` — fix OIDC callback redirect to go to app URL when product specified

**Estimated effort:** Medium. The auto-provision pieces exist; this is orchestration.

---

### Gap 4: Auth Gate Signup Form

**Problem:** The auth gate only shows a Google button. For dev/test, we need a password-based signup form. For production, we need both Google OIDC and an email/password fallback.

**What's needed:**
In the auth gate section of `index.html`:
1. Add a signup/login toggle (two modes in one gate)
2. **Login mode** (default for returning users):
   - Email/username + password fields
   - "Sign in" button → `POST /api/auth/login`
   - "Continue with Google" button
   - "Create an account" link → switches to signup mode
3. **Signup mode** (for new users):
   - Email + password + confirm password fields
   - Optional display name field
   - "Create account" button → `POST /api/auth/signup`
   - "Continue with Google" button
   - "Already have an account?" link → switches to login mode
4. Both modes pass the `?app=` context for product-branded experience
5. Error handling (duplicate email, weak password, wrong credentials)

**Files to modify:**
- `public/index.html` — auth gate HTML + CSS + JavaScript

**Estimated effort:** Medium. Frontend work, but self-contained.

---

### Gap 5: Verify App Frame End-to-End

**Problem:** The app frame is implemented but we haven't verified the full navigation loop works in a real browser:
- App frame visible with correct data (app name, accent color, server name)
- Server switcher populates with user's servers
- App switcher shows installed apps
- Clicking app in switcher navigates to correct URL
- Clicking dashboard link returns to `/`
- Account menu with sign-out works

**What's needed:**
Manual browser verification of:
1. Navigate to `/app/glowbot/` as authenticated user → app frame visible at top
2. Frame shows "GlowBot" with correct accent color
3. Server dropdown shows tenant-dev server
4. App switcher shows all installed apps (control, glowbot, spike)
5. Click Spike in app switcher → navigates to `/app/spike/`
6. Click dashboard link → returns to `/`
7. Click sign out → session destroyed, redirected to auth gate

If any of these fail, fix the `injectAppFrame()` function or the data lookup in the proxy handler.

**Estimated effort:** Small. Verification + minor fixes.

---

## Implementation Order

The gaps have natural dependencies:

```
Gap 1 (Signup Endpoint)
  ↓
Gap 4 (Auth Gate Signup Form) ←→ Gap 2 (Product Branding)
  ↓
Gap 3 (Post-Signup Auto-Provision)
  ↓
Gap 5 (App Frame Verification)
  ↓
  ✅  Full E2E works
```

### Phase 1: Registration Backend
1. Add `POST /api/auth/signup` endpoint to `server.ts`
2. Test with curl: create user, verify session, verify account created
3. Test duplicate email rejection

### Phase 2: Auth Gate UI
4. Add signup form to auth gate in `index.html`
5. Add login/signup mode toggle
6. Wire form submission to new endpoint
7. Test: can create account and land on dashboard

### Phase 3: Product Branding
8. Add unauthenticated `GET /api/products/{appId}` endpoint (or make store product info public)
9. Add product-branded auth gate variant in `index.html` JS
10. Test: visit `/?app=glowbot` → see GlowBot-branded auth page

### Phase 4: Auto-Provision on Signup
11. Wire auto-provision into signup handler when `intent_app` present
12. Wire auto-install after provision
13. Fix OIDC callback to redirect to `/app/<appId>/` when product specified
14. Test: signup with `?app=glowbot` → auto-provision → auto-install → land in GlowBot UI

### Phase 5: Verify Navigation Loop
15. Browser test: full loop from auth gate through app usage through frame navigation
16. Fix any frame issues found
17. Update E2E test script with signup + navigate + frame checks

---

## Acceptance Criteria

The production E2E flow works when:

1. **New user from product page:**
   - Visit `/?app=glowbot`
   - See GlowBot-branded auth page
   - Create account (password or Google)
   - Server auto-provisioned
   - GlowBot auto-installed
   - Land in GlowBot UI at `/app/glowbot/`
   - App frame visible with "GlowBot" badge

2. **Navigate between apps:**
   - Click Spike in app switcher → arrive at `/app/spike/`
   - Click Control in app switcher → arrive at `/app/control/`
   - Click dashboard link → arrive at `/`

3. **Return to dashboard and back:**
   - From dashboard, click "Launch" on any installed app
   - App loads with frame intact

4. **Neutral signup:**
   - Visit `/` (no `?app=` param)
   - See neutral Nexus auth page
   - Create account
   - Server auto-provisioned (no app pre-installed)
   - Land on dashboard with "Browse Apps" prompt

5. **Returning user:**
   - Visit `/` with existing session cookie
   - Skip auth, go directly to dashboard
   - Visit `/?app=glowbot` with existing session → go directly to GlowBot

---

## Risk & Open Questions

1. **Google OIDC in production**: Need real Google OAuth credentials. For now, password-based signup enables full E2E testing. OIDC can be enabled later by adding credentials to config.
2. **Auto-provisioner in dev mode**: Currently uses `TenantAutoProvisioner` which maps to config-defined tenants. In dev, there's one tenant (`tenant-dev`). All new users get mapped to it. This is correct for single-server dev but will need multi-tenant provisioning for production.
3. **Email uniqueness**: The `frontdoor_users` table doesn't enforce unique emails. The signup endpoint should check for duplicates at the application level.
4. **Product info endpoint auth**: Need to decide if product metadata (name, accent color, tagline) is public or requires auth. It should be public since the auth gate needs it before the user is signed in.
