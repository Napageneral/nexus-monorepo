# Unified Delivery Taxonomy: Migration Workplan

**Status:** WORKPLAN  
**Last Updated:** 2026-02-18  
**Canonical spec:** `UNIFIED_DELIVERY_TAXONOMY.md`

---

## Goal

Migrate NEX, the adapter protocol contract, the adapter SDKs, and all adapters to use the canonical delivery taxonomy:

`platform` -> `account_id` -> optional `space_id` -> `container_kind + container_id` -> optional `thread_id` -> optional `reply_to_id`

This is a long-term, correctness-first migration. The target state is a clean internal schema with no legacy naming.

---

## Work Buckets (Tracking)

### Bucket 1: Specs Alignment (source of truth)

- [x] Update all runtime specs that describe delivery context to use canonical field names.
  - `adapters/*` (inbound/outbound/targeting/directory)
  - `iam/*` (policy conditions and examples)
  - `RUNTIME_ROUTING.md` (contacts + identity resolution inputs)
  - `broker/SESSION_LIFECYCLE.md` (session key construction)
- [x] Decide if internal ingress surfaces (`control-plane`, `webchat`) use `container_kind="direct"` or are modeled as `container_kind="dm"` with explicit routing overrides (must be consistent and documented).
- [x] Add a canonical mapping table for each platform: Discord/Slack/iMessage/Telegram/Gmail + internal ingress (control-plane/webchat).

### Bucket 2: Adapter Protocol Contract (schema + fixtures)

- [x] Introduce a protocol v2 contract (recommended) with the new field names.
  - Update `adapters/contract/adapter-protocol.schema.json`
  - Update fixtures in `adapters/contract/fixtures/`
- [x] Define the transition behavior for NEX:
  - Accept v1 inputs temporarily (legacy field names) and normalize into v2 internally.
  - Emit v2 outputs for adapter invocations and internal tooling.
- [x] Update `adapters/contract/ADAPTER_PROTOCOL_SCHEMA.md` to explain v1 vs v2 expectations and timeline.

### Bucket 3: NEX Internal Delivery Schema + Pipeline

- [x] Rename the internal delivery context shape (and all callsites) to canonical field names.
  - `platform` (was platform-specific “channel” in older code/specs)
  - `container_kind/container_id` (was peer_* naming)
  - `space_id` (was platform-specific “guild/workspace” in metadata)
- [x] Update identity resolution to use:
  - `(platform, sender_id)` plus `space_id` where needed for uniqueness (Slack).
- [x] Update IAM evaluation inputs to include the new normalized fields and stop overloading “guild” semantics.
- [x] Update session key construction to use `container_kind/container_id/thread_id` with the canonical routing logic.
- [x] Update audit logging to store the new normalized identifiers.
- [x] Update control-plane/webchat dispatch code to construct canonical delivery contexts and bind sender identity from auth.

### Bucket 4: Adapter SDKs (Go + TypeScript)

- [x] Rename SDK types to match canonical field names.
- [x] Update conformance tests to validate against protocol v2 fixtures.
- [x] Provide small helper functions for common platform mappings (Slack thread ids, Discord threads-as-channels, iMessage reply bubbles, etc).

### Bucket 5: Adapters (Discord/Telegram/etc)

- [ ] Update adapters to emit v2 `NexusEvent` lines with canonical delivery fields.
- [ ] Update outbound to accept canonical target fields and preserve `thread_id` and `reply_to_id`.
- [ ] Ensure adapters emit optional display fields (`space_name/container_name/thread_name`) when available.
- [ ] Ensure adapters never emit internal-only `container_kind="direct"`.

### Bucket 6: Directory + Storage

- [x] Add a physical schema for:
  - contacts (delivery endpoint -> entity_id)
  - spaces/containers/threads (directory)
  - participants/membership (join table)
  - name history (space/container/thread rename tracking)
- [x] Define ingestion/upsert rules at pipeline time (passive population from inbound events).
- [x] Define optional “active sync” hooks that adapters can provide to list spaces/containers/members, if/when needed.

### Bucket 7: Tests + Migration Harness

- [x] Update unit/integration tests that construct delivery contexts.
- [x] Add adapter-contract tests for both v1 (legacy accepted) and v2 (canonical).
- [ ] Add an E2E smoke test for:
  - control-plane/webchat (token-derived sender identity)
  - Discord/Slack/Telegram sample events (canonical routing fields)
  - outbound replies preserving container/thread/reply targeting

---

## Exit Criteria (Done Definition)

- Internal NEX code no longer references legacy naming in primary types and stage logic.
- Adapter protocol contract v2 is the only supported contract for newly-built adapters.
- Both Go + TS adapter SDKs pass conformance tests against the same v2 contract.
- Core adapters (Discord/Telegram/Slack/iMessage/Gmail) emit canonical delivery fields and preserve `thread_id` + `reply_to_id` for outbound.
- IAM policies can match `space_id`, `container_kind`, `container_id`, `thread_id` without relying on platform-specific metadata hacks.
