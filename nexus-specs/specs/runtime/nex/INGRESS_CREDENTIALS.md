# Ingress Credentials (API Keys + Webchat Sessions)

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-18  
**Related:**
- `SINGLE_TENANT_MULTI_USER.md` (trust zones + multi-user story)
- `../adapters/INTERNAL_ADAPTERS.md` (http-ingress + webchat as internal adapters)
- `../UNIFIED_DELIVERY_TAXONOMY.md` (canonical delivery ids)
- `../DELIVERY_DIRECTORY_SCHEMA.md` (identity.db directory schema)
- `../RUNTIME_ROUTING.md` (contacts + identity resolution)
- `../iam/ACCESS_CONTROL_SYSTEM.md` (IAM model)
- `../iam/POLICIES.md` (policy matching)

---

## Summary

Ingress credentials are the AuthN mechanism for **untrusted/external** request surfaces.

This spec defines:

- **Customer API keys** (operator-provisioned) mapping deterministically to an `entity_id`
- **Webchat sessions** (anonymous by default, login optional later) that mint **one entity per anonymous visitor** and persist it via a long-lived session credential
- How webchat supports **multiple tabs** without identity confusion
- Token UX options (cookies vs bearer) with a design that remains valid in future hosted deployments

Key invariant:

- **No spoofing:** callers/adapters cannot choose their principal. Principal is derived from verified credentials or trusted upstream platform identities.

---

## Goals

- **Deterministic principals for token-backed ingress.**
  - For API-key and webchat requests, `entity_id` comes from the credential, not from delivery fields.
- **Persistent anonymous customers (optional “cookie memory”).**
  - Anonymous visitors can be recognized across visits and accumulate memory over time without logging in.
- **Multi-tab safe.**
  - Multiple browser tabs can operate concurrently without creating identity collisions or forcing separate identities.
- **Hosted-ready.**
  - Webchat auth should work for:
    - loopback/local UI
    - hosted UI served from the same origin as ingress
    - hosted UI on a different origin (cookie limitations) via bearer fallback
- **Unified IAM boundary.**
  - Any request that can run an agent becomes a `NexusEvent` and is authorized/audited by IAM.

---

## Non-Goals

- OIDC / hosted operator login (control-plane AuthN). This spec only covers **ingress** (customers/integrations).
- True multi-tenant runtime (many unrelated orgs in one daemon).
- CAPTCHA / bot defense design (rate limits can exist, but are not specified here).

---

## Concepts

### Visitor (anonymous identity)

A **visitor** is an anonymous customer identity represented by a dedicated `entity_id`.

This is the “persistent anonymous customer” unit:

- stable across visits (when cookies are available)
- accumulates memory and history
- can later be linked/merged into a logged-in entity (future)

### Conversation vs Tab

- A **conversation** is the logical “DM” between Nexus and the visitor.
- A **tab** is a UI instance (browser tab/window) that attaches to a conversation.

Multiple tabs can attach to the same conversation. Tabs do not imply different identities.

### Ingress credential

An ingress credential is a token used on ingress surfaces. It maps deterministically to:

- `audience = ingress`
- `entity_id = <principal>`

The token may also carry non-canonical metadata (`label`, `scopes`) but IAM is the source of truth.

---

## Credential Types

### A) Customer API keys

**Provisioning model (v1):** operator-provisioned only.

- An operator creates (or selects) an entity for a customer/integration.
- The operator issues one or more ingress tokens for that entity.
- Each token is a distinct credential that can be rotated/revoked independently.

Common uses:

- OpenAI/OpenResponses compatibility API calls
- webhook integrations
- server-to-server “customer” clients

### B) Webchat visitor token (anonymous by default)

On first visit:

1. Daemon creates a new `entity_id` (type `person` or `organization` depending on UI intent; default `person`).
2. Daemon issues an ingress token bound to that `entity_id`.
3. UI stores the token (cookie preferred).

On subsequent visits:

- UI presents the token
- daemon resolves the same `entity_id`
- visitor continuity is preserved (optional “cookie memory”)

This supports the “powerful” future behavior:

- long-lived anonymous identity that can accumulate information and personalization even without login

### C) Webchat logged-in token (future)

If the visitor later logs in (email magic link, password, OAuth, etc):

- the session binds to the authenticated user entity
- optionally merge/link the anonymous visitor entity into the authenticated entity (explicit UX)

This is intentionally future work; this spec only requires that anonymous visitor identity is first-class and mergeable later.

---

## Token UX / Transport Options

We support two transports for the same underlying ingress credential model.

### Option 1 (recommended for browser webchat): HttpOnly cookies

