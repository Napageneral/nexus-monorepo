# DVAR-008 Completion Handoff Driven By Post-Validation Manager Decision

## Goal

Make the final Dispatch completion handoff depend on explicit manager
completion after approved proof.

## Scope

- attach completion handoff generation to the `complete` decision path
- include ticket, forge, and proof-video references when available
- ensure handoff reflects the specific candidate and validation attempt that
  were approved

## Acceptance

- completion handoff is not emitted before manager `complete`
- completion handoff links the relevant ticket, forge surface, and recording
- handoff points to the exact validated candidate and validation attempt
