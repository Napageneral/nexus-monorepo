# HCI-004C Hosted Jira Intake Fixture And Single-Lineage Proof

## Goal

Define one reusable hosted Jira intake fixture and prove that a single in-scope
issue creates exactly one Dispatch lineage and one manager start.

## Scope

- Jira fixture path for hosted cleanroom intake
- Dispatch issue/read-model snapshots after intake
- duplicate trigger replay proving idempotent lineage creation

## Non-Goals

- repo binding
- Spike hydration
- delivery or notifications

## Acceptance

1. one hosted Jira intake path is documented and reusable
2. one issue creates exactly one active Dispatch lineage
3. replaying the same fixture does not create a duplicate active lineage
