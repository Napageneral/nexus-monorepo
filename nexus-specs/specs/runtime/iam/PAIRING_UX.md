# Pairing UX (IAM-Backed)

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-17  
**Related:** `ACCESS_CONTROL_SYSTEM.md`, `POLICIES.md`, `GRANTS.md`, `../adapters/INBOUND_INTERFACE.md`

---

## Overview

“Pairing” is not a separate security system. It is a UX layer on top of:

1. **Identity resolution** (mapping platform sender ids to principals/entities)
2. **IAM policies** (allow/deny/ask) and **grants** (approvals)

The purpose is to make “unknown sender on a channel” a safe, user-friendly flow:

- Ask the owner for approval
- Record a durable identity mapping
- Create a durable allowlist policy or a time-bounded grant

---

## Defaults (Recommended)

These defaults are meant to be safe and unsurprising:

- **Owner principal:** always allow.
- **Unknown principal in DMs:** `ask` (create permission request).
- **Unknown principal in groups/channels:** `deny` (no pairing prompts by default).
- **Known principal in DMs:** allow according to policy.
- **Known principal in groups/channels:** deny unless explicitly allowed by policy.

Rationale: group/channel exposure is broader; DMs are the natural onboarding surface.

---

## End-to-End Flow

### 1. Inbound Event Arrives

An adapter emits a `NexusEvent` that includes:

- `channel`, `account_id`
- `sender_id`
- `peer_kind`, `peer_id`, optional `thread_id`

### 2. Resolve Principal (Identity)

Identity resolution attempts to map:

`(channel, sender_id)` → `principal_id`

If no mapping exists, treat sender as `principal = unknown`.

### 3. Evaluate IAM Policies

IAM evaluates policies for the resolved principal + context:

- channel
- peer_kind
- peer_id (conversation container)
- account_id

If the decision is:

- `allow`: proceed through pipeline
- `deny`: stop (optionally send a canned denial)
- `ask`: create a permission request and stop

### 4. Create Permission Request (Ask)

On `ask`, create an `acl_permission_requests` record (see `GRANTS.md`) that includes:

- requester identity (channel, sender_id, display name if available)
- request context (the triggering message content)
- proposed policy scope (dm-only vs broader)

### 5. Notify Owner (Control Plane)

NEX notifies the owner (via control plane) with choices:

- Allow once (grant, expires soon)
- Allow always (policy + identity mapping)
- Block (deny policy / explicit blocklist)

### 6. Approval Outcome

On approval, NEX performs **two** writes:

1. **Identity mapping write**
   - record `(channel, sender_id) -> principal_id`
2. **Access rule write**
   - either a durable IAM policy allowlisting the principal on the channel/peer scope
   - or a time-bounded grant (for “allow once / allow today”)

On denial, NEX may:

- write an explicit deny policy for that `(channel, sender_id)` mapping (optional)
- or simply close the request as denied

### 7. Subsequent Messages

Once the identity mapping exists, subsequent events resolve to the principal and flow through normal IAM evaluation without re-prompting.

---

## What Pairing Adds (Even With IAM)

If you remove pairing UX entirely, the system still works, but you lose:

- A simple way to create principals + mappings from real inbound events
- A simple way to create correctly-scoped allow policies (“allow this DM user on Discord”)
- A clear audit trail of first-contact approvals

Pairing is therefore recommended even in an IAM-first system, but it remains a UX layer, not a security boundary.

---

## Open Questions

1. Should “unknown in group” ever be `ask`? (Default: no.)
2. Should “allow always” create a principal automatically if none exists, or require user naming/tagging? (Likely auto-create with later edit.)
3. What is the canonical store for `(channel, sender_id) -> principal` mappings? (Identity ledger vs unified entity store integration.)

