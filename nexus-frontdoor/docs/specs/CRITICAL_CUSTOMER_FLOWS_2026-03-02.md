# Critical Customer Flows

Date: 2026-03-02 (updated 2026-03-06)
Status: CANONICAL
Owners: Nexus Platform

> **Update (2026-03-10):** Hosted app launch uses a frontdoor-owned shell profile for humans and a tenant-origin profile for direct runtime traffic. The shell is durable and iframe-backed. Package install and upgrade are package-based, dependency-aware, and staged. See: `FRONTDOOR_HOSTED_ACCESS_AND_ROUTING.md`, `FRONTDOOR_SHELL_AND_EMBEDDED_APP_MODEL.md`, and `FRONTDOOR_PACKAGE_REGISTRY_AND_LIFECYCLE.md`.

## Confirmed Design Decisions

- **Billing model**: Servers billed via prepaid credits (hourly usage deduction). Apps billed via per-account subscriptions. Once you buy an app, you can install it on any of your account's servers.
- **Account entity**: Exists from the start (B2B — clinics, engineering teams). Sits between users and servers. An account owns servers and app subscriptions. Users are members of accounts.
- **Server tiers**: Design for multiple tiers (small/medium/large). Currently three tiers: cax11 (Starter), cax21 (Standard), cax31 (Performance). 7-day free tier for first cax11 server.
- **Free tier handling**: Free app tiers create an active subscription record with the free plan ID. Free server tier uses 7-day trial with `free_tier_expires_at_ms` on the credit record.
- **App installation**: Frontdoor resolves package releases and dependencies, stages artifacts to VPSes over the private network, and drives runtime operator lifecycle APIs. Auto-install on provisioning uses the same package lifecycle system.
- **App shell**: Frontdoor owns the top-level shell document and renders app content inside a durable embedded boundary, allowing navigation back to dashboard, switching apps, and account management without trusting the app DOM.
- **All app UIs hosted on nex runtime**: No external proxies. Apps serve static built UI files through nex, with method handlers running inside nex for backend logic.
- **Programmatic access**: MCP server at `POST /mcp` for agent platform management. API tokens (`nex_t_...`) for headless workflows. Human OIDC signup required (agents operate after account creation).

---

## Onboarding Flows

### F1: Product-Specific Signup (New User from Product Page)

**Example**: New user arrives from glowbot.app

