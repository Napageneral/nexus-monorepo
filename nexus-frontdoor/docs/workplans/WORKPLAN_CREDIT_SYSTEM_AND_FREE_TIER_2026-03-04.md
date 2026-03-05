# Workplan: Credit System and Free Tier

**Date:** 2026-03-04
**Status:** NOT STARTED
**Spec:** `docs/specs/FRONTDOOR_MCP_SERVER_AND_AGENTIC_ACCESS_2026-03-04.md` (sections 6-7)
**Depends on:** App Installation Pipeline, MCP Server (for metered tool calls)
**Approach:** HARD CUTOVER — replaces the existing per-server Stripe subscription model with prepaid credits. Old billing tables (`frontdoor_server_subscriptions` as billing mechanism) are superseded. No dual billing paths, no migration period.

---

## Objective

Replace the existing per-server Stripe subscription billing model with a prepaid credit system. Users deposit credits (via Stripe or crypto), and server usage is billed hourly from their balance. A 7-day free tier allows new users to try the platform without payment. Hard cutover — the old subscription-based billing is deleted, not deprecated.

After this workplan is complete:
- Accounts have a credit balance (in cents/USD)
- Server uptime billed hourly from credit balance
- 7-day free trial for first server (no payment required)
- Stripe payment → credit deposit flow working
- Servers suspended when balance reaches zero
- Credit balance visible in dashboard and MCP tools
- Old subscription-based server billing code is deleted

---

## Current State Analysis

### What EXISTS Today

| Component | Status | Notes |
|-----------|--------|-------|
| `frontdoor_server_subscriptions` table | ✅ Exists | Per-server billing, tier/status/provider |
| `frontdoor_app_subscriptions` table | ✅ Exists | Per-app entitlement tracking |
| `frontdoor_account_entitlements` table | ✅ Exists | Derived entitlements |
| `frontdoor_server_usage_daily` table | ✅ Exists | Daily usage stats (requests, tokens) |
| `frontdoor_account_invoices` table | ✅ Exists | Invoice tracking |
| `frontdoor_billing_events` table | ✅ Exists | Webhook idempotency + audit |
| Stripe checkout session creation | ✅ Exists | `billing.ts:103` |
| Stripe webhook verification | ✅ Exists | `billing.ts:208` |
| Mock billing provider | ✅ Exists | For testing without Stripe |
| Billing webhook handler | ✅ Partial | Handles server subscriptions only |

### What's MISSING

| Gap | Description | Complexity |
|-----|-------------|------------|
| Credit balance table | `frontdoor_account_credits` | Small |
| Credit transaction log | `frontdoor_credit_transactions` | Small |
| Credit store methods | get/add/deduct balance | Medium |
| Hourly billing job | Calculate costs, deduct from balance | Medium |
| Free tier logic | 7-day trial check on server creation | Small |
| Stripe deposit flow | One-time payment → credit deposit | Medium |
| Insufficient balance handling | Suspend servers at zero balance | Medium |
| Credit API endpoints | Balance, transactions, deposit | Small |
| MCP credit tools | Account balance/usage via MCP | Small (after MCP) |

---

## Implementation Phases

### Phase 1: Database Schema

**Goal:** Add credit-related tables to `frontdoor-store.ts`.

#### 1.1 Add `frontdoor_account_credits` table

- **File:** `src/frontdoor-store.ts`
- **Location:** After `frontdoor_account_invoices` table
- **Schema:**
  ```sql
  CREATE TABLE IF NOT EXISTS frontdoor_account_credits (
    account_id TEXT PRIMARY KEY REFERENCES frontdoor_accounts(account_id),
    balance_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'usd',
    free_tier_expires_at_ms INTEGER,  -- NULL if no free tier, timestamp if active
    updated_at_ms INTEGER NOT NULL
  );
  ```

#### 1.2 Add `frontdoor_credit_transactions` table

