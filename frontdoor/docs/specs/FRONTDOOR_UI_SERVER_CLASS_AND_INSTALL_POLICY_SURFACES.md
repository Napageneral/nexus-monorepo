# Frontdoor UI Server Class And Install Policy Surfaces

**Status:** CANONICAL
**Last Updated:** 2026-03-18
**Related:** `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_AWS_HOSTING_AND_SERVER_CLASS_MODEL.md`, `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_HOSTED_PACKAGE_INSTALL_POLICY_AND_DEPLOYMENT_CLASSES.md`, `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/CRITICAL_CUSTOMER_FLOWS_2026-03-02.md`

## 1) Purpose

This document defines the customer-facing Frontdoor UI contract for:

1. `standard` vs `compliant` server creation
2. server-class visibility in lists and navigation
3. install-time policy messaging for compliant-only packages
4. OIDC-first hosted auth entry

This is a hard-cut UI spec.

It does not preserve older password-first hosted UX or older silent
`standard`-only server creation assumptions.

## 2) Customer Experience

The customer-facing contract is:

1. one frontdoor
2. one login flow
3. one server list
4. one app catalog
5. clear server-class choice when the customer is intentionally creating a
   server

The customer should understand:

1. `standard` is the lower-cost default class
2. `compliant` is the regulated class required for HIPAA-sensitive products
3. some apps and adapters cannot be installed on `standard`
4. Frontdoor will automatically create the correct class in zero-server flows
   when policy requires it

The customer should not see:

1. AWS vs Hetzner
2. Tailscale
3. `deployment_class`
4. product-control-plane topology

## 3) Non-Negotiable UI Rules

1. hosted UI must expose `standard` and `compliant` as the only customer-facing
   server classes
2. hosted UI must not expose provider brands
3. hosted UI must not present password login or signup as the primary customer
   path
4. server-class policy failures must be explained in plain language before any
   runtime install begins
5. compliant-required flows must never silently land on `standard`

## 4) Active UI Ownership

The active hosted Frontdoor UI is split across two real surfaces:

1. dashboard shell at `/`:
   - `/Users/tyler/nexus/home/projects/nexus/frontdoor/public/index.html`
2. app-frame shell inside launched apps:
   - `/Users/tyler/nexus/home/projects/nexus/frontdoor/src/server.ts`

This means UI alignment work must update both:

1. dashboard auth/server/catalog/create flows in `public/index.html`
2. app-frame server identity and switcher surfaces in `src/server.ts`

## 5) Hosted Auth Surface

The public hosted auth surface is OIDC-first.

Required behavior:

1. the unauthenticated entry state presents Google OIDC as the primary sign-in
   action
2. hosted UI must not render first-class password login or password signup
   affordances on the public production surface
3. if password auth is disabled in config, no dead or misleading password form
   should remain visible in hosted UI copy

## 6) Server Creation UI

### 5.1 Manual create-server flow

When the customer intentionally creates a server, Frontdoor must present a
clear class choice:

1. `standard`
2. `compliant`

Required copy direction:

1. `standard` explains that it is the lower-cost default for general workloads
2. `compliant` explains that it is required for HIPAA-sensitive apps and
   adapters such as GlowBot clinic workloads and EMR-backed installs
3. `compliant` copy explicitly signals higher-cost / regulated hosting without
   inventing provider internals

Required behavior:

1. manual create defaults to `standard`
2. the customer can intentionally select `compliant`
3. the submitted create payload sends the selected `server_class`

### 5.2 Zero-server install flow

If the customer launches an app install flow without an existing target server:

1. if the package policy requires `standard`, Frontdoor may create a
   `standard` server
2. if the package policy requires `compliant`, Frontdoor must create a
   `compliant` server
3. the UI must explain the selected class before final confirmation

## 7) Server List And Server Identity

Customer-visible server surfaces must display server class.

Required surfaces:

1. dashboard server list
2. server detail cards
3. app shell server switcher

Required presentation:

1. each server shows a visible class badge:
   - `Standard`
   - `Compliant`
2. `compliant` carries stronger visual emphasis than `standard`
3. the badge must be understandable without hover state

Optional but recommended:

1. `compliant` may include short supporting copy such as `Regulated`
2. `standard` may include short supporting copy such as `Lower cost`

## 8) Install Policy Messaging

Frontdoor UI must reflect the install-policy contract already enforced in the
backend.

### 7.1 Compliant-only packages

When an app or adapter requires `compliant`:

1. catalog/detail UI should label it as requiring `Compliant`
2. install actions on a selected `standard` server must be blocked in UI before
   runtime install begins
3. the blocking copy must explain that the package requires a compliant server
4. the UI should offer the path to create or choose a compliant server

### 7.2 Deployment-class restrictions

Packages with `deployment_class = product_control_plane` must not appear as
ordinary customer-install targets on clinic/customer-server flows.

Implication:

1. customer UI should not advertise `glowbot-admin` or `glowbot-hub` as normal
   clinic installs

## 9) Cost And Policy Visibility

The hosted UI must make cost and policy legible without overexplaining
infrastructure.

Required messaging:

1. `standard` is lower cost
2. `compliant` is higher-cost regulated hosting
3. compliant-only packages require `compliant`

Forbidden messaging:

1. direct cloud-vendor selection
2. exposing AWS/Hetzner as the primary purchase choice
3. exposing Tailscale or transport topology in customer copy

## 10) Current Mismatch To Fix

The current hosted UI diverges from canon in these ways:

1. dashboard auth gate still renders password login/signup forms even though
   the public hosted surface is OIDC-first in production
2. dashboard create-server modal still submits only plan/display name and never
   asks for `server_class`
3. dashboard store/install surfaces do not label compliant-required packages or
   explain compliant-only blocking before the backend rejects install
4. server list and server detail surfaces do not visibly expose `server_class`
5. app shell server navigation shows status but not server class
6. manual and implicit create-server flows still assume `standard` unless the
   backend overrides them
7. compliant-required install policy is enforced in backend routes but not yet
   consistently surfaced in customer-facing UI

## 11) Validation Target

The UI is aligned when:

1. the customer can clearly create `standard` or `compliant` intentionally
2. zero-server GlowBot flow clearly creates `compliant`
3. `glowbot` and EMR adapters are visibly marked as compliant-required
4. install on a `standard` server is blocked with a clear explanation
5. server list and shell show `Standard` vs `Compliant` badges
6. the public hosted auth entry is OIDC-first and does not mislead users with
   stale password-first UI
