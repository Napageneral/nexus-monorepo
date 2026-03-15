# Frontdoor Object Taxonomy

**Status:** CANONICAL
**Last Updated:** 2026-03-10

---

## Purpose

This document locks the vocabulary frontdoor uses in its active specs.

Frontdoor is the hosted control plane. Its docs should use customer-facing
hosted terms consistently and should not casually drift into runtime-internal
language.

Shared hosted vocabulary comes from:

- `../../nex/docs/specs/platform/platform-model.md`
- `../../nex/docs/specs/platform/runtime-access-and-routing.md`

This document applies that vocabulary to frontdoor-specific concepts.

---

## Non-Negotiable Rules

1. `server` is the primary customer-facing machine unit in frontdoor docs.
2. `tenant_id` is the routable hosted identifier frontdoor uses for routing.
3. `runtime` is the Nex process frontdoor provisions and targets.
4. `workspace` is not a normal frontdoor term.
5. `app` and `adapter` are the canonical installable package kinds frontdoor manages for product packages.
6. `product control plane` is different from `platform control plane`.

If a frontdoor doc uses `workspace`, it must explain why the runtime-internal
boundary matters. Otherwise the doc should use `server`.

---

## Frontdoor Terms

| Term | Meaning |
|---|---|
| `account` | Billing and ownership container for servers, subscriptions, and members |
| `user` | Human identity authenticated through frontdoor |
| `server` | Provisioned customer machine managed by frontdoor |
| `tenant_id` | Hosted routing key that resolves to one runtime target |
| `runtime` | Nex process running on a server |
| `app` | Installable product package launched through frontdoor; may be customer-facing, operator-only, headless, or dependency-only |
| `adapter` | Shared installable integration package |
| `package` | Generic registry unit; can be an app, adapter, or runtime |
| `release` | Immutable published package version plus one or more blobs/variants |
| `platform-managed connection profile` | Frontdoor-owned provider credential/config profile for platform-owned managed flows |
| `product control plane` | Product-specific shared backend and secret owner for app-managed provider flows |
| `admin app` | Operator-facing UI for a product control plane |
| `routing record` | Frontdoor route entry keyed by `tenant_id` that resolves runtime target coordinates |

## `server_id` vs `tenant_id`

Frontdoor must use both identifiers deliberately.

| Identifier | Meaning |
|---|---|
| `server_id` | The customer-facing provisioned machine frontdoor bills, provisions, installs to, upgrades, and lets the user select |
| `tenant_id` | The routed runtime identity frontdoor uses for proxy routing, runtime token claims, DNS, callbacks, and direct runtime transport |

Operational rule:

1. frontdoor UI and billing flows are `server_id` first
2. frontdoor routing and runtime token flows are `tenant_id` first
3. one selected server resolves to one routed tenant target in the hosted model

---

## Frontdoor-Specific Language Rules

### Provisioning and billing

Use:

- `account`
- `server`
- `app entitlement`
- `package release`

Avoid:

- `workspace`

### Routing and DNS

Use:

- `tenant_id`
- `routing record`
- `platform shell profile`
- `tenant origin profile`

### Connections and integrations

Use:

- `platform-managed connection profile`
- `adapter connection`
- `server` scope
- `app` scope
- `product control plane`

Do not rename connection scopes to `workspace` scope in frontdoor docs.

---

## Enforcement Rule

If a frontdoor doc introduces a new noun that can be confused with an existing
hosted term, it must define that noun before using it.
