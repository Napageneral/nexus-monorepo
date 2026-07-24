# Mercury Adapter

Use this package to read Mercury through Nex without creating provider or
accounting mutations.

## Connection roles

- Use `primary_read` for account, transaction, statement and general public
  reads.
- Use `ap_request` only for recipient and approval-request reads after the
  configured credential passes health from its deployment environment.
- Until that health gate passes, the proven `primary_read` connection may
  shadow those GET operations.

## Safe use

1. Inspect `adapter.info`.
2. Verify `adapter.health` for the exact connection.
3. Invoke only methods whose action is `read`.
4. Use bounded `max_pages` for automatic pagination.
5. Preserve the response body and SHA-256 together.
6. Treat provider data as evidence, never as journal or payment authority.

## Provenance projection

Use `mercury-provenance project` only with records returned by the Nex
`records.list` API. It verifies exact stored record hashes before producing
typed fact and observation payloads. Persist the emitted params through the
normal Nex memory methods; do not write the memory database directly.

The package reflects provider writes for contract visibility, but the
read-only build rejects them before any provider request. Do not work around
that boundary.
