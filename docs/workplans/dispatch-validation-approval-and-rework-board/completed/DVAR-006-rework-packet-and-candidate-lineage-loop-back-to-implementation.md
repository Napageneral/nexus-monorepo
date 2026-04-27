# DVAR-006 Rework Packet And Candidate Lineage Loop Back To Implementation

## Goal

Turn validation failure into a focused implementation rework loop.

## Scope

- define `rework_packet_id`
- package failing subproofs, checkpoints, evidence refs, and requested fixes
- launch a new implementation attempt from the rework packet
- preserve lineage across candidate, validation attempt, and rework packet

## Acceptance

- manager can send a failed validation result back to implementation as a
  focused rework packet
- the new implementation attempt links back to the failed candidate and
  validation attempt
- implementation rework produces a new candidate artifact rather than mutating
  the old one
