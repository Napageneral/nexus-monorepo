# TAP-006 Shared TikTok Cleanroom And Credential Path

## Goal

Create one cleanroom validation path that can exercise both TikTok adapter
surfaces through Nex without leaking secrets.

## Outcome

One shared cleanroom path now proves both TikTok surfaces end to end without
leaking provider secrets into repo docs or commits.

Business proof:

- retained cleanroom:
  `/Users/tyler/nexus/state/sandboxes/52569bc7-aa69-4fcf-bf14-4179cdef291b/artifacts/validation/tiktok-business-live/20260331T012109Z/tiktok-business-proof-summary.json`

Display proof:

- clean launcher rerun:
  `/Users/tyler/nexus/state/sandboxes/112b4d07-d664-4364-b586-4562e5b1f3d4/artifacts/validation/tiktok-display-row-parity-live/20260331T022745Z/tiktok-display-proof-summary.json`

Credential path:

- TikTok Business is sourced from the local MoonSleep config mounted into the
  cleanroom
- TikTok Display is sourced from MoonSleep's encrypted D1-backed oauth row and
  staged into the cleanroom as a temporary mounted bundle

## Acceptance

1. the cleanroom harness can install and connect `tiktok-business`
2. the cleanroom harness can install and connect `tiktok-display`
3. credential references stay inside Nex-managed storage or local encrypted
   sources
4. the harness can run backfill and monitor proofs for both surfaces

## Notes

- an earlier duplicate rerun failed during `sandboxes.create` with
  `git fetch failed` while cloning the cleanroom workspace; that was unrelated
  to TikTok adapter behavior
- the final clean Display rerun above passed after the stable revision-hash
  patch, after local runtime repair, and after hardening the host-side
  `sandboxes.exec` proof recovery path