- **File:** `src/frontdoor-store.ts`
- **Schema:**
  ```sql
  CREATE TABLE IF NOT EXISTS frontdoor_credit_transactions (
    transaction_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES frontdoor_accounts(account_id),
    amount_cents INTEGER NOT NULL,       -- positive = deposit, negative = deduction
    balance_after_cents INTEGER NOT NULL,
    type TEXT NOT NULL,                   -- 'deposit', 'usage', 'refund', 'trial_grant', 'adjustment'
    description TEXT NOT NULL,
    reference_id TEXT,                    -- Stripe payment ID, server ID, etc.
    created_at_ms INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_frontdoor_credit_transactions_account
    ON frontdoor_credit_transactions(account_id);
  CREATE INDEX IF NOT EXISTS idx_frontdoor_credit_transactions_created
    ON frontdoor_credit_transactions(created_at_ms);
  ```

#### 1.3 Add store methods

- **File:** `src/frontdoor-store.ts`
- **Methods:**
  ```typescript
  // Get current balance
  getCreditBalance(accountId: string): { balanceCents: number; currency: string; freeTierExpiresAtMs: number | null } | null;

  // Initialize credit record for new account
  initializeCredits(accountId: string, initialBalanceCents?: number, freeTierExpiresAtMs?: number): void;

  // Add credits (deposit, refund, trial grant)
  addCredits(params: {
    accountId: string;
    amountCents: number;
    type: 'deposit' | 'refund' | 'trial_grant' | 'adjustment';
    description: string;
    referenceId?: string;
  }): { transactionId: string; balanceAfterCents: number };

  // Deduct credits (usage billing)
  deductCredits(params: {
    accountId: string;
    amountCents: number;
    type: 'usage';
    description: string;
    referenceId?: string;
  }): { ok: true; transactionId: string; balanceAfterCents: number } | { ok: false; error: 'insufficient_balance'; currentBalanceCents: number };

  // List transactions
  getCreditTransactions(accountId: string, opts?: { limit?: number; offset?: number }): CreditTransaction[];
  ```

**Validation:**
- [ ] Tables created on startup without errors
- [ ] `initializeCredits()` creates a credit record
- [ ] `addCredits()` increases balance and creates transaction
- [ ] `deductCredits()` decreases balance and creates transaction
- [ ] `deductCredits()` returns error when balance insufficient
- [ ] `getCreditTransactions()` returns ordered transaction history

---

### Phase 2: Free Tier

**Goal:** Grant new accounts a 7-day free trial for one cax11 server.

#### 2.1 Initialize credits on account creation

- **File:** `src/server.ts`
- **Location:** Account creation flow (OIDC auto-provision or manual)
- **Change:** After creating account, call:
  ```typescript
  store.initializeCredits(accountId, 0, Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  ```

#### 2.2 Free tier check on server creation

- **File:** `src/server.ts`
- **Location:** `POST /api/servers/create` handler (line ~5215)
- **Logic:**
  ```typescript
  const credits = store.getCreditBalance(accountId);
  const isFreeTier = credits?.freeTierExpiresAtMs && credits.freeTierExpiresAtMs > Date.now();
  const hasBalance = credits && credits.balanceCents > 0;

  if (!isFreeTier && !hasBalance) {
    return sendJson(res, 402, {
      ok: false,
      error: "payment_required",
      message: "Add credits to your account before creating a server"
    });
  }

  // Limit free tier to cax11 plan
  if (isFreeTier && !hasBalance && planId !== "cax11") {
    return sendJson(res, 402, {
      ok: false,
      error: "free_tier_plan_limit",
      message: "Free tier is limited to the Starter (cax11) plan"
    });
  }

  // Limit free tier to 1 server
  if (isFreeTier && !hasBalance) {
    const existingServers = store.getServersForAccount(accountId);
    const activeServers = existingServers.filter(s => s.status !== "deleted");
    if (activeServers.length >= 1) {
      return sendJson(res, 402, {
        ok: false,
        error: "free_tier_server_limit",
        message: "Free tier is limited to 1 server. Add credits for additional servers."
      });
    }
  }
  ```

#### 2.3 Free tier expiry warning

- **File:** `src/server.ts`
- **Add to `GET /api/account` or server list response:**
  ```json
  {
    "freeTier": {
      "active": true,
      "expiresAt": "2026-03-11T...",
      "daysRemaining": 5
    }
  }
  ```

