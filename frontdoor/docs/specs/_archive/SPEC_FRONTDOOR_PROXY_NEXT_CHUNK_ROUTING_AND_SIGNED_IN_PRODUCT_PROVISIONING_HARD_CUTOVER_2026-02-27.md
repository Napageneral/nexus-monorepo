# Spec: Frontdoor Proxy Next Chunk Routing + Signed-In Product Provisioning (Hard Cutover)

Date: 2026-02-27  
Status: approved-for-implementation  
Owner: Nexus Frontdoor + Product Shell

## 1) Customer Experience Goal

A signed-in customer on `https://frontdoor.nexushub.sh/` can:

1. Open GlowBot without client crashes on any tab, including Integrations.
2. From the same account/session, provision or select Spike workspace access without operator intervention.
3. Launch the selected app (`GlowBot` or `Spike`) through frontdoor and land in the correct app UI.

## 2) Observed Failures

1. GlowBot Integrations route crash:
- `GET /app/glowbot/integrations` returns HTML `200`, but browser then requests chunks at `/_next/static/...`.
- Frontdoor currently does not route root `/_next/*` to runtime app proxies, returns `404`, and Next throws client exception.

2. Spike unavailable for existing signed-in account:
- Existing legacy workspace (`product_id = NULL`) is selected by default.
- No signed-in self-serve action exists to request product-scoped provisioning.
- Product request flows can reuse fallback tenant in cases where deterministic product workspace resolution is required.

## 3) Hard-Cutover Decisions

1. Frontdoor is canonical and must handle proxied Next asset requests correctly.
2. Product-specific launch intent must have a deterministic signed-in path from the frontdoor UI.
3. For product-intent provisioning, fallback tenant reuse is not allowed as implicit default when no product mapping exists.
4. No silent fallback behavior; explicit status and error states only.

## 4) Scope

### In scope

1. Frontdoor server routing for authenticated `/_next/*` requests based on app referer context.
2. Autoprovision policy change for product-intent requests so unresolved product mapping provisions/selects product-specific workspace deterministically.
3. Frontdoor shell signed-in UX for explicit product provisioning (GlowBot/Spike).
4. Test coverage for routing, provisioning policy, and shell flow.
5. Hosted deployment + verification logs.

### Out of scope

1. Multi-app attach-on-existing-tenant app package installer.
2. Cross-product billing/package migration policies.

## 5) Detailed Requirements

### R1: Next chunk routing through frontdoor

1. When request path is `/_next/*` and user is authenticated:
- frontdoor must infer app context from same-origin referer path `/app/<appId>/...`.
- frontdoor must proxy request to runtime as `/app/<appId>/_next/*`.

2. If referer app context is missing/invalid:
- return explicit non-success response (`404` or equivalent), no hidden fallback.

### R2: Product-intent provisioning policy

1. If request has `productId` and user has existing product mapping:
- reuse mapped tenant.

2. If request has `productId` and no product mapping:
- do not implicitly reuse fallback tenant unless it is explicitly product-mapped.
- provision/select product-specific tenant.

3. Preserve user/entity continuity across new product tenant creation.

### R3: Signed-in frontdoor product action

1. Signed-in workspace panel must expose explicit “Provision product workspace” action.
2. Action must support at least `glowbot` and `spike`.
3. Action must route via canonical OIDC start with `product` + `flavor` + return URL preserving context.
4. UI must surface in-progress/failure status clearly.

### R4: Workspace selection preference by requested product

1. If `?product=<id>` is present and user has multiple workspaces:
- shell prefers matching `product_id` workspace for selection and launch.

## 6) Validation Ladder

1. V1 unit/integration:
- frontdoor server tests for `/_next/*` referer-based proxy rewrite.
- autoprovision tests for product mapping behavior (no implicit fallback-tenant reuse).
- frontdoor-web tests for signed-in product provision action + query propagation.

2. V2 local E2E:
- authenticated launch of `/app/glowbot/integrations` no client chunk 404s.
- signed-in product provision action returns to frontdoor and selects/provisions product workspace.

3. V3 hosted smoke:
- verify no `/_next/*` 404 for GlowBot Integrations path in frontdoor logs.
- verify user can create/select Spike workspace from same account and launch Spike app.

## 7) Exit Criteria

1. Integrations tab no longer crashes on production frontdoor.
2. Same signed-in account can self-serve Spike workspace provisioning/selection.
3. End-to-end: sign in -> choose/provision product workspace -> launch app route works for GlowBot and Spike.
