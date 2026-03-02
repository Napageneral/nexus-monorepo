# Workplan: Product Registry Sync Pipeline

Date: 2026-03-02
Status: active
Owners: Nexus Platform
Depends on: NEX_APP_MANIFEST_AND_LIFECYCLE spec (product section)

---

## 1) Purpose

Replace the hardcoded `seedProducts()` function in frontdoor with a manifest-driven product registry sync pipeline. Product data (branding, plans, pricing, features, entitlements) should be defined in `app.nexus.json` manifests and synced to frontdoor's database at publish time.

### Reference Specs

1. `NEX_APP_MANIFEST_AND_LIFECYCLE_2026-03-02.md` — Product section of manifest
2. `BILLING_ARCHITECTURE_ACCOUNT_MODEL_2026-03-02.md` — Product plans, entitlements, billing schema

---

## 2) Gap Inventory

### GAP-P01: Hardcoded Product Seed Data

**Current state:**
```typescript
// workspace-store.ts — seedProducts()
function seedProducts() {
  // INSERT OR REPLACE INTO frontdoor_products ...
  // glowbot: display_name, accent_color, tagline, homepage_url, onboarding_origin
  // spike: display_name, accent_color, tagline, homepage_url, onboarding_origin

  // INSERT OR REPLACE INTO frontdoor_product_plans ...
  // glowbot-starter, glowbot-clinic, glowbot-multi
  // spike-free, spike-pro
}
```

All product data is inline TypeScript. Adding or updating a product requires editing frontdoor source code.

**Target state:** Product data comes from `app.nexus.json` manifests. A sync tool reads the manifest's `product` section and upserts into frontdoor's product tables.

---

### GAP-P02: Data Drift Between Manifest and Seed

**Current state:** The manifest spec defines product data (pricing, features, limits), and the seed data has its own values. These can drift:

| Field | Manifest | Seed | Issue |
|-------|----------|------|-------|
| `logoSvg` | `"./assets/logo.svg"` (file path) | No column | Seed lacks logo support |
| `onboardingOrigin` | Present | Present | Values may differ |
| `features` | Array of strings | `features_json TEXT` | Format matches, but values can diverge |
| `priceMonthly` | `14900` (number) | `"14900"` (string) | Type mismatch |
| Stripe price IDs | Not in manifest (Decision 10) | Columns exist, unpopulated | Correct — Stripe IDs are operator config |

**Target state:** Single source of truth. Product data in the manifest is the canonical source. Frontdoor's tables store a copy synced from the manifest. Stripe IDs are added via operator config (admin UI or env vars), not from the manifest.

---

### GAP-P03: Product Table Schema Gaps

**Current state (frontdoor_products):**
```sql
CREATE TABLE IF NOT EXISTS frontdoor_products (
  product_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  accent_color TEXT,
  tagline TEXT,
  homepage_url TEXT,
  onboarding_origin TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
)
```

Missing from schema:
- `logo_svg TEXT` — Logo SVG content or path
- `icon_svg TEXT` — Icon SVG content or path
- `version TEXT` — Which manifest version this data came from

**Current state (frontdoor_product_plans):**
```sql
CREATE TABLE IF NOT EXISTS frontdoor_product_plans (
  plan_id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES frontdoor_products,
  display_name TEXT NOT NULL,
  price_monthly INTEGER NOT NULL DEFAULT 0,
  price_yearly INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  features_json TEXT,
  limits_json TEXT,
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
)
```

This schema is actually close to target. Key differences:
- Stripe price ID columns exist (correct — operator fills these in)
- `limits_json` stores entitlement limits as JSON (correct)
- `features_json` stores feature list as JSON (correct)

**Target state:** Add `logo_svg TEXT`, `icon_svg TEXT`, `manifest_version TEXT` to products table. Rest is fine.

---

### GAP-P04: No Sync Pipeline

**Current state:** No tool, script, or API endpoint that reads a manifest and syncs product data to frontdoor.

