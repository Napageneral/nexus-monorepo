# Plaid Read-Only Cleanroom Workplan

Status: implementation and synthetic validation complete; live onboarding gated

## Completed

- canonical package manifest and agent guide
- shared Go adapter SDK integration
- strict separation of app and Item credential references
- read-only institution, Item, account, balance, liability, and transaction
  methods
- exact money normalization
- immutable provider evidence hashes and raw payloads
- append-only transaction-change contract
- consistent cursor pagination restart behavior
- synthetic unit and HTTP fixture tests
- local package validation

## Gated Next Phase

1. approve a reviewed Plaid Link onboarding surface
2. store Item access tokens through durable Nex connection credentials
3. run live read-only institution coverage probes
4. bind returned provider accounts to reviewed owned-accounting source accounts
5. implement a durable cursor consumer with exactly-once evidence acceptance
6. add webhook or polling orchestration only after cleanroom and staging proof

No gated step is authorized by this workplan.
