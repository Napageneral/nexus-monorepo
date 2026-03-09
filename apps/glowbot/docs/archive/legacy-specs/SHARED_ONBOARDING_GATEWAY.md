# Shared Onboarding Gateway (GlowBot + Spike) — Frontdoor Canonical

Date: 2026-02-27  
Status: aligned to canonical app-slot architecture  
Canonical references:
- `FRONTDOOR_CANONICAL_APP_SLOT_ARCHITECTURE_HARD_CUTOVER_2026-02-27.md`
- `CROSS_DOC_ALIGNMENT_FRONTDOOR_APP_SLOT_2026-02-27.md`

---

## 1) Customer Experience (Target State)

1. User lands on product page (`glowbot-demo.vercel.app`, `spike.fyi`, etc.).
2. User clicks primary CTA.
3. User is sent to `https://frontdoor.nexushub.sh/?flavor=<flavor>&entry=<entry-id>`.
4. User authenticates with Google OAuth via frontdoor.
5. Frontdoor resolves/provisions the correct workspace and launches the requested app slot.

Key decision:

1. `frontdoor.nexushub.sh` is canonical.
2. `shell.nexushub.sh` is compatibility redirect-only.

---

## 2) Canonical Route Contract

Canonical onboarding URL:

`https://frontdoor.nexushub.sh/?flavor=<flavor>&entry=<entry-id>`

Examples:

1. GlowBot: `?flavor=glowbot&entry=glowbot-demo`
2. Spike: `?flavor=spike&entry=spike-fyi`

Rules:

1. `flavor` drives product copy and preferred app targeting.
2. `entry` is optional source attribution.
3. OIDC start must forward product/flavor intent into frontdoor OIDC state.
4. OAuth `return_to` must preserve current `pathname + search`.

---

## 3) Compatibility Contract (`shell.nexushub.sh`)

1. `shell.nexushub.sh` must redirect to frontdoor preserving path + query.
2. Redirect must not mutate `flavor`/`entry` values.
3. No product logic should be owned only by the shell domain.

---

## 4) Acceptance Criteria

1. Product CTA lands on frontdoor with preserved flavor/entry query.
2. Legacy shell links are redirected to frontdoor with same query params.
3. OIDC start path includes forwarded product/flavor context.
4. Post-auth launch selects app from runtime catalog for resolved workspace.
5. If requested app is missing, user sees explicit launch error (no silent control fallback).

---

## 5) Implementation Checklist

1. Point product CTAs to `frontdoor.nexushub.sh`.
2. Keep shell as redirect-only compatibility domain.
3. Add regression tests for OIDC flavor/product forwarding.
4. Add launch identity checks that verify `/app/<app-id>` serves the requested app artifact.
5. Ensure frontdoor launch path enforces control-bootstrap-only for control app routes.

