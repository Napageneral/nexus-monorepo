# EAP-006 Operator Proof And Golden Parity Journey

## Goal

Close the parity workstream with one human-reviewable end-to-end proof that
shows Eve behaving like a first-class iMessage client surface through Nex.

## Execution Class

mixed

## Blocker

This ticket is blocked until the private-API-required lane can be executed on a
dedicated parity host.

The AppleScript lane can produce a partial parity proof, but the full board
cannot close until reply, reaction, edit, unsend, and thread-mutation proof all
exist.

## Scope

- cumulative parity validation script
- inline media proof
- reply, reaction, edit, unsend, and thread mutation proof
- final capability and gap summary

## Acceptance

- one primary parity journey artifact exists
- validation docs record which parity claims are proven live
- any remaining non-parity behavior is explicit
- the board can close without ambiguity

## Validation

- updated validation docs
- operator proof artifact inventory
- `git diff --check`
