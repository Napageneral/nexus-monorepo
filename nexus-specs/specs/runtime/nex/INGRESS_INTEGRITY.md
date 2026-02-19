# Ingress Integrity (Field Stamping Contract)

**Status:** PARTIALLY IMPLEMENTED (core enforcement + integrity telemetry)  
**Last Updated:** 2026-02-18  
**Related:**
- `SINGLE_TENANT_MULTI_USER.md` (single-tenant, multi-user + anti-spoofing)
- `INGRESS_CREDENTIALS.md` (API keys + webchat sessions)
- `../UNIFIED_DELIVERY_TAXONOMY.md` (canonical delivery ids)
- `../RUNTIME_ROUTING.md` (routing + identity resolution)
- `../adapters/INBOUND_INTERFACE.md` (adapter ingress contract)
- `../adapters/INTERNAL_ADAPTERS.md` (http-ingress + clock as internal adapters)
- `../iam/ACCESS_CONTROL_SYSTEM.md` (IAM model)
- `../iam/POLICIES.md` (policy matching)

---

## Summary

Ingress integrity defines which parts of a `NexusEvent` are treated as:

- **authoritative facts** (daemon-stamped / credential-derived), vs
- **untrusted claims** (adapter/client supplied and subject to validation/override).

This is the security contract that prevents identity spoofing (impersonating another principal) and policy spoofing (making IAM evaluate the wrong rules) in hosted mode.

Key invariants:

1. **No spoofing:** clients cannot choose their principal. Principal is derived from verified auth (tokens/API keys) or trusted upstream platform identities.
2. **Adapter claims are bounded:** adapters can only emit events for the delivery platforms/accounts they are configured and authenticated to represent.
3. **All agent work is unified:** anything that can run an agent enters the NEX pipeline as a `NexusEvent` and is authorized/audited by IAM.

### Implementation Snapshot (2026-02-18)

Implemented in `nex`:

- Adapter ingress stamping and anti-spoof validation (`platform`, `account_id`, reserved platform guard).
- Reserved `_daemon` namespace stripping + daemon receive timestamp stamping.
- IAM time conditions based on daemon receive time (`request.created_at`).
- Token-backed ingress identity hints (`user`, `x-nexus-session-key`) ignored for customer ingress + recorded as integrity violations.
- Integrity violation telemetry emitted to:
  - audit ledger table `ingress_integrity_log`
  - bus event `ingress.integrity.violation`

Remaining:

- Extend the same integrity telemetry path to any future ingress bridges as they are adapterized.

---

## Goals

- Make it impossible for customers/untrusted clients to impersonate operators or other customers.
- Make it impossible for external adapters to impersonate privileged internal ingress (system/control-plane).
- Support a single hosted UI/API surface where permissions are enforced by IAM, without relying on "system ingress" shortcuts.
- Keep adapters useful: adapters can supply real platform facts (Discord user id, channel id, etc), while the daemon enforces integrity boundaries.

---

## Non-Goals

- "Full sandboxing" (filesystem/network isolation). This spec only covers integrity of *identity/delivery* and *auth-derived principals*.
- Treating an adapter process as fully untrusted. Adapters are part of the runtime's trusted computing base, but we still enforce integrity rules to prevent bugs/misconfigurations from becoming privilege escalation.

---

## Threat Model (What We Are Preventing)

1. **End-user identity spoofing**
   - Example: HTTP OpenAI-compat caller sets `user="owner"` and tricks the daemon into mapping them to an operator principal.
2. **Channel/platform spoofing**
   - Example: an ingress path claims `platform="control-plane"` to get privileged policies or bypass identity resolution.
3. **Conversation spoofing**
   - Example: attacker chooses a `container_id` or `thread_id` that maps to a privileged session label or policy condition.
4. **Timestamp spoofing**
   - Example: attacker supplies a timestamp to bypass time-based IAM conditions.
5. **Capabilities spoofing**
   - Example: attacker claims a channel supports streaming/editing/embeds and manipulates delivery formatting or code paths.

---

## Canonical Event Shape (NEX)

In NEX, ingress is normalized into:

- `event`: `{ event_id, timestamp, content, content_type, attachments?, metadata? }`
- `delivery`: `{ platform, account_id, sender_id, sender_name?, space_id?, container_id, container_kind, thread_id?, reply_to_id?, metadata?, capabilities, available_channels }`

Even though many of these fields exist in the event payload, they are *not* equally trustworthy. Integrity is defined by the stamping contract below.

---

## Field Classes (What Is Trusted vs Claimed)

### A) Daemon-stamped (authoritative)

These fields MUST be set/overridden by the daemon based on the authenticated ingress source (adapter instance or internal adapter module):

- `delivery.platform`
- `delivery.account_id`
- `delivery.capabilities`
- `delivery.available_channels`

Rationale:

- Prevent an adapter/client from claiming a privileged platform or another account.
- Ensure capabilities are sourced from runtime adapter registry, not caller input.

### B) Credential-derived (authoritative)

For token-backed ingress (webchat sessions, API keys, operator login sessions), end-user identity MUST be derived from verified credentials:

- `principal.entity_id` is derived from the credential (token/API key/session).
- `delivery.sender_id` is daemon-derived from that same identity (see "Token-backed ingress" below).

Caller-provided identity hints (example: OpenAI `user`) are treated as metadata only.

### C) Adapter-provided (trusted facts, but validated)