1. User on glowbot.app clicks "Get Started"
2. Redirected to `frontdoor.nexushub.sh/?app=glowbot&entry=glowbot-app`
3. Frontdoor renders product-branded auth page:
   - GlowBot gold accent (#d4a853), logo, tagline
   - "Sign in to get started with GlowBot"
   - "Continue with Google" button
4. User signs in via Google OIDC
5. Frontdoor:
   a. Creates user account (or associates with existing)
   b. Creates account entity (if new user)
   c. Provisions a server
   d. Creates app subscription (GlowBot Starter, $0, active)
   e. Installs GlowBot app on the new server
6. User lands in the GlowBot dashboard inside the frontdoor shell profile at `frontdoor.nexushub.sh/app/glowbot/`
7. Provisioning may take a moment — progress indicator shown during server provisioning

### F2: Neutral Signup (New User at Frontdoor Directly)

1. User goes to `frontdoor.nexushub.sh`
2. Frontdoor renders neutral Nexus-branded auth page
3. User signs in via Google OIDC
4. Frontdoor:
   a. Creates user account
   b. Creates account entity
   c. Provisions a server (no app pre-installed)
5. User lands on server dashboard — sees empty app area with "Browse Apps" prompt
6. Server provisioning progress shown if still in progress

### F3: Returning User Sign-In

1. User navigates to frontdoor (or product page → frontdoor)
2. If valid session cookie exists → skip auth, go to dashboard
3. If no session:
   a. Show auth page (product-branded if ?app= param present, else neutral)
   b. Sign in via Google OIDC
   c. Resume session → dashboard
4. If they arrived with `?app=glowbot` and GlowBot is installed on their server → resume directly into GlowBot app

---

## Server Management Flows

### F4: First Server Auto-Provisioned

1. Triggered during signup (F1 or F2)
2. Server gets a friendly auto-generated name (e.g., "Coral Meadow")
3. Status transitions: provisioning → ready
4. User sees progress indicator during provisioning
5. Server appears in server list once ready

### F5: Create Additional Server

1. From server dashboard, click "New Server"
2. Select server tier/size (currently only one option, designed for multiple)
3. Billing: server creation is allowed by active free tier or available credits; paid usage draws from the account credit balance
4. New server provisions → appears in server list
5. User can then install any of their entitled apps on it

### F6: View Server Details

1. Click a server card on the dashboard
2. Server detail view shows:
   - Server name (editable), status badge, tier, resource info
   - Installed apps as visual cards (not a dropdown)
   - Each app card: icon, name, status, Launch button (if installed) or Install button (if entitled but not installed)
   - App states: installed, installing, not_installed, failed
3. "Install App" action to add apps from entitled apps
4. "Create New Server" action accessible from here too

### F7: Rename Server

1. Click server name in server detail view → inline edit
2. Type new name → save
3. Persisted immediately

---

## App Store & Purchase Flows

### F8: Browse App Store

1. From dashboard sidebar, navigate to "App Store"
2. App store displays available apps as cards:
   - App icon, name, tagline
   - Pricing summary (e.g., "Free", "From $29/mo", "From $149/mo")
   - "Get Started" / "View Details" button
3. Can filter/search (future — initially just a list)

### F9: View App Details

1. Click an app card in the store
2. Full app detail page:
   - App icon (large), name, description, tagline
   - Screenshots or demo (future)
   - Feature list per plan
   - Plan comparison table with pricing
   - Monthly/yearly billing toggle
   - "Get Started" / "Subscribe" button per plan

### F10: Purchase an App

1. User selects a plan for an app → clicks "Subscribe"
2. If free tier:
   - Instant app subscription created (status: active, plan: free)
   - No Stripe checkout
   - Prompt: "Install on a server?"
3. If paid tier:
   - Product-branded checkout confirmation page:
     - Product logo, accent color, plan details, price, billing interval
     - "Continue to Payment" button
   - → Stripe checkout (Stripe hosts the payment page)
   - → Return to frontdoor branded success page
   - App subscription created (status: active)
   - Prompt: "Install on a server?" → pick server or create new one
4. App subscription is at the account level — available for all account servers

### F11: Install App on a Server

1. Triggered from:
   - Post-purchase prompt
   - "My Apps" → app card → "Install on Server"
   - Server detail → "Install App" → pick from entitled apps
   - Auto-install on server provisioning (entitled apps install automatically)
   - API: `POST /api/servers/{serverId}/apps/{appId}/install`
   - MCP: `tools/call nexus.apps.install`
2. User selects target server (if not already selected)
3. Click "Install" (or auto-triggered)
4. Installation mechanics (see `FRONTDOOR_PACKAGE_REGISTRY_AND_LIFECYCLE.md`):
   a. Entitlement validated via `frontdoor_app_subscriptions`
   b. Target app release and package dependencies resolved
   c. Package artifacts staged to the VPS over the private network
   d. Runtime operator lifecycle endpoints invoked in dependency order
   e. Runtime validates, activates, and health-checks the package set
5. Status transitions: not_installed → installing → installed (or failed)
6. Visual progress during installation
7. Once installed, app card on server detail shows "Launch" button

### F12: Uninstall App from a Server

1. From server detail, click menu on app card → "Uninstall"
2. Confirmation dialog: "Remove GlowBot from this server? Your subscription and data remain — you can reinstall anytime."
3. App removed from server
4. App subscription remains active — user can reinstall on any server
5. App data on server: preserved (soft delete) or cleaned up based on user choice

### F13: Launch an App

1. From server detail, click "Launch" on an installed app card
2. Navigation: → `frontdoor.nexushub.sh/app/<appId>/` within the frontdoor shell profile
3. Frontdoor shell chrome becomes visible:
   - Shows current app, other installed apps for quick switch
   - Back to dashboard button
   - Account menu
4. App loads its UI (served as static files from nex runtime)
5. App UI connects to the hosted runtime transport via same-origin `/runtime/ws` using a frontdoor-minted runtime access token

---

## App Frame / In-App Navigation Flows

### F14: Navigate Between Apps

1. While inside GlowBot, use the frontdoor shell app switcher to switch to Spike
2. Click Spike in the shell navigation → navigates to `/app/spike/` on the same server
3. GlowBot state: handled by browser (different URL path, app manages its own state)
4. Spike loads in the frame

### F15: Return to Server Dashboard

1. Click home/dashboard in the frontdoor shell
2. → Back to server dashboard view
3. The shell stays frontdoor-owned while the main content returns to the dashboard view

### F16: Switch Servers

1. From shell or dashboard, use the server switcher
2. Select a different server → dashboard shows that server's apps
3. If currently inside an app, switching servers navigates to the new server's dashboard

---

## Billing Management Flows

### F17: View Current Subscriptions

1. From dashboard sidebar, "Billing" section
2. Two sections:
   a. **Server Subscriptions**: list of servers with their tier, price, renewal date, status
   b. **App Subscriptions**: list of apps with their plan, price, renewal date, status
3. Each shows: plan name, price, billing interval, next renewal, status (active/trialing/past_due/cancelled)

### F18: Upgrade/Downgrade App Plan

1. From billing or app detail, click "Change Plan" on an app subscription
2. Plan comparison view:
   - Current plan highlighted
   - Other plans selectable
   - Feature differences shown
   - Price difference / proration shown
3. Confirm change → Stripe handles proration
4. Entitlements update immediately on all servers where app is installed

### F19: Cancel App Subscription

1. From billing, click "Cancel" on an app subscription
2. Confirmation: "You'll retain access until [end of billing period]. After that, the app will revert to the free tier (if available) or be deactivated."
3. Status: active → cancelled (grace period until period end)
4. At period end: downgrade to free tier or deactivate

### F20: Credit Exhaustion And Server Suspension

1. From billing, the user sees account credit balance, recent transactions, and free-tier status
2. If credits run out outside the free tier, running servers become suspended
3. Frontdoor explains that credits must be added before those servers resume
4. After a credit deposit, the account can resume suspended servers

### F21: Payment Method Management

1. From billing, click "Manage Payment Methods"
2. → Redirects to Stripe customer portal
3. User can update card, view invoices, etc.
4. Returns to frontdoor billing page

---

## Team & Access Flows

### F22: Invite a Team Member

1. From dashboard sidebar, "Team" or "Members"
2. Click "Invite Member"
3. Enter email address
4. Choose role: Owner, Admin, Member, Viewer
5. Access scope: account-wide (all servers, all apps the account has)
6. Send invite → invitation email sent

### F23: Accept an Invitation

1. New user receives invite email with link
2. Click link → `frontdoor.nexushub.sh/?invite=<token>`
3. Sign in (or create new user account, then associate with the inviting account)
4. Invitation detail shown: "[Account Name] has invited you as a [Role]"
5. Accept → user becomes a member of the account
6. Gets access to all account servers and installed apps per their role

### F24: Manage Team Members

1. View member list: name, email, role, date joined
2. Change a member's role (Owner can change others' roles)
3. Remove a member → revokes their access to the account's servers and apps

