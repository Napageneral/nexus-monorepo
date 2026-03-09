# identity.db SQLCipher Cutover Plan

Date: 2026-02-26  
Status: planned, not implemented

## 1) Why this is a separate cutover

`nex` currently opens ledgers through Node `node:sqlite` (`DatabaseSync`) in `nex/src/db/ledgers.ts`.  
`identity.db` is used broadly across control-plane auth, ACL/audit, memory tooling, and CLI flows.

A SQLCipher cutover therefore affects core DB opening semantics, test harnesses, and cross-ledger attachment behavior, not just one module.

## 2) Impact Surface (research summary)

1. `nex/src/db/ledgers.ts` is the canonical open path for all ledgers (including `identity.db`).
2. Many subsystems assume `DatabaseSync` from `node:sqlite`, including:
   - control-plane auth/session/ACL handlers,
   - memory recall/consolidation tooling,
   - CLI commands that open identity/memory ledgers,
   - tests that instantiate `DatabaseSync` directly.
3. `identity.db` is frequently attached/read alongside other ledgers in memory workflows.

## 3) Hard-Cutover Strategy

1. Introduce a single ledger-open abstraction that can select SQLCipher-capable driver for `identity.db`.
2. Keep hard cutover behavior:
   - no mixed plaintext/encrypted operation mode in production paths,
   - explicit migration command for existing plaintext `identity.db`.
3. Require key provisioning through credential/config system (no inline literals).

## 4) Implementation Phases

1. Driver substrate:
   - add SQLCipher-capable sqlite dependency for Node runtime,
   - define `identity` open path with key pragma bootstrap.
2. Migration command:
   - detect plaintext `identity.db`,
   - migrate to encrypted target with atomic swap and backup.
3. Runtime/CLI wiring:
   - route all identity ledger opens through new abstraction,
   - keep non-identity ledgers on current path unless explicitly expanded.
4. Test updates:
   - add encrypted identity integration tests,
   - update direct-`DatabaseSync` tests that assume plaintext files.

## 5) Validation Gates

1. Auth/session/ACL e2e tests pass with encrypted `identity.db`.
2. Memory recall/consolidation tests pass when identity ledger is encrypted.
3. CLI auth/ACL commands operate normally against encrypted identity ledger.
4. Migration command is idempotent and rollback-safe.

## 6) Open Decisions Before Build

1. Chosen SQLCipher-capable Node driver/package.
2. Key source hierarchy and rotation procedure.
3. Whether to encrypt only `identity.db` or all ledgers in same phase.

