# Frontdoor Product Registry + Product-Branded Billing

Date: 2026-02-26
Owners: Nexus Frontdoor
Status: Design spec — pending implementation
Depends on: FRONTDOOR_WORKSPACE_ADMIN_CONTROL_PLANE_HARD_CUTOVER_2026-02-27, OPERATOR_OWNER_BILLING_DASHBOARD

## 1. Problem

The frontdoor is product-agnostic today. It handles identity (OIDC), workspace provisioning, and runtime routing without knowing which product a workspace belongs to. This works for auth because auth is identity-centric.

Billing is product-centric. A single user may subscribe to Spike Pro and GlowBot Clinic Plan simultaneously with different pricing, entitlements, and billing cycles. The frontdoor needs product awareness to:

1. Route checkout to the correct plan/pricing for a product.
2. Gate product-specific entitlements (e.g., private repo hydration for Spike, adapter count limits for GlowBot).
3. Render product-branded billing experiences (checkout, plan management, receipts) to maintain trust and conversion through the full payment flow.

## 2. Design Decision: Product-Branded Billing (Option B)

The frontdoor renders product-branded billing pages. When a user enters a billing flow for Spike, they see Spike branding (green accent, Spike logo, Spike plan names). When entering a billing flow for GlowBot, they see GlowBot branding (gold accent, GlowBot logo, GlowBot plan names).

Rationale:
- Maintains visual trust continuity from product landing page through checkout.
- Users never see an unfamiliar "Nexus" brand during payment — they see the product they signed up for.
- Improves conversion by eliminating the "where am I?" moment at checkout.
- Each product controls its own pricing language, plan positioning, and upsell messaging.

## 3. Product Registry

### 3.1 Data model

Add `frontdoor_products` table:

```
frontdoor_products
  product_id        TEXT PRIMARY KEY   -- "spike", "glowbot", etc.
  display_name      TEXT NOT NULL      -- "Spike", "GlowBot"
  tagline           TEXT               -- "Code Oracle Platform", "Growth Intelligence for Aesthetic Clinics"
  accent_color      TEXT               -- "#10b981" (Spike green), "#d4a853" (GlowBot gold)
  logo_svg          TEXT               -- inline SVG for product logo
  homepage_url      TEXT               -- "https://spike.fyi", "https://glowbot.app"
  onboarding_origin TEXT               -- where product shell lives for OAuth redirect
  created_at_ms     INTEGER NOT NULL
  updated_at_ms     INTEGER NOT NULL
```

Add `product_id` column to `frontdoor_workspace_billing`:

```
ALTER TABLE frontdoor_workspace_billing ADD COLUMN product_id TEXT;
```

Add `frontdoor_product_plans` table:

```
frontdoor_product_plans
  plan_id           TEXT PRIMARY KEY   -- "spike-free", "spike-pro", "spike-team"
  product_id        TEXT NOT NULL REFERENCES frontdoor_products(product_id)
  display_name      TEXT NOT NULL      -- "Free", "Pro", "Team"
  description       TEXT               -- "For individual developers"
  price_monthly     INTEGER            -- cents, e.g. 2900 = $29/mo
  price_yearly      INTEGER            -- cents, e.g. 29000 = $290/yr (annual)
  stripe_price_id_monthly TEXT         -- Stripe price ID for monthly billing
  stripe_price_id_yearly  TEXT         -- Stripe price ID for annual billing
  features_json     TEXT               -- JSON array of feature strings for plan comparison
  limits_json       TEXT               -- JSON object of entitlement limits
  is_default        INTEGER DEFAULT 0  -- 1 = assigned on free signup
  sort_order        INTEGER DEFAULT 0
  created_at_ms     INTEGER NOT NULL
  updated_at_ms     INTEGER NOT NULL
```

Add `frontdoor_product_entitlements` table:

```
frontdoor_product_entitlements
  workspace_id      TEXT NOT NULL
  product_id        TEXT NOT NULL
  entitlement_key   TEXT NOT NULL      -- "hydration.private_repos", "adapters.max_count", "ask.monthly_limit"
  entitlement_value TEXT NOT NULL      -- "true", "10", "1000"
  source            TEXT NOT NULL      -- "plan", "override", "trial"
  expires_at_ms     INTEGER            -- NULL = permanent
  PRIMARY KEY (workspace_id, product_id, entitlement_key)
```

