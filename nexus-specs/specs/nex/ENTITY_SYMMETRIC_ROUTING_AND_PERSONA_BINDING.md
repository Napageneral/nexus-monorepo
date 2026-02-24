# Entity-Symmetric Routing And Persona Binding

**Status:** Proposed (Canonical for this workstream)  
**Last Updated:** 2026-02-24

---

## 1. Purpose

Define the hard-cutover architecture for:

1. Sender/receiver identity resolution symmetry.
2. Session identity keys that follow entity relationships (not runtime fallback defaults).
3. Persona binding as a separate layer from session identity.
4. Mandatory continuity transfer when canonicalization changes active session ownership.

This spec is the source of truth for this workstream and supersedes conflicting details in older routing docs.

---

## 2. Core Definitions

1. `sender_entity_id`: canonical entity resolved from inbound sender identity.
2. `receiver_entity_id`: canonical entity bound to the adapter account that received the event.
3. `session_key`: conversation identity key for history routing.
4. `agent_id`: runtime executor identifier.
5. `persona_ref`: identity/presentation profile reference used for system prompt identity.

`agent_id` and `persona_ref` may be identical initially, but are distinct concepts.

---

## 3. Architectural Decisions

## D1. Sender And Receiver Resolution Are Symmetric

`resolveIdentity` and `resolveReceiver` must use the same identity substrate (`identity.db`) and canonicalization chain (`merged_into` union-find walk).

Both must produce canonical entity ids.

No heuristic-only receiver resolution paths are allowed in the default path.

## D2. Receiver Is Resolved From Account Ownership

For external adapter ingress, receiver identity is resolved from `(platform, account_id)` using explicit account-to-entity bindings.

`delivery.receiver_id` is optional and used as a verification/corroboration signal, not as the primary source of truth.

If account binding is missing or conflicts with verified receiver hints, ingress is denied (fail closed).

## D3. Remove All Atlas Fallbacks

No implicit fallback to `atlas` (or any default persona/agent) is allowed in routing or context assembly.

If receiver cannot be resolved to an authorized entity binding, request must be denied or kept non-agent, without privilege escalation.

## D4. Session Keys Are Entity-Based

Canonical keys:

1. DM: `dm:{sender_entity_id}:{receiver_entity_id}`
2. Group/channel container: `group:{platform}:{container_id}:{receiver_entity_id}`

Thread suffix keys are removed from canonical identity keys.

## D5. Group Threads Share Group Session

Messages from group threads route to the same group session key as the parent container.

`thread_id` remains part of delivery metadata and directory observation, but does not fork a separate session history by default.

## D6. Persona Binding Is Separate From Session Identity

Session key does not include persona.

Persona resolution happens after session key resolution through explicit bindings:

1. Default binding: `(receiver_entity_id) -> persona_ref, agent_id`
2. Optional sender override: `(receiver_entity_id, sender_entity_id) -> persona_ref, agent_id`

Persona edits in-place do not change bindings or session keys.
Pointer swaps (binding to a different persona_ref) do not change session keys.

## D7. Canonicalization Requires Mandatory Continuity Transfer

When identity canonicalization or key-shape cutover retires one or more sessions in favor of a primary session:

1. Select primary session (latest activity time, tie-break by turn count).
2. Generate transfer summary for each retired session.
3. Append transfer summary into primary session as a structured system memory event.
4. Create alias retired->primary.
5. Archive retired sessions.

Summary transfer is mandatory. If model summarization fails, runtime must use deterministic fallback summary generation so transfer still occurs.

## D8. Hard Cutover (No Compatibility Mode)

No long-lived dual-write or runtime fallback behavior.

Migration is one-way: canonical keys, explicit receiver account bindings, explicit persona bindings.

---

## 4. Required Data Model Additions

## 4.1 identity.db: account receiver bindings

`account_receiver_bindings`

