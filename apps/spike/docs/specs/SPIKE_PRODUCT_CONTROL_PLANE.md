# Spike Product Control Plane

**Status:** CANONICAL
**Last Updated:** 2026-03-06

---

## Purpose

This document defines the target-state product control plane for Spike.

It exists to keep three responsibilities separate:

1. the customer-facing Spike app installed on customer servers
2. the shared `github` adapter and hosted runtime connection system
3. the Spike-owned shared backend that holds Spike-managed provider secrets and
   operator tooling

---

## Customer Experience

The intended Spike experience is:

1. the user launches Spike through frontdoor
2. Spike shows app-owned connection choices such as `Connect with Spike GitHub App`
3. the shared `github` adapter executes the provider flow
4. the Spike product control plane owns the Spike GitHub App registration and
   secret-backed GitHub operations
5. Spike binds product behavior to shared runtime `connection_id` values
6. Spike operators use a separate Spike admin app for product-wide diagnostics
   and support

The customer should experience one Spike product, not a frontdoor secret vault
and not a wrapper GitHub adapter.

---

## Design Rules

1. The installed Spike app owns customer-facing UX and Spike domain behavior.
2. The shared `github` adapter owns reusable GitHub protocol behavior.
3. The Spike product control plane owns Spike-managed GitHub App credentials
   and secret-backed GitHub operations.
4. The Spike admin app owns operator UX, not long-lived secret storage.
5. The Spike product control plane does not replace frontdoor's platform
   responsibilities.
6. The Spike product control plane does not become a wrapper adapter package.

---

## Canonical Package Roles

| Package | Role |
|---|---|
| `spike` | Customer-facing hosted app package installed on customer servers |
| `github` | Shared adapter package implementing generic GitHub behavior |
| `spike-hub` | Spike product control-plane app |
| `spike-admin` | Operator-facing Spike admin app |

---

## Responsibility Split

| Layer | Owns |
|---|---|
| Frontdoor | accounts, servers, routing, registry, install/upgrade orchestration, managed-connection gateway |
| Hosted runtime | connection execution, callbacks/webhooks, connection persistence, app lifecycle |
| Shared `github` adapter | reusable GitHub auth methods, callback handling, webhook handling, connection testing, account discovery |
| Spike product control plane | Spike-managed GitHub App registration, private keys, installation-token minting, product-wide operator/support APIs |
| Spike admin app | operator UX on top of the Spike product control plane |
| Spike app | customer UX, Spike bindings to `connection_id`, repo/index workflows |

---

## Managed GitHub App Contract

The canonical managed Spike GitHub flow is:

1. Spike manifest declares `spike-managed-github-app`
2. user chooses `Connect with Spike GitHub App`
3. runtime starts the shared `github` adapter auth method
4. runtime calls frontdoor's private managed-connection gateway
5. frontdoor routes the request to the Spike product control plane
6. Spike product control plane provides GitHub App install metadata and other
   secret-backed operations
7. shared `github` adapter completes the connection and stores a shared
   `connection_id`
8. Spike records app-specific bindings keyed by `connection_id`

The GitHub App private key does not live in frontdoor and does not live as a
long-lived tenant-runtime secret.

---

## Operator Surface

The Spike admin app should expose:

- GitHub connection health summaries
- managed-profile health and configuration
- repo sync and hydration diagnostics
- ask throughput and cost visibility
- support-safe product diagnostics

The admin app talks to the Spike product control-plane app. It is not the
canonical home of the provider secret itself.
