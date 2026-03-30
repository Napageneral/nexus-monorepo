# HCI-004A Hosted Dispatch Stack Wrapper

## Goal

Build one hosted cleanroom wrapper that provisions a fresh server, installs the
Dispatch app stack and its required adapters, mints one runtime token, and
exports a stable env contract to downstream proof commands.

## Scope

- install `dispatch`, `spike`, and any required supporting app packages
- install `jira`, `git`, and `slack`
- prove install inventory and hosted runtime health
- capture one durable cleanroom bundle

## Non-Goals

- policy compile
- live Jira intake
- Spike hydration
- manager/worker execution
- delivery receipts

## Acceptance

1. one reusable command provisions and tears down the full hosted Dispatch stack
2. the proof bundle includes app inventory, adapter inventory, runtime token
   descriptor, and cleanup result
3. downstream proof commands can rely on one stable `FRONTDOOR_SMOKE_*` env contract
