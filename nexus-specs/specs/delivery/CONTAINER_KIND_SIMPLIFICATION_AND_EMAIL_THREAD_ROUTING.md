# Container Kind Simplification and Email Thread Routing

**Status:** DESIGN SPEC (aligned)  
**Last Updated:** 2026-02-26  
**Owner:** Runtime/Delivery  
**Related:**
- `UNIFIED_DELIVERY_TAXONOMY.md`
- `INBOUND_INTERFACE.md`
- `OUTBOUND_INTERFACE.md`
- `sdk/OUTBOUND_TARGETING.md`
- `../nex/RUNTIME_ROUTING.md`
- `../agents/SESSION_LIFECYCLE.md`
- `workplans/UNIFIED_DELIVERY_TAXONOMY_WORKPLAN.md`

---

## 1. Customer Experience Problem Statement

Users need two guarantees from delivery and session routing:

1. **Conversation type clarity:** Is this a private conversation or a shared conversation?
2. **Context boundary safety:** Will unrelated conversations leak into each other?

Current taxonomy uses `container_kind = direct | group | channel`, but core runtime behavior mostly treats `group` and `channel` the same. This creates naming complexity without proportional behavioral value.

Email adds additional complexity:

- Email threads can change participants over time.
- A single participant can have many unrelated 1:1 threads.
- Thread forks and participant changes make identity-only DM routing unsafe for context boundaries.

The design must optimize for predictable boundaries first, then naming simplicity.

---

## 2. Final Refined Understanding (This Discussion)

### 2.1 High-level model

The strongest practical distinction is:

- `direct`: private conversation
- `group`: shared conversation container

`channel` is often a label describing a subtype of shared container, but not a distinct core routing behavior in current runtime paths.

### 2.2 Core decision direction

For canonical delivery taxonomy, move toward a **two-kind core model**:

- `container_kind = direct | group`

If subtype detail is still needed (for UI/policy/adapter behavior), represent it outside `container_kind` as metadata, not as a third core kind.

Example metadata key (illustrative):

- `delivery.metadata.container_semantics = "workspace_channel" | "group_chat" | "broadcast" | ...`

This preserves expressiveness without forcing core routing, ACL, and schema branching on `channel` as a first-class kind.

---

## 3. Email-specific Decision

### 3.1 Classification target

Email should not be treated as uniformly `group` or uniformly `direct`.

Instead, classify each inbound email event from that message's headers:

- 2 participants -> `direct`
- >2 participants -> `group`

Normalization rule:

- Use strict per-message envelope headers only (`from` + resolved `to`/`cc`/`bcc` recipients available to the adapter).
- Do not infer participants from historical thread state for classification.

### 3.3 Session boundary rule for email (critical)

For email, session boundaries must remain **thread/container scoped** regardless of `direct` vs `group` label.

Why:

- If email `direct` used pure entity-pair DM keys, unrelated 1:1 threads from the same sender/receiver pair would collapse into one session.
- That causes cross-thread context leakage and reply confusion.

Therefore:

- Email routing keying must preserve thread container boundary (`container_id = thread_id`).
- Email session keys use a dedicated email namespace: `email:{platform}:{container_id}:{receiver_entity_id}`.
- `container_kind` informs policy/experience semantics, but does not collapse thread boundaries.

---

## 4. Decision Rationale

### 4.1 Why simplify to `direct | group`

- Reduces conceptual overhead for operators and adapter authors.
- Aligns with dominant runtime behavior (today `group` and `channel` commonly share code paths).
- Improves policy readability around private vs shared contexts.

### 4.2 Why strict per-message email headers

- Classification is deterministic from the inbound payload itself.
- No hidden "thread memory" is required for adapter normalization.
- Session stability is preserved by `email:` thread-scoped keys, so classification changes do not rekey sessions.

### 4.3 Why keep thread-scoped email sessions even when kind is `direct`

