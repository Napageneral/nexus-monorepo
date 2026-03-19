# Workplan Frontdoor UI Server Class And Install Policy Alignment

**Status:** ACTIVE

## Purpose

This workplan aligns the hosted Frontdoor UI with the already-shipped backend
model for:

1. `standard` vs `compliant`
2. compliant-only install policy
3. OIDC-first hosted auth

Target-state spec:

- [FRONTDOOR_UI_SERVER_CLASS_AND_INSTALL_POLICY_SURFACES.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_UI_SERVER_CLASS_AND_INSTALL_POLICY_SURFACES.md)

## Customer Experience First

The target customer experience is:

1. create a `standard` or `compliant` server intentionally
2. understand that `standard` is lower cost and `compliant` is required for
   HIPAA-sensitive packages
3. see server-class badges in the hosted UI
4. understand why an install is blocked on `standard` before runtime work
   starts
5. sign in through the real OIDC-first hosted flow

The customer should not need to understand:

1. AWS vs Hetzner
2. Tailscale
3. deployment classes
4. internal product-control-plane topology

## Current Reality

What is already true in backend/runtime behavior:

1. `server_class` is persisted and exposed in API responses
2. hosted install policy already enforces `required_server_class`
3. hosted install policy already enforces `deployment_class`
4. zero-server compliant-required flows can already resolve to `compliant`
5. password auth is disabled on the live AWS frontdoor public surface

What is still missing in hosted UI:

1. manual create-server UI does not clearly present `standard` vs `compliant`
2. app shell server navigation does not show server class
3. customer install flows do not fully surface compliant-only restrictions
4. hosted auth UI still needs a hard-cut OIDC-first presentation pass

## Phase 1: Canon And Index Hygiene

Goal:

1. archive completed infra workplans
2. keep active workplans limited to unfinished work
3. make the new UI workplan the active customer-facing hosted slice

Exit criteria:

1. completed AWS cutover/bootstrap/signup workplans are archived
2. active index points to this UI workplan

## Phase 2: Auth Entry Hard Cut

Goal:

1. make the hosted auth entry match the live production auth contract

Changes:

1. remove or hide stale password-first affordances in hosted UI
2. promote Google OIDC as the primary hosted auth action
3. keep backend password-disabled behavior unchanged

Exit criteria:

1. public hosted auth UI is OIDC-first
2. no misleading password-first copy remains on the live hosted surface

## Phase 3: Server Creation And Server-Class Visibility

Goal:

1. make server class visible and intentional in hosted UI

Changes:

1. add `Standard` and `Compliant` badges to server list/detail surfaces
2. add a manual create-server selection surface for:
   - `standard`
   - `compliant`
3. explain lower-cost vs regulated-hosting intent in customer language

Exit criteria:

1. customer can intentionally create either class
2. server-class badges appear in hosted server UI and shell navigation

## Phase 4: Install Guardrail Alignment

Goal:

1. surface backend install policy in customer UI before runtime install begins

Changes:

1. label compliant-required apps and adapters in catalog/install UI
2. block install on `standard` with clear compliant-required copy
3. route zero-server compliant-required install flows toward `compliant`
   creation

Exit criteria:

1. GlowBot and EMR adapters are visibly compliant-required
2. blocked installs explain the reason and next step

## Phase 5: Validation

Validate:

1. local TypeScript and targeted UI/server tests
2. live AWS frontdoor manual flow:
   - sign in with Google
   - create `standard`
   - create `compliant`
   - verify badges
   - verify compliant-required blocking and messaging

Exit criteria:

1. UI matches canonical hosted server-class and install-policy behavior
