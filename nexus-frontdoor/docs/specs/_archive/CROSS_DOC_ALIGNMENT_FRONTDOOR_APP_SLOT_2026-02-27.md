# Cross-Doc Alignment Addendum (Frontdoor + App Slots)

Date: 2026-02-27  
Status: active alignment directive  
Primary canonical spec: `FRONTDOOR_CANONICAL_APP_SLOT_ARCHITECTURE_HARD_CUTOVER_2026-02-27.md`

---

## 1) Purpose

Align docs across `glowbot`, `spike`, `nexus-frontdoor`, `nexus-specs`, and `nex` to one architecture and remove contradictory language.

---

## 2) Canonical Decisions (Must Match Everywhere)

1. **Entrypoint**: `frontdoor.nexushub.sh` is the canonical onboarding + launch domain.
2. **Shell domain**: `shell.nexushub.sh` is redirect-only compatibility, not a separate product system.
3. **Hosting model**: app slots support `static` and `proxy` as first-class modes.
4. **Backend contract**: app business methods are runtime-native namespaces (`glowbot.*`, `spike.*`), not app-local API bridges.
5. **Tenant allocation**: multi-app per tenant is first-class; product mapping does not force one-tenant-per-product.
6. **Launch behavior**: no silent fallback from requested app to control UI; control bootstrap is control-app-only.
7. **Transport canon for product UX**: browser -> frontdoor -> runtime is canonical for product onboarding/launch flows.

---

## 3) Supersession Rules

When older docs conflict with section 2:

1. Keep historical context where useful.
2. Add explicit "superseded for product app flows" language.
3. Update acceptance criteria and workplans to enforce canonical behavior.
4. Do not keep dual-canon wording.

---

## 4) Required Alignment Checks

1. No doc should claim `shell.nexushub.sh` is canonical onboarding surface.
2. No doc should claim `one workspace = one product` as a universal rule.
3. No doc should state frontdoor proxy paths are non-canonical for product app launch.
4. Product OIDC docs must require flavor/product forwarding tests.
5. Docs that mention app launch must include explicit no-fallback-to-control rule.

