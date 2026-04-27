# WIS-016 Validation Interruption Classification And Resume From Packet

## Goal

Make validation resilient once candidate publication and validation packet
creation have already succeeded.

## Scope

- distinguish validation interruption from validation assertion failure
- treat runtime restart, transport loss, or host interruption as retryable when
  a candidate artifact and validation packet already exist
- resume or restart validation from the existing packet instead of rebuilding
  the entire lineage from scratch
- preserve partial proof artifacts and attach interruption metadata to the run
  summary

## Acceptance

- validation interrupted after candidate publication does not collapse into a
  generic stage failure
- Dispatch can resume or retry validation from the existing packet and
  candidate without repeating implementation
- issue-state and review summaries distinguish interrupted proof from failed
  proof

## Current Evidence

- `SPEC-259` preserved candidate
  `candidate_61a18caa-98d2-452b-af21-b1508091821c` and validation packet
  `packet_690bc423-183f-4ca6-b3aa-de80ecb79c71`
- despite that preserved handoff, the run still terminated as a failed
  validation stage after the runtime restart
- proof artifacts were exported to host-visible cleanroom directories, which
  means there is already enough state to support interruption-aware resume
