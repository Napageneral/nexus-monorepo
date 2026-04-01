# EVP-005 Restart, Recovery, And Replay-Safety Proof

## Goal

Prove Eve survives realistic edge interruptions without corrupting history or
lying about state.

## Scope

- edge process restart
- temporary pairing loss
- watermark continuity
- duplicate-suppression and replay-safety checks

## Acceptance

- restart does not strand the paired connection
- replay after restart does not duplicate canonical records
- operator-visible state degrades and recovers truthfully
- action reconciliation remains correct after restart

## Validation

- restart transcript
- before/after watermark checks
- duplicate-record query checks
- `git diff --check`

## Result

Completed on 2026-03-31.

The edge was stopped and restarted twice against the same copied Eve warehouse.

Observed reconnect behavior:

- the same stable session id remained in use:
  `cb95443b-fa4c-49fa-9a1a-5c143943f0a5`
- transport `connId` changed across reconnects, which is expected
- `adapters.edges.list` showed `status=offline` during the interruption and
  returned to `status=paired` after restart

Warehouse watermark check before and after the second controlled reconnect:

- `message_rowid=377296`
- `reaction_rowid=377262`
- `membership_rowid=365086`
- `message_update_timestamp=796240629652299008`
- `reaction_removal_timestamp=794210606000000000`
- `attachment_rowid=29900`

The watermark values did not regress across the restart.

Replay-safety proof:

- each proof record id remained a singleton after reconnect:
  `imessage:1CDA9A9D-77AC-489E-AEBE-57FADB2B60AD`
  `imessage:DAA2400F-64BD-4335-A740-DB52D9091FBA`
  `imessage:A99F0830-A584-4CEF-8E28-4BFF0E65F3F4`
  `imessage:289B1C50-9235-42C2-89E9-993F1AC9FF88`
  `imessage:448C1927-0864-475F-B22F-D0274DAFC3BF`
- no duplicate canonical records appeared in the cleanroom after reconnect

This ticket proved truthful degradation, truthful recovery, and idempotent
reconnect replay for the single-edge path.