- Preserves user expectation that different email subjects/threads remain separate contexts.
- Prevents accidental carryover between unrelated conversations.
- Better matches existing thread/fork mental model in `agents.db` and event-ledger usage.

---

## 5. Normative Rules (Target State)

### 5.1 Canonical enum

`DeliveryContext.container_kind` target enum:

- `direct`
- `group`

`channel` is removed from core canonical enum.

### 5.2 Shared-container subtype (optional)

If adapters/platforms need richer shared-container semantics, they may emit:

- `delivery.metadata.container_semantics` (string; adapter-defined vocabulary)

This field is optional and non-canonical for routing key construction. A global enum is deferred.

### 5.3 Email mapping

For platform `gmail` (or future `email` platform abstraction):

- `container_id`: provider thread id (conversation container)
- `thread_id`: omitted (thread is already the container)
- `container_kind`: derived per message from envelope participant cardinality
- `reply_to_id`: message id/reference when available
- Classification uses strict per-message headers only; no cross-message participant inference.

### 5.4 Session routing

- Non-email `direct`: entity-pair DM routing remains valid.
- Shared containers (`group`): container-based routing.
- Email (all kinds): `email:{platform}:{container_id}:{receiver_entity_id}` to preserve per-thread isolation.

### 5.5 Outbound terminology cutover

- Any prefixed outbound target token under Nexus control MUST use `direct:` or `group:`.
- `channel:` is removed from canonical outbound examples, fixtures, and helper defaults.
- Adapter-specific raw target formats remain allowed when documented by that adapter.

---

## 6. IAM and Policy Implications

### 6.1 Immediate simplification

Policy conditions no longer need to distinguish `group` vs `channel` at core taxonomy level.

### 6.2 If subtype-level policy is needed

Policies may match on explicit metadata/subtype fields (for example `container_semantics`) rather than `container_kind=channel`.

### 6.3 Security posture

`container_name` and other display strings remain untrusted. Routing and IAM matching must stay ID-based (`platform`, `account_id`, `space_id`, `container_id`, and optional thread/reply identifiers as applicable).

---

## 7. Hard Cutover Policy

Per project policy, this change is a hard cutover:

1. No long-lived dual enum support in canonical runtime schema.
2. No compatibility mode that keeps `channel` as a first-class runtime kind.
3. Specs and code should converge directly to the target model.

If data migration is required, migration is explicit and one-way.

---

## 8. Validation Criteria

This spec is considered implemented only when all are true:

1. Core delivery schema accepts only `direct|group`.
2. Runtime routing logic has no semantic branch requiring `channel` kind.
3. Email 1:1 threads do not collapse across different thread ids.
4. Email classification uses strict per-message headers only; no history-based participant inference.
5. IAM tests remain green for private vs shared policy behavior.
6. Adapter contract fixtures and docs reflect final enum, email keying, and outbound `channel:` removal.

---

## 9. Out of Scope (This Spec)

1. Provider-specific UX formatting policies.
2. Full provider-specific participant inference heuristics beyond strict headers.
3. Legacy compatibility shims beyond one-way hard cutover.

---

## 10. Alignment Decisions (Resolved)

1. Session key namespace for email is `email:`.
2. Canonical `container_kind` is `direct|group`; `channel` is fully collapsed into `group`, including outbound examples under Nexus control.
3. Email classification uses strict per-message headers only.
4. Hard cutover applies; no backwards compatibility mode.

---

## 11. Summary

The refined direction is:

1. Simplify canonical container kind to `direct|group`.
2. Keep richer shared-container distinctions as optional metadata, not core kind.
3. Model email as thread/container first, with `direct/group` semantics derived strictly per message from headers.
4. Use dedicated `email:{platform}:{container_id}:{receiver_entity_id}` session keys to preserve thread boundaries.
5. Remove `channel` as a canonical outbound taxonomy term under Nexus-managed target examples.

This provides a simpler mental model while protecting correctness in the most failure-prone surface (email threads).
