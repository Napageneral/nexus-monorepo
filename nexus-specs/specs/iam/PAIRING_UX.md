# Pairing UX (IAM-Backed)

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-17  
**Related:** `ACCESS_CONTROL_SYSTEM.md`, `POLICIES.md`, `GRANTS.md`, `../adapters/INBOUND_INTERFACE.md`

---

## Overview

“Pairing” is not a separate security system. It is a UX layer on top of:

1. **Identity resolution** (mapping platform sender ids to senders/entities)
2. **IAM policies** (allow/deny/ask) and **grants** (approvals)

The purpose is to make “unknown sender on a platform” a safe, user-friendly flow:

- Ask the owner for approval
- Record a durable identity mapping
- Create a durable allowlist policy or a time-bounded grant

---

## Defaults (Recommended)

These defaults are meant to be safe and unsurprising:

- **Owner sender:** always allow.
- **Unknown sender in DMs:** `ask` (create permission request).
- **Unknown sender in groups/channels:** `deny` (no pairing prompts by default).
- **Known sender in DMs:** allow according to policy.
- **Known sender in groups/channels:** deny unless explicitly allowed by policy.

Rationale: group/channel exposure is broader; DMs are the natural onboarding surface.

---

## End-to-End Flow

### 1. Inbound Event Arrives

An adapter emits a `NexusEvent` that includes:

- `platform`, `account_id`
- `sender_id`
- `container_kind`, `container_id`, optional `thread_id`

### 2. Resolve Sender (Identity)

Identity resolution attempts to map:

`(platform, space_id, sender_id)` → `entity_id` (via contacts table)

If no mapping exists, treat sender as `sender.type = unknown`.

### 3. Evaluate IAM Policies

IAM evaluates policies for the resolved sender + context:

- platform
- container_kind
- container_id (conversation container)
- account_id

If the decision is:

- `allow`: proceed through pipeline
- `deny`: stop (optionally send a canned denial)
- `ask`: create a permission request and stop

### 4. Create Permission Request (Ask)

On `ask`, create an `acl_permission_requests` record (see `GRANTS.md`) that includes:

- requester identity (platform, sender_id, display name if available)
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
   - record `(platform, space_id, sender_id) -> entity_id` in the contacts table
2. **Access rule write**
   - either a durable IAM policy allowlisting the sender on the platform/container scope
   - or a time-bounded grant (for “allow once / allow today”)

On denial, NEX may:

- write an explicit deny policy for that `(platform, sender_id)` mapping (optional)
- or simply close the request as denied

### 7. Subsequent Messages

Once the identity mapping exists, subsequent events resolve to the sender and flow through normal IAM evaluation without re-prompting.

---

## What Pairing Adds (Even With IAM)

If you remove pairing UX entirely, the system still works, but you lose:

- A simple way to create entity + contact mappings from real inbound events
- A simple way to create correctly-scoped allow policies (“allow this DM user on this platform”)
- A clear audit trail of first-contact approvals

Pairing is therefore recommended even in an IAM-first system, but it remains a UX layer, not a security boundary.

---

## Open Questions

1. Should “unknown in group” ever be `ask`? (Default: no.)
2. Should “allow always” create an entity automatically if none exists, or require user naming/tagging? (Likely auto-create with later edit.)
3. What is the canonical store for `(platform, space_id, sender_id) -> entity_id` mappings? (Resolved: contacts table in identity.db.)