### F25: Access Control Model

- **Account-level access**: When you join an account, you get access to all of that account's servers and apps.
- **Role-based permissions**:
  - **Owner**: Full control. Billing, team management, server management, all apps.
  - **Admin**: Server management, app management, team invites. Cannot manage billing or transfer ownership.
  - **Member**: Can use apps, view dashboards. Cannot manage servers, billing, or team.
  - **Viewer**: Read-only access to app dashboards. Cannot modify anything.
- **App entitlements are account-level**: If the account has GlowBot Clinic, all members can use GlowBot on any account server (per their role permissions).
- **Future**: Per-server or per-app access restrictions within an account (not needed for v1).

---

## Admin Flows (Operator)

### F26: Frontdoor Admin — Overview

1. Operator opens frontdoor admin app (a nex app on its own server)
2. Dashboard shows:
   - Total accounts, total servers, total active users
   - Total revenue and credit-liability signals
   - Error rates, provisioning queue
   - Recent activity feed
3. All accounts listed, searchable/filterable

### F27: Frontdoor Admin — Account Drill-Down

1. Click an account
2. Account detail:
   - Account info (name, owner, created date)
   - Team members list
   - Server list with status
   - App subscriptions with plan/status
   - Billing history (invoices)
3. Admin actions:
   - Suspend/unsuspend account
   - Comp an app plan (override to paid plan for free)
   - Extend trial period
   - Deprovision a server
   - Send a notification to the account owner

