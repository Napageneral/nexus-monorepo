# Entity-Symmetric Routing And Persona Binding Workplan

**Status:** Plan (Hard Cutover)
**Last Updated:** 2026-02-24
**Canonical Design:** `../ENTITY_SYMMETRIC_ROUTING_AND_PERSONA_BINDING.md`

---

## 1. Customer Experience First

This cutover is successful when users observe these product-level behaviors:

1. Every inbound message routes deterministically from two resolved entities: sender + receiver.
2. Group thread replies stay in the same group session history as the parent channel/container.
3. Switching persona behavior for a sender does not silently fork or lose session history.
4. Sender canonicalization (e.g., mom text + mom email merge) never drops context; continuity transfer is mandatory.
5. No implicit default assistant identity appears when receiver resolution is missing or ambiguous.

---

## 2. Current Runtime Gaps (Research)

Observed in runtime code (`/Users/tyler/nexus/home/projects/nexus/nex/src`):

1. Atlas/default fallbacks still exist:
   - `resolveAccess.ts` defaults routing persona to `"atlas"`.
   - `assembleContext.ts` and `runAgent.ts` fall back to `"atlas"`.
   - `session.ts` still has atlas compatibility conversion (`toAtlasScopedSessionKey`).
2. Receiver resolution is not yet account-binding authoritative:
   - `resolveReceiver.ts` prioritizes explicit agent hints and contact heuristics.
   - No dedicated `(platform, account_id) -> receiver_entity_id` table exists yet.
3. Session keys are still agent/thread-scoped in code:
   - DM: `dm:{sender}:agent:{agent}`
   - Group thread split: `...:thread:{thread_id}`
4. Persona selection is still coupled to routing defaults instead of explicit receiver/persona binding lookup.

---

## 3. Target Decisions (Locked)

1. Sender and receiver are symmetric identity outcomes in the same identity substrate (`identity.db`).
2. Receiver resolves from account binding first; receiver hints are verification signals only.
3. Canonical session labels:
   - DM: `dm:{sender_entity_id}:{receiver_entity_id}`
   - Group: `group:{platform}:{container_id}:{receiver_entity_id}`
4. No canonical thread session label by default.
5. Persona binding is downstream of session identity.
6. Atlas fallback is removed completely from routing/context defaults.
7. Continuity transfer is mandatory on canonicalization/cutover.

---

## 4. Persona Semantics (Mom Scenarios)

### 4.1 Edit persona content (same binding)

- Binding remains the same.
- Session label remains the same.
- No transfer event required.

### 4.2 Swap persona pointer for the same receiver/sender route

- Update persona binding (`persona_ref`, optional `agent_id`) for the existing route.
- Session label remains the same by default.
- If product wants a fresh start, that must be an explicit fork/new-session action, not implicit behavior.

### 4.3 Merge mom-text and mom-email sender entities

- Canonical sender changes.
- Recompute DM labels with canonical sender + same receiver entity.
- Select primary session per receiver scope.
- Mandatory summary transfer from retired sessions into primary.
- Alias retired labels to primary and archive retired sessions.

---

## 5. Mandatory Continuity Transfer Mechanics

When any session key is retired (`entity_merge`, `key_cutover`, `receiver_rebind`, optional `persona_rebind` policy):

1. Build candidate retired sessions and target primary.
2. For each retired session, generate summary payload:
   - time range
   - turn count
   - key topics/entities
   - unresolved threads/actions
3. Inject summary payload as a structured system memory event into the primary session.
4. Record transfer row in `session_continuity_transfers`.
5. Create alias retired -> primary.
6. Archive retired session.

If LLM summarization fails, deterministic fallback summary must run (no skip path).

---

## 6. Hard Cutover Implementation Phases

### Phase A: Schema + Contracts

1. `identity.db` add:
   - `account_receiver_bindings`
   - `persona_bindings`
   - `persona_binding_events`
2. `agents.db` add:
   - `session_continuity_transfers`
3. Update `NexusRequest` contracts to use:
   - `receiver.entity_id`, `receiver.agent_id`, `receiver.persona_ref`
   - `access.routing.agent_id`, `access.routing.persona_ref`, `access.routing.session_label`

### Phase B: Receiver Resolution Cutover