1. `platform TEXT NOT NULL`
2. `account_id TEXT NOT NULL`
3. `receiver_entity_id TEXT NOT NULL`
4. `source TEXT NOT NULL` (`bootstrap|manual|import|control-plane`)
5. `created_at INTEGER NOT NULL`
6. `updated_at INTEGER NOT NULL`
7. PK `(platform, account_id)`

Purpose: deterministic receiver identity from verified ingress account.

## 4.2 identity.db: persona bindings

`persona_bindings`

1. `id TEXT PRIMARY KEY`
2. `receiver_entity_id TEXT NOT NULL`
3. `sender_entity_id TEXT NULL` (NULL = default receiver binding)
4. `agent_id TEXT NOT NULL`
5. `persona_ref TEXT NOT NULL`
6. `priority INTEGER NOT NULL DEFAULT 0`
7. `active INTEGER NOT NULL DEFAULT 1`
8. `created_at INTEGER NOT NULL`
9. `updated_at INTEGER NOT NULL`

`persona_binding_events` (audit/history of binding changes) should record old/new binding values and actor.

## 4.3 agents.db: continuity transfer log

`session_continuity_transfers`

1. `id TEXT PRIMARY KEY`
2. `source_session_key TEXT NOT NULL`
3. `target_session_key TEXT NOT NULL`
4. `reason TEXT NOT NULL` (`entity_merge|key_cutover|persona_rebind`)
5. `summary_turn_id TEXT NOT NULL`
6. `created_at INTEGER NOT NULL`

Purpose: auditable proof that mandatory transfer happened.

---

## 5. Runtime Flow (Target)

1. `receiveEvent`: ingress integrity stamping (`platform/account_id` trusted from adapter context).
2. `resolveIdentity`: sender entity resolution + canonicalization.
3. `resolveReceiver`: receiver entity from account binding + optional receiver hint verification + canonicalization.
4. `resolveAccess`: policy with sender+receiver entities.
5. `resolveSessionKey`: build DM/group key from sender+receiver entity.
6. `resolvePersonaBinding`: choose `(agent_id, persona_ref)` from receiver default/override binding.
7. `assembleContext`: use resolved persona_ref and session.
8. `runAgent`: only for `receiver.type=agent`.

---

## 6. Mom Scenarios

## 6.1 Mom moved to specialized persona later

Initial:

1. sender entity = `entity-mom`
2. receiver entity = `entity-eve-main` (bound from account)
3. session key = `dm:entity-mom:entity-eve-main`
4. binding = default receiver persona.

Later specialization:

1. Add sender override binding for `(entity-eve-main, entity-mom)`.
2. Session key stays `dm:entity-mom:entity-eve-main`.
3. History continuity preserved in same session.

## 6.2 Mom text + email discovered as same person later

Before merge:

1. `entity-mom-text` -> session A
2. `entity-mom-email` -> session B

After merge canonicalization:

1. canonical sender becomes one entity id.
2. pick primary session (latest activity; tie by turn count).
3. mandatory transfer summaries from retired sessions into primary.
4. alias old keys -> primary key.
5. retired sessions archived.

---

## 7. Security And Integrity

1. Receiver cannot be inferred via implicit default persona fallback.
2. Account->receiver binding is required for external ingress.
3. Receiver/account mismatch is integrity violation and denied.
4. Unresolved receiver must not escalate privileges or trigger default-agent execution.

---

## 8. Acceptance Criteria

1. No runtime references that default routing/context to `atlas`.
2. No canonical session key contains `:agent:` or `:thread:`.
3. Receiver resolution succeeds via `(platform, account_id)` binding for all enabled adapter accounts.
4. Sender merge produces mandatory continuity transfer records and summary injection.
5. Persona pointer swap keeps same session key and preserves history continuity.

---

## 9. Related Specs To Align

1. `NEXUS_REQUEST.md`
2. `RUNTIME_ROUTING.md`
3. `iam/IDENTITY_RESOLUTION.md`
4. `iam/ACCESS_CONTROL_SYSTEM.md`
5. `ENTITY_SYMMETRIC_ROUTING_AND_PERSONA_BINDING_WORKPLAN.md`