**Validation:**
- [ ] New OIDC account gets credit record with 7-day free tier
- [ ] Free tier account can create one cax11 server
- [ ] Free tier account blocked from creating second server
- [ ] Free tier account blocked from non-cax11 plans
- [ ] After free tier expires, server creation requires credits
- [ ] Free tier status visible in API response

---

### Phase 3: Credit Deposit Flow (Stripe)

**Goal:** Allow users to deposit credits via Stripe one-time payments.

#### 3.1 Add credit deposit endpoint

- **File:** `src/server.ts`
- **Route:** `POST /api/account/credits/deposit`
- **Body:** `{ amountCents: number }` (minimum: 500 = $5.00)
- **Flow:**
  1. Validate amount (min $5, max $1000)
  2. Create Stripe Checkout Session in `payment` mode (not subscription)
  3. Set `metadata.accountId` and `metadata.amountCents`
  4. Return checkout URL

#### 3.2 Modify billing webhook handler

- **File:** `src/server.ts`
- **Location:** Billing webhook handler
- **Add:** Handle `checkout.session.completed` for credit deposits:
  ```typescript
  if (event.type === "checkout.session.completed" && event.metadata?.type === "credit_deposit") {
    const accountId = event.metadata.accountId;
    const amountCents = parseInt(event.metadata.amountCents);
    store.addCredits({
      accountId,
      amountCents,
      type: "deposit",
      description: `Stripe deposit: $${(amountCents / 100).toFixed(2)}`,
      referenceId: event.paymentId,
    });
  }
  ```

#### 3.3 Modify `createCheckoutSession` for one-time payments

- **File:** `src/billing.ts`
- **Change:** Support `mode: "payment"` in addition to `mode: "subscription"`
- **Add function:**
  ```typescript
  export function createCreditDepositSession(params: {
    amountCents: number;
    accountId: string;
    successUrl: string;
    cancelUrl: string;
    stripeSecretKey: string;
  }): Promise<{ checkoutUrl: string }>;
  ```

#### 3.4 Add credit balance endpoint

- **File:** `src/server.ts`
- **Route:** `GET /api/account/credits`
- **Response:**
  ```json
  {
    "balanceCents": 5000,
    "currency": "usd",
    "formattedBalance": "$50.00",
    "freeTier": { "active": true, "expiresAt": "2026-03-11T..." },
    "recentTransactions": [
      { "type": "deposit", "amountCents": 5000, "description": "Stripe deposit", "createdAt": "..." }
    ]
  }
  ```

**Validation:**
- [ ] `POST /api/account/credits/deposit` creates Stripe checkout
- [ ] Stripe payment webhook credits the account
- [ ] `GET /api/account/credits` shows updated balance
- [ ] Minimum deposit enforced ($5)
- [ ] Transaction history records deposits

---

### Phase 4: Hourly Usage Billing

**Goal:** Deduct credits from accounts based on server uptime.

#### 4.1 Define hourly rates

- **Constants in `src/server.ts` or `src/billing.ts`:**
  ```typescript
  const HOURLY_RATES_CENTS: Record<string, number> = {
    cax11: 1,   // $0.01/hour ≈ $7.20/month (€3.29 Hetzner cost)
    cax21: 1,   // $0.01/hour ≈ $7.20/month (€5.49 cost)
    cax31: 2,   // $0.02/hour ≈ $14.40/month (€9.49 cost)
  };
  ```
  - **Note:** Pricing can be adjusted. Free tier covers the hourly rate.

#### 4.2 Implement billing job

