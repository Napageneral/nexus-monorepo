# HCI-004B Hosted Dispatch Operator Bootstrap And Policy Compile

## Goal

Create the canonical hosted Dispatch automation policy on a disposable server
and prove that policy compile/readback is coherent before any live issue intake.

## Scope

- operator bootstrap for Dispatch
- connection binding and policy defaults
- compiled DAG/job/subscription readback
- durable proof snapshots for `dispatch.connections.list`, `dispatch.overview`,
  and policy compile outputs

## Non-Goals

- live Jira issue intake
- repo hydration
- delivery or closeout

## Acceptance

1. the hosted runtime can create or load the expected Dispatch policy state
2. compiled policy outputs are inspectable and stable
3. proof capture contains the exact runtime readbacks required for later tickets
