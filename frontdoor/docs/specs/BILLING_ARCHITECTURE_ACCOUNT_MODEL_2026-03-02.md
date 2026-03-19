# Billing Architecture: Accounts, Credits, and App Subscriptions

Date: 2026-03-02 (updated 2026-03-10)
Status: CANONICAL
Owners: Nexus Platform

---

## Purpose

This document defines the canonical frontdoor billing model.

It covers:

1. the account as the billing and ownership unit
2. prepaid credits for hosted server usage
3. the free-tier contract for first-server onboarding
4. per-account app subscriptions and entitlements
5. the customer-facing billing surfaces frontdoor owns

## Customer Experience

Billing should feel simple:

1. a user signs into frontdoor and operates within an account
2. the account has one shared credit balance for hosted server usage
3. the first starter server may run under a time-bounded free tier
4. paid server usage deducts from the account credit balance
5. apps are unlocked by per-account subscriptions rather than per-server purchases
6. billing UI shows credit balance, free-tier status, app plans, invoices, and payment methods in one place

The hosted billing story is account-first. The platform does not use a separate
per-server subscription contract as canonical billing truth.

## Canonical Billing Split

Frontdoor bills two things separately.

### 1. Server usage

Server usage is paid from an account credit balance.

Rules:

1. credits are held at the account level
2. server plans determine hourly burn rate
3. running servers deduct usage from credits
4. if credits are exhausted outside the free tier, running servers are suspended
5. adding credits allows suspended servers to resume

### 2. App access

App access is granted by per-account app subscriptions.

Rules:

1. one app subscription unlocks that app across the account's eligible servers
2. app subscriptions and server credits are orthogonal
3. app entitlements are resolved from the subscription plus overrides/trials/comps

## Account Entity

An account is the billing and ownership unit between users and servers.

- every user belongs to at least one account
- an account owns servers, credits, app subscriptions, and memberships
- team members are invited to the account, not to individual billing records

Canonical account tables:

```sql
CREATE TABLE frontdoor_accounts (
  account_id    TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES frontdoor_users(user_id),
  status        TEXT NOT NULL DEFAULT 'active',
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE frontdoor_account_memberships (
  account_id    TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
  user_id       TEXT NOT NULL REFERENCES frontdoor_users(user_id),
  role          TEXT NOT NULL DEFAULT 'member',
  invited_by    TEXT,
  joined_at_ms  INTEGER NOT NULL,
  PRIMARY KEY(account_id, user_id)
);
```

## Credits Model

Credits are the canonical billing contract for hosted server usage.

Canonical credit tables:

```sql
CREATE TABLE frontdoor_account_credits (
  account_id             TEXT PRIMARY KEY REFERENCES frontdoor_accounts(account_id),
  balance_cents          INTEGER NOT NULL DEFAULT 0,
  currency               TEXT NOT NULL DEFAULT 'usd',
  free_tier_expires_at_ms INTEGER,
  updated_at_ms          INTEGER NOT NULL
);

CREATE TABLE frontdoor_credit_transactions (
  transaction_id        TEXT PRIMARY KEY,
  account_id            TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
  amount_cents          INTEGER NOT NULL,
  balance_after_cents   INTEGER NOT NULL,
  type                  TEXT NOT NULL,
  description           TEXT NOT NULL,
  reference_id          TEXT,
  created_at_ms         INTEGER NOT NULL
);
```

### Credit Rules

1. positive transactions add credits
2. negative transactions deduct usage
3. the ledger is append-only at the transaction level
4. account balance is authoritative for hosted server eligibility outside the free tier
5. `reference_id` is used for idempotent hourly usage deduction and payment reconciliation

### Free Tier

The free tier is an account-level bootstrap state on the credit record.

Rules:

1. the first server may run under a time-bounded free tier
2. the canonical initial free tier is one `cax11` server for seven days
3. free-tier state lives on the credit record, not in a parallel subscription system
4. once the free tier expires, server creation and continued paid usage require credits

### Suspension

If an account has no credits outside the free tier:

