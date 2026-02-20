# Onboarding Experience Contract

**Status:** DRAFT (target behavior for live E2E)
**Last Updated:** 2026-02-20
**Related:** `WORKSPACE_LIFECYCLE.md`, `BOOTSTRAP_ONBOARDING.md`, `harnesses/LIVE_E2E_HARNESS.md`

## Purpose

Define the user-facing onboarding experience we want Nexus to deliver from a fresh workspace.
This is the contract the live E2E harness should iterate toward and enforce.

## Preconditions

1. Workspace is created via `nexus init`.
2. Runtime boot has run external CLI auth sync.
3. System checks whether at least one usable provider credential exists.

## First-Run Entry Behavior

When `needsBootstrap() === true` (no persona dirs in `state/agents/`):

1. Manager runs in MWP mode (no unified fallback).
2. `state/agents/BOOTSTRAP.md` is injected into MA system prompt.
3. MA must be conversational and acknowledge the user each turn.

Optional UX enhancement (target): if bootstrap is needed and credentials are available, runtime may emit an initial greeting from the MA without waiting for the first user message.

## Credential Gating

If no usable provider credentials exist at runtime boot:

1. Do not attempt a normal MA conversation.
2. Return a clear setup-required message explaining how to add/import credentials.
3. Resume normal onboarding once credentials are available.

## Onboarding Flow (MA + WA)

The MA should follow this sequence:

1. Ask identity questions (agent name, vibe/tone, user profile basics).
2. Immediately dispatch workers in parallel:
   - WA A: `nexus credential scan` (discovery only)
   - WA B: workspace/context scan (light scan of `home/`)
3. Continue conversation while worker results arrive.
4. Dispatch WA C to write identity files when enough info is known:
   - `state/agents/{persona}/IDENTITY.md`
   - `state/agents/{persona}/SOUL.md`
   - `state/user/IDENTITY.md`
5. Present credential scan findings and ask for import confirmation.
6. On user approval, dispatch WA to run `nexus credential scan --import`.
7. Confirm completion and suggest next steps.

## MA Response Rules

1. MA should not silently end onboarding turns.
2. `wait()` is allowed, but only after MA has sent an explicit user-facing acknowledgement/progress/question in that turn.
3. MA should provide concise progress updates while workers run.

## Completion Criteria

Onboarding is complete when:

1. At least one persona directory exists in `state/agents/` with `IDENTITY.md`.
2. `state/agents/{persona}/SOUL.md` exists.
3. `state/user/IDENTITY.md` exists.

Credential import is not required for onboarding completion, but scan results must be surfaced to the user.

## Post-Onboarding E2E Target

After onboarding, the canonical extension scenario is:

1. User asks to set up EVE adapter.
2. MA dispatches WA to configure/validate EVE.
3. User asks for a delayed outbound message (for example, 1 minute later).
4. MA dispatches WA to create automation.
5. Clock/automation triggers a run.
6. Run sends outbound message via EVE.

This scenario validates adapters, automations, clock/timer trigger path, and post-onboarding MWP behavior.

## Harness Assertions (Target)

Live E2E should validate:

1. MA asked onboarding questions (not only executed hidden tasks).
2. MA dispatched expected worker classes (credential scan, workspace scan, identity writer).
3. Identity files were written to canonical paths.
4. Credential scan result was presented and import confirmation path works.
5. MA did not produce silent onboarding turns.
6. Post-onboarding EVE + automation delayed-send flow works end to end.