### F28: GlowBot Admin — Product Monitoring

1. Operator opens GlowBot admin app (a nex app on its own dedicated server)
2. Dashboard shows GlowBot-specific metrics:
   - Total active clinics, total adapters connected
   - Pipeline run stats (success/fail rate, avg duration)
   - Adapter health across all clinics
   - Peer benchmark coverage
3. Drill into a specific clinic:
   - Their adapter connections and health
   - Pipeline execution history
   - Benchmark comparison
   - Recommendations generated

### F29: Spike Admin — Product Monitoring

1. Same pattern as F28 but for Spike:
   - Total active repos, hydration job stats
   - Ask query latency/cost
   - Repo index coverage
   - Connector health

---

## Flow Dependencies

The flows have these dependencies (showing critical path):

```
F1/F2 (Signup) → F4 (Server Provisioned) → F6 (View Server)
                                          → F13 (Launch App) [if F1]
                                          → F8 (Browse Store) → F10 (Purchase) → F11 (Install) → F13 (Launch)

F5 (New Server) requires active account from F1/F2
F10 (Purchase) requires Stripe integration for paid plans
F11 (Install) requires app tarball + SSH/SCP + runtime install API
F13 (Launch) requires a frontdoor-owned shell and embedded app boundary + static serving in nex
F22 (Invite) requires account entity + membership model
F30 (Agent Connect) requires F1/F2 (human signup) + API token
```

---

## Agentic Flows (F30–F33)

> Added 2026-03-04; updated 2026-03-10. MCP is now an implemented frontdoor surface. These flows describe the customer-facing behavior, while the detailed hosted proof lives in the active validation packet referenced by `docs/validation/FRONTDOOR_HOSTED_VALIDATION_ENTRYPOINT.md`.

### F30: Agent Connects via MCP

1. Human user signs up via OIDC (F1 or F2) — required, no programmatic signup
2. Human creates API token from dashboard: "Settings" → "API Tokens" → "Create Token"
3. Human configures MCP client (Claude Desktop, Cursor, etc.) with:
   ```json
   { "url": "https://frontdoor.nexushub.sh/mcp", "headers": { "Authorization": "Bearer nex_t_..." } }
   ```
4. Agent sends `initialize` → frontdoor returns server info and tool list
5. Agent can now manage platform via MCP tools

### F31: Agent Creates and Manages Server

1. Agent calls `nexus.servers.list` → sees existing servers
2. Agent calls `nexus.servers.create` with `{ name, planId }` → server provisions
3. Agent polls `nexus.servers.get` until status = "running"
4. Entitled apps auto-install on provisioning
5. Agent calls `nexus.servers.get` → sees installed apps
6. Agent can delete server with `nexus.servers.delete` (requires `confirm: true`)

### F32: Agent Manages Apps

1. Agent calls `nexus.apps.catalog` → sees available apps
2. Agent calls `nexus.apps.install` → installs app on server
3. Agent calls `nexus.apps.uninstall` → removes app from server

### F33: Agent Manages Credits

1. Agent calls `nexus.account.credits` → sees balance and usage
2. Agent calls `nexus.account.usage` → sees cost breakdown
3. Human deposits credits via Stripe checkout (agent cannot make payments)