1. running servers may be suspended
2. routing for those servers is removed until billing is resolved
3. a later credit deposit may unsuspend the servers without reprovisioning

## App Subscriptions

App access is account-scoped.

Canonical subscription table:

```sql
CREATE TABLE frontdoor_app_subscriptions (
  account_id       TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
  app_id           TEXT NOT NULL,
  plan_id          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active',
  provider         TEXT NOT NULL DEFAULT 'none',
  customer_id      TEXT,
  subscription_id  TEXT,
  period_start_ms  INTEGER,
  period_end_ms    INTEGER,
  cancelled_at_ms  INTEGER,
  cancel_at_ms     INTEGER,
  created_at_ms    INTEGER NOT NULL,
  updated_at_ms    INTEGER NOT NULL,
  PRIMARY KEY(account_id, app_id)
);
```

Rules:

1. an account either has an active app subscription or it does not
2. free app plans still create real subscription rows
3. frontdoor uses app subscriptions to decide install eligibility
4. app subscriptions do not replace credits and credits do not replace app subscriptions

## Entitlements

Entitlements are the effective account/app capability state derived from app
subscriptions and policy overrides.

Canonical entitlement table:

```sql
CREATE TABLE frontdoor_account_entitlements (
  account_id        TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
  app_id            TEXT NOT NULL,
  entitlement_key   TEXT NOT NULL,
  entitlement_value TEXT NOT NULL,
  source            TEXT NOT NULL DEFAULT 'plan',
  expires_at_ms     INTEGER,
  created_at_ms     INTEGER NOT NULL,
  updated_at_ms     INTEGER NOT NULL,
  PRIMARY KEY(account_id, app_id, entitlement_key)
);
```

Resolution order:

1. plan defaults
2. overrides
3. trials
4. comps

Higher-priority active sources win.

## Payment Flows

### Credit deposit

1. user opens billing and chooses a deposit amount
2. frontdoor creates a deposit checkout session
3. payment provider confirms completion
4. frontdoor appends a positive credit transaction and updates balance
5. suspended servers may resume once sufficient balance exists

### App subscription purchase

1. user selects an app plan
2. frontdoor creates or updates the provider subscription
3. webhook reconciliation updates the app subscription row
4. entitlements refresh from the resulting plan state

### Payment methods and invoices

Frontdoor may delegate hosted card management and invoice detail to the payment
provider portal while keeping billing summary and entitlement state in the
frontdoor UI.

## Relationship To Server State

Servers still carry plan and usage state, but the billing contract is not a
per-server subscription row.

Server-related billing facts include:

1. server plan affects hourly usage burn
2. server status may become `suspended` when credits are exhausted
3. usage summaries may be stored per server for reporting
4. `tenant_id` is routing identity, not the billing key

## Customer-Facing Billing Surfaces

Frontdoor-owned billing UI should expose:

1. account credit balance
2. recent credit transactions
3. free-tier status and remaining time when applicable
4. app subscriptions and current plans
5. invoices and payment-method management links
6. server usage summaries and suspension state

## Canonical Billing Terms

| Term | Meaning |
|---|---|
| `account` | Billing and ownership container for servers, credits, subscriptions, and members |
| `credit balance` | Current prepaid balance used for hosted server usage |
| `credit transaction` | Immutable ledger entry recording deposit, usage, refund, or adjustment |
| `free tier` | Time-bounded bootstrap allowance attached to the account credit record |
| `app subscription` | Per-account plan that unlocks app access and entitlements |
| `entitlement` | Effective capability state derived from plan or override |
| `server plan` | Resource/price class that determines hosted usage burn |
| `tenant_id` | Runtime routing identity, not a billing identity |

## Non-Negotiable Rules

1. active hosted server billing uses credits, not per-server subscriptions
2. active app access uses per-account app subscriptions
3. free tier belongs to the account credit model
4. frontdoor is the billing control plane for hosted accounts
5. billing docs must not reintroduce `workspace` or legacy per-server subscription terminology as canonical truth
