# Billing Architecture: Account Model + Server & App Subscriptions

Date: 2026-03-02  
Status: confirmed  
Owners: Nexus Platform

---

## 1) Core Principle

Servers and apps are billed separately. Users pay for two things independently:

1. **Server subscriptions** — Pay to keep a server running. Per-server pricing based on tier.
2. **App subscriptions** — Pay for access to an app. Per-account pricing. Once purchased, installable on any of the account's servers at no additional cost.

These are orthogonal. An account with 3 servers, GlowBot Clinic ($149/mo), and Spike Pro ($29/mo) pays: 3× server fee + $149 + $29 = total. GlowBot can be installed on all 3 servers, Spike on any subset.

---

## 2) Account Entity

An **account** is the billing and ownership unit. It sits between users and servers.

- Every user belongs to at least one account.
- On first signup, an account is automatically created with the user as owner.
- An account owns servers and app subscriptions.
- Team members are invited to an account (not to individual servers or apps).
- B2B from the start — accounts represent clinics, engineering teams, organizations.

### Schema

```sql
CREATE TABLE frontdoor_accounts (
  account_id    TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES frontdoor_users(user_id),
  status        TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'suspended' | 'closed'
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE frontdoor_account_memberships (
  account_id    TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
  user_id       TEXT NOT NULL REFERENCES frontdoor_users(user_id),
  role          TEXT NOT NULL DEFAULT 'member',  -- 'owner' | 'admin' | 'member' | 'viewer'
  invited_by    TEXT,
  joined_at_ms  INTEGER NOT NULL,
  PRIMARY KEY(account_id, user_id)
);
```

### Roles

| Role | Billing | Team Mgmt | Server Mgmt | App Use | View Only |
|------|---------|-----------|-------------|---------|-----------|
| Owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin | ❌ | ✅ (invite only) | ✅ | ✅ | ✅ |
| Member | ❌ | ❌ | ❌ | ✅ | ✅ |
| Viewer | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 3) Server Subscriptions

Each server has its own subscription tied to the account.

```sql
CREATE TABLE frontdoor_server_subscriptions (
  server_id       TEXT PRIMARY KEY REFERENCES frontdoor_servers(server_id),
  account_id      TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
  tier            TEXT NOT NULL DEFAULT 'standard',  -- 'starter' | 'standard' | 'performance' | ...
  status          TEXT NOT NULL DEFAULT 'active',    -- 'active' | 'trialing' | 'past_due' | 'cancelled'
  provider        TEXT NOT NULL DEFAULT 'none',      -- 'stripe' | 'mock' | 'none'
  customer_id     TEXT,          -- Stripe customer ID
  subscription_id TEXT,          -- Stripe subscription ID
  period_start_ms INTEGER,
  period_end_ms   INTEGER,
  created_at_ms   INTEGER NOT NULL,
  updated_at_ms   INTEGER NOT NULL
);
```

### Server Tiers

Designed for multiple tiers. Currently only one:

| Tier | Resources | Price | Status |
|------|-----------|-------|--------|
| standard | Cheapest Hetzner VPS | TBD | Current default |
| (future tiers) | Larger VPS options | TBD | Planned |

No free servers. All servers require an active subscription.

---

## 4) App Subscriptions

App subscriptions are per-account, per-app. One subscription covers all servers.

```sql
CREATE TABLE frontdoor_app_subscriptions (
  account_id      TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
  app_id          TEXT NOT NULL,          -- 'glowbot', 'spike', etc.
  plan_id         TEXT NOT NULL,          -- 'glowbot-starter', 'glowbot-clinic', etc.
  status          TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'trialing' | 'past_due' | 'cancelled'
  provider        TEXT NOT NULL DEFAULT 'none',
  customer_id     TEXT,
  subscription_id TEXT,
  period_start_ms INTEGER,
  period_end_ms   INTEGER,
  cancelled_at_ms INTEGER,               -- when cancellation was requested
  cancel_at_ms    INTEGER,               -- when it will actually cancel (end of period)
  created_at_ms   INTEGER NOT NULL,
  updated_at_ms   INTEGER NOT NULL,
  PRIMARY KEY(account_id, app_id)
);
```

### Free Tier Handling

Free app tiers (e.g., GlowBot Starter at $0, Spike Free at $0) create a real subscription record:
```
account_id: "acct_abc123"
app_id: "glowbot"  
plan_id: "glowbot-starter"
status: "active"
provider: "none"  (no Stripe needed for free)
```

This ensures consistent entitlement resolution — always check the subscription, never special-case "no subscription means free."

---

## 5) Entitlements

Entitlements are derived from app subscriptions. When an account subscribes to GlowBot Clinic, the plan's limits become entitlements.