Cookie properties:

- `HttpOnly` (not readable by JS)
- `Secure` (HTTPS only)
- `SameSite=Lax` by default
- If cross-site embedding is required: `SameSite=None; Secure`

Pros:

- best XSS resistance (token not readable by JS)
- works naturally for HTTP + WebSocket upgrades

Cons:

- cross-site embedding can break due to third-party cookie blocking
- requires CSRF/origin discipline (mitigated by SameSite + Origin checks)

### Option 2 (recommended for programmatic ingress): Bearer token

Usage:

- `Authorization: Bearer <token>`

Pros:

- works everywhere (curl, servers, non-browser clients)
- not dependent on cookie policy

Cons (browser):

- token usually becomes JS-accessible (XSS exfil risk)
- WebSocket auth requires a non-header mechanism (first message auth, subprotocol, or query param)

### Required: Hybrid support

Nexus MUST support:

- Cookie-based webchat sessions (first-party)
- Bearer tokens for programmatic ingress (API keys)
- A bearer fallback for webchat in hosted/cross-origin scenarios if cookies are unreliable

Hosted recommendation:

- Prefer hosting UI and ingress under the **same origin** via reverse proxy to keep cookie semantics simple.

---

## Session Lifetime (TTL) and Rotation

We distinguish between two lifetimes:

1. **Visitor continuity lifetime** (how long we recognize an anonymous visitor)
2. **Credential attack window** (how long a stolen credential remains useful)

### Webchat visitor token TTL (recommended defaults)

- Default: **30 days sliding**
- Optional absolute maximum: **365 days**
- Rotation: re-issue a fresh token when nearing expiry (example: refresh if < 7 days remaining)

Rationale:

- Sliding TTL preserves “cookie memory” for returning visitors.
- Absolute max bounds risk for abandoned tokens.

### API keys TTL

Default:

- no expiry (operator-managed)

Best practice:

- support optional expiration for high-risk keys
- allow easy rotation + revocation with audit visibility

---

## Identity + Delivery Stamping (Unified Taxonomy)

Token-backed ingress does not require contacts for identity resolution, because the credential maps to an `entity_id`.

However, we still produce delivery identifiers for:

- UI/session routing
- audit traceability
- directory modeling

### Webchat delivery shape

Webchat should behave like a DM between Nexus and the visitor:

- `platform = "webchat"`
- `container_kind = "dm"`
- `sender_id = <visitor_id>` (daemon-generated stable pseudonym)
- `entity_id` comes from the visitor token

Multi-tab:

- multiple tabs share the same visitor token and thus the same `entity_id`
- tabs SHOULD send a `client_tab_id` purely for telemetry/debug (non-authoritative)

### API key delivery shape

For API-key ingress (OpenAI compat, webhooks):

- `platform` is the bridge surface (`openai`, `openresponses`, `hooks`, etc)
- `sender_id` MUST be daemon-derived (example: `key:<token_id>` or a stable pseudonym)
- `entity_id` comes from the token

### Optional: contacts upsert

Token-backed ingress MAY upsert the contacts directory as a convenience:

- `(platform, space_id, sender_id) -> entity_id`

This is not required for AuthN, but is useful for directory queries and consistent identity tooling.

---

## Anti-Spoofing Requirements

1. **Principal is credential-derived.**
   - Request bodies may not influence principal selection.
2. **Delivery ids are daemon-stamped.**
   - Any caller-provided delivery identifiers are treated as untrusted inputs and validated/overridden.
3. **Reserved/internal delivery identifiers are forbidden for untrusted ingress.**
   - Example: container kinds reserved for internal use (per taxonomy) must be rejected if claimed by external adapters.
4. **Audit must record credential + principal.**
   - Every ingress event logs the credential id/token id (or prefix), derived entity id, and delivery identifiers.

---

## Implementation Plan (Phased)

### Phase 1 (immediate)

- Add a webchat session issuance flow in the ingress adapter:
  - mint `entity_id` per new visitor
  - issue an `audience=ingress` token
  - store token as HttpOnly cookie by default
- Add bearer fallback (same token model) for hosted cross-origin cases.
- Ensure all webchat messages are normalized to `NexusEvent` and enter `nex.processEvent(...)`.

### Phase 2 (security hardening, still compatible)

- Split webchat into two-token model if needed:
  - long-lived visitor token (refresh-like)
  - short-lived access token for requests
- Add token rotation strategies and “forget/reset visitor” UX.
- Add rate limits per token and per IP (optional).

### Phase 3 (future identity upgrade)

- Add optional customer login and explicit merge/link flow from anonymous visitor entity to authenticated entity.

