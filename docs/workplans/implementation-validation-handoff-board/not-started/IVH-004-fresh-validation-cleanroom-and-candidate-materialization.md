# IVH-004 Fresh Validation Cleanroom And Candidate Materialization

## Goal

Run `validating` in a fresh cleanroom distinct from `implementing`, and
materialize the selected candidate artifact into that cleanroom before proof
execution.

## Scope

- provision a fresh validation sandbox or cleanroom for ticket signoff
- materialize the source-snapshot candidate artifact there
- stop rehydrating validation from the policy base ref or host checkout
- make the validation cleanroom carry its own artifact and receipt roots

## Acceptance

- validation runs in a cleanroom distinct from the implementation sandbox
- the candidate artifact under review is materialized there explicitly
- validation failure cannot be explained by “the wrong repo snapshot was under
  test”