For platform adapters (Discord/Telegram/iMessage/etc), the adapter supplies platform facts that the daemon cannot directly observe:

- `delivery.sender_id` (platform user identifier)
- `delivery.sender_name` (display only)
- `delivery.space_id` / `delivery.container_id` / `delivery.thread_id` / names
- `delivery.container_kind`, `delivery.reply_to_id`
- `event.event_id` (platform message id) and `event.timestamp` (platform time) when available
- `event.content`, `event.attachments`, `event.metadata` (non-authoritative)

The daemon MUST validate these fields for shape and consistency (and may reject impossible combinations).

### D) Client-provided (untrusted)

For public HTTP ingress, the daemon MUST treat all identity-related and routing-related fields in the HTTP payload as untrusted:

- any `sender_id` or `platform` fields in the body are ignored
- any "routing override" / persona/session hints are ignored unless the credential is an operator-class credential AND IAM permits it

---

## Reserved Platforms (No External Claims)

Reserve platform names (or prefixes) that only the daemon/internal adapters may emit:

- `system/*` (clock, boot, sentinel)
- `control/*` (control-plane internal chat UX if modeled as an internal adapter)
- `runtime/*` (internal maintenance)

Rules:

1. External adapters MUST NOT be able to emit reserved platforms.
2. Public HTTP ingress MUST NOT be able to emit reserved platforms.
3. If an ingress payload claims a reserved platform, the daemon rejects and audits it.

---

## Multi-Account Adapters

One adapter binary/process may legitimately represent multiple accounts (small fixed set) based on loaded credentials.

Rules:

- Each adapter instance has an allowed set: `allowed_accounts = {account_id...}` for its `platform`.
- For each inbound event, the adapter may indicate which `account_id` the event is for.
- The daemon MUST verify `account_id in allowed_accounts` and MUST reject events outside the configured set.
- The daemon MAY override `delivery.account_id` if the adapter-provided value disagrees with the authenticated adapter instance context.

This preserves usability while preventing cross-account spoofing.

---

## Timestamps (Platform Time vs Daemon Time)

Rules:

- The daemon MUST stamp a receive timestamp for every inbound event (example: `event.metadata._daemon.received_at_ms`).
- For public HTTP ingress:
  - the daemon generates `event.event_id`
  - the daemon stamps `event.timestamp` (authoritative)
  - any client-provided timestamp may be recorded as metadata but is not authoritative
- For platform adapters:
  - accept platform `event.timestamp` and record it
  - IAM time-based decisions should use daemon receive time unless explicitly configured otherwise

Rationale: keep platform time for debugging while avoiding timestamp spoofing in policy evaluation.

---

## Metadata Namespaces

Define reserved metadata namespaces:

- `event.metadata._daemon.*` and `delivery.metadata._daemon.*` are daemon-only.
- Adapters/clients attempting to write under `_daemon` are rejected or have those keys stripped and audited.

This allows the runtime to attach authoritative integrity evidence without ambiguity.

---

## Token-Backed Ingress Identity (Webchat, API Keys, Login Sessions)

For any ingress where the request is authenticated via a token/API key/session:

1. The daemon verifies the credential.
2. The daemon resolves `entity_id` deterministically from that credential.
3. The daemon sets principal and delivery identity from that:
   - `principal.entity_id = <resolved entity_id>`
   - `delivery.sender_id = <daemon-derived identifier>`

Recommended canonical forms:

- Webchat visitor sessions: `platform="webchat"`, `sender_id="entity:<entity_id>"` (or `"webchat:<session_id>"` if you want sender_id to represent a session contact)
- Ingress API keys: `platform="api_key"`, `sender_id="key:<key_id>"` (mapped to entity), or directly `entity:<entity_id>`
- Operator login sessions: `platform="login"`, `sender_id="user:<user_id>"` or `oidc:<sub>` (future)

Critical rule:

- Caller-provided fields like OpenAI `user` MUST NOT influence principal resolution.

---

## Enforcement Points (Implementation Guidance)

Integrity should be enforced at the earliest boundary possible, with "defense in depth":

1. **Adapter Manager ingress (external adapters)**
   - authenticate adapter instance
   - stamp/verify `platform` and `account_id`
   - source `capabilities` / `available_channels` from runtime registry
2. **Internal adapters (http-ingress, clock)**
   - internal code stamps all authoritative fields
3. **Public HTTP ingress**
   - derive identity from credential
   - ignore caller-provided identity/routing claims
4. **Pipeline receive stage (last line of defense)**
   - validate reserved platform rules
   - validate metadata namespace rules
   - ensure system principals only exist for explicit internal platforms

---

## Audit Requirements

The daemon MUST write audit entries (or bus events) for integrity violations:

- reserved platform claim attempt
- platform/account mismatch vs adapter instance
- client attempts to set `_daemon` metadata
- client attempts to set identity fields when authenticated via token-backed ingress

This is as important as enforcement: it makes active probing visible.

---

## Test Plan (Minimum)

1. HTTP OpenAI/OpenResponses:
   - supplying `user` does not change principal
   - supplying spoofed `sender_id` in payload is ignored/rejected
2. Reserved platform claims:
   - external adapter cannot emit `system/*` or `control/*`
3. Adapter multi-account boundary:
   - adapter configured for account A cannot emit account B
4. Timestamp:
   - daemon receive timestamp always recorded
   - HTTP timestamps are daemon-stamped for IAM decisions
