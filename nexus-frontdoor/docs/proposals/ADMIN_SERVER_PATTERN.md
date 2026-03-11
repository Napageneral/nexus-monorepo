# Admin Server Pattern (Seed Spec)

Date: 2026-02-27
Status: seed — needs detailed design
Owners: Nexus Platform

---

## 1) Problem

Every product in the Nexus ecosystem needs operational visibility: user tracking, usage metrics, cost monitoring, error dashboards, and product-specific analytics. Without a reusable pattern, each product builds its own admin tooling from scratch.

---

## 2) The Pattern

Every product gets a dedicated **admin server** — a nex runtime instance running a product-specific admin/monitoring app.

### 2.1 Three admin servers

1. **Frontdoor admin server**: Platform-wide operator view. All servers, all accounts, spending, usage, errors across every product and every customer server.
2. **GlowBot admin server**: GlowBot-specific monitoring. Adapter connections, pipeline runs, clinic health, GlowBot-specific costs and errors. This is what the current "Central GlowBot Hub" concept evolves into.
3. **Spike admin server**: Spike-specific monitoring. Hydrations, ask queries, GitHub connector health, Spike-specific costs and errors.

### 2.2 Reusable core

Every admin server needs the same baseline capabilities:

1. **User tracking** — active users, signups, retention.
2. **Usage metrics** — per-product resource consumption.
3. **Cost tracking** — infrastructure costs, API costs, billing revenue.
4. **Error monitoring** — error rates, failure patterns, alerting.
5. **Operational dashboards** — health overview, degraded services, provisioning status.

Product-specific admin servers extend this core with domain-specific metrics:

- GlowBot: adapter health, pipeline run stats, peer benchmark coverage.
- Spike: hydration job stats, ask query latency/cost, repo index coverage.

### 2.3 Implementation approach

The core admin capabilities should be a shared nex app (or app template) that each product admin server installs and extends. This means:

1. A `core-admin` app with standard dashboards and APIs.
2. Product admin apps (`glowbot-admin`, `spike-admin`) that extend core-admin with product-specific views and methods.
3. Each product admin server is a nex runtime that runs the product admin app.

---

## 3) Relationship to Product Mono-Repos

Each product mono-repo contains three components:

1. **Product Owned Signup UX** — thin Vercel frontend (branding + marketing + link to frontdoor).
2. **The App** — the actual product app code (UI + runtime methods) that installs on customer servers.
3. **The Admin Server App** — the product-specific admin app that runs on the admin server.

---

## 4) Open Questions (TODO)

1. Should the core-admin app be a separate nex app that product admin apps compose with, or a library/template that gets built into each product admin app?
2. What's the data flow? Does each customer server push telemetry to the admin server, or does the admin server pull from frontdoor's central data store?
3. How does the frontdoor admin server relate to the frontdoor service itself? Is it the same process or a separate nex runtime?
4. What access control model governs admin server access? Operator-only? Product-team scoped?
5. What's the minimum viable admin server for GlowBot (the first product that needs it)?

---

## 5) Next Steps

1. Design the core-admin app interface and standard dashboard layout.
2. Define the telemetry/metrics collection contract between customer servers and admin servers.
3. Implement GlowBot admin server as the first instance of the pattern.
4. Extract reusable core and apply to Spike admin server.
5. Build frontdoor admin server for platform-wide operator visibility.