**Target state:** A sync pipeline that:
1. Reads `app.nexus.json` from an app package
2. Extracts the `product` section
3. Reads logo/icon SVG file contents from the package
4. Upserts product record in `frontdoor_products`
5. Upserts plan records in `frontdoor_product_plans`
6. Handles plan removal (soft delete plans no longer in manifest)
7. Logs what changed

### Pipeline trigger options (confirmed: publish-time)

The sync runs at **publish time** — when an operator deploys a new app version. For V1, this is a manual CLI tool or script. For V2, it's automated in the CI/CD publish pipeline.

---

### GAP-P05: Entitlement Definition Storage

**Current state:** The manifest defines `entitlements` (what keys exist, their types) and plans define `limits` (what values each plan provides). Frontdoor stores limits in `limits_json` on the plan record.

There's no separate table for entitlement definitions (the schema of what keys are valid). This is fine — the manifest is the schema, and frontdoor just stores the values.

**Target state:** Keep as-is. Frontdoor stores plan limits. Entitlement definitions live in the manifest. The runtime validates entitlement keys against the manifest at runtime.

---

## 3) Implementation Phases

### Phase 1: Schema Updates

| Task | Gap | Estimate |
|------|-----|----------|
| Add `logo_svg`, `icon_svg`, `manifest_version` to `frontdoor_products` | GAP-P03 | 0.5 day |
| Verify `frontdoor_product_plans` schema matches manifest data model | GAP-P03 | 0.5 day |

### Phase 2: Sync Tool (V1 — Manual CLI)

| Task | Gap | Estimate |
|------|-----|----------|
| Write manifest reader (parse product section from app.nexus.json) | GAP-P04 | 0.5 day |
| Write SVG file reader (read logo/icon from app package) | GAP-P04 | 0.5 day |
| Write product upsert logic (products table) | GAP-P04 | 0.5 day |
| Write plan upsert logic (product_plans table) | GAP-P04 | 0.5 day |
| Handle plan removal (soft delete plans not in manifest) | GAP-P04 | 0.5 day |
| Write CLI command: `frontdoor sync-product <path-to-app-package>` | GAP-P04 | 0.5 day |
| Test with GlowBot and Spike manifests | — | 0.5 day |

### Phase 3: Replace Hardcoded Seed

| Task | Gap | Estimate |
|------|-----|----------|
| Run sync tool for GlowBot manifest → verify data matches | GAP-P01 | 0.5 day |
| Run sync tool for Spike manifest → verify data matches | GAP-P01 | 0.5 day |
| Remove `seedProducts()` function from workspace-store.ts | GAP-P01 | 0.5 day |
| Verify frontdoor boots without seed function | — | 0.5 day |

### Phase 4: Stripe ID Operator Config

| Task | Gap | Estimate |
|------|-----|----------|
| Add operator UI or API endpoint for mapping plans to Stripe price IDs | — | 1 day |
| Verify Stripe checkout works with operator-configured price IDs | — | 0.5 day |

---

## 4) V1 vs V2

**V1 (this workplan):**
- Manual CLI tool that reads manifests and syncs to frontdoor database
- Operator runs this tool when deploying new app versions
- Stripe ID mapping via admin UI or direct DB update

**V2 (future):**
- Automated publish pipeline: push app package to registry → triggers sync
- App registry (artifact storage) with version history
- Webhook-based sync on new version publish
- Rollback support (revert to previous product data)

---

## 5) Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| SVG files too large for TEXT column | Low | Validate max size. SVG icons should be <50KB. |
| Plan removal accidentally deactivates billing | Medium | Soft delete: set status='archived', don't hard delete. Active subscriptions on archived plans continue. |
| Sync tool run against wrong database | Medium | CLI tool requires explicit --database flag. No defaults to production. |
| Product data divergence between environments | Low | Sync tool is deterministic. Run in all environments from same manifest. |