```sql
CREATE TABLE frontdoor_account_entitlements (
  account_id      TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
  app_id          TEXT NOT NULL,
  entitlement_key TEXT NOT NULL,
  entitlement_value TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'plan',  -- 'plan' | 'override' | 'trial' | 'comp'
  expires_at_ms   INTEGER,
  created_at_ms   INTEGER NOT NULL,
  updated_at_ms   INTEGER NOT NULL,
  PRIMARY KEY(account_id, app_id, entitlement_key)
);
```

### Entitlement Resolution Order

1. **Plan defaults**: Parse `limits_json` from the app subscription's plan
2. **Overrides**: Stored entitlements with `source = 'override'` (admin-set)
3. **Trials**: Stored entitlements with `source = 'trial'` (time-limited)
4. **Comps**: Stored entitlements with `source = 'comp'` (operator-granted)

Higher-priority sources override lower ones. Expired entries are ignored.

### Enforcement

Entitlements are checked at:
1. **Frontdoor level** — Before allowing app install, before allowing certain API calls
2. **Runtime level** — Method handlers can query entitlements via the nex SDK to gate features

---

## 6) Stripe Integration

### Checkout Flow (Purchase)

1. User selects a plan (app or server tier)
2. Frontdoor creates a Stripe Checkout Session:
   - `mode: "subscription"`
   - `metadata: { account_id, app_id/server_id, plan_id }`
   - Price ID from the product plan record
3. User completes payment on Stripe
4. Stripe sends webhook → frontdoor processes:
   - Creates/updates subscription record
   - Syncs entitlements from plan

### Webhook Events Handled

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create subscription, sync entitlements |
| `customer.subscription.updated` | Update plan/status, re-sync entitlements |
| `customer.subscription.deleted` | Set status to cancelled, schedule deactivation |
| `invoice.payment_succeeded` | Record invoice, confirm active status |
| `invoice.payment_failed` | Set status to past_due, notify account owner |

### Plan Changes (Upgrade/Downgrade)

Handled via Stripe's subscription update API with proration:
1. Frontdoor calls Stripe to update the subscription's price
2. Stripe prorates and adjusts the next invoice
3. Webhook confirms the change
4. Entitlements updated immediately

---

## 7) Server Ownership

Servers belong to accounts, not users.

```sql
-- Servers table (renamed from workspaces)
CREATE TABLE frontdoor_servers (
  server_id               TEXT PRIMARY KEY,
  account_id              TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
  display_name            TEXT NOT NULL,
  generated_name          TEXT NOT NULL,    -- auto-generated friendly name
  runtime_url             TEXT NOT NULL,
  runtime_public_base_url TEXT NOT NULL,
  runtime_ws_url          TEXT,
  runtime_sse_url         TEXT,
  runtime_auth_token      TEXT,
  status                  TEXT NOT NULL DEFAULT 'provisioning',
  tier                    TEXT NOT NULL DEFAULT 'standard',
  created_at_ms           INTEGER NOT NULL,
  updated_at_ms           INTEGER NOT NULL
);
```

---

## 8) App Install Tracking

Tracks which apps are installed on which servers (independent of billing).

```sql
CREATE TABLE frontdoor_server_app_installs (
  server_id       TEXT NOT NULL REFERENCES frontdoor_servers(server_id),
  app_id          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'not_installed',  -- 'installing' | 'installed' | 'failed' | 'uninstalling'
  version         TEXT,                                    -- installed app version
  entry_path      TEXT,                                    -- e.g., '/app/glowbot/'
  last_error      TEXT,
  installed_at_ms INTEGER,
  source          TEXT NOT NULL DEFAULT 'manual',          -- 'onboarding' | 'manual' | 'admin'
  created_at_ms   INTEGER NOT NULL,
  updated_at_ms   INTEGER NOT NULL,
  PRIMARY KEY(server_id, app_id)
);
```

An app can only be installed on a server if the account has an active subscription for that app.

---

## 9) Migration from Current Schema

The current schema has:
- `frontdoor_workspaces` → becomes `frontdoor_servers` + `frontdoor_accounts`
- `frontdoor_workspace_billing` (per-workspace) → splits into `frontdoor_server_subscriptions` + `frontdoor_app_subscriptions`
- `frontdoor_user_app_entitlements` (per-user) → becomes `frontdoor_app_subscriptions` (per-account)
- `frontdoor_product_entitlements` (per-workspace) → becomes `frontdoor_account_entitlements` (per-account)
- `frontdoor_workspace_app_installs` → becomes `frontdoor_server_app_installs`

This is a hard cutover — no backwards compatibility needed.

---

## 10) Terminology

| Old Term | New Term | Rationale |
|----------|----------|-----------|
| Workspace | Server | Customer-facing term for a nex runtime instance |
| User app entitlement | App subscription | Reflects the billing relationship |
| Workspace billing | Server subscription | Billing is per-server |
| Product entitlement | Account entitlement | Entitlements are account-scoped |
| Tenant | Server | Internal term aligns with customer term |
