# Nexus Hosted Dashboard + Billing (Operator / Workspace Owner)

## Goal

Define a single hosted control experience with role-scoped views:

- Operator: platform-wide operations (tenants, provisioning, support, billing overrides)
- Workspace owner/admin: workspace management (members, invites, settings, usage)
- Workspace member/viewer: constrained runtime usage only

This keeps one UI/API while enforcing permissions through IAM and frontdoor auth.

## Scope

In scope:

- Dashboard surface model and API ownership split
- Frontdoor data model additions for billing and workspace operations
- Payment integration contract (provider-agnostic, Stripe-first)
- Enforcement and testing requirements

Out of scope:

- OIDC provider-specific UX polish
- Deep runtime sandboxing model (tracked separately)

## Surface Model

All browser traffic enters frontdoor shell. Frontdoor routes by role:

- `operator` routes: platform-level APIs and views
- `workspace_owner` / `workspace_admin` routes: workspace-level management
- `workspace_member` / `workspace_viewer`: runtime-only operations

The shell remains one app; navigation and route access are role-gated.

## API Taxonomy

### Operator APIs

- `GET /api/operator/workspaces`
- `POST /api/operator/workspaces/provision`
- `POST /api/operator/workspaces/:id/suspend`
- `POST /api/operator/workspaces/:id/resume`
- `GET /api/operator/workspaces/:id/runtime-health`
- `POST /api/operator/workspaces/:id/impersonation-token` (strict audit)

### Workspace owner/admin APIs

- `GET /api/workspace/:id/members`
- `POST /api/workspace/:id/invites`
- `POST /api/workspace/:id/invites/revoke`
- `GET /api/workspace/:id/usage`
- `GET /api/workspace/:id/billing/summary`
- `POST /api/workspace/:id/ingress-keys`
- `POST /api/workspace/:id/ingress-keys/:keyId/revoke`

### Billing APIs

- `POST /api/billing/:workspaceId/checkout-session`
- `GET /api/billing/:workspaceId/subscription`
- `GET /api/billing/:workspaceId/invoices`
- `POST /api/billing/webhook` (provider callback, signed)

## Data Model (frontdoor store)

Add frontdoor-owned tables:

- `frontdoor_workspace_billing`
  - `workspace_id`, `billing_customer_id`, `billing_subscription_id`, `plan_id`, `status`
- `frontdoor_billing_events`
  - `provider`, `event_id`, `workspace_id`, `received_at_ms`, `payload_json`, `processed_at_ms`, `status`
- `frontdoor_workspace_usage_daily`
  - `workspace_id`, `date`, `requests_total`, `tokens_in`, `tokens_out`, `storage_bytes`, `active_members`
- `frontdoor_workspace_limits`
  - `workspace_id`, `max_members`, `max_monthly_tokens`, `max_adapters`, `max_concurrent_sessions`

## Payment Flow (Stripe-first adapter)

1. Workspace owner requests checkout session from frontdoor.
2. Frontdoor creates provider checkout session bound to `workspace_id`.
3. Provider webhook hits `/api/billing/webhook`; signature validated.
4. Frontdoor updates billing tables and workspace entitlements.
5. Entitlements gate provisioning/limits/API key issuance in frontdoor.

## Auth + IAM enforcement

- Frontdoor session identifies user principal.
- Every dashboard API authorizes against IAM with action/resource taxonomy.
- Mutating APIs require same-origin browser checks.
- Every privileged action is audit-logged with request id, actor, workspace, action, outcome.

## UI Sections

### Operator dashboard

- Workspace inventory + health
- Provisioning queue and lifecycle state
- Runtime connectivity checks
- Billing exceptions/overrides

### Workspace owner dashboard

- Member/invite management
- Ingress credentials and API key lifecycle
- Usage and limits
- Billing summary and plan controls

## Rollout Plan

1. Add operator/workspace dashboard route shells with role gating only.
2. Implement read-only APIs (`list`, `summary`, `usage`) + audit.
3. Implement workspace invites + ingress key lifecycle in owner dashboard.
4. Add checkout + webhook billing loop and entitlement enforcement.
5. Add operator provisioning controls and runtime support tools.
6. Add e2e tests for each role’s allowed/denied actions.