### 3.2 API additions

#### Product registry (public, no auth required)

- `GET /api/products` — list all registered products (for landing pages, plan comparison).
- `GET /api/products/:productId` — single product metadata + plans.
- `GET /api/products/:productId/plans` — plans for a product with features/pricing.

#### Product-aware billing (auth required)

- `POST /api/billing/:workspaceId/checkout-session` — EXTEND existing endpoint:
  - Add required `product_id` field to request body.
  - Add required `plan_id` field (must belong to product).
  - Add optional `billing_interval` field (`monthly` | `yearly`).
  - Stripe metadata now includes `product_id` in addition to `workspace_id` and `plan_id`.

- `GET /api/billing/:workspaceId/entitlements` — returns resolved entitlements for workspace.
  - Runtime calls this to gate features.
  - Returns merged result of plan entitlements + overrides + trials.

- `GET /api/billing/:workspaceId/plan` — returns current plan details for workspace.
  - Includes product branding metadata for UI rendering.

#### Product-aware workspace creation

- `POST /api/workspaces` — EXTEND existing endpoint:
  - Add required `product_id` field to request body.
  - Auto-assign default plan for that product.
  - Initialize entitlements from default plan.

- Auto-provisioner EXTEND:
  - `product_id` determined from onboarding origin or flavor parameter during OIDC flow.
  - Passed through to workspace creation.

### 3.3 Workspace-product binding

Each workspace belongs to exactly one product. This is set at creation time and cannot change.

```
workspace.product_id = "spike"    -- this workspace is a Spike workspace
workspace.product_id = "glowbot"  -- this workspace is a GlowBot workspace
```

A single user can have workspaces across multiple products. The frontdoor dashboard groups workspaces by product.

## 4. Product-Branded Billing Pages

### 4.1 Flavor-parameterized billing UI

The frontdoor `index.html` shell gains a billing section that renders product-branded content based on the workspace's `product_id`.

When the billing section is active for a Spike workspace:
- Accent color: `#10b981` (green)
- Logo: Spike logo SVG
- Plan names: "Spike Free", "Spike Pro", "Spike Team"
- Feature list: Spike-specific features
- Copy: "Upgrade your code intelligence" / Spike-specific messaging

When the billing section is active for a GlowBot workspace:
- Accent color: `#d4a853` (gold)
- Logo: GlowBot logo SVG
- Plan names: "GlowBot Starter", "GlowBot Clinic", "GlowBot Multi-Clinic"
- Feature list: GlowBot-specific features
- Copy: "Scale your patient growth" / GlowBot-specific messaging

### 4.2 Checkout flow (branded)

1. User clicks "Upgrade" in product shell (spike.fyi or glowbot app).
2. Product shell redirects to `frontdoor/billing?workspace_id=X&product=spike&plan=pro`.
3. Frontdoor loads product metadata + plan details from product registry.
4. Frontdoor renders branded checkout confirmation page:
   - Product logo + accent color
   - Plan comparison table (current vs target)
   - Price + billing interval selector
   - "Continue to payment" button
5. User confirms -> frontdoor creates Stripe checkout session with product metadata.
6. Stripe checkout completes -> webhook updates billing state + entitlements.
7. Frontdoor redirects back to product shell with success state.

### 4.3 Plan management page (branded)

Accessible from both the product shell and the frontdoor dashboard:

- Shows current plan with product branding
- Usage meters (requests, tokens, storage — product-specific metrics)
- Upgrade/downgrade options
- Billing history (invoices)
- Payment method management (links to Stripe customer portal)
- Cancel subscription

### 4.4 Shared vs product-specific billing routes

```
/billing                             -- redirects based on active workspace product
/billing?product=spike               -- Spike-branded billing
/billing?product=glowbot             -- GlowBot-branded billing
/billing/checkout?workspace_id=X     -- branded checkout (product inferred from workspace)
/billing/success                     -- branded success page
/billing/cancel                      -- branded cancellation page
```

## 5. Entitlement Enforcement

### 5.1 Enforcement points

Entitlements are checked at three layers:

1. **Frontdoor (gating layer)**: Workspace creation, app launch, checkout eligibility.
2. **Runtime (enforcement layer)**: API rate limits, feature gates, resource limits.
3. **Product shell (UX layer)**: Upgrade prompts, feature lock icons, usage warnings.

### 5.2 Entitlement resolution order

1. Plan defaults (from `frontdoor_product_plans.limits_json`)
2. Override grants (from `frontdoor_product_entitlements` where source = "override")
3. Trial grants (from `frontdoor_product_entitlements` where source = "trial", not expired)

Later sources override earlier ones. This allows operator overrides and time-limited trials.

### 5.3 Product-specific entitlement keys

#### Spike entitlements

| Key | Type | Free | Pro | Team |
|-----|------|------|-----|------|
| `repos.max_count` | integer | 3 | 25 | unlimited |
| `repos.private_allowed` | boolean | false | true | true |
| `hydration.max_monthly` | integer | 10 | 100 | unlimited |
| `ask.max_monthly` | integer | 50 | 500 | unlimited |
| `mcp.enabled` | boolean | false | true | true |
| `members.max_count` | integer | 1 | 5 | 25 |

#### GlowBot entitlements

| Key | Type | Starter | Clinic | Multi-Clinic |
|-----|------|---------|--------|--------------|
| `clinics.max_count` | integer | 1 | 1 | 10 |
| `adapters.max_count` | integer | 2 | 6 | 6 |
| `pipeline.runs_monthly` | integer | 30 | unlimited | unlimited |
| `agents.enabled` | boolean | false | true | true |
| `benchmarking.enabled` | boolean | false | false | true |
| `members.max_count` | integer | 2 | 10 | 50 |

### 5.4 Runtime entitlement check API

Product runtimes call:

```
GET /api/billing/{workspaceId}/entitlements
Authorization: Bearer <runtime-token>
```

Response:

```json
{
  "ok": true,
  "product_id": "spike",
  "plan_id": "spike-pro",
  "entitlements": {
    "repos.max_count": "25",
    "repos.private_allowed": "true",
    "hydration.max_monthly": "100",
    "ask.max_monthly": "500",
    "mcp.enabled": "true",
    "members.max_count": "5"
  },
  "usage": {
    "repos.count": "8",
    "hydration.monthly_count": "23",
    "ask.monthly_count": "142"
  }
}
```

## 6. OIDC Flow Product Binding

When a user signs up via a product shell, the product identity flows through the OIDC process:

1. **spike.fyi** calls `frontdoor/api/auth/oidc/start?provider=google&return_to=/&product=spike`
2. **GlowBot shell** redirects to shared onboarding with `flavor=glowbot`
3. Frontdoor stores `product_id` in the OIDC state parameter.
4. On callback, auto-provisioner creates workspace with the correct `product_id`.
5. Default plan for that product is auto-assigned.
6. Entitlements are initialized from default plan.

This ensures every workspace has a product binding from the moment it is created.

## 7. Product Shell Integration Contract

Each product shell (spike.fyi, glowbot app) integrates with the frontdoor billing system through:

### 7.1 Upgrade prompt (product shell responsibility)

Product shells check entitlements and render upgrade prompts in their own branding:

```javascript
// Product shell checks entitlement
const entitlements = await fetch('/api/billing/{workspaceId}/entitlements');
if (entitlements.ask.monthly_count >= entitlements.ask.max_monthly) {
  showUpgradePrompt(); // Renders in product branding
}
```

### 7.2 Checkout redirect (product shell -> frontdoor)

```javascript
// Product shell initiates checkout
window.location.href = `${FRONTDOOR_ORIGIN}/billing/checkout?workspace_id=${wsId}&plan=pro`;
```

### 7.3 Plan status display (product shell)

Product shells fetch plan info and render in their own UI:

```javascript
const plan = await fetch('/api/billing/{workspaceId}/plan');
// Render: "Spike Pro — 142/500 asks used this month"
```

## 8. Seed Data

### 8.1 Spike product registration

```json
{
  "product_id": "spike",
  "display_name": "Spike",
  "tagline": "Code Oracle Platform",
  "accent_color": "#10b981",
  "homepage_url": "https://spike.fyi",
  "onboarding_origin": "https://spike.fyi"
}
```

### 8.2 Spike plans

