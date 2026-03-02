# Delivery Core Hard Cutover - Failure Burn-Down Plan (2026-02-25)

**Status:** Plan (execution immediately follows)  
**Mode:** Hard cutover (no backward compatibility)  
**Scope owner:** `nex` runtime core + tests

---

## 1. Customer Experience First

This pass is successful only if users experience:

1. Receiver routing is deterministic and symmetric with sender routing (identity/entity based).
2. No implicit Atlas/default persona fallback paths exist anywhere in runtime behavior.
3. Session routing is canonical and stable on sender/receiver entity semantics.
4. Legacy provider/channel compatibility surfaces no longer leak into core behavior.
5. Worker/session continuity behavior stays explicit and auditable (continuity transfers, not hidden aliases).
6. Runtime/test suite no longer breaks on deleted legacy modules.

---

## 2. Research Findings

## 2.1 Current failing snapshot

From full `pnpm vitest run` on 2026-02-25:

1. `38` failed files
2. `56` failed tests
3. `1` unhandled worker error

Failure classes:

1. **Deleted-module residue**
   - tests still import removed modules (`gmail*.ts`, telegram channel module, slack actions module, `web/qr-image.js`).
2. **Hard-cutover expectation mismatch**
   - tests still assert removed provider/channel semantics (Telegram/Slack/Discord/WhatsApp config behavior, reply defaults, mention rules).
3. **Plugin runtime/sdk residue**
   - provider extensions calling removed `extensions-api` exports (`listSlackAccountIds`, etc.) causing runtime type errors.
4. **Legacy session store expectations**
   - tests still assert `sessions.json` migration/contents despite ledger-only cutover.
5. **Identity test drift**
   - tests still assert pre-cutover identity/contact details instead of canonicalized/contact-observation behavior.
6. **Signal cleanup worker crash**
   - lock cleanup re-raises termination signal and kills vitest worker.

## 2.2 Alignment with canonical specs

Canonical references:

1. `ENTITY_SYMMETRIC_ROUTING_AND_PERSONA_BINDING.md`
2. `RUNTIME_SURFACES.md`
3. `RUNTIME_ROUTING.md`
4. `ADAPTER_ONLY_CORE_DECOUPLING_AND_WORKER_ROUTING_HANDLES.md`

Required invariants (already decided):

1. Sender/receiver symmetry through identity substrate.
2. No Atlas fallback.
3. Canonical session identity and continuity transfers.
4. Hard cutover; no compatibility aliases.

---

## 3. Decisions for This Pass

Mapped to latest operator directives:

1. **Deleted module failures:** remove/replace stale tests and imports; do not resurrect deleted modules.
2. **`extensions-api` removal path:** remove core dependency points and stale test reliance; stop using old plugin-registry CLI/runtime hooks where obsolete in touched paths.
3. **Open question (#3):** prefer deleting stale compatibility tests over patching legacy behavior back in.
4. **No internal channel/provider semantics:** remove or generalize provider-specific assertions in core tests.
5. **No plugin-registry compatibility:** remove legacy loader/ensure calls in touched command paths and tests that rely on old registry bootstrap assumptions.
6. **Session keys:** keep/verify entity-symmetric model; update tests from channel/provider keys to canonical key expectations.
7. **No WhatsApp/sessions.json legacy migration behavior:** delete compatibility migration assertions and align tests to ledger-only invariants.
8. **Unhandled worker crash:** treat as correctness bug in signal handling; fix by making lock cleanup non-fatal in test/runtime signal paths.

---

## 4. Implementation Plan

## Phase A - Remove stale/deleted-module test residue

1. Remove/replace failing tests that import deleted Gmail hook modules.
2. Remove/replace tests importing removed Telegram/Slack module files.
3. Update relay smoke test to avoid removed QR helper import path.

## Phase B - Hard-cut test realignment

1. Rewrite config/reply/session tests that still assert provider-specific defaults.
2. Rewrite doctor migration tests to ledger-only expectations (no `sessions.json`/WhatsApp auth migration assertions).
3. Rewrite usage/session tests to canonical key lookup behavior.

## Phase C - Plugin/registry and extension residue in failing paths

1. In failing runtime paths, remove reliance on removed `extensions-api` helper exports.
2. Replace with local extension helpers or neutral core helper usage.
3. Remove stale plugin-registry compatibility hooks in touched command/test surfaces.

## Phase D - Worker signal crash fix

1. Update `session-write-lock` signal handling to release locks without terminating test workers unexpectedly.
2. Keep cleanup semantics deterministic and idempotent.

## Phase E - Validation

1. `pnpm -s tsc --noEmit`
2. `pnpm vitest run` (full)
3. If full suite still noisy due unrelated regressions, run focused failed-file burn-down and continue to zero in this pass.

---

## 5. Acceptance Criteria

1. No failing tests caused by deleted-module imports.
2. No failing tests expecting resurrected legacy provider/channel/session compatibility behavior.
3. No runtime fallback to Atlas/default persona.
4. `session-write-lock` no longer crashes vitest workers via signal re-raise.
5. Full validation run is green, or any residual failures are explicitly outside this scope with file-level proof.