- **File:** `src/server.ts`
- **Mechanism:** `setInterval` running every hour (or every 15 minutes for finer granularity)
- **Logic:**
  ```typescript
  async function runHourlyBilling() {
    const allAccounts = store.getActiveAccountsWithServers();
    for (const account of allAccounts) {
      const credits = store.getCreditBalance(account.accountId);
      if (!credits) continue;

      // Skip billing if free tier active
      const isFreeTier = credits.freeTierExpiresAtMs && credits.freeTierExpiresAtMs > Date.now();
      if (isFreeTier) continue;

      // Calculate hourly cost for all running servers
      let totalCostCents = 0;
      const servers = store.getServersForAccount(account.accountId);
      for (const server of servers) {
        if (server.status !== "running") continue;
        const rate = HOURLY_RATES_CENTS[server.planId] ?? 1;
        totalCostCents += rate;
      }

      if (totalCostCents === 0) continue;

      // Deduct
      const result = store.deductCredits({
        accountId: account.accountId,
        amountCents: totalCostCents,
        type: "usage",
        description: `Hourly usage: ${servers.filter(s => s.status === "running").length} server(s)`,
        referenceId: `billing-${Date.now()}`,
      });

      if (!result.ok) {
        // Insufficient balance — handle suspension
        console.warn(`[billing] Account ${account.accountId} has insufficient balance (${credits.balanceCents}¢), suspending servers`);
        await handleInsufficientBalance(account.accountId);
      }
    }
  }

  // Run every hour
  setInterval(runHourlyBilling, 60 * 60 * 1000);
  ```

#### 4.3 Insufficient balance handling

- **Function:** `handleInsufficientBalance(accountId)`
- **Behavior:**
  1. Mark all running servers for account as "suspended" (new status)
  2. Do NOT destroy VPSes — just stop proxying traffic
  3. Log warning
  4. (Future: send email notification)
- **Recovery:** When credits deposited, unsuspend servers automatically

#### 4.4 Add "suspended" server status

- **File:** `src/server.ts`
- **Change:** Add "suspended" to server status enum
- **Routing:** Suspended servers return 402 Payment Required instead of proxying

**Validation:**
- [ ] Hourly billing job runs and deducts correct amounts
- [ ] Free tier accounts not billed
- [ ] Multiple running servers billed at combined rate
- [ ] Zero-balance account gets servers suspended
- [ ] Suspended servers return 402 to clients
- [ ] Credit deposit unsuspends servers
- [ ] Billing transactions visible in transaction history

---

### Phase 5: API & MCP Integration

**Goal:** Expose credit system via API endpoints and MCP tools.

#### 5.1 API Endpoints Summary

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/account/credits` | Balance + recent transactions |
| `POST` | `/api/account/credits/deposit` | Create Stripe checkout for deposit |
| `GET` | `/api/account/credits/transactions` | Full transaction history |

#### 5.2 MCP Tool: `nexus.account.credits`

- **Input:** `{}`
- **Output:** Balance, free tier status, burn rate estimate

#### 5.3 MCP Tool: `nexus.account.usage`

- **Input:** `{ period?: "current_month" | "last_month" | "all_time" }`
- **Output:** Usage breakdown by server, costs, projections

**Validation:**
- [ ] MCP tool returns correct credit balance
- [ ] MCP tool shows usage breakdown
- [ ] Agent can check balance before creating server

---

## Future Work (Out of Scope)

- **Crypto payments** (x402, USDC): Separate workplan after Stripe credits work
- **Auto-top-up:** Automatic Stripe charges when balance low
- **Usage alerts:** Email/webhook notifications at balance thresholds
- **Per-app metering:** Track and bill for app-specific API usage
- **Billing dashboard:** UI for viewing credits, transactions, invoices

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Billing job crashes | Wrap in try/catch, log errors, don't crash server |
| Double-billing | Use transaction IDs with billing period reference for idempotency |
| Clock skew | Bill in UTC hours, round to nearest hour |
| Negative balance | Allow small negative balance (up to $1) before suspending |
| Free tier abuse | Limit to 1 free trial per email domain, track by OIDC identity |

---

## Estimated Effort

| Phase | Effort | Description |
|-------|--------|-------------|
| Phase 1: Database Schema | 1-2 hours | Tables, store methods |
| Phase 2: Free Tier | 2-3 hours | Account init, server creation checks |
| Phase 3: Stripe Deposits | 3-4 hours | Checkout flow, webhook handling |
| Phase 4: Hourly Billing | 3-4 hours | Billing job, suspension logic |
| Phase 5: API & MCP | 1-2 hours | Endpoints, MCP tools |
| **Total** | **10-15 hours** | |

---

## Changelog

- 2026-03-04: Initial workplan created from gap analysis
- 2026-03-04: Added HARD CUTOVER approach — replaces subscription billing, no dual paths
