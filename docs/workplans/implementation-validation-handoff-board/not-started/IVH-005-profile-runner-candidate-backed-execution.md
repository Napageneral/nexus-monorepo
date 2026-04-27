# IVH-005 Profile Runner Candidate-Backed Execution

## Goal

Make the validation profile runner own candidate materialization together with
adapter, connection, credential, and resource projection.

## Scope

- extend the profile-runner contract to declare supported candidate forms
- make runner execution fail clearly when a candidate form is unsupported
- bind candidate materialization into the same execution primitive that already
  owns cleanroom projection
- remove assumptions that profile-owned proof assets live in the target repo

## Acceptance

- the selected profile runner receives the candidate artifact id and
  materializes it explicitly
- profile-backed validation no longer depends on ambient repo scripts existing
  on the policy base ref
- runner logs and review receipts record which candidate artifact was proven

