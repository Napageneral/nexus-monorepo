# Receiver Binding And Session Key Hardening Cutover (2026-02-25)

## 1. Customer Experience First

### 1.1 What must feel true to the user

1. A message should always route to the same conversation history for the same sender/receiver pair.
2. Routing should not silently jump personas/agents because of hidden defaults.
3. If routing inputs are incomplete, the system should fail closed instead of guessing.

### 1.2 User-visible consequences

1. No implicit default receiver/persona routing.
2. If adapter accounts are not bound to a receiver entity, ingress should deny (or remain unresolved) until configured.
3. Group thread replies should stay in the same group session unless explicitly split by design.

## 2. Scope

This cutover closes items 1-3 only:

1. Sender/receiver symmetry hardening in runtime bootstrapping.
2. Atlas fallback removal confirmation and guardrails.
3. Session-key symmetry hardening by removing remaining queue fallback paths that bypass canonical keys.

Out of scope:

1. Persona vs entity language redesign and schema rename.
2. Continuity transfer expansion beyond merge path.
3. Control-plane/API naming cleanup beyond routing-critical paths.

## 3. Current Gaps

1. `account_receiver_bindings` exists and is enforced by receiver resolution, but adapter account startup does not generally populate it from adapter account config.
2. Queue lane setup still has a provisional session-key fallback path (`deriveProvisionalSessionKey`) that can create non-canonical labels when `access.routing.session_label` is absent.
3. Legacy thread-suffix helper remains in outbound session routing paths.

## 4. Decisions

### D1. Receiver binding source of truth

`account_receiver_bindings(platform, account_id) -> receiver_entity_id` remains the authoritative receiver resolution map.

Rationale:

1. Incoming events always include account context.
2. Receiver identity must be deterministic and non-heuristic.
3. This is the receiver-side equivalent of sender contact resolution keying.

### D2. Adapter account config supports explicit receiver binding

Adapter account bootstrap config accepts `receiver_entity_id`.
Runtime startup writes this to `account_receiver_bindings` for each configured account.

### D3. Queue lane key must use canonical access routing

Queue lane session labels must come from `request.access.routing.session_label` (or explicit override), not provisional fallback derivation from raw delivery fields.

Hard cutover behavior:

1. If no canonical session label exists after stages 1-4, throw and fail the request path.
2. No best-effort fallback label generation.

### D4. Group thread split suppression

Outbound helper usage should not append thread suffixes for group/channels in core routing behavior.

## 5. Implementation Plan

### P1. Adapter config + receiver binding write

1. Extend adapter account schema with optional `receiver_entity_id`.
2. In `NEX.startMonitorsFromConfig`, upsert account receiver binding when the field is present.
3. Use source tag `control-plane` for these writes.

### P2. Remove queue provisional key fallback

1. Delete/retire `deriveProvisionalSessionKey` usage in lane-resolution paths.
2. Require `request.access.routing.session_label` unless explicit `opts.session_label` is supplied.
3. Throw with clear error metadata when missing.

### P3. Thread suffix legacy helper usage

1. Remove thread-suffix application from outbound session route logic where still active.

## 6. Validation

1. `src/nex/stages/resolveReceiver.test.ts`
2. `src/nex/stages/resolveAccess.test.ts`
3. `src/nex/session.test.ts`
4. `src/nex/nex.monitor-bootstrap.test.ts`
5. `src/nex/nex.queueing.test.ts`
6. `src/nex/adapters/config.test.ts`

Invariants:

1. No runtime `atlas` fallback paths in `src/nex/**` non-test files.
2. Queue lane labels for processing requests are canonical and sourced from access routing.
3. Receiver account binding can be seeded from adapter account config.

## 7. Risks And Mitigations

1. Risk: Existing deployments without `receiver_entity_id` for adapter accounts may still be unresolved.
Mitigation: keep config field optional in this patch while wiring deterministic path; unresolved behavior remains fail-closed in receiver stage.

2. Risk: Removing provisional queue fallback can surface latent callers that skip access resolution.
Mitigation: add targeted tests and clear runtime error messages to force callers onto canonical path.
