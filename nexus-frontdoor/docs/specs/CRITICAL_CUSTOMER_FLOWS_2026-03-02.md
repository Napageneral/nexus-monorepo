# Critical Customer Flows

Date: 2026-03-02
Status: confirmed
Owners: Nexus Platform

## Confirmed Design Decisions

- **Billing model**: Servers and apps are billed separately. Servers have per-server subscriptions. Apps have per-account subscriptions. Once you buy an app, you can install it on any of your account's servers.
- **Account entity**: Exists from the start (B2B — clinics, engineering teams). Sits between users and servers. An account owns servers and app subscriptions. Users are members of accounts.
- **Server tiers**: Design for multiple tiers (small/medium/large). Currently only one tier (cheapest Hetzner). No free servers.
- **Free tier handling**: Free app tiers create an active subscription record with the free plan ID.
- **App frame**: Frontdoor injects a persistent dock/bar when user is inside an app, allowing navigation back to dashboard, switching apps, account management.
- **All app UIs hosted on nex runtime**: No external proxies. Apps serve static built UI files through nex, with method handlers running inside nex for backend logic.

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
6. User lands in GlowBot dashboard (inside frontdoor app frame at /app/glowbot/)
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
3. Billing: server subscription created, goes through Stripe checkout if paid
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
2. User selects target server (if not already selected)
3. Click "Install"
4. Status transitions: not_installed → installing → installed (or failed)
5. Visual progress during installation
6. Once installed, app card on server detail shows "Launch" button

### F12: Uninstall App from a Server

1. From server detail, click menu on app card → "Uninstall"
2. Confirmation dialog: "Remove GlowBot from this server? Your subscription and data remain — you can reinstall anytime."
3. App removed from server
4. App subscription remains active — user can reinstall on any server
5. App data on server: preserved (soft delete) or cleaned up based on user choice

### F13: Launch an App

1. From server detail, click "Launch" on an installed app card
2. Navigation: → `/app/<appId>/` within frontdoor app frame
3. Frontdoor app frame/dock becomes visible:
   - Shows current app, other installed apps for quick switch
   - Back to dashboard button
   - Account menu
4. App loads its UI (served as static files from nex runtime)
5. App UI connects to nex runtime via WebSocket for data

---

## App Frame / In-App Navigation Flows

### F14: Navigate Between Apps

1. While inside GlowBot, use frontdoor dock to switch to Spike
2. Click Spike in the dock → navigates to `/app/spike/` on the same server
3. GlowBot state: handled by browser (different URL path, app manages its own state)
4. Spike loads in the frame

### F15: Return to Server Dashboard

1. Click home/dashboard icon in frontdoor dock
2. → Back to server dashboard view
3. App frame/dock hides or transforms to dashboard nav

### F16: Switch Servers

1. From dock or dashboard, server switcher
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

### F20: Cancel Server Subscription

1. From billing, click "Cancel" on a server subscription
2. Confirmation: "This server and all its data will be deprovisioned at the end of your billing period on [date]."
3. Server stays running until period end
4. At period end: server deprovisioned, data archived/deleted per policy

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
   - Total revenue (server subs + app subs)
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
F11 (Install) requires app manifest + install hooks in nex runtime
F13 (Launch) requires app frame/dock in frontdoor + static serving in nex
F22 (Invite) requires account entity + membership model
```
