# Persona Rebind Continuity Cutover (2026-02-26)

**Status:** ARCHIVED — absorbed into `NEXUS_REQUEST_TARGET.md`
**Archived:** 2026-02-27 — Persona resolution via persona_path on Entity is canonical in TARGET. Rebinding semantics follow from the unified pipeline.

## 1. Customer Experience Goal

When a sender keeps talking to the same assistant endpoint (same sender/receiver entities, same canonical session key), changing persona binding must be predictable:

1. Session routing identity stays stable (no silent reroute to a different canonical session key).
2. Persona changes take effect immediately on the next turn.
3. History continuity is preserved with explicit policy:
   - default: in-place persona swap on the same session;
   - optional: fresh-session-style rebind with mandatory continuity summary injection and transfer audit row.

## 2. Scope

In scope:

1. Runtime session/persona rebind behavior in `assembleContext` + `session` helpers.
2. Continuity transfer recording for `persona_rebind` when fresh-session policy is used.
3. Tests covering in-place and fresh-session behavior.

Out of scope:

1. Persona binding mutation APIs.
2. New control-plane UX surfaces.
3. Broad taxonomy/doc rewrites outside this targeted implementation.

## 3. Hard-Cutover Requirements

1. No Atlas/default fallback behavior.
2. No session alias compatibility for persona rebind behavior.
3. Session key remains canonical by sender/receiver entities; persona binding is applied after key resolution.
4. If existing session persona differs from resolved routing persona, runtime must reconcile before context assembly.

## 4. Rebind Policy

## 4.1 `in_place` (default)

1. Update existing session persona to resolved `persona_ref`.
2. Keep current session label and thread lineage.
3. Return updated session for context assembly.

## 4.2 `fresh_session` (explicit)

1. Keep same canonical session label.
2. Start a new thread root for the re-bound persona.
3. Inject deterministic continuity summary into the new thread.
4. Record `session_continuity_transfers` row with reason `persona_rebind`.
5. Do not archive the session (label remains active and canonical).

## 5. Implementation Plan

1. Add session helper API for persona rebind application with policy mode.
2. Wire helper into `resolveOrCreateSession` after existing-session resolve and before context/history build.
3. Add runtime option plumbing for rebind mode (`in_place` default, `fresh_session` optional).
4. Add unit tests in:
   - `src/nex/session.test.ts`
   - `src/nex/stages/assembleContext.test.ts`

## 6. Validation Matrix

1. Typecheck: `pnpm tsc --noEmit`.
2. Targeted tests:
   - `src/nex/session.test.ts`
   - `src/nex/stages/assembleContext.test.ts`
3. Expected assertions:
   - in-place updates persona on existing session;
   - fresh-session writes continuity message + `persona_rebind` transfer row + new thread root;
   - canonical session label remains unchanged.

## 7. Runtime Config

The adapter runtime bootstrap config (`~/.nex.yaml`) carries the rebind policy:

```yaml
session:
  persona_rebind_mode: in_place # or fresh_session
```

`in_place` is the default.