## Implementation Status (Current)

Implemented now:

- Operator inventory read API:
  - `GET /api/operator/workspaces`
- Workspace owner/admin read APIs:
  - `GET /api/workspaces/:id/usage`
  - `GET /api/workspaces/:id/billing/summary`
- Billing scaffold APIs:
  - `POST /api/billing/:workspaceId/checkout-session`
  - `GET /api/billing/:workspaceId/subscription`
  - `GET /api/billing/:workspaceId/invoices`
  - `POST /api/billing/webhook`
- Frontdoor store tables:
  - `frontdoor_workspace_billing`
  - `frontdoor_workspace_limits`
  - `frontdoor_workspace_usage_daily`
  - `frontdoor_billing_events`
  - `frontdoor_workspace_invoices`
- Shell UI surfaces:
  - owner/admin workspace insights card (usage + billing + invoices + checkout launch)
  - operator inventory card
- Automated validation:
  - backend unit/integration tests
  - frontend API tests
  - browser e2e role-gating and checkout-launch smoke

Still pending:

- Real Stripe live mode rollout (non-mock) and env productionization
- Billing plan entitlement enforcement against runtime quotas
- Operator billing exception workflows
- Product registry integration (see below)

## Product Registry Integration

> See: `nexus-frontdoor/docs/specs/FRONTDOOR_PRODUCT_REGISTRY_AND_BRANDED_BILLING_2026-02-26.md`

The billing system is being extended with product awareness:

### Key additions

1. **Product registry** — `frontdoor_products` and `frontdoor_product_plans` tables define per-product plans, pricing, branding, and entitlements.

2. **Product-branded billing UI** — Checkout, plan management, and receipt pages render with product-specific branding (logo, accent color, plan names, feature lists). This maintains visual trust from product landing page through payment.

3. **Entitlements system** — `frontdoor_product_entitlements` table stores resolved entitlements per workspace. Runtimes check `GET /api/billing/:workspaceId/entitlements` to gate features. Entitlements are derived from plan + operator overrides + trials.

4. **Product binding** — Each workspace has a `product_id` set at creation. Product is determined from the OIDC flow origin or flavor parameter. Workspaces belong to exactly one product.

5. **Checkout flow** — Product shells redirect to `frontdoor/billing/checkout?workspace_id=X&plan=Y`. Frontdoor loads product branding and renders a branded checkout confirmation before redirecting to Stripe.

### Registered products

| Product | ID | Accent | Plans |
|---------|----|--------|-------|
| Spike | `spike` | `#10b981` (green) | Free, Pro ($29/mo), Team ($79/mo) |
| GlowBot | `glowbot` | `#d4a853` (gold) | Starter (free), Clinic ($149/mo), Multi-Clinic ($399/mo) |

### Updated API taxonomy

Billing APIs now require `product_id` context:

- `POST /api/billing/:workspaceId/checkout-session` — extended with `product_id` and `plan_id`
- `GET /api/billing/:workspaceId/entitlements` — returns product-scoped entitlements + usage
- `GET /api/billing/:workspaceId/plan` — returns current plan with product branding metadata
- `GET /api/products` — public product catalog (no auth)
- `GET /api/products/:productId/plans` — public plan comparison (no auth)

### Dashboard updates

Workspace owner dashboard groups workspaces by product and shows product-branded billing info:
- Plan name with product context ("Spike Pro" not just "Pro")
- Product-specific usage meters
- Upgrade/downgrade with product-branded plan comparison

Operator dashboard gets product-level views:
- Revenue by product
- Subscriber counts by product x plan
- Entitlement override management per product

## Testing Requirements

- Unit tests: billing state transitions, entitlement checks, API authz.
- Integration tests: webhook signature verification + idempotency.
- Browser e2e: role-based route visibility and mutation authorization.
- Security tests: cross-origin mutation rejection and privilege escalation attempts.
- Product registry: product CRUD, plan resolution, entitlement derivation.
- Branded billing: correct branding renders for each product in checkout and plan management pages.