```json
[
  {
    "plan_id": "spike-free",
    "product_id": "spike",
    "display_name": "Free",
    "description": "For trying Spike on public repos",
    "price_monthly": 0,
    "is_default": true,
    "sort_order": 0
  },
  {
    "plan_id": "spike-pro",
    "product_id": "spike",
    "display_name": "Pro",
    "description": "For individual developers and small teams",
    "price_monthly": 2900,
    "price_yearly": 29000,
    "sort_order": 10
  },
  {
    "plan_id": "spike-team",
    "product_id": "spike",
    "display_name": "Team",
    "description": "For engineering teams with shared workspaces",
    "price_monthly": 7900,
    "price_yearly": 79000,
    "sort_order": 20
  }
]
```

### 8.3 GlowBot product registration

```json
{
  "product_id": "glowbot",
  "display_name": "GlowBot",
  "tagline": "Growth Intelligence for Aesthetic Clinics",
  "accent_color": "#d4a853",
  "homepage_url": "https://glowbot.app",
  "onboarding_origin": "https://shell.nexushub.sh"
}
```

### 8.4 GlowBot plans

```json
[
  {
    "plan_id": "glowbot-starter",
    "product_id": "glowbot",
    "display_name": "Starter",
    "description": "Connect your first clinic and see your funnel",
    "price_monthly": 0,
    "is_default": true,
    "sort_order": 0
  },
  {
    "plan_id": "glowbot-clinic",
    "product_id": "glowbot",
    "display_name": "Clinic",
    "description": "Full funnel intelligence for a single clinic",
    "price_monthly": 14900,
    "price_yearly": 149000,
    "sort_order": 10
  },
  {
    "plan_id": "glowbot-multi",
    "product_id": "glowbot",
    "display_name": "Multi-Clinic",
    "description": "Cross-clinic benchmarking and growth optimization",
    "price_monthly": 39900,
    "price_yearly": 399000,
    "sort_order": 20
  }
]
```

## 9. Migration Path

### Phase 1: Product registry + workspace binding
1. Add `frontdoor_products` and `frontdoor_product_plans` tables.
2. Seed Spike and GlowBot product data.
3. Add `product_id` to workspace creation flow.
4. Add `product_id` to auto-provisioner (inferred from OIDC state/flavor).
5. Backfill existing workspaces with correct `product_id`.

### Phase 2: Entitlements system
1. Add `frontdoor_product_entitlements` table.
2. Implement entitlement resolution logic (plan + overrides + trials).
3. Add `GET /api/billing/:workspaceId/entitlements` endpoint.
4. Initialize entitlements from default plan on workspace creation.

### Phase 3: Product-branded billing UI
1. Add product branding data to billing section of frontdoor shell.
2. Implement branded checkout confirmation page.
3. Implement branded plan management page.
4. Wire checkout flow through Stripe with product metadata.
5. Implement webhook handler for plan changes + entitlement updates.

### Phase 4: Product shell integration
1. Add entitlement checking to spike.fyi product shell.
2. Add entitlement checking to GlowBot product shell.
3. Add upgrade prompts and plan status display to both shells.
4. Add checkout redirect flow from product shells to frontdoor.

### Phase 5: Enforcement + go-live
1. Enable entitlement enforcement in Spike runtime.
2. Enable entitlement enforcement in GlowBot runtime.
3. Switch Stripe from test to live mode.
4. Add billing e2e tests (checkout -> webhook -> entitlements -> enforcement).

## 10. Non-Goals

1. Self-service product registration (operator-only for now).
2. Custom domain per product for billing pages (all on frontdoor domain).
3. Multi-product workspaces (one workspace = one product).
4. Usage-based billing metering (flat plan tiers first).
5. Billing for nex runtime directly (products bill, not the platform).

## 11. Acceptance Criteria

1. Every workspace has a `product_id` set at creation.
2. Product shells can initiate checkout that renders in product branding.
3. Checkout completion updates entitlements visible to runtime.
4. Runtimes can check entitlements via API and gate features.
5. Plan upgrade/downgrade updates entitlements immediately.
6. Operator can override entitlements per workspace.
7. Frontdoor dashboard groups workspaces by product.
8. All billing pages render with correct product accent color, logo, and copy.