1. Rewrite `resolveReceiver.ts`:
   - primary lookup: `(platform, account_id)` binding
   - canonicalize entity via `merged_into`
   - verify optional receiver hints (if present)
   - fail closed on missing/conflict
2. Remove atlas/default receiver paths and explicit agent hint short-circuit for normal ingress.

### Phase C: Session Label Cutover

1. Rewrite `buildSessionKey()` in `session.ts`:
   - remove `:agent:` suffix
   - remove `:thread:` canonical suffix
2. Remove atlas compatibility converters and legacy runtime fallback readers.
3. Ensure group thread events map to parent group session label.

### Phase D: Persona Binding Resolution

1. Add persona binding resolver stage/function (between access and context assembly).
2. Resolve in order:
   - sender override binding `(receiver_entity_id, sender_entity_id)`
   - receiver default binding `(receiver_entity_id)`
3. Require resolved binding for agent execution.
4. Remove all default `"atlas"` fallbacks from:
   - `resolveAccess.ts`
   - `assembleContext.ts`
   - `runAgent.ts`
   - control-plane helper paths that currently inject defaults

### Phase E: Continuity Transfer + Merge Propagation

1. Update `propagateMergeToSessions()`:
   - operate on canonical DM shape
   - group by `receiver_entity_id`
   - choose primary by latest activity, tie-break turns
2. Inject mandatory summaries and record transfer rows.
3. Alias + archive retired sessions.

### Phase F: Cleanup + Spec/Code Parity

1. Remove remaining runtime references to agent-scoped/thread-scoped canonical labels.
2. Remove atlas fallback assumptions from IAM policy defaults where they imply implicit routing.
3. Keep explicit `atlas` as a named persona only where configured intentionally, never as fallback.

---

## 7. File-Level Worklist (Code)

Primary code files expected:

1. `src/db/identity.ts` (new binding tables + helpers)
2. `src/iam/identity.ts` (canonicalization helpers reused by receiver path)
3. `src/nex/request.ts` (schema field alignment)
4. `src/nex/stages/resolveReceiver.ts` (authoritative account binding resolver)
5. `src/nex/stages/resolveAccess.ts` (remove implicit persona fallback)
6. `src/nex/session.ts` (canonical key shape + aliasing behavior)
7. `src/nex/stages/assembleContext.ts` (no atlas fallback; require resolved binding)
8. `src/nex/stages/runAgent.ts` (no atlas fallback)
9. `src/nex/control-plane/*` (remove default persona injection in control paths)
10. tests across `session.test.ts`, `resolveReceiver.test.ts`, `resolveAccess.test.ts`, `assembleContext.test.ts`, `runAgent.test.ts`, integration/e2e suites.

---

## 8. Validation Matrix

### Unit

1. Receiver resolves only from account binding, with verified hints.
2. Missing/conflicting binding fails closed.
3. Session labels for DM/group match canonical formats.
4. Thread message uses group session label (no thread split).
5. Atlas/default fallback is absent in routing/context stages.
6. Persona binding selection order (sender override > receiver default).
7. Continuity transfer always records + injects summary (including deterministic fallback path).

### Integration

1. Mom text then email (distinct senders) routes to separate sessions pre-merge.
2. Merge senders; next message routes to canonical primary session with transferred summary present.
3. Persona content edit keeps same session.
4. Persona pointer swap keeps same session unless explicit new-session action.
5. Unknown receiver binding cannot invoke agent execution.

### E2E

1. Multi-account same adapter: each account resolves to correct receiver entity.
2. Group thread replies append to same group session as parent channel.
3. No unresolved ingress escalates privileges.

---

## 9. Cutover Execution Checklist

1. Land schema migrations first.
2. Backfill account receiver bindings for all enabled adapter accounts.
3. Backfill default persona bindings per receiver entity.
4. Run one-time session label migration + continuity transfer.
5. Deploy runtime cutover with fallback paths already removed.
6. Run validation matrix.
7. Verify no `atlas` fallback code paths remain by repo grep.

---

## 10. Open Decisions To Confirm Before Coding

1. Fresh-start policy on persona pointer swap:
   - default recommendation: keep same session, no implicit reset.
2. Continuity summary format:
   - JSON-only structured memory event vs human-readable system note + JSON metadata.
3. Receiver unresolved behavior:
   - default recommendation: deny external ingress and log integrity violation.

